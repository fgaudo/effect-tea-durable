/**
 * The holder `sqlite-hold-file.test.ts` runs: it holds a file of SQLite by a file of its own beside it, as the
 * runtime's storage does (decision 0267), says so on its output, then commits a pair of rows every few milliseconds
 * until it is killed.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import * as Effect from 'effect/Effect'
import { SqlClient } from 'effect/sql'

const filename = Bun.argv[2] ?? ''

await Effect.runPromise(Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  yield* sql`ATTACH DATABASE ${`${filename}-effecttea-hold`} AS effecttea_hold`
  yield* sql`PRAGMA effecttea_hold.locking_mode = EXCLUSIVE`
  yield* sql.withTransaction(Effect.andThen(
    sql`CREATE TABLE IF NOT EXISTS effecttea_hold.hold (id INTEGER PRIMARY KEY)`,
    sql`INSERT OR REPLACE INTO effecttea_hold.hold (id) VALUES (1)`,
  ))
  const [main] = yield* sql<{ locking_mode: string }>`PRAGMA main.locking_mode`
  yield* sql`CREATE TABLE IF NOT EXISTS rows (pair INTEGER NOT NULL)`
  yield* Effect.sync(() => process.stdout.write(`held ${main?.locking_mode}\n`))
  let pair = 0
  while (true) {
    pair += 1
    // Two rows of one pair in one transaction: a reader that sees one of them sees both.
    yield* sql.withTransaction(Effect.andThen(
      sql`INSERT INTO rows (pair) VALUES (${pair})`,
      sql`INSERT INTO rows (pair) VALUES (${pair})`,
    ))
    yield* Effect.promise(() => Bun.sleep(5))
  }
}).pipe(Effect.provide(SqliteClient.layer({ filename }))))
