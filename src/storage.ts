/**
 * What a runtime writes: a `Stored<T>` in one SQLite database, through `SqlClient` (decisions 0007, 0019). The
 * machine says what is stored; this module says in which tables, and encodes it with the program's schemas
 * (decisions 0025, 0027). Every row carries the version of the program that wrote it, and is read by migrating
 * its JSON to the program's version (decision 0036). Nothing here decides anything: the machine encodes what an
 * event writes, and a caller writes it in one transaction (decision 0057).
 */
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import type * as Scope from 'effect/Scope'
import { SqlClient } from 'effect/sql'
import * as Machine from './machine.ts'
import {
  type Durable,
  InvariantDefect,
  type Json,
  type Migrated,
  migrationOf,
  type Program,
  type Request,
  type Scalar,
  timer,
  type Types,
  versionOf,
} from './program.ts'

/** The clients a runtime of this process holds: another runtime on one of them is refused (decision 0080). */
const held = new WeakSet<SqlClient.SqlClient>()

/**
 * Holds the database for one runtime until the scope ends (decision 0080). The client is held in this process,
 * claimed in one synchronous step. The file is held by SQLite's exclusive locking mode: a write takes it only
 * while no other connection has the file open, it keeps every other from opening it, and the end of the process
 * gives it back, however it ends. A database another runtime holds, or another connection has open, is the
 * launcher's defect.
 */
export const hold: Effect.Effect<void, never, SqlClient.SqlClient | Scope.Scope> = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
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
 * The tables, created once for the database. Every entity of every program sits in them: the name of the program
 * and the id are the entity's address (decision 0022).
 */
export const createTables: Effect.Effect<void, never, SqlClient.SqlClient> = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  // The state, the request that created the entity and the suspension: one row per entity. `suspended_at` is the
  // time the entity suspended, kept while it stays suspended, which an operator reads (decision 0114).
  // `incarnations` is the last incarnation the entity drew, which never goes back (decision 0132).
  yield* sql`
    CREATE TABLE IF NOT EXISTS entities (
      name TEXT NOT NULL,
      id TEXT NOT NULL,
      state TEXT NOT NULL,
      version INTEGER NOT NULL,
      creation TEXT NOT NULL,
      incarnations INTEGER NOT NULL,
      suspended_on TEXT,
      suspended_cause TEXT,
      suspended_at INTEGER,
      PRIMARY KEY (name, id)
    )
  `
  // One row per key the state holds work under, with its incarnation. A key whose work is gone has no row, since
  // the entity's counter keeps its incarnations from going back (decision 0132). `due` is a timer's time, by which
  // an entity nothing else holds loaded is woken (decision 0029).
  yield* sql`
    CREATE TABLE IF NOT EXISTS entity_keys (
      name TEXT NOT NULL,
      id TEXT NOT NULL,
      key TEXT NOT NULL,
      incarnation INTEGER NOT NULL,
      version INTEGER NOT NULL,
      work TEXT NOT NULL,
      delivery TEXT,
      due INTEGER,
      PRIMARY KEY (name, id, key)
    )
  `
  yield* sql`CREATE INDEX IF NOT EXISTS entity_keys_due ON entity_keys (due)`
  // The mailbox, in order: `seq` is given as a message is queued, and the first message is the lowest. `keep` is
  // how long a caller's reply is kept once its message is answered, null for ever (decision 0125).
  yield* sql`
    CREATE TABLE IF NOT EXISTS mailbox (
      name TEXT NOT NULL,
      id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      tag TEXT NOT NULL,
      version INTEGER NOT NULL,
      message TEXT NOT NULL,
      request TEXT,
      keep INTEGER,
      key TEXT,
      incarnation INTEGER,
      PRIMARY KEY (name, id, seq)
    )
  `
  // What callers read of each entity, and the values of the program's indexes on it: the read model of a
  // query across entities, written in the step's transaction (decision 0032).
  yield* sql`
    CREATE TABLE IF NOT EXISTS projections (
      name TEXT NOT NULL,
      id TEXT NOT NULL,
      projection TEXT NOT NULL,
      indexes TEXT NOT NULL,
      version INTEGER NOT NULL,
      PRIMARY KEY (name, id)
    )
  `
  // What other systems learn of the entities: one row per step that changed what callers read, written in the
  // step's own transaction. `seq` rises with each row and is never reused, and is what a consumer reads from
  // and deduplicates by (decision 0038).
  yield* sql`
    CREATE TABLE IF NOT EXISTS outbox (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      id TEXT NOT NULL,
      tag TEXT NOT NULL,
      version INTEGER NOT NULL,
      message TEXT,
      projection TEXT NOT NULL
    )
  `
  yield* sql`CREATE INDEX IF NOT EXISTS outbox_name ON outbox (name, seq)`
  // Where each consumer of the outbox has read to: a consumer stores a cursor by name, and what every one of
  // them has read is what a prune drops (decision 0039).
  yield* sql`
    CREATE TABLE IF NOT EXISTS cursors (
      name TEXT NOT NULL,
      consumer TEXT NOT NULL,
      seq INTEGER NOT NULL,
      PRIMARY KEY (name, consumer)
    )
  `
  // The replies, by request: a retry gets the one stored (decision 0015). The request is its JSON as the machine
  // keys it, read through its schema (decision 0059). A row is keyed by the version that wrote it too, since a
  // migration may give one caller's request the text another's had: two versions never share a row
  // (decision 0069). A reply to another entity's operation holds the work that asked, its program, id, key and
  // incarnation, and is deleted once that work no longer holds (decision 0021). A caller's reply with an `until`
  // is read before that time only (decision 0125).
  yield* sql`
    CREATE TABLE IF NOT EXISTS replies (
      name TEXT NOT NULL,
      id TEXT NOT NULL,
      request TEXT NOT NULL,
      tag TEXT NOT NULL,
      version INTEGER NOT NULL,
      reason TEXT,
      until INTEGER,
      sender_name TEXT,
      sender_id TEXT,
      sender_key TEXT,
      sender_incarnation INTEGER,
      PRIMARY KEY (name, id, request, version)
    )
  `
  yield* sql`CREATE INDEX IF NOT EXISTS replies_sender ON replies (sender_name, sender_id)`
  yield* sql`CREATE INDEX IF NOT EXISTS replies_until ON replies (name, until) WHERE until IS NOT NULL`
  // A caller's request a version before stored is found by its request id: its sender may be migrated since
  // (decision 0065).
  yield* sql`CREATE INDEX IF NOT EXISTS replies_request_id ON replies (name, id, json_extract(request, '$.id'))`
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
  Schema.TaggedStruct('Operation', { key: Schema.String, incarnation: Schema.Int }),
  Schema.TaggedStruct('Activation', {}),
]) as unknown as Schema.Codec<Machine.Suspension['on'], Json>

