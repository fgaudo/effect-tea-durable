/**
 * The design's guarantees, checked on the pure machine under random sequences of events, crashes included: what
 * a caller is answered, what `update` is given, what runs, and what survives a crash or a defect.
 */
import { describe, expect, test } from 'bun:test'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Equal from 'effect/Equal'
import fc from 'fast-check'
import * as Machine from './machine.ts'
import {
  defect,
  type IdempotencyKey,
  InvariantDefect,
  isTimer,
  noWork,
  operation,
  type Origin,
  type Program,
  reject,
  rejectWith,
  runnerOf,
  timer,
} from './program.ts'

// A program whose work is chosen by its callers: `a` is idempotent, `b` at most once, `c` at least once, `t` a
// timer, whose time moves with each message applied. `Break` is a bug, and dropping or changing an operation under
// way (`Retune` changes `a`) is a defect the machine finds.
const keys = ['a', 'b', 'c', 't'] as const
type Key = (typeof keys)[number]

type State = Readonly<{ want: ReadonlyArray<Key>; applied: ReadonlyArray<string>; tune: number }>

type Inbound =
  | Readonly<{ _tag: 'Want'; key: Key; on: boolean; nonce: string }>
  | Readonly<{ _tag: 'Refuse'; nonce: string }>
  | Readonly<{ _tag: 'Break'; nonce: string }>
  | Readonly<{ _tag: 'Retune'; nonce: string }>

type Internal =
  /** `Again` keeps the key, so new work starts; `Break` is a bug. */
  | Readonly<{ _tag: 'Done'; key: Key; then: 'End' | 'Again' | 'Break' }>
  | Readonly<{ _tag: 'Unknown'; key: Key }>
  | Readonly<{ _tag: 'Rang'; key: Key }>

type T = {
  state: State
  flags: null
  inbound: Inbound
  internal: Internal
  operation: Readonly<{ _tag: 'A'; tune: number }> | Readonly<{ _tag: 'B' | 'C'; key: Key }>
  rejection: 'Refused'
  sender: 'caller'
  projection: number
  index: never
  services: never
}

const notHeld = 'an internal message for a key the state does not hold'

const epoch = DateTime.makeUnsafe(0)

const done = (key: Key): Internal => ({ _tag: 'Done', key, then: 'End' })

const program: Program<T> = {
  name: 'Toy',
  // The machine never encodes: the schemas are the runtime's.
  schemas: {} as Program<T>['schemas'],
  init: () => ({ want: keys, applied: [], tune: 0 }),
  update: (message) => (state) => {
    switch (message._tag) {
      case 'Want': {
        const others = state.want.filter((key) => key !== message.key)
        const want = message.on ? keys.filter((key) => key === message.key || others.includes(key)) : others
        return { ...state, want, applied: [...state.applied, message.nonce] }
      }
      case 'Retune':
        return { ...state, applied: [...state.applied, message.nonce], tune: state.tune + 1 }
      case 'Refuse':
        return state.applied.length % 2 === 0 ? rejectWith('Refused') : reject
      case 'Break':
        return defect('broken')
      default:
        return !state.want.includes(message.key)
          ? defect(notHeld)
          : message._tag === 'Done' && message.then === 'Break'
          ? defect('broken')
          : message._tag === 'Done' && message.then === 'Again'
          ? state
          : { ...state, want: state.want.filter((key) => key !== message.key) }
    }
  },
  durable: (state) =>
    state.want.length === 0 ? noWork : Object.fromEntries(state.want.map((key) => [
      key,
      key === 'a'
        ? { _tag: 'A', tune: state.tune } as const
        : key === 'b'
        ? { _tag: 'B', key } as const
        : key === 'c'
        ? { _tag: 'C', key } as const
        : timer<Internal>(DateTime.makeUnsafe(state.applied.length), { _tag: 'Rang', key: 't' }),
    ])),
  operations: {
    A: operation(() => Effect.succeed(done('a'))),
    B: operation.atMostOnce(({ key }) => Effect.succeed(done(key)), ({ key }): Internal => ({ _tag: 'Unknown', key })),
    C: operation.atLeastOnce(({ key }) => Effect.succeed(done(key))),
  },
  project: (state) => state.want.length,
  indexes: {},
}

// A new version of the program that tunes `a` differently: a deploy that changes `a` while it runs is a defect.
const retuned: Program<T> = {
  ...program,
  durable: (state) => {
    const work = program.durable(state)
    return work['a'] === undefined ? work : { ...work, a: { _tag: 'A', tune: state.tune + 10 } }
  },
}

// A new version of the program that runs `b` at least once: a deploy that changes it while it runs is a defect.
const redelivered: Program<T> = {
  ...program,
  operations: { ...program.operations, B: operation.atLeastOnce(({ key }) => Effect.succeed(done(key))) },
}

// A new version of the program that runs `t` as an at-most-once operation instead of a timer: at an activation the
// key is new work, which never ran, so it starts instead of delivering `unknown`.
const retimed: Program<T> = {
  ...program,
  durable: (state) => {
    const work = program.durable(state)
    return work['t'] === undefined ? work : { ...work, t: { _tag: 'B', key: 't' } as const }
  },
}

const versions = { first: program, retuned, redelivered, retimed } as const

/** The program a restart or a resumption brings: the one running, or one of the versions. */
type Version = 'same' | keyof typeof versions

const versionOf = (version: Version) => (version === 'same' ? undefined : versions[version])

