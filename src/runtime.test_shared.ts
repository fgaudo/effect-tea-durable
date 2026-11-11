/**
 * What the tests of the runtime share: the toy program and its variants, the process a test launches with its
 * probe, the database of one test, and `explored`, which runs a test under the scheduler of the tests (decision
 * 0104). The tests of `src/runtime.test.ts` and of `src/runtime/` import it, and no module of the library does
 * (decision 0241).
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Clock from 'effect/Clock'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Deferred from 'effect/Deferred'
import type * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Layer from 'effect/Layer'
import * as Scope from 'effect/Scope'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/sql'
import { TestClock } from 'effect/testing'
import * as Tracer from 'effect/Tracer'
import * as Machine from './machine.ts'
import {
  defect,
  type Address,
  type Entities,
  type IdempotencyKey,
  isTimer,
  noWork,
  operation,
  type Program,
  rejectWith,
  send,
  timer,
} from './program.ts'
import { launch, type Options, type Point, Probe, type Runtime } from './runtime.ts'
import { createTables, type Dialect, storage } from './storage.ts'
import { client, onEach } from './storage.test_databases.ts'
import { prioritized, type Run, scheduled, seeds, type Strategy } from './testing.ts'

/**
 * Cluster's tables of messages and replies, with the one column the runtime on Cluster deletes their rows by, for the
 * tests that run the runtime on a fake of Cluster (decision 0169).
 */
export const clusterTables = Effect.flatMap(SqlClient.SqlClient, (sql) =>
  Effect.andThen(
    sql`CREATE TABLE IF NOT EXISTS cluster_messages (request_id BIGINT NOT NULL)`,
    sql`CREATE TABLE IF NOT EXISTS cluster_replies (request_id BIGINT NOT NULL)`,
  )).pipe(Effect.orDie)

// The toy of `machine.test.ts`, with the schemas a runtime needs: `a` is idempotent, `b` at most once, `c` at
// least once, and `t` a timer. Each key's work ends by removing its key, unless a message brings it back.
export const keys = ['a', 'b', 'c', 't'] as const
export type Key = (typeof keys)[number]

export const Key = Schema.Literals(keys)

export const State = Schema.Struct({
  want: Schema.Array(Key),
  applied: Schema.Array(Schema.String),
  since: Schema.DateTimeUtcFromMillis,
  rings: Schema.DateTimeUtcFromMillis,
})
export type State = typeof State.Type

export const Inbound = Schema.Union([
  Schema.TaggedStruct('Want', { key: Key, on: Schema.Boolean, nonce: Schema.String }),
  Schema.TaggedStruct('Refuse', { nonce: Schema.String }),
  Schema.TaggedStruct('Break', { nonce: Schema.String }),
])
export type Inbound = typeof Inbound.Type

export const Internal = Schema.Union([
  Schema.TaggedStruct('Done', { key: Key }),
  Schema.TaggedStruct('Unknown', { key: Key }),
  Schema.TaggedStruct('Rang', { key: Key }),
])
export type Internal = typeof Internal.Type

export const Operation = Schema.Union([
  Schema.TaggedStruct('A', {}),
  Schema.TaggedStruct('B', { key: Key }),
  Schema.TaggedStruct('C', { key: Key }),
])
export type Operation = typeof Operation.Type

export const Sender = Schema.TaggedStruct('Tester', {})
export type Sender = typeof Sender.Type

/** What the test's operations do instead of acting on the world: it records them, and may die. */
export class Hands extends Context.Service<Hands, {
  readonly act: (key: Key, idempotencyKey: IdempotencyKey | null) => Effect.Effect<void>
}>()('Hands') {}

