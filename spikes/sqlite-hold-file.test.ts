/**
 * What a hold of a file of SQLite by a file of its own beside it keeps, at `@effect/sql-sqlite-bun` 4.1.3 on a file
 * in WAL mode (decisions 0267, 0268). The holder is another process, which attaches the hold file in the exclusive
 * locking mode and begins and commits an exclusive transaction that writes no row. The database stays in the normal
 * locking mode. A client opened `readonly` reads it beside the holder, one snapshot per transaction. A second holder is
 * refused at once under a busy timeout of 0. A holder killed gives the hold back, and so does a holder that detaches
 * the hold file. A hold taken again writes no file of the hold's, so that it needs no room on a full volume.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Scope from 'effect/Scope'
import { SqlClient } from 'effect/sql'
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const take = (sql: SqlClient.SqlClient, filename: string) =>
  Effect.gen(function*() {
    yield* sql`ATTACH DATABASE ${`${filename}-effecttea-hold`} AS effecttea_hold`
    yield* sql`PRAGMA effecttea_hold.locking_mode = EXCLUSIVE`
    yield* Effect.provideService(sql.withTransaction(Effect.void), SqlClient.BeginTransaction, 'BEGIN EXCLUSIVE')
  })

test('a hold file keeps a second holder out and lets readers read, and a holder killed gives it back', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'effect-tea-persistent-spike-'))
  const filename = join(directory, 'store.db')
  const child = Bun.spawn(['bun', join(import.meta.dir, 'sqlite-hold-file.child.ts'), filename], { stdout: 'pipe' })
  try {
    const reader = child.stdout.getReader()
    let said = ''
    while (!said.includes('\n')) {
      const { value, done } = await reader.read()
      if (done) break
      said += new TextDecoder().decode(value)
    }
    expect(said.trim()).toBe('held normal')
    await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const client = (options: { readonly readonly?: boolean }) =>
        Effect.map(
          Effect.flatMap(Effect.scope, (scope) =>
            Scope.provide(Layer.build(SqliteClient.layer({ filename, busyTimeout: 0, ...options })), scope)),
          (context) => Context.get(context, SqlClient.SqlClient),
        )
      const count = (sql: SqlClient.SqlClient) =>
        Effect.map(sql<{ n: number }>`SELECT count(*) AS n FROM rows`, ([row]) => row?.n ?? -1)
      // A reader opened `readonly` reads beside the holder, and a transaction of it reads one snapshot whole, while
      // the holder commits between its two readings.
      const reader = yield* client({ readonly: true })
      const [before, after] = yield* reader.withTransaction(Effect.gen(function*() {
        const before = yield* count(reader)
        yield* Effect.promise(() => Bun.sleep(50))
        return [before, yield* count(reader)] as const
      }))
      expect(after).toBe(before)
      expect(before % 2).toBe(0)
      yield* Effect.promise(() => Bun.sleep(50))
      expect(yield* count(reader)).toBeGreaterThan(before)
      // A second holder is refused at once, by a lock it cannot take.
      const second = yield* client({})
      const started = performance.now()
      const refused = yield* Effect.exit(take(second, filename))
      expect(performance.now() - started).toBeLessThan(1_000)
      expect(Exit.isFailure(refused)).toBe(true)
      yield* second`DETACH DATABASE effecttea_hold`.pipe(Effect.ignore)
      // The holder killed, however it ends, gives the hold back. A hold taken again writes no file of the hold's: the
      // first hold wrote what the file needs, and the transaction writes no row.
      child.kill(9)
      yield* Effect.promise(() => child.exited)
      const files = () =>
        readdirSync(directory).filter((name) => name.includes('effecttea-hold')).sort().map((name) => {
          const { size, mtimeMs } = statSync(join(directory, name))
          return { name, size, mtimeMs }
        })
      const left = files()
      const third = yield* client({})
      expect(Exit.isSuccess(yield* Effect.exit(take(third, filename)))).toBe(true)
      expect(files()).toEqual(left)
      expect(yield* count(third)).toBeGreaterThan(0)
      // A holder that detaches the hold file gives the hold back too.
      yield* third`DETACH DATABASE effecttea_hold`
      expect(Exit.isSuccess(yield* Effect.exit(take(second, filename)))).toBe(true)
    })))
  } finally {
    child.kill(9)
    await child.exited
    rmSync(directory, { recursive: true, force: true })
  }
})