type Command =
  | Readonly<{ _tag: 'Send'; kind: Inbound['_tag']; key: Key; on: boolean }>
  | Readonly<{ _tag: 'Retry'; pick: number }>
  /** Creates the entity again, with the request that created it or another. */
  | Readonly<{ _tag: 'Create'; again: boolean }>
  | Readonly<{ _tag: 'Complete'; pick: number; then: 'End' | 'Again' | 'Break' }>
  | Readonly<{ _tag: 'Stale'; fire: boolean; key: Key; incarnation: number }>
  /** Drops a key and brings it back at once: a firing already in the mailbox is then stale. */
  | Readonly<{ _tag: 'Toggle'; key: Key }>
  | Readonly<{ _tag: 'Fire'; pick: number }>
  | Readonly<{ _tag: 'Handle' }>
  | Readonly<{ _tag: 'Die'; pick: number }>
  | Readonly<{ _tag: 'Restart'; version: Version }>
  | Readonly<{ _tag: 'Resume'; version: Version }>
  | Readonly<{ _tag: 'Discard' }>

const key = fc.constantFrom(...keys)
const version = fc.constantFrom<Version>('same', 'same', 'same', 'first', 'retuned', 'redelivered', 'retimed')
const pick = fc.nat()

const command: fc.Arbitrary<Command> = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.record({
      _tag: fc.constant('Send' as const),
      kind: fc.constantFrom(
        'Want' as const,
        'Want' as const,
        'Want' as const,
        'Refuse' as const,
        'Break' as const,
        'Retune' as const,
      ),
      key,
      on: fc.boolean(),
    }),
  },
  { weight: 1, arbitrary: fc.record({ _tag: fc.constant('Retry' as const), pick }) },
  { weight: 1, arbitrary: fc.record({ _tag: fc.constant('Create' as const), again: fc.boolean() }) },
  {
    weight: 3,
    arbitrary: fc.record({
      _tag: fc.constant('Complete' as const),
      pick,
      then: fc.constantFrom('End' as const, 'End' as const, 'Again' as const, 'Break' as const),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      _tag: fc.constant('Stale' as const),
      fire: fc.boolean(),
      key,
      incarnation: fc.integer({ min: 0, max: 4 }),
    }),
  },
  { weight: 1, arbitrary: fc.record({ _tag: fc.constant('Toggle' as const), key }) },
  { weight: 2, arbitrary: fc.record({ _tag: fc.constant('Fire' as const), pick }) },
  { weight: 6, arbitrary: fc.constant({ _tag: 'Handle' as const }) },
  { weight: 1, arbitrary: fc.record({ _tag: fc.constant('Die' as const), pick }) },
  { weight: 2, arbitrary: fc.record({ _tag: fc.constant('Restart' as const), version }) },
  { weight: 1, arbitrary: fc.record({ _tag: fc.constant('Resume' as const), version }) },
  { weight: 1, arbitrary: fc.constant({ _tag: 'Discard' as const }) },
)

type Toy = Machine.Machine<T>

const runningOf = (machine: Toy, kind: Machine.Running['kind']) =>
  Object.entries(machine.running).filter(([, running]) => running.kind === kind)

const at = DateTime.makeUnsafe(1_000)

type Receive = Extract<Machine.Event<T>, { _tag: 'Receive' }>

const caller = { _tag: 'Caller', sender: 'caller' } as const

const creation = { requestId: 'creation', from: caller } as const

const receive = (requests: Array<Receive>, message: (nonce: string) => Inbound): Receive => {
  const event: Receive = {
    _tag: 'Receive',
    requestId: `r${requests.length}`,
    message: message(`n${requests.length}`),
    from: caller,
  }
  requests.push(event)
  return event
}

/** Turns a command into events of the machine as it is: none when it has nothing to act on. */
const toEvents = (machine: Toy, command: Command, requests: Array<Receive>): ReadonlyArray<Machine.Event<T>> => {
  const event = toEvent(machine, command, requests)
  return command._tag === 'Toggle'
    ? [
      receive(requests, (nonce) => ({ _tag: 'Want', key: command.key, on: false, nonce })),
      receive(requests, (nonce) => ({ _tag: 'Want', key: command.key, on: true, nonce })),
    ]
    : event === null
    ? []
    : [event]
}

const toEvent = (machine: Toy, command: Command, requests: Array<Receive>): Machine.Event<T> | null => {
  switch (command._tag) {
    case 'Send':
      return receive(requests, (nonce) =>
        command.kind === 'Want'
          ? { _tag: 'Want', key: command.key, on: command.on, nonce }
          : { _tag: command.kind, nonce })
    case 'Toggle':
      return null
    case 'Retry':
      return requests.length === 0 ? null : requests[command.pick % requests.length] ?? null
    case 'Create':
      return { _tag: 'Create', requestId: command.again ? creation.requestId : `c${requests.length}`, from: caller }
    case 'Complete': {
      const operations = runningOf(machine, 'Operation')
      const chosen = operations[command.pick % Math.max(operations.length, 1)]
      return chosen === undefined ? null : {
        _tag: 'Complete',
        key: chosen[0],
        incarnation: chosen[1].incarnation,
        message: { _tag: 'Done', key: chosen[0] as Key, then: command.then },
      }
    }
    case 'Stale':
      return command.fire
        ? { _tag: 'Fire', key: command.key, incarnation: command.incarnation }
        : { _tag: 'Complete', key: command.key, incarnation: command.incarnation, message: done(command.key) }
    case 'Fire': {
      const timers = runningOf(machine, 'Timer')
      const chosen = timers[command.pick % Math.max(timers.length, 1)]
      return chosen === undefined ? null : { _tag: 'Fire', key: chosen[0], incarnation: chosen[1].incarnation }
    }
    case 'Handle':
      return { _tag: 'Handle', at }
    case 'Die': {
      const operations = runningOf(machine, 'Operation')
      const chosen = operations[command.pick % Math.max(operations.length, 1)]
      return chosen === undefined
        ? null
        : { _tag: 'Die', key: chosen[0], incarnation: chosen[1].incarnation, cause: 'an operation died' }
    }
    case 'Restart':
    case 'Resume': {
      const fixed = versionOf(command.version)
      return fixed === undefined ? { _tag: command._tag } : { _tag: command._tag, program: fixed }
    }
    default:
      return command
  }
}

