/**
 * The runtime's semantics as a pure state machine: the executable form of the design's crash table, the engine
 * of `rehearse`, and the oracle of the real runtime's tests. Nothing here runs an effect: an event gives the next
 * machine, what it writes, encoded, and the outputs a runtime acts on (an operation to start, a timer to arm, a
 * reply to send).
 */
import * as DateTime from 'effect/DateTime'
import * as Schema from 'effect/Schema'
import {
  type Creation,
  type Durable,
  encode,
  type IdempotencyKey,
  idempotencyKey,
  indexesOf,
  InvariantDefect,
  isRejected,
  isTimer,
  type Json,
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
 * else thrown while an event is applied is the runtime's — a bug of the machine, or a machine the runtime gave it
 * corrupted — and leaves the step, which a runtime crashes the entity on (decisions 0042, 0061).
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

/**
 * The work the state holds, under the keys the program declares and no others: a key it does not declare is a
 * defect, where the state holding it is read (decision 0037). The types catch a key a program never declared
 * where the state holds that key alone, and not where it holds a declared key beside a misspelt one. So is an
 * operation the program gives no runner for, which a cast lets through (decision 0054), and anything a cast lets
 * through that is no work at all.
 */
const workUnder = <T extends Types>(program: Program<T>, state: T['state']): Held<T> => {
  const work: unknown = byProgram(() => program.durable(state))
  if (typeof work !== 'object' || work === null) return broken('durable gave no record of work')
  const declared = new Set<string>(program.keys)
  for (const [key, held] of Object.entries(work)) {
    if (!declared.has(key)) broken(`the state holds work under '${key}', which the program does not declare`)
    if (held === undefined || isTimer(held)) continue
    const tag: unknown = typeof held === 'object' && held !== null ? (held as { _tag?: unknown })._tag : undefined
    if (typeof tag !== 'string') broken(`the state holds what is no work under '${key}'`)
    if (runnerOf(program, held as T['operation']) === undefined) {
      broken(`the state holds the operation '${tag}' under '${key}', which the program has no runner for`)
    }
  }
  return work as Held<T>
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
  key: string,
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

const shown = new WeakMap<object, WeakMap<object, Shown & Readonly<{ text: string }>>>()

/**
 * What callers read of `state`, computed once for each program: the step that publishes compares it with the one
 * the step before computed (decisions 0038, 0057). A projection that does not encode, or an index that is a number
 * JSON does not hold, is a defect (decision 0040).
 */
export const shownOf = <T extends Types>(
  program: Program<T>,
  state: T['state'],
): Shown & Readonly<{ text: string }> => {
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
  }
  const json = encodeBy(program.schemas.projection, projection, 'projection')
  const row = { projection: json, indexes, text: canonical(json) }
  held.set(state, row)
  return row
}

/**
 * The work of a state the machine may store, and everything a runtime writes of it checked: `durable`, what
 * callers read, with the indexes a query reads it by, and the state, its work and its projection encoded to what
 * JSON holds. Any of them may die, and one that does suspends the entity. What is encoded here is kept, and is
 * what the step writes (decisions 0014, 0032, 0040, 0057).
 */
const admitted = <T extends Types>(program: Program<T>, state: T['state']): Held<T> => {
  const work = workUnder(program, state)
  shownOf(program, state)
  encodeOnce(program.schemas.state, state, 'state')
  for (const [key, held] of Object.entries(work)) encodeWork(program, key, held)
  return work
}

/** A message waiting in the mailbox: from a caller, or from the entity's own work in one incarnation. */
export type Envelope<T extends Types> =
  | Readonly<{ _tag: 'Inbound'; request: Request<T['sender']>; message: T['inbound'] }>
  | Readonly<{ _tag: 'Internal'; key: string; incarnation: number; message: T['internal'] }>

/**
 * Why the entity is suspended: a defect while handling the mailbox's first message, in an operation, or in
 * activating the stored state with a new program (decision 0020).
 */
export type Suspension = Readonly<{
  cause: unknown
  on:
    | Readonly<{ _tag: 'Message' }>
    | Readonly<{ _tag: 'Operation'; key: string; incarnation: number }>
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
        key: Schema.String,
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

/** A key ever returned by `durable`: one that holds no work once was returned, and left. */
export type Key<T extends Types> = Readonly<{
  incarnation: number
  /**
   * The work the state holds under the key, as the program that stored it computed it: what an activation compares
   * a new program's work with (decision 0020).
   */
  work?: Durable<T['operation'], T['internal']>
  /**
   * How the operation under the key is delivered, as the program that started it declared: what an activation
   * compares a new program's runners with (decision 0022).
   */
  delivery?: Delivery
}>

/** What is stored, and survives a crash. Each event changes it at once or not at all: one transaction. */
export type Stored<T extends Types> = Readonly<{
  /** The name of the program the entity was created by: with its id, the entity's address (decision 0022). */
  name: string
  id: string
  state: T['state']
  keys: Readonly<Record<string, Key<T>>>
  mailbox: ReadonlyArray<Envelope<T>>
  /** By `requestKey`. */
  replies: Readonly<Record<string, StoredReply<T['rejection']>>>
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
  /** What the process is doing, lost in a crash. */
  running: Readonly<Record<string, Running>>
}>

export type Event<T extends Types> =
  /** An inbound message arrives, under its request. */
  | Readonly<{ _tag: 'Receive'; request: Request<T['sender']>; message: T['inbound'] }>
  /** A request to create the entity, which exists. Its flags do not matter (decision 0012). */
  | Readonly<{ _tag: 'Create'; request: Request<T['sender']> }>
  /** An operation's effect ends with its message, recorded in the mailbox. */
  | Readonly<{ _tag: 'Complete'; key: string; incarnation: number; message: T['internal'] }>
  /** A timer's time comes, and its message is recorded in the mailbox. */
  | Readonly<{ _tag: 'Fire'; key: string; incarnation: number }>
  /** The mailbox's first message is handled, at `at`: one step. */
  | Readonly<{ _tag: 'Handle'; at: DateTime.Utc }>
  /** An operation dies with a defect. */
  | Readonly<{ _tag: 'Die'; key: string; incarnation: number; cause: unknown }>
  /**
   * The process dies, and the entity is activated again from what was stored, by the program the event is stepped
   * by: when it is another than the one before, a deploy (decision 0064).
   */
  | Readonly<{ _tag: 'Restart' }>
  /** An operator resumes a suspended entity. A fixed program is a deploy, before the resume (decision 0064). */
  | Readonly<{ _tag: 'Resume' }>
  /** An operator discards the inbound message a suspended entity died on, and resumes it. */
  | Readonly<{ _tag: 'Discard' }>

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
  | Readonly<{ _tag: 'Recorded'; key: string; incarnation: number }>
  /** An internal message `update` handled. */
  | Readonly<{ _tag: 'Delivered'; key: string; incarnation: number }>
  /** An internal message dropped, since its work is not under way in that incarnation. */
  | Readonly<{ _tag: 'Dropped'; key: string; incarnation: number }>
  | Readonly<{
    _tag: 'Started'
    key: string
    incarnation: number
    idempotencyKey: IdempotencyKey
    operation: T['operation']
  }>
  | Readonly<{ _tag: 'Armed'; key: string; incarnation: number; timer: Timer<T['internal']> }>
  | Readonly<{ _tag: 'Disarmed'; key: string; incarnation: number }>
  /** The entity is suspended: everything under way stops. */
  | Readonly<{ _tag: 'Suspended'; cause: unknown }>

/** A key's row: its incarnation and the work it holds, as stored, with how it is delivered and when it is due. */
export type KeyRow = Readonly<{
  key: string
  incarnation: number
  work: Json | null
  delivery: Delivery | null
  /** A timer's time, in milliseconds, by which an entity nothing else holds loaded is woken (decision 0029). */
  due: number | null
}>

/** A message queued at the end of the mailbox, encoded, with an inbound message's request (decision 0059). */
export type EnvelopeRow =
  | Readonly<{ _tag: 'Inbound'; message: Json; request: Json }>
  | Readonly<{ _tag: 'Internal'; message: Json; key: string; incarnation: number }>

/** The work of another entity that sent a request: its reply is kept while that work holds (decision 0021). */
export type Asker = Readonly<{ name: string; id: string; key: string; incarnation: number }>

/**
 * A reply stored under a request: `request` is its `requestKey`, the request's JSON as text, which the reply is
 * found by. A rejection's reason is null for a bare `reject`, and `asked` is the operation of another entity that
 * sent the request, read off it (decision 0059).
 */
export type ReplyRow = Readonly<{
  request: string
  tag: StoredReply<unknown>['_tag']
  reason: Json | null
  asked: Asker | null
}>

/**
 * What other systems learn of a step: the message it handled, and what callers read after it, or the first
 * projection of a creation, which handles none (decision 0038).
 */
export type Publication = Readonly<{
  kind: 'Inbound' | 'Internal' | 'Creation'
  message: Json | null
  projection: Json
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
  /** How many messages leave the head of the mailbox, before `queued` is added at its end. */
  handled: number
  queued: ReadonlyArray<EnvelopeRow>
  /** The replies added. */
  replies: ReadonlyArray<ReplyRow>
  /** The work of the entity that ended: the replies to the requests it sent are deleted (decision 0021). */
  ended: ReadonlyArray<Readonly<{ key: string; incarnation: number }>>
  /** The row a query reads, when the state changed (decision 0032). */
  shown: Shown | null
  /** The row of the outbox, when what callers read changed (decision 0038). */
  published: Publication | null
}>

export type Transition<T extends Types> = Readonly<{
  machine: Machine<T>
  outputs: ReadonlyArray<Output<T>>
  /** What the event writes, or null when it changes nothing stored. */
  written: Written | null
}>

/** A transition before what it writes is worked out. */
type Moved<T extends Types> = Omit<Transition<T>, 'written'>

/**
 * Whether the work under `key` in `incarnation` is stored, and not yet done. Once it is not, it never is again, and
 * its idempotency key is never used again: a reply stored for a request it sent may be deleted (decision 0021).
 */
export const holds = <T extends Types>(stored: Stored<T>, key: string, incarnation: number) => {
  const held = stored.keys[key]
  return held?.work !== undefined && held.incarnation === incarnation
}

export const idempotencyKeyOf = <T extends Types>(machine: Machine<T>, key: string, incarnation: number) =>
  idempotencyKey({ name: machine.stored.name, id: machine.stored.id }, key, incarnation)

/**
 * The work a state holds, by key, as the machine reads it: a record of any key, which `workUnder` checks against
 * the declared ones. A program writes its own as `Work`, typed by its keys.
 */
export type Held<T extends Types> = Readonly<Record<string, Durable<T['operation'], T['internal']>>>

/** The work the stored state holds, by key. */
export const workOf = <T extends Types>(stored: Stored<T>): Held<T> => {
  const work: Record<string, Durable<T['operation'], T['internal']>> = {}
  for (const [key, held] of Object.entries(stored.keys)) if (held.work !== undefined) work[key] = held.work
  return work
}

export type Delivery = Runner<unknown, unknown, unknown>['delivery']

/** How `program` delivers an operation, or `undefined` for a timer. The work was admitted, so it has a runner. */
const deliveryOf = <T extends Types>(program: Program<T>, work: Durable<T['operation'], T['internal']>) =>
  isTimer(work) ? undefined : runnerOf(program, work)?.delivery

/**
 * The keys once the state holds `next`, as `program` delivers it: what is the same as in `previous` keeps its
 * incarnation, and anything else is new work, in the next one. A key `next` leaves keeps its incarnation. A key
 * that does not change is the same object, so that only the keys that changed are written (decision 0057).
 */
const renew = <T extends Types>(
  program: Program<T>,
  keys: Stored<T>['keys'],
  previous: Held<T>,
  next: Held<T>,
): Stored<T>['keys'] => {
  const renewed: Record<string, Key<T>> = {}
  for (const key of new Set([...Object.keys(keys), ...Object.keys(next)])) {
    const held = keys[key]
    const was = previous[key]
    const work = next[key]
    const incarnation = held?.incarnation ?? 0
    if (work === undefined) {
      renewed[key] = held !== undefined && held.work === undefined ? held : { incarnation }
      continue
    }
    const delivery = deliveryOf(program, work)
    const same = was !== undefined && isSame(program, key, was, work)
    renewed[key] = same && held !== undefined && held.work === was && held.delivery === delivery
      ? held
      : {
        incarnation: same ? incarnation : incarnation + 1,
        work,
        ...(delivery === undefined ? {} : { delivery }),
      }
  }
  return renewed
}

const kindOf = (work: unknown): Running['kind'] => (isTimer(work) ? 'Timer' : 'Operation')

/**
 * Whether `next` is the work `previous` was: the same JSON, as the program stores them — an operation by its
 * schema, a timer by its time and its message — which is what a crash compares (decisions 0018, 0058).
 */
const isSame = <T extends Types>(
  program: Program<T>,
  key: string,
  previous: Durable<T['operation'], T['internal']>,
  next: Durable<T['operation'], T['internal']> | undefined,
) => next !== undefined && encodeWork(program, key, previous).text === encodeWork(program, key, next).text

const isQueued = <T extends Types>(stored: Stored<T>, key: string, incarnation: number) =>
  stored.mailbox.some((envelope) =>
    envelope._tag === 'Internal' && envelope.key === key && envelope.incarnation === incarnation
  )

const startWork = <T extends Types>(
  machine: Machine<T>,
  key: string,
  incarnation: number,
  work: Durable<T['operation'], T['internal']>,
): Output<T> =>
  isTimer(work)
    ? { _tag: 'Armed', key, incarnation, timer: work }
    : {
      _tag: 'Started',
      key,
      incarnation,
      idempotencyKey: idempotencyKeyOf(machine, key, incarnation),
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
  const keys = renew(program, stored.keys, workOf(stored), work)
  for (const [key, { work: was, delivery }] of Object.entries(stored.keys)) {
    if (was === undefined || isTimer(was)) continue
    const next = work[key]
    if (!isSame(program, key, was, next)) {
      broken(
        next === undefined || isTimer(next)
          ? `the program dropped the operation under '${key}' before its completion`
          : `the program changed the operation under '${key}' before its completion`,
      )
    }
    if (keys[key]?.delivery !== delivery) {
      broken(`the program changed how the operation under '${key}' is delivered before its completion`)
    }
  }
  return { ...stored, keys }
}

/**
 * Starts what the stored state says, with nothing under way, as `program` computes it: the work under each key,
 * unless its message is already in the mailbox. An at-most-once operation that may have run before (`mayHaveRun`:
 * after a crash, or a suspension, and never at a creation) may have acted, so its `unknown` is recorded instead of
 * running it again; one that is new work at this activation, in an incarnation the stored work did not hold, never
 * ran, and starts. A suspended entity starts nothing: a deploy of a fix leaves it as it is (decision 0064). A defect,
 * of the program on the stored state or of an `unknown` that dies or does not encode (decision 0040), leaves the
 * entity as it was before the event, `before`, suspended on what suspended it, or on the activation.
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
    for (const [key, { incarnation, work }] of Object.entries(stored.keys)) {
      if (work === undefined || isQueued(stored, key, incarnation)) continue
      const runner = isTimer(work) ? null : runnerOf(program, work)
      const started = incarnation === machine.stored.keys[key]?.incarnation
      if (started && mayHaveRun && runner?.delivery === 'AtMostOnce') {
        const message = byProgram(() => runner.unknown(work as T['operation']))
        encodeBy(program.schemas.internal, message, `unknown of the operation under '${key}'`)
        mailbox.push({ _tag: 'Internal', key, incarnation, message })
        outputs.push({ _tag: 'Recorded', key, incarnation })
      } else {
        running[key] = { kind: kindOf(work), incarnation }
        outputs.push(startWork(machine, key, incarnation, work))
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
   * The flags or the request do not encode, or `init`, `durable`, `project` or an index died on the first state:
   * nothing is stored.
   */
  | Readonly<{ _tag: 'Defect'; cause: unknown }>

/** Creates the entity `id` from its flags, answers the request `Created`, and activates it. */
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
    state = byProgram(() => program.init(flags, at))
    work = admitted(program, state)
  } catch (thrown) {
    return { _tag: 'Defect', cause: defectOf(thrown) }
  }
  const stored: Stored<T> = {
    name: program.name,
    id,
    state,
    keys: renew(program, {}, {}, work),
    mailbox: [],
    replies: {},
    creation: request,
    suspension: null,
  }
  const created: Machine<T> = { stored, running: {} }
  const { machine, outputs } = activate(program, created, created, false)
  const reply: Output<T> = { _tag: 'CreationReplied', request, reply: { _tag: 'Created' } }
  // A new entity always writes its row.
  const written = writes(program, null, machine.stored, null)
  if (written === null) throw new Error(`the creation of '${program.name}' '${id}' writes nothing`)
  return { _tag: 'Created', machine, outputs: [reply, ...outputs], written }
}

