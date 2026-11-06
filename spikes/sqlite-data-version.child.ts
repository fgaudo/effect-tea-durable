/**
 * The process `sqlite-data-version.test.ts` starts: it commits one row to the file it is given, in a transaction,
 * and exits.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import * as Effect from 'effect/Effect'
import { SqlClient } from 'effect/sql'

const filename = Bun.argv[2] ?? ''

await Effect.runPromise(Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  yield* sql.withTransaction(sql`INSERT INTO rows (name) VALUES ('other')`)
}).pipe(Effect.provide(SqliteClient.layer({ filename }))))
