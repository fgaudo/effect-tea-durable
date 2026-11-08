/**
 * The runtime's semantics as a pure state machine: the executable form of the design's crash table, the engine
 * of `rehearse`, and the oracle of the real runtime's tests. Nothing here runs an effect: an event gives the next
 * machine, what it writes, encoded, and the outputs a runtime acts on (an operation to start, a timer to arm, a
 * reply to send).
 */
import * as DateTime from 'effect/DateTime'
import { Base64Url } from 'effect/encoding'
import * as Records from 'effect/Record'
import * as Schema from 'effect/Schema'
import { createHash } from 'node:crypto'
import {
  type Creation,
  type Durable,
  encode,
  type IdempotencyKey,
  idempotencyKey,
  indexesOf,
  topicsOf,
  InvariantDefect,
  isRejected,
  isText,
  isTimer,
  type Json,
  type Key,
  KeyCodec,
  ordered,
  type Origin,
  originOf,
  type Program,
  reasonOf,
  type Reply,
  type Request,
  type Runner,
  runnerOf,
  type Scalar,
  type Timer,
  type Types,
} from './program.ts'

/**
 * What the program threw, or a rule of the design it broke: the one exception that suspends the entity. Anything
 * else thrown while an event is applied is the runtime's, and leaves the step: a bug of the machine, or a machine
 * the runtime gave it corrupted. A runtime crashes the entity on it (decisions 0042, 0061).
 */
class Defect extends Error {
  // Legible where it leaves the machine: `shownOf`, which `reindex` calls, throws it too.
  constructor(override readonly cause: unknown) {
    super(`a defect of the program: ${render(cause)}`)
  }
}

/** Calls the program, each of its functions and schemas on its own: what it throws is its defect (decision 0061). */
const byProgram = <A>(call: () => A): A => {
  try {
    return call()
  } catch (cause) {
    throw new Defect(cause)
  }
}

/** A rule of the design the program broke: its defect, as what it throws is. */
const broken = (reason: string): never => {
  throw new Defect(new InvariantDefect({ reason }))
}

/** The cause of the program's defect `thrown`. Anything else is thrown again, as the runtime's (decision 0061). */
const defectOf = (thrown: unknown): unknown => {
  if (thrown instanceof Defect) return thrown.cause
  throw thrown
}

/** A value encoded by one of the program's schemas: one it refuses, or that JSON does not hold, is its defect. */
const encodeBy = <A>(codec: Schema.Codec<A, Json>, value: A, what: string): Json =>
  byProgram(() => encode(codec, value, what))

/** The schema of each key's parameter, or null for a key without one, by its name. */
const declaredKeys = <T extends Types>(program: Program<T>) =>
  program.keys as unknown as Readonly<Record<string, Schema.Codec<unknown, Json> | null>>

/**
 * The key `name` with `parameter`: the name alone for a key without one, and otherwise the name and the parameter
 * as its schema encodes it, with the fields of each object in order (decisions 0132, 0136). A parameter its schema
 * refuses is a defect.
 */
const keyBy = (name: string, schema: Schema.Codec<unknown, Json> | null, parameter: unknown): Key =>
  schema === null
    ? { name }
    : { name, parameter: ordered(encodeBy(schema, parameter, `parameter of the key '${name}'`)) }

/**
 * The text the machine indexes its records of a key by, in `Stored.keys` and `Machine.running`: the JSON of the
 * name, with the parameter's after it for a key that has one. Nothing reads it back for the name or the parameter,
 * which every value that leaves the machine carries as data (decision 0136).
 */
export const keyText = (key: Key): string =>
  JSON.stringify(key.parameter === undefined ? [key.name] : [key.name, key.parameter])

/** A key as the reason of a defect names it: its name, or the JSON of its name and its parameter. */
export const shownKey = (key: Key): string =>
  key.parameter === undefined ? key.name : JSON.stringify([key.name, key.parameter])

/**
 * The key `name`, with its parameter for a key that takes one: what the work under it is held under, in the
 * outputs, the mailbox and the idempotency key (decisions 0132, 0136). A key the program does not declare, or a
 * parameter its schema refuses, throws.
 */
export const keyOf = <T extends Types>(program: Program<T>, name: T['key'], parameter?: unknown): Key => {
  const keys = declaredKeys(program)
  if (!Object.hasOwn(keys, name)) throw new Error(`the program '${program.name}' declares no key '${name}'`)
  return keyBy(name, keys[name] ?? null, parameter)
}

/** Whether `work` is a piece of work the program can run: a timer, or an operation it gives a runner for. */
const checkWork = <T extends Types>(program: Program<T>, key: string, work: unknown): void => {
  if (isTimer(work)) return
  const tag: unknown = typeof work === 'object' && work !== null ? (work as { _tag?: unknown })._tag : undefined
  if (typeof tag !== 'string') broken(`the state holds what is no work under '${key}'`)
  if (runnerOf(program, work as T['operation']) === undefined) {
    broken(`the state holds the operation '${tag}' under '${key}', which the program has no runner for`)
  }
}

/**
 * The work the state holds, by the `keyText` of each key, under the keys the program declares and no others:
 * a key it does not declare is a defect, where the state holding it is read (decision 0037). The types catch a key a
 * program never declared where the state holds that key alone, and not where it holds a declared key beside a
 * misspelt one. So is an operation the program gives no runner for, which a cast lets through (decision 0054), and
 * anything a cast lets through that is no work at all. Under a key with a parameter, a parameter its schema refuses
 * is a defect, and so are two pieces of work whose parameters encode alike (decision 0132).
 */
const workUnder = <T extends Types>(program: Program<T>, state: T['state']): Held<T> => {
  const work: unknown = byProgram(() => program.durable(state))
  if (typeof work !== 'object' || work === null) return broken('durable gave no record of work')
  const keys = declaredKeys(program)
  const held: Record<string, Piece<T>> = {}
  for (const [name, returned] of Object.entries(work)) {
    if (!Object.hasOwn(keys, name)) {
      broken(`the state holds work under '${name}', which the program does not declare`)
    }
    if (returned === undefined) continue
    const schema = keys[name] ?? null
    if (schema === null) {
      checkWork(program, name, returned)
      const key = { name }
      held[keyText(key)] = { key, work: returned as Durable<T['operation'], T['internal']> }
      continue
    }
    if (!Array.isArray(returned)) broken(`the state holds no list of work under '${name}', which takes a parameter`)
    for (const entry of returned as ReadonlyArray<unknown>) {
      if (!Array.isArray(entry) || entry.length !== 2) {
        broken(`the state holds what is no pair of a parameter and its work under '${name}'`)
      }
      const [parameter, piece] = entry as unknown as readonly [unknown, unknown]
      const key = keyBy(name, schema, parameter)
      const text = keyText(key)
      if (Object.hasOwn(held, text)) broken(`the state holds two pieces of work under '${shownKey(key)}'`)
      checkWork(program, shownKey(key), piece)
      held[text] = { key, work: piece as Durable<T['operation'], T['internal']> }
    }
  }
  return held
}