/**
 * Suspends the entity, and answers `Suspended` to every caller whose message waits in the mailbox: it has no reply
 * yet, and gets one by retrying once the entity is resumed (decision 0023).
 */
const suspend = <T extends Types>(machine: Machine<T>, suspension: Suspension): Moved<T> => ({
  machine: { ...machine, stored: { ...machine.stored, suspension }, running: {} },
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
  const { request } = event
  const key = requestKey(program, request)
  // A stored reply is read from storage: a suspended entity gives it too.
  const reply = stored.replies[key]
  if (reply !== undefined) return { machine, outputs: [{ _tag: 'Replied', request, reply }] }
  // Queued or not, a message has no reply yet: its caller retries once the entity is resumed (decision 0023).
  if (stored.suspension !== null) {
    return { machine, outputs: [{ _tag: 'Replied', request, reply: { _tag: 'Suspended' } }] }
  }
  // A retry of a message still in the mailbox waits for its reply.
  if (stored.mailbox.some((envelope) => envelope._tag === 'Inbound' && requestKey(program, envelope.request) === key)) {
    return { machine, outputs: [] }
  }
  const envelope: Envelope<T> = { _tag: 'Inbound', request, message: event.message }
  return { machine: { ...machine, stored: { ...stored, mailbox: [...stored.mailbox, envelope] } }, outputs: [] }
}

/**
 * Records the message of the work under way under `key` in `incarnation`, if it is the work of that kind. An
 * operation's message that does not encode cannot be stored, and is the operation's defect (decision 0040).
 */
const record = <T extends Types>(
  program: Program<T>,
  machine: Machine<T>,
  kind: Running['kind'],
  key: string,
  incarnation: number,
  message: (work: Durable<T['operation'], T['internal']>) => T['internal'],
): Moved<T> => {
  const running = machine.running[key]
  const work = machine.stored.keys[key]?.work
  if (running === undefined || running.kind !== kind || running.incarnation !== incarnation || work === undefined) {
    return { machine, outputs: [{ _tag: 'Dropped', key, incarnation }] }
  }
  const recorded = message(work)
  if (kind === 'Operation') {
    try {
      encodeBy(program.schemas.internal, recorded, `message of the operation under '${key}'`)
    } catch (thrown) {
      return suspend(machine, { cause: defectOf(thrown), on: { _tag: 'Operation', key, incarnation } })
    }
  }
  const { [key]: _, ...others } = machine.running
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
      if (head._tag === 'Internal') return broken(`update rejected the message of the work under '${head.key}'`)
      const reply = { _tag: 'Rejected', reason: reasonOf(result) } as const
      if (reply.reason !== null) encodeBy(program.schemas.rejection, reply.reason, 'reason of the rejection')
      const replies = { ...stored.replies, [requestKey(program, head.request)]: reply }
      return {
        machine: { ...machine, stored: { ...stored, mailbox: rest, replies } },
        outputs: [{ _tag: 'Replied', request: head.request, reply }],
      }
    }
    const state: T['state'] = result
    const after = admitted(program, state)

    // The work whose message is handled is done: its key counts as gone (decision 0008).
    const previous: Record<string, Durable<T['operation'], T['internal']>> = { ...workOf(stored) }
    if (head._tag === 'Internal') delete previous[head.key]

    const keys = renew(program, stored.keys, previous, after)
    const running = { ...machine.running }
    const outputs: Array<Output<T>> = head._tag === 'Internal'
      ? [{ _tag: 'Delivered', key: head.key, incarnation: head.incarnation }]
      : []
    for (const [key, work] of Object.entries(previous)) {
      if (isSame(program, key, work, after[key])) continue
      // An operation leaves only through its completion, and does not change while it runs (decisions 0005,
      // 0018); a timer has done nothing yet.
      if (!isTimer(work)) {
        const next = after[key]
        broken(
          next === undefined || isTimer(next)
            ? `the step dropped the operation under '${key}' before its completion`
            : `the step changed the operation under '${key}' before its completion`,
        )
      }
      const armed = running[key]
      if (armed !== undefined) {
        delete running[key]
        outputs.push({ _tag: 'Disarmed', key, incarnation: armed.incarnation })
      }
    }
    for (const [key, work] of Object.entries(after)) {
      const was = previous[key]
      if (was !== undefined && isSame(program, key, was, work)) continue
      const incarnation = keys[key]?.incarnation ?? 0
      running[key] = { kind: kindOf(work), incarnation }
      outputs.push(startWork(machine, key, incarnation, work))
    }
    const replies = head._tag === 'Inbound'
      ? { ...stored.replies, [requestKey(program, head.request)]: { _tag: 'Accepted' } as const }
      : stored.replies
    if (head._tag === 'Inbound') {
      outputs.unshift({ _tag: 'Replied', request: head.request, reply: { _tag: 'Accepted' } })
    }
    return {
      machine: {
        ...machine,
        stored: {
          ...stored,
          state,
          keys,
          mailbox: rest,
          replies,
        },
        running,
      },
      outputs,
    }
  } catch (thrown) {
    return suspend(machine, { cause: defectOf(thrown), on: { _tag: 'Message' } })
  }

}

