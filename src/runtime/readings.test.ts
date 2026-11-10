/**
 * The tests of the readings of the log that wait ([`readings.ts`](readings.ts)) on Cluster, where the watcher tells
 * them of another runner's commit (decision 0163).
 */
import { describe, expect, test } from 'bun:test'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Scope from 'effect/Scope'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/sql'
import { TestClock } from 'effect/testing'
import { noWork, operation, type Program, versionOf } from '../program.ts'
import { type Delivered, type Handle, launchWith, type OnCluster } from '../runtime.ts'
import { all, clusterTables, database, explored, opened, queue, running, together } from '../runtime.test_shared.ts'

describe('a consumer on Cluster, woken by another runner’s commit (decision 0163)', () => {
  type Count = {
    state: Readonly<{ n: number }>
    flags: Readonly<{}>
    inbound: Readonly<{ _tag: 'Add' }>
    internal: Readonly<{ _tag: 'Added' }>
    operation: Readonly<{ _tag: 'Ask' }>
    key: 'ask'
    parameter: {}
    rejection: never
    sender: Readonly<{ user: string }>
    projection: number
    index: never
    services: never
  }
  const count: Program<Count> = {
    name: 'Count',
    keys: { ask: null },
    schemas: {
      state: Schema.Struct({ n: Schema.Int }),
      flags: Schema.Struct({}),
      inbound: Schema.TaggedStruct('Add', {}),
      internal: Schema.TaggedStruct('Added', {}),
      operation: Schema.TaggedStruct('Ask', {}),
      rejection: Schema.Never,
      sender: Schema.Struct({ user: Schema.String }),
      projection: Schema.Int,
    },
    init: () => ({ n: 0 }),
    update: () => ({ n }) => ({ n: n + 1 }),
    work: () => noWork,
    operations: { Ask: operation(() => Effect.succeed({ _tag: 'Added' } as const)) },
    project: ({ n }) => n,
    indexes: {},
  }
  const caller = (id: string) => JSON.stringify({ _tag: 'Caller', sender: { user: 'u' }, id })

  /**
   * Two runners the test plays on one database: `reader`, whose consumer reads, and `writer`, whose doors step. The
   * writer's commits are told to the writer alone, and `commit` steps a message there, then moves the version the
   * reader reads of other runners, read every `millis`. Where `blocks`, a reading of the version waits until the
   * version has moved since the last reading, so that a watcher that reads every 0 ms runs only when there is
   * something to read: a test whose clock never moves needs it.
   */
  const twoRunners = <A>(
    body: (
      reader: Handle<Count, (typeof queue)['consumers']>,
      commit: (request: string) => Effect.Effect<void>,
      reads: () => number,
    ) => Effect.Effect<A, unknown, Scope.Scope>,
    millis: number,
    blocks: boolean,
  ) =>
    Effect.gen(function*() {
      let moved = 0
      let read = 0
      let given: number | null = null
      let bumped = Deferred.makeUnsafe<void>()
      const version = blocks
        ? Effect.gen(function*() {
          while (given === moved) yield* Deferred.await(bumped)
          given = moved
          return moved
        })
        : Effect.sync(() => (read++, moved))
      const played = (others: OnCluster['others']) => {
        let step: ((delivered: Delivered) => Effect.Effect<unknown>) | null = null
        const cluster: OnCluster = {
          shards: 1,
          versions: null,
          shardOf: () => 1,
          guard: () => Effect.void,
          holds: () => true,
          singleton: (_name, run) => Effect.asVoid(Effect.forkScoped(Effect.scoped(Effect.andThen(run, Effect.never)))),
          register: (_program, given) =>
            Effect.sync(() => {
              step = given as (delivered: Delivered) => Effect.Effect<unknown>
            }),
          others,
          // These tests step the door directly, and send nothing through Cluster's client.
          create: () => Effect.die('no creation is sent through the client here'),
          send: () => Effect.die('no message is sent through the client here'),
          operate: () => Effect.die('no operator’s event is sent through the client here'),
          resume: () => Effect.die('no sender is told of a resumption here'),
        }
        return { cluster, step: () => step! }
      }
      yield* clusterTables
      const sql = yield* SqlClient.SqlClient
      const reading = played({ version, millis })
      const writing = played({ version: Effect.succeed(0), millis })
      const reader = yield* Effect.flatMap(launchWith({}, reading.cluster), (runtime) => runtime.deploy(count, queue))
      yield* Effect.flatMap(launchWith({}, writing.cluster), (runtime) => runtime.deploy(count, queue))
      const door = (delivered: Omit<Delivered, 'id' | 'version'>) =>
        Effect.orDie(Effect.asVoid(sql.withTransaction(writing.step()({ ...delivered, id: 'one', version: versionOf(count) }))))
      yield* door({ _tag: 'Create', request: caller('c1'), message: '{}' })
      yield* reader.ack('projection', 'queue', yield* reader.fetch('projection', 'queue', all))
      const commit = (request: string) =>
        Effect.andThen(
          door({ _tag: 'Message', request: caller(request), message: JSON.stringify({ _tag: 'Add' }) }),
          Effect.sync(() => {
            moved++
            const was = bumped
            bumped = Deferred.makeUnsafe<void>()
            Deferred.doneUnsafe(was, Effect.void)
          }),
        )
      return yield* body(reader, commit, () => read)
    }).pipe(Effect.orDie)

  test('a reading that waits is given the row another runner commits, within the interval', () =>
    database(Effect.scoped(twoRunners((reader, commit) =>
      Effect.gen(function*() {
        const waiting = yield* running(reader.fetch('projection', 'queue', all, { wait: { millis: 60_000 } }))
        yield* commit('m1')
        expect(waiting.pollUnsafe()).toBeUndefined()
        // The watcher reads the version at the next interval, and the reading is woken there, not at its minute.
        yield* TestClock.adjust('200 millis')
        const rows = yield* Fiber.join(waiting)
        expect(rows.map(({ value }) => value)).toEqual([1])
      }), 200, false))), 10_000)

  test('a reader of consume that waits is given each row another runner commits, within the interval', () =>
    database(Effect.scoped(twoRunners((reader, commit) =>
      Effect.gen(function*() {
        const handled: Array<number> = []
        const consuming = yield* running(
          reader.consume('projection', 'queue', (page) => Effect.sync(() => handled.push(...page.map(({ value }) => value))), {
            limit: all,
            wait: true,
          }),
        )
        // The reader waits with no time limit, and the watcher wakes it at the next interval, page after page
        // (decision 0184).
        for (const [request, seen] of [['m1', [1]], ['m2', [1, 2]]] as const) {
          yield* commit(request)
          yield* TestClock.adjust('200 millis')
          expect(handled).toEqual([...seen])
        }
        expect(consuming.pollUnsafe()).toBeUndefined()
        expect(yield* reader.fetch('projection', 'queue', all)).toEqual([])
        yield* Fiber.interrupt(consuming)
      }), 200, false))), 10_000)

  test('a reading interrupted as it begins its wait leaves the watcher still, under every schedule of one deviation', () => {
    // The count of the readings that wait is raised before the wait and lowered by its finalizer. A fiber may yield
    // between the two, and an interruption there would leave the count raised: the watcher would read the version
    // at every interval for ever, though no reading waits.
    explored((window) =>
      Effect.scoped(twoRunners((reader, _commit, reads) =>
        Effect.gen(function*() {
          yield* opened(window, true)
          const reading = yield* Effect.forkChild(reader.fetch('projection', 'queue', all, { wait: { millis: 60_000 } }))
          yield* Fiber.join(yield* Effect.forkChild(Fiber.interrupt(reading)))
          yield* opened(window, false)
          yield* TestClock.adjust('200 millis')
          const before = reads()
          yield* TestClock.adjust('1 second')
          return reads() - before
        }), 200, false)), 0, { open: false, bound: 1 })
  }, 60_000)

  test('a reading is woken by a commit of another runner between its page and its wait, under prioritized schedules', () => {
    // The watcher keeps the version it last read while no reading waits. A watcher that read a new version as a wait
    // began would count a commit made after the page as seen, and the reading would never be woken: the clock never
    // moves here. A first reading waits and is woken before, so that the second wait is not the first.
    explored(() =>
      Effect.scoped(twoRunners((reader, commit) =>
        Effect.gen(function*() {
          const [first] = yield* together<unknown, never, never>([
            reader.fetch('projection', 'queue', all, { wait: { millis: 60_000 } }),
            commit('m1'),
          ])
          yield* reader.ack('projection', 'queue', first as never)
          const [read] = yield* together<unknown, never, never>([
            reader.fetch('projection', 'queue', all, { wait: { millis: 60_000 } }),
            commit('m2'),
          ])
          return (read as ReadonlyArray<Readonly<{ value: number }>>).map(({ value }) => value)
        }), 0, true)), [2])
  }, 60_000)
})
