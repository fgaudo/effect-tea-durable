/**
 * The databases the tests run on, one of each dialect the storage speaks (decision 0157). It is for the tests, and
 * the library does not export it.
 */
import { PGlite } from '@electric-sql/pglite'
import { PgliteClient } from '@effect/sql-pglite'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import type { Dialect } from './storage.ts'

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

/** A client of a new database of `dialect`: SQLite in memory, or PostgreSQL on PGlite. */
export const client = (dialect: Dialect) =>
  dialect === 'sqlite'
    ? SqliteClient.layer({ filename: ':memory:' })
    : Layer.unwrap(Effect.map(Effect.promise(copied), (loadDataDir) => PgliteClient.layer({ loadDataDir })))

/** Runs `run` on each of `dialects`, one after the other. A failure names the dialect it failed on. */
export const onEach = async (dialects: ReadonlyArray<Dialect>, run: (dialect: Dialect) => Promise<unknown>) => {
  for (const dialect of dialects) {
    try {
      await run(dialect)
    } catch (thrown) {
      throw new Error(`on ${dialect}`, { cause: thrown })
    }
  }
}
