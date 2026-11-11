/**
 * The tables of the storage, and what holds of a database whatever program runs on it: the dialects the storage
 * speaks, the transaction of the runtime, the hold of a database by one runtime, the partitions of the log, the
 * migrations that make every table, and the rename of a program, which moves its rows in every table
 * (decisions 0157, 0216, 0241).
 */
import { resolve } from 'node:path'
import * as Effect from 'effect/Effect'
import * as Hash from 'effect/Hash'
import * as Schema from 'effect/Schema'
import type * as Scope from 'effect/Scope'
import { Migrator, SqlClient, type SqlError, type Statement } from 'effect/sql'
import { InvariantDefect, type Json } from '../program.ts'
import { Count, Standing } from './rows.ts'

/** The dialects the storage speaks (decision 0157). */
export type Dialect = 'sqlite' | 'pg'

/** The client's dialect. One the storage does not speak is the launcher's defect, and is named (decision 0157). */
export const dialectOf = (sql: SqlClient.SqlClient): Dialect => {
  const dialect = sql.onDialect({
    sqlite: () => 'sqlite',
    pg: () => 'pg',
    mysql: () => 'mysql',
    mssql: () => 'mssql',
    clickhouse: () => 'clickhouse',
  })
  if (dialect === 'sqlite' || dialect === 'pg') return dialect
  throw new InvariantDefect({ reason: `the storage speaks SQLite and PostgreSQL, and the client speaks ${dialect}` })
}

/**
 * Runs `effect` in a transaction of the runtime's, begun by `onSqlite` on SQLite where it is given. On PostgreSQL the
 * transaction begins at `READ COMMITTED` whatever level the role or the database sets by default: at a higher level
 * two steps of one partition that draw their `seq` at once fail with `SerializationError`, where at this level the
 * second waits for the head's row and draws the next (decision 0222). A reading of one snapshot begins its own
 * transaction at `REPEATABLE READ` instead.
 */
export const transaction = <A, E, R>(
  sql: SqlClient.SqlClient,
  effect: Effect.Effect<A, E, R>,
  onSqlite?: string,
): Effect.Effect<A, E | SqlError.SqlError, R> => {
  const begin = dialectOf(sql) === 'pg' ? 'BEGIN ISOLATION LEVEL READ COMMITTED' : onSqlite
  const run = sql.withTransaction(effect)
  return begin === undefined ? run : Effect.provideService(run, SqlClient.BeginTransaction, begin)
}

/** The clients a runtime of this process holds: another runtime on one of them is refused (decision 0080). */
const held = new WeakSet<SqlClient.SqlClient>()

/**
 * The data directories of PGlite a runtime of this process has launched on, each with the client it launched on. Two
 * clients of PGlite over one directory are two copies of one database, and the last to close writes its copy over the
 * other's. So a launch on another client over a directory is refused while the client before it is open, as SQLite
 * refuses a file another connection has open (decision 0255).
 */
const directories = new Map<string, { readonly closed: boolean }>()

/**
 * The data directory of a client of PGlite and the PGlite instance, or `undefined` where the client names no
 * directory, as a database in memory does. The directory is one name for every spelling of its path. PGlite's
 * `dataDir` is declared by its types and has no doc comment, so a client without it is held by the client alone, as
 * before (decision 0255).
 */
const directoryOf = (
  sql: SqlClient.SqlClient,
): { readonly directory: string; readonly pglite: { readonly closed: boolean } } | undefined => {
  const pglite = (sql as { readonly pglite?: { readonly dataDir?: unknown; readonly closed: boolean } }).pglite
  const dataDir = pglite?.dataDir
  if (pglite === undefined || typeof dataDir !== 'string' || dataDir === '' || dataDir.startsWith('memory://')) {
    return undefined
  }
  return { directory: dataDir.includes('://') ? dataDir : resolve(dataDir), pglite }
}

/**
 * The key of the advisory lock a runtime holds a database of PostgreSQL by. It is fixed, so that every release of
 * the library takes the same lock (decision 0157).
 */
const advisoryKey = 7_465_616

/**
 * Holds the database for one runtime until the scope ends (decisions 0080, 0157). The client is held in this
 * process, claimed in one synchronous step. A file of SQLite is held by SQLite's exclusive locking mode: a write
 * takes it only while no other connection has the file open, it keeps every other from opening it, and the end of
 * the process gives it back, however it ends. A database of PostgreSQL is held by a session advisory lock, on a
 * connection reserved until the scope ends, and the end of the session gives it back. PGlite runs every statement on
 * one session, which would take the lock again. So in this process alone, the client holds it, and the client's data
 * directory is held while the client is open. A database another runtime holds, or another connection has open, is
 * the launcher's defect. So is a data directory of PGlite another process has open (decision 0255).
 */
