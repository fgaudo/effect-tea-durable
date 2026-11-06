/**
 * The runtime on SQLite against the machine: a scenario is driven on the real runtime, with a crash injected at
 * each point of the design's crash table, and what the database holds afterwards is compared with where the pure
 * machine ends on the same events (decision 0013). The runtime's own rules — a transaction per event, the work
 * started after the commit, an entity activated when the process starts — are what the comparison tests.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { describe, expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as Clock from 'effect/Clock'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Deferred from 'effect/Deferred'
import type * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Layer from 'effect/Layer'
import * as Logger from 'effect/Logger'
import * as References from 'effect/References'
import fc from 'fast-check'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as Scope from 'effect/Scope'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/sql'
import { TestClock } from 'effect/testing'
import * as Machine from './machine.ts'
import {
  defect,
  type Address,
  type Entities,
  type IdempotencyKey,
  InvariantDefect,
  isTimer,
  type Json,
  noWork,
  operation,
  type Program,
  rejectWith,
  send,
  timer,
} from './program.ts'
import * as Library from './index.ts'
import { type Answer, launch, type Options, type Point, Probe, type Runtime } from './runtime.ts'
import { createTables, partitionOf, storage } from './storage.ts'
import {
  inOrder,
  prioritized,
  replayed as replayedSchedule,
  type Run,
  scheduled,
  seeds,
  type Strategy,
} from './testing.ts'

// The toy of `machine.test.ts`, with the schemas a runtime needs: `a` is idempotent, `b` at most once, `c` at
// least once, and `t` a timer. Each key's work ends by removing its key, unless a message brings it back.
const keys = ['a', 'b', 'c', 't'] as const
type Key = (typeof keys)[number]

const Key = Schema.Literals(keys)

const State = Schema.Struct({
  want: Schema.Array(Key),
  applied: Schema.Array(Schema.String),
  since: Schema.DateTimeUtcFromMillis,
  rings: Schema.DateTimeUtcFromMillis,
})
type State = typeof State.Type

const Inbound = Schema.Union([
  Schema.TaggedStruct('Want', { key: Key, on: Schema.Boolean, nonce: Schema.String }),
  Schema.TaggedStruct('Refuse', { nonce: Schema.String }),
  Schema.TaggedStruct('Break', { nonce: Schema.String }),
])
type Inbound = typeof Inbound.Type

const Internal = Schema.Union([
  Schema.TaggedStruct('Done', { key: Key }),
  Schema.TaggedStruct('Unknown', { key: Key }),
  Schema.TaggedStruct('Rang', { key: Key }),
])
type Internal = typeof Internal.Type

const Operation = Schema.Union([
  Schema.TaggedStruct('A', {}),
  Schema.TaggedStruct('B', { key: Key }),
  Schema.TaggedStruct('C', { key: Key }),
])
type Operation = typeof Operation.Type

const Sender = Schema.TaggedStruct('Tester', {})
type Sender = typeof Sender.Type

/** What the test's operations do instead of acting on the world: it records them, and may die. */
class Hands extends Context.Service<Hands, {
  readonly act: (key: Key, idempotencyKey: IdempotencyKey | null) => Effect.Effect<void>
}>()('Hands') {}

type T = {
  state: State
  flags: Readonly<{ at: DateTime.Utc }>
  inbound: Inbound
  internal: Internal
  operation: Operation
  key: Key
  parameter: {}
  rejection: 'Refused'
  sender: Sender
  projection: number
  index: 'wanted'
  services: Hands
}

const done = (key: Key): Internal => ({ _tag: 'Done', key })

const acts = (key: Key, idempotencyKey: IdempotencyKey | null) =>
  Effect.flatMap(Effect.service(Hands), (hands) => Effect.as(hands.act(key, idempotencyKey), done(key)))

const program: Program<T> = {
  name: 'Toy',
  keys: { a: null, b: null, c: null, t: null },
  schemas: {
    state: State,
    flags: Schema.Struct({ at: Schema.DateTimeUtcFromMillis }),
    inbound: Inbound,
    internal: Internal,
    operation: Operation,
    rejection: Schema.Literal('Refused'),
    sender: Sender,
    projection: Schema.Int,
  },
  init: (_flags, at) => ({ want: keys, applied: [], since: at, rings: DateTime.addDuration(at, '40 millis') }),
  update: (message) => (state) => {
    switch (message._tag) {
      case 'Want': {
        const others = state.want.filter((key) => key !== message.key)
        const want = message.on ? keys.filter((key) => key === message.key || others.includes(key)) : others
        return { ...state, want, applied: [...state.applied, message.nonce] }
      }
      case 'Refuse':
        return rejectWith('Refused')
      case 'Break':
        return defect('broken')
      default:
        return !state.want.includes(message.key)
          ? defect('an internal message for a key the state does not hold')
          : { ...state, want: state.want.filter((key) => key !== message.key) }
    }
  },
  durable: (state) =>
    state.want.length === 0 ? noWork : Object.fromEntries(state.want.map((key) => [
      key,
      key === 'a'
        ? { _tag: 'A' } as const
        : key === 'b'
        ? { _tag: 'B', key } as const
        : key === 'c'
        ? { _tag: 'C', key } as const
        : timer<Internal>(state.rings, { _tag: 'Rang', key: 't' }),
    ])),
  operations: {
    A: operation((_operation, idempotencyKey) => acts('a', idempotencyKey)),
    B: operation.atMostOnce(({ key }) => acts(key, null), ({ key }): Internal => ({ _tag: 'Unknown', key })),
    C: operation.atLeastOnce(({ key }) => acts(key, null)),
  },
  project: (state) => state.want.length,
  indexes: { wanted: (projection) => projection },
}

/**
 * The operations' hands, recording every act: a test asserts what ran, and how often. `holds` acts and never
 * comes back, which is an operation whose effect is done in the world and not recorded yet.
 */
const hands = (options: Readonly<{ holds?: boolean }> = {}) =>
  Effect.sync(() => {
    const acted: Array<string> = []
    return {
      acted,
      layer: Layer.succeed(
        Hands,
        Hands.of({
          act: (key, idempotencyKey) =>
            Effect.gen(function*() {
              acted.push(idempotencyKey === null ? key : `${key}:${idempotencyKey}`)
              if (options.holds === true) return yield* Effect.never
            }),
        }),
      ),
    }
  })

const id = 'toy-1'
/** A limit no reading of these tests reaches: a reading says how many rows it takes (decision 0141). */
const all = 1_000

const tester = { _tag: 'Tester' } as const

/** A reply as its row holds it, by request. */
type Answered = Readonly<{ request: string; tag: string; reason: unknown }>

/**
 * What is compared: the stored state as a value, with the work and the suspension's cause normalised, and the
 * replies stored for the entity, which the machine does not hold (decision 0065).
 */
const shape = (stored: Machine.Stored<T> | null, replies: ReadonlyArray<Answered>) =>
  stored === null ? null : {
    replies: Object.fromEntries(replies.map(({ request, tag, reason }) => [request, { tag, reason }])),
    state: stored.state,
    keys: Object.fromEntries(
      Object.entries(stored.keys).map(([text, held]) => [text, {
        key: held.key,
        incarnation: held.incarnation,
        work: held.work === undefined
          ? null
          : isTimer(held.work)
          ? { timer: DateTime.toEpochMillis(held.work.at), message: held.work.message }
          : held.work,
        delivery: held.delivery ?? null,
      }]),
    ),
    mailbox: stored.mailbox,
    creation: stored.creation,
    // The cause is rendered when it is stored, so only where the defect happened is compared.
    suspension: stored.suspension === null ? null : stored.suspension.on,
  }

/** What the storage holds of the entity, with the rows of its replies, as `shape` compares it. */
const persisted = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const stored = yield* storage(program, sql).load(id)
  const replies = yield* sql<{ request: string; tag: string; reason: string | null }>`
    SELECT request, tag, reason FROM replies WHERE name = ${program.name} AND id = ${id}
  `
  return shape(
    stored,
    replies.map(({ request, tag, reason }) => ({ request, tag, reason: reason === null ? null : JSON.parse(reason) })),
  )
})

/**
 * A database for one test: every process of the test shares it, as a crash leaves the file behind. Time is the
 * test's: it starts at 0, and moves only when the test moves it (decision 0066).
 */
