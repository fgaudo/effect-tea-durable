/**
 * What only a server of PostgreSQL runs: many connections, each a session of its own, where PGlite runs one
 * statement at a time on one session (decision 0222). Each test makes a new database on the server `POSTGRES_URL`
 * names, and opens pools of connections to it, as the runtimes of several processes would. Without a server the
 * tests are skipped: `bun run test:postgres` runs them where one is given, and so does the CI on Linux.
 */
import { describe, expect, test } from 'bun:test'
import { ShardingConfig, SqlMessageStorage, SqlRunnerStorage } from 'effect/cluster'
import * as Cause from 'effect/Cause'
import * as Context from 'effect/Context'
import { Digest } from 'effect/crypto'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'
import type * as Scope from 'effect/Scope'
import { SqlClient, SqlError, Statement } from 'effect/sql'
import type * as Machine from './machine.ts'
import { InvariantDefect, noWork, operation, type Program, type Scalar } from './program.ts'
import { launch } from './runtime.ts'
import { createTables, storage, transaction } from './storage.ts'
import { database, pool, server } from './storage.test_databases.ts'

type T = {
  state: Readonly<{ last: string }>
  flags: null
  inbound: string
  internal: string
  operation: Readonly<{ _tag: 'Ask' }>
  key: 'ask'
  parameter: {}
  rejection: never
  sender: null
  projection: string
  index: 'rank'
  services: never
}

/**
 * A receiver whose index is its rank. The storage's tests give it by hand, and a step of the runtime ranks an entity by
 * its projection.
 */
const ranked: Program<T> = {
  name: 'Ranked',
  keys: { ask: null },
  schemas: {
    state: Schema.Struct({ last: Schema.String }),
    flags: Schema.Null,
    inbound: Schema.String,
    internal: Schema.String,
    operation: Schema.TaggedStruct('Ask', {}),
    rejection: Schema.Never,
    sender: Schema.Null,
    projection: Schema.String,
  },
  init: () => ({ last: 'start' }),
  update: (message) => () => ({ last: message }),
  work: () => noWork,
  operations: { Ask: operation(() => Effect.succeed('asked')) },
  project: ({ last }) => last,
  indexes: { rank: (projection) => projection },
}

/** What an event that writes nothing but `rows` gives the storage. */
const written = (rows: Partial<Machine.Written>): Machine.Written => ({
  created: false,
  entity: null,
  suspension: null,
  keys: [],
  gone: [],
  incarnations: 0,
  handled: 0,
  queued: [],
  replies: [],
  ended: [],
  shown: null,
  published: null,
  ...rows,
})

const creation = { _tag: 'Caller', sender: null, id: 'creation' } as const

/** The first rows of an entity of rank `rank`, as a creation writes them. */
const created = (rank: Scalar = 1): Machine.Written =>
  written({
    created: true,
    entity: { state: { last: 'start' }, creation },
    shown: { projection: JSON.stringify(rank), indexes: { rank } },
  })

/** A step that handled `message`, which it publishes in the topic `projection`. */
const handled = (message: string): Machine.Written =>
  written({
    entity: { state: { last: message }, creation },
    shown: { projection: '1', indexes: { rank: 1 } },
    published: { kind: 'Inbound', message, projection: '1', topics: ['projection'] },
  })

/** A limit no reading of these tests reaches. */
const all = 1_000

/**
 * Runs `body` on a new database of the server, given by its URL, with a client of the database's own: its pool. The
 * test is skipped without a server.
 */
const onServer = (
  name: string,
  body: (url: string, sql: SqlClient.SqlClient) => Effect.Effect<unknown, unknown, Scope.Scope>,
) =>
  test.skipIf(server === undefined)(name, () =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const url = yield* database(server ?? '')
      return yield* body(url, yield* connect(url))
    })).pipe(Effect.orDie)), 60_000)

/** A pool of its own to the database at `url`, as another process opens one, for the scope. */
const connect = (url: string, options: Parameters<typeof pool>[1] = {}) =>
  Effect.map(Layer.build(pool(url, options)), (context) => Context.get(context, SqlClient.SqlClient))