export const hold: Effect.Effect<void, never, SqlClient.SqlClient | Scope.Scope> = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const dialect = dialectOf(sql)
  const refused = () => new InvariantDefect({
    reason: 'the database is held by another runtime, or open to another connection',
  })
  yield* Effect.acquireRelease(
    Effect.sync(() => {
      if (held.has(sql)) throw refused()
      held.add(sql)
    }),
    () => Effect.sync(() => held.delete(sql)),
  )
  if (dialect === 'pg') {
    if (sql.driver === 'pglite') {
      const found = directoryOf(sql)
      if (found === undefined) return
      // The entry stays once the runtime ends, since the client it names may still be open, and a client closed
      // gives the directory to the next.
      const before = directories.get(found.directory)
      if (before !== undefined && before !== found.pglite && !before.closed) return yield* Effect.die(refused())
      directories.set(found.directory, found.pglite)
      return
    }
    const connection = yield* Effect.orDie(sql.reserve)
    // The connection goes back to the pool when the scope ends, so it gives back the lock first.
    yield* Effect.addFinalizer(() => Effect.ignore(connection.executeRaw('SELECT pg_advisory_unlock_all()', [])))
    const taken = yield* Effect.orDie(connection.executeValues(`SELECT pg_try_advisory_lock(${advisoryKey})`, []))
    if (taken[0]?.[0] !== true) return yield* Effect.die(refused())
    return
  }
  // The mode is the connection's, and is taken or given back by the next access of the file.
  const take = Effect.andThen(sql`PRAGMA locking_mode = EXCLUSIVE`, sql.withTransaction(Effect.void))
  const give = Effect.ignore(Effect.andThen(sql`PRAGMA locking_mode = NORMAL`, sql.withTransaction(Effect.void)))
  yield* Effect.acquireRelease(
    take.pipe(
      Effect.mapError((error) => error.reason._tag === 'LockTimeoutError' ? refused() : error),
      Effect.onError(() => give),
      Effect.orDie,
    ),
    () => give,
  )
})

/**
 * How many partitions the log has where `launch` is given none: as many as Cluster's shards per group
 * (decision 0137).
 */
export const defaultPartitions = 300

/**
 * The partition of the log the entity `id` belongs to, among `partitions`: Cluster's formula for a shard, on
 * `Hash.string`. It is computed once, when the entity is created, and stored, so that a hash that changes in a later
 * release of Effect moves no entity's rows (decision 0137).
 */
export const partitionOf = (id: string, partitions: number): number => Math.abs(Hash.string(id) % partitions) + 1

/**
 * The tables, made by the migrations not yet recorded in `effecttea_migrations`. Every entity of every program sits in
 * them: the name of the program and the id are the entity's address (decision 0022). Every table, index, trigger and
 * function the runtime makes is named with `effecttea_`, so that the tables of an application in the same database are
 * never taken for its own. The first migration creates each object without `IF NOT EXISTS`, so that a launch on a
 * database that already holds an object under one of those names dies, and leaves none of its own (decision 0218).
 * `Migrator` runs the pending migrations in one transaction, so that two
 * launches on one database run each migration once (decision 0216). On SQLite the transaction takes the file's write
 * lock as it begins, which the driver does by default and this asks for by name, since a transaction begun without
 * it dies while another runs; on PostgreSQL `Migrator` locks its table.
 */
export const createTables: Effect.Effect<void, never, SqlClient.SqlClient> = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const dialect = dialectOf(sql)
  // `Migrator` looks for its table in every schema of the `search_path`, and would take the history of a schema
  // further on it for this one's. Named in the schema the tables are made in, it finds only this one's
  // (decision 0217). Without a schema to make them in, the creation fails as it would unnamed.
  const schema = dialect === 'pg' ? yield* schemaOf(sql) : null
  const migrated = Migrator.make({})({
    loader: Migrator.fromRecord(migrations),
    table: migrationsTable(schema),
  })
  yield* dialect === 'sqlite'
    ? Effect.provideService(migrated, SqlClient.BeginTransaction, 'BEGIN IMMEDIATE')
    : migrated
}).pipe(Effect.orDie)