const database = <A, E>(test: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.runPromise(
    Effect.scoped(Effect.flatMap(createTables, () => test)).pipe(
      Effect.provide(SqliteClient.layer({ filename: ':memory:' })),
      Effect.provide(TestClock.layer()),
      Effect.orDie,
    ),
  )

/**
 * What a test is told of what the runtime did, each kind of it apart: `at` each point of the crash table, where it
 * dies or never returns to crash the process, `observe` each event applied, and `unloaded` each passivation.
 */
type Hooks = Readonly<{
  at?: (point: Point, entity: Address, event: Machine.Event<never>) => Effect.Effect<void>
  observe?: (entity: Address, event: Machine.Event<never>) => Effect.Effect<void>
  unloaded?: (entity: Address) => Effect.Effect<void>
  /** The strategy of the scope the process is launched in: sequential by default, as `Effect.scoped` makes it. */
  finalizers?: 'parallel'
}>

/**
 * One process over the database: it ends when the body does, and everything running in it is interrupted. The
 * hooks are the runtime's probe, which it reads as it launches (decision 0073).
 */
const process = <A, E, R>(
  { at, observe, unloaded, finalizers, ...options }: Options & Hooks,
  body: (runtime: Runtime) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | SqlClient.SqlClient> =>
  (finalizers === undefined
    ? Effect.scoped(Effect.flatMap(launch(options), body))
    : Effect.acquireUseRelease(
      Scope.make(finalizers),
      (scope) => Scope.provide(Effect.flatMap(launch(options), body), scope),
      (scope, exit) => Scope.close(scope, exit),
    )).pipe(
    Effect.provideService(Probe, (said) => {
      switch (said._tag) {
        case 'Reached':
          return at?.(said.point, said.entity, said.event) ?? Effect.void
        case 'Applied':
          return observe?.(said.entity, said.event) ?? Effect.void
        case 'Unloaded':
          return unloaded?.(said.entity) ?? Effect.void
      }
    }),
  )

/**
 * Runs `effect` in a fiber of its own until it, and everything it sets going, waits: the clock's `adjust` waits for
 * the fibers it wakes to wait again, so what the test starts here is done or held when the fiber is given, with
 * the clock a millisecond on (decision 0066).
 */
const running = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function*() {
    const fiber = yield* Effect.forkChild(Effect.delay(effect, '1 millis'))
    yield* TestClock.adjust('1 millis')
    return fiber
  })

/** The same for an effect that ends: what it gives, once everything it set going waits. */
const ran = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.flatMap(running(effect), Fiber.join)

/**
 * Where a test under `explored` is explored: while it is open, the schedules preempt and pick as PCT draws them; while
 * the test closes it, the run goes in order. A test closes it before it moves the clock, so that the fibers the move
 * wakes are at their waits, as decision 0104 found they must be.
 */
type Window = { open: boolean }

/**
 * The share of its seeds a test under `explored` runs. The release's run, `bun run test:release`, runs them all; any
 * other run of the tests runs one in twenty, so that the suite runs in seconds.
 */
const share = Bun.env['SCHEDULES'] === 'all' ? 1 : 1 / 20

/**
 * The seed a test under `explored` starts from: 0, so that `bun test` and the release replay the same schedules,
 * unless `SEED` names another. `bun run test:explore` draws it at random, so that each of its runs tries new schedules.
 */
const first = (() => {
  const seed = Number(Bun.env['SEED'] ?? 0)
  if (!Number.isSafeInteger(seed)) throw new Error(`SEED is not an integer: ${Bun.env['SEED']}`)
  return seed
})()

/**
 * Runs `test` over a database of its own under `runs` prioritized schedules at `depth`, as `share` cuts them, with
 * inline resumptions, so that each is an order Effect's own scheduler can give (decision 0104). Each run must give
 * `ended`, and one that does not end fails, with the seed that replays it. The window is open as each run starts,
 * unless `open` is false. PCT draws its changes of priority among the steps a run in order is asked of preemption with
 * the window open. With `bound` 1 it runs instead every schedule that deviates once from the run in order within the
 * window, a pick or a preemption, as `everySchedule` does: exhaustive where PCT is not, for a point between two steps
 * of one fiber. That one runs whole, in every run of the tests. Under PCT, the seeds `pinned` run in every run,
 * before the others: each is a seed a run once failed on, kept once its bug is fixed.
 */
const explored = <A>(
  test: (window: Window) => Effect.Effect<A, unknown, SqlClient.SqlClient | Scope.Scope>,
  ended: A,
  { runs = 2_000, depth = 4, open = true, bound, pinned = [] }: Readonly<
    & { runs?: number; depth?: number; open?: boolean }
    // A schedule under `bound` 1 has no seed, so it pins none.
    & ({ bound?: never; pinned?: ReadonlyArray<number> } | { bound: 1; pinned?: never })
  > = {},
) => {
  const window: Window = { open }
  const scenario = Effect.scoped(Effect.suspend(() => {
    window.open = open
    return Effect.flatMap(createTables, () => test(window))
  })).pipe(
    Effect.provide(SqliteClient.layer({ filename: ':memory:' })),
    Effect.provide(TestClock.layer()),
    Effect.orDie,
  )
  const within = (strategy: Strategy): Strategy => ({
    pick: (ready) => window.open ? strategy.pick(ready) : 0,
    preempt: (fiber, ready) => window.open && strategy.preempt(fiber, ready),
  })
  const ends = (run: Run<A, unknown>) => run.exit !== undefined && Exit.isSuccess(run.exit) ? run.exit.value : run.exit
  if (bound === 1) {
    // How many ways each decision of the window can go, in a run in order.
    const ways: Array<number> = []
    scheduled(scenario, {
      pick: (ready) => (window.open && ways.push(ready.length), 0),
      preempt: () => (window.open && ways.push(2), false),
    }, 'inline')
    ways.forEach((choices, decision) => {
      for (let choice = 1; choice < choices; choice++) {
        let at = -1
        const run = scheduled(scenario, {
          pick: () => window.open && ++at === decision ? choice : 0,
          preempt: () => window.open && ++at === decision,
        }, 'inline')
        expect({ decision, choice, ended: ends(run) }).toEqual({ decision, choice, ended })
      }
    })
    return
  }
  let steps = 0
  scheduled(scenario, { pick: () => 0, preempt: () => (window.open && (steps += 1), false) }, 'inline')
  for (const seed of seeds({ first, count: Math.ceil(runs * share), pinned })) {
    const run = scheduled(scenario, within(prioritized(seed, depth, steps)), 'inline')
    expect({ seed, ended: ends(run) }).toEqual({ seed, ended })
  }
}

/**
 * Runs `effects` at once, each forked as a task of its own, and gives what each gives. `Effect.all` starts its
 * children inline, on the stack of its own fiber. So the second child would be forked only once the first one has
 * waited or yielded, and a child that waits before its third step never yields (decisions 0104, 0115, 0117).
 */
const together = <A, E, R>(effects: ReadonlyArray<Effect.Effect<A, E, R>>) =>
  Effect.flatMap(Effect.forEach(effects, (effect) => Effect.forkChild(effect)), (fibers) => Effect.forEach(fibers, Fiber.join))

/** Opens or closes the window of a test under `explored`. */
const opened = (window: Window, open: boolean) => Effect.sync(() => (window.open = open))

/**
 * `TestClock.adjust` in a test under `explored`, with its window closed: the fibers the move wakes are then at their
 * waits, and `adjust` waits for what it wakes (decision 0104). What the move sets going runs in order.
 */
const adjusted = (window: Window, duration: Duration.Input) =>
  Effect.suspend(() => {
    const open = window.open
    window.open = false
    return Effect.ensuring(TestClock.adjust(duration), Effect.sync(() => (window.open = open)))
  })

/** The request id a caller's message is received under, or null for any other event. */
const received = (event: Machine.Event<never>) =>
  event._tag === 'Receive' && event.request._tag === 'Caller' ? event.request.id : null

/**
 * The events the runtime committed, replayed in the machine.
 The first of them is the entity's creation, since
 * nothing can happen to an entity that is not stored yet: a log without one is a creation that never committed,
 * and there is no entity to compare.
 */
const replayed = (at: DateTime.Utc, events: ReadonlyArray<Machine.Event<T>>) => {
  const [first, ...rest] = events
  if (first === undefined || first._tag !== 'Create') return null
  const created = Machine.start(program, id, { at }, at, first.request)
  if (created._tag === 'Defect') throw created.cause
  let machine = created.machine
  // The toy is sent nothing by another entity's work, so no reply of its is deleted (decision 0021).
  const replies: Array<Answered> = [...created.written.replies]
  for (const event of rest) {
    const transition = Machine.step(program, machine, event)
    machine = transition.machine
    replies.push(...transition.written?.replies ?? [])
  }
  return shape(machine.stored, replies)
}

/**
 * What the committed events published, derived from the machine: the entity's creation, and every step after it
 * that left callers reading something else (decision 0038). It is what the outbox must hold, row for row. The
 * projection is a number here, so it is compared by value, where the runtime compares it as it is written.
 */
const publishedOf = (at: DateTime.Utc, events: ReadonlyArray<Machine.Event<T>>) => {
  const [first, ...rest] = events
  // A log without a creation is one that never committed: nothing of the entity was published either.
  if (first === undefined || first._tag !== 'Create') return []
  const created = Machine.start(program, id, { at }, at, first.request)
  if (created._tag === 'Defect') throw created.cause
  let machine = created.machine
  let shown = program.project(machine.stored.state)
  type Row = Readonly<{
    kind: 'Creation' | 'Inbound' | 'Internal'
    message: Inbound | Internal | null
    value: number
  }>
  const rows: Array<Row> = [{ kind: 'Creation', message: null, value: shown }]
  for (const event of rest) {
    // The message a step handles is the mailbox's first, read before the step takes it, or a message that finds
    // the mailbox empty (decision 0074).
    const head = event._tag === 'Receive' && machine.stored.mailbox.length === 0
      ? { _tag: 'Inbound' as const, message: event.message }
      : machine.stored.mailbox[0]
    const next = Machine.step(program, machine, event).machine
    const after = program.project(next.stored.state)
    if (next.stored.state !== machine.stored.state && after !== shown) {
      rows.push({
        kind: head?._tag ?? 'Creation',
        message: head?.message ?? null,
        value: after,
      })
    }
    machine = next
    shown = after
  }
  return rows
}

/**
 * The entities a process unloaded, in order: a passivation commits no event, and is seen only here. It happens
 * when the clock is moved past it, and is done when the move is.
 */
const unloads = () => {
  const entities: Array<string> = []
  const unloaded: Hooks['unloaded'] = (entity) =>
    Effect.sync(() => {
      entities.push(entity.id)
    })
  return { entities, unloaded }
}

/**
 * A wall clock that runs ahead of the sleeps by `by.millis`, moved in one step: what a real clock does between two
 * steps of a fiber, and the test clock never does, since its time moves only with `adjust`, which wakes each sleep
 * it passes and waits for what it wakes (decision 0066). Sleeps are the test clock's still.
 */
const ahead = () => {
  const by = { millis: 0 }
  const skewed = (clock: Clock.Clock): Clock.Clock => ({
    currentTimeMillisUnsafe: () => clock.currentTimeMillisUnsafe() + by.millis,
    currentTimeMillis: Effect.sync(() => clock.currentTimeMillisUnsafe() + by.millis),
    currentTimeNanosUnsafe: () => clock.currentTimeNanosUnsafe() + BigInt(by.millis) * 1_000_000n,
    currentTimeNanos: Effect.sync(() => clock.currentTimeNanosUnsafe() + BigInt(by.millis) * 1_000_000n),
    monotonicTimeNanosUnsafe: () => clock.monotonicTimeNanosUnsafe(),
    monotonicTimeNanos: clock.monotonicTimeNanos,
    sleep: (duration) => clock.sleep(duration),
  })
  let test: Clock.Clock | null = null
  const around = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.flatMap(Effect.service(Clock.Clock), (clock) => {
      test = clock
      return Effect.provideService(effect, Clock.Clock, skewed(clock))
    })
  /** `TestClock.adjust`, which takes the test clock from where this one stands. */
  const adjust = (duration: Duration.Input) =>
    Effect.suspend(() => test === null ? Effect.die('no clock to adjust') : Effect.provideService(TestClock.adjust(duration), Clock.Clock, test))
  return { by, around, adjust }
}

/** Hands that act and come back once `open` is run: operations under way until the test lets them end. */
const gated = () =>
  Effect.sync(() => {
    const gate = Deferred.makeUnsafe<void>()
    return {
      open: Deferred.succeed(gate, undefined),
      layer: Layer.succeed(Hands, Hands.of({ act: () => Deferred.await(gate) })),
    }
  })

/** A program whose entities are created with their timer alone: nothing under way, and spare until it is due. */
const timed: Program<T> = {
  ...program,
  name: 'Timed',
  init: (_flags, at) => ({ want: ['t'], applied: [], since: at, rings: DateTime.addDuration(at, '40 millis') }),
}

/** A program whose `c` sends `Want a off` to the toy `id`, named `want`, and ends once answered: a sender to it. */
const sending: Program<Omit<T, 'services'> & { services: Entities }> = {
  ...program,
  name: 'Sender',
  init: (_flags, at) => ({ want: ['c'], applied: [], since: at, rings: at }),
  operations: {
    A: operation(() => Effect.succeed(done('a'))),
    B: operation.atMostOnce(({ key }) => Effect.succeed(done(key)), ({ key }): Internal => ({ _tag: 'Unknown', key })),
    C: operation.atLeastOnce(({ key }) =>
      Effect.as(send(program, id, { _tag: 'Want', key: 'a', on: false, nonce: 'sent' }, 'want'), done(key))
    ),
  },
}

/** Collects every event the runtime commits, in order. */
const log = () => {
  const events: Array<Machine.Event<T>> = []
  const observe: Hooks['observe'] = (_entity, event) =>
    Effect.sync(() => {
      events.push(event as Machine.Event<T>)
    })
  return { events, observe }
}

describe('the runtime on SQLite', () => {
  test('creates an entity, runs its work and stores what the machine stores', () =>
    database(Effect.gen(function*() {
      const { acted, layer } = yield* hands()
      const { events, observe } = log()
      const at = yield* DateTime.now
      yield* process({ observe }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          expect(yield* toy.create(id, { at }, { requestId: 'creation', sender: { _tag: 'Tester' } }))
            .toEqual({ _tag: 'Created' })
          yield* runtime.settled
          // The timer is the only work left: everything else ran, was delivered and left the state.
          expect(yield* toy.read(id)).toBe(1)
          yield* TestClock.adjust('60 millis')
          yield* runtime.settled
          expect(yield* toy.read(id)).toBe(0)
        }))
      // Each operation acted once, the idempotent one with its key.
      expect(acted.filter((act) => act.startsWith('a:')).length).toBe(1)
      expect(acted.filter((act) => act === 'b').length).toBe(1)
      expect(acted.filter((act) => act === 'c').length).toBe(1)
      const stored = yield* persisted
      expect(stored).toEqual(replayed(stored?.state.since ?? at, events))
    })))

  test('warns of a step past its threshold once per activation, and refuses nothing for its size (decision 0135)', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const warnings: Array<Readonly<Record<string, unknown>>> = []
      const logger = Logger.make((options) => {
        if (options.logLevel === 'Warn') warnings.push(options.fiber.getRef(References.CurrentLogAnnotations))
      })
      const at = yield* DateTime.now
      const sender = { _tag: 'Tester' } as const
      const want = (nonce: string) => ({ _tag: 'Want', key: 'b', on: true, nonce }) as const
      let requests = 0
      // Each activation is a process of its own, which loads the entity again: its warning is its own.
      const activation = (options: Options, padding = '') =>
        process(options, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(program), layer)
            if (requests === 0) yield* toy.create(id, { at }, { requestId: 'creation', sender })
            for (let step = 0; step < 2; step++) {
              const requestId = `request-${requests++}`
              const sent = want(`${requestId}${padding}`)
              expect(yield* toy.send(id, sent, { requestId, sender })).toEqual({ _tag: 'Accepted' })
            }
            yield* runtime.settled
          })).pipe(Effect.provide(Logger.layer([logger])))
      yield* activation({})
      expect(warnings).toEqual([])
      yield* activation({ warn: { characters: 1 } })
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toMatchObject({ name: program.name, id, threshold: 1 })
      expect(warnings[0]!['characters']).toBeGreaterThan(1)
      yield* activation({ warn: { characters: 1 } })
      expect(warnings).toHaveLength(2)
      // A state past the default threshold of 262 144 characters warns with no option given.
      yield* activation({}, 'x'.repeat(262_144))
      expect(warnings).toHaveLength(3)
      expect(warnings[2]).toMatchObject({ threshold: 262_144 })
    })))

  test('answers a retry from the stored reply, and NotFound for no entity', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          expect(yield* toy.send('nobody', { _tag: 'Refuse', nonce: 'n' }, {
            requestId: 'r1',
            sender: { _tag: 'Tester' },
          })).toEqual({ _tag: 'NotFound' })
          yield* toy.create(id, { at }, { requestId: 'creation', sender: { _tag: 'Tester' } })
          const request = { requestId: 'r1', sender: { _tag: 'Tester' as const } }
          const refused: Answer<'Refused'> = { _tag: 'Rejected', reason: 'Refused' }
          expect(yield* toy.send(id, { _tag: 'Refuse', nonce: 'n' }, request)).toEqual(refused)
          // The retry is answered from storage, and `update` never sees the message again.
          expect(yield* toy.send(id, { _tag: 'Refuse', nonce: 'n' }, request)).toEqual(refused)
          // A creation again is answered `Created` for the request that created it (decision 0017).
          expect(yield* toy.create(id, { at }, { requestId: 'creation', sender: { _tag: 'Tester' } }))
            .toEqual({ _tag: 'Created' })
          expect(yield* toy.create(id, { at }, { requestId: 'another', sender: { _tag: 'Tester' } }))
            .toEqual({ _tag: 'AlreadyExists' })
        }))
    })))

  test('a retry within the keep its boundary gives is answered from storage, and one after it is applied again', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      const sender = { _tag: 'Tester' } as const
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender })
          const want: Inbound = { _tag: 'Want', key: 't', on: false, nonce: 'w' }
          const request = { requestId: 'r', sender, keep: { millis: 100 } }
          yield* toy.send(id, want, request)
          yield* TestClock.adjust('99 millis')
          yield* toy.send(id, want, request)
          const applied = () =>
            Effect.map(
              Effect.flatMap(SqlClient.SqlClient, (sql) => storage(program, sql).load(id)),
              (stored) => stored?.state.applied,
            )
          expect(yield* applied()).toEqual(['w'])
          // The reply is past its time: no operator has deleted it, and the retry is a new request.
          yield* TestClock.adjust('1 millis')
          yield* toy.send(id, want, request)
          expect(yield* applied()).toEqual(['w', 'w'])
          // The step deleted the reply past its time, so only the new reply is left for an operator to expire.
          expect(yield* toy.expire).toBe(0)
          yield* TestClock.adjust('100 millis')
          expect(yield* toy.expire).toBe(1)
          // A reply with no keep is kept for ever.
          yield* toy.send(id, want, { requestId: 'ever', sender })
          yield* TestClock.adjust('1 days')
          expect(yield* toy.expire).toBe(0)
          yield* toy.send(id, want, { requestId: 'ever', sender })
          expect(yield* applied()).toEqual(['w', 'w', 'w'])
        }))
    })))

  test('a keep of no whole number of millis is the caller’s defect, and reaches no entity', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      const sender = { _tag: 'Tester' } as const
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender })
          const want: Inbound = { _tag: 'Want', key: 't', on: false, nonce: 'w' }
          for (const millis of [-1, 1.5]) {
            const exit = yield* Effect.exit(toy.send(id, want, { requestId: 'r', sender, keep: { millis } }))
            expect(Exit.hasDies(exit)).toBe(true)
          }
          const stored = yield* Effect.flatMap(SqlClient.SqlClient, (sql) => storage(program, sql).load(id))
          expect(stored?.state.applied).toEqual([])
          // A keep of 0 millis keeps no reply: a retry is applied again.
          yield* toy.send(id, want, { requestId: 'r', sender, keep: { millis: 0 } })
          expect(yield* toy.send(id, want, { requestId: 'r', sender, keep: { millis: 0 } })).toEqual({ _tag: 'Accepted' })
          const after = yield* Effect.flatMap(SqlClient.SqlClient, (sql) => storage(program, sql).load(id))
          expect(after?.state.applied).toEqual(['w', 'w'])
        }))
    })))

  // A message waits in the mailbox behind another while a creation under its request id is answered: the
  // creation's reply must not reach the message's caller (decision 0050).
  test('a creation and a message under one request id are answered each its own reply', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      const gate = yield* Deferred.make<void>()
      const sender = { _tag: 'Tester' } as const
      yield* process({
        // The first message holds the entity until both requests wait for their replies.
        at: (point, _entity, event) =>
          point === 'BeforeCommit' && received(event) === 'first'
            ? Deferred.await(gate)
            : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender })
          const want = (nonce: string): Inbound => ({ _tag: 'Want', key: 'a', on: false, nonce })
          // Each request waits once it is started: the first at the gate, the two after it in the mailbox.
          yield* running(toy.send(id, want('n1'), { requestId: 'first', sender }))
          const created = yield* running(toy.create(id, { at }, { requestId: 'shared', sender }))
          const sent = yield* running(toy.send(id, want('n2'), { requestId: 'shared', sender }))
          yield* Deferred.succeed(gate, undefined)
          expect(yield* Fiber.join(created)).toEqual({ _tag: 'AlreadyExists' })
          expect(yield* Fiber.join(sent)).toEqual({ _tag: 'Accepted' })
        }))
    })))

  // A message is given the reply stored under its request and the time just before its step, not as it is offered:
  // one that waits behind another is handled at the time it reaches the front (decisions 0065, 0074).
  test('a message that waits behind another is given its time and its reply as its step begins', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const { events, observe } = log()
      const at = yield* DateTime.now
      const gate = yield* Deferred.make<void>()
      const sender = { _tag: 'Tester' } as const
      yield* process({
        observe,
        at: (point, _entity, event) =>
          point === 'BeforeCommit' && received(event) === 'first' ? Deferred.await(gate) : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender })
          yield* runtime.settled
          const want = (nonce: string): Inbound => ({ _tag: 'Want', key: 'a', on: false, nonce })
          const first = yield* running(toy.send(id, want('n1'), { requestId: 'first', sender }))
          // Both wait behind the first: a second message, and a retry of the first.
          const second = yield* running(toy.send(id, want('n2'), { requestId: 'second', sender }))
          const retry = yield* running(toy.send(id, want('n1'), { requestId: 'first', sender }))
          yield* TestClock.adjust('5 seconds')
          const released = DateTime.toEpochMillis(yield* DateTime.now)
          yield* Deferred.succeed(gate, undefined)
          for (const fiber of [first, second, retry]) expect(yield* Fiber.join(fiber)).toEqual({ _tag: 'Accepted' })
          // The retry may be answered before its own message is applied, so the events are read once it is.
          yield* runtime.settled
          const times = events.flatMap((event) =>
            event._tag === 'Receive' && event.request._tag === 'Caller'
              ? [[event.request.id, DateTime.toEpochMillis(event.at), event.reply]]
              : []
          )
          // The retry finds the reply the first stored, and `update` saw the message once.
          expect(times).toEqual([
            ['first', DateTime.toEpochMillis(at) + 1, null],
            ['second', released, null],
            ['first', released, { _tag: 'Accepted' }],
          ])
          expect((yield* storage(program, yield* SqlClient.SqlClient).load(id))?.state.applied).toEqual(['n1', 'n2'])
        }))
    })))

  test('a send past the bound of its entity’s callers is answered Full, stores nothing, and is warned of once (decision 0147)', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const warnings: Array<Readonly<Record<string, unknown>>> = []
      const logger = Logger.make((options) => {
        if (options.logLevel === 'Warn') warnings.push(options.fiber.getRef(References.CurrentLogAnnotations))
      })
      const at = yield* DateTime.now
      const gate = yield* Deferred.make<void>()
      const want = (nonce: string): Inbound => ({ _tag: 'Want', key: 'a', on: false, nonce })
      yield* process({
        callers: { messages: 2 },
        at: (point, _entity, event) =>
          point === 'BeforeCommit' && received(event) === 'first' ? Deferred.await(gate) : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
          yield* runtime.settled
          // The first is held at its commit, and counts until its step ends: with the second, the entity is full.
          const first = yield* running(toy.send(id, want('n1'), { requestId: 'first', sender: tester }))
          const second = yield* running(toy.send(id, want('n2'), { requestId: 'second', sender: tester }))
          for (const _ of [1, 2]) {
            expect(yield* toy.send(id, want('n3'), { requestId: 'third', sender: tester })).toEqual({ _tag: 'Full' })
          }
          yield* Deferred.succeed(gate, undefined)
          for (const fiber of [first, second]) expect(yield* Fiber.join(fiber)).toEqual({ _tag: 'Accepted' })
          // Nothing of the refused message was stored, so its retry is applied once, when there is room.
          expect(yield* toy.send(id, want('n3'), { requestId: 'third', sender: tester })).toEqual({ _tag: 'Accepted' })
          yield* runtime.settled
          const stored = yield* storage(program, yield* SqlClient.SqlClient).load(id)
          expect(stored?.state.applied).toEqual(['n1', 'n2', 'n3'])
        })).pipe(Effect.provide(Logger.layer([logger])))
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toMatchObject({ name: program.name, id, messages: 2 })
      // A bound of no message at all, or of no whole number of them, is the launcher's defect.
      for (const messages of [0, 1.5, Infinity, NaN]) {
        const exit = yield* Effect.exit(process({ callers: { messages } }, () => Effect.void))
        const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
        expect(cause instanceof InvariantDefect && cause.reason)
          .toBe(`the callers' messages are ${messages}, which is no positive integer`)
      }
    })))

  test('an operation that sends to a full entity sends again after the retry, and is answered (decision 0147)', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const refused = yield* Deferred.make<void>()
      const logger = Logger.make((options) => {
        if (options.logLevel === 'Warn') Deferred.doneUnsafe(refused, Effect.void)
      })
      const at = yield* DateTime.now
      const gate = yield* Deferred.make<void>()
      yield* process({
        callers: { messages: 1 },
        retry: { millis: 100 },
        at: (point, _entity, event) =>
          point === 'BeforeCommit' && received(event) === 'first' ? Deferred.await(gate) : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          const from = yield* runtime.deploy(sending)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
          yield* runtime.settled
          const first = yield* running(
            toy.send(id, { _tag: 'Want', key: 'a', on: false, nonce: 'n1' }, { requestId: 'first', sender: tester }),
          )
          // The sender's operation finds the toy full, and is not given the answer.
          yield* ran(from.create('sender', { at }, { requestId: 'creation', sender: tester }))
          yield* Deferred.await(refused)
          yield* Deferred.succeed(gate, undefined)
          expect(yield* Fiber.join(first)).toEqual({ _tag: 'Accepted' })
          yield* TestClock.adjust('100 millis')
          yield* runtime.settled
          const stored = yield* storage(program, yield* SqlClient.SqlClient).load(id)
          expect(stored?.state.applied).toEqual(['n1', 'sent'])
        })).pipe(Effect.provide(Logger.layer([logger])))
    })))

  test('an entity whose messages keep coming lets another step between two of its steps', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const received: Array<string> = []
      const started = yield* Deferred.make<void>()
      const observe: Hooks['observe'] = (entity, event) =>
        Effect.suspend(() => {
          if (event._tag !== 'Receive') return Effect.void
          received.push(entity.id)
          return entity.id === 'busy' ? Deferred.succeed(started, undefined) : Effect.void
        })
      const at = yield* DateTime.now
      yield* process({ observe }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create('busy', { at }, { requestId: 'c-busy', sender: tester })
          yield* toy.create('quiet', { at }, { requestId: 'c-quiet', sender: tester })
          yield* runtime.settled
          // Each reply resumes the sender at once, and its next message is in the queue before the busy entity's
          // loop takes from it: the loop never waits, and yields only where it yields on its own.
          yield* Effect.forkChild(Effect.forEach(
            Array.from({ length: 100 }, (_, n) => n),
            (n) => toy.send('busy', { _tag: 'Refuse', nonce: `${n}` }, { requestId: `busy-${n}`, sender: tester }),
            { discard: true },
          ))
          yield* Deferred.await(started)
          const before = received.length
          yield* toy.send('quiet', { _tag: 'Refuse', nonce: 'q' }, { requestId: 'quiet', sender: tester })
          // The quiet entity's message waits for one step of the busy entity, and the start of the next, at most.
          const between = received.slice(before, received.indexOf('quiet'))
          expect(between.length).toBeLessThanOrEqual(2)
        }))
    })))

  // Under the default budget a timer armed by work the test started has reached its sleep when the clock moves, and
  // fires at its time, not one move later (decisions 0066, 0101).
  test('a timer fires at its time, and not before', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const fired: Array<number> = []
      const at = yield* DateTime.now
      yield* process({
        observe: (_entity, event) =>
          Effect.map(DateTime.now, (now) => {
            if (event._tag === 'Fire') fired.push(DateTime.toEpochMillis(now))
          }),
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: { _tag: 'Tester' } })
          yield* runtime.settled
          // The toy's timer rings 40 milliseconds after its creation.
          yield* TestClock.adjust('39 millis')
          expect(fired).toEqual([])
          yield* TestClock.adjust('1 millis')
          expect(fired).toEqual([DateTime.toEpochMillis(at) + 40])
        }))
    })))

  test('suspends on a defect, answers Suspended, and resumes', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: { _tag: 'Tester' } })
          yield* runtime.settled
          const breaking = { requestId: 'break', sender: { _tag: 'Tester' as const } }
          expect(yield* toy.send(id, { _tag: 'Break', nonce: 'b' }, breaking)).toEqual({ _tag: 'Suspended' })
          // Nothing is delivered to a suspended entity: a message that arrives has no reply yet either.
          expect(yield* toy.send(id, { _tag: 'Want', key: 'a', on: false, nonce: 'w' }, {
            requestId: 'want',
            sender: { _tag: 'Tester' },
          })).toEqual({ _tag: 'Suspended' })
          // The message it died on is discarded, and the entity runs again.
          yield* toy.discard(id)
          yield* runtime.settled
          const stored = yield* storage(program, yield* SqlClient.SqlClient).load(id)
          expect(stored?.suspension).toBe(null)
          expect(stored?.mailbox.length).toBe(0)
        }))
    })))

  // A step that drops a droppable operation interrupts it, and does not wait for its finalizers (decision 0128).
  test('a droppable operation the state drops is interrupted, and the entity does not wait for its finalizer', () =>
    database(Effect.gen(function*() {
      // `c` acts and never comes back, and its finalizer ends only once the test opens the gate.
      const gate = yield* Deferred.make<void>()
      const interrupted: Array<string> = []
      const dropping: Program<T> = {
        ...program,
        name: 'Dropping',
        init: (_flags, at) => ({ want: ['c'], applied: [], since: at, rings: at }),
        operations: {
          ...program.operations,
          C: operation.droppable(({ key }) =>
            Effect.andThen(acts(key, null), Effect.never).pipe(
              Effect.onInterrupt(() =>
                Effect.andThen(Effect.sync(() => interrupted.push(key)), Deferred.await(gate))
              ),
            )
          ),
        },
      }
      const { acted, layer } = yield* hands()
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(dropping), layer)
          yield* ran(toy.create(id, { at }, { requestId: 'creation', sender: tester }))
          expect(acted).toEqual(['c'])
          const off = { _tag: 'Want', key: 'c', on: false, nonce: 'off' } as const
          expect(yield* ran(toy.send(id, off, { requestId: 'off', sender: tester }))).toEqual({ _tag: 'Accepted' })
          expect(interrupted).toEqual(['c'])
          // The finalizer still waits on the gate, and the next message is handled meanwhile.
          const on = { _tag: 'Want', key: 'a', on: true, nonce: 'on' } as const
          expect(yield* ran(toy.send(id, on, { requestId: 'on', sender: tester }))).toEqual({ _tag: 'Accepted' })
          yield* Deferred.succeed(gate, undefined)
          yield* runtime.settled
          const handled = (yield* toy.published('projection', [], all))
            .flatMap((row) => (row.message === null ? [] : [row.message]))
          expect(handled).not.toContainEqual({ _tag: 'Done', key: 'c' })
          expect(acted.filter((act) => act === 'c')).toEqual(['c'])
        }))
    })))

  test('a droppable operation that sends to an entity dies, and suspends its entity', () =>
    database(Effect.gen(function*() {
      const sender: Program<Omit<T, 'services'> & { services: Entities }> = {
        ...sending,
        operations: {
          ...sending.operations,
          C: operation.droppable(({ key }) =>
            // The type refuses a droppable runner that sends (decision 0129), and the runtime is what a runner
            // that escapes the type meets.
            // @ts-expect-error a droppable operation sends to no entity
            Effect.as(send(program, id, { _tag: 'Want', key: 'a', on: false, nonce: 'sent' }, 'want'), done(key))
          ),
        },
      }
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          yield* Effect.provide(runtime.deploy(program), layer)
          const from = yield* runtime.deploy(sender)
          yield* ran(from.create('sender', { at }, { requestId: 'creation', sender: tester }))
          yield* runtime.settled
          const stored = yield* storage(sender, yield* SqlClient.SqlClient).load('sender')
          expect(stored?.suspension?.on).toEqual({ _tag: 'Operation', key: { name: 'c' }, incarnation: 1 })
          expect(yield* storage(program, yield* SqlClient.SqlClient).load(id)).toBeNull()
        }))
    })))

  // A suspension stops the handling of messages and the timers, not the operations (decision 0113).
  test('an operation under way when its entity suspends runs to its end, and is not run again once resumed', () =>
    database(Effect.gen(function*() {
      // `b` acts, and comes back only once the test lets it: an operation under way while its entity suspends.
      const release = yield* Deferred.make<void>()
      const acted: Array<string> = []
      const layer = Layer.succeed(
        Hands,
        Hands.of({
          act: (key) =>
            Effect.gen(function*() {
              acted.push(key)
              if (key === 'b') yield* Deferred.await(release)
            }),
        }),
      )
      const { entities, unloaded } = unloads()
      const { events, observe } = log()
      const at = yield* DateTime.now
      const store = storage(program, yield* SqlClient.SqlClient)
      yield* process({ unloaded, observe, passivate: { millis: 5 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* ran(toy.create(id, { at }, { requestId: 'creation', sender: tester }))
          expect(yield* ran(toy.send(id, { _tag: 'Break', nonce: 'b' }, { requestId: 'break', sender: tester })))
            .toEqual({ _tag: 'Suspended' })
          // `b` is not interrupted, and keeps the entity loaded; the timer is disarmed, and its time passes.
          expect(acted.filter((key) => key === 'b')).toEqual(['b'])
          yield* TestClock.adjust('50 millis')
          expect(entities).toEqual([])
          // The runtime stopped the timer's sleep: no firing is offered, which the machine would only drop.
          expect(events.filter((event) => event._tag === 'Fire')).toEqual([])
          // Its completion is recorded behind the message the entity died on, and nothing is handled.
          yield* Deferred.succeed(release, undefined)
          yield* runtime.settled
          const stored = yield* store.load(id)
          expect(stored?.mailbox.map((envelope) => envelope._tag)).toEqual(['Inbound', 'Internal'])
          expect(stored?.suspension?.on).toEqual({ _tag: 'Message' })
          // With its operations ended, the entity is unloaded. The discard loads it again: the completion waits in
          // the mailbox, so `b` is not started again, and the timer, due by now, fires.
          yield* TestClock.adjust('5 millis')
          expect(entities).toEqual([id])
          expect(yield* toy.discard(id)).toEqual({ _tag: 'Discarded' })
          yield* runtime.settled
          expect(acted.filter((key) => key === 'b')).toEqual(['b'])
          const handled = (yield* toy.published('projection', [], all))
            .flatMap((row) => (row.message === null ? [] : [row.message._tag]))
          expect(handled.filter((tag) => tag === 'Done').length).toBe(3)
          expect(handled).not.toContain('Unknown')
          // The timer is armed again, at a time that has passed, and fires: at once, or with the clock's next move,
          // as soon as the fiber of its sleep runs.
          yield* TestClock.adjust('1 millis')
          yield* runtime.settled
          expect(events.slice(events.findIndex((event) => event._tag === 'Discard')).map((event) => event._tag))
            .toContain('Fire')
          expect((yield* store.load(id))?.state.want).toEqual([])
        }))
    })))

  test('an operator whose resume the runtime cannot finish is given the defect, as a caller is', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      // The write of the resume fails: the entity crashes, and the operator waiting for its answer is told so.
      const failing = (point: Point, _entity: Address, event: Machine.Event<never>) =>
        point === 'BeforeCommit' && event._tag === 'Resume' ? Effect.die('the write failed') : Effect.void
      yield* process({ at: failing }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* ran(toy.create(id, { at }, { requestId: 'creation', sender: tester }))
          yield* ran(toy.send(id, { _tag: 'Break', nonce: 'b' }, { requestId: 'break', sender: tester }))
          const exit = yield* Effect.exit(ran(toy.resume(id)))
          expect(Exit.hasDies(exit)).toBe(true)
        }))
    })))

  test('an operator sees the suspended entities, who waits for each, and what a resume or a discard did', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      const store = storage(program, yield* SqlClient.SqlClient)
      const listed = (toy: Library.Handle<T>) =>
        Effect.map(toy.suspended, (entities) =>
          entities.map(({ since, ...rest }) => ({ ...rest, since: DateTime.toEpochMillis(since) })))
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          const senders = yield* runtime.deploy(sending)
          expect(yield* toy.suspended).toEqual([])
          expect(yield* toy.resume('nobody')).toEqual({ _tag: 'NotFound' })
          yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
          yield* runtime.settled
          expect(yield* toy.discard(id)).toEqual({ _tag: 'NotSuspended' })
          yield* TestClock.adjust('7 millis')
          expect(yield* toy.send(id, { _tag: 'Break', nonce: 'b' }, { requestId: 'break', sender: tester }))
            .toEqual({ _tag: 'Suspended' })
          // A sender's operation sends to the suspended toy, and waits for its resumption.
          yield* ran(senders.create('s', { at }, { requestId: 's', sender: tester }))
          expect(yield* listed(toy)).toEqual([{
            id,
            on: { _tag: 'Message', kind: 'Inbound' },
            cause: expect.stringContaining('broken'),
            since: DateTime.toEpochMillis(at) + 7,
            waiting: [{ entity: { name: 'Sender', id: 's' }, key: { name: 'c' }, incarnation: 1, name: 'want' }],
          }])
          // Resumed by the program that died on the message, it is activated, and dies on it again. `settled` would
          // wait for the sender's operation, which waits for the resumption: the test lets the step run instead.
          expect(yield* toy.resume(id)).toEqual({ _tag: 'Resumed' })
          yield* ran(Effect.void)
          const again = yield* listed(toy)
          expect(again.map(({ id, on }) => [id, on])).toEqual([[id, { _tag: 'Message', kind: 'Inbound' }]])
          expect(again[0]?.since).toBeGreaterThanOrEqual(DateTime.toEpochMillis(at) + 7)
          // The discard drops the message, and the sender is woken, sends again and is answered.
          expect(yield* toy.discard(id)).toEqual({ _tag: 'Discarded' })
          yield* runtime.settled
          expect(yield* toy.suspended).toEqual([])
          expect(yield* senders.read('s')).toBe(0)
          expect((yield* store.load(id))?.state.applied).toContain('sent')
        }))
      // A version whose `update` dies on the completion of `b`: an internal message, which no discard drops.
      const breaking: Program<T> = {
        ...program,
        update: (message, meta) => (state) =>
          message._tag === 'Done' && message.key === 'b' ? defect('broken on b') : program.update(message, meta)(state),
      }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(breaking), layer)
          const now = DateTime.toEpochMillis(yield* DateTime.now)
          yield* toy.create('toy-2', { at }, { requestId: 'c2', sender: tester })
          yield* runtime.settled
          expect(yield* listed(toy)).toEqual([{
            id: 'toy-2',
            on: { _tag: 'Message', kind: 'Internal' },
            cause: expect.stringContaining('broken on b'),
            since: now,
            waiting: [],
          }])
          expect(yield* toy.discard('toy-2')).toEqual({ _tag: 'NotDiscarded' })
        }))
      // A version whose `durable` dies on the stored state: the resume leaves the entity suspended, with the new cause.
      const dying: Program<T> = { ...program, durable: () => defect('durable died') }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(dying), layer)
          expect(yield* toy.resume('toy-2')).toEqual({
            _tag: 'StillSuspended',
            cause: expect.stringContaining('durable died'),
          })
          // Suspended since the first time: a resume that fails keeps it.
          expect((yield* listed(toy)).map(({ id, cause, since }) => [id, cause, since])).toEqual([[
            'toy-2',
            expect.stringContaining('durable died'),
            DateTime.toEpochMillis(yield* DateTime.now),
          ]])
        }))
    })))

  // Each operator is answered by its own event, not by another operator's event applied first (decision 0114).
  test('two operators who discard at once are each told what their own discard did', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      const gate = yield* Deferred.make<void>()
      yield* process({
        at: (point, _entity, event) =>
          point === 'BeforeCommit' && event._tag === 'Discard' ? Deferred.await(gate) : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
          yield* runtime.settled
          expect(yield* toy.send(id, { _tag: 'Break', nonce: 'b' }, { requestId: 'break', sender: tester }))
            .toEqual({ _tag: 'Suspended' })
          // The first discard waits before its commit, and the second is offered behind it meanwhile.
          const first = yield* running(toy.discard(id))
          const second = yield* running(toy.discard(id))
          yield* Deferred.succeed(gate, undefined)
          expect(yield* Fiber.join(first)).toEqual({ _tag: 'Discarded' })
          expect(yield* Fiber.join(second)).toEqual({ _tag: 'NotSuspended' })
        }))
    })))

  test('an at-most-once operation delivers unknown after a crash, and an idempotent one runs again', () =>
    database(Effect.gen(function*() {
      // The first process dies with its operations acted and no completion recorded: the hands never come back.
      const first = yield* hands({ holds: true })
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), first.layer)
          // The creation starts its work, which has acted once everything waits.
          yield* ran(toy.create(id, { at }, { requestId: 'creation', sender: { _tag: 'Tester' } }))
        }))
      expect(first.acted.filter((act) => act === 'b').length).toBe(1)
      // The operations the crash interrupted are what the next process activates the entity for (decision 0029).
      expect(yield* storage(program, yield* SqlClient.SqlClient).interrupted).toEqual([id])
      const second = yield* hands()
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          yield* Effect.provide(runtime.deploy(program), second.layer)
          yield* runtime.settled
        }))
      // `b` is at most once: it may have acted, so it never runs again, and its `unknown` is delivered instead.
      expect(second.acted.filter((act) => act === 'b').length).toBe(0)
      // `a` is idempotent and `c` at least once: both run again.
      expect(second.acted.filter((act) => act.startsWith('a:')).length).toBe(1)
      expect(second.acted.filter((act) => act === 'c').length).toBe(1)
    })))

})

