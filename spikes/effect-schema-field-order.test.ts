/**
 * What decisions 0058 and 0059 rely on of a schema's encoding, at `effect` 4.1.1: a struct writes its fields in its
 * schema's order, and drops what it does not declare; a record writes them in the order they were set. Two values
 * that encode alike may give their fields in another order, which is why the machine compares JSON with its fields
 * in any order, and only a record reaches that rule. The order is what 4.1.1 does, not what it promises: Schema
 * guarantees no order of the keys it encodes (`SchemaAST.ts`, decision 0107), and the machine relies on none.
 */
import { expect, test } from 'bun:test'
import * as Schema from 'effect/Schema'

test("a struct writes its schema's order, and drops what it does not declare", () => {
  const struct = Schema.Struct({ _tag: Schema.Literal('W'), a: Schema.Number, b: Schema.Number })
  const built = { b: 2, note: 'x', a: 1, _tag: 'W' } as Schema.Schema.Type<typeof struct>
  expect(JSON.stringify(Schema.encodeSync(struct)(built))).toBe('{"_tag":"W","a":1,"b":2}')
})

test('a record writes its fields in the order they were set', () => {
  const record = Schema.Record(Schema.String, Schema.Number)
  expect(JSON.stringify(Schema.encodeSync(record)({ b: 2, a: 1 }))).toBe('{"b":2,"a":1}')
  expect(JSON.stringify(Schema.encodeSync(record)({ a: 1, b: 2 }))).toBe('{"a":1,"b":2}')
})
