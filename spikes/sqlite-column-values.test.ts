/**
 * What decision 0062 says of the rows SQLite gives, at `@effect/sql-sqlite-bun` 4.1.1: a declared type does not
 * keep a column to it, so a row holds what was written into it, and only the row's schema can say it is no row the
 * runtime writes. An `INTEGER` column gives a number, `NULL` gives `null`, and a column given a fraction or a text
 * gives it back as it was written. And what decision 0071 reads: a `UNION` gives an id both readings find once.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import { SqlClient } from 'effect/sql'

const database = <A>(body: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
  Effect.runPromise(
    Effect.flatMap(SqlClient.SqlClient, body).pipe(
      Effect.provide(SqliteClient.layer({ filename: ':memory:' })),
      Effect.orDie,
    ),
  )

test('a column holds what was written into it, whatever its declared type', () =>
  database((sql) =>
    Effect.gen(function*() {
      yield* sql`CREATE TABLE rows (n INTEGER, t TEXT)`
      yield* sql`INSERT INTO rows (n, t) VALUES (1, 'one'), (NULL, NULL), (1.5, 2), ('x', 'two')`
      expect(yield* sql`SELECT n, t FROM rows ORDER BY rowid`).toEqual([
        { n: 1, t: 'one' },
        { n: null, t: null },
        { n: 1.5, t: '2' },
        { n: 'x', t: 'two' },
      ])
    })))

test('a union gives each id once', () =>
  database((sql) =>
    Effect.gen(function*() {
      yield* sql`CREATE TABLE keys (id TEXT)`
      yield* sql`CREATE TABLE mailbox (id TEXT)`
      yield* sql`INSERT INTO keys (id) VALUES ('a'), ('b'), ('b')`
      yield* sql`INSERT INTO mailbox (id) VALUES ('b'), ('c'), ('c')`
      expect(yield* sql`SELECT id FROM keys UNION SELECT id FROM mailbox ORDER BY id`).toEqual([
        { id: 'a' },
        { id: 'b' },
        { id: 'c' },
      ])
    })))
