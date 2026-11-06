/**
 * What a runtime writes: a `Stored<T>` in one database of SQLite or PostgreSQL, through `SqlClient` (decisions 0007,
 * 0019, 0157). The machine says what is stored; this module says in which tables, and encodes it with the program's
 * schemas (decisions 0025, 0027). Every row carries the version of the program that wrote it, and is read by migrating
 * its JSON to the program's version (decision 0036). Nothing here decides anything: the machine encodes what an
 * event writes, and a caller writes it in one transaction (decision 0057).
 */
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Hash from 'effect/Hash'
import * as Schema from 'effect/Schema'
import type * as Scope from 'effect/Scope'
import { SqlClient, type SqlError, type Statement } from 'effect/sql'
import * as Machine from './machine.ts'
import {
  type Durable,
  InvariantDefect,
  type Json,
  type Key,
  KeyCodec,
  type Migrated,
  migrationOf,
  type Program,
  type Request,
  type Scalar,
  timer,
  type Topic,
  topicsOf,
  type Types,
  type Value,
  versionOf,
} from './program.ts'

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

/** The clients a runtime of this process holds: another runtime on one of them is refused (decision 0080). */
const held = new WeakSet<SqlClient.SqlClient>()

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
 * one session, which would take the lock again, so the client alone holds it. A database another runtime holds, or
 * another connection has open, is the launcher's defect.
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
    if (sql.driver === 'pglite') return
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
 * The tables, created once for the database. Every entity of every program sits in them: the name of the program
 * and the id are the entity's address (decision 0022).
 */
export const createTables: Effect.Effect<void, never, SqlClient.SqlClient> = Effect.gen(function*() {
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
    CREATE TABLE IF NOT EXISTS entities (
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
      PRIMARY KEY (name, id)
    )
  `
  // One row per key the state holds work under, with its incarnation. A key whose work is gone has no row, since
  // the entity's counter keeps its incarnations from going back (decision 0132). `due` is a timer's time, by which
  // an entity nothing else holds loaded is woken (decision 0029). `key` is the key's name and `parameter` the JSON
  // of its parameter, or '' for a key without one: no JSON is empty, and a NULL in a primary key would let two rows
  // of one key coexist (decision 0136).
  yield* sql`
    CREATE TABLE IF NOT EXISTS entity_keys (
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
  yield* sql`CREATE INDEX IF NOT EXISTS entity_keys_due ON entity_keys (due)`
  // The mailbox, in order: `seq` is given as a message is queued, and the first message is the lowest. `keep` is
  // how long a caller's reply is kept once its message is answered, null for ever (decision 0125). An internal
  // message holds the key of its work as `entity_keys` does (decision 0136).
  yield* sql`
    CREATE TABLE IF NOT EXISTS mailbox (
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
    CREATE TABLE IF NOT EXISTS projections (
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
    CREATE TABLE IF NOT EXISTS log (
      one INTEGER PRIMARY KEY CHECK (one = 1),
      partitions INTEGER NOT NULL
    )
  `
  // The last `seq` given in each partition of each program. A step moves its partition's head in its own
  // transaction, which holds the row until it commits, so the steps of one partition commit in the order of their
  // `seq`. A head is never deleted, so a `seq` is never given again (decision 0137).
  yield* sql`
    CREATE TABLE IF NOT EXISTS heads (
      name ${text} NOT NULL,
      partition INTEGER NOT NULL,
      seq ${integer} NOT NULL,
      PRIMARY KEY (name, partition)
    )
  `
  // What a step that publishes left: the message it handled and the projection, once however many topics the step
  // is written in, keyed by the program, the partition and the `seq` the step drew (decision 0154).
  yield* sql`
    CREATE TABLE IF NOT EXISTS publications (
      name ${text} NOT NULL,
      partition INTEGER NOT NULL,
      seq ${integer} NOT NULL,
      id ${text} NOT NULL,
      tag ${text} NOT NULL,
      version ${integer} NOT NULL,
      message ${text},
      projection ${text} NOT NULL,
      PRIMARY KEY (name, partition, seq)
    )
  `
  // What other systems learn of the entities: one row per topic that changed in a step, written in the step's own
  // transaction, which names the step's publication (decisions 0038, 0138, 0154). A row is keyed by its program, its
  // topic, its partition and its `seq`, which is what a consumer acks (decision 0137). `position` rises with each
  // row of the database, and is never reused: it is the order `feed` reads the rows in, and no cursor.
  yield* sql`
    CREATE TABLE IF NOT EXISTS outbox (
      position ${sql.literal(dialect === 'pg' ? 'BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT')},
      name ${text} NOT NULL,
      topic ${text} NOT NULL,
      partition INTEGER NOT NULL,
      seq ${integer} NOT NULL
    )
  `
  yield* sql`CREATE UNIQUE INDEX IF NOT EXISTS outbox_partition ON outbox (name, topic, partition, seq)`
  yield* sql`CREATE INDEX IF NOT EXISTS outbox_topic ON outbox (name, topic, position)`
  yield* sql`CREATE INDEX IF NOT EXISTS outbox_publication ON outbox (name, partition, seq)`
  // A publication goes with the last row of the outbox that names it, in the statement that drops the row, so that
  // no statement that drops rows of the outbox leaves a publication no topic reads (decision 0154). A trigger of
  // PostgreSQL runs a function, and one for each row runs once the statement has dropped every row (decision 0157).
  if (dialect === 'pg') {
    yield* sql.unsafe(`
      CREATE OR REPLACE FUNCTION outbox_drops_its_publication() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM outbox WHERE name = OLD.name AND partition = OLD.partition AND seq = OLD.seq
        ) THEN
          DELETE FROM publications WHERE name = OLD.name AND partition = OLD.partition AND seq = OLD.seq;
        END IF;
        RETURN NULL;
      END $$
    `)
    yield* sql`
      CREATE OR REPLACE TRIGGER outbox_drops_its_publication AFTER DELETE ON outbox
      FOR EACH ROW EXECUTE FUNCTION outbox_drops_its_publication()
    `
  } else {
    yield* sql`
      CREATE TRIGGER IF NOT EXISTS outbox_drops_its_publication AFTER DELETE ON outbox
      WHEN NOT EXISTS (
        SELECT 1 FROM outbox WHERE name = old.name AND partition = old.partition AND seq = old.seq
      )
      BEGIN
        DELETE FROM publications WHERE name = old.name AND partition = old.partition AND seq = old.seq;
      END
    `
  }
  // The consumers of the outbox, by topic and name, stored by the first deploy that declares them. Each holds its
  // topic of the log from then on, until it is forgotten (decisions 0138, 0152).
  yield* sql`
    CREATE TABLE IF NOT EXISTS consumers (
      name ${text} NOT NULL,
      topic ${text} NOT NULL,
      consumer ${text} NOT NULL,
      PRIMARY KEY (name, topic, consumer)
    )
  `
  // Where each consumer has read to in each partition of its topic. A partition a consumer has no row for is read
  // from `0` (decision 0137).
  yield* sql`
    CREATE TABLE IF NOT EXISTS cursors (
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
  // incarnation, and is deleted once that work no longer holds (decision 0021). The key is held as `entity_keys`
  // holds it (decision 0136). A caller's reply with an `until` is read before that time only (decision 0125).
  // `request_id` is the id of a caller's request, null for another's, written by the process: PostgreSQL parses no
  // JSON that holds U+0000, which the program's data may (decision 0157).
  yield* sql`
    CREATE TABLE IF NOT EXISTS replies (
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
  yield* sql`CREATE INDEX IF NOT EXISTS replies_sender ON replies (sender_name, sender_id)`
  yield* sql`CREATE INDEX IF NOT EXISTS replies_until ON replies (name, until) WHERE until IS NOT NULL`
  // A caller's request a version before stored is found by its request id: its sender may be migrated since
  // (decision 0065). A database of SQLite made before holds the index of the id read out of the request, which goes
  // (decision 0157), and its replies without `request_id`, which is added and filled as that index read it, before
  // the index of the column is made (decision 0158).
  if (dialect === 'sqlite') {
    yield* sql`DROP INDEX IF EXISTS replies_request_id`
    const [column] = yield* sql<{ held: number }>`
      SELECT COUNT(*) AS held FROM pragma_table_info('replies') WHERE name = 'request_id'
    `
    if (column?.held === 0) {
      yield* sql`ALTER TABLE replies ADD COLUMN request_id TEXT`
      yield* sql`
        UPDATE replies SET request_id = json_extract(request, '$.id') WHERE json_extract(request, '$._tag') = 'Caller'
      `
    }
  }
  yield* sql`
    CREATE INDEX IF NOT EXISTS replies_by_request_id ON replies (name, id, request_id) WHERE request_id IS NOT NULL
  `
}).pipe(Effect.orDie)

/**
 * Stores the number of partitions of the log at the first launch, and checks it at every other: a launch given
 * another number than the one stored is the launcher's defect, and names both (decision 0137).
 */
export const partitioned = (partitions: number): Effect.Effect<void, never, SqlClient.SqlClient> =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    yield* sql`INSERT INTO log (one, partitions) VALUES (1, ${partitions}) ON CONFLICT (one) DO NOTHING`
    const stored = yield* Effect.flatMap(
      sql`SELECT partitions FROM log`,
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
  'entities',
  'entity_keys',
  'mailbox',
  'projections',
  'heads',
  'publications',
  'outbox',
  'consumers',
  'cursors',
  'replies',
] as const

/**
 * Moves what is stored under each old name of `renames` to its new name, in one transaction: a rename that fails
 * moves nothing, and dies. A rename whose old name holds nothing moves nothing, so that it may stay in the launch.
 * One onto a name that holds an entity, a head of the log or a consumer is the launcher's defect. An entity keeps
 * the name its idempotency keys are drawn from, and every request its entities sent names the new name
 * (decision 0156). The runtime checks `renames` first, and runs this before any deploy, while nothing is loaded.
 */
export const renamed = (
  renames: ReadonlyArray<readonly [from: string, to: string]>,
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
    // Each `EXISTS` is a search of an index whose first column is the name, or of `replies_sender`.
    const holds = (name: string) =>
      flag(counted(sql.or([
        ...namedTables.map((table) => sql`EXISTS (SELECT 1 FROM ${sql(table)} WHERE name = ${name})`),
        sql`EXISTS (SELECT 1 FROM replies WHERE sender_name = ${name})`,
      ])))
    const occupied = (name: string) =>
      flag(counted(sql.or(['entities', 'heads', 'consumers'].map((table) =>
        sql`EXISTS (SELECT 1 FROM ${sql(table)} WHERE name = ${name})`
      ))))
    // The requests the old name's entities sent name it as their `entity`: the request that created an entity, a
    // message waiting in a mailbox, and a reply's request. Each table is given with the columns that key its rows.
    const requests = [
      ['entities', 'creation', ['name', 'id']],
      ['mailbox', 'request', ['name', 'id', 'seq']],
      ['replies', 'request', ['name', 'id', 'request', 'version']],
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
        yield* sql`UPDATE replies SET sender_name = ${to} WHERE sender_name = ${from}`
        yield* sql`UPDATE entities SET keyed_as = COALESCE(keyed_as, ${from}) WHERE name = ${from}`
        for (const table of namedTables) yield* sql`UPDATE ${sql(table)} SET name = ${to} WHERE name = ${from}`
      })
    yield* sql.withTransaction(Effect.forEach(renames, ([from, to]) => rename(from, to), { discard: true }))
  }).pipe(Effect.orDie)