/**
 * Activates a suspended entity again, as after a crash, by the program that runs it, which a fix deployed
 * (decision 0064). A program whose `durable`, `project` or index dies on the stored state, or that changes an
 * operation under way, leaves it suspended, with that cause.
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

/** A defect's cause as an operator reads it: a suspension stores this, not the value (decision 0028). */
const render = (cause: unknown): string =>
  cause instanceof Error ? `${cause.name}: ${cause.message}` : typeof cause === 'string' ? cause : String(cause)

const envelopeRow = <T extends Types>(program: Program<T>, envelope: Envelope<T>): EnvelopeRow =>
  envelope._tag === 'Inbound'
    ? {
      _tag: 'Inbound',
      message: encodeOnce(program.schemas.inbound, envelope.message, 'inbound message'),
      request: encodeOnce(requestCodec(program), envelope.request, 'request'),
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
 * What an event writes, from what was stored before it (null for a new entity) to what is stored after it, with
 * the message it handled: nothing for an event that changed nothing stored (decision 0057). Only a step that
 * handles a message changes the state of an entity that exists, so the row it publishes is that message's.
 */
export const writes = <T extends Types>(
  program: Program<T>,
  before: Stored<T> | null,
  after: Stored<T>,
  handled: Envelope<T> | null,
): Written | null => {
  const changed = before === null || before.state !== after.state
  const keys: Array<KeyRow> = []
  for (const [key, held] of Object.entries(after.keys)) {
    if (before?.keys[key] === held) continue
    keys.push({
      key,
      incarnation: held.incarnation,
      work: held.work === undefined ? null : encodeWork(program, key, held.work).json,
      delivery: held.delivery ?? null,
      due: held.work !== undefined && isTimer(held.work) ? DateTime.toEpochMillis(held.work.at) : null,
    })
  }
  // An event takes at most the mailbox's first message, and queues what it records at its end.
  const was = before?.mailbox ?? []
  const left = was.length > 0 && after.mailbox[0] !== was[0] ? 1 : 0
  const queued = after.mailbox.slice(was.length - left).map((envelope) => envelopeRow(program, envelope))
  const replies: Array<ReplyRow> = []
  for (const [request, reply] of Object.entries(after.replies)) {
    if (before?.replies[request] !== undefined) continue
    // The machine adds a reply only for the message it handles.
    const asked = handled?._tag === 'Inbound' ? askerOf(handled.request) : null
    const reason = reply._tag === 'Rejected' && reply.reason !== null
      ? encodeOnce(program.schemas.rejection, reply.reason, 'reason of the rejection')
      : null
    replies.push({ request, tag: reply._tag, reason, asked })
  }
  const ended: Array<Readonly<{ key: string; incarnation: number }>> = []
  for (const [key, held] of Object.entries(before?.keys ?? {})) {
    if (held.work === undefined || holds(after, key, held.incarnation)) continue
    ended.push({ key, incarnation: held.incarnation })
  }
  const row = changed ? shownOf(program, after.state) : null
  let published: Publication | null = null
  if (row !== null && (before === null || shownOf(program, before.state).text !== row.text)) {
    if (before !== null && handled === null) {
      throw new Error(`the state of '${after.name}' '${after.id}' changed with no message handled`)
    }
    published = {
      kind: handled === null ? 'Creation' : handled._tag,
      message: handled === null ? null : envelopeRow(program, handled).message,
      projection: row.projection,
    }
  }
  if (
    before !== null && !changed && keys.length === 0 && left === 0 && queued.length === 0 &&
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
  const moved = move(program, machine, event)
  const handled = event._tag === 'Handle' ? machine.stored.mailbox[0] ?? null : null
  return {
    ...moved,
    written: moved.machine.stored === machine.stored
      ? null
      : writes(program, machine.stored, moved.machine.stored, handled),
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
      const running = machine.running[key]
      return running?.kind === 'Operation' && running.incarnation === incarnation
        ? suspend(machine, { cause, on: { _tag: 'Operation', key, incarnation } })
        : { machine, outputs: [] }
    }
    case 'Restart':
      return activate(program, machine, { ...machine, running: {} }, true)
    case 'Resume':
      return resume(program, machine)
    case 'Discard':
      return discard(program, machine)
  }
}
