import type * as Brand from 'effect/Brand'
import * as Context from 'effect/Context'
import * as Data from 'effect/Data'
import type * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import { Base64Url } from 'effect/encoding'
import * as Schema from 'effect/Schema'
import { createHash } from 'node:crypto'

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

/** A value JSON holds: what a schema encodes to, so that a runtime can write it (decisions 0030, 0098). */
export type Json = Schema.Json

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
 * How the JSON one version of a program wrote is read by the next, by kind of stored value. Each kind is a pure
 * function from the JSON a version wrote to the JSON the one after it reads, and a kind left out is unchanged. It
 * works on the JSON, not on decoded values, because every schema encodes to what JSON holds (decision 0030): the
 * types and schemas of the version before do not live on in the code (decision 0036).
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

/**
 * A request, as it is stored and deduplicated: who asked, and what names the request among the ones it makes
 * (decision 0059). A caller's is its sender's, as the program's schema writes it, under the request id it chose
 * (decision 0048). Another entity's is a run of one of its operations, its entity, key and incarnation, under the
 * name the operation gave the request (decisions 0015, 0047). The entity's own is the rehearsal's creation, which
 * no one retries.
 */
export type Request<Sender> =
  | Readonly<{ _tag: 'Caller'; sender: Sender; id: string }>
  | Readonly<{ _tag: 'Operation'; entity: Address; key: string; incarnation: number; name: string }>
  | Readonly<{ _tag: 'Self'; id: string }>

/** Who sent a request, as `update` reads it in `meta.from`. */
export const originOf = <Sender>(request: Request<Sender>): Origin<Sender> =>
  request._tag === 'Caller'
    ? { _tag: 'Caller', sender: request.sender }
    : request._tag === 'Operation'
    ? { _tag: 'Entity', entity: request.entity }
    : { _tag: 'Self' }

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
 * different for every other piece of work of every entity. An idempotent runner passes it on to a service outside,
 * readable as JSON, or as its digest when the runner is declared with `operation.digest` (decision 0123). Nothing
 * of the library reads it back, and a request to another entity is a value of its own (decision 0059).
 */
export type IdempotencyKey = string & Brand.Brand<'IdempotencyKey'>

/**
 * The idempotency key of the work under `key`, as the machine writes a key: a name, or the canonical JSON of a name
 * and a parameter, which the key holds as JSON and not as a string of it (decision 0132).
 */
export const idempotencyKey = (entity: Address, key: string, incarnation: number): IdempotencyKey =>
  `[${JSON.stringify(entity.name)},${JSON.stringify(entity.id)},${
    isParameterized(key) ? key : JSON.stringify(key)
  },${incarnation}]` as IdempotencyKey

/**
 * Whether the machine's text of a key is a name with a parameter, `["charge","line-7"]`. A declared name never
 * starts with `[`, which `checkProgram` refuses, so a name is never read as one (decision 0132).
 */
export const isParameterized = (key: string): boolean => key.startsWith('[')

/**
 * The digest of an idempotency key, for a service that caps a key's length: the SHA-256 of its UTF-8 bytes, in
 * unpadded base64url, 43 characters of `[A-Za-z0-9_-]`. It never changes: a digest that did would run an
 * operation under way again under a new key (decision 0123).
 */
