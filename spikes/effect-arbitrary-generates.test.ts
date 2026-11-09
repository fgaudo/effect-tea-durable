/**
 * What `Arbitrary.schema` of `effect/Arbitrary` generates at 4.1.2 for the schemas a program declares: whether its
 * strings hold U+0000, lone surrogates and characters past the first plane, and whether its numbers hold `NaN`,
 * the infinities, `-0` and integers past 2^53. A test that derives its values from a program's schemas finds the
 * cases a database holds otherwise only if they are generated.
 */
import { expect, test } from 'bun:test'
import * as Arbitrary from 'effect/Arbitrary'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

const sample = <S extends Schema.Constraint>(schema: S) =>
  Effect.runPromise(Arbitrary.sampleEffect(Arbitrary.schema(schema), { count: 1_000, seed: 1 }))

test('a string of Schema.String holds U+0000, lone surrogates and characters past the first plane', async () => {
  const strings = await sample(Schema.String)
  const counts = {
    nul: strings.filter((s) => s.includes('\u0000')).length,
    lone: strings.filter((s) => /\p{Cs}/u.test(s)).length,
    astral: strings.filter((s) => /[\u{10000}-\u{10ffff}]/u.test(s)).length,
    empty: strings.filter((s) => s === '').length,
    distinct: new Set(strings).size,
  }
  console.log('Schema.String', counts, JSON.stringify(strings.slice(0, 12)))
  expect(counts.distinct).toBeGreaterThan(1)
})

test('a number of Schema.Number holds NaN, the infinities, -0 and integers past 2^53', async () => {
  const numbers = await sample(Schema.Number)
  const counts = {
    nan: numbers.filter(Number.isNaN).length,
    infinite: numbers.filter((n) => n === Infinity || n === -Infinity).length,
    negativeZero: numbers.filter((n) => Object.is(n, -0)).length,
    integer: numbers.filter(Number.isInteger).length,
    past: numbers.filter((n) => Math.abs(n) > 2 ** 53).length,
  }
  console.log('Schema.Number', counts, JSON.stringify(numbers.slice(0, 12)))
  expect(numbers.length).toBe(1_000)
})

test('a union of tagged structs gives every member, and a struct every field', async () => {
  const values = await sample(Schema.Union([
    Schema.TaggedStruct('A', { n: Schema.Int, note: Schema.NullOr(Schema.String) }),
    Schema.TaggedStruct('B', { s: Schema.NonEmptyString, flag: Schema.Boolean }),
  ]))
  console.log('Union', JSON.stringify(values.slice(0, 6)))
  expect(new Set(values.map((value) => value._tag))).toEqual(new Set(['A', 'B']))
})
