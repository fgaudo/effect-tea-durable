/**
 * The runtime on one process, over `SqlClient`: it drives the machine ([`machine.ts`](machine.ts)) and acts on its
 * outputs (decision 0013). An event is one transaction (decision 0007): what the machine says it writes is
 * written (decision 0057), and only then are the callers answered and the work started, so a crash before the
 * commit leaves nothing of the event, and one after it is an activation away from the work the state holds.
 *
 * What is stored lives in the database ([`storage.ts`](storage.ts)); what is running — the operations' fibers, the
 * timers' sleeps, the entities loaded — lives in this process's scope, and a crash is that scope closing. An
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
  storage,
  type Storage,
} from './storage.ts'

/**
 * What a caller is answered: the replies stored under its request id, `NotFound` for no entity, and `Suspended`,
 * which says that the request has no reply yet (decision 0023).
 */
export type Answer<Reason> = Reply<Reason> | Readonly<{ _tag: 'Suspended' }>

/** The callers waiting for a reply of one kind, by entity and then by request. */
type Waiting<A> = Map<string, Map<string, Set<Deferred.Deferred<A>>>>

/** A point of the design's crash table, where a test dies to see what survives. */
export type Point =
  /** The event's `Stored` is computed, and not yet written. */
  | 'BeforeCommit'
  /** Written, and nothing acted on yet: no caller answered, no work started, no message handled. */
  | 'AfterCommit'
  /** The callers of the event are answered, and its work is not started. */
  | 'AfterReply'

/**
 * What the runtime says it did: a point of the crash table it reached with an event, an event it applied — in the
 * order they were applied, once written — and an entity it unloaded, once its timers have stopped.
 */
export type Said =
  | Readonly<{ _tag: 'Reached'; point: Point; entity: Address; event: Machine.Event<never> }>
  | Readonly<{ _tag: 'Applied'; entity: Address; event: Machine.Event<never> }>
  | Readonly<{ _tag: 'Unloaded'; entity: Address }>

/**
 * Told what the runtime did, and waited for before it goes on: a test replays the events in the machine, counts
 * the passivations, or never returns at a point of the crash table, to crash the process there. The default does
 * nothing, as Effect's tracer does; a test provides another around `launch`, which reads it once. It is no
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
}

/** What a caller does with one program's entities. */
export interface Handle<T extends Types> {
  /** Creates the entity `id`. A retry of the request that created it is answered `Created` (decision 0017). */
  readonly create: (
    id: string,
    flags: T['flags'],
    request: Readonly<{ requestId: string; sender: T['sender'] }>,
  ) => Effect.Effect<Creation>
  /** Sends an inbound message, and waits for the reply. */
  readonly send: (
    id: string,
    message: T['inbound'],
    request: Readonly<{ requestId: string; sender: T['sender'] }>,
  ) => Effect.Effect<Answer<T['rejection']>>
  /** What callers read of the entity, or null when there is none. */
  readonly read: (id: string) => Effect.Effect<T['projection'] | null>
  /**
   * What callers read of the entities whose indexes match, across the program: the read model is written in each
   * entity's own transaction, so nothing found here is a projection its entity has moved past (decision 0032).
   */
  readonly query: (query: Query<T>) => Effect.Effect<ReadonlyArray<Found<T>>>
  /**
   * Writes the read model of every entity of the program again, from its stored state, and gives how many: what
   * an index a new version of the program added or changed needs, since a row is written when its entity takes a
   * step. An operator runs it after such a deploy (decision 0032). An entity that takes a step while it runs keeps
   * the row its step wrote (decision 0070).
   */
  readonly reindex: Effect.Effect<number>
  /**
   * What the entities of the program did, from the `seq` of `after` on, in the order the steps committed: each
   * row is the message an entity handled and what callers read of it afterwards, written in that step's
   * transaction (decision 0038). The cursor is the caller's and nothing of it is stored, so a reading here —
   * a test, an operator looking — has no say in a prune: `0` is the whole log. A consumer that keeps a cursor
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
   * Moves a consumer's cursor to `through`, never back, since what is behind it may be gone, and never past the
   * last `seq` written, so that no row written later is behind it. An ack from a consumer that has not read
   * stores its cursor too (decision 0039). A cursor and a limit are non-negative integers, here and in `query`,
   * `published` and `feed`, and anything else is the caller's defect (decision 0053).
   */
  readonly ack: (consumer: string, through: number) => Effect.Effect<void>
  /**
   * Drops what every consumer has read — through the lowest stored cursor — and gives how many rows went. Where
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
   * An operator resumes a suspended entity (decision 0006), with the program deployed: a fixed program is a deploy
   * of it, which the resume follows (decision 0064).
   */
  readonly resume: (id: string) => Effect.Effect<void>
  /**
   * An operator discards the inbound message a suspended entity died on (decision 0014). An internal one is not
   * discarded, and the entity stays suspended (decisions 0041, 0044).
   */
  readonly discard: (id: string) => Effect.Effect<void>
}

