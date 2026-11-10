/**
 * The tables of the runtime on Cluster: the versions each launch records, the versions each runner runs, the senders
 * that wait for a suspended entity, and the request ids of Cluster the runtime keeps, by which it deletes Cluster's
 * rows (decisions 0159, 0167, 0169, 0171, 0241).
 */
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import { SqlClient, type SqlError, type Statement } from 'effect/sql'
import { InvariantDefect, type Key, type Types } from '../program.ts'
import type { Storage } from '../storage.ts'
import type { Held } from './held.ts'
import { Count, keyRow, Standing } from './rows.ts'
import { dialectOf, transaction } from './tables.ts'

/**
 * Cluster's tables of messages and replies, under the prefix `SqlMessageStorage` takes by default: the runtime on
 * Cluster deletes their rows by request id, as Cluster has no operation that forgets a processed request
 * (decision 0169). A launcher that gives `SqlMessageStorage` another prefix keeps those rows.
 */
const clusterMessages = 'cluster_messages'
const clusterReplies = 'cluster_replies'

/**
 * Deletes Cluster's rows under the request ids of `table`, `effecttea_sent_requests` or `effecttea_given_requests`,
 * that `where` selects, then those ids, and gives how many ids went. Every row under an id goes: the request, its
 * replies and any envelope stored under it (decisions 0169, 0171).
 */
export const forgetUnder = (
  sql: SqlClient.SqlClient,
  table: 'effecttea_sent_requests' | 'effecttea_given_requests',
  where: Statement.Fragment,
) =>
  Effect.gen(function*() {
    const ids = sql`SELECT request_id FROM ${sql(table)} WHERE ${where}`
    yield* sql`DELETE FROM ${sql(clusterReplies)} WHERE request_id IN (${ids})`
    yield* sql`DELETE FROM ${sql(clusterMessages)} WHERE request_id IN (${ids})`
    // Only the length is read: a Cluster id may be past 2^53, which no row of the storage's decodes (decision 0157).
    const gone = yield* sql`DELETE FROM ${sql(table)} WHERE ${where} RETURNING 1 AS gone`
    return gone.length
  })

export const forgetSent = (sql: SqlClient.SqlClient, where: Statement.Fragment) => forgetUnder(sql, 'effecttea_sent_requests', where)

/** A program's name and the version it runs, as a launch on Cluster records them (decision 0159). */
export type Versioned = Readonly<{ name: string; version: number }>

/**
 * Records, for the runner at `address`, the version each of `programs` runs, and raises the newest version of each
 * program to it, in one transaction (decision 0159). A program whose version is older than the newest recorded is
 * the launcher's defect, which names the program and both versions, and records nothing. So is a program a launch
 * has renamed, which a runner of the old code would run under the name left (decision 0176). On SQLite the transaction
 * takes the file's write lock as it begins, which the driver does by default and this asks for by name, so that the
 * rule holds if the default changes; on PostgreSQL it locks the table. So two launches see each other's versions.
 */
export const recordVersions = (
  address: string,
  programs: ReadonlyArray<Versioned>,
): Effect.Effect<void, never, SqlClient.SqlClient> =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const dialect = dialectOf(sql)
    const record = Effect.gen(function*() {
      if (dialect === 'pg') yield* sql`LOCK TABLE effecttea_versions IN SHARE ROW EXCLUSIVE MODE`
      for (const { name, version } of programs) {
        const [held] = yield* Effect.flatMap(
          sql`SELECT version, renamed_to FROM effecttea_versions WHERE name = ${name}`,
          Schema.decodeUnknownEffect(Schema.Array(Standing)),
        )
        if (held?.renamed_to != null) {
          return yield* Effect.die(new InvariantDefect({
            reason: `the program ${name} is launched, and a launch has renamed it to ${held.renamed_to}`,
          }))
        }
        if (held !== undefined && held.version > version) {
          return yield* Effect.die(new InvariantDefect({
            reason: `the program ${name} is launched at version ${version}, and a launch has run it at version ${held.version}`,
          }))
        }
        yield* sql`
          INSERT INTO effecttea_versions (name, version) VALUES (${name}, ${version})
          ON CONFLICT (name) DO UPDATE SET version = excluded.version
        `
      }
      yield* sql`DELETE FROM effecttea_runner_versions WHERE address = ${address}`
      for (const { name, version } of programs) {
        yield* sql`INSERT INTO effecttea_runner_versions (address, name, version) VALUES (${address}, ${name}, ${version})`
      }
    })
    yield* transaction(sql, record, 'BEGIN IMMEDIATE')
  }).pipe(Effect.orDie)

/**
 * What a launch on Cluster recorded of the program `name`: the newest version, and the name a launch renamed it
 * to, or null; `undefined` where no launch recorded it. A step reads it in its transaction (decisions 0159, 0176).
 * On PostgreSQL the row is read `FOR SHARE`, so that a launch that raises the version or renames the program waits
 * for the steps that read it before, and on SQLite the transactions of one file come one after the other.
 */
export const standingOf = (
  name: string,
): Effect.Effect<Readonly<{ version: number; renamedTo: string | null }> | undefined, never, SqlClient.SqlClient> =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const share = sql.literal(dialectOf(sql) === 'pg' ? 'FOR SHARE' : '')
    const [held] = yield* Effect.flatMap(
      sql`SELECT version, renamed_to FROM effecttea_versions WHERE name = ${name} ${share}`,
      Schema.decodeUnknownEffect(Schema.Array(Standing)),
    )
    return held === undefined ? undefined : { version: held.version, renamedTo: held.renamed_to }
  }).pipe(Effect.orDie)

