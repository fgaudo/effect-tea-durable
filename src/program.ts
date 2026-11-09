import type * as Brand from 'effect/Brand'
import * as Context from 'effect/Context'
import * as Data from 'effect/Data'
import type * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import { dual, identity } from 'effect/Function'
import type * as Optic from 'effect/Optic'
import * as Opt from 'effect/Option'
import * as Result from 'effect/Result'
import * as Schema from 'effect/Schema'
import * as Str from 'effect/String'
import type * as EffectTypes from 'effect/Types'

/**
 * What `update` returns for an inbound message that does not apply in the state, and what a program's `init` returns
 * for flags it does not create an entity from, with no reason given (decision 0182).
 */
export const reject: unique symbol = Symbol.for('@fgaudo/effect-tea-persistent/Rejected')

const RejectedWithTypeId: unique symbol = Symbol.for('@fgaudo/effect-tea-persistent/RejectedWith')

/** A rejection with a reason the caller can act on, stored with the reply. No state can be taken for it. */
export interface RejectedWith<Reason> {
  readonly [RejectedWithTypeId]: typeof RejectedWithTypeId
  /** The reason the caller is answered, in `Rejected`. */
  readonly reason: Reason
}

/**
 * Rejects with `reason`. Its type parameter is `const`, so a reason keeps its literal type where nothing around the
 * call types it, as in a case of `Match.valueTags` (decision 0201).
 */
export const rejectWith = <const Reason>(reason: Reason): RejectedWith<Reason> => ({
  [RejectedWithTypeId]: RejectedWithTypeId,
  reason,
})

/** A rejection, with a reason of the program's `rejection` schema or with none: what `update` gives for a message. */
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
  // `every` passes over the holes of a sparse array, which `JSON.stringify` writes as `null` (decision 0210).
  if (Array.isArray(value)) return Array.from(value.keys(), (at) => at in value && isJson(value[at])).every(Boolean)
  if (typeof value !== 'object') return false
  const prototype: unknown = Object.getPrototypeOf(value)
  return (prototype === Object.prototype || prototype === null) && Object.values(value).every(isJson)
}

/** JSON with the fields of each object in order: two values that encode alike are then equal, field for field. */
export const ordered = (json: Json): Json =>
  Array.isArray(json)
    ? json.map(ordered)
    : typeof json === 'object' && json !== null
    ? Object.fromEntries(
      Object.entries(json)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([field, value]) => [field, ordered(value as Json)]),
    )
    : json

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
  /** Reads a stored state. */
  state?: (json: Json) => Json
  /** Reads an inbound message waiting in the mailbox. */
  inbound?: (json: Json) => Json
  /** Reads an internal message waiting in the mailbox. */
  internal?: (json: Json) => Json
  /** Reads an operation stored as work under way. */
  operation?: (json: Json) => Json
  /** Reads the reason of a stored reply. */
  rejection?: (json: Json) => Json
  /** Reads the sender of a stored reply or of a message waiting. */
  sender?: (json: Json) => Json
  /** Reads a stored projection, in the read model and in the log. */
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

/**
 * A key of an entity's work, as the machine, the storage and the runtime hold it: the name the program declares,
 * and for a key that takes one, its parameter as the key's schema encodes it, with the fields of each object in
 * order. Two keys are one when their names are the same and their parameters encode alike. A key without a
 * parameter has no `parameter`, so nothing reads a key's text to tell the two kinds apart (decision 0136).
 */
export type Key = Readonly<{ name: string; parameter?: Json }>

/** How a key is stored: in a suspension, and in a request that another entity's operation sent. */
export const KeyCodec = Schema.Struct({
  name: Schema.String,
  parameter: Schema.optionalKey(Schema.Json),
}) as unknown as Schema.Codec<Key, Json>

/** Who sent a message: a caller, another entity, or the entity's own work. */
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
  | Readonly<{ _tag: 'Operation'; entity: Address; key: Key; incarnation: number; name: string }>
  | Readonly<{ _tag: 'Self'; id: string }>

/** Who sent a request, as `update` reads it in `meta.from`. */
export const originOf = <Sender>(request: Request<Sender>): Origin<Sender> =>
  request._tag === 'Caller'
    ? { _tag: 'Caller', sender: request.sender }
    : request._tag === 'Operation'
    ? { _tag: 'Entity', entity: request.entity }
    : { _tag: 'Self' }

