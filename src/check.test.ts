/**
 * The check of a program against the stored entities, before its deploy: what it finds, against what a deploy of the
 * same program then does, and what it refuses (decision 0247).
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { describe, expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Context from 'effect/Context'
import * as Layer from 'effect/Layer'
import * as Scope from 'effect/Scope'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SqlClient } from 'effect/sql'
import { TestClock } from 'effect/testing'
import { check } from './check.ts'
import { defect, type Program } from './program.ts'
import { storage } from './storage.ts'
import { all, database, hands, onBoth, process, program, ran, type T, tester } from './runtime.test_shared.ts'

/** The cause a check dies with, as its message. */
const diesWith = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.map(Effect.exit(effect), (exit) => {
    const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
    return cause instanceof Error ? cause.message : null
  })

/** Three toys whose operations ran, each left with its timer under way; 't-2' applied a message. */
const settled = Effect.gen(function*() {
  const at = yield* DateTime.now
  yield* process({}, (runtime) =>
    Effect.gen(function*() {
      const { layer } = yield* hands()
      const toy = yield* Effect.provide(runtime.deploy(program), layer)
      for (const id of ['t-1', 't-2', 't-3']) {
        yield* toy.create(id, { flags: { at }, requestId: `c-${id}`, sender: tester })
      }
      yield* toy.send('t-2', { _tag: 'Want', key: 't', on: true, nonce: 'n' }, {
        requestId: 'w',
        sender: tester,
        keep: 'forever',
      })
      yield* runtime.settled
    }))
})

/** A new version that dies on the state of an entity that applied a message. */
const dying: Program<T> = {
  ...program,
  project: (state) => state.applied.length > 0 ? defect('project dies on a message applied') : program.project(state),
}