/** The schema the tables are made in on PostgreSQL, the first of the `search_path`, or null for none (decision 0215). */
const schemaOf = (sql: SqlClient.SqlClient) =>
  Effect.map(sql<{ schema: string | null }>`SELECT current_schema() AS schema`, (found) => found[0]?.schema ?? null)

/** `effecttea_migrations`, named in the schema the tables are made in, where there is one (decision 0217). */
const migrationsTable = (schema: string | null) =>
  schema === null ? 'effecttea_migrations' : `${schema}.effecttea_migrations`

/**
 * Dies unless the tables were made by the migrations `createTables` runs, every one and no other: `check` reads the
 * tables a launch of this release would read, and makes none (decision 0247).
 */
export const tablesMade: Effect.Effect<void, never, SqlClient.SqlClient> = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const schema = dialectOf(sql) === 'pg' ? yield* schemaOf(sql) : null
  const recorded = yield* Effect.flatMap(
    sql`SELECT migration_id, name FROM ${sql(migrationsTable(schema))} ORDER BY migration_id`,
    Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({ migration_id: Count, name: Schema.String }))),
  )
  const held = recorded.map(({ migration_id, name }) => `${String(migration_id).padStart(4, '0')}_${name}`)
  const made = Object.keys(migrations)
  if (held.join(',') !== made.join(',')) {
    const reason = `the tables are made by the migrations [${held.join(', ')}], and this release reads those of [${
      made.join(', ')
    }]`
    return yield* Effect.die(new InvariantDefect({ reason }))
  }
}).pipe(Effect.orDie)

