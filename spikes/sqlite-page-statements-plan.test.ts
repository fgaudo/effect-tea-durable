/**
 * What decision 0145 says of the statements a page is read as, at `@effect/sql-sqlite-bun` 4.1.3, on the table the
 * storage creates and an index of the name, the expression and the id. Each statement is searched as a range of the
 * index, in the order it gives, so that no plan sorts: the rows that tie with the cursor past its id, the rows past
 * its value, and the rows that hold no value. A descending order whose ids ascend among the rows that tie sorts each
 * run of rows that tie, which an order that reverses the ids too does not. `> -Infinity` is searched as a range past
 * the rows that hold no value, where `IS NOT NULL` is searched by the name alone.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import { SqlClient } from 'effect/sql'

const column = `json_extract(indexes, '$.rank')`

/** The plan of `statement`, bound as the storage binds a page: each line, whether it searches or sorts. */
const plan = (sql: SqlClient.SqlClient, statement: string, bound: ReadonlyArray<string | number>) =>
  Effect.map(
    sql.unsafe<{ detail: string }>(`EXPLAIN QUERY PLAN ${statement}`, [...bound]),
    (rows) => rows.map(({ detail }) => detail),
  )

const within = <A>(body: (sql: SqlClient.SqlClient) => Effect.Effect<A, unknown>) =>
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
      yield* sql.unsafe(`CREATE INDEX ranked ON projections (name, ${column}, id)`)
      return yield* body(sql)
    }).pipe(Effect.provide(SqliteClient.layer({ filename: ':memory:' })), Effect.orDie),
  )

const select = `SELECT id, projection FROM projections WHERE name = ?`

test('each statement of a page is searched as a range of the index, and none sorts', async () => {
  const plans = await within((sql) =>
    Effect.all({
      first: plan(sql, `${select} ORDER BY ${column} ASC, id ASC LIMIT 2`, ['P']),
      firstDescending: plan(sql, `${select} ORDER BY ${column} DESC, id DESC LIMIT 2`, ['P']),
      tied: plan(sql, `${select} AND ${column} = ? AND id > ? ORDER BY id ASC LIMIT 2`, ['P', 1, 'f']),
      tiedDescending: plan(sql, `${select} AND ${column} = ? AND id < ? ORDER BY id DESC LIMIT 2`, ['P', 1, 'f']),
      tiedNull: plan(sql, `${select} AND ${column} IS NULL AND id > ? ORDER BY id ASC LIMIT 2`, ['P', 'f']),
      later: plan(sql, `${select} AND ${column} > ? ORDER BY ${column} ASC, id ASC LIMIT 2`, ['P', 1]),
      laterDescending: plan(sql, `${select} AND ${column} < ? ORDER BY ${column} DESC, id DESC LIMIT 2`, ['P', 1]),
      pastNull: plan(sql, `${select} AND ${column} > ? ORDER BY ${column} ASC, id ASC LIMIT 2`, ['P', -Infinity]),
      nulls: plan(sql, `${select} AND ${column} IS NULL ORDER BY id DESC LIMIT 2`, ['P']),
    })
  )
  const range = (terms: string) => [`SEARCH projections USING INDEX ranked (${terms})`]
  expect(plans).toEqual({
    first: range('name=?'),
    firstDescending: range('name=?'),
    tied: range('name=? AND <expr>=? AND id>?'),
    tiedDescending: range('name=? AND <expr>=? AND id<?'),
    tiedNull: range('name=? AND <expr>=? AND id>?'),
    later: range('name=? AND <expr>>?'),
    laterDescending: range('name=? AND <expr><?'),
    pastNull: range('name=? AND <expr>>?'),
    nulls: range('name=? AND <expr>=?'),
  })
})

test('a descending order whose ids ascend sorts, and IS NOT NULL is searched by the name alone', async () => {
  const plans = await within((sql) =>
    Effect.all({
      firstDescending: plan(sql, `${select} ORDER BY ${column} DESC, id ASC LIMIT 2`, ['P']),
      laterDescending: plan(sql, `${select} AND ${column} < ? ORDER BY ${column} DESC, id ASC LIMIT 2`, ['P', 1]),
      notNull: plan(sql, `${select} AND ${column} IS NOT NULL ORDER BY ${column} ASC, id ASC LIMIT 2`, ['P']),
    })
  )
  expect(plans).toEqual({
    firstDescending: ['SEARCH projections USING INDEX ranked (name=?)', 'USE TEMP B-TREE FOR LAST TERM OF ORDER BY'],
    laterDescending: [
      'SEARCH projections USING INDEX ranked (name=? AND <expr><?)',
      'USE TEMP B-TREE FOR LAST TERM OF ORDER BY',
    ],
    notNull: ['SEARCH projections USING INDEX ranked (name=?)'],
  })
})

test('-Infinity is bound as a real, and every value of an index but null is past it', async () => {
  const found = await within((sql) =>
    Effect.gen(function*() {
      const stored = [['a', 'null'], ['b', '{}'], ['c', '-1e300'], ['d', '"x"'], ['e', 'true'], ['f', '""']]
      for (const [id, rank] of stored) {
        const indexes = rank === '{}' ? rank : `{"rank":${rank}}`
        yield* sql`INSERT INTO projections VALUES ('P', ${id!}, '0', ${indexes}, 1)`
      }
      const bound = yield* sql<{ kind: string }>`SELECT typeof(${-Infinity}) AS kind`
      const past = yield* sql<{ id: string }>`
        SELECT id FROM projections WHERE name = 'P' AND ${sql.literal(column)} > ${-Infinity}
        ORDER BY ${sql.literal(column)}, id
      `
      return { kind: bound[0]?.kind, past: past.map(({ id }) => id) }
    })
  )
  expect(found).toEqual({ kind: 'real', past: ['c', 'e', 'f', 'd'] })
})
