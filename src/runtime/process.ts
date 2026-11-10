/**
 * What the runtime of one process holds while it runs, which its modules share: the deployments, the callers waiting,
 * each entity's lock, and the counts `settled` waits for. `launchWith`, in [`runtime.ts`](../runtime.ts), makes one
 * `Process` for each launch, and each function of the runtime's modules that reads or changes it is given it first.
 */
import * as Context from 'effect/Context'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import type * as Fiber from 'effect/Fiber'
import * as Metric from 'effect/Metric'
import type * as MutableList from 'effect/MutableList'
import * as Option from 'effect/Option'
import type * as Queue from 'effect/Queue'
import type * as Scope from 'effect/Scope'
import * as Semaphore from 'effect/Semaphore'
import type { SqlClient } from 'effect/sql'
import type * as Tracer from 'effect/Tracer'
import * as Machine from '../machine.ts'
import type { Address, Creation, Entities, Key, Program, Types } from '../program.ts'
import type { Readings } from './readings.ts'
import type { Answer, OnCluster, Operated, Point, Said, Waiting } from '../runtime.ts'
import type { Storage } from '../storage.ts'

/** What the runtime of one process holds while it runs, made once by `launchWith` and read by the runtime's modules. */
export interface Process {
  readonly sql: SqlClient.SqlClient
  /** The runner of Effect Cluster this runtime runs on, or null for a runtime of one process. */
  readonly cluster: OnCluster | null
  /** The programs the launch renames, from each old name to its new one (decision 0176). */
  readonly renames: ReadonlyMap<string, string>
  /**
   * Where everything the runtime runs is forked. It closes after the drain: a scope runs its finalizers in the
   * reverse order of their adding, so the drain, added after it, runs first (decision 0119).
   */
  readonly running: Scope.Closeable
  /**
   * Completed once the runtime stops, after the drain and before `running` closes: a `fetch` that waits is then
   * given no row, and reads nothing from a database about to be let go (decision 0142).
   */
  readonly closing: Deferred.Deferred<void>
  readonly deployments: Map<string, Deployment<never>>
  /** The effects running detached from their callers, which `settled` waits for (decision 0079). */
  detachments: number
  /**
   * The entities unloading: left the process, and their timers not all stopped yet, nor the probe told. `settled`
   * waits for them too (decision 0109).
   */
  leaving: number
  /**
   * The callers waiting for a reply, by entity and then by request: a retry of a queued message waits with the
   * first, and a crash of the entity reaches every caller of it (decision 0042). A creation's callers wait apart
   * from a message's, since the two share request ids (decisions 0017, 0050).
   */
  readonly messages: Callers<Answer<unknown>>
  readonly creations: Callers<Creation>
  /**
   * The operators waiting for what their `Resume` or `Discard` did, by entity, in the order their events were
   * offered. Each event answers the first, so that an operator is told what its own event did, not what another
   * operator's event applied before it did. One who gave up stays in the line, so that the next event still
   * answers the operator who offered it (decision 0114).
   */
  readonly operators: Map<string, MutableList.MutableList<Deferred.Deferred<Operated>>>
  /**
   * What `settled` waits for. It is completed, and replaced, whenever something under way ends: a step, an
   * operation, a reading of the waker, an entity leaving the process. That is when the process may have become
   * settled. `settled` takes it before it looks, so that no ending between its look and its wait is missed
   * (decision 0063).
   */
  ended: Deferred.Deferred<void>
  /** The operations waiting for a program not deployed yet, by its name: its deploy wakes them (decision 0045). */
  readonly undeployed: Map<string, Deferred.Deferred<void>>
  /** The readings of the log that wait for a commit in their topic (decision 0142). */
  readonly readings: Readings
  /**
   * The senders waiting for an entity's resumption, by entity. Each registers before it sends, so that a
   * resumption between its being answered `Suspended` and its waiting is not missed (decisions 0023, 0063).
   */
  readonly resumptions: Map<string, Map<Deferred.Deferred<void>, Waiting>>
  /**
   * Each entity's lock, by entity, while someone holds or waits for it (decision 0067). What finds, loads,
   * creates, unloads or crashes an entity holds it. So no caller is between finding the entity and offering its
   * event when it leaves the process, and two callers never build two machines for it (decisions 0029, 0042).
   */
  // Counted by hand: `RcMap` counts its users the same way, but forks a fiber for each lock it makes, so a caller
  // that finds no lock would wait for that fiber before it holds one.
  readonly locks: Map<string, { readonly semaphore: Semaphore.Semaphore; users: number }>
  /**
   * Every entity this process holds, of every program, from the least recently used: an entity is used when it is
   * loaded and when an event is offered to it. It is what a process over its capacity unloads first (decision 0076).
   * Written by hand: `Cache` and `ScopedCache` evict the oldest entry whatever it is doing, and `ScopedCache` waits
   * for the evicted from the fiber that enters; `RcMap` refuses a new key past its capacity (decision 0151).
   */
  readonly recent: Map<string, Loaded<never>>
  /** The probe, read once at launch (decision 0073). */
  readonly probe: (said: Said) => Effect.Effect<void>
  /** The options of the launch, with their defaults: `Options` says what each does. */
  readonly retry: number
  readonly passivate: number
  readonly capacity: number | 'unbounded'
  readonly threshold: number
  readonly bound: number
  /** A planned stop is under way: the scope closes, and the drain waits (decision 0119). */
  draining: boolean
}

