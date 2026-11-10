/**
 * The rows of the storage as the runtime writes them, and the codecs of the JSON they hold: what every module of the
 * storage reads a row through (decisions 0043, 0062, 0157).
 */
import type * as DateTime from 'effect/DateTime'
import * as Schema from 'effect/Schema'
import * as SchemaTransformation from 'effect/SchemaTransformation'
import type * as Machine from '../machine.ts'
import { type Json, type Key, KeyCodec, type Program, type Types } from '../program.ts'

/**
 * A value read from JSON text through its schema: what the machine wrote, encoded by the same schema
 * (decisions 0030, 0040, 0057).
 */
export const json = <A>(codec: Schema.Codec<A, Json>) => {
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
export const workOf = <T extends Types>(program: Program<T>) =>
  Schema.Union([
    Schema.TaggedStruct('Operation', { operation: program.schemas.operation }),
    Schema.TaggedStruct('Timer', { at: Schema.DateTimeUtcFromMillis, message: program.schemas.internal }),
  ]) as unknown as Schema.Codec<Written<T>, Json>

/** The reason a reply carries: null for a bare `reject` (decision 0010). */
export const reasonOf = <Reason>(rejection: Schema.Codec<Reason, Json>) =>
  Schema.NullOr(rejection) as unknown as Schema.Codec<Reason | null, Json>

/** A suspension's `on`: which event the defect happened on. Its cause is rendered, not stored as a value. */
export const Suspended = Schema.Union([
  Schema.TaggedStruct('Message', {}),
  Schema.TaggedStruct('Operation', { key: KeyCodec, incarnation: Schema.Int }),
  Schema.TaggedStruct('Activation', {}),
]) as unknown as Schema.Codec<Machine.Suspension['on'], Json>

const safest = BigInt(Number.MAX_SAFE_INTEGER)

/**
 * An integer of a row, as a driver gives it: a number, or a bigint up to 2^53 read as a number. PGlite gives a
 * `BIGINT` as a number up to 2^53, and `@effect/sql-pg` gives every one as a bigint (decision 0222). A value past 2^53
 * is no row the runtime writes, and fails the call that meets it (decision 0157).
 */
const Integer = Schema.Union([
  Schema.Int,
  Schema.BigInt.pipe(
    Schema.check(Schema.isBetweenBigInt({ minimum: -safest, maximum: safest })),
    Schema.decodeTo(Schema.Int, SchemaTransformation.transform({ decode: Number, encode: BigInt })),
  ),
])

/** The version of the program that wrote a row: the first is 1 (decision 0036). */
const Version = Integer.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1)))

/** An incarnation, a `seq` or a count, as a driver gives an integer up to 2^53 (decision 0157). */
export const Count = Integer.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)))

/** A row of `effecttea_versions`: the newest version of a program, and the name a launch renamed it to, if any. */
export const Standing = Schema.Struct({ version: Count, renamed_to: Schema.NullOr(Schema.String) })

/** How an operation is delivered, as its runner declared (decisions 0011, 0123). */
const Delivery = Schema.Literals(['Idempotent', 'IdempotentDigest', 'AtLeastOnce', 'AtMostOnce', 'Droppable'])

/**
 * A key as its columns hold it: its name, and the JSON of its parameter, or '' for a key without one. No JSON is
 * empty, so '' is never a parameter's, and the column is never NULL, which a primary key would not compare
 * (decision 0136).
 */
export const keyRow = (key: Key): Readonly<{ key: string; parameter: string }> => ({
  key: key.name,
  parameter: key.parameter === undefined ? '' : JSON.stringify(key.parameter),
})

/**
 * The id of a caller's request, from the text the machine keys it by, or null for another's request: what the column
 * `request_id` of a reply holds (decision 0157).
 */
export const callerOf = (request: string): string | null => {
  const held = JSON.parse(request) as Readonly<Record<string, Json>> | null
  return typeof held === 'object' && held !== null && held._tag === 'Caller' && typeof held.id === 'string'
    ? held.id
    : null
}

/** A key read from its columns, as `keyRow` writes them. */
export const keyOfRow = (name: string, parameter: string): Key =>
  parameter === '' ? { name } : { name, parameter: JSON.parse(parameter) as Json }

/** The rows a reading gives, decoded by the schema of one: built once, for every reading of its kind. */
const decoder = <S extends Schema.Top & { readonly DecodingServices: never }>(row: S) =>
  Schema.decodeUnknownEffect(Schema.Array(row))

/**
 * The rows of each table as the runtime writes them, which a reading takes through their schema. A row that is
 * none of them fails the call that meets it, as a row no version reads does (decisions 0043, 0062). The JSON a
 * column holds is the program's, and is read through the program's schemas.
 */
export const Rows = {
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
      suspended_at: Schema.Null,
    }),
    Schema.Struct({
      keyed_as: Schema.NullOr(Schema.String),
      state: Schema.String,
      version: Version,
      creation: Schema.String,
      incarnations: Count,
      suspended_on: Schema.String,
      suspended_cause: Schema.String,
      suspended_at: Count,
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
  due: decoder(Schema.Struct({ id: Schema.String, at: Integer })),
  seq: decoder(Schema.Struct({ seq: Count })),
  /** A count of the rows that match. */
  count: decoder(Schema.Struct({ count: Count })),
  /**
   * A total of an index and of its magnitudes, a double on SQLite and the text of a `NUMERIC` on PostgreSQL, and the
   * least id of a row whose index holds a value that is no number, or null for none (decisions 0148, 0209).
   */
  total: decoder(Schema.Struct({
    total: Schema.Union([Schema.Number, Schema.String]),
    magnitude: Schema.Union([Schema.Number, Schema.String]),
    refused: Schema.NullOr(Schema.String),
  })),
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
    since: Count,
  })),
} as const

/**
 * How many rows one reading gives, or one transaction of `prune` and `expire` deletes: one that fills it is followed by
 * another (decision 0245).
 */
export const batch = 256
