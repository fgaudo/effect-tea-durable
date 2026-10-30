/**
 * The runtime's semantics as a pure state machine: the executable form of the design's crash table, the engine
 * of `rehearse`, and the oracle of the real runtime's tests. Nothing here runs an effect: an event gives the next
 * machine, and the outputs a runtime acts on (an operation to start, a timer to arm, a reply to send).
 */
import * as DateTime from 'effect/DateTime'
import * as Equal from 'effect/Equal'
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
  type Origin,
  type Program,
  reasonOf,
  type Reply,
  type Runner,
  runnerOf,
  type Timer,
  type Types,
} from './program.ts'

/**
 * The work the state holds, under the keys the program declares and no others: a key it does not declare is a
 * defect, where the state holding it is read (decision 0037). The types catch a key a program never declared
 * where the state holds that key alone, and not where it holds a declared key beside a misspelt one.
 */
const workUnder = <T extends Types>(program: Program<T>, state: T['state']): Work<T> => {
  const work = program.durable(state)
  const declared = new Set<string>(program.keys)
  for (const key of Object.keys(work)) {
    if (!declared.has(key)) {
      throw new InvariantDefect({ reason: `the state holds work under '${key}', which the program does not declare` })
    }
  }
  return work
}

/**
 * The work of a state the machine may store, and everything a runtime writes of it checked: `durable`, what
 * callers read, with the indexes a query reads it by, and the state, its work and its projection encoded to what
 * JSON holds. Any of them may die, and one that does suspends the entity, so a runtime may compute and encode them
 * again while it writes, knowing no defect escapes its transaction (decisions 0014, 0032, 0040).
 */
const admitted = <T extends Types>(program: Program<T>, state: T['state']): Work<T> => {
  const work = workUnder(program, state)
  const projection = program.project(state)
  const indexes = indexesOf(program, projection)
  const { schemas } = program
  encode(schemas.state, state, 'state')
  encode(schemas.projection, projection, 'projection')
  for (const [name, value] of Object.entries(indexes)) {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new InvariantDefect({ reason: `the index '${name}' is a number JSON does not hold` })
    }
  }
  for (const [key, held] of Object.entries(work)) {
    if (isTimer(held)) encode(schemas.internal, held.message as T['internal'], `message of the timer under '${key}'`)
    else encode(schemas.operation, held, `operation under '${key}'`)
  }
  return work
}

/** A message waiting in the mailbox: from a caller, or from the entity's own work in one incarnation. */
export type Envelope<T extends Types> =
  | Readonly<{ _tag: 'Inbound'; requestId: string; message: T['inbound']; from: Origin<T['sender']> }>
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

/**
 * A request as it is stored and deduplicated: under who sent it and the request id it chose. Another entity's are
 * its own, under its address (decision 0015), and a caller's are its sender's, as the program's schema writes the
 * sender (decision 0048). The rehearsal creates its entity as the entity itself, and no one retries it.
 */
export const requestKey = <T extends Types>(
  program: Program<T>,
  from: Origin<T['sender']>,
  requestId: string,
): string =>
  JSON.stringify(
    from._tag === 'Entity'
      ? [from.entity.name, from.entity.id, requestId]
      : from._tag === 'Caller'
      ? [encode(program.schemas.sender, from.sender, 'sender'), requestId]
      : [requestId],
  )

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
  /** The request that created the entity, by `requestKey`: its retries are answered `Created` (decision 0017). */
  creation: string
  suspension: Suspension | null
}>

/** Work under way under a key: an operation running, or a timer armed. */
export type Running = Readonly<{ kind: 'Operation' | 'Timer'; incarnation: number }>

export type Machine<T extends Types> = Readonly<{
  program: Program<T>
  stored: Stored<T>
  /** What the process is doing, lost in a crash. */
  running: Readonly<Record<string, Running>>
}>

