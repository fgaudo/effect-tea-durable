/**
 * The databases the tests run on, one of each dialect the storage speaks (decision 0157). PostgreSQL is PGlite, or a
 * server where `POSTGRES_URL` names one, so that what many connections do is tested (decision 0222). It is for the
 * tests, and the library does not export it.
 */
import { PGlite } from '@electric-sql/pglite'
import { PgClient } from '@effect/sql-pg'
import { PgliteClient } from '@effect/sql-pglite'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { beforeAll } from 'bun:test'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Redacted from 'effect/Redacted'
import type * as Scope from 'effect/Scope'
import { SqlClient } from 'effect/sql'
import type { Dialect } from './storage.ts'

/**
 * The URL of a server of PostgreSQL the tests run on in place of PGlite, from `POSTGRES_URL`. Its role makes and drops
 * databases, and is a superuser where a test sets what only a superuser may.
 */
export const server: string | undefined = Bun.env['POSTGRES_URL'] || undefined

/**
 * The data of a new database of PGlite, which each test copies, since a copy starts in a fifth of the time of a new
 * database (decision 0157).
 */
let empty: Promise<File | Blob> | undefined
const copied = () =>
  empty ??= PGlite.create().then(async (pg) => {
    const dump = await pg.dumpDataDir('none')
    await pg.close()
    return dump
  })

// The first database of PGlite takes seconds to make, and more under load. A test that made it would spend its own
// timeout on it, so every file that imports this module makes it first, in a hook with a timeout of its own. A run of
// one process makes it once, and each shard or worker once per file (decision 0242).
if (server === undefined) beforeAll(async () => void await copied(), 60_000)

let made = 0

/** The URL of the database `name` on the server at `url`. */
const at = (url: string, name: string) => {
  const located = new URL(url)
  located.pathname = `/${name}`
  return located.toString()
}

/** Runs `statement` on the server's own database, on a client that lives for it alone. */
const administer = (url: string, statement: string) =>
  Effect.scoped(Effect.flatMap(
    Layer.build(PgClient.layer({ url: Redacted.make(url), maxConnections: 1 })),
    (context) => Effect.asVoid(Effect.flatMap(Effect.provideContext(SqlClient.SqlClient, context), (sql) => sql.unsafe(statement))),
  )).pipe(Effect.orDie)

/**
 * A new database on the server, dropped when the scope closes, given by its URL. Each test makes its own, as each
 * test of PGlite copies a new one, so that no test reads what another wrote. The name is drawn each time the effect
 * runs, so that a layer built twice makes two databases, as a copy of PGlite would.
 */
export const database = (url: string): Effect.Effect<string, never, Scope.Scope> =>
  Effect.suspend(() => {
    const name = `effecttea_test_${process.pid}_${made++}`
    return Effect.acquireRelease(
      Effect.as(administer(url, `CREATE DATABASE ${name}`), at(url, name)),
      () => administer(url, `DROP DATABASE ${name} WITH (FORCE)`),
    )
  })

/** A pool of connections to the database at `url`, with the options of `PgClient` given. */
export const pool = (url: string, options: Omit<PgClient.PgPoolConfig, 'url'> = {}) =>
  PgClient.layer({ ...options, url: Redacted.make(url) }).pipe(Layer.orDie)

/** A client of a new database of `dialect`: SQLite in memory, or PostgreSQL on the server or else on PGlite. */
export const client = (dialect: Dialect): Layer.Layer<SqlClient.SqlClient> =>
  dialect === 'sqlite'
    ? Layer.orDie(SqliteClient.layer({ filename: ':memory:' }))
    : server !== undefined
    ? Layer.unwrap(Effect.map(database(server), (url) => pool(url)))
    : Layer.orDie(
      Layer.unwrap(Effect.map(Effect.promise(copied), (loadDataDir) => PgliteClient.layer({ loadDataDir }))),
    )

/** Runs `run` on each of `dialects`, one after the other. A failure names the dialect it failed on. */
export const onEach = async (dialects: ReadonlyArray<Dialect>, run: (dialect: Dialect) => Promise<unknown>) => {
  for (const dialect of dialects) {
    try {
      await run(dialect)
    } catch (thrown) {
      throw new Error(`on ${dialect}${dialect === 'pg' && server !== undefined ? ' (server)' : ''}`, { cause: thrown })
    }
  }
}