/** What `update` is told of a message besides the message itself: when it is handled, and who sent it. */
export type Meta<Sender> = Readonly<{
  /** When the runtime handles the message, read once before `update`. */
  at: DateTime.Utc
  /** Who sent the message: a caller with its sender, another entity, or the entity's own work. */
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

/**
 * The type of `update`: given a message and its meta, a function from the state to the next state or to a rejection.
 * It is pure, and reads time only from `meta.at`.
 */
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
 * The idempotency key of the work under `key`. It holds the key's name, or for a key with a parameter the name and
 * the parameter's JSON, as JSON in place and not as a string of it: `["Order","o-1",["charge","line-7"],4]`
 * (decisions 0132, 0136).
 */
export const idempotencyKey = (entity: Address, key: Key, incarnation: number): IdempotencyKey =>
  JSON.stringify([
    entity.name,
    entity.id,
    key.parameter === undefined ? key.name : [key.name, key.parameter],
    incarnation,
  ]) as IdempotencyKey

/**
 * How an operation runs, and what a crash does to it, declared for each kind of operation (decision 0011). It sees
 * the operation, never the state: what it uses is in the operation (decision 0018).
 */
export type Runner<Operation, Message, R> =
  /** Runs again with the same idempotency key, which it passes on: the world recognises it. */
  | Readonly<{
    delivery: 'Idempotent'
    /** Runs the operation, and ends with the internal message its entity is delivered. */
    run: (operation: Operation, key: IdempotencyKey) => Effect.Effect<Message, never, R>
  }>
  /** Runs again as an idempotent one does, given the digest of its idempotency key (decision 0123). */
  | Readonly<{
    delivery: 'IdempotentDigest'
    /** Runs the operation, and ends with the internal message its entity is delivered. */
    run: (operation: Operation, key: IdempotencyKey) => Effect.Effect<Message, never, R>
  }>
  /** Runs again, and may act twice. */
  | Readonly<{
    delivery: 'AtLeastOnce'
    /** Runs the operation, and ends with the internal message its entity is delivered. */
    run: (operation: Operation) => Effect.Effect<Message, never, R>
  }>
  /** Never runs again: an activation that finds it with no completion delivers `unknown`, since it may have acted. */
  | Readonly<{
    delivery: 'AtMostOnce'
    /** Runs the operation, and ends with the internal message its entity is delivered. */
    run: (operation: Operation) => Effect.Effect<Message, never, R>
    /** The message delivered for an operation the process died during, whose outcome is not known. */
    unknown: (operation: Operation) => Message
  }>
  /**
   * Acts on nothing: a state may drop it or change it while it runs, which interrupts it, and a crash runs it again.
   * It sends to no entity and creates none, since a request is an act on the receiver (decision 0128).
   */
  | Readonly<{
    delivery: 'Droppable'
    /** Runs the operation, and ends with the internal message its entity is delivered. */
    run: (operation: Operation) => Effect.Effect<Message, never, R>
  }>

/** What a droppable runner's effect is checked against where its services `R` hold `Entities` (decision 0129). */
interface SendsToNoEntity {
  readonly 'a droppable operation sends to no entity, and creates none': unique symbol
}

/**
 * The services `R` of a droppable runner, or `SendsToNoEntity` where `R` holds `Entities`. The runner's effect is
 * checked against it, and the compiler's message names the rule. TypeScript still infers `R` from the runner.
 */
type WithoutEntities<R> = [Extract<R, Entities>] extends [never] ? R : SendsToNoEntity

/**
 * The runner of an operation, with its delivery: what a crash during the operation does to it. Called as a
 * function, it declares an idempotent runner: one run again after a crash, under the same idempotency key, which it
 * passes to the service it calls.
 */
export const operation: {
  /** An idempotent operation, which passes its idempotency key on. */
  <Operation, Message, R>(
    run: (operation: Operation, key: IdempotencyKey) => Effect.Effect<Message, never, R>,
  ): Runner<Operation, Message, R>
  /** An idempotent operation given the digest of its idempotency key, for a service that caps a key's length. */
  readonly digest: <Operation, Message, R>(
    run: (operation: Operation, key: IdempotencyKey) => Effect.Effect<Message, never, R>,
  ) => Runner<Operation, Message, R>
  /**
   * An operation run again after a crash, with no idempotency key: for an action that is the same however many
   * times it runs, as a request to another entity under a name.
   */
  readonly atLeastOnce: <Operation, Message, R>(
    run: (operation: Operation) => Effect.Effect<Message, never, R>,
  ) => Runner<Operation, Message, R>
  /**
   * An operation never run again after a crash, as an email a second copy of is worse than none. An operation the
   * process died during delivers the message that `unknown` gives instead, which says that its outcome is not known.
   */
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

const TimerTypeId: unique symbol = Symbol.for('@fgaudo/effect-tea-persistent/Timer')

/** A timer, as `work` returns it under a key: data, which the runtime arms while the state holds it. */
export interface Timer<Message> {
  readonly [TimerTypeId]: typeof TimerTypeId
  /** When the timer fires. */
  readonly at: DateTime.Utc
  /** The internal message the timer sends its entity when it fires. */
  readonly message: Message
}

/**
 * A timer that sends `message` to its entity at `at`. `Message` is `const`, so that a message's tag stays its literal
 * where nothing gives the call a type to infer from, as in a branch of `Match.valueTags`. `work` checks it against
 * the program's internal messages. `const` also makes an array a readonly tuple, which a mutable array of
 * `Schema.mutable` does not take, so a program with one writes `timer<Internal>(…)` (decision 0181).
 */
export const timer = <const Message>(at: DateTime.Utc, message: Message): Timer<Message> => ({
  [TimerTypeId]: TimerTypeId,
  at,
  message,
})

export const isTimer = (work: unknown): work is Timer<unknown> =>
  typeof work === 'object' && work !== null && TimerTypeId in work

/** The work under a key: an operation, which is the program's own data, or a timer. */
export type Piece<Operation, Message> = Operation | Timer<Message>

/**
 * The work a state holds, by key. A program's keys are declared, so a state holds work under those and no
 * others (decision 0033). Under a key with a parameter, the work is a piece for each parameter, as pairs: two
 * parameters are the same when they encode alike, which a map does not compare by (decision 0132). A key whose
 * value is `undefined` holds no work, as a key left out does.
 */
export type Work<Key extends string, Parameter, Operation, Message> = {
  readonly [K in Key]?:
    | (K extends keyof Parameter ? ReadonlyArray<readonly [Parameter[K], Piece<Operation, Message>]>
      : Piece<Operation, Message>)
    | undefined
}

/** The work under a key as `work` may return it: one piece, or a piece for each parameter. */
export type Returned<Operation, Message> =
  | Piece<Operation, Message>
  | ReadonlyArray<readonly [unknown, Piece<Operation, Message>]>

/**
 * How a program holds its keys: for each name, the schema of its parameter, or null for a key without one. A
 * declaration lists them, and `program` and `part` make this record of the list (decisions 0132, 0197).
 */
export type Keys<Key extends string, Parameter> = {
  readonly [K in Key]: K extends keyof Parameter ? Schema.Codec<Parameter[K], Json> : null
}

const KeyWithParameterTypeId: unique symbol = Symbol.for('@fgaudo/effect-tea-persistent/KeyWithParameter')

/** A key that takes a parameter, as a declaration lists it: its name, and the schema of its parameter. */
export interface KeyWithParameter<Name extends string, Parameter> {
  readonly [KeyWithParameterTypeId]: typeof KeyWithParameterTypeId
  /** The key's name, which `work` returns the key's work under. */
  readonly name: Name
  /** The schema of the key's parameter, which tells apart two pieces of work under one name. */
  readonly parameter: Schema.Codec<Parameter, Json>
}

/**
 * A key that takes a parameter, for the list of a declaration's keys: `keys: ['fee', key('charge', Schema.String)]`.
 * A key without one is its name alone (decision 0197).
 */
export const key = <const Name extends string, Parameter>(
  name: Name,
  parameter: Schema.Codec<Parameter, Json>,
): KeyWithParameter<Name, Parameter> => ({ [KeyWithParameterTypeId]: KeyWithParameterTypeId, name, parameter })

/** What a declaration lists as its keys: a name for a key without a parameter, or a `key` for one with. */
export type DeclaredKeys = ReadonlyArray<string | KeyWithParameter<string, unknown>>

/** The name of an entry of a declaration's list of keys. */
type NameOf<Entry> = Entry extends KeyWithParameter<infer Name, unknown> ? Name : Entry & string

/** The record of keys a declaration's list makes, as `Keys` holds them. */
type KeysOf<List extends DeclaredKeys> = {
  readonly [Entry in List[number] as NameOf<Entry>]:
    Entry extends KeyWithParameter<string, infer Parameter> ? Schema.Codec<Parameter, Json> : null
}

/**
 * What a list of keys must also be: nothing more where every name is a literal type. A list whose names widened to
 * `string`, as an array written outside the call without `as const` does, would make every key declared, so it does
 * not compile (decision 0199).
 */
type LiteralNames<List extends DeclaredKeys> = string extends NameOf<List[number]>
  ? Readonly<{ 'each key is named by a literal: write the list in the call, or `as const`': never }>
  : unknown

/** What `work` returns for a state that holds no work: no operation and no timer. */
export const noWork: Readonly<Record<string, never>> = Object.freeze({})

/**
 * The types of a program, as one record: what its schemas decode to, and the names of its keys, indexes and topics.
 * `TypesOf<typeof program>` gives the record of a declared program, which a handle and a rehearsal are typed by.
 */
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
  /**
   * The topics of the log, by name, each with the type of the value its selector gives of the projection. Types
   * that leave it out publish the projection as the one topic `projection` (decisions 0138, 0140).
   */
  topics?: Readonly<Record<string, Json>> | undefined
}>

/** The topics `T` declares, each with the type of its value, or `never` where it declares none (decision 0140). */
type DeclaredTopics<T extends Types> = T extends Readonly<{ topics: infer Topics extends Readonly<Record<string, Json>> }>
  ? Topics
  : never

/** The name of a topic of the log a program publishes: `projection` for a program that declares none. */
export type Topic<T extends Types> = [DeclaredTopics<T>] extends [never] ? 'projection'
  : Extract<keyof DeclaredTopics<T>, string>

/**
 * What a row of the topic `Name` gives: the value the topic's selector gives of the projection, or the projection
 * whole for the topic `projection` of a program that declares none (decision 0140).
 */
export type Value<T extends Types, Name extends Topic<T>> = [DeclaredTopics<T>] extends [never] ? T['projection']
  : DeclaredTopics<T>[Name & keyof DeclaredTopics<T>]

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

/** Only a type: the key under which a reference carries its program's types. Nothing is stored under it. */
declare const ReferenceTypes: unique symbol

/**
 * A program as a sender names it: its name, with its types, and none of its code (decision 0183). `send` and `create`
 * take a reference or the program, and reach the program the runtime deployed under the name.
 * `reference<typeof p>(name)` makes one where an `import type` of `p` brings only its types.
 */
export interface Reference<T extends Types, Name extends string = string> {
  /** The name of the program, which the runtime deployed it under. */
  readonly name: Name
  /**
   * Only a type, never set: it carries `T` to `send` and `create`, which infer it. A program has none, so that a
   * program stays assignable to one of wider types, as tests of migrations write.
   */
  readonly [ReferenceTypes]: EffectTypes.Invariant<T>
}

/** What a sender names a receiver by: the receiver's program, or a reference to it (decision 0183). */
export type Receiver<T extends Types> = Program<T> | Reference<T>

/**
 * A reference to the program `P` under its name, made without `P`'s code: `P` is `typeof p` of an `import type`. The
 * name is the type of `P`'s, so a name that is not the program's does not compile, where a send under it would
 * wait for ever for a deploy of that name. A program whose name is typed `string`, as one typed `Program<T>` by hand,
 * has no reference: no name could be checked against it, and a sender passes the program itself (decision 0183).
 */
export const reference = <P extends Program<any, string>>(
  name: LiteralName<P['name']>,
): Reference<TypesOf<P>, P['name']> =>
  // The types are all the reference carries, and nothing reads them at run time.
  Object.freeze({ name }) as unknown as Reference<TypesOf<P>, P['name']>

/**
 * The types of `P`, a program or a reference to one, which `Handle`, `Rehearsal` and `Published` take:
 * `Handle<TypesOf<typeof p>>`, and `TypesOf<typeof p>['inbound']` for its inbound messages (decision 0188). Any
 * other type gives `never`.
 */
export type TypesOf<P> = P extends Program<infer T, string> ? T
  : P extends Reference<infer T, string> ? T
  : never

/** A program's name where its type is a literal, and `never`, which no name is, where it is any `string`. */
type LiteralName<Name extends string> = string extends Name ? never : Name

/**
 * Whether a receiver is a program, whose code a rehearsal can run, and not a reference, which brings only the name
 * of the program deployed under it.
 */
export const isProgram = <T extends Types>(receiver: Receiver<T>): receiver is Program<T> =>
  Object.hasOwn(receiver, 'init')

/**
 * A program, as `program` declares it: the pieces the runtime runs every entity of one kind with. A deploy takes it,
 * and a rehearsal runs it without a database or a clock.
 */
export interface Program<T extends Types, Name extends string = string> {
  /** What other entities read in `Address.name`, and the runtime stores the entity under. */
  readonly name: Name
  /**
   * Every key the program's work is held under, with the schema of its parameter, or null for a key without one:
   * the record `program` makes of the declaration's list (decision 0197). The machine checks `work` against them
   * (decisions 0037, 0132), and a deploy that renames one is a change of the type (decision 0033).
   */
  readonly keys: Keys<T['key'], T['parameter']>
  /** The schemas the declaration gave, by their keys: `state`, `flags`, `inbound` and the others. */
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
  /**
   * The first state, or a rejection of the flags: the entity is then not created, nothing is stored, and the creator
   * is answered `Rejected` (decision 0182).
   */
  readonly init: (flags: T['flags'], at: DateTime.Utc) => T['state'] | Rejected<T['rejection']>
  /** The next state for an inbound or an internal message, or a rejection of the message. */
  readonly update: Update<T['state'], T['inbound'] | T['internal'], T['sender'], T['rejection']>
  /** The work each state holds, which the machine reads by key, under the keys the program declares. */
  readonly work: (
    state: T['state'],
  ) => Readonly<Record<string, Returned<T['operation'], T['internal']> | undefined>>
  /** The runner of each operation, by its tag, with its delivery. */
  readonly operations: Runners<T>
  /** The projection of a state: what callers read, what a query filters on, and what the log publishes. */
  readonly project: (state: T['state']) => T['projection']
  /**
   * The topics of the log, each a pure function that selects, of the projection, the topic's value: a step writes
   * a row in a topic when that changed, and the row gives it. A program that declares none publishes its
   * projection as the one topic `projection` (decisions 0138, 0140).
   */
  readonly topics?: { readonly [Name in Topic<T>]: (projection: T['projection']) => Value<T, Name> }
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
export const versionOf = (program: Pick<Program<Types>, 'migrations'>): number => (program.migrations?.length ?? 0) + 1

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

/**
 * A topic of the log, as the runtime reads it: its name, and what it selects of the projection, which a step
 * compares to decide whether to write a row in it, or `null` for the whole projection (decision 0138).
 */
export type TopicOf = Readonly<{ topic: string; select: ((projection: unknown) => Json) | null }>

/**
 * The topics a program publishes, in the order it declares them: its projection as the topic `projection`, where
 * it declares none (decision 0138).
 */
export const topicsOf = <T extends Types>(program: Program<T>): ReadonlyArray<TopicOf> =>
  program.topics === undefined
    ? [{ topic: 'projection', select: null }]
    : Object.entries(program.topics as unknown as Readonly<Record<string, (projection: unknown) => Json>>)
      .map(([topic, select]) => ({ topic, select }))

/**
 * Whether a string is text every database holds as it is: it holds no U+0000, which PostgreSQL holds in no text and
 * parses in no JSON, and no lone surrogate, which PostgreSQL writes as U+FFFD, so that two strings would be one,
 * and SQLite gives back as U+FFFD for each of its bytes, so that the string read finds no row. A
 * regular expression with the flag `u` reads a pair of surrogates as one code point, so `\p{Cs}` finds a lone one
 * only (decision 0157).
 */
export const isText = (text: string): boolean => !text.includes('\u0000') && !/\p{Cs}/u.test(text)

/**
 * Why a string a caller gave as an id is no id, or `undefined` when it is one. An id is text a database holds, and
 * not empty: the waker and `reindex` page the entities from the empty string up, so an entity under the empty id
 * would never be woken nor indexed (decision 0179). The types do not hold a cast or a call from JavaScript, so a
 * value that is no string is refused too (decision 0053).
 */
export const idFault = (id: unknown): string | undefined =>
  typeof id !== 'string' || !isText(id)
    ? `the id is ${JSON.stringify(id)}, which is no text a database holds`
    : Str.isEmpty(id)
    ? 'the id is empty, and an id is not'
    : undefined

/**
 * Why a string a caller gave as a request id is no request id, or `undefined` when it is one. A request id is text a
 * database holds, since the storage writes it as it is in the column `request_id` of `effecttea_replies`, and reads the
 * reply by it. The empty string is a request id, since nothing pages by it. The types do not hold a cast or a call
 * from JavaScript, so a value that is no string is refused too (decisions 0053, 0204).
 */
export const requestIdFault = (requestId: unknown): string | undefined =>
  typeof requestId !== 'string' || !isText(requestId)
    ? `the request id is ${JSON.stringify(requestId)}, which is no text a database holds`
    : undefined

/** An index's name is a word, so that a store writes it as it is, in a query and in an index of its own. */
const isWord = (name: string) => /^[A-Za-z][A-Za-z0-9_]*$/.test(name)

/**
 * Refuses a program that cannot run as it is written: an empty name, a name no database holds as it is, an index
 * whose name is not a word. It is pure, and
 * called where a program enters, before anything is stored or run: `deploy`, which a fix is too, and `rehearse`. A
 * program is never mutated, so the check holds for as long as the program runs (decisions 0052, 0054). A missing
 * runner is the machine's to find, where an operation is held.
 */
export const checkProgram = <T extends Types>(program: Program<T>): void => {
  const refuse = (reason: string): never => {
    throw new InvariantDefect({ reason: `the program '${program.name}' ${reason}` })
  }
  if (program.name.length === 0) refuse('has an empty name')
  // A name, a key's name and a topic's are each stored as text of their own (decision 0157).
  if (!isText(program.name)) refuse('has a name that is no text a database holds')
  for (const key of Object.keys(program.keys)) {
    if (!isText(key)) refuse(`has a key ${JSON.stringify(key)} whose name is no text a database holds`)
  }
  for (const index of Object.keys(program.indexes)) {
    if (!isWord(index)) refuse(`has an index '${index}' whose name is not a word`)
  }
  // A program that declares topics publishes them alone, so `topics` with none would publish nothing (decision 0138).
  if (program.topics !== undefined) {
    const topics = Object.keys(program.topics)
    if (topics.length === 0) refuse('declares no topic in its topics')
    for (const topic of topics) {
      if (topic.length === 0) refuse('has a topic with an empty name')
      if (!isText(topic)) refuse(`has a topic ${JSON.stringify(topic)} whose name is no text a database holds`)
    }
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

const RaisedTypeId: unique symbol = Symbol.for('@fgaudo/effect-tea-persistent/Raised')

/**
 * A state with the events a child raised for its parent in the same step. An event is handled by the parent's
 * `onEvent` in the step that raised it, and nothing stores it (decision 0133).
 */
export interface Raised<State, Event> {
  readonly [RaisedTypeId]: typeof RaisedTypeId
  /** The child's next state. */
  readonly state: State
  /** The events for the parent, in the order they were raised. */
  readonly events: ReadonlyArray<Event>
}

/**
 * What a step of a part gives: its next state, or that state with the events it raised for its parent. A part
 * that raises no event steps to a state alone, as a program does.
 */
export type Step<State, Event = never> = [Event] extends [never] ? State : State | Raised<State, Event>

const isRaised = (step: unknown): step is Raised<unknown, unknown> =>
  typeof step === 'object' && step !== null && RaisedTypeId in step

/** A step as its state and its events: no event for a state alone. */
const unfold = (step: unknown): Readonly<{ state: unknown; events: ReadonlyArray<unknown> }> =>
  isRaised(step) ? { state: step.state, events: step.events } : { state: step, events: [] }

/** The step to `state` with `events`: the state alone when there is none, so that a state stays a state. */
const stepOf = (state: unknown, events: ReadonlyArray<unknown>): unknown =>
  events.length === 0 ? state : { [RaisedTypeId]: RaisedTypeId, state, events }

/**
 * An event raised for the parent, the state unchanged: `raise(event)(state)` in a child's `update`, or
 * `onEvent: { Line: (id, event) => raise(event) }` in a parent that passes a child's event on as its own.
 */
export const raise = <Event>(event: Event) => <State>(state: State): Raised<State, Event> => ({
  [RaisedTypeId]: RaisedTypeId,
  state,
  events: [event],
})

/**
 * A step followed by another, made from its state: the state is the second's, and the events are both steps', in
 * order. Taking a step's state by hand to make the next one would drop its events. It is dual, for `pipe`.
 */
export const andThen: {
  <State, Event2 = never>(
    next: (state: State) => State | Raised<State, Event2>,
  ): <Event1 = never>(step: State | Raised<State, Event1>) => Step<State, Event1 | Event2>
  <State, Event1 = never, Event2 = never>(
    step: State | Raised<State, Event1>,
    next: (state: State) => State | Raised<State, Event2>,
  ): Step<State, Event1 | Event2>
} = dual(2, (step: unknown, next: (state: unknown) => unknown): unknown => {
  const first = unfold(step)
  const second = unfold(next(first.state))
  return stepOf(second.state, [...first.events, ...second.events])
})

/**
 * A message to a child by id, as `children.<child>.update(id, message)` makes it, with what tells a run of such
 * messages to their children at once. `forEach` finds it on the step the handle returns (decision 0155).
 */
type Told = Readonly<{
  id: unknown
  message: unknown
  /** Tells each child its message, in order, as the steps one after the other would. */
  all: (state: unknown, told: ReadonlyArray<Told>) => unknown
}>

const toldOf = new WeakMap<(state: unknown) => unknown, Told>()

/**
 * A step followed by one more for each item, in order, each made from the state the one before left: the
 * `andThen` of many, e.g. an order that cancels each of its lines. It is dual, for `pipe`. Messages to children of
 * one name by id, one after the other, put the children back in the parent's state once, and not once per child,
 * with the same step as a result (decision 0155).
 */
export const forEach: {
  <Item, State, Event2 = never>(
    items: Iterable<Item>,
    next: (item: Item) => (state: State) => State | Raised<State, Event2>,
  ): <Event1 = never>(step: State | Raised<State, Event1>) => Step<State, Event1 | Event2>
  <State, Item, Event1 = never, Event2 = never>(
    step: State | Raised<State, Event1>,
    items: Iterable<Item>,
    next: (item: Item) => (state: State) => State | Raised<State, Event2>,
  ): Step<State, Event1 | Event2>
} = dual(3, (step: unknown, items: Iterable<unknown>, next: (item: unknown) => (state: unknown) => unknown) => {
  let folded = unfold(step)
  const append = (made: unknown) => {
    const after = unfold(made)
    folded = { state: after.state, events: [...folded.events, ...after.events] }
  }
  // A handle's step is a function of the state alone, so making the steps of a run before taking the first
  // changes nothing: the run is told at once when a step of another kind comes, and at the end.
  let run: Array<Told> = []
  const flush = () => {
    if (run.length > 0) append(run[0]!.all(folded.state, run))
    run = []
  }
  for (const item of items) {
    const made = next(item)
    const told = toldOf.get(made)
    if (told !== undefined && (run.length === 0 || run[0]!.all === told.all)) {
      run.push(told)
      continue
    }
    flush()
    if (told !== undefined) run.push(told)
    else append(made(folded.state))
  }
  flush()
  return stepOf(folded.state, folded.events)
})

/** What a part's type says of it: a program's types, and the events it raises and the external messages it takes. */
export type PartTypes = Types & Readonly<{ event: unknown; external: unknown }>

declare const PartTypeId: unique symbol

/**
 * A child, as a parent holds it: a state with its messages, operations and work, and no name, indexes or
 * migrations. The entity is the parent's, and so are its address, its row of the read model and the versions of its
 * state (decision 0133). A part with children of its own is a part too, so a tree is as deep as a program needs.
 */
export interface Part<T extends PartTypes> {
  /** Only in the type, so that a parent reads the part's types back: no part has the property. */
  readonly [PartTypeId]?: T
  /** Every key the child's work is held under, as a program's are. The parent holds them under the child's name. */
  readonly keys: Keys<T['key'], T['parameter']>
  /**
   * The schemas the parent's are made of. The parent's state and projection schemas are the parent's own, and hold
   * the child's where the parent puts it.
   */
  readonly schemas: Readonly<{
    state: Schema.Codec<T['state'], Json>
    inbound: Schema.Codec<T['inbound'], Json>
    internal: Schema.Codec<T['internal'], Json>
    operation: Schema.Codec<T['operation'], Json>
    rejection: Schema.Codec<T['rejection'], Json>
  }>
  /**
   * The child's first state. A part's `init` never rejects: its parent calls it, in its own `init` or `update`, and
   * the parent decides there whether the child starts (decision 0182).
   */
  readonly init: (flags: T['flags'], at: DateTime.Utc) => T['state']
  /**
   * The child's next step for one of its messages, its parent's included: a state, a state with events for the
   * parent, or a rejection.
   */
  readonly update: (
    message: T['inbound'] | T['internal'] | T['external'],
    meta: Meta<T['sender']>,
  ) => (state: T['state']) => Step<T['state'], T['event']> | Rejected<T['rejection']>
  /** The work the child's state holds, by key, as a program's `work`. */
  readonly work: (
    state: T['state'],
  ) => Readonly<Record<string, Returned<T['operation'], T['internal']> | undefined>>
  /** The runner of each of the child's operations, by its tag, with its delivery. */
  readonly operations: Runners<T>
  /** The child's projection, which the parent reads in its own `project`. */
  readonly project: (state: T['state']) => T['projection']
}

type AnyPart = Part<any>

/** The types a part says of itself. */
type PartTypesOf<P> = P extends { readonly [PartTypeId]?: infer T } ? Exclude<T, undefined> : never

/** The state of a part. */
type StateOf<P> = PartTypesOf<P> extends Readonly<{ state: infer State }> ? State : never

/** One child, where an optic finds it in the parent's state: where the optic focuses nothing, it is not there. */
export interface One<State, P> {
  readonly kind: 'one'
  /** The part the child runs. */
  readonly part: P
  /** Where the child's state is in the parent's. */
  readonly at: Optic.Optional<State, StateOf<P>>
}

/**
 * Children by id, as the entries an optic finds in the parent's state: every child there is listed once, and one
 * optic says both where a child is and which children are there (decision 0133). An id is compared by what its
 * schema encodes it to, as a key's parameter is.
 */
export interface Each<State, Id, P> {
  readonly kind: 'each'
  /** The part each child runs. */
  readonly part: P
  /** The schema of a child's id, which a message to the child carries. */
  readonly id: Schema.Codec<Id, Json>
  /** The children in the parent's state, each its id and its state. */
  readonly at: Optic.Optional<State, ReadonlyArray<readonly [Id, StateOf<P>]>>
}

/**
 * One child of a parent, e.g. `child(payment, { at: Optic.id<State>().key('payment') })`, or with
 * `.compose(Optic.some())` for a child that may not be there.
 */
export const child = <State, P extends AnyPart>(
  part: P,
  place: Readonly<{ at: Optic.Optional<State, StateOf<P>> }>,
): One<State, P> => ({ kind: 'one', part, at: place.at })

/**
 * Children by id, e.g. the lines of an order kept as a record by id:
 * `each(line, { id: Schema.String, at: Optic.id<State>().key('lines').compose(Optic.entries()) })`.
 */
export const each = <State, Id, P extends AnyPart>(
  part: P,
  place: Readonly<{ id: Schema.Codec<Id, Json>; at: Optic.Optional<State, ReadonlyArray<readonly [Id, StateOf<P>]>> }>,
): Each<State, Id, P> => ({ kind: 'each', part, id: place.id, at: place.at })

type Children<State> = Readonly<Record<string, One<State, AnyPart> | Each<State, any, AnyPart>>>

type Names<C> = keyof C & string
type PartIn<C> = C extends { readonly part: infer P } ? PartTypesOf<P> : never
type IdIn<C> = C extends { readonly kind: 'each'; readonly id: Schema.Codec<infer Id, Json> } ? Id : never
/** Where a child's messages, operations and rejections carry its id: only for children by id. */
type AtIn<C> = C extends { readonly kind: 'each' } ? Readonly<{ id: IdIn<C> }> : unknown

/** A child's messages of one kind, as its parent's: `{ _tag: <child>, message }`, with `id` for children by id. */
type Wrapped<C, Kind extends 'inbound' | 'internal'> = {
  [K in Names<C>]: [PartIn<C[K]>[Kind]] extends [never] ? never
    : Readonly<{ _tag: K; message: PartIn<C[K]>[Kind] }> & AtIn<C[K]>
}[Names<C>]

/** A child's operation under the tag `<child>.<tag>`, so that the parent's runners are found by tag, as any are. */
type LiftedOperation<K extends string, Operation, At> = Operation extends Readonly<{ _tag: infer Tag extends string }>
  ? Readonly<{ _tag: `${K}.${Tag}`; operation: Operation }> & At
  : never

type ChildOperation<C> = { [K in Names<C>]: LiftedOperation<K, PartIn<C[K]>['operation'], AtIn<C[K]>> }[Names<C>]

type ChildRejection<C> = {
  [K in Names<C>]: [PartIn<C[K]>['rejection']] extends [never] ? never
    : Readonly<{ _tag: K; reason: PartIn<C[K]>['rejection'] }> & AtIn<C[K]>
}[Names<C>]

type ChildKey<C> = { [K in Names<C>]: `${K}.${PartIn<C[K]>['key']}` }[Names<C>]

declare const NoParameter: unique symbol

/**
 * The parameter of a child's key, as its parent's: the child's own for one child, and for a child by id its id, or
 * the id and the child's own as a pair.
 */
type ParameterIn<C, Name> = Name extends `${infer K}.${infer Key}` ? K extends Names<C> ? Key extends
      keyof PartIn<C[K]>['parameter'] ? C[K] extends { readonly kind: 'each' }
        ? readonly [IdIn<C[K]>, PartIn<C[K]>['parameter'][Key]]
      : PartIn<C[K]>['parameter'][Key]
    : C[K] extends { readonly kind: 'each' } ? IdIn<C[K]>
    : typeof NoParameter
  : never
  : never

type ChildParameter<C> = {
  readonly [Name in ChildKey<C> as ParameterIn<C, Name> extends typeof NoParameter ? never : Name]: ParameterIn<
    C,
    Name
  >
}

type ChildServices<C> = { [K in Names<C>]: PartIn<C[K]>['services'] }[Names<C>]

/**
 * What a parent can do with a child (`children` in `update` and `onEvent`): give it one of the messages its type
 * says a parent may send, which returns the parent's step. The child answers with its state or an event: one that
 * rejects the message, or is not there, is a defect, since the parent decides when to send.
 */
type Handles<State, Event, C> = {
  readonly [K in Names<C>]: Readonly<{
    update: C[K] extends { readonly kind: 'each' }
      ? (id: IdIn<C[K]>, message: PartIn<C[K]>['external']) => (state: State) => Step<State, Event>
      : (message: PartIn<C[K]>['external']) => (state: State) => Step<State, Event>
  }>
}

/** The children's projections (`children` in `project`): asking for one of a child that is not there is a defect. */
type Projections<State, C> = {
  readonly [K in Names<C>]: C[K] extends { readonly kind: 'each' }
    ? (state: State, id: IdIn<C[K]>) => PartIn<C[K]>['projection']
    : (state: State) => PartIn<C[K]>['projection']
}

type OnEvents<State, Event, C> = {
  readonly [K in Names<C> as [PartIn<C[K]>['event']] extends [never] ? never : K]: C[K] extends
    { readonly kind: 'each' } ? (
      id: IdIn<C[K]>,
      event: PartIn<C[K]>['event'],
      children: Handles<State, Event, C>,
    ) => (state: State) => Step<State, Event>
    : (
      event: PartIn<C[K]>['event'],
      children: Handles<State, Event, C>,
    ) => (state: State) => Step<State, Event>
}

/** `onEvent` is required exactly when a child raises events, so that none goes unhandled. */
type OnEventOf<State, Event, C> = [keyof OnEvents<State, Event, C>] extends [never]
  ? Readonly<{ onEvent?: OnEvents<State, Event, C> }>
  : Readonly<{ onEvent: OnEvents<State, Event, C> }>

type TagOf<M> = M extends { readonly _tag: infer Tag } ? Tag : never

/**
 * What the compiler refuses of a parent: an own message that takes a child's name, which would be routed to the
 * child, and a child that reads a sender its parent does not have.
 */
type Checks<Own, Sender, C> =
  & ([Extract<TagOf<Own>, Names<C>>] extends [never] ? unknown
    : Readonly<{ 'an own message takes the name of a child': Extract<TagOf<Own>, Names<C>> }>)
  & ([{ [K in Names<C>]: [Sender] extends [PartIn<C[K]>['sender']] ? never : K }[Names<C>]] extends [never] ? unknown
    : Readonly<{
      'a child reads a sender its parent does not have': {
        [K in Names<C>]: [Sender] extends [PartIn<C[K]>['sender']] ? never : K
      }[Names<C>]
    }>)

/**
 * `work`, the own work: a child's is held while the child is there, under its keys. It may be left out exactly
 * where no key is declared, since a state then holds no work of its own (decision 0180).
 */
type WorkOf<State, Internal, Operation, Keys> = [keyof Keys] extends [never]
  ? Readonly<{ work?: (state: State) => Work<never, unknown, Operation, Internal> }>
  : Readonly<{ work: (state: State) => Work<Extract<keyof Keys, string>, ParametersOf<Keys>, Operation, Internal> }>

/**
 * `update`, for the own messages, and the external ones for a part: a child's messages are routed to the child. It
 * may be left out exactly where there is no own message, and leaves the state as it is then (decision 0202).
 */
type UpdateOf<State extends object, Message, Sender, Event, Rejection, C> = [Message] extends [never]
  ? Readonly<{ update?: OwnUpdate<State, Message, Sender, Event, Rejection, C> }>
  : Readonly<{ update: OwnUpdate<State, Message, Sender, Event, Rejection, C> }>

type OwnUpdate<State extends object, Message, Sender, Event, Rejection, C> = (
  message: Message,
  meta: Meta<Sender>,
  children: Handles<State, Event, C>,
) => (state: State) => Step<State, Event> | Rejected<Rejection>

/** `operations`, a runner for each kind of operation: left out exactly where there is no kind (decision 0180). */
type OperationsOf<Operation, Operations> = [Operation] extends [never] ? Readonly<{ operations?: Operations }>
  : Readonly<{ operations: Operations }>

/**
 * What a program and a part declare alike: their keys, children, and what they do. Each declares its own `init`,
 * since only a program's may reject (decision 0182).
 */
type Pieces<
  State extends object,
  Inbound,
  Internal,
  Operation extends Readonly<{ _tag: string }>,
  Rejection,
  Sender,
  Projection,
  Event,
  External,
  List extends DeclaredKeys,
  Operations,
  C,
> =
  & Readonly<{
    /**
     * Every key `work` may return a piece under: its name, or `key` with the schema of its parameter. Work under any
     * other key is a type error (decisions 0033, 0197). A list whose names are typed `string`, not literals, does not
     * compile (decision 0199). A name listed twice is a defect where the program is declared. A declaration that
     * leaves the list out declares no key (decision 0180).
     */
    keys?: List & LiteralNames<List>
    /** The children, each placed with `child` or `each`: their messages, work and keys are the library's to route. */
    children?: C
    project: (state: State, children: Projections<State, C>) => Projection
  }>
  & UpdateOf<State, Inbound | Internal | External, Sender, Event, Rejection, C>
  & WorkOf<State, Internal, Operation, KeysOf<List>>
  & OperationsOf<Operation, Operations>
  & OnEventOf<State, Event, C>
  & Checks<Inbound | Internal | External, Sender, C>

/** The types of a composition: the own ones, and each child's, wrapped (decision 0133). */
type Composed<
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
  C,
> = Readonly<{
  state: State
  flags: Flags
  inbound: Inbound | Wrapped<C, 'inbound'>
  internal: Internal | Wrapped<C, 'internal'>
  operation: Operation | ChildOperation<C>
  key: Extract<keyof Keys, string> | ChildKey<C>
  parameter: ParametersOf<Keys> & ChildParameter<C>
  rejection: Rejection | ChildRejection<C>
  sender: Sender
  projection: Projection
  services: ServicesOf<Operations> | ChildServices<C>
}>

/** A child as the composition reads it, its types out of the way. */
type UntypedChild = Readonly<{
  kind: 'one' | 'each'
  part: UntypedPart
  id?: Schema.Codec<unknown, Json>
  at: Optic.Optional<unknown, unknown>
}>

type UntypedRunner = Runner<unknown, unknown, unknown>

type UntypedPart = Readonly<{
  keys: Readonly<Record<string, Schema.Codec<unknown, Json> | null>>
  schemas: Readonly<Record<'state' | 'inbound' | 'internal' | 'operation' | 'rejection', Schema.Codec<unknown, Json>>>
  init: (flags: unknown, at: DateTime.Utc) => unknown
  update: (message: unknown, meta: Meta<unknown>) => (state: unknown) => unknown
  work: (state: unknown) => Readonly<Record<string, unknown>>
  operations: Readonly<Record<string, UntypedRunner>>
  project: (state: unknown) => unknown
}>

type UntypedDeclaration = Readonly<{
  keys: Readonly<Record<string, Schema.Codec<unknown, Json> | null>>
  children?: Readonly<Record<string, UntypedChild>>
  init: (flags: unknown, at: DateTime.Utc) => unknown
  update: (message: unknown, meta: Meta<unknown>, children: unknown) => (state: unknown) => unknown
  work: (state: unknown) => Readonly<Record<string, unknown>>
  operations: Readonly<Record<string, UntypedRunner>>
  project: (state: unknown, children: unknown) => unknown
  onEvent?: Readonly<Record<string, (...args: ReadonlyArray<unknown>) => (state: unknown) => unknown>>
}>

/** Where a child is: its name, and its id for a child by id. */
type Place = Readonly<{ name: string; id: unknown }>

const noChildren: Readonly<Record<string, never>> = Object.freeze({})

const fieldOf = (value: unknown, field: string): unknown =>
  typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>)[field] : undefined

/**
 * A name a composition gives a child's key, or a child's operation, is `<child>.<name>`. A parent whose own key,
 * operation or child is named with a `.` could share a name with a child's, so it is refused where it is declared
 * (decision 0133).
 */
const checkNames = (declaration: UntypedDeclaration, names: ReadonlyArray<string>): void => {
  const refuse = (what: string, name: string): never =>
    defect(`a parent has ${what} '${name}', and a name of a parent's is a word with no '.'`)
  for (const name of names) if (name.length === 0 || name.includes('.')) refuse('a child', name)
  for (const key of Object.keys(declaration.keys)) if (key.includes('.')) refuse('a key', key)
  for (const tag of Object.keys(declaration.operations)) if (tag.includes('.')) refuse('an operation', tag)
}

/**
 * The pieces of a program or a part, made of its own and its children's: the library routes each child's
 * messages, holds its work under its keys, lifts its runners and wraps its rejections, as effect-tea routes a
 * child's messages and lifts its commands (decision 0133). Every piece is pure, as the declaration's are.
 */
const assemble = (
  schemas: UntypedPart['schemas'],
  declaration: UntypedDeclaration,
): UntypedPart => {
  const children = declaration.children ?? noChildren
  const names = Object.keys(children)
  if (names.length === 0) {
    return {
      keys: declaration.keys,
      schemas,
      init: declaration.init,
      update: (message, meta) => declaration.update(message, meta, noChildren),
      work: declaration.work,
      operations: declaration.operations,
      project: (state) => declaration.project(state, noChildren),
    }
  }
  checkNames(declaration, names)
  const childOf = (name: string) => children[name]!
  const isEach = (name: string) => childOf(name).kind === 'each'
  const at = ({ name, id }: Place) => (isEach(name) ? { id } : {})
  const wrap = (place: Place, message: unknown) => ({ _tag: place.name, ...at(place), message })
  // Two ids are one when they encode alike, as two parameters of a key are (decision 0132).
  const textOf = (name: string, id: unknown) =>
    JSON.stringify(ordered(encode(childOf(name).id!, id, `id of a child '${name}'`)))
  type Entries = ReadonlyArray<readonly [unknown, unknown]>
  /** The children by id of one name in a state: their entries, and the position of the first with each id's text. */
  type Listing = Readonly<{ entries: Entries; positions: ReadonlyMap<string, number> }>
  // A listing is made once per state and kept with the state, so that a step that asks for many children, the
  // projection of each line or a message to each, encodes each id once and not once per child asked. A state is a
  // value that nothing changes in place, which the machine relies on when it compares two states by reference, so
  // a listing never goes stale under its state.
  const listings = new WeakMap<object, Map<string, Listing>>()
  const remember = (name: string, state: unknown, listing: Listing): void => {
    if (typeof state !== 'object' || state === null) return
    const byName = listings.get(state) ?? new Map<string, Listing>()
    byName.set(name, listing)
    listings.set(state, byName)
  }
  const listed = (name: string, state: unknown): Listing => {
    const kept = typeof state === 'object' && state !== null ? listings.get(state)?.get(name) : undefined
    if (kept !== undefined) return kept
    const found = childOf(name).at.getResult(state)
    const entries: Entries = Result.isSuccess(found) ? (found.success as Entries) : []
    const positions = new Map<string, number>()
    entries.forEach(([id], position) => {
      const text = textOf(name, id)
      if (!positions.has(text)) positions.set(text, position)
    })
    const listing = { entries, positions }
    remember(name, state, listing)
    return listing
  }
  const entriesOf = (name: string, state: unknown): Entries => listed(name, state).entries
  const getAt = (place: Place, state: unknown): Opt.Option<unknown> => {
    if (!isEach(place.name)) return Result.getSuccess(childOf(place.name).at.getResult(state))
    const { entries, positions } = listed(place.name, state)
    const position = positions.get(textOf(place.name, place.id))
    return position === undefined ? Opt.none() : Opt.some(entries[position]![1])
  }
  /** The children by id listed of `state`, with some values replaced, put back through the optic at once. */
  const putBack = (name: string, state: unknown, listing: Listing, replaced: Entries): unknown => {
    const next = childOf(name).at.replace(replaced, state)
    // The optic reads back what it was given, so the next state's listing is this one with the values replaced,
    // and a message to each child in turn encodes no id twice.
    if (next !== state) remember(name, next, { entries: replaced, positions: listing.positions })
    return next
  }
  const setAt = (place: Place, state: unknown, value: unknown): unknown => {
    if (!isEach(place.name)) return childOf(place.name).at.replace(value, state)
    const listing = listed(place.name, state)
    const position = listing.positions.get(textOf(place.name, place.id))
    if (position === undefined) return state
    const replaced = listing.entries.map((entry, index) => (index === position ? ([entry[0], value] as const) : entry))
    return putBack(place.name, state, listing, replaced)
  }
  const onEvents = declaration.onEvent ?? {}
  const onEventAt = (place: Place, event: unknown, meta: Meta<unknown>) => {
    const handle = onEvents[place.name]
    // Unreachable through the types: `onEvent` has a handler for every child that raises events.
    if (handle === undefined) return defect(`the child '${place.name}' raised an event its parent does not handle`)
    return isEach(place.name) ? handle(place.id, event, handlesOf(meta)) : handle(event, handlesOf(meta))
  }
  // A child's step is the parent's: the child's state put back where it was found, then each event it raised
  // handled in order, each from the state the one before left. An unchanged child leaves the parent's state as it
  // is, so that a step that changes nothing stores nothing new.
  const updateAt = (place: Place, message: unknown, meta: Meta<unknown>) => (state: unknown): unknown => {
    const found = getAt(place, state)
    if (Opt.isNone(found)) return reject
    const result = childOf(place.name).part.update(message, meta)(found.value)
    if (isRejected(result)) {
      return result === reject ? reject : rejectWith({ _tag: place.name, ...at(place), reason: result.reason })
    }
    const { state: next, events } = unfold(result)
    const placed = next === found.value ? state : setAt(place, state, next)
    return events.reduce((step: unknown, event) => andThen(step, onEventAt(place, event, meta)), placed)
  }
  const tell = (place: Place, message: unknown, meta: Meta<unknown>) => (state: unknown): unknown => {
    if (Opt.isNone(getAt(place, state))) {
      return defect(`an external message to the child '${place.name}', which is not in this state`)
    }
    const result = updateAt(place, message, meta)(state)
    if (isRejected(result)) return defect(`the child '${place.name}' rejected an external message, which it takes`)
    return result
  }
  // External messages to children by id of one name, told in order: each child's step is the one `tell` takes, and
  // the children changed are put back once, before the events a child raised are handled and at the end. A handler
  // may change any child, so the children are listed again after it. The step is the one the messages told one
  // after the other give, with a replacement of the record of children per run of messages that raise no event,
  // and not per message (decision 0155).
  const tellAll = (name: string, meta: Meta<unknown>) => (state: unknown, told: ReadonlyArray<Told>): unknown => {
    const { part } = childOf(name)
    let current = state
    const events: Array<unknown> = []
    let listing = listed(name, current)
    let replaced: Array<readonly [unknown, unknown]> | undefined
    const settle = () => {
      if (replaced !== undefined) current = putBack(name, current, listing, replaced)
      replaced = undefined
    }
    for (const { id, message } of told) {
      const position = listing.positions.get(textOf(name, id))
      if (position === undefined) {
        return defect(`an external message to the child '${name}', which is not in this state`)
      }
      const value = (replaced ?? listing.entries)[position]![1]
      const result = part.update(message, meta)(value)
      if (isRejected(result)) return defect(`the child '${name}' rejected an external message, which it takes`)
      const { state: next, events: raised } = unfold(result)
      if (next !== value) {
        replaced ??= [...listing.entries]
        replaced[position] = [listing.entries[position]![0], next]
      }
      if (raised.length > 0) {
        settle()
        const handled = raised.reduce(
          (step: unknown, event) => andThen(step, onEventAt({ name, id }, event, meta)),
          current,
        )
        if (isRejected(handled)) return defect(`the child '${name}' rejected an external message, which it takes`)
        const unfolded = unfold(handled)
        current = unfolded.state
        events.push(...unfolded.events)
        listing = listed(name, current)
      }
    }
    settle()
    return stepOf(current, events)
  }
  const handlesOf = (meta: Meta<unknown>) =>
    Object.fromEntries(names.map((name) => {
      if (!isEach(name)) return [name, { update: (message: unknown) => tell({ name, id: undefined }, message, meta) }]
      const all = tellAll(name, meta)
      return [name, {
        update: (id: unknown, message: unknown) => {
          const told: Told = { id, message, all }
          const step = (state: unknown) => all(state, [told])
          toldOf.set(step, told)
          return step
        },
      }]
    }))
  const update = (message: unknown, meta: Meta<unknown>) => (state: unknown): unknown => {
    const tag = fieldOf(message, '_tag')
    if (typeof tag === 'string' && Object.hasOwn(children, tag)) {
      return updateAt({ name: tag, id: fieldOf(message, 'id') }, fieldOf(message, 'message'), meta)(state)
    }
    return declaration.update(message, meta, handlesOf(meta))(state)
  }
  const presentIn = (name: string, state: unknown): ReadonlyArray<readonly [unknown, unknown]> =>
    isEach(name)
      ? entriesOf(name, state)
      : Opt.match(Result.getSuccess(childOf(name).at.getResult(state)), {
        onNone: () => [],
        onSome: (found) => [[undefined, found]],
      })
  const lift = (place: Place, work: unknown): unknown =>
    isTimer(work)
      ? timer(work.at, wrap(place, work.message))
      : { _tag: `${place.name}.${String(fieldOf(work, '_tag'))}`, ...at(place), operation: work }
  // A child's work is held while the child is there: a child that leaves the state with an operation under way
  // drops its key, which the machine finds a defect (decision 0005).
  const work = (state: unknown): Readonly<Record<string, unknown>> => {
    const all: Record<string, unknown> = { ...declaration.work(state) }
    for (const name of names) {
      const { part } = childOf(name)
      for (const [id, held] of presentIn(name, state)) {
        const place = { name, id }
        for (const [key, piece] of Object.entries(part.work(held))) {
          if (piece === undefined) continue
          const composed = `${name}.${key}`
          const takes = (part.keys[key] ?? null) !== null
          const pieces: ReadonlyArray<readonly [unknown, unknown]> = takes
            ? (piece as ReadonlyArray<readonly [unknown, unknown]>).map(([parameter, one]) => [
              isEach(name) ? [id, parameter] : parameter,
              lift(place, one),
            ])
            : [[id, lift(place, piece)]]
          if (!isEach(name)) all[composed] = takes ? pieces : pieces[0]![1]
          else all[composed] = [...((all[composed] as ReadonlyArray<unknown> | undefined) ?? []), ...pieces]
        }
      }
    }
    return all
  }
  const liftRunner = (name: string, runner: UntypedRunner): UntypedRunner => {
    const wrapOf = (operation: unknown, message: unknown) => wrap({ name, id: fieldOf(operation, 'id') }, message)
    const run = (operation: unknown, key: IdempotencyKey) =>
      Effect.map(
        (runner.run as (operation: unknown, key: IdempotencyKey) => Effect.Effect<unknown, never, unknown>)(
          fieldOf(operation, 'operation'),
          key,
        ),
        (message) => wrapOf(operation, message),
      )
    return runner.delivery === 'AtMostOnce'
      ? {
        delivery: 'AtMostOnce',
        run,
        unknown: (operation) => wrapOf(operation, runner.unknown(fieldOf(operation, 'operation'))),
      } as UntypedRunner
      : ({ delivery: runner.delivery, run } as UntypedRunner)
  }
  const keys: Record<string, Schema.Codec<unknown, Json> | null> = { ...declaration.keys }
  const operations: Record<string, UntypedRunner> = { ...declaration.operations }
  const inbound: Array<Schema.Codec<unknown, Json>> = [schemas.inbound]
  const internal: Array<Schema.Codec<unknown, Json>> = [schemas.internal]
  const operation: Array<Schema.Codec<unknown, Json>> = [schemas.operation]
  const rejection: Array<Schema.Codec<unknown, Json>> = [schemas.rejection]
  for (const name of names) {
    const { part, id } = childOf(name)
    const idField = isEach(name) ? { id: id! } : {}
    const struct = (fields: Readonly<Record<string, Schema.Codec<unknown, Json>>>) =>
      Schema.Struct({ ...fields, ...idField }) as unknown as Schema.Codec<unknown, Json>
    for (const [key, schema] of Object.entries(part.keys)) {
      keys[`${name}.${key}`] = !isEach(name)
        ? schema
        : schema === null
        ? id!
        : (Schema.Tuple([id!, schema]) as unknown as Schema.Codec<unknown, Json>)
    }
    const tags = Object.keys(part.operations)
    for (const tag of tags) operations[`${name}.${tag}`] = liftRunner(name, part.operations[tag]!)
    inbound.push(struct({ _tag: Schema.Literal(name), message: part.schemas.inbound }))
    internal.push(struct({ _tag: Schema.Literal(name), message: part.schemas.internal }))
    if (tags.length > 0) {
      operation.push(struct({
        _tag: Schema.Literals(tags.map((tag) => `${name}.${tag}`)) as unknown as Schema.Codec<unknown, Json>,
        operation: part.schemas.operation,
      }))
    }
    rejection.push(struct({ _tag: Schema.Literal(name), reason: part.schemas.rejection }))
  }
  const union = (members: ReadonlyArray<Schema.Codec<unknown, Json>>) =>
    Schema.Union(members) as unknown as Schema.Codec<unknown, Json>
  const projectAt = (place: Place, state: unknown) =>
    Opt.match(getAt(place, state), {
      onNone: () => defect(`the projection of the child '${place.name}', which is not in this state`),
      onSome: (found) => childOf(place.name).part.project(found),
    })
  const projections = Object.fromEntries(names.map((name) => [
    name,
    isEach(name)
      ? (state: unknown, id: unknown) => projectAt({ name, id }, state)
      : (state: unknown) => projectAt({ name, id: undefined }, state),
  ]))
  return {
    keys,
    schemas: {
      state: schemas.state,
      inbound: union(inbound),
      internal: union(internal),
      operation: union(operation),
      rejection: union(rejection),
    },
    init: declaration.init,
    update,
    work,
    operations,
    project: (state) => declaration.project(state, projections),
  }
}

/**
 * The topics a program declares, each with the type of its selector's value, in the slot `topics` of its types, or
 * `undefined` where it declares none: `Topics` is then inferred as its constraint, whose keys are any string
 * (decisions 0138, 0140).
 */
type TopicValues<Topics> = string extends keyof Topics ? undefined
  : { readonly [Name in keyof Topics]: Topics[Name] extends (projection: never) => (infer V extends Json) ? V : never }

/** The names of the indexes a program declares, or none where it leaves `indexes` out (decision 0180). */
type IndexNames<Indexes> = string extends keyof Indexes ? never : Extract<keyof Indexes, string>

/**
 * The schemas as a program or a part declares them: the schema of the internal messages, the operations, the reasons
 * or the sender may be left out (decision 0180).
 */
type DeclaredSchemas = Readonly<Record<'state' | 'flags' | 'inbound' | 'projection', Schema.Codec<unknown, Json>>>
  & Partial<Readonly<Record<'internal' | 'operation' | 'rejection' | 'sender', Schema.Codec<unknown, Json>>>>

/**
 * The schemas with each one left out in its place: `Schema.Never` for the internal messages, the operations and the
 * reasons, since a program without them has none to store (decision 0180). A part's sender left out stays out, since
 * a part then reads no sender. `??` and not `Struct.assign`: a schema given as `undefined` from JavaScript would
 * replace the default under `assign`.
 */
const filledSchemas = <S extends DeclaredSchemas>(schemas: S) => ({
  ...schemas,
  internal: schemas.internal ?? Schema.Never,
  operation: schemas.operation ?? Schema.Never,
  rejection: schemas.rejection ?? Schema.Never,
})

/** A program's schemas filled in, with `Schema.Null` for a sender left out, as for a program that reads none. */
const filledProgramSchemas = <S extends DeclaredSchemas>(schemas: S) => ({
  ...filledSchemas(schemas),
  sender: schemas.sender ?? Schema.Null,
})

/**
 * A declaration as it may be written: its keys a list, and with no keys, no runners, no work and no `update`, where
 * it has none (decisions 0180, 0197, 0202).
 */
type LeftOut =
  & Omit<UntypedDeclaration, 'keys' | 'operations' | 'work' | 'update'>
  & Partial<Omit<UntypedDeclaration, 'keys'>>
  & Readonly<{ keys?: DeclaredKeys }>

const noRunners: Readonly<Record<string, never>> = Object.freeze({})
const noIndexes: Readonly<Record<string, never>> = Object.freeze({})
const noOwnWork = () => noWork
const noOwnMessages = () => identity

const isKeyWithParameter = (entry: unknown): entry is KeyWithParameter<string, unknown> =>
  typeof entry === 'object' && entry !== null && KeyWithParameterTypeId in entry

/**
 * The record of a declaration's list of keys. A list may hold a name twice, which a record cannot, so a name listed
 * twice is refused where it is declared, with or without a parameter (decision 0197).
 */
const keysOf = (list: DeclaredKeys): UntypedDeclaration['keys'] => {
  const keys = new Map<string, Schema.Codec<unknown, Json> | null>()
  for (const entry of list) {
    const [name, schema] = isKeyWithParameter(entry) ? [entry.name, entry.parameter] : [entry, null]
    if (keys.has(name)) defect(`a declaration lists the key '${name}' twice`)
    keys.set(name, schema)
  }
  // An assignment to `__proto__` sets the prototype, where `Object.fromEntries` defines a key of that name.
  return Object.freeze(Object.fromEntries(keys))
}

/**
 * The declaration with its keys a record, each record left out empty, `work` left out holding no work, and `update`
 * left out leaving the state as it is.
 */
const filledDeclaration = (declaration: LeftOut): UntypedDeclaration => ({
  ...declaration,
  keys: keysOf(declaration.keys ?? []),
  operations: declaration.operations ?? noRunners,
  work: declaration.work ?? noOwnWork,
  update: declaration.update ?? noOwnMessages,
})

/**
 * The one place a program is declared: its schemas, which give every type the program is written in, and then
 * what it does (decision 0035). An object literal typed `Program<T>` names each type twice, and holds neither
 * the keys `work` may use nor the messages an operation answers. Here each piece says its own type. The
 * schemas say what the state, the flags, the messages, the operations, the rejections, the senders and the
 * projection are. `keys` says the space of keys the work is held under (decision 0033). Each runner says which
 * messages its kind of operation answers, and which services it needs (decision 0034). `indexes` says what a
 * query filters and orders by. `children` says the parts the state holds, whose messages, work and keys the
 * library derives (decision 0133).
 */
export const program = <
  State extends object,
  Flags,
  Inbound,
  // The projection is JSON: what `read`, a query, an index and a topic read is one shape, and a schema that
  // decodes to what JSON does not hold, a `DateTime`, is refused here (decision 0139).
  Projection extends Json,
  // A schema left out gives its type nothing to infer from, so the type is its default, the type of the schema
  // `filledSchemas` puts in its place (decision 0180).
  Internal = never,
  Operation extends Readonly<{ _tag: string }> = never,
  Rejection = never,
  Sender = null,
>(
  schemas: Readonly<{
    state: Schema.Codec<State, Json>
    flags: Schema.Codec<Flags, Json>
    inbound: Schema.Codec<Inbound, Json>
    internal?: Schema.Codec<Internal, Json>
    operation?: Schema.Codec<Operation, Json>
    rejection?: Schema.Codec<Rejection, Json>
    sender?: Schema.Codec<Sender, Json>
    projection: Schema.Codec<Projection, Json>
  }>,
) =>
<
  // No default for either: a type parameter is fixed to its default before a context-sensitive selector is typed,
  // and the selectors' parameters would be the default's. With none, a record left out is inferred as its
  // constraint, whose keys are any string, and `IndexNames` and `TopicValues` read that as none (decision 0180).
  Indexes extends Readonly<Record<string, (projection: Projection) => Scalar>>,
  Topics extends Readonly<Record<string, (projection: Projection) => Json>>,
  // The name is a type too, so that a reference made without the program's code is checked against it (decision 0183).
  const Name extends string,
  const List extends DeclaredKeys = [],
  Operations extends Declared<Operation, Internal> = Declared<Operation, Internal>,
  const C extends Children<State> = {},
>(
  declaration:
    & Pieces<State, Inbound, Internal, Operation, Rejection, Sender, Projection, never, never, List, Operations, C>
    & Readonly<{
      name: Name
      /**
       * The first state, from the flags and the time of the creation. It may reject the flags, as `update` rejects
       * a message, with its own reasons: the entity is not created, and nothing is stored (decision 0182).
       */
      init: (flags: Flags, at: DateTime.Utc) => State | Rejected<Rejection>
      /** What a query filters and orders by: a program that leaves it out has no index (decision 0180). */
      indexes?: Indexes
      /** How the versions before this one are read, in order: none for a first version (decision 0036). */
      migrations?: ReadonlyArray<Migration>
      /**
       * The topics of the log, by name, each a pure function that selects, of the projection, the topic's value:
       * a step is written in a topic when that changed, and the row gives it. None publishes the projection as the
       * one topic `projection` (decisions 0138, 0140).
       */
      topics?: Topics
    }>,
): Program<
  & Composed<State, Flags, Inbound, Internal, Operation, Rejection, Sender, Projection, KeysOf<List>, Operations, C>
  & Readonly<{ index: IndexNames<Indexes>; topics: TopicValues<Topics> }>,
  Name
> => {
  type Of =
    & Composed<State, Flags, Inbound, Internal, Operation, Rejection, Sender, Projection, KeysOf<List>, Operations, C>
    & Readonly<{ index: IndexNames<Indexes>; topics: TopicValues<Topics> }>
  const filled = filledProgramSchemas(schemas as unknown as DeclaredSchemas)
  const pieces = assemble(filled, filledDeclaration(declaration as unknown as LeftOut))
  return {
    name: declaration.name,
    indexes: (declaration.indexes ?? noIndexes) as Indexes,
    ...(declaration.migrations === undefined ? {} : { migrations: declaration.migrations }),
    // The pieces are made of the declaration's, with the types the composition derives, which `Of` writes out.
    keys: pieces.keys as unknown as Program<Of>['keys'],
    schemas: { ...filled, ...pieces.schemas } as unknown as Program<Of>['schemas'],
    init: pieces.init as Program<Of>['init'],
    update: (message, meta) => (state) => {
      const step = pieces.update(message, meta)(state)
      // Unreachable through the types: an entity's program raises no event, since it has no parent.
      if (isRaised(step)) return defect('a program raised an event, and an entity has no parent to handle it')
      return step as Of['state'] | Rejected<Of['rejection']>
    },
    work: pieces.work as Program<Of>['work'],
    operations: pieces.operations as unknown as Runners<Of>,
    project: pieces.project as Program<Of>['project'],
    ...(declaration.topics === undefined
      ? {}
      : { topics: declaration.topics as unknown as NonNullable<Program<Of>['topics']> }),
  }
}

/**
 * A part, declared as a program is, without a name, indexes or migrations, which are its parent's (decision 0133).
 * Its schemas say what the program's say, and the sender it reads when it reads one. It may raise events for its
 * parent, and take external messages from it, whose schemas give their types: neither is stored, since a parent
 * handles them in the step.
 */
export const part = <
  State extends object,
  Flags,
  Inbound,
  // A part's projection is JSON, as a program's is, since the parent's projection holds it (decision 0139).
  Projection extends Json,
  // A schema left out is its default, as a program's is (decision 0180). A part reads no sender unless it says so.
  Internal = never,
  Operation extends Readonly<{ _tag: string }> = never,
  Rejection = never,
  Sender = unknown,
  Event = never,
  External = never,
>(
  schemas: Readonly<{
    state: Schema.Codec<State, Json>
    flags: Schema.Codec<Flags, Json>
    inbound: Schema.Codec<Inbound, Json>
    internal?: Schema.Codec<Internal, Json>
    operation?: Schema.Codec<Operation, Json>
    rejection?: Schema.Codec<Rejection, Json>
    projection: Schema.Codec<Projection, Json>
    sender?: Schema.Codec<Sender, Json>
    event?: Schema.Codec<Event, Json>
    external?: Schema.Codec<External, Json>
  }>,
) =>
<
  const List extends DeclaredKeys = [],
  Operations extends Declared<Operation, Internal> = Declared<Operation, Internal>,
  const C extends Children<State> = {},
>(
  declaration:
    & Pieces<State, Inbound, Internal, Operation, Rejection, Sender, Projection, Event, External, List, Operations, C>
    & Readonly<{
      /** The child's first state: its parent decides whether the child starts, and a part's `init` never rejects. */
      init: (flags: Flags, at: DateTime.Utc) => State
    }>,
): Part<
  & Composed<State, Flags, Inbound, Internal, Operation, Rejection, Sender, Projection, KeysOf<List>, Operations, C>
  & Readonly<{ index: never; event: Event; external: External }>
> =>
  assemble(
    filledSchemas(schemas as unknown as DeclaredSchemas),
    filledDeclaration(declaration as unknown as LeftOut),
  ) as unknown as Part<
    & Composed<State, Flags, Inbound, Internal, Operation, Rejection, Sender, Projection, KeysOf<List>, Operations, C>
    & Readonly<{ index: never; event: Event; external: External }>
  >


/**
 * What creating an entity is answered. Only `Created` is stored, under its sender and the request id.
 * `Rejected` is the program's `init`'s, and is not stored: the entity does not exist, and a retry runs `init` again,
 * as a message's `NotFound` is not stored (decision 0182).
 */
export type Creation<Reason = never> =
  | Readonly<{ _tag: 'Created' }>
  | Readonly<{ _tag: 'AlreadyExists' }>
  /** `reason` is null for a bare `reject`. */
  | Readonly<{ _tag: 'Rejected'; reason: Reason | null }>

/**
 * The service through which an operation sends messages to other entities, as its own entity. The runtime
 * provides it to each run of an operation, filling in the request from that run: its entity, key and incarnation,
 * with the name the operation gives (decisions 0047, 0060).
 */
export class Entities extends Context.Service<Entities, {
  /** Sends an inbound message to another entity, as `send` does. */
  readonly send: <T extends Types>(
    program: Receiver<T>,
    id: string,
    message: T['inbound'],
    name: string,
  ) => Effect.Effect<Reply<T['rejection']>>
  /** Creates another entity, as `create` does. */
  readonly create: <T extends Types>(
    program: Receiver<T>,
    id: string,
    flags: T['flags'],
    name: string,
  ) => Effect.Effect<Creation<T['rejection']>>
}>()('@fgaudo/effect-tea-persistent/Entities') {}

/**
 * Sends an inbound message to another entity from an operation, and waits for the reply. The request is the run of
 * the operation and `name`, which names it among those the operation makes (decisions 0047, 0060). So a restarted
 * operation sends the same requests, and gets the stored replies. One that sends twice under the same name to the
 * same entity dies. While the receiver is suspended, it waits, and it sends again when the receiver crashes
 * (decision 0046). It sends again too when the receiver holds as many callers' messages as its bound, and is never
 * given `Full` (decision 0147).
 */
export const send = <T extends Types>(
  program: Receiver<T>,
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
  program: Receiver<T>,
  id: string,
  flags: T['flags'],
  name: string,
): Effect.Effect<Creation<T['rejection']>, never, Entities> =>
  Effect.flatMap(Effect.service(Entities), (entities) => entities.create(program, id, flags, name))
