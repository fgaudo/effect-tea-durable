/**
 * What decision 0053 says of a limit, at `@effect/sql-sqlite-bun` 4.1.3, bound as the storage binds it: a negative
 * `LIMIT` is no limit, which a query left without one is given as `-1`, and a fractional one fails. A handle refuses
 * both before they reach SQLite.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import { SqlClient } from 'effect/sql'

const limited = (limit: number) =>
  Effect.runPromiseExit(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    yield* sql`CREATE TABLE rows (n INTEGER)`
    yield* sql`INSERT INTO rows (n) VALUES (1), (2), (3)`
    const rows = yield* sql<{ n: number }>`SELECT n FROM rows ORDER BY n LIMIT ${limit}`
    return rows.map(({ n }) => n)
  }).pipe(Effect.provide(SqliteClient.layer({ filename: ':memory:' }))))

test('a negative limit reads every row', async () => {
  expect(await limited(-1)).toEqual(Exit.succeed([1, 2, 3]))
  expect(await limited(-5)).toEqual(Exit.succeed([1, 2, 3]))
})

test('a fractional limit fails', async () => {
  expect(Exit.isFailure(await limited(2.5))).toBe(true)
})