describe('the check of a program', () => {
  test('finds the entities whose activation the new program suspends, as a deploy then suspends them', () =>
    onBoth(Effect.gen(function*() {
      yield* settled
      const sql = yield* SqlClient.SqlClient
      const before = yield* sql`SELECT name, id, state, version, suspended_on FROM effecttea_entities ORDER BY id`
      // The old version holds the database while the new one is checked: the check launches nothing, and holds
      // nothing.
      const checked = yield* process({}, () => check(dying, { limit: all }))
      expect(checked).toEqual({
        active: {
          checked: 3,
          failing: 1,
          failed: [{
            id: 't-2',
            on: 'Activation',
            cause: expect.stringContaining('project dies on a message applied'),
          }],
        },
        suspended: { checked: 0, failing: 0, failed: [] },
      })
      // Nothing was written.
      expect(yield* sql`SELECT name, id, state, version, suspended_on FROM effecttea_entities ORDER BY id`)
        .toEqual(before)
      // A deploy of the program checked suspends the entity the check named, on its activation, with that cause.
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(dying), layer)
          for (const id of ['t-1', 't-2', 't-3']) yield* toy.read(id)
          yield* TestClock.adjust('60 millis')
          yield* runtime.settled
          const suspended = yield* toy.suspended
          expect(suspended.map(({ id, on, cause }) => ({ id, on, cause }))).toEqual([{
            id: 't-2',
            on: { _tag: 'Activation' },
            cause: checked.active.failed[0]!.cause,
          }])
        }))
    })))

  test('compares the operations under way with the new work, and calls the unknown of an at-most-once one', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          // The hands never come back, so every operation stays under way.
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* ran(toy.create('t-1', { flags: { at }, requestId: 'c', sender: tester }))
        }))
      const dropped: Program<T> = {
        ...program,
        work: (state) => Object.fromEntries(Object.entries(program.work(state)).filter(([key]) => key !== 'c')),
      }
      expect((yield* check(dropped, { limit: all })).active.failed).toEqual([{
        id: 't-1',
        on: 'Activation',
        cause: expect.stringContaining("the program dropped the operation under 'c' before its completion"),
      }])
      const unknowing: Program<T> = {
        ...program,
        operations: {
          ...program.operations,
          B: { ...program.operations.B, unknown: () => defect('unknown dies') } as typeof program.operations.B,
        },
      }
      expect((yield* check(unknowing, { limit: all })).active.failed).toEqual([{
        id: 't-1',
        on: 'Activation',
        cause: expect.stringContaining('unknown dies'),
      }])
      expect(yield* check(program, { limit: all })).toEqual({
        active: { checked: 1, failing: 0, failed: [] },
        suspended: { checked: 0, failing: 0, failed: [] },
      })
    })))

  test('tells a row the migrations do not read from an activation that suspends', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const next: Program<T> = { ...program, migrations: [{}] }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(next), layer)
          yield* toy.create('t-1', { flags: { at }, requestId: 'c', sender: tester })
          yield* runtime.settled
        }))
      // A rollback to version 1 reads no row version 2 wrote.
      expect((yield* check(program, { limit: all })).active.failed).toEqual([{
        id: 't-1',
        on: 'Load',
        cause: "Error: 'Toy' is version 1, and has no reading of version 2",
      }])
      // A migration that dies is the program's too.
      const migrating: Program<T> = { ...next, migrations: [{}, { state: () => defect('migration dies') }] }
      expect((yield* check(migrating, { limit: all })).active.failed).toEqual([{
        id: 't-1',
        on: 'Load',
        cause: expect.stringContaining('migration dies'),
      }])
    })))

  // Premise review, second reading, of Versions and deploys: decision 0269 reads the flags through the migrations of
  // `flags`, outside the guard decision 0247 runs the program's readings in.
  test('FAILING: a migration of the flags that dies on a stored row is a Load of its entity, as one of the state is', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const next: Program<T> = { ...program, migrations: [{}] }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(next), layer)
          yield* toy.create('t-1', { flags: { at }, requestId: 'c', sender: tester })
          yield* runtime.settled
        }))
      const migrating: Program<T> = { ...next, migrations: [{}, { flags: () => defect('migration of the flags dies') }] }
      const exit = yield* Effect.exit(check(migrating, { limit: all }))
      expect(Exit.isSuccess(exit) ? exit.value.active.failed : Cause.pretty(exit.cause)).toEqual([{
        id: 't-1',
        on: 'Load',
        cause: expect.stringContaining('migration of the flags dies'),
      }])
    })))

  test('checks a suspended entity as a resume would activate it', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create('t-1', { flags: { at }, requestId: 'c', sender: tester })
          yield* runtime.settled
          yield* toy.send('t-1', { _tag: 'Break', nonce: 'b' }, { requestId: 'b', sender: tester, keep: 'forever' })
        }))
      // The program deployed gets past the activation: the message it died on is not handled by the check.
      expect(yield* check(program, { limit: all })).toEqual({
        active: { checked: 0, failing: 0, failed: [] },
        suspended: { checked: 1, failing: 0, failed: [] },
      })
      const workless: Program<T> = { ...program, work: () => defect('work died') }
      const checked = yield* check(workless, { limit: all })
      expect(checked.suspended.failed).toEqual([{ id: 't-1', on: 'Activation', cause: expect.stringContaining('work died') }])
      // A resume by that program leaves the entity suspended, with the cause the check gave.
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(workless), layer)
          expect(yield* toy.resume('t-1')).toEqual({ _tag: 'StillSuspended', cause: checked.suspended.failed[0]!.cause })
        }))
    })))

  test('gives at most the limit of failures, and counts them all', () =>
    database(Effect.gen(function*() {
      yield* settled
      const failing: Program<T> = { ...program, project: () => defect('project dies') }
      const { active } = yield* check(failing, { limit: 2 })
      expect(active.checked).toBe(3)
      expect(active.failing).toBe(3)
      expect(active.failed.map(({ id }) => id)).toEqual(['t-1', 't-2'])
      expect((yield* check(failing, { limit: 0 })).active).toEqual({ checked: 3, failing: 3, failed: [] })
      expect(yield* diesWith(check(failing, { limit: -1 })))
        .toBe('the check is given a limit of -1, which is no non-negative integer')
    })))

  test('reads the entities of a name the launch renames to the program, as the rename would', () =>
    database(Effect.gen(function*() {
      yield* settled
      const renamed: Program<T> = { ...dying, name: 'Toy2' }
      expect(yield* check(renamed, { limit: all })).toEqual({
        active: { checked: 0, failing: 0, failed: [] },
        suspended: { checked: 0, failing: 0, failed: [] },
      })
      const { active } = yield* check(renamed, { limit: all, renames: { Toy: 'Toy2' } })
      expect(active.checked).toBe(3)
      expect(active.failed.map(({ id }) => id)).toEqual(['t-2'])
      expect(yield* diesWith(check(program, { limit: all, renames: { Toy: 'Toy2' } })))
        .toBe("the program 'Toy' is checked, and the launch renames it to 'Toy2'")
      expect(yield* diesWith(check(program, { limit: all, renames: { Toy: '' } })))
        .toBe("the launch renames 'Toy' to '', and a name is a string that is not empty")
    })))

  test('dies on what the runtime throws: a row that is no JSON, and tables another release made', () =>
    database(Effect.gen(function*() {
      yield* settled
      const sql = yield* SqlClient.SqlClient
      yield* sql`INSERT INTO effecttea_migrations (migration_id, name) VALUES (2, 'later')`
      expect(yield* diesWith(check(program, { limit: all })))
        .toBe('the tables are made by the migrations [0001_tables, 0002_later], and this release reads those of [0001_tables]')
      yield* sql`DELETE FROM effecttea_migrations WHERE migration_id = 2`
      yield* sql`UPDATE effecttea_entities SET state = '{' WHERE id = 't-2'`
      const exit = yield* Effect.exit(check(program, { limit: all }))
      expect(Exit.isFailure(exit) && Cause.squash(exit.cause) instanceof SyntaxError).toBe(true)
      // The storage reads the other entities as it did.
      expect((yield* storage(program, sql).load('t-1'))?.state.want).toEqual(['t'])
    })))

  // A check reads the tables a launch would read, so it dies where the launch dies (decision 0263).
  test('dies on PostgreSQL where a schema further on the search_path holds the tables', () =>
    database(
      Effect.gen(function*() {
        const sql = yield* SqlClient.SqlClient
        yield* sql.withTransaction(Effect.gen(function*() {
          yield* sql`CREATE SCHEMA runtime`
          yield* sql`SET LOCAL search_path TO runtime, public`
          expect(yield* diesWith(check(program, { limit: all }))).toContain(
            "the tables are in the schema 'public', and the search_path names 'runtime' before it",
          )
        }))
      }),
      ['pg'],
    ))

  test('refuses a program that cannot run as written, before it reads a row', () =>
    database(Effect.gen(function*() {
      const broken = { ...program, name: '' } as Program<T>
      expect(yield* diesWith(check(broken, { limit: all }))).not.toBeNull()
    })))

  // The check runs in the new version's process, on a client of its own, while the old version's runtime holds the
  // database (decision 0247). On SQLite the runtime holds a file of its own beside the database, and leaves the
  // database to any reader (decision 0267). The check's client is opened `readonly`, with no busy wait, so that it
  // waits for no step of the old version, and a reading it cannot take fails at once.
  test('a check from a client of its own reads a file of SQLite the old version holds', () => {
    const directory = mkdtempSync(join(tmpdir(), 'effect-tea-persistent-'))
    const filename = join(directory, 'store.db')
    const client = (scope: Scope.Scope, readonly = false) =>
      Effect.map(
        Scope.provide(Layer.build(Layer.orDie(SqliteClient.layer({ filename, busyTimeout: 0, readonly }))), scope),
        (context) => Context.get(context, SqlClient.SqlClient),
      )
    return Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const outer = yield* Effect.scope
      const old = yield* client(outer)
      const at = yield* DateTime.now
      yield* Effect.provideService(
        process({}, (runtime) =>
          Effect.gen(function*() {
            const { layer } = yield* hands()
            const toy = yield* Effect.provide(runtime.deploy(program), layer)
            yield* toy.create('t-1', { flags: { at }, requestId: 'c-t-1', sender: tester })
            // The new version's process opens its own client, and checks its program before it deploys it.
            const exit = yield* Effect.exit(Effect.flatMap(
              client(outer, true),
              (other) => Effect.provideService(check(program, { limit: all }), SqlClient.SqlClient, other),
            ))
            expect(Exit.isSuccess(exit) ? exit.value.active.checked : Cause.pretty(exit.cause)).toBe(1)
          })),
        SqlClient.SqlClient,
        old,
      )
    })).pipe(Effect.provide(TestClock.layer()))).finally(() => rmSync(directory, { recursive: true, force: true }))
  })
})