/**
 * A value read from JSON text through its schema: what the machine wrote, encoded by the same schema
 * (decisions 0030, 0040, 0057).
 */
const json = <A>(codec: Schema.Codec<A, Json>) => {
  const decode = Schema.decodeSync(codec)
  return {
    /** `up` is how the version that wrote the text is read at the program's, and is identity for its own. */
    read: (text: string, up: (json: Json) => Json = (json) => json): A =>
      decode(up(JSON.parse(text) as Json) as never),
    /** JSON already parsed, at the program's version. */
    decode: (json: Json): A => decode(json as never),
  }
}

type Written<T extends Types> =
  | Readonly<{ _tag: 'Operation'; operation: T['operation'] }>
  | Readonly<{ _tag: 'Timer'; at: DateTime.Utc; message: T['internal'] }>

/** The work under a key: the program's own operation, or a timer's time and message. */
const workOf = <T extends Types>(program: Program<T>) =>
  Schema.Union([
    Schema.TaggedStruct('Operation', { operation: program.schemas.operation }),
    Schema.TaggedStruct('Timer', { at: Schema.DateTimeUtcFromMillis, message: program.schemas.internal }),
  ]) as unknown as Schema.Codec<Written<T>, Json>

/** The reason a reply carries: null for a bare `reject` (decision 0010). */
const reasonOf = <Reason>(rejection: Schema.Codec<Reason, Json>) =>
  Schema.NullOr(rejection) as unknown as Schema.Codec<Reason | null, Json>

/** A suspension's `on`: which event the defect happened on. Its cause is rendered, not stored as a value. */
const Suspended = Schema.Union([
  Schema.TaggedStruct('Message', {}),
  Schema.TaggedStruct('Operation', { key: KeyCodec, incarnation: Schema.Int }),
  Schema.TaggedStruct('Activation', {}),
]) as unknown as Schema.Codec<Machine.Suspension['on'], Json>

/** The version of the program that wrote a row: the first is 1 (decision 0036). */
const Version = Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1)))

/** An incarnation, a `seq` or a count, as a driver gives an integer up to 2^53 (decision 0157). */
const Count = Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)))

/** How an operation is delivered, as its runner declared (decisions 0011, 0123). */
const Delivery = Schema.Literals(['Idempotent', 'IdempotentDigest', 'AtLeastOnce', 'AtMostOnce', 'Droppable'])

/**
 * A key as its columns hold it: its name, and the JSON of its parameter, or '' for a key without one. No JSON is
 * empty, so '' is never a parameter's, and the column is never NULL, which a primary key would not compare
 * (decision 0136).
 */
const keyRow = (key: Key): Readonly<{ key: string; parameter: string }> => ({
  key: key.name,
  parameter: key.parameter === undefined ? '' : JSON.stringify(key.parameter),
})

/**
 * The id of a caller's request, from the text the machine keys it by, or null for another's request: what the column
 * `request_id` of a reply holds (decision 0157).
 */
const callerOf = (request: string): string | null => {
  const held = JSON.parse(request) as Readonly<Record<string, Json>> | null
  return typeof held === 'object' && held !== null && held._tag === 'Caller' && typeof held.id === 'string'
    ? held.id
    : null
}

/** A key read from its columns, as `keyRow` writes them. */
const keyOfRow = (name: string, parameter: string): Key =>
  parameter === '' ? { name } : { name, parameter: JSON.parse(parameter) as Json }

/** The rows a reading gives, decoded by the schema of one: built once, for every reading of its kind. */
const decoder = <S extends Schema.Top & { readonly DecodingServices: never }>(row: S) =>
  Schema.decodeUnknownEffect(Schema.Array(row))

/**
 * The rows of each table as the runtime writes them, which a reading takes through their schema. A row that is
 * none of them fails the call that meets it, as a row no version reads does (decisions 0043, 0062). The JSON a
 * column holds is the program's, and is read through the program's schemas.
 */
const Rows = {
  /** A suspension's event and its cause are written together, or not at all. */
  entity: decoder(Schema.Union([
    Schema.Struct({
      keyed_as: Schema.NullOr(Schema.String),
      state: Schema.String,
      version: Version,
      creation: Schema.String,
      incarnations: Count,
      suspended_on: Schema.Null,
      suspended_cause: Schema.Null,
    }),
    Schema.Struct({
      keyed_as: Schema.NullOr(Schema.String),
      state: Schema.String,
      version: Version,
      creation: Schema.String,
      incarnations: Count,
      suspended_on: Schema.String,
      suspended_cause: Schema.String,
    }),
  ])),
  /** A suspended entity, with the tag of its mailbox's first message, if any (decision 0114). */
  suspended: decoder(Schema.Struct({
    id: Schema.String,
    suspended_on: Schema.String,
    suspended_cause: Schema.String,
    suspended_at: Count,
    head: Schema.NullOr(Schema.Literals(['Inbound', 'Internal'])),
  })),
  /** A timer has no delivery. */
  key: decoder(Schema.Struct({
    key: Schema.String,
    parameter: Schema.String,
    incarnation: Count,
    version: Version,
    work: Schema.String,
    delivery: Schema.NullOr(Delivery),
  })),
  /** An inbound message carries its request, an internal one the key and incarnation of the work that sent it. */
  envelope: decoder(Schema.Union([
    Schema.Struct({
      tag: Schema.Literal('Inbound'),
      version: Version,
      message: Schema.String,
      request: Schema.String,
      keep: Schema.NullOr(Count),
      key: Schema.Null,
      parameter: Schema.Null,
      incarnation: Schema.Null,
    }),
    Schema.Struct({
      tag: Schema.Literal('Internal'),
      version: Version,
      message: Schema.String,
      request: Schema.Null,
      keep: Schema.Null,
      key: Schema.String,
      parameter: Schema.String,
      incarnation: Count,
    }),
  ])),
  /** Only a rejection carries a reason, and null for a bare `reject` (decision 0010). */
  reply: decoder(Schema.Union([
    Schema.Struct({ request: Schema.String, tag: Schema.Literal('Accepted'), version: Version, reason: Schema.Null }),
    Schema.Struct({
      request: Schema.String,
      tag: Schema.Literal('Rejected'),
      version: Version,
      reason: Schema.NullOr(Schema.String),
    }),
  ])),
  projection: decoder(Schema.Struct({
    id: Schema.String,
    projection: Schema.String,
    indexes: Schema.String,
    version: Version,
  })),
  state: decoder(Schema.Struct({ id: Schema.String, state: Schema.String, version: Version })),
  /** A creation's row handles no message, and a step's always one (decision 0038). */
  published: decoder(Schema.Union([
    Schema.Struct({
      position: Count,
      partition: Count,
      seq: Count,
      id: Schema.String,
      tag: Schema.Literal('Creation'),
      version: Version,
      message: Schema.Null,
      projection: Schema.String,
    }),
    Schema.Struct({
      position: Count,
      partition: Count,
      seq: Count,
      id: Schema.String,
      tag: Schema.Literals(['Inbound', 'Internal']),
      version: Version,
      message: Schema.String,
      projection: Schema.String,
    }),
  ])),
  id: decoder(Schema.Struct({ id: Schema.String })),
  /** A timer's time, in milliseconds: one before 1970 is a time too. */
  due: decoder(Schema.Struct({ id: Schema.String, at: Schema.Int })),
  seq: decoder(Schema.Struct({ seq: Count })),
  /** A count of the rows that match. */
  count: decoder(Schema.Struct({ count: Count })),
  /**
   * A total of an index, a double, and the least id of a row whose index holds a value that is no number, or null
   * for none (decision 0148).
   */
  total: decoder(Schema.Struct({ total: Schema.Number, refused: Schema.NullOr(Schema.String) })),
  /**
   * A value of an index as the JSON text the row holds, `null` for a row that lacks it, and how many rows hold it
   * (decision 0150).
   */
  tally: decoder(Schema.Struct({ value: Schema.String, count: Count })),
  /** An aggregate over no rows is null. */
  last: decoder(Schema.Struct({ seq: Schema.NullOr(Count) })),
  /** A cursor, or a partition's head: a `seq` within a partition. */
  cursor: decoder(Schema.Struct({ partition: Count, seq: Count })),
  /** The first row past the cursors, or null where every partition is read to its head. */
  position: decoder(Schema.Struct({ position: Schema.NullOr(Count) })),
  topical: decoder(Schema.Struct({ topic: Schema.String, consumer: Schema.String })),
  behind: decoder(Schema.Struct({
    topic: Schema.String,
    consumer: Schema.String,
    partition: Count,
    seq: Count,
    behind: Count,
  })),
} as const

/** How a query compares an index with a value. */
export type Comparison = '=' | '<>' | '<' | '<=' | '>' | '>='

const comparisons: ReadonlyArray<Comparison> = ['=', '<>', '<', '<=', '>', '>=']

/**
 * One thing that holds of the entities a query finds: the value of an index, compared with a value. Against
 * `null`, `=` and `<>` ask whether the index holds one; an order against `null` finds nothing, as in SQL.
 */
export type Criterion<T extends Types> = Readonly<{ index: T['index']; is: Comparison; value: Scalar }>

