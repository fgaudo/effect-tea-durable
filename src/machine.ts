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
  type IdempotencyKey,
  idempotencyKey,
  InvariantDefect,
  isRejected,
  isTimer,
  type Origin,
  type Program,
  reasonOf,
  type Reply,
  runnerOf,
  type Timer,
  type Types,
} from './program.ts'

/** A message waiting in the mailbox: from a caller, or from the entity's own work in one incarnation. */
export type Envelope<T extends Types> =
  | Readonly<{ _tag: 'Inbound'; requestId: string; message: T['inbound']; from: Origin<T['sender']> }>
  | Readonly<{ _tag: 'Internal'; key: string; incarnation: number; message: T['internal'] }>

/** Why the entity is suspended: a defect while handling the mailbox's first message, or in an operation. */
export type Suspension = Readonly<{
  cause: unknown
  on: Readonly<{ _tag: 'Message' }> | Readonly<{ _tag: 'Operation'; key: string; incarnation: number }>
}>

/** The replies stored under request ids: never `NotFound`, which the runtime answers for no entity. */
export type StoredReply<Reason> = Exclude<Reply<Reason>, Readonly<{ _tag: 'NotFound' }>>

/**
 * A request as it is stored and deduplicated. Request ids are chosen by their senders, so another entity's are
 * its own, apart from every other entity's and from the callers' (decision 0015).
 */
export const requestKey = (from: Origin<unknown>, requestId: string): string =>
  JSON.stringify(from._tag === 'Entity' ? [from.entity.name, from.entity.id, requestId] : [requestId])

/** What is stored, and survives a crash. Each event changes it at once or not at all: one transaction. */
export type Stored<T extends Types> = Readonly<{
  state: T['state']
  /** The incarnation of every key ever returned by `durable`, present or not. */
  incarnations: Readonly<Record<string, number>>
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
  id: string
  stored: Stored<T>
  /** What the process is doing, lost in a crash. */
  running: Readonly<Record<string, Running>>
}>

export type Event<T extends Types> =
  /** An inbound message arrives, with the caller's request id. */
  | Readonly<{ _tag: 'Receive'; requestId: string; message: T['inbound']; from: Origin<T['sender']> }>
  /** A request to create the entity, which exists. Its flags do not matter (decision 0012). */
  | Readonly<{ _tag: 'Create'; requestId: string; from: Origin<unknown> }>
  /** An operation's effect ends with its message, recorded in the mailbox. */
  | Readonly<{ _tag: 'Complete'; key: string; incarnation: number; message: T['internal'] }>
  /** A timer's time comes, and its message is recorded in the mailbox. */
  | Readonly<{ _tag: 'Fire'; key: string; incarnation: number }>
  /** The mailbox's first message is handled, at `at`: one step. */
  | Readonly<{ _tag: 'Handle'; at: DateTime.Utc }>
  /** An operation dies with a defect. */
  | Readonly<{ _tag: 'Die'; key: string; incarnation: number; cause: unknown }>
  /** The process dies, and the entity is activated again from what was stored. */
  | Readonly<{ _tag: 'Restart' }>
  /** An operator resumes a suspended entity, perhaps with a fixed program. */
  | Readonly<{ _tag: 'Resume'; program?: Program<T> }>
  /** An operator discards the message a suspended entity died on, and resumes it. */
  | Readonly<{ _tag: 'Discard' }>

