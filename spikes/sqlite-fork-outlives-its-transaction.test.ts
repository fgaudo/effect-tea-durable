/**
 * What decision 0243 sees of `effect/sql` 4.1.3, on `@effect/sql-sqlite-bun` over a file: a fiber forked inside a
 * transaction, which keeps the transaction in its services and runs a statement once the transaction has committed,
 * fails that statement with a `SqlError`. At 4.1.2 the statement ran on the transaction's connection
 * (Effect-TS/effect#10431). A fiber forked without the transaction, as `untransacted` of `src/runtime/process.ts`
 * forks, runs its statement.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Latch from 'effect/Latch'
import { SqlClient, SqlError } from 'effect/sql'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** The exit of a statement that a fiber forked inside a transaction runs once the transaction has committed. */
const after = (filename: string, untransacted: boolean) =>
  Effect.runPromise(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    yield* sql`CREATE TABLE rows (name TEXT NOT NULL)`
    const committed = yield* Latch.make()
    const statement = Effect.andThen(committed.await, sql`INSERT INTO rows (name) VALUES ('late')`)
    const forked = untransacted
      ? Effect.updateContext(statement, (services: Context.Context<never>) =>
        Context.omit(sql.transactionService)(services))
      : statement
    const fiber = yield* sql.withTransaction(Effect.forkDetach(forked))
    yield* committed.open
    return yield* Fiber.await(fiber)
  }).pipe(Effect.provide(SqliteClient.layer({ filename }))))

const inDirectory = async (body: (filename: string) => Promise<void>) => {
  const directory = mkdtempSync(join(tmpdir(), 'effect-tea-persistent-spike-'))
  try {
    await body(join(directory, 'store.db'))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('a fiber that outlives its transaction fails its statement with a SqlError', () =>
  inDirectory(async (filename) => {
    const exit = await after(filename, false)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const error = exit.cause.reasons.find((reason) => reason._tag === 'Fail')
      expect(error !== undefined && SqlError.isSqlError(error.error)).toBe(true)
    }
  }))

test('a fiber forked without the transaction runs its statement after the commit', () =>
  inDirectory(async (filename) => {
    expect(Exit.isSuccess(await after(filename, true))).toBe(true)
  }))