export interface Runtime {
  /**
   * Runs a program's entities in this process. The operations' services are taken from here, and their fibers run
   * in the runtime's scope: a program is deployed where its services are. `Entities` is the runtime's own, filled
   * in with the entity each operation runs for, so a program that only talks to other entities needs nothing.
   * A program that cannot run as written dies here, before anything is stored or run (decision 0054), and so does
   * one whose name this process has deployed already: a new version is deployed by a new process (decision 0075).
   */
  readonly deploy: <T extends Types>(
    program: Program<T>,
  ) => Effect.Effect<Handle<T>, never, Exclude<T['services'], Entities>>
  /**
   * Waits until nothing is under way: no event waits, no mailbox holds a message, no operation runs, no entity
   * told to leave is still held (decision 0076), and no stored timer of an entity this process has unloaded is due
   * (decision 0029).
   */
  readonly settled: Effect.Effect<void>
}

/**
 * What tells an entity's loop to unload it now, as if its wait had run out: put in its queue of events, so that
 * the loop takes it or an event, and loses neither (decision 0076). It is no event, and is not counted as one.
 */
type Evict = Readonly<{ _tag: 'Evict' }>

/** An entity loaded in this process: its machine, the events waiting, and what is running for it. */
interface Loaded<T extends Types> {
  machine: Machine.Machine<T>
  applying: boolean
  readonly events: Queue.Queue<Machine.Offered<T> | Evict>
  /** Told to leave the process, and not taken that yet: until its loop does, the process is not settled. */
  evicted: boolean
  /**
   * The events offered and not yet applied: counted as each is offered, and until its step is done, so that an
   * event taken off the queue and not yet applied is still under way (decision 0063).
   */
  pending: number
  /** By `${key}@${incarnation}`: a timer's sleep is not work the runtime waits for. */
  readonly operations: Map<string, Fiber.Fiber<void>>
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
    const scope = yield* Effect.scope
    // One runtime holds the database, before anything of this one runs, and lets it go after everything of it has
    // stopped: the scope ends what it was given last first (decision 0080).
    yield* hold
    const deployments = new Map<string, Deployment<never>>()
    /** The names deployed in this process, or being deployed: each is deployed once (decision 0075). */
    const names = new Set<string>()
    /** The effects running detached from their callers, which `settled` waits for (decision 0079). */
    let detachments = 0
    /**
     * The callers waiting for a reply, by entity and then by request: a retry of a queued message waits with the
     * first, and a crash of the entity reaches every caller of it (decision 0042). A creation's callers wait apart
     * from a message's, since the two share request ids (decisions 0017, 0050).
     */
    const messages: Waiting<Answer<unknown>> = new Map()
    const creations: Waiting<Creation> = new Map()
    const addressOf = (entity: Address) => JSON.stringify([entity.name, entity.id])
    /**
     * What `settled` waits for: it is completed, and replaced, whenever something under way ends — a step, an
     * operation, a reading of the waker, an entity leaving the process — which is when the process may have become
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
     * The senders waiting for an entity's resumption, by entity: each registers before it sends, so that a
     * resumption between its being answered `Suspended` and its waiting is not missed (decisions 0010, 0063).
     */
    const resumptions = new Map<string, Set<Deferred.Deferred<void>>>()
    /**
     * Each entity's lock, by entity, while someone holds or waits for it (decision 0067): what finds, loads, creates,
     * unloads or crashes an entity holds it, so that no caller is between finding the entity and offering its event
     * when it leaves the process, and two callers never build two machines for it (decisions 0029, 0042).
     */
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
            // them. No test reaches that interleaving, as the review of 0061 to 0075 says.
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