export type Event<T extends Types> =
  /** An inbound message arrives, with the caller's request id. */
  | Readonly<{ _tag: 'Receive'; requestId: string; message: T['inbound']; from: Origin<T['sender']> }>
  /** A request to create the entity, which exists. Its flags do not matter (decision 0012). */
  | Readonly<{ _tag: 'Create'; requestId: string; from: Origin<T['sender']> }>
  /** An operation's effect ends with its message, recorded in the mailbox. */
  | Readonly<{ _tag: 'Complete'; key: string; incarnation: number; message: T['internal'] }>
  /** A timer's time comes, and its message is recorded in the mailbox. */
  | Readonly<{ _tag: 'Fire'; key: string; incarnation: number }>
  /** The mailbox's first message is handled, at `at`: one step. */
  | Readonly<{ _tag: 'Handle'; at: DateTime.Utc }>
  /** An operation dies with a defect. */
  | Readonly<{ _tag: 'Die'; key: string; incarnation: number; cause: unknown }>
  /** The process dies, and the entity is activated again from what was stored, perhaps by a new program: a deploy. */
  | Readonly<{ _tag: 'Restart'; program?: Program<T> }>
  /** An operator resumes a suspended entity, perhaps with a fixed program. */
  | Readonly<{ _tag: 'Resume'; program?: Program<T> }>
  /** An operator discards the inbound message a suspended entity died on, and resumes it. */
  | Readonly<{ _tag: 'Discard' }>

export type Output<T extends Types> =
  | Readonly<{
    _tag: 'Replied'
    requestId: string
    from: Origin<T['sender']>
    reply: StoredReply<T['rejection']> | Readonly<{ _tag: 'Suspended' }> | Creation
  }>
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

export type Transition<T extends Types> = Readonly<{ machine: Machine<T>; outputs: ReadonlyArray<Output<T>> }>

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

export type Work<T extends Types> = Readonly<Record<string, Durable<T['operation'], T['internal']>>>

/** The work the stored state holds, by key. */
export const workOf = <T extends Types>(stored: Stored<T>): Work<T> => {
  const work: Record<string, Durable<T['operation'], T['internal']>> = {}
  for (const [key, held] of Object.entries(stored.keys)) if (held.work !== undefined) work[key] = held.work
  return work
}

type Delivery = Runner<unknown, unknown, unknown>['delivery']

/** How `program` delivers an operation, or `undefined` for a timer or an operation it has no runner for. */
const deliveryOf = <T extends Types>(program: Program<T>, work: Durable<T['operation'], T['internal']>) => {
  if (isTimer(work)) return undefined
  // A program a deploy brings may have no runner for an operation it finds stored.
  const runner: Runner<T['operation'], T['internal'], T['services']> | undefined = runnerOf(program, work)
  return runner?.delivery
}

/**
 * The keys once the state holds `next`, as `program` delivers it: what is the same as in `previous` keeps its
 * incarnation, and anything else is new work, in the next one. A key `next` leaves keeps its incarnation.
 */
const renew = <T extends Types>(
  program: Program<T>,
  keys: Stored<T>['keys'],
  previous: Work<T>,
  next: Work<T>,
): Stored<T>['keys'] => {
  const renewed: Record<string, Key<T>> = {}
  for (const key of new Set([...Object.keys(keys), ...Object.keys(next)])) {
    const was = previous[key]
    const work = next[key]
    const incarnation = keys[key]?.incarnation ?? 0
    if (work === undefined) {
      renewed[key] = { incarnation }
      continue
    }
    const delivery = deliveryOf(program, work)
    renewed[key] = {
      incarnation: was !== undefined && isSame(was, work) ? incarnation : incarnation + 1,
      work,
      ...(delivery === undefined ? {} : { delivery }),
    }
  }
  return renewed
}

const kindOf = (work: unknown): Running['kind'] => (isTimer(work) ? 'Timer' : 'Operation')

/**
 * Whether `next` is the work `previous` was: the same operation, compared by value, or a timer at the same time
 * with the same message (decision 0018).
 */
const isSame = <T extends Types>(
  previous: Durable<T['operation'], T['internal']>,
  next: Durable<T['operation'], T['internal']> | undefined,
) =>
  next !== undefined &&
  (isTimer(previous)
    ? isTimer(next) && DateTime.Equivalence(previous.at, next.at) && Equal.equals(previous.message, next.message)
    : !isTimer(next) && Equal.equals(previous, next))

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
    throw new InvariantDefect({
      reason: `the program '${program.name}' replaces the entity's program '${stored.name}'`,
    })
  }
  const work = admitted(program, stored.state)
  const keys = renew(program, stored.keys, workOf(stored), work)
  for (const [key, { work: was, delivery }] of Object.entries(stored.keys)) {
    if (was === undefined || isTimer(was)) continue
    const next = work[key]
    if (!isSame(was, next)) {
      throw new InvariantDefect({
        reason: next === undefined || isTimer(next)
          ? `the program dropped the operation under '${key}' before its completion`
          : `the program changed the operation under '${key}' before its completion`,
      })
    }
    if (keys[key]?.delivery !== delivery) {
      throw new InvariantDefect({
        reason: `the program changed how the operation under '${key}' is delivered before its completion`,
      })
    }
  }
  return { ...stored, keys }
}

