/**
 * What decision 0144 says of the clause a query pages with, at `@effect/sql-sqlite-bun` 4.1.3, on the table and the
 * index the storage creates: SQLite reads the clause as no range of the index, so a page walks the rows of the
 * program from the first and drops the ones before its cursor. A comparison of the index alone is read as a range,
 * and so is each half of a `UNION ALL` of the rows that tie and the rows past, which SQLite then sorts whole.
 * An index that holds the id too changes none of it.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import { SqlClient } from 'effect/sql'

const column = `json_extract(indexes, '$.rank')`

/** The ways SQLite searches in the plan of `statement`, bound as the storage binds a page. */
const searches = (sql: SqlClient.SqlClient, statement: string, bound: ReadonlyArray<string | number>) =>
  Effect.map(
    sql.unsafe<{ detail: string }>(`EXPLAIN QUERY PLAN ${statement}`, [...bound]),
    (rows) => rows.map(({ detail }) => detail).filter((detail) => detail.startsWith('SEARCH')),
  )

const planned = (withId: boolean) =>
  Effect.runPromise(
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      yield* sql`
        CREATE TABLE projections (
          name TEXT NOT NULL,
          id TEXT NOT NULL,
          projection TEXT NOT NULL,
          indexes TEXT NOT NULL,
          version INTEGER NOT NULL,
          PRIMARY KEY (name, id)
        )
      `
      yield* sql.unsafe(`CREATE INDEX ranked ON projections (name, ${column}${withId ? ', id' : ''})`)
      const order = `ORDER BY ${column} ASC, id LIMIT 2`
      return {
        range: yield* searches(sql, `SELECT id FROM projections WHERE name = ? AND ${column} > ? ${order}`, ['P', 1]),
        page: yield* searches(
          sql,
          `SELECT id FROM projections WHERE name = ? AND (${column} > ? OR (${column} = ? AND id > ?)) ${order}`,
          ['P', 1, 1, 'f'],
        ),
        rowValue: yield* searches(
          sql,
          `SELECT id FROM projections WHERE name = ? AND (${column}, id) > (?, ?) ${order}`,
          ['P', 1, 'f'],
        ),
        union: yield* searches(
          sql,
          `SELECT id FROM (
            SELECT id, ${column} AS rank FROM projections WHERE name = ? AND ${column} = ? AND id > ?
            UNION ALL SELECT id, ${column} FROM projections WHERE name = ? AND ${column} > ?
          ) ORDER BY rank ASC, id LIMIT 2`,
          ['P', 1, 'f', 'P', 1],
        ),
      }
    }).pipe(Effect.provide(SqliteClient.layer({ filename: ':memory:' })), Effect.orDie),
  )

test('the clause of a page is searched by the name alone, and a comparison of the index as a range', async () => {
  const plans = await planned(false)
  expect(plans.range).toEqual(['SEARCH projections USING INDEX ranked (name=? AND <expr>>?)'])
  expect(plans.page).toEqual(['SEARCH projections USING INDEX ranked (name=?)'])
  expect(plans.rowValue).toEqual(['SEARCH projections USING INDEX ranked (name=?)'])
  expect(plans.union).toEqual([
    'SEARCH projections USING INDEX sqlite_autoindex_projections_1 (name=? AND id>?)',
    'SEARCH projections USING INDEX ranked (name=? AND <expr>>?)',
  ])
})

test('an index that holds the id too is searched the same way', async () => {
  const plans = await planned(true)
  expect(plans.page).toEqual(['SEARCH projections USING COVERING INDEX ranked (name=?)'])
  expect(plans.rowValue).toEqual(['SEARCH projections USING COVERING INDEX ranked (name=?)'])
  expect(plans.union).toEqual([
    'SEARCH projections USING COVERING INDEX ranked (name=? AND <expr>=? AND id>?)',
    'SEARCH projections USING COVERING INDEX ranked (name=? AND <expr>>?)',
  ])
})
