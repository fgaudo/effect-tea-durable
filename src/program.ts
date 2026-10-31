import type * as Brand from 'effect/Brand'
import * as Context from 'effect/Context'
import * as Data from 'effect/Data'
import type * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'

/** What `update` returns for an inbound message that does not apply in the state, with no reason given. */
export const reject: unique symbol = Symbol.for('effect-tea-durable/Rejected')

const RejectedWithTypeId: unique symbol = Symbol.for('effect-tea-durable/RejectedWith')

/** A rejection with a reason the caller can act on, stored with the reply. No state can be taken for it. */
export interface RejectedWith<Reason> {
  readonly [RejectedWithTypeId]: typeof RejectedWithTypeId
  readonly reason: Reason
}

export const rejectWith = <Reason>(reason: Reason): RejectedWith<Reason> => ({
  [RejectedWithTypeId]: RejectedWithTypeId,
  reason,
})

export type Rejected<Reason = never> = typeof reject | RejectedWith<Reason>

export const isRejected = (result: unknown): result is Rejected<unknown> =>
  result === reject || (typeof result === 'object' && result !== null && RejectedWithTypeId in result)

/** The reason of a rejection, null for a bare `reject`. */
export const reasonOf = <Reason>(rejected: Rejected<Reason>): Reason | null =>
  rejected === reject ? null : rejected.reason

/**
 * A rule of the program broken, which `defect` throws: a message that cannot arrive, a state that cannot be.
 * `reason` says which rule.
 */
export class InvariantDefect extends Data.TaggedError('InvariantDefect')<
  Readonly<{ reason: string; message: string }>
> {
  constructor({ reason }: Readonly<{ reason: string }>) {
    super({ reason, message: reason })
  }
}

/**
 * Thrown by `update` on a message that cannot arrive. It suspends the entity. An expression, so that it fits a
 * branch of a ternary or a `Match`; inside an operation, `Effect.die` is the way.
 */
export const defect = (reason: string): never => {
  throw new InvariantDefect({ reason })
}

/** A value JSON holds: what a schema encodes to, so that a runtime can write it (decision 0030). */
export type Json = string | number | boolean | null | { readonly [key: string]: Json } | ReadonlyArray<Json>

/**
 * Whether a value is JSON as it is, so that `JSON.stringify` writes what is read back: the type `Json` admits
 * `NaN` and `Infinity`, which are written `null` (decision 0040).
 */
const isJson = (value: unknown): boolean => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJson)
  if (typeof value !== 'object') return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return (prototype === Object.prototype || prototype === null) && Object.values(value).every(isJson)
}

const encoders = new WeakMap<object, (value: unknown) => unknown>()

/**
 * A value encoded by its schema, as a runtime writes it: one the schema refuses, or that encodes to what JSON
 * does not hold as it is, cannot be stored, and is a defect. `what` names it in the defect (decision 0040).
 */
export const encode = <A>(codec: Schema.Codec<A, Json>, value: A, what: string): Json => {
  let encoder = encoders.get(codec)
  if (encoder === undefined) {
    encoder = Schema.encodeSync(codec as Schema.Codec<unknown, unknown>)
    encoders.set(codec, encoder)
  }
  let encoded: unknown
  try {
    encoded = encoder(value)
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message.split('\n')[0] : String(cause)
    throw new InvariantDefect({ reason: `the ${what} does not encode: ${reason}` })
  }
  if (!isJson(encoded)) throw new InvariantDefect({ reason: `the ${what} encodes to what JSON does not hold` })
  return encoded as Json
}

/**
 * How the JSON one version of a program wrote is read by the next, by kind of stored value: a pure function from
 * the JSON a version wrote to the JSON the one after it reads, and a kind left out is unchanged. It works on the
 * JSON, not on decoded values, because every schema encodes to what JSON holds (decision 0030): the types and
 * schemas of the version before do not live on in the code (decision 0036).
 */
export type Migration = Readonly<{
  state?: (json: Json) => Json
  inbound?: (json: Json) => Json
  internal?: (json: Json) => Json
  operation?: (json: Json) => Json
  rejection?: (json: Json) => Json
  sender?: (json: Json) => Json
  projection?: (json: Json) => Json
}>