type Traced = Readonly<{ event: Machine.Event<T>; before: Toy; after: Toy; outputs: ReadonlyArray<Machine.Output<T>> }>

const run = (commands: ReadonlyArray<Command>) => {
  const created = Machine.start(program, 'toy', null, epoch, creation)
  if (created._tag === 'Defect') throw created.cause
  let machine = created.machine
  const requests: Array<Receive> = []
  // Creation, as an activation that found nothing.
  const trace: Array<Traced> = [
    { event: { _tag: 'Restart' }, before: machine, after: machine, outputs: created.outputs },
  ]
  const apply = (event: Machine.Event<T>) => {
    const { machine: after, outputs } = Machine.step(machine, event)
    trace.push({ event, before: machine, after, outputs })
    machine = after
  }
  for (const command of commands) {
    for (const event of toEvents(machine, command, requests)) apply(event)
  }
  // Then everything ends: bugs are discarded, operations complete, timers fire, and the mailbox is handled. A
  // suspended entity is discarded or resumed, by each version in turn, until one keeps what runs.
  const fixes = [program, retuned, redelivered, retimed] as const
  let tried = 0
  for (let turn = 0; turn < 200; turn++) {
    const { stored } = machine
    const operation = runningOf(machine, 'Operation')[0]
    const firing = runningOf(machine, 'Timer')[0]
    if (stored.suspension !== null) {
      // A discard needs a program that keeps what runs: on its failure, the next version is brought.
      const discarding = stored.suspension.on._tag === 'Message' && trace.at(-1)?.event._tag !== 'Discard'
      apply(discarding ? { _tag: 'Discard' } : { _tag: 'Resume', program: fixes[tried++ % fixes.length] ?? program })
    } else if (stored.mailbox.length > 0) apply({ _tag: 'Handle', at })
    else if (operation !== undefined) {
      const [key, { incarnation }] = operation
      apply({ _tag: 'Complete', key, incarnation, message: done(key as Key) })
    } else if (firing !== undefined) apply({ _tag: 'Fire', key: firing[0], incarnation: firing[1].incarnation })
    else break
  }
  return { machine, trace, requests }
}

type Run = ReturnType<typeof run>

const property = (check: (run: Run) => void, options?: fc.Parameters<[ReadonlyArray<Command>]>) =>
  fc.assert(fc.property(fc.array(command, { maxLength: 40 }), (commands) => check(run(commands))), {
    numRuns: 300,
    ...options,
  })

const kindOf = (work: unknown): Machine.Running['kind'] => (isTimer(work) ? 'Timer' : 'Operation')

const queued = (machine: Toy, key: string, incarnation: number) =>
  machine.stored.mailbox.some((envelope) =>
    envelope._tag === 'Internal' && envelope.key === key && envelope.incarnation === incarnation
  )