export type T = {
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

export const done = (key: Key): Internal => ({ _tag: 'Done', key })

export const acts = (key: Key, idempotencyKey: IdempotencyKey | null) =>
  Effect.flatMap(Effect.service(Hands), (hands) => Effect.as(hands.act(key, idempotencyKey), done(key)))

export const program: Program<T> = {
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
  work: (state) =>
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
export const hands = (options: Readonly<{ holds?: boolean }> = {}) =>
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

export const id = 'toy-1'
/** A limit no reading of these tests reaches: a reading says how many rows it takes (decision 0141). */
export const all = 1_000
/** The one consumer most tests of the log read with, declared where they deploy (decision 0152). */
export const queue = { consumers: { projection: ['queue'] } } as const

export const tester = { _tag: 'Tester' } as const

/** A reply as its row holds it, by request. */
export type Answered = Readonly<{ request: string; tag: string; reason: unknown }>

/**
 * What is compared: the stored state as a value, with the work and the suspension's cause normalised, and the
 * replies stored for the entity, which the machine does not hold (decision 0065).
 */
export const shape = (stored: Machine.Stored<T> | null, replies: ReadonlyArray<Answered>) =>
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
export const persisted = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const stored = yield* storage(program, sql).load(id)
  const replies = yield* sql<{ request: string; tag: string; reason: string | null }>`
    SELECT request, tag, reason FROM effecttea_replies WHERE name = ${program.name} AND id = ${id}
  `
  return shape(
    stored,
    replies.map(({ request, tag, reason }) => ({ request, tag, reason: reason === null ? null : JSON.parse(reason) })),
  )
})

/**
 * A database for one test: every process of the test shares it, as a crash leaves the file behind. Time is the
 * test's: it starts at 0, and moves only when the test moves it (decision 0066). A test runs on SQLite, whose
 * statements end before their fiber yields, so that a test that moves the clock finds done what the time has come
 * for. One on PGlite does not, so `onBoth` runs on both dialects the tests whose steps write what the dialects
 * write otherwise, which move the clock only where nothing waits for a statement (decision 0157).
 */
export const database = <A, E>(test: Effect.Effect<A, E, SqlClient.SqlClient>, dialects: ReadonlyArray<Dialect> = ['sqlite']) =>
  onEach(dialects, (dialect) =>
    Effect.runPromise(
      Effect.scoped(Effect.flatMap(createTables, () => test)).pipe(
        Effect.provide(client(dialect)),
        Effect.provide(TestClock.layer()),
        Effect.orDie,
      ),
    ))

export const onBoth = <A, E>(test: Effect.Effect<A, E, SqlClient.SqlClient>) => database(test, ['sqlite', 'pg'])

/**
 * What a test is told of what the runtime did, each kind of it apart: `at` each point of the crash table, where it
 * dies or never returns to crash the process, `observe` each event applied, and `unloaded` each passivation.
 */
export type Hooks = Readonly<{
  at?: (point: Point, entity: Address, event: Machine.Event<never>) => Effect.Effect<void>
  observe?: (entity: Address, event: Machine.Event<never>) => Effect.Effect<void>
  unloaded?: (entity: Address) => Effect.Effect<void>
  /** The strategy of the scope the process is launched in: sequential by default, as `Effect.scoped` makes it. */
  finalizers?: 'parallel'
}>

/**
 * One process over the database: it ends when the body does, and everything running in it is interrupted. The
 * hooks are the runtime's probe, which it reads as it launches (decision 0073). It sweeps nothing unless `sweep` is
 * given, so that the sweep's fiber moves no schedule of the explored tests (decision 0245).
 */
