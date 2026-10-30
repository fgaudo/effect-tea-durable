/**
 * The runtime on one process, over `SqlClient`: it drives the machine ([`machine.ts`](machine.ts)) and acts on its
 * outputs (decision 0013). An event is one transaction (decision 0007): the machine's next `Stored` is written,
 * and only then are the caller answered and the work started, so a crash before the commit leaves nothing of the
 * event, and one after it is an activation away from the work the state holds.
 *
 * What is stored lives in the database ([`storage.ts`](storage.ts)); what is running — the operations' fibers, the
 * timers' sleeps, the entities loaded — lives in this process's scope, and a crash is that scope closing.
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
  Entities,
  type IdempotencyKey,
  type Origin,
  type Program,
  type Reply,
  runnerOf,
  type Types,
} from './program.ts'
import { storage, type Storage } from './storage.ts'

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
  /** How long a `send` from another entity waits before retrying a suspended one (decision 0010). */
  readonly retry?: Readonly<{ millis: number }>
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
  /** An operator resumes a suspended entity, perhaps with a fixed program (decision 0006). */
  readonly resume: (id: string, fixed?: Program<T>) => Effect.Effect<void>
  /** An operator discards the message a suspended entity died on (decision 0014). */
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
  /** Waits until nothing is under way: no event waits, no mailbox holds a message, no operation runs. */
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

interface Deployment<T extends Types> {
  readonly program: Program<T>
  readonly storage: Storage<T>
  readonly loaded: Map<string, Loaded<T>>
  /** The services the program was deployed with, which its operations run in. */
  readonly run: (operation: Effect.Effect<void, never, T['services'] | Entities>) => Effect.Effect<void>
}

const under = (key: string, incarnation: number) => `${key}@${incarnation}`

