/**
 * What a step's transaction rests on, at `@effect/sql-sqlite-bun` 4.1.2 on a file in WAL mode: a transaction is
 * stored whole or not at all, whether it fails, is interrupted, or its process is killed inside it (decisions 0002,
 * 0007, 0013).
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import { SqlClient } from 'effect/sql'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const names = (filename: string) =>
  Effect.runPromise(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ name: string }>`SELECT name FROM rows ORDER BY rowid`
    return rows.map(({ name }) => name)
  }).pipe(Effect.provide(SqliteClient.layer({ filename }))))

const inDirectory = async (body: (filename: string) => Promise<void>) => {
  const directory = mkdtempSync(join(tmpdir(), 'effect-tea-persistent-spike-'))
  try {
    await body(join(directory, 'store.db'))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('a transaction that fails, or is interrupted, stores nothing it wrote', () =>
  inDirectory(async (filename) => {
    await Effect.runPromise(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      yield* sql`CREATE TABLE rows (name TEXT NOT NULL)`
      const failed = yield* Effect.exit(sql.withTransaction(Effect.andThen(
        sql`INSERT INTO rows (name) VALUES ('failed')`,
        Effect.fail('failure'),
      )))
      expect(Exit.isFailure(failed)).toBe(true)
      const written = yield* Deferred.make<void>()
      const interrupted = yield* Effect.forkChild(sql.withTransaction(Effect.gen(function*() {
        yield* sql`INSERT INTO rows (name) VALUES ('interrupted')`
        yield* Deferred.succeed(written, undefined)
        yield* Effect.never
      })))
      yield* Deferred.await(written)
      yield* Fiber.interrupt(interrupted)
      yield* sql.withTransaction(sql`INSERT INTO rows (name) VALUES ('committed')`)
    }).pipe(Effect.provide(SqliteClient.layer({ filename }))))
    expect(await names(filename)).toEqual(['committed'])
  }))

test('a process killed inside a transaction leaves what it committed before, and nothing of the transaction', () =>
  inDirectory(async (filename) => {
    const child = Bun.spawn(['bun', join(import.meta.dir, 'sqlite-transaction.child.ts'), filename], {
      stdout: 'pipe',
      stderr: 'inherit',
    })
    const reader = child.stdout.getReader()
    let output = ''
    while (!output.includes('inside')) {
      const { value, done } = await reader.read()
      if (done) break
      output += new TextDecoder().decode(value)
    }
    expect(output).toContain('inside')
    // No finalizer runs: the process dies as on a crash, with its transaction open on the file.
    child.kill('SIGKILL')
    await child.exited
    expect(await names(filename)).toEqual(['committed'])
  }))