/** The newest version a launch on Cluster recorded of the program `name`, as `standingOf` reads it. */
export const newestVersion = (name: string): Effect.Effect<number | undefined, never, SqlClient.SqlClient> =>
  Effect.map(standingOf(name), (held) => held?.version)

/**
 * Whether the lease of the shard `shard`, a row of Cluster's `cluster_locks`, names the runner at `address` and has
 * not expired after `expiration`, Cluster's `shardLockExpiration`. Each condition is the exact complement of the one
 * under which Cluster's `SqlRunnerStorage` lets another runner take the lease, in whole seconds on SQLite
 * (decision 0175). A step reads it in its transaction. On PostgreSQL the row is read `FOR SHARE`, as `newestVersion`
 * reads its own.
 */
export const leased = (
  shard: string,
  address: string,
  expiration: Duration.Input,
): Effect.Effect<boolean, never, SqlClient.SqlClient> =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    // Rounded up to whole seconds, as `SqlRunnerStorage` rounds the expiration it takes a lease by.
    const seconds = sql.literal(String(Math.ceil(Duration.toSeconds(expiration))))
    const live = dialectOf(sql) === 'pg'
      ? sql`acquired_at >= NOW() - INTERVAL '${seconds} seconds' FOR SHARE`
      : sql`(strftime('%s', CURRENT_TIMESTAMP) - strftime('%s', acquired_at)) <= ${seconds}`
    const rows = yield* sql`
      SELECT 1 AS held FROM cluster_locks WHERE shard_id = ${shard} AND address = ${address} AND ${live}
    `
    return rows.length > 0
  }).pipe(Effect.orDie)

/**
 * Whether the runner at `address` runs an older version of a program than the newest recorded, or a program a
 * launch has renamed: `undefined` where no launch of the runtime recorded the address, a runner without the runtime
 * (decisions 0159, 0176).
 */
export const outranked = (address: string): Effect.Effect<boolean | undefined, SqlError.SqlError, SqlClient.SqlClient> =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql`
      SELECT COUNT(*) AS held,
        COUNT(CASE WHEN r.version < v.version OR v.renamed_to IS NOT NULL THEN 1 END) AS older
      FROM effecttea_runner_versions r JOIN effecttea_versions v ON v.name = r.name
      WHERE r.address = ${address}
    `
    const [found] = yield* Effect.orDie(
      Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({ held: Count, older: Count })))(rows),
    )
    if (found === undefined || found.held === 0) return undefined
    return found.older > 0
  })

/** The part of the storage of one program that keeps, on Cluster, its waiters and the request ids of Cluster. */
export const onClusterOf = <T extends Types>(held: Held<T>): Pick<
  Storage<T>,
  'wait' | 'waiters' | 'keepSent' | 'pendSent' | 'forgetPending' | 'keepGiven'
> => {
  const { sql, name } = held

  const wait = (id: string, sender: Readonly<{ name: string; id: string }>) =>
    sql`
      INSERT INTO effecttea_waiting (name, id, sender_name, sender_id) VALUES (${name}, ${id}, ${sender.name}, ${sender.id})
      ON CONFLICT (name, id, sender_name, sender_id) DO NOTHING
    `.pipe(Effect.asVoid, Effect.orDie)

  const waiters = (id: string) =>
    Effect.flatMap(
      sql`DELETE FROM effecttea_waiting WHERE name = ${name} AND id = ${id} RETURNING sender_name, sender_id`,
      Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({ sender_name: Schema.String, sender_id: Schema.String }))),
    ).pipe(
      Effect.map((rows) => rows.map((row) => ({ name: row.sender_name, id: row.sender_id }))),
      Effect.orDie,
    )

  // The asker's work is read in the step's transaction, which on SQLite comes after every other: the step that ends
  // the work either commits before, and the id is pending, or after, and deletes the id's rows (decision 0169).
  const keepSent = (
    requestId: string,
    asked: Readonly<{ entity: Readonly<{ name: string; id: string }>; key: Key; incarnation: number }>,
  ) =>
    Effect.gen(function*() {
      const asking = keyRow(asked.key)
      const [held] = yield* sql<{ held: number }>`
        SELECT COUNT(*) AS held FROM effecttea_entity_keys
        WHERE name = ${asked.entity.name} AND id = ${asked.entity.id} AND key = ${asking.key}
          AND parameter = ${asking.parameter} AND incarnation = ${asked.incarnation}
      `
      if (Number(held?.held ?? 0) === 0) return yield* Effect.as(pendSent(requestId), false)
      yield* sql`
        INSERT INTO effecttea_sent_requests ${
        sql.insert({
          request_id: requestId,
          sender_name: asked.entity.name,
          sender_id: asked.entity.id,
          sender_key: asking.key,
          sender_parameter: asking.parameter,
          sender_incarnation: asked.incarnation,
        })
      }
        ON CONFLICT (request_id) DO NOTHING
      `
      return true
    }).pipe(Effect.orDie)

  const pendSent = (requestId: string) =>
    sql`INSERT INTO effecttea_sent_requests ${sql.insert({ request_id: requestId })} ON CONFLICT (request_id) DO NOTHING`.pipe(
      Effect.asVoid,
      Effect.orDie,
    )

  const forgetPending = forgetSent(sql, sql`sender_name IS NULL`).pipe(Effect.orDie)

  const keepGiven = (requestId: string, id: string, until: number) =>
    sql`
      INSERT INTO effecttea_given_requests ${sql.insert({ request_id: requestId, name, id, until })}
      ON CONFLICT (request_id) DO NOTHING
    `.pipe(Effect.asVoid, Effect.orDie)

  return { wait, waiters, keepSent, pendSent, forgetPending, keepGiven }
}
