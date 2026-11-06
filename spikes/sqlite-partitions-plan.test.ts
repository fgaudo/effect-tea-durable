/**
 * What decision 0153 says of a page of the log read from some partitions only, at `@effect/sql-sqlite-bun` 4.1.2,
 * on the tables and the indexes the storage creates, with no statistics, as the runtime leaves a database. The page
 * restricted to a list of partitions is searched as a range of `outbox_topic`, in the order of `position`, as the
 * page of every partition is, and neither sorts. Each row finds its publication by the key of `publications`
 * (decision 0154).
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import { SqlClient } from 'effect/sql'

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
        CREATE TABLE publications (
          name TEXT NOT NULL,
          partition INTEGER NOT NULL,
          seq INTEGER NOT NULL,
          id TEXT NOT NULL,
          tag TEXT NOT NULL,
          version INTEGER NOT NULL,
          message TEXT,
          projection TEXT NOT NULL,
          PRIMARY KEY (name, partition, seq)
        )
      `
      yield* sql`
        CREATE TABLE outbox (
          position INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          topic TEXT NOT NULL,
          partition INTEGER NOT NULL,
          seq INTEGER NOT NULL
        )
      `
      yield* sql`CREATE UNIQUE INDEX outbox_partition ON outbox (name, topic, partition, seq)`
      yield* sql`CREATE INDEX outbox_topic ON outbox (name, topic, position)`
      yield* sql`CREATE INDEX outbox_publication ON outbox (name, partition, seq)`
      return yield* body(sql)
    }).pipe(Effect.provide(SqliteClient.layer({ filename: ':memory:' })), Effect.orDie),
  )

const select = `SELECT outbox.position, outbox.partition, outbox.seq, publications.id, publications.tag,
    publications.version, publications.message, publications.projection
  FROM outbox
  JOIN publications ON publications.name = outbox.name AND publications.partition = outbox.partition
    AND publications.seq = outbox.seq
  WHERE outbox.name = ? AND outbox.topic = ? AND outbox.position >= ?`

test('a page of some partitions is searched as a range of the topic, as a page of every partition is', async () => {
  const plans = await within((sql) =>
    Effect.all({
      every: plan(sql, `${select} ORDER BY outbox.position LIMIT 256`, ['P', 't', 1]),
      some: plan(
        sql,
        `${select} AND outbox.partition IN (SELECT value FROM json_each(?)) ORDER BY outbox.position LIMIT 256`,
        ['P', 't', 1, '[1,5,9]'],
      ),
    })
  )
  const range = 'SEARCH outbox USING INDEX outbox_topic (name=? AND topic=? AND position>?)'
  const joined = 'SEARCH publications USING INDEX sqlite_autoindex_publications_1 (name=? AND partition=? AND seq=?)'
  expect(plans.every).toEqual([range, joined])
  expect(plans.some[0]).toBe(range)
  expect(plans.some[plans.some.length - 1]).toBe(joined)
  expect(plans.some.some((line) => line.includes('TEMP B-TREE'))).toBe(false)
})