/**
 * `effect` without the transaction of the fiber that forks it, which every fork of the runtime is given
 * (decision 0164). A fork keeps the services of the forking fiber, and on Cluster a step forks inside its
 * transaction (decision 0161). A fiber that kept the transaction would run its statements on the step's connection
 * without the client's lock, and a transaction of its own would be a savepoint there, which SQLite begins as a
 * transaction while another fiber holds the lock.
 */
export const untransacted = <A, E>(sql: SqlClient.SqlClient, effect: Effect.Effect<A, E>) =>
  Effect.updateContext(effect, (services: Context.Context<never>) => Context.omit(sql.transactionService)(services))

/** What a `Resume` or a `Discard` did, read off the machine before and after it (decision 0114). */
export const operated = <T extends Types>(
  event: 'Resume' | 'Discard',
  before: Machine.Machine<T>,
  after: Machine.Machine<T>,
): Operated => {
  if (before.stored.suspension === null) return { _tag: 'NotSuspended' }
  if (after.stored.suspension === null) return { _tag: event === 'Resume' ? 'Resumed' : 'Discarded' }
  if (after === before) return { _tag: 'NotDiscarded' }
  return { _tag: 'StillSuspended', cause: Machine.render(after.stored.suspension.cause) }
}

/**
 * The span of one step: `tea.step`, a root span named by its entity and its event, linked to the span its event came
 * with where the runtime holds one (decision 0220). A root span, since an entity's loop is forked by the caller that
 * loaded it, and a step under that caller's span would be a child of a request answered long before.
 */
export const traced = (
  entity: Address,
  event: Readonly<{ _tag: string }> & Partial<Readonly<{ key: Key; incarnation: number }>>,
  link: Tracer.AnySpan | undefined,
) =>
<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> =>
  Effect.withSpan(effect, 'tea.step', {
    root: true,
    captureStackTrace: false,
    links: link === undefined ? [] : [{ span: link, attributes: {} }],
    attributes: {
      'tea.entity.name': entity.name,
      'tea.entity.id': entity.id,
      'tea.event': event._tag,
      ...(event.key === undefined
        ? {}
        : { 'tea.key': Machine.shownKey(event.key), 'tea.incarnation': event.incarnation }),
    },
  })

/** The span the fiber runs in, if any: a step's, which an operation it starts links (decision 0220). */
export const spanHere: Effect.Effect<Tracer.AnySpan | undefined> = Effect.map(
  Effect.option(Effect.currentSpan),
  Option.getOrUndefined,
)

const suspensions = Metric.counter('tea.suspensions', {
  description: 'The steps that suspended an entity, by program',
  incremental: true,
})

const mailboxes = Metric.histogram('tea.mailbox.length', {
  description: 'The messages a step that writes left in its entity\'s mailbox, by program',
  boundaries: [0, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000],
})

const operationsRunning = Metric.gauge('tea.operations.running', {
  description: 'The operations running in this process, by program',
})

/**
 * What a step tells the tracer once the machine has stepped: on its span, the outputs it set going, and the
 * suspension it made. It gives the metrics of the step, the length of the mailbox it wrote and the suspension, to
 * record once the step is known to be committed, so that a step rolled back counts nothing (decision 0220).
 */
