/**
 * The runtime on one process, over `SqlClient`: it drives the machine ([`machine.ts`](machine.ts)) and acts on its
 * outputs (decision 0013). An event is one transaction (decision 0007). What the machine says it writes is
 * written (decision 0057), and only then are the callers answered and the work started. So a crash before the
 * commit leaves nothing of the event, and one after it is an activation away from the work the state holds.
 *
 * What is stored lives in the database ([`storage.ts`](storage.ts)). What is running lives in this process's
 * scope: the operations' fibers, the timers' sleeps, the entities loaded. A crash is that scope closing. An
 * entity with nothing to do is unloaded, a crash this process chooses, and the stored time of its earliest timer
 * is what wakes it (decision 0029).
 */
import * as Cause from 'effect/Cause'
import * as Context from 'effect/Context'
import * as Data from 'effect/Data'
import * as DateTime from 'effect/DateTime'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as MutableList from 'effect/MutableList'
import * as Queue from 'effect/Queue'
import * as Scope from 'effect/Scope'
import * as Semaphore from 'effect/Semaphore'
import { SqlClient } from 'effect/sql'
import * as Machine from './machine.ts'
import {
  type Address,
  checkProgram,
  type Creation,
  encode,
  Entities,
  InvariantDefect,
  isTimer,
  type Program,
  type Reply,
  type Request,
  runnerOf,
  type Types,
} from './program.ts'
import {
  type Consumer,
  type Found,
  type Published,
  hold,
  type Query,
  type Reindexed,
  storage,
  type Storage,
  type Suspension,
} from './storage.ts'

/**
 * What a caller is answered: the replies stored under its request id, `NotFound` for no entity, and `Suspended`,
 * which says that the request has no reply yet (decision 0023).
 */
export type Answer<Reason> = Reply<Reason> | Readonly<{ _tag: 'Suspended' }>

/**
 * An operation of another entity whose `send` waits for the entity's resumption: its run, and the name it sent
 * under (decision 0114).
 */
export type Waiting = Readonly<{ entity: Address; key: string; incarnation: number; name: string }>

/**
 * A suspended entity, as `Handle.suspended` lists it: what the storage holds of the suspension, and the senders
 * waiting for its resumption in this process (decision 0114).
 */
export type Suspended = Suspension & Readonly<{ waiting: ReadonlyArray<Waiting> }>

/** What an operator's `resume` or `discard` did (decision 0114). */
export type Operated =
  /** The entity was activated again: the message it died on is handled next, by the program deployed. */
  | Readonly<{ _tag: 'Resumed' }>
  /** The inbound message the entity died on was dropped, and the entity activated again. */
  | Readonly<{ _tag: 'Discarded' }>
  /**
   * The entity died on an internal message, in an operation or on its activation: none is discarded (decisions 0041,
   * 0044).
   */
  | Readonly<{ _tag: 'NotDiscarded' }>
  /** The program deployed dies on the stored state too, with this cause. A discard then keeps its message. */
  | Readonly<{ _tag: 'StillSuspended'; cause: string }>
  | Readonly<{ _tag: 'NotSuspended' }>
  | Readonly<{ _tag: 'NotFound' }>

/** What a `Resume` or a `Discard` did, read off the machine before and after it (decision 0114). */
const operated = <T extends Types>(
  event: 'Resume' | 'Discard',
  before: Machine.Machine<T>,
  after: Machine.Machine<T>,
): Operated => {
  if (before.stored.suspension === null) return { _tag: 'NotSuspended' }
  if (after.stored.suspension === null) return { _tag: event === 'Resume' ? 'Resumed' : 'Discarded' }
  if (after === before) return { _tag: 'NotDiscarded' }
  return { _tag: 'StillSuspended', cause: Machine.render(after.stored.suspension.cause) }
}

/** The callers waiting for a reply of one kind, by entity and then by request. */
type Callers<A> = Map<string, Map<string, Set<Deferred.Deferred<A>>>>

/** A point of the design's crash table, where a test dies to see what survives. */
export type Point =
  /** The event's `Stored` is computed, and not yet written. */
  | 'BeforeCommit'
  /** Written, and nothing acted on yet: no caller answered, no work started, no message handled. */
  | 'AfterCommit'
  /** The callers of the event are answered, and its work is not started. */
  | 'AfterReply'

/**
 * What the runtime says it did: a point of the crash table it reached with an event, an event it applied, and an
 * entity it unloaded. An event is said once written, in the order the events were applied. An entity is said
 * unloaded once its timers have stopped.
 */
export type Said =
  | Readonly<{ _tag: 'Reached'; point: Point; entity: Address; event: Machine.Event<never> }>
  | Readonly<{ _tag: 'Applied'; entity: Address; event: Machine.Event<never> }>
  | Readonly<{ _tag: 'Unloaded'; entity: Address }>

/**
 * Told what the runtime did, and waited for before it goes on. A test replays the events in the machine, counts
 * the passivations, or never returns at a point of the crash table, to crash the process there. The default does
 * nothing, as Effect's tracer does. A test provides another around `launch`, which reads it once. It is no
 * option, and no part of what a user imports (decisions 0055, 0073).
 */
export const Probe = Context.Reference<(said: Said) => Effect.Effect<void>>('effect-tea-durable/Probe', {
  defaultValue: () => () => Effect.void,
})

export interface Options {
  /**
   * How long a `send` or a `create` from another entity waits before sending again to a receiver that crashed on
   * it (decision 0046). A suspended receiver is waited for until it is resumed, and a program not deployed yet until
   * it is: neither is looked at again on a clock (decision 0063).
   */
  readonly retry?: Readonly<{ millis: number }>
  /**
   * How long an entity stays loaded with no event coming for it. The wait starts again at every event, and when
   * it runs out the entity is unloaded, or waits again if it still has something to do (decision 0029).
   */
  readonly passivate?: Readonly<{ millis: number }>
  /**
   * How many entities the process holds, of every program, before it unloads the least recently used of those
   * with nothing to do and no timer due, without waiting for their passivation. Another is never unloaded for it,
   * so the process holds more only while what it holds is busy. None by default: time alone unloads (decisions
   * 0076, 0078).
   */
  readonly capacity?: Readonly<{ entities: number }>
  /**
   * How long a planned stop waits for the at-most-once operations under way, once the scope the runtime was launched
   * in closes. Meanwhile no caller's message, creation, resume or discard is taken, the timers stop, and so do the
   * operations that run again at the next activation. The at-most-once operations and the steps of their
   * completions run on, and an at-most-once operation such a step starts runs too. Whatever is under way after
   * `millis` stops as in a crash. None by default: the scope's closing is a crash (decision 0119).
   */
  readonly drain?: Readonly<{ millis: number }>
}