/**
 * A planned stop: a process launched with `drain` waits, as its scope closes, for its at-most-once operations under
 * way, and stops the rest at once (decision 0119).
 */
describe('a planned stop', () => {
  /**
   * Hands that record each act, and come back once `open` is run. `interrupted` is done once `interrupts` acts are
   * interrupted: how a test knows that the drain has stopped what runs again.
   */
  const held = (interrupts: number) =>
    Effect.sync(() => {
      const acted: Array<string> = []
      const gate = Deferred.makeUnsafe<void>()
      const interrupted = Deferred.makeUnsafe<void>()
      let seen = 0
      return {
        acted,
        open: Deferred.succeed(gate, undefined),
        interrupted: Deferred.await(interrupted),
        layer: Layer.succeed(
          Hands,
          Hands.of({
            act: (key, idempotencyKey) =>
              Effect.andThen(
                Effect.sync(() => acted.push(idempotencyKey === null ? key : `${key}:${idempotencyKey}`)),
                Effect.onInterrupt(
                  Deferred.await(gate),
                  () => ++seen === interrupts ? Deferred.succeed(interrupted, undefined) : Effect.void,
                ),
              ),
          }),
        ),
      }
    })

  /**
   * A first process, with `drain`, that creates the entity and ends with its work under way, in a fiber of its own.
   * `during` runs once the drain has interrupted the `interrupts` operations that run again, with the handle, while
   * the scope's closing waits. A second process without the option then activates the entity, and gives what it
   * acted and what the entity published.
   */
  const stopped = <A>(
    options: Options & Hooks,
    during: (toy: Library.Handle<T>, open: Effect.Effect<boolean>) => Effect.Effect<A>,
    { program: deployed = program, interrupts = 2 }: Readonly<{ program?: Program<T>; interrupts?: number }> = {},
  ) =>
    Effect.gen(function*() {
      const first = yield* held(interrupts)
      const at = yield* DateTime.now
      const handle = yield* Deferred.make<Library.Handle<T>>()
      const stopping = yield* Effect.forkChild(process(options, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(deployed), first.layer)
          yield* ran(toy.create(id, { at }, { requestId: 'creation', sender: tester }))
          yield* Deferred.succeed(handle, toy)
        })))
      const toy = yield* Deferred.await(handle)
      yield* first.interrupted
      const during_ = yield* during(toy, first.open)
      yield* Fiber.join(stopping)
      const second = yield* hands()
      const after = yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(deployed), second.layer)
          yield* runtime.settled
          return { toy, published: yield* toy.published('projection', [], all) }
        }))
      return { first: first.acted, second: second.acted, published: after.published, during: during_ }
    })

  const unknown = (published: ReadonlyArray<Library.Published<T>>) =>
    published.filter((row) => row.message !== null && row.message._tag === 'Unknown').map((row) => row.message)

  test('an at-most-once operation under way ends, and the others run again at the next activation', () =>
    database(Effect.gen(function*() {
      const { first, second, published } = yield* stopped({ drain: { millis: 100 } }, (_toy, open) => open)
      expect(first.filter((act) => act === 'b').length).toBe(1)
      // `b` ended in the drain, and its completion was committed: it is neither run again nor delivered `unknown`.
      expect(second.filter((act) => act === 'b').length).toBe(0)
      expect(unknown(published)).toEqual([])
      // `a` and `c` were interrupted at once, before the gate opened, and run again.
      expect(second.filter((act) => act.startsWith('a:')).length).toBe(1)
      expect(second.filter((act) => act === 'c').length).toBe(1)
    })))

  test('a drain holds in a scope that closes its finalizers in parallel', () =>
    database(Effect.gen(function*() {
      // Decision 0120: the runtime closes a sequential scope of its own, so the drain runs before what it waits for
      // is stopped, whatever the strategy of the caller's scope.
      const { second, published } = yield* stopped({ drain: { millis: 100 }, finalizers: 'parallel' }, (_toy, open) =>
        open)
      expect(second.filter((act) => act === 'b').length).toBe(0)
      expect(unknown(published)).toEqual([])
    })))

  test('the drain waits for the completion of an at-most-once operation, under prioritized schedules', () => {
    // Decision 0119: the drain looks whether anything is left after it takes the signal of `settled`, so an
    // operation's end or a step's between the look and the wait is not missed, and its completion is committed.
    explored((window) =>
      Effect.map(
        stopped({ drain: { millis: 100 } }, (_toy, open) => Effect.andThen(opened(window, true), open)),
        ({ second, published }) => ({ rerun: second.filter((act) => act === 'b').length, unknown: unknown(published) }),
      ), { rerun: 0, unknown: [] }, { open: false })
  }, 60_000)

  test('a completion in the drain starts no operation that runs again, and arms no timer', () =>
    database(Effect.gen(function*() {
      // `b`'s completion brings `a`, and `t`, due at once: both wait for the next activation.
      const chained: Program<T> = {
        ...program,
        name: 'Chained',
        init: (_flags, at) => ({ want: ['b', 'c'], applied: [], since: at, rings: at }),
        update: (message, meta) => (state) =>
          message._tag === 'Done' && message.key === 'b'
            ? { ...state, want: ['c', 'a', 't'] }
            : program.update(message, meta)(state),
      }
      const { events, observe } = log()
      // The clock moves once the gate is open, so that a timer armed in the drain would fire there.
      const { first, second } = yield* stopped({ drain: { millis: 100 }, observe }, (_toy, open) =>
        Effect.andThen(open, TestClock.adjust('1 millis')), {
        program: chained,
        interrupts: 1,
      })
      expect(first.filter((act) => act.startsWith('a:')).length).toBe(0)
      expect(events.filter((event) => event._tag === 'Fire').length).toBe(0)
      expect(second.filter((act) => act.startsWith('a:')).length).toBe(1)
    })))

  test('a step the drain handles starts no operation that runs again, and arms no timer', () =>
    database(Effect.gen(function*() {
      // `b` and `c` are at most once. `b`'s completion brings `a` and `t`, due at once, while `c` still holds the
      // drain open, so the step that handles it runs in the drain: `a` and `t` wait for the next activation.
      const heldOpen: Program<T> = {
        ...program,
        name: 'HeldOpen',
        init: (_flags, at) => ({ want: ['b', 'c'], applied: [], since: at, rings: at }),
        update: (message, meta) => (state) =>
          message._tag === 'Done' && message.key === 'b'
            ? { ...state, want: ['c', 'a', 't'] }
            : program.update(message, meta)(state),
        durable: (state) =>
          Object.fromEntries(
            Object.entries(program.durable(state)).map((
              [key, work],
            ) => [key, key === 'c' ? { _tag: 'B', key: 'c' } as const : work]),
          ),
      }
      const acted: Array<string> = []
      const gates = { b: Deferred.makeUnsafe<void>(), c: Deferred.makeUnsafe<void>() }
      const layer = Layer.succeed(
        Hands,
        Hands.of({
          act: (key, idempotencyKey) =>
            Effect.andThen(
              Effect.sync(() => acted.push(idempotencyKey === null ? key : `${key}:${idempotencyKey}`)),
              key === 'b' || key === 'c' ? Deferred.await(gates[key]) : Effect.void,
            ),
        }),
      )
      const { events, observe } = log()
      const at = yield* DateTime.now
      const created = yield* Deferred.make<void>()
      const stopping = yield* Effect.forkChild(process({ drain: { millis: 100 }, observe }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(heldOpen), layer)
          yield* ran(toy.create(id, { at }, { requestId: 'creation', sender: tester }))
          yield* Deferred.succeed(created, undefined)
        })))
      yield* Deferred.await(created)
      // The closing fiber reaches the drain's wait; then `b` ends, its step runs, and a timer armed would fire.
      yield* TestClock.adjust('1 millis')
      yield* Deferred.succeed(gates.b, undefined)
      yield* TestClock.adjust('1 millis')
      yield* TestClock.adjust('1 millis')
      const handled = events.filter((event) => event._tag === 'Handle').length
      yield* Deferred.succeed(gates.c, undefined)
      yield* Fiber.join(stopping)
      // `b`'s completion was handled in the drain.
      expect(handled).toBeGreaterThan(0)
      expect(acted.filter((act) => act.startsWith('a:')).length).toBe(0)
      expect(events.filter((event) => event._tag === 'Fire').length).toBe(0)
      const next = { acted: [] as Array<string>, ...log() }
      yield* process({ observe: next.observe }, (runtime) =>
        Effect.gen(function*() {
          yield* Effect.provide(runtime.deploy(heldOpen), Layer.succeed(Hands, Hands.of({
            act: (key, idempotencyKey) =>
              Effect.sync(() => next.acted.push(idempotencyKey === null ? key : `${key}:${idempotencyKey}`)),
          })))
          yield* runtime.settled
        }))
      expect(next.acted.filter((act) => act.startsWith('a:')).length).toBe(1)
      expect(next.events.filter((event) => event._tag === 'Fire').length).toBe(1)
    })))

  test('a message an at-most-once operation sends to another entity in the drain is delivered', () =>
    database(Effect.gen(function*() {
      // The sender's `b` is at most once, and sends to the toy once the drain has begun. The guard of a caller's
      // request does not hold it back: the toy handles it in the drain, and `b` ends without its `unknown`.
      const gate = yield* Deferred.make<void>()
      const sender: Program<Omit<T, 'services'> & { services: Entities }> = {
        ...sending,
        init: (_flags, at) => ({ want: ['b'], applied: [], since: at, rings: at }),
        operations: {
          ...sending.operations,
          B: operation.atMostOnce(
            ({ key }) =>
              Effect.andThen(
                Deferred.await(gate),
                Effect.as(send(program, id, { _tag: 'Want', key: 'a', on: false, nonce: 'sent' }, 'want'), done(key)),
              ),
            ({ key }): Internal => ({ _tag: 'Unknown', key }),
          ),
        },
      }
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      const store = storage(program, yield* SqlClient.SqlClient)
      const senders = storage(sender, yield* SqlClient.SqlClient)
      const created = yield* Deferred.make<void>()
      const stopping = yield* Effect.forkChild(process({ drain: { millis: 100 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          const sends = yield* runtime.deploy(sender)
          yield* ran(toy.create(id, { at }, { requestId: 'creation', sender: tester }))
          yield* ran(sends.create('s', { at }, { requestId: 's', sender: tester }))
          yield* Deferred.succeed(created, undefined)
        })))
      yield* Deferred.await(created)
      // The closing fiber reaches the drain's wait, then `b` sends; the drain's time runs out after.
      yield* TestClock.adjust('1 millis')
      yield* Deferred.succeed(gate, undefined)
      yield* TestClock.adjust('1 millis')
      yield* TestClock.adjust('100 millis')
      yield* Fiber.join(stopping)
      expect((yield* store.load(id))?.state.applied).toEqual(['sent'])
      const stored = yield* senders.load('s')
      expect(stored?.mailbox.map((envelope) => envelope.message)).toEqual([{ _tag: 'Done', key: 'b' }])
    })))

  test('an at-most-once operation that outlasts the drain delivers unknown, as after a crash', () =>
    database(Effect.gen(function*() {
      const { events, observe } = log()
      const { second, published } = yield* stopped(
        { drain: { millis: 100 }, observe },
        // The closing fiber reaches its wait, and then the drain's time runs out, past the time of `t`.
        () => Effect.andThen(TestClock.adjust('1 millis'), TestClock.adjust('100 millis')),
      )
      // The drain stopped the timer: its time came in the drain, and it fires in the next process.
      expect(events.filter((event) => event._tag === 'Fire').length).toBe(0)
      expect(second.filter((act) => act === 'b').length).toBe(0)
      expect(unknown(published)).toEqual([{ _tag: 'Unknown', key: 'b' }])
    })))

  test('a creation committed before the drain starts its at-most-once operation, and the drain waits for it', () =>
    database(Effect.gen(function*() {
      // The creation commits and holds before its work starts. Stopped there, `b` would be stored and never started,
      // and deliver `unknown` without having run.
      const first = yield* hands()
      const at = yield* DateTime.now
      const gate = yield* Deferred.make<void>()
      const reached = yield* Deferred.make<void>()
      const stopping = yield* Effect.forkChild(process({
        drain: { millis: 100 },
        at: (point, _entity, event) =>
          point === 'AfterCommit' && event._tag === 'Create'
            ? Effect.andThen(Deferred.succeed(reached, undefined), Deferred.await(gate))
            : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), first.layer)
          yield* Effect.forkChild(toy.create(id, { at }, { requestId: 'creation', sender: tester }))
          yield* Deferred.await(reached)
        })))
      yield* Deferred.await(reached)
      // The closing fiber reaches the drain's wait, and the creation goes on.
      yield* TestClock.adjust('1 millis')
      yield* Deferred.succeed(gate, undefined)
      yield* Fiber.join(stopping)
      expect(first.acted.filter((act) => act === 'b').length).toBe(1)
      const second = yield* hands()
      const published = yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), second.layer)
          yield* runtime.settled
          return yield* toy.published('projection', [], all)
        }))
      expect(second.acted.filter((act) => act === 'b').length).toBe(0)
      expect(unknown(published)).toEqual([])
    })))

  test('the waker activates no entity in the drain', () =>
    database(Effect.gen(function*() {
      const first = yield* held(2)
      const at = yield* DateTime.now
      const restarted: Array<string> = []
      const ending = yield* Deferred.make<void>()
      const stopping = yield* Effect.forkChild(process({
        drain: { millis: 100 },
        passivate: { millis: 5 },
        observe: (entity, event) =>
          Effect.sync(() => {
            if (event._tag === 'Restart') restarted.push(entity.id)
          }),
      }, (runtime) =>
        Effect.gen(function*() {
          // `timed` is unloaded with its timer stored, due at 40 millis: the waker's to activate.
          const timers = yield* Effect.provide(runtime.deploy(timed), first.layer)
          yield* timers.create('timed', { at }, { requestId: 'creation', sender: tester })
          yield* TestClock.adjust('5 millis')
          const toy = yield* Effect.provide(runtime.deploy(program), first.layer)
          yield* ran(toy.create(id, { at }, { requestId: 'creation', sender: tester }))
          yield* Deferred.succeed(ending, undefined)
        })))
      yield* Deferred.await(ending)
      yield* first.interrupted
      // The drain outlasts the time of `timed`.
      yield* TestClock.adjust('1 millis')
      yield* TestClock.adjust('100 millis')
      yield* Fiber.join(stopping)
      expect(restarted).toEqual([])
    })))

  test('a caller that arrives during the drain waits, is interrupted, and a retry is answered after the restart', () =>
    database(Effect.gen(function*() {
      const want = { _tag: 'Want', key: 'a', on: false, nonce: 'late' } as const
      const request = { requestId: 'late', sender: tester }
      const { during } = yield* stopped({ drain: { millis: 100 } }, (toy, open) =>
        Effect.gen(function*() {
          const callers: Array<Fiber.Fiber<unknown>> = [
            yield* running(toy.send(id, want, request)),
            yield* running(toy.create('late', { at: yield* DateTime.now }, request)),
            yield* running(toy.discard(id)),
          ]
          // Nothing answers them while the at-most-once operation holds the drain.
          const waiting = callers.map((caller) => caller.pollUnsafe() === undefined)
          yield* open
          return { waiting, exits: yield* Effect.forEach(callers, Fiber.await) }
        }))
      expect(during.waiting).toEqual([true, true, true])
      expect(during.exits.map(Exit.hasInterrupts)).toEqual([true, true, true])
      // The message was never taken, so the retry of the next process is applied.
      const replies = yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), (yield* hands()).layer)
          return { sent: yield* toy.send(id, want, request), late: yield* toy.read('late') }
        }))
      expect(replies).toEqual({ sent: { _tag: 'Accepted' }, late: null })
    })))

  test('a drain of no whole number of millis is the caller defect, and a drain of 0 millis is not', () =>
    database(Effect.gen(function*() {
      const exit = yield* Effect.exit(process({ drain: { millis: 1.5 } }, () => Effect.void))
      expect(Exit.hasDies(exit)).toBe(true)
      // No millis at all is a drain that waits for nothing, and stops what runs as a crash does.
      expect(Exit.isSuccess(yield* Effect.exit(process({ drain: { millis: 0 } }, () => Effect.void)))).toBe(true)
    })))
})

/**
 * Passivation: an entity with nothing to do is unloaded, and what is stored wakes it (decision 0029). To the
 * machine it is a `Restart`, so the comparison with the replay is what says the passivation lost nothing.
 */