export const process = <A, E, R>(
  { at, observe, unloaded, finalizers, ...given }: Options & Hooks,
  body: (runtime: Runtime) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | SqlClient.SqlClient> => {
  const options: Options = { sweep: 'none', ...given }
  return (finalizers === undefined
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
}

/**
 * Runs `effect` in a fiber of its own until it, and everything it sets going, waits: the clock's `adjust` waits for
 * the fibers it wakes to wait again, so what the test starts here is done or held when the fiber is given, with
 * the clock a millisecond on (decision 0066).
 */
export const running = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function*() {
    const fiber = yield* Effect.forkChild(Effect.delay(effect, '1 millis'))
    yield* TestClock.adjust('1 millis')
    return fiber
  })

/** The same for an effect that ends: what it gives, once everything it set going waits. */
export const ran = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.flatMap(running(effect), Fiber.join)

/** A deviation of a run in order under `bound` 1: at its `decision`-th decision in the window, the `choice`-th way. */
export type Deviation = { decision: number; choice: number }

/**
 * Where a test under `explored` is explored: while it is open, the schedules preempt and pick as PCT draws them; while
 * the test closes it, the run goes in order. A test closes it before it moves the clock, so that the fibers the move
 * wakes are at their waits, as decision 0104 found they must be.
 */
export type Window = { open: boolean }

/**
 * The share of its seeds, or of its deviations under `bound` 1, a test under `explored` runs. The release's run,
 * `bun run test:release`, runs them all; any other run of the tests runs one in twenty, so that the suite holds its
 * budget (decision 0250).
 */
export const share = Bun.env['SCHEDULES'] === 'all' ? 1 : 1 / 20

/**
 * A test of one case that runs over two seconds, which `bun test` cannot sample: its clock is real, or its case is
 * large. `bun test` skips it, and `bun run test:release` runs it, as `bun run test:slow` and its job of the CI run a
 * test on a clock that is real, under `SCHEDULES=all` (decision 0250).
 */
export const slow = Bun.env['SCHEDULES'] === 'all' ? test : test.skip

/**
 * The seed a test under `explored` starts from: 0, so that `bun test` and the release replay the same schedules,
 * unless `SEED` names another. `bun run test:explore` draws it at random, so that each of its runs tries new schedules.
 */
export const first = (() => {
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
 * of one fiber. The release runs every deviation, and any other run one in twenty, from the first, as `share` says
 * (decision 0250). The seeds `pinned` under PCT, and the deviations `pinned` under `bound` 1, run in every run: each
 * is one a run once failed on, kept once its bug is fixed.
 */
export const explored = <A>(
  test: (window: Window) => Effect.Effect<A, unknown, SqlClient.SqlClient | Scope.Scope>,
  ended: A,
  { runs = 2_000, depth = 4, open = true, bound, pinned = [] }: Readonly<
    & { runs?: number; depth?: number; open?: boolean }
    // A schedule under `bound` 1 has no seed, so it pins its deviations.
    & ({ bound?: never; pinned?: ReadonlyArray<number> } | { bound: 1; pinned?: ReadonlyArray<Deviation> })
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
    const deviations = ways.flatMap((choices, decision) =>
      Array.from({ length: choices - 1 }, (_, at): Deviation => ({ decision, choice: at + 1 }))
    )
    // Sampled over the deviations, not over the decisions, so that a decision of many choices is not left out whole.
    const every = Math.round(1 / share)
    const held = (pinned ?? []) as ReadonlyArray<Deviation>
    const chosen = deviations.filter(({ decision, choice }, at) =>
      at % every === 0 || held.some((pin) => pin.decision === decision && pin.choice === choice)
    )
    for (const { decision, choice } of chosen) {
      let at = -1
      const run = scheduled(scenario, {
        pick: () => window.open && ++at === decision ? choice : 0,
        preempt: () => window.open && ++at === decision,
      }, 'inline')
      expect({ decision, choice, ended: ends(run) }).toEqual({ decision, choice, ended })
    }
    return
  }
  let steps = 0
  scheduled(scenario, { pick: () => 0, preempt: () => (window.open && (steps += 1), false) }, 'inline')
  for (const seed of seeds({ first, count: Math.ceil(runs * share), pinned: pinned as ReadonlyArray<number> })) {
    const run = scheduled(scenario, within(prioritized(seed, depth, steps)), 'inline')
    expect({ seed, ended: ends(run) }).toEqual({ seed, ended })
  }
}

/** A tracer that keeps every span the run opens, in the order they open, as Effect's own spans (decision 0220). */
export const tracing = () => {
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span: (options) => {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    },
  })
  return { spans, tracer }
}

/**
 * A wall clock `wall.skew` milliseconds off the test's clock, whose sleeps are the test clock's: a host suspended
 * moves the wall clock on and leaves every sleep where it was, and a clock set back moves the wall clock back
 * (decision 0221). The test moves its clock with `adjust`, since `TestClock.adjust` finds no test clock where this
 * one is provided.
 */