/** The version of the program that wrote a row: the first is 1 (decision 0036). */
const Version = Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1)))

/** An incarnation, a `seq` or a count, as SQLite gives an integer. */
const Count = Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)))

/** How an operation is delivered, as its runner declared (decisions 0011, 0123). */
const Delivery = Schema.Literals(['Idempotent', 'IdempotentDigest', 'AtLeastOnce', 'AtMostOnce', 'Droppable'])

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
      state: Schema.String,
      version: Version,
      creation: Schema.String,
      incarnations: Count,
      suspended_on: Schema.Null,
      suspended_cause: Schema.Null,
    }),
    Schema.Struct({
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
      incarnation: Schema.Null,
    }),
    Schema.Struct({
      tag: Schema.Literal('Internal'),
      version: Version,
      message: Schema.String,
      request: Schema.Null,
      keep: Schema.Null,
      key: Schema.String,
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
  projection: decoder(Schema.Struct({ id: Schema.String, projection: Schema.String, version: Version })),
  state: decoder(Schema.Struct({ id: Schema.String, state: Schema.String, version: Version })),
  /** A creation's row handles no message, and a step's always one (decision 0038). */
  published: decoder(Schema.Union([
    Schema.Struct({
      seq: Count,
      id: Schema.String,
      tag: Schema.Literal('Creation'),
      version: Version,
      message: Schema.Null,
      projection: Schema.String,
    }),
    Schema.Struct({
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
  /** An aggregate over no rows is null. */
  last: decoder(Schema.Struct({ seq: Schema.NullOr(Count) })),
  through: decoder(Schema.Struct({ through: Schema.NullOr(Count) })),
  consumer: decoder(Schema.Struct({ consumer: Schema.String, seq: Count, behind: Count })),
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
  /** The index they are ordered by, ascending unless `descending`. Entities whose index is null come first. */
  order?: Readonly<{ index: T['index']; descending?: boolean }>
  /** How many at most, in that order; all of them when it is left out. */
  limit?: number
}>

/** An entity a query found, as a caller reads it. */
export type Found<T extends Types> = Readonly<{ id: string; projection: T['projection'] }>

/**
 * What a `reindex` did: how many rows it wrote, and the entities whose row it could not compute, each with the
 * cause, rendered as a suspension's is. The row of such an entity is left as it was (decision 0122).
 */
export type Reindexed = Readonly<{
  written: number
  failed: ReadonlyArray<Readonly<{ id: string; cause: string }>>
}>

/** What a step published: the message it handled, and what callers read of the entity after it (decision 0038). */
export type Published<T extends Types> = Readonly<{
  /** Rises with each row of the database, and is never reused: what a consumer acks, and deduplicates by. */
  seq: number
  id: string
  /** Where the message came from, or `Creation` for the row an entity's creation writes, which has none. */
  kind: 'Inbound' | 'Internal' | 'Creation'
  message: T['inbound'] | T['internal'] | null
  projection: T['projection']
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
    | Readonly<{ _tag: 'Operation'; key: string; incarnation: number }>
    | Readonly<{ _tag: 'Activation' }>
  cause: string
  since: DateTime.Utc
}>

/** A consumer of the outbox, as an operator sees it: where it has read to, and what is waiting (decision 0039). */
export type Consumer = Readonly<{
  consumer: string
  /** The `seq` it acked, `0` for one that has read and acked nothing yet. */
  seq: number
  /** How many rows are past its cursor: what it costs the log to keep it. */
  behind: number
}>

/** An identifier SQLite reads as written: a program's name is the author's, and is quoted, not escaped away. */
const quoted = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`

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
   * where the event suspends it (decision 0114).
   */
  readonly write: (id: string, written: Machine.Written, at: number) => Effect.Effect<void>
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
  /** `Handle.read`, as the storage keeps it: the projection of the entity's row, or null for none (decision 0121). */
  readonly projected: (id: string) => Effect.Effect<T['projection'] | null>
  /**
   * `Handle.reindex`, as the storage keeps it. Each row is its own write, so a crash leaves the rest to the next
   * run. It gives how many were written, and the entities whose row the program could not compute, which keep
   * theirs (decision 0122). A row is written only if the state it was computed from is still the one stored: an
   * entity that took a step since wrote its own (decision 0070).
   */
  readonly reindex: Effect.Effect<Reindexed>
  /** `Handle.published`, as the storage keeps it: the rows from `after` on, in the order they were written. */
  readonly published: (after: number, limit?: number) => Effect.Effect<ReadonlyArray<Published<T>>>
  /**
   * `Handle.feed`, as the storage keeps it. The consumer's first reading stores its cursor at `0`, and from then
   * on the consumer holds the log, acked or not, until it is forgotten (decision 0039).
   */
  readonly feed: (consumer: string, limit?: number) => Effect.Effect<ReadonlyArray<Published<T>>>
  /** `Handle.ack`, as the storage keeps it: the last `seq` written is read first, and caps the cursor stored. */
  readonly ack: (consumer: string, through: number) => Effect.Effect<void>
  /** `Handle.prune`, as the storage keeps it: the cursors are read and the rows dropped in one transaction. */
  readonly prune: Effect.Effect<number>
  /** Every consumer that has stored a cursor, with how many rows are past it, by name. */
  readonly consumers: Effect.Effect<ReadonlyArray<Consumer>>
  /** Drops a consumer's cursor, so that the next prune passes what it never read (decision 0039). */
  readonly forget: (consumer: string) => Effect.Effect<void>
  /** `Handle.expire`: deletes the callers' replies past their time at `at`, in milliseconds, and counts them. */
  readonly expire: (at: number) => Effect.Effect<number>
  /** The suspended entities of the program, the longest suspended first (decision 0114). */
  readonly suspended: Effect.Effect<ReadonlyArray<Suspension>>
}

/** The storage of one program's entities, on one client, with its schemas read once. */
export const storage = <T extends Types>(program: Program<T>, sql: SqlClient.SqlClient): Storage<T> => {
  const state = json(program.schemas.state)
  const inbound = json(program.schemas.inbound)
  const internal = json(program.schemas.internal)
  const request = json(Machine.requestCodec(program))
  const work = json(workOf(program))
  const reason = json(reasonOf(program.schemas.rejection))
  const suspended = json(Suspended)
  const projection = json(program.schemas.projection)
  const { name } = program
  const version = versionOf(program)

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
   * The expression that reads an index out of the row, written once. The index created and the query must share
   * it, since SQLite uses an index of an expression only where the query writes the expression the same way. A
   * program's indexes are words, which its check made sure of where it entered (decision 0054).
   */
  const expression = (index: string) => {
    if (!Object.hasOwn(program.indexes, index)) {
      throw new Error(`'${index}' is no index of the program '${name}'`)
    }
    return `json_extract(indexes, '$.${index}')`
  }

  const columnOf = (index: string) => sql.literal(expression(index))

  /** The row a query reads, as the machine computed it from a state (decision 0032). */
  const row = (id: string, shown: Machine.Shown) =>
    sql`INSERT OR REPLACE INTO projections ${
      sql.insert({
        name,
        id,
        projection: JSON.stringify(shown.projection),
        indexes: JSON.stringify(shown.indexes),
        version,
      })
    }`

  const readWork = (text: string, from: number): Durable<T['operation'], T['internal']> => {
    const held = work.read(text, upWork(from))
    return held._tag === 'Timer' ? timer(held.at, held.message) : held.operation
  }

  const load = (id: string) =>
    Effect.gen(function*() {
      const entities = yield* rows('entities', Rows.entity)(
        sql`SELECT state, version, creation, incarnations, suspended_on, suspended_cause
            FROM entities WHERE name = ${name} AND id = ${id}`,
      )
      const row = entities[0]
      if (row === undefined) return null
      const held = yield* rows('entity_keys', Rows.key)(
        sql`SELECT key, incarnation, version, work, delivery FROM entity_keys WHERE name = ${name} AND id = ${id}`,
      )
      const queued = yield* rows('mailbox', Rows.envelope)(
        sql`SELECT tag, version, message, request, keep, key, incarnation FROM mailbox
            WHERE name = ${name} AND id = ${id} ORDER BY seq`,
      )
      const keys: Record<string, Machine.Key<T>> = {}
      for (const key of held) {
        keys[key.key] = {
          incarnation: key.incarnation,
          work: readWork(key.work, key.version),
          ...(key.delivery === null ? {} : { delivery: key.delivery }),
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
            key: envelope.key,
            incarnation: envelope.incarnation,
            message: internal.read(envelope.message, up('internal', envelope.version)),
          }
      )
      return {
        name,
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
          WHERE name = ${name} AND id = ${id} AND json_extract(request, '$.id') = ${asked.id}
            AND version <> ${version} AND json_extract(request, '$._tag') = 'Caller'
            AND (until IS NULL OR until > ${at})
        `),
        key,
      )
    }).pipe(Effect.orDie)

  const write = (id: string, written: Machine.Written, at: number) =>
    Effect.gen(function*() {
      const { entity, suspension } = written
      const on = suspension === null ? null : JSON.stringify(suspension.on)
      const cause = suspension === null ? null : suspension.cause
      if (written.created) {
        if (entity === null) throw new Error(`the entity '${name}' '${id}' is created with no state`)
        yield* sql`INSERT INTO entities ${
          sql.insert({
            name,
            id,
            state: JSON.stringify(entity.state),
            version,
            creation: JSON.stringify(entity.creation),
            incarnations: written.incarnations,
            suspended_on: on,
            suspended_cause: cause,
            suspended_at: on === null ? null : at,
          })
        }`
      } else if (entity !== null) {
        // The request that created the entity is written with the state, at the version that reads both. The time
        // of the suspension is the first step's that suspended the entity, kept while it stays suspended (decision
        // 0114).
        yield* sql`
          UPDATE entities
          SET state = ${JSON.stringify(entity.state)}, version = ${version},
              creation = ${JSON.stringify(entity.creation)}, incarnations = ${written.incarnations},
              suspended_on = ${on}, suspended_cause = ${cause},
              suspended_at = CASE WHEN ${on} IS NULL THEN NULL WHEN suspended_at IS NULL THEN ${at} ELSE suspended_at END
          WHERE name = ${name} AND id = ${id}
        `
      } else {
        yield* sql`
          UPDATE entities
          SET incarnations = ${written.incarnations}, suspended_on = ${on}, suspended_cause = ${cause},
              suspended_at = CASE WHEN ${on} IS NULL THEN NULL WHEN suspended_at IS NULL THEN ${at} ELSE suspended_at END
          WHERE name = ${name} AND id = ${id}
        `
      }
      if (written.shown !== null) yield* row(id, written.shown)
      if (written.published !== null) {
        const { kind, message, projection } = written.published
        yield* sql`INSERT INTO outbox ${
          sql.insert({
            name,
            id,
            tag: kind,
            version,
            message: message === null ? null : JSON.stringify(message),
            projection: JSON.stringify(projection),
          })
        }`
      }
      for (const held of written.keys) {
        yield* sql`INSERT OR REPLACE INTO entity_keys ${
          sql.insert({
            name,
            id,
            key: held.key,
            incarnation: held.incarnation,
            version,
            work: JSON.stringify(held.work),
            delivery: held.delivery,
            due: held.due,
          })
        }`
      }
      for (const key of written.gone) {
        yield* sql`DELETE FROM entity_keys WHERE name = ${name} AND id = ${id} AND key = ${key}`
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
                  key: envelope.key,
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
        yield* sql`INSERT OR REPLACE INTO replies ${
          sql.insert({
            name,
            id,
            request: reply.request,
            tag: reply.tag,
            version,
            reason: reply.reason === null ? null : JSON.stringify(reply.reason),
            until: reply.until,
            sender_name: asked?.name ?? null,
            sender_id: asked?.id ?? null,
            sender_key: asked?.key ?? null,
            sender_incarnation: asked?.incarnation ?? null,
          })
        }`
        if (asked === null) continue
        yield* sql`
          DELETE FROM replies
          WHERE name = ${name} AND id = ${id} AND request = ${reply.request} AND version = ${version}
            AND NOT EXISTS (
              SELECT 1 FROM entity_keys AS asking
              WHERE asking.name = ${asked.name} AND asking.id = ${asked.id} AND asking.key = ${asked.key}
                AND asking.incarnation = ${asked.incarnation}
            )
        `
      }
      for (const { key, incarnation } of written.ended) {
        yield* sql`
          DELETE FROM replies
          WHERE sender_name = ${name} AND sender_id = ${id} AND sender_key = ${key}
            AND sender_incarnation = ${incarnation}
        `
      }
      // A step that answers a caller takes its entity's replies past their time with it (decision 0125).
      if (written.replies.length > 0) {
        yield* sql`DELETE FROM replies WHERE name = ${name} AND id = ${id} AND until IS NOT NULL AND until <= ${at}`
      }
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
          ${from === null ? sql`` : sql`HAVING at > ${from.at} OR (at = ${from.at} AND id > ${from.id})`}
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
      const on = `projections (name, ${expression(index)})`
      yield* sql.unsafe(`CREATE INDEX IF NOT EXISTS ${quoted(`projections ${name} ${index}`)} ON ${on}`)
    }
  }).pipe(Effect.orDie)

  const query = ({ limit, order, where = [] }: Query<T>) =>
    Effect.gen(function*() {
      const clauses = [sql`name = ${name}`]
      for (const { index, is, value } of where) {
        if (!comparisons.includes(is)) throw new Error(`'${is}' is no comparison`)
        const column = columnOf(index)
        clauses.push(
          // Nothing but `=` and `<>` says anything of an index that holds no value, as in SQL, where a
          // comparison with null is null: `0` is the clause no row holds.
          value === null
            ? is === '=' ? sql`${column} IS NULL` : is === '<>' ? sql`${column} IS NOT NULL` : sql`0`
            // A boolean is stored as JSON's, which `json_extract` gives as 1 or 0.
            : sql`${column} ${sql.literal(is)} ${typeof value === 'boolean' ? (value ? 1 : 0) : value}`,
        )
      }
      const by = order === undefined
        ? sql`id`
        : sql`${columnOf(order.index)} ${sql.literal(order.descending === true ? 'DESC' : 'ASC')}, id`
      // SQLite reads a negative limit as none.
      const found = yield* rows('projections', Rows.projection)(sql`
        SELECT id, projection, version FROM projections
        WHERE ${sql.and(clauses)} ORDER BY ${by} LIMIT ${limit ?? -1}
      `)
      // A row the version before wrote is read through its migrations; `reindex` is what writes it again.
      return found.map((held): Found<T> => ({
        id: held.id,
        projection: projection.read(held.projection, up('projection', held.version)),
      }))
    }).pipe(Effect.orDie)

  const projected = (id: string) =>
    Effect.gen(function*() {
      const found = yield* rows('projections', Rows.projection)(
        sql`SELECT id, projection, version FROM projections WHERE name = ${name} AND id = ${id}`,
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
          INSERT OR REPLACE INTO projections (name, id, projection, indexes, version)
          SELECT name, id, ${JSON.stringify(shown.projection)}, ${JSON.stringify(shown.indexes)}, ${version}
          FROM entities WHERE name = ${name} AND id = ${held.id} AND state = ${held.state}
            AND version = ${held.version}
          RETURNING id
        `)
        written += rewritten.length
      }
    }
  }).pipe(Effect.orDie)

  const published = (after: number, limit?: number) =>
    Effect.gen(function*() {
      const log = yield* rows('outbox', Rows.published)(sql`
        SELECT seq, id, tag, version, message, projection FROM outbox
        WHERE name = ${name} AND seq > ${after} ORDER BY seq LIMIT ${limit ?? -1}
      `)
      return log.map((row): Published<T> => ({
        seq: row.seq,
        id: row.id,
        kind: row.tag,
        message: row.tag === 'Creation'
          ? null
          : row.tag === 'Inbound'
          ? inbound.read(row.message, up('inbound', row.version))
          : internal.read(row.message, up('internal', row.version)),
        projection: projection.read(row.projection, up('projection', row.version)),
      }))
    }).pipe(Effect.orDie)

  /** Stores a cursor for the consumer, and moves it to `through`, never back (decision 0039). */
  const mark = (consumer: string, through: number) =>
    sql`
      INSERT INTO cursors ${sql.insert({ name, consumer, seq: through })}
      ON CONFLICT (name, consumer) DO UPDATE SET seq = max(seq, excluded.seq)
    `

  const feed = (consumer: string, limit?: number) =>
    Effect.gen(function*() {
      const held = yield* rows('cursors', Rows.seq)(
        sql`SELECT seq FROM cursors WHERE name = ${name} AND consumer = ${consumer}`,
      )
      const cursor = held[0]?.seq
      // The first reading declares the consumer, and only that one writes: a consumer that polls reads.
      if (cursor === undefined) yield* mark(consumer, 0)
      return yield* published(cursor ?? 0, limit)
    }).pipe(Effect.orDie)

  // A cursor goes no further than the last `seq` the log gave, of any program: one past it would have the rows
  // written after it dropped by a prune before its consumer read them. `sqlite_sequence` holds that `seq` though
  // a prune dropped its row, and has no row for the outbox until the first one is written.
  const ack = (consumer: string, through: number) =>
    Effect.gen(function*() {
      const last = yield* rows('sqlite_sequence', Rows.seq)(
        sql`SELECT seq FROM sqlite_sequence WHERE name = 'outbox'`,
      )
      yield* mark(consumer, Math.min(through, last[0]?.seq ?? 0))
    }).pipe(Effect.orDie)

  // The cursors are read and the rows dropped in one transaction: a consumer whose first reading lands in the
  // middle of a prune either holds the log, and nothing goes, or starts after the drop. Otherwise it could read
  // rows with its cursor still at 0 and have them dropped behind it, and skip them without ever saying so.
  const prune = sql.withTransaction(Effect.gen(function*() {
    const read = yield* rows('cursors', Rows.through)(
      sql`SELECT min(seq) AS through FROM cursors WHERE name = ${name}`,
    )
    const through = read[0]?.through ?? null
    // No consumer has stored a cursor: the log is somebody's to read by hand, and nothing of it is dropped.
    if (through === null) return 0
    const gone = yield* rows('outbox', Rows.seq)(
      sql`DELETE FROM outbox WHERE name = ${name} AND seq <= ${through} RETURNING seq`,
    )
    return gone.length
  })).pipe(Effect.orDie)

  const consumers = Effect.gen(function*() {
    const held = yield* rows('cursors', Rows.consumer)(sql`
      SELECT consumer, seq, (
        SELECT count(*) FROM outbox WHERE outbox.name = cursors.name AND outbox.seq > cursors.seq
      ) AS behind
      FROM cursors WHERE name = ${name} ORDER BY consumer
    `)
    return held.map((row): Consumer => ({ consumer: row.consumer, seq: row.seq, behind: row.behind }))
  }).pipe(Effect.orDie)

  const forget = (consumer: string) =>
    Effect.asVoid(sql`DELETE FROM cursors WHERE name = ${name} AND consumer = ${consumer}`).pipe(Effect.orDie)

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
    projected,
    reindex,
    published,
    feed,
    ack,
    prune,
    consumers,
    forget,
    expire,
    suspended: suspensions,
  }
}
