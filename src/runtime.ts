/**
 * The runtime on one process, over `SqlClient`: it drives the machine ([`machine.ts`](machine.ts)) and acts on its
 * outputs (decision 0013). An event is one transaction (decision 0007): the machine's next `Stored` is written,
 * and only then are the caller answered and the work started, so a crash before the commit leaves nothing of the
 * event, and one after it is an activation away from the work the state holds.
 *
 * What is stored lives in the database ([`storage.ts`](storage.ts)); what is running — the operations' fibers, the
 * timers' sleeps, the entities loaded — lives in this process's scope, and a crash is that scope closing. An
 * entity with nothing to do is unloaded, a crash this process chooses, and the stored time of its earliest timer
 * is what wakes it (decision 0029).
 */
import * as Cause from 'effect/Cause'
import * as DateTime from 'effect/DateTime'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Queue from 'effect/Queue'
import * as Scope from 'effect/Scope'
import * as Semaphore from 'effect/Semaphore'
import { SqlClient } from 'effect/sql'
import * as Machine from './machine.ts'
import {
  type Address,
  type Creation,
  encode,
  Entities,
  type IdempotencyKey,
  isTimer,
  type Origin,
  type Program,
  type Reply,
  runnerOf,
  type Types,
} from './program.ts'
import {
  type Consumer,
  type Forgotten,
  type Found,
  type Published,
  type Query,
  storage,
  type Storage,
} from './storage.ts'

/**
 * What a caller is answered: the replies stored under its request id, `NotFound` for no entity, and `Suspended`,
 * which says that the request has no reply yet (decision 0023).
 */
export type Answer<Reason> = Reply<Reason> | Readonly<{ _tag: 'Suspended' }>

/** What the runtime gives a request: a stored reply, the two it answers itself, or a creation's answer. */
type Given = Answer<unknown> | Creation

/** A point of the design's crash table, where a test dies to see what survives. */
export type Point =
  /** The event's `Stored` is computed, and not yet written. */
  | 'BeforeCommit'
  /** Written, and nothing acted on yet: no caller answered, no work started, no message handled. */
  | 'AfterCommit'
  /** The callers of the event are answered, and its work is not started. */
  | 'AfterReply'

export interface Options {
  /**
   * Called at each point of the crash table, before the runtime goes on. A test dies, or never returns, to crash
   * the process there; the default returns at once.
   */
  readonly at?: (point: Point, entity: Address, event: Machine.Event<never>) => Effect.Effect<void>
  /** Called with every event applied, in the order they were applied: a test replays them in the machine. */
  readonly observe?: (entity: Address, event: Machine.Event<never>) => Effect.Effect<void>
  /** Called with every entity unloaded, once its timers have stopped: a test counts passivations. */
  readonly unloaded?: (entity: Address) => Effect.Effect<void>
  /** How long a `send` from another entity waits before retrying a suspended one (decision 0010). */
  readonly retry?: Readonly<{ millis: number }>
  /**
   * How long an entity stays loaded with no event coming for it. The wait starts again at every event, and when
   * it runs out the entity is unloaded, or waits again if it still has something to do (decision 0029).
   */
  readonly passivate?: Readonly<{ millis: number }>
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
   * step. An operator runs it after such a deploy (decision 0032). An entity that takes a step while it runs may
   * have its row written back as it was, and writes it again at its next step.
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
   * stores its cursor too (decision 0039).
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
  /** An operator resumes a suspended entity, perhaps with a fixed program (decision 0006). */
  readonly resume: (id: string, fixed?: Program<T>) => Effect.Effect<void>
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
   */
  readonly deploy: <T extends Types>(
    program: Program<T>,
  ) => Effect.Effect<Handle<T>, never, Exclude<T['services'], Entities>>
  /**
   * Waits until nothing is under way: no event waits, no mailbox holds a message, no operation runs, and no
   * stored timer of an entity this process has unloaded is due (decision 0029).
   */
  readonly settled: Effect.Effect<void>
}