// The schema of the first release. A later change of a table is a migration of its own, after this one.
const tables = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const dialect = dialectOf(sql)
  // An integer of SQLite holds 64 bits, and one of PostgreSQL 32: a time, a `seq` and a count are bigints there
  // (decision 0157).
  const integer = sql.literal(dialect === 'pg' ? 'BIGINT' : 'INTEGER')
  // Text of PostgreSQL is compared by its bytes, as SQLite compares it, so that ids are ordered alike in both
  // dialects (decision 0157).
  const text = sql.literal(dialect === 'pg' ? 'TEXT COLLATE "C"' : 'TEXT')
  // The state, the request that created the entity and the suspension: one row per entity. `suspended_at` is the
  // time the entity suspended, kept while it stays suspended, which an operator reads (decision 0114).
  // `incarnations` is the last incarnation the entity drew, which never goes back (decision 0132). `keyed_as` is
  // the name the entity's idempotency keys are drawn from, written by its first rename and null before
  // (decision 0156).
  yield* sql`
    CREATE TABLE effecttea_entities (
      name ${text} NOT NULL,
      id ${text} NOT NULL,
      keyed_as ${text},
      state ${text} NOT NULL,
      version ${integer} NOT NULL,
      creation ${text} NOT NULL,
      incarnations ${integer} NOT NULL,
      suspended_on ${text},
      suspended_cause ${text},
      suspended_at ${integer},
      partition INTEGER NOT NULL,
      steps ${integer} NOT NULL DEFAULT 0,
      PRIMARY KEY (name, id)
    )
  `
  // One row per key the state holds work under, with its incarnation. A key whose work is gone has no row, since
  // the entity's counter keeps its incarnations from going back (decision 0132). `due` is a timer's time, by which
  // an entity nothing else holds loaded is woken (decision 0029). `key` is the key's name and `parameter` the JSON
  // of its parameter, or '' for a key without one: no JSON is empty, and a NULL in a primary key would let two rows
  // of one key coexist (decision 0136).
  yield* sql`
    CREATE TABLE effecttea_entity_keys (
      name ${text} NOT NULL,
      id ${text} NOT NULL,
      key ${text} NOT NULL,
      parameter ${text} NOT NULL,
      incarnation ${integer} NOT NULL,
      version ${integer} NOT NULL,
      work ${text} NOT NULL,
      delivery ${text},
      due ${integer},
      PRIMARY KEY (name, id, key, parameter)
    )
  `
  yield* sql`CREATE INDEX effecttea_entity_keys_due ON effecttea_entity_keys (due)`
  // The mailbox, in order: `seq` is given as a message is queued, and the first message is the lowest. `keep` is
  // how long a caller's reply is kept once its message is answered, null for ever (decision 0125). An internal
  // message holds the key of its work as `effecttea_entity_keys` does (decision 0136).
  yield* sql`
    CREATE TABLE effecttea_mailbox (
      name ${text} NOT NULL,
      id ${text} NOT NULL,
      seq ${integer} NOT NULL,
      tag ${text} NOT NULL,
      version ${integer} NOT NULL,
      message ${text} NOT NULL,
      request ${text},
      keep ${integer},
      key ${text},
      parameter ${text},
      incarnation ${integer},
      PRIMARY KEY (name, id, seq)
    )
  `
  // What callers read of each entity, and the values of the program's indexes on it: the read model of a
  // query across entities, written in the step's transaction (decision 0032).
  yield* sql`
    CREATE TABLE effecttea_projections (
      name ${text} NOT NULL,
      id ${text} NOT NULL,
      projection ${text} NOT NULL,
      indexes ${text} NOT NULL,
      version ${integer} NOT NULL,
      PRIMARY KEY (name, id)
    )
  `
  // How many partitions the log has: one row, written by the first launch and checked by every other, since a
  // change would move entities between partitions, and every consumer's cursors with them (decision 0137).
  yield* sql`
    CREATE TABLE effecttea_log (
      one INTEGER PRIMARY KEY CHECK (one = 1),
      partitions INTEGER NOT NULL
    )
  `
  // The last `seq` given in each partition of each program. A step moves its partition's head in its own
  // transaction, which holds the row until it commits, so the steps of one partition commit in the order of their
  // `seq`. A head is never deleted, so a `seq` is never given again (decision 0137).
  yield* sql`
    CREATE TABLE effecttea_heads (
      name ${text} NOT NULL,
      partition INTEGER NOT NULL,
      seq ${integer} NOT NULL,
      PRIMARY KEY (name, partition)
    )
  `
  // What a step that publishes left: the message it handled and the projection, once however many topics the step
  // is written in, keyed by the program, the partition and the `seq` the step drew (decision 0154). `written_at` is
  // the step's time, which `consumers` gives for the row each consumer reads next (decision 0224). It stands before
  // the text, which SQLite would walk past to reach it.
  yield* sql`
    CREATE TABLE effecttea_publications (
      name ${text} NOT NULL,
      partition INTEGER NOT NULL,
      seq ${integer} NOT NULL,
      id ${text} NOT NULL,
      tag ${text} NOT NULL,
      version ${integer} NOT NULL,
      written_at ${integer} NOT NULL,
      message ${text},
      projection ${text} NOT NULL,
      PRIMARY KEY (name, partition, seq)
    )
  `
  // What other systems learn of the entities: one row per topic that changed in a step, written in the step's own
  // transaction, which names the step's publication (decisions 0038, 0138, 0154). A row is keyed by its program, its
  // topic, its partition and its `seq`, which is what a consumer acks (decision 0137). `position` rises with each
  // row of the database, and is never reused: it is the order `fetch` reads the rows in, and no cursor.
  yield* sql`
    CREATE TABLE effecttea_outbox (
      position ${sql.literal(dialect === 'pg' ? 'BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT')},
      name ${text} NOT NULL,
      topic ${text} NOT NULL,
      partition INTEGER NOT NULL,
      seq ${integer} NOT NULL
    )
  `
  yield* sql`CREATE UNIQUE INDEX effecttea_outbox_partition ON effecttea_outbox (name, topic, partition, seq)`
  yield* sql`CREATE INDEX effecttea_outbox_topic ON effecttea_outbox (name, topic, position)`
  yield* sql`CREATE INDEX effecttea_outbox_publication ON effecttea_outbox (name, partition, seq)`
  // A publication goes with the last row of the outbox that names it, in the statement that drops the row, so that
  // no statement that drops rows of the outbox leaves a publication no topic reads (decision 0154). A trigger of
  // PostgreSQL runs a function, and one for each row runs once the statement has dropped every row (decision 0157).
  if (dialect === 'pg') {
    yield* sql.unsafe(`
      CREATE FUNCTION effecttea_outbox_drops_its_publication() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM effecttea_outbox WHERE name = OLD.name AND partition = OLD.partition AND seq = OLD.seq
        ) THEN
          DELETE FROM effecttea_publications WHERE name = OLD.name AND partition = OLD.partition AND seq = OLD.seq;
        END IF;
        RETURN NULL;
      END $$
    `)
    yield* sql`
      CREATE TRIGGER effecttea_outbox_drops_its_publication AFTER DELETE ON effecttea_outbox
      FOR EACH ROW EXECUTE FUNCTION effecttea_outbox_drops_its_publication()
    `
  } else {
    yield* sql`
      CREATE TRIGGER effecttea_outbox_drops_its_publication AFTER DELETE ON effecttea_outbox
      WHEN NOT EXISTS (
        SELECT 1 FROM effecttea_outbox WHERE name = old.name AND partition = old.partition AND seq = old.seq
      )
      BEGIN
        DELETE FROM effecttea_publications WHERE name = old.name AND partition = old.partition AND seq = old.seq;
      END
    `
  }
  // The consumers of the outbox, by topic and name, stored by the first deploy that declares them. Each holds its
  // topic of the log from then on, until it is forgotten (decisions 0138, 0152).
  yield* sql`
    CREATE TABLE effecttea_consumers (
      name ${text} NOT NULL,
      topic ${text} NOT NULL,
      consumer ${text} NOT NULL,
      PRIMARY KEY (name, topic, consumer)
    )
  `
  // Where each consumer has read to in each partition of its topic. A partition a consumer has no row for is read
  // from `0` (decision 0137).
  yield* sql`
    CREATE TABLE effecttea_cursors (
      name ${text} NOT NULL,
      topic ${text} NOT NULL,
      consumer ${text} NOT NULL,
      partition INTEGER NOT NULL,
      seq ${integer} NOT NULL,
      PRIMARY KEY (name, topic, consumer, partition)
    )
  `
  // The replies, by request: a retry gets the one stored (decision 0015). The request is its JSON as the machine
  // keys it, read through its schema (decision 0059). A row is keyed by the version that wrote it too, since a
  // migration may give one caller's request the text another's had: two versions never share a row
  // (decision 0069). A reply to another entity's operation holds the work that asked, its program, id, key and
  // incarnation, and is deleted once that work no longer holds (decision 0021). The key is held as
  // `effecttea_entity_keys` holds it (decision 0136). A caller's reply with an `until` is read before that time only
  // (decision 0125).
  // `request_id` is the id of a caller's request, null for another's, written by the process: PostgreSQL parses no
  // JSON that holds U+0000, which the program's data may (decision 0157).
  yield* sql`
    CREATE TABLE effecttea_replies (
      name ${text} NOT NULL,
      id ${text} NOT NULL,
      request ${text} NOT NULL,
      request_id ${text},
      tag ${text} NOT NULL,
      version ${integer} NOT NULL,
      reason ${text},
      until ${integer},
      sender_name ${text},
      sender_id ${text},
      sender_key ${text},
      sender_parameter ${text},
      sender_incarnation ${integer},
      PRIMARY KEY (name, id, request, version)
    )
  `
  yield* sql`CREATE INDEX effecttea_replies_sender ON effecttea_replies (sender_name, sender_id)`
  yield* sql`CREATE INDEX effecttea_replies_until ON effecttea_replies (name, until) WHERE until IS NOT NULL`
  // A caller's request a version before stored is found by its request id: its sender may be migrated since
  // (decision 0065).
  yield* sql`
    CREATE INDEX effecttea_replies_by_request_id ON effecttea_replies (name, id, request_id) WHERE request_id IS NOT NULL
  `
  // The answers another entity's operation was given that no entity stores: a creation `init` rejected, and a
  // message to no entity. Each is kept under the receiver and the request while the work
  // that asked holds, so that a run after a crash is given it again (decision 0253). `kind` tells a creation's answer
  // from a message's, which an operation may send under the same name.
  yield* sql`
    CREATE TABLE effecttea_answers (
      name ${text} NOT NULL,
      id ${text} NOT NULL,
      request ${text} NOT NULL,
      kind ${text} NOT NULL,
      tag ${text} NOT NULL,
      version ${integer} NOT NULL,
      reason ${text},
      sender_name ${text} NOT NULL,
      sender_id ${text} NOT NULL,
      sender_key ${text} NOT NULL,
      sender_parameter ${text} NOT NULL,
      sender_incarnation ${integer} NOT NULL,
      PRIMARY KEY (name, id, request, kind)
    )
  `
  yield* sql`CREATE INDEX effecttea_answers_sender ON effecttea_answers (sender_name, sender_id)`
  // On Cluster: the newest version each program was launched with, and the version of each program each runner
  // runs, by the runner's address (decision 0159). A runtime of one process writes neither. `renamed_to` is the name
  // a launch renamed the program to, which the check of every step reads in the same row (decision 0176).
  yield* sql`
    CREATE TABLE effecttea_versions (
      name ${text} PRIMARY KEY,
      version ${integer} NOT NULL,
      renamed_to ${text}
    )
  `
  yield* sql`
    CREATE TABLE effecttea_runner_versions (
      address ${text} NOT NULL,
      name ${text} NOT NULL,
      version ${integer} NOT NULL,
      PRIMARY KEY (address, name)
    )
  `
  // On Cluster: the entities whose operations were answered `Suspended` by a suspended entity, one row for each
  // sender, which the step that takes the entity out of its suspension tells and deletes (decisions 0092, 0167).
  yield* sql`
    CREATE TABLE effecttea_waiting (
      name ${text} NOT NULL,
      id ${text} NOT NULL,
      sender_name ${text} NOT NULL,
      sender_id ${text} NOT NULL,
      PRIMARY KEY (name, id, sender_name, sender_id)
    )
  `
  // On Cluster: the Cluster request id of each request an entity's operation sent, kept under the work that sent it,
  // whose step deletes Cluster's rows under the id once the work ends. An id with no sender is pending: its request
  // was answered after its work ended, or nothing waits for its answer, and the next step of any entity deletes
  // Cluster's rows under it (decision 0169). The id is an integer, as Cluster's column of it is, so that the
  // two compare as numbers.
  yield* sql`
    CREATE TABLE effecttea_sent_requests (
      request_id ${integer} PRIMARY KEY,
      sender_name ${text},
      sender_id ${text},
      sender_key ${text},
      sender_parameter ${text},
      sender_incarnation ${integer}
    )
  `
  yield* sql`CREATE INDEX effecttea_sent_requests_sender ON effecttea_sent_requests (sender_name, sender_id)`
  // On Cluster: the Cluster request id of each caller's creation and message sent with `keep`, under its entity, kept
  // by the caller's client once Cluster has given it its answer, with the time the client keeps Cluster's rows until:
  // the reply's, or a least time for every client's poll where that is later (decision 0248). A step that deletes its
  // entity's replies past their time deletes Cluster's rows under the ids past theirs, and so does `Handle.expire`
  // (decision 0171).
  yield* sql`
    CREATE TABLE effecttea_given_requests (
      request_id ${integer} PRIMARY KEY,
      name ${text} NOT NULL,
      id ${text} NOT NULL,
      until ${integer} NOT NULL
    )
  `
  yield* sql`CREATE INDEX effecttea_given_requests_until ON effecttea_given_requests (name, id, until)`
  // `expire` reads a program's ids past their time, of every entity (decision 0245).
  yield* sql`CREATE INDEX effecttea_given_requests_expire ON effecttea_given_requests (name, until)`
})