const on = (sql: SqlClient.SqlClient) => <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.provideService(effect, SqlClient.SqlClient, sql)

/** Waits until `count` sessions of the database wait for a lock another holds. */
const waitingOnLocks = (sql: SqlClient.SqlClient, count: number) =>
  Effect.gen(function*() {
    for (;;) {
      const [waiting] = yield* sql<{ count: number }>`
        SELECT count(*)::int AS count FROM pg_stat_activity
        WHERE datname = current_database() AND wait_event_type = 'Lock'
      `
      if ((waiting?.count ?? 0) >= count) return
      yield* Effect.sleep('10 millis')
    }
  })

/** The URL of `url` as the role `role`, whose password is its name. */
const as = (url: string, role: string) => {
  const located = new URL(url)
  located.username = role
  located.password = role
  return located.toString()
}

let roles = 0

/**
 * A role that logs in, whose `search_path` is a schema of its own, set by `ALTER ROLE`, as a launcher sets the role of
 * the runtime's for Cluster (decision 0215). Dropped with what it owns when the scope closes.
 */
const roleWithSchema = (sql: SqlClient.SqlClient) =>
  Effect.acquireRelease(
    Effect.gen(function*() {
      const role = `effecttea_role_${process.pid}_${roles++}`
      yield* sql.unsafe(`CREATE ROLE ${role} LOGIN PASSWORD '${role}'`)
      yield* sql.unsafe(`CREATE SCHEMA ${role} AUTHORIZATION ${role}`)
      yield* sql.unsafe(`ALTER ROLE ${role} SET search_path = ${role}`)
      return role
    }),
    (role) => Effect.ignore(Effect.andThen(sql.unsafe(`DROP OWNED BY ${role}`), sql.unsafe(`DROP ROLE ${role}`))),
  )

const reasonOf = (exit: Exit.Exit<unknown, unknown>) => {
  const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
  return cause instanceof InvariantDefect ? cause.reason : null
}

const sqlReasonOf = (exit: Exit.Exit<unknown, unknown>) => {
  const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
  return SqlError.isSqlError(cause) ? cause.reason._tag : null
}

const held = 'the database is held by another runtime, or open to another connection'