/** What a caller does with one program's entities. */
export interface Handle<T extends Types> {
  /** Creates the entity `id`. A retry of the request that created it is answered `Created` (decision 0017). */
  readonly create: (
    id: string,
    flags: T['flags'],
    request: Readonly<{ requestId: string; sender: T['sender'] }>,
  ) => Effect.Effect<Creation>
  /**
   * Sends an inbound message, and waits for the reply. A retry under the same request id gets the reply stored for
   * it. The boundary gives `keep`, the time its protocol retries for. The reply is then kept for `keep.millis` from
   * the step that answers, and a retry after that is a new request, applied again. Without `keep` the reply is kept
   * for ever. `keep.millis` is a non-negative integer, and anything else is the caller's defect (decision 0125).
   */
  readonly send: (
    id: string,
    message: T['inbound'],
    request: Readonly<{ requestId: string; sender: T['sender']; keep?: Readonly<{ millis: number }> }>,
  ) => Effect.Effect<Answer<T['rejection']>>
  /**
   * What callers read of the entity, or null when there is none: the row written by its last event that changed
   * its state, which a query reads too. `project` is not called, so a new `project` that dies on the stored state
   * is no reader's defect. A new `project` reaches the row at the entity's next step that changes it, or at
   * `reindex`. The row is read through the projection's migrations and schema, as a query reads it, and a reader
   * is given the defect where they die (decision 0121).
   */
  readonly read: (id: string) => Effect.Effect<T['projection'] | null>
  /**
   * What callers read of the entities whose indexes match, across the program: the read model is written in each
   * entity's own transaction, so nothing found here is a projection its entity has moved past (decision 0032).
   */
  readonly query: (query: Query<T>) => Effect.Effect<ReadonlyArray<Found<T>>>
  /**
   * Writes the read model of every entity of the program again, from its stored state, and gives how many rows it
   * wrote and which entities it passed over. An index a new version of the program added or changed needs it, since a row is written only when its entity
   * takes a step. An operator runs it after such a deploy (decision 0032). An entity that takes a step while it
   * runs keeps the row its step wrote (decision 0070). An entity whose row the program cannot compute, since its
   * state is one no version reads, or a migration, a schema, `project` or an index dies on it, keeps the row it
   * had, and is listed in `failed` with the cause. The rest are written all the same. What the runtime throws, a
   * corrupted row's included, fails the whole call (decision 0122).
   */
  readonly reindex: Effect.Effect<Reindexed>
  /**
   * What the entities of the program did, from the `seq` of `after` on, in the order the steps committed. Each
   * row is the message an entity handled and what callers read of it afterwards, written in that step's
   * transaction (decision 0038). The cursor is the caller's, and nothing of it is stored: a reading here, by a
   * test or an operator looking, has no say in a prune, and `0` is the whole log. A consumer that keeps a cursor
   * reads with `feed` instead (decision 0039).
   */
  readonly published: (after: number, limit?: number) => Effect.Effect<ReadonlyArray<Published<T>>>
  /**
   * The same from the stored cursor of the consumer `consumer`: a consumer is a name, its first reading stores
   * its cursor at `0`, and `ack` moves it once the rows are acted on. From its first reading the log is kept for
   * it, so a consumer holds no state of its own (decision 0039).
   */
  readonly feed: (consumer: string, limit?: number) => Effect.Effect<ReadonlyArray<Published<T>>>
  /**
   * Moves a consumer's cursor to `through`. It never moves back, since what is behind it may be gone, and never
   * past the last `seq` written, so that no row written later is behind it. An ack from a consumer that has not
   * read stores its cursor too (decision 0039). A cursor and a limit are non-negative integers, here and in
   * `query`, `published` and `feed`. Anything else is the caller's defect (decision 0053).
   */
  readonly ack: (consumer: string, through: number) => Effect.Effect<void>
  /**
   * Drops what every consumer has read, through the lowest stored cursor, and gives how many rows went. Where
   * no consumer has read from the log, it drops nothing (decision 0039).
   */
  readonly prune: Effect.Effect<number>
  /** What each consumer has read, and how many rows are past it: what keeping it costs the log. */
  readonly consumers: Effect.Effect<ReadonlyArray<Consumer>>
  /**
   * Drops a consumer's cursor, so that the next prune passes what it never read: how a consumer that is gone,
   * or a name misspelt once, stops holding the log (decision 0039).
   */
  readonly forget: (consumer: string) => Effect.Effect<void>
  /**
   * Deletes the callers' replies of the program past their time, and gives how many went. A reply past its time is
   * never read, so this frees only their rows: those of an entity that takes no step, since a step deletes its own
   * entity's (decision 0125).
   */
  readonly expire: Effect.Effect<number>
  /**
   * The suspended entities of the program, the longest suspended first: each with what it died on, the cause, since
   * when, and the senders waiting for its resumption in this process. Read from what is stored, so an entity this
   * process does not hold is listed too (decision 0114).
   */
  readonly suspended: Effect.Effect<ReadonlyArray<Suspended>>
  /**
   * An operator resumes a suspended entity (decision 0006), with the program deployed: a fixed program is a deploy
   * of it, which the resume follows (decision 0064). It gives `Resumed`, `StillSuspended`, `NotSuspended` or
   * `NotFound` (decision 0114).
   */
  readonly resume: (id: string) => Effect.Effect<Operated>
  /**
   * An operator discards the inbound message a suspended entity died on (decision 0014). An internal one is not
   * discarded, and the entity stays suspended (decisions 0041, 0044). It gives `Discarded`, `NotDiscarded`,
   * `StillSuspended`, `NotSuspended` or `NotFound` (decision 0114).
   */
  readonly discard: (id: string) => Effect.Effect<Operated>
}

export interface Runtime {
  /**
   * Runs a program's entities in this process. The operations' services are taken from here, and their fibers run
   * in the runtime's scope: a program is deployed where its services are. `Entities` is the runtime's own, filled
   * in with the entity each operation runs for, so a program that only talks to other entities needs nothing.
   * A program that cannot run as written dies here, before anything is stored or run (decision 0054). So does
   * one whose name this process has deployed already: a new version is deployed by a new process (decision 0075).
   */
  readonly deploy: <T extends Types>(
    program: Program<T>,
  ) => Effect.Effect<Handle<T>, never, Exclude<T['services'], Entities>>
  /**
   * Waits until nothing is under way. Nothing is under way when no event waits, no mailbox holds a message and no
   * operation runs; when no entity told to leave is still held (decision 0076), and none is still unloading
   * (decision 0109); and when no stored timer of an entity this process has unloaded is due (decision 0029).
   */
  readonly settled: Effect.Effect<void>
}

/**
 * What tells an entity's loop to unload it now, as if its wait had run out: put in its queue of events, so that
 * the loop takes it or an event, and loses neither (decision 0076). It is no event, and is not counted as one.
 */
type Evict = Readonly<{ _tag: 'Evict' }>

/**
 * What tells an entity's loop that its wait has run out: put in its queue of events by a sleep the loop forks for
 * the wait, so that the take is never raced against a timeout, and loses no event (decision 0116). `wait` is the
 * wait it ends, since one put there just before an event is taken after it. It is no event, and is not counted as
 * one.
 */
type Passivate = Readonly<{ _tag: 'Passivate'; wait: number }>

/** An entity loaded in this process: its machine, the events waiting, and what is running for it. */
interface Loaded<T extends Types> {
  machine: Machine.Machine<T>
  applying: boolean
  readonly events: Queue.Queue<Machine.Offered<T> | Evict | Passivate>
  /** Told to leave the process, and not taken that yet: until its loop does, the process is not settled. */
  evicted: boolean
  /** How many times the loop has waited for an event: the number of the wait under way. */
  waits: number
  /**
   * The events offered and not yet applied: counted as each is offered, and until its step is done, so that an
   * event taken off the queue and not yet applied is still under way (decision 0063).
   */
  pending: number
  /** By `${key}@${incarnation}`: a timer's sleep is not work the runtime waits for. */
  readonly operations: Map<string, Fiber.Fiber<void>>
  /**
   * The operations among `operations` that run again at the next activation, idempotent and at least once: a
   * planned stop interrupts them at once (decision 0119).
   */
  readonly rerun: Set<string>
  readonly timers: Map<string, Fiber.Fiber<void>>
}

/**
 * What wakes the entities this process does not hold: a fiber reads the earliest time a stored timer is due,
 * sleeps until then, and activates what the time has come for (decision 0029).
 */
interface Waker {
  /**
   * The fiber has something to do: it is reading the earliest due, activating what the time has come for, or has
   * been poked. While it is set, nothing is known of the stored timers, and the process is not settled.
   */
  busy: boolean
  /**
   * The earliest time a stored timer of an unloaded entity is due, or an entity that failed is tried again, as last
   * read: to be read while `busy` is not.
   */
  next: number | null
  /** An entity was unloaded, and its timers may be due before the one the fiber sleeps for. */
  readonly poke: Queue.Queue<void>
  /**
   * The entities whose activation failed, by the time each is tried again: left out of the readings until then, so
   * that an entity the fiber cannot load neither stops it nor keeps it from sleeping (decision 0077).
   */
  readonly failed: Map<string, number>
}

interface Deployment<T extends Types> {
  readonly program: Program<T>
  readonly storage: Storage<T>
  /**
   * Where everything that runs for the deployment runs: the entities' loops, their operations and timers, and the
   * waker. A deploy that fails closes it, and leaves nothing running (decision 0051).
   */
  readonly scope: Scope.Closeable
  readonly loaded: Map<string, Loaded<T>>
  readonly waker: Waker
  /** The waker's fiber, once it is forked: a planned stop interrupts it (decision 0119). */
  waking: Fiber.Fiber<void, never> | null
  /** The services the program was deployed with, which its operations run in. */
  readonly run: (operation: Effect.Effect<void, never, T['services'] | Entities>) => Effect.Effect<void>
}

const under = (key: string, incarnation: number) => `${key}@${incarnation}`

/**
 * A defect that is its caller's, not the receiver's: a message or flags that do not encode, a creation that
 * `init` dies on. Every caller is given it as a defect, and an operation is suspended on it; any other defect of a
 * delivery is the receiver's crash, which an operation sends again after (decision 0046).
 */
class Faulted extends Data.TaggedError('Faulted')<Readonly<{ defect: unknown }>> {}

const faulted = <A>(effect: Effect.Effect<A, Faulted>): Effect.Effect<A> =>
  Effect.catchTag(effect, 'Faulted', (fault) => Effect.die(fault.defect))

/**
 * Runs `effect` once each count a caller gave — a cursor, a limit — is a non-negative integer: anything else is
 * the caller's defect, and nothing is read or stored for it. A limit left out is none (decision 0053).
 */
const counted = <A>(
  counts: Readonly<Record<string, number | undefined>>,
  effect: Effect.Effect<A>,
): Effect.Effect<A> =>
  Effect.suspend(() => {
    for (const [what, count] of Object.entries(counts)) {
      if (count === undefined || (Number.isSafeInteger(count) && count >= 0)) continue
      return Effect.die(new InvariantDefect({ reason: `the ${what} is ${count}, which is no non-negative integer` }))
    }
    return effect
  })