describe('passivation', () => {
  test('unloads an idle entity, and its stored timer wakes it', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const { events, observe } = log()
      const { entities, unloaded } = unloads()
      const at = yield* DateTime.now
      yield* process({ observe, unloaded, passivate: { millis: 5 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: { _tag: 'Tester' } })
          yield* runtime.settled
          expect(entities).toEqual([])
          // Only the timer is left, and nothing holds the entity loaded: it is unloaded with the timer stored.
          yield* TestClock.adjust('5 millis')
          expect(entities).toEqual([id])
          // What callers read of an unloaded entity is read from storage.
          expect(yield* toy.read(id)).toBe(1)
          // The timer's time comes while the entity is unloaded: the stored time is what wakes it, and with
          // nothing left to do the entity is unloaded again.
          yield* TestClock.adjust('60 millis')
          yield* runtime.settled
          expect(yield* toy.read(id)).toBe(0)
          expect(entities).toEqual([id, id])
        }))
      const stored = yield* persisted
      expect(stored).toEqual(replayed(stored?.state.since ?? at, events))
    })))

  test('the process settles and a stored timer wakes its entity, under prioritized schedules', () => {
    // Each schedule moves the points where one fiber runs between two steps of another (decisions 0068, 0104).
    explored((window) =>
      Effect.gen(function*() {
        const { layer } = yield* hands()
        const { entities, unloaded } = unloads()
        const at = yield* DateTime.now
        return yield* process({ unloaded, passivate: { millis: 5 } }, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(program), layer)
            yield* toy.create(id, { at }, { requestId: 'creation', sender: { _tag: 'Tester' } })
            // An operation that ended before it was held would be counted as running for ever, and this would
            // never return: the run would not end. An event not counted as it is offered would let it return before
            // the event is applied, and the entity would be read with a key it no longer wants.
            yield* runtime.settled
            const read = [yield* toy.read(id)]
            yield* adjusted(window, '5 millis')
            yield* runtime.settled
            yield* adjusted(window, '60 millis')
            yield* runtime.settled
            read.push(yield* toy.read(id))
            return { read, unloaded: [...entities] }
          }))
      }), { read: [1, 0], unloaded: [id, id] })
  }, 60_000)

  test('a process over its capacity unloads its least recently used idle entity, under prioritized schedules', () => {
    const tester = { _tag: 'Tester' } as const
    // Each schedule moves the points where the entity told to leave runs between two steps of the caller.
    explored(() =>
      Effect.gen(function*() {
        const { layer } = yield* hands()
        const { entities, unloaded } = unloads()
        const at = yield* DateTime.now
        // A wait that never runs out in the test: only the capacity unloads (decision 0076).
        return yield* process({ unloaded, capacity: { entities: 2 } }, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(program), layer)
            for (const entity of ['e-1', 'e-2']) {
              yield* toy.create(entity, { at }, { requestId: entity, sender: tester })
            }
            yield* runtime.settled
            const left = [[...entities]]
            // `e-1` is used again, so `e-2` is the least recently used when a third enters, and it has left
            // once the process is settled.
            yield* toy.send('e-1', { _tag: 'Refuse', nonce: 'n-1' }, { requestId: 'r-1', sender: tester })
            yield* runtime.settled
            yield* toy.create('e-3', { at }, { requestId: 'e-3', sender: tester })
            yield* runtime.settled
            left.push([...entities])
            // A caller loads it again, and `e-1` leaves in its turn.
            yield* toy.send('e-2', { _tag: 'Refuse', nonce: 'n-2' }, { requestId: 'r-2', sender: tester })
            yield* runtime.settled
            left.push([...entities])
            return left
          }))
      }), [[], ['e-2'], ['e-2', 'e-1']])
  }, 60_000)

  test('entities woken past the capacity each fire their timer and leave once, under prioritized schedules', () => {
    const tester = { _tag: 'Tester' } as const
    // A timer due is no spare entity (decision 0078): none is told to leave before it fires, and woken again.
    explored((window) =>
      Effect.gen(function*() {
        const { layer } = yield* hands()
        const { entities, unloaded } = unloads()
        const fired: Array<string> = []
        const at = yield* DateTime.now
        return yield* process({
          unloaded,
          passivate: { millis: 5 },
          capacity: { entities: 1 },
          observe: (entity, event) =>
            Effect.sync(() => {
              if (event._tag === 'Fire') fired.push(entity.id)
            }),
        }, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(program), layer)
            for (const entity of ['w-1', 'w-2']) {
              yield* toy.create(entity, { at }, { requestId: entity, sender: tester })
              yield* runtime.settled
            }
            yield* adjusted(window, '5 millis')
            entities.length = 0
            // Both timers come at once, and the waker activates one entity after the other, past the capacity.
            yield* adjusted(window, '60 millis')
            yield* runtime.settled
            return { fired: [...fired].sort(), woken: entities.length }
          }))
      }), { fired: ['w-1', 'w-2'], woken: 2 })
  }, 60_000)

  test('a busy entity is never unloaded for the capacity, and a capacity of none is refused', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { entities, unloaded } = unloads()
      // An entity whose operations are under way stays: the process holds more than its capacity.
      const { layer } = yield* hands({ holds: true })
      yield* process({ unloaded, capacity: { entities: 1 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          for (const entity of ['f-1', 'f-2']) {
            yield* ran(toy.create(entity, { at }, { requestId: entity, sender: { _tag: 'Tester' } }))
          }
          expect(entities).toEqual([])
        }))
      // A capacity of no entity at all, or of no whole number of them, is the launcher's defect.
      for (const entities of [0, 1.5, Infinity, NaN]) {
        const exit = yield* Effect.exit(process({ capacity: { entities } }, () => Effect.void))
        const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
        expect(cause instanceof InvariantDefect && cause.reason)
          .toBe(`the capacity is ${entities}, which is no positive integer`)
      }
    })))

  test('with no capacity, only time unloads', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { entities, unloaded } = unloads()
      yield* process({ unloaded }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
          for (const entity of ['s-1', 's-2', 's-3']) {
            yield* toy.create(entity, { at }, { requestId: entity, sender: tester })
            yield* runtime.settled
          }
          expect(entities).toEqual([])
        }))
    })))

  test('an entity that crashed holds no place under the capacity, whatever its operations deliver after', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { entities, unloaded } = unloads()
      // Operations that finish once the test lets them, and that an interruption cannot stop before: they deliver
      // after their entity has crashed and left the process.
      const gate = Deferred.makeUnsafe<void>()
      const late = Layer.succeed(Hands, Hands.of({ act: () => Effect.uninterruptible(Deferred.await(gate)) }))
      let dies = true
      yield* process({
        unloaded,
        capacity: { entities: 2 },
        observe: (entity, event) => {
          if (entity.id !== 'x' || event._tag !== 'Receive' || !dies) return Effect.void
          dies = false
          return Effect.die('the runtime failed')
        },
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), late)
          const timers = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
          yield* ran(toy.create('x', { at }, { requestId: 'x', sender: tester }))
          const failed = yield* Effect.exit(toy.send('x', { _tag: 'Refuse', nonce: 'n' }, { requestId: 'r', sender: tester }))
          expect(Exit.isFailure(failed)).toBe(true)
          yield* Deferred.succeed(gate, undefined)
          yield* runtime.settled
          // Two entities fill the capacity, and neither leaves: the one that crashed is not counted.
          for (const entity of ['s-1', 's-2']) {
            yield* timers.create(entity, { at }, { requestId: entity, sender: tester })
            yield* runtime.settled
          }
          expect(entities).toEqual([])
        }))
    })))

  test('the capacity counts the entities of every program the process deploys', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { entities, unloaded } = unloads()
      yield* process({ unloaded, capacity: { entities: 2 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), (yield* hands()).layer)
          const twin = yield* Effect.provide(runtime.deploy({ ...program, name: 'Twin' }), (yield* hands()).layer)
          yield* toy.create('e-1', { at }, { requestId: 'e-1', sender: tester })
          yield* runtime.settled
          yield* twin.create('e-2', { at }, { requestId: 'e-2', sender: tester })
          yield* runtime.settled
          expect(entities).toEqual([])
          // A third entity, of the first program: the process holds three, and the least recently used leaves.
          yield* toy.create('e-3', { at }, { requestId: 'e-3', sender: tester })
          yield* runtime.settled
          expect(entities).toEqual(['e-1'])
        }))
    })))

  test('a process that comes back over its capacity unloads as many as it holds too many', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { entities, unloaded } = unloads()
      const { open, layer } = yield* gated()
      yield* process({ unloaded, capacity: { entities: 1 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          // Two entities busy at once hold the process over its capacity, and stay once their work is done: only
          // an entity that enters tells the others to leave (decision 0076).
          for (const entity of ['f-1', 'f-2']) yield* ran(toy.create(entity, { at }, { requestId: entity, sender: tester }))
          yield* open
          yield* runtime.settled
          expect(entities).toEqual([])
          yield* toy.create('f-3', { at }, { requestId: 'f-3', sender: tester })
          yield* runtime.settled
          expect([...entities].sort()).toEqual(['f-1', 'f-2'])
        }))
    })))

  test('entities entering at once tell no more to leave than the process holds too many, under prioritized schedules', () => {
    explored(() =>
      Effect.gen(function*() {
        const at = yield* DateTime.now
        const { entities, unloaded } = unloads()
        return yield* process({ unloaded, capacity: { entities: 3 } }, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
            for (const entity of ['s-1', 's-2', 's-3']) {
              yield* toy.create(entity, { at }, { requestId: entity, sender: tester })
              yield* runtime.settled
            }
            // Two enter at once: one told to leave and not gone yet counts against the second one's excess.
            yield* together([
              toy.create('s-4', { at }, { requestId: 's-4', sender: tester }),
              toy.create('s-5', { at }, { requestId: 's-5', sender: tester }),
            ])
            yield* runtime.settled
            return [...entities].sort()
          }))
      }), ['s-1', 's-2'])
  }, 60_000)

  test('the entity entering is never told to leave, even with nothing to do', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { entities, unloaded } = unloads()
      yield* process({ unloaded, capacity: { entities: 1 } }, (runtime) =>
        Effect.gen(function*() {
          const busy = yield* Effect.provide(runtime.deploy(program), (yield* hands({ holds: true })).layer)
          const timers = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
          yield* ran(busy.create('f-1', { at }, { requestId: 'f-1', sender: tester }))
          // The process is over its capacity, and only the entity entering has nothing to do: it stays.
          yield* ran(timers.create('s-1', { at }, { requestId: 's-1', sender: tester }))
          expect(entities).toEqual([])
        }))
    })))

  test('an entity told to leave that is sent a message before it leaves stays, and is answered', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { entities, unloaded } = unloads()
      let toy: Library.Handle<T> | null = null
      let answer: Answer<'Refused'> | null = null
      yield* process({
        unloaded,
        capacity: { entities: 1 },
        // Once `s-2` has entered and told `s-1` to leave, and before `s-1`'s loop takes that, `s-1` is sent a
        // message: its loop finds it with something to do, and keeps it.
        at: (point, entity, event) =>
          point === 'AfterReply' && entity.id === 's-2' && event._tag === 'Create' && toy !== null
            ? Effect.map(
              toy.send('s-1', { _tag: 'Refuse', nonce: 'n-1' }, { requestId: 'r-1', sender: tester }),
              (reply) => {
                answer = reply
              },
            )
            : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          toy = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
          yield* toy.create('s-1', { at }, { requestId: 's-1', sender: tester })
          yield* runtime.settled
          yield* toy.create('s-2', { at }, { requestId: 's-2', sender: tester })
          // A loop that unloaded it would lose the message, and one that kept it told would never settle.
          yield* runtime.settled
          expect(answer).toEqual({ _tag: 'Rejected', reason: 'Refused' })
          expect(entities).toEqual([])
          // The next entity to enter finds the process two over its capacity, and both leave.
          yield* toy.create('s-3', { at }, { requestId: 's-3', sender: tester })
          yield* runtime.settled
          expect([...entities].sort()).toEqual(['s-1', 's-2'])
        }))
    })))

  test('an entity whose timer comes due before it takes the telling to leave stays, and fires', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { entities, unloaded } = unloads()
      const clock = ahead()
      const fired: Array<string> = []
      yield* clock.around(process({
        unloaded,
        capacity: { entities: 1 },
        observe: (entity, event) =>
          Effect.sync(() => {
            if (event._tag === 'Fire') fired.push(entity.id)
          }),
        // Once `s-2` has told `s-1` to leave, the wall clock reaches `s-1`'s timer before its loop takes that, as a
        // real clock may: `s-1` is no longer spare (decision 0078).
        at: (point, entity, event) =>
          point === 'AfterReply' && entity.id === 's-2' && event._tag === 'Create'
            ? Effect.sync(() => {
              clock.by.millis = 40
            })
            : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
          yield* toy.create('s-1', { at }, { requestId: 's-1', sender: tester })
          yield* runtime.settled
          yield* toy.create('s-2', { at }, { requestId: 's-2', sender: tester })
          // The sleeps reach the time too, and each timer fires where it is armed.
          yield* clock.adjust('40 millis')
          yield* runtime.settled
          expect({ fired: [...fired].sort(), entities }).toEqual({ fired: ['s-1', 's-2'], entities: [] })
        })))
    })))

  test('an entity whose timer is due by the clock is not spare, and the next least recently used leaves', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { entities, unloaded } = unloads()
      const clock = ahead()
      yield* clock.around(process({ unloaded, capacity: { entities: 2 } }, (runtime) =>
        Effect.gen(function*() {
          const timers = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
          const toy = yield* Effect.provide(runtime.deploy(program), (yield* hands()).layer)
          // `w` is due at 40, and `s` later: both spare until then.
          yield* timers.create('w', { at }, { requestId: 'w', sender: tester })
          yield* runtime.settled
          yield* clock.adjust('10 millis')
          yield* timers.create('s', { at: yield* DateTime.now }, { requestId: 's', sender: tester })
          yield* runtime.settled
          // The clock reaches `w`'s time, exactly, and its sleep has not fired yet when a third entity enters:
          // `w` is about to fire, and `s` is told to leave in its place (decision 0078).
          clock.by.millis = 30
          yield* toy.create('x', { at }, { requestId: 'x', sender: tester })
          clock.by.millis = 0
          yield* clock.adjust('30 millis')
          yield* runtime.settled
          expect(entities).toEqual(['s'])
        })))
    })))

  test('a suspended entity is spare whatever its timers, and leaves for an entity that enters', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { entities, unloaded } = unloads()
      yield* process({ unloaded, capacity: { entities: 1 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
          yield* toy.create('s-1', { at }, { requestId: 's-1', sender: tester })
          expect(yield* toy.send('s-1', { _tag: 'Break', nonce: 'b' }, { requestId: 'b', sender: tester }))
            .toEqual({ _tag: 'Suspended' })
          // Its timer's time passes, and no sleep of it is armed: nothing of it fires.
          yield* TestClock.adjust('50 millis')
          yield* runtime.settled
          yield* toy.create('s-2', { at }, { requestId: 's-2', sender: tester })
          yield* runtime.settled
          expect(entities).toEqual(['s-1'])
        }))
    })))

  test('callers of two unloaded entities over a capacity of one are both answered, under prioritized schedules', () => {
    const want = (nonce: string): Inbound => ({ _tag: 'Want', key: 't', on: true, nonce })
    explored(() =>
      Effect.gen(function*() {
        const at = yield* DateTime.now
        yield* process({}, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
            for (const entity of ['u-1', 'u-2']) yield* toy.create(entity, { at }, { requestId: entity, sender: tester })
            yield* runtime.settled
          }))
        return yield* process({ capacity: { entities: 1 } }, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
            // Each activation holds its caller's event before the other can tell it to leave (decision 0079).
            return yield* together([
              toy.send('u-1', want('n-1'), { requestId: 'r-1', sender: tester }),
              toy.send('u-2', want('n-2'), { requestId: 'r-2', sender: tester }),
            ])
          }))
      }), [{ _tag: 'Accepted' }, { _tag: 'Accepted' }])
  }, 60_000)

  test('a caller interrupted anywhere as it activates its entity leaves the process able to settle', () => {
    const want = (nonce: string): Inbound => ({ _tag: 'Want', key: 't', on: true, nonce })
    // Each schedule moves the point where the interruption reaches the caller.
    explored(() =>
      Effect.gen(function*() {
        const at = yield* DateTime.now
        yield* process({}, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
            yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
            yield* runtime.settled
          }))
        return yield* process({}, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
            const caller = yield* Effect.forkChild(toy.send(id, want('n-1'), { requestId: 'r-1', sender: tester }))
            yield* Fiber.interrupt(caller)
            // What runs detached is counted from the step that forks it to its end: a count left behind would
            // keep this from returning, and the run would not end (decision 0079).
            yield* runtime.settled
            return 'settled'
          }))
      }), 'settled')
  }, 60_000)

  test('a caller interrupted anywhere as it sends leaves its entity’s bound whole, in every schedule within one deviation', () => {
    const want = (nonce: string): Inbound => ({ _tag: 'Want', key: 't', on: true, nonce })
    // Each schedule moves the point where the interruption reaches the caller, the permit taken and the message not
    // offered yet among them (decision 0147). A send that yields between the two, outside an uninterruptible region,
    // keeps the permit in a schedule, and the second send is answered Full.
    explored(() =>
      Effect.gen(function*() {
        const at = yield* DateTime.now
        return yield* process({ callers: { messages: 1 } }, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
            yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
            yield* runtime.settled
            const caller = yield* Effect.forkChild(toy.send(id, want('n-1'), { requestId: 'r-1', sender: tester }))
            yield* Fiber.interrupt(caller)
            yield* runtime.settled
            return yield* toy.send(id, want('n-2'), { requestId: 'r-2', sender: tester })
          }))
      }), { _tag: 'Accepted' }, { bound: 1 })
  }, 60_000)

  test('a caller loads an unloaded entity again, and is answered', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const { entities, unloaded } = unloads()
      const at = yield* DateTime.now
      yield* process({ unloaded, passivate: { millis: 5 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: { _tag: 'Tester' } })
          yield* runtime.settled
          yield* TestClock.adjust('5 millis')
          expect(entities).toEqual([id])
          // The entity is loaded again to handle the message, and the reply is the step's.
          expect(yield* toy.send(id, { _tag: 'Want', key: 't', on: false, nonce: 'w' }, {
            requestId: 'r1',
            sender: { _tag: 'Tester' },
          })).toEqual({ _tag: 'Accepted' })
          expect(yield* toy.read(id)).toBe(0)
        }))
    })))

  test('a process starts with the entities holding an operation, and the stored timers wake the rest', () =>
    database(Effect.gen(function*() {
      const { events, observe } = log()
      const at = yield* DateTime.now
      const store = storage(program, yield* SqlClient.SqlClient)
      // The first process leaves the entity with its timer alone: every operation ran and was delivered.
      yield* process({ observe }, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: { _tag: 'Tester' } })
          yield* runtime.settled
        }))
      expect((yield* store.load(id))?.state.want).toEqual(['t'])
      const since = (yield* store.load(id))?.state.since ?? at
      // There is nothing for a process to activate: a timer is not an operation a crash interrupted.
      expect(yield* store.interrupted).toEqual([])
      // The timer is the entity's only work: it is due at the time the state holds, a reading that counts the
      // entity among the process's own gives it neither as due nor as the next, and the time is `rings`.
      const rings = DateTime.toEpochMillis(since) + 40
      expect(yield* store.due(rings - 1, [])).toEqual({ ready: [], next: rings })
      expect(yield* store.due(rings, [])).toEqual({ ready: [id], next: null })
      expect(yield* store.due(rings, [id])).toEqual({ ready: [], next: null })
      // However many entities the process holds: they are not parameters of the query, whose number SQLite caps.
      const many = Array.from({ length: 40_000 }, (_, n) => `loaded-${n}`)
      expect(yield* store.due(rings, many)).toEqual({ ready: [id], next: null })
      yield* process({ observe }, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          yield* Effect.provide(runtime.deploy(program), layer)
          // The waker has read the stored timers once the process is settled, and sleeps until the earliest.
          yield* runtime.settled
          yield* TestClock.adjust('10 millis')
          expect(events.filter((event) => event._tag === 'Restart').length).toBe(0)
          // Its time comes, and the entity is activated for it.
          yield* TestClock.adjust('60 millis')
          yield* runtime.settled
          expect(events.filter((event) => event._tag === 'Restart').length).toBe(1)
        }))
      expect((yield* store.load(id))?.state.want).toEqual([])
      expect(yield* persisted).toEqual(replayed(since, events))
    })))

  test('the due timers pass over the loaded entities, page after page', () =>
    database(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const store = storage(program, sql)
      // 600 entities with a timer: the even ones are due at 10, the odd ones at 1_000 + n. The process holds
      // the first 500, more than a page of either reading.
      const ids = Array.from({ length: 600 }, (_, n) => `e-${String(n).padStart(3, '0')}`)
      for (const [n, entity] of ids.entries()) {
        yield* sql`INSERT INTO entity_keys ${
          sql.insert({
            name: program.name,
            id: entity,
            key: 't',
            parameter: '',
            incarnation: 1,
            version: 1,
            work: '{}',
            delivery: null,
            due: n % 2 === 0 ? 10 : 1_000 + n,
          })
        }`
      }
      const due = yield* store.due(100, ids.slice(0, 500))
      expect(due.ready).toEqual(ids.slice(500).filter((_, n) => n % 2 === 0))
      expect(due.next).toBe(1_000 + 501)
    })))

  test('a suspended entity is unloaded, no timer of its fires, and an operator loads it again', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const { entities, unloaded } = unloads()
      const at = yield* DateTime.now
      const store = storage(program, yield* SqlClient.SqlClient)
      yield* process({ unloaded, passivate: { millis: 5 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: { _tag: 'Tester' } })
          yield* runtime.settled
          expect(yield* toy.send(id, { _tag: 'Break', nonce: 'b' }, {
            requestId: 'break',
            sender: { _tag: 'Tester' },
          })).toEqual({ _tag: 'Suspended' })
          // It is unloaded with the message it died on, and its timer's time passes without firing.
          yield* TestClock.adjust('5 millis')
          expect(entities).toEqual([id])
          yield* TestClock.adjust('80 millis')
          expect(entities).toEqual([id])
          const stored = yield* store.load(id)
          expect(stored?.suspension?.on).toEqual({ _tag: 'Message' })
          expect(stored?.mailbox.length).toBe(1)
          // It holds its timer still, and is left out of both readings a process makes of what has to run.
          expect(Object.values(stored?.keys ?? {}).map((held) => held.key)).toEqual([{ name: 't' }])
          expect(yield* store.interrupted).toEqual([])
          expect(yield* store.due(DateTime.toEpochMillis(yield* DateTime.now) + 1_000, [])).toEqual({
            ready: [],
            next: null,
          })
          // An operator's act loads it again, and what it holds runs.
          yield* toy.discard(id)
          yield* runtime.settled
          expect((yield* store.load(id))?.suspension).toBe(null)
        }))
    })))

  test('no caller is lost to a passivation', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const { entities, unloaded } = unloads()
      const at = yield* DateTime.now
      const nonces = Array.from({ length: 24 }, (_, index) => index)
      // An entity unloaded as soon as it has nothing to do, with the callers arriving across the moments it is:
      // each one finds it loaded or loads it again, and none is lost to a passivation in between. The callers
      // are spread far enough apart that the entity has time to be unloaded between them, which the count of
      // unloads below is what checks.
      yield* process({ unloaded, passivate: { millis: 1 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: { _tag: 'Tester' } })
          yield* runtime.settled
          const callers = yield* running(Effect.forEach(
            nonces,
            (nth) =>
              // The timer is the key a step may drop: an operation leaves only by completing (decision 0005).
              Effect.delay(
                toy.send(id, { _tag: 'Want', key: 't', on: nth % 2 === 0, nonce: `n${nth}` }, {
                  requestId: `r${nth}`,
                  sender: { _tag: 'Tester' },
                }),
                `${nth * 5} millis`,
              ),
            { concurrency: 'unbounded' },
          ))
          yield* TestClock.adjust(`${nonces.length * 5} millis`)
          // Every caller was answered: a message lost to a passivation would wait for ever.
          expect(yield* Fiber.join(callers)).toEqual(nonces.map(() => ({ _tag: 'Accepted' })))
          yield* runtime.settled
        }))
      // The entity was unloaded and loaded again throughout, which is what the test is about: a run that kept
      // it loaded would pass as well, and say nothing.
      expect(entities.length).toBeGreaterThan(nonces.length / 2)
      const stored = yield* storage(program, yield* SqlClient.SqlClient).load(id)
      // Every message was applied once. The callers are concurrent, so the order is the mailbox's, not theirs.
      expect([...(stored?.state.applied ?? [])].sort()).toEqual(nonces.map((nth) => `n${nth}`).sort())
    })))

  test('an activation holds its own entity alone, and its callers wait for the one machine it builds', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const { events, observe } = log()
      const at = yield* DateTime.now
      const tester = { _tag: 'Tester' } as const
      const want = (nonce: string): Inbound => ({ _tag: 'Want', key: 't', on: true, nonce })
      // Two entities left with their timers alone, which the next process does not hold.
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create('slow', { at }, { requestId: 'c-slow', sender: tester })
          yield* toy.create('other', { at }, { requestId: 'c-other', sender: tester })
          yield* runtime.settled
        }))
      const gate = yield* Deferred.make<void>()
      yield* process({
        // The activation of the first entity holds once its `Restart` is applied, as a slow database would. It
        // writes nothing, so no point of the crash table sees it.
        observe: (entity, event) =>
          Effect.andThen(
            observe(entity, event),
            entity.id === 'slow' && event._tag === 'Restart' ? Deferred.await(gate) : Effect.void,
          ),
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          const first = yield* running(toy.send('slow', want('n-1'), { requestId: 'r-1', sender: tester }))
          const second = yield* running(toy.send('slow', want('n-2'), { requestId: 'r-2', sender: tester }))
          // Another entity is loaded and answered meanwhile (decision 0067). A wait for the activation held would
          // hold this call for ever, which the test's own timeout reports.
          expect(yield* toy.send('other', want('n-3'), { requestId: 'r-3', sender: tester }))
            .toEqual({ _tag: 'Accepted' })
          yield* Deferred.succeed(gate, undefined)
          expect(yield* Fiber.join(first)).toEqual({ _tag: 'Accepted' })
          expect(yield* Fiber.join(second)).toEqual({ _tag: 'Accepted' })
          yield* runtime.settled
        }))
      // One machine was built for the entity held, whichever caller came first.
      expect(events.filter((event) => event._tag === 'Restart').length).toBe(2)
      const stored = yield* storage(program, yield* SqlClient.SqlClient).load('slow')
      expect([...(stored?.state.applied ?? [])].sort()).toEqual(['n-1', 'n-2'])
    })))

  // The load is under the entity's lock: two callers never read it from storage and build a machine each
  // (decisions 0029, 0067).
  test('two callers of an entity not loaded build one machine for it, under prioritized schedules', () => {
    const tester = { _tag: 'Tester' } as const
    const want = (nonce: string): Inbound => ({ _tag: 'Want', key: 't', on: true, nonce })
    explored(() =>
      Effect.gen(function*() {
        const { layer } = yield* hands()
        const { events, observe } = log()
        const at = yield* DateTime.now
        yield* process({}, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(program), layer)
            yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
            yield* runtime.settled
          }))
        const both = yield* process({ observe }, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(program), layer)
            return yield* together([
              toy.send(id, want('n-1'), { requestId: 'r-1', sender: tester }),
              toy.send(id, want('n-2'), { requestId: 'r-2', sender: tester }),
            ])
          }))
        return { both, restarts: events.filter((event) => event._tag === 'Restart').length }
      }), { both: [{ _tag: 'Accepted' }, { _tag: 'Accepted' }], restarts: 1 })
  }, 60_000)

  test('two creations of one entity at once build one machine, and the second is answered AlreadyExists', () => {
    const tester = { _tag: 'Tester' } as const
    explored(() =>
      Effect.gen(function*() {
        const { layer } = yield* hands()
        const at = yield* DateTime.now
        return yield* process({}, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(program), layer)
            const both = yield* together([
              Effect.exit(toy.create(id, { at }, { requestId: 'c-1', sender: tester })),
              Effect.exit(toy.create(id, { at }, { requestId: 'c-2', sender: tester })),
            ])
            return both.map((exit) => Exit.isSuccess(exit) ? exit.value._tag : 'died').sort()
          }))
      }), ['AlreadyExists', 'Created'])
  }, 60_000)

  test('an activation whose caller gives up is finished all the same, and the next caller is answered', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      const tester = { _tag: 'Tester' } as const
      const want = (nonce: string): Inbound => ({ _tag: 'Want', key: 't', on: true, nonce })
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
          yield* runtime.settled
        }))
      const reached = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      yield* process({
        // The activation holds once its `Restart` is applied, as a slow database would.
        observe: (_entity, event) =>
          event._tag === 'Restart'
            ? Effect.andThen(Deferred.succeed(reached, undefined), Deferred.await(gate))
            : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          const first = yield* Effect.forkChild(toy.send(id, want('n-1'), { requestId: 'r-1', sender: tester }))
          yield* Deferred.await(reached)
          // Its caller gives up, a timeout of its own or an operation stopped: the activation is the entity's, and
          // goes on (decision 0079). One left half done would hold the next caller for ever.
          yield* Fiber.interrupt(first)
          yield* Deferred.succeed(gate, undefined)
          expect(yield* toy.send(id, want('n-2'), { requestId: 'r-2', sender: tester })).toEqual({ _tag: 'Accepted' })
          yield* runtime.settled
        }))
    })))

  test('a creation whose caller gives up after its commit starts its work all the same', () =>
    database(Effect.gen(function*() {
      const { acted, layer } = yield* hands()
      const at = yield* DateTime.now
      const tester = { _tag: 'Tester' } as const
      const reached = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      yield* process({
        at: (point, _entity, event) =>
          point === 'AfterCommit' && event._tag === 'Create'
            ? Effect.andThen(Deferred.succeed(reached, undefined), Deferred.await(gate))
            : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          const creator = yield* Effect.forkChild(toy.create(id, { at }, { requestId: 'creation', sender: tester }))
          yield* Deferred.await(reached)
          yield* Fiber.interrupt(creator)
          yield* Deferred.succeed(gate, undefined)
          // The entity is stored with its operations, and runs them: one left unloaded would hold them until a
          // caller came, since no timer of its is due (decision 0079).
          yield* runtime.settled
          expect([...acted].map((act) => act.split(':')[0]).sort()).toEqual(['a', 'b', 'c'])
        }))
    })))
})