/**
 * Starts what the stored state says, with nothing under way, as `program` computes it: the work under each key,
 * unless its message is already in the mailbox. An at-most-once operation that may have run before (after a
 * crash, or a suspension) may have acted, so its `unknown` is recorded instead of running it again; one that is
 * new work at this activation, in an incarnation the stored work did not hold, never ran, and starts. A defect,
 * of the program on the stored state or of an `unknown` that dies or does not encode (decision 0040), leaves the
 * entity as it was before the event, `before`, suspended on what suspended it, or on the activation.
 *
 * A passivation is a `Restart` the runtime chooses, with an empty mailbox and only timers under way: activating
 * again arms the same timers, in the same incarnations, which the stored work holds while it is unloaded.
 */
const activate = <T extends Types>(
  before: Machine<T>,
  machine: Machine<T>,
  program: Program<T>,
  mayHaveRun: (key: string) => boolean,
): Transition<T> => {
  if (machine.stored.suspension !== null) return { machine: { ...machine, program, running: {} }, outputs: [] }
  try {
    const stored = reconcile(program, machine.stored)
    const running: Record<string, Running> = {}
    const mailbox = [...stored.mailbox]
    const outputs: Array<Output<T>> = []
    const activated = { ...machine, program }
    for (const [key, { incarnation, work }] of Object.entries(stored.keys)) {
      if (work === undefined || isQueued(stored, key, incarnation)) continue
      const runner = isTimer(work) ? null : runnerOf(program, work)
      const started = incarnation === machine.stored.keys[key]?.incarnation
      if (started && mayHaveRun(key) && runner?.delivery === 'AtMostOnce') {
        const message = runner.unknown(work as T['operation'])
        encode(program.schemas.internal, message, `unknown of the operation under '${key}'`)
        mailbox.push({ _tag: 'Internal', key, incarnation, message })
        outputs.push({ _tag: 'Recorded', key, incarnation })
      } else {
        running[key] = { kind: kindOf(work), incarnation }
        outputs.push(startWork(activated, key, incarnation, work))
      }
    }
    return { machine: { ...activated, stored: { ...stored, mailbox }, running }, outputs }
  } catch (cause) {
    return suspend({ ...before, program }, { cause, on: before.stored.suspension?.on ?? { _tag: 'Activation' } })
  }
}

export type Start<T extends Types> =
  | Readonly<{ _tag: 'Created' } & Transition<T>>
  /** `init`, `durable`, `project` or an index died on the first state: nothing is stored. */
  | Readonly<{ _tag: 'Defect'; cause: unknown }>

/** Creates the entity `id` from its flags, answers the request `Created`, and activates it. */
export const start = <T extends Types>(
  program: Program<T>,
  id: string,
  flags: T['flags'],
  at: DateTime.Utc,
  request: Readonly<{ requestId: string; from: Origin<T['sender']> }>,
): Start<T> => {
  let state: T['state']
  let work: Work<T>
  try {
    state = program.init(flags, at)
    work = admitted(program, state)
  } catch (cause) {
    return { _tag: 'Defect', cause }
  }
  const stored: Stored<T> = {
    name: program.name,
    id,
    state,
    keys: renew(program, {}, {}, work),
    mailbox: [],
    replies: {},
    creation: requestKey(program, request.from, request.requestId),
    suspension: null,
  }
  const created: Machine<T> = { program, stored, running: {} }
  const { machine, outputs } = activate(created, created, program, () => false)
  const reply: Output<T> = { _tag: 'Replied', ...request, reply: { _tag: 'Created' } }
  return { _tag: 'Created', machine, outputs: [reply, ...outputs] }
}