/** A kind of stored value a migration reads: what a program's schemas write, each on its own. */
export type Migrated = keyof Migration

/**
 * What an index holds, and what a query compares it with: the scalars of JSON, which a store orders and
 * indexes. A time is its milliseconds, as a stored time is (decisions 0030, 0032).
 */
export type Scalar = string | number | boolean | null

/** An entity: the name of its program and its id. */
export type Address = Readonly<{ name: string; id: string }>

/** Who sent a message: a caller, another entity, or the entity's own durable work. */
export type Origin<Sender> =
  | Readonly<{ _tag: 'Self' }>
  | Readonly<{ _tag: 'Caller'; sender: Sender }>
  /** An operation of another entity. The runtime says which: an entity cannot pass for another. */
  | Readonly<{ _tag: 'Entity'; entity: Address }>

export type Meta<Sender> = Readonly<{
  /** When the runtime handles the message, read once before `update`. */
  at: DateTime.Utc
  from: Origin<Sender>
}>

/**
 * What an inbound message is answered. `Accepted` and `Rejected` are stored under the sender and its request id,
 * and a retry gets them again.
 * `NotFound` is the runtime's, and is not: a retry once the entity exists is applied. A caller outside may also
 * get `Suspended`, not stored either; `send` never does, since it waits.
 */
export type Reply<Reason> =
  | Readonly<{ _tag: 'Accepted' }>
  /** `reason` is null for a bare `reject`. */
  | Readonly<{ _tag: 'Rejected'; reason: Reason | null }>
  | Readonly<{ _tag: 'NotFound' }>

export type Update<State, Message, Sender, Reason> = (
  message: Message,
  meta: Meta<Sender>,
) => (state: State) => State | Rejected<Reason>

/**
 * The entity's program and id, the work's key and its incarnation: the same when a crash restarts the work, and
 * different for every other piece of work of every entity.
 */
export type IdempotencyKey = string & Brand.Brand<'IdempotencyKey'>

export const idempotencyKey = (entity: Address, key: string, incarnation: number): IdempotencyKey =>
  JSON.stringify([entity.name, entity.id, key, incarnation]) as IdempotencyKey

/**
 * How an operation runs, and what a crash does to it, declared for each kind of operation (decision 0011). It sees
 * the operation, never the state: what it uses is in the operation (decision 0018).
 */
export type Runner<Operation, Message, R> =
  /** Runs again with the same idempotency key, which it passes on: the world recognises it. */
  | Readonly<{
    delivery: 'Idempotent'
    run: (operation: Operation, key: IdempotencyKey) => Effect.Effect<Message, never, R>
  }>
  /** Runs again, and may act twice. */
  | Readonly<{ delivery: 'AtLeastOnce'; run: (operation: Operation) => Effect.Effect<Message, never, R> }>
  /** Never runs again: an activation that finds it with no completion delivers `unknown`, since it may have acted. */
  | Readonly<{
    delivery: 'AtMostOnce'
    run: (operation: Operation) => Effect.Effect<Message, never, R>
    unknown: (operation: Operation) => Message
  }>

export const operation: {
  /** An idempotent operation, which passes its idempotency key on. */
  <Operation, Message, R>(
    run: (operation: Operation, key: IdempotencyKey) => Effect.Effect<Message, never, R>,
  ): Runner<Operation, Message, R>
  readonly atLeastOnce: <Operation, Message, R>(
    run: (operation: Operation) => Effect.Effect<Message, never, R>,
  ) => Runner<Operation, Message, R>
  readonly atMostOnce: <Operation, Message, R>(
    run: (operation: Operation) => Effect.Effect<Message, never, R>,
    unknown: (operation: Operation) => Message,
  ) => Runner<Operation, Message, R>
} = Object.assign(
  <Operation, Message, R>(
    run: (operation: Operation, key: IdempotencyKey) => Effect.Effect<Message, never, R>,
  ): Runner<Operation, Message, R> => ({ delivery: 'Idempotent', run }),
  {
    atLeastOnce: <Operation, Message, R>(
      run: (operation: Operation) => Effect.Effect<Message, never, R>,
    ): Runner<Operation, Message, R> => ({ delivery: 'AtLeastOnce', run }),
    atMostOnce: <Operation, Message, R>(
      run: (operation: Operation) => Effect.Effect<Message, never, R>,
      unknown: (operation: Operation) => Message,
    ): Runner<Operation, Message, R> => ({ delivery: 'AtMostOnce', run, unknown }),
  },
)

