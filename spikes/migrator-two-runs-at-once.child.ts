/**
 * The first of the runs `migrator-two-runs-at-once.test.ts` makes on one file: its migration creates a table and
 * writes a row, says so on its output, and waits inside its transaction for the milliseconds it is given. It prints
 * the migrations it completed once `Migrator` returns.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import * as Effect from 'effect/Effect'
import { Migrator, SqlClient } from 'effect/sql'

const filename = Bun.argv[2] ?? ''
const held = Number(Bun.argv[3] ?? 0)

await Effect.runPromise(Effect.gen(function*() {
  const completed = yield* Migrator.make({})({
    loader: Migrator.fromRecord({
      '0001_tables': Effect.gen(function*() {
        const sql = yield* SqlClient.SqlClient
        yield* sql`CREATE TABLE tea_rows (name TEXT NOT NULL)`
        yield* sql`INSERT INTO tea_rows (name) VALUES ('first')`
        yield* Effect.sync(() => process.stdout.write('inside\n'))
        yield* Effect.sleep(held)
      }),
    }),
    table: 'tea_migrations',
  })
  yield* Effect.sync(() => process.stdout.write(`completed ${JSON.stringify(completed)}\n`))
}).pipe(Effect.provide(SqliteClient.layer({ filename }))))
