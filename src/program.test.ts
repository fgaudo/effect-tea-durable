/**
 * What the compiler checks of a program: each schema encodes to what JSON holds (decisions 0030, 0098), a state is
 * an object (decision 0031), the schemas applied first type the pieces (decision 0035), the work is held under the
 * declared keys (decisions 0033, 0037), and an operation answers the messages of its runner (decision 0034).
 */
import { expect, test } from 'bun:test'
import * as Context from 'effect/Context'
import type * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'
import {
  digestOf,
  encode,
  Entities,
  idempotencyKey,
  InvariantDefect,
  type Json,
  noWork,
  operation,
  type Program,
  program,
} from './program.ts'
import type { Rehearsal } from './rehearse.ts'
import type { Query } from './storage.ts'

test('a time encoded to its milliseconds is a codec of a program, and one declared as a DateTime is not', () => {
  const millis: Schema.Codec<DateTime.Utc, Json> = Schema.DateTimeUtcFromMillis
  // @ts-expect-error `Schema.DateTimeUtc` encodes to a `DateTime.Utc`, which JSON does not hold
  const declared: Schema.Codec<DateTime.Utc, Json> = Schema.DateTimeUtc
  expect([millis, declared]).toHaveLength(2)
})

test('a value is JSON as it is: finite numbers, and plain objects and arrays of such values (decision 0040)', () => {
  // A schema that encodes anything as it is: what is checked is the value, not the schema.
  const any = Schema.Unknown as unknown as Schema.Codec<unknown, Json>
  const reasonOf = (value: unknown) => {
    try {
      encode(any, value, 'value')
      return null
    } catch (cause) {
      return cause instanceof InvariantDefect ? cause.reason : String(cause)
    }
  }
  for (const value of [null, 'a', 1, true, [1, ['b']], { a: { b: [null] } }, Object.create(null)]) {
    expect(reasonOf(value)).toBeNull()
  }
  // `JSON.stringify` writes each of these as something else, or not at all, and the value read back is another.
  for (const value of [new Date(0), new Map(), [1, Number.NaN], { a: [undefined] }, { a: () => 1 }, 1n, undefined]) {
    expect(reasonOf(value)).toBe('the value encodes to what JSON does not hold')
  }
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
    keys: { charge: null },
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
    keys: { charge: null },
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

test('a droppable runner whose services hold `Entities` does not compile (decision 0129)', () => {
  class Rates extends Context.Service<Rates, { readonly rate: Effect.Effect<number> }>()('test/Rates') {}
  class Notices extends Context.Service<Notices, { readonly notice: Effect.Effect<void> }>()('test/Notices') {}
  // A layer that builds its service from `Entities`, which a runner may provide to itself.
  const NoticesFromEntities = Layer.effect(
    Notices,
    Effect.map(Effect.service(Entities), () => ({ notice: Effect.void })),
  )
  const pieces = {
    name: 'Charges',
    keys: { charge: null },
    init: () => ({ charging: true }),
    update: () => () => ({ charging: false }),
    durable: ({ charging }: { charging: boolean }) => (charging ? { charge } : noWork),
    project: () => null,
    indexes: {},
  } as const
  const reads = program(schemas)({
    ...pieces,
    operations: { Charge: operation.droppable(() => Effect.as(Effect.service(Rates), 'Charged' as const)) },
  })
  // The services a droppable runner needs are still inferred, and are the program's: `Rates`, not `never` or `unknown`.
  const services: typeof reads extends Program<infer T>
    ? [T['services']] extends [Rates] ? [Rates] extends [T['services']] ? true : false : false
    : false = true
  const sends = program(schemas)({
    ...pieces,
    operations: {
      // @ts-expect-error a droppable operation sends to no entity
      Charge: operation.droppable(() => Effect.as(Effect.service(Entities), 'Charged' as const)),
    },
  })
  const provides = program(schemas)({
    ...pieces,
    operations: {
      Charge: operation.droppable(() =>
        // @ts-expect-error a layer built from `Entities` leaves `Entities` among the runner's services
        Effect.provide(Effect.as(Effect.service(Notices), 'Charged' as const), NoticesFromEntities)
      ),
    },
  })
  expect([reads, services, sends, provides]).toHaveLength(4)
})

test('the schemas applied first type the pieces, where one call would widen a tag to a string (decision 0035)', () => {
  const State = Schema.Union([Schema.TaggedStruct('Open', {}), Schema.TaggedStruct('Closed', {})])
  const pieces = {
    name: 'Doors',
    keys: {},
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

test('a rehearsal and a query name only the keys and the indexes the program declares (decisions 0032, 0033)', () => {
  const pieces = {
    name: 'Charges',
    keys: { charge: null },
    init: () => ({ charging: true }),
    update: () => () => ({ charging: false }),
    durable: ({ charging }: { charging: boolean }) => (charging ? { charge } : noWork),
    operations: { Charge: operation(() => Effect.succeed('Charged' as const)) },
    project: () => null,
  } as const
  const charges = program(schemas)({ ...pieces, indexes: { charging: () => true } })
  type Of = typeof charges extends Program<infer T> ? T : never
  const pending = (rehearsal: Rehearsal<Of>) => [
    rehearsal.pending('charge'),
    // @ts-expect-error `charg` is no key the program declares
    rehearsal.pending('charg'),
  ]
  const found: Query<Of> = { where: [{ index: 'charging', is: '=', value: true }], order: { index: 'charging' } }
  // @ts-expect-error `charged` is no index the program declares
  const misnamed: Query<Of> = { order: { index: 'charged' } }
  const unstored = program(schemas)({
    ...pieces,
    // @ts-expect-error an index is a scalar, which a column holds
    indexes: { charging: () => ({ charging: true }) },
  })
  expect([pending, found, misnamed, unstored]).toHaveLength(4)
})

// A key with a parameter: `durable` returns a list of pairs under it and one piece under a key without, the
// parameter is the schema's type, and `pending` takes it for such a key alone (decision 0132).
test('the work under a key with a parameter is a list of pairs typed by its schema, and pending takes the parameter', () => {
  const pieces = {
    name: 'Lines',
    keys: { fee: null, charge: Schema.String },
    init: () => ({ lines: ['a'] }),
    update: () => () => ({ lines: [] }),
    operations: { Charge: operation(() => Effect.succeed('Charged' as const)) },
    project: () => null,
    indexes: {},
  } as const
  const declare = program({ ...schemas, state: Schema.Struct({ lines: Schema.Array(Schema.String) }) })
  const lines = declare({
    ...pieces,
    durable: ({ lines }) => ({ fee: charge, charge: lines.map((line) => [line, charge] as const) }),
  })
  const piece = declare({
    ...pieces,
    // @ts-expect-error one piece under a key that takes a parameter
    durable: () => ({ charge }),
  })
  const list = declare({
    ...pieces,
    // @ts-expect-error a list under a key that takes no parameter
    durable: () => ({ fee: [['a', charge]] }),
  })
  const mistyped = declare({
    ...pieces,
    // @ts-expect-error a parameter of the key's schema, a string, not a number
    durable: () => ({ charge: [[7, charge]] }),
  })
  const undeclared = declare({
    ...pieces,
    // @ts-expect-error a parameter's schema encodes to what JSON holds, as every schema of a program does
    keys: { fee: null, charge: Schema.DateTimeUtc },
    durable: () => noWork,
  })
  type Of = typeof lines extends Program<infer T> ? T : never
  const pending = (rehearsal: Rehearsal<Of>) => [
    rehearsal.pending('charge', 'a'),
    rehearsal.pending('fee'),
    // @ts-expect-error a key with a parameter is found with it
    rehearsal.pending('charge'),
    // @ts-expect-error a key without a parameter is found by its name alone
    rehearsal.pending('fee', 'a'),
    // @ts-expect-error the parameter is the schema's type
    rehearsal.pending('charge', 7),
  ]
  expect([lines, piece, list, mistyped, undeclared, pending]).toHaveLength(6)
})

// The digests were computed apart from this code, with Python's `hashlib` and `base64.urlsafe_b64encode`: a
// digest that changed would run an operation under way again under a new key (decision 0123).
test('the digest of an idempotency key is the SHA-256 of its JSON, in unpadded base64url (decision 0123)', () => {
  const of = (id: string): string => digestOf(idempotencyKey({ name: 'Order', id }, { name: 'charge' }, 1))
  expect(of('42')).toBe('HCSqboASEfxZ9VbqnZMHHhT3RAKlBw43wTMZfFDyotw')
  expect(of('caf\u00e9 \u2713')).toBe('3Hq7WV5mz3BQ1-DHpJ_MmRiZTcPfyVJqXEzyGfsxlhE')
  // JSON escapes a lone surrogate, which UTF-8 would turn into U+FFFD: two such ids keep two digests.
  expect(of('\ud800')).toBe('UShS5of2cuLYI16He18FfxZFLveZ8HXnS11ev3539r0')
  expect(of('\udbff')).not.toBe(of('\ud800'))
  expect(of('x'.repeat(1000))).toMatch(/^[A-Za-z0-9_-]{43}$/)
})
