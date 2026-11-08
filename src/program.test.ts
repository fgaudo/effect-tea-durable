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
  encode,
  Entities,
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
  type TypesOf,
  key,
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
    work: ({ charging }) => (charging ? { charg: charge } : noWork),
  })
  // Beside a declared key, a misspelt one is accepted by the types: the machine is what refuses it (decision 0037).
  const beside = program(schemas)({
    ...pieces,
    work: ({ charging }) => (charging ? { charge, charg: charge } : noWork),
  })
  expect([alone, beside]).toHaveLength(2)
})

test('a runner that answers a message the program does not have does not compile', () => {
  const pieces = {
    name: 'Charges',
    keys: ['charge'],
    init: () => ({ charging: true }),
    update: () => () => ({ charging: false }),
    work: ({ charging }: { charging: boolean }) => (charging ? { charge } : noWork),
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
    keys: ['charge'],
    init: () => ({ charging: true }),
    update: () => () => ({ charging: false }),
    work: ({ charging }: { charging: boolean }) => (charging ? { charge } : noWork),
    project: () => null,
    indexes: {},
  } as const
  const reads = program(schemas)({
    ...pieces,
    operations: { Charge: operation.droppable(() => Effect.as(Effect.service(Rates), 'Charged' as const)) },
  })
  // The services a droppable runner needs are still inferred, and are the program's: `Rates`, not `never` or `unknown`.
  type Services = TypesOf<typeof reads>['services']
  const services: [Services] extends [Rates] ? [Rates] extends [Services] ? true : false : false = true
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
    keys: [],
    update: () => (state: typeof State.Type) => state,
    work: () => noWork,
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
    keys: [],
    init: () => ({ charging: true }),
    update: () => () => ({ charging: false }),
    work: () => noWork,
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
  type Of = TypesOf<typeof charges>
  const named: Topic<Of> = 'charging'
  // @ts-expect-error a program that declares topics publishes them alone, and its projection is no topic
  const projection: Topic<Of> = 'projection'
  const untopical = program(shown)(pieces)
  const only: Topic<TypesOf<typeof untopical>> = 'projection'
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
    keys: ['ask'],
    init: () => ({}),
    update: () => (state) => state,
    work: () => noWork,
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
  type Of = TypesOf<typeof doors>
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
  expect([doors.keys, doors.operations, doors.indexes, doors.work({ open: true })]).toEqual([{}, {}, {}, {}])
  expect(() => checkProgram(doors)).not.toThrow()
  // A part leaves out what a program does.
  const latch = part(bare)(pieces)
  expect([latch.keys, latch.operations, latch.work({ open: true })]).toEqual([{}, {}, {}])
  expect(latch.schemas.operation).toBe(Schema.Never)
  // A part that leaves out its sender reads none, and holds no schema of one.
  expect('sender' in latch.schemas).toBe(false)
})

test('work is left out only with no key, and operations only with no kind of operation (decision 0180)', () => {
  const pieces = {
    name: 'Charges',
    init: () => ({ charging: true }),
    update: () => () => ({ charging: false }),
    project: () => null,
  } as const
  const runners = { Charge: operation(() => Effect.succeed('Charged' as const)) }
  // @ts-expect-error a program that declares a key says what work its states hold under it
  const workless = program(schemas)({ ...pieces, keys: ['charge'], operations: runners })
  // @ts-expect-error a program that has operations gives a runner for each kind
  const runnerless = program(schemas)({ ...pieces, keys: ['charge'], work: () => ({ charge }) })
  const whole = program(schemas)({ ...pieces, keys: ['charge'], work: () => ({ charge }), operations: runners })
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
  // A program typed by hand has a name typed `string`, against which no name could be checked.
  const byHand: Program<TypesOf<typeof hall>> = hall
  // @ts-expect-error a program whose name is any string has no reference, and is passed to `send` itself
  const unchecked = reference<typeof byHand>('Hall')
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
  expect([misnamed, unchecked]).toHaveLength(2)
})

test('TypesOf gives the types of a program, and of a reference to it, and never of anything else (decision 0188)', () => {
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
  type Of = TypesOf<typeof hall>
  type Referred = TypesOf<typeof Hall>
  const same: [Of] extends [Referred] ? [Referred] extends [Of] ? true : false : false = true
  const inbound: Of['inbound'] = 'Sell'
  // @ts-expect-error `Buy` is not an inbound message of `hall`
  const unknown: Referred['inbound'] = 'Buy'
  const reason: Referred['rejection'] = 'TooFew'
  // A receiver of either kind gives the same types, so a function over `Receiver<T>` reads them too.
  const either: [TypesOf<typeof hall | typeof Hall>] extends [Of] ? true : false = true
  const none: [TypesOf<{ name: 'Hall' }>] extends [never] ? true : false = true
  expect([same, inbound, unknown, reason, either, none]).toHaveLength(6)
})