/** The migrations that make the tables, each by the name `Migrator` records it under. */
const migrations = { '0001_tables': tables }

/**
 * Stores the number of partitions of the log at the first launch, and checks it at every other: a launch given
 * another number than the one stored is the launcher's defect, and names both (decision 0137).
 */
export const partitioned = (partitions: number): Effect.Effect<void, never, SqlClient.SqlClient> =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    yield* sql`INSERT INTO effecttea_log (one, partitions) VALUES (1, ${partitions}) ON CONFLICT (one) DO NOTHING`
    const stored = yield* Effect.flatMap(
      sql`SELECT partitions FROM effecttea_log`,
      Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({ partitions: Count }))),
    )
    const held = stored[0]?.partitions
    if (held !== partitions) {
      return yield* Effect.die(new InvariantDefect({
        reason: `the log has ${held} partitions, and the runtime is launched with ${partitions}`,
      }))
    }
  }).pipe(Effect.orDie)

/** The tables whose rows are keyed by a program's name, each with an index whose first column is the name. */
const namedTables = [
  'effecttea_entities',
  'effecttea_entity_keys',
  'effecttea_mailbox',
  'effecttea_projections',
  'effecttea_heads',
  'effecttea_publications',
  'effecttea_outbox',
  'effecttea_consumers',
  'effecttea_cursors',
  'effecttea_replies',
  'effecttea_answers',
  'effecttea_waiting',
] as const