describe('the machine', () => {
  test('a request is answered the same each time, and applied once', () =>
    property(({ trace, machine }) => {
      const replies = new Map<string, unknown>()
      for (const { outputs } of trace) {
        for (const output of outputs) {
          if (output._tag !== 'Replied' || output.reply._tag === 'Suspended') continue
          const request = Machine.requestKey(output.from, output.requestId)
          const first = replies.get(request)
          if (first === undefined) replies.set(request, output.reply)
          else expect<unknown>(output.reply).toEqual(first)
        }
      }
      expect(new Set(machine.stored.state.applied).size).toBe(machine.stored.state.applied.length)
    }))

  test('update is given an internal message only while its work is in the state, once per incarnation', () =>
    property(({ trace }) => {
      const delivered = new Set<string>()
      for (const { before, outputs } of trace) {
        for (const output of outputs) {
          if (output._tag === 'Suspended') {
            expect(output.cause instanceof InvariantDefect && output.cause.reason === notHeld).toBe(false)
          }
          if (output._tag !== 'Delivered') continue
          const id = `${output.key}@${output.incarnation}`
          expect(delivered.has(id)).toBe(false)
          delivered.add(id)
          expect(before.stored.keys[output.key]?.incarnation).toBe(output.incarnation)
        }
      }
    }))

  test('what runs is what the stored state says, unless its message is already in the mailbox', () =>
    property(({ trace }) => {
      for (const { after } of trace) {
        if (after.stored.suspension !== null) {
          expect(after.running).toEqual({})
          continue
        }
        const work = Machine.workOf(after.stored)
        for (const [key, durable] of Object.entries(work)) {
          const incarnation = after.stored.keys[key]?.incarnation ?? -1
          if (!queued(after, key, incarnation)) {
            expect(after.running[key]).toEqual({ kind: kindOf(durable), incarnation })
          }
        }
        for (const [key, running] of Object.entries(after.running)) {
          expect(work[key] === undefined ? undefined : kindOf(work[key])).toBe(running.kind)
          expect(after.stored.keys[key]?.incarnation).toBe(running.incarnation)
        }
      }
    }))

  test('a timer is armed at the time the stored state says', () =>
    property(({ trace }) => {
      const armedAt = new Map<string, DateTime.Utc>()
      for (const { after, outputs } of trace) {
        for (const output of outputs) {
          if (output._tag === 'Armed') armedAt.set(`${output.key}@${output.incarnation}`, output.timer.at)
        }
        const work = Machine.workOf(after.stored)
        for (const [key, running] of Object.entries(after.running)) {
          const timer = work[key]
          if (running.kind !== 'Timer' || !isTimer(timer)) continue
          const armed = armedAt.get(`${key}@${running.incarnation}`)
          expect(armed !== undefined && DateTime.Equivalence(armed, timer.at)).toBe(true)
        }
      }
    }))

  // So an operation restarted after a crash, rebuilt from the stored state, is the one that was running.
  test('an operation under way is the one the stored state holds', () =>
    property(({ trace }) => {
      const startedWith = new Map<string, unknown>()
      for (const { after, outputs } of trace) {
        for (const output of outputs) {
          if (output._tag === 'Started') startedWith.set(`${output.key}@${output.incarnation}`, output.operation)
        }
        const work = Machine.workOf(after.stored)
        for (const [key, running] of Object.entries(after.running)) {
          if (running.kind !== 'Operation') continue
          expect(Equal.equals(startedWith.get(`${key}@${running.incarnation}`), work[key])).toBe(true)
        }
      }
    }))

  test('an operation leaves the state only through its completion', () =>
    property(({ trace }) => {
      for (const { event, before, after, outputs } of trace) {
        // An operator who discards a completion ends its work by hand.
        if (event._tag === 'Discard') continue
        const next = Machine.workOf(after.stored)
        for (const [key, work] of Object.entries(Machine.workOf(before.stored))) {
          const incarnation = before.stored.keys[key]?.incarnation ?? -1
          const kept = next[key] !== undefined && after.stored.keys[key]?.incarnation === incarnation
          if (isTimer(work) || kept) continue
          expect(outputs).toContainEqual({ _tag: 'Delivered', key, incarnation })
        }
      }
    }))

  // At most once as the program that started it declared, whatever a later version says.
  test('an at-most-once operation is started once per incarnation, and a restarted one gets the same key', () =>
    property(({ trace }) => {
      const started = new Map<string, IdempotencyKey>()
      const atMostOnce = new Set<string>()
      for (const { after, outputs } of trace) {
        for (const output of outputs) {
          if (output._tag !== 'Started') continue
          const id = `${output.key}@${output.incarnation}`
          const known = started.get(id)
          if (known === undefined && runnerOf(after.program, output.operation).delivery === 'AtMostOnce') {
            atMostOnce.add(id)
          } else expect(atMostOnce.has(id)).toBe(false)
          if (known !== undefined) expect(output.idempotencyKey).toBe(known)
          started.set(id, output.idempotencyKey)
        }
      }
      expect(new Set(started.values()).size).toBe(started.size)
    }))

  // So a payment provider, or another entity's stored reply, never answers one operation for another.
  test('an idempotency key is started for one operation only, and never once its work is done', () =>
    property(({ trace }) => {
      const started = new Map<IdempotencyKey, unknown>()
      const done = new Set<string>()
      for (const { event, before, outputs } of trace) {
        const head = before.stored.mailbox[0]
        if (event._tag === 'Discard' && head?._tag === 'Internal' && outputs.length > 0) {
          done.add(`${head.key}@${head.incarnation}`)
        }
        for (const output of outputs) {
          if (output._tag === 'Delivered') done.add(`${output.key}@${output.incarnation}`)
          if (output._tag !== 'Started') continue
          expect(done.has(`${output.key}@${output.incarnation}`)).toBe(false)
          const known = started.get(output.idempotencyKey)
          if (known !== undefined) expect(Equal.equals(known, output.operation)).toBe(true)
          started.set(output.idempotencyKey, output.operation)
        }
      }
    }))

  // So the runtime may delete a reply another entity's work no longer holds: it never asks for it again.
  test('work that is no longer held never is again, and never starts again', () =>
    property(({ trace }) => {
      const started = new Set<string>()
      const ended = new Set<string>()
      for (const { after, outputs } of trace) {
        for (const output of outputs) {
          if (output._tag !== 'Started') continue
          const id = `${output.key}@${output.incarnation}`
          expect(ended.has(id)).toBe(false)
          started.add(id)
        }
        for (const id of started) {
          const [key = '', incarnation] = id.split('@')
          const held = Machine.holds(after.stored, key, Number(incarnation))
          expect(held && ended.has(id)).toBe(false)
          if (!held) ended.add(id)
        }
      }
    }))

  test('work whose message is recorded never runs again in its incarnation', () =>
    property(({ trace }) => {
      const recorded = new Set<string>()
      for (const { outputs } of trace) {
        for (const output of outputs) {
          if (output._tag !== 'Started' && output._tag !== 'Armed' && output._tag !== 'Recorded') continue
          const id = `${output.key}@${output.incarnation}`
          if (output._tag === 'Recorded') recorded.add(id)
          else expect(recorded.has(id)).toBe(false)
        }
      }
    }))

  test('an unknown is delivered only for an at-most-once operation that started', () =>
    property(({ trace }) => {
      const started = new Set<string>()
      for (const { after, outputs } of trace) {
        for (const output of outputs) {
          if (output._tag === 'Started') started.add(`${output.key}@${output.incarnation}`)
        }
        for (const envelope of after.stored.mailbox) {
          if (envelope._tag === 'Internal' && envelope.message._tag === 'Unknown') {
            expect(started.has(`${envelope.key}@${envelope.incarnation}`)).toBe(true)
          }
        }
      }
    }))

  test('a crash loses nothing stored, and an at-most-once operation under way delivers its unknown', () =>
    property(({ trace }) => {
      for (const { event, before, after } of trace) {
        if (event._tag !== 'Restart' || event.program !== undefined || before === after) continue
        const { mailbox, ...stored } = after.stored
        const { mailbox: previous, ...was } = before.stored
        expect(stored).toEqual(was)
        expect(mailbox.slice(0, previous.length)).toEqual([...previous])
        for (const envelope of mailbox.slice(previous.length)) {
          expect(envelope).toMatchObject({ _tag: 'Internal', message: { _tag: 'Unknown' } })
          if (envelope._tag === 'Internal') {
            expect(before.running[envelope.key]?.incarnation ?? envelope.incarnation).toBe(envelope.incarnation)
          }
        }
      }
    }))

  test('a defect suspends the entity, with its state and its mailbox as they were', () =>
    property(({ trace }) => {
      for (const { before, after, outputs } of trace) {
        if (!outputs.some((output) => output._tag === 'Suspended')) continue
        expect({ ...after.stored, suspension: null }).toEqual({ ...before.stored, suspension: null })
        expect(after.running).toEqual({})
      }
    }))

  test('a suspended entity takes nothing, and runs nothing, until an operator resumes it', () =>
    property(({ trace }) => {
      for (const { event, before, after } of trace) {
        if (before.stored.suspension === null || event._tag === 'Resume' || event._tag === 'Discard') continue
        expect(after.stored).toEqual(before.stored)
        expect(after.running).toEqual({})
      }
    }))

  // So no caller waits on a suspended entity: whether its message is queued or not, it retries (decision 0023).
  test('when the entity suspends, every caller waiting in its mailbox is answered Suspended', () =>
    property(({ trace }) => {
      for (const { after, outputs } of trace) {
        if (!outputs.some((output) => output._tag === 'Suspended')) continue
        for (const envelope of after.stored.mailbox) {
          if (envelope._tag !== 'Inbound') continue
          const { requestId, from } = envelope
          expect(outputs).toContainEqual({ _tag: 'Replied', requestId, from, reply: { _tag: 'Suspended' } })
        }
      }
    }))

  // A request answered `Suspended` while the entity is suspended was never in the mailbox: its caller retries.
  test('once the work ends, every request that reached the mailbox is answered, and nothing is left', () =>
    property(({ machine, trace }) => {
      const waited = new Set<string>()
      const discarded = new Set<string>()
      for (const { event, before, after } of trace) {
        for (const envelope of after.stored.mailbox) {
          if (envelope._tag === 'Inbound') waited.add(Machine.requestKey(envelope.from, envelope.requestId))
        }
        const head = before.stored.mailbox[0]
        if (event._tag === 'Discard' && head?._tag === 'Inbound') {
          discarded.add(Machine.requestKey(head.from, head.requestId))
        }
      }
      expect(machine.stored.suspension).toBeNull()
      expect(machine.stored.mailbox).toEqual([])
      expect(machine.running).toEqual({})
      for (const request of waited) {
        if (!discarded.has(request)) expect(machine.stored.replies[request]).toBeDefined()
      }
    }))

  // The properties would hold for sequences that did nothing: the sequences reach every output.
  test('the sequences reach every output, and every way a message is dropped', () => {
    const reached = new Set<string>()
    property(({ trace }) => {
      for (const { event, outputs } of trace) {
        for (const output of outputs) {
          reached.add(
            output._tag === 'Dropped'
              ? `Dropped on ${event._tag}`
              : output._tag === 'Replied'
              ? `Replied ${output.reply._tag}`
              : output._tag === 'Started'
              ? `Started ${runnerOf(program, output.operation).delivery}`
              : output._tag,
          )
        }
      }
    }, { numRuns: 500, seed: 42 })
    expect([...reached].sort()).toEqual([
      'Armed',
      'Delivered',
      'Disarmed',
      'Dropped on Complete',
      'Dropped on Fire',
      'Dropped on Handle',
      'Recorded',
      'Replied Accepted',
      'Replied AlreadyExists',
      'Replied Created',
      'Replied Rejected',
      'Replied Suspended',
      'Started AtLeastOnce',
      'Started AtMostOnce',
      'Started Idempotent',
      'Suspended',
    ])
  })
})