    const answer = <A>(waiting: Waiting<A>, entity: Address, request: string, reply: A) =>
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
      waiting: Waiting<A>,
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
     * spare entities are told to leave, as many as it holds too many, the one entering aside: their loops unload
     * them, each under its own lock, so nothing here waits for another entity's lock while this one's is held
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
      for (const sender of senders) Deferred.doneUnsafe(sender, Effect.void)
    }

    /**
     * Registers a sender's wait for the entity's resumption, before it sends: `resumed` is what it waits on if it is
     * answered `Suspended`, and `forget` takes it back whatever it is answered. No test reaches a resumption between
     * the answer and a registration made after it, which would wait for ever: only this order keeps it from it, as
     * the review of 0061 to 0075 says.
     */
    const awaitResumption = (entity: Address) =>
      Effect.sync(() => {
        const address = addressOf(entity)
        const sender = Deferred.makeUnsafe<void>()
        const senders = resumptions.get(address) ?? new Set<Deferred.Deferred<void>>()
        senders.add(sender)
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

    const stopAll = <T extends Types>(loaded: Loaded<T>) =>
      Effect.gen(function*() {
        for (const id of [...loaded.operations.keys()]) yield* stop(loaded.operations, id)
        for (const id of [...loaded.timers.keys()]) yield* stop(loaded.timers, id)
      })

    /**
     * Forks `effect` in `scope`, held under `id` while it runs. The forking fiber may yield between the fork and the
     * registration, and the fiber end meanwhile: one that has ended is never held, and its end is told after it has
     * left `held`, in one step, so nothing ended is counted as running (decision 0068).
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
          runner.delivery === 'Idempotent' ? runner.run(operation, idempotencyKey) : runner.run(operation)
        )
        yield* forkHeld(
          loaded.operations,
          under(key, incarnation),
          deployed.scope,
          deployed.run(
            Effect.gen(function*() {
              const exit = yield* Effect.exit(run)
              if (exit._tag === 'Success') {
                yield* offer(loaded, { _tag: 'Complete', key, incarnation, message: exit.value })
              } else if (!Cause.hasInterruptsOnly(exit.cause)) {
                yield* offer(loaded, { _tag: 'Die', key, incarnation, cause: Cause.squash(exit.cause) })
              }
            }).pipe(
              // The requests it sends are this run's: an entity cannot pass for another, nor an operation for
              // another (decisions 0009, 0060).
              Effect.provideService(Entities, entities(entity, key, incarnation)),
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
              break
            case 'Suspended':
              // Everything under way stops, and what it would deliver is dropped (decision 0006).
              yield* stopAll(loaded)
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
        const event: Machine.Event<T> = offered._tag === 'Receive'
          ? { ...offered, reply: yield* deployed.storage.reply(entity.id, offered.request), at: yield* DateTime.now }
          : offered
        const before = loaded.machine
        const transition = Machine.step(deployed.program, before, event)
        const { written } = transition
        if (written !== null) {
          yield* at('BeforeCommit', entity, event)
          // What the event writes is the machine's, encoded: the storage decides nothing (decision 0057).
          yield* sql.withTransaction(deployed.storage.write(entity.id, written)).pipe(Effect.orDie)
        }
        loaded.machine = transition.machine
        if (before.stored.suspension !== null && transition.machine.stored.suspension === null) {
          wake(entity)
        }
        // An event is observed once it is written — at once when it writes nothing — and before anything is
        // acted on: a crash before the commit leaves no event, and one after it an event that happened.
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
      // A suspended entity runs nothing and comes back suspended, with the message it died on (decision 0006).
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
     * The entity leaves this process, and the waker is told in the same step (decision 0068): a reading of the
     * stored timers that left the entity out as held is made again, and one made after counts its timers, so there
     * is no moment at which they are neither armed here nor counted among the stored ones. The waker's flag and its
     * poke are set together, and the waker clears them in one step too, so the process is never settled with a
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
        yield* leave(deployed, loaded)
        // A timer that fires between here and its interruption delivers nothing, and the stored time stands.
        yield* stopAll(loaded)
        yield* probe({ _tag: 'Unloaded', entity: { name: deployed.program.name, id } })
        return true
      }))

    /**
     * An event the runtime could not finish — a write that failed, a probe that died — is a crash of its entity
     * alone: the entity leaves this process, its work stops, and its waiting callers are given the defect, to
     * retry. What is stored is what its next activation starts from, as after a crash of the process. Called
     * where the entity's lock is held, so that no caller is between finding the entity and offering its event
     * (decisions 0042, 0067); the interruption of its work is forked, since it waits for the operations'
     * finalizers, and nothing else waits for them under the lock (decision 0056).
     */
    const crash = <T extends Types>(deployed: Deployment<T>, loaded: Loaded<T>, cause: Cause.Cause<never>) =>
      Effect.gen(function*() {
        const { name, id } = loaded.machine.stored
        // Its stored timers are the waker's again.
        yield* leave(deployed, loaded)
        yield* Effect.forkIn(stopAll(loaded), deployed.scope)
        const address = addressOf({ name, id })
        const fail = <A>(waiting: Waiting<A>) =>
          Effect.gen(function*() {
            const requests = waiting.get(address)
            waiting.delete(address)
            for (const callers of requests?.values() ?? []) {
              for (const caller of callers) yield* Deferred.failCause(caller, cause)
            }
          })
        yield* fail(messages)
        yield* fail(creations)
      })

    /**
     * The entity's loop: while its mailbox holds a message, it is handled, one transaction each; otherwise the
     * loop waits for an event, and the entity is unloaded if none comes for long enough, or once it is told to
     * leave a process over its capacity (decision 0076). A suspended entity only waits (decision 0006). The wait
     * times out, never the take: an event taken is always applied. A loop that dies crashes its entity, and an
     * interruption is the process's crash (decision 0042).
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
      const next: Effect.Effect<void> = Effect.suspend(() => {
        const { stored } = loaded.machine
        if (stored.suspension === null && stored.mailbox.length > 0) {
          return DateTime.now.pipe(
            Effect.flatMap((now) => apply(deployed, loaded, { _tag: 'Handle', at: now })),
            Effect.flatMap(() => next),
          )
        }
        return Effect.timeoutOption(Queue.take(loaded.events), `${passivate} millis`).pipe(
          Effect.flatMap((taken) => {
            // The wait ran out, or the entity was told to leave: it is unloaded if it has nothing to do.
            const event = taken._tag === 'Some' ? taken.value : null
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
              () => next,
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
          events: yield* Queue.unbounded<Machine.Offered<T> | Evict>(),
          evicted: false,
          pending: 0,
          operations: new Map(),
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
     * effect sets going — an activation, a creation and its work — is finished all the same: only the process's
     * crash stops it halfway, as the crash table says (decision 0079). It is counted from the step that forks it
     * to its end, so that the process is not settled while it runs: the step is uninterruptible, and the fiber it
     * forks is not, as a fiber never is for the region it is forked from, so the scope still stops it.
     */
    const detached = <T extends Types, A, E>(deployed: Deployment<T>, effect: Effect.Effect<A, E>) =>
      Effect.flatMap(
        Effect.uninterruptible(Effect.suspend(() => {
          detachments += 1
          const counted = Effect.ensuring(
            effect,
            Effect.sync(() => {
              detachments -= 1
              end()
            }),
          )
          return Effect.forkIn(counted, deployed.scope)
        })),
        Fiber.join,
      )

    /**
     * Runs `found` on the entity `id` of `deployed`, loaded from storage when this process does not hold it, and
     * while the entity is held: its lock is what keeps it from being unloaded meanwhile, and what makes a caller
     * of an entity being activated wait for that activation (decisions 0029, 0067). An entity held is found in the
     * caller's fiber; one to load is loaded detached from it, with `found`, under the same hold of its lock, so that
     * the entity is never unloaded between its activation and its caller's event (decision 0079).
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

    const operate = <T extends Types>(deployed: Deployment<T>, id: string, event: Machine.Offered<T>) =>
      withEntity(deployed, id, (loaded) => loaded === null ? Effect.void : offer(loaded, event))

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
          // A defect at creation stores nothing: its creator is answered nothing but the defect itself
          // (decision 0014, and the open question of who may create an entity).
          if (started._tag === 'Defect') return yield* Effect.fail(new Faulted({ defect: started.cause }))
          const loaded: Loaded<T> = {
            machine: started.machine,
            applying: false,
            events: yield* Queue.unbounded<Machine.Offered<T> | Evict>(),
            evicted: false,
            pending: 0,
            operations: new Map(),
            timers: new Map(),
          }
          const creation: Machine.Event<T> = { _tag: 'Create', request }
          yield* at('BeforeCommit', entity, creation)
          yield* sql.withTransaction(deployed.storage.write(id, started.written)).pipe(Effect.orDie)
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
            : ask(messages, loaded, entity, requested, { _tag: 'Receive', request, message }))
        if (asked === null) return { _tag: 'NotFound' }
        return (yield* answered(asked)) as Answer<T['rejection']>
      })

    /**
     * The deployment of `program`, once there is one: an operation that reaches a program not deployed yet waits
     * for it, as for a suspended receiver, so that what runs does not depend on the order of the deploys
     * (decision 0045).
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
     * What one run of an operation sends with: its request is the run's — its entity, key and incarnation — with
     * the name the operation gives it, so that a restarted operation gets the stored replies, and no operation can
     * send under another's (decisions 0009, 0047, 0060). A name the run already used with the same entity would be
     * answered the first one's reply, and is the operation's defect: for a message, and apart for a creation. A
     * suspended receiver has no reply yet, and `send` waits for its resumption instead of giving up (decisions 0010,
     * 0063); a receiver that crashed has none either, and is sent to again after `retry` (decision 0046); `send`
     * and `create` wait for the deploy of a program not deployed yet (decisions 0045, 0063).
     */
    const entities = (entity: Address, key: string, incarnation: number) => {
      const used = { message: new Set<string>(), creation: new Set<string>() }
      /** The request named `name` to the entity `id` of `program`, or the run's defect if it made it already. */
      const named = <T extends Types>(
        kind: keyof typeof used,
        program: Program<T>,
        id: string,
        name: string,
      ): Effect.Effect<Readonly<{ deployed: Deployment<T>; request: Request<T['sender']> }>> =>
        Effect.suspend(() => {
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
            const attempt = Effect.flatMap(awaitResumption({ name: program.name, id }), ({ resumed, forget }) =>
              Effect.flatMap(
                unlessCrashed(send(deployed, id, message, request), null),
                (reply): Effect.Effect<Reply<T['rejection']> | null> =>
                  reply === null
                    ? Effect.as(Effect.sleep(`${retry} millis`), null)
                    : reply._tag === 'Suspended'
                    ? Effect.as(resumed, null)
                    : Effect.succeed(reply),
              ).pipe(Effect.ensuring(forget)))
            const waits = (): Effect.Effect<Reply<T['rejection']>, Faulted> =>
              Effect.flatMap(attempt, (reply) => (reply === null ? waits() : Effect.succeed(reply)))
            return faulted(waits())
          }),
        create: <T extends Types>(program: Program<T>, id: string, flags: T['flags'], name: string) =>
          Effect.flatMap(named('creation', program, id, name), ({ deployed, request }) => {
            const waits = (): Effect.Effect<Creation, Faulted> =>
              Effect.flatMap(
                unlessCrashed(create(deployed, id, flags, request), null),
                (creation) =>
                  creation === null ? Effect.flatMap(Effect.sleep(`${retry} millis`), waits) : Effect.succeed(creation),
              )
            return faulted(waits())
          }),
      })
    }

    /**
     * The timers of the entities this process does not hold: it reads the earliest time one is due, activates the
     * entities whose time has come — arming a timer already due fires it — and sleeps until the next, or until an
     * entity is unloaded and brings an earlier one (decision 0029). An activation that fails crashes its entity
     * alone, which is tried again after `retry`, as a receiver that crashed is sent to again (decisions 0046, 0077).
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
              scope: yield* Scope.fork(scope),
              loaded: new Map(),
              // Nothing is known of the stored timers until the waker has read them once.
              waker: { busy: true, next: null, poke: yield* Queue.sliding<void>(1), failed: new Map() },
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
        // waker is not forked uninterruptible with the step, so the scope that closes it stops it (decision 0078).
        yield* Effect.uninterruptible(Effect.gen(function*() {
          deployments.set(program.name, deployed as unknown as Deployment<never>)
          const awaited = undeployed.get(program.name)
          undeployed.delete(program.name)
          if (awaited !== undefined) Deferred.doneUnsafe(awaited, Effect.void)
          yield* Effect.forkIn(waking(deployed), deployed.scope)
        }))
        const handle: Handle<T> = {
          create: (id, flags, request) =>
            faulted(create(deployed, id, flags, { _tag: 'Caller', sender: request.sender, id: request.requestId })),
          send: (id, message, request) =>
            faulted(send(deployed, id, message, { _tag: 'Caller', sender: request.sender, id: request.requestId })),
          read: (id) =>
            Effect.gen(function*() {
              const held = deployed.loaded.get(id)
              if (held !== undefined) return program.project(held.machine.stored.state)
              const stored = yield* deployed.storage.load(id)
              return stored === null ? null : program.project(stored.state)
            }),
          query: (query) => counted({ limit: query.limit }, deployed.storage.query(query)),
          reindex: deployed.storage.reindex,
          published: (after, limit) => counted({ cursor: after, limit }, deployed.storage.published(after, limit)),
          feed: (consumer, limit) => counted({ limit }, deployed.storage.feed(consumer, limit)),
          ack: (consumer, through) => counted({ cursor: through }, deployed.storage.ack(consumer, through)),
          prune: deployed.storage.prune,
          consumers: deployed.storage.consumers,
          forget: (consumer) => deployed.storage.forget(consumer),
          resume: (id) => operate(deployed, id, { _tag: 'Resume' }),
          discard: (id) => operate(deployed, id, { _tag: 'Discard' }),
        }
        return handle
      })

    const quiet = (now: number) => {
      if (detachments > 0) return false
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

    return { deploy, settled }
  })