test('a timer needs no type parameter: its message keeps its tag, and work checks it (decision 0181)', () => {
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
    keys: ['closing'],
    init: () => ({ _tag: 'Closed' }) as const,
    update: () => () => ({ _tag: 'Closed' }) as const,
    project: () => null,
  } as const
  // A branch of `Match.valueTags` gives the call no type, so a tag that widened would be any string.
  const typed = doors({
    ...pieces,
    work: (state) =>
      Match.valueTags(state, {
        Open: ({ closesAt }) => ({ closing: timer(closesAt, { _tag: 'Closing', doors: ['front'] }) }),
        Closed: () => noWork,
      }),
  })
  const misspelt = doors({
    ...pieces,
    work: (state) =>
      // @ts-expect-error `Closin` is no internal message of the program
      Match.valueTags(state, {
        Open: ({ closesAt }) => ({ closing: timer(closesAt, { _tag: 'Closin', doors: ['front'] }) }),
        Closed: () => noWork,
      }),
  })
  const at = DateTime.makeUnsafe(0)
  expect(typed.work({ _tag: 'Open', closesAt: at })).toEqual({
    closing: timer(at, { _tag: 'Closing', doors: ['front'] }),
  })
  expect(misspelt).toBeDefined()
  // `const` makes an array a readonly tuple, which a mutable array of `Schema.mutable` does not take: such a program
  // gives the type parameter.
  type Mutable = { readonly _tag: 'Closing'; doors: Array<string> }
  const opened = { ...pieces, work: () => ({ closing: timer<Mutable>(at, { _tag: 'Closing', doors: ['front'] }) }) }
  const mutable = program({
    ...schemas,
    state: Doors,
    internal: Schema.TaggedStruct('Closing', { doors: Schema.mutable(Schema.Array(Schema.String)) }),
    operation: Schema.Never,
  })
  const given = mutable(opened)
  const inferred = mutable({
    ...pieces,
    // @ts-expect-error the inferred `readonly ['front']` is not the schema's mutable `Array<string>`
    work: () => ({ closing: timer(at, { _tag: 'Closing', doors: ['front'] }) }),
  })
  expect([given, inferred]).toHaveLength(2)
})

test('a rehearsal and a query name only the keys and the indexes the program declares (decisions 0032, 0033)', () => {
  const pieces = {
    name: 'Charges',
    keys: ['charge'],
    init: () => ({ charging: true }),
    update: () => () => ({ charging: false }),
    work: ({ charging }: { charging: boolean }) => (charging ? { charge } : noWork),
    operations: { Charge: operation(() => Effect.succeed('Charged' as const)) },
    project: () => null,
  } as const
  const charges = program(schemas)({ ...pieces, indexes: { charging: () => true } })
  type Of = TypesOf<typeof charges>
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

// A key with a parameter: `work` returns a list of pairs under it and one piece under a key without, the
// parameter is the schema's type, and `pending` takes it for such a key alone (decision 0132).
test('the work under a key with a parameter is a list of pairs typed by its schema, and pending takes the parameter', () => {
  const pieces = {
    name: 'Lines',
    keys: ['fee', key('charge', Schema.String)],
    init: () => ({ lines: ['a'] }),
    update: () => () => ({ lines: [] }),
    operations: { Charge: operation(() => Effect.succeed('Charged' as const)) },
    project: () => null,
    indexes: {},
  } as const
  const declare = program({ ...schemas, state: Schema.Struct({ lines: Schema.Array(Schema.String) }) })
  const lines = declare({
    ...pieces,
    work: ({ lines }) => ({ fee: charge, charge: lines.map((line) => [line, charge] as const) }),
  })
  const piece = declare({
    ...pieces,
    // @ts-expect-error one piece under a key that takes a parameter
    work: () => ({ charge }),
  })
  const list = declare({
    ...pieces,
    // @ts-expect-error a list under a key that takes no parameter
    work: () => ({ fee: [['a', charge]] }),
  })
  const mistyped = declare({
    ...pieces,
    // @ts-expect-error a parameter of the key's schema, a string, not a number
    work: () => ({ charge: [[7, charge]] }),
  })
  const undeclared = declare({
    ...pieces,
    // @ts-expect-error a parameter's schema encodes to what JSON holds, as every schema of a program does
    keys: ['fee', key('charge', Schema.DateTimeUtc)],
    work: () => noWork,
  })
  type Of = TypesOf<typeof lines>
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

// A list may hold a name twice, which the record a program holds cannot (decision 0197).
test('a name listed twice among the keys is refused where it is declared, with or without a parameter', () => {
  const declare = (keys: ReadonlyArray<string | ReturnType<typeof key<string, string>>>) => () =>
    program(schemas)({
      name: 'Charges',
      keys,
      init: () => ({ charging: true }),
      update: () => () => ({ charging: false }),
      work: () => noWork,
      operations: { Charge: operation(() => Effect.succeed('Charged' as const)) },
      project: () => null,
    })
  expect(declare(['charge', 'charge'])).toThrow("a declaration lists the key 'charge' twice")
  expect(declare(['charge', key('charge', Schema.String)])).toThrow("a declaration lists the key 'charge' twice")
  expect(declare(['charge', key('fee', Schema.String)])).not.toThrow()
  expect(declare(['charge', key('fee', Schema.String)])().keys as unknown).toEqual({ charge: null, fee: Schema.String })
})
