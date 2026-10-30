import type * as Brand from 'effect/Brand'
import * as Context from 'effect/Context'
import * as Data from 'effect/Data'
import type * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import type * as Schema from 'effect/Schema'

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
 * What an inbound message is answered. `Accepted` and `Rejected` are stored, and a retry gets them again.
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

/** The entity's id, the work's key and its incarnation: the same when a crash restarts the work. */
export type IdempotencyKey = string & Brand.Brand<'IdempotencyKey'>

export const idempotencyKey = (id: string, key: string, incarnation: number): IdempotencyKey =>
  JSON.stringify([id, key, incarnation]) as IdempotencyKey

/** What a crash during an operation does to it, declared where it is built. */
export type Operation<Message, R> =
  /** Runs again with the same idempotency key, which it passes on: the world recognises it. */
  | Readonly<{
    _tag: 'Operation'
    delivery: 'Idempotent'
    run: (key: IdempotencyKey) => Effect.Effect<Message, never, R>
  }>
  /** Runs again, and may act twice. */
  | Readonly<{ _tag: 'Operation'; delivery: 'AtLeastOnce'; run: Effect.Effect<Message, never, R> }>
  /** Never runs again: an activation that finds it with no completion delivers `unknown`, since it may have acted. */
  | Readonly<{ _tag: 'Operation'; delivery: 'AtMostOnce'; run: Effect.Effect<Message, never, R>; unknown: Message }>

export interface Timer<Message> {
  readonly _tag: 'Timer'
  readonly at: DateTime.Utc
  readonly message: Message
}

export type Durable<Message, R> = Operation<Message, R> | Timer<Message>

export const operation: {
  /** An idempotent operation, which passes its idempotency key on. */
  <Message, R>(run: (key: IdempotencyKey) => Effect.Effect<Message, never, R>): Operation<Message, R>
  readonly atLeastOnce: <Message, R>(run: Effect.Effect<Message, never, R>) => Operation<Message, R>
  readonly atMostOnce: <Message, R>(run: Effect.Effect<Message, never, R>, unknown: Message) => Operation<Message, R>
} = Object.assign(
  <Message, R>(run: (key: IdempotencyKey) => Effect.Effect<Message, never, R>): Operation<Message, R> => ({
    _tag: 'Operation',
    delivery: 'Idempotent',
    run,
  }),
  {
    atLeastOnce: <Message, R>(run: Effect.Effect<Message, never, R>): Operation<Message, R> => ({
      _tag: 'Operation',
      delivery: 'AtLeastOnce',
      run,
    }),
    atMostOnce: <Message, R>(run: Effect.Effect<Message, never, R>, unknown: Message): Operation<Message, R> => ({
      _tag: 'Operation',
      delivery: 'AtMostOnce',
      run,
      unknown,
    }),
  },
)

export const timer = <Message>(at: DateTime.Utc, message: Message): Timer<Message> => ({ _tag: 'Timer', at, message })

export const noWork: Readonly<Record<string, never>> = Object.freeze({})

export type Types = Readonly<{
  state: unknown
  flags: unknown
  inbound: unknown
  internal: unknown
  rejection: unknown
  sender: unknown
  projection: unknown
  services: unknown
}>

export interface Program<T extends Types> {
  /** What other entities read in `Address.name`, and the runtime stores the entity under. */
  readonly name: string
  readonly schemas: Readonly<{
    state: Schema.Codec<T['state'], unknown>
    flags: Schema.Codec<T['flags'], unknown>
    inbound: Schema.Codec<T['inbound'], unknown>
    internal: Schema.Codec<T['internal'], unknown>
    rejection: Schema.Codec<T['rejection'], unknown>
  }>
  readonly init: (flags: T['flags'], at: DateTime.Utc) => T['state']
  readonly update: Update<T['state'], T['inbound'] | T['internal'], T['sender'], T['rejection']>
  readonly durable: (state: T['state']) => Readonly<Record<string, Durable<T['internal'], T['services']>>>
  readonly project: (state: T['state']) => T['projection']
}

/** What creating an entity is answered. Only `Created` is stored, under the request id. */
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
    requestId: IdempotencyKey,
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
 * operation's idempotency key: a restarted operation sends the same request, and gets the stored reply. While the
 * receiver is suspended, it waits.
 */
export const send = <T extends Types>(
  program: Program<T>,
  id: string,
  message: T['inbound'],
  requestId: IdempotencyKey,
): Effect.Effect<Reply<T['rejection']>, never, Entities> =>
  Effect.flatMap(Effect.service(Entities), (entities) => entities.send(program, id, message, requestId))

/**
 * Creates an entity from an operation, with the operation's idempotency key as the request id. It counts as the
 * operation's one message to that entity.
 */
export const create = <T extends Types>(
  program: Program<T>,
  id: string,
  flags: T['flags'],
  requestId: IdempotencyKey,
): Effect.Effect<Creation, never, Entities> =>
  Effect.flatMap(Effect.service(Entities), (entities) => entities.create(program, id, flags, requestId))
