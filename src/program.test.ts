/**
 * What the compiler checks of a program's schemas: each encodes to what JSON holds (decisions 0030, 0098).
 */
import { expect, test } from 'bun:test'
import type * as DateTime from 'effect/DateTime'
import * as Schema from 'effect/Schema'
import type { Json } from './program.ts'

test('a time encoded to its milliseconds is a codec of a program, and one declared as a DateTime is not', () => {
  const millis: Schema.Codec<DateTime.Utc, Json> = Schema.DateTimeUtcFromMillis
  // @ts-expect-error `Schema.DateTimeUtc` encodes to a `DateTime.Utc`, which JSON does not hold
  const declared: Schema.Codec<DateTime.Utc, Json> = Schema.DateTimeUtc
  expect([millis, declared]).toHaveLength(2)
})
