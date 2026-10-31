/**
 * The process `sqlite-transaction.test.ts` kills: it commits one row, writes a second in a transaction it never
 * ends, says so on its output, and waits there to be killed.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import * as Effect from 'effect/Effect'
import { SqlClient } from 'effect/sql'

const filename = Bun.argv[2] ?? ''

await Effect.runPromise(Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  // As the runtime's storage holds its file (decision 0080).
  yield* sql`PRAGMA locking_mode = EXCLUSIVE`
  yield* sql`CREATE TABLE rows (name TEXT NOT NULL)`
  yield* sql.withTransaction(sql`INSERT INTO rows (name) VALUES ('committed')`)
  yield* sql.withTransaction(Effect.gen(function*() {
    yield* sql`INSERT INTO rows (name) VALUES ('uncommitted')`
    yield* Effect.sync(() => process.stdout.write('inside\n'))
    yield* Effect.never
  }))
}).pipe(Effect.provide(SqliteClient.layer({ filename }))))
