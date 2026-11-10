/**
 * What a role of PostgreSQL that may only read and write rows does with the storage's tables, at
 * `@effect/sql-pglite` 4.1.3 and the `@electric-sql/pglite` it pins (decisions 0191, 0216). The owner creates the
 * tables, and the role is granted the rows of each. The role may not create a table, runs `createTables` where every
 * migration is recorded, and steps a runtime launched with `tables: 'existing'`.
 */
import { PgliteClient } from '@effect/sql-pglite'
import { expect, test } from 'bun:test'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/sql'
import { program } from '../src/program.ts'
import { launch } from '../src/runtime.ts'
import { createTables } from '../src/storage.ts'

const counter = program({
  state: Schema.Struct({ count: Schema.Number }),
  flags: Schema.Struct({ at: Schema.DateTimeUtcFromMillis }),
  inbound: Schema.TaggedStruct('Add', {}),
  projection: Schema.Number,
})({
  name: 'Counter',
  init: () => ({ count: 0 }),
  update: () => (state) => ({ count: state.count + 1 }),
  project: (state) => state.count,
})

test('a role that may only read and write rows creates no table, runs migrations recorded, and steps a runtime', () =>
  Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    yield* createTables
    yield* sql`CREATE ROLE app`
    yield* sql`REVOKE CREATE ON SCHEMA public FROM PUBLIC`
    yield* sql`GRANT USAGE ON SCHEMA public TO app`
    yield* sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app`
    yield* sql`SET ROLE app`
    const refused = yield* Effect.exit(sql`CREATE TABLE effecttea_other (name TEXT)`)
    expect(Exit.isFailure(refused) ? String(refused.cause) : null).toContain('permission denied for schema public')
    yield* createTables
    const runtime = yield* launch({ tables: 'existing' })
    const counters = yield* runtime.deploy(counter)
    const sender = null
    const at = DateTime.makeUnsafe(0)
    expect(yield* counters.create('c', { flags: { at }, requestId: 'made', sender })).toEqual({ _tag: 'Created' })
    expect(yield* counters.send('c', { _tag: 'Add' }, { requestId: 'added', sender, keep: 'forever' })).toEqual({ _tag: 'Accepted' })
    expect(yield* counters.read('c')).toBe(1)
  })).pipe(Effect.provide(PgliteClient.layer({})))))