/**
 * A value's JSON as `codec` writes it, kept by the value, so that what the checks of a step encoded is what is
 * written: a value is never mutated (decisions 0052, 0057). A value that is no object is encoded each time.
 */
const encodings = new WeakMap<object, WeakMap<object, Json>>()

const encodeOnce = <A>(codec: Schema.Codec<A, Json>, value: A, what: string): Json => {
  if (typeof value !== 'object' || value === null) return encodeBy(codec, value, what)
  let held = encodings.get(codec)
  if (held === undefined) {
    held = new WeakMap()
    encodings.set(codec, held)
  }
  const cached = held.get(value)
  if (cached !== undefined) return cached
  const json = encodeBy(codec, value, what)
  held.set(value, json)
  return json
}

/** JSON as text with the fields of each object in order: two values that encode alike give the same text. */
const canonical = (json: Json): string =>
  JSON.stringify(json, (_, value: unknown) =>
    typeof value === 'object' && value !== null && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : value)

/** A value's JSON and the canonical text it is compared by. */
type Encoded = Readonly<{ json: Json; text: string }>

const works = new WeakMap<object, WeakMap<object, Encoded>>()

/**
 * The work under a key as it is stored, by the program's schemas: an operation, or a timer's time in milliseconds
 * and its message. Kept by the work, for each program, which is never mutated (decision 0052).
 */
const encodeWork = <T extends Types>(
  program: Program<T>,
  under: Key,
  work: Durable<T['operation'], T['internal']>,
): Encoded => {
  let held = works.get(program)
  if (held === undefined) {
    held = new WeakMap()
    works.set(program, held)
  }
  const cached = held.get(work)
  if (cached !== undefined) return cached
  const { schemas } = program
  const key = shownKey(under)
  const json: Json = isTimer(work)
    ? {
      _tag: 'Timer',
      at: byProgram(() => DateTime.toEpochMillis(work.at)),
      message: encodeOnce(schemas.internal, work.message as T['internal'], `message of the timer under '${key}'`),
    }
    : { _tag: 'Operation', operation: encodeOnce(schemas.operation, work, `operation under '${key}'`) }
  const encoded = { json, text: canonical(json) }
  held.set(work, encoded)
  return encoded
}

/** What callers read of a state, encoded, with the value of each index on it: the row a query reads (decision 0032). */
export type Shown = Readonly<{ projection: Json; indexes: Readonly<Record<string, Scalar>> }>

/**
 * What callers read of a state, with its canonical text, and the canonical text of what each topic of the log
 * selects of it, which a step compares with the step before to decide what it publishes (decision 0138).
 */
export type ShownRow = Shown & Readonly<{
  text: string
  topics: ReadonlyArray<Readonly<{ topic: string; text: string }>>
}>

const shown = new WeakMap<object, WeakMap<object, ShownRow>>()

/**
 * What callers read of `state`, computed once for each program: the step that publishes compares it with the one
 * the step before computed, topic by topic (decisions 0038, 0057, 0138). A projection that does not encode, a topic
 * that selects what JSON does not hold, an index that is a number JSON does not hold, or an index that is a string a
 * database does not hold, is a defect (decisions 0040, 0157).
 */
export const shownOf = <T extends Types>(
  program: Program<T>,
  state: T['state'],
): ShownRow => {
  let held = shown.get(program)
  if (held === undefined) {
    held = new WeakMap()
    shown.set(program, held)
  }
  const cached = held.get(state)
  if (cached !== undefined) return cached
  const projection = byProgram(() => program.project(state))
  const indexes = byProgram(() => indexesOf(program, projection))
  for (const [name, value] of Object.entries(indexes)) {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      broken(`the index '${name}' is a number JSON does not hold`)
    }
    // The database parses the indexes, as JSON (decision 0157).
    if (typeof value === 'string' && !isText(value)) {
      broken(`the index '${name}' is a string a database does not hold`)
    }
  }
  const json = encodeBy(program.schemas.projection, projection, 'projection')
  const text = canonical(json)
  const topics = topicsOf(program).map(({ topic, select }) => ({
    topic,
    text: select === null
      ? text
      : canonical(encodeBy(Schema.Json, byProgram(() => select(projection)), `topic '${topic}'`)),
  }))
  const row = { projection: json, indexes, text, topics }
  held.set(state, row)
  return row
}

/**
 * The work of a state the machine may store, with everything a runtime writes of it checked. The checks are
 * `durable`, what callers read with the indexes a query reads it by, and the encoding of the state, its work and
 * its projection to what JSON holds. Any of them may die, and one that does suspends the entity. What is encoded
 * here is kept, and is what the step writes (decisions 0014, 0032, 0040, 0057).
 */
const admitted = <T extends Types>(program: Program<T>, state: T['state']): Held<T> => {
  const work = workUnder(program, state)
  shownOf(program, state)
  encodeOnce(program.schemas.state, state, 'state')
  for (const { key, work: held } of Object.values(work)) encodeWork(program, key, held)
  return work
}

/**
 * A message waiting in the mailbox: from a caller, or from the entity's own work in one incarnation. A caller's
 * message may carry `keep`, how many milliseconds its reply is kept once it is answered. Without it the reply is
 * kept for ever (decision 0125).
 */
export type Envelope<T extends Types> =
  | Readonly<{ _tag: 'Inbound'; request: Request<T['sender']>; message: T['inbound']; keep?: number }>
  | Readonly<{ _tag: 'Internal'; key: Key; incarnation: number; message: T['internal'] }>

/**
 * Why the entity is suspended: a defect while handling the mailbox's first message, in an operation, or in
 * activating the stored state with a new program (decision 0020).
 */
export type Suspension = Readonly<{
  cause: unknown
  on:
    | Readonly<{ _tag: 'Message' }>
    | Readonly<{ _tag: 'Operation'; key: Key; incarnation: number }>
    | Readonly<{ _tag: 'Activation' }>
}>

/** The replies stored under request ids: never `NotFound`, which the runtime answers for no entity. */
export type StoredReply<Reason> = Exclude<Reply<Reason>, Readonly<{ _tag: 'NotFound' }>>

const Address = Schema.Struct({ name: Schema.String, id: Schema.String })

const requests = new WeakMap<object, Schema.Codec<Request<unknown>, Json>>()

/**
 * How a request is stored: a tagged value, whose caller's sender is written by the program's schema, and nothing
 * else of it is the program's (decision 0059). Kept for each schema of the sender, which is never mutated.
 */
