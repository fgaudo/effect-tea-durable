/**
 * What a runtime writes: a `Stored<T>` in one SQLite database, through `SqlClient` (decisions 0007, 0019). The
 * machine says what is stored; this module says in which tables, and encodes it with the program's schemas
 * (decisions 0025, 0027). Nothing here decides anything: a caller writes a whole `Stored` in one transaction.
 */
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/sql'
import type * as Machine from './machine.ts'
import { type Durable, isTimer, type Origin, type Program, timer, type Types } from './program.ts'

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
      message TEXT NOT NULL,
      request_id TEXT,
      origin TEXT,
      key TEXT,
      incarnation INTEGER,
      PRIMARY KEY (name, id, seq)
    )
  `
  // The replies, by `requestKey`: a retry gets the one stored (decision 0015).
  yield* sql`
    CREATE TABLE IF NOT EXISTS replies (
      name TEXT NOT NULL,
      id TEXT NOT NULL,
      request TEXT NOT NULL,
      tag TEXT NOT NULL,
      reason TEXT,
      PRIMARY KEY (name, id, request)
    )
  `
}).pipe(Effect.orDie)

/** A value written as JSON text through its schema: what leaves the process is what a schema describes. */
const json = <A>(codec: Schema.Codec<A, unknown>) => {
  const encode = Schema.encodeSync(codec)
  const decode = Schema.decodeSync(codec)
  return {
    write: (value: A): string => JSON.stringify(encode(value)),
    read: (text: string): A => decode(JSON.parse(text) as never),
  }
}

const Address = Schema.Struct({ name: Schema.String, id: Schema.String })

/** Who a queued message came from: the runtime owns `Self` and an entity's address, the program the sender. */
const originOf = <Sender>(sender: Schema.Codec<Sender, unknown>) =>
  Schema.Union([
    Schema.TaggedStruct('Self', {}),
    Schema.TaggedStruct('Caller', { sender }),
    Schema.TaggedStruct('Entity', { entity: Address }),
  ]) as unknown as Schema.Codec<Origin<Sender>, unknown>

type Written<T extends Types> =
  | Readonly<{ _tag: 'Operation'; operation: T['operation'] }>
  | Readonly<{ _tag: 'Timer'; at: DateTime.Utc; message: T['internal'] }>

/** The work under a key: the program's own operation, or a timer's time and message. */
const workOf = <T extends Types>(program: Program<T>) =>
  Schema.Union([
    Schema.TaggedStruct('Operation', { operation: program.schemas.operation }),
    Schema.TaggedStruct('Timer', { at: Schema.DateTimeUtcFromMillis, message: program.schemas.internal }),
  ]) as unknown as Schema.Codec<Written<T>, unknown>

/** The reason a reply carries: null for a bare `reject` (decision 0010). */
const reasonOf = <Reason>(rejection: Schema.Codec<Reason, unknown>) =>
  Schema.NullOr(rejection) as unknown as Schema.Codec<Reason | null, unknown>

/** A suspension's `on`: which event the defect happened on. Its cause is rendered, not stored as a value. */
const Suspended = Schema.Union([
  Schema.TaggedStruct('Message', {}),
  Schema.TaggedStruct('Operation', { key: Schema.String, incarnation: Schema.Int }),
  Schema.TaggedStruct('Activation', {}),
]) as unknown as Schema.Codec<Machine.Suspension['on'], unknown>

/** A defect's cause as an operator reads it: a suspension stores this, not the value (decision 0028). */
export const render = (cause: unknown): string =>
  cause instanceof Error ? `${cause.name}: ${cause.message}` : typeof cause === 'string' ? cause : String(cause)

/** The entities an unloaded timer is due for, and the next time one is (decision 0029). */
export type Due = Readonly<{
  /** The entities with a stored timer due at or before the time asked: each is activated, and its timer fires. */
  ready: ReadonlyArray<string>
  /** The earliest time a stored timer of another entity is due, by which the process sleeps, or null for none. */
  next: number | null
}>

/** How many entities one reading of `due` gives: a reading that fills it is followed by another. */
const batch = 256

export interface Storage<T extends Types> {
  /** What is stored for the entity `id`, or null when there is none. */
  readonly load: (id: string) => Effect.Effect<Machine.Stored<T> | null>
  /**
   * Writes what an event gave: the row of a new entity, and the state, the keys, the mailbox and the replies of
   * one that was already there. The caller wraps it in the transaction of the event (decision 0007).
   */
  readonly write: (before: Machine.Stored<T> | null, after: Machine.Stored<T>) => Effect.Effect<void>
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
}

/** The storage of one program's entities, on one client, with its schemas read once. */
export const storage = <T extends Types>(program: Program<T>, sql: SqlClient.SqlClient): Storage<T> => {
  const state = json(program.schemas.state)
  const inbound = json(program.schemas.inbound)
  const internal = json(program.schemas.internal)
  const origin = json(originOf(program.schemas.sender))
  const work = json(workOf(program))
  const reason = json(reasonOf(program.schemas.rejection))
  const suspended = json(Suspended)
  const { name } = program

  const writeWork = (held: Durable<T['operation'], T['internal']>) =>
    work.write(
      isTimer(held) ? { _tag: 'Timer', at: held.at, message: held.message } : { _tag: 'Operation', operation: held },
    )

  const readWork = (text: string): Durable<T['operation'], T['internal']> => {
    const held = work.read(text)
    return held._tag === 'Timer' ? timer(held.at, held.message) : held.operation
  }

  const load = (id: string) =>
    Effect.gen(function*() {
      const rows = yield* sql<{
        state: string
        creation: string
        suspended_on: string | null
        suspended_cause: string | null
      }>`SELECT state, creation, suspended_on, suspended_cause FROM entities WHERE name = ${name} AND id = ${id}`
      const row = rows[0]
      if (row === undefined) return null
      const held = yield* sql<{
        key: string
        incarnation: number
        work: string | null
        delivery: string | null
      }>`SELECT key, incarnation, work, delivery FROM entity_keys WHERE name = ${name} AND id = ${id}`
      const queued = yield* sql<{
        tag: string
        message: string
        request_id: string | null
        origin: string | null
        key: string | null
        incarnation: number | null
      }>`SELECT tag, message, request_id, origin, key, incarnation FROM mailbox
         WHERE name = ${name} AND id = ${id} ORDER BY seq`
      const answered = yield* sql<{
        request: string
        tag: string
        reason: string | null
      }>`SELECT request, tag, reason FROM replies WHERE name = ${name} AND id = ${id}`

      const keys: Record<string, Machine.Key<T>> = {}
      for (const key of held) {
        keys[key.key] = {
          incarnation: key.incarnation,
          ...(key.work === null ? {} : { work: readWork(key.work) }),
          ...(key.delivery === null ? {} : { delivery: key.delivery as NonNullable<Machine.Key<T>['delivery']> }),
        }
      }
      const mailbox = queued.map((envelope): Machine.Envelope<T> =>
        envelope.tag === 'Inbound'
          ? {
            _tag: 'Inbound',
            requestId: envelope.request_id ?? '',
            message: inbound.read(envelope.message),
            from: origin.read(envelope.origin ?? 'null'),
          }
          : {
            _tag: 'Internal',
            key: envelope.key ?? '',
            incarnation: envelope.incarnation ?? 0,
            message: internal.read(envelope.message),
          }
      )
      const replies: Record<string, Machine.StoredReply<T['rejection']>> = {}
      for (const reply of answered) {
        replies[reply.request] = reply.tag === 'Accepted'
          ? { _tag: 'Accepted' }
          : { _tag: 'Rejected', reason: reply.reason === null ? null : reason.read(reply.reason) }
      }
      return {
        name,
        id,
        state: state.read(row.state),
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

  const write = (before: Machine.Stored<T> | null, after: Machine.Stored<T>) =>
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
            creation: after.creation,
            suspended_on: on,
            suspended_cause: cause,
          })
        }`
      } else {
        yield* sql`
          UPDATE entities
          SET state = ${state.write(after.state)}, suspended_on = ${on}, suspended_cause = ${cause}
          WHERE name = ${name} AND id = ${id}
        `
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
            reason: reply._tag === 'Rejected' ? reason.write(reply.reason) : null,
          })
        }`
      }
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

  const due = (now: number, loaded: ReadonlyArray<string>) =>
    Effect.gen(function*() {
      const held = sql`NOT ${sql.in('id', loaded)}`
      const ready = yield* sql<{ id: string }>`
        SELECT DISTINCT id FROM entity_keys
        WHERE name = ${name} AND work IS NOT NULL AND due IS NOT NULL AND due <= ${now}
          AND ${held} AND id NOT IN ${onHold}
        LIMIT ${batch}
      `
      const rest = yield* sql<{ next: number | null }>`
        SELECT MIN(due) AS next FROM entity_keys
        WHERE name = ${name} AND work IS NOT NULL AND due > ${now}
          AND ${held} AND id NOT IN ${onHold}
      `
      return { ready: ready.map((row) => row.id), next: rest[0]?.next ?? null } satisfies Due
    }).pipe(Effect.orDie)

  return { load, write, interrupted, due }
}
