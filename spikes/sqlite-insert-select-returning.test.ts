/**
 * What decision 0070 says of `reindex`'s write, at `@effect/sql-sqlite-bun` 4.1.2, written as the storage writes it:
 * an `INSERT OR REPLACE … SELECT … WHERE … RETURNING` replaces the row only where the `WHERE` still holds, and
 * gives one row for each row it wrote, none where it wrote nothing. That one statement is atomic is SQLite's
 * (documented: "each SQL statement is a transaction" unless one is open, in its page on transactions).
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import { SqlClient } from 'effect/sql'

test('a row is written only where the state it was read from is still stored, and RETURNING counts it', () =>
  Effect.runPromise(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    yield* sql`CREATE TABLE entities (id TEXT PRIMARY KEY, state TEXT NOT NULL, version INTEGER NOT NULL)`
    yield* sql`CREATE TABLE projections (id TEXT PRIMARY KEY, projection TEXT NOT NULL)`
    yield* sql`INSERT INTO entities (id, state, version) VALUES ('a', 'one', 1), ('b', 'two', 1)`
    yield* sql`INSERT INTO projections (id, projection) VALUES ('a', 'old'), ('b', 'old')`
    const rewrite = (id: string, state: string, version: number, projection: string) =>
      sql<{ id: string }>`
        INSERT OR REPLACE INTO projections (id, projection)
        SELECT id, ${projection} FROM entities WHERE id = ${id} AND state = ${state} AND version = ${version}
        RETURNING id
      `
    expect(yield* rewrite('a', 'one', 1, 'new')).toEqual([{ id: 'a' }])
    // A step wrote another state, or the same text at another version, since it was read: nothing is written.
    expect(yield* rewrite('b', 'stale', 1, 'new')).toEqual([])
    expect(yield* rewrite('b', 'two', 2, 'new')).toEqual([])
    expect(yield* sql`SELECT id, projection FROM projections ORDER BY id`).toEqual([
      { id: 'a', projection: 'new' },
      { id: 'b', projection: 'old' },
    ])
  }).pipe(Effect.provide(SqliteClient.layer({ filename: ':memory:' })))))
