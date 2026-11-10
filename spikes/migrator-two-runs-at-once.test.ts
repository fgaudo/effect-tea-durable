/**
 * What `Migrator` of `effect/sql` does when two runs migrate one database at once, at `effect` 4.1.3 with
 * `@effect/sql-sqlite-bun` and `@effect/sql-pglite` 4.1.3 (the open question of the tables migrated by `Migrator`).
 * On SQLite the first run is another process, which waits inside its migration, and the second runs here on a
 * connection of its own. PGlite runs one session, so two runs at once on PostgreSQL are not seen here: what is seen
 * is what a role that may only read and write rows can do with the migrations an owner ran.
 */
import { PgliteClient } from '@effect/sql-pglite'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import { Migrator, SqlClient } from 'effect/sql'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const inDirectory = async (body: (filename: string) => Promise<void>) => {
  const directory = mkdtempSync(join(tmpdir(), 'effect-tea-persistent-spike-'))
  try {
    await body(join(directory, 'store.db'))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

// The second run's migration, which would fail on the table the first created if it ran after it.
const second = Migrator.make({})({
  loader: Migrator.fromRecord({
    '0001_tables': Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      yield* sql`CREATE TABLE effecttea_rows (name TEXT NOT NULL)`
      yield* sql`INSERT INTO effecttea_rows (name) VALUES ('second')`
    }),
  }),
  table: 'effecttea_migrations',
})

const contents = (filename: string) =>
  Effect.runPromise(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ name: string }>`SELECT name FROM effecttea_rows ORDER BY rowid`
    const recorded = yield* sql<{ migration_id: number }>`SELECT migration_id FROM effecttea_migrations`
    return { rows: rows.map(({ name }) => name), migrations: recorded.map(({ migration_id }) => migration_id) }
  }).pipe(Effect.provide(SqliteClient.layer({ filename }))))

// Starts the first run in its own process, and resolves once it waits inside its migration, which it leaves after
// `held` milliseconds. A run of this process that waits on the file's lock blocks its thread, since `bun:sqlite` is
// synchronous: so the first ends on its own.
const first = async (filename: string, held: number) => {
  const child = Bun.spawn(['bun', join(import.meta.dir, 'migrator-two-runs-at-once.child.ts'), filename, `${held}`], {
    stdout: 'pipe',
    stderr: 'inherit',
  })
  const reader = child.stdout.getReader()
  let output = ''
  const read = async (until: string) => {
    while (!output.includes(until)) {
      const { value, done } = await reader.read()
      if (done) break
      output += new TextDecoder().decode(value)
    }
    return output
  }
  expect(await read('inside')).toContain('inside')
  return async () => {
    await read('completed')
    await child.exited
    return output
  }
}

const timed = async <A, E>(
  filename: string,
  effect: Effect.Effect<A, E, SqlClient.SqlClient>,
  busyTimeout?: number,
) => {
  const started = performance.now()
  const exit = await Effect.runPromise(
    Effect.exit(effect).pipe(Effect.provide(SqliteClient.layer({ filename, busyTimeout }))),
  )
  return { exit, waited: performance.now() - started }
}

test('on SQLite a second run waits on the write lock until the first commits, then runs nothing', () =>
  inDirectory(async (filename) => {
    const finished = await first(filename, 1000)
    const { exit, waited } = await timed(filename, second)
    expect(await finished()).toContain('completed [[1,"tables"]]')
    expect(exit).toEqual(Exit.succeed([]))
    expect(waited).toBeGreaterThan(500)
    expect(await contents(filename)).toEqual({ rows: ['first'], migrations: [1] })
  }))

test('on SQLite a second run that waits longer than its busy timeout dies, and runs nothing', () =>
  inDirectory(async (filename) => {
    const finished = await first(filename, 2000)
    const { exit } = await timed(filename, second, 200)
    expect(await finished()).toContain('completed [[1,"tables"]]')
    expect(Exit.isFailure(exit) ? String(exit.cause) : null).toContain('LockTimeoutError')
    expect(await contents(filename)).toEqual({ rows: ['first'], migrations: [1] })
  }))

test('on SQLite a second run that begins without the write lock dies at once, and runs nothing', () =>
  inDirectory(async (filename) => {
    const finished = await first(filename, 1000)
    const deferred = second.pipe(Effect.provideService(SqlClient.BeginTransaction, 'BEGIN'))
    const { exit, waited } = await timed(filename, deferred)
    expect(await finished()).toContain('completed [[1,"tables"]]')
    expect(Exit.isFailure(exit) ? String(exit.cause) : null).toContain('LockTimeoutError')
    expect(waited).toBeLessThan(500)
    expect(await contents(filename)).toEqual({ rows: ['first'], migrations: [1] })
  }))

const migrations = (ids: ReadonlyArray<number>) =>
  Migrator.make({})({
    loader: Migrator.fromRecord(Object.fromEntries(ids.map((id) => [
      `000${id}_table${id}`,
      Effect.gen(function*() {
        const sql = yield* SqlClient.SqlClient
        yield* sql`CREATE TABLE ${sql(`effecttea_table${id}`)} (name TEXT NOT NULL)`
      }),
    ]))),
    table: 'effecttea_migrations',
  })

test('on PostgreSQL a role that may only read and write rows runs migrations up to date, and fails on a pending one', () =>
  Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    expect(yield* migrations([1])).toEqual([[1, 'table1']])
    yield* sql`CREATE ROLE app`
    yield* sql`REVOKE CREATE ON SCHEMA public FROM PUBLIC`
    yield* sql`GRANT USAGE ON SCHEMA public TO app`
    yield* sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app`
    yield* sql`SET ROLE app`
    expect(yield* migrations([1])).toEqual([])
    const pending = yield* Effect.exit(migrations([1, 2]))
    expect(Exit.isFailure(pending) ? String(pending.cause) : null).toContain('Migration "2_table2" failed')
    yield* sql`RESET ROLE`
    const recorded = yield* sql<{ migration_id: number }>`SELECT migration_id FROM effecttea_migrations`
    expect(recorded.map(({ migration_id }) => migration_id)).toEqual([1])
  })).pipe(Effect.provide(PgliteClient.layer({})))))
