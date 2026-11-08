/**
 * What the compiler checks of a program: each schema encodes to what JSON holds (decisions 0030, 0098), the
 * projection is JSON (decision 0139), a state is an object (decision 0031), the schemas applied first type the
 * pieces (decision 0035), the work is held under the declared keys (decisions 0033, 0037), and an operation
 * answers the messages of its runner (decision 0034).
 */
import { expect, test } from 'bun:test'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Match from 'effect/Match'
import * as Schema from 'effect/Schema'
import {
  checkProgram,
  digestOf,
  encode,
  Entities,
  idempotencyKey,
  InvariantDefect,
  isProgram,
  type Json,
  noWork,
  operation,
  part,
  type Program,
  program,
  reference,
  reject,
  rejectWith,
  send,
  create,
  timer,
  type Topic,
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

test('a projection is JSON: a schema that decodes to a DateTime is refused where the program is declared (decision 0139)', () => {
  const json = program({ ...schemas, projection: Schema.Struct({ until: Schema.Number }) })
  const ofPart = part({ ...schemas, projection: Schema.Struct({ until: Schema.Number }) })
  // @ts-expect-error the projection is read as it is, so its type is JSON, which a `DateTime.Utc` is not
  const decoded = program({ ...schemas, projection: Schema.Struct({ until: Schema.DateTimeUtcFromMillis }) })
  // @ts-expect-error a part's projection is JSON too, since the parent's projection holds it
  const decodedPart = part({ ...schemas, projection: Schema.Struct({ until: Schema.DateTimeUtcFromMillis }) })
  expect([json, ofPart, decoded, decodedPart]).toHaveLength(4)
})

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

test('a topic selects JSON of the projection, and the topics a program declares are its only ones (decision 0138)', () => {
  const pieces = {
    name: 'Charges',
    keys: {},
    init: () => ({ charging: true }),
    update: () => () => ({ charging: false }),
    durable: () => noWork,
    operations: {},
    project: ({ charging }: { charging: boolean }) => ({ charging, since: 0 }),
    indexes: {},
  } as const
  const shown = {
    ...schemas,
    operation: Schema.Never,
    projection: Schema.Struct({ charging: Schema.Boolean, since: Schema.Number }),
  }
  const charges = program(shown)({ ...pieces, topics: { charging: ({ charging }) => charging } })
  type Of = typeof charges extends Program<infer T> ? T : never
  const named: Topic<Of> = 'charging'
  // @ts-expect-error a program that declares topics publishes them alone, and its projection is no topic
  const projection: Topic<Of> = 'projection'
  const untopical = program(shown)(pieces)
  const only: Topic<typeof untopical extends Program<infer T> ? T : never> = 'projection'
  // @ts-expect-error a topic selects of the projection, which has no such field
  const misnamed = program(shown)({ ...pieces, topics: { charging: ({ charged }) => charged } })
  // @ts-expect-error a topic selects what JSON holds, which a Date is not
  const unencoded = program(shown)({ ...pieces, topics: { when: () => new Date(0) } })
  expect([named, projection, only, misnamed, unencoded]).toHaveLength(5)
  // A program with topics publishes them alone, so none would publish nothing, and a topic has a name
  // (decision 0054).
  const refused: ReadonlyArray<readonly [Program<Of>, string]> = [
    [{ ...charges, topics: {} as unknown as NonNullable<typeof charges.topics> }, 'declares no topic in its topics'],
    [
      { ...charges, topics: { '': () => true } as unknown as NonNullable<typeof charges.topics> },
      'has a topic with an empty name',
    ],
    // A topic's name is stored as text of its own, which a database holds as it is (decision 0157).
    [
      { ...charges, topics: { 'a\u0000': () => true } as unknown as NonNullable<typeof charges.topics> },
      'has a topic "a\\u0000" whose name is no text a database holds',
    ],
  ]
  for (const [broken, reason] of refused) {
    expect(() => checkProgram(broken)).toThrow(`the program 'Charges' ${reason}`)
  }
})

// A name and a key's name are stored as text of their own: no database gives a lone surrogate back as written, so that two
// names would be one, and PostgreSQL holds U+0000 in no text (decision 0157).
test('a program whose name or key is no text a database holds is refused, naming it', () => {
  const charges = program({
    state: Schema.Struct({}),
    flags: Schema.Null,
    inbound: Schema.Never,
    internal: Schema.Never,
    operation: Schema.Never,
    rejection: Schema.Never,
    sender: Schema.Null,
    projection: Schema.Null,
  })({
    name: 'Charges',
    keys: { ask: null },
    init: () => ({}),
    update: () => (state) => state,
    durable: () => noWork,
    operations: {},
    project: () => null,
    indexes: {},
  })
  expect(() => checkProgram({ ...charges, name: 'Charges\ud800' })).toThrow('has a name that is no text a database holds')
  expect(() => checkProgram({ ...charges, keys: { 'a\u0000': null } as unknown as typeof charges.keys })).toThrow(
    `the program 'Charges' has a key "a\\u0000" whose name is no text a database holds`,
  )
  expect(() => checkProgram(charges)).not.toThrow()
})

test('a program without work leaves out what it does not have, and each piece left out is empty (decision 0180)', () => {
  const bare = {
    state: Schema.Struct({ open: Schema.Boolean }),
    flags: Schema.Null,
    inbound: Schema.Literal('Close'),
    projection: Schema.Boolean,
  }
  const pieces = {
    name: 'Doors',
    init: () => ({ open: true }),
    update: () => () => ({ open: false }),
    project: ({ open }: { open: boolean }) => open,
  }
  const doors = program(bare)(pieces)
  type Of = typeof doors extends Program<infer T> ? T : never
  const left: [Of['internal'], Of['operation'], Of['rejection'], Of['key'], Of['index']] extends
    [never, never, never, never, never] ? true : false = true
  const sender: [Of['sender']] extends [null] ? [null] extends [Of['sender']] ? true : false : false = true
  // @ts-expect-error a program that leaves `indexes` out has none for a query to order by
  const unindexed: Query<Of> = { order: { index: 'open' }, limit: 10 }
  expect([left, sender, unindexed]).toHaveLength(3)
  // The schemas left out are in the program, since the machine and the storage read them all.
  expect(doors.schemas.internal).toBe(Schema.Never)
  expect(doors.schemas.operation).toBe(Schema.Never)
  expect(doors.schemas.rejection).toBe(Schema.Never)
  expect(doors.schemas.sender).toBe(Schema.Null)
  expect([doors.keys, doors.operations, doors.indexes, doors.durable({ open: true })]).toEqual([{}, {}, {}, {}])
  expect(() => checkProgram(doors)).not.toThrow()
  // A part leaves out what a program does.
  const latch = part(bare)(pieces)
  expect([latch.keys, latch.operations, latch.durable({ open: true })]).toEqual([{}, {}, {}])
  expect(latch.schemas.operation).toBe(Schema.Never)
  // A part that leaves out its sender reads none, and holds no schema of one.
  expect('sender' in latch.schemas).toBe(false)
})

test('durable is left out only with no key, and operations only with no kind of operation (decision 0180)', () => {
  const pieces = {
    name: 'Charges',
    init: () => ({ charging: true }),
    update: () => () => ({ charging: false }),
    project: () => null,
  } as const
  const runners = { Charge: operation(() => Effect.succeed('Charged' as const)) }
  // @ts-expect-error a program that declares a key says what work its states hold under it
  const workless = program(schemas)({ ...pieces, keys: { charge: null }, operations: runners })
  // @ts-expect-error a program that has operations gives a runner for each kind
  const runnerless = program(schemas)({ ...pieces, keys: { charge: null }, durable: () => ({ charge }) })
  const whole = program(schemas)({ ...pieces, keys: { charge: null }, durable: () => ({ charge }), operations: runners })
  expect([workless, runnerless, whole]).toHaveLength(3)
})

test("a program's init may reject with the program's reasons, and a part's may not (decision 0182)", () => {
  const schemas = {
    state: Schema.Struct({ seats: Schema.Int }),
    flags: Schema.Struct({ seats: Schema.Int }),
    inbound: Schema.Literal('Sell'),
    rejection: Schema.Literal('TooFew'),
    projection: Schema.Int,
  }
  const pieces = {
    update: () => () => ({ seats: 0 }),
    project: ({ seats }: { seats: number }) => seats,
  }
  const hall = program(schemas)({
    ...pieces,
    name: 'Hall',
    init: ({ seats }) => seats < 10 ? rejectWith('TooFew') : { seats },
  })
  // @ts-expect-error a program's init rejects with the reasons of its schema, and no other
  const misreasoned = program(schemas)({ ...pieces, name: 'Hall', init: () => rejectWith('Closed') })
  // @ts-expect-error a part's init never rejects: its parent decides whether the child starts
  const room = part(schemas)({ ...pieces, init: ({ seats }) => seats < 10 ? reject : { seats } })
  expect([misreasoned, room]).toHaveLength(2)
  expect(hall.init({ seats: 3 }, DateTime.makeUnsafe(0))).toEqual(rejectWith('TooFew'))
})

test('a reference is the name of its program, which the compiler checks, and types send and create as the program does (decision 0183)', async () => {
  const hall = program({
    state: Schema.Struct({ seats: Schema.Int }),
    flags: Schema.Struct({ seats: Schema.Int }),
    inbound: Schema.Literal('Sell'),
    rejection: Schema.Literal('TooFew'),
    projection: Schema.Int,
  })({
    name: 'Hall',
    init: ({ seats }) => ({ seats }),
    update: () => (state) => state,
    project: ({ seats }) => seats,
  })
  const Hall = reference<typeof hall>('Hall')
  // @ts-expect-error a reference names the program by its name, and `Hal` is not the name of `hall`
  const misnamed = reference<typeof hall>('Hal')
  // What a sender gives reaches the runtime as the name alone.
  const received: Array<readonly [string, boolean]> = []
  const entities = Entities.of({
    send: (receiver) =>
      Effect.sync(() => received.push([receiver.name, isProgram(receiver)])).pipe(
        Effect.as({ _tag: 'Rejected', reason: 'TooFew' } as const),
      ),
    create: (receiver) =>
      Effect.sync(() => received.push([receiver.name, isProgram(receiver)])).pipe(Effect.as({ _tag: 'Created' } as const)),
  })
  const sending = Effect.gen(function*() {
    const reply = yield* send(Hall, 'hall-1', 'Sell', 'sell')
    // The reasons are the program's, as `send(hall, …)` gives them.
    const reason: 'TooFew' | null = reply._tag === 'Rejected' ? reply.reason : null
    const created = yield* create(Hall, 'hall-2', { seats: 3 }, 'hall')
    // @ts-expect-error the message is one of the program's inbound messages
    yield* send(Hall, 'hall-1', 'Buy', 'buy')
    // @ts-expect-error the flags are the program's
    yield* create(Hall, 'hall-3', { rows: 3 }, 'hall')
    yield* send(hall, 'hall-1', 'Sell', 'again')
    return [reason, created._tag] as const
  })
  expect(await Effect.runPromise(Effect.provideService(sending, Entities, entities))).toEqual(['TooFew', 'Created'])
  expect(received).toEqual([['Hall', false], ['Hall', false], ['Hall', false], ['Hall', false], ['Hall', true]])
  expect(misnamed).toBeDefined()
})

test('a timer needs no type parameter: its message keeps its tag, and durable checks it (decision 0181)', () => {
  const Doors = Schema.Union([
    Schema.TaggedStruct('Open', { closesAt: Schema.DateTimeUtcFromMillis }),
    Schema.TaggedStruct('Closed', {}),
  ])
  const doors = program({
    ...schemas,
    state: Doors,
    internal: Schema.TaggedStruct('Closing', { doors: Schema.Array(Schema.String) }),
    operation: Schema.Never,
  })
  const pieces = {
    name: 'Doors',
    keys: { closing: null },
    init: () => ({ _tag: 'Closed' }) as const,
    update: () => () => ({ _tag: 'Closed' }) as const,
    project: () => null,
  } as const
  // A branch of `Match.valueTags` gives the call no type, so a tag that widened would be any string.
  const typed = doors({
    ...pieces,
    durable: (state) =>
      Match.valueTags(state, {
        Open: ({ closesAt }) => ({ closing: timer(closesAt, { _tag: 'Closing', doors: ['front'] }) }),
        Closed: () => noWork,
      }),
  })
  const misspelt = doors({
    ...pieces,
    durable: (state) =>
      // @ts-expect-error `Closin` is no internal message of the program
      Match.valueTags(state, {
        Open: ({ closesAt }) => ({ closing: timer(closesAt, { _tag: 'Closin', doors: ['front'] }) }),
        Closed: () => noWork,
      }),
  })
  const at = DateTime.makeUnsafe(0)
  expect(typed.durable({ _tag: 'Open', closesAt: at })).toEqual({
    closing: timer(at, { _tag: 'Closing', doors: ['front'] }),
  })
  expect(misspelt).toBeDefined()
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
  const found: Query<Of> = {
    where: [{ index: 'charging', is: '=', value: true }],
    order: { index: 'charging' },
    limit: 10,
  }
  // @ts-expect-error `charged` is no index the program declares
  const misnamed: Query<Of> = { order: { index: 'charged' }, limit: 10 }
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