/**
 * Suspends the entity, and answers `Suspended` to every caller whose message waits in the mailbox: it has no reply
 * yet, and gets one by retrying once the entity is resumed (decision 0023).
 */
const suspend = <T extends Types>(machine: Machine<T>, suspension: Suspension): Transition<T> => ({
  machine: { ...machine, stored: { ...machine.stored, suspension }, running: {} },
  outputs: [
    { _tag: 'Suspended', cause: suspension.cause },
    ...machine.stored.mailbox.flatMap((envelope): ReadonlyArray<Output<T>> =>
      envelope._tag === 'Inbound'
        ? [{ _tag: 'Replied', requestId: envelope.requestId, from: envelope.from, reply: { _tag: 'Suspended' } }]
        : []
    ),
  ],
})

const receive = <T extends Types>(
  machine: Machine<T>,
  event: Extract<Event<T>, { _tag: 'Receive' }>,
): Transition<T> => {
  const { stored } = machine
  const { requestId, from } = event
  const request = requestKey(machine.program, from, requestId)
  // A stored reply is read from storage: a suspended entity gives it too.
  const reply = stored.replies[request]
  if (reply !== undefined) return { machine, outputs: [{ _tag: 'Replied', requestId, from, reply }] }
  // Queued or not, a message has no reply yet: its caller retries once the entity is resumed (decision 0023).
  if (stored.suspension !== null) {
    return { machine, outputs: [{ _tag: 'Replied', requestId, from, reply: { _tag: 'Suspended' } }] }
  }
  // A retry of a message still in the mailbox waits for its reply.
  if (
    stored.mailbox.some((envelope) =>
      envelope._tag === 'Inbound' && requestKey(machine.program, envelope.from, envelope.requestId) === request
    )
  ) {
    return { machine, outputs: [] }
  }
  const envelope: Envelope<T> = { _tag: 'Inbound', requestId, message: event.message, from: event.from }
  return { machine: { ...machine, stored: { ...stored, mailbox: [...stored.mailbox, envelope] } }, outputs: [] }
}

/**
 * Records the message of the work under way under `key` in `incarnation`, if it is the work of that kind. An
 * operation's message that does not encode cannot be stored, and is the operation's defect (decision 0040).
 */
