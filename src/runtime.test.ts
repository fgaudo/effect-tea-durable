/**
 * The runtime on SQLite against the machine: a scenario is driven on the real runtime, with a crash injected at
 * each point of the design's crash table, and what the database holds afterwards is compared with where the pure
 * machine ends on the same events (decision 0013). The runtime's own rules — a transaction per event, the work
 * started after the commit, an entity activated when the process starts — are what the comparison tests.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { describe, expect, test } from 'bun:test'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import fc from 'fast-check'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/sql'
import * as Machine from './machine.ts'
import {
  defect,
  type IdempotencyKey,
  isTimer,
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
  rejection: 'Refused'
  sender: Sender
  projection: number
  services: Hands
}

const done = (key: Key): Internal => ({ _tag: 'Done', key })

const acts = (key: Key, idempotencyKey: IdempotencyKey | null) =>
  Effect.flatMap(Effect.service(Hands), (hands) => Effect.as(hands.act(key, idempotencyKey), done(key)))

const program: Program<T> = {
  name: 'Toy',
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

/** What is compared: the stored state as a value, with the work and the suspension's cause normalised. */
const shape = (stored: Machine.Stored<T> | null) =>
  stored === null ? null : {
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
    replies: stored.replies,
    creation: stored.creation,
    // The cause is rendered when it is stored, so only where the defect happened is compared.
    suspension: stored.suspension === null ? null : stored.suspension.on,
  }

/** A database for one test: every process of the test shares it, as a crash leaves the file behind. */
const database = <A, E>(test: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.runPromise(
    Effect.scoped(Effect.flatMap(createTables, () => test)).pipe(
      Effect.provide(SqliteClient.layer({ filename: ':memory:' })),
      Effect.orDie,
    ),
  )

/** One process over the database: it ends when the body does, and everything running in it is interrupted. */
const process = <A, E, R>(
  options: Options,
  body: (runtime: Runtime) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R | SqlClient.SqlClient> => Effect.scoped(Effect.flatMap(launch(options), body))

/**
 * The events the runtime committed, replayed in the machine. The first of them is the entity's creation, since
 * nothing can happen to an entity that is not stored yet: a log without one is a creation that never committed,
 * and there is no entity to compare.
 */
const replayed = (at: DateTime.Utc, events: ReadonlyArray<Machine.Event<T>>) => {
  const [first, ...rest] = events
  if (first === undefined || first._tag !== 'Create') return null
  const created = Machine.start(program, id, { at }, at, { requestId: first.requestId, from: first.from })
  if (created._tag === 'Defect') throw created.cause
  let machine = created.machine
  for (const event of rest) machine = Machine.step(machine, event).machine
  return machine.stored
}

/** The entities a process unloaded, in order: a passivation commits no event, and is seen only here. */
const unloads = () => {
  const entities: Array<string> = []
  const unloaded: Options['unloaded'] = (entity) =>
    Effect.sync(() => {
      entities.push(entity.id)
    })
  /** Waits until `count` entities have been unloaded: a passivation is not an event a test can wait for. */
  const after = (count: number): Effect.Effect<void> =>
    Effect.suspend(() =>
      entities.length >= count ? Effect.void : Effect.flatMap(Effect.sleep('1 millis'), () => after(count))
    )
  return { entities, unloaded, after }
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
          yield* Effect.sleep('60 millis')
          yield* runtime.settled
          expect(yield* toy.read(id)).toBe(0)
        }))
      // Each operation acted once, the idempotent one with its key.
      expect(acted.filter((act) => act.startsWith('a:')).length).toBe(1)
      expect(acted.filter((act) => act === 'b').length).toBe(1)
      expect(acted.filter((act) => act === 'c').length).toBe(1)
      const stored = yield* storage(program, yield* SqlClient.SqlClient).load(id)
      expect(shape(stored)).toEqual(shape(replayed(stored?.state.since ?? at, events)))
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
          yield* toy.create(id, { at }, { requestId: 'creation', sender: { _tag: 'Tester' } })
          yield* Effect.sleep('30 millis')
        }))
      expect(first.acted.filter((act) => act === 'b').length).toBe(1)
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
      const { entities, unloaded, after } = unloads()
      const at = yield* DateTime.now
      yield* process({ observe, unloaded, passivate: { millis: 5 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: { _tag: 'Tester' } })
          yield* runtime.settled
          // Only the timer is left, and nothing holds the entity loaded: it is unloaded with the timer stored.
          yield* after(1)
          expect(entities).toEqual([id])
          // What callers read of an unloaded entity is read from storage.
          expect(yield* toy.read(id)).toBe(1)
          // The timer's time comes while the entity is unloaded: the stored time is what wakes it.
          yield* Effect.sleep('60 millis')
          yield* runtime.settled
          expect(yield* toy.read(id)).toBe(0)
          // Nothing is left to do, so the entity is unloaded again.
          yield* after(2)
          expect(entities).toEqual([id, id])
        }))
      const stored = yield* storage(program, yield* SqlClient.SqlClient).load(id)
      expect(shape(stored)).toEqual(shape(replayed(stored?.state.since ?? at, events)))
    })))

  test('a caller loads an unloaded entity again, and is answered', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const { entities, unloaded, after } = unloads()
      const at = yield* DateTime.now
      yield* process({ unloaded, passivate: { millis: 5 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: { _tag: 'Tester' } })
          yield* runtime.settled
          yield* after(1)
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
      yield* process({ observe }, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          yield* Effect.provide(runtime.deploy(program), layer)
          // The waker has had its turn and activated nothing: the timer's time has not come.
          yield* Effect.sleep('10 millis')
          expect(events.filter((event) => event._tag === 'Restart').length).toBe(0)
          // Its time comes, and the entity is activated for it.
          yield* Effect.sleep('60 millis')
          yield* runtime.settled
          expect(events.filter((event) => event._tag === 'Restart').length).toBe(1)
        }))
      expect((yield* store.load(id))?.state.want).toEqual([])
      expect(shape(yield* store.load(id))).toEqual(shape(replayed(since, events)))
    })))

  test('a suspended entity is unloaded, no timer of its fires, and an operator loads it again', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const { entities, unloaded, after } = unloads()
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
          yield* after(1)
          yield* Effect.sleep('80 millis')
          expect(entities).toEqual([id])
          const stored = yield* store.load(id)
          expect(stored?.suspension?.on).toEqual({ _tag: 'Message' })
          expect(stored?.mailbox.length).toBe(1)
          // An operator's act loads it again, and what it holds runs.
          yield* toy.discard(id)
          yield* runtime.settled
          expect((yield* store.load(id))?.suspension).toBe(null)
        }))
    })))

  test('no caller is lost to a passivation', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      // An entity unloaded as soon as it has nothing to do: every send still finds it, or loads it again.
      yield* process({ passivate: { millis: 1 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { at }, { requestId: 'creation', sender: { _tag: 'Tester' } })
          for (const nth of Array.from({ length: 24 }, (_, index) => index)) {
            // The timer is the key a step may drop: an operation leaves only by completing (decision 0005).
            expect(yield* toy.send(id, { _tag: 'Want', key: 't', on: nth % 2 === 0, nonce: `n${nth}` }, {
              requestId: `r${nth}`,
              sender: { _tag: 'Tester' },
            })).toEqual({ _tag: 'Accepted' })
          }
          yield* runtime.settled
        }))
      const stored = yield* storage(program, yield* SqlClient.SqlClient).load(id)
      // Every message was applied once, in the order it was sent.
      expect(stored?.state.applied).toEqual(Array.from({ length: 24 }, (_, index) => `n${index}`))
    })))
})

