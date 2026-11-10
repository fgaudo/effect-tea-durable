/**
 * What a runner on Cluster learns of another runner's commit, at `@effect/sql-sqlite-bun` 4.1.3 on a file in WAL
 * mode: `PRAGMA data_version` read on one connection moves once another process commits to the file, and not at the
 * connection's own commit (decision 0163).
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import { SqlClient } from 'effect/sql'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('data_version moves at a commit of another process, and not at the connection’s own', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'effect-tea-persistent-spike-'))
  const filename = join(directory, 'store.db')
  try {
    await Effect.runPromise(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const version = Effect.map(sql<{ data_version: number }>`PRAGMA data_version`, ([row]) => row?.data_version)
      expect((yield* sql<{ journal_mode: string }>`PRAGMA journal_mode`)[0]?.journal_mode).toBe('wal')
      yield* sql`CREATE TABLE rows (name TEXT NOT NULL)`
      const first = yield* version
      yield* sql.withTransaction(sql`INSERT INTO rows (name) VALUES ('own')`)
      expect(yield* version).toBe(first)
      const child = Bun.spawn(['bun', join(import.meta.dir, 'sqlite-data-version.child.ts'), filename])
      expect(yield* Effect.promise(() => child.exited)).toBe(0)
      const moved = yield* version
      expect(moved).not.toBe(first)
      // It stays where it moved until another connection commits again.
      yield* sql.withTransaction(sql`INSERT INTO rows (name) VALUES ('own again')`)
      expect(yield* version).toBe(moved)
      // A reading after the move reads what the other process committed.
      const rows = yield* sql<{ name: string }>`SELECT name FROM rows ORDER BY rowid`
      expect(rows.map(({ name }) => name)).toEqual(['own', 'other', 'own again'])
    }).pipe(Effect.provide(SqliteClient.layer({ filename }))))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})