describe('the crash table', () => {
  const points: ReadonlyArray<Point> = ['BeforeCommit', 'AfterCommit', 'AfterReply']

  test('each point of a creation is given the creation', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const reached: Array<string> = []
      yield* process({
        at: (point, _entity, event) =>
          Effect.sync(() => {
            reached.push(`${point} ${event._tag}`)
          }),
      }, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: { _tag: 'Tester' } })
        }))
      expect(reached).toEqual(points.map((point) => `${point} Create`))
    })))

  // A caller's message that finds the mailbox empty is handled in the transaction that receives it, so this runtime
  // never leaves one there (decision 0074); one a store holds from before is handled at the next start
  // (decision 0071).
  test('a message left in the mailbox of an idle entity is handled at the next start, with no retry', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const sender = { _tag: 'Tester' } as const
      const sql = yield* SqlClient.SqlClient
      const store = storage(program, sql)
      // The entity has nothing left under way, so nothing else would have a process start it.
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender })
          yield* runtime.settled
          yield* TestClock.adjust('60 millis')
          yield* runtime.settled
        }))
      const request = { _tag: 'Caller', sender, id: 'left' } as const
      yield* sql.withTransaction(store.write(id, {
        created: false,
        entity: null,
        suspension: null,
        keys: [],
        gone: [],
        incarnations: 0,
        handled: 0,
        queued: [{
          _tag: 'Inbound',
          message: { _tag: 'Want', key: 'a', on: false, nonce: 'left' },
          request: Schema.encodeSync(Machine.requestCodec(program))(request),
          keep: null,
        }],
        replies: [],
        ended: [],
        shown: null,
        published: null,
      }, 0))
      expect((yield* store.load(id))?.mailbox.length).toBe(1)
      // Nobody retries: the process that starts next handles the message on its own.
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          yield* Effect.provide(runtime.deploy(program), layer)
          yield* runtime.settled
        }))
      const stored = yield* store.load(id)
      expect({ mailbox: stored?.mailbox, applied: stored?.state.applied }).toEqual({ mailbox: [], applied: ['left'] })
    })))

  for (const point of points) {
    for (const nth of [1, 2, 3, 5, 8]) {
      test(`a crash at ${point}, the ${nth}th time, leaves the entity where the machine leaves it`, () =>
        database(Effect.gen(function*() {
          const { events, observe } = log()
          const at = yield* DateTime.now
          const sql = yield* SqlClient.SqlClient
          const store = storage(program, sql)

          // The entity is created, and its work under way, before the crash: a creation that never commits
          // stores nothing, and there is no entity to compare.
          yield* process({ observe }, (runtime) =>
            Effect.gen(function*() {
              const { layer } = yield* hands()
              const toy = yield* Effect.provide(runtime.deploy(program), layer)
              yield* toy.create(id, { at }, { requestId: 'creation', sender: { _tag: 'Tester' } })
              yield* runtime.settled
            }))
          const since = (yield* store.load(id))?.state.since ?? at

          // A process that dies at the nth time it reaches `point`: the fiber never returns from it, and the
          // scope closing interrupts everything that was running.
          const crashed = yield* Deferred.make<void>()
          let seen = 0
          const dying = process(
            {
              observe,
              // The fiber that reaches the point never returns from it, and the crash interrupts the process:
              // the activation of a deploy is one of the places it may happen.
              at: (reached) =>
                reached !== point || ++seen !== nth
                  ? Effect.void
                  : Effect.flatMap(Deferred.succeed(crashed, undefined), () => Effect.never),
            },
            (runtime) =>
              Effect.gen(function*() {
                const { layer } = yield* hands()
                const toy = yield* Effect.provide(runtime.deploy(program), layer)
                // Four requests at once: the mailbox holds what the crash finds unhandled, and the callers that
                // die with the process are answered by the replies stored for their retries.
                const sends: ReadonlyArray<Inbound> = [
                  { _tag: 'Want', key: 'a', on: true, nonce: 'w1' },
                  { _tag: 'Want', key: 'b', on: false, nonce: 'w2' },
                  { _tag: 'Refuse', nonce: 'w3' },
                  { _tag: 'Want', key: 't', on: true, nonce: 'w4' },
                ]
                yield* running(Effect.forEach(
                  sends.entries(),
                  ([nonce, message]) => toy.send(id, message, { requestId: `r${nonce}`, sender: { _tag: 'Tester' } }),
                  { concurrency: 'unbounded' },
                ))
                // The timer's time comes in this process too, if the process lives that long.
                yield* TestClock.adjust('80 millis')
              }),
          )
          yield* Effect.raceFirst(dying, Deferred.await(crashed))

          // The process that follows the crash activates what was stored, and finishes it.
          yield* process({ observe }, (runtime) =>
            Effect.gen(function*() {
              const { layer } = yield* hands()
              yield* Effect.provide(runtime.deploy(program), layer)
              yield* runtime.settled
              yield* TestClock.adjust('60 millis')
              yield* runtime.settled
            }))

          // The crash happened where the test asked: a point never reached would make the comparison vacuous.
          expect(yield* Deferred.isDone(crashed)).toBe(true)
          // And the time the test moved through was acted on: a timer it passed would be due still.
          expect((yield* store.due(DateTime.toEpochMillis(yield* DateTime.now), [])).ready).toEqual([])
          expect(yield* persisted).toEqual(replayed(since, events))
          expect(
            (yield* store.published('projection', [], all))
              .map(({ kind, message, value }) => ({ kind, message, value })),
          )
            .toEqual(publishedOf(since, events))
        })))
    }
  }
})

/**
 * The same comparison under random sequences of events, with a crash at a point the sequence chooses: whatever
 * the interleaving of the messages, the completions, the timers and the crash, the database ends where the
 * machine ends on the events that committed.
 */
describe('random sequences of events', () => {
  type Command =
    | Readonly<{ _tag: 'Send'; kind: Inbound['_tag']; key: Key; on: boolean }>
    | Readonly<{ _tag: 'Retry'; pick: number }>
    | Readonly<{ _tag: 'Create' }>
    | Readonly<{ _tag: 'Wait' }>
    | Readonly<{ _tag: 'Resume' }>
    | Readonly<{ _tag: 'Discard' }>

  const command: fc.Arbitrary<Command> = fc.oneof(
    {
      weight: 6,
      arbitrary: fc.record({
        _tag: fc.constant('Send' as const),
        kind: fc.constantFrom<Inbound['_tag']>('Want', 'Want', 'Want', 'Refuse', 'Break'),
        key: fc.constantFrom(...keys),
        on: fc.boolean(),
      }),
    },
    { weight: 2, arbitrary: fc.record({ _tag: fc.constant('Retry' as const), pick: fc.nat() }) },
    { weight: 1, arbitrary: fc.constant({ _tag: 'Create' as const }) },
    { weight: 3, arbitrary: fc.constant({ _tag: 'Wait' as const }) },
    { weight: 2, arbitrary: fc.constant({ _tag: 'Resume' as const }) },
    { weight: 1, arbitrary: fc.constant({ _tag: 'Discard' as const }) },
  )

  /**
   * How long an entity with nothing to do stays loaded, or null for a run that keeps it loaded throughout: a
   * passivation is a `Restart` the runtime chose, and the comparison holds across it (decision 0029).
   */
  const passivates = fc.option(fc.integer({ min: 1, max: 20 }), { nil: null })

  /** Where the process dies, if it reaches it: a run without a point is a run with no crash. */
  const crash = fc.option(
    fc.record({
      point: fc.constantFrom<Point>('BeforeCommit', 'AfterCommit', 'AfterReply'),
      nth: fc.integer({ min: 1, max: 12 }),
    }),
    { nil: null },
  )

  const message = (command: Extract<Command, { _tag: 'Send' }>, nonce: string): Inbound =>
    command.kind === 'Want'
      ? { _tag: 'Want', key: command.key, on: command.on, nonce }
      : command.kind === 'Refuse'
      ? { _tag: 'Refuse', nonce }
      : { _tag: 'Break', nonce }

  test('the database ends where the machine ends', () =>
    fc.assert(
      fc.asyncProperty(
        fc.array(command, { maxLength: 14 }),
        crash,
        passivates,
        (commands, dies, millis) =>
          database(Effect.gen(function*() {
            const { events, observe } = log()
            const at = yield* DateTime.now
            const store = storage(program, yield* SqlClient.SqlClient)
            const crashed = yield* Deferred.make<void>()
            let seen = 0
            const passivate = millis === null ? {} : { passivate: { millis } }
            const options: Options & Hooks = {
              observe,
              ...passivate,
              at: (reached) =>
                dies === null || reached !== dies.point || ++seen !== dies.nth
                  ? Effect.void
                  : Effect.flatMap(Deferred.succeed(crashed, undefined), () => Effect.never),
            }

            const driven = process(options, (runtime) =>
              Effect.gen(function*() {
                const { layer } = yield* hands()
                const toy = yield* Effect.provide(runtime.deploy(program), layer)
                const creation = { requestId: 'creation', sender: { _tag: 'Tester' as const } }
                yield* toy.create(id, { at }, creation)
                const sent: Array<Readonly<{ requestId: string; message: Inbound }>> = []
                // The callers that arrive together: they are started at once, at the next command that is no
                // caller's, and each of them is answered or waits by then. A suspended entity answers none of
                // them until it is resumed.
                let arriving: Array<Effect.Effect<unknown>> = []
                const arrive = Effect.suspend(() => {
                  const callers = arriving
                  arriving = []
                  return callers.length === 0
                    ? Effect.void
                    : Effect.asVoid(running(Effect.all(callers.map(Effect.exit), { concurrency: 'unbounded' })))
                })
                for (const [nth, command] of commands.entries()) {
                  switch (command._tag) {
                    case 'Send': {
                      const request = { requestId: `r${nth}`, message: message(command, `n${nth}`) }
                      sent.push(request)
                      arriving.push(
                        toy.send(id, request.message, { requestId: request.requestId, sender: { _tag: 'Tester' } }),
                      )
                      break
                    }
                    case 'Retry': {
                      const request = sent[command.pick % Math.max(1, sent.length)]
                      if (request === undefined) break
                      arriving.push(
                        toy.send(id, request.message, { requestId: request.requestId, sender: { _tag: 'Tester' } }),
                      )
                      break
                    }
                    case 'Create':
                      arriving.push(toy.create(id, { at }, creation))
                      break
                    case 'Wait':
                      yield* arrive
                      yield* TestClock.adjust('8 millis')
                      break
                    case 'Resume':
                      yield* arrive
                      yield* toy.resume(id)
                      break
                    case 'Discard':
                      yield* arrive
                      yield* toy.discard(id)
                      break
                  }
                }
                yield* arrive
                yield* TestClock.adjust('60 millis')
              }))
            yield* Effect.raceFirst(driven, Deferred.await(crashed))
            const since = (yield* store.load(id))?.state.since ?? at

            // The process that follows takes it from what is stored, and finishes what it finds under way.
            yield* process({ observe, ...passivate }, (runtime) =>
              Effect.gen(function*() {
                const { layer } = yield* hands()
                yield* Effect.provide(runtime.deploy(program), layer)
                yield* runtime.settled
                yield* TestClock.adjust('60 millis')
                yield* runtime.settled
              }))

            // The time the test moved through was acted on: a timer it passed would be due still.
            expect((yield* store.due(DateTime.toEpochMillis(yield* DateTime.now), [])).ready).toEqual([])
            expect(yield* persisted).toEqual(replayed(since, events))
            // A read gives the row, which every event that changed the state wrote again (decision 0121).
            const last = yield* store.load(id)
            expect(yield* store.projected(id)).toEqual(last === null ? null : program.project(last.state))
            expect(
              (yield* store.published('projection', [], all))
                .map(({ kind, message, value }) => ({ kind, message, value })),
            ).toEqual(publishedOf(since, events))
          })),
      ),
      { numRuns: 500 },
    ), 60_000)
})

/**
 * The read model: one row per entity, holding what callers read of it and the values of the program's indexes,
 * written in the step's transaction, and a query across them (decision 0032).
 */
describe('the read model', () => {
  const tester = { _tag: 'Tester' } as const
  const ids = ['t-1', 't-2', 't-3']
  const held = ['t-1', 't-3']
  /** A later version of the program that counts the other way: its index is not the one the rows hold. */
  const negated: Program<T> = { ...program, indexes: { wanted: (projection) => -projection } }

  /** Three toys with nothing left under way: everything they were created with ran, and each reads 0. */
  const settled = (runtime: Runtime, at: DateTime.Utc) =>
    Effect.gen(function*() {
      const { layer } = yield* hands()
      const toy = yield* Effect.provide(runtime.deploy(program), layer)
      for (const id of ids) yield* toy.create(id, { at }, { requestId: `c-${id}`, sender: tester })
      yield* runtime.settled
      yield* TestClock.adjust('60 millis')
      yield* runtime.settled
      return toy
    })

  /** Two of them given work that never comes back, so that the three do not all read the same. */
  const working = (runtime: Runtime, of: Program<T>) =>
    Effect.gen(function*() {
      const { layer } = yield* hands({ holds: true })
      const toy = yield* Effect.provide(runtime.deploy(of), layer)
      for (const id of held) {
        yield* toy.send(id, { _tag: 'Want', key: 'a', on: true, nonce: `on-${id}` }, {
          requestId: `on-${id}`,
          sender: tester,
        })
      }
      return toy
    })

  test('a query finds the entities by an index, in order, and gives what callers read', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* settled(runtime, at)
          expect(yield* toy.query({ limit: all })).toEqual(ids.map((id) => ({ id, projection: 0, indexes: { wanted: 0 } })))
        }))
      // The rows outlive the process that wrote them, and each step writes its own.
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* working(runtime, program)
          expect(yield* toy.read('t-1')).toBe(1)
          expect(yield* toy.query({ limit: all, where: [{ index: 'wanted', is: '=', value: 0 }] }))
            .toEqual([{ id: 't-2', projection: 0, indexes: { wanted: 0 } }])
          expect((yield* toy.query({ limit: all, order: { index: 'wanted', descending: true } })).map(({ id }) => id))
            .toEqual(['t-3', 't-1', 't-2'])
          // A descending order reverses the ids of the rows that tie too (decision 0145).
          expect((yield* toy.query({ order: { index: 'wanted', descending: true }, limit: 2 })).map(({ id }) => id))
            .toEqual(['t-3', 't-1'])
          expect(yield* toy.query({ limit: all, where: [{ index: 'wanted', is: '>', value: 9 }] })).toEqual([])
        }))
    })))

  test('a read answers from the row, with a new program whose project dies on the state', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) => Effect.asVoid(settled(runtime, at)))
      yield* process({}, (runtime) => Effect.asVoid(working(runtime, program)))
      const dies: Program<T> = {
        ...program,
        project: () => {
          throw new Error('project dies')
        },
      }
      // 't-1' and 't-3' hold an operation, so the deploy activates them, and the new program suspends them on their
      // activation. 't-2' is not loaded. A read calls no program, and each reads the row its last step wrote
      // (decision 0121).
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(dies), layer)
          expect((yield* toy.suspended).map(({ id }) => id)).toEqual(held)
          expect(yield* Effect.forEach(ids, toy.read)).toEqual([1, 0, 1])
          expect(yield* toy.read('t-4')).toBeNull()
        }))
    })))

  test('reindex leaves the row of an entity whose state the new project dies on, names it, and writes the rest', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) => Effect.asVoid(settled(runtime, at)))
      yield* process({}, (runtime) => Effect.asVoid(working(runtime, program)))
      // A new version that counts the other way, and dies on the state of 't-2', which wants nothing. 't-1' and
      // 't-3' are activated by the deploy, and their projection is computed there; 't-2' is not loaded.
      const dies: Program<T> = {
        ...negated,
        project: (state) => {
          const shown = program.project(state)
          if (shown === 0) throw new Error('project dies on nothing wanted')
          return shown
        },
      }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(dies), layer)
          expect(yield* toy.reindex).toEqual({
            written: 2,
            failed: [{ id: 't-2', cause: 'Error: project dies on nothing wanted' }],
          })
          // The rows of 't-1' and 't-3' are the new version's, and the row of 't-2' is the one before (decision 0122).
          expect((yield* toy.query({ limit: all, where: [{ index: 'wanted', is: '=', value: -1 }] })).map(({ id }) => id))
            .toEqual(held)
          expect(yield* toy.read('t-2')).toBe(0)
        }))
    })))

  test('a deploy leaves SQLite an index of the expression the query reads', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) => Effect.asVoid(settled(runtime, at)))
      const sql = yield* SqlClient.SqlClient
      const plan = yield* sql.unsafe<{ detail: string }>(
        `EXPLAIN QUERY PLAN SELECT id FROM projections
         WHERE name = 'Toy' AND json_extract(indexes, '$.wanted') <= 0`,
      )
      // The index is on the expression, so it is used only where a query writes the expression the same way.
      expect(plan.map(({ detail }) => detail).join(' ')).toContain('INDEX projections Toy wanted by id (name=? AND <expr>')
    })))

  test('reindex writes the rows again for an index a new version changed', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) => Effect.asVoid(settled(runtime, at)))
      yield* process({}, (runtime) => Effect.asVoid(working(runtime, program)))
      // The entities take no step in this process — their operations are started again, and hold — so nothing
      // writes their rows, which hold what the version before counted.
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* working(runtime, negated)
          expect(yield* toy.query({ limit: all, where: [{ index: 'wanted', is: '<', value: 0 }] })).toEqual([])
          expect(yield* toy.reindex).toEqual({ written: 3, failed: [] })
          expect((yield* toy.query({ limit: all, where: [{ index: 'wanted', is: '=', value: -1 }] })).map(({ id }) => id))
            .toEqual(held)
        }))
    })))

  // A row is written only if the state it was computed from is still the one stored (decision 0070).
  test('reindex leaves no row a step has moved past, under prioritized schedules', () => {
    // The schedules are explored from the reindex on: what comes before only makes the entities it walks.
    explored((window) =>
      Effect.gen(function*() {
        const at = yield* DateTime.now
        // Forty toys more, walked before the one that steps, so that the walk is long enough to be stepped into.
        const walked = [...Array.from({ length: 40 }, (_, n) => `s-${String(n).padStart(2, '0')}`), ...ids]
        yield* process({}, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* settled(runtime, at)
            for (const id of walked.slice(0, 40)) {
              yield* toy.create(id, { at }, { requestId: `c-${id}`, sender: tester })
            }
            yield* runtime.settled
            yield* TestClock.adjust('60 millis')
            yield* runtime.settled
          }))
        return yield* process({}, (runtime) =>
          Effect.gen(function*() {
            const { layer } = yield* hands({ holds: true })
            const toy = yield* Effect.provide(runtime.deploy(negated), layer)
            // The step lands in the walk, between the reading of the state of 't-3' and the writing of its row.
            yield* opened(window, true)
            const reindexing = yield* Effect.forkChild(toy.reindex)
            yield* toy.send('t-3', { _tag: 'Want', key: 'a', on: true, nonce: 'on' }, {
              requestId: 'on',
              sender: tester,
            })
            yield* Fiber.join(reindexing)
            const read = yield* Effect.forEach(walked, (id) =>
              Effect.map(toy.read(id), (projection) => ({ id, projection })))
            const rows = (yield* toy.query({ limit: all })).map(({ id, projection }) => ({ id, projection }))
            return { stale: rows.filter((row) => !read.some((one) => JSON.stringify(one) === JSON.stringify(row))) }
          }))
      }), { stale: [] }, { runs: 200, open: false })
  }, 60_000)
})