const nobody = { _tag: 'Caller', sender: null } as const

// The state is the last message, held in an object as every state is (decision 0031), and the work each state
// holds is given: enough to break each check of a step.
type Tiny = {
  state: Readonly<{ last: string }>
  flags: null
  inbound: string
  internal: string
  operation: Readonly<{ _tag: 'Work'; size: number }>
  rejection: never
  sender: null
  projection: string
  index: 'shown'
  services: never
}

type TinyWork = Readonly<
  Record<string, 'operation' | 'larger operation' | 'timer' | 'later timer' | 'other timer'>
>

const tiny = (
  update: (message: string) => string | typeof reject,
  durable: (state: string) => TinyWork,
  project: (state: string) => string = (state) => state,
  name = 'Tiny',
  index: (projection: string) => string = (projection) => projection,
): Program<Tiny> => ({
  name,
  schemas: {} as never,
  init: () => ({ last: 'start' }),
  update: (message) => () => {
    const next = update(message)
    return next === reject ? reject : { last: next }
  },
  durable: ({ last }) =>
    Object.fromEntries(Object.entries(durable(last)).map(([key, kind]) => [
      key,
      kind === 'operation' || kind === 'larger operation'
        ? { _tag: 'Work', size: kind === 'operation' ? 1 : 2 } as const
        : timer(kind === 'later timer' ? at : epoch, kind === 'other timer' ? 'rang again' : 'rang'),
    ])),
  operations: { Work: operation(() => Effect.succeed('done')) },
  project: ({ last }) => project(last),
  indexes: { shown: index },
})

const checked = (...args: Parameters<typeof tiny>) => {
  const created = Machine.start(tiny(...args), 'tiny', null, epoch, { requestId: 'creation', from: nobody })
  if (created._tag === 'Defect') throw created.cause
  return created.machine
}

/** Records a message, and handles it. */
const handled = (machine: Machine.Machine<Tiny>, event: Machine.Event<Tiny>) =>
  Machine.step(Machine.step(machine, event).machine, { _tag: 'Handle', at })

const reasonOfSuspension = (transition: Machine.Transition<Tiny>) => {
  const cause = transition.machine.stored.suspension?.cause
  return cause instanceof InvariantDefect ? cause.reason : cause === undefined ? null : String(cause)
}