export const requestCodec = <T extends Types>(program: Program<T>): Schema.Codec<Request<T['sender']>, Json> => {
  const sender = program.schemas.sender
  let codec = requests.get(sender)
  if (codec === undefined) {
    codec = Schema.Union([
      Schema.TaggedStruct('Caller', { sender, id: Schema.String }),
      Schema.TaggedStruct('Operation', {
        entity: Address,
        key: KeyCodec,
        incarnation: Schema.Int,
        name: Schema.String,
      }),
      Schema.TaggedStruct('Self', { id: Schema.String }),
    ]) as unknown as Schema.Codec<Request<unknown>, Json>
    requests.set(sender, codec)
  }
  return codec as Schema.Codec<Request<T['sender']>, Json>
}

const keyed = new WeakMap<object, WeakMap<object, string>>()

/**
 * What a request is deduplicated by: its JSON as text, with the fields of each object in order. Two requests are
 * the same when they encode alike, whoever built them; the text is an index of the machine's, and nothing parses
 * it back (decision 0059). A request that does not encode — a caller's sender its schema refuses — is a defect.
 */
export const requestKey = <T extends Types>(program: Program<T>, request: Request<T['sender']>): string => {
  const codec = requestCodec(program)
  let held = keyed.get(codec)
  if (held === undefined) {
    held = new WeakMap()
    keyed.set(codec, held)
  }
  const cached = held.get(request)
  if (cached !== undefined) return cached
  const text = canonical(encodeOnce(codec, request, 'request'))
  held.set(request, text)
  return text
}

/**
 * The run of the work under a key the state holds work under. A key whose work is gone has no row, since its
 * incarnation is drawn from the entity's counter, which never goes back (decision 0132).
 */
export type Run<T extends Types> = Readonly<{
  key: Key
  incarnation: number
  /**
   * The work the state holds under the key, as the program that stored it computed it: what an activation compares
   * a new program's work with (decision 0020).
   */
  work: Durable<T['operation'], T['internal']>
  /**
   * How the operation under the key is delivered, as the program that started it declared: what an activation
   * compares a new program's runners with (decision 0022).
   */
  delivery?: Delivery
}>

/**
 * What is stored, and survives a crash. Each event changes it at once or not at all: one transaction. The replies
 * are stored too, and are not here: a `Receive` is given the one stored under its request, and the reply a step
 * stores is in what it writes (decision 0065).
 */
export type Stored<T extends Types> = Readonly<{
  /** The name of the program the entity was created by: with its id, the entity's address (decision 0022). */
  name: string
  /**
   * The name the entity's idempotency keys are drawn from, once a launch has renamed its program: the name it held
   * before its first rename. Absent for an entity never renamed, whose keys are drawn from `name` (decision 0156).
   */
  keyedAs?: string
  id: string
  state: T['state']
  /** The work under way, by the `keyText` of each key, which each run carries as data (decision 0136). */
  keys: Readonly<Record<string, Run<T>>>
  /**
   * The last incarnation the entity drew. Each piece of work that starts anew, under any key, draws the next one,
   * so no two runs of the entity's work share an incarnation (decision 0132).
   */
  incarnations: number
  mailbox: ReadonlyArray<Envelope<T>>
  /** The request that created the entity: its retries are answered `Created` (decision 0017). */
  creation: Request<T['sender']>
  suspension: Suspension | null
}>

/** Work under way under a key: an operation running, or a timer armed. */
export type Running = Readonly<{ kind: 'Operation' | 'Timer'; incarnation: number }>

/**
 * An entity as the machine sees it. The program is not part of it: each event is stepped by the program that runs
 * the entity, which a deploy changes, so the machine and the runtime never see two programs (decision 0064).
 */
export type Machine<T extends Types> = Readonly<{
  stored: Stored<T>
  /** What the process is doing, lost in a crash, by the `keyText` of each key. */
  running: Readonly<Record<string, Running>>
}>

export type Event<T extends Types> =
  /**
   * An inbound message arrives, under its request, with the reply stored under that request, or null for none: a
   * runtime reads it just before the step, where no other event of the entity is applied (decision 0065). A reply
   * past its time is none (decision 0125). One that finds the mailbox empty is handled at `at` in the same event:
   * one transaction (decision 0074). `keep` is how long a caller's reply is kept once it is answered.
   */
  | Readonly<{
    _tag: 'Receive'
    request: Request<T['sender']>
    message: T['inbound']
    reply: StoredReply<T['rejection']> | null
    at: DateTime.Utc
    keep?: number
  }>
  /** A request to create the entity, which exists. Its flags do not matter (decision 0012). */
  | Readonly<{ _tag: 'Create'; request: Request<T['sender']> }>
  /** An operation's effect ends with its message, recorded in the mailbox. */
  | Readonly<{ _tag: 'Complete'; key: Key; incarnation: number; message: T['internal'] }>
  /** A timer's time comes, and its message is recorded in the mailbox. */
  | Readonly<{ _tag: 'Fire'; key: Key; incarnation: number }>
  /** The mailbox's first message is handled, at `at`: one step. */
  | Readonly<{ _tag: 'Handle'; at: DateTime.Utc }>
  /** An operation dies with a defect. */
  | Readonly<{ _tag: 'Die'; key: Key; incarnation: number; cause: unknown }>
  /**
   * The process dies, and the entity is activated again from what was stored, by the program the event is stepped
   * by: when it is another than the one before, a deploy (decision 0064).
   */
  | Readonly<{ _tag: 'Restart' }>
  /** An operator resumes a suspended entity. A fixed program is a deploy, before the resume (decision 0064). */
  | Readonly<{ _tag: 'Resume' }>
  /** An operator discards the inbound message a suspended entity died on, and resumes it. */
  | Readonly<{ _tag: 'Discard' }>

/**
 * An event as it is offered, before what it reads of storage and of the clock is given to it: a `Receive` with no
 * reply and no time yet.
 */
export type Offered<T extends Types> =
  | Exclude<Event<T>, Readonly<{ _tag: 'Receive' }>>
  | Omit<Extract<Event<T>, Readonly<{ _tag: 'Receive' }>>, 'reply' | 'at'>

export type Output<T extends Types> =
  | Readonly<{
    _tag: 'Replied'
    request: Request<T['sender']>
    reply: StoredReply<T['rejection']> | Readonly<{ _tag: 'Suspended' }>
  }>
  /**
   * A creation's request answered: apart from a message's, since a creation and a message share request ids
   * (decisions 0017, 0050).
   */
  | Readonly<{ _tag: 'CreationReplied'; request: Request<T['sender']>; reply: Creation }>
  /** A completion, a firing or an `unknown` written to the mailbox. */
  | Readonly<{ _tag: 'Recorded'; key: Key; incarnation: number }>
  /** An internal message `update` handled. */
  | Readonly<{ _tag: 'Delivered'; key: Key; incarnation: number }>
  /** An internal message dropped, since its work is not under way in that incarnation. */
  | Readonly<{ _tag: 'Dropped'; key: Key; incarnation: number }>
  | Readonly<{
    _tag: 'Started'
    key: Key
    incarnation: number
    idempotencyKey: IdempotencyKey
    operation: T['operation']
  }>
  | Readonly<{ _tag: 'Armed'; key: Key; incarnation: number; timer: Timer<T['internal']> }>
  /** A timer, or a droppable operation, that the step dropped or changed: it stops (decision 0128). */
  | Readonly<{ _tag: 'Disarmed'; key: Key; incarnation: number }>
  /** The entity is suspended: its timers stop, and its operations run to their end (decision 0113). */
  | Readonly<{ _tag: 'Suspended'; cause: unknown }>