describe('publishing what happened', () => {
  const tester = { _tag: 'Tester' } as const

  test('a creation, and every step that changes what callers read, publishes a row', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          // The operations hold, so nothing but the messages sent here changes the state.
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
          // The key is wanted already: the state changes, since the nonce is applied, and the projection does not.
          yield* toy.send(id, { _tag: 'Want', key: 't', on: true, nonce: 'on' }, { requestId: 'on', sender: tester })
          // A timer may be dropped in any state: what callers read falls, and the step publishes what it handled.
          yield* toy.send(id, { _tag: 'Want', key: 't', on: false, nonce: 'off' }, { requestId: 'off', sender: tester })
          expect(yield* toy.send(id, { _tag: 'Refuse', nonce: 'no' }, { requestId: 'no', sender: tester }))
            .toEqual({ _tag: 'Rejected', reason: 'Refused' })
          const rows = yield* toy.published('projection', [], all)
          expect(rows.map(({ partition: _partition, seq: _seq, ...row }) => row)).toEqual([
            { id, topic: 'projection', kind: 'Creation', message: null, value: 4 },
            {
              id,
              topic: 'projection',
              kind: 'Inbound',
              message: { _tag: 'Want', key: 't', on: false, nonce: 'off' },
              value: 3,
            },
          ])
        }))
    })))

  test('a cursor reads what was published after it, and prune drops what every consumer has read', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
          yield* runtime.settled
          yield* TestClock.adjust('60 millis')
          yield* runtime.settled
          const rows = yield* toy.published('projection', [], all)
          // The creation, then the completion of each operation and the firing of the timer: what callers read
          // falls by one at each, whatever order the work came back in.
          expect(rows.map(({ kind }) => kind)).toEqual(['Creation', 'Internal', 'Internal', 'Internal', 'Internal'])
          expect(rows.map(({ value }) => value)).toEqual([4, 3, 2, 1, 0])
          // One entity's rows are in its partition, numbered from 1 in the order its steps committed (decision 0137).
          expect(rows.map(({ partition, seq }) => ({ partition, seq }))).toEqual(
            [1, 2, 3, 4, 5].map((seq) => ({ partition: partitionOf(id, 300), seq })),
          )
          const read = rows.slice(0, 2)
          expect(yield* toy.published('projection', read, all)).toEqual(rows.slice(2))
          expect(yield* toy.published('projection', [], 2)).toEqual(read)
          // A consumer reads from cursors of its own, which the readings above neither moved nor stored: it
          // starts at the beginning, and goes on from where it acked (decision 0039).
          expect(yield* toy.feed('projection', 'queue', 2)).toEqual(read)
          yield* toy.ack('projection', 'queue', read)
          expect(yield* toy.feed('projection', 'queue', all)).toEqual(rows.slice(2))
          expect(yield* toy.prune).toBe(2)
          expect(yield* toy.published('projection', [], all)).toEqual(rows.slice(2))
        }))
    })))

  test('a seq is never given again, so a cursor holds across a prune', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
          // The timer is the key a step may drop and bring back: each way changes what callers read.
          yield* toy.send(id, { _tag: 'Want', key: 't', on: false, nonce: 'off' }, { requestId: 'off', sender: tester })
          const read = yield* toy.published('projection', [], all)
          expect(read.map(({ value }) => value)).toEqual([4, 3])
          // The consumer acted on both rows and acked them: the prune takes what it has read, and its cursor
          // stands.
          yield* toy.ack('projection', 'queue', read)
          expect(yield* toy.prune).toBe(2)
          expect(yield* toy.published('projection', [], all)).toEqual([])
          yield* toy.send(id, { _tag: 'Want', key: 't', on: true, nonce: 'on' }, { requestId: 'on', sender: tester })
          // What is published next is past the cursor: a seq the prune freed is never given again, or the
          // consumer would read from beyond a row it never saw.
          const next = yield* toy.published('projection', read, all)
          expect(next.map(({ value }) => value)).toEqual([4])
          expect(next[0]?.seq ?? 0).toBeGreaterThan(read[1]?.seq ?? 0)
          expect(yield* toy.published('projection', [], all)).toEqual(next)
          expect(yield* toy.feed('projection', 'queue', all)).toEqual(next)
        }))
    })))

  test('the prune waits for the consumer behind it, and forgetting that one lets the log go', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
          yield* runtime.settled
          yield* TestClock.adjust('60 millis')
          yield* runtime.settled
          const rows = yield* toy.published('projection', [], all)
          // Nobody has read the log: a prune drops nothing, since the rows are somebody's to read by hand.
          expect(yield* toy.prune).toBe(0)
          expect(yield* toy.consumers).toEqual([])
          // Two consumers read it, and only one acts on what it read.
          expect(yield* toy.feed('projection', 'queue', all)).toEqual(rows)
          expect(yield* toy.feed('projection', 'audit', all)).toEqual(rows)
          yield* toy.ack('projection', 'queue', rows)
          // An ack never moves a cursor back: what is behind it may be gone.
          yield* toy.ack('projection', 'queue', rows.slice(0, 1))
          expect(yield* toy.consumers).toEqual([
            {
              topic: 'projection',
              consumer: 'audit',
              behind: rows.length,
              cursors: [{ partition: partitionOf(id, 300), seq: 0 }],
            },
            { topic: 'projection', consumer: 'queue', behind: 0, cursors: [] },
          ])
          // The one that is behind holds every row, however far the other has read.
          expect(yield* toy.prune).toBe(0)
          expect(yield* toy.published('projection', [], all)).toEqual(rows)
          // An operator sees what it costs, and forgets the consumer: the next prune passes what it never read.
          yield* toy.forget('projection', 'audit')
          expect(yield* toy.prune).toBe(rows.length)
          expect(yield* toy.published('projection', [], all)).toEqual([])
          // Forgotten and reading again under the same name, it starts from 0: at least once, as a crash before
          // an ack gives (decision 0039).
          expect(yield* toy.feed('projection', 'audit', all)).toEqual([])
          expect((yield* toy.consumers).map(({ consumer }) => consumer)).toEqual(['audit', 'queue'])
        }))
    })))

  test('a consumer whose first reading lands in a prune skips nothing, under prioritized schedules', () => {
    // Each schedule moves the points where the consumer's first reading runs between the statements of the prune
    // (decision 0039).
    const read = { before: 0, after: 0 }
    explored((window) =>
      Effect.gen(function*() {
        const at = yield* DateTime.now
        return yield* process({}, (runtime) =>
          Effect.gen(function*() {
            const { layer } = yield* hands()
            const toy = yield* Effect.provide(runtime.deploy(program), layer)
            yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
            yield* runtime.settled
            yield* TestClock.adjust('60 millis')
            yield* runtime.settled
            const rows = yield* toy.published('projection', [], all)
            // A consumer that has read everything lets the prune go as far as the log.
            yield* toy.ack('projection', 'queue', rows)
            yield* opened(window, true)
            // Each forked as a task of its own, as `together` does.
            const reading = yield* Effect.forkChild(toy.feed('projection', 'late', 1))
            const pruning = yield* Effect.forkChild(toy.prune)
            const first = yield* Fiber.join(reading)
            yield* Fiber.join(pruning)
            if (first.length === 0) {
              read.after++
              return { skipped: [] }
            }
            read.before++
            yield* toy.ack('projection', 'late', first)
            // It holds the log from its first reading: it reads every row after the one it acked.
            const every = [...first, ...yield* toy.feed('projection', 'late', all)]
            return { skipped: rows.filter((row) => !every.some(({ seq }) => seq === row.seq)).map(({ seq }) => seq) }
          }))
      }), { skipped: [] }, { open: false })
    // The race was run both ways: the first reading came before the prune under some schedules, after it under others.
    expect(read.before).toBeGreaterThan(0)
    expect(read.after).toBeGreaterThan(0)
  }, 60_000)

  test('a consumer that waits is given the row a step commits while it reads, under prioritized schedules', () => {
    // Decision 0142: the reading takes its topic's signal before it reads, so that a commit between its reading and
    // its wait ends the wait at once. The clock never moves here, so a wait that missed the commit never ends.
    explored((window) =>
      Effect.gen(function*() {
        const at = yield* DateTime.now
        return yield* process({}, (runtime) =>
          Effect.gen(function*() {
            const { layer } = yield* hands({ holds: true })
            const toy = yield* Effect.provide(runtime.deploy(program), layer)
            yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
            yield* toy.ack('projection', 'queue', yield* toy.feed('projection', 'queue', all))
            yield* opened(window, true)
            const [read] = yield* together<unknown, never, never>([
              toy.feed('projection', 'queue', all, { millis: 60_000 }),
              toy.send(id, { _tag: 'Want', key: 't', on: false, nonce: 'off' }, { requestId: 'off', sender: tester }),
            ])
            yield* opened(window, false)
            return (read as ReadonlyArray<Readonly<{ value: number }>>).map(({ value }) => value)
          }))
      }), [3], { open: false })
  }, 60_000)

  test('a row of another topic does not end a consumer’s wait, which gives nothing once it is over', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      // `high` selects a value no step of the toy changes: only the creation is written there.
      const topical: Program<T & Readonly<{ topics: { count: number; high: boolean } }>> = {
        ...program,
        name: 'Topical',
        topics: { count: (projection) => projection, high: (projection) => projection > 100 },
      }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(topical), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
          yield* toy.ack('high', 'queue', yield* toy.feed('high', 'queue', all))
          // A limit of 0 is given nothing at once, since no row could be given.
          expect(yield* toy.feed('high', 'queue', 0, { millis: 50 })).toEqual([])
          const waiting = yield* running(toy.feed('high', 'queue', all, { millis: 50 }))
          yield* toy.send(id, { _tag: 'Want', key: 't', on: false, nonce: 'off' }, { requestId: 'off', sender: tester })
          expect((yield* toy.published('count', [], all)).map(({ value }) => value)).toEqual([4, 3])
          yield* TestClock.adjust('49 millis')
          expect(waiting.pollUnsafe()).toBeUndefined()
          yield* TestClock.adjust('1 millis')
          expect(yield* Fiber.join(waiting)).toEqual([])
        }))
    })))

  test('a consumer that waits is given nothing once the runtime stops', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const outside = yield* Scope.make()
      // The reading outlives the runtime's scope: without its end at the stop, it would wait out its minute.
      const waiting = yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
          yield* toy.ack('projection', 'queue', yield* toy.feed('projection', 'queue', all))
          const waiting = yield* Effect.forkIn(
            Effect.delay(toy.feed('projection', 'queue', all, { millis: 60_000 }), '1 millis'),
            outside,
          )
          yield* TestClock.adjust('1 millis')
          expect(waiting.pollUnsafe()).toBeUndefined()
          return waiting
        }))
      expect(yield* Fiber.join(waiting)).toEqual([])
      yield* Scope.close(outside, Exit.void)
    })))

  test('an ack past the last seq of its partition moves the cursor to it, and the rows written after are kept', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          const partition = partitionOf(id, 300)
          // Nothing was written yet: no cursor is stored, and the consumer is.
          yield* toy.ack('projection', 'queue', [{ partition, seq: 1_000 }])
          expect(yield* toy.consumers).toEqual([{ topic: 'projection', consumer: 'queue', behind: 0, cursors: [] }])
          yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
          // A cursor past the head of its partition never stood: the creation is past it.
          expect(yield* toy.feed('projection', 'queue', all)).toHaveLength(1)
          // A consumer that acks beyond what it read stops at the last row: the next one is past its cursor.
          yield* toy.ack('projection', 'queue', [{ partition, seq: 1_000 }])
          expect(yield* toy.consumers).toEqual([{ topic: 'projection', consumer: 'queue', behind: 0, cursors: [] }])
          yield* toy.send(id, { _tag: 'Want', key: 't', on: false, nonce: 'off' }, { requestId: 'off', sender: tester })
          expect(yield* toy.prune).toBe(1)
          expect((yield* toy.feed('projection', 'queue', all)).map(({ value }) => value)).toEqual([3])
        }))
    })))

  test('a cursor, a partition or a limit out of its range is its caller’s defect, and stores nothing', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const reasonOf = (exit: Exit.Exit<unknown>) => {
        const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
        return cause instanceof InvariantDefect ? cause.reason : null
      }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
          const partition = partitionOf(id, 300)
          // Each of them is refused before anything is read or stored (decisions 0053, 0137).
          const refused = [
            toy.ack('projection', 'queue', [{ partition, seq: 2.5 }]),
            toy.ack('projection', 'queue', [{ partition, seq: -5 }]),
            toy.ack('projection', 'queue', [{ partition, seq: Number.NaN }]),
            // An integer past what a double holds exactly is no cursor either.
            toy.ack('projection', 'queue', [{ partition, seq: 2 ** 53 }]),
            toy.ack('projection', 'queue', [{ partition: 0, seq: 1 }]),
            toy.ack('projection', 'queue', [{ partition: 301, seq: 1 }]),
            toy.ack('projection', 'queue', [{ partition: 1.5, seq: 1 }]),
            toy.published('projection', [{ partition, seq: -1 }], 1),
            toy.published('projection', [{ partition: -1, seq: 0 }], 1),
            toy.published('projection', [], -1),
            toy.published('projection', [], 1.5),
            toy.feed('projection', 'queue', -1),
            toy.feed('projection', 'queue', Number.POSITIVE_INFINITY),
            // A wait is counted as a limit is (decision 0142).
            toy.feed('projection', 'queue', all, { millis: -1 }),
            toy.feed('projection', 'queue', all, { millis: 0.5 }),
            toy.feed('projection', 'queue', all, {} as never),
            toy.query({ limit: -1 }),
            toy.query({ limit: 0.5 }),
            // A limit left out is refused too, since the types do not hold a cast (decision 0141).
            toy.published('projection', [], undefined as never),
            toy.feed('projection', 'queue', undefined as never),
            toy.query({} as never),
          ]
          for (const call of refused) {
            expect(reasonOf(yield* Effect.exit(call)))
              .toMatch(/^the (cursor|limit|wait) is .+, which is no non-negative|^the partition is .+, which is no integer/)
          }
          // A topic the program does not publish is refused too, before anything is read or stored (decision 0138):
          // a cast lets it through the types.
          const elsewhere = 'billing' as 'projection'
          for (
            const call of [
              toy.published(elsewhere, [], all),
              toy.feed(elsewhere, 'queue', all),
              toy.ack(elsewhere, 'queue', [{ partition, seq: 1 }]),
              toy.forget(elsewhere, 'queue'),
            ]
          ) {
            expect(reasonOf(yield* Effect.exit(call))).toBe("'billing' is no topic of the program 'Toy'")
          }
          // No consumer was stored by a call refused, and a limit of 0 is a limit.
          expect(yield* toy.consumers).toEqual([])
          expect(yield* toy.published('projection', [], 0)).toEqual([])
          expect((yield* toy.published('projection', [], all)).length).toBe(1)
          expect((yield* toy.query({ limit: 0 })).length).toBe(0)
        }))
    })))

  test('entities stepping at once each publish in their partition, and nothing of theirs is lost', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const ids = ['p-1', 'p-2', 'p-3']
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* Effect.forEach(
            ids,
            (id) => toy.create(id, { at }, { requestId: `c-${id}`, sender: tester }),
            { concurrency: 'unbounded' },
          )
          yield* runtime.settled
          yield* TestClock.adjust('60 millis')
          yield* runtime.settled
          const rows = yield* toy.published('projection', [], all)
          // The creation of each, and the four pieces of work each was created with: the three entities step at
          // once, and a row of one is never written in the middle of another's step.
          expect(rows.length).toBe(ids.length * 5)
          // Each entity's rows are in its own partition, numbered from 1 in the order of its steps.
          for (const id of ids) {
            const own = rows.filter((row) => row.id === id)
            expect(own.map(({ value }) => value)).toEqual([4, 3, 2, 1, 0])
            expect(own.map(({ partition, seq }) => ({ partition, seq }))).toEqual(
              [1, 2, 3, 4, 5].map((seq) => ({ partition: partitionOf(id, 300), seq })),
            )
          }
          // A reader that read to the end is given nothing again.
          expect(yield* toy.published('projection', rows, all)).toEqual([])
        }))
    })))

  test('the entities of one partition share its sequence, in the order their steps committed', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const ids = ['p-1', 'p-2', 'p-3']
      yield* process({ log: { partitions: 1 } }, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* Effect.forEach(
            ids,
            (id) => toy.create(id, { at }, { requestId: `c-${id}`, sender: tester }),
            { concurrency: 'unbounded' },
          )
          yield* runtime.settled
          yield* TestClock.adjust('60 millis')
          yield* runtime.settled
          const rows = yield* toy.published('projection', [], all)
          expect(rows.map(({ partition, seq }) => ({ partition, seq }))).toEqual(
            rows.map((_, at) => ({ partition: 1, seq: at + 1 })),
          )
          for (const id of ids) {
            expect(rows.filter((row) => row.id === id).map(({ value }) => value)).toEqual([4, 3, 2, 1, 0])
          }
        }))
    })))

  test('a consumer reads every partition, and an ack and a prune move only the partitions acked', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      // Two entities of two partitions.
      const [one, other] = ['a', 'b']
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          expect(partitionOf(one, 300)).not.toBe(partitionOf(other, 300))
          yield* toy.create(one, { at }, { requestId: 'c-one', sender: tester })
          yield* toy.create(other, { at }, { requestId: 'c-other', sender: tester })
          yield* toy.send(one, { _tag: 'Want', key: 't', on: false, nonce: 'off' }, { requestId: 'off', sender: tester })
          // The rows come in the order they were written, each with its partition and its `seq` there.
          const rows = yield* toy.feed('projection', 'queue', all)
          expect(rows.map(({ id, partition, seq }) => ({ id, partition, seq }))).toEqual([
            { id: one, partition: partitionOf(one, 300), seq: 1 },
            { id: other, partition: partitionOf(other, 300), seq: 1 },
            { id: one, partition: partitionOf(one, 300), seq: 2 },
          ])
          // The consumer acts on the rows of one entity only: the other's partition stays where it was.
          yield* toy.ack('projection', 'queue', rows.filter((row) => row.id === one))
          expect((yield* toy.feed('projection', 'queue', all)).map(({ id }) => id)).toEqual([other])
          expect(yield* toy.consumers).toEqual([
            {
              topic: 'projection',
              consumer: 'queue',
              behind: 1,
              cursors: [{ partition: partitionOf(other, 300), seq: 0 }],
            },
          ])
          // The prune drops what the consumer read in each partition, and keeps the partition it acked nothing of.
          expect(yield* toy.prune).toBe(2)
          expect((yield* toy.published('projection', [], all)).map(({ id }) => id)).toEqual([other])
        }))
    })))

  test('a launch with another number of partitions than the database’s fails, and names both', () =>
    database(Effect.gen(function*() {
      const reasonOf = (exit: Exit.Exit<unknown>) => {
        const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
        return cause instanceof InvariantDefect ? cause.reason : null
      }
      // The first launch stores its number, and the next one with the same number runs.
      yield* process({ log: { partitions: 12 } }, () => Effect.void)
      yield* process({ log: { partitions: 12 } }, () => Effect.void)
      expect(reasonOf(yield* Effect.exit(process({}, () => Effect.void))))
        .toBe('the log has 12 partitions, and the runtime is launched with 300')
      expect(reasonOf(yield* Effect.exit(process({ log: { partitions: 0 } }, () => Effect.void))))
        .toBe('the log has 0 partitions, which is no positive integer')
      expect(reasonOf(yield* Effect.exit(process({ log: { partitions: 1.5 } }, () => Effect.void))))
        .toBe('the log has 1.5 partitions, which is no positive integer')
    })))

  test('a consumer reads from its cursors through indexes, and never scans the log', () =>
    database(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const plan = (query: string) =>
        Effect.map(sql.unsafe<{ detail: string }>(`EXPLAIN QUERY PLAN ${query}`), (rows) =>
          rows.map(({ detail }) => detail).join(' '))
      // The first row past a cursor is a seek into its topic and partition, by `seq`.
      expect(
        yield* plan(`SELECT position FROM outbox
          WHERE name = 'Toy' AND topic = 'projection' AND partition = 3 AND seq > 7 ORDER BY seq LIMIT 1`),
      ).toContain('USING COVERING INDEX outbox_partition (name=? AND topic=? AND partition=? AND seq>?)')
      // A page is a range over (name, topic, position), which is also the order read: the log grows until a
      // consumer prunes it, and a poll must not read again what it has read, nor the rows of other topics.
      expect(
        yield* plan(`SELECT position, partition, seq, id, tag, version, message, projection FROM outbox
          WHERE name = 'Toy' AND topic = 'projection' AND position >= 7 ORDER BY position LIMIT 256`),
      ).toMatch(/USING INDEX outbox_topic \(name=\? AND topic=\? AND (position|rowid)>\?\)/)
    })))

  test('a step whose transaction never commits publishes nothing', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const store = storage(program, yield* SqlClient.SqlClient)
      const crashed = yield* Deferred.make<void>()
      let seen = 0
      const dying = process(
        {
          // The creation's commit is the first the process reaches; the step that handles the message is the
          // second, and the process dies before it.
          at: (point) =>
            point !== 'BeforeCommit' || ++seen !== 2
              ? Effect.void
              : Effect.flatMap(Deferred.succeed(crashed, undefined), () => Effect.never),
        },
        (runtime) =>
          Effect.gen(function*() {
            const { layer } = yield* hands({ holds: true })
            const toy = yield* Effect.provide(runtime.deploy(program), layer)
            yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
            yield* running(
              toy.send(id, { _tag: 'Want', key: 't', on: false, nonce: 'off' }, { requestId: 'off', sender: tester }),
            )
          }),
      )
      yield* Effect.raceFirst(dying, Deferred.await(crashed))
      expect(yield* Deferred.isDone(crashed)).toBe(true)
      expect((yield* store.published('projection', [], all)).map(({ kind, value }) => ({ kind, value })))
        .toEqual([{ kind: 'Creation', value: 4 }])
    })))

  test('a cursor is a consumer of one program, and holds no other program log', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      // The same program under another name: two programs' entities publish into one log, read apart by name.
      const twin: Program<T> = { ...program, name: 'Twin' }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toys = yield* Effect.provide(runtime.deploy(program), layer)
          const twins = yield* Effect.provide(runtime.deploy(twin), layer)
          yield* toys.create(id, { at }, { requestId: 'creation', sender: tester })
          yield* twins.create(id, { at }, { requestId: 'creation', sender: tester })
          // Each reads the rows of its own program, under a name a consumer of each may hold.
          const mine = yield* toys.feed('projection', 'queue', all)
          const theirs = yield* twins.feed('projection', 'queue', all)
          expect(mine.length).toBe(1)
          expect(theirs.length).toBe(1)
          // Each program's partitions have heads of their own, so the same entity id starts at the same place in
          // both logs (decision 0137).
          expect(theirs.map(({ partition, seq }) => ({ partition, seq })))
            .toEqual(mine.map(({ partition, seq }) => ({ partition, seq })))
          // Each acks its own, and the rows of the one go while the other's consumer holds its log.
          yield* twins.ack('projection', 'queue', theirs)
          expect(yield* twins.prune).toBe(1)
          expect(yield* toys.prune).toBe(0)
          expect(yield* toys.published('projection', [], all)).toEqual(mine)
          expect(yield* toys.consumers).toEqual([
            {
              topic: 'projection',
              consumer: 'queue',
              behind: 1,
              cursors: [{ partition: partitionOf(id, 300), seq: 0 }],
            },
          ])
          expect(yield* twins.consumers).toEqual([{ topic: 'projection', consumer: 'queue', behind: 0, cursors: [] }])
        }))
    })))

  // The premise a transaction of the runtime rests on: the client leases its one connection under a semaphore of
  // one, and a transaction holds it for its duration (decisions 0007, 0039). Two statements apart let a consumer
  // register in between.
  test('a transaction keeps a consumer from registering between its statements, two statements apart do not', () =>
    database(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const lowest = sql<{ through: number | null }>`SELECT min(seq) AS through FROM cursors WHERE name = 'Toy'`
      const registers = sql`INSERT INTO cursors ${
        sql.insert({ name: 'Toy', topic: 'projection', consumer: 'late', partition: 1, seq: 0 })
      }`
      // The readings wait for the clock between them, so the insert is offered where the race would be, and
      // lands there unless something holds it out.
      const reads = Effect.gen(function*() {
        const before = yield* lowest
        yield* Effect.sleep('30 millis')
        return [before[0]?.through ?? null, (yield* lowest)[0]?.through ?? null] as const
      })
      const between = (readings: typeof reads) =>
        Effect.gen(function*() {
          const read = yield* running(readings)
          const inserted = yield* running(registers)
          yield* TestClock.adjust('30 millis')
          yield* Fiber.join(inserted)
          return yield* Fiber.join(read)
        })

      // Two statements apart: the second sees a cursor the first did not, which is where rows would be dropped
      // behind a consumer that has read them.
      expect(yield* between(reads)).toEqual([null, 0])
      yield* sql`DELETE FROM cursors WHERE name = 'Toy'`

      // The insert waits for the permit the transaction holds, so the two readings agree and it lands after.
      expect(yield* between(sql.withTransaction(reads))).toEqual([null, null])
    })))
})

