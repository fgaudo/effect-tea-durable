/**
 * What decision 0146 says of a numeric index, at `@effect/sql-sqlite-bun` 4.1.3: `JSON.stringify` writes an integer
 * beyond 2^53 with the fewest digits that read back as the same double, and `json_extract` reads those digits as the
 * exact integer they spell, which is another number, so a comparison with the double bound misses the row. The exact
 * digits of the double, those of `BigInt(value)`, are read as the same number, within the range of an integer of
 * SQLite and beyond it, and `JSON.parse` reads them back as the double. A safe integer and a fraction are read as the
 * double `JSON.stringify` writes.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import { SqlClient } from 'effect/sql'

const column = `json_extract(indexes, '$.rank')`

/** The numbers under test: the named ones, and a sample of every magnitude, as fractions and as integers. */
const sample = () => {
  const values = [1762300123456789012, 2 ** 53 + 2, 2 ** 53 - 1, 2 ** 60, -(2 ** 60), 2 ** 63, -(2 ** 63), 2 ** 70, 1e20, 1e21, 0.1, 1 / 3, 5e-324, 1.7976931348623157e308]
  let seed = 42
  const next = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31
  for (let i = 0; i < 10000; i++) {
    const value = (next() - 0.5) * 10 ** (Math.floor(next() * 80) - 40)
    values.push(value, Math.round(value))
  }
  for (let i = 0; i < 10000; i++) values.push(Math.floor(next() * 2 ** 63) - 2 ** 62)
  return values
}

/** The exact digits of an integer beyond the safe range, and JSON's text of any other number (decision 0146). */
const digits = (value: number) =>
  Number.isInteger(value) && !Number.isSafeInteger(value) ? BigInt(value).toString() : JSON.stringify(value)

/** Each value of `values`, written as `write` spells it, and whether SQLite reads it equal to the value bound. */
const compared = (write: (value: number) => string) =>
  Effect.runPromise(
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const values = sample()
      yield* sql`CREATE TABLE projections (id INTEGER PRIMARY KEY, value REAL NOT NULL, indexes TEXT NOT NULL)`
      yield* sql.unsafe(`CREATE INDEX ranked ON projections (${column})`)
      for (const [id, value] of values.entries()) {
        yield* sql`INSERT INTO projections VALUES (${id}, ${value}, ${`{"rank":${write(value)}}`})`
      }
      const rows = yield* sql<{ id: number; equal: number }>`
        SELECT id, ${sql.literal(column)} = value AS equal FROM projections ORDER BY id
      `
      return rows.map(({ id, equal }) => ({ value: values[id]!, equal: equal === 1 }))
    }).pipe(Effect.provide(SqliteClient.layer({ filename: ':memory:' })), Effect.orDie),
  )

test('the digits JSON.stringify writes of an integer beyond 2^53 are read as another number', async () => {
  const rows = await compared((value) => JSON.stringify(value))
  const unequal = rows.filter(({ equal }) => !equal).map(({ value }) => value)
  expect(unequal.length).toBeGreaterThan(1000)
  // Every number read as another is an integer beyond the safe range, and within SQLite's integers.
  expect(unequal.every((value) => Number.isInteger(value) && !Number.isSafeInteger(value) && Math.abs(value) < 2 ** 63)).toBe(true)
  expect(unequal).toContain(1762300123456789012)
  expect(unequal).toContain(2 ** 60)
})

test('the exact digits of an integer beyond 2^53 are read as the number, and read back by JSON.parse', async () => {
  const rows = await compared(digits)
  expect(rows.filter(({ equal }) => !equal)).toEqual([])
  // `JSON.stringify` writes -0 as 0, which is the same value to SQLite and to a comparison.
  for (const { value } of rows) expect(JSON.parse(digits(value)) === value).toBe(true)
  expect(digits(2 ** 60)).toBe('1152921504606846976')
  expect(digits(2 ** 70)).toBe('1180591620717411303424')
  expect(digits(2 ** 53)).toBe('9007199254740992')
  expect(digits(0.1)).toBe('0.1')
})