const TimerTypeId: unique symbol = Symbol.for('effect-tea-durable/Timer')

export interface Timer<Message> {
  readonly [TimerTypeId]: typeof TimerTypeId
  readonly at: DateTime.Utc
  readonly message: Message
}

export const timer = <Message>(at: DateTime.Utc, message: Message): Timer<Message> => ({
  [TimerTypeId]: TimerTypeId,
  at,
  message,
})

export const isTimer = (work: unknown): work is Timer<unknown> =>
  typeof work === 'object' && work !== null && TimerTypeId in work

/** The work under a key: an operation, which is the program's own data, or a timer. */
export type Durable<Operation, Message> = Operation | Timer<Message>

/**
 * The work a state holds, by key. A program's keys are declared, so a state holds work under those and no
 * others (decision 0033).
 */
export type Work<Key extends string, Operation, Message> = {
  readonly [K in Key]?: Durable<Operation, Message>
}

export const noWork: Readonly<Record<string, never>> = Object.freeze({})

export type Types = Readonly<{
  state: object
  flags: unknown
  inbound: unknown
  internal: unknown
  /** The operations a state may hold, as data: a union tagged by `_tag`, with its schema. */
  operation: Readonly<{ _tag: string }>
  /** The keys the work under way is held under: a program declares them all (decision 0033). */
  key: string
  rejection: unknown
  sender: unknown
  projection: unknown
  /** The names of the indexes a query across the program's entities filters and orders by (decision 0032). */
  index: string
  services: unknown
}>

/**
 * The columns a query reads the entities by: for each name of `T['index']`, a pure function from the
 * projection to a scalar. A program asked nothing across its entities declares none (decision 0032).
 */
export type Indexes<T extends Types> = {
  readonly [Name in T['index']]: (projection: T['projection']) => Scalar
}

/** A runner for each kind of operation, by its tag. */
export type Runners<T extends Types> = {
  readonly [Tag in T['operation']['_tag']]: Runner<
    Extract<T['operation'], Readonly<{ _tag: Tag }>>,
    T['internal'],
    T['services']
  >
}

/**
 * How everything that leaves the process is written: the flags and messages that arrive, the state and the
 * operations it holds, stored with each step, the reasons of rejections, stored with the replies, the sender of
 * a message waiting in the mailbox, and the projection, which callers read (decisions 0025, 0027). Each of them
 * encodes to what JSON holds (decision 0030).
 */
export type Schemas<State, Flags, Inbound, Internal, Operation, Rejection, Sender, Projection> = Readonly<{
  state: Schema.Codec<State, Json>
  flags: Schema.Codec<Flags, Json>
  inbound: Schema.Codec<Inbound, Json>
  internal: Schema.Codec<Internal, Json>
  operation: Schema.Codec<Operation, Json>
  rejection: Schema.Codec<Rejection, Json>
  sender: Schema.Codec<Sender, Json>
  projection: Schema.Codec<Projection, Json>
}>

export interface Program<T extends Types> {
  /** What other entities read in `Address.name`, and the runtime stores the entity under. */
  readonly name: string
  /**
   * Every key the program's work is held under. The machine checks `durable` against them (decision 0037), and
   * a deploy that renames one is a change of the type (decision 0033).
   */
  readonly keys: ReadonlyArray<T['key']>
  readonly schemas: Schemas<
    T['state'],
    T['flags'],
    T['inbound'],
    T['internal'],
    T['operation'],
    T['rejection'],
    T['sender'],
    T['projection']
  >
  readonly init: (flags: T['flags'], at: DateTime.Utc) => T['state']
  readonly update: Update<T['state'], T['inbound'] | T['internal'], T['sender'], T['rejection']>
  /** The work each state holds, which the machine reads by key, under the keys the program declares. */
  readonly durable: (state: T['state']) => Readonly<Record<string, Durable<T['operation'], T['internal']>>>
  readonly operations: Runners<T>
  readonly project: (state: T['state']) => T['projection']
  /**
   * What a query across the program's entities may filter and order by, each a pure function of the projection:
   * the read model is the projection, and nothing is queried that a caller cannot read (decision 0032).
   */
  readonly indexes: Indexes<T>
  /**
   * How the versions before this one are read, in order: the first is the step from version 1 to version 2. A
   * program whose schemas never changed declares none, and is version 1 (decision 0036).
   */
  readonly migrations?: ReadonlyArray<Migration>
}