/** A key's row: its incarnation and the work it holds, as stored, with how it is delivered and when it is due. */
export type KeyRow = Readonly<{
  key: Key
  incarnation: number
  work: Json
  delivery: Delivery | null
  /** A timer's time, in milliseconds, by which an entity nothing else holds loaded is woken (decision 0029). */
  due: number | null
}>

/** A message queued at the end of the mailbox, encoded, with an inbound message's request (decision 0059). */
export type EnvelopeRow =
  | Readonly<{ _tag: 'Inbound'; message: Json; request: Json; keep: number | null }>
  | Readonly<{ _tag: 'Internal'; message: Json; key: Key; incarnation: number }>

/** The work of another entity that sent a request: its reply is kept while that work holds (decision 0021). */
export type Asker = Readonly<{ name: string; id: string; key: Key; incarnation: number }>

/**
 * A reply stored under a request: `request` is its `requestKey`, the request's JSON as text, which the reply is
 * found by. A rejection's reason is null for a bare `reject`, and `asked` is the operation of another entity that
 * sent the request, read off it (decision 0059). `until` is the time in milliseconds from which a caller's reply
 * is no longer read, or null for one kept for ever (decision 0125).
 */
export type ReplyRow = Readonly<{
  request: string
  tag: StoredReply<unknown>['_tag']
  reason: Json | null
  asked: Asker | null
  until: number | null
}>

/**
 * What other systems learn of a step: the message it handled, what callers read after it, and the topics of the
 * log it is written in, those whose selection changed in the step, or every topic for a creation, which handles
 * no message (decisions 0038, 0138). It names one topic at least.
 */
export type Publication = Readonly<{
  kind: 'Inbound' | 'Internal' | 'Creation'
  message: Json | null
  projection: Json
  topics: ReadonlyArray<string>
}>

/**
 * What an event writes, encoded, in one transaction: a storage writes it and decides nothing (decision 0057).
 * The one thing it checks is what only it sees, another entity's keys: a reply whose asker's work no longer holds
 * is deleted as it is stored.
 */
export type Written = Readonly<{
  /** Whether the entity is new: its row is inserted. */
  created: boolean
  /** The state, with the request that created the entity, when the event changed the state. */
  entity: Readonly<{ state: Json; creation: Json }> | null
  /** Why the entity is suspended, its cause rendered, or null when it is not. */
  suspension: Readonly<{ on: Suspension['on']; cause: string }> | null
  /** The keys that changed, whole. */
  keys: ReadonlyArray<KeyRow>
  /** The keys whose work is gone: their rows are deleted (decision 0132). */
  gone: ReadonlyArray<Key>
  /** The last incarnation the entity drew, after the event. */
  incarnations: number
  /** How many messages leave the head of the mailbox, before `queued` is added at its end. */
  handled: number
  queued: ReadonlyArray<EnvelopeRow>
  /** The replies added. */
  replies: ReadonlyArray<ReplyRow>
  /** The work of the entity that ended: the replies to the requests it sent are deleted (decision 0021). */
  ended: ReadonlyArray<Readonly<{ key: Key; incarnation: number }>>
  /** The row a query reads, when the state changed (decision 0032). */
  shown: Shown | null
  /** The row of the outbox, in each topic whose selection changed, or null where none did (decisions 0038, 0138). */
  published: Publication | null
}>

export type Transition<T extends Types> = Readonly<{
  machine: Machine<T>
  outputs: ReadonlyArray<Output<T>>
  /** What the event writes, or null when it changes nothing stored. */
  written: Written | null
}>

/**
 * A transition before what it writes is worked out, with the message it handles and the reply it stores for an
 * inbound one.
 */
type Moved<T extends Types> =
  & Omit<Transition<T>, 'written'>
  & Readonly<{ handled?: Envelope<T>; answered?: StoredReply<T['rejection']>; at?: DateTime.Utc }>

/**
 * Whether the work under `key` in `incarnation` is stored, and not yet done. Once it is not, it never is again, and
 * its idempotency key is never used again: a reply stored for a request it sent may be deleted (decision 0021).
 */
export const holds = <T extends Types>(stored: Stored<T>, key: Key, incarnation: number) =>
  stored.keys[keyText(key)]?.incarnation === incarnation

/**
 * The digest of an idempotency key, for a service that caps a key's length: the SHA-256 of its UTF-8 bytes, in
 * unpadded base64url, 43 characters of `[A-Za-z0-9_-]`. It never changes: a digest that did would run an
 * operation under way again under a new key (decision 0123).
 */
export const digestOf = (key: IdempotencyKey): IdempotencyKey =>
  // Effect's `Digest` runs SHA-256 only on `crypto.subtle`, which answers with a promise, and the key a runner is
  // given is a pure function of what is stored, so its digest is synchronous. It is computed here, and not in
  // `src/program.ts`, since a browser that imports a program's schemas has no `node:crypto` (decision 0192).
  Base64Url.encode(createHash('sha256').update(key, 'utf8').digest()) as IdempotencyKey

/**
 * The idempotency key a runner of `delivery` is given for the work under `key` in `incarnation`: the readable one,
 * or its digest. It is a pure function of what is stored, so a restart gives the same one (decision 0123), and so
 * does a rename, which keeps the name the keys are drawn from (decision 0156).
 */
const givenKey = <T extends Types>(stored: Stored<T>, key: Key, incarnation: number, delivery?: Delivery) => {
  const readable = idempotencyKey({ name: stored.keyedAs ?? stored.name, id: stored.id }, key, incarnation)
  return delivery === 'IdempotentDigest' ? digestOf(readable) : readable
}

/** The idempotency key the runner of the work under `key` is given, as its stored delivery says. */
export const idempotencyKeyOf = <T extends Types>(machine: Machine<T>, key: Key, incarnation: number) =>
  givenKey(machine.stored, key, incarnation, machine.stored.keys[keyText(key)]?.delivery)

/** A piece of work a state holds, with the key it is held under. */
export type Piece<T extends Types> = Readonly<{ key: Key; work: Durable<T['operation'], T['internal']> }>

/**
 * The work a state holds, by the `keyText` of each key, as the machine reads it: any key, which `workUnder` checks
 * against the declared ones. A program writes its own as `Work`, typed by its keys.
 */