describe('the order of a partition (decision 0137)', () => {
  // On SQLite and PGlite two writers commit one after the other whatever the head does: only a server runs two at
  // once (decision 0162).
  onServer('two writers of one partition commit in the order of their seq, the second waiting for the first', (_, sql) =>
    Effect.gen(function*() {
      yield* on(sql)(createTables)
      const store = storage(ranked, sql, 1)
      for (const id of ['a', 'b']) yield* transaction(sql, store.write(id, created(), 0))
      const drawn = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const first = yield* Effect.forkChild(transaction(
        sql,
        Effect.andThen(store.write('a', handled('one'), 0), Effect.andThen(Deferred.succeed(drawn, undefined), Deferred.await(release))),
      ))
      yield* Deferred.await(drawn)
      const second = yield* Effect.forkChild(transaction(sql, store.write('b', handled('two'), 0)))
      yield* waitingOnLocks(sql, 1)
      // The second step cannot commit before the first: a consumer reads neither yet.
      expect(yield* store.published('projection', [], all)).toEqual([])
      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(first)
      yield* Fiber.join(second)
      const rows = yield* store.published('projection', [], all)
      expect(rows.map(({ id, seq }) => [id, seq])).toEqual([['a', 1], ['b', 2]])
    }))

  // At a level above `READ COMMITTED`, PostgreSQL fails the second update of a row two transactions changed at once:
  // a step that drew its `seq` behind another would crash its entity (decision 0222).
  onServer('two writers of one partition commit under a database whose default level is serializable', (url, sql) =>
    Effect.gen(function*() {
      yield* on(sql)(createTables)
      const [{ name } = { name: '' }] = yield* sql<{ name: string }>`SELECT current_database() AS name`
      yield* sql.unsafe(`ALTER DATABASE ${name} SET default_transaction_isolation TO 'serializable'`)
      // Each connection of a new pool takes the database's default.
      const serializable = yield* connect(url)
      const [level] = yield* serializable<{ level: string }>`SELECT current_setting('transaction_isolation') AS level`
      expect(level?.level).toBe('serializable')
      const store = storage(ranked, serializable, 1)
      for (const id of ['a', 'b', 'c', 'd']) yield* transaction(serializable, store.write(id, created(), 0))
      const race = (begin: <A, E>(effect: Effect.Effect<A, E>) => Effect.Effect<A, E | SqlError.SqlError>, ids: readonly [string, string]) =>
        Effect.gen(function*() {
          const drawn = yield* Deferred.make<void>()
          const release = yield* Deferred.make<void>()
          const first = yield* Effect.forkChild(begin(
            Effect.andThen(store.write(ids[0], handled('one'), 0), Effect.andThen(Deferred.succeed(drawn, undefined), Deferred.await(release))),
          ))
          yield* Deferred.await(drawn)
          const second = yield* Effect.forkChild(Effect.exit(begin(store.write(ids[1], handled('two'), 0))))
          yield* waitingOnLocks(serializable, 1)
          yield* Deferred.succeed(release, undefined)
          yield* Fiber.join(first)
          return yield* Fiber.join(second)
        })
      // A transaction begun at the role's default fails as the head's row moves under it.
      const failed = yield* race((effect) => serializable.withTransaction(effect), ['a', 'b'])
      expect(sqlReasonOf(failed)).toBe('SerializationError')
      // The runtime's begins at `READ COMMITTED`, where the second waits and draws the next `seq`.
      const committed = yield* race((effect) => transaction(serializable, effect), ['c', 'd'])
      expect(Exit.isSuccess(committed)).toBe(true)
      const rows = yield* store.published('projection', [], all)
      expect(rows.map(({ id, seq }) => [id, seq])).toEqual([['a', 1], ['c', 2], ['d', 3]])
    }))
})

describe('a step that meets a deadlock (decision 0222)', () => {
  // The step takes its entity's row, then waits for its projection's, which a third transaction holds. Another
  // transaction holds the head of the partition and waits for the entity's row. The step then closes the cycle as it
  // draws its `seq`, and PostgreSQL ends the transaction that closes it once its own `deadlock_timeout` has passed.
  onServer('a step whose transaction is ended by a deadlock dies with DeadlockError, and writes nothing', (url, sql) =>
    Effect.gen(function*() {
      yield* on(sql)(createTables)
      const store = storage(ranked, sql, 1)
      yield* transaction(sql, store.write('a', created(), 0))
      yield* transaction(sql, store.write('b', created(), 0))
      yield* transaction(sql, store.write('a', handled('zero'), 0))
      const other = yield* connect(url)
      const gate = yield* Deferred.make<void>()
      const gated = yield* Deferred.make<void>()
      const holding = yield* Effect.forkChild(other.withTransaction(Effect.gen(function*() {
        yield* other`SELECT 1 FROM effecttea_projections WHERE name = 'Ranked' AND id = 'b' FOR UPDATE`
        yield* Deferred.succeed(gated, undefined)
        yield* Deferred.await(gate)
      })))
      yield* Deferred.await(gated)
      const step = yield* Effect.forkChild(Effect.exit(transaction(
        sql,
        Effect.andThen(sql`SET LOCAL deadlock_timeout = '100ms'`, store.write('b', handled('one'), 0)),
      )))
      yield* waitingOnLocks(sql, 1)
      const headHeld = yield* Deferred.make<void>()
      const blocker = yield* Effect.forkChild(other.withTransaction(Effect.gen(function*() {
        yield* other`SET LOCAL deadlock_timeout = '10s'`
        yield* other`SELECT 1 FROM effecttea_heads WHERE name = 'Ranked' FOR UPDATE`
        yield* Deferred.succeed(headHeld, undefined)
        yield* other`SELECT 1 FROM effecttea_entities WHERE name = 'Ranked' AND id = 'b' FOR UPDATE`
      })))
      yield* Deferred.await(headHeld)
      yield* waitingOnLocks(sql, 2)
      yield* Deferred.succeed(gate, undefined)
      yield* Fiber.join(holding)
      const exit = yield* Fiber.join(step)
      expect(Exit.isFailure(exit) && Cause.hasDies(exit.cause)).toBe(true)
      expect(sqlReasonOf(exit)).toBe('DeadlockError')
      yield* Fiber.join(blocker)
      expect((yield* store.load('b'))?.state).toEqual({ last: 'start' })
      const rows = yield* store.published('projection', [], all)
      expect(rows.map(({ id, seq }) => [id, seq])).toEqual([['a', 1]])
    }))
})

