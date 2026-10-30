/**
 * The API the design imagines, as declarations only: nothing here runs. The examples are written against it,
 * so that the typecheck tells whether the design can be expressed.
 */
import type * as Brand from 'effect/Brand'
import type * as DateTime from 'effect/DateTime'
import type * as Effect from 'effect/Effect'
import type * as Schema from 'effect/Schema'

/** What `update` returns for an inbound message that does not apply in the state. */
export declare const reject: unique symbol
export type Rejected = typeof reject

/** Thrown by `update` on a message that cannot arrive. It suspends the entity. */
export declare const defect: (reason: string) => never

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

/** What an inbound message is answered. */
export type Reply = 'Accepted' | 'Rejected'

export type Update<State, Message, Sender> = (
  message: Message,
  meta: Meta<Sender>,
) => (state: State) => State | Rejected

/** The entity's id, the work's key and its incarnation: the same when a crash restarts the work. */
export type IdempotencyKey = string & Brand.Brand<'IdempotencyKey'>

export interface Operation<Message, R> {
  readonly _tag: 'Operation'
  readonly run: (key: IdempotencyKey) => Effect.Effect<Message, never, R>
}

export interface Timer<Message> {
  readonly _tag: 'Timer'
  readonly at: DateTime.Utc
  readonly message: Message
}

export type Durable<Message, R> = Operation<Message, R> | Timer<Message>

export declare const operation: <Message, R>(
  run: (key: IdempotencyKey) => Effect.Effect<Message, never, R>,
) => Operation<Message, R>

export declare const timer: <Message>(at: DateTime.Utc, message: Message) => Timer<Message>

export declare const noWork: Readonly<Record<string, never>>

/** The service through which an operation sends messages to other entities, as its own entity. */
export interface Entities {
  readonly _tag: 'Entities'
}

/**
 * Sends an inbound message to another entity from an operation, and waits for the reply. The request id is the
 * operation's idempotency key: a restarted operation sends the same request, and gets the stored reply.
 */
export declare const send: <T extends Types>(
  program: Program<T>,
  id: string,
  message: T['inbound'],
  requestId: IdempotencyKey,
) => Effect.Effect<Reply, never, Entities>

export type Types = Readonly<{
  state: unknown
  flags: unknown
  inbound: unknown
  internal: unknown
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
  }>
  readonly init: (flags: T['flags'], at: DateTime.Utc) => T['state']
  readonly update: Update<T['state'], T['inbound'] | T['internal'], T['sender']>
  readonly durable: (state: T['state']) => Readonly<Record<string, Durable<T['internal'], T['services']>>>
  readonly project: (state: T['state']) => T['projection']
}

// Testing

/** Work under way under a key, in one incarnation. */
export interface Pending {
  readonly key: string
  readonly idempotencyKey: IdempotencyKey
}

export interface Rehearsal<T extends Types> {
  readonly state: Effect.Effect<T['state']>
  readonly projection: Effect.Effect<T['projection']>
  /** Delivers an inbound message, with a new request id. */
  readonly send: (message: T['inbound'], sender: T['sender']) => Effect.Effect<Reply>
  /** Delivers an inbound message from another entity's operation, with a new request id. */
  readonly sendFrom: (message: T['inbound'], entity: Address) => Effect.Effect<Reply>
  /** The work under way under `key`. Fails the test when there is none. */
  readonly pending: (key: string) => Effect.Effect<Pending>
  /** Completes an operation with `message`. It is dropped when the operation's incarnation has moved on. */
  readonly answer: (pending: Pending, message: T['internal']) => Effect.Effect<'Delivered' | 'Dropped'>
  /** The time of a timer comes. */
  readonly fire: (pending: Pending) => Effect.Effect<'Delivered' | 'Dropped'>
  /** The process dies after the last commit, and the entity is activated again from what was stored. */
  readonly restart: Effect.Effect<void>
}

/**
 * Runs a scenario without storage, cluster or clock. Nothing happens by itself: the test answers operations,
 * fires timers and restarts the process. It fails when a defect suspends the entity.
 */
export declare const rehearse: <T extends Types, E>(
  program: Program<T>,
  start: Readonly<{ flags: T['flags']; at: DateTime.Utc }>,
  scenario: (rehearsal: Rehearsal<T>) => Effect.Effect<void, E>,
) => Effect.Effect<void, E>