describe('the checks of a step', () => {
  const inbound = { _tag: 'Receive', requestId: 'r', message: 'go', from: { _tag: 'Caller', sender: null } } as const

  test('a step that drops an operation before its completion is a defect', () => {
    const machine = checked((message) => message, (state) => (state === 'start' ? { charge: 'operation' } : {}))
    expect(reasonOfSuspension(handled(machine, inbound))).toBe(
      "the step dropped the operation under 'charge' before its completion",
    )
  })

  test('a step may drop a timer, which is disarmed', () => {
    const machine = checked((message) => message, (state) => (state === 'start' ? { deadline: 'timer' } : {}))
    const transition = handled(machine, inbound)
    expect(transition.machine.stored.suspension).toBeNull()
    expect(transition.outputs).toContainEqual({ _tag: 'Disarmed', key: 'deadline', incarnation: 1 })
  })

  test('a timer whose time changes is armed again, as new work', () => {
    const machine = checked(
      (message) => message,
      (state) => (state === 'start' ? { deadline: 'timer' } : { deadline: 'later timer' }),
    )
    const transition = handled(machine, inbound)
    expect(transition.outputs).toContainEqual({ _tag: 'Disarmed', key: 'deadline', incarnation: 1 })
    expect(transition.outputs).toContainEqual(
      expect.objectContaining({ _tag: 'Armed', key: 'deadline', incarnation: 2, timer: timer(at, 'rang') }),
    )
  })

  test('a timer whose message changes is armed again, as new work', () => {
    const machine = checked(
      (message) => message,
      (state) => (state === 'start' ? { deadline: 'timer' } : { deadline: 'other timer' }),
    )
    const transition = handled(machine, inbound)
    expect(transition.outputs).toContainEqual({ _tag: 'Disarmed', key: 'deadline', incarnation: 1 })
    expect(transition.outputs).toContainEqual(
      expect.objectContaining({ _tag: 'Armed', key: 'deadline', incarnation: 2 }),
    )
  })

  test('a step that changes an operation before its completion is a defect', () => {
    const machine = checked(
      (message) => message,
      (state) => (state === 'start' ? { charge: 'operation' } : { charge: 'larger operation' }),
    )
    expect(reasonOfSuspension(handled(machine, inbound))).toBe(
      "the step changed the operation under 'charge' before its completion",
    )
  })

  test('a step that keeps an operation equal by value keeps it running', () => {
    const machine = checked((message) => message, () => ({ charge: 'operation' }))
    const transition = handled(machine, inbound)
    expect(transition.machine.stored.suspension).toBeNull()
    expect(transition.outputs.filter((output) => output._tag === 'Started')).toEqual([])
  })

  test('a key whose timer becomes an operation is new work', () => {
    const machine = checked(
      (message) => message,
      (state) => (state === 'start' ? { work: 'timer' } : { work: 'operation' }),
    )
    const transition = handled(machine, inbound)
    expect(transition.outputs).toContainEqual({ _tag: 'Disarmed', key: 'work', incarnation: 1 })
    expect(transition.outputs).toContainEqual(expect.objectContaining({ _tag: 'Started', key: 'work', incarnation: 2 }))
  })

  test('an operation\'s completion that update rejects is a defect', () => {
    const machine = checked(() => reject, (state) => (state === 'start' ? { charge: 'operation' } : {}))
    const transition = handled(machine, { _tag: 'Complete', key: 'charge', incarnation: 1, message: 'done' })
    expect(reasonOfSuspension(transition)).toBe("update rejected the message of the work under 'charge'")
  })

  test('a state that durable, project or an index dies on is a defect, and is not stored', () => {
    const broken = new Error('broken')
    for (
      const machine of [
        checked((message) => message, (state) => {
          if (state === 'go') throw broken
          return {}
        }),
        checked((message) => message, () => ({}), (state) => {
          if (state === 'go') throw broken
          return state
        }),
        // An index is read where `project` is, and one that dies suspends the entity the same way.
        checked((message) => message, () => ({}), undefined, undefined, (projection) => {
          if (projection === 'go') throw broken
          return projection
        }),
      ]
    ) {
      const transition = handled(machine, inbound)
      expect(transition.machine.stored.suspension?.cause).toBe(broken)
      expect(transition.machine.stored.state).toEqual({ last: 'start' })
      expect(transition.outputs).toContainEqual({
        _tag: 'Replied',
        requestId: 'r',
        from: nobody,
        reply: { _tag: 'Suspended' },
      })
    }
  })
})