describe('a page of the read model (decisions 0157, 0158)', () => {
  /**
   * Reads the page of the ranks past `a`, in `begin`, while another connection moves `b` from rank 1 to rank 2 and
   * commits between the page's first statement and its second.
   */
  const pageWhileMoved = (
    url: string,
    sql: SqlClient.SqlClient,
    begin: <A, E>(effect: Effect.Effect<A, E>) => Effect.Effect<A, E | SqlError.SqlError>,
  ) =>
    Effect.gen(function*() {
      const store = storage(ranked, sql)
      yield* store.indexed
      yield* transaction(sql, store.write('a', created(1), 0))
      yield* transaction(sql, store.write('b', created(1), 0))
      const other = yield* connect(url)
      let selects = 0
      const moving: Statement.Transformer = (statement) =>
        Effect.gen(function*() {
          const [text] = statement.compile()
          if (text.trimStart().startsWith('SELECT') && ++selects === 2) {
            yield* other`UPDATE effecttea_projections SET indexes = '{"rank":2}' WHERE name = 'Ranked' AND id = 'b'`.pipe(
              Effect.provideService(Statement.CurrentTransformer, undefined),
              Effect.orDie,
            )
          }
          return statement
        })
      const page = yield* begin(store.query({ limit: all, order: { index: 'rank' }, after: { id: 'a', indexes: { rank: 1 } } }))
        .pipe(Effect.provideService(Statement.CurrentTransformer, moving))
      expect(selects).toBeGreaterThan(1)
      return page.map(({ id }) => id)
    })

  onServer('a page read in its own transaction gives a row once though a step moves it between its parts', (url, sql) =>
    Effect.gen(function*() {
      yield* on(sql)(createTables)
      expect(yield* pageWhileMoved(url, sql, (effect) => effect)).toEqual(['b'])
    }))

  // Inside a transaction the caller left open, the page reads at the caller's level (decision 0158).
  onServer('a page read in a caller’s transaction gives a row twice at READ COMMITTED, and once at REPEATABLE READ', (url, sql) =>
    Effect.gen(function*() {
      yield* on(sql)(createTables)
      expect(yield* pageWhileMoved(url, sql, (effect) => transaction(sql, effect))).toEqual(['b', 'b'])
    }))

  onServer('a page read in a caller’s transaction at REPEATABLE READ gives a row once', (url, sql) =>
    Effect.gen(function*() {
      yield* on(sql)(createTables)
      const repeatable = <A, E>(effect: Effect.Effect<A, E>) =>
        sql.withTransaction(effect).pipe(
          Effect.provideService(SqlClient.BeginTransaction, 'BEGIN ISOLATION LEVEL REPEATABLE READ'),
        )
      expect(yield* pageWhileMoved(url, sql, repeatable)).toEqual(['b'])
    }))
})

