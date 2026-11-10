/**
 * What the storage of one program holds once its schemas are read, which the modules of the storage share: the
 * program, its client, its codecs, and the readings of what an older version wrote (decision 0036). `storage`, in
 * [`storage.ts`](../storage.ts), makes one `Held` for each program, and gives it to each module's part of the
 * storage.
 */
import * as Effect from 'effect/Effect'
import type * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/sql'
import * as Machine from '../machine.ts'
import {
  type Json,
  type Migrated,
  migrationOf,
  type Piece,
  type Program,
  timer,
  topicsOf,
  type Types,
  versionOf,
} from '../program.ts'
import { type Guard, json, reasonOf, Suspended, unguarded, workOf } from './rows.ts'
import { dialectOf } from './tables.ts'

/** What the storage of one program holds, as `heldOf` makes it. */
export type Held<T extends Types> = ReturnType<typeof heldOf<T>>

/**
 * What the storage of `program` holds on the client `sql`, with its schemas read once. `partitions` is the number of
 * partitions of the log, and `onCluster` says whether Cluster's tables are beside the runtime's (decision 0169).
 * `stored` is the name the rows are stored under (decision 0247).
 */
export const heldOf = <T extends Types>(
  program: Program<T>,
  sql: SqlClient.SqlClient,
  partitions: number,
  onCluster: boolean,
  stored: string = program.name,
) => {
  const state = json(program.schemas.state)
  const inbound = json(program.schemas.inbound)
  const internal = json(program.schemas.internal)
  const flags = json(program.schemas.flags)
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
  const name = stored
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
    // A version no migration reads throws where its reading runs, and not where it is composed, so that the
    // throw falls inside what `check` tells apart as the program's (decision 0247).
    let reading: (json: Json) => Json
    try {
      reading = migrationOf(program, of, from)
    } catch (thrown) {
      reading = () => {
        throw thrown
      }
    }
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

  const readWork = (text: string, from: number, guard: Guard = unguarded): Piece<T['operation'], T['internal']> => {
    const held = work.read(text, upWork(from), guard)
    return held._tag === 'Timer' ? timer(held.at, held.message) : held.operation
  }

  /**
   * Runs `effect` in one transaction, whose statements read one snapshot. At PostgreSQL's default level each
   * statement reads a snapshot of its own, so the transaction begins at `REPEATABLE READ`, whose statements read its
   * first (decision 0157). The level is read where the transaction is the outermost: inside a transaction the caller
   * left open, the statements read at the caller's level (decision 0158).
   */
  const snapshot = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    sql.withTransaction(effect).pipe(
      dialect === 'pg'
        ? Effect.provideService(SqlClient.BeginTransaction, 'BEGIN ISOLATION LEVEL REPEATABLE READ')
        : (self) => self,
    )

  return {
    program,
    sql,
    partitions,
    onCluster,
    name,
    version,
    dialect,
    topics,
    codecs: { state, inbound, internal, flags, request, work, reason, suspended, projection },
    upsert,
    rows,
    up,
    upWork,
    upRequest,
    upReason,
    readWork,
    snapshot,
  }
}
