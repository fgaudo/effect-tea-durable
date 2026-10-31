/**
 * The runtime on SQLite against the machine: a scenario is driven on the real runtime, with a crash injected at
 * each point of the design's crash table, and what the database holds afterwards is compared with where the pure
 * machine ends on the same events (decision 0013). The runtime's own rules — a transaction per event, the work
 * started after the commit, an entity activated when the process starts — are what the comparison tests.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { describe, expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Layer from 'effect/Layer'
import fc from 'fast-check'
import * as Scheduler from 'effect/Scheduler'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/sql'
import { TestClock } from 'effect/testing'
import * as Machine from './machine.ts'
import {
  defect,
  type IdempotencyKey,
  InvariantDefect,
  isTimer,
  type Json,
  noWork,
  operation,
  type Program,
  rejectWith,
  timer,
} from './program.ts'
import { type Answer, launch, type Options, type Point, type Runtime } from './runtime.ts'
import { createTables, storage } from './storage.ts'

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
  keys,
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
      Object.entries(stored.keys).map(([key, held]) => [key, {
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

/** One process over the database: it ends when the body does, and everything running in it is interrupted. */
const process = <A, E, R>(
  options: Options,
  body: (runtime: Runtime) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | SqlClient.SqlClient> => Effect.scoped(Effect.flatMap(launch(options), body))

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
    projection: number
  }>
  const rows: Array<Row> = [{ kind: 'Creation', message: null, projection: shown }]
  for (const event of rest) {
    // The message a step handles is the mailbox's first, read before the step takes it.
    const head = machine.stored.mailbox[0]
    const next = Machine.step(program, machine, event).machine
    const after = program.project(next.stored.state)
    if (next.stored.state !== machine.stored.state && after !== shown) {
      rows.push({
        kind: head?._tag ?? 'Creation',
        message: head?.message ?? null,
        projection: after,
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
  const unloaded: Options['unloaded'] = (entity) =>
    Effect.sync(() => {
      entities.push(entity.id)
    })
  return { entities, unloaded }
}

/** Collects every event the runtime commits, in order. */
const log = () => {
  const events: Array<Machine.Event<T>> = []
  const observe: Options['observe'] = (_entity, event) =>
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

  test('the process settles and a stored timer wakes its entity, however often the fibers yield', async () => {
    // Each budget is how many steps a fiber takes before it yields, which moves every point where one fiber may
    // run between two steps of another (decision 0068). Below 3 a fiber does nothing but yield.
    const budgets = Array.from({ length: 398 }, (_, n) => n + 3)
    for (const budget of budgets) {
      await database(Effect.gen(function*() {
        const { layer } = yield* hands()
        const { entities, unloaded } = unloads()
        const at = yield* DateTime.now
        yield* process({ unloaded, passivate: { millis: 5 } }, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(program), layer)
            yield* toy.create(id, { at }, { requestId: 'creation', sender: { _tag: 'Tester' } })
            // An operation that ended before it was held would be counted as running for ever, and this would
            // never return, which the test's own timeout reports.
            yield* runtime.settled
            yield* TestClock.adjust('5 millis')
            yield* TestClock.adjust('60 millis')
            yield* runtime.settled
            expect({ budget, read: yield* toy.read(id), unloaded: entities }).toEqual({
              budget,
              read: 0,
              unloaded: [id, id],
            })
          }))
      }).pipe(Effect.provideService(Scheduler.MaxOpsBeforeYield, budget)))
    }
  }, 30_000)

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
          expect(Object.keys(stored?.keys ?? {}).filter((key) => stored?.keys[key]?.work !== undefined))
            .toEqual(['t'])
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

  // An inbound message is two transactions, its `Receive` and its step: one a crash left between them is found
  // at the next start, as an interrupted operation is (decision 0071).
  test('a message a crash left in the mailbox of an idle entity is handled at the next start, with no retry', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const sender = { _tag: 'Tester' } as const
      const store = storage(program, yield* SqlClient.SqlClient)
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
      const crashed = yield* Deferred.make<void>()
      const dying = process({
        at: (point, _entity, event) =>
          point === 'BeforeCommit' && event._tag === 'Handle'
            ? Effect.flatMap(Deferred.succeed(crashed, undefined), () => Effect.never)
            : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* running(toy.send(id, { _tag: 'Want', key: 'a', on: false, nonce: 'left' }, {
            requestId: 'left',
            sender,
          }))
          yield* Effect.never
        }))
      yield* Effect.raceFirst(dying, Deferred.await(crashed))
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
          expect((yield* store.published(0)).map(({ kind, message, projection }) => ({ kind, message, projection })))
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
            const options: Options = {
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
            expect(
              (yield* store.published(0)).map(({ kind, message, projection }) => ({ kind, message, projection })),
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
          expect(yield* toy.query({})).toEqual(ids.map((id) => ({ id, projection: 0 })))
        }))
      // The rows outlive the process that wrote them, and each step writes its own.
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* working(runtime, program)
          expect(yield* toy.read('t-1')).toBe(1)
          expect(yield* toy.query({ where: [{ index: 'wanted', is: '=', value: 0 }] }))
            .toEqual([{ id: 't-2', projection: 0 }])
          expect((yield* toy.query({ order: { index: 'wanted', descending: true } })).map(({ id }) => id))
            .toEqual(['t-1', 't-3', 't-2'])
          expect((yield* toy.query({ order: { index: 'wanted', descending: true }, limit: 2 })).map(({ id }) => id))
            .toEqual(held)
          expect(yield* toy.query({ where: [{ index: 'wanted', is: '>', value: 9 }] })).toEqual([])
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
      expect(plan.map(({ detail }) => detail).join(' ')).toContain('USING INDEX projections Toy wanted (name=? AND <expr>')
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
          expect(yield* toy.query({ where: [{ index: 'wanted', is: '<', value: 0 }] })).toEqual([])
          expect(yield* toy.reindex).toBe(3)
          expect((yield* toy.query({ where: [{ index: 'wanted', is: '=', value: -1 }] })).map(({ id }) => id))
            .toEqual(held)
        }))
    })))

  // A row is written only if the state it was computed from is still the one stored (decision 0070).
  test('reindex leaves no row a step has moved past, however often the fibers yield', async () => {
    const budgets = Array.from({ length: 98 }, (_, n) => n + 3)
    for (const budget of budgets) {
      await database(Effect.gen(function*() {
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
        yield* process({}, (runtime) =>
          Effect.gen(function*() {
            const { layer } = yield* hands({ holds: true })
            const toy = yield* Effect.provide(runtime.deploy(negated), layer)
            // The step lands somewhere in the walk, where the row of 't-3' may be computed before it and written
            // after it.
            const reindexing = yield* Effect.forkChild(toy.reindex)
            yield* Effect.yieldNow
            yield* toy.send('t-3', { _tag: 'Want', key: 'a', on: true, nonce: 'on' }, {
              requestId: 'on',
              sender: tester,
            })
            yield* Fiber.join(reindexing)
            const read = yield* Effect.forEach(walked, (id) =>
              Effect.map(toy.read(id), (projection) => ({ id, projection })))
            const rows: ReadonlyArray<unknown> = yield* toy.query({})
            expect({ budget, rows }).toEqual({ budget, rows: read })
          }))
      }).pipe(Effect.provideService(Scheduler.MaxOpsBeforeYield, budget)))
    }
  }, 30_000)
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
          expect((yield* toy.published(0)).map(({ seq: _seq, ...row }) => row)).toEqual([
            { id, kind: 'Creation', message: null, projection: 4 },
            {
              id,
              kind: 'Inbound',
              message: { _tag: 'Want', key: 't', on: false, nonce: 'off' },
              projection: 3,
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
          const rows = yield* toy.published(0)
          // The creation, then the completion of each operation and the firing of the timer: what callers read
          // falls by one at each, whatever order the work came back in.
          expect(rows.map(({ kind }) => kind)).toEqual(['Creation', 'Internal', 'Internal', 'Internal', 'Internal'])
          expect(rows.map(({ projection }) => projection)).toEqual([4, 3, 2, 1, 0])
          expect(rows.map(({ seq }) => seq)).toEqual([...rows.map(({ seq }) => seq)].sort((a, b) => a - b))
          const second = rows[1]?.seq ?? 0
          expect(yield* toy.published(second)).toEqual(rows.slice(2))
          expect(yield* toy.published(0, 2)).toEqual(rows.slice(0, 2))
          // A consumer reads from a cursor of its own, which the readings above neither moved nor stored: it
          // starts at the beginning, and goes on from where it acked (decision 0039).
          expect(yield* toy.feed('queue', 2)).toEqual(rows.slice(0, 2))
          yield* toy.ack('queue', second)
          expect(yield* toy.feed('queue')).toEqual(rows.slice(2))
          expect(yield* toy.prune).toBe(2)
          expect(yield* toy.published(0)).toEqual(rows.slice(2))
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
          const read = yield* toy.published(0)
          expect(read.map(({ projection }) => projection)).toEqual([4, 3])
          const cursor = read[1]?.seq ?? 0
          // The consumer acted on both rows and acked them: the prune takes what it has read, and its cursor
          // stands.
          yield* toy.ack('queue', cursor)
          expect(yield* toy.prune).toBe(2)
          expect(yield* toy.published(0)).toEqual([])
          yield* toy.send(id, { _tag: 'Want', key: 't', on: true, nonce: 'on' }, { requestId: 'on', sender: tester })
          // What is published next is past the cursor: a seq the prune freed is never given again, or the
          // consumer would read from beyond a row it never saw.
          const next = yield* toy.published(cursor)
          expect(next.map(({ projection }) => projection)).toEqual([4])
          expect(next[0]?.seq ?? 0).toBeGreaterThan(cursor)
          expect(yield* toy.published(0)).toEqual(next)
          expect(yield* toy.feed('queue')).toEqual(next)
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
          const rows = yield* toy.published(0)
          const last = rows[rows.length - 1]?.seq ?? 0
          // Nobody has read the log: a prune drops nothing, since the rows are somebody's to read by hand.
          expect(yield* toy.prune).toBe(0)
          expect(yield* toy.consumers).toEqual([])
          // Two consumers read it, and only one acts on what it read.
          expect(yield* toy.feed('queue')).toEqual(rows)
          expect(yield* toy.feed('audit')).toEqual(rows)
          yield* toy.ack('queue', last)
          // An ack never moves a cursor back: what is behind it may be gone.
          yield* toy.ack('queue', rows[0]?.seq ?? 0)
          expect(yield* toy.consumers).toEqual([
            { consumer: 'audit', seq: 0, behind: rows.length },
            { consumer: 'queue', seq: last, behind: 0 },
          ])
          // The one that is behind holds every row, however far the other has read.
          expect(yield* toy.prune).toBe(0)
          expect(yield* toy.published(0)).toEqual(rows)
          // An operator sees what it costs, and forgets the consumer: the next prune passes what it never read.
          yield* toy.forget('audit')
          expect(yield* toy.prune).toBe(rows.length)
          expect(yield* toy.published(0)).toEqual([])
          // Forgotten and reading again under the same name, it starts from 0: at least once, as a crash before
          // an ack gives (decision 0039).
          expect(yield* toy.feed('audit')).toEqual([])
          expect((yield* toy.consumers).map(({ consumer }) => consumer)).toEqual(['audit', 'queue'])
        }))
    })))

  test('an ack past the last seq moves the cursor to it, and the rows written after are kept', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          // Nothing was written yet: the cursor stays at 0.
          yield* toy.ack('queue', 1_000)
          expect(yield* toy.consumers).toEqual([{ consumer: 'queue', seq: 0, behind: 0 }])
          yield* toy.create(id, { at }, { requestId: 'creation', sender: tester })
          const [created] = yield* toy.published(0)
          // A consumer that acks beyond what it read stops at the last row: the next one is past its cursor.
          yield* toy.ack('queue', (created?.seq ?? 0) + 1_000)
          expect(yield* toy.consumers).toEqual([{ consumer: 'queue', seq: created?.seq ?? 0, behind: 0 }])
          yield* toy.send(id, { _tag: 'Want', key: 't', on: false, nonce: 'off' }, { requestId: 'off', sender: tester })
          expect(yield* toy.prune).toBe(1)
          expect((yield* toy.feed('queue')).map(({ projection }) => projection)).toEqual([3])
        }))
    })))

  test('a cursor or a limit that is no non-negative integer is its caller’s defect, and stores nothing', () =>
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
          // Each of them is refused before anything is read or stored (decision 0053).
          const refused = [
            toy.ack('queue', 2.5),
            toy.ack('queue', -5),
            toy.ack('queue', Number.NaN),
            toy.published(-1),
            toy.published(0, -1),
            toy.published(0, 1.5),
            toy.feed('queue', -1),
            toy.feed('queue', Number.POSITIVE_INFINITY),
            toy.query({ limit: -1 }),
            toy.query({ limit: 0.5 }),
          ]
          for (const call of refused) {
            expect(reasonOf(yield* Effect.exit(call))).toMatch(/^the (cursor|limit) is .+, which is no non-negative/)
          }
          // No consumer was stored by a call refused, and a limit of 0, or none, is a limit.
          expect(yield* toy.consumers).toEqual([])
          expect(yield* toy.published(0, 0)).toEqual([])
          expect((yield* toy.published(0)).length).toBe(1)
          expect((yield* toy.query({ limit: 0 })).length).toBe(0)
        }))
    })))

  test('entities stepping at once share one rising sequence, and nothing of theirs is lost', () =>
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
          const rows = yield* toy.published(0)
          // The creation of each, and the four pieces of work each was created with: the three entities step at
          // once, and a row of one is never written in the middle of another's step.
          expect(rows.length).toBe(ids.length * 5)
          const seqs = rows.map(({ seq }) => seq)
          expect(seqs).toEqual([...seqs].sort((a, b) => a - b))
          expect(new Set(seqs).size).toBe(seqs.length)
          for (const id of ids) {
            expect(rows.filter((row) => row.id === id).map(({ projection }) => projection)).toEqual([4, 3, 2, 1, 0])
          }
          // A consumer that read to the end is given nothing again.
          expect(yield* toy.published(seqs[seqs.length - 1] ?? 0)).toEqual([])
        }))
    })))

  test('a consumer reads from its cursor through an index, and never scans the log', () =>
    database(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const plan = yield* sql.unsafe<{ detail: string }>(
        `EXPLAIN QUERY PLAN SELECT seq, id, tag, version, message, projection FROM outbox
         WHERE name = 'Toy' AND seq > 7 ORDER BY seq LIMIT 100`,
      )
      // A range over (name, seq), which is also the order read: the log grows until a consumer prunes it, and
      // a poll must not read again what it has read.
      expect(plan.map(({ detail }) => detail).join(' ')).toContain('USING INDEX outbox_name (name=? AND seq>?)')
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
      expect((yield* store.published(0)).map(({ kind, projection }) => ({ kind, projection })))
        .toEqual([{ kind: 'Creation', projection: 4 }])
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
          const mine = yield* toys.feed('queue')
          const theirs = yield* twins.feed('queue')
          expect(mine.length).toBe(1)
          expect(theirs.length).toBe(1)
          // One sequence serves both logs, so a `seq` of the one is no cursor into the other: it is a row the
          // other's consumer never saw, and acking it would leave its own row where it is.
          expect(theirs[0]?.seq ?? 0).toBeGreaterThan(mine[0]?.seq ?? 0)
          yield* twins.ack('queue', mine[0]?.seq ?? 0)
          expect(yield* twins.prune).toBe(0)
          // Each acks its own, and the rows of the one go while the other's consumer holds its log.
          yield* twins.ack('queue', theirs[0]?.seq ?? 0)
          expect(yield* twins.prune).toBe(1)
          expect(yield* toys.prune).toBe(0)
          expect(yield* toys.published(0)).toEqual(mine)
          expect(yield* toys.consumers).toEqual([{ consumer: 'queue', seq: 0, behind: 1 }])
          expect(yield* twins.consumers).toEqual([{ consumer: 'queue', seq: theirs[0]?.seq ?? 0, behind: 0 }])
        }))
    })))

  // The premise the prune's one transaction rests on: the client leases its one connection under a semaphore of
  // one, and a transaction holds it for its duration (decisions 0007, 0039). Two statements apart let a
  // consumer register in between, which is what would have it read rows and have them dropped behind its cursor.
  test('a transaction keeps a consumer from registering between its statements, two statements apart do not', () =>
    database(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const lowest = sql<{ through: number | null }>`SELECT min(seq) AS through FROM cursors WHERE name = 'Toy'`
      const registers = sql`INSERT INTO cursors ${sql.insert({ name: 'Toy', consumer: 'late', seq: 0 })}`
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
    rejection: Rejection2
    sender: Sender2
    projection: Projection2
    index: 'wanted'
    services: Hands
  }

  const next: Program<T2> = {
    name: 'Toy',
    keys,
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
      // A reason is kept as long as its reply, which is for ever: a retry reads it through this.
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
          expect(yield* toy.query({ where: [{ index: 'wanted', is: '=', value: 0 }] }))
            .toEqual([{ id: 'm-1', projection: { wanted: 0 } }])
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
          expect(yield* toy.reindex).toBe(2)
          expect(yield* toy.query({ where: [{ index: 'wanted', is: '=', value: 0 }] }))
            .toEqual([{ id: 'm-1', projection: { wanted: 0 } }])
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
        // The message is written, and the runtime dies before it acts on it: the hook stands for a failed write.
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
      yield* process({
        // The second activation cannot finish, once the first has started its work.
        at: (point, entity, event) =>
          point === 'BeforeCommit' && entity.id === 'd-2' && event._tag === 'Restart'
            ? Effect.andThen(Deferred.await(acted), Effect.die('the runtime failed'))
            : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          expect(Exit.isFailure(yield* Effect.exit(Effect.provide(runtime.deploy(program), layer)))).toBe(true)
          // The first entity's work ran, and stopped with the deploy: nothing of a failed deploy runs on.
          expect(started.length).toBeGreaterThan(0)
          expect([...stopped].sort()).toEqual([...started].sort())
          yield* runtime.settled
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
      expect(stored?.suspension?.on).toEqual({ _tag: 'Operation', key: 'c', incarnation: 1 })
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
          const twice = { ...program, keys: [...program.keys, 'a'] } as Program<T>
          expect(reasonOf(yield* Effect.exit(Effect.provide(runtime.deploy(twice), layer))))
            .toBe("the program 'Toy' declares the key 'a' twice")
          expect(yield* toy.send(id, want('n-1'), { requestId: 'r-1', sender: tester })).toEqual({ _tag: 'Accepted' })
          yield* runtime.settled
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