const record = <T extends Types>(
  machine: Machine<T>,
  kind: Running['kind'],
  key: string,
  incarnation: number,
  message: (work: Durable<T['operation'], T['internal']>) => T['internal'],
): Transition<T> => {
  const running = machine.running[key]
  const work = machine.stored.keys[key]?.work
  if (running === undefined || running.kind !== kind || running.incarnation !== incarnation || work === undefined) {
    return { machine, outputs: [{ _tag: 'Dropped', key, incarnation }] }
  }
  const recorded = message(work)
  if (kind === 'Operation') {
    try {
      encode(machine.program.schemas.internal, recorded, `message of the operation under '${key}'`)
    } catch (cause) {
      return suspend(machine, { cause, on: { _tag: 'Operation', key, incarnation } })
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
const handle = <T extends Types>(machine: Machine<T>, at: DateTime.Utc): Transition<T> => {
  const { program, stored } = machine
  const [head, ...rest] = stored.mailbox
  if (stored.suspension !== null || head === undefined) return { machine, outputs: [] }
  try {
    if (head._tag === 'Internal' && !holds(stored, head.key, head.incarnation)) {
      return {
        machine: { ...machine, stored: { ...stored, mailbox: rest } },
        outputs: [{ _tag: 'Dropped', key: head.key, incarnation: head.incarnation }],
      }
    }
    const from: Origin<T['sender']> = head._tag === 'Inbound' ? head.from : { _tag: 'Self' }
    const result = program.update(head.message, { at, from })(stored.state)
    if (isRejected(result)) {
      if (head._tag === 'Internal') {
        throw new InvariantDefect({ reason: `update rejected the message of the work under '${head.key}'` })
      }
      const reply = { _tag: 'Rejected', reason: reasonOf(result) } as const
      if (reply.reason !== null) encode(program.schemas.rejection, reply.reason, 'reason of the rejection')
      const replies = { ...stored.replies, [requestKey(program, head.from, head.requestId)]: reply }
      return {
        machine: { ...machine, stored: { ...stored, mailbox: rest, replies } },
        outputs: [{ _tag: 'Replied', requestId: head.requestId, from: head.from, reply }],
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
      if (isSame(work, after[key])) continue
      // An operation leaves only through its completion, and does not change while it runs (decisions 0005,
      // 0018); a timer has done nothing yet.
      if (!isTimer(work)) {
        const next = after[key]
        throw new InvariantDefect({
          reason: next === undefined || isTimer(next)
            ? `the step dropped the operation under '${key}' before its completion`
            : `the step changed the operation under '${key}' before its completion`,
        })
      }
      const armed = running[key]
      if (armed !== undefined) {
        delete running[key]
        outputs.push({ _tag: 'Disarmed', key, incarnation: armed.incarnation })
      }
    }
    for (const [key, work] of Object.entries(after)) {
      const was = previous[key]
      if (was !== undefined && isSame(was, work)) continue
      const incarnation = keys[key]?.incarnation ?? 0
      running[key] = { kind: kindOf(work), incarnation }
      outputs.push(startWork(machine, key, incarnation, work))
    }
    const replies = head._tag === 'Inbound'
      ? { ...stored.replies, [requestKey(program, head.from, head.requestId)]: { _tag: 'Accepted' } as const }
      : stored.replies
    if (head._tag === 'Inbound') {
      outputs.unshift({ _tag: 'Replied', requestId: head.requestId, from: head.from, reply: { _tag: 'Accepted' } })
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
  } catch (cause) {
    return suspend(machine, { cause, on: { _tag: 'Message' } })
  }
}

/**
 * Activates a suspended entity again, as after a crash, perhaps with a fixed program. A program whose `durable`,
 * `project` or index dies on the stored state, or that changes an operation under way, leaves it suspended, with
 * that cause.
 */
const resume = <T extends Types>(machine: Machine<T>, fixed: Program<T> | undefined): Transition<T> => {
  if (machine.stored.suspension === null) return { machine, outputs: [] }
  const unsuspended = { ...machine, stored: { ...machine.stored, suspension: null } }
  return activate(machine, unsuspended, fixed ?? machine.program, () => true)
}

/**
 * Drops the inbound message a suspended entity died on, storing no reply, and resumes it (decision 0014). An
 * internal message is not discarded: the state before it still holds its work, so an operation would run again
 * under another idempotency key, and a timer whose time has passed would fire again at once. Only a program that
 * handles it gets the entity past it (decisions 0041, 0044).
 */
const discard = <T extends Types>(machine: Machine<T>): Transition<T> => {
  const { stored } = machine
  const [head, ...rest] = stored.mailbox
  if (stored.suspension?.on._tag !== 'Message' || head?._tag !== 'Inbound') return { machine, outputs: [] }
  return activate(
    machine,
    { ...machine, stored: { ...stored, mailbox: rest, suspension: null } },
    machine.program,
    () => true,
  )
}

export const step = <T extends Types>(machine: Machine<T>, event: Event<T>): Transition<T> => {
  switch (event._tag) {
    case 'Receive':
      return receive(machine, event)
    case 'Create': {
      // Read from storage, as a stored reply: a suspended entity answers it too.
      const { requestId, from } = event
      const reply: Creation = requestKey(machine.program, from, requestId) === machine.stored.creation
        ? { _tag: 'Created' }
        : { _tag: 'AlreadyExists' }
      return { machine, outputs: [{ _tag: 'Replied', requestId, from, reply }] }
    }
    case 'Complete':
      return record(machine, 'Operation', event.key, event.incarnation, () => event.message)
    case 'Fire':
      return record(machine, 'Timer', event.key, event.incarnation, (work) =>
        // `record` checked the kind of the work under way: the key is a timer in the stored state too.
        (work as Timer<T['internal']>).message as T['internal'])
    case 'Handle':
      return handle(machine, event.at)
    case 'Die': {
      const { key, incarnation, cause } = event
      const running = machine.running[key]
      return running?.kind === 'Operation' && running.incarnation === incarnation
        ? suspend(machine, { cause, on: { _tag: 'Operation', key, incarnation } })
        : { machine, outputs: [] }
    }
    case 'Restart':
      return activate(machine, { ...machine, running: {} }, event.program ?? machine.program, () => true)
    case 'Resume':
      return resume(machine, event.program)
    case 'Discard':
      return discard(machine)
  }
}