/** What a query across the entities of one program asks (decision 0032). */
export type Query<T extends Types> = Readonly<{
  /** Every criterion holds of the entities found; a query with none finds them all. */
  where?: ReadonlyArray<Criterion<T>>
  /**
   * The index they are ordered by, then the id, ascending unless `descending`, which reverses both: entities whose
   * index is null come first ascending and last descending (decision 0145).
   */
  order?: Readonly<{ index: T['index']; descending?: boolean }>
  /** How many at most, in that order: a query is a page (decision 0141). */
  limit: number
  /**
   * The last row a page gave: the rows given are past it in the order, by the value of the index ordered by and,
   * among the rows that tie, by the id. None, `undefined` included, is the first page, so that the last row of a
   * page is passed as it is, `undefined` where the page was empty (decision 0143).
   */
  after?: After<T> | undefined
}>

/** What a count across the entities of one program asks: the criteria a query takes (decision 0148). */
export type Counted<T extends Types> = Readonly<{ where?: ReadonlyArray<Criterion<T>> }>

/** What a sum across the entities of one program asks: the index added, and the criteria a query takes (decision 0148). */
export type Summed<T extends Types> = Readonly<{ index: T['index']; where?: ReadonlyArray<Criterion<T>> }>

/**
 * What a count per value of an index asks: the index grouped by, the criteria a query takes, and how many values at
 * most (decision 0150).
 */
export type CountedBy<T extends Types> = Readonly<{
  index: T['index']
  where?: ReadonlyArray<Criterion<T>>
  limit: number
}>

/** A value of an index, and how many of the entities counted hold it (decision 0150). */
export type Tally = Readonly<{ value: Scalar; count: number }>

/** A row a query gave, as a later page reads past it (decision 0143). */
export type After<T extends Types> = Readonly<{ id: string; indexes: Readonly<Record<T['index'], Scalar>> }>

/**
 * An entity a query found, as a caller reads it, with the value of each index as its row stores it: the values the
 * query compared, which a row written by an older version holds until `reindex` (decision 0143).
 */
export type Found<T extends Types> = Readonly<{
  id: string
  projection: T['projection']
  indexes: Readonly<Record<T['index'], Scalar>>
}>

/**
 * What a `reindex` did: how many rows it wrote, and the entities whose row it could not compute, each with the
 * cause, rendered as a suspension's is. The row of such an entity is left as it was (decision 0122).
 */
export type Reindexed = Readonly<{
  written: number
  failed: ReadonlyArray<Readonly<{ id: string; cause: string }>>
}>

/**
 * Where a reader has read to in one partition of the log: the `seq` of the last row it read there, `0` for none
 * (decision 0137).
 */
export type Cursor = Readonly<{ partition: number; seq: number }>

/**
 * What a step published in one topic of the log: the message it handled, and the value the topic selects of what
 * callers read of the entity after it (decisions 0038, 0138, 0140).
 */
export type Published<T extends Types, Name extends Topic<T> = Topic<T>> = Readonly<{
  /** The partition of the log the entity belongs to, which never changes (decision 0137). */
  partition: number
  /**
   * Rises with each step that publishes in the partition, and is never reused: with the partition, what a
   * consumer acks, and deduplicates by (decision 0137). The rows of one step share it, one per topic
   * (decision 0138).
   */
  seq: number
  id: string
  /** The topic the row is in: `projection` for a program that declares no topics (decision 0138). */
  topic: Name
  /** Where the message came from, or `Creation` for the row an entity's creation writes, which has none. */
  kind: 'Inbound' | 'Internal' | 'Creation'
  message: T['inbound'] | T['internal'] | null
  /**
   * What the topic selects of the projection the step left, as the program deployed selects it of the stored
   * projection read at the program's version: the projection whole for the topic `projection` (decision 0140).
   */
  value: Value<T, Name>
}>

/**
 * A suspended entity, as an operator sees it: what it died on, the cause as it was rendered when the entity
 * suspended, and since when, by the runtime's clock (decision 0114).
 */
export type Suspension = Readonly<{
  id: string
  /** The mailbox's first message, with its kind, an operation, or the activation of the stored state. */
  on:
    | Readonly<{ _tag: 'Message'; kind: 'Inbound' | 'Internal' }>
    | Readonly<{ _tag: 'Operation'; key: Key; incarnation: number }>
    | Readonly<{ _tag: 'Activation' }>
  cause: string
  since: DateTime.Utc
}>

/**
 * A consumer of the outbox, as an operator sees it: its topic, whether the deploy declares it, what is waiting,
 * and where (decisions 0039, 0137, 0152).
 */
export type Consumer = Readonly<{
  /** The topic it reads: a consumer is a name within its topic (decision 0138). */
  topic: string
  consumer: string
  /**
   * Whether the deploy declares it. One that is not is kept, and holds its topic, until `forget` drops it
   * (decision 0152).
   */
  declared: boolean
  /** How many rows are past its cursors, in every partition: what it costs the log to keep it. */
  behind: number
  /**
   * The cursors of the partitions it has rows to read in, by partition: `seq` is `0` in a partition it has acked
   * nothing of.
   */
  cursors: ReadonlyArray<Cursor>
}>