/** The version a program writes: a migration is the bump, so there is none to declare or to forget (decision 0036). */
export const versionOf = <T extends Types>(program: Program<T>): number => (program.migrations?.length ?? 0) + 1

/**
 * How the JSON a version wrote of one kind is read at the program's version: the migrations from `from` on, of
 * that kind, composed. A version the program does not have is not read at all — nothing of it can be decoded —
 * and this throws, which the runtime dies on (decision 0036).
 */
export const migrationOf = <T extends Types>(
  program: Program<T>,
  of: Migrated,
  from: number,
): (json: Json) => Json => {
  const migrations = program.migrations ?? []
  const version = migrations.length + 1
  if (!Number.isInteger(from) || from < 1 || from > version) {
    throw new Error(`'${program.name}' is version ${version}, and has no reading of version ${from}`)
  }
  const steps = migrations.slice(from - 1).flatMap((migration) => migration[of] ?? [])
  return steps.length === 0 ? (json) => json : (json) => steps.reduce((held, up) => up(held), json)
}

/** The runner of an operation, found by its tag. */
export const runnerOf = <T extends Types>(
  program: Program<T>,
  operation: T['operation'],
): Runner<T['operation'], T['internal'], T['services']> =>
  // `Runners` has a runner for every tag of `T['operation']`, which TypeScript cannot index by a tag it holds.
  (program.operations as unknown as Readonly<Record<string, Runner<T['operation'], T['internal'], T['services']>>>)[
    operation._tag
  ] as Runner<T['operation'], T['internal'], T['services']>

/**
 * The value of each index on a projection: what the machine checks and a runtime writes. An index that dies is
 * a defect, as a `project` that dies is (decision 0032).
 */
export const indexesOf = <T extends Types>(
  program: Program<T>,
  projection: T['projection'],
): Readonly<Record<string, Scalar>> => {
  // `Indexes` has a function for every name of `T['index']`, which TypeScript cannot index by a name it holds.
  const indexes = program.indexes as Readonly<Record<string, (projection: T['projection']) => Scalar>>
  return Object.fromEntries(
    Object.entries(indexes).map(([name, read]): readonly [string, Scalar] => [name, read(projection)]),
  )
}

/**
 * A runner for each kind of operation, as a program declares it: the runner says which messages the operation
 * answers, and they are messages of the program's internal union (decision 0034).
 */
type Declared<Operation extends Readonly<{ _tag: string }>, Internal> = {
  readonly [Tag in Operation['_tag']]: Runner<Extract<Operation, Readonly<{ _tag: Tag }>>, Internal, unknown>
}

/** What the runners of a declaration run in: the services they need, together. */
type ServicesOf<Operations> = Effect.Services<
  Operations[keyof Operations] extends Readonly<{ run: (...args: never[]) => infer Running }> ? Running : never
>

/** The types `program` reads off a declaration, which an object literal typed `Program<T>` writes out by hand. */
type Inferred<
  State extends object,
  Flags,
  Inbound,
  Internal,
  Operation extends Readonly<{ _tag: string }>,
  Rejection,
  Sender,
  Projection,
  Keys extends ReadonlyArray<string>,
  Operations,
  Indexes,
> = Readonly<{
  state: State
  flags: Flags
  inbound: Inbound
  internal: Internal
  operation: Operation
  key: Keys[number]
  rejection: Rejection
  sender: Sender
  projection: Projection
  index: Extract<keyof Indexes, string>
  services: ServicesOf<Operations>
}>