/**
 * Moves what is stored under each old name of `renames` to its new name, in one transaction: a rename that fails
 * moves nothing, and dies. A rename whose old name holds nothing moves nothing, so that it may stay in the launch.
 * One onto a name that holds an entity, a head of the log or a consumer is the launcher's defect. An entity keeps
 * the name its idempotency keys are drawn from, and every request its entities sent names the new name
 * (decision 0156). The runtime checks `renames` first, and runs this before any deploy, while nothing is loaded.
 * `marked` is a launch's on Cluster, where other runners may still run the old name: the old name is then marked
 * renamed in `effecttea_versions`, in the same transaction, and its newest version moves to the new name
 * (decision 0176).
 */
export const renamed = (
  renames: ReadonlyArray<readonly [from: string, to: string]>,
  marked = false,
): Effect.Effect<void, never, SqlClient.SqlClient> =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const dialect = dialectOf(sql)
    const flag = (statement: Effect.Effect<ReadonlyArray<unknown>, SqlError.SqlError>) =>
      Effect.map(
        Effect.flatMap(statement, Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({ held: Count })))),
        (found) => (found[0]?.held ?? 0) > 0,
      )
    /** A condition as a count, since PostgreSQL gives a boolean where SQLite gives an integer. */
    const counted = (condition: Statement.Fragment) => sql`SELECT CASE WHEN ${condition} THEN 1 ELSE 0 END AS held`
    const die = (reason: string) => Effect.die(new InvariantDefect({ reason }))
    // Each `EXISTS` is a search of an index whose first column is the name, or of the index by sender of
    // `effecttea_replies` or of `effecttea_answers`.
    const holds = (name: string) =>
      flag(counted(sql.or([
        ...namedTables.map((table) => sql`EXISTS (SELECT 1 FROM ${sql(table)} WHERE name = ${name})`),
        sql`EXISTS (SELECT 1 FROM effecttea_replies WHERE sender_name = ${name})`,
        sql`EXISTS (SELECT 1 FROM effecttea_answers WHERE sender_name = ${name})`,
      ])))
    const occupied = (name: string) =>
      flag(counted(sql.or(['effecttea_entities', 'effecttea_heads', 'effecttea_consumers'].map((table) =>
        sql`EXISTS (SELECT 1 FROM ${sql(table)} WHERE name = ${name})`
      ))))
    // The requests the old name's entities sent name it as their `entity`: the request that created an entity, a
    // message waiting in a mailbox, a reply's request and an answer's. Each table is given with the columns that key
    // its rows.
    const requests = [
      ['effecttea_entities', 'creation', ['name', 'id']],
      ['effecttea_mailbox', 'request', ['name', 'id', 'seq']],
      ['effecttea_replies', 'request', ['name', 'id', 'request', 'version']],
      ['effecttea_answers', 'request', ['name', 'id', 'request', 'kind']],
    ] as const
    const sentBy = (column: string, from: string) =>
      sql`json_extract(${sql(column)}, '$._tag') = 'Operation' AND json_extract(${
        sql(column)
      }, '$.entity.name') = ${from}`
    // On SQLite `json_set` writes the new name in place, in the database, and no request is read into the process
    // (decision 0156). A sender's retry finds its reply by the text of its request, which `json_set` writes, and no
    // version of SQLite the repository pins documents that text. So the rename checks, before it moves anything,
    // that the old name set again gives each text back unchanged, and that the new name is quoted as
    // `JSON.stringify` quotes it.
    const inPlace = (from: string, to: string) =>
      Effect.gen(function*() {
        const quoted = yield* Effect.flatMap(
          sql`SELECT json_quote(${to}) AS quoted`,
          Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({ quoted: Schema.String }))),
        )
        let rewritten = quoted[0]?.quoted !== JSON.stringify(to)
        for (const [table, column] of requests) {
          rewritten ||= yield* flag(counted(sql`EXISTS (
            SELECT 1 FROM ${sql(table)}
            WHERE ${sentBy(column, from)} AND json_set(${sql(column)}, '$.entity.name', ${from}) IS NOT ${sql(column)}
          )`))
        }
        if (rewritten) {
          return yield* die(
            `the launch renames '${from}' to '${to}', and SQLite writes a request's text otherwise than the runtime`,
          )
        }
        for (const [table, column] of requests) {
          yield* sql`
            UPDATE ${sql(table)} SET ${sql(column)} = json_set(${sql(column)}, '$.entity.name', ${to})
            WHERE ${sentBy(column, from)}
          `
        }
      })
    // On PostgreSQL no statement parses a request, since PostgreSQL parses no JSON that holds U+0000, which the
    // program's data may. A statement finds the texts that hold the old name as JSON writes it, and the process reads
    // each, keeps those whose `entity` is the old name, and writes the new name with `JSON.parse` and
    // `JSON.stringify`, which keep the order of the keys. A text that `JSON.stringify` does not give back as it is
    // was not written by the runtime, and the rename dies before it moves anything (decision 0157).
    const inProcess = (from: string, to: string) =>
      Effect.gen(function*() {
        const moves: Array<Effect.Effect<unknown, SqlError.SqlError>> = []
        for (const [table, column, keys] of requests) {
          const found = yield* sql<Record<string, unknown>>`
            SELECT ${sql.literal(keys.join(', '))}, ${sql(column)} AS text FROM ${sql(table)}
            WHERE strpos(${sql(column)}, ${JSON.stringify(from)}) > 0
          `
          for (const row of found) {
            const text = row.text
            const held = typeof text === 'string' ? JSON.parse(text) as Readonly<Record<string, Json>> : null
            const entity = held?.entity
            if (
              held?._tag !== 'Operation' || typeof entity !== 'object' || entity === null || Array.isArray(entity)
              || (entity as Readonly<Record<string, Json>>).name !== from
            ) continue
            if (JSON.stringify(held) !== text) {
              return yield* die(
                `the launch renames '${from}' to '${to}', and a request of '${table}' is no text the runtime writes`,
              )
            }
            const written = JSON.stringify({ ...held, entity: { ...entity, name: to } })
            moves.push(sql`
              UPDATE ${sql(table)} SET ${sql(column)} = ${written}
              WHERE ${sql.and(keys.map((key) => sql`${sql(key)} = ${row[key]}`))}
            `)
          }
        }
        for (const move of moves) yield* move
      })
    const rename = (from: string, to: string) =>
      Effect.gen(function*() {
        if (!(yield* holds(from))) return
        if (yield* occupied(to)) {
          return yield* die(
            `the launch renames '${from}' to '${to}', which holds an entity, a head of the log or a consumer already`,
          )
        }
        yield* dialect === 'pg' ? inProcess(from, to) : inPlace(from, to)
        yield* sql`UPDATE effecttea_replies SET sender_name = ${to} WHERE sender_name = ${from}`
        yield* sql`UPDATE effecttea_answers SET sender_name = ${to} WHERE sender_name = ${from}`
        yield* sql`UPDATE effecttea_sent_requests SET sender_name = ${to} WHERE sender_name = ${from}`
        yield* sql`UPDATE effecttea_given_requests SET name = ${to} WHERE name = ${from}`
        yield* sql`UPDATE effecttea_waiting SET sender_name = ${to} WHERE sender_name = ${from}`
        yield* sql`UPDATE effecttea_entities SET keyed_as = COALESCE(keyed_as, ${from}) WHERE name = ${from}`
        for (const table of namedTables) yield* sql`UPDATE ${sql(table)} SET name = ${to} WHERE name = ${from}`
      })
    const standing = (name: string) =>
      Effect.map(
        Effect.flatMap(
          sql`SELECT version, renamed_to FROM effecttea_versions WHERE name = ${name}`,
          Schema.decodeUnknownEffect(Schema.Array(Standing)),
        ),
        (rows) => rows[0],
      )
    // The old name is marked whether or not it holds anything: a runner of the old code may create an entity under
    // it after the move, and the check of every step reads the mark in its transaction (decision 0176). A version
    // 0 is the mark of a name no launch on Cluster recorded, which every version of a program outranks.
    // The new names this transaction gave a version, which a later old name of the same new name raises: two names
    // renamed to one would otherwise die or not by the order of the renames (decision 0176).
    const given = new Set<string>()
    const mark = (from: string, to: string) =>
      Effect.gen(function*() {
        const old = yield* standing(from)
        const held = yield* standing(to)
        if (old !== undefined && held !== undefined && old.version > held.version) {
          if (!given.has(to)) {
            return yield* die(
              `the launch renames '${from}' to '${to}', and a launch has run '${from}' at version ${old.version}, newer than ${held.version}`,
            )
          }
          yield* sql`UPDATE effecttea_versions SET version = ${old.version} WHERE name = ${to}`
        }
        if (old !== undefined && held === undefined) {
          yield* sql`INSERT INTO effecttea_versions (name, version) VALUES (${to}, ${old.version})`
          given.add(to)
        }
        yield* sql`
          INSERT INTO effecttea_versions (name, version, renamed_to) VALUES (${from}, ${old?.version ?? 0}, ${to})
          ON CONFLICT (name) DO UPDATE SET renamed_to = excluded.renamed_to
        `
      })
    const run = Effect.gen(function*() {
      // As `recordVersions` takes `effecttea_versions`, so that a launch that renames and one that records see each
      // other.
      if (marked && dialect === 'pg') yield* sql`LOCK TABLE effecttea_versions IN SHARE ROW EXCLUSIVE MODE`
      for (const [from, to] of renames) {
        yield* rename(from, to)
        if (marked) yield* mark(from, to)
      }
    })
    yield* transaction(sql, run, marked ? 'BEGIN IMMEDIATE' : undefined)
  }).pipe(Effect.orDie)
