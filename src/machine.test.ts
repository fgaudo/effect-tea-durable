/**
 * The design's guarantees, checked on the pure machine under random sequences of events, crashes included: what
 * a caller is answered, what `update` is given, what runs, and what survives a crash or a defect.
 */
import { describe, expect, test } from 'bun:test'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import fc from 'fast-check'
import * as Machine from './machine.ts'
import {
  defect,
  type IdempotencyKey,
  InvariantDefect,
  noWork,
  operation,
  type Program,
  reject,
  rejectWith,
  timer,
} from './program.ts'

// A program whose work is chosen by its callers: `a` is idempotent, `b` at most once, `c` at least once, `t` a
// timer. `Break` is a bug, and dropping an operation under way is a defect the machine finds.
const keys = ['a', 'b', 'c', 't'] as const
type Key = (typeof keys)[number]

type State = Readonly<{ want: ReadonlyArray<Key>; applied: ReadonlyArray<string> }>

type Inbound =
  | Readonly<{ _tag: 'Want'; key: Key; on: boolean; nonce: string }>
  | Readonly<{ _tag: 'Refuse'; nonce: string }>
  | Readonly<{ _tag: 'Break'; nonce: string }>

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
  rejection: 'Refused'
  sender: 'caller'
  projection: number
  services: never
}

const notHeld = 'an internal message for a key the state does not hold'

const epoch = DateTime.makeUnsafe(0)

const done = (key: Key): Internal => ({ _tag: 'Done', key, then: 'End' })

const program: Program<T> = {
  name: 'Toy',
  // The machine never encodes: the schemas are the runtime's.
  schemas: {} as Program<T>['schemas'],
  init: () => ({ want: keys, applied: [] }),
  update: (message) => (state) => {
    switch (message._tag) {
      case 'Want': {
        const others = state.want.filter((key) => key !== message.key)
        const want = message.on ? keys.filter((key) => key === message.key || others.includes(key)) : others
        return { want, applied: [...state.applied, message.nonce] }
      }
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
        ? operation(() => Effect.succeed(done('a')))
        : key === 'b'
        ? operation.atMostOnce(Effect.succeed(done('b')), { _tag: 'Unknown', key: 'b' })
        : key === 'c'
        ? operation.atLeastOnce(Effect.succeed(done('c')))
        : timer<Internal>(epoch, { _tag: 'Rang', key: 't' }),
    ])),
  project: (state) => state.want.length,
}

type Command =
  | Readonly<{ _tag: 'Send'; kind: Inbound['_tag']; key: Key; on: boolean }>
  | Readonly<{ _tag: 'Retry'; pick: number }>
  | Readonly<{ _tag: 'Complete'; pick: number; then: 'End' | 'Again' | 'Break' }>
  | Readonly<{ _tag: 'Stale'; fire: boolean; key: Key; incarnation: number }>
  /** Drops a key and brings it back at once: a firing already in the mailbox is then stale. */
  | Readonly<{ _tag: 'Toggle'; key: Key }>
  | Readonly<{ _tag: 'Fire'; pick: number }>
  | Readonly<{ _tag: 'Handle' }>
  | Readonly<{ _tag: 'Die'; pick: number }>
  | Readonly<{ _tag: 'Restart' }>
  | Readonly<{ _tag: 'Resume' }>
  | Readonly<{ _tag: 'Discard' }>

const key = fc.constantFrom(...keys)
const pick = fc.nat()

const command: fc.Arbitrary<Command> = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.record({
      _tag: fc.constant('Send' as const),
      kind: fc.constantFrom('Want' as const, 'Want' as const, 'Want' as const, 'Refuse' as const, 'Break' as const),
      key,
      on: fc.boolean(),
    }),
  },
  { weight: 1, arbitrary: fc.record({ _tag: fc.constant('Retry' as const), pick }) },
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
  { weight: 2, arbitrary: fc.constant({ _tag: 'Restart' as const }) },
  { weight: 1, arbitrary: fc.constant({ _tag: 'Resume' as const }) },
  { weight: 1, arbitrary: fc.constant({ _tag: 'Discard' as const }) },
)