export type Held<T extends Types> = Readonly<Record<string, Piece<T>>>

/** The work the stored state holds, by key. */
export const workOf = <T extends Types>(stored: Stored<T>): Held<T> => {
  const work: Record<string, Piece<T>> = {}
  for (const [text, { key, work: held }] of Object.entries(stored.keys)) work[text] = { key, work: held }
  return work
}

export type Delivery = Runner<unknown, unknown, unknown>['delivery']

/** How `program` delivers an operation, or `undefined` for a timer. The work was admitted, so it has a runner. */
const deliveryOf = <T extends Types>(program: Program<T>, work: Durable<T['operation'], T['internal']>) =>
  isTimer(work) ? undefined : runnerOf(program, work)?.delivery

/**
 * The keys once the state holds `next`, as `program` delivers it: what is the same as in `previous` keeps its
 * incarnation, and anything else is new work, which draws the next incarnation of the entity's counter. A key that
 * `next` leaves has no row (decision 0132). A key that does not change is the same object, so that only the keys
 * that changed are written (decision 0057).
 */
const renew = <T extends Types>(
  program: Program<T>,
  stored: Pick<Stored<T>, 'keys' | 'incarnations'>,
  previous: Held<T>,
  next: Held<T>,
): Pick<Stored<T>, 'keys' | 'incarnations'> => {
  const renewed: Record<string, Run<T>> = {}
  let incarnations = stored.incarnations
  for (const [text, { key, work }] of Object.entries(next)) {
    const held = stored.keys[text]
    const was = previous[text]?.work
    const delivery = deliveryOf(program, work)
    const same = held !== undefined && was !== undefined && isSame(program, key, was, work)
    renewed[text] = same && held.work === was && held.delivery === delivery
      ? held
      : {
        key,
        incarnation: same ? held.incarnation : ++incarnations,
        work,
        ...(delivery === undefined ? {} : { delivery }),
      }
  }
  return { keys: renewed, incarnations }
}

const kindOf = (work: unknown): Running['kind'] => (isTimer(work) ? 'Timer' : 'Operation')

/**
 * Whether `next` is the work `previous` was: the same JSON, as the program stores them. An operation is stored
 * by its schema, a timer by its time and its message. That JSON is what a crash compares (decisions 0018, 0058).
 */
export const isSame = <T extends Types>(
  program: Program<T>,
  key: Key,
  previous: Durable<T['operation'], T['internal']>,
  next: Durable<T['operation'], T['internal']> | undefined,
) => next !== undefined && encodeWork(program, key, previous).text === encodeWork(program, key, next).text

const isQueued = <T extends Types>(stored: Stored<T>, key: Key, incarnation: number) =>
  stored.mailbox.some((envelope) =>
    envelope._tag === 'Internal' && keyText(envelope.key) === keyText(key) && envelope.incarnation === incarnation
  )

/** Starts the work under `key`, held in `stored` with how it is delivered. */
const startWork = <T extends Types>(
  stored: Stored<T>,
  key: Key,
  incarnation: number,
  work: Durable<T['operation'], T['internal']>,
): Output<T> =>
  isTimer(work)
    ? { _tag: 'Armed', key, incarnation, timer: work }
    : {
      _tag: 'Started',
      key,
      incarnation,
      idempotencyKey: givenKey(stored, key, incarnation, stored.keys[keyText(key)]?.delivery),
      operation: work,
    }

/**
 * The work a program returns on the stored state, against the work stored with it: what is the same keeps its
 * incarnation, and anything else is new work. A program of another name, or one that changes, drops or delivers
 * otherwise an operation before its completion, is a defect, as in a step (decisions 0020, 0022).
 */
const reconcile = <T extends Types>(program: Program<T>, stored: Stored<T>): Stored<T> => {
  if (program.name !== stored.name) {
    broken(`the program '${program.name}' replaces the entity's program '${stored.name}'`)
  }
  const work = admitted(program, stored.state)
  const { keys, incarnations } = renew(program, stored, workOf(stored), work)
  for (const [text, { key, work: was, delivery }] of Object.entries(stored.keys)) {
    // A droppable operation acts on nothing, so a new program may drop it, change it or deliver it otherwise
    // (decision 0128).
    if (isTimer(was) || delivery === 'Droppable') continue
    const next = work[text]?.work
    if (!isSame(program, key, was, next)) {
      broken(
        next === undefined || isTimer(next)
          ? `the program dropped the operation under '${shownKey(key)}' before its completion`
          : `the program changed the operation under '${shownKey(key)}' before its completion`,
      )
    }
    if (keys[text]?.delivery !== delivery) {
      broken(`the program changed how the operation under '${shownKey(key)}' is delivered before its completion`)
    }
  }
  return { ...stored, keys, incarnations }
}

/**
 * Starts what the stored state says, as `program` computes it: the work under each key, unless its message is
 * already in the mailbox, or its operation is still running in `machine`, which a resumption keeps (decision 0113).
 * An at-most-once operation that may have run before may have acted, so its `unknown` is recorded instead of
 * running it again. `mayHaveRun` says so after a crash or a suspension, and never at a creation. One that is new
 * work at this activation never ran, and starts: its incarnation is one the stored work did not hold. A suspended
 * entity starts nothing: a deploy of a fix leaves it as it is (decision 0064). A defect leaves the entity as it was
 * before the event, `before`, suspended on what suspended it, or on the activation. The defect is the program's on
 * the stored state, or an `unknown` that dies or does not encode (decision 0040).
 *
 * A passivation is a `Restart` the runtime chooses, with an empty mailbox and only timers under way: activating
 * again arms the same timers, in the same incarnations, which the stored work holds while it is unloaded.
 */
const activate = <T extends Types>(
  program: Program<T>,
  before: Machine<T>,
  machine: Machine<T>,
  mayHaveRun: boolean,
): Moved<T> => {
  if (machine.stored.suspension !== null) return { machine: { ...machine, running: {} }, outputs: [] }
  try {
    const stored = reconcile(program, machine.stored)
    const running: Record<string, Running> = {}
    const mailbox = [...stored.mailbox]
    const outputs: Array<Output<T>> = []
    for (const [text, { key, incarnation, work }] of Object.entries(stored.keys)) {
      if (isQueued(stored, key, incarnation)) continue
      const runner = isTimer(work) ? null : runnerOf(program, work)
      const started = incarnation === machine.stored.keys[text]?.incarnation
      const kept = machine.running[text]
      if (started && runner !== null && kept?.kind === 'Operation' && kept.incarnation === incarnation) {
        // Still running since before the suspension: `reconcile` checked that the program keeps it as it was.
        running[text] = kept
        continue
      }
      if (started && mayHaveRun && runner?.delivery === 'AtMostOnce') {
        const message = byProgram(() => runner.unknown(work as T['operation']))
        encodeBy(program.schemas.internal, message, `unknown of the operation under '${shownKey(key)}'`)
        mailbox.push({ _tag: 'Internal', key, incarnation, message })
        outputs.push({ _tag: 'Recorded', key, incarnation })
      } else {
        running[text] = { kind: kindOf(work), incarnation }
        outputs.push(startWork(stored, key, incarnation, work))
      }
    }
    return { machine: { ...machine, stored: { ...stored, mailbox }, running }, outputs }
  } catch (thrown) {
    const cause = defectOf(thrown)
    return suspend(before, { cause, on: before.stored.suspension?.on ?? { _tag: 'Activation' } })
  }
}