describe('a database held by one runtime (decisions 0080, 0157)', () => {
  onServer('a runtime holds the database with a session advisory lock, which it gives back as its scope closes', (url, sql) =>
    Effect.gen(function*() {
      yield* on(sql)(createTables)
      const other = yield* connect(url)
      yield* Effect.scoped(Effect.gen(function*() {
        yield* on(sql)(launch({}))
        // Another process's pool finds the lock taken, though no statement of the first runs now.
        expect(reasonOf(yield* Effect.exit(Effect.scoped(on(other)(launch({})))))).toBe(held)
      }))
      // The first runtime gave the lock back before its connection went back to its pool, which stays open.
      expect(Exit.isSuccess(yield* Effect.exit(Effect.scoped(on(other)(launch({})))))).toBe(true)
      expect(yield* sql`
        SELECT objid FROM pg_locks
        WHERE locktype = 'advisory' AND database = (SELECT oid FROM pg_database WHERE datname = current_database())
      `).toEqual([])
    }))

  onServer('two runtimes in two schemas of one database refuse each other', (url, sql) =>
    Effect.gen(function*() {
      const first = yield* roleWithSchema(sql)
      const second = yield* roleWithSchema(sql)
      const firstPool = yield* connect(as(url, first))
      const secondPool = yield* connect(as(url, second))
      yield* on(firstPool)(createTables)
      yield* on(secondPool)(createTables)
      yield* Effect.scoped(Effect.gen(function*() {
        yield* on(firstPool)(launch({}))
        expect(reasonOf(yield* Effect.exit(Effect.scoped(on(secondPool)(launch({})))))).toBe(held)
      }))
    }))
})

describe('a role whose search_path is set by ALTER ROLE (decision 0215)', () => {
  onServer('every connection of the pool finds the tables of the runtime and of Cluster in the role’s schema', (url, sql) =>
    Effect.gen(function*() {
      const role = yield* roleWithSchema(sql)
      const connections = 4
      const roleUrl = as(url, role)
      const owned = yield* connect(roleUrl, { maxConnections: connections })
      yield* on(owned)(createTables)
      // Cluster's storages migrate their tables as they are built, and are closed before the connections are read.
      yield* Effect.scoped(Layer.build(
        Layer.mergeAll(SqlMessageStorage.layer, Layer.orDie(SqlRunnerStorage.layer)).pipe(
          Layer.provide(ShardingConfig.layer({})),
          Layer.provide(Digest.layerWebCrypto),
          Layer.provide(Layer.succeed(SqlClient.SqlClient, owned)),
        ),
      ))
      const schemas = yield* sql<{ schema: string; tables: number }>`
        SELECT nspname AS schema, count(*)::int AS tables FROM pg_class JOIN pg_namespace ON pg_namespace.oid = relnamespace
        WHERE relkind = 'r' AND (starts_with(relname, 'effecttea_') OR starts_with(relname, 'cluster_'))
        GROUP BY nspname
      `
      expect(schemas.map(({ schema }) => schema)).toEqual([role])
      // Each of the pool's connections is held at once, so that each is read apart.
      const all = yield* Deferred.make<void>()
      let entered = 0
      const seen = yield* Effect.forEach(
        Array.from({ length: connections }, (_, index) => index),
        () =>
          owned.withTransaction(Effect.gen(function*() {
            const [row] = yield* owned<{ pid: number; schema: string; runtime: string | null; cluster: string | null }>`
              SELECT pg_backend_pid() AS pid, current_schema() AS schema,
                to_regclass('effecttea_entities')::text AS runtime, to_regclass('cluster_messages')::text AS cluster
            `
            if (++entered === connections) yield* Deferred.succeed(all, undefined)
            yield* Deferred.await(all)
            return row
          })),
        { concurrency: 'unbounded' },
      )
      expect(new Set(seen.map((row) => row?.pid)).size).toBe(connections)
      expect(seen.map((row) => [row?.schema, row?.runtime, row?.cluster])).toEqual(
        Array.from({ length: connections }, () => [role, 'effecttea_entities', 'cluster_messages']),
      )
      // A runtime launched on the role writes through every connection of the pool.
      yield* Effect.scoped(Effect.gen(function*() {
        const runtime = yield* on(owned)(launch({}))
        const handle = yield* runtime.deploy(ranked)
        yield* Effect.forEach(
          ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'],
          (id) => handle.create(id, { requestId: `create-${id}`, sender: null }),
          { concurrency: 'unbounded' },
        )
        expect(yield* handle.count({})).toBe(8)
      }))
    }))
})