export const skewing = TestClock.testClockWith((test) =>
  Effect.sync(() => {
    const wall = { skew: 0 }
    const millis = () => test.currentTimeMillisUnsafe() + wall.skew
    const nanos = () => BigInt(millis()) * 1_000_000n
    const clock: Clock.Clock = {
      currentTimeMillisUnsafe: millis,
      currentTimeMillis: Effect.sync(millis),
      currentTimeNanosUnsafe: nanos,
      currentTimeNanos: Effect.sync(nanos),
      monotonicTimeNanosUnsafe: () => test.monotonicTimeNanosUnsafe(),
      monotonicTimeNanos: test.monotonicTimeNanos,
      sleep: (duration) => test.sleep(duration),
    }
    return { wall, clock, adjust: (duration: Duration.Input) => test.adjust(duration) }
  })
)

/** The toy with its timer alone, at the time of its flags, as far off as a test sets it. */
export const distant: Program<T> = {
  ...program,
  name: 'Distant',
  init: (flags, at) => ({ want: ['t'], applied: [], since: at, rings: flags.at }),
}

export const hour = 60 * 60 * 1000

/**
 * Runs `effects` at once, each forked as a task of its own, and gives what each gives. `Effect.all` starts its
 * children inline, on the stack of its own fiber. So the second child would be forked only once the first one has
 * waited or yielded, and a child that waits before its second step never yields (decisions 0104, 0117, 0244).
 */
export const together = <A, E, R>(effects: ReadonlyArray<Effect.Effect<A, E, R>>) =>
  Effect.flatMap(Effect.forEach(effects, (effect) => Effect.forkChild(effect)), (fibers) => Effect.forEach(fibers, Fiber.join))

/** Opens or closes the window of a test under `explored`. */
export const opened = (window: Window, open: boolean) => Effect.sync(() => (window.open = open))

/**
 * `TestClock.adjust` in a test under `explored`, with its window closed: the fibers the move wakes are then at their
 * waits, and `adjust` waits for what it wakes (decision 0104). What the move sets going runs in order.
 */
export const adjusted = (window: Window, duration: Duration.Input) =>
  Effect.suspend(() => {
    const open = window.open
    window.open = false
    return Effect.ensuring(TestClock.adjust(duration), Effect.sync(() => (window.open = open)))
  })

/** The request id a caller's message is received under, or null for any other event. */
export const received = (event: Machine.Event<never>) =>
  event._tag === 'Receive' && event.request._tag === 'Caller' ? event.request.id : null

/**
 * The events the runtime committed, replayed in the machine.
 The first of them is the entity's creation, since
 * nothing can happen to an entity that is not stored yet: a log without one is a creation that never committed,
 * and there is no entity to compare.
 */
export const replayed = (at: DateTime.Utc, events: ReadonlyArray<Machine.Event<T>>) => {
  const [first, ...rest] = events
  if (first === undefined || first._tag !== 'Create') return null
  const created = Machine.start(program, id, { at }, at, first.request)
  if (created._tag !== 'Created') throw created._tag === 'Defect' ? created.cause : created.reply
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
export const publishedOf = (at: DateTime.Utc, events: ReadonlyArray<Machine.Event<T>>) => {
  const [first, ...rest] = events
  // A log without a creation is one that never committed: nothing of the entity was published either.
  if (first === undefined || first._tag !== 'Create') return []
  const created = Machine.start(program, id, { at }, at, first.request)
  if (created._tag !== 'Created') throw created._tag === 'Defect' ? created.cause : created.reply
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
export const unloads = () => {
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
export const ahead = () => {
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
export const gated = () =>
  Effect.sync(() => {
    const gate = Deferred.makeUnsafe<void>()
    return {
      open: Deferred.succeed(gate, undefined),
      layer: Layer.succeed(Hands, Hands.of({ act: () => Deferred.await(gate) })),
    }
  })

/** A program whose entities are created with their timer alone: nothing under way, and spare until it is due. */
export const timed: Program<T> = {
  ...program,
  name: 'Timed',
  init: (_flags, at) => ({ want: ['t'], applied: [], since: at, rings: DateTime.addDuration(at, '40 millis') }),
}

/** A program whose `c` sends `Want a off` to the toy `id`, named `want`, and ends once answered: a sender to it. */
export const sending: Program<Omit<T, 'services'> & { services: Entities }> = {
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
export const log = () => {
  const events: Array<Machine.Event<T>> = []
  const observe: Hooks['observe'] = (_entity, event) =>
    Effect.sync(() => {
      events.push(event as Machine.Event<T>)
    })
  return { events, observe }
}