export type Start<T extends Types> =
  | Readonly<{ _tag: 'Created'; machine: Machine<T>; outputs: ReadonlyArray<Output<T>>; written: Written }>
  /**
   * `init` rejected the flags: nothing is stored, and the creator is answered with the reply, which is not stored
   * either (decision 0182).
   */
  | Readonly<{ _tag: 'Rejected'; reply: Readonly<{ _tag: 'Rejected'; reason: T['rejection'] | null }> }>
  /**
   * The flags or the request do not encode, or `init`, `durable`, `project` or an index died on the first state:
   * nothing is stored.
   */
  | Readonly<{ _tag: 'Defect'; cause: unknown }>

/**
 * Creates the entity `id` from its flags, answers the request `Created`, and activates it. An `init` that rejects the
 * flags creates nothing (decision 0182).
 */
export const start = <T extends Types>(
  program: Program<T>,
  id: string,
  flags: T['flags'],
  at: DateTime.Utc,
  request: Request<T['sender']>,
): Start<T> => {
  let state: T['state']
  let work: Held<T>
  try {
    // `init` is given the flags its schema takes, and no others: flags that do not encode are a defect, and
    // nothing is stored (decision 0049). The request is stored with the entity, and encodes too.
    encodeBy(program.schemas.flags, flags, 'value of the flags')
    encodeOnce(requestCodec(program), request, 'request')
    const first = byProgram(() => program.init(flags, at))
    if (isRejected(first)) {
      // The reason reaches the creator as a message's does, and on Cluster as text: one that does not encode is a
      // defect, as it is for `update` (decision 0182).
      const reply = { _tag: 'Rejected', reason: reasonOf(first) } as const
      if (reply.reason !== null) encodeBy(program.schemas.rejection, reply.reason, 'reason of the rejection')
      return { _tag: 'Rejected', reply }
    }
    state = first
    work = admitted(program, state)
  } catch (thrown) {
    return { _tag: 'Defect', cause: defectOf(thrown) }
  }
  const stored: Stored<T> = {
    name: program.name,
    id,
    state,
    ...renew(program, { keys: {}, incarnations: 0 }, {}, work),
    mailbox: [],
    creation: request,
    suspension: null,
  }
  const created: Machine<T> = { stored, running: {} }
  const { machine, outputs } = activate(program, created, created, false)
  const reply: Output<T> = { _tag: 'CreationReplied', request, reply: { _tag: 'Created' } }
  // A new entity always writes its row.
  const written = writes(program, null, machine.stored, null, null)
  if (written === null) throw new Error(`the creation of '${program.name}' '${id}' writes nothing`)
  return { _tag: 'Created', machine, outputs: [reply, ...outputs], written }
}

/**
 * Suspends the entity, and answers `Suspended` to every caller whose message waits in the mailbox: it has no reply
 * yet, and gets one by retrying once the entity is resumed (decision 0023). The timers leave what runs, and the
 * operations stay: each runs to its end, and its completion is recorded behind the message (decision 0113).
 */
const suspend = <T extends Types>(machine: Machine<T>, suspension: Suspension): Moved<T> => ({
  machine: {
    ...machine,
    stored: { ...machine.stored, suspension },
    running: Records.filter(machine.running, (held) => held.kind === 'Operation'),
  },
  outputs: [
    { _tag: 'Suspended', cause: suspension.cause },
    ...machine.stored.mailbox.flatMap((envelope): ReadonlyArray<Output<T>> =>
      envelope._tag === 'Inbound'
        ? [{ _tag: 'Replied', request: envelope.request, reply: { _tag: 'Suspended' } }]
        : []
    ),
  ],
})

const receive = <T extends Types>(
  program: Program<T>,
  machine: Machine<T>,
  event: Extract<Event<T>, { _tag: 'Receive' }>,
): Moved<T> => {
  const { stored } = machine
  const { request, reply } = event
  // A stored reply is read from storage: a suspended entity gives it too.
  if (reply !== null) return { machine, outputs: [{ _tag: 'Replied', request, reply }] }
  // Queued or not, a message has no reply yet: its caller retries once the entity is resumed (decision 0023).
  if (stored.suspension !== null) {
    return { machine, outputs: [{ _tag: 'Replied', request, reply: { _tag: 'Suspended' } }] }
  }
  // A retry of a message still in the mailbox waits for its reply.
  const key = requestKey(program, request)
  if (stored.mailbox.some((envelope) => envelope._tag === 'Inbound' && requestKey(program, envelope.request) === key)) {
    return { machine, outputs: [] }
  }
  // Only a caller's reply has a time: another entity's is kept while the work that asked holds (decision 0021).
  const envelope: Envelope<T> = event.keep === undefined || request._tag !== 'Caller'
    ? { _tag: 'Inbound', request, message: event.message }
    : { _tag: 'Inbound', request, message: event.message, keep: event.keep }
  const queued: Machine<T> = { ...machine, stored: { ...stored, mailbox: [...stored.mailbox, envelope] } }
  // Nothing is ahead of it: it is handled as it arrives, and never written to the mailbox (decision 0074).
  return stored.mailbox.length === 0 ? handle(program, queued, event.at) : { machine: queued, outputs: [] }
}

/**
 * Records the message of the work under way under `key` in `incarnation`, if it is the work of that kind. An
 * operation's message that does not encode cannot be stored, and is the operation's defect (decision 0040).
 */
const record = <T extends Types>(
  program: Program<T>,
  machine: Machine<T>,
  kind: Running['kind'],
  key: Key,
  incarnation: number,
  message: (work: Durable<T['operation'], T['internal']>) => T['internal'],
): Moved<T> => {
  const text = keyText(key)
  const running = machine.running[text]
  const work = machine.stored.keys[text]?.work
  if (running === undefined || running.kind !== kind || running.incarnation !== incarnation || work === undefined) {
    return { machine, outputs: [{ _tag: 'Dropped', key, incarnation }] }
  }
  const recorded = message(work)
  const { [text]: _, ...others } = machine.running
  if (kind === 'Operation') {
    try {
      encodeBy(program.schemas.internal, recorded, `message of the operation under '${shownKey(key)}'`)
    } catch (thrown) {
      return died({ ...machine, running: others }, { cause: defectOf(thrown), on: { _tag: 'Operation', key, incarnation } })
    }
  }
  const envelope: Envelope<T> = { _tag: 'Internal', key, incarnation, message: recorded }
  return {
    machine: {
      ...machine,
      stored: { ...machine.stored, mailbox: [...machine.stored.mailbox, envelope] },
      running: others,
    },
    outputs: [{ _tag: 'Recorded', key, incarnation }],
  }
}

