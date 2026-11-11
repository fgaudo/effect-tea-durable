/**
 * What two clients of PGlite opened over one data directory do, at `@effect/sql-pglite` 4.1.3 and the
 * `@electric-sql/pglite` it pins (decision 0255): each opens with no error, and each holds a copy of its own.
 */
import { PgliteClient } from '@effect/sql-pglite'
import { expect, test } from 'bun:test'
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Scope from 'effect/Scope'
import { SqlClient } from 'effect/sql'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const client = (scope: Scope.Scope, dataDir: string) =>
  Effect.map(
    Scope.provide(Layer.build(Layer.orDie(PgliteClient.layer({ dataDir }))), scope),
    (context) => Context.get(context, SqlClient.SqlClient),
  )

// Decision 0255 refuses a runtime on a second client over a directory a client it launched on holds. It rests on what
// this spike sees: the second client opens with no error, steps a copy of its own, and a write of the first is lost.
test('a second client over the data directory opens, sees no write of the first, and its close loses that write', () => {
  const directory = mkdtempSync(join(tmpdir(), 'effect-tea-persistent-'))
  const dataDir = join(directory, 'pg')
  return Effect.runPromise(Effect.gen(function*() {
    const firstScope = yield* Scope.make()
    const first = yield* client(firstScope, dataDir)
    yield* first`CREATE TABLE t (n integer)`
    const secondScope = yield* Scope.make()
    const second = yield* client(secondScope, dataDir)
    yield* first`INSERT INTO t VALUES (1)`
    expect(yield* first`SELECT n FROM t`).toEqual([{ n: 1 }])
    expect(yield* second`SELECT n FROM t`).toEqual([])
    // The first closes, then the second: a client opened after both reads the second's copy.
    yield* Scope.close(firstScope, Exit.void)
    yield* Scope.close(secondScope, Exit.void)
    const thirdScope = yield* Scope.make()
    const third = yield* client(thirdScope, dataDir)
    expect(yield* third`SELECT n FROM t`).toEqual([])
    yield* Scope.close(thirdScope, Exit.void)
  })).finally(() => rmSync(directory, { recursive: true, force: true }))
}, 60_000)