describe('a suspended entity', () => {
  const caller = { _tag: 'Caller', sender: null } as const
  const accepted = { _tag: 'Accepted' } as const
  // Accepts `ok`, and dies on `bug`.
  const suspended = () => {
    const machine = checked((message) => (message === 'bug' ? defect('bug') : message), () => ({}))
    const answered = handled(machine, { _tag: 'Receive', requestId: 'first', message: 'ok', from: caller })
    return handled(answered.machine, { _tag: 'Receive', requestId: 'second', message: 'bug', from: caller }).machine
  }

  test('gives the replies it stored, and answers anything else Suspended', () => {
    const machine = suspended()
    expect(Machine.step(machine, { _tag: 'Receive', requestId: 'first', message: 'ok', from: caller }).outputs)
      .toEqual([{ _tag: 'Replied', requestId: 'first', from: caller, reply: { _tag: 'Accepted' } }])
    expect(Machine.step(machine, { _tag: 'Receive', requestId: 'third', message: 'ok', from: caller }).outputs)
      .toEqual([{ _tag: 'Replied', requestId: 'third', from: caller, reply: { _tag: 'Suspended' } }])
    expect(Machine.step(machine, { _tag: 'Create', requestId: 'creation', from: caller }).outputs)
      .toEqual([{ _tag: 'Replied', requestId: 'creation', from: caller, reply: { _tag: 'Created' } }])
  })

  test('answers Suspended every caller waiting, and gives each its reply on a retry once resumed', () => {
    const machine = checked((message) => (message === 'bug' ? defect('bug') : message), () => ({}))
    const receive = (requestId: string, message: string) =>
      ({ _tag: 'Receive', requestId, message, from: caller }) as const
    const queued = Machine.step(Machine.step(machine, receive('second', 'bug')).machine, receive('third', 'ok'))
    const died = Machine.step(queued.machine, { _tag: 'Handle', at })
    for (const requestId of ['second', 'third']) {
      expect(died.outputs).toContainEqual({ _tag: 'Replied', requestId, from: caller, reply: { _tag: 'Suspended' } })
    }
    const resumed = Machine.step(died.machine, {
      _tag: 'Resume',
      program: { ...machine.program, update: (message) => () => ({ last: message }) },
    })
    // A retry while its message is queued waits for the reply, which handling it gives.
    expect(Machine.step(resumed.machine, receive('third', 'ok')).outputs).toEqual([])
    const first = Machine.step(resumed.machine, { _tag: 'Handle', at })
    const second = Machine.step(first.machine, { _tag: 'Handle', at })
    expect(second.outputs).toContainEqual({ _tag: 'Replied', requestId: 'third', from: caller, reply: accepted })
    expect(Machine.step(second.machine, receive('third', 'ok')).outputs)
      .toEqual([{ _tag: 'Replied', requestId: 'third', from: caller, reply: accepted }])
  })

  test('an operation that dies answers Suspended every caller waiting', () => {
    const machine = checked((message) => message, () => ({ charge: 'operation' }))
    const queued = Machine.step(machine, { _tag: 'Receive', requestId: 'r', message: 'go', from: caller })
    const died = Machine.step(queued.machine, { _tag: 'Die', key: 'charge', incarnation: 1, cause: 'died' })
    expect(died.outputs).toContainEqual({ _tag: 'Replied', requestId: 'r', from: caller, reply: { _tag: 'Suspended' } })
  })

  test('resumed with a fixed program, handles the message it died on', () => {
    const machine = suspended()
    const resumed = Machine.step(machine, {
      _tag: 'Resume',
      program: { ...machine.program, update: (message) => () => ({ last: message }) },
    })
    const transition = Machine.step(resumed.machine, { _tag: 'Handle', at })
    expect(transition.machine.stored.state).toEqual({ last: 'bug' })
    expect(transition.outputs).toContainEqual({
      _tag: 'Replied',
      requestId: 'second',
      from: caller,
      reply: { _tag: 'Accepted' },
    })
  })

  test('stays suspended when the fixed program dies on its state', () => {
    const machine = suspended()
    const broken = new Error('broken')
    const resumed = Machine.step(machine, {
      _tag: 'Resume',
      program: {
        ...machine.program,
        durable: () => {
          throw broken
        },
      },
    })
    expect(resumed.machine.stored.suspension).toEqual({ cause: broken, on: { _tag: 'Message' } })
    expect(resumed.machine.running).toEqual({})
  })
})

// A runtime passivates an entity as a restart: its timers wait in the stored work while it is unloaded.
describe('passivation', () => {
  test('a restart with only timers under way arms them again, in their incarnations, and changes nothing stored', () => {
    const machine = checked((message) => message, () => ({ deadline: 'later timer', reminder: 'timer' }))
    const transition = Machine.step(machine, { _tag: 'Restart' })
    expect(transition.machine.stored).toEqual(machine.stored)
    expect(transition.machine.running).toEqual(machine.running)
    expect(transition.outputs).toEqual([
      { _tag: 'Armed', key: 'deadline', incarnation: 1, timer: timer(at, 'rang') },
      { _tag: 'Armed', key: 'reminder', incarnation: 1, timer: timer(epoch, 'rang') },
    ])
  })
})