/**
 * One step: the mailbox's first message, given to `update`. An internal message whose work is not under way in
 * its incarnation is dropped. The step is checked before it is stored, and a defect suspends the entity, with
 * the state and the mailbox as they were.
 */
const handle = <T extends Types>(program: Program<T>, machine: Machine<T>, at: DateTime.Utc): Moved<T> => {
  const { stored } = machine
  const [head, ...rest] = stored.mailbox
  if (stored.suspension !== null || head === undefined) return { machine, outputs: [] }
  try {
    if (head._tag === 'Internal' && !holds(stored, head.key, head.incarnation)) {
      return {
        machine: { ...machine, stored: { ...stored, mailbox: rest } },
        outputs: [{ _tag: 'Dropped', key: head.key, incarnation: head.incarnation }],
      }
    }
    const from: Origin<T['sender']> = head._tag === 'Inbound' ? originOf(head.request) : { _tag: 'Self' }
    const result = byProgram(() => program.update(head.message, { at, from })(stored.state))
    if (isRejected(result)) {
      if (head._tag === 'Internal') {
        return broken(`update rejected the message of the work under '${shownKey(head.key)}'`)
      }
      const reply = { _tag: 'Rejected', reason: reasonOf(result) } as const
      if (reply.reason !== null) encodeBy(program.schemas.rejection, reply.reason, 'reason of the rejection')
      return {
        machine: { ...machine, stored: { ...stored, mailbox: rest } },
        outputs: [{ _tag: 'Replied', request: head.request, reply }],
        handled: head,
        answered: reply,
        at,
      }
    }
    const state: T['state'] = result
    const after = admitted(program, state)

    // The work whose message is handled is done: its key counts as gone (decision 0008).
    const previous: Record<string, Piece<T>> = { ...workOf(stored) }
    if (head._tag === 'Internal') delete previous[keyText(head.key)]

    const { keys, incarnations } = renew(program, stored, previous, after)
    const running = { ...machine.running }
    const outputs: Array<Output<T>> = head._tag === 'Internal'
      ? [{ _tag: 'Delivered', key: head.key, incarnation: head.incarnation }]
      : []
    for (const [text, { key, work }] of Object.entries(previous)) {
      if (isSame(program, key, work, after[text]?.work)) continue
      // An operation leaves only through its completion, and does not change while it runs (decisions 0005,
      // 0018); a timer has done nothing yet, and a droppable operation acts on nothing (decision 0128).
      if (!isTimer(work) && stored.keys[text]?.delivery !== 'Droppable') {
        const next = after[text]?.work
        broken(
          next === undefined || isTimer(next)
            ? `the step dropped the operation under '${shownKey(key)}' before its completion`
            : `the step changed the operation under '${shownKey(key)}' before its completion`,
        )
      }
      const armed = running[text]
      if (armed !== undefined) {
        delete running[text]
        outputs.push({ _tag: 'Disarmed', key, incarnation: armed.incarnation })
      }
    }
    for (const [text, { key, work }] of Object.entries(after)) {
      const was = previous[text]?.work
      if (was !== undefined && isSame(program, key, was, work)) continue
      const incarnation = keys[text]?.incarnation ?? 0
      running[text] = { kind: kindOf(work), incarnation }
      outputs.push(startWork({ ...stored, keys, incarnations }, key, incarnation, work))
    }
    if (head._tag === 'Inbound') {
      outputs.unshift({ _tag: 'Replied', request: head.request, reply: { _tag: 'Accepted' } })
    }
    return {
      machine: { ...machine, stored: { ...stored, state, keys, incarnations, mailbox: rest }, running },
      outputs,
      handled: head,
      ...(head._tag === 'Inbound' ? { answered: { _tag: 'Accepted' } as const, at } : {}),
    }
  } catch (thrown) {
    return suspend(machine, { cause: defectOf(thrown), on: { _tag: 'Message' } })
  }

}

/**
 * Activates a suspended entity again, as after a crash, by the program that runs it, which a fix deployed
 * (decision 0064), keeping the operations still running (decision 0113). A program whose `durable`, `project` or
 * index dies on the stored state, or that changes an operation under way, leaves it suspended, with that cause.
 */
const resume = <T extends Types>(program: Program<T>, machine: Machine<T>): Moved<T> => {
  if (machine.stored.suspension === null) return { machine, outputs: [] }
  return activate(program, machine, { ...machine, stored: { ...machine.stored, suspension: null } }, true)
}

/**
 * Drops the inbound message a suspended entity died on, storing no reply, and resumes it (decision 0014). An
 * internal message is not discarded: the state before it still holds its work, so an operation would run again
 * under another idempotency key, and a timer whose time has passed would fire again at once. Only a program that
 * handles it gets the entity past it (decisions 0041, 0044).
 */
const discard = <T extends Types>(program: Program<T>, machine: Machine<T>): Moved<T> => {
  const { stored } = machine
  const [head, ...rest] = stored.mailbox
  if (stored.suspension?.on._tag !== 'Message' || head?._tag !== 'Inbound') return { machine, outputs: [] }
  return activate(program, machine, { ...machine, stored: { ...stored, mailbox: rest, suspension: null } }, true)
}

/**
 * An operation died, or ended with a message that does not encode: it has left `machine.running`. The defect
 * suspends the entity, unless it is suspended already: then the suspension keeps its first cause, and the operation
 * is started again at the resumption, as after a crash (decision 0113).
 */
const died = <T extends Types>(machine: Machine<T>, suspension: Suspension): Moved<T> =>
  machine.stored.suspension === null ? suspend(machine, suspension) : { machine, outputs: [] }

/** A defect's cause as an operator reads it: a suspension stores this, not the value (decision 0028). */
export const render = (cause: unknown): string =>
  cause instanceof Error ? `${cause.name}: ${cause.message}` : typeof cause === 'string' ? cause : String(cause)

/**
 * The cause of the program's defect `thrown`, as a suspension stores it. Anything else is thrown again, as the
 * runtime's (decision 0061).
 */
export const programCause = (thrown: unknown): string => render(defectOf(thrown))

const envelopeRow = <T extends Types>(program: Program<T>, envelope: Envelope<T>): EnvelopeRow =>
  envelope._tag === 'Inbound'
    ? {
      _tag: 'Inbound',
      message: encodeOnce(program.schemas.inbound, envelope.message, 'inbound message'),
      request: encodeOnce(requestCodec(program), envelope.request, 'request'),
      keep: envelope.keep ?? null,
    }
    : {
      _tag: 'Internal',
      message: encodeOnce(program.schemas.internal, envelope.message, 'internal message'),
      key: envelope.key,
      incarnation: envelope.incarnation,
    }