/** An entity loaded in this process: its machine, the events waiting, and what is running for it. */
interface Loaded<T extends Types> {
  machine: Machine.Machine<T>
  applying: boolean
  readonly events: Queue.Queue<Machine.Event<T>>
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
  /** The earliest time a stored timer of an unloaded entity is due, as last read: to be read while `busy` is not. */
  next: number | null
  /** An entity was unloaded, and its timers may be due before the one the fiber sleeps for. */
  readonly poke: Queue.Queue<void>
}

interface Deployment<T extends Types> {
  readonly program: Program<T>
  readonly storage: Storage<T>
  readonly loaded: Map<string, Loaded<T>>
  readonly waker: Waker
  /** The services the program was deployed with, which its operations run in. */
  readonly run: (operation: Effect.Effect<void, never, T['services'] | Entities>) => Effect.Effect<void>
}

const under = (key: string, incarnation: number) => `${key}@${incarnation}`

/**
 * Tells the waker that the set of unloaded entities changed. Its flag and its poke are set in one step, and the
 * waker clears the flag in one step too, so the process is never settled with a poke nobody has taken.
 */
const poke = (waker: Waker) =>
  Effect.sync(() => {
    waker.busy = true
    Queue.offerUnsafe(waker.poke, undefined)
  })

export const launch = (options: Options = {}): Effect.Effect<Runtime, never, SqlClient.SqlClient | Scope.Scope> =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const scope = yield* Effect.scope
    // Loading an entity, and creating one, is one at a time: two callers never build two machines for one entity.
    const registry = yield* Semaphore.make(1)
    const deployments = new Map<string, Deployment<never>>()
    /**
     * The callers waiting for a reply, by entity and then by request: a retry of a queued message waits with the
     * first, and a crash of the entity reaches every caller of it (decision 0042).
     */
    const waiting = new Map<string, Map<string, Set<Deferred.Deferred<Given>>>>()
    const addressOf = (entity: Address) => JSON.stringify([entity.name, entity.id])
    const at = options.at ?? (() => Effect.void)
    const observe = options.observe ?? (() => Effect.void)
    const unloaded = options.unloaded ?? (() => Effect.void)
    const retry = options.retry?.millis ?? 10
    const passivate = options.passivate?.millis ?? 30_000

    const deployment = <T extends Types>(name: string): Deployment<T> | undefined =>
      deployments.get(name) as Deployment<T> | undefined

    const answer = (entity: Address, request: string, reply: Given) =>
      Effect.suspend(() => {
        const requests = waiting.get(addressOf(entity))
        const callers = requests?.get(request)
        if (requests === undefined || callers === undefined) return Effect.void
        requests.delete(request)
        if (requests.size === 0) waiting.delete(addressOf(entity))
        return Effect.forEach(callers, (caller) => Deferred.succeed(caller, reply), { discard: true })
      })

    /** A caller registered and waiting: its event is offered, and the reply comes to `caller`. */
    interface Asked {
      readonly caller: Deferred.Deferred<Given>
      readonly forget: Effect.Effect<void>
    }

    /**
     * Registers a caller and offers its event. It is done while the entity is held — the registry's permit — so
     * that an entity is never unloaded between a caller finding it and its event being offered (decision 0029).
     */
    const ask = <T extends Types>(
      loaded: Loaded<T>,
      entity: Address,
      request: string,
      event: Machine.Event<T>,
    ): Effect.Effect<Asked> =>
      Effect.gen(function*() {
        const address = addressOf(entity)
        const caller = yield* Deferred.make<Given>()
        const requests = waiting.get(address) ?? new Map<string, Set<Deferred.Deferred<Given>>>()
        const callers = requests.get(request) ?? new Set<Deferred.Deferred<Given>>()
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
        yield* Queue.offer(loaded.events, event)
        return { caller, forget }
      })

    /** Waits for the reply the entity stores or gives, and leaves nothing registered. */
    const answered = ({ caller, forget }: Asked) => Effect.onExit(Deferred.await(caller), () => forget)

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
        // Built in the operation's fiber: a runner that throws while it builds its effect dies as the operation,
        // and suspends the entity, instead of the event that started it (decision 0042).
        const run = Effect.suspend(() =>
          runner.delivery === 'Idempotent' ? runner.run(operation, idempotencyKey) : runner.run(operation)
        )
        const fiber = yield* Effect.forkIn(
          deployed.run(
            Effect.gen(function*() {
              const exit = yield* Effect.exit(run)
              if (exit._tag === 'Success') {
                yield* Queue.offer(loaded.events, { _tag: 'Complete', key, incarnation, message: exit.value })
              } else if (!Cause.hasInterruptsOnly(exit.cause)) {
                yield* Queue.offer(loaded.events, { _tag: 'Die', key, incarnation, cause: Cause.squash(exit.cause) })
              }
            }).pipe(
              // The entity it sends from is this one: an entity cannot pass for another (decision 0009).
              Effect.provideService(Entities, entities(entity)),
              Effect.ensuring(Effect.sync(() => loaded.operations.delete(under(key, incarnation)))),
            ),
          ),
          scope,
        )
        loaded.operations.set(under(key, incarnation), fiber)
      })

    /** Arms a timer: its time comes, and `Fire` is offered. A passivated entity would be woken by `due` instead. */
    const arm = <T extends Types>(
      loaded: Loaded<T>,
      output: Extract<Machine.Output<T>, { _tag: 'Armed' }>,
    ) =>
      Effect.gen(function*() {
        const { key, incarnation, timer } = output
        const now = yield* DateTime.now
        const millis = Math.max(0, DateTime.toEpochMillis(timer.at) - DateTime.toEpochMillis(now))
        const fiber = yield* Effect.forkIn(
          Effect.gen(function*() {
            yield* Effect.sleep(`${millis} millis`)
            yield* Queue.offer(loaded.events, { _tag: 'Fire', key, incarnation })
          }).pipe(Effect.ensuring(Effect.sync(() => loaded.timers.delete(under(key, incarnation))))),
          scope,
        )
        loaded.timers.set(under(key, incarnation), fiber)
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
          if (output._tag !== 'Replied') continue
          yield* answer(entity, Machine.requestKey(output.from, output.requestId), output.reply)
        }
        yield* at('AfterReply', entity, event as Machine.Event<never>)
        for (const output of outputs) {
          switch (output._tag) {
            case 'Started':
              yield* start(deployed, loaded, entity, output)
              break
            case 'Armed':
              yield* arm(loaded, output)
              break
            case 'Disarmed':
              yield* stop(loaded.timers, under(output.key, output.incarnation))
              break
            case 'Suspended':
              // Everything under way stops, and what it would deliver is dropped (decision 0006).
              yield* stopAll(loaded)
              break
            default:
              // `Replied`, `Recorded`, `Delivered` and `Dropped` are what the commit already said.
              break
          }
        }
      })

    /**
     * Takes the replies storage deleted out of the entities this process holds, so that what a loaded entity keeps
     * grows with the work under way, as what is stored does (decision 0021). An entity whose step is applied
     * meanwhile may keep one until it is unloaded: nothing asks for it, and it is never written again.
     */
    const forget = (forgotten: ReadonlyArray<Forgotten>) => {
      for (const { name, id, request } of forgotten) {
        const loaded = deployment(name)?.loaded.get(id)
        if (loaded === undefined || loaded.machine.stored.replies[request] === undefined) continue
        const { [request]: _, ...replies } = loaded.machine.stored.replies
        loaded.machine = { ...loaded.machine, stored: { ...loaded.machine.stored, replies } }
      }
    }

    /**
     * One event: the machine's step, written in one transaction, then acted on. A crash at any of the points
     * leaves the entity as the crash table says.
     */
    const apply = <T extends Types>(
      deployed: Deployment<T>,
      loaded: Loaded<T>,
      event: Machine.Event<T>,
    ): Effect.Effect<void> =>
      Effect.gen(function*() {
        loaded.applying = true
        const entity: Address = { name: loaded.machine.stored.name, id: loaded.machine.stored.id }
        const before = loaded.machine
        const transition = Machine.step(before, event)
        const wrote = transition.machine.stored !== before.stored
        let forgotten: ReadonlyArray<Forgotten> = []
        if (wrote) {
          yield* at('BeforeCommit', entity, event as Machine.Event<never>)
          // The message a step handles is the mailbox's first: what the step publishes, with the projection it
          // leaves (decision 0038).
          const handled = event._tag === 'Handle' ? before.stored.mailbox[0] ?? null : null
          forgotten = yield* sql.withTransaction(
            deployed.storage.write(before.stored, transition.machine.stored, handled),
          ).pipe(Effect.orDie)
        }
        loaded.machine = transition.machine
        forget(forgotten)
        // An event is observed once it is written — at once when it writes nothing — and before anything is
        // acted on: a crash before the commit leaves no event, and one after it an event that happened.
        yield* observe(entity, event as Machine.Event<never>)
        if (wrote) yield* at('AfterCommit', entity, event as Machine.Event<never>)
        yield* perform(deployed, loaded, entity, event, transition.outputs)
      }).pipe(Effect.ensuring(Effect.sync(() => {
        loaded.applying = false
      })))

    /**
     * Whether the entity has nothing to do: no event waiting or being applied, no message to handle, and nothing
     * but timers left of what its state holds (decision 0029).
     */
    const nothingToDo = <T extends Types>(loaded: Loaded<T>) => {
      const { stored } = loaded.machine
      if (loaded.applying || Queue.sizeUnsafe(loaded.events) > 0 || loaded.operations.size > 0) return false
      // A suspended entity runs nothing and comes back suspended, with the message it died on (decision 0006).
      if (stored.suspension !== null) return true
      if (stored.mailbox.length > 0) return false
      // What the state holds is what the next activation starts, so only timers may be left: an operation with
      // nothing running for it would come back as its `unknown`, and an at-most-once one would lose its act.
      return Object.values(stored.keys).every((key) => key.work === undefined || isTimer(key.work))
    }

    /**
     * Unloads the entity: its timers stop, and what the state holds is what wakes it again — to the machine a
     * `Restart`, a crash this process chose (decision 0029). Under the registry's permit, so that no caller is
     * between finding the entity and offering its event; it gives whether the entity is gone.
     */
    const unload = <T extends Types>(deployed: Deployment<T>, loaded: Loaded<T>) =>
      registry.withPermits(1)(Effect.gen(function*() {
        const { id } = loaded.machine.stored
        if (!nothingToDo(loaded) || deployed.loaded.get(id) !== loaded) return false
        // The waker is told before the entity leaves this process, and holds the permit while it reads: there is
        // no moment at which the entity's timers are neither armed here nor counted among the stored ones.
        yield* poke(deployed.waker)
        deployed.loaded.delete(id)
        // A timer that fires between here and its interruption delivers nothing, and the stored time stands.
        yield* stopAll(loaded)
        yield* unloaded({ name: deployed.program.name, id })
        return true
      }))

    /**
     * An event the runtime could not finish — a write that failed, a hook that died — is a crash of its entity
     * alone: the entity leaves this process, its work stops, and its waiting callers are given the defect, to
     * retry. What is stored is what its next activation starts from, as after a crash of the process. Called
     * where the registry's permit is held, so that no caller is between finding the entity and offering its event
     * (decision 0042).
     */
    const crash = <T extends Types>(deployed: Deployment<T>, loaded: Loaded<T>, cause: Cause.Cause<never>) =>
      Effect.gen(function*() {
        const { name, id } = loaded.machine.stored
        if (deployed.loaded.get(id) === loaded) deployed.loaded.delete(id)
        yield* stopAll(loaded)
        const address = addressOf({ name, id })
        const requests = waiting.get(address)
        waiting.delete(address)
        for (const callers of requests?.values() ?? []) {
          for (const caller of callers) yield* Deferred.failCause(caller, cause)
        }
        // Its stored timers are the waker's again.
        yield* poke(deployed.waker)
      })

    /**
     * The entity's loop: while its mailbox holds a message, it is handled, one transaction each; otherwise the
     * loop waits for an event, and the entity is unloaded if none comes for long enough. A suspended entity only
     * waits (decision 0006). The wait times out, never the take: an event taken is always applied. A loop that
     * dies crashes its entity, and an interruption is the process's crash (decision 0042).
     */
    const loop = <T extends Types>(deployed: Deployment<T>, loaded: Loaded<T>): Effect.Effect<void> =>
      steps(deployed, loaded).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.failCause(cause)
            : registry.withPermits(1)(crash(deployed, loaded, cause))
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
          Effect.flatMap((taken) =>
            taken._tag === 'Some'
              ? Effect.flatMap(apply(deployed, loaded, taken.value), () => next)
              : Effect.flatMap(unload(deployed, loaded), (gone) => (gone ? Effect.void : next))
          ),
        )
      })
      return next
    }

    /** Registers an entity in this process, and activates what was stored, as after a crash. */
    const activate = <T extends Types>(deployed: Deployment<T>, stored: Machine.Stored<T>) =>
      Effect.gen(function*() {
        const loaded: Loaded<T> = {
          machine: { program: deployed.program, stored, running: {} },
          applying: false,
          events: yield* Queue.unbounded<Machine.Event<T>>(),
          operations: new Map(),
          timers: new Map(),
        }
        deployed.loaded.set(stored.id, loaded)
        // Before anything else: the stored state says what runs (decision 0003). An activation that cannot finish
        // leaves nothing loaded, and its caller gets the defect (decision 0042).
        yield* apply(deployed, loaded, { _tag: 'Restart' }).pipe(
          Effect.onError((cause) => Cause.hasInterruptsOnly(cause) ? Effect.void : crash(deployed, loaded, cause)),
        )
        yield* Effect.forkIn(loop(deployed, loaded), scope)
        return loaded
      })

    /**
     * Runs `found` on the entity `id` of `deployed`, loaded from storage when this process does not hold it, and
     * while the entity is held: the registry's permit is what keeps it from being unloaded meanwhile
     * (decision 0029).
     */
    const withEntity = <T extends Types, A>(
      deployed: Deployment<T>,
      id: string,
      found: (loaded: Loaded<T> | null) => Effect.Effect<A>,
    ) =>
      registry.withPermits(1)(Effect.gen(function*() {
        const loaded = deployed.loaded.get(id)
        if (loaded !== undefined) return yield* found(loaded)
        const stored = yield* deployed.storage.load(id)
        return yield* found(stored === null ? null : yield* activate(deployed, stored))
      }))

    /** Loads the entity `id` into this process, if it is stored and this process does not hold it already. */
    const loads = <T extends Types>(deployed: Deployment<T>, id: string) =>
      withEntity(deployed, id, () => Effect.void)

    const operate = <T extends Types>(deployed: Deployment<T>, id: string, event: Machine.Event<T>) =>
      withEntity(deployed, id, (loaded) => loaded === null ? Effect.void : Queue.offer(loaded.events, event))

    const create = <T extends Types>(
      deployed: Deployment<T>,
      id: string,
      flags: T['flags'],
      request: Readonly<{ requestId: string; from: Origin<unknown> }>,
    ): Effect.Effect<Creation> =>
      Effect.gen(function*() {
        const entity: Address = { name: deployed.program.name, id }
        const requested = Machine.requestKey(request.from, request.requestId)
        const asked = yield* registry.withPermits(1)(Effect.gen(function*() {
          const held = deployed.loaded.get(id) ?? null
          // The entity was already there: the machine answers the request from what is stored (decision 0017).
          if (held !== null) return yield* ask(held, entity, requested, { _tag: 'Create', ...request })
          const stored = yield* deployed.storage.load(id)
          if (stored !== null) {
            const loaded = yield* activate(deployed, stored)
            return yield* ask(loaded, entity, requested, { _tag: 'Create', ...request })
          }
          const now = yield* DateTime.now
          const started = Machine.start(deployed.program, id, flags, now, request)
          // A defect at creation stores nothing: its creator is answered nothing but the defect itself
          // (decision 0014, and the open question of who may create an entity).
          if (started._tag === 'Defect') return yield* Effect.die(started.cause)
          const loaded: Loaded<T> = {
            machine: started.machine,
            applying: false,
            events: yield* Queue.unbounded<Machine.Event<T>>(),
            operations: new Map(),
            timers: new Map(),
          }
          const creation = { _tag: 'Create', ...request } as Machine.Event<never>
          yield* at('BeforeCommit', entity, creation)
          yield* sql.withTransaction(deployed.storage.write(null, started.machine.stored)).pipe(Effect.orDie)
          // The entity exists from here: its creation is the first event committed for it.
          yield* observe(entity, creation)
          yield* at('AfterCommit', entity, creation)
          deployed.loaded.set(id, loaded)
          yield* perform(deployed, loaded, entity, { _tag: 'Restart' }, started.outputs).pipe(
            Effect.onError((cause) => Cause.hasInterruptsOnly(cause) ? Effect.void : crash(deployed, loaded, cause)),
          )
          yield* Effect.forkIn(loop(deployed, loaded), scope)
          return null
        }))
        if (asked === null) return { _tag: 'Created' }
        const reply = yield* answered(asked)
        // `Create` is answered from what is stored: the machine gives `Created` or `AlreadyExists`, nothing else.
        return reply._tag === 'Created' || reply._tag === 'AlreadyExists' ? reply : { _tag: 'AlreadyExists' }
      })

    const send = <T extends Types>(
      deployed: Deployment<T>,
      id: string,
      message: T['inbound'],
      request: Readonly<{ requestId: string; from: Origin<T['sender']> }>,
    ): Effect.Effect<Answer<T['rejection']>> =>
      Effect.gen(function*() {
        const entity: Address = { name: deployed.program.name, id }
        // A message waits in the mailbox as its schema writes it: one that does not encode is its caller's defect,
        // and reaches no entity (decision 0040).
        yield* Effect.sync(() => {
          const { schemas } = deployed.program
          encode(schemas.inbound, message, 'inbound message')
          if (request.from._tag === 'Caller') encode(schemas.sender, request.from.sender, 'sender')
        })
        const requested = Machine.requestKey(request.from, request.requestId)
        const asked = yield* withEntity(deployed, id, (loaded) =>
          loaded === null ? Effect.succeed(null) : ask(loaded, entity, requested, {
            _tag: 'Receive',
            requestId: request.requestId,
            message,
            from: request.from,
          }))
        if (asked === null) return { _tag: 'NotFound' }
        return (yield* answered(asked)) as Answer<T['rejection']>
      })

    /**
     * What an operation sends with: its own entity's address, and its idempotency key as the request id, so that
     * a restarted operation gets the stored reply (decision 0009). A suspended receiver has no reply yet, and
     * `send` waits for one instead of giving up (decision 0010).
     */
    const entities = (from: Address) =>
      Entities.of({
        send: <T extends Types>(program: Program<T>, id: string, message: T['inbound'], requestId: IdempotencyKey) =>
          Effect.suspend(() => {
            const deployed = deployment<T>(program.name)
            if (deployed === undefined) return Effect.die(`the program '${program.name}' is not deployed here`)
            const waits = (): Effect.Effect<Reply<T['rejection']>> =>
              Effect.flatMap(
                send(deployed, id, message, { requestId, from: { _tag: 'Entity', entity: from } }),
                (reply) =>
                  reply._tag === 'Suspended'
                    ? Effect.flatMap(Effect.sleep(`${retry} millis`), waits)
                    : Effect.succeed(reply),
              )
            return waits()
          }),
        create: <T extends Types>(program: Program<T>, id: string, flags: T['flags'], requestId: IdempotencyKey) =>
          Effect.suspend(() => {
            const deployed = deployment<T>(program.name)
            if (deployed === undefined) return Effect.die(`the program '${program.name}' is not deployed here`)
            return create(deployed, id, flags, { requestId, from: { _tag: 'Entity', entity: from } })
          }),
      })

    /**
     * The timers of the entities this process does not hold: it reads the earliest time one is due, activates the
     * entities whose time has come — arming a timer already due fires it — and sleeps until the next, or until an
     * entity is unloaded and brings an earlier one (decision 0029).
     */
    const waking = <T extends Types>(deployed: Deployment<T>) => {
      const { waker } = deployed
      // One reading per round, and `forever` begins the next: a round that waited for itself would leave a frame
      // behind at every timer the process ever wakes for.
      return Effect.forever(Effect.gen(function*() {
        const now = DateTime.toEpochMillis(yield* DateTime.now)
        const due = yield* deployed.storage.due(now, [...deployed.loaded.keys()])
        waker.next = due.next
        // The entities just activated are this process's, and the reading of the next round leaves them out.
        if (due.ready.length > 0) {
          for (const id of due.ready) yield* loads(deployed, id)
          return
        }
        // Whether the reading stands: an entity unloaded while it was made has poked, and it is made again.
        // Taking the poke and clearing the flag are each one step, so no reading is lost and none is stale.
        const rests = yield* Effect.sync(() => {
          if (Queue.sizeUnsafe(waker.poke) > 0) return false
          waker.busy = false
          return true
        })
        if (!rests) return yield* Queue.take(waker.poke)
        yield* due.next === null
          ? Queue.take(waker.poke)
          : Effect.raceFirst(Queue.take(waker.poke), Effect.sleep(`${Math.max(0, due.next - now)} millis`))
        waker.busy = true
      }))
    }

    const deploy = <T extends Types>(program: Program<T>) =>
      Effect.gen(function*() {
        const services = yield* Effect.context<Exclude<T['services'], Entities>>()
        const deployed: Deployment<T> = {
          program,
          storage: storage(program, sql),
          loaded: new Map(),
          // Nothing is known of the stored timers until the waker has read them once.
          waker: { busy: true, next: null, poke: yield* Queue.sliding<void>(1) },
          run: (operation) => Effect.provideContext(operation, services) as Effect.Effect<void>,
        }
        deployments.set(program.name, deployed as unknown as Deployment<never>)
        yield* deployed.storage.indexed
        // An operation a crash interrupted starts again here; a timer waits for its time, loaded or not.
        for (const id of yield* deployed.storage.interrupted) yield* loads(deployed, id)
        yield* Effect.forkIn(waking(deployed), scope)
        const handle: Handle<T> = {
          create: (id, flags, request) =>
            create(deployed, id, flags, {
              requestId: request.requestId,
              from: { _tag: 'Caller', sender: request.sender },
            }),
          send: (id, message, request) =>
            send(deployed, id, message, {
              requestId: request.requestId,
              from: { _tag: 'Caller', sender: request.sender },
            }),
          read: (id) =>
            Effect.gen(function*() {
              const held = deployed.loaded.get(id)
              if (held !== undefined) return program.project(held.machine.stored.state)
              const stored = yield* deployed.storage.load(id)
              return stored === null ? null : program.project(stored.state)
            }),
          query: (query) => deployed.storage.query(query),
          reindex: deployed.storage.reindex,
          published: (after, limit) => deployed.storage.published(after, limit),
          feed: (consumer, limit) => deployed.storage.feed(consumer, limit),
          ack: (consumer, through) => deployed.storage.ack(consumer, through),
          prune: deployed.storage.prune,
          consumers: deployed.storage.consumers,
          forget: (consumer) => deployed.storage.forget(consumer),
          resume: (id, fixed) =>
            operate(deployed, id, fixed === undefined ? { _tag: 'Resume' } : { _tag: 'Resume', program: fixed }),
          discard: (id) => operate(deployed, id, { _tag: 'Discard' }),
        }
        return handle
      })

    const quiet = (now: number) => {
      for (const deployed of deployments.values()) {
        const { waker } = deployed
        // The waker has a reading to make, so nothing is known of the stored timers.
        if (waker.busy) return false
        // A timer of an unloaded entity whose time has come is work the process has not activated yet.
        if (waker.next !== null && waker.next <= now) return false
        for (const loaded of deployed.loaded.values()) {
          const { stored } = loaded.machine
          if (loaded.applying || loaded.operations.size > 0) return false
          if (Queue.sizeUnsafe(loaded.events) > 0) return false
          if (stored.suspension === null && stored.mailbox.length > 0) return false
        }
      }
      return true
    }

    const settled: Effect.Effect<void> = Effect.suspend(() =>
      Effect.flatMap(DateTime.now, (now) =>
        quiet(DateTime.toEpochMillis(now))
          ? Effect.void
          : Effect.flatMap(Effect.sleep('1 millis'), () => settled))
    )

    return { deploy, settled }
  })