export const launch = (options: Options = {}): Effect.Effect<Runtime, never, SqlClient.SqlClient | Scope.Scope> =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const scope = yield* Effect.scope
    // Loading an entity, and creating one, is one at a time: two callers never build two machines for one entity.
    const registry = yield* Semaphore.make(1)
    const deployments = new Map<string, Deployment<never>>()
    /** The callers waiting for a reply, by entity and request: a retry of a queued message waits with the first. */
    const waiting = new Map<string, Set<Deferred.Deferred<Given>>>()
    const at = options.at ?? (() => Effect.void)
    const observe = options.observe ?? (() => Effect.void)
    const retry = options.retry?.millis ?? 10

    const deployment = <T extends Types>(name: string): Deployment<T> | undefined =>
      deployments.get(name) as Deployment<T> | undefined

    const answer = (entity: Address, request: string, reply: Given) =>
      Effect.suspend(() => {
        const key = `${entity.name}/${entity.id}/${request}`
        const callers = waiting.get(key)
        if (callers === undefined) return Effect.void
        waiting.delete(key)
        return Effect.forEach(callers, (caller) => Deferred.succeed(caller, reply), { discard: true })
      })

    /** Registers a caller, offers its event, and waits for the reply the entity stores or gives. */
    const ask = <T extends Types>(
      loaded: Loaded<T>,
      entity: Address,
      request: string,
      event: Machine.Event<T>,
    ) =>
      Effect.gen(function*() {
        const key = `${entity.name}/${entity.id}/${request}`
        const caller = yield* Deferred.make<Given>()
        const callers = waiting.get(key) ?? new Set<Deferred.Deferred<Given>>()
        callers.add(caller)
        waiting.set(key, callers)
        // A caller that gives up leaves nothing behind: its message is applied once, whichever retry finds it.
        const forget = Effect.sync(() => {
          const held = waiting.get(key)
          if (held === undefined) return
          held.delete(caller)
          if (held.size === 0) waiting.delete(key)
        })
        yield* Queue.offer(loaded.events, event)
        return yield* Effect.onExit(Deferred.await(caller), () => forget)
      })

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
        const run = runner.delivery === 'Idempotent'
          ? runner.run(operation, idempotencyKey)
          : runner.run(operation)
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
        if (wrote) {
          yield* at('BeforeCommit', entity, event as Machine.Event<never>)
          yield* sql.withTransaction(deployed.storage.write(before.stored, transition.machine.stored)).pipe(
            Effect.orDie,
          )
        }
        loaded.machine = transition.machine
        // An event is observed once it is written — at once when it writes nothing — and before anything is
        // acted on: a crash before the commit leaves no event, and one after it an event that happened.
        yield* observe(entity, event as Machine.Event<never>)
        if (wrote) yield* at('AfterCommit', entity, event as Machine.Event<never>)
        yield* perform(deployed, loaded, entity, event, transition.outputs)
      }).pipe(Effect.ensuring(Effect.sync(() => {
        loaded.applying = false
      })))

    /**
     * The entity's loop: while its mailbox holds a message, it is handled, one transaction each; otherwise the
     * loop waits for an event. A suspended entity only waits (decision 0006).
     */
    const loop = <T extends Types>(deployed: Deployment<T>, loaded: Loaded<T>) =>
      Effect.forever(
        Effect.suspend(() => {
          const { stored } = loaded.machine
          if (stored.suspension === null && stored.mailbox.length > 0) {
            return Effect.flatMap(DateTime.now, (now) => apply(deployed, loaded, { _tag: 'Handle', at: now }))
          }
          return Effect.flatMap(Queue.take(loaded.events), (event) => apply(deployed, loaded, event))
        }),
      )

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
        // Before anything else: the stored state says what runs (decision 0003).
        yield* apply(deployed, loaded, { _tag: 'Restart' })
        yield* Effect.forkIn(loop(deployed, loaded), scope)
        return loaded
      })

    /** The entity `id` of `deployed`, loaded from storage when this process does not hold it. */
    const ensure = <T extends Types>(deployed: Deployment<T>, id: string) =>
      registry.withPermits(1)(Effect.gen(function*() {
        const held = deployed.loaded.get(id)
        if (held !== undefined) return held
        const stored = yield* deployed.storage.load(id)
        return stored === null ? null : yield* activate(deployed, stored)
      }))

    const operate = <T extends Types>(deployed: Deployment<T>, id: string, event: Machine.Event<T>) =>
      Effect.gen(function*() {
        const loaded = yield* ensure(deployed, id)
        if (loaded === null) return
        yield* Queue.offer(loaded.events, event)
      })

    const create = <T extends Types>(
      deployed: Deployment<T>,
      id: string,
      flags: T['flags'],
      request: Readonly<{ requestId: string; from: Origin<unknown> }>,
    ): Effect.Effect<Creation> =>
      Effect.gen(function*() {
        const entity: Address = { name: deployed.program.name, id }
        const requested = Machine.requestKey(request.from, request.requestId)
        const made = yield* registry.withPermits(1)(Effect.gen(function*() {
          const held = deployed.loaded.get(id) ?? null
          if (held !== null) return held
          const stored = yield* deployed.storage.load(id)
          if (stored !== null) return yield* activate(deployed, stored)
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
          yield* perform(deployed, loaded, entity, { _tag: 'Restart' }, started.outputs)
          yield* Effect.forkIn(loop(deployed, loaded), scope)
          return null
        }))
        // The entity was already there: the machine answers the request from what is stored (decision 0017).
        if (made === null) return { _tag: 'Created' }
        const reply = yield* ask(made, entity, requested, { _tag: 'Create', ...request })
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
        const loaded = yield* ensure(deployed, id)
        if (loaded === null) return { _tag: 'NotFound' }
        const entity: Address = { name: deployed.program.name, id }
        const requested = Machine.requestKey(request.from, request.requestId)
        const reply = yield* ask(loaded, entity, requested, {
          _tag: 'Receive',
          requestId: request.requestId,
          message,
          from: request.from,
        })
        return reply as Answer<T['rejection']>
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

    const deploy = <T extends Types>(program: Program<T>) =>
      Effect.gen(function*() {
        const services = yield* Effect.context<Exclude<T['services'], Entities>>()
        const deployed: Deployment<T> = {
          program,
          storage: storage(program, sql),
          loaded: new Map(),
          run: (operation) => Effect.provideContext(operation, services) as Effect.Effect<void>,
        }
        deployments.set(program.name, deployed as unknown as Deployment<never>)
        // What a crash left under way starts again here: one process holds every entity whose state has work.
        for (const id of yield* deployed.storage.pending) yield* ensure(deployed, id)
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
          resume: (id, fixed) =>
            operate(deployed, id, fixed === undefined ? { _tag: 'Resume' } : { _tag: 'Resume', program: fixed }),
          discard: (id) => operate(deployed, id, { _tag: 'Discard' }),
        }
        return handle
      })

    const quiet = () => {
      for (const deployed of deployments.values()) {
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
      quiet() ? Effect.void : Effect.flatMap(Effect.sleep('1 millis'), () => settled)
    )

    return { deploy, settled }
  })