describe('a schema that changes', () => {
  const tester = { _tag: 'Tester' } as const

  /**
   * Version 2 of the toy: `applied` is renamed, the operation `A` gains a field, and the projection becomes a
   * struct. Nothing of version 1 is left in the code but the migration, which reads the JSON it wrote
   * (decision 0036).
   */
  const State2 = Schema.Struct({
    want: Schema.Array(Key),
    log: Schema.Array(Schema.String),
    since: Schema.DateTimeUtcFromMillis,
    rings: Schema.DateTimeUtcFromMillis,
  })
  type State2 = typeof State2.Type

  const Operation2 = Schema.Union([
    Schema.TaggedStruct('A', { why: Schema.String }),
    Schema.TaggedStruct('B', { key: Key }),
    Schema.TaggedStruct('C', { key: Key }),
  ])
  type Operation2 = typeof Operation2.Type

  const Projection2 = Schema.Struct({ wanted: Schema.Int })
  type Projection2 = typeof Projection2.Type

  const Rejection2 = Schema.Struct({ why: Schema.Literal('Refused') })
  type Rejection2 = typeof Rejection2.Type

  const Sender2 = Schema.TaggedStruct('Tester', { team: Schema.String })
  type Sender2 = typeof Sender2.Type
  const tester2: Sender2 = { _tag: 'Tester', team: 'core' }

  type T2 = {
    state: State2
    flags: Readonly<{ at: DateTime.Utc }>
    inbound: Inbound
    internal: Internal
    operation: Operation2
    key: Key
    parameter: {}
    rejection: Rejection2
    sender: Sender2
    projection: Projection2
    index: 'wanted'
    services: Hands
  }

  const next: Program<T2> = {
    name: 'Toy',
    keys: { a: null, b: null, c: null, t: null },
    schemas: {
      ...program.schemas,
      state: State2,
      operation: Operation2,
      projection: Projection2,
      rejection: Rejection2,
      sender: Sender2,
    },
    init: (_flags, at) => ({ want: keys, log: [], since: at, rings: DateTime.addDuration(at, '40 millis') }),
    update: (message) => (state) => {
      switch (message._tag) {
        case 'Want': {
          const others = state.want.filter((key) => key !== message.key)
          const want = message.on ? keys.filter((key) => key === message.key || others.includes(key)) : others
          return { ...state, want, log: [...state.log, message.nonce] }
        }
        case 'Refuse':
          return rejectWith({ why: 'Refused' } as const)
        case 'Break':
          return defect('broken')
        default:
          return !state.want.includes(message.key)
            ? defect('an internal message for a key the state does not hold')
            : { ...state, want: state.want.filter((key) => key !== message.key) }
      }
    },
    durable: (state) =>
      state.want.length === 0 ? noWork : Object.fromEntries(state.want.map((key) => [
        key,
        key === 'a'
          ? { _tag: 'A', why: 'kept' } as const
          : key === 'b'
          ? { _tag: 'B', key } as const
          : key === 'c'
          ? { _tag: 'C', key } as const
          : timer<Internal>(state.rings, { _tag: 'Rang', key: 't' }),
      ])),
    operations: {
      A: operation((_operation, idempotencyKey) => acts('a', idempotencyKey)),
      B: operation.atMostOnce(({ key }) => acts(key, null), ({ key }): Internal => ({ _tag: 'Unknown', key })),
      C: operation.atLeastOnce(({ key }) => acts(key, null)),
    },
    project: (state) => ({ wanted: state.want.length }),
    indexes: { wanted: (projection) => projection.wanted },
    migrations: [{
      state: (json) => {
        const { applied, ...rest } = json as Readonly<Record<string, Json>>
        return { ...rest, log: applied ?? [] }
      },
      // What the migration gives must be what `durable` computes, or the activation suspends the entity.
      operation: (json) => {
        const held = json as Readonly<Record<string, Json>>
        return held._tag === 'A' ? { ...held, why: 'kept' } : held
      },
      projection: (json) => ({ wanted: json }),
      // A reason is kept as long as its reply, here for ever, since the caller gives no keep: a retry reads it through this.
      rejection: (json) => ({ why: json }),
      // A caller's requests are stored under its sender, so a retry finds its reply through this (decision 0048).
      sender: (json) => ({ ...json as Readonly<Record<string, Json>>, team: 'core' }),
    }],
  }

  /** The idempotency key the operation under `a` ran with: it is the same one through the migration. */
  const charged = (acted: ReadonlyArray<string>) => acted.filter((act) => act.startsWith('a:'))

  test('a deploy reads the state, the work under way and the rows through the migrations', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      // One toy with nothing left under way, whose row version 1 wrote and nothing rewrites.
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create('m-1', { at }, { requestId: 'c-1', sender: tester })
          yield* runtime.settled
          yield* TestClock.adjust('60 millis')
          yield* runtime.settled
          expect(yield* toy.read('m-1')).toBe(0)
        }))
      // And one whose operations hold, so that version 2 finds work under way stored by version 1.
      const before: Array<string> = []
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { acted, layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* ran(toy.create('m-2', { at }, { requestId: 'c-2', sender: tester }))
          expect(yield* toy.send('m-2', { _tag: 'Refuse', nonce: 'no' }, { requestId: 'r-2', sender: tester }))
            .toEqual({ _tag: 'Rejected', reason: 'Refused' })
          // `a` is wanted already: the message is logged, and changes no work.
          expect(yield* toy.send('m-2', { _tag: 'Want', key: 'a', on: true, nonce: 'w' }, {
            requestId: 'w-2',
            sender: tester,
          })).toEqual({ _tag: 'Accepted' })
          before.push(...acted)
        }))
      expect(charged(before)).toHaveLength(1)
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { acted, layer } = yield* hands({ holds: true })
          const toy = yield* ran(Effect.provide(runtime.deploy(next), layer))
          // The row of 'm-1' is the one version 1 wrote, read through the migration of the projection.
          expect(yield* toy.query({ limit: all, where: [{ index: 'wanted', is: '=', value: 0 }] }))
            .toEqual([{ id: 'm-1', projection: { wanted: 0 }, indexes: { wanted: 0 } }])
          // 'm-2' was activated with the state and the operations of version 1, migrated: its at-most-once
          // operation delivered `unknown` and its timer fired, and the two that hold run under the keys they
          // started with.
          yield* TestClock.adjust('60 millis')
          expect(yield* toy.read('m-2')).toEqual({ wanted: 2 })
          expect(charged(acted)).toEqual(charged(before))
          // The retry is answered from the reply version 1 stored, with its reason read through the migration.
          expect(yield* toy.send('m-2', { _tag: 'Refuse', nonce: 'no' }, { requestId: 'r-2', sender: tester2 }))
            .toEqual({ _tag: 'Rejected', reason: { why: 'Refused' } })
          // The caller's requests are found under its sender as version 1 stored it, read through the migration:
          // its creation is answered `Created`, and its message is not applied again.
          expect(yield* toy.create('m-2', { at }, { requestId: 'c-2', sender: tester2 })).toEqual({ _tag: 'Created' })
          expect(yield* toy.send('m-2', { _tag: 'Want', key: 'a', on: true, nonce: 'w' }, {
            requestId: 'w-2',
            sender: tester2,
          })).toEqual({ _tag: 'Accepted' })
          const stored = yield* storage(next, yield* SqlClient.SqlClient).load('m-2')
          expect(stored?.state.log).toEqual(['w'])
          // The rows are version 2's once they are written again, and the index reads the struct.
          expect(yield* toy.reindex).toEqual({ written: 2, failed: [] })
          expect(yield* toy.query({ limit: all, where: [{ index: 'wanted', is: '=', value: 0 }] }))
            .toEqual([{ id: 'm-1', projection: { wanted: 0 }, indexes: { wanted: 0 } }])
        }))
    })))

  test('a deploy that has no reading of the version stored dies', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(next), layer)
          yield* toy.create('m-3', { at }, { requestId: 'c-3', sender: tester2 })
        }))
      // The entity holds an operation, which an activation starts again: the deploy reads what version 2 wrote.
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const exit = yield* Effect.exit(Effect.provide(runtime.deploy(program), layer))
          const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
          expect(cause instanceof Error && cause.message)
            .toBe("'Toy' is version 1, and has no reading of version 2")
        }))
    })))

  test('a row no version reads fails the call that meets it, and the process serves the rest', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      // Each version leaves an entity with nothing under way, so that a deploy activates neither.
      for (const [version, entity, sender] of [[program, 'm-4', tester], [next, 'm-5', tester2]] as const) {
        yield* process({}, (runtime) =>
          Effect.gen(function*() {
            const { layer } = yield* hands()
            const toy = yield* Effect.provide(runtime.deploy(version as Program<T>), layer)
            yield* toy.create(entity, { at }, { requestId: `c-${entity}`, sender: sender as Sender })
            yield* runtime.settled
            yield* TestClock.adjust('60 millis')
            yield* runtime.settled
          }))
      }
      // Version 1 is deployed again, as a rollback: the entity version 2 wrote fails each call that loads it.
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          const want = { _tag: 'Want', key: 't', on: true, nonce: 'n' } as const
          const exit = yield* Effect.exit(toy.send('m-5', want, { requestId: 'r-5', sender: tester }))
          const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
          expect(cause instanceof Error && cause.message)
            .toBe("'Toy' is version 1, and has no reading of version 2")
          expect(yield* toy.send('m-4', want, { requestId: 'r-4', sender: tester })).toEqual({ _tag: 'Accepted' })
          expect(yield* toy.read('m-4')).toBe(1)
          // A reindex passes over the entity version 2 wrote, names it, and writes the one it reads (decision 0122).
          expect(yield* toy.reindex).toEqual({
            written: 1,
            failed: [{ id: 'm-5', cause: "Error: 'Toy' is version 1, and has no reading of version 2" }],
          })
        }))
    })))
})

describe('what the runtime cannot finish', () => {
  const tester = { _tag: 'Tester' } as const
  const want = (nonce: string): Inbound => ({ _tag: 'Want', key: 't', on: true, nonce })

  test('an event it cannot finish crashes its entity alone, and the next caller finds it again', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      let dies = true
      yield* process({
        // The message is written, and the runtime dies before it acts on it: the probe stands for a failed write.
        observe: (_entity, event) => {
          if (received(event) !== 'r-1' || !dies) return Effect.void
          dies = false
          return Effect.die('the runtime failed')
        },
      }, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
          const failed = yield* Effect.exit(toy.send(id, want('n-1'), { requestId: 'r-1', sender: tester }))
          expect(Exit.isFailure(failed)).toBe(true)
          // The entity left the process: the next caller loads it, and the message stored is handled first.
          expect(yield* toy.send(id, want('n-2'), { requestId: 'r-2', sender: tester })).toEqual({ _tag: 'Accepted' })
          expect(yield* toy.send(id, want('n-1'), { requestId: 'r-1', sender: tester }))
            .toEqual({ _tag: 'Accepted' })
          yield* runtime.settled
        }))
    })))

  test('a crash gives its defect to a creator waiting on the entity too', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      let dies = false
      yield* process({
        // A creation of an entity already there is one of its events: the probe stands for a failed write.
        observe: (_entity, event) => {
          if (event._tag !== 'Create' || !dies) return Effect.void
          dies = false
          return Effect.die('the runtime failed')
        },
      }, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
          dies = true
          const failed = yield* Effect.exit(toy.create(id, { at }, { requestId: 'again', sender: tester }))
          expect(Exit.isFailure(failed)).toBe(true)
          // The entity left the process, and the next creator loads it again.
          expect(yield* toy.create(id, { at }, { requestId: 'again', sender: tester })).toEqual({ _tag: 'AlreadyExists' })
          yield* runtime.settled
        }))
    })))

  test('a creation it cannot finish crashes its entity, and the next caller loads it', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const activated: Array<string> = []
      yield* process({
        // The creation is written, and the runtime dies as it acts on it: the probe stands for a failure there.
        at: (point, _entity, event) =>
          point === 'AfterReply' && event._tag === 'Create' ? Effect.die('the runtime failed') : Effect.void,
        observe: (entity, event) => event._tag === 'Restart' ? Effect.sync(() => activated.push(entity.id)) : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          const failed = yield* Effect.exit(toy.create(id, { at }, { requestId: 'creation', sender: tester }))
          expect(Exit.isFailure(failed)).toBe(true)
          // The entity left the process: the next caller loads it from what the creation stored.
          expect(yield* toy.send(id, want('n-1'), { requestId: 'r-1', sender: tester })).toEqual({ _tag: 'Accepted' })
          expect(activated).toEqual([id])
          yield* runtime.settled
        }))
    })))

  test('a sender its schema cannot encode is its caller’s defect, named as the sender', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
          const nobody = { _tag: 'Nobody' } as unknown as typeof tester
          const exit = yield* Effect.exit(toy.send(id, want('n-1'), { requestId: 'r-1', sender: nobody }))
          const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
          expect(cause instanceof InvariantDefect && cause.reason).toStartWith('the sender does not encode')
          yield* runtime.settled
        }))
    })))

  // A defect is no reply: nothing is stored for it, so the creator's retry after a fix creates the entity (decision 0124).
  test('a creation init dies on gives its creator the defect, and a retry after a fix creates the entity', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { layer } = yield* hands()
      const dying: Program<T> = { ...program, init: () => defect('init died') }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(dying), layer)
          for (let attempt = 0; attempt < 2; attempt++) {
            const exit = yield* Effect.exit(toy.create(id, { at }, { requestId: 'creation', sender: tester }))
            const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
            expect(cause instanceof InvariantDefect && cause.reason).toBe('init died')
          }
          expect(yield* toy.send(id, want('n-1'), { requestId: 'r-1', sender: tester })).toEqual({ _tag: 'NotFound' })
          yield* runtime.settled
        }))
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          expect(yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })).toEqual({ _tag: 'Created' })
          yield* runtime.settled
        }))
    })))

  test('an entity the waker cannot activate is tried again after the retry, and the other timers fire', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { entities, unloaded } = unloads()
      let dies = false
      yield* process({
        unloaded,
        passivate: { millis: 5 },
        retry: { millis: 100 },
        // The first activation of `w-1` the waker makes cannot finish: the probe stands for a failed write.
        observe: (entity, event) => {
          if (entity.id !== 'w-1' || event._tag !== 'Restart' || !dies) return Effect.void
          dies = false
          return Effect.die('the runtime failed')
        },
      }, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          for (const entity of ['w-1', 'w-2']) yield* toy.create(entity, { at }, { requestId: entity, sender: tester })
          yield* runtime.settled
          yield* TestClock.adjust('5 millis')
          expect(entities).toEqual(['w-1', 'w-2'])
          // Both timers come at once, and the waker activates `w-1` first, in the order of the ids.
          dies = true
          yield* TestClock.adjust('60 millis')
          yield* runtime.settled
          expect([yield* toy.read('w-1'), yield* toy.read('w-2')]).toEqual([1, 0])
          // The waker sleeps until `w-1` is tried again, at 40 and the retry, and its timer fires then, at that
          // time exactly (decision 0077).
          yield* TestClock.adjust('75 millis')
          yield* runtime.settled
          expect([yield* toy.read('w-1'), yield* toy.read('w-2')]).toEqual([0, 0])
        }))
    })))

  test('an entity the waker can never activate leaves the process settled between its retries', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const tried: Array<number> = []
      yield* process({
        passivate: { millis: 5 },
        retry: { millis: 100 },
        // Every activation of `w` cannot finish, as a row no version reads (decision 0043).
        observe: (entity, event) =>
          entity.id !== 'w' || event._tag !== 'Restart'
            ? Effect.void
            : Effect.andThen(
              Effect.map(DateTime.now, (now) => tried.push(DateTime.toEpochMillis(now))),
              Effect.die('the runtime failed'),
            ),
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
          yield* toy.create('w', { at }, { requestId: 'w', sender: tester })
          yield* runtime.settled
          // Its timer comes, and each activation fails: the waker tries it once a retry, and rests in between,
          // where one that tried at once would never settle (decision 0077).
          for (let round = 0; round < 3; round++) {
            yield* TestClock.adjust('100 millis')
            yield* runtime.settled
          }
          expect(tried).toEqual([40, 140, 240])
          expect(yield* toy.read('w')).toBe(1)
        }))
    })))

  test('the process is not settled while a stored timer or a retry has come by the clock and not run', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const clock = ahead()
      let dies = false
      /** Whether `settled` returns while the clock stands ahead of the waker's sleep, which only `adjust` ends. */
      const settles = (runtime: Runtime, millis: number) =>
        Effect.gen(function*() {
          const settling = yield* Effect.forkChild(runtime.settled)
          yield* Effect.replicateEffect(Effect.yieldNow, 50, { discard: true })
          const early = settling.pollUnsafe() !== undefined
          yield* clock.adjust(`${millis} millis`)
          yield* Fiber.join(settling)
          return early
        })
      yield* clock.around(process({
        passivate: { millis: 5 },
        retry: { millis: 100 },
        // The first activation of `w-1` the waker makes cannot finish: the probe stands for a failed write.
        observe: (entity, event) => {
          if (entity.id !== 'w-1' || event._tag !== 'Restart' || !dies) return Effect.void
          dies = false
          return Effect.die('the runtime failed')
        },
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
          for (const entity of ['w-1', 'w-2']) yield* toy.create(entity, { at }, { requestId: entity, sender: tester })
          yield* runtime.settled
          yield* clock.adjust('5 millis')
          // The clock reaches the stored timers before the waker's sleep does: they are work not activated yet.
          dies = true
          clock.by.millis = 35
          expect(yield* settles(runtime, 35)).toBe(false)
          expect([yield* toy.read('w-1'), yield* toy.read('w-2')]).toEqual([1, 0])
          // And so is `w-1`'s retry, once the clock reaches it: the waker read 75, and it is due at 175, which the
          // sleep reaches at 140 (decision 0077).
          clock.by.millis = 135
          expect(yield* settles(runtime, 100)).toBe(false)
          expect([yield* toy.read('w-1'), yield* toy.read('w-2')]).toEqual([0, 0])
        })))
    })))

  test('a crash does not wait for its operations to stop: nothing waits for them under its entity’s lock', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const released = yield* Deferred.make<void>()
      const stopping = yield* Deferred.make<void>()
      // Hands that act and never come back, and that take until the end of the test to stop: a request to a slow
      // service, closing.
      const layer = Layer.succeed(
        Hands,
        Hands.of({
          act: () =>
            Effect.never.pipe(
              Effect.onInterrupt(() =>
                Effect.andThen(Deferred.succeed(stopping, undefined), Deferred.await(released))
              ),
            ),
        }),
      )
      let dies = true
      yield* process({
        observe: (entity, event) => {
          if (entity.id !== 'slow' || event._tag !== 'Receive' || !dies) return Effect.void
          dies = false
          return Effect.die('the runtime failed')
        },
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create('slow', { at }, { requestId: 'c-slow', sender: tester })
          yield* toy.create('other', { at }, { requestId: 'c-other', sender: tester })
          // The crash of the first entity interrupts its operations, which take their time to stop (decision 0056).
          // A wait under the entity's lock would hold the calls to it below for ever, which the test's own timeout
          // reports.
          const failed = yield* Effect.exit(toy.send('slow', want('n-1'), { requestId: 'r-1', sender: tester }))
          expect(Exit.isFailure(failed)).toBe(true)
          // Meanwhile, the entity is loaded again and answered, and so is every other one (decision 0067).
          expect(yield* toy.send('slow', want('n-2'), { requestId: 'r-2', sender: tester }))
            .toEqual({ _tag: 'Accepted' })
          expect(yield* toy.send('other', want('n-3'), { requestId: 'r-3', sender: tester }))
            .toEqual({ _tag: 'Accepted' })
          // The crash did interrupt it: it is stopping, and stops once the test lets it.
          yield* Deferred.await(stopping)
          // The operations stop once the test lets them, so that the process can end, whatever it found.
        }).pipe(Effect.ensuring(Deferred.succeed(released, undefined))))
    })))

  test('a deploy that cannot finish stops what it started, and leaves the process settled', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const started: Array<string> = []
      const stopped: Array<string> = []
      /** Done once the work of the process under test has acted: a deploy that stopped nothing passes vacuously. */
      let acted = Deferred.makeUnsafe<void>()
      // Hands that act and never come back, so that what a deploy starts runs until something stops it.
      const layer = Layer.succeed(
        Hands,
        Hands.of({
          act: (key) =>
            Effect.sync(() => {
              started.push(key)
              Deferred.doneUnsafe(acted, Effect.void)
            }).pipe(
              Effect.andThen(Effect.never),
              Effect.onInterrupt(() =>
                Effect.sync(() => {
                  stopped.push(key)
                })
              ),
            ),
        }),
      )
      // Two entities holding operations, which the next deploy activates in the order of their ids.
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          for (const entity of ['d-1', 'd-2']) {
            yield* toy.create(entity, { at }, { requestId: `c-${entity}`, sender: tester })
          }
        }))
      started.length = 0
      stopped.length = 0
      acted = Deferred.makeUnsafe<void>()
      let dies = true
      const { entities, unloaded } = unloads()
      yield* process({
        unloaded,
        capacity: { entities: 2 },
        // The second activation cannot finish, once the first has started its work.
        at: (point, entity, event) =>
          dies && point === 'BeforeCommit' && entity.id === 'd-2' && event._tag === 'Restart'
            ? Effect.andThen(Deferred.await(acted), Effect.die('the runtime failed'))
            : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          expect(Exit.isFailure(yield* Effect.exit(Effect.provide(runtime.deploy(program), layer)))).toBe(true)
          // The first entity's work ran, and stopped with the deploy: nothing of a failed deploy runs on.
          expect(started.length).toBeGreaterThan(0)
          expect([...stopped].sort()).toEqual([...started].sort())
          yield* runtime.settled
          // Nor is it held: two entities of another program fill the capacity, and neither leaves (decision 0076).
          const twins = yield* Effect.provide(runtime.deploy({ ...program, name: 'Twin' }), (yield* hands()).layer)
          for (const entity of ['e-1', 'e-2']) {
            yield* twins.create(entity, { at }, { requestId: entity, sender: tester })
            yield* runtime.settled
          }
          expect(entities).toEqual([])
          // A deploy that failed gives its name back, and the program can be deployed again (decision 0075).
          dies = false
          expect(Exit.isSuccess(yield* Effect.exit(Effect.provide(runtime.deploy(program), layer)))).toBe(true)
        }))
    })))

  test('a runner that throws while it builds its effect suspends its entity', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const throwing: Program<T> = {
        ...program,
        operations: {
          ...program.operations,
          C: operation.atLeastOnce((): Effect.Effect<Internal, never, Hands> => {
            throw new Error('thrown while building')
          }),
        },
      }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(throwing), layer)
          expect(yield* toy.create(id, { at }, { requestId: 'creation', sender: tester }))
            .toEqual({ _tag: 'Created' })
          yield* runtime.settled
          expect(yield* toy.send(id, want('n-1'), { requestId: 'r-1', sender: tester }))
            .toEqual({ _tag: 'Suspended' })
        }))
      const stored = yield* storage(program, yield* SqlClient.SqlClient).load(id)
      expect(stored?.suspension?.on).toEqual({ _tag: 'Operation', key: { name: 'c' }, incarnation: 3 })
    })))

  test('a program that cannot run as written is refused where it enters, before anything is stored', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const sql = yield* SqlClient.SqlClient
      const reasonOf = (exit: Exit.Exit<unknown>) => {
        const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
        return cause instanceof InvariantDefect ? cause.reason : null
      }
      const unworded = { ...program, indexes: { 'wanted;': program.indexes.wanted } } as unknown as Program<T>
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          // A deploy refuses it before it writes an index into SQL, or loads an entity (decision 0054).
          expect(reasonOf(yield* Effect.exit(Effect.provide(runtime.deploy(unworded), layer))))
            .toBe("the program 'Toy' has an index 'wanted;' whose name is not a word")
          const made = yield* sql<{ name: string }>`SELECT name FROM sqlite_master WHERE type = 'index'`
          expect(made.map(({ name }) => name).filter((name) => name.startsWith('projections '))).toEqual([])
          expect(reasonOf(yield* Effect.exit(Effect.provide(runtime.deploy({ ...program, name: '' }), layer))))
            .toBe("the program '' has an empty name")
          // A fix is a deploy, checked as any (decision 0064): the entities go on with the program deployed.
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
          expect(reasonOf(yield* Effect.exit(Effect.provide(runtime.deploy(unworded), layer))))
            .toBe("the program 'Toy' has an index 'wanted;' whose name is not a word")
          expect(yield* toy.send(id, want('n-1'), { requestId: 'r-1', sender: tester })).toEqual({ _tag: 'Accepted' })
          yield* runtime.settled
        }))
    })))

  test('a name is deployed once in a process, however two deploys of it interleave', () => {
    const reasonOf = (exit: Exit.Exit<unknown>) => {
      const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
      return cause instanceof InvariantDefect ? cause.reason : null
    }
    // Each schedule moves the points where one deploy runs between two steps of the other (decisions 0068, 0104).
    explored(() =>
      process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const deploy = Effect.exit(Effect.provide(runtime.deploy(program), layer))
          // A second deploy is refused, as is one after them both (decision 0075).
          const exits = [...yield* together([deploy, deploy]), yield* deploy]
          return exits.map(reasonOf).sort()
        })), [null, "the program 'Toy' is deployed already", "the program 'Toy' is deployed already"])
  }, 60_000)

  test('a deploy interrupted anywhere keeps its name and its waker, or stops what it started', () => {
    // An entity left with its operations under way, which a deploy activates, and one with its timer alone, which
    // only a deployment's waker activates.
    const prepared = Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), (yield* hands()).layer)
          yield* toy.create('w', { at }, { requestId: 'c-w', sender: tester })
          yield* runtime.settled
        }))
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), (yield* hands({ holds: true })).layer)
          yield* ran(toy.create('d', { at }, { requestId: 'c-d', sender: tester }))
        }))
    })
    // Hands that act and come back once the test opens the gate, and say which acts an interruption stopped.
    const live = Effect.sync(() => {
      const running = new Map<string, number>()
      const gate = Deferred.makeUnsafe<void>()
      const layer = Layer.succeed(
        Hands,
        Hands.of({
          act: (key) => {
            let acted = false
            return Effect.onInterrupt(
              Effect.andThen(Effect.sync(() => {
                acted = true
                running.set(key, (running.get(key) ?? 0) + 1)
              }), Deferred.await(gate)),
              () =>
                Effect.sync(() => {
                  if (acted) running.set(key, (running.get(key) ?? 0) - 1)
                }),
            )
          },
        }),
      )
      return { running, gate, layer }
    })
    // Each schedule moves the point where the interruption reaches the deploy, and so does each count of the test's
    // own yields before it interrupts. PCT seldom preempts the deploy for the test's yields, which name no fiber, so
    // each count of yields comes once a run; and with a few yields, a run in order with one deviation stops the deploy
    // at each of its steps.
    const interrupted = (yields: () => number) => (window: Window) =>
      Effect.gen(function*() {
        const count = yields()
        yield* prepared
        const { running, gate, layer } = yield* live
        const fired: Array<string> = []
        return yield* process({
          observe: (entity, event) =>
            Effect.sync(() => {
              if (event._tag === 'Fire') fired.push(entity.id)
            }),
        }, (runtime) =>
          Effect.gen(function*() {
            yield* opened(window, true)
            const first = yield* Effect.forkChild(Effect.provide(runtime.deploy(program), layer))
            yield* Effect.replicateEffect(Effect.yieldNow, count, { discard: true })
            yield* Fiber.interrupt(first)
            yield* Effect.exit(Effect.provide(runtime.deploy(program), layer))
            yield* adjusted(window, '1 millis')
            // One deployment runs the entity's operations, whichever deploy it is.
            const seen = { a: running.get('a') ?? 0, c: running.get('c') ?? 0 }
            yield* Deferred.succeed(gate, undefined)
            yield* runtime.settled
            // And its waker fires each timer once: the one of the entity it activated, and the stored one.
            yield* adjusted(window, '100 millis')
            yield* runtime.settled
            return { ...seen, fired: [...fired].sort() }
          }))
      })
    let runs = 0
    explored(interrupted(() => runs++ % 200), { a: 1, c: 1, fired: ['d', 'w'] }, { open: false })
    // Two yields let the deploy reach its registration, where one deviation stops it.
    for (const count of [0, 1, 2, 3]) {
      explored(interrupted(() => count), { a: 1, c: 1, fired: ['d', 'w'] }, { open: false, bound: 1 })
    }
  }, 120_000)

  test('a deploy interrupted as it activates an entity stops the activation', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), (yield* hands({ holds: true })).layer)
          yield* ran(toy.create('d', { at }, { requestId: 'c-d', sender: tester }))
        }))
      const reached = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      let held = true
      let restarts = 0
      yield* process({
        // The first activation of `d` holds before its commit, as a slow database would.
        at: (point, entity, event) => {
          if (!held || point !== 'BeforeCommit' || entity.id !== 'd' || event._tag !== 'Restart') return Effect.void
          held = false
          return Effect.andThen(Deferred.succeed(reached, undefined), Deferred.await(gate))
        },
        observe: (entity, event) =>
          Effect.sync(() => {
            if (entity.id === 'd' && event._tag === 'Restart') restarts += 1
          }),
      }, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const first = yield* Effect.forkChild(Effect.provide(runtime.deploy(program), layer))
          yield* Deferred.await(reached)
          // The deploy is given up while its activation runs detached: the activation runs in the deployment's
          // scope, which the failed deploy closes, and stops with it (decisions 0079, 0102).
          yield* Fiber.interrupt(first)
          yield* Deferred.succeed(gate, undefined)
          yield* TestClock.adjust('1 millis')
          expect(restarts).toBe(0)
          yield* Effect.provide(runtime.deploy(program), layer)
          yield* runtime.settled
          expect(restarts).toBe(1)
        }))
    })))

  test('a message its schema cannot encode is its caller’s defect, and reaches no entity', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const observed: Array<string> = []
      yield* process({ observe: (_entity, event) => Effect.sync(() => observed.push(event._tag)) }, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
          const wrong = { _tag: 'Want', key: 'z', on: false, nonce: 'n-1' } as unknown as Inbound
          const exit = yield* Effect.exit(toy.send(id, wrong, { requestId: 'r-1', sender: tester }))
          expect(Exit.isFailure(exit)).toBe(true)
          expect(yield* toy.send(id, want('n-2'), { requestId: 'r-2', sender: tester }))
            .toEqual({ _tag: 'Accepted' })
          yield* runtime.settled
        }))
      // Nothing of the entity failed: it never left the process, and no activation brought it back.
      expect(observed.filter((event) => event === 'Restart')).toEqual([])
      const stored = yield* storage(program, yield* SqlClient.SqlClient).load(id)
      expect(stored?.state.applied).toEqual(['n-2'])
    })))

  test('flags their schema cannot encode are their creator’s defect, whether the entity exists or not', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const wrong = { at: 'now' } as unknown as T['flags']
      const reasonOf = (exit: Exit.Exit<unknown>) => {
        const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
        return cause instanceof InvariantDefect ? cause.reason : null
      }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          // Nothing is created from them (decision 0049).
          const fresh = yield* Effect.exit(toy.create('toy-2', wrong, { requestId: 'c-2', sender: tester }))
          expect(reasonOf(fresh)).toStartWith('the value of the flags does not encode')
          expect(yield* toy.read('toy-2')).toBeNull()
          // Nor is an existing entity's `AlreadyExists` given for them: they never reach it.
          yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
          const again = yield* Effect.exit(toy.create(id, wrong, { requestId: 'c-1', sender: tester }))
          expect(reasonOf(again)).toStartWith('the value of the flags does not encode')
          yield* runtime.settled
        }))
    })))
})

