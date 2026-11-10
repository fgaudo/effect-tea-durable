/**
 * What a runtime on PostgreSQL does when the server ends the session that holds its advisory lock, for the open
 * question on a runtime that loses its session. A runtime holds the database with a session advisory lock, on a
 * connection it reserves for its scope (decision 0157). The server ends that session here by `pg_terminate_backend`,
 * as `idle_session_timeout`, a restart or a broken connection would, while the runtime still runs. The spike looks at
 * whether the first runtime is told, whether it still answers, and whether a second runtime then launches on the
 * same database, so that two would load the same entity (decision 0080). It runs on the server `POSTGRES_URL` names,
 * as the CI's job on PostgreSQL gives one, and is skipped without it.
 */
import { expect, test } from 'bun:test'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/sql'
import { createTables, launch, noWork, program } from '../src/index.ts'
import { database, pool, server } from '../src/test-databases.ts'

const notes = program({
  state: Schema.Struct({ count: Schema.Int }),
  flags: Schema.Struct({}),
  inbound: Schema.TaggedUnion({ Add: {} }),
  internal: Schema.Never,
  operation: Schema.Never,
  rejection: Schema.Never,
  sender: Schema.Null,
  projection: Schema.Struct({ count: Schema.Int }),
})({
  name: 'Notes',
  keys: [],
  init: () => ({ count: 0 }),
  update: () => (state) => ({ count: state.count + 1 }),
  work: () => noWork,
  operations: {},
  project: (state) => ({ count: state.count }),
  indexes: {},
})

const shown = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isSuccess(exit) ? `success ${JSON.stringify(exit.value) ?? ''}` : String(exit.cause).split('\n')[0]

/** A pool of its own to the database at `url`, as another process opens one, for the scope. */
const connect = (url: string) =>
  Effect.map(Layer.build(pool(url)), (context) => Context.get(context, SqlClient.SqlClient))

const on = (sql: SqlClient.SqlClient) => <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.provideService(effect, SqlClient.SqlClient, sql)

/** The sessions of the database that hold an advisory lock. */
const holders = (sql: SqlClient.SqlClient) =>
  Effect.map(
    sql<{ pid: number }>`
      SELECT pid FROM pg_locks
      WHERE locktype = 'advisory' AND granted
        AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
    `,
    (rows) => rows.map(({ pid }) => pid),
  )

const name = 'a server that ends the session of the lock lets a second runtime launch while the first runs'

test.skipIf(server === undefined)(name, () =>
  Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const url = yield* database(server ?? '')
    const watcher = yield* connect(url)
    const first = yield* connect(url)
    const second = yield* connect(url)
    yield* on(first)(createTables)
    const runtime = yield* on(first)(launch({}))
    const handle = yield* runtime.deploy(notes)
    yield* handle.create('n', {}, { requestId: 'create', sender: null })
    const before = yield* holders(watcher)
    console.log('sessions holding the lock before:', before.length)
    for (const pid of before) yield* watcher`SELECT pg_terminate_backend(${pid})`
    // The server ends the session after it answers: the lock is given back once the backend has gone.
    for (let tries = 0; (yield* holders(watcher)).length > 0; tries++) {
      if (tries > 500) return yield* Effect.die('the lock was never given back')
      yield* Effect.sleep('10 millis')
    }
    const sentByFirst = yield* Effect.exit(handle.send('n', { _tag: 'Add' }, { requestId: 'first', sender: null }))
    console.log('a send of the first runtime once its session ended:', shown(sentByFirst))
    const launched = yield* Effect.exit(on(second)(launch({})))
    console.log('a second launch while the first runs:', shown(Exit.map(launched, () => 'launched')))
    const other = Exit.isSuccess(launched) ? yield* launched.value.deploy(notes) : null
    const sentBySecond = other === null
      ? null
      : yield* Effect.exit(other.send('n', { _tag: 'Add' }, { requestId: 'second', sender: null }))
    console.log('a send of the second runtime to the same entity:', sentBySecond && shown(sentBySecond))
    const sentAgainByFirst = yield* Effect.exit(handle.send('n', { _tag: 'Add' }, { requestId: 'again', sender: null }))
    console.log('a send of the first runtime after the second:', shown(sentAgainByFirst))
    const after = yield* holders(watcher)
    console.log('sessions holding the lock after:', after.length)
    // Three sends were accepted after the creation: a stored count below three is a step one runtime overwrote.
    const stored = yield* handle.read('n')
    console.log('the stored projection after three accepted sends:', JSON.stringify(stored))
    expect(before.length).toBe(1)
    // Nothing tells the first runtime: it still answers, though it no longer holds the database.
    expect(sentByFirst).toEqual(Exit.succeed({ _tag: 'Accepted' }))
    // The second runtime takes the lock the first lost, and both load the same entity.
    expect(Exit.isSuccess(launched)).toBe(true)
    expect(sentBySecond).toEqual(Exit.succeed({ _tag: 'Accepted' }))
    expect(sentAgainByFirst).toEqual(Exit.succeed({ _tag: 'Accepted' }))
    expect(after.length).toBe(1)
  })).pipe(Effect.orDie)), 60_000)
