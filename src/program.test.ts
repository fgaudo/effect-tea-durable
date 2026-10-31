/**
 * What the compiler checks of a program: each schema encodes to what JSON holds (decisions 0030, 0098), a state is
 * an object (decision 0031), the schemas applied first type the pieces (decision 0035), the work is held under the
 * declared keys (decisions 0033, 0037), and an operation answers the messages of its runner (decision 0034).
 */
import { expect, test } from 'bun:test'
import type * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import { type Json, noWork, operation, program } from './program.ts'

test('a time encoded to its milliseconds is a codec of a program, and one declared as a DateTime is not', () => {
  const millis: Schema.Codec<DateTime.Utc, Json> = Schema.DateTimeUtcFromMillis
  // @ts-expect-error `Schema.DateTimeUtc` encodes to a `DateTime.Utc`, which JSON does not hold
  const declared: Schema.Codec<DateTime.Utc, Json> = Schema.DateTimeUtc
  expect([millis, declared]).toHaveLength(2)
})

const schemas = {
  state: Schema.Struct({ charging: Schema.Boolean }),
  flags: Schema.Null,
  inbound: Schema.Literal('Charge'),
  internal: Schema.Literal('Charged'),
  operation: Schema.TaggedStruct('Charge', {}),
  rejection: Schema.Never,
  sender: Schema.Null,
  projection: Schema.Null,
}

const charge = { _tag: 'Charge' } as const

test('a state is an object: a program whose state is a string does not compile', () => {
  // @ts-expect-error a state is an object, as effect-tea's is
  const declaration = program({ ...schemas, state: Schema.String })
  expect(declaration).toBeFunction()
})

test('work under a key the program does not declare does not compile where the state holds that key alone', () => {
  const pieces = {
    name: 'Charges',
    keys: ['charge'],
    init: () => ({ charging: true }),
    update: () => () => ({ charging: false }),
    operations: { Charge: operation(() => Effect.succeed('Charged' as const)) },
    project: () => null,
    indexes: {},
  } as const
  const alone = program(schemas)({
    ...pieces,
    // @ts-expect-error `charg` shares no key with the declared ones
    durable: ({ charging }) => (charging ? { charg: charge } : noWork),
  })
  // Beside a declared key, a misspelt one is accepted by the types: the machine is what refuses it (decision 0037).
  const beside = program(schemas)({
    ...pieces,
    durable: ({ charging }) => (charging ? { charge, charg: charge } : noWork),
  })
  expect([alone, beside]).toHaveLength(2)
})

test('a runner that answers a message the program does not have does not compile', () => {
  const pieces = {
    name: 'Charges',
    keys: ['charge'],
    init: () => ({ charging: true }),
    update: () => () => ({ charging: false }),
    durable: ({ charging }: { charging: boolean }) => (charging ? { charge } : noWork),
    project: () => null,
    indexes: {},
  } as const
  const answered = program(schemas)({
    ...pieces,
    // @ts-expect-error `Refunded` is no internal message of the program
    operations: { Charge: operation(() => Effect.succeed('Refunded' as const)) },
  })
  const unknown = program(schemas)({
    ...pieces,
    // @ts-expect-error the `unknown` of an at-most-once operation is checked with its runner
    operations: { Charge: operation.atMostOnce(() => Effect.succeed('Charged' as const), () => 'Lost' as const) },
  })
  expect([answered, unknown]).toHaveLength(2)
})

test('the schemas applied first type the pieces, where one call would widen a tag to a string (decision 0035)', () => {
  const State = Schema.Union([Schema.TaggedStruct('Open', {}), Schema.TaggedStruct('Closed', {})])
  const pieces = {
    name: 'Doors',
    keys: [],
    update: () => (state: typeof State.Type) => state,
    durable: () => noWork,
    operations: {},
    project: () => null,
    indexes: {},
  } as const
  const misspelt = program({ ...schemas, state: State, operation: Schema.Never })({
    ...pieces,
    // @ts-expect-error the state is the schema's, and the tag that is none of its names itself
    init: () => ({ _tag: 'Opn' }),
  })
  // One call, as `program` would be with the schemas among the pieces: the state is inferred from `init` too, and
  // its fresh literal widens, so the misspelt tag compiles and the state is any object with a string tag.
  const oneCall = <S extends object>(pieces: Readonly<{ state: Schema.Codec<S, Json>; init: () => S }>) => pieces
  const widened = oneCall({ state: State, init: () => ({ _tag: 'Opn' }) })
  const any: ReturnType<typeof widened.init> = { _tag: 'any string' }
  expect([misspelt, any]).toHaveLength(2)
})
