/**
 * What PostgreSQL does, at `@effect/sql-pglite` 4.1.2 and the `@electric-sql/pglite` it pins, with the statements
 * the storage would write on it (decision 0157). PGlite is PostgreSQL compiled to run in the process, on one
 * session: what a server with many connections does is not seen here.
 */
import { PgliteClient } from '@effect/sql-pglite'
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import { SqlClient } from 'effect/sql'

const run = <A, E>(body: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.runPromise(body.pipe(Effect.provide(PgliteClient.layer({}))))

test('jsonb writes its text again: the keys in its own order, with spaces', () =>
  run(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const text = JSON.stringify({ b: 1, a: { name: 'x' } })
    const [row] = yield* sql<{ t: string; u: string }>`
      SELECT (${text}::jsonb)::text AS t,
        jsonb_set(${text}::jsonb, '{a,name}', to_jsonb(${'y'}::text))::text AS u
    `
    expect(row).toEqual({ t: '{"a": {"name": "x"}, "b": 1}', u: '{"a": {"name": "y"}, "b": 1}' })
  })), 30_000)

test('jsonb orders null, then strings, then numbers, then booleans; a key a row lacks is SQL NULL', () =>
  run(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ v: unknown }>`
      SELECT v FROM (VALUES ('true'::jsonb), ('1'), ('"a"'), ('null'), ('2.5'), ('false')) AS t(v) ORDER BY v
    `
    expect(rows.map((row) => row.v)).toEqual([null, 'a', 1, 2.5, false, true])
    const [lacks] = yield* sql<{ missing: boolean; held: boolean }>`
      SELECT ('{}'::jsonb -> 'k') IS NULL AS missing, ('{"k":null}'::jsonb -> 'k') IS NULL AS held
    `
    expect(lacks).toEqual({ missing: true, held: false })
  })), 30_000)

test('jsonb compares a number by its exact digits, so 2^70 written and bound as its digits is equal', () =>
  run(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const digits = BigInt(2 ** 70).toString()
    const [row] = yield* sql<{ digits: boolean; shortest: boolean }>`
      SELECT (${`{"n":${digits}}`}::jsonb -> 'n') = to_jsonb(${digits}::numeric) AS digits,
        (${`{"n":${digits}}`}::jsonb -> 'n') = to_jsonb(${String(2 ** 70)}::numeric) AS shortest
    `
    // `String` writes 2^70 as 1.1805916207174113e+21, whose digits spell another number.
    expect(row).toEqual({ digits: true, shortest: false })
  })), 30_000)

test('a parameter PostgreSQL cannot type is refused, and a cast types it', () =>
  run(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const refused = yield* Effect.flip(sql`SELECT CASE WHEN ${null} IS NULL THEN 1 END AS x`)
    expect(refused.reason._tag).toBe('SqlSyntaxError')
    expect(yield* sql`SELECT CASE WHEN ${null}::text IS NULL THEN 1 END AS x`).toEqual([{ x: 1 }])
  })), 30_000)

test('a bigint is read as a number up to 2^53, and as a bigint past it', () =>
  run(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql<{ small: unknown; large: unknown; count: unknown }>`
      SELECT 1::bigint AS small, 9007199254740993::bigint AS large, count(*) AS count FROM (VALUES (1)) AS t(x)
    `
    expect(row).toEqual({ small: 1, large: 9007199254740993n, count: 1 })
  })), 30_000)

test('an upsert that moves a head gives the seq it drew', () =>
  run(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    yield* sql`CREATE TABLE heads (name TEXT, partition INTEGER, seq BIGINT, PRIMARY KEY (name, partition))`
    const draw = sql<{ seq: number }>`
      INSERT INTO heads VALUES ('p', 1, 1) ON CONFLICT (name, partition) DO UPDATE SET seq = heads.seq + 1
      RETURNING seq
    `
    expect([yield* draw, yield* draw]).toEqual([[{ seq: 1 }], [{ seq: 2 }]])
  })), 30_000)

test('a row trigger after a delete sees every row the statement deleted', () =>
  run(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    yield* sql`CREATE TABLE outbox (seq INTEGER, topic TEXT)`
    yield* sql`CREATE TABLE publications (seq INTEGER PRIMARY KEY)`
    yield* sql.unsafe(`
      CREATE FUNCTION drops() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM outbox WHERE seq = OLD.seq) THEN
          DELETE FROM publications WHERE seq = OLD.seq;
        END IF;
        RETURN NULL;
      END $$
    `)
    yield* sql`CREATE TRIGGER drops AFTER DELETE ON outbox FOR EACH ROW EXECUTE FUNCTION drops()`
    yield* sql`INSERT INTO outbox VALUES (1, 'a'), (1, 'b'), (2, 'a'), (2, 'b')`
    yield* sql`INSERT INTO publications VALUES (1), (2)`
    // Both rows of 1 go in one statement, one row of 2: the publication of 1 goes, the one of 2 stays.
    yield* sql`DELETE FROM outbox WHERE seq = 1 OR (seq = 2 AND topic = 'a')`
    expect(yield* sql`SELECT seq FROM publications`).toEqual([{ seq: 2 }])
  })), 30_000)

test('an advisory lock is taken again by its own session, and PGlite has one', () =>
  run(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    expect(sql.driver).toBe('pglite')
    expect(yield* sql`SELECT pg_try_advisory_lock(42) AS a, pg_try_advisory_lock(42) AS b`).toEqual([
      { a: true, b: true },
    ])
  })), 30_000)

test('a transaction begun at REPEATABLE READ reads its first snapshot', () =>
  run(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const [row] = yield* sql.withTransaction(sql<{ transaction_isolation: string }>`SHOW transaction_isolation`).pipe(
      Effect.provideService(SqlClient.BeginTransaction, 'BEGIN ISOLATION LEVEL REPEATABLE READ'),
    )
    expect(row).toEqual({ transaction_isolation: 'repeatable read' })
  })), 30_000)