describe('a new program', () => {
  /** Restarts the entity with a program whose work on each state is `durable`: a deploy. */
  const deployed = (machine: Machine.Machine<Tiny>, durable: (state: string) => TinyWork) =>
    Machine.step(machine, { _tag: 'Restart', program: tiny((message) => message, durable) })

  test('restarts an operation it keeps equal under the same key', () => {
    const machine = checked((message) => message, () => ({ charge: 'operation' }))
    const transition = deployed(machine, () => ({ charge: 'operation' }))
    expect(transition.outputs).toContainEqual(
      expect.objectContaining({ _tag: 'Started', key: 'charge', incarnation: 1 }),
    )
  })

  test('returning a key whose work was delivered starts new work, under a new key', () => {
    const machine = checked((message) => message, (state) => (state === 'start' ? { charge: 'operation' } : {}))
    const delivered = handled(machine, { _tag: 'Complete', key: 'charge', incarnation: 1, message: 'charged' })
    const transition = deployed(delivered.machine, () => ({ charge: 'operation' }))
    expect(transition.outputs).toContainEqual(
      expect.objectContaining({ _tag: 'Started', key: 'charge', incarnation: 2 }),
    )
  })

  test('a timer it changes is armed again, as new work', () => {
    const machine = checked((message) => message, () => ({ deadline: 'timer' }))
    const transition = deployed(machine, () => ({ deadline: 'later timer' }))
    expect(transition.outputs).toContainEqual(
      expect.objectContaining({ _tag: 'Armed', key: 'deadline', incarnation: 2, timer: timer(at, 'rang') }),
    )
  })

  test('changing or dropping an operation under way is a defect, and the entity stays as it was', () => {
    const machine = checked((message) => message, () => ({ charge: 'operation' }))
    const changed = deployed(machine, () => ({ charge: 'larger operation' }))
    expect(reasonOfSuspension(changed)).toBe("the program changed the operation under 'charge' before its completion")
    expect(changed.machine.stored).toEqual({ ...machine.stored, suspension: changed.machine.stored.suspension })
    expect(changed.machine.stored.suspension?.on).toEqual({ _tag: 'Activation' })
    expect(changed.outputs.filter((output) => output._tag === 'Started')).toEqual([])
    const dropped = deployed(machine, () => ({}))
    expect(reasonOfSuspension(dropped)).toBe("the program dropped the operation under 'charge' before its completion")
  })

  test('an at-most-once operation that is new work at an activation starts: it never ran', () => {
    const machine = checked((message) => message, () => ({ deadline: 'timer' }))
    const program = machine.program
    const transition = Machine.step(machine, {
      _tag: 'Restart',
      program: {
        ...program,
        durable: (state) => ({ ...program.durable(state), mail: { _tag: 'Work', size: 1 } as const }),
        operations: { Work: operation.atMostOnce(() => Effect.succeed('done'), () => '?') },
      },
    })
    expect(transition.outputs).toContainEqual(expect.objectContaining({ _tag: 'Started', key: 'mail', incarnation: 1 }))
    expect(transition.machine.stored.mailbox).toEqual([])
  })

  test('changing how an operation under way is delivered is a defect', () => {
    const machine = checked((message) => message, () => ({ charge: 'operation' }))
    const program = machine.program
    const transition = Machine.step(machine, {
      _tag: 'Restart',
      program: { ...program, operations: { Work: operation.atMostOnce(() => Effect.succeed('done'), () => '?') } },
    })
    expect(reasonOfSuspension(transition)).toBe(
      "the program changed how the operation under 'charge' is delivered before its completion",
    )
    expect(transition.outputs.filter((output) => output._tag === 'Started')).toEqual([])
  })

  test('a program of another name is a defect, even brought while the entity is suspended', () => {
    const machine = checked((message) => message, () => ({ charge: 'operation' }))
    const renamed = { ...machine.program, name: 'Renamed' }
    const reason = "the program 'Renamed' replaces the entity's program 'Tiny'"
    expect(reasonOfSuspension(Machine.step(machine, { _tag: 'Restart', program: renamed }))).toBe(reason)
    const suspended = deployed(machine, () => ({ charge: 'larger operation' })).machine
    const restarted = Machine.step(suspended, { _tag: 'Restart', program: renamed }).machine
    expect(reasonOfSuspension(Machine.step(restarted, { _tag: 'Resume' }))).toBe(reason)
  })

  test('an entity it suspended is resumed by a program that keeps the operation', () => {
    const machine = checked((message) => message, () => ({ charge: 'operation' }))
    const suspended = deployed(machine, () => ({ charge: 'larger operation' })).machine
    const resumed = Machine.step(suspended, { _tag: 'Resume', program: machine.program })
    expect(resumed.machine.stored.suspension).toBeNull()
    expect(resumed.outputs).toContainEqual(expect.objectContaining({ _tag: 'Started', key: 'charge', incarnation: 1 }))
  })
})

describe('who a request belongs to', () => {
  const booking = { _tag: 'Entity', entity: { name: 'Booking', id: 'b1' } } as const
  const waitlist = { _tag: 'Entity', entity: { name: 'Waitlist', id: 'b1' } } as const

  test('the same request id from different senders is different requests, each answered its own reply', () => {
    const machine = checked((message) => (message === 'no' ? reject : message), () => ({}))
    const first = handled(machine, { _tag: 'Receive', requestId: 'k', message: 'no', from: nobody })
    const second = handled(first.machine, { _tag: 'Receive', requestId: 'k', message: 'yes', from: booking })
    const third = handled(second.machine, { _tag: 'Receive', requestId: 'k', message: 'go', from: waitlist })
    const rejected = { _tag: 'Rejected', reason: null } as const
    const accepted = { _tag: 'Accepted' } as const
    expect(first.outputs).toContainEqual({ _tag: 'Replied', requestId: 'k', from: nobody, reply: rejected })
    expect(second.outputs).toContainEqual({ _tag: 'Replied', requestId: 'k', from: booking, reply: accepted })
    expect(third.outputs).toContainEqual({ _tag: 'Replied', requestId: 'k', from: waitlist, reply: accepted })
    expect(third.machine.stored.state).toEqual({ last: 'go' })
  })

  test('entities of two programs with the same id give their work different idempotency keys', () => {
    const charging = (state: string) => (state === 'start' ? {} : { charge: 'operation' as const })
    const started = (name: string) =>
      handled(checked((message) => message, charging, undefined, name), {
        _tag: 'Receive',
        requestId: 'r',
        message: 'go',
        from: nobody,
      }).outputs.find((output) => output._tag === 'Started')
    const order = started('Order')
    const booking = started('Booking')
    expect(order?._tag === 'Started' && booking?._tag === 'Started').toBe(true)
    if (order?._tag === 'Started' && booking?._tag === 'Started') {
      expect(order.idempotencyKey).not.toBe(booking.idempotencyKey)
    }
  })
})

describe('creation', () => {
  const booking = { _tag: 'Entity', entity: { name: 'Booking', id: 'b1' } } as const

  test('answers the request that created the entity Created, and stores nothing for the others', () => {
    const machine = checked((message) => message, () => ({}))
    const create = (requestId: string, from: Origin<unknown>) =>
      Machine.step(machine, { _tag: 'Create', requestId, from })
    expect(create('creation', nobody).outputs)
      .toEqual([{ _tag: 'Replied', requestId: 'creation', from: nobody, reply: { _tag: 'Created' } }])
    // The same request id from another sender is another request.
    expect(create('creation', booking).outputs)
      .toEqual([{ _tag: 'Replied', requestId: 'creation', from: booking, reply: { _tag: 'AlreadyExists' } }])
    expect(create('other', nobody).machine).toBe(machine)
  })

  test('a creation is not a message: its request id may be used again to send one', () => {
    const machine = checked((message) => message, () => ({}))
    const sent = handled(machine, { _tag: 'Receive', requestId: 'creation', message: 'go', from: nobody })
    expect(sent.machine.stored.state).toEqual({ last: 'go' })
  })
})