export const launch = (options: Options = {}): Effect.Effect<Runtime, never, SqlClient.SqlClient | Scope.Scope> =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    // The runtime's own scope, sequential whatever its caller's: a parallel scope would run the drain, the closing of
    // `running` and the release of the database at once (decision 0120).
    const scope = yield* Scope.fork(yield* Effect.scope, 'sequential')
    // One runtime holds the database, before anything of this one runs, and lets it go after everything of it has
    // stopped: the scope ends what it was given last first (decision 0080).
    yield* Scope.provide(hold, scope)
    // Everything the runtime runs is forked in `running`, which closes after the drain: a scope runs its finalizers
    // in the reverse order of their adding, so the drain, added after it, runs first (decision 0119).
    const running = yield* Scope.fork(scope)
    const deployments = new Map<string, Deployment<never>>()
    /** The names deployed in this process, or being deployed: each is deployed once (decision 0075). */
    const names = new Set<string>()
    /** The effects running detached from their callers, which `settled` waits for (decision 0079). */
    let detachments = 0
    /**
     * The entities unloading: left the process, and their timers not all stopped yet, nor the probe told. `settled`
     * waits for them too (decision 0109).
     */
    let leaving = 0
    /**
     * The callers waiting for a reply, by entity and then by request: a retry of a queued message waits with the
     * first, and a crash of the entity reaches every caller of it (decision 0042). A creation's callers wait apart
     * from a message's, since the two share request ids (decisions 0017, 0050).
     */
    const messages: Callers<Answer<unknown>> = new Map()
    const creations: Callers<Creation> = new Map()
    /**
     * The operators waiting for what their `Resume` or `Discard` did, by entity, in the order their events were
     * offered. Each event answers the first, so that an operator is told what its own event did, not what another
     * operator's event applied before it did. One who gave up stays in the line, so that the next event still
     * answers the operator who offered it (decision 0114).
     */
    const operators = new Map<string, MutableList.MutableList<Deferred.Deferred<Operated>>>()
    const addressOf = (entity: Address) => JSON.stringify([entity.name, entity.id])
    /**
     * What `settled` waits for. It is completed, and replaced, whenever something under way ends: a step, an
     * operation, a reading of the waker, an entity leaving the process. That is when the process may have become
     * settled. `settled` takes it before it looks, so that no ending between its look and its wait is missed
     * (decision 0063).
     */
    let ended = Deferred.makeUnsafe<void>()
    const end = () => {
      const was = ended
      ended = Deferred.makeUnsafe<void>()
      Deferred.doneUnsafe(was, Effect.void)
    }
    /** The operations waiting for a program not deployed yet, by its name: its deploy wakes them (decision 0045). */
    const undeployed = new Map<string, Deferred.Deferred<void>>()
    /**
     * The senders waiting for an entity's resumption, by entity. Each registers before it sends, so that a
     * resumption between its being answered `Suspended` and its waiting is not missed (decisions 0023, 0063).
     */
    const resumptions = new Map<string, Map<Deferred.Deferred<void>, Waiting>>()
    /** The senders waiting for the entity's resumption, as `suspended` lists them (decision 0114). */
    const waitingFor = (entity: Address): ReadonlyArray<Waiting> => [
      ...(resumptions.get(addressOf(entity))?.values() ?? []),
    ]
    /**
     * Each entity's lock, by entity, while someone holds or waits for it (decision 0067). What finds, loads,
     * creates, unloads or crashes an entity holds it. So no caller is between finding the entity and offering its
     * event when it leaves the process, and two callers never build two machines for it (decisions 0029, 0042).
     */
    // Counted by hand: `RcMap` counts its users the same way, but forks a fiber for each lock it makes, so a caller
    // that finds no lock would wait for that fiber before it holds one.
    const locks = new Map<string, { readonly semaphore: Semaphore.Semaphore; users: number }>()
    const holding = (entity: Address) => <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => {
      const address = addressOf(entity)
      return Effect.acquireUseRelease(
        Effect.sync(() => {
          const lock = locks.get(address) ?? { semaphore: Semaphore.makeUnsafe(1), users: 0 }
          lock.users += 1
          locks.set(address, lock)
          return lock
        }),
        (lock) => lock.semaphore.withPermits(1)(effect),
        (lock) =>
          Effect.sync(() => {
            lock.users -= 1
            // Dropped by its last user only: one dropped while others wait would let a new taker hold it beside
            // them. `callers of an unloaded entity build one machine for it`, in the tests, reaches it (decision 0104).
            if (lock.users === 0) locks.delete(address)
          }),
      )
    }
    const probe = yield* Probe
    // The one cast of an event: a probe is told of the events of every program, and steps none of them.
    const at = <T extends Types>(point: Point, entity: Address, event: Machine.Event<T>) =>
      probe({ _tag: 'Reached', point, entity, event: event as Machine.Event<never> })
    const observe = <T extends Types>(entity: Address, event: Machine.Event<T>) =>
      probe({ _tag: 'Applied', entity, event: event as Machine.Event<never> })
    const retry = options.retry?.millis ?? 10
    const passivate = options.passivate?.millis ?? 30_000
    const capacity = options.capacity?.entities
    const drain = options.drain?.millis
    if (drain !== undefined && !(Number.isSafeInteger(drain) && drain >= 0)) {
      const reason = `the drain is ${drain} millis, which is no non-negative integer`
      return yield* Effect.die(new InvariantDefect({ reason }))
    }
    /** A planned stop is under way: the scope closes, and the drain waits (decision 0119). */
    let draining = false
    /** What a caller that arrives during the drain waits for: it is interrupted once the drain ends. */
    const stopped = Deferred.makeUnsafe<never>()
    /** A caller's effect, unless a planned stop is under way. */
    const admitted = <A>(effect: Effect.Effect<A>): Effect.Effect<A> =>
      Effect.suspend(() => draining ? Deferred.await(stopped) : effect)
    if (capacity !== undefined && !(Number.isSafeInteger(capacity) && capacity > 0)) {
      const reason = `the capacity is ${capacity}, which is no positive integer`
      return yield* Effect.die(new InvariantDefect({ reason }))
    }
    /**
     * Every entity this process holds, of every program, from the least recently used: an entity is used when it is
     * loaded and when an event is offered to it. It is what a process over its capacity unloads first (decision 0076).
     */
    const recent = new Map<string, Loaded<never>>()
    // The one cast of a loaded entity: the process orders the entities of every program, and steps none of them.
    const erased = <T extends Types>(loaded: Loaded<T>) => loaded as unknown as Loaded<never>
    /** The entity leaves the order of use, if it is the one held there. */
    const forgetUse = <T extends Types>(loaded: Loaded<T>) => {
      const address = addressOf(loaded.machine.stored)
      if (recent.get(address) === erased(loaded)) recent.delete(address)
    }

    const deployment = <T extends Types>(name: string): Deployment<T> | undefined =>
      deployments.get(name) as Deployment<T> | undefined

    const answer = <A>(waiting: Callers<A>, entity: Address, request: string, reply: A) =>
      Effect.suspend(() => {
        const requests = waiting.get(addressOf(entity))
        const callers = requests?.get(request)
        if (requests === undefined || callers === undefined) return Effect.void
        requests.delete(request)
        if (requests.size === 0) waiting.delete(addressOf(entity))
        return Effect.forEach(callers, (caller) => Deferred.succeed(caller, reply), { discard: true })
      })

    /** A caller registered and waiting: its event is offered, and the reply comes to `caller`. */
    interface Asked<A> {
      readonly caller: Deferred.Deferred<A>
      readonly forget: Effect.Effect<void>
    }

    /**
     * Registers a caller and offers its event. It is done while the entity is held — its lock — so that an entity
     * is never unloaded between a caller finding it and its event being offered (decisions 0029, 0067).
     */
    const ask = <T extends Types, A>(
      waiting: Callers<A>,
      loaded: Loaded<T>,
      entity: Address,
      request: string,
      event: Machine.Offered<T>,
    ): Effect.Effect<Asked<A>> =>
      Effect.gen(function*() {
        const address = addressOf(entity)
        const caller = yield* Deferred.make<A>()
        const requests = waiting.get(address) ?? new Map<string, Set<Deferred.Deferred<A>>>()
        const callers = requests.get(request) ?? new Set<Deferred.Deferred<A>>()
        callers.add(caller)
        requests.set(request, callers)
        waiting.set(address, requests)
        // A caller that gives up leaves nothing behind: its message is applied once, whichever retry finds it.
        const forget = Effect.sync(() => {
          const current = waiting.get(address)
          const held = current?.get(request)
          if (current === undefined || held === undefined) return
          held.delete(caller)
          if (held.size > 0) return
          current.delete(request)
          if (current.size === 0) waiting.delete(address)
        })
        yield* offer(loaded, event)
        return { caller, forget }
      })

    /**
     * Offers an event to a loaded entity, counted until its step is done (decision 0063), and the entity is the most
     * recently used, if it is still held (decision 0076).
     */
    const offer = <T extends Types>(loaded: Loaded<T>, event: Machine.Offered<T>) =>
      Effect.sync(() => {
        loaded.pending += 1
        Queue.offerUnsafe(loaded.events, event)
        const address = addressOf(loaded.machine.stored)
        if (recent.get(address) !== erased(loaded)) return
        recent.delete(address)
        recent.set(address, erased(loaded))
      })

    /**
     * An entity enters the process. Once the process holds more than its capacity, the least recently used of the
     * spare entities are told to leave, as many as it holds too many, the one entering aside. Their loops unload
     * them, each under its own lock: nothing here waits for another entity's lock while this one's is held
     * (decisions 0067, 0076).
     */
    const enter = <T extends Types>(deployed: Deployment<T>, loaded: Loaded<T>) =>
      Effect.map(DateTime.now, (at) => {
        const now = DateTime.toEpochMillis(at)
        deployed.loaded.set(loaded.machine.stored.id, loaded)
        recent.set(addressOf(loaded.machine.stored), erased(loaded))
        if (capacity === undefined) return
        let over = recent.size - capacity
        for (const other of recent.values()) {
          if (over <= 0) return
          if (other === erased(loaded)) continue
          if (other.evicted) {
            over -= 1
          } else if (spare(other, now)) {
            other.evicted = true
            Queue.offerUnsafe(other.events, { _tag: 'Evict' })
            over -= 1
          }
        }
      })

    /** Wakes every sender waiting for the entity's resumption: it sends again, and is answered (decision 0063). */
    const wake = (entity: Address) => {
      const address = addressOf(entity)
      const senders = resumptions.get(address)
      if (senders === undefined) return
      resumptions.delete(address)
      for (const sender of senders.keys()) Deferred.doneUnsafe(sender, Effect.void)
    }

    /**
     * Registers a sender's wait for the entity's resumption, before it sends. `resumed` is what it waits on if it
     * is answered `Suspended`, and `forget` takes it back whatever it is answered. A registration made after the
     * answer would miss a resumption between the two, and wait for ever. `a sender answered Suspended is woken by
     * the resumption`, in the tests, reaches that under the scheduler of the tests (decision 0104). `waiting` is
     * who registers, for `suspended` to list (decision 0114).
     */
    const awaitResumption = (entity: Address, waiting: Waiting) =>
      Effect.sync(() => {
        const address = addressOf(entity)
        const sender = Deferred.makeUnsafe<void>()
        const senders = resumptions.get(address) ?? new Map<Deferred.Deferred<void>, Waiting>()
        senders.set(sender, waiting)
        resumptions.set(address, senders)
        const forget = Effect.sync(() => {
          senders.delete(sender)
          if (senders.size === 0 && resumptions.get(address) === senders) resumptions.delete(address)
        })
        return { resumed: Deferred.await(sender), forget }
      })

    /** Waits for the reply the entity stores or gives, and leaves nothing registered. */
    const answered = <A>({ caller, forget }: Asked<A>) => Effect.onExit(Deferred.await(caller), () => forget)

    /** The work under a key stops: its fiber is interrupted, and nothing it would deliver is recorded. */
    const stop = (held: Map<string, Fiber.Fiber<void>>, id: string) =>
      Effect.suspend(() => {
        const fiber = held.get(id)
        if (fiber === undefined) return Effect.void
        held.delete(id)
        return Fiber.interrupt(fiber)
      })

    /**
     * Stops the operation under `id` without waiting for it: a droppable one's finalizers are the runner's, and the
     * entity's next event does not wait behind them. A completion it offers before the interruption lands is dropped,
     * since the step that stopped it moved its incarnation on or dropped its key (decision 0128).
     */
    const drop = (held: Map<string, Fiber.Fiber<void>>, id: string, scope: Scope.Scope) =>
      Effect.suspend(() => {
        const fiber = held.get(id)
        if (fiber === undefined) return Effect.void
        held.delete(id)
        return Effect.asVoid(Effect.forkIn(Fiber.interrupt(fiber), scope))
      })

    const stopAll = <T extends Types>(loaded: Loaded<T>) =>
      Effect.gen(function*() {
        for (const id of [...loaded.operations.keys()]) yield* stop(loaded.operations, id)
        for (const id of [...loaded.timers.keys()]) yield* stop(loaded.timers, id)
      })

    /**
     * Forks `effect` in `scope`, held under `id` while it runs. Nothing ended is counted as running (decision 0068):
     * the forking fiber may yield between the fork and the registration, and the fiber end meanwhile. So one that
     * has ended is never held, and its end is told after it has left `held`, in one step.
     */
    const forkHeld = (
      held: Map<string, Fiber.Fiber<void>>,
      id: string,
      scope: Scope.Scope,
      effect: Effect.Effect<void>,
    ) =>
      Effect.gen(function*() {
        let done = false
        const fiber = yield* Effect.forkIn(
          Effect.ensuring(
            effect,
            Effect.sync(() => {
              done = true
              held.delete(id)
              end()
            }),
          ),
          scope,
        )
        if (!done) held.set(id, fiber)
      })

    /** Starts an operation: its message is offered as a `Complete`, a defect of it as a `Die`. */
    const start = <T extends Types>(
      deployed: Deployment<T>,
      loaded: Loaded<T>,
      entity: Address,
      output: Extract<Machine.Output<T>, { _tag: 'Started' }>,
    ) =>
      Effect.gen(function*() {
        const { key, incarnation, idempotencyKey, operation } = output
        const runner = runnerOf(deployed.program, operation)
        // The machine admitted the operation with the deployed program's runners, which stepped it (decision
        // 0064): an operation with none is the runtime's, and crashes the entity (decision 0061).
        if (runner === undefined) {
          return yield* Effect.die(
            new Error(`the deployed program '${deployed.program.name}' has no runner for '${operation._tag}'`),
          )
        }
        // Built in the operation's fiber: a runner that throws while it builds its effect dies as the operation,
        // and suspends the entity, instead of the event that started it (decision 0042).
        const run = Effect.suspend(() =>
          runner.delivery === 'Idempotent' || runner.delivery === 'IdempotentDigest'
            ? runner.run(operation, idempotencyKey)
            : runner.run(operation)
        )
        const id = under(key, incarnation)
        // An operation that runs again at the next activation is not started during a planned stop: it is stored,
        // and starts there. An at-most-once one is started, since one stored and never started would deliver its
        // `unknown` without having run (decision 0119).
        if (runner.delivery !== 'AtMostOnce') {
          if (draining) return
          loaded.rerun.add(id)
        }
        yield* forkHeld(
          loaded.operations,
          id,
          deployed.scope,
          deployed.run(
            Effect.gen(function*() {
              const exit = yield* Effect.exit(Effect.ensuring(run, Effect.sync(() => loaded.rerun.delete(id))))
              if (exit._tag === 'Success') {
                yield* offer(loaded, { _tag: 'Complete', key, incarnation, message: exit.value })
              } else if (!Cause.hasInterruptsOnly(exit.cause)) {
                yield* offer(loaded, { _tag: 'Die', key, incarnation, cause: Cause.squash(exit.cause) })
              }
            }).pipe(
              // The requests it sends are this run's: an entity cannot pass for another, nor an operation for
              // another (decisions 0009, 0060).
              Effect.provideService(Entities, entities(entity, key, incarnation, runner.delivery === 'Droppable')),
            ),
          ),
        )
      })

    /** Arms a timer: its time comes, and `Fire` is offered. A passivated entity would be woken by `due` instead. */
    const arm = <T extends Types>(
      deployed: Deployment<T>,
      loaded: Loaded<T>,
      output: Extract<Machine.Output<T>, { _tag: 'Armed' }>,
    ) =>
      Effect.gen(function*() {
        const { key, incarnation, timer } = output
        // A planned stop arms no timer: the stored time wakes the entity in the next process (decision 0119).
        if (draining) return
        const now = yield* DateTime.now
        const millis = Math.max(0, DateTime.toEpochMillis(timer.at) - DateTime.toEpochMillis(now))
        yield* forkHeld(
          loaded.timers,
          under(key, incarnation),
          deployed.scope,
          Effect.gen(function*() {
            yield* Effect.sleep(`${millis} millis`)
            yield* offer(loaded, { _tag: 'Fire', key, incarnation })
          }),
        )
      })

    const perform = <T extends Types>(
      deployed: Deployment<T>,
      loaded: Loaded<T>,
      entity: Address,
      event: Machine.Event<T>,
      outputs: ReadonlyArray<Machine.Output<T>>,
    ) =>
      Effect.gen(function*() {
        // The callers first: a reply is what the event's commit made true (decision 0023).
        for (const output of outputs) {
          if (output._tag !== 'Replied' && output._tag !== 'CreationReplied') continue
          const request = Machine.requestKey(deployed.program, output.request)
          yield* output._tag === 'Replied'
            ? answer(messages, entity, request, output.reply)
            : answer(creations, entity, request, output.reply)
        }
        yield* at('AfterReply', entity, event)
        for (const output of outputs) {
          switch (output._tag) {
            case 'Started':
              yield* start(deployed, loaded, entity, output)
              break
            case 'Armed':
              yield* arm(deployed, loaded, output)
              break
            case 'Disarmed':
              yield* stop(loaded.timers, under(output.key, output.incarnation))
              yield* drop(loaded.operations, under(output.key, output.incarnation), deployed.scope)
              break
            case 'Suspended':
              // The timers stop. The operations run to their end, and their completions are recorded behind the
              // message the entity died on (decision 0113).
              for (const id of [...loaded.timers.keys()]) yield* stop(loaded.timers, id)
              break
            default:
              // The replies, `Recorded`, `Delivered` and `Dropped` are what the commit already said.
              break
          }
        }
      })

    /**
     * One event: the machine's step, written in one transaction, then acted on. A crash at any of the points
     * leaves the entity as the crash table says. A message is given the reply stored under its request, read here,
     * where no other event of the entity is applied: the machine holds none (decision 0065). It is given the time
     * too, at which it is handled if the mailbox is empty (decision 0074).
     */
    const apply = <T extends Types>(
      deployed: Deployment<T>,
      loaded: Loaded<T>,
      offered: Machine.Offered<T>,
    ): Effect.Effect<void> =>
      Effect.gen(function*() {
        loaded.applying = true
        const entity: Address = { name: loaded.machine.stored.name, id: loaded.machine.stored.id }
        const now = yield* DateTime.now
        const event: Machine.Event<T> = offered._tag === 'Receive'
          ? {
            ...offered,
            reply: yield* deployed.storage.reply(entity.id, offered.request, DateTime.toEpochMillis(now)),
            at: now,
          }
          : offered
        const before = loaded.machine
        const transition = Machine.step(deployed.program, before, event)
        const { written } = transition
        if (written !== null) {
          yield* at('BeforeCommit', entity, event)
          // What the event writes is the machine's, encoded: the storage decides nothing (decision 0057).
          yield* sql.withTransaction(deployed.storage.write(entity.id, written, DateTime.toEpochMillis(now))).pipe(
            Effect.orDie,
          )
        }
        loaded.machine = transition.machine
        if (before.stored.suspension !== null && transition.machine.stored.suspension === null) {
          wake(entity)
        }
        if (event._tag === 'Resume' || event._tag === 'Discard') {
          const line = operators.get(addressOf(entity))
          const operator = line === undefined ? MutableList.Empty : MutableList.take(line)
          if (line?.length === 0) operators.delete(addressOf(entity))
          if (operator !== MutableList.Empty) {
            yield* Deferred.succeed(operator, operated(event._tag, before, transition.machine))
          }
        }
        // An event is observed once it is written, and before anything is acted on; one that writes nothing is
        // observed at once. A crash before the commit leaves no event, and one after it an event that happened.
        yield* observe(entity, event)
        if (written !== null) yield* at('AfterCommit', entity, event)
        yield* perform(deployed, loaded, entity, event, transition.outputs)
      }).pipe(Effect.ensuring(Effect.sync(() => {
        loaded.applying = false
        end()
      })))

    /**
     * Whether the entity has nothing to do: no event waiting or being applied, no message to handle, and nothing
     * but timers left of what its state holds (decision 0029).
     */
    const nothingToDo = <T extends Types>(loaded: Loaded<T>) => {
      const { stored } = loaded.machine
      if (loaded.applying || loaded.pending > 0 || loaded.operations.size > 0) return false
      // A suspended entity whose operations have ended handles nothing, and comes back suspended, with the message
      // it died on and the completions behind it (decisions 0006, 0113).
      if (stored.suspension !== null) return true
      if (stored.mailbox.length > 0) return false
      // What the state holds is what the next activation starts, so only timers may be left: an operation with
      // nothing running for it would come back as its `unknown`, and an at-most-once one would lose its act.
      return Object.values(stored.keys).every((key) => key.work === undefined || isTimer(key.work))
    }

    /**
     * Whether the entity may leave a process over its capacity: it has nothing to do, and no timer of its is due by
     * `now`. A timer due is a firing about to be offered, and an entity woken for it would be unloaded before it
     * fires, and woken again (decision 0078).
     */
    const spare = <T extends Types>(loaded: Loaded<T>, now: number) => {
      const { stored } = loaded.machine
      if (!nothingToDo(loaded)) return false
      // A suspended entity's timers are not armed, and nothing of it fires (decision 0029).
      if (stored.suspension !== null) return true
      return Object.values(stored.keys).every((key) =>
        key.work === undefined || !isTimer(key.work) || DateTime.toEpochMillis(key.work.at) > now
      )
    }

    /**
     * The entity leaves this process, and the waker is told in the same step (decision 0068). So there is no
     * moment at which its timers are neither armed here nor counted among the stored ones: a reading of the stored
     * timers that left the entity out as held is made again, and one made after counts them. The waker's flag and
     * its poke are set together, and the waker clears them in one step too, so the process is never settled with a
     * poke nobody has taken.
     */
    const leave = <T extends Types>(deployed: Deployment<T>, loaded: Loaded<T>) =>
      Effect.sync(() => {
        const { id } = loaded.machine.stored
        if (deployed.loaded.get(id) === loaded) deployed.loaded.delete(id)
        forgetUse(loaded)
        deployed.waker.busy = true
        Queue.offerUnsafe(deployed.waker.poke, undefined)
        end()
      })

    /**
     * Unloads the entity: its timers stop, and what the state holds is what wakes it again — to the machine a
     * `Restart`, a crash this process chose (decision 0029). Under the entity's lock, so that no caller is between
     * finding the entity and offering its event; it gives whether the entity is gone. One told to leave a process
     * over its capacity is unloaded only if it is spare at `evicted`, the time its loop takes that (decision 0078).
     */
    const unload = <T extends Types>(deployed: Deployment<T>, loaded: Loaded<T>, evicted: number | null) =>
      holding(loaded.machine.stored)(Effect.gen(function*() {
        const { id } = loaded.machine.stored
        const leaves = evicted === null ? nothingToDo(loaded) : spare(loaded, evicted)
        if (!leaves || deployed.loaded.get(id) !== loaded) return false
        // Counted from before it leaves: once it has, nothing else keeps the process from being settled. `a process
        // over its capacity unloads its least recently used idle entity`, in the tests, reaches it (decision 0109).
        yield* Effect.acquireUseRelease(
          Effect.sync(() => {
            leaving += 1
          }),
          () =>
            Effect.gen(function*() {
              yield* leave(deployed, loaded)
              // A timer that fires between here and its interruption delivers nothing, and the stored time stands.
              yield* stopAll(loaded)
              yield* probe({ _tag: 'Unloaded', entity: { name: deployed.program.name, id } })
            }),
          () =>
            Effect.sync(() => {
              leaving -= 1
              end()
            }),
        )
        return true
      }))

    /**
     * An event the runtime could not finish is a crash of its entity alone: a write that failed, a probe that
     * died. The entity leaves this process, its work stops, and its waiting callers are given the defect, to
     * retry. What is stored is what its next activation starts from, as after a crash of the process. Called
     * where the entity's lock is held, so that no caller is between finding the entity and offering its event
     * (decisions 0042, 0067). The interruption of its work is forked: it waits for the operations' finalizers,
     * and nothing else waits for them under the lock (decision 0056).
     */
    const crash = <T extends Types>(deployed: Deployment<T>, loaded: Loaded<T>, cause: Cause.Cause<never>) =>
      Effect.gen(function*() {
        const { name, id } = loaded.machine.stored
        // Its stored timers are the waker's again. A crash may run where the step that died cannot be interrupted, as
        // a creation's `onError` does: the fork's option keeps it stoppable by the scope (decision 0112).
        yield* leave(deployed, loaded)
        yield* Effect.forkIn(stopAll(loaded), deployed.scope, { uninterruptible: false })
        const address = addressOf({ name, id })
        const fail = <A>(waiting: Callers<A>) =>
          Effect.gen(function*() {
            const requests = waiting.get(address)
            waiting.delete(address)
            for (const callers of requests?.values() ?? []) {
              for (const caller of callers) yield* Deferred.failCause(caller, cause)
            }
          })
        yield* fail(messages)
        yield* fail(creations)
        const line = operators.get(address)
        operators.delete(address)
        for (const operator of line === undefined ? [] : MutableList.takeAll(line)) {
          yield* Deferred.failCause(operator, cause)
        }
      })

    /**
     * The entity's loop. While its mailbox holds a message, it is handled, one transaction each. Otherwise the
     * loop waits for an event. The entity is unloaded if none comes for long enough, or once it is told to leave
     * a process over its capacity (decision 0076). A suspended entity handles nothing, and waits (decisions 0006,
     * 0113). The wait times out, never the take: an event taken is always applied. A loop that dies crashes its
     * entity, and an interruption is the process's crash (decision 0042).
     */
    const loop = <T extends Types>(deployed: Deployment<T>, loaded: Loaded<T>): Effect.Effect<void> =>
      steps(deployed, loaded).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.failCause(cause)
            : holding(loaded.machine.stored)(crash(deployed, loaded, cause))
        ),
      )

    const steps = <T extends Types>(deployed: Deployment<T>, loaded: Loaded<T>): Effect.Effect<void> => {
      const handles = () => loaded.machine.stored.suspension === null && loaded.machine.stored.mailbox.length > 0
      // The loop yields after a step that leaves it more to do, so that another entity steps between two of this
      // one's. Effect yields a fiber after a count of operations, and a step whose encoding and write take long is
      // few operations. A loop with nothing to do starts its wait at once, so that `settled` finds the wait's sleep
      // started (decision 0134).
      const again: Effect.Effect<void> = Effect.suspend(() =>
        handles() || Queue.sizeUnsafe(loaded.events) > 0 ? Effect.andThen(Effect.yieldNow, next) : next
      )
      const next: Effect.Effect<void> = Effect.suspend(() => {
        if (handles()) {
          return DateTime.now.pipe(
            Effect.flatMap((now) => apply(deployed, loaded, { _tag: 'Handle', at: now })),
            Effect.flatMap(() => again),
          )
        }
        // The wait's end is put in the queue by a sleep of its own, and the take is raced against nothing: a take a
        // timeout interrupts can lose the event it took (decision 0116). The sleep is the loop's child, and ends with it.
        const wait = ++loaded.waits
        const runsOut = Effect.andThen(
          Effect.sleep(`${passivate} millis`),
          Effect.sync(() => Queue.offerUnsafe(loaded.events, { _tag: 'Passivate', wait })),
        )
        // An end an earlier wait's sleep put there, just before the event that ended that wait, is passed over.
        const take: Effect.Effect<Machine.Offered<T> | Evict | Passivate> = Effect.flatMap(
          Queue.take(loaded.events),
          (taken) => taken._tag === 'Passivate' && taken.wait !== wait ? take : Effect.succeed(taken),
        )
        return Effect.flatMap(Effect.forkChild(runsOut), (sleep) =>
          Effect.flatMap(take, (taken) => Effect.as(Fiber.interrupt(sleep), taken))).pipe(
          Effect.flatMap((taken) => {
            // The wait ran out, or the entity was told to leave: it is unloaded if it has nothing to do.
            const event = taken._tag === 'Passivate' ? null : taken
            if (event === null || event._tag === 'Evict') {
              const evicted = event === null ? Effect.succeed(null) : Effect.map(DateTime.now, DateTime.toEpochMillis)
              return Effect.flatMap(Effect.flatMap(evicted, (now) => unload(deployed, loaded, now)), (gone) =>
                Effect.suspend(() => {
                  // One told to leave that has something to do by now stays, and may be told again.
                  if (event !== null) {
                    loaded.evicted = false
                    end()
                  }
                  return gone ? Effect.void : next
                }))
            }
            return Effect.flatMap(
              apply(deployed, loaded, event).pipe(Effect.ensuring(Effect.sync(() => {
                loaded.pending -= 1
                end()
              }))),
              () => again,
            )
          }),
        )
      })
      return next
    }

    /** Registers an entity in this process, and activates what was stored, as after a crash. */
    const activate = <T extends Types>(deployed: Deployment<T>, stored: Machine.Stored<T>) =>
      Effect.gen(function*() {
        const loaded: Loaded<T> = {
          machine: { stored, running: {} },
          applying: false,
          events: yield* Queue.unbounded<Machine.Offered<T> | Evict | Passivate>(),
          evicted: false,
          waits: 0,
          pending: 0,
          operations: new Map(),
          rerun: new Set(),
          timers: new Map(),
        }
        yield* enter(deployed, loaded)
        // Before anything else: the stored state says what runs (decision 0003). An activation that cannot finish
        // leaves nothing loaded, and its caller gets the defect (decision 0042). It runs detached from its caller,
        // so an interruption is the process's crash (decision 0079).
        yield* apply(deployed, loaded, { _tag: 'Restart' }).pipe(
          Effect.onError((cause) => Cause.hasInterruptsOnly(cause) ? Effect.void : crash(deployed, loaded, cause)),
        )
        yield* Effect.forkIn(loop(deployed, loaded), deployed.scope)
        return loaded
      })

    /**
     * Runs `effect` in the deployment's scope, and waits for it. A caller that gives up stops waiting, and what the
     * effect sets going is finished all the same: an activation, a creation and its work. Only the process's crash
     * stops it halfway, as the crash table says (decision 0079). It is counted from the step that forks it to its
     * end, so that the process is not settled while it runs. The step is uninterruptible, and the fibers it forks
     * are not, so the scope still stops them: their option says so, rather than Effect's default (decision 0112).
     * The count is given back by a fiber of the process's scope that waits for it, since one the deployment's
     * scope stops before its first step runs no finalizer of its own (decision 0110).
     */
    const detached = <T extends Types, A, E>(deployed: Deployment<T>, effect: Effect.Effect<A, E>) =>
      Effect.flatMap(
        Effect.uninterruptible(Effect.gen(function*() {
          detachments += 1
          const fiber = yield* Effect.forkIn(effect, deployed.scope, { uninterruptible: false })
          yield* Effect.forkIn(
            Effect.andThen(
              Fiber.await(fiber),
              Effect.sync(() => {
                detachments -= 1
                end()
              }),
            ),
            running,
            { uninterruptible: false },
          )
          return fiber
        })),
        Fiber.join,
      )

    /**
     * Runs `found` on the entity `id` of `deployed`, while the entity is held. The entity is loaded from storage
     * when this process does not hold it. Its lock is what keeps it from being unloaded meanwhile, and what makes
     * a caller of an entity being activated wait for that activation (decisions 0029, 0067). An entity held is
     * found in the caller's fiber. One to load is loaded detached from it, with `found`, under the same hold of its
     * lock: so the entity is never unloaded between its activation and its caller's event (decision 0079).
     */
    const withEntity = <T extends Types, A>(
      deployed: Deployment<T>,
      id: string,
      found: (loaded: Loaded<T> | null) => Effect.Effect<A>,
    ) => {
      const held = holding({ name: deployed.program.name, id })
      const loading = held(Effect.gen(function*() {
        const loaded = deployed.loaded.get(id)
        if (loaded !== undefined) return yield* found(loaded)
        const stored = yield* deployed.storage.load(id)
        return yield* found(stored === null ? null : yield* activate(deployed, stored))
      }))
      return Effect.flatMap(
        held(Effect.suspend(() => {
          const loaded = deployed.loaded.get(id)
          return loaded === undefined ? Effect.succeed(null) : Effect.map(found(loaded), (value) => ({ value }))
        })),
        (here) => here === null ? detached(deployed, loading) : Effect.succeed(here.value),
      )
    }

    /** Loads the entity `id` into this process, if it is stored and this process does not hold it already. */
    const loads = <T extends Types>(deployed: Deployment<T>, id: string) =>
      withEntity(deployed, id, () => Effect.void)

    /**
     * An operator's `Resume` or `Discard`: offered while the entity is held, as a caller's message is, and answered
     * with what it did once applied (decision 0114).
     */
    const operate = <T extends Types>(
      deployed: Deployment<T>,
      id: string,
      event: Extract<Machine.Offered<T>, { _tag: 'Resume' | 'Discard' }>,
    ): Effect.Effect<Operated> =>
      Effect.flatMap(
        withEntity(deployed, id, (loaded): Effect.Effect<Deferred.Deferred<Operated> | null> =>
          loaded === null ? Effect.succeed(null) : Effect.uninterruptible(Effect.gen(function*() {
            // Registered and offered under the entity's lock, and in one step: the line keeps the order of the
            // events, and an interruption cannot leave in it an operator whose event was never offered.
            const operator = yield* Deferred.make<Operated>()
            const address = addressOf({ name: deployed.program.name, id })
            const line = operators.get(address) ?? MutableList.make<Deferred.Deferred<Operated>>()
            MutableList.append(line, operator)
            operators.set(address, line)
            yield* offer(loaded, event)
            return operator
          }))),
        (operator) => operator === null ? Effect.succeed<Operated>({ _tag: 'NotFound' }) : Deferred.await(operator),
      )

    const create = <T extends Types>(
      deployed: Deployment<T>,
      id: string,
      flags: T['flags'],
      request: Request<T['sender']>,
    ): Effect.Effect<Creation, Faulted> =>
      Effect.gen(function*() {
        const entity: Address = { name: deployed.program.name, id }
        // A caller's creation is stored under its sender, which a sender that does not encode cannot be: the
        // caller's defect, as for a message (decisions 0040, 0048). So are flags that do not encode, whether the
        // entity exists or not (decision 0049).
        const requested = yield* Effect.try({
          try: () => {
            encode(deployed.program.schemas.flags, flags, 'value of the flags')
            if (request._tag === 'Caller') encode(deployed.program.schemas.sender, request.sender, 'sender')
            return Machine.requestKey(deployed.program, request)
          },
          catch: (defect) => new Faulted({ defect }),
        })
        // Detached from the caller: a creation committed is always started, and its entity loaded (decision 0079).
        const asked = yield* detached(deployed, holding(entity)(Effect.gen(function*() {
          const held = deployed.loaded.get(id) ?? null
          // The entity was already there: the machine answers the request from what is stored (decision 0017).
          if (held !== null) return yield* ask(creations, held, entity, requested, { _tag: 'Create', request })
          const stored = yield* deployed.storage.load(id)
          if (stored !== null) {
            const loaded = yield* activate(deployed, stored)
            return yield* ask(creations, loaded, entity, requested, { _tag: 'Create', request })
          }
          const now = yield* DateTime.now
          const started = Machine.start(deployed.program, id, flags, now, request)
          // A defect at creation stores nothing (decision 0014): its creator is given the defect itself, and a
          // retry after a fix creates the entity (decision 0124).
          if (started._tag === 'Defect') return yield* Effect.fail(new Faulted({ defect: started.cause }))
          const loaded: Loaded<T> = {
            machine: started.machine,
            applying: false,
            events: yield* Queue.unbounded<Machine.Offered<T> | Evict | Passivate>(),
            evicted: false,
            waits: 0,
            pending: 0,
            operations: new Map(),
            rerun: new Set(),
            timers: new Map(),
          }
          const creation: Machine.Event<T> = { _tag: 'Create', request }
          yield* at('BeforeCommit', entity, creation)
          yield* sql.withTransaction(deployed.storage.write(id, started.written, DateTime.toEpochMillis(now))).pipe(
            Effect.orDie,
          )
          // The entity exists from here: its creation is the first event committed for it.
          yield* observe(entity, creation)
          yield* at('AfterCommit', entity, creation)
          yield* enter(deployed, loaded)
          // Each point of the crash table is given the creation, its event: `AfterReply` too.
          yield* perform(deployed, loaded, entity, creation, started.outputs).pipe(
            Effect.onError((cause) => Cause.hasInterruptsOnly(cause) ? Effect.void : crash(deployed, loaded, cause)),
          )
          yield* Effect.forkIn(loop(deployed, loaded), deployed.scope)
          return null
        })))
        return asked === null ? { _tag: 'Created' } : yield* answered(asked)
      })

    const send = <T extends Types>(
      deployed: Deployment<T>,
      id: string,
      message: T['inbound'],
      request: Request<T['sender']>,
      keep?: number,
    ): Effect.Effect<Answer<T['rejection']>, Faulted> =>
      Effect.gen(function*() {
        const entity: Address = { name: deployed.program.name, id }
        // A message is stored as its schema writes it: one that does not encode is its caller's defect, and
        // reaches no entity (decision 0040).
        const requested = yield* Effect.try({
          try: () => {
            const { schemas } = deployed.program
            encode(schemas.inbound, message, 'inbound message')
            if (request._tag === 'Caller') encode(schemas.sender, request.sender, 'sender')
            return Machine.requestKey(deployed.program, request)
          },
          catch: (defect) => new Faulted({ defect }),
        })
        const asked = yield* withEntity(deployed, id, (loaded) =>
          loaded === null
            ? Effect.succeed(null)
            : ask(
              messages,
              loaded,
              entity,
              requested,
              keep === undefined ? { _tag: 'Receive', request, message } : { _tag: 'Receive', request, message, keep },
            ))
        if (asked === null) return { _tag: 'NotFound' }
        return (yield* answered(asked)) as Answer<T['rejection']>
      })

    /**
     * The deployment of `program`, once there is one. An operation that reaches a program not deployed yet waits
     * for it, as for a suspended receiver: what runs does not depend on the order of the deploys (decision 0045).
     */
    const deployedAs = <T extends Types>(program: Program<T>): Effect.Effect<Deployment<T>> =>
      Effect.suspend(() => {
        const deployed = deployment<T>(program.name)
        if (deployed !== undefined) return Effect.succeed(deployed)
        const deploy = undeployed.get(program.name) ?? Deferred.makeUnsafe<void>()
        undeployed.set(program.name, deploy)
        return Effect.flatMap(Deferred.await(deploy), () => deployedAs(program))
      })

    /**
     * What a delivery gives, or `none` when the receiver crashed on it: no reply yet, for the sender to send again
     * under the same request id, as after a crash of the process. A defect of the sender's own stays one, and so
     * does an interruption (decision 0046).
     */
    const unlessCrashed = <A, B>(delivery: Effect.Effect<A, Faulted>, none: B): Effect.Effect<A | B, Faulted> =>
      Effect.catchCause(delivery, (cause) =>
        Cause.hasInterruptsOnly(cause) || Cause.hasFails(cause) ? Effect.failCause(cause) : Effect.succeed(none))

    /**
     * What one run of an operation sends with. Its request is the run's, its entity, key and incarnation, with the
     * name the operation gives it. So a restarted operation gets the stored replies, and no operation can send
     * under another's (decisions 0009, 0047, 0060). A name the run already used with the same entity would be
     * answered the first one's reply, and is the operation's defect: for a message, and apart for a creation. A
     * suspended receiver has no reply yet, and `send` waits for its resumption instead of giving up (decisions 0023,
     * 0063). A receiver that crashed has none either, and is sent to again after `retry` (decision 0046). `send`
     * and `create` wait for the deploy of a program not deployed yet (decisions 0045, 0063).
     */
    const entities = (entity: Address, key: string, incarnation: number, droppable: boolean) => {
      const used = { message: new Set<string>(), creation: new Set<string>() }
      /** The request named `name` to the entity `id` of `program`, or the run's defect if it made it already. */
      const named = <T extends Types>(
        kind: keyof typeof used,
        program: Program<T>,
        id: string,
        name: string,
      ): Effect.Effect<Readonly<{ deployed: Deployment<T>; request: Request<T['sender']> }>> =>
        Effect.suspend(() => {
          // A request acts on its receiver, which a droppable operation interrupted halfway would leave acted on
          // (decision 0128).
          if (droppable) {
            return Effect.die(
              new InvariantDefect({ reason: `the droppable operation under '${key}' sent to ${program.name} '${id}'` }),
            )
          }
          const to = JSON.stringify([program.name, id, name])
          if (used[kind].has(to)) {
            const verb = kind === 'message' ? 'sent' : 'created'
            return Effect.die(
              new InvariantDefect({ reason: `the operation ${verb} '${name}' to ${program.name} '${id}' twice` }),
            )
          }
          used[kind].add(to)
          return Effect.map(deployedAs(program), (deployed) => ({
            deployed,
            request: { _tag: 'Operation', entity, key, incarnation, name } as const,
          }))
        })
      return Entities.of({
        send: <T extends Types>(program: Program<T>, id: string, message: T['inbound'], name: string) =>
          Effect.flatMap(named('message', program, id, name), ({ deployed, request }) => {
            // `null` is no reply yet: the receiver crashed, or is suspended and has been resumed since.
            const waiting: Waiting = { entity, key, incarnation, name }
            const attempt = Effect.flatMap(awaitResumption({ name: program.name, id }, waiting), ({ resumed, forget }) =>
              Effect.flatMap(
                unlessCrashed(send(deployed, id, message, request), null),
                (reply): Effect.Effect<Reply<T['rejection']> | null> =>
                  reply === null
                    ? Effect.as(Effect.sleep(`${retry} millis`), null)
                    : reply._tag === 'Suspended'
                    ? Effect.as(resumed, null)
                    : Effect.succeed(reply),
              ).pipe(Effect.ensuring(forget)))
            return faulted(Effect.repeat(attempt, { until: (reply) => reply !== null }))
          }),
        create: <T extends Types>(program: Program<T>, id: string, flags: T['flags'], name: string) =>
          Effect.flatMap(named('creation', program, id, name), ({ deployed, request }) => {
            const attempt = Effect.tap(
              unlessCrashed(create(deployed, id, flags, request), null),
              (creation) => creation === null ? Effect.sleep(`${retry} millis`) : Effect.void,
            )
            return faulted(Effect.repeat(attempt, { until: (creation) => creation !== null }))
          }),
      })
    }

    /**
     * The timers of the entities this process does not hold (decision 0029). It reads the earliest time one is
     * due, and activates the entities whose time has come: arming a timer already due fires it. Then it sleeps
     * until the next, or until an entity is unloaded and brings an earlier one. An activation that fails crashes
     * its entity alone, which is tried again after `retry`, as a receiver that crashed is sent to again
     * (decisions 0046, 0077).
     */
    const waking = <T extends Types>(deployed: Deployment<T>) => {
      const { waker } = deployed
      // One reading per round, and `forever` begins the next: a round that waited for itself would leave a frame
      // behind at every timer the process ever wakes for.
      return Effect.forever(Effect.gen(function*() {
        const now = DateTime.toEpochMillis(yield* DateTime.now)
        let next = Infinity
        for (const [id, at] of waker.failed) {
          if (at <= now) waker.failed.delete(id)
          else next = Math.min(next, at)
        }
        const due = yield* deployed.storage.due(now, [...deployed.loaded.keys(), ...waker.failed.keys()])
        next = Math.min(next, due.next ?? Infinity)
        waker.next = next === Infinity ? null : next
        // The entities just activated are this process's, and the reading of the next round leaves them out, as
        // it leaves out the ones that failed until their time.
        if (due.ready.length > 0) {
          for (const id of due.ready) {
            yield* loads(deployed, id).pipe(Effect.catchCause((cause) =>
              Cause.hasInterruptsOnly(cause) ? Effect.failCause(cause) : Effect.sync(() => {
                waker.failed.set(id, now + retry)
              })
            ))
          }
          return
        }
        // Whether the reading stands: an entity unloaded while it was made has poked, and it is made again.
        // Taking the poke and clearing the flag are each one step, so no reading is lost and none is stale.
        const rests = yield* Effect.sync(() => {
          if (Queue.sizeUnsafe(waker.poke) > 0) return false
          waker.busy = false
          end()
          return true
        })
        if (!rests) return yield* Queue.take(waker.poke)
        yield* next === Infinity
          ? Queue.take(waker.poke)
          : Effect.raceFirst(Queue.take(waker.poke), Effect.sleep(`${Math.max(0, next - now)} millis`))
        waker.busy = true
      }))
    }

    const deploy = <T extends Types>(program: Program<T>) =>
      Effect.gen(function*() {
        // A program that cannot run as written is refused before anything is stored or run (decision 0054).
        yield* Effect.sync(() => checkProgram(program))
        const services = yield* Effect.context<Exclude<T['services'], Entities>>()
        // A name is deployed once in a process: a new version is a new process (decision 0075). It is claimed in
        // the step that checks it, so that two deploys at once cannot both pass. A deploy that fails before it is
        // registered, interrupted included, stops what it started and gives the name back; one interrupted after
        // keeps both, with its deployment (decisions 0078, 0102). The claim, the deployment's scope and what undoes
        // them are made in one step, so that no interruption falls between them.
        return yield* Effect.uninterruptibleMask((restore) =>
          Effect.gen(function*() {
            if (names.has(program.name)) {
              return yield* Effect.die(new InvariantDefect({ reason: `the program '${program.name}' is deployed already` }))
            }
            names.add(program.name)
            const deployed: Deployment<T> = {
              program,
              storage: storage(program, sql),
              scope: yield* Scope.fork(running),
              loaded: new Map(),
              // Nothing is known of the stored timers until the waker has read them once.
              waker: { busy: true, next: null, poke: yield* Queue.sliding<void>(1), failed: new Map() },
              waking: null,
              run: (operation) => Effect.provideContext(operation, services) as Effect.Effect<void>,
            }
            return yield* Effect.onError(restore(deploying(deployed)), () =>
              deployments.has(program.name) ? Effect.void : Effect.andThen(
                Scope.close(deployed.scope, Exit.void),
                Effect.sync(() => {
                  deployed.loaded.forEach(forgetUse)
                  names.delete(program.name)
                }),
              ))
          })
        )
      })

    const deploying = <T extends Types>(deployed: Deployment<T>) =>
      Effect.gen(function*() {
        const { program } = deployed
        // An operation a crash interrupted starts again here, and a message it left in a mailbox is handled
        // (decision 0071); a timer waits for its time, loaded or not. A deploy that cannot finish stops what it
        // started, and is never seen: an operation that reaches its program waits for one that finishes
        // (decisions 0045, 0051). What it loaded leaves the process with it, and holds no place under the capacity
        // (decision 0076).
        yield* deployed.storage.indexed
        for (const id of yield* deployed.storage.interrupted) yield* loads(deployed, id)
        // Registered with its waker in one step: a deployment others can reach always has its timers woken. The
        // waker is not forked uninterruptible with the step, so the scope that closes it stops it (decisions 0078,
        // 0112).
        yield* Effect.uninterruptible(Effect.gen(function*() {
          deployments.set(program.name, deployed as unknown as Deployment<never>)
          const awaited = undeployed.get(program.name)
          undeployed.delete(program.name)
          if (awaited !== undefined) Deferred.doneUnsafe(awaited, Effect.void)
          deployed.waking = yield* Effect.forkIn(waking(deployed), deployed.scope, { uninterruptible: false })
        }))
        const handle: Handle<T> = {
          create: (id, flags, request) =>
            admitted(faulted(
              create(deployed, id, flags, { _tag: 'Caller', sender: request.sender, id: request.requestId }),
            )),
          send: (id, message, request) =>
            counted(
              { keep: request.keep?.millis },
              admitted(faulted(
                send(
                  deployed,
                  id,
                  message,
                  { _tag: 'Caller', sender: request.sender, id: request.requestId },
                  request.keep?.millis,
                ),
              )),
            ),
          read: (id) => deployed.storage.projected(id),
          query: (query) => counted({ limit: query.limit }, deployed.storage.query(query)),
          reindex: deployed.storage.reindex,
          published: (after, limit) => counted({ cursor: after, limit }, deployed.storage.published(after, limit)),
          feed: (consumer, limit) => counted({ limit }, deployed.storage.feed(consumer, limit)),
          ack: (consumer, through) => counted({ cursor: through }, deployed.storage.ack(consumer, through)),
          prune: deployed.storage.prune,
          consumers: deployed.storage.consumers,
          forget: (consumer) => deployed.storage.forget(consumer),
          expire: Effect.flatMap(DateTime.now, (now) => deployed.storage.expire(DateTime.toEpochMillis(now))),
          suspended: Effect.map(deployed.storage.suspended, (listed) =>
            listed.map((suspension): Suspended => ({
              ...suspension,
              waiting: waitingFor({ name: program.name, id: suspension.id }),
            }))),
          resume: (id) => admitted(operate(deployed, id, { _tag: 'Resume' })),
          discard: (id) => admitted(operate(deployed, id, { _tag: 'Discard' })),
        }
        return handle
      })

    const quiet = (now: number) => {
      if (detachments > 0 || leaving > 0) return false
      for (const deployed of deployments.values()) {
        const { waker } = deployed
        // The waker has a reading to make, so nothing is known of the stored timers.
        if (waker.busy) return false
        // A timer of an unloaded entity whose time has come is work the process has not activated yet.
        if (waker.next !== null && waker.next <= now) return false
        for (const loaded of deployed.loaded.values()) {
          const { stored } = loaded.machine
          if (loaded.applying || loaded.pending > 0 || loaded.operations.size > 0) return false
          if (stored.suspension === null && stored.mailbox.length > 0) return false
          // An entity told to leave has not left yet (decision 0076).
          if (loaded.evicted) return false
        }
      }
      return true
    }

    // The signal is taken before the look: whatever ends after it completes it, and `settled` looks again.
    const settled: Effect.Effect<void> = Effect.suspend(() => {
      const next = ended
      return Effect.flatMap(DateTime.now, (now) =>
        quiet(DateTime.toEpochMillis(now))
          ? Effect.void
          : Effect.flatMap(Deferred.await(next), () => settled))
    })

    /**
     * Whether a planned stop has nothing left to wait for: no operation runs, no event waits or is applied, and
     * nothing runs detached from a caller, such as a creation committed whose work has not started. The operations
     * still running are at most once, since the drain stopped the others. A completion recorded in a mailbox is
     * committed, and is handled at the next activation (decision 0119).
     */
    const drained = () => {
      if (detachments > 0) return false
      for (const deployed of deployments.values()) {
        for (const loaded of deployed.loaded.values()) {
          if (loaded.applying || loaded.pending > 0 || loaded.operations.size > 0) return false
        }
      }
      return true
    }

    // The signal is taken before the look, as `settled` takes it: whatever ends after it completes it.
    const emptied: Effect.Effect<void> = Effect.suspend(() => {
      const next = ended
      return drained() ? Effect.void : Effect.flatMap(Deferred.await(next), () => emptied)
    })

    // A planned stop, added after `running` and so run before it closes (decision 0119). Its wait is made
    // interruptible, so that the timeout ends it even if a finalizer runs uninterruptibly.
    if (drain !== undefined) {
      yield* Scope.addFinalizer(scope, Effect.gen(function*() {
        draining = true
        for (const deployed of [...deployments.values()]) {
          if (deployed.waking !== null) yield* Fiber.interrupt(deployed.waking)
          for (const loaded of [...deployed.loaded.values()]) {
            for (const id of [...loaded.timers.keys()]) yield* stop(loaded.timers, id)
            for (const id of [...loaded.rerun]) yield* stop(loaded.operations, id)
          }
        }
        yield* Effect.interruptible(Effect.timeoutOption(emptied, `${drain} millis`))
        Deferred.doneUnsafe(stopped, Effect.interrupt)
      }))
    }

    return { deploy, settled }
  })
