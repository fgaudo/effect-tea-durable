/**
 * What a runtime writes: a `Stored<T>` in one SQLite database, through `SqlClient` (decisions 0007, 0019). The
 * machine says what is stored; this module says in which tables, and encodes it with the program's schemas
 * (decisions 0025, 0027). Every row carries the version of the program that wrote it, and is read by migrating
 * its JSON to the program's version (decision 0036). Nothing here decides anything: a caller writes a whole
 * `Stored` in one transaction.
 */
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/sql'
import type * as Machine from './machine.ts'
import {
  type Durable,
  encode,
  indexesOf,
  isTimer,
  type Json,
  type Migrated,
  migrationOf,
  type Origin,
  type Program,
  type Scalar,
  timer,
  type Types,
  versionOf,
} from './program.ts'

/**
 * The tables, created once for the database. Every entity of every program sits in them: the name of the program
 * and the id are the entity's address (decision 0022).
 */
export const createTables: Effect.Effect<void, never, SqlClient.SqlClient> = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  // The state, the request that created the entity and the suspension: one row per entity.
  yield* sql`
    CREATE TABLE IF NOT EXISTS entities (
      name TEXT NOT NULL,
      id TEXT NOT NULL,
      state TEXT NOT NULL,
      version INTEGER NOT NULL,
      creation TEXT NOT NULL,
      suspended_on TEXT,
      suspended_cause TEXT,
      PRIMARY KEY (name, id)
    )
  `
  // One row per key the state ever held, with its incarnation: a key that holds no work keeps its own
  // (decision 0004). `due` is a timer's time, by which an entity nothing else holds loaded is woken
  // (decision 0029).
  yield* sql`
    CREATE TABLE IF NOT EXISTS entity_keys (
      name TEXT NOT NULL,
      id TEXT NOT NULL,
      key TEXT NOT NULL,
      incarnation INTEGER NOT NULL,
      version INTEGER NOT NULL,
      work TEXT,
      delivery TEXT,
      due INTEGER,
      PRIMARY KEY (name, id, key)
    )
  `
  yield* sql`CREATE INDEX IF NOT EXISTS entity_keys_due ON entity_keys (due)`
  // The mailbox, in order: `seq` is the order of the machine's array.
  yield* sql`
    CREATE TABLE IF NOT EXISTS mailbox (
      name TEXT NOT NULL,
      id TEXT NOT NULL,
      seq INTEGER NOT NULL,
      tag TEXT NOT NULL,
      version INTEGER NOT NULL,
      message TEXT NOT NULL,
      request_id TEXT,
      origin TEXT,
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
  // The replies, by `requestKey`: a retry gets the one stored (decision 0015). A reply to another entity holds
  // the work that asked — its program, id, key and incarnation — and is deleted once that work no longer holds
  // (decision 0021).
  yield* sql`
    CREATE TABLE IF NOT EXISTS replies (
      name TEXT NOT NULL,
      id TEXT NOT NULL,
      request TEXT NOT NULL,
      tag TEXT NOT NULL,
      version INTEGER NOT NULL,
      reason TEXT,
      sender_name TEXT,
      sender_id TEXT,
      sender_key TEXT,
      sender_incarnation INTEGER,
      PRIMARY KEY (name, id, request)
    )
  `
  yield* sql`CREATE INDEX IF NOT EXISTS replies_sender ON replies (sender_name, sender_id)`
}).pipe(Effect.orDie)

/**
 * A value written as JSON text through its schema: what leaves the process is what a schema describes, and the
 * schema encodes it to what JSON holds, as it is, so that the text reads back as written (decisions 0030, 0040).
 */
const json = <A>(codec: Schema.Codec<A, Json>, what: string) => {
  const decode = Schema.decodeSync(codec)
  return {
    write: (value: A): string => JSON.stringify(encode(codec, value, what)),
    /** `up` is how the version that wrote the text is read at the program's, and is identity for its own. */
    read: (text: string, up: (json: Json) => Json = (json) => json): A =>
      decode(up(JSON.parse(text) as Json) as never),
  }
}

const Address = Schema.Struct({ name: Schema.String, id: Schema.String })

/** Who a queued message came from: the runtime owns `Self` and an entity's address, the program the sender. */
const originOf = <Sender>(sender: Schema.Codec<Sender, Json>) =>
  Schema.Union([
    Schema.TaggedStruct('Self', {}),
    Schema.TaggedStruct('Caller', { sender }),
    Schema.TaggedStruct('Entity', { entity: Address }),
  ]) as unknown as Schema.Codec<Origin<Sender>, Json>

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

/** A defect's cause as an operator reads it: a suspension stores this, not the value (decision 0028). */
export const render = (cause: unknown): string =>
  cause instanceof Error ? `${cause.name}: ${cause.message}` : typeof cause === 'string' ? cause : String(cause)

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

/** A consumer of the outbox, as an operator sees it: where it has read to, and what is waiting (decision 0039). */
export type Consumer = Readonly<{
  consumer: string
  /** The `seq` it acked, `0` for one that has read and acked nothing yet. */
  seq: number
  /** How many rows are past its cursor: what it costs the log to keep it. */
  behind: number
}>

/** A reply storage deleted, since the work that asked for it no longer holds (decision 0021). */
export type Forgotten = Readonly<{ name: string; id: string; request: string }>

/**
 * The work that sent a request, when another entity's operation did: its request id is the operation's
 * idempotency key, the sender's program, id, key and incarnation, with the request's name (decisions 0015, 0021,
 * 0047). Null for a caller's.
 */
const askedBy = (request: string) => {
  try {
    const held: unknown = JSON.parse(request)
    if (!Array.isArray(held) || held.length !== 3) return null
    const [name, id, requestId]: ReadonlyArray<unknown> = held
    if (typeof name !== 'string' || typeof id !== 'string' || typeof requestId !== 'string') return null
    const named: unknown = JSON.parse(requestId)
    if (!Array.isArray(named) || named.length !== 2 || typeof named[0] !== 'string') return null
    const key: unknown = JSON.parse(named[0])
    if (!Array.isArray(key) || key.length !== 4) return null
    const [from, of, under, incarnation]: ReadonlyArray<unknown> = key
    if (from !== name || of !== id || typeof under !== 'string' || !Number.isInteger(incarnation)) return null
    return { sender_name: name, sender_id: id, sender_key: under, sender_incarnation: incarnation as number }
  } catch {
    // A request id another entity chose by hand, which no work holds: its reply is kept, as a caller's is.
    return null
  }
}

/** An index's name is a word, so that it is a column of a query and of an index's expression. */
const isName = (name: string) => /^[A-Za-z][A-Za-z0-9_]*$/.test(name)

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
  /** What is stored for the entity `id`, or null when there is none. */
  readonly load: (id: string) => Effect.Effect<Machine.Stored<T> | null>
  /**
   * Writes what an event gave: the row of a new entity, and the state, the keys, the mailbox and the replies of
   * one that was already there. The caller wraps it in the transaction of the event (decision 0007). It gives the
   * replies to other entities it deleted, of any entity, whose work that asked no longer holds (decision 0021).
   */
  readonly write: (
    before: Machine.Stored<T> | null,
    after: Machine.Stored<T>,
    /** The message the event handled, which the step publishes with the projection it leaves (decision 0038). */
    handled?: Machine.Envelope<T> | null,
  ) => Effect.Effect<ReadonlyArray<Forgotten>>
  /**
   * The entities whose state holds an operation: what a process activates when it starts, so that an operation a
   * crash interrupted runs again without waiting for a caller. A timer needs no activation of its own — its time
   * is stored, and `due` gives it — and a suspended entity runs nothing until an operator resumes it
   * (decisions 0006, 0029).
   */
  readonly interrupted: Effect.Effect<ReadonlyArray<string>>
  /**
   * The stored timers of the entities this process does not hold: `loaded` are the ones it does, whose timers are
   * armed in it, and a suspended entity is left out, since nothing of its runs (decision 0029).
   */
  readonly due: (now: number, loaded: ReadonlyArray<string>) => Effect.Effect<Due>
  /**
   * Creates one expression index per index the program declares, so that a query over it is a lookup. Run once,
   * where the program is deployed: an index the program no longer declares is left behind, and costs nothing.
   */
  readonly indexed: Effect.Effect<void>
  /** The entities of the program whose indexes match, with what callers read of them (decision 0032). */
  readonly query: (query: Query<T>) => Effect.Effect<ReadonlyArray<Found<T>>>
  /**
   * Writes the row of every entity of the program again, from its stored state: what an index added or changed
   * by a new version of the program needs, since a row is only written when its entity takes a step. Each row is
   * its own write, so a crash leaves the rest to the next run, and gives how many were written. An entity that
   * takes a step between the reading of its state and the writing of its row has that row written back as it
   * was, and the step after it writes the row again.
   */
  readonly reindex: Effect.Effect<number>
  /**
   * What the entities of the program did, from `after` on, in the order it was written (decision 0038). The
   * cursor is the caller's: nothing of it is stored, so a reading here has no say in a prune (decision 0039).
   */
  readonly published: (after: number, limit?: number) => Effect.Effect<ReadonlyArray<Published<T>>>
  /**
   * The same from the stored cursor of the consumer `consumer`, which its first reading stores at `0`: from then
   * on the consumer holds the log, acked or not, until it is forgotten (decision 0039).
   */
  readonly feed: (consumer: string, limit?: number) => Effect.Effect<ReadonlyArray<Published<T>>>
  /**
   * Moves a consumer's cursor to `through`, never back, since what is behind it may be gone, and never past the
   * last `seq` written, so that no row written later is behind it. An ack from a consumer that has not read
   * stores its cursor too (decision 0039).
   */
  readonly ack: (consumer: string, through: number) => Effect.Effect<void>
  /**
   * Drops what every consumer has read — through the lowest stored cursor — and gives how many rows went. Where
   * no consumer has stored one it drops nothing (decision 0039).
   */
  readonly prune: Effect.Effect<number>
  /** Every consumer that has stored a cursor, with how many rows are past it, by name. */
  readonly consumers: Effect.Effect<ReadonlyArray<Consumer>>
  /** Drops a consumer's cursor, so that the next prune passes what it never read (decision 0039). */
  readonly forget: (consumer: string) => Effect.Effect<void>
}

/** The storage of one program's entities, on one client, with its schemas read once. */
export const storage = <T extends Types>(program: Program<T>, sql: SqlClient.SqlClient): Storage<T> => {
  const state = json(program.schemas.state, 'state')
  const inbound = json(program.schemas.inbound, 'inbound message')
  const internal = json(program.schemas.internal, 'internal message')
  const origin = json(originOf(program.schemas.sender), 'sender')
  const work = json(workOf(program), 'work')
  const reason = json(reasonOf(program.schemas.rejection), 'reason of the rejection')
  const suspended = json(Suspended, 'suspension')
  const projection = json(program.schemas.projection, 'projection')
  const { name } = program
  const version = versionOf(program)

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

  /** Who a queued message came from: only a caller's sender is the program's. */
  const upOrigin = (from: number) => (held: Json): Json => {
    const written = fields(held)
    return written === null || written._tag !== 'Caller'
      ? held
      : { ...written, sender: up('sender', from)(written.sender ?? null) }
  }

  /** The reason a reply carries, null for a bare `reject`, which no migration reads. */
  const upReason = (from: number) => (held: Json): Json => held === null ? held : up('rejection', from)(held)

  /**
   * The expression that reads an index out of the row, written once: SQLite uses an index of an expression only
   * where the query writes the expression the same way, so the index created and the query must share this.
   */
  const expression = (index: string) => {
    if (!Object.hasOwn(program.indexes, index) || !isName(index)) {
      throw new Error(`'${index}' is no index of the program '${name}'`)
    }
    return `json_extract(indexes, '$.${index}')`
  }

  const columnOf = (index: string) => sql.literal(expression(index))

  /**
   * The row a query reads: what callers read of the state, and the value of each index on it. Both are pure and
   * were checked by the machine before the state was stored, so neither dies here (decision 0032).
   */
  const row = (id: string, shown: T['projection'], text: string) =>
    sql`INSERT OR REPLACE INTO projections ${
      sql.insert({ name, id, projection: text, indexes: JSON.stringify(indexesOf(program, shown)), version })
    }`

  const writeWork = (held: Durable<T['operation'], T['internal']>) =>
    work.write(
      isTimer(held) ? { _tag: 'Timer', at: held.at, message: held.message } : { _tag: 'Operation', operation: held },
    )

  const readWork = (text: string, from: number): Durable<T['operation'], T['internal']> => {
    const held = work.read(text, upWork(from))
    return held._tag === 'Timer' ? timer(held.at, held.message) : held.operation
  }

  const load = (id: string) =>
    Effect.gen(function*() {
      const rows = yield* sql<{
        state: string
        version: number
        creation: string
        suspended_on: string | null
        suspended_cause: string | null
      }>`SELECT state, version, creation, suspended_on, suspended_cause
         FROM entities WHERE name = ${name} AND id = ${id}`
      const row = rows[0]
      if (row === undefined) return null
      const held = yield* sql<{
        key: string
        incarnation: number
        version: number
        work: string | null
        delivery: string | null
      }>`SELECT key, incarnation, version, work, delivery FROM entity_keys WHERE name = ${name} AND id = ${id}`
      const queued = yield* sql<{
        tag: string
        version: number
        message: string
        request_id: string | null
        origin: string | null
        key: string | null
        incarnation: number | null
      }>`SELECT tag, version, message, request_id, origin, key, incarnation FROM mailbox
         WHERE name = ${name} AND id = ${id} ORDER BY seq`
      const answered = yield* sql<{
        request: string
        tag: string
        version: number
        reason: string | null
      }>`SELECT request, tag, version, reason FROM replies WHERE name = ${name} AND id = ${id}`

      const keys: Record<string, Machine.Key<T>> = {}
      for (const key of held) {
        keys[key.key] = {
          incarnation: key.incarnation,
          ...(key.work === null ? {} : { work: readWork(key.work, key.version) }),
          ...(key.delivery === null ? {} : { delivery: key.delivery as NonNullable<Machine.Key<T>['delivery']> }),
        }
      }
      const mailbox = queued.map((envelope): Machine.Envelope<T> =>
        envelope.tag === 'Inbound'
          ? {
            _tag: 'Inbound',
            requestId: envelope.request_id ?? '',
            message: inbound.read(envelope.message, up('inbound', envelope.version)),
            from: origin.read(envelope.origin ?? 'null', upOrigin(envelope.version)),
          }
          : {
            _tag: 'Internal',
            key: envelope.key ?? '',
            incarnation: envelope.incarnation ?? 0,
            message: internal.read(envelope.message, up('internal', envelope.version)),
          }
      )
      const replies: Record<string, Machine.StoredReply<T['rejection']>> = {}
      for (const reply of answered) {
        replies[reply.request] = reply.tag === 'Accepted'
          ? { _tag: 'Accepted' }
          : {
            _tag: 'Rejected',
            reason: reply.reason === null ? null : reason.read(reply.reason, upReason(reply.version)),
          }
      }
      return {
        name,
        id,
        state: state.read(row.state, up('state', row.version)),
        keys,
        mailbox,
        replies,
        creation: row.creation,
        // The cause is what was rendered when the entity suspended: an operator reads it, nothing acts on it.
        suspension: row.suspended_on === null
          ? null
          : { cause: row.suspended_cause ?? '', on: suspended.read(row.suspended_on) },
      } satisfies Machine.Stored<T>
    }).pipe(Effect.orDie)

  const write = (
    before: Machine.Stored<T> | null,
    after: Machine.Stored<T>,
    handled: Machine.Envelope<T> | null = null,
  ) =>
    Effect.gen(function*() {
      const { id } = after
      const on = after.suspension === null ? null : suspended.write(after.suspension.on)
      const cause = after.suspension === null ? null : render(after.suspension.cause)
      if (before === null) {
        yield* sql`INSERT INTO entities ${
          sql.insert({
            name,
            id,
            state: state.write(after.state),
            version,
            creation: after.creation,
            suspended_on: on,
            suspended_cause: cause,
          })
        }`
      } else {
        yield* sql`
          UPDATE entities
          SET state = ${state.write(after.state)}, version = ${version},
              suspended_on = ${on}, suspended_cause = ${cause}
          WHERE name = ${name} AND id = ${id}
        `
      }
      // The read model is written when the state changed, which is when the projection can have changed: a
      // projection is a function of the state alone (decision 0032).
      if (before === null || before.state !== after.state) {
        const shown = program.project(after.state)
        const text = projection.write(shown)
        yield* row(id, shown, text)
        // What other systems learn of the step, published when what callers read changed, compared as it is
        // written: a creation's row carries no message, since a creation is no message (decision 0038).
        const was = before === null ? null : projection.write(program.project(before.state))
        if (was !== text) {
          // Only a creation and a step that handled a message change the state, so the row is one or the other.
          const published = before === null ? null : handled
          if (before !== null && published === null) {
            throw new Error(`the state of '${name}' '${id}' changed with no message handled`)
          }
          yield* sql`INSERT INTO outbox ${
            sql.insert({
              name,
              id,
              tag: published === null ? 'Creation' : published._tag,
              version,
              message: published === null
                ? null
                : published._tag === 'Inbound'
                ? inbound.write(published.message)
                : internal.write(published.message),
              projection: text,
            })
          }`
        }
      }
      // The keys and the mailbox are few, and one event may change any of them: they are written whole.
      yield* sql`DELETE FROM entity_keys WHERE name = ${name} AND id = ${id}`
      for (const [key, held] of Object.entries(after.keys)) {
        yield* sql`INSERT INTO entity_keys ${
          sql.insert({
            name,
            id,
            key,
            incarnation: held.incarnation,
            version,
            work: held.work === undefined ? null : writeWork(held.work),
            delivery: held.delivery ?? null,
            due: held.work !== undefined && isTimer(held.work) ? DateTime.toEpochMillis(held.work.at) : null,
          })
        }`
      }
      yield* sql`DELETE FROM mailbox WHERE name = ${name} AND id = ${id}`
      for (const [seq, envelope] of after.mailbox.entries()) {
        yield* sql`INSERT INTO mailbox ${
          sql.insert(
            envelope._tag === 'Inbound'
              ? {
                name,
                id,
                seq,
                tag: 'Inbound',
                version,
                message: inbound.write(envelope.message),
                request_id: envelope.requestId,
                origin: origin.write(envelope.from),
                key: null,
                incarnation: null,
              }
              : {
                name,
                id,
                seq,
                tag: 'Internal',
                version,
                message: internal.write(envelope.message),
                request_id: null,
                origin: null,
                key: envelope.key,
                incarnation: envelope.incarnation,
              },
          )
        }`
      }
      // A reply is written once and read by every retry: the machine only ever adds one (decision 0015).
      for (const [request, reply] of Object.entries(after.replies)) {
        if (before !== null && before.replies[request] !== undefined) continue
        yield* sql`INSERT OR REPLACE INTO replies ${
          sql.insert({
            name,
            id,
            request,
            tag: reply._tag,
            version,
            reason: reply._tag === 'Rejected' ? reason.write(reply.reason) : null,
            ...(askedBy(request) ??
              { sender_name: null, sender_id: null, sender_key: null, sender_incarnation: null }),
          })
        }`
      }
      // A reply to another entity is kept while the work that asked holds (decision 0021). It is deleted in the
      // transaction that ends that work, which writes the sender's keys, or in the one that stores it, when the
      // work ended while its request waited in the mailbox: an at-most-once operation that delivered `unknown`.
      const ended = sql`NOT EXISTS (
        SELECT 1 FROM entity_keys AS asking
        WHERE asking.name = replies.sender_name AND asking.id = replies.sender_id
          AND asking.key = replies.sender_key AND asking.incarnation = replies.sender_incarnation
          AND asking.work IS NOT NULL
      )`
      const sent = yield* sql<Forgotten>`
        DELETE FROM replies WHERE sender_name = ${name} AND sender_id = ${id} AND ${ended}
        RETURNING name, id, request
      `
      const received = yield* sql<Forgotten>`
        DELETE FROM replies WHERE name = ${name} AND id = ${id} AND sender_name IS NOT NULL AND ${ended}
        RETURNING name, id, request
      `
      return [...sent, ...received]
    }).pipe(Effect.orDie)

  /** The entities of the program an operator has to resume: nothing of theirs runs, and no timer of theirs fires. */
  const onHold = sql`(SELECT id FROM entities WHERE name = ${name} AND suspended_on IS NOT NULL)`

  // A key holding an operation has no `due`: the time of a timer is what that column is for.
  const interrupted = Effect.gen(function*() {
    const rows = yield* sql<{ id: string }>`
      SELECT DISTINCT id FROM entity_keys
      WHERE name = ${name} AND work IS NOT NULL AND due IS NULL AND id NOT IN ${onHold}
    `
    return rows.map((row) => row.id)
  }).pipe(Effect.orDie)

  // The entities this process holds are left out as the rows are read, not by the query: a query that listed them
  // would take one parameter each, and fail past SQLite's limit on them. Each page skips at most the loaded ones.
  const due = (now: number, loaded: ReadonlyArray<string>) =>
    Effect.gen(function*() {
      const held = new Set(loaded)
      const ready: Array<string> = []
      let after = ''
      while (ready.length < batch) {
        const page = yield* sql<{ id: string }>`
          SELECT DISTINCT id FROM entity_keys
          WHERE name = ${name} AND work IS NOT NULL AND due IS NOT NULL AND due <= ${now}
            AND id > ${after} AND id NOT IN ${onHold}
          ORDER BY id LIMIT ${batch}
        `
        for (const { id } of page) if (!held.has(id) && ready.length < batch) ready.push(id)
        if (page.length < batch) break
        after = page[page.length - 1]?.id ?? after
      }
      // The earliest time of an entity this process does not hold, read in the order of the times.
      let next: number | null = null
      let from: Readonly<{ at: number; id: string }> | null = null
      while (next === null) {
        const page: ReadonlyArray<{ id: string; at: number }> = yield* sql<{ id: string; at: number }>`
          SELECT id, MIN(due) AS at FROM entity_keys
          WHERE name = ${name} AND work IS NOT NULL AND due > ${now} AND id NOT IN ${onHold}
          GROUP BY id
          ${from === null ? sql`` : sql`HAVING at > ${from.at} OR (at = ${from.at} AND id > ${from.id})`}
          ORDER BY at, id LIMIT ${batch}
        `
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
      const rows = yield* sql<{ id: string; projection: string; version: number }>`
        SELECT id, projection, version FROM projections
        WHERE ${sql.and(clauses)} ORDER BY ${by} LIMIT ${limit ?? -1}
      `
      // A row the version before wrote is read through its migrations; `reindex` is what writes it again.
      return rows.map((found): Found<T> => ({
        id: found.id,
        projection: projection.read(found.projection, up('projection', found.version)),
      }))
    }).pipe(Effect.orDie)

  const reindex = Effect.gen(function*() {
    let cursor = ''
    let written = 0
    while (true) {
      const rows = yield* sql<{ id: string; state: string; version: number }>`
        SELECT id, state, version FROM entities
        WHERE name = ${name} AND id > ${cursor} ORDER BY id LIMIT ${batch}
      `
      if (rows.length === 0) return written
      for (const held of rows) {
        const shown = program.project(state.read(held.state, up('state', held.version)))
        yield* row(held.id, shown, projection.write(shown))
        cursor = held.id
        written += 1
      }
    }
  }).pipe(Effect.orDie)

  const published = (after: number, limit?: number) =>
    Effect.gen(function*() {
      const rows = yield* sql<{
        seq: number
        id: string
        tag: string
        version: number
        message: string | null
        projection: string
      }>`
        SELECT seq, id, tag, version, message, projection FROM outbox
        WHERE name = ${name} AND seq > ${after} ORDER BY seq LIMIT ${limit ?? -1}
      `
      return rows.map((row): Published<T> => ({
        seq: row.seq,
        id: row.id,
        kind: row.tag as Published<T>['kind'],
        message: row.message === null
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
      const held = yield* sql<{ seq: number }>`
        SELECT seq FROM cursors WHERE name = ${name} AND consumer = ${consumer}
      `
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
      const last = yield* sql<{ seq: number }>`SELECT seq FROM sqlite_sequence WHERE name = 'outbox'`
      yield* mark(consumer, Math.min(through, last[0]?.seq ?? 0))
    }).pipe(Effect.orDie)

  // The cursors are read and the rows dropped in one transaction: a consumer whose first reading lands in the
  // middle of a prune either holds the log, and nothing goes, or starts after the drop. Otherwise it could read
  // rows with its cursor still at 0 and have them dropped behind it, and skip them without ever saying so.
  const prune = sql.withTransaction(Effect.gen(function*() {
    const read = yield* sql<{ through: number | null }>`
      SELECT min(seq) AS through FROM cursors WHERE name = ${name}
    `
    const through = read[0]?.through ?? null
    // No consumer has stored a cursor: the log is somebody's to read by hand, and nothing of it is dropped.
    if (through === null) return 0
    const gone = yield* sql<{ seq: number }>`
      DELETE FROM outbox WHERE name = ${name} AND seq <= ${through} RETURNING seq
    `
    return gone.length
  })).pipe(Effect.orDie)

  const consumers = Effect.gen(function*() {
    const rows = yield* sql<{ consumer: string; seq: number; behind: number }>`
      SELECT consumer, seq, (
        SELECT count(*) FROM outbox WHERE outbox.name = cursors.name AND outbox.seq > cursors.seq
      ) AS behind
      FROM cursors WHERE name = ${name} ORDER BY consumer
    `
    return rows.map((row): Consumer => ({ consumer: row.consumer, seq: row.seq, behind: row.behind }))
  }).pipe(Effect.orDie)

  const forget = (consumer: string) =>
    Effect.asVoid(sql`DELETE FROM cursors WHERE name = ${name} AND consumer = ${consumer}`).pipe(Effect.orDie)

  return { load, write, interrupted, due, indexed, query, reindex, published, feed, ack, prune, consumers, forget }
}