/**
 * The work of another entity that sent a request, read off the request: an operation's is its run's, with its
 * entity, key and incarnation (decisions 0021, 0059). Null for any other request.
 */
const askerOf = <Sender>(request: Request<Sender>): Asker | null =>
  request._tag === 'Operation'
    ? { name: request.entity.name, id: request.entity.id, key: request.key, incarnation: request.incarnation }
    : null

/**
 * What an event writes: the difference from what was stored before it, null for a new entity, to what is stored
 * after it. It carries the message the event handled and the reply it stored for it, and is nothing for an event
 * that changed nothing stored (decisions 0057, 0065). Only a step that handles a message changes the state of an
 * entity that exists, so the row it publishes is that message's.
 */
export const writes = <T extends Types>(
  program: Program<T>,
  before: Stored<T> | null,
  after: Stored<T>,
  handled: Envelope<T> | null,
  answered: StoredReply<T['rejection']> | null,
  at: DateTime.Utc | null = null,
): Written | null => {
  const changed = before === null || before.state !== after.state
  const keys: Array<KeyRow> = []
  for (const [text, held] of Object.entries(after.keys)) {
    if (before?.keys[text] === held) continue
    keys.push({
      key: held.key,
      incarnation: held.incarnation,
      work: encodeWork(program, held.key, held.work).json,
      delivery: held.delivery ?? null,
      due: isTimer(held.work) ? DateTime.toEpochMillis(held.work.at) : null,
    })
  }
  const gone = Object.entries(before?.keys ?? {}).flatMap(([text, held]) =>
    Object.hasOwn(after.keys, text) ? [] : [held.key]
  )
  // An event takes at most the mailbox's first message, and queues what it records at its end.
  const was = before?.mailbox ?? []
  const left = was.length > 0 && after.mailbox[0] !== was[0] ? 1 : 0
  const queued = after.mailbox.slice(was.length - left).map((envelope) => envelopeRow(program, envelope))
  // The machine stores a reply only for the inbound message it handles.
  const replies: ReadonlyArray<ReplyRow> = answered === null || handled?._tag !== 'Inbound' ? [] : [{
    request: requestKey(program, handled.request),
    tag: answered._tag,
    reason: answered._tag === 'Rejected' && answered.reason !== null
      ? encodeOnce(program.schemas.rejection, answered.reason, 'reason of the rejection')
      : null,
    asked: askerOf(handled.request),
    // Counted from the step that answers, so a message that waited in the mailbox loses none of its time.
    until: handled.keep === undefined || at === null ? null : DateTime.toEpochMillis(at) + handled.keep,
  }]
  const ended: Array<Readonly<{ key: Key; incarnation: number }>> = []
  for (const held of Object.values(before?.keys ?? {})) {
    if (holds(after, held.key, held.incarnation)) continue
    ended.push({ key: held.key, incarnation: held.incarnation })
  }
  const row = changed ? shownOf(program, after.state) : null
  let published: Publication | null = null
  // A step is written in a topic where what the topic selects changed, as the program deployed computes the
  // projection before and after, and in every topic at a creation. The topics are in the same order in both rows,
  // the order the program declares them.
  const shownBefore = row === null || before === null ? null : shownOf(program, before.state).topics
  const topics = row === null
    ? []
    : row.topics.filter((topic, at) => shownBefore === null || shownBefore[at]?.text !== topic.text)
  if (row !== null && topics.length > 0) {
    if (before !== null && handled === null) {
      throw new Error(`the state of '${after.name}' '${after.id}' changed with no message handled`)
    }
    published = {
      kind: handled === null ? 'Creation' : handled._tag,
      message: handled === null ? null : envelopeRow(program, handled).message,
      projection: row.projection,
      topics: topics.map(({ topic }) => topic),
    }
  }
  if (
    before !== null && !changed && keys.length === 0 && gone.length === 0 && left === 0 && queued.length === 0 &&
    replies.length === 0 && ended.length === 0 && before.suspension === after.suspension
  ) {
    return null
  }
  return {
    created: before === null,
    entity: changed
      ? {
        state: encodeOnce(program.schemas.state, after.state, 'state'),
        creation: encodeOnce(requestCodec(program), after.creation, 'request'),
      }
      : null,
    suspension: after.suspension === null
      ? null
      : { on: after.suspension.on, cause: render(after.suspension.cause) },
    keys,
    gone,
    incarnations: after.incarnations,
    handled: left,
    queued,
    replies,
    ended,
    shown: row === null ? null : { projection: row.projection, indexes: row.indexes },
    published,
  }
}

/**
 * One event, stepped by the program that runs the entity: the one an event of a deploy, a `Restart`, activates it
 * by, and every event after it until the next (decision 0064).
 */
export const step = <T extends Types>(program: Program<T>, machine: Machine<T>, event: Event<T>): Transition<T> => {
  const { handled = null, answered = null, at = null, ...moved } = move(program, machine, event)
  return {
    ...moved,
    written: moved.machine.stored === machine.stored
      ? null
      : writes(program, machine.stored, moved.machine.stored, handled, answered, at),
  }
}

const move = <T extends Types>(program: Program<T>, machine: Machine<T>, event: Event<T>): Moved<T> => {
  switch (event._tag) {
    case 'Receive':
      return receive(program, machine, event)
    case 'Create': {
      // Read from storage, as a stored reply: a suspended entity answers it too.
      const { request } = event
      const { stored } = machine
      const reply: Creation = requestKey(program, request) === requestKey(program, stored.creation)
        ? { _tag: 'Created' }
        : { _tag: 'AlreadyExists' }
      return { machine, outputs: [{ _tag: 'CreationReplied', request, reply }] }
    }
    case 'Complete':
      return record(program, machine, 'Operation', event.key, event.incarnation, () => event.message)
    case 'Fire':
      return record(program, machine, 'Timer', event.key, event.incarnation, (work) =>
        // `record` checked the kind of the work under way: the key is a timer in the stored state too.
        (work as Timer<T['internal']>).message as T['internal'])
    case 'Handle':
      return handle(program, machine, event.at)
    case 'Die': {
      const { key, incarnation, cause } = event
      const { [keyText(key)]: running, ...others } = machine.running
      return running?.kind === 'Operation' && running.incarnation === incarnation
        ? died({ ...machine, running: others }, { cause, on: { _tag: 'Operation', key, incarnation } })
        : { machine, outputs: [] }
    }
    case 'Restart': {
      // The process died, and its operations with it: none is kept running (decision 0113).
      const restarted = { ...machine, running: {} }
      return activate(program, restarted, restarted, true)
    }
    case 'Resume':
      return resume(program, machine)
    case 'Discard':
      return discard(program, machine)
  }
}