export const digestOf = (key: IdempotencyKey): IdempotencyKey =>
  // Effect's `Digest` runs SHA-256 only on `crypto.subtle`, which answers with a promise. The key a runner is
  // given is a pure function of what is stored, computed by the machine, so its digest is synchronous
  // (decision 0123).
  Base64Url.encode(createHash('sha256').update(key, 'utf8').digest()) as IdempotencyKey

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
  /** Runs again as an idempotent one does, given the digest of its idempotency key (decision 0123). */
  | Readonly<{
    delivery: 'IdempotentDigest'
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
  /**
   * Acts on nothing: a state may drop it or change it while it runs, which interrupts it, and a crash runs it again.
   * It sends to no entity and creates none, since a request is an act on the receiver (decision 0128).
   */
  | Readonly<{ delivery: 'Droppable'; run: (operation: Operation) => Effect.Effect<Message, never, R> }>

/** What a droppable runner's effect is checked against where its services `R` hold `Entities` (decision 0129). */
interface SendsToNoEntity {
  readonly 'a droppable operation sends to no entity, and creates none': unique symbol
}

/**
 * The services `R` of a droppable runner, or `SendsToNoEntity` where `R` holds `Entities`. The runner's effect is
 * checked against it, and the compiler's message names the rule. TypeScript still infers `R` from the runner.
 */
type WithoutEntities<R> = [Extract<R, Entities>] extends [never] ? R : SendsToNoEntity

export const operation: {
  /** An idempotent operation, which passes its idempotency key on. */
  <Operation, Message, R>(
    run: (operation: Operation, key: IdempotencyKey) => Effect.Effect<Message, never, R>,
  ): Runner<Operation, Message, R>
  /** An idempotent operation given the digest of its idempotency key, for a service that caps a key's length. */
  readonly digest: <Operation, Message, R>(
    run: (operation: Operation, key: IdempotencyKey) => Effect.Effect<Message, never, R>,
  ) => Runner<Operation, Message, R>
  readonly atLeastOnce: <Operation, Message, R>(
    run: (operation: Operation) => Effect.Effect<Message, never, R>,
  ) => Runner<Operation, Message, R>
  readonly atMostOnce: <Operation, Message, R>(
    run: (operation: Operation) => Effect.Effect<Message, never, R>,
    unknown: (operation: Operation) => Message,
  ) => Runner<Operation, Message, R>
  /**
   * An operation that acts on nothing, which a state may drop or change while it runs (decision 0128). A runner
   * whose services hold `Entities` does not compile, since a droppable operation sends to no entity (decision 0129).
   */
  readonly droppable: <Operation, Message, R>(
    run: (operation: Operation) => Effect.Effect<Message, never, WithoutEntities<R>>,
  ) => Runner<Operation, Message, R>
} = Object.assign(
  <Operation, Message, R>(
    run: (operation: Operation, key: IdempotencyKey) => Effect.Effect<Message, never, R>,
  ): Runner<Operation, Message, R> => ({ delivery: 'Idempotent', run }),
  {
    digest: <Operation, Message, R>(
      run: (operation: Operation, key: IdempotencyKey) => Effect.Effect<Message, never, R>,
    ): Runner<Operation, Message, R> => ({ delivery: 'IdempotentDigest', run }),
    atLeastOnce: <Operation, Message, R>(
      run: (operation: Operation) => Effect.Effect<Message, never, R>,
    ): Runner<Operation, Message, R> => ({ delivery: 'AtLeastOnce', run }),
    atMostOnce: <Operation, Message, R>(
      run: (operation: Operation) => Effect.Effect<Message, never, R>,
      unknown: (operation: Operation) => Message,
    ): Runner<Operation, Message, R> => ({ delivery: 'AtMostOnce', run, unknown }),
    droppable: <Operation, Message, R>(
      run: (operation: Operation) => Effect.Effect<Message, never, WithoutEntities<R>>,
    ): Runner<Operation, Message, R> => ({
      delivery: 'Droppable',
      // The runner that compiles needs `R`, since where `R` holds `Entities` no runner compiles.
      run: run as (operation: Operation) => Effect.Effect<Message, never, R>,
    }),
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
 * others (decision 0033). Under a key with a parameter, the work is a piece for each parameter, as pairs: two
 * parameters are the same when they encode alike, which a map does not compare by (decision 0132). A key whose
 * value is `undefined` holds no work, as a key left out does.
 */
export type Work<Key extends string, Parameter, Operation, Message> = {
  readonly [K in Key]?:
    | (K extends keyof Parameter ? ReadonlyArray<readonly [Parameter[K], Durable<Operation, Message>]>
      : Durable<Operation, Message>)
    | undefined
}

/** The work under a key as `durable` may return it: one piece, or a piece for each parameter. */
export type Returned<Operation, Message> =
  | Durable<Operation, Message>
  | ReadonlyArray<readonly [unknown, Durable<Operation, Message>]>

/**
 * How a program declares its keys: for each name, the schema of its parameter, or null for a key without one
 * (decision 0132).
 */
export type Keys<Key extends string, Parameter> = {
  readonly [K in Key]: K extends keyof Parameter ? Schema.Codec<Parameter[K], Json> : null
}

export const noWork: Readonly<Record<string, never>> = Object.freeze({})

export type Types = Readonly<{
  state: object
  flags: unknown
  inbound: unknown
  internal: unknown
  /** The operations a state may hold, as data: a union tagged by `_tag`, with its schema. */
  operation: Readonly<{ _tag: string }>
  /** The names of the keys the work under way is held under: a program declares them all (decision 0033). */
  key: string
  /** The parameter of each key that takes one, by its name (decision 0132). */
  parameter: object
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
 * How everything that leaves the process is written (decisions 0025, 0027). That is the flags and messages that
 * arrive; the state and the operations it holds, stored with each step; the reasons of rejections, stored with
 * the replies; the sender of a message waiting in the mailbox; and the projection, which callers read. Each of
 * them encodes to what JSON holds (decision 0030).
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
   * Every key the program's work is held under, with the schema of its parameter, or null for a key without one.
   * The machine checks `durable` against them (decisions 0037, 0132), and a deploy that renames one is a change of
   * the type (decision 0033).
   */
  readonly keys: Keys<T['key'], T['parameter']>
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
  readonly durable: (
    state: T['state'],
  ) => Readonly<Record<string, Returned<T['operation'], T['internal']> | undefined>>
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

/** An index's name is a word, so that a store writes it as it is, in a query and in an index of its own. */
const isWord = (name: string) => /^[A-Za-z][A-Za-z0-9_]*$/.test(name)

/**
 * Refuses a program that cannot run as it is written: an empty name, a key whose name starts with `[`, which the
 * machine would read as a key with a parameter (decision 0132), an index whose name is not a word. It is pure, and
 * called where a program enters, before anything is stored or run: `deploy`, which a fix is too, and `rehearse`. A
 * program is never mutated, so the check holds for as long as the program runs (decisions 0052, 0054). A missing
 * runner is the machine's to find, where an operation is held.
 */
export const checkProgram = <T extends Types>(program: Program<T>): void => {
  const refuse = (reason: string): never => {
    throw new InvariantDefect({ reason: `the program '${program.name}' ${reason}` })
  }
  if (program.name.length === 0) refuse('has an empty name')
  for (const key of Object.keys(program.keys)) {
    if (isParameterized(key)) refuse(`declares the key '${key}', whose name starts with '['`)
  }
  for (const index of Object.keys(program.indexes)) {
    if (!isWord(index)) refuse(`has an index '${index}' whose name is not a word`)
  }
}

/**
 * The runner of an operation, found by its tag, or `undefined` for a tag the program gives none for: the types
 * give one for every tag, and a cast does not (decision 0054).
 */
export const runnerOf = <T extends Types>(
  program: Program<T>,
  operation: T['operation'],
): Runner<T['operation'], T['internal'], T['services']> | undefined => {
  // `Runners` has a runner for every tag of `T['operation']`, which TypeScript cannot index by a tag it holds.
  const runners = program.operations as unknown as Readonly<
    Record<string, Runner<T['operation'], T['internal'], T['services']>>
  >
  return Object.hasOwn(runners, operation._tag) ? runners[operation._tag] : undefined
}

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

/** The parameter of each key a declaration gives a schema, by its name. */
type ParametersOf<Keys> = {
  readonly [K in keyof Keys as Keys[K] extends null ? never : K]: Keys[K] extends Schema.Codec<infer P, Json> ? P
    : never
}

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
  Keys,
  Operations,
  Indexes,
> = Readonly<{
  state: State
  flags: Flags
  inbound: Inbound
  internal: Internal
  operation: Operation
  key: Extract<keyof Keys, string>
  parameter: ParametersOf<Keys>
  rejection: Rejection
  sender: Sender
  projection: Projection
  index: Extract<keyof Indexes, string>
  services: ServicesOf<Operations>
}>

/**
 * The one place a program is declared: its schemas, which give every type the program is written in, and then
 * what it does (decision 0035). An object literal typed `Program<T>` names each type twice, and holds neither
 * the keys `durable` may use nor the messages an operation answers. Here each piece says its own type. The
 * schemas say what the state, the flags, the messages, the operations, the rejections, the senders and the
 * projection are. `keys` says the space of keys the work is held under (decision 0033). Each runner says which
 * messages its kind of operation answers, and which services it needs (decision 0034). `indexes` says what a
 * query filters and orders by.
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
  const Keys extends Readonly<Record<string, Schema.Codec<unknown, Json> | null>>,
  Operations extends Declared<Operation, Internal>,
  Indexes extends Readonly<Record<string, (projection: Projection) => Scalar>>,
>(
  declaration: Readonly<{
    name: string
    /**
     * Every key `durable` holds work under, with the schema of its parameter or null: work under any other key is a
     * type error (decisions 0033, 0132).
     */
    keys: Keys
    init: (flags: Flags, at: DateTime.Utc) => State
    update: Update<State, Inbound | Internal, Sender, Rejection>
    durable: (state: State) => Work<Extract<keyof Keys, string>, ParametersOf<Keys>, Operation, Internal>
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
    // Each key's schema gives the parameter's type, which `Keys` writes out of it.
    keys: declaration.keys as unknown as Program<Of>['keys'],
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
 * provides it to each run of an operation, filling in the request from that run: its entity, key and incarnation,
 * with the name the operation gives (decisions 0047, 0060).
 */
export class Entities extends Context.Service<Entities, {
  readonly send: <T extends Types>(
    program: Program<T>,
    id: string,
    message: T['inbound'],
    name: string,
  ) => Effect.Effect<Reply<T['rejection']>>
  readonly create: <T extends Types>(
    program: Program<T>,
    id: string,
    flags: T['flags'],
    name: string,
  ) => Effect.Effect<Creation>
}>()('effect-tea-durable/Entities') {}

/**
 * Sends an inbound message to another entity from an operation, and waits for the reply. The request is the run of
 * the operation and `name`, which names it among those the operation makes (decisions 0047, 0060). So a restarted
 * operation sends the same requests, and gets the stored replies. One that sends twice under the same name to the
 * same entity dies. While the receiver is suspended, it waits, and it sends again when the receiver crashes
 * (decision 0046).
 */
export const send = <T extends Types>(
  program: Program<T>,
  id: string,
  message: T['inbound'],
  name: string,
): Effect.Effect<Reply<T['rejection']>, never, Entities> =>
  Effect.flatMap(Effect.service(Entities), (entities) => entities.send(program, id, message, name))

/**
 * Creates an entity from an operation, under the run of the operation and `name`, as `send` sends. A creation is
 * stored apart from messages, so the same operation may then send the entity a message under the same name
 * (decisions 0017, 0050, 0060).
 */
export const create = <T extends Types>(
  program: Program<T>,
  id: string,
  flags: T['flags'],
  name: string,
): Effect.Effect<Creation, never, Entities> =>
  Effect.flatMap(Effect.service(Entities), (entities) => entities.create(program, id, flags, name))