export type Output<T extends Types> =
  | Readonly<{
    _tag: 'Replied'
    requestId: string
    from: Origin<unknown>
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

export const idempotencyKeyOf = <T extends Types>(machine: Machine<T>, key: string, incarnation: number) =>
  idempotencyKey({ name: machine.program.name, id: machine.id }, key, incarnation)

type Work<T extends Types> = Readonly<Record<string, Durable<T['operation'], T['internal']>>>

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
 * Starts what the stored state says, with nothing under way: the work under each key, unless its message is
 * already in the mailbox. An at-most-once operation that may have run before (after a crash, or a suspension)
 * may have acted, so its `unknown` is recorded instead of running it again.
 */
const activate = <T extends Types>(machine: Machine<T>, mayHaveRun: (key: string) => boolean): Transition<T> => {
  const { stored } = machine
  if (stored.suspension !== null) return { machine: { ...machine, running: {} }, outputs: [] }
  const running: Record<string, Running> = {}
  const mailbox = [...stored.mailbox]
  const outputs: Array<Output<T>> = []
  for (const [key, work] of Object.entries(machine.program.durable(stored.state))) {
    const incarnation = stored.incarnations[key] ?? 0
    if (isQueued(stored, key, incarnation)) continue
    const runner = isTimer(work) ? null : runnerOf(machine.program, work)
    if (mayHaveRun(key) && runner?.delivery === 'AtMostOnce') {
      mailbox.push({ _tag: 'Internal', key, incarnation, message: runner.unknown(work as T['operation']) })
      outputs.push({ _tag: 'Recorded', key, incarnation })
    } else {
      running[key] = { kind: kindOf(work), incarnation }
      outputs.push(startWork(machine, key, incarnation, work))
    }
  }
  return { machine: { ...machine, stored: { ...stored, mailbox }, running }, outputs }
}

export type Start<T extends Types> =
  | Readonly<{ _tag: 'Created' } & Transition<T>>
  /** `init`, `durable` or `project` died on the first state: nothing is stored. */
  | Readonly<{ _tag: 'Defect'; cause: unknown }>

/** Creates the entity `id` from its flags, answers the request `Created`, and activates it. */
export const start = <T extends Types>(
  program: Program<T>,
  id: string,
  flags: T['flags'],
  at: DateTime.Utc,
  request: Readonly<{ requestId: string; from: Origin<unknown> }>,
): Start<T> => {
  let state: T['state']
  let work: Work<T>
  try {
    state = program.init(flags, at)
    work = program.durable(state)
    program.project(state)
  } catch (cause) {
    return { _tag: 'Defect', cause }
  }
  const incarnations = Object.fromEntries(Object.keys(work).map((key) => [key, 1]))
  const creation = requestKey(request.from, request.requestId)
  const stored: Stored<T> = { state, incarnations, mailbox: [], replies: {}, creation, suspension: null }
  const { machine, outputs } = activate({ program, id, stored, running: {} }, () => false)
  const created: Output<T> = { _tag: 'Replied', ...request, reply: { _tag: 'Created' } }
  return { _tag: 'Created', machine, outputs: [created, ...outputs] }
}

const suspend = <T extends Types>(machine: Machine<T>, suspension: Suspension): Transition<T> => ({
  machine: { ...machine, stored: { ...machine.stored, suspension }, running: {} },
  outputs: [{ _tag: 'Suspended', cause: suspension.cause }],
})

const receive = <T extends Types>(
  machine: Machine<T>,
  event: Extract<Event<T>, { _tag: 'Receive' }>,
): Transition<T> => {
  const { stored } = machine
  const { requestId, from } = event
  const request = requestKey(from, requestId)
  // A stored reply is read from storage: a suspended entity gives it too.
  const reply = stored.replies[request]
  if (reply !== undefined) return { machine, outputs: [{ _tag: 'Replied', requestId, from, reply }] }
  if (stored.suspension !== null) {
    return { machine, outputs: [{ _tag: 'Replied', requestId, from, reply: { _tag: 'Suspended' } }] }
  }
  // A retry of a message still in the mailbox waits for its reply.
  if (
    stored.mailbox.some((envelope) =>
      envelope._tag === 'Inbound' && requestKey(envelope.from, envelope.requestId) === request
    )
  ) {
    return { machine, outputs: [] }
  }
  const envelope: Envelope<T> = { _tag: 'Inbound', requestId, message: event.message, from: event.from }
  return { machine: { ...machine, stored: { ...stored, mailbox: [...stored.mailbox, envelope] } }, outputs: [] }
}

/** Records the message of the work under way under `key` in `incarnation`, if it is the work of that kind. */
const record = <T extends Types>(
  machine: Machine<T>,
  kind: Running['kind'],
  key: string,
  incarnation: number,
  message: (work: Durable<T['operation'], T['internal']>) => T['internal'],
): Transition<T> => {
  const running = machine.running[key]
  const work = machine.program.durable(machine.stored.state)[key]
  if (running === undefined || running.kind !== kind || running.incarnation !== incarnation || work === undefined) {
    return { machine, outputs: [{ _tag: 'Dropped', key, incarnation }] }
  }
  const { [key]: _, ...others } = machine.running
  const envelope: Envelope<T> = { _tag: 'Internal', key, incarnation, message: message(work) }
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
    const before = program.durable(stored.state)
    if (
      head._tag === 'Internal' &&
      (before[head.key] === undefined || stored.incarnations[head.key] !== head.incarnation)
    ) {
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
      const replies = { ...stored.replies, [requestKey(head.from, head.requestId)]: reply }
      return {
        machine: { ...machine, stored: { ...stored, mailbox: rest, replies } },
        outputs: [{ _tag: 'Replied', requestId: head.requestId, from: head.from, reply }],
      }
    }
    const state: T['state'] = result
    const after = program.durable(state)
    program.project(state)

    // The work whose message is handled is done: its key counts as gone (decision 0008).
    const previous: Record<string, Durable<T['operation'], T['internal']>> = { ...before }
    if (head._tag === 'Internal') delete previous[head.key]

    const incarnations = { ...stored.incarnations }
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
      const incarnation = (incarnations[key] ?? 0) + 1
      incarnations[key] = incarnation
      running[key] = { kind: kindOf(work), incarnation }
      outputs.push(startWork(machine, key, incarnation, work))
    }
    const replies = head._tag === 'Inbound'
      ? { ...stored.replies, [requestKey(head.from, head.requestId)]: { _tag: 'Accepted' } as const }
      : stored.replies
    if (head._tag === 'Inbound') {
      outputs.unshift({ _tag: 'Replied', requestId: head.requestId, from: head.from, reply: { _tag: 'Accepted' } })
    }
    return {
      machine: { ...machine, stored: { ...stored, state, incarnations, mailbox: rest, replies }, running },
      outputs,
    }
  } catch (cause) {
    const suspended = suspend(machine, { cause, on: { _tag: 'Message' } })
    return head._tag === 'Inbound'
      ? {
        machine: suspended.machine,
        outputs: [
          ...suspended.outputs,
          { _tag: 'Replied', requestId: head.requestId, from: head.from, reply: { _tag: 'Suspended' } },
        ],
      }
      : suspended
  }
}