type Toy = Machine.Machine<T>

const runningOf = (machine: Toy, kind: Machine.Running['kind']) =>
  Object.entries(machine.running).filter(([, running]) => running.kind === kind)

const at = DateTime.makeUnsafe(1_000)

type Receive = Extract<Machine.Event<T>, { _tag: 'Receive' }>

const receive = (requests: Array<Receive>, message: (nonce: string) => Inbound): Receive => {
  const event: Receive = {
    _tag: 'Receive',
    requestId: `r${requests.length}`,
    message: message(`n${requests.length}`),
    from: { _tag: 'Caller', sender: 'caller' },
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
    default:
      return command
  }
}

type Traced = Readonly<{ event: Machine.Event<T>; before: Toy; after: Toy; outputs: ReadonlyArray<Machine.Output<T>> }>

const run = (commands: ReadonlyArray<Command>) => {
  const created = Machine.start(program, 'toy', null, epoch)
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
  // Then everything ends: bugs are discarded, operations complete, timers fire, and the mailbox is handled.
  for (let turn = 0; turn < 200; turn++) {
    const { stored } = machine
    const operation = runningOf(machine, 'Operation')[0]
    const firing = runningOf(machine, 'Timer')[0]
    if (stored.suspension !== null) {
      apply(stored.suspension.on._tag === 'Message' ? { _tag: 'Discard' } : { _tag: 'Resume' })
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

const queued = (machine: Toy, key: string, incarnation: number) =>
  machine.stored.mailbox.some((envelope) =>
    envelope._tag === 'Internal' && envelope.key === key && envelope.incarnation === incarnation
  )

describe('the machine', () => {
  test('a request is answered the same each time, and applied once', () =>
    property(({ trace, machine }) => {
      const replies = new Map<string, Machine.StoredReply<'Refused'>>()
      for (const { outputs } of trace) {
        for (const output of outputs) {
          if (output._tag !== 'Replied' || output.reply._tag === 'Suspended') continue
          const first = replies.get(output.requestId)
          if (first === undefined) replies.set(output.requestId, output.reply)
          else expect(output.reply).toEqual(first)
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
          expect(before.stored.incarnations[output.key]).toBe(output.incarnation)
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
        const work = program.durable(after.stored.state)
        for (const [key, durable] of Object.entries(work)) {
          const incarnation = after.stored.incarnations[key] ?? -1
          if (!queued(after, key, incarnation)) {
            expect(after.running[key]).toEqual({ kind: durable._tag, incarnation })
          }
        }
        for (const [key, running] of Object.entries(after.running)) {
          expect(work[key]?._tag).toBe(running.kind)
          expect(after.stored.incarnations[key]).toBe(running.incarnation)
        }
      }
    }))

  test('an operation leaves the state only through its completion', () =>
    property(({ trace }) => {
      for (const { event, before, after, outputs } of trace) {
        // An operator who discards a completion ends its work by hand.
        if (event._tag === 'Discard') continue
        const next = program.durable(after.stored.state)
        for (const [key, work] of Object.entries(program.durable(before.stored.state))) {
          const incarnation = before.stored.incarnations[key] ?? -1
          const kept = next[key] !== undefined && after.stored.incarnations[key] === incarnation
          if (work._tag !== 'Operation' || kept) continue
          expect(outputs).toContainEqual({ _tag: 'Delivered', key, incarnation })
        }
      }
    }))

  test('an at-most-once operation is started once per incarnation, and a restarted one gets the same key', () =>
    property(({ trace }) => {
      const started = new Map<string, IdempotencyKey>()
      for (const { outputs } of trace) {
        for (const output of outputs) {
          if (output._tag !== 'Started') continue
          const id = `${output.key}@${output.incarnation}`
          const known = started.get(id)
          if (output.operation.delivery === 'AtMostOnce') expect(known).toBeUndefined()
          if (known !== undefined) expect(output.idempotencyKey).toBe(known)
          started.set(id, output.idempotencyKey)
        }
      }
      expect(new Set(started.values()).size).toBe(started.size)
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
        if (event._tag !== 'Restart' || before === after) continue
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

  // A request answered `Suspended` was never in the mailbox: its caller retries.
  test('once the work ends, every request that reached the mailbox is answered, and nothing is left', () =>
    property(({ machine, trace }) => {
      const waited = new Set<string>()
      const discarded = new Set<string>()
      for (const { event, before, after } of trace) {
        for (const envelope of after.stored.mailbox) if (envelope._tag === 'Inbound') waited.add(envelope.requestId)
        const head = before.stored.mailbox[0]
        if (event._tag === 'Discard' && head?._tag === 'Inbound') discarded.add(head.requestId)
      }
      expect(machine.stored.suspension).toBeNull()
      expect(machine.stored.mailbox).toEqual([])
      expect(machine.running).toEqual({})
      for (const requestId of waited) {
        if (!discarded.has(requestId)) expect(machine.stored.replies[requestId]).toBeDefined()
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
              ? `Started ${output.operation.delivery}`
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
      'Replied Rejected',
      'Replied Suspended',
      'Started AtLeastOnce',
      'Started AtMostOnce',
      'Started Idempotent',
      'Suspended',
    ])
  })
})

// The state is the last message, and the work each state holds is given: enough to break each check of a step.
type Tiny = {
  state: string
  flags: null
  inbound: string
  internal: string
  rejection: never
  sender: null
  projection: string
  services: never
}

const checked = (
  update: (message: string) => string | typeof reject,
  durable: (state: string) => Readonly<Record<string, 'operation' | 'timer'>>,
  project: (state: string) => string = (state) => state,
) => {
  const tiny: Program<Tiny> = {
    name: 'Tiny',
    schemas: {} as never,
    init: () => 'start',
    update: (message) => () => update(message),
    durable: (state) =>
      Object.fromEntries(Object.entries(durable(state)).map(([key, kind]) => [
        key,
        kind === 'operation' ? operation(() => Effect.succeed('done')) : timer(epoch, 'rang'),
      ])),
    project: (state) => project(state),
  }
  const created = Machine.start(tiny, 'tiny', null, epoch)
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

  test('a state that durable or project dies on is a defect, and is not stored', () => {
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
      ]
    ) {
      const transition = handled(machine, inbound)
      expect(transition.machine.stored.suspension?.cause).toBe(broken)
      expect(transition.machine.stored.state).toBe('start')
      expect(transition.outputs).toContainEqual({ _tag: 'Replied', requestId: 'r', reply: { _tag: 'Suspended' } })
    }
  })
})

describe('a suspended entity', () => {
  const caller = { _tag: 'Caller', sender: null } as const
  // Accepts `ok`, and dies on `bug`.
  const suspended = () => {
    const machine = checked((message) => (message === 'bug' ? defect('bug') : message), () => ({}))
    const answered = handled(machine, { _tag: 'Receive', requestId: 'first', message: 'ok', from: caller })
    return handled(answered.machine, { _tag: 'Receive', requestId: 'second', message: 'bug', from: caller }).machine
  }

  test('gives the replies it stored, and answers anything else Suspended', () => {
    const machine = suspended()
    expect(Machine.step(machine, { _tag: 'Receive', requestId: 'first', message: 'ok', from: caller }).outputs)
      .toEqual([{ _tag: 'Replied', requestId: 'first', reply: { _tag: 'Accepted' } }])
    expect(Machine.step(machine, { _tag: 'Receive', requestId: 'third', message: 'ok', from: caller }).outputs)
      .toEqual([{ _tag: 'Replied', requestId: 'third', reply: { _tag: 'Suspended' } }])
  })

  test('resumed with a fixed program, handles the message it died on', () => {
    const machine = suspended()
    const resumed = Machine.step(machine, {
      _tag: 'Resume',
      program: { ...machine.program, update: (message) => () => message },
    })
    const transition = Machine.step(resumed.machine, { _tag: 'Handle', at })
    expect(transition.machine.stored.state).toBe('bug')
    expect(transition.outputs).toContainEqual({ _tag: 'Replied', requestId: 'second', reply: { _tag: 'Accepted' } })
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