/** An identifier a database reads as written: a program's name is the author's, and is quoted, not escaped away. */
const quoted = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`

/**
 * The name of an index on PostgreSQL, which keeps the first 63 bytes of a name. A longer name keeps its first 50
 * bytes, and ends with the hash of the whole, so that two long names that share their first bytes name two indexes
 * (decision 0157).
 */
const indexName = (whole: string) => {
  const bytes = new TextEncoder().encode(whole)
  if (bytes.length <= 63) return whole
  const hash = (Hash.string(whole) >>> 0).toString(16).padStart(8, '0')
  // A character cut in the middle of its bytes is decoded as U+FFFD, which is dropped.
  return `${new TextDecoder().decode(bytes.slice(0, 50)).replace(/\uFFFD$/u, '')} ${hash}`
}

/** The entities an unloaded timer is due for, and the next time one is (decision 0029). */
export type Due = Readonly<{
  /** The entities with a stored timer due at or before the time asked: each is activated, and its timer fires. */
  ready: ReadonlyArray<string>
  /** The earliest time a stored timer of another entity is due, by which the process sleeps, or null for none. */
  next: number | null
}>

/** How many entities one reading gives as due: a reading that fills it is followed by another. */
const batch = 256

export interface Storage<T extends Types> {
  /** What is stored for the entity `id`, its replies left out, or null when there is none (decision 0065). */
  readonly load: (id: string) => Effect.Effect<Machine.Stored<T> | null>
  /**
   * The reply stored for the entity `id` under `request`, or null for none: what a `Receive` is given
   * (decision 0065). A caller's reply past its time at `at`, in milliseconds, is none (decision 0125).
   */
  readonly reply: (
    id: string,
    request: Request<T['sender']>,
    at: number,
  ) => Effect.Effect<Machine.StoredReply<T['rejection']> | null>
  /**
   * Writes what an event wrote, as the machine encoded it (decision 0057). The caller wraps it in the transaction
   * of the event (decision 0007). `at` is the time of the event, in milliseconds: the time the entity suspended,
   * where the event suspends it (decision 0114). It gives how many characters it wrote of the state and of the
   * projection, in the read model and in the step's publication, which the runtime warns of past a threshold
   * (decisions 0135, 0154).
   */
  readonly write: (id: string, written: Machine.Written, at: number) => Effect.Effect<number>
  /**
   * The entities whose state holds an operation, or whose mailbox holds a message: what a process activates when
   * it starts, without waiting for a caller. So an operation a crash interrupted runs again, and a message a
   * crash left before its step is handled. A timer needs no activation of its own, since its time is stored and
   * `due` gives it. A suspended entity handles nothing until an operator resumes it, and is left out (decisions 0006,
   * 0029, 0071).
   */
  readonly interrupted: Effect.Effect<ReadonlyArray<string>>
  /**
   * The stored timers of the entities this process does not hold: `loaded` are the ones it does, whose timers are
   * armed in it, and a suspended entity is left out, since no timer of its fires (decision 0029).
   */
  readonly due: (now: number, loaded: ReadonlyArray<string>) => Effect.Effect<Due>
  /**
   * Creates one expression index per index the program declares, so that a query over it is a lookup. Run once,
   * where the program is deployed: an index the program no longer declares is left behind, and costs nothing.
   */
  readonly indexed: Effect.Effect<void>
  /** The entities of the program whose indexes match, with what callers read of them (decision 0032). */
  readonly query: (query: Query<T>) => Effect.Effect<ReadonlyArray<Found<T>>>
  /** `Handle.count`, as the storage keeps it: one statement, which reads no projection (decision 0148). */
  readonly count: (counted: Counted<T>) => Effect.Effect<number>
  /** `Handle.sum`, as the storage keeps it: one statement, which reads no projection (decision 0148). */
  readonly sum: (summed: Summed<T>) => Effect.Effect<number>
  /** `Handle.countBy`, as the storage keeps it: one statement, which reads no projection (decision 0150). */
  readonly countBy: (counted: CountedBy<T>) => Effect.Effect<ReadonlyArray<Tally>>
  /** `Handle.read`, as the storage keeps it: the projection of the entity's row, or null for none (decision 0121). */
  readonly projected: (id: string) => Effect.Effect<T['projection'] | null>
  /**
   * `Handle.reindex`, as the storage keeps it. Each row is its own write, so a crash leaves the rest to the next
   * run. It gives how many were written, and the entities whose row the program could not compute, which keep
   * theirs (decision 0122). A row is written only if the state it was computed from is still the one stored: an
   * entity that took a step since wrote its own (decision 0070).
   */
  readonly reindex: Effect.Effect<Reindexed>
  /**
   * `Handle.published`, as the storage keeps it: the rows of `topic` past the cursors of `after`, in the order they
   * were written. The topic and the partitions are the caller's to check.
   */
  readonly published: <Name extends Topic<T>>(
    topic: Name,
    after: ReadonlyArray<Cursor>,
    limit: number,
  ) => Effect.Effect<ReadonlyArray<Published<T, Name>>>
  /**
   * Stores each consumer the deploy declares that is not stored yet, with no cursor: from then on it holds its
   * topic of the log, acked or not, until it is forgotten (decision 0152).
   */
  readonly declare: (consumers: ReadonlyArray<Readonly<{ topic: string; consumer: string }>>) => Effect.Effect<void>
  /**
   * `Handle.feed`, as the storage keeps it: it reads the consumer's cursors, and writes nothing (decision 0152).
   * Given `partitions`, it reads those partitions only (decision 0153). The partitions are the caller's to check.
   */
  readonly feed: <Name extends Topic<T>>(
    topic: Name,
    consumer: string,
    limit: number,
    partitions?: ReadonlyArray<number>,
  ) => Effect.Effect<ReadonlyArray<Published<T, Name>>>
  /**
   * `Handle.ack`, as the storage keeps it, in one transaction: the head of each partition is read first, and caps
   * the cursor stored there.
   */
  readonly ack: (topic: Topic<T>, consumer: string, through: ReadonlyArray<Cursor>) => Effect.Effect<void>
  /** `Handle.prune`, as the storage keeps it: the cursors are read and the rows dropped in one transaction. */
  readonly prune: Effect.Effect<number>
  /**
   * Every consumer stored, with how many rows are past its cursors, by topic and name. Whether the deploy declares
   * it is the runtime's to say.
   */
  readonly consumers: Effect.Effect<ReadonlyArray<Omit<Consumer, 'declared'>>>
  /** Drops a consumer and its cursors, so that the next prune passes what it never read (decision 0039). */
  readonly forget: (topic: Topic<T>, consumer: string) => Effect.Effect<void>
  /** `Handle.expire`: deletes the callers' replies past their time at `at`, in milliseconds, and counts them. */
  readonly expire: (at: number) => Effect.Effect<number>
  /** The suspended entities of the program, the longest suspended first (decision 0114). */
  readonly suspended: Effect.Effect<ReadonlyArray<Suspension>>
}

/**
 * The storage of one program's entities, on one client, with its schemas read once. `partitions` is the number of
 * partitions of the log, which `partitioned` checks against the database.
 */
export const storage = <T extends Types>(
  program: Program<T>,
  sql: SqlClient.SqlClient,
  partitions: number = defaultPartitions,
): Storage<T> => {
  const state = json(program.schemas.state)
  const inbound = json(program.schemas.inbound)
  const internal = json(program.schemas.internal)
  const request = json(Machine.requestCodec(program))
  const work = json(workOf(program))
  const reason = json(reasonOf(program.schemas.rejection))
  const suspended = json(Suspended)
  const projection = json(program.schemas.projection)
  /**
   * The topics the program publishes, by name, each with what it selects of a projection, or null for the whole of
   * it: what a row of the topic gives, selected of the stored projection once it is read at the program's version
   * (decisions 0138, 0140).
   */
  const topics = new Map(topicsOf(program).map(({ topic, select }) => [topic, select]))
  const { name } = program
  const version = versionOf(program)
  const dialect = dialectOf(sql)

  /**
   * Writes `record` into `table`, or over the row of the same `keys`: an upsert, which both dialects read alike
   * (decision 0157).
   */
  const upsert = (table: string, keys: ReadonlyArray<string>, record: Readonly<Record<string, unknown>>) =>
    sql`INSERT INTO ${sql(table)} ${sql.insert(record)} ON CONFLICT (${sql.literal(keys.join(', '))}) DO UPDATE SET ${
      sql.literal(
        Object.keys(record).filter((column) => !keys.includes(column)).map((column) => `${column} = excluded.${column}`)
          .join(', '),
      )
    }`

  /**
   * The rows `read` gives from `table`, through their schema: a row it refuses fails the call that meets it, and
   * names where it is (decisions 0043, 0062).
   */
  const rows = <A>(table: string, decode: (held: unknown) => Effect.Effect<A, Schema.SchemaError>) =>
  <E>(read: Effect.Effect<ReadonlyArray<unknown>, E>): Effect.Effect<A, E | Error> =>
    Effect.flatMap(read, (held) =>
      Effect.mapError(
        decode(held),
        (error) =>
          new Error(`a row of '${table}' for the program '${name}' is no row the runtime writes: ${error.message}`),
      ))

  /** The reading of one kind of value written by `from`, composed once and kept (decision 0036). */
  const readings = new Map<string, (json: Json) => Json>()
  const up = (of: Migrated, from: number): (json: Json) => Json => {
    const at = `${of}@${from}`
    const held = readings.get(at)
    if (held !== undefined) return held
    const reading = migrationOf(program, of, from)
    readings.set(at, reading)
    return reading
  }

  /** The fields of a stored value the runtime wraps; anything else is the program's own, and is left to `up`. */
  const fields = (held: Json): Readonly<Record<string, Json>> | null =>
    // `Array.isArray` does not narrow a readonly array out of the union, so what is left is cast.
    typeof held === 'object' && held !== null && !Array.isArray(held)
      ? held as Readonly<Record<string, Json>>
      : null

  /** A key's work: the wrapper is the runtime's, the operation and the timer's message are the program's. */
  const upWork = (from: number) => (held: Json): Json => {
    const written = fields(held)
    if (written === null) return held
    return written._tag === 'Timer'
      ? { ...written, message: up('internal', from)(written.message ?? null) }
      : { ...written, operation: up('operation', from)(written.operation ?? null) }
  }

  /**
   * A request: only a caller's sender is the program's, and is migrated, so that a retry after a deploy that
   * migrates the sender finds its reply, under the request as this version keys it (decisions 0048, 0059).
   */
  const upRequest = (from: number) => (held: Json): Json => {
    const written = fields(held)
    return written === null || written._tag !== 'Caller'
      ? held
      : { ...written, sender: up('sender', from)(written.sender ?? null) }
  }

  /** The reason a reply carries, null for a bare `reject`, which no migration reads. */
  const upReason = (from: number) => (held: Json): Json => held === null ? held : up('rejection', from)(held)

  /**
   * The path of an index in the JSON of a row's indexes. A program's indexes are words, which its check made sure of
   * where it entered (decision 0054).
   */
  const pathOf = (index: string) => {
    if (!Object.hasOwn(program.indexes, index)) {
      throw new Error(`'${index}' is no index of the program '${name}'`)
    }
    return `'$.${index}'`
  }

  /** The jsonb value of an index on PostgreSQL, SQL's NULL where the row lacks the index. */
  const valueOf = (index: string) => `((indexes::jsonb) -> '${index}')`

  /**
   * The expressions that read an index out of the row and order it, each written once. The index created and the
   * query must share them, since a database uses an index of an expression only where the query writes the
   * expression the same way. On SQLite the expression is what `json_extract` gives. On PostgreSQL three expressions
   * order a value as `json_extract` does: its kind, null first, then numbers and booleans, then strings; its
   * number, a boolean being 1 or 0; and its string, compared by its bytes as SQLite compares text (decision 0157).
   */
  const expressionsOf = (index: string): ReadonlyArray<string> => {
    const path = pathOf(index)
    if (dialect === 'sqlite') return [`json_extract(indexes, ${path})`]
    const value = valueOf(index)
    return [
      `(CASE jsonb_typeof(${value}) WHEN 'number' THEN 1 WHEN 'boolean' THEN 1 WHEN 'string' THEN 2 ELSE 0 END)`,
      `(CASE jsonb_typeof(${value}) WHEN 'number' THEN CAST(${value} AS NUMERIC)`
      + ` WHEN 'boolean' THEN CASE WHEN CAST(${value} AS BOOLEAN) THEN 1 ELSE 0 END ELSE 0 END)`,
      `((CASE WHEN jsonb_typeof(${value}) = 'string' THEN ${value} #>> '{}' ELSE '' END) COLLATE "C")`,
    ]
  }

  /** The index as one value, or as the row of its expressions on PostgreSQL, which compares as one. */
  const columnOf = (index: string) => {
    const expressions = expressionsOf(index)
    return sql.literal(expressions.length === 1 ? expressions[0]! : `(${expressions.join(', ')})`)
  }

  /** The kind of an index on PostgreSQL, 0 where it holds no value. */
  const kindOf = (index: string) => sql.literal(expressionsOf(index)[0]!)

  /**
   * The JSON of a row's indexes, as `json_extract` reads them equal to the value a query binds. An integer beyond
   * 2^53 is written with the exact digits of its double, since `JSON.stringify` writes the fewest digits that read
   * back as it, which SQLite reads as the exact integer they spell, another number (decision 0146).
   */
  const indexesText = (indexes: Machine.Shown['indexes']) =>
    `{${
      Object.entries(indexes).map(([index, value]) =>
        `${JSON.stringify(index)}:${
          typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value)
            ? BigInt(value).toString()
            : JSON.stringify(value)
        }`
      ).join(',')
    }}`

  /** The row a query reads, as the machine computed it from a state (decision 0032). */
  const row = (id: string, shown: Machine.Shown, projection: string = JSON.stringify(shown.projection)) =>
    upsert('projections', ['name', 'id'], { name, id, projection, indexes: indexesText(shown.indexes), version })

  const readWork = (text: string, from: number): Durable<T['operation'], T['internal']> => {
    const held = work.read(text, upWork(from))
    return held._tag === 'Timer' ? timer(held.at, held.message) : held.operation
  }

  const load = (id: string) =>
    Effect.gen(function*() {
      const entities = yield* rows('entities', Rows.entity)(
        sql`SELECT keyed_as, state, version, creation, incarnations, suspended_on, suspended_cause
            FROM entities WHERE name = ${name} AND id = ${id}`,
      )
      const row = entities[0]
      if (row === undefined) return null
      const held = yield* rows('entity_keys', Rows.key)(
        sql`SELECT key, parameter, incarnation, version, work, delivery FROM entity_keys
            WHERE name = ${name} AND id = ${id}`,
      )
      const queued = yield* rows('mailbox', Rows.envelope)(
        sql`SELECT tag, version, message, request, keep, key, parameter, incarnation FROM mailbox
            WHERE name = ${name} AND id = ${id} ORDER BY seq`,
      )
      const keys: Record<string, Machine.Run<T>> = {}
      for (const row of held) {
        const key = keyOfRow(row.key, row.parameter)
        keys[Machine.keyText(key)] = {
          key,
          incarnation: row.incarnation,
          work: readWork(row.work, row.version),
          ...(row.delivery === null ? {} : { delivery: row.delivery }),
        }
      }
      const mailbox = queued.map((envelope): Machine.Envelope<T> =>
        envelope.tag === 'Inbound'
          ? {
            _tag: 'Inbound',
            request: request.read(envelope.request, upRequest(envelope.version)),
            message: inbound.read(envelope.message, up('inbound', envelope.version)),
            ...(envelope.keep === null ? {} : { keep: envelope.keep }),
          }
          : {
            _tag: 'Internal',
            key: keyOfRow(envelope.key, envelope.parameter),
            incarnation: envelope.incarnation,
            message: internal.read(envelope.message, up('internal', envelope.version)),
          }
      )
      return {
        name,
        ...(row.keyed_as === null ? {} : { keyedAs: row.keyed_as }),
        id,
        state: state.read(row.state, up('state', row.version)),
        keys,
        incarnations: row.incarnations,
        mailbox,
        creation: request.read(row.creation, upRequest(row.version)),
        // The cause is what was rendered when the entity suspended: an operator reads it, nothing acts on it.
        suspension: row.suspended_on === null
          ? null
          : { cause: row.suspended_cause, on: suspended.read(row.suspended_on) },
      } satisfies Machine.Stored<T>
    }).pipe(Effect.orDie)

  /**
   * The reply among `found` stored under the request `key`, as this version keys it: a row is compared once read
   * through the migrations, since only a caller's sender is the program's, and may be migrated (decision 0059).
   */
  const replyOf = (found: Effect.Success<ReturnType<typeof Rows.reply>>, key: string) => {
    for (const held of found) {
      if (Machine.requestKey(program, request.read(held.request, upRequest(held.version))) !== key) continue
      return held.tag === 'Accepted'
        ? { _tag: 'Accepted' } as const
        : {
          _tag: 'Rejected',
          reason: held.reason === null ? null : reason.read(held.reason, upReason(held.version)),
        } as const
    }
    return null
  }

  // A request is found by its text, as the machine keys it. A caller's request is then looked for among the rows
  // other versions wrote under its request id, since its sender as such a version wrote it may be another text.
  // Each reading is by an index (decision 0065). A reply past its time at `at` is not read, whether its row is
  // deleted yet or not (decision 0125).
  const reply = (id: string, asked: Request<T['sender']>, at: number) =>
    Effect.gen(function*() {
      const key = Machine.requestKey(program, asked)
      const exact = replyOf(
        yield* rows('replies', Rows.reply)(sql`
          SELECT request, tag, version, reason FROM replies
          WHERE name = ${name} AND id = ${id} AND request = ${key} AND (until IS NULL OR until > ${at})
        `),
        key,
      )
      if (exact !== null || asked._tag !== 'Caller') return exact
      return replyOf(
        yield* rows('replies', Rows.reply)(sql`
          SELECT request, tag, version, reason FROM replies
          WHERE name = ${name} AND id = ${id} AND request_id = ${asked.id} AND version <> ${version}
            AND (until IS NULL OR until > ${at})
        `),
        key,
      )
    }).pipe(Effect.orDie)

  const write = (id: string, written: Machine.Written, at: number) =>
    Effect.gen(function*() {
      const { entity, suspension } = written
      const state = entity === null ? null : JSON.stringify(entity.state)
      let characters = state?.length ?? 0
      const on = suspension === null ? null : JSON.stringify(suspension.on)
      const cause = suspension === null ? null : suspension.cause
      if (written.created) {
        if (entity === null) throw new Error(`the entity '${name}' '${id}' is created with no state`)
        yield* sql`INSERT INTO entities ${
          sql.insert({
            name,
            id,
            state,
            version,
            creation: JSON.stringify(entity.creation),
            incarnations: written.incarnations,
            suspended_on: on,
            suspended_cause: cause,
            suspended_at: on === null ? null : at,
            partition: partitionOf(id, partitions),
          })
        }`
      } else if (entity !== null) {
        // The request that created the entity is written with the state, at the version that reads both. The time
        // of the suspension is the first step's that suspended the entity, kept while it stays suspended (decision
        // 0114).
        yield* sql`
          UPDATE entities
          SET state = ${state}, version = ${version},
              creation = ${JSON.stringify(entity.creation)}, incarnations = ${written.incarnations},
              suspended_on = ${on}, suspended_cause = ${cause},
              suspended_at = CASE WHEN CAST(${on} AS TEXT) IS NULL THEN NULL WHEN suspended_at IS NULL THEN ${at} ELSE suspended_at END
          WHERE name = ${name} AND id = ${id}
        `
      } else {
        yield* sql`
          UPDATE entities
          SET incarnations = ${written.incarnations}, suspended_on = ${on}, suspended_cause = ${cause},
              suspended_at = CASE WHEN CAST(${on} AS TEXT) IS NULL THEN NULL WHEN suspended_at IS NULL THEN ${at} ELSE suspended_at END
          WHERE name = ${name} AND id = ${id}
        `
      }
      if (written.shown !== null) {
        const projection = JSON.stringify(written.shown.projection)
        characters += projection.length
        yield* row(id, written.shown, projection)
      }
      for (const held of written.keys) {
        yield* upsert('entity_keys', ['name', 'id', 'key', 'parameter'], {
          name,
          id,
          ...keyRow(held.key),
          incarnation: held.incarnation,
          version,
          work: JSON.stringify(held.work),
          delivery: held.delivery,
          due: held.due,
        })
      }
      for (const key of written.gone) {
        const { key: held, parameter } = keyRow(key)
        yield* sql`
          DELETE FROM entity_keys WHERE name = ${name} AND id = ${id} AND key = ${held} AND parameter = ${parameter}
        `
      }
      // The mailbox's rows are numbered as they are queued: its first message is the lowest.
      if (written.handled > 0) {
        yield* sql`
          DELETE FROM mailbox WHERE name = ${name} AND id = ${id} AND seq IN (
            SELECT seq FROM mailbox WHERE name = ${name} AND id = ${id} ORDER BY seq LIMIT ${written.handled}
          )
        `
      }
      if (written.queued.length > 0) {
        const last = yield* rows('mailbox', Rows.last)(
          sql`SELECT max(seq) AS seq FROM mailbox WHERE name = ${name} AND id = ${id}`,
        )
        const first = (last[0]?.seq ?? -1) + 1
        for (const [at, envelope] of written.queued.entries()) {
          yield* sql`INSERT INTO mailbox ${
            sql.insert(
              envelope._tag === 'Inbound'
                ? {
                  name,
                  id,
                  seq: first + at,
                  tag: 'Inbound',
                  version,
                  message: JSON.stringify(envelope.message),
                  request: JSON.stringify(envelope.request),
                  keep: envelope.keep,
                  key: null,
                  parameter: null,
                  incarnation: null,
                }
                : {
                  name,
                  id,
                  seq: first + at,
                  tag: 'Internal',
                  version,
                  message: JSON.stringify(envelope.message),
                  request: null,
                  keep: null,
                  ...keyRow(envelope.key),
                  incarnation: envelope.incarnation,
                },
            )
          }`
        }
      }
      // A reply to another entity is kept while the work that asked holds (decision 0021). The work of this
      // entity that ended takes the replies to its requests with it. A reply stored for work of another entity
      // that already ended goes as it is stored, since only the storage sees the asker's keys: an at-most-once
      // operation that delivered `unknown` while its request waited in the mailbox. No machine holds a reply, so
      // none is told (decision 0065).
      for (const reply of written.replies) {
        const { asked } = reply
        const asking = asked === null ? null : keyRow(asked.key)
        yield* upsert('replies', ['name', 'id', 'request', 'version'], {
          name,
          id,
          request: reply.request,
          request_id: callerOf(reply.request),
          tag: reply.tag,
          version,
          reason: reply.reason === null ? null : JSON.stringify(reply.reason),
          until: reply.until,
          sender_name: asked?.name ?? null,
          sender_id: asked?.id ?? null,
          sender_key: asking?.key ?? null,
          sender_parameter: asking?.parameter ?? null,
          sender_incarnation: asked?.incarnation ?? null,
        })
        if (asked === null || asking === null) continue
        yield* sql`
          DELETE FROM replies
          WHERE name = ${name} AND id = ${id} AND request = ${reply.request} AND version = ${version}
            AND NOT EXISTS (
              SELECT 1 FROM entity_keys AS asking
              WHERE asking.name = ${asked.name} AND asking.id = ${asked.id} AND asking.key = ${asking.key}
                AND asking.parameter = ${asking.parameter} AND asking.incarnation = ${asked.incarnation}
            )
        `
      }
      for (const { key, incarnation } of written.ended) {
        const ended = keyRow(key)
        yield* sql`
          DELETE FROM replies
          WHERE sender_name = ${name} AND sender_id = ${id} AND sender_key = ${ended.key}
            AND sender_parameter = ${ended.parameter} AND sender_incarnation = ${incarnation}
        `
      }
      // A step that answers a caller takes its entity's replies past their time with it (decision 0125).
      if (written.replies.length > 0) {
        yield* sql`DELETE FROM replies WHERE name = ${name} AND id = ${id} AND until IS NOT NULL AND until <= ${at}`
      }
      // The rows of the log are written last. Their `seq` is drawn once, by moving the head of the entity's
      // partition, which holds the head's row until the transaction ends, so the head is held for the least of the
      // transaction. The head is written by the first step that publishes in the partition (decision 0137). Every
      // topic the step is written in takes the same `seq`, so that a step takes one lock however many topics it
      // publishes (decision 0138), and names the one publication that holds the projection (decision 0154).
      if (written.published !== null) {
        const { kind, message } = written.published
        const projection = JSON.stringify(written.published.projection)
        const drawn = yield* rows('heads', Rows.cursor)(sql`
          INSERT INTO heads (name, partition, seq)
          SELECT name, partition, 1 FROM entities WHERE name = ${name} AND id = ${id}
          ON CONFLICT (name, partition) DO UPDATE SET seq = heads.seq + 1
          RETURNING partition, seq
        `)
        const head = drawn[0]
        if (head === undefined) throw new Error(`the entity '${name}' '${id}' publishes with no row of its own`)
        characters += projection.length
        yield* sql`INSERT INTO publications ${
          sql.insert({
            name,
            partition: head.partition,
            seq: head.seq,
            id,
            tag: kind,
            version,
            message: message === null ? null : JSON.stringify(message),
            projection,
          })
        }`
        for (const topic of written.published.topics) {
          yield* sql`INSERT INTO outbox ${sql.insert({ name, topic, partition: head.partition, seq: head.seq })}`
        }
      }
      return characters
    }).pipe(Effect.orDie)

  const expire = (at: number) =>
    Effect.gen(function*() {
      const gone = yield* rows('replies', Rows.id)(sql`
        DELETE FROM replies WHERE name = ${name} AND until IS NOT NULL AND until <= ${at} RETURNING id
      `)
      return gone.length
    }).pipe(Effect.orDie)

  /** The entities of the program an operator has to resume: nothing of theirs is handled, and no timer of theirs fires. */
  const onHold = sql`(SELECT id FROM entities WHERE name = ${name} AND suspended_on IS NOT NULL)`

  // A key holding an operation has no `due`: the time of a timer is what that column is for.
  const interrupted = Effect.gen(function*() {
    const found = yield* rows('entity_keys', Rows.id)(sql`
      SELECT id FROM entity_keys
      WHERE name = ${name} AND due IS NULL AND id NOT IN ${onHold}
      UNION
      SELECT id FROM mailbox WHERE name = ${name} AND id NOT IN ${onHold}
      ORDER BY id
    `)
    return found.map((row) => row.id)
  }).pipe(Effect.orDie)

  // The entities this process holds are left out as the rows are read, not by the query: a query that listed them
  // would take one parameter each, and fail past SQLite's limit on them. Each page skips at most the loaded ones.
  const due = (now: number, loaded: ReadonlyArray<string>) =>
    Effect.gen(function*() {
      const held = new Set(loaded)
      const ready: Array<string> = []
      let after = ''
      while (ready.length < batch) {
        const page = yield* rows('entity_keys', Rows.id)(sql`
          SELECT DISTINCT id FROM entity_keys
          WHERE name = ${name} AND due IS NOT NULL AND due <= ${now}
            AND id > ${after} AND id NOT IN ${onHold}
          ORDER BY id LIMIT ${batch}
        `)
        for (const { id } of page) if (!held.has(id) && ready.length < batch) ready.push(id)
        if (page.length < batch) break
        after = page[page.length - 1]?.id ?? after
      }
      // The earliest time of an entity this process does not hold, read in the order of the times.
      let next: number | null = null
      let from: Readonly<{ at: number; id: string }> | null = null
      while (next === null) {
        const page: ReadonlyArray<{ id: string; at: number }> = yield* rows('entity_keys', Rows.due)(sql`
          SELECT id, MIN(due) AS at FROM entity_keys
          WHERE name = ${name} AND due > ${now} AND id NOT IN ${onHold}
          GROUP BY id
          ${from === null ? sql`` : sql`HAVING MIN(due) > ${from.at} OR (MIN(due) = ${from.at} AND id > ${from.id})`}
          ORDER BY at, id LIMIT ${batch}
        `)
        next = page.find((row) => !held.has(row.id))?.at ?? null
        const last = page[page.length - 1]
        if (page.length < batch || last === undefined) break
        from = last
      }
      return { ready, next } satisfies Due
    }).pipe(Effect.orDie)

  const indexed = Effect.gen(function*() {
    for (const index of Object.keys(program.indexes)) {
      // The id follows the value, so that the rows that tie are in the order of their id and a page reads them past
      // its cursor as a range. A database of SQLite made before holds the index without the id under the old name,
      // which goes (decision 0145). PostgreSQL takes an expression of an index in parentheses, and cuts a name past
      // 63 bytes, so the storage cuts a longer name itself, and ends it with a hash of the whole (decision 0157).
      if (dialect === 'pg') {
        const on = `projections (name, ${expressionsOf(index).join(', ')}, id)`
        const named = quoted(indexName(`projections ${name} ${index} by id`))
        yield* sql.unsafe(`CREATE INDEX IF NOT EXISTS ${named} ON ${on}`)
        continue
      }
      yield* sql.unsafe(`DROP INDEX IF EXISTS ${quoted(`projections ${name} ${index}`)}`)
      const on = `projections (name, ${expressionsOf(index)[0]}, id)`
      yield* sql.unsafe(`CREATE INDEX IF NOT EXISTS ${quoted(`projections ${name} ${index} by id`)} ON ${on}`)
    }
  }).pipe(Effect.orDie)

  /**
   * A value as a query compares an index with it. On SQLite a boolean is stored as JSON's, which `json_extract`
   * gives as 1 or 0. On PostgreSQL the value is the row of its kind, its number and its string, as the expressions of
   * an index read a row of it. A number is bound by the digits a row of it holds: the exact digits of an integer
   * beyond 2^53 (decisions 0146, 0157).
   */
  const bound = (value: Exclude<Scalar, null>): Statement.Fragment => {
    if (dialect === 'sqlite') return sql`${typeof value === 'boolean' ? (value ? 1 : 0) : value}`
    const none = sql.literal(`CAST('' AS TEXT) COLLATE "C"`)
    if (typeof value === 'string') return sql`(2, CAST(0 AS NUMERIC), CAST(${value} AS TEXT) COLLATE "C")`
    if (typeof value === 'boolean') return sql`(1, CAST(${value ? 1 : 0} AS NUMERIC), ${none})`
    const digits = Number.isInteger(value) && !Number.isSafeInteger(value) ? BigInt(value).toString() : String(value)
    return sql`(1, CAST(${digits} AS NUMERIC), ${none})`
  }

  /**
   * An index compared with a value. As in SQL, an index that holds no value holds of no comparison, which the
   * kind says on PostgreSQL, where the row of a null compares as any other.
   */
  const compared = (index: string, is: Comparison, value: Exclude<Scalar, null>) =>
    dialect === 'pg'
      ? sql`${kindOf(index)} <> 0 AND ${columnOf(index)} ${sql.literal(is)} ${bound(value)}`
      : sql`${columnOf(index)} ${sql.literal(is)} ${bound(value)}`

  /** Whether an index holds no value, as the expressions of each dialect give it. */
  const isNull = (index: string) => dialect === 'pg' ? sql`${kindOf(index)} = 0` : sql`${columnOf(index)} IS NULL`
  const isNotNull = (index: string) =>
    dialect === 'pg' ? sql`${kindOf(index)} <> 0` : sql`${columnOf(index)} IS NOT NULL`

  /** The order of an index, each of its expressions in `direction`. */
  const orderOf = (index: string, direction: 'ASC' | 'DESC') =>
    sql.literal(expressionsOf(index).map((expression) => `${expression} ${direction}`).join(', '))

  /** The clauses every row holds, and no row holds, written alike in both dialects. */
  const always = sql`1 = 1`
  const never = sql`1 = 0`

  /**
   * Checks `after`, and gives its value for the index ordered by, or null without an order. A row that holds no id,
   * or no scalar of that index, is the caller's defect (decision 0143).
   */
  const cursorOf = (after: After<T>, index: string | undefined) => {
    if (typeof after !== 'object' || after === null) {
      throw new InvariantDefect({ reason: `the row after is ${String(after)}, which is no row` })
    }
    if (typeof after.id !== 'string') {
      throw new InvariantDefect({ reason: `the id after is ${String(after.id)}, which is no string` })
    }
    if (index === undefined) return null
    const value: unknown = (after.indexes as Readonly<Record<string, unknown>> | undefined)?.[index]
    if (
      !(value === null || typeof value === 'string' || typeof value === 'boolean'
        || (typeof value === 'number' && Number.isFinite(value)))
    ) {
      const shown = typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)
      throw new InvariantDefect({ reason: `the index '${index}' after is ${shown}, which is no scalar` })
    }
    return value
  }

  /**
   * The parts of the order past `after`, each a clause and the order SQLite reads it in as a range of the index, in
   * the order of the query: the rows that tie with `after` past its id, then the rows past its value, then, in a
   * descending order, the rows that hold no value, which come last there (decision 0145).
   */
  const parts = (after: After<T> | undefined, order: Query<T>['order']) => {
    const descending = order?.descending === true
    const direction = sql.literal(descending ? 'DESC' : 'ASC')
    if (order === undefined) {
      const by = sql`id ASC`
      if (after === undefined) return [{ clause: always, by }]
      cursorOf(after, undefined)
      return [{ clause: sql`id > ${after.id}`, by }]
    }
    const ordered = sql`${orderOf(order.index, descending ? 'DESC' : 'ASC')}, id ${direction}`
    if (after === undefined) return [{ clause: always, by: ordered }]
    const value = cursorOf(after, order.index)
    const id = sql`id ${sql.literal(descending ? '<' : '>')} ${after.id}`
    // The rows that tie hold one value, so the order of the index is their order by id. PostgreSQL does not know
    // that the expressions of a value are the same for each of them, and sorts rows ordered by the id alone
    // (decision 0157).
    const byId = dialect === 'pg' ? ordered : sql`id ${direction}`
    if (value === null) {
      const tied = { clause: sql`${isNull(order.index)} AND ${id}`, by: byId }
      // On SQLite every value an index stores but null is greater than -Infinity, which no stored value is, since
      // the indexes are written by `JSON.stringify`: so the rows past the nulls are a range, where `IS NOT NULL` is
      // not. On PostgreSQL the kind of every value but null is past 0 (decision 0157).
      const past = dialect === 'pg'
        ? sql`${kindOf(order.index)} > 0`
        : sql`${columnOf(order.index)} > ${-Infinity}`
      return descending ? [tied] : [tied, { clause: past, by: ordered }]
    }
    const tied = { clause: sql`${compared(order.index, '=', value)} AND ${id}`, by: byId }
    const later = { clause: compared(order.index, descending ? '<' : '>', value), by: ordered }
    return descending ? [tied, later, { clause: isNull(order.index), by: byId }] : [tied, later]
  }

  /** The clauses of the rows of the program that match `where`, as a query, a count and a sum read them. */
  const criteria = (where: ReadonlyArray<Criterion<T>>) => {
    const clauses = [sql`name = ${name}`]
    for (const { index, is, value } of where) {
      if (!comparisons.includes(is)) throw new Error(`'${is}' is no comparison`)
      clauses.push(
        // Nothing but `=` and `<>` says anything of an index that holds no value, as in SQL, where a
        // comparison with null is null: `never` is the clause no row holds.
        value === null
          ? is === '=' ? isNull(index) : is === '<>' ? isNotNull(index) : never
          : compared(index, is, value),
      )
    }
    return clauses
  }

  const query = ({ after, limit, order, where = [] }: Query<T>) =>
    Effect.gen(function*() {
      const clauses = criteria(where)
      const read = parts(after, order)
      const page = (clause: Statement.Fragment, by: Statement.Fragment, left: number) =>
        rows('projections', Rows.projection)(sql`
          SELECT id, projection, indexes, version FROM projections
          WHERE ${sql.and([...clauses, clause])} ORDER BY ${by} LIMIT ${left}
        `)
      // The parts are read in one transaction, so that a step between two of them moves no row into the page twice
      // (decision 0145).
      // At PostgreSQL's default level each statement reads a snapshot of its own, so the transaction begins at
      // `REPEATABLE READ`, whose statements read its first (decision 0157). The level is read where the transaction
      // is the outermost: inside a transaction the caller left open, the page reads at the caller's level
      // (decision 0158).
      const found = yield* sql.withTransaction(Effect.gen(function*() {
        const found: Array<Effect.Success<ReturnType<typeof page>>[number]> = []
        for (const { clause, by } of read) {
          if (found.length >= limit) break
          found.push(...yield* page(clause, by, limit - found.length))
        }
        return found
      })).pipe(
        dialect === 'pg'
          ? Effect.provideService(SqlClient.BeginTransaction, 'BEGIN ISOLATION LEVEL REPEATABLE READ')
          : (self) => self,
      )
      // A row the version before wrote is read through its migrations; `reindex` is what writes it again.
      return found.map((held): Found<T> => ({
        id: held.id,
        projection: projection.read(held.projection, up('projection', held.version)),
        indexes: storedIndexes(held.indexes),
      }))
    }).pipe(Effect.orDie)

  const count = ({ where = [] }: Counted<T>) =>
    Effect.gen(function*() {
      const [counted] = yield* rows('projections', Rows.count)(
        sql`SELECT COUNT(*) AS count FROM projections WHERE ${sql.and(criteria(where))}`,
      )
      return counted?.count ?? 0
    }).pipe(Effect.orDie)

  /** The kind of an index's value on SQLite, NULL where the row lacks the index. */
  const kind = (index: string) => sql.literal(`json_type(indexes, ${pathOf(index)})`)
  /** The jsonb value of an index on PostgreSQL, and its type, NULL where the row lacks the index. */
  const value = (index: string) => {
    pathOf(index)
    return sql.literal(valueOf(index))
  }
  const typed = (index: string) => sql.literal(`jsonb_typeof(${valueOf(index)})`)
  /** Whether an index holds a boolean on PostgreSQL: false where the row lacks the index, as for JSON's null. */
  const boolean = (index: string) => sql`coalesce(${typed(index)} = 'boolean', FALSE)`

  const sum = ({ index, where = [] }: Summed<T>) =>
    Effect.gen(function*() {
      // On SQLite `json_type` tells `true` from `1`, which `json_extract` gives alike, and is NULL where the row
      // lacks the index. `TOTAL` gives a double and never fails on an overflow of SQLite's integers, where `SUM` does
      // (decision 0148). On PostgreSQL each number is added as a double, so the total is a double too
      // (decision 0157).
      const [summed] = yield* rows('projections', Rows.total)(
        dialect === 'pg'
          ? sql`
            SELECT COALESCE(SUM(CASE WHEN ${typed(index)} = 'number' THEN CAST(${value(index)} AS DOUBLE PRECISION) END),
                     0) AS total,
                   MIN(CASE WHEN ${typed(index)} NOT IN ('number', 'null') THEN id END) AS refused
            FROM projections WHERE ${sql.and(criteria(where))}
          `
          : sql`
            SELECT TOTAL(CASE WHEN ${kind(index)} IN ('integer', 'real') THEN ${columnOf(index)} END) AS total,
                   MIN(CASE WHEN ${kind(index)} NOT IN ('integer', 'real', 'null') THEN id END) AS refused
            FROM projections WHERE ${sql.and(criteria(where))}
          `,
      )
      if (summed === undefined) return 0
      if (summed.refused !== null) {
        return yield* Effect.die(
          new InvariantDefect({ reason: `the index '${index}' of '${summed.refused}' holds no number, and is no sum's` }),
        )
      }
      return summed.total
    }).pipe(Effect.orDie)

  /** On SQLite, the kind of an index's value, `null` where the row lacks it, and the value as its JSON text. */
  const grouped = (index: string) => sql.literal(`coalesce(json_type(indexes, ${pathOf(index)}), 'null')`)
  const text = (index: string) => sql.literal(`coalesce(indexes -> ${pathOf(index)}, 'null')`)

  const countBy = ({ index, where = [], limit }: CountedBy<T>) =>
    Effect.gen(function*() {
      // `json_extract` gives `true` as `1`, so the kind of the value groups too, and JSON's null and a path the row
      // lacks are one kind, as a query reads them. The value is read as its JSON text, which tells `true` from `1`
      // where the column does not. A boolean comes after the number SQLite reads it as (decision 0150). On
      // PostgreSQL the expressions of the index order the values as on SQLite, and jsonb's type tells a boolean from
      // its number (decision 0157).
      const column = columnOf(index)
      const tallies = yield* rows('projections', Rows.tally)(
        dialect === 'pg'
          ? sql`
            SELECT min(CAST(coalesce(${value(index)}, 'null'::jsonb) AS TEXT)) AS value, count(*) AS count
            FROM projections WHERE ${sql.and(criteria(where))}
            GROUP BY ${column}, ${boolean(index)}
            ORDER BY ${orderOf(index, 'ASC')}, ${boolean(index)} LIMIT ${limit}
          `
          : sql`
            SELECT min(${text(index)}) AS value, count(*) AS count FROM projections WHERE ${sql.and(criteria(where))}
            GROUP BY ${column}, ${grouped(index)}
            ORDER BY ${column}, ${grouped(index)} IN ('true', 'false') LIMIT ${limit}
          `,
      )
      return tallies.map(({ value, count }): Tally => ({ value: JSON.parse(value) as Scalar, count }))
    }).pipe(Effect.orDie)

  /**
   * The value of each index of the program in a stored row, as a query reads it: an index the row lacks, one a
   * later version added, is null, as `json_extract` gives it.
   */
  const storedIndexes = (text: string): Found<T>['indexes'] => {
    const stored = JSON.parse(text) as Readonly<Record<string, Scalar>>
    return Object.fromEntries(
      Object.keys(program.indexes).map((index) => [index, Object.hasOwn(stored, index) ? stored[index] : null]),
    ) as Found<T>['indexes']
  }

  const projected = (id: string) =>
    Effect.gen(function*() {
      const found = yield* rows('projections', Rows.projection)(
        sql`SELECT id, projection, indexes, version FROM projections WHERE name = ${name} AND id = ${id}`,
      )
      const held = found[0]
      return held === undefined ? null : projection.read(held.projection, up('projection', held.version))
    }).pipe(Effect.orDie)

  const reindex = Effect.gen(function*() {
    let cursor = ''
    let written = 0
    const failed: Array<Readonly<{ id: string; cause: string }>> = []
    while (true) {
      const page = yield* rows('entities', Rows.state)(sql`
        SELECT id, state, version FROM entities
        WHERE name = ${name} AND id > ${cursor} ORDER BY id LIMIT ${batch}
      `)
      if (page.length === 0) return { written, failed } satisfies Reindexed
      for (const held of page) {
        cursor = held.id
        // What the program computes of the row is caught for each entity, and leaves that entity's row: a state no
        // version reads, a migration or the state's schema that dies on it, or the program's defect in `shownOf`.
        // The others are written (decision 0122). What the runtime throws still fails the whole call (decision
        // 0061): a statement, a text that is no JSON, which only a corrupted row holds, and anything `shownOf`
        // throws that is not the program's.
        const text = JSON.parse(held.state) as Json
        let read: T['state']
        try {
          read = state.decode(up('state', held.version)(text))
        } catch (thrown) {
          failed.push({ id: held.id, cause: Machine.render(thrown) })
          continue
        }
        let shown: Machine.Shown
        try {
          shown = Machine.shownOf(program, read)
        } catch (thrown) {
          failed.push({ id: held.id, cause: Machine.programCause(thrown) })
          continue
        }
        // The row is written only if the state it was computed from is still the one stored, in one statement
        // (decision 0070). A step that committed since wrote its own row, which this would replace with a
        // projection the entity has moved past.
        const rewritten = yield* rows('projections', Rows.id)(sql`
          INSERT INTO projections (name, id, projection, indexes, version)
          SELECT name, id, CAST(${JSON.stringify(shown.projection)} AS TEXT), CAST(${
          indexesText(shown.indexes)
        } AS TEXT), CAST(${version} AS INTEGER)
          FROM entities WHERE name = ${name} AND id = ${held.id} AND state = ${held.state}
            AND version = ${held.version}
          ON CONFLICT (name, id)
          DO UPDATE SET projection = excluded.projection, indexes = excluded.indexes, version = excluded.version
          RETURNING id
        `)
        written += rewritten.length
      }
    }
  }).pipe(Effect.orDie)

  /** The cursors of a list, one per partition: a partition named twice is read from the higher. */
  const cursorsOf = (after: ReadonlyArray<Cursor>) => {
    const cursors = new Map<number, number>()
    for (const { partition, seq } of after) cursors.set(partition, Math.max(seq, cursors.get(partition) ?? 0))
    return cursors
  }

  /** The head of each partition the program has published in, by partition. */
  const heads = Effect.map(
    rows('heads', Rows.cursor)(sql`SELECT partition, seq FROM heads WHERE name = ${name}`),
    (held) => new Map(held.map(({ partition, seq }) => [partition, seq])),
  )

  // The rows are read in the order of `position`, from the first row past a cursor in any partition, and the rows a
  // cursor has passed are left out as they are read. That first row has the lowest `seq` past the cursor in its
  // partition, since `position` rises with `seq` within a partition (decision 0137). So a reader at pace passes over
  // only the rows of the steps that committed out of their order, and each page is a range of an index.
  // A topic's rows have gaps in their `seq`, where a step published only other topics, so a partition whose head is
  // past a cursor may hold no row of the topic past it (decision 0138).
  // A reading of some partitions starts from their first rows, and the statement leaves out the rows of the others.
  // The index of the topic holds no partition, so a reader of a few partitions passes over many rows (decision 0153).
  const published = <Name extends Topic<T>>(
    topic: Name,
    after: ReadonlyArray<Cursor>,
    limit: number,
    partitions?: ReadonlyArray<number>,
  ) =>
    Effect.gen(function*() {
      const select = topics.get(topic)
      if (select === undefined) throw new Error(`'${topic}' is no topic of the program '${name}'`)
      const cursors = cursorsOf(after)
      const read = partitions === undefined ? undefined : new Set(partitions)
      const behind: Array<readonly [number, number]> = []
      for (const [partition, head] of yield* heads) {
        if (read !== undefined && !read.has(partition)) continue
        const cursor = cursors.get(partition) ?? 0
        if (head > cursor) behind.push([partition, cursor])
      }
      if (behind.length === 0 || limit === 0) return []
      // The partitions behind are given as one JSON array, which each dialect reads as rows (decision 0157).
      const each = dialect === 'pg'
        ? sql`(
          SELECT CAST(value ->> 0 AS INTEGER) AS partition, CAST(value ->> 1 AS BIGINT) AS seq
          FROM jsonb_array_elements(CAST(${JSON.stringify(behind)} AS JSONB))
        )`
        : sql`(
          SELECT json_extract(value, '$[0]') AS partition, json_extract(value, '$[1]') AS seq
          FROM json_each(${JSON.stringify(behind)})
        )`
      const first = yield* rows('outbox', Rows.position)(sql`
        SELECT min((
          SELECT position FROM outbox
          WHERE name = ${name} AND topic = ${topic} AND partition = behind.partition AND seq > behind.seq
          ORDER BY seq LIMIT 1
        )) AS position
        FROM ${each} AS behind
      `)
      let from = first[0]?.position ?? null
      const given: Array<Published<T, Name>> = []
      const within = read === undefined
        ? sql``
        : dialect === 'pg'
        ? sql`AND outbox.partition IN (
          SELECT CAST(value AS INTEGER) FROM jsonb_array_elements_text(CAST(${JSON.stringify([...read])} AS JSONB))
        )`
        : sql`AND outbox.partition IN (SELECT value FROM json_each(${JSON.stringify([...read])}))`
      while (from !== null && given.length < limit) {
        // Each row finds its step's publication by the key of `publications` (decision 0154).
        const page = yield* rows('outbox', Rows.published)(sql`
          SELECT outbox.position AS position, outbox.partition AS partition, outbox.seq AS seq, publications.id AS id,
            publications.tag AS tag, publications.version AS version, publications.message AS message,
            publications.projection AS projection
          FROM outbox
          JOIN publications ON publications.name = outbox.name AND publications.partition = outbox.partition
            AND publications.seq = outbox.seq
          WHERE outbox.name = ${name} AND outbox.topic = ${topic} AND outbox.position >= ${from} ${within}
          ORDER BY outbox.position LIMIT ${batch}
        `)
        for (const row of page) {
          if (row.seq <= (cursors.get(row.partition) ?? 0)) continue
          // The selector of the program deployed, on the row at the program's version: one that dies gives the
          // defect to the reader, as the schema does (decisions 0121, 0140).
          const shown = projection.read(row.projection, up('projection', row.version))
          given.push({
            partition: row.partition,
            seq: row.seq,
            id: row.id,
            topic,
            kind: row.tag,
            message: row.tag === 'Creation'
              ? null
              : row.tag === 'Inbound'
              ? inbound.read(row.message, up('inbound', row.version))
              : internal.read(row.message, up('internal', row.version)),
            value: (select === null ? shown : select(shown)) as Value<T, Name>,
          })
          if (given.length === limit) break
        }
        const last = page[page.length - 1]
        from = page.length < batch || last === undefined ? null : last.position + 1
      }
      return given
    }).pipe(Effect.orDie)

  const declare = (consumers: ReadonlyArray<Readonly<{ topic: string; consumer: string }>>) =>
    sql.withTransaction(Effect.forEach(consumers, ({ topic, consumer }) =>
      sql`
        INSERT INTO consumers ${sql.insert({ name, topic, consumer })} ON CONFLICT (name, topic, consumer) DO NOTHING
      `, { discard: true })).pipe(Effect.orDie)

  const feed = <Name extends Topic<T>>(
    topic: Name,
    consumer: string,
    limit: number,
    partitions?: ReadonlyArray<number>,
  ) =>
    Effect.gen(function*() {
      const cursors = yield* rows('cursors', Rows.cursor)(sql`
        SELECT partition, seq FROM cursors WHERE name = ${name} AND topic = ${topic} AND consumer = ${consumer}
      `)
      return yield* published(topic, cursors, limit, partitions)
    }).pipe(Effect.orDie)

  // A cursor goes no further than the head of its partition: one past it would have the rows written after it
  // dropped by a prune before its consumer read them. A head is never deleted, so it holds the last `seq` given
  // though a prune dropped its row, and a partition with no head yet has nothing to ack (decision 0137).
  const ack = (topic: Topic<T>, consumer: string, through: ReadonlyArray<Cursor>) =>
    sql.withTransaction(Effect.gen(function*() {
      const held = yield* heads
      for (const [partition, seq] of cursorsOf(through)) {
        const capped = Math.min(seq, held.get(partition) ?? 0)
        if (capped === 0) continue
        yield* sql`
          INSERT INTO cursors ${sql.insert({ name, topic, consumer, partition, seq: capped })}
          ON CONFLICT (name, topic, consumer, partition)
          DO UPDATE SET seq = CASE WHEN cursors.seq > excluded.seq THEN cursors.seq ELSE excluded.seq END
        `
      }
    })).pipe(Effect.orDie)

  // Each partition of a topic is dropped through the lowest cursor of the topic's consumers in it, and only where
  // every consumer of the topic has a cursor there, since one with none holds the partition from `0` (decision 0137).
  // A topic no consumer is stored for is dropped whole: every consumer is declared and stored at deploy, so no
  // reader that keeps cursors needs its rows (decision 0152). The consumers and cursors are read and the rows
  // dropped in one statement, since the two are one decision (decision 0039). A consumer is stored only by a deploy,
  // before its handle exists, so none is stored in the middle of a prune (decision 0152). The trigger of the outbox
  // drops each publication with the last row that names it, in the statement that drops the row. The transaction
  // is a guard: it commits the rows and the publications together even if a trigger ran outside the statement that
  // fired it (decision 0154).
  const prune = sql.withTransaction(Effect.gen(function*() {
    const gone = yield* rows('outbox', Rows.seq)(sql`
      WITH floors AS (
        SELECT topic, partition, min(seq) AS through FROM cursors WHERE name = ${name}
        GROUP BY topic, partition
        HAVING count(*) = (
          SELECT count(*) FROM consumers WHERE consumers.name = ${name} AND consumers.topic = cursors.topic
        )
      )
      DELETE FROM outbox
      WHERE name = ${name} AND (
        NOT EXISTS (SELECT 1 FROM consumers WHERE consumers.name = ${name} AND consumers.topic = outbox.topic)
        OR seq <= (
          SELECT through FROM floors WHERE floors.topic = outbox.topic AND floors.partition = outbox.partition
        )
      )
      RETURNING seq
    `)
    return gone.length
  })).pipe(Effect.orDie)

  const consumers = Effect.gen(function*() {
    const stored = yield* rows('consumers', Rows.topical)(
      sql`SELECT topic, consumer FROM consumers WHERE name = ${name} ORDER BY topic, consumer`,
    )
    const behind = yield* rows('cursors', Rows.behind)(sql`
      SELECT consumers.topic AS topic, consumers.consumer AS consumer, outbox.partition AS partition,
        coalesce(cursors.seq, 0) AS seq, count(*) AS behind
      FROM consumers
      JOIN outbox ON outbox.name = consumers.name AND outbox.topic = consumers.topic
      LEFT JOIN cursors ON cursors.name = consumers.name AND cursors.topic = consumers.topic
        AND cursors.consumer = consumers.consumer AND cursors.partition = outbox.partition
      WHERE consumers.name = ${name} AND outbox.seq > coalesce(cursors.seq, 0)
      GROUP BY consumers.topic, consumers.consumer, outbox.partition, cursors.seq
      ORDER BY consumers.topic, consumers.consumer, outbox.partition
    `)
    return stored.map(({ topic, consumer }): Omit<Consumer, 'declared'> => {
      const own = behind.filter((row) => row.topic === topic && row.consumer === consumer)
      return {
        topic,
        consumer,
        behind: own.reduce((sum, row) => sum + row.behind, 0),
        cursors: own.map(({ partition, seq }) => ({ partition, seq })),
      }
    })
  }).pipe(Effect.orDie)

  const forget = (topic: Topic<T>, consumer: string) =>
    sql.withTransaction(Effect.andThen(
      sql`DELETE FROM cursors WHERE name = ${name} AND topic = ${topic} AND consumer = ${consumer}`,
      sql`DELETE FROM consumers WHERE name = ${name} AND topic = ${topic} AND consumer = ${consumer}`,
    )).pipe(Effect.asVoid, Effect.orDie)

  // The tag of the mailbox's first message says what a `Message` the entity died on is: an inbound one is
  // discarded, an internal one is not (decisions 0041, 0044, 0114).
  const suspensions = Effect.gen(function*() {
    const held = yield* rows('entities', Rows.suspended)(sql`
      SELECT id, suspended_on, suspended_cause, suspended_at, (
        SELECT tag FROM mailbox WHERE mailbox.name = entities.name AND mailbox.id = entities.id ORDER BY seq LIMIT 1
      ) AS head
      FROM entities WHERE name = ${name} AND suspended_on IS NOT NULL ORDER BY suspended_at, id
    `)
    const listed: Array<Suspension> = []
    for (const row of held) {
      const on = suspended.read(row.suspended_on)
      if (on._tag === 'Message' && row.head === null) {
        return yield* Effect.die(
          new Error(`the entity '${name}' '${row.id}' is suspended on a message, and its mailbox is empty`),
        )
      }
      listed.push({
        id: row.id,
        on: on._tag === 'Message' ? { _tag: 'Message', kind: row.head ?? 'Inbound' } : on,
        cause: row.suspended_cause,
        since: DateTime.makeUnsafe(row.suspended_at),
      })
    }
    return listed
  }).pipe(Effect.orDie)

  return {
    load,
    reply,
    write,
    interrupted,
    due,
    indexed,
    query,
    count,
    sum,
    countBy,
    projected,
    reindex,
    published,
    declare,
    feed,
    ack,
    prune,
    consumers,
    forget,
    expire,
    suspended: suspensions,
  }
}