describe('a database held by one runtime', () => {
  const reasonOf = (exit: Exit.Exit<unknown>) => {
    const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
    return cause instanceof InvariantDefect ? cause.reason : null
  }
  const held = 'the database is held by another runtime, or open to another connection'

  test('a runtime holds its database file alone: no other connection opens it, nor launches while one is open', () => {
    const directory = mkdtempSync(join(tmpdir(), 'effect-tea-durable-'))
    const filename = join(directory, 'store.db')
    // A client of the file, as a process opens one, with no busy wait: one that cannot get the file fails at once.
    const client = (scope: Scope.Scope) =>
      Effect.map(
        Scope.provide(Layer.build(SqliteClient.layer({ filename, busyTimeout: 0 })), scope),
        (context) => Context.get(context, SqlClient.SqlClient),
      )
    const on = (sql: SqlClient.SqlClient) => <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
      Effect.provideService(effect, SqlClient.SqlClient, sql)
    return Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const firstScope = yield* Scope.make()
      const first = yield* client(firstScope)
      yield* on(first)(createTables)
      yield* on(first)(process({}, () =>
        Effect.gen(function*() {
          // A second process would load the entities the first holds in memory, and one's steps would be lost
          // under the other's: while a runtime runs, nothing else opens the file (decision 0080).
          expect(Exit.isFailure(yield* Effect.exit(Effect.scoped(Effect.flatMap(Effect.scope, client)))))
            .toBe(true)
        })))
      // The first runtime has ended and given the file back: another connection opens it, but launches nothing
      // while the first client is still open on it.
      const second = yield* client(yield* Effect.scope)
      expect(reasonOf(yield* Effect.exit(on(second)(process({}, () => Effect.void))))).toBe(held)
      yield* Scope.close(firstScope, Exit.void)
      const at = DateTime.makeUnsafe(0)
      yield* on(second)(process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          expect(yield* toy.create(id, { at }, { requestId: 'creation', sender: { _tag: 'Tester' } }))
            .toEqual({ _tag: 'Created' })
        })))
    })).pipe(Effect.provide(TestClock.layer()))).finally(() => rmSync(directory, { recursive: true, force: true }))
  })

  test('a second runtime on one client dies as it launches, however the launches interleave', () => {
    // Each schedule moves the points where one launch runs between two steps of the other (decisions 0068, 0104).
    explored(() =>
      Effect.gen(function*() {
        // How many launched runtimes are running at once: never two.
        let running = 0
        let most = 0
        const body = () =>
          Effect.ensuring(
            Effect.andThen(
              Effect.sync(() => {
                running += 1
                most = Math.max(most, running)
              }),
              Effect.yieldNow,
            ),
            Effect.sync(() => {
              running -= 1
            }),
          )
        const launch = Effect.exit(process({}, body))
        const exits = (yield* together([launch, launch])).map(reasonOf)
        // Either both ran one after the other, or the second met the first and died; and whoever held the client
        // has let it go.
        return {
          most,
          made: exits.some((reason) => reason === null),
          died: exits.every((reason) => reason === null || reason === held),
          after: reasonOf(yield* Effect.exit(process({}, () => Effect.void))),
        }
      }), { most: 1, made: true, died: true, after: null })
  }, 60_000)

  test('two runtimes on one client at once: the second dies', () =>
    database(process({}, () =>
      Effect.gen(function*() {
        expect(reasonOf(yield* Effect.exit(process({}, () => Effect.void)))).toBe(held)
      }))))
})

// What the runtime tells a probe is the tests' seam, and no part of the public surface (decisions 0055, 0073).
test('a probe and its points are no part of what a user imports', () => {
  expect(Object.keys(Library).filter((name) => ['Probe', 'Point', 'Said'].includes(name))).toEqual([])
  // @ts-expect-error `Point` is the runtime's, for its tests
  const point: Library.Point | null = null
  // @ts-expect-error `Said` too
  const said: Library.Said | null = null
  expect([point, said]).toEqual([null, null])
})

test('the library reads the time and sleeps through Effect alone, which a test moves', () => {
  // A clock or a timer of the platform would not move with the test clock, nor with a wall clock run ahead of the
  // sleeps (decisions 0066, 0103): what it read or waited for would be the real time's.
  const platform = new RegExp(
    [/\bDate\.now\b/, /\bnew Date\b/, /\bDate\(/, /\bperformance\.now\b/, /\bprocess\.hrtime\b/, /\bset(Timeout|Interval|Immediate)\b/]
      .map((pattern) => pattern.source)
      .join('|'),
  )
  const sources = readdirSync(import.meta.dir).filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
  expect(sources).toContain('runtime.ts')
  const found = sources.flatMap((file) =>
    readFileSync(join(import.meta.dir, file), 'utf8')
      .split('\n')
      .flatMap((line, n) => platform.test(line) ? [`${file}:${n + 1}: ${line.trim()}`] : [])
  )
  expect(found).toEqual([])
})

test('a process runs to its end under the scheduler of the tests, which needs nothing of the platform', () => {
  // Decision 0104: the controlled scheduler steps a run by hand and synchronously, so a run that ends there needed
  // no timer and no microtask. The SQLite client is synchronous, and time is the test clock's.
  const scenario = Effect.scoped(Effect.flatMap(createTables, () =>
    Effect.gen(function*() {
      const { layer } = yield* hands()
      const { entities, unloaded } = unloads()
      const at = yield* DateTime.now
      return yield* process({ unloaded, passivate: { millis: 5 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: { _tag: 'Tester' } })
          yield* runtime.settled
          yield* TestClock.adjust('5 millis')
          yield* TestClock.adjust('60 millis')
          yield* runtime.settled
          return { read: yield* toy.read(id), unloaded: [...entities] }
        }))
    }))).pipe(
      Effect.provide(SqliteClient.layer({ filename: ':memory:' })),
      Effect.provide(TestClock.layer()),
      Effect.orDie,
    )
  const ended = { read: 0, unloaded: [id, id] }
  const run = scheduled(scenario, inOrder)
  expect(run.exit !== undefined && Exit.isSuccess(run.exit) ? run.exit.value : run.exit).toEqual(ended)
  expect(run.left).toBe(0)
  // And a run of the process is the same each time, given the same decisions: nothing Effect or the library
  // computes once for the process, as a cache, changes the steps of a later run.
  for (const recorded of [run, scheduled(scenario, prioritized(1, 3, run.schedule.preemptions.length))]) {
    const again = replayedSchedule(scenario, recorded.schedule)
    expect({ schedule: again.schedule, steps: again.steps }).toEqual({
      schedule: recorded.schedule,
      steps: recorded.steps,
    })
    expect(again.exit !== undefined && Exit.isSuccess(again.exit) ? again.exit.value : again.exit).toEqual(ended)
  }
})

test('a sender answered Suspended is woken by the resumption, under prioritized schedules from its arrival', () => {
  // Decision 0063: a sender registers for the receiver's resumption before it sends. A resumption between its being
  // answered `Suspended` and a registration made after it would wake no one, and the sender would wait for ever:
  // with the registration moved after the answer, 27 seeds of 2,000 do not end.
  const sender: Program<Omit<T, 'services'> & { services: Entities }> = {
    ...program,
    name: 'Sender',
    init: (_flags, at) => ({ want: ['c'], applied: [], since: at, rings: at }),
    operations: {
      A: operation(() => Effect.succeed(done('a'))),
      B: operation.atMostOnce(({ key }) => Effect.succeed(done(key)), ({ key }): Internal => ({ _tag: 'Unknown', key })),
      C: operation.atLeastOnce(({ key }) =>
        Effect.as(send(program, id, { _tag: 'Want', key: 'a', on: false, nonce: 'sent' }, 'want'), done(key))
      ),
    },
  }
  // The schedules are explored from the sender's arrival on.
  explored((window) =>
    Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      const store = storage(program, yield* SqlClient.SqlClient)
      return yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          const senders = yield* runtime.deploy(sender)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
          yield* runtime.settled
          yield* toy.send(id, { _tag: 'Break', nonce: 'b' }, { requestId: 'break', sender: tester })
          // The sender's operation sends to the suspended toy while an operator discards what it died on.
          yield* opened(window, true)
          yield* senders.create('s', { at }, { requestId: 's', sender: tester })
          yield* toy.discard(id)
          yield* runtime.settled
          return { applied: (yield* store.load(id))?.state.applied, wanted: yield* senders.read('s') }
        }))
    }), { applied: ['sent'], wanted: 0 }, { open: false })
}, 60_000)

test('an entity whose wait runs out as an event arrives waits again from the event, under prioritized schedules', () => {
  // Decision 0116: the wait's end is put in the entity's queue, and one put there just before the event that ended the
  // wait is passed over. Taken for the next wait's end, it would unload the entity as soon as the event is applied,
  // 2 millis after it: an unload no activation follows. The event applied first waits again, and the wait run out
  // first is followed by the message's activation, so either order pairs each unload with an activation.
  explored((window) =>
    Effect.gen(function*() {
      const { layer } = yield* hands()
      const { events, observe } = log()
      const { entities, unloaded } = unloads()
      const at = yield* DateTime.now
      return yield* process({ observe, unloaded, passivate: { millis: 5 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(timed), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
          yield* runtime.settled
          // The wait runs out at 5 millis. An event applied before, at 3, starts it again until 8.
          yield* TestClock.adjust('3 millis')
          yield* opened(window, true)
          yield* together<unknown, unknown, never>([
            toy.send(id, { _tag: 'Want', key: 't', on: true, nonce: 'w' }, { requestId: 'w', sender: tester }),
            Effect.asVoid(TestClock.adjust('2 millis')),
          ])
          yield* opened(window, false)
          yield* runtime.settled
          return entities.length - events.filter((event) => event._tag === 'Restart').length
        }))
    }), 0, { open: false })
}, 60_000)

test('callers of an unloaded entity build one machine for it, under prioritized schedules from their arrival', () => {
  // Decision 0067: an entity's lock is dropped by its last user only. One dropped while a caller waits for it lets a
  // new taker hold a lock of its own beside that caller, and both load the entity: two machines, two `Restart`s.
  // With the lock dropped by any user, 67 seeds of 2,000 build two.
  // The schedules are explored from the callers' arrival on.
  explored((window) =>
    Effect.gen(function*() {
      const { layer } = yield* hands()
      const { events, observe } = log()
      const { entities, unloaded } = unloads()
      const at = yield* DateTime.now
      return yield* process({ observe, unloaded, passivate: { millis: 5 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(timed), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
          yield* runtime.settled
          yield* TestClock.adjust('5 millis')
          const want = (nonce: string) =>
            toy.send(id, { _tag: 'Want', key: 't', on: true, nonce }, { requestId: nonce, sender: tester })
          yield* opened(window, true)
          yield* together([want('w-1'), want('w-2')])
          yield* runtime.settled
          return { unloaded: [...entities], restarts: events.filter((event) => event._tag === 'Restart').length }
        }))
    }), { unloaded: [id], restarts: 1 }, { open: false })
}, 60_000)

test('a message that arrives as the wait of its entity runs out is handled, under prioritized schedules', () => {
  // Decision 0116: an entity's wait ends with an item of its queue, and nothing races its take. A take raced against a
  // timeout loses the event when the racing fiber is preempted at the third step after its resumption, and its caller
  // waits for ever. Seed 54, pinned, reaches it against the wait written as `Effect.timeoutOption` of the take, mapped
  // to a `Passivate` where it runs out, with the sleep and the pass-over left in place unused, under the writes of a
  // step of decision 0137. A seed draws its schedule from the yields of the code it runs, so another form of the old
  // wait needs a seed of its own, which `bun run test:explore` finds in a round or two.
  explored((window) =>
    Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      return yield* process({ passivate: { millis: 5 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(timed), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
          yield* runtime.settled
          // The message and the move that runs the wait out, at once. The window stays open across the move, where
          // `adjusted` closes it: the race explored is the move's own, between the timeout it fires and the take.
          yield* opened(window, true)
          const [reply] = yield* together<unknown, unknown, never>([
            toy.send(id, { _tag: 'Want', key: 't', on: true, nonce: 'w' }, { requestId: 'w', sender: tester }),
            Effect.asVoid(TestClock.adjust('5 millis')),
          ])
          yield* opened(window, false)
          yield* runtime.settled
          return reply
        }))
    }), { _tag: 'Accepted' }, { open: false, pinned: [54] })
}, 60_000)

test('settled never returns between a crash and the activation its due timer brings, under prioritized schedules', () => {
  // Decisions 0029 and 0068: the process is not settled while a stored timer of an entity it does not hold is due. A
  // crash makes its entity leave without counting it as unloading, so it leaves and pokes the waker in one step. A
  // `settled` that looked between two steps would find the entity neither held nor known to the waker, with its timer
  // due. The message's commit waits at a gate while the timer comes due, then dies once the window is open. A leave
  // split in two steps returns early at 18 seeds of 2,000, the first 39, pinned, under the yields of decision 0134.
  explored((window) =>
    Effect.gen(function*() {
      const { layer } = yield* hands()
      const gate = yield* Deferred.make<void>()
      let crashed = false
      let restarted = false
      return yield* process({
        at: (point, _entity, event) =>
          point === 'BeforeCommit' && received(event) === 'r-1' && !crashed
            ? Effect.andThen(Deferred.await(gate), Effect.suspend(() => {
              crashed = true
              return Effect.die('the runtime failed')
            }))
            : Effect.void,
        observe: (_entity, event) =>
          Effect.sync(() => {
            if (crashed && event._tag === 'Restart') restarted = true
          }),
      }, (runtime) =>
        Effect.gen(function*() {
          const at = yield* DateTime.now
          const toy = yield* Effect.provide(runtime.deploy(timed), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
          yield* runtime.settled
          const sent = yield* Effect.forkChild(Effect.exit(toy.send(id, { _tag: 'Want', key: 't', on: true, nonce: 'n-1' }, { requestId: 'r-1', sender: tester })))
          // The timer rings at 40 millis, while the message waits at the gate: its firing waits behind the message.
          yield* adjusted(window, '40 millis')
          yield* opened(window, true)
          const [, early] = yield* together<boolean | void, never, never>([
            Deferred.succeed(gate, undefined),
            Effect.andThen(runtime.settled, Effect.sync(() => crashed && !restarted)),
          ])
          yield* opened(window, false)
          yield* Fiber.join(sent)
          yield* runtime.settled
          return { early, restarted }
        }))
    }), { early: false, restarted: true }, { open: false, pinned: [39] })
}, 60_000)

test('settled never returns while the waker rests from a reading another entity left during, under bounded schedules', () => {
  // Decision 0068: the waker looks whether a poke waits, and clears its flag, in one step. Two entities crash one after
  // the other. The first, `later`, has a timer in the future, and its departure wakes the waker, whose reading leaves
  // out `timed`, still held, with its timer due. Were the look and the clearing two steps, `timed` could leave between
  // them. The waker would then sleep toward the timer of `later`, and `settled` return with the timer of `timed` known
  // to nobody. A preemption of the waker between the two steps reaches it.
  explored((window) =>
    Effect.gen(function*() {
      const { layer } = yield* hands()
      const gate = yield* Deferred.make<void>()
      const crashed = new Set<string>()
      let early = false
      let restarted = false
      return yield* process({
        // `timed` yields twice after the gate, so that in the run in order the waker reads between the two
        // departures, and one preemption is enough to put the second inside the waker's step.
        at: (point, entity, event) =>
          point === 'BeforeCommit' && received(event) === `r-${entity.id}` && !crashed.has(entity.id)
            ? Effect.andThen(
              Deferred.await(gate),
              Effect.andThen(
                entity.id === 'timed' ? Effect.andThen(Effect.yieldNow, Effect.yieldNow) : Effect.void,
                Effect.suspend(() => {
                  crashed.add(entity.id)
                  return Effect.die('the runtime failed')
                }),
              ),
            )
            : Effect.void,
        observe: (entity, event) =>
          Effect.sync(() => {
            if (entity.id === 'timed' && crashed.has('timed') && event._tag === 'Restart') restarted = true
          }),
      }, (runtime) =>
        Effect.gen(function*() {
          const at = yield* DateTime.now
          const toy = yield* Effect.provide(runtime.deploy(timed), layer)
          // `timed` rings at 40 millis, and `later` at 50.
          yield* toy.create('timed', { at }, { requestId: 'c-timed', sender: tester })
          yield* adjusted(window, '10 millis')
          yield* toy.create('later', { at }, { requestId: 'c-later', sender: tester })
          yield* runtime.settled
          // Once the caller of `timed` is answered, `timed` has left, and the rest runs in order.
          const want = (entity: string) =>
            Effect.forkChild(
              Effect.exit(toy.send(entity, { _tag: 'Want', key: 'a', on: false, nonce: `r-${entity}` }, {
                requestId: `r-${entity}`,
                sender: tester,
              })).pipe(Effect.ensuring(Effect.sync(() => {
                if (entity === 'timed') window.open = false
              }))),
            )
          const sent = [yield* want('later'), yield* want('timed')]
          // The clock reaches 40 millis while both messages wait at the gate.
          yield* adjusted(window, '30 millis')
          yield* opened(window, true)
          yield* together<void, never, never>([
            Deferred.succeed(gate, undefined).pipe(Effect.asVoid),
            Effect.andThen(runtime.settled, Effect.sync(() => {
              if (crashed.has('timed') && !restarted) early = true
            })),
          ])
          yield* opened(window, false)
          yield* Effect.forEach(sent, Fiber.join)
          yield* runtime.settled
          return { early, restarted }
        }))
    }), { early: false, restarted: true }, { open: false, bound: 1 })
}, 60_000)