/**
 * Activates a suspended entity again, as after a crash, perhaps with a fixed program. A program whose `durable` or
 * `project` dies on the stored state leaves it suspended, with that cause.
 */
const resume = <T extends Types>(machine: Machine<T>, fixed: Program<T> | undefined): Transition<T> => {
  const program = fixed ?? machine.program
  const { suspension } = machine.stored
  try {
    program.durable(machine.stored.state)
    program.project(machine.stored.state)
  } catch (cause) {
    return suspension === null ? { machine, outputs: [] } : suspend({ ...machine, program }, { ...suspension, cause })
  }
  return activate({ ...machine, program, stored: { ...machine.stored, suspension: null } }, () => true)
}

/** Ends the message a suspended entity died on as if it had been handled, and resumes it (decision 0008). */
const discard = <T extends Types>(machine: Machine<T>): Transition<T> => {
  const { program, stored } = machine
  const [head, ...rest] = stored.mailbox
  if (stored.suspension?.on._tag !== 'Message' || head === undefined) return { machine, outputs: [] }
  const incarnations = { ...stored.incarnations }
  // The work whose message is discarded is done, and new work if its key is still in the state: it never ran.
  const renewed = head._tag === 'Internal' &&
      program.durable(stored.state)[head.key] !== undefined &&
      incarnations[head.key] === head.incarnation
    ? head.key
    : null
  if (renewed !== null) incarnations[renewed] = (incarnations[renewed] ?? 0) + 1
  return activate(
    { ...machine, stored: { ...stored, incarnations, mailbox: rest, suspension: null } },
    (key) => key !== renewed,
  )
}

export const step = <T extends Types>(machine: Machine<T>, event: Event<T>): Transition<T> => {
  switch (event._tag) {
    case 'Receive':
      return receive(machine, event)
    case 'Create': {
      // Read from storage, as a stored reply: a suspended entity answers it too.
      const { requestId, from } = event
      const reply: Creation = requestKey(from, requestId) === machine.stored.creation
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
      return activate({ ...machine, running: {} }, () => true)
    case 'Resume':
      return machine.stored.suspension === null ? { machine, outputs: [] } : resume(machine, event.program)
    case 'Discard':
      return discard(machine)
  }
}