describe('a call that waits for a step, within a transaction of a pool (decision 0256)', () => {
  // The runtime reserves one connection for its advisory lock, and each transaction below holds another, so no
  // connection of the pool is left for a step. A create that waited for its step there would wait for ever, which is
  // bug 81 of the roadmap: so each is refused, and once the transactions end a create is answered.
  onServer('creates within transactions that hold every connection of the pool are refused, and the runtime goes on', (url) =>
    Effect.gen(function*() {
      const transactions = 2
      const owned = yield* connect(url, { maxConnections: transactions + 1 })
      const runtime = yield* on(owned)(launch({}))
      const handle = yield* runtime.deploy(ranked)
      const all = yield* Deferred.make<void>()
      let entered = 0
      const exits = yield* Effect.forEach(
        Array.from({ length: transactions }, (_, index) => index),
        (index) =>
          Effect.exit(owned.withTransaction(Effect.gen(function*() {
            yield* owned`SELECT 1`
            if (++entered === transactions) yield* Deferred.succeed(all, undefined)
            yield* Deferred.await(all)
            return yield* handle.create(`held-${index}`, { requestId: `held-${index}`, sender: null })
          }))),
        { concurrency: 'unbounded' },
      )
      expect(exits.map(reasonOf)).toEqual(
        Array.from({ length: transactions }, () => 'create runs within a transaction of the client of the runtime'),
      )
      expect(yield* handle.create('free', { requestId: 'free', sender: null })).toEqual({ _tag: 'Created' })
      expect(yield* handle.count({})).toBe(1)
    }))

  // A transaction of another pool on the same database holds a connection the runtime's steps do not use, so a call
  // within it is answered.
  onServer('a create within a transaction of another pool on the same database is answered', (url) =>
    Effect.gen(function*() {
      const owned = yield* connect(url)
      const other = yield* connect(url)
      const runtime = yield* on(owned)(launch({}))
      const handle = yield* runtime.deploy(ranked)
      expect(yield* other.withTransaction(Effect.andThen(
        other`SELECT 1`,
        handle.create('other', { requestId: 'other', sender: null }),
      ))).toEqual({ _tag: 'Created' })
    }))
})

describe('the migrations of createTables (decision 0216)', () => {
  onServer('a second run waits on the lock of effecttea_migrations until the first commits, and runs none', (url, sql) =>
    Effect.gen(function*() {
      const other = yield* connect(url)
      const migrated = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      // The first run is held open inside a transaction of the test's, so that it holds the table's lock.
      const first = yield* Effect.forkChild(sql.withTransaction(Effect.gen(function*() {
        yield* on(sql)(createTables)
        yield* Deferred.succeed(migrated, undefined)
        yield* Deferred.await(release)
      })))
      yield* Deferred.await(migrated)
      const second = yield* Effect.forkChild(Effect.exit(on(other)(createTables)))
      yield* waitingOnLocks(sql, 1)
      yield* Deferred.succeed(release, undefined)
      yield* Fiber.join(first)
      // A second run of the first migration would die on a table it made already (decision 0218).
      expect(Exit.isSuccess(yield* Fiber.join(second))).toBe(true)
      expect(yield* sql`SELECT migration_id FROM effecttea_migrations`).toEqual([{ migration_id: 1 }])
    }))

  onServer('two runs begun at once on a new database make its tables once, and both succeed', (url, sql) =>
    Effect.gen(function*() {
      const other = yield* connect(url)
      const runs = yield* Effect.all([Effect.exit(on(sql)(createTables)), Effect.exit(on(other)(createTables))], {
        concurrency: 'unbounded',
      })
      expect(runs.every(Exit.isSuccess)).toBe(true)
      expect(yield* sql`SELECT migration_id FROM effecttea_migrations`).toEqual([{ migration_id: 1 }])
    }))
})