export const told = <T extends Types>(
  entity: Address,
  before: Machine.Machine<T>,
  after: Machine.Machine<T>,
  outputs: ReadonlyArray<Machine.Output<T>>,
  written: boolean,
): Effect.Effect<Effect.Effect<void>> =>
  Effect.gen(function*() {
    const program = { 'tea.entity.name': entity.name }
    yield* Effect.annotateCurrentSpan({ 'tea.written': written, 'tea.outputs': outputs.map((output) => output._tag) })
    const suspension = before.stored.suspension === null ? after.stored.suspension : null
    if (suspension !== null) {
      yield* Effect.annotateCurrentSpan({ 'tea.suspended': true, 'tea.suspension.on': suspension.on._tag })
    }
    return Effect.andThen(
      written ? Metric.update(Metric.withAttributes(mailboxes, program), after.stored.mailbox.length) : Effect.void,
      suspension !== null ? Metric.update(Metric.withAttributes(suspensions, program), 1) : Effect.void,
    )
  })

/**
 * The longest a timer's sleep runs before the runtime reads the wall clock again: an hour, the waker's and a loaded
 * entity's alike. A host suspended during a sleep delays a timer by this much at most (decision 0221).
 */
export const reread = 60 * 60 * 1000

/** What `Loaded.links` keeps a caller's span under: creations and messages share request ids (decision 0050). */
export const linkKey = (creation: boolean, request: string) => `${creation ? 'creation' : 'message'}:${request}`

/** The count of operations running for `deployed` moves by `by`, and its gauge with it (decision 0220). */
export const running = <T extends Types>(deployed: Deployment<T>, by: 1 | -1) =>
  Effect.suspend(() => {
    deployed.operating += by
    return Metric.update(
      Metric.withAttributes(operationsRunning, { 'tea.entity.name': deployed.program.name }),
      deployed.operating,
    )
  })

/** The callers waiting for a reply of one kind, by entity and then by request. */
export type Callers<A> = Map<string, Map<string, Set<Deferred.Deferred<A>>>>

/**
 * What tells an entity's loop to unload it now, as if its wait had run out: put in its queue of events, so that
 * the loop takes it or an event, and loses neither (decision 0076). It is no event, and is not counted as one.
 */
export type Evict = Readonly<{ _tag: 'Evict' }>

/**
 * What tells an entity's loop that its wait has run out: put in its queue of events by a sleep the loop forks for
 * the wait, so that the take is never raced against a timeout, and loses no event (decision 0116). `wait` is the
 * wait it ends, since one put there just before an event is taken after it. It is no event, and is not counted as
 * one.
 */
export type Passivate = Readonly<{ _tag: 'Passivate'; wait: number }>

/**
 * On Cluster: what tells an entity's loop that a door's step may have committed, so that the loop settles which
 * machine is the stored one, and starts what that machine sets going (decision 0161). Counted as an event.
 */
export type Settle = Readonly<{ _tag: 'Settle' }>

/**
 * On Cluster: the machine a door's step computed, in Cluster's transaction, and not known to be committed yet. `steps`
 * is the count of the entity's row once that transaction commits, and `transitions` are the events it stepped, with
 * what each set going, which are performed once a later step finds the count (decision 0161).
 */
export type Uncommitted<T extends Types> = Readonly<{
  machine: Machine.Machine<T>
  steps: number
  transitions: ReadonlyArray<Stepped<T>>
}>

/** An event a door's step stepped, what it wrote, and what it set going. */
export type Stepped<T extends Types> = Readonly<{
  event: Machine.Event<T>
  written: Machine.Written | null
  outputs: ReadonlyArray<Machine.Output<T>>
  /** The span of the step, which the operations it starts link once performed (decision 0220). */
  span: Tracer.AnySpan | undefined
  /** The metrics of the step, recorded with what it set going, once its commit is known (decision 0220). */
  counted: Effect.Effect<void>
}>