/**
 * The one place a program is declared: its schemas, which give every type the program is written in, and then
 * what it does (decision 0035). An object literal typed `Program<T>` names each type twice, and holds neither
 * the keys `durable` may use nor the messages an operation answers; here the schemas say what the state, the
 * flags, the messages, the operations, the rejections, the senders and the projection are, `keys` the space of
 * keys the work is held under (decision 0033), each runner which messages its kind of operation answers and
 * which services it needs (decision 0034), and `indexes` what a query filters and orders by.
 */
export const program = <
  State extends object,
  Flags,
  Inbound,
  Internal,
  Operation extends Readonly<{ _tag: string }>,
  Rejection,
  Sender,
  Projection,
>(schemas: Schemas<State, Flags, Inbound, Internal, Operation, Rejection, Sender, Projection>) =>
<
  const Keys extends ReadonlyArray<string>,
  Operations extends Declared<Operation, Internal>,
  Indexes extends Readonly<Record<string, (projection: Projection) => Scalar>>,
>(
  declaration: Readonly<{
    name: string
    /** Every key `durable` holds work under: work under any other key is a type error (decision 0033). */
    keys: Keys
    init: (flags: Flags, at: DateTime.Utc) => State
    update: Update<State, Inbound | Internal, Sender, Rejection>
    durable: (state: State) => Work<Keys[number], Operation, Internal>
    operations: Operations
    project: (state: State) => Projection
    indexes: Indexes
    /** How the versions before this one are read, in order: none for a first version (decision 0036). */
    migrations?: ReadonlyArray<Migration>
  }>,
): Program<
  Inferred<State, Flags, Inbound, Internal, Operation, Rejection, Sender, Projection, Keys, Operations, Indexes>
> => {
  type Of = Inferred<State, Flags, Inbound, Internal, Operation, Rejection, Sender, Projection, Keys, Operations, Indexes>
  return {
    ...declaration,
    schemas,
    // Work held under the declared keys is the record by key the machine reads.
    durable: declaration.durable as Program<Of>['durable'],
    // Each runner says which services its kind of operation needs; together they are the program's.
    operations: declaration.operations as Runners<Of>,
  }
}

/** What creating an entity is answered. Only `Created` is stored, under its sender and the request id. */
export type Creation = Readonly<{ _tag: 'Created' }> | Readonly<{ _tag: 'AlreadyExists' }>

/**
 * The service through which an operation sends messages to other entities, as its own entity. The runtime
 * provides it, filling in the sender from the operation that runs.
 */
export class Entities extends Context.Service<Entities, {
  readonly send: <T extends Types>(
    program: Program<T>,
    id: string,
    message: T['inbound'],
    key: IdempotencyKey,
    name: string,
  ) => Effect.Effect<Reply<T['rejection']>>
  readonly create: <T extends Types>(
    program: Program<T>,
    id: string,
    flags: T['flags'],
    requestId: IdempotencyKey,
  ) => Effect.Effect<Creation>
}>()('effect-tea-durable/Entities') {}

/**
 * Sends an inbound message to another entity from an operation, and waits for the reply. The request id is the
 * operation's idempotency key and `name`, which names the request among those the operation makes: a restarted
 * operation sends the same requests, and gets the stored replies, and one that sends twice under the same name to
 * the same entity dies (decision 0047). While the receiver is suspended, it waits, and it sends again when the
 * receiver crashes (decision 0046).
 */
export const send = <T extends Types>(
  program: Program<T>,
  id: string,
  message: T['inbound'],
  key: IdempotencyKey,
  name: string,
): Effect.Effect<Reply<T['rejection']>, never, Entities> =>
  Effect.flatMap(Effect.service(Entities), (entities) => entities.send(program, id, message, key, name))

/**
 * Creates an entity from an operation, with the operation's idempotency key as the request id. A creation is
 * stored apart from messages, so the same operation may then send the entity one message (decision 0017).
 */
export const create = <T extends Types>(
  program: Program<T>,
  id: string,
  flags: T['flags'],
  requestId: IdempotencyKey,
): Effect.Effect<Creation, never, Entities> =>
  Effect.flatMap(Effect.service(Entities), (entities) => entities.create(program, id, flags, requestId))