describe('the crash table', () => {
  const points: ReadonlyArray<Point> = ['BeforeCommit', 'AfterCommit', 'AfterReply']

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
              yield* Effect.sleep('10 millis')
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
                for (const [nonce, message] of sends.entries()) {
                  yield* Effect.forkChild(
                    toy.send(id, message, { requestId: `r${nonce}`, sender: { _tag: 'Tester' } }),
                  )
                }
                yield* Effect.sleep('80 millis')
              }),
          )
          yield* Effect.raceFirst(dying, Deferred.await(crashed))

          // The process that follows the crash activates what was stored, and finishes it.
          yield* process({ observe }, (runtime) =>
            Effect.gen(function*() {
              const { layer } = yield* hands()
              yield* Effect.provide(runtime.deploy(program), layer)
              yield* runtime.settled
              yield* Effect.sleep('60 millis')
              yield* runtime.settled
            }))

          // The crash happened where the test asked: a point never reached would make the comparison vacuous.
          expect(yield* Deferred.isDone(crashed)).toBe(true)
          expect(shape(yield* store.load(id))).toEqual(shape(replayed(since, events)))
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
                for (const [nth, command] of commands.entries()) {
                  switch (command._tag) {
                    case 'Send': {
                      const request = { requestId: `r${nth}`, message: message(command, `n${nth}`) }
                      sent.push(request)
                      // The callers are forked: a suspended entity answers none of them until it is resumed.
                      yield* Effect.forkChild(
                        toy.send(id, request.message, { requestId: request.requestId, sender: { _tag: 'Tester' } }),
                      )
                      break
                    }
                    case 'Retry': {
                      const request = sent[command.pick % Math.max(1, sent.length)]
                      if (request === undefined) break
                      yield* Effect.forkChild(
                        toy.send(id, request.message, { requestId: request.requestId, sender: { _tag: 'Tester' } }),
                      )
                      break
                    }
                    case 'Create':
                      yield* Effect.forkChild(toy.create(id, { at }, creation))
                      break
                    case 'Wait':
                      yield* Effect.sleep('8 millis')
                      break
                    case 'Resume':
                      yield* toy.resume(id)
                      break
                    case 'Discard':
                      yield* toy.discard(id)
                      break
                  }
                }
                yield* Effect.sleep('60 millis')
              }))
            yield* Effect.raceFirst(driven, Deferred.await(crashed))
            const since = (yield* store.load(id))?.state.since ?? at

            // The process that follows takes it from what is stored, and finishes what it finds under way.
            yield* process({ observe, ...passivate }, (runtime) =>
              Effect.gen(function*() {
                const { layer } = yield* hands()
                yield* Effect.provide(runtime.deploy(program), layer)
                yield* runtime.settled
                yield* Effect.sleep('60 millis')
                yield* runtime.settled
              }))

            expect(shape(yield* store.load(id))).toEqual(shape(replayed(since, events)))
          })),
      ),
      { numRuns: 25 },
    ), 60_000)
})