/** An entity loaded in this process: its machine, the events waiting, and what is running for it. */
export interface Loaded<T extends Types> {
  machine: Machine.Machine<T>
  applying: boolean
  readonly events: Queue.Queue<Machine.Offered<T> | Evict | Passivate | Settle>
  /**
   * On Cluster: how many steps had written the stored row when `machine` was stepped, and the machine of a door's
   * step not known to be committed yet (decision 0161). Off Cluster, `uncommitted` stays null.
   */
  steps: number
  uncommitted: Uncommitted<T> | null
  /** Told to leave the process, and not taken that yet: until its loop does, the process is not settled. */
  evicted: boolean
  /** How many times the loop has waited for an event: the number of the wait under way. */
  waits: number
  /**
   * The events offered and not yet applied: counted as each is offered, and until its step is done, so that an
   * event taken off the queue and not yet applied is still under way (decision 0063).
   */
  pending: number
  /** By `under`: a timer's sleep is not work the runtime waits for. */
  readonly operations: Map<string, Fiber.Fiber<void>>
  /**
   * The operations among `operations` that run again at the next activation, idempotent and at least once: a
   * planned stop interrupts them at once (decision 0119).
   */
  readonly rerun: Set<string>
  readonly timers: Map<string, Fiber.Fiber<void>>
  /** Whether this activation has warned of a large step: an entity warns once per activation (decision 0135). */
  warned: boolean
  /**
   * A permit for each message of `send` offered and not yet applied: one is taken with the offer, or the caller is
   * answered `Full`, and given back as the message's step ends (decision 0147).
   */
  readonly callers: Semaphore.Semaphore
  /** Whether this activation has warned that it is full, once per activation as of a large step (decision 0147). */
  refused: boolean
  /**
   * The span of each caller on one process, by its request, which the step of its request links: kept from its offer
   * until a step replies to it (decision 0220).
   */
  readonly links: Map<string, Tracer.AnySpan>
}

/**
 * What wakes the entities this process does not hold: a fiber reads the earliest time a stored timer is due,
 * sleeps until then, and activates what the time has come for (decision 0029).
 */
export interface Waker {
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

export interface Deployment<T extends Types> {
  readonly program: Program<T>
  /** The consumers the deploy declares, by topic (decision 0152). */
  readonly consumers: ReadonlyMap<string, ReadonlySet<string>>
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
  /** How many operations of the deployment run in this process: what `tea.operations.running` reads (decision 0220). */
  operating: number
  /**
   * On Cluster, by shard: `held` while the shard's singleton runs, and `lost` once it is interrupted, until it starts
   * again (decision 0162). Off Cluster, empty.
   */
  readonly shards: Map<number, 'held' | 'lost'>
  /** The services the program was deployed with, which its operations run in. */
  readonly run: (operation: Effect.Effect<void, never, T['services'] | Entities>) => Effect.Effect<void>
}

/** The run of the work under `key` in `incarnation`, as the fibers of a loaded entity are kept by it. */
export const under = (key: Key, incarnation: number) => `${Machine.keyText(key)}@${incarnation}`

export const addressOf = (entity: Address) => JSON.stringify([entity.name, entity.id])
export const end = (p: Process) => {
  const was = p.ended
  p.ended = Deferred.makeUnsafe<void>()
  Deferred.doneUnsafe(was, Effect.void)
}
export const holding = (p: Process, entity: Address) =>
<A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => {
  const address = addressOf(entity)
  return Effect.acquireUseRelease(
    Effect.sync(() => {
      const lock = p.locks.get(address) ?? { semaphore: Semaphore.makeUnsafe(1), users: 0 }
      lock.users += 1
      p.locks.set(address, lock)
      return lock
    }),
    (lock) => lock.semaphore.withPermits(1)(effect),
    (lock) =>
      Effect.sync(() => {
        lock.users -= 1
        // Dropped by its last user only: one dropped while others wait would let a new taker hold it beside
        // them. `callers of an unloaded entity build one machine for it`, in the tests, reaches it (decision 0104).
        if (lock.users === 0) p.locks.delete(address)
      }),
  )
}
// The one cast of an event: a probe is told of the events of every program, and steps none of them.
export const at = <T extends Types>(p: Process, point: Point, entity: Address, event: Machine.Event<T>) =>
  p.probe({ _tag: 'Reached', point, entity, event: event as Machine.Event<never> })
export const observe = <T extends Types>(p: Process, entity: Address, event: Machine.Event<T>) =>
  p.probe({ _tag: 'Applied', entity, event: event as Machine.Event<never> })
// The one cast of a loaded entity: the process orders the entities of every program, and steps none of them.
export const erased = <T extends Types>(loaded: Loaded<T>) => loaded as unknown as Loaded<never>
/** The entity leaves the order of use, if it is the one held there. */
export const forgetUse = <T extends Types>(p: Process, loaded: Loaded<T>) => {
  const address = addressOf(loaded.machine.stored)
  if (p.recent.get(address) === erased(loaded)) p.recent.delete(address)
}

export const deployment = <T extends Types>(p: Process, name: string): Deployment<T> | undefined =>
  p.deployments.get(name) as Deployment<T> | undefined
