/**
 * The design's guarantees, checked on the pure machine under random sequences of events, crashes included: what
 * a caller is answered, what `update` is given, what runs, and what survives a crash or a defect.
 */
import { describe, expect, test } from 'bun:test'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Equal from 'effect/Equal'
import * as Schema from 'effect/Schema'
import fc from 'fast-check'
import * as Machine from './machine.ts'
import {
  defect,
  type IdempotencyKey,
  idempotencyKey,
  InvariantDefect,
  isTimer,
  type Json,
  noWork,
  operation,
  type Program,
  program as declare,
  reject,
  type Request,
  rejectWith,
  runnerOf,
  timer,
  type Types,
  type TypesOf,
  key as keyWithParameter,
} from './program.ts'
import { freezing, frozen } from './testing.ts'

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
  key: Key
  parameter: {}
  rejection: 'Refused'
  sender: 'ann' | 'bob'
  projection: number
  index: never
  services: never
}

const notHeld = 'an internal message for a key the state does not hold'

const epoch = DateTime.makeUnsafe(0)

const done = (key: Key): Internal => ({ _tag: 'Done', key, then: 'End' })

const Key = Schema.Literals(keys)

// The machine encodes what it would store, to check that a runtime can write it (decision 0040).
const schemas: Program<T>['schemas'] = {
  state: Schema.Struct({ want: Schema.Array(Key), applied: Schema.Array(Schema.String), tune: Schema.Number }),
  flags: Schema.Null,
  inbound: Schema.Union([
    Schema.TaggedStruct('Want', { key: Key, on: Schema.Boolean, nonce: Schema.String }),
    Schema.TaggedStruct('Refuse', { nonce: Schema.String }),
    Schema.TaggedStruct('Break', { nonce: Schema.String }),
    Schema.TaggedStruct('Retune', { nonce: Schema.String }),
  ]),
  internal: Schema.Union([
    Schema.TaggedStruct('Done', { key: Key, then: Schema.Literals(['End', 'Again', 'Break']) }),
    Schema.TaggedStruct('Unknown', { key: Key }),
    Schema.TaggedStruct('Rang', { key: Key }),
  ]),
  operation: Schema.Union([
    Schema.TaggedStruct('A', { tune: Schema.Number }),
    Schema.Struct({ _tag: Schema.Literals(['B', 'C']), key: Key }),
  ]),
  rejection: Schema.Literal('Refused'),
  sender: Schema.Literals(['ann', 'bob']),
  projection: Schema.Number,
}

const program: Program<T> = {
  name: 'Toy',
  keys: { a: null, b: null, c: null, t: null },
  schemas,
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
  work: (state) =>
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
  work: (state) => {
    const work = program.work(state)
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
  work: (state) => {
    const work = program.work(state)
    return work['t'] === undefined ? work : { ...work, t: { _tag: 'B', key: 't' } as const }
  },
}

// A version fixed so that its `update` handles the completion it broke on: what an operator brings for a
// completion, which is not discarded (decision 0041).
const mend = (version: Program<T>): Program<T> => ({
  ...version,
  update: (message, meta) =>
    version.update(message._tag === 'Done' && message.then === 'Break' ? { ...message, then: 'End' } : message, meta),
})

const versions = { first: program, retuned, redelivered, retimed, mended: mend(program) } as const

/** The program a restart or a resumption brings: the one running, or one of the versions, deployed. */
type Version = 'same' | keyof typeof versions

const versionOf = (version: Version) => (version === 'same' ? undefined : versions[version])

type Command =
  /** A caller's message, under its next request id: `ann` and `bob` choose the same ones. */
  | Readonly<{ _tag: 'Send'; kind: Inbound['_tag']; key: Key; on: boolean; sender: T['sender'] }>
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
      sender: fc.constantFrom<T['sender']>('ann', 'bob'),
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

/** The text the machine indexes the toy's key `name` by: no key of the toy takes a parameter. */
const textOf = (name: string) => Machine.keyText({ name })

/** The work the stored state holds, by the text the machine indexes each key by. */
const workByText = (stored: Machine.Stored<T>) =>
  Object.fromEntries(Object.entries(Machine.workOf(stored)).map(([text, { work }]) => [text, work]))

/** The work of `kind` under way, with the key of each, in the order it started. */
const runningOf = (machine: Toy, kind: Machine.Running['kind']) =>
  Object.entries(machine.running).flatMap(([text, running]): ReadonlyArray<readonly [{ name: Key }, Machine.Running]> => {
    const name = keys.find((key) => textOf(key) === text)
    return running.kind === kind && name !== undefined ? [[{ name }, running]] : []
  })

const at = DateTime.makeUnsafe(1_000)

type Receive = Extract<Machine.Offered<T>, { _tag: 'Receive' }>

const creation = { _tag: 'Caller', sender: 'ann', id: 'creation' } as const

const receive = (
  requests: Array<Receive>,
  message: (nonce: string) => Inbound,
  sender: T['sender'] = 'ann',
): Receive => {
  const mine = requests.filter(({ request }) => request._tag === 'Caller' && request.sender === sender)
  const event: Receive = {
    _tag: 'Receive',
    request: { _tag: 'Caller', sender, id: `r${mine.length}` },
    message: message(`n${requests.length}`),
  }
  requests.push(event)
  return event
}

/** An event, and the version deployed to step it and what follows, if it brings one (decision 0064). */
type Stepped = Readonly<{ event: Machine.Offered<T>; deploy?: Program<T> }>

/**
 * Turns a command into events of the machine as it is: none when it has nothing to act on. A resumption with a fix
 * is a deploy of it, a `Restart` the suspended entity stays suspended through, and then the resumption.
 */
const toEvents = (machine: Toy, command: Command, requests: Array<Receive>): ReadonlyArray<Stepped> => {
  if (command._tag === 'Toggle') {
    return [
      { event: receive(requests, (nonce) => ({ _tag: 'Want', key: command.key, on: false, nonce })) },
      { event: receive(requests, (nonce) => ({ _tag: 'Want', key: command.key, on: true, nonce })) },
    ]
  }
  if (command._tag === 'Restart' || command._tag === 'Resume') {
    const fixed = versionOf(command.version)
    const restart: Stepped = { event: { _tag: 'Restart' }, ...(fixed === undefined ? {} : { deploy: fixed }) }
    const resume: Stepped = { event: { _tag: 'Resume' } }
    return command._tag === 'Restart' ? [restart] : fixed === undefined ? [resume] : [restart, resume]
  }
  const event = toEvent(machine, command, requests)
  return event === null ? [] : [{ event }]
}

const toEvent = (
  machine: Toy,
  command: Exclude<Command, Readonly<{ _tag: 'Toggle' | 'Restart' | 'Resume' }>>,
  requests: Array<Receive>,
): Machine.Offered<T> | null => {
  switch (command._tag) {
    case 'Send':
      return receive(requests, (nonce) =>
        command.kind === 'Want'
          ? { _tag: 'Want', key: command.key, on: command.on, nonce }
          : { _tag: command.kind, nonce }, command.sender)
    case 'Retry':
      return requests.length === 0 ? null : requests[command.pick % requests.length] ?? null
    case 'Create':
      return {
        _tag: 'Create',
        request: command.again ? creation : { _tag: 'Caller', sender: 'ann', id: `c${requests.length}` },
      }
    case 'Complete': {
      const operations = runningOf(machine, 'Operation')
      const chosen = operations[command.pick % Math.max(operations.length, 1)]
      return chosen === undefined ? null : {
        _tag: 'Complete',
        key: chosen[0],
        incarnation: chosen[1].incarnation,
        message: { _tag: 'Done', key: chosen[0].name, then: command.then },
      }
    }
    case 'Stale':
      return command.fire
        ? { _tag: 'Fire', key: { name: command.key }, incarnation: command.incarnation }
        : { _tag: 'Complete', key: { name: command.key }, incarnation: command.incarnation, message: done(command.key) }
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

type Traced = Readonly<{
  event: Machine.Event<T>
  /** The program that stepped the event. */
  program: Program<T>
  /** Whether it is another than the one that stepped the event before: the event is a deploy's. */
  deployed: boolean
  before: Toy
  after: Toy
  outputs: ReadonlyArray<Machine.Output<T>>
  written: Machine.Written | null
}>

/**
 * The replies of a table as a storage holds them, read back from the rows a step writes: what a `Receive` is given,
 * since the machine holds none (decision 0065).
 */
type Replies<Reason> = Map<string, Machine.StoredReply<Reason>>

const store = <Reason>(
  replies: Replies<Reason>,
  written: Machine.Written | null,
  reason: (json: unknown) => Reason,
) => {
  for (const row of written?.replies ?? []) {
    replies.set(
      row.request,
      row.tag === 'Accepted'
        ? { _tag: 'Accepted' }
        : { _tag: 'Rejected', reason: row.reason === null ? null : reason(row.reason) },
    )
  }
}

/** An offered event, given the reply stored under its request when it is a message. */
const given = <U extends Types>(
  program: Program<U>,
  replies: Replies<U['rejection']>,
  offered: Machine.Offered<U>,
): Machine.Event<U> =>
  offered._tag === 'Receive'
    ? { ...offered, reply: replies.get(Machine.requestKey(program, offered.request)) ?? null, at }
    : offered

/** The message an event handles: a step's, or a message's that finds the mailbox empty (decision 0074). */
const handledBy = (event: Machine.Event<T>, before: Toy): Machine.Envelope<T> | undefined => {
  if (before.stored.suspension !== null) return undefined
  if (event._tag === 'Handle') return before.stored.mailbox[0]
  return event._tag === 'Receive' && event.reply === null && before.stored.mailbox.length === 0
    ? { _tag: 'Inbound', request: event.request, message: event.message }
    : undefined
}

/**
 * The machine under a sequence of commands, and what it did. `freeze` runs it on values frozen through — what the
 * program gives and what callers offer — so that a mutation of the machine's throws (decision 0052).
 */
const run = (commands: ReadonlyArray<Command>, freeze = false) => {
  const as = (version: Program<T>) => (freeze ? freezing(version) : version)
  const created = Machine.start(as(program), 'toy', null, epoch, freeze ? frozen({ ...creation }) : creation)
  if (created._tag !== 'Created') throw created._tag === 'Defect' ? created.cause : created.reply
  let machine = created.machine
  // The program deployed, which steps every event until another is (decision 0064).
  let deployed = as(program)
  const requests: Array<Receive> = []
  const replies: Replies<T['rejection']> = new Map()
  // Creation, as an activation that found nothing.
  const trace: Array<Traced> = [
    {
      event: { _tag: 'Restart' },
      program: as(program),
      deployed: false,
      before: machine,
      after: machine,
      outputs: created.outputs,
      written: created.written,
    },
  ]
  const apply = (offered: Machine.Offered<T>, deploy?: Program<T>) => {
    const was = deployed
    deployed = deploy === undefined ? deployed : as(deploy)
    const event = given(deployed, replies, freeze ? frozen(offered) : offered)
    const { machine: after, outputs, written } = Machine.step(deployed, machine, event)
    trace.push({ event, program: deployed, deployed: deployed !== was, before: machine, after, outputs, written })
    store(replies, written, Schema.decodeUnknownSync(deployed.schemas.rejection))
    machine = after
  }
  for (const command of commands) {
    for (const { event, deploy } of toEvents(machine, command, requests)) apply(event, deploy)
  }
  // Then everything ends: bugs are discarded, operations complete, timers fire, and the mailbox is handled. A
  // suspended entity is discarded or resumed, by each version in turn, until one keeps what runs and handles what
  // it died on.
  const fixes = [program, retuned, redelivered, retimed] as const
  let tried = 0
  for (let turn = 0; turn < 200; turn++) {
    const { stored } = machine
    const operation = runningOf(machine, 'Operation')[0]
    const firing = runningOf(machine, 'Timer')[0]
    if (stored.suspension !== null) {
      // A discard drops an inbound message with a program that keeps what runs: on its failure, or for an internal
      // message, which is not discarded (decisions 0041, 0044), the next version is brought.
      const discarding = stored.suspension.on._tag === 'Message' && stored.mailbox[0]?._tag === 'Inbound' &&
        trace.at(-1)?.event._tag !== 'Discard'
      if (discarding) apply({ _tag: 'Discard' })
      else {
        // A fix is a deploy, which the suspended entity stays suspended through, and then a resumption.
        apply({ _tag: 'Restart' }, mend(fixes[tried++ % fixes.length] ?? program))
        apply({ _tag: 'Resume' })
      }
    } else if (stored.mailbox.length > 0) apply({ _tag: 'Handle', at })
    else if (operation !== undefined) {
      const [key, { incarnation }] = operation
      apply({ _tag: 'Complete', key, incarnation, message: done(key.name) })
    } else if (firing !== undefined) apply({ _tag: 'Fire', key: firing[0], incarnation: firing[1].incarnation })
    else break
  }
  return { machine, trace, requests, replies }
}

type Run = ReturnType<typeof run>

const property = (check: (run: Run) => void, options?: fc.Parameters<[ReadonlyArray<Command>]>) =>
  fc.assert(fc.property(fc.array(command, { maxLength: 40 }), (commands) => check(run(commands))), {
    numRuns: 300,
    ...options,
  })

const kindOf = (work: unknown): Machine.Running['kind'] => (isTimer(work) ? 'Timer' : 'Operation')

const queued = (machine: Toy, text: string, incarnation: number) =>
  machine.stored.mailbox.some((envelope) =>
    envelope._tag === 'Internal' && Machine.keyText(envelope.key) === text && envelope.incarnation === incarnation
  )

describe('the machine', () => {
  // A mutation of the machine's throws on a frozen value, and so fails the run, or, where the program's schemas
  // encode it, suspends the entity on it: the run is then another than on values that are not frozen.
  test('mutates nothing the program gives or a caller offers (decision 0052)', () =>
    fc.assert(
      fc.property(fc.array(command, { maxLength: 40 }), (commands) => {
        const free = run(commands)
        const held = run(commands, true)
        expect(held.trace.map(({ written }) => written)).toEqual(free.trace.map(({ written }) => written))
        expect(held.trace.map(({ outputs }) => outputs)).toEqual(free.trace.map(({ outputs }) => outputs))
        expect(held.machine.stored).toEqual(free.machine.stored)
      }),
      { numRuns: 200 },
    ))

  test('a request is answered the same each time, and applied once', () =>
    property(({ trace, machine }) => {
      const replies = new Map<string, unknown>()
      for (const { outputs } of trace) {
        for (const output of outputs) {
          if (output._tag !== 'Replied' && output._tag !== 'CreationReplied') continue
          if (output.reply._tag === 'Suspended') continue
          // A creation and a message are requests apart, whose ids may be the same (decision 0050).
          const request = `${output._tag} ${Machine.requestKey(program, output.request)}`
          const first = replies.get(request)
          if (first === undefined) replies.set(request, output.reply)
          else expect<unknown>(output.reply).toEqual(first)
        }
      }
      expect(new Set(machine.stored.state.applied).size).toBe(machine.stored.state.applied.length)
    }))

  // `ann` and `bob` choose the same request ids: each one's message is applied, and answered its own reply.
  test("a caller's request is its own: a message accepted is applied, whoever else used its request id", () =>
    property(({ trace, machine, requests }) => {
      for (const { outputs } of trace) {
        for (const output of outputs) {
          if (output._tag !== 'Replied' || output.reply._tag !== 'Accepted') continue
          const key = Machine.requestKey(program, output.request)
          const request = requests.find((sent) => Machine.requestKey(program, sent.request) === key)
          if (request === undefined) continue
          expect(machine.stored.state.applied).toContain(request.message.nonce)
        }
      }
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
          const id = `${Machine.keyText(output.key)}@${output.incarnation}`
          expect(delivered.has(id)).toBe(false)
          delivered.add(id)
          expect(before.stored.keys[Machine.keyText(output.key)]?.incarnation).toBe(output.incarnation)
        }
      }
    }))

  test('what runs is what the stored state says, unless its message is already in the mailbox', () =>
    property(({ trace }) => {
      for (const { after } of trace) {
        const work = workByText(after.stored)
        if (after.stored.suspension !== null) {
          // Only operations run, each one the stored work holds in its incarnation (decision 0113).
          for (const [key, running] of Object.entries(after.running)) {
            expect(running.kind).toBe('Operation')
            expect(work[key] !== undefined && !isTimer(work[key])).toBe(true)
            expect(after.stored.keys[key]?.incarnation).toBe(running.incarnation)
          }
          continue
        }
        for (const [key, piece] of Object.entries(work)) {
          const incarnation = after.stored.keys[key]?.incarnation ?? -1
          if (!queued(after, key, incarnation)) {
            expect(after.running[key]).toEqual({ kind: kindOf(piece), incarnation })
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
          if (output._tag === 'Armed') armedAt.set(`${Machine.keyText(output.key)}@${output.incarnation}`, output.timer.at)
        }
        const work = workByText(after.stored)
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
          if (output._tag === 'Started') startedWith.set(`${Machine.keyText(output.key)}@${output.incarnation}`, output.operation)
        }
        const work = workByText(after.stored)
        for (const [key, running] of Object.entries(after.running)) {
          if (running.kind !== 'Operation') continue
          expect(Equal.equals(startedWith.get(`${key}@${running.incarnation}`), work[key])).toBe(true)
        }
      }
    }))

  test('an operation leaves the state only through its completion', () =>
    property(({ trace }) => {
      for (const { before, after, outputs } of trace) {
        const next = Machine.workOf(after.stored)
        for (const [text, { key, work }] of Object.entries(Machine.workOf(before.stored))) {
          const incarnation = before.stored.keys[text]?.incarnation ?? -1
          const kept = next[text] !== undefined && after.stored.keys[text]?.incarnation === incarnation
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
      for (const { program, outputs } of trace) {
        for (const output of outputs) {
          if (output._tag !== 'Started') continue
          const id = `${Machine.keyText(output.key)}@${output.incarnation}`
          const known = started.get(id)
          if (known === undefined && runnerOf(program, output.operation)?.delivery === 'AtMostOnce') {
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
      for (const { outputs } of trace) {
        for (const output of outputs) {
          if (output._tag === 'Delivered') done.add(`${Machine.keyText(output.key)}@${output.incarnation}`)
          if (output._tag !== 'Started') continue
          expect(done.has(`${Machine.keyText(output.key)}@${output.incarnation}`)).toBe(false)
          const known = started.get(output.idempotencyKey)
          if (known !== undefined) expect(Equal.equals(known, output.operation)).toBe(true)
          started.set(output.idempotencyKey, output.operation)
        }
      }
    }))

  // So the runtime may delete a reply another entity's work no longer holds: it never asks for it again.
  test('work that is no longer held never is again, and never starts again', () =>
    property(({ trace }) => {
      const started = new Map<string, Readonly<{ key: Machine.Run<T>['key']; incarnation: number }>>()
      const ended = new Set<string>()
      for (const { after, outputs } of trace) {
        for (const output of outputs) {
          if (output._tag !== 'Started') continue
          const id = `${Machine.keyText(output.key)}@${output.incarnation}`
          expect(ended.has(id)).toBe(false)
          started.set(id, { key: output.key, incarnation: output.incarnation })
        }
        for (const [id, { key, incarnation }] of started) {
          const held = Machine.holds(after.stored, key, incarnation)
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
          const id = `${Machine.keyText(output.key)}@${output.incarnation}`
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
          if (output._tag === 'Started') started.add(`${Machine.keyText(output.key)}@${output.incarnation}`)
        }
        for (const envelope of after.stored.mailbox) {
          if (envelope._tag === 'Internal' && envelope.message._tag === 'Unknown') {
            expect(started.has(`${Machine.keyText(envelope.key)}@${envelope.incarnation}`)).toBe(true)
          }
        }
      }
    }))

  test('a crash loses nothing stored, and an at-most-once operation under way delivers its unknown', () =>
    property(({ trace }) => {
      for (const { event, deployed, before, after } of trace) {
        if (event._tag !== 'Restart' || deployed || before === after) continue
        const { mailbox, ...stored } = after.stored
        const { mailbox: previous, ...was } = before.stored
        expect(stored).toEqual(was)
        expect(mailbox.slice(0, previous.length)).toEqual([...previous])
        for (const envelope of mailbox.slice(previous.length)) {
          expect(envelope).toMatchObject({ _tag: 'Internal', message: { _tag: 'Unknown' } })
          if (envelope._tag === 'Internal') {
            expect(before.running[Machine.keyText(envelope.key)]?.incarnation ?? envelope.incarnation)
              .toBe(envelope.incarnation)
          }
        }
      }
    }))

  test('a defect suspends the entity, with its state and its mailbox as they were', () =>
    property(({ trace }) => {
      for (const { event, before, after, outputs } of trace) {
        if (!outputs.some((output) => output._tag === 'Suspended')) continue
        // A message that suspends the entity as it arrives stays, as one queued before would (decision 0074).
        const received: ReadonlyArray<Machine.Envelope<T>> = event._tag === 'Receive'
          ? [{ _tag: 'Inbound', request: event.request, message: event.message }]
          : []
        expect({ ...after.stored, suspension: null })
          .toEqual({ ...before.stored, mailbox: [...before.stored.mailbox, ...received], suspension: null })
        // The timers leave what runs. The operations stay, but the one that died, and none survives a restart
        // (decision 0113).
        const died = event._tag === 'Die' || event._tag === 'Complete' ? Machine.keyText(event.key) : null
        const kept = event._tag === 'Restart' ? {} : Object.fromEntries(
          Object.entries(before.running).filter(([key, running]) => running.kind === 'Operation' && key !== died),
        )
        expect(after.running).toEqual(kept)
      }
    }))

  test('a suspended entity handles nothing, and its operations run to their end', () =>
    property(({ trace }) => {
      for (const { event, before, after, outputs } of trace) {
        if (before.stored.suspension === null || event._tag === 'Resume' || event._tag === 'Discard') continue
        const { mailbox, ...stored } = after.stored
        const { mailbox: previous, ...was } = before.stored
        expect(stored).toEqual(was)
        expect(mailbox.slice(0, previous.length)).toEqual([...previous])
        // What is recorded behind the message is the completion of an operation that was running (decision 0113).
        for (const envelope of mailbox.slice(previous.length)) {
          expect(envelope._tag).toBe('Internal')
          if (envelope._tag === 'Internal') {
            expect(before.running[Machine.keyText(envelope.key)])
              .toEqual({ kind: 'Operation', incarnation: envelope.incarnation })
          }
        }
        for (const [key, running] of Object.entries(after.running)) {
          expect(running.kind).toBe('Operation')
          expect(before.running[key]).toEqual(running)
        }
        expect(outputs.some((output) => output._tag === 'Started' || output._tag === 'Armed')).toBe(false)
      }
    }))

  // So no caller waits on a suspended entity: whether its message is queued or not, it retries (decision 0023).
  test('when the entity suspends, every caller waiting in its mailbox is answered Suspended', () =>
    property(({ trace }) => {
      for (const { after, outputs } of trace) {
        if (!outputs.some((output) => output._tag === 'Suspended')) continue
        for (const envelope of after.stored.mailbox) {
          if (envelope._tag !== 'Inbound') continue
          expect(outputs).toContainEqual({ _tag: 'Replied', request: envelope.request, reply: { _tag: 'Suspended' } })
        }
      }
    }))

  // A request answered `Suspended` while the entity is suspended was never in the mailbox: its caller retries.
  test('once the work ends, every request that reached the mailbox is answered, and nothing is left', () =>
    property(({ machine, trace, replies }) => {
      const waited = new Set<string>()
      const discarded = new Set<string>()
      for (const { event, before, after } of trace) {
        for (const envelope of after.stored.mailbox) {
          if (envelope._tag === 'Inbound') waited.add(Machine.requestKey(program, envelope.request))
        }
        const head = before.stored.mailbox[0]
        if (event._tag === 'Discard' && head?._tag === 'Inbound') {
          discarded.add(Machine.requestKey(program, head.request))
        }
      }
      expect(machine.stored.suspension).toBeNull()
      expect(machine.stored.mailbox).toEqual([])
      expect(machine.running).toEqual({})
      for (const request of waited) {
        if (!discarded.has(request)) expect(replies.get(request)).toBeDefined()
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
              : output._tag === 'Replied' || output._tag === 'CreationReplied'
              ? `${output._tag} ${output.reply._tag}`
              : output._tag === 'Started'
              ? `Started ${runnerOf(program, output.operation)?.delivery}`
              : output._tag,
          )
        }
      }
    }, { numRuns: 500, seed: 42 })
    expect([...reached].sort()).toEqual([
      'Armed',
      'CreationReplied AlreadyExists',
      'CreationReplied Created',
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

/** A caller's request, under the request id `id`. */
const by = (id: string) => ({ _tag: 'Caller', sender: null, id }) as const

// The state is the last message, held in an object as every state is (decision 0031), and the work each state
// holds is given: enough to break each check of a step.
type Tiny = {
  state: Readonly<{ last: string }>
  flags: null
  inbound: string
  internal: string
  operation: Readonly<{ _tag: 'Work'; size: number }>
  key: string
  parameter: {}
  rejection: never
  sender: null
  projection: string
  index: 'shown'
  services: never
}

type TinyWork = Readonly<
  Record<
    string,
    | 'operation'
    | 'larger operation'
    | 'unmeasured operation'
    | 'annotated operation'
    | 'timer'
    | 'later timer'
    | 'other timer'
  >
>

const tiny = (
  update: (message: string) => string | typeof reject,
  work: (state: string) => TinyWork,
  project: (state: string) => string = (state) => state,
  name = 'Tiny',
  index: (projection: string) => string = (projection) => projection,
): Program<Tiny> => ({
  name,
  // Every key these tests hold work under: the machine checks what `work` returns against them
  // (decision 0037).
  keys: { charge: null, deadline: null, work: null, reminder: null, mail: null },
  schemas: {
    state: Schema.Struct({ last: Schema.String }),
    flags: Schema.Null,
    inbound: Schema.String,
    internal: Schema.String,
    operation: Schema.TaggedStruct('Work', { size: Schema.Number }),
    rejection: Schema.Never,
    sender: Schema.Null,
    projection: Schema.String,
  },
  init: () => ({ last: 'start' }),
  update: (message) => () => {
    const next = update(message)
    return next === reject ? reject : { last: next }
  },
  work: ({ last }) =>
    Object.fromEntries(Object.entries(work(last)).map(([key, kind]) => [
      key,
      // An annotated operation carries a property its schema does not declare, which the types let through a
      // spread: it is not stored (decision 0058).
      kind === 'annotated operation'
        ? { ...{ _tag: 'Work', size: 1 } as const, ...{ note: last } }
        : kind === 'operation' || kind === 'larger operation' || kind === 'unmeasured operation'
        ? { _tag: 'Work', size: kind === 'operation' ? 1 : kind === 'larger operation' ? 2 : Number.NaN } as const
        : timer(kind === 'later timer' ? at : epoch, kind === 'other timer' ? 'rang again' : 'rang'),
    ])),
  operations: { Work: operation(() => Effect.succeed('done')) },
  project: ({ last }) => project(last),
  indexes: { shown: index },
})

/**
 * An entity of a tiny program: its machine, with the program deployed for it, which steps its events, and the
 * replies its steps stored, as a storage holds them (decision 0065).
 */
type Entity = Machine.Machine<Tiny> & Readonly<{ program: Program<Tiny>; replies: Replies<never> }>

const checked = (...args: Parameters<typeof tiny>): Entity => {
  const program = tiny(...args)
  const created = Machine.start(program, 'tiny', null, epoch, by('creation'))
  if (created._tag !== 'Created') throw created._tag === 'Defect' ? created.cause : created.reply
  return { ...created.machine, program, replies: new Map() }
}

/**
 * One event, stepped by the entity's program, or by `deploy`, which is the entity's from then on: a deploy is a
 * `Restart` stepped by another program, and a fix a deploy before a resumption (decision 0064). A message is given
 * the reply the entity's steps stored under its request.
 */
const stepped = (entity: Entity, offered: Machine.Offered<Tiny>, deploy: Program<Tiny> = entity.program) => {
  const transition = Machine.step(deploy, entity, given(deploy, entity.replies, offered))
  if (transition.machine === entity && deploy === entity.program) return { ...transition, machine: entity }
  const replies = new Map(entity.replies)
  store(replies, transition.written, Schema.decodeUnknownSync(deploy.schemas.rejection))
  const machine: Entity = { ...transition.machine, program: deploy, replies }
  return { ...transition, machine }
}

/** Deploys `fixed`, through which the suspended entity stays suspended, and resumes it. */
const resumedBy = (entity: Entity, fixed: Program<Tiny>) =>
  stepped(stepped(entity, { _tag: 'Restart' }, fixed).machine, { _tag: 'Resume' })

/** Records a message, and handles it. */
const handled = (machine: Entity, event: Machine.Offered<Tiny>) =>
  // A message that finds the mailbox empty is handled as it arrives (decision 0074).
  event._tag === 'Receive' && machine.stored.mailbox.length === 0
    ? stepped(machine, event)
    : stepped(stepped(machine, event).machine, { _tag: 'Handle', at })

/** An entity of a tiny program whose operations are droppable (decision 0128). */
const droppable = (...args: Parameters<typeof tiny>): Entity => {
  const base = tiny(...args)
  const program: Program<Tiny> = { ...base, operations: { Work: operation.droppable(() => Effect.succeed('done')) } }
  const created = Machine.start(program, 'tiny', null, epoch, by('creation'))
  if (created._tag !== 'Created') throw created._tag === 'Defect' ? created.cause : created.reply
  return { ...created.machine, program, replies: new Map() }
}

const reasonOfSuspension = (transition: Machine.Transition<Tiny>) => {
  const cause = transition.machine.stored.suspension?.cause
  return cause instanceof InvariantDefect ? cause.reason : cause === undefined ? null : String(cause)
}

describe('the checks of a step', () => {
  const inbound = { _tag: 'Receive', request: by('r'), message: 'go' } as const

  test('a step that drops an operation before its completion is a defect', () => {
    const machine = checked((message) => message, (state) => (state === 'start' ? { charge: 'operation' } : {}))
    expect(reasonOfSuspension(handled(machine, inbound))).toBe(
      "the step dropped the operation under 'charge' before its completion",
    )
  })

  test('a step may drop a droppable operation, which is disarmed, and its late completion is dropped', () => {
    const machine = droppable((message) => message, (state) => (state === 'start' ? { charge: 'operation' } : {}))
    const transition = handled(machine, inbound)
    expect(transition.machine.stored.suspension).toBeNull()
    expect(transition.outputs).toContainEqual({ _tag: 'Disarmed', key: { name: 'charge' }, incarnation: 1 })
    // The runtime interrupts it, and a completion that lands before the interruption is dropped.
    const late = stepped(transition.machine, { _tag: 'Complete', key: { name: 'charge' }, incarnation: 1, message: 'done' })
    expect(late.outputs).toEqual([{ _tag: 'Dropped', key: { name: 'charge' }, incarnation: 1 }])
    expect(late.machine.stored.mailbox).toEqual([])
  })

  // Run twice, it has acted on nothing twice, so a crash runs it again as an at-least-once one (decision 0128).
  test('a crash runs a droppable operation again, in the same incarnation', () => {
    const machine = droppable((message) => message, () => ({ charge: 'operation' }))
    const restarted = stepped(machine, { _tag: 'Restart' })
    expect(restarted.outputs).toContainEqual(
      expect.objectContaining({ _tag: 'Started', key: { name: 'charge' }, incarnation: 1 }),
    )
    expect(restarted.machine.stored.mailbox).toEqual([])
  })

  test('a step may change a droppable operation, which starts again as new work', () => {
    const machine = droppable(
      (message) => message,
      (state) => (state === 'start' ? { charge: 'operation' } : { charge: 'larger operation' }),
    )
    const transition = handled(machine, inbound)
    expect(transition.machine.stored.suspension).toBeNull()
    expect(transition.outputs).toContainEqual({ _tag: 'Disarmed', key: { name: 'charge' }, incarnation: 1 })
    expect(transition.outputs).toContainEqual(
      expect.objectContaining({ _tag: 'Started', key: { name: 'charge' }, incarnation: 2, operation: { _tag: 'Work', size: 2 } }),
    )
  })

  test('a step may drop a timer, which is disarmed', () => {
    const machine = checked((message) => message, (state) => (state === 'start' ? { deadline: 'timer' } : {}))
    const transition = handled(machine, inbound)
    expect(transition.machine.stored.suspension).toBeNull()
    expect(transition.outputs).toContainEqual({ _tag: 'Disarmed', key: { name: 'deadline' }, incarnation: 1 })
  })

  test('a timer whose time changes is armed again, as new work', () => {
    const machine = checked(
      (message) => message,
      (state) => (state === 'start' ? { deadline: 'timer' } : { deadline: 'later timer' }),
    )
    const transition = handled(machine, inbound)
    expect(transition.outputs).toContainEqual({ _tag: 'Disarmed', key: { name: 'deadline' }, incarnation: 1 })
    expect(transition.outputs).toContainEqual(
      expect.objectContaining({ _tag: 'Armed', key: { name: 'deadline' }, incarnation: 2, timer: timer(at, 'rang') }),
    )
  })

  test('a timer whose message changes is armed again, as new work', () => {
    const machine = checked(
      (message) => message,
      (state) => (state === 'start' ? { deadline: 'timer' } : { deadline: 'other timer' }),
    )
    const transition = handled(machine, inbound)
    expect(transition.outputs).toContainEqual({ _tag: 'Disarmed', key: { name: 'deadline' }, incarnation: 1 })
    expect(transition.outputs).toContainEqual(
      expect.objectContaining({ _tag: 'Armed', key: { name: 'deadline' }, incarnation: 2 }),
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

  test('an operation is compared by what is stored: a property its schema does not declare is not', () => {
    const machine = checked((message) => message, () => ({ charge: 'annotated operation' }))
    const transition = handled(machine, inbound)
    expect(transition.machine.stored.suspension).toBeNull()
    expect(transition.outputs.filter((output) => output._tag === 'Started')).toEqual([])
    expect(transition.machine.stored.keys[Machine.keyText({ name: 'charge' })]?.incarnation).toBe(1)
  })

  // A record is written with its fields in the order they were set, where a struct writes its schema's order: the
  // JSON is compared with its fields in any order (decision 0058).
  test('an operation is the same whatever the order its schema writes its fields in', () => {
    const base = tiny((message) => message, () => ({}))
    const program = {
      ...base,
      schemas: {
        ...base.schemas,
        operation: Schema.TaggedStruct('Work', {
          size: Schema.Number,
          weights: Schema.Record(Schema.String, Schema.Number),
        }),
      },
      work: ({ last }: Tiny['state']) => ({
        charge: { _tag: 'Work', size: 1, weights: last === 'start' ? { a: 1, b: 2 } : { b: 2, a: 1 } },
      }),
    } as unknown as Program<Tiny>
    const created = Machine.start(program, 'tiny', null, epoch, by('creation'))
    if (created._tag !== 'Created') throw created._tag === 'Defect' ? created.cause : created.reply
    const transition = handled({ ...created.machine, program, replies: new Map() }, inbound)
    expect(transition.machine.stored.suspension).toBeNull()
    expect(transition.outputs.filter((output) => output._tag === 'Started')).toEqual([])
    expect(transition.machine.stored.keys[Machine.keyText({ name: 'charge' })]?.incarnation).toBe(1)
  })

  test('a key whose timer becomes an operation is new work', () => {
    const machine = checked(
      (message) => message,
      (state) => (state === 'start' ? { work: 'timer' } : { work: 'operation' }),
    )
    const transition = handled(machine, inbound)
    expect(transition.outputs).toContainEqual({ _tag: 'Disarmed', key: { name: 'work' }, incarnation: 1 })
    expect(transition.outputs).toContainEqual(expect.objectContaining({ _tag: 'Started', key: { name: 'work' }, incarnation: 2 }))
  })

  test('an operation\'s completion that update rejects is a defect', () => {
    const machine = checked(() => reject, (state) => (state === 'start' ? { charge: 'operation' } : {}))
    const transition = handled(machine, { _tag: 'Complete', key: { name: 'charge' }, incarnation: 1, message: 'done' })
    expect(reasonOfSuspension(transition)).toBe("update rejected the message of the work under 'charge'")
  })

  test('a state that work, project or an index dies on is a defect, and is not stored', () => {
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
        request: by('r'),
        reply: { _tag: 'Suspended' },
      })
    }
  })
  test('a deploy whose program dies on the stored state suspends the entity on the activation, as it was', () => {
    const broken = new Error('broken')
    const machine = checked((message) => message, () => ({}))
    for (
      const deploy of [
        tiny((message) => message, () => ({}), () => {
          throw broken
        }),
        tiny((message) => message, () => ({}), undefined, undefined, () => {
          throw broken
        }),
      ]
    ) {
      const transition = stepped(machine, { _tag: 'Restart' }, deploy)
      expect(transition.machine.stored.suspension).toEqual({ cause: broken, on: { _tag: 'Activation' } })
      expect(transition.machine.stored.state).toEqual({ last: 'start' })
    }
  })
})

// A defect is what the program does; anything else thrown in a step is the runtime's, which crashes the entity
// instead of suspending it as the program's (decisions 0042, 0061).
describe('what the program throws', () => {
  const inbound = { _tag: 'Receive', request: by('r'), message: 'go' } as const
  /**
   * A machine the runtime corrupted: the row of a timer the state keeps, which only the machine's own code reads
   * where the work is kept, throws.
   */
  const corrupt = (): Entity => {
    const machine = checked((message) => message, () => ({ deadline: 'timer' }))
    const held = machine.stored.keys[Machine.keyText({ name: 'deadline' })]
    if (held === undefined) throw new Error('the state holds no timer under deadline')
    const deadline = {
      key: held.key,
      incarnation: held.incarnation,
      work: held.work,
      get delivery(): never {
        throw new TypeError('a row the runtime corrupted')
      },
    }
    const keys = { ...machine.stored.keys, [Machine.keyText(held.key)]: deadline }
    return { ...machine, stored: { ...machine.stored, keys } }
  }

  test('an exception of the machine in a step is no defect of the program: it leaves the step', () => {
    expect(() => stepped(corrupt(), inbound)).toThrow('a row the runtime corrupted')
  })

  test('an exception of the machine in an activation is no defect of the program: it leaves the event', () => {
    expect(() => stepped(corrupt(), { _tag: 'Restart' })).toThrow('a row the runtime corrupted')
  })

  test('what update throws is its defect, with what it threw as the cause', () => {
    const broken = new TypeError('a bug of the program')
    const machine = checked((message) => {
      if (message === 'go') throw broken
      return message
    }, () => ({}))
    expect(handled(machine, inbound).machine.stored.suspension).toEqual({ cause: broken, on: { _tag: 'Message' } })
  })

  // PostgreSQL holds U+0000 in no text, and no database gives a lone surrogate back as written (decision 0205).
  test('the cause a suspension writes is text a database holds, with each character none holds escaped', () => {
    const machine = checked((message) => {
      if (message === 'go') throw new TypeError('a\u0000b\ud800c😀')
      return message
    }, () => ({}))
    expect(handled(machine, inbound).written?.suspension?.cause).toBe('TypeError: a\\u0000b\\ud800c😀')
    expect(Machine.render('\udc00')).toBe('\\udc00')
  })

  test('what a cast lets through as work that is none is a defect', () => {
    const base = checked((message) => message, () => ({}))
    const machine = { ...base, program: { ...base.program, work: () => ({ charge: 5 as never }) } }
    expect(reasonOfSuspension(handled(machine, inbound))).toBe("the state holds what is no work under 'charge'")
  })

  test('what a cast lets through as a record of work that is none is a defect', () => {
    const base = checked((message) => message, () => ({}))
    for (const work of [null, 'charge']) {
      const machine = { ...base, program: { ...base.program, work: () => work as never } }
      expect(reasonOfSuspension(handled(machine, inbound))).toBe('work gave no record')
    }
  })

  test('a timer a cast lets through with no time is a defect', () => {
    const base = checked((message) => message, () => ({}))
    const work = () => ({ deadline: timer(null as never, 'rang') })
    const machine = { ...base, program: { ...base.program, work } }
    expect(handled(machine, inbound).machine.stored.suspension?.cause).toBeInstanceOf(TypeError)
  })

  test('what init throws is its defect, and the creation stores nothing', () => {
    const broken = new TypeError('a bug of the program')
    const program: Program<Tiny> = {
      ...tiny((message) => message, () => ({})),
      init: () => {
        throw broken
      },
    }
    expect(Machine.start(program, 'tiny', null, epoch, by('creation'))).toEqual({ _tag: 'Defect', cause: broken })
  })

  test('flags init rejects create nothing, and the creator is given the reason (decision 0182)', () => {
    const base = tiny((message) => message, () => ({}))
    const refusing = (init: Program<Tiny>['init'], rejection: Schema.Codec<never, Json> = Schema.String as never) => ({
      ...base,
      schemas: { ...base.schemas, rejection },
      init,
    })
    expect(Machine.start(refusing(() => rejectWith('closed' as never)), 'tiny', null, epoch, by('creation')))
      .toEqual({ _tag: 'Rejected', reply: { _tag: 'Rejected', reason: 'closed' as never } })
    expect(Machine.start(refusing(() => reject), 'tiny', null, epoch, by('creation')))
      .toEqual({ _tag: 'Rejected', reply: { _tag: 'Rejected', reason: null } })
    // A reason its schema refuses is a defect, as `update`'s is.
    const unencoded = Machine.start(
      refusing(() => rejectWith('closed' as never), Schema.Never),
      'tiny',
      null,
      epoch,
      by('creation'),
    )
    expect(unencoded._tag === 'Defect' && unencoded.cause instanceof InvariantDefect && unencoded.cause.reason)
      .toStartWith('the reason of the rejection does not encode')
    // Flags that do not encode are a defect before `init` runs (decision 0049).
    const flagged = Machine.start(refusing(() => reject), 'tiny', 1 as never, epoch, by('creation'))
    expect(flagged._tag).toBe('Defect')
  })
})

describe('what a runtime writes', () => {
  const inbound = { _tag: 'Receive', request: by('r'), message: 'go' } as const

  test('a state whose projection or work does not encode to JSON is a defect, and is not stored', () => {
    for (
      const [machine, reason] of [
        // A projection the schema refuses.
        [
          checked((message) => message, () => ({}), (state) => (state === 'go' ? 1 as never : state)),
          'the projection does not encode',
        ],
        // An operation the schema takes, holding a number JSON writes as `null`.
        [
          checked((message) => message, (state) => (state === 'go' ? { charge: 'unmeasured operation' } : {})),
          "the operation under 'charge' encodes to what JSON does not hold",
        ],
        // An index that is a number JSON writes as `null`, which no schema encodes.
        [
          checked((message) => message, () => ({}), undefined, undefined, (projection) =>
            projection === 'go' ? Number.POSITIVE_INFINITY as never : projection),
          "the index 'shown' is a number JSON does not hold",
        ],
        // An index that reads past an array's end is `undefined`, which no store writes as JSON (decision 0206).
        ...[undefined, {}, [], 1n].map((value) =>
          [
            checked((message) => message, () => ({}), undefined, undefined, (projection) =>
              projection === 'go' ? value as never : projection),
            "the index 'shown' is no scalar: null, a string, a boolean or a number",
          ] as const
        ),
        // An index that is a string holding U+0000, which PostgreSQL holds in no text (decision 0157).
        [
          checked((message) => message, () => ({}), undefined, undefined, (projection) =>
            projection === 'go' ? 'a\u0000b' : projection),
          "the index 'shown' is a string a database does not hold",
        ],
        // An index that is a string holding a lone surrogate, which no database gives back as written (decision 0157).
        [
          checked((message) => message, () => ({}), undefined, undefined, (projection) =>
            projection === 'go' ? '\ud800' : projection),
          "the index 'shown' is a string a database does not hold",
        ],
      ] as const
    ) {
      const transition = handled(machine, inbound)
      expect(reasonOfSuspension(transition)).toStartWith(reason)
      expect(transition.machine.stored.state).toEqual({ last: 'start' })
      expect(transition.outputs.filter((output) => output._tag === 'Started')).toEqual([])
    }
  })

  test('a first state that does not encode stores nothing', () => {
    const created = Machine.start(
      tiny((message) => message, () => ({ charge: 'unmeasured operation' })),
      'tiny',
      null,
      epoch,
      by('creation'),
    )
    expect(created._tag).toBe('Defect')
  })

  test('flags a refinement of their schema refuses never reach init, and store nothing (decision 0049)', () => {
    const initialized: Array<unknown> = []
    const base = tiny((message) => message, () => ({}))
    // A refinement is no rule of the types: flags of the right type its schema refuses.
    const program: Program<Tiny> = {
      ...base,
      schemas: { ...base.schemas, flags: Schema.Null.check(Schema.makeFilter(() => 'no flags are taken')) },
      init: (flags) => {
        initialized.push(flags)
        return { last: 'start' }
      },
    }
    const created = Machine.start(program, 'tiny', null, epoch, by('creation'))
    expect(created._tag === 'Defect' && created.cause instanceof InvariantDefect && created.cause.reason)
      .toStartWith('the value of the flags does not encode')
    expect(initialized).toEqual([])
  })

  test('a state its own schema refuses is a defect, and is not stored', () => {
    const base = checked((message) => message, () => ({}))
    // A refinement is no rule of the types: a state of the right type its schema refuses.
    const last = Schema.String.check(Schema.makeFilter((last: string) => last !== 'go' || 'a state its schema refuses'))
    const program: Program<Tiny> = {
      ...base.program,
      schemas: { ...base.program.schemas, state: Schema.Struct({ last }) },
    }
    const transition = handled({ ...base, program }, inbound)
    expect(reasonOfSuspension(transition)).toStartWith('the state does not encode')
    expect(transition.machine.stored.state).toEqual({ last: 'start' })
    expect(transition.outputs).toContainEqual({ _tag: 'Replied', request: by('r'), reply: { _tag: 'Suspended' } })
  })

  test('a reason of a rejection its schema does not encode is a defect, and no rejection is stored', () => {
    const base = checked((message) => message, () => ({}))
    // The toy's schema of the reasons is `Schema.Never`: any reason is one it refuses.
    const program: Program<Tiny> = { ...base.program, update: () => () => rejectWith('a reason' as never) }
    const transition = handled({ ...base, program }, inbound)
    expect(reasonOfSuspension(transition)).toStartWith('the reason of the rejection does not encode')
    expect(transition.machine.stored.state).toEqual({ last: 'start' })
    expect(transition.outputs).toContainEqual({ _tag: 'Replied', request: by('r'), reply: { _tag: 'Suspended' } })
  })

  test('an operation whose message does not encode suspends the entity on the operation', () => {
    const machine = checked((message) => message, (state) => (state === 'start' ? { charge: 'operation' } : {}))
    const transition = stepped(machine, { _tag: 'Complete', key: { name: 'charge' }, incarnation: 1, message: 1 as never })
    expect(transition.machine.stored.suspension?.on).toEqual({ _tag: 'Operation', key: { name: 'charge' }, incarnation: 1 })
    expect(transition.machine.stored.mailbox).toEqual([])
  })

  test('an unknown that does not encode suspends the entity on the activation', () => {
    const base = tiny((message) => message, () => ({ charge: 'operation' }))
    const program: Program<Tiny> = {
      ...base,
      operations: { Work: operation.atMostOnce(() => Effect.succeed('done'), () => 1 as never) },
    }
    const created = Machine.start(program, 'tiny', null, epoch, by('creation'))
    if (created._tag !== 'Created') throw created._tag === 'Defect' ? created.cause : created.reply
    const transition = stepped({ ...created.machine, program, replies: new Map() }, { _tag: 'Restart' })
    expect(transition.machine.stored.suspension?.on).toEqual({ _tag: 'Activation' })
    expect(reasonOfSuspension(transition)).toStartWith("the unknown of the operation under 'charge' does not encode")
    expect(transition.machine.stored.mailbox).toEqual([])
  })

  test('an unknown that dies at an activation suspends the entity on the activation', () => {
    const base = tiny((message) => message, () => ({ charge: 'operation' }))
    const program: Program<Tiny> = {
      ...base,
      operations: {
        Work: operation.atMostOnce(() => Effect.succeed('done'), (): string => {
          throw new Error('no unknown')
        }),
      },
    }
    const created = Machine.start(program, 'tiny', null, epoch, by('creation'))
    if (created._tag !== 'Created') throw created._tag === 'Defect' ? created.cause : created.reply
    const transition = stepped({ ...created.machine, program, replies: new Map() }, { _tag: 'Restart' })
    expect(transition.machine.stored.suspension?.on).toEqual({ _tag: 'Activation' })
    expect(transition.machine.stored.mailbox).toEqual([])
  })
})

// A suspension stops the handling of messages and the timers, and the operations run to their end (decision 0113).
describe('what a suspension stops', () => {
  const bugs = (message: string) => (message === 'bug' ? defect('bug') : message)
  const working = (state: string): TinyWork =>
    state === 'start'
      ? { charge: 'operation', mail: 'operation', deadline: 'later timer' }
      : state === 'charged'
      ? { mail: 'operation', deadline: 'later timer' }
      : {}
  const suspended = () => handled(checked(bugs, working), { _tag: 'Receive', request: by('r'), message: 'bug' })

  test('an operation under way when the entity suspends runs to its end, and is kept at the resumption', () => {
    const died = suspended()
    // The timer leaves what runs, and the operations stay.
    expect(died.machine.running).toEqual({
      [Machine.keyText({ name: 'charge' })]: { kind: 'Operation', incarnation: 1 },
      [Machine.keyText({ name: 'mail' })]: { kind: 'Operation', incarnation: 2 },
    })
    const completed = stepped(died.machine, { _tag: 'Complete', key: { name: 'charge' }, incarnation: 1, message: 'charged' })
    expect(completed.outputs).toEqual([{ _tag: 'Recorded', key: { name: 'charge' }, incarnation: 1 }])
    expect(completed.machine.stored.mailbox.map((envelope) => envelope._tag)).toEqual(['Inbound', 'Internal'])
    expect(completed.machine.stored.suspension).toEqual(died.machine.stored.suspension)
    // Nothing is handled meanwhile.
    expect(stepped(completed.machine, { _tag: 'Handle', at }).machine).toBe(completed.machine)
    // The discard drops the message. The completion waits in the mailbox and `mail` still runs: neither is started
    // again, and the timer is armed again.
    const resumed = stepped(completed.machine, { _tag: 'Discard' })
    expect(resumed.machine.stored.suspension).toBeNull()
    expect(resumed.outputs.filter((output) => output._tag === 'Started')).toEqual([])
    expect(resumed.outputs).toContainEqual(expect.objectContaining({ _tag: 'Armed', key: { name: 'deadline' }, incarnation: 3 }))
    expect(resumed.machine.running[Machine.keyText({ name: 'mail' })]).toEqual({ kind: 'Operation', incarnation: 2 })
    const after = stepped(resumed.machine, { _tag: 'Handle', at })
    expect(after.machine.stored.state).toEqual({ last: 'charged' })
    expect(after.outputs).toContainEqual({ _tag: 'Delivered', key: { name: 'charge' }, incarnation: 1 })
  })

  test('an operation that dies while the entity is suspended leaves the suspension as it is, and runs again once resumed', () => {
    const died = suspended()
    const again = stepped(died.machine, { _tag: 'Die', key: { name: 'charge' }, incarnation: 1, cause: 'died too' })
    expect(again.outputs).toEqual([])
    expect(again.written).toBeNull()
    expect(again.machine.stored).toEqual(died.machine.stored)
    expect(again.machine.running).toEqual({ [Machine.keyText({ name: 'mail' })]: { kind: 'Operation', incarnation: 2 } })
    const resumed = stepped(again.machine, { _tag: 'Discard' })
    const started = resumed.outputs.flatMap((output) => (output._tag === 'Started' ? [output.key.name] : []))
    expect(started).toEqual(['charge'])
  })

  test('a restart keeps no operation of a suspended entity running, and the resumption starts them again', () => {
    const died = suspended()
    const restarted = stepped(died.machine, { _tag: 'Restart' })
    expect(restarted.machine.running).toEqual({})
    expect(restarted.machine.stored).toEqual(died.machine.stored)
    const resumed = stepped(restarted.machine, { _tag: 'Discard' })
    const started = resumed.outputs.flatMap((output) => (output._tag === 'Started' ? [output.key.name] : []))
    expect(started.sort()).toEqual(['charge', 'mail'])
  })
})

describe('discarding', () => {
  const breaksOnDone = (message: string) => (message === 'done' ? defect('broken') : message)
  const charging = (state: string): TinyWork => (state === 'start' ? { charge: 'operation' } : {})

  test('a completion the entity died on is not discarded: the operation acted, and would act again', () => {
    const machine = checked(breaksOnDone, charging)
    const died = handled(machine, { _tag: 'Complete', key: { name: 'charge' }, incarnation: 1, message: 'done' })
    expect(died.machine.stored.suspension?.on).toEqual({ _tag: 'Message' })
    const discarded = stepped(died.machine, { _tag: 'Discard' })
    expect(discarded.outputs).toEqual([])
    expect(discarded.machine).toBe(died.machine)
  })

  test('a fixed program gets the entity past the completion it died on', () => {
    const machine = checked(breaksOnDone, charging)
    const died = handled(machine, { _tag: 'Complete', key: { name: 'charge' }, incarnation: 1, message: 'done' })
    const resumed = resumedBy(died.machine, tiny((message) => message, charging))
    expect(resumed.machine.stored.suspension).toBeNull()
    expect(resumed.outputs.filter((output) => output._tag === 'Started')).toEqual([])
    const after = stepped(resumed.machine, { _tag: 'Handle', at })
    expect(after.machine.stored.state).toEqual({ last: 'done' })
    expect(after.outputs).toContainEqual({ _tag: 'Delivered', key: { name: 'charge' }, incarnation: 1 })
  })

  // The state before the firing holds the timer at its time, which has passed: armed again, it would fire at once.
  test("a timer's firing the entity died on is not discarded: the timer would fire again at once", () => {
    const machine = checked(
      (message) => (message === 'rang' ? defect('broken') : message),
      (state) => (state === 'start' ? { deadline: 'timer' } : {}),
    )
    const died = handled(machine, { _tag: 'Fire', key: { name: 'deadline' }, incarnation: 1 })
    expect(died.machine.stored.suspension?.on).toEqual({ _tag: 'Message' })
    const discarded = stepped(died.machine, { _tag: 'Discard' })
    expect(discarded.outputs).toEqual([])
    expect(discarded.machine).toBe(died.machine)
  })

  test('a fixed program gets the entity past the firing it died on', () => {
    const deadline = (state: string): TinyWork => (state === 'start' ? { deadline: 'timer' } : {})
    const machine = checked((message) => (message === 'rang' ? defect('broken') : message), deadline)
    const died = handled(machine, { _tag: 'Fire', key: { name: 'deadline' }, incarnation: 1 })
    const resumed = resumedBy(died.machine, tiny((message) => message, deadline))
    expect(resumed.machine.stored.suspension).toBeNull()
    expect(resumed.outputs.filter((output) => output._tag === 'Armed')).toEqual([])
    const after = stepped(resumed.machine, { _tag: 'Handle', at })
    expect(after.machine.stored.state).toEqual({ last: 'rang' })
    expect(after.outputs).toContainEqual({ _tag: 'Delivered', key: { name: 'deadline' }, incarnation: 1 })
  })

  test('an inbound message the entity died on is discarded, with no reply stored', () => {
    const machine = checked((message) => (message === 'go' ? defect('broken') : message), () => ({}))
    const died = handled(machine, { _tag: 'Receive', request: by('r'), message: 'go' })
    const discarded = stepped(died.machine, { _tag: 'Discard' })
    expect(discarded.machine.stored.suspension).toBeNull()
    expect(discarded.machine.stored.mailbox).toEqual([])
    expect(discarded.machine.replies).toEqual(new Map())
  })
})

describe('the keys a program declares', () => {
  const inbound = { _tag: 'Receive', request: by('r'), message: 'go' } as const

  test('a state that holds work under a key the program does not declare is a defect', () => {
    const machine = checked((message) => message, (state) => (state === 'start' ? {} : { charg: 'operation' }))
    const transition = handled(machine, inbound)
    expect(reasonOfSuspension(transition)).toBe(
      "the state holds work under 'charg', which the program does not declare",
    )
    expect(transition.machine.stored.state).toEqual({ last: 'start' })
    expect(transition.outputs.filter((output) => output._tag === 'Started')).toEqual([])
  })

  test('a key it does not declare is a defect even where it holds no work', () => {
    const machine = checked((message) => message, (state) => (state === 'start' ? {} : { charg: undefined } as never))
    expect(reasonOfSuspension(handled(machine, inbound))).toBe(
      "the state holds work under 'charg', which the program does not declare",
    )
  })

  test('a first state that holds one stores nothing', () => {
    const created = Machine.start(
      tiny((message) => message, () => ({ charg: 'operation' })),
      'tiny',
      null,
      epoch,
      by('creation'),
    )
    expect(created._tag).toBe('Defect')
    expect(created._tag === 'Defect' && created.cause instanceof InvariantDefect && created.cause.reason)
      .toBe("the state holds work under 'charg', which the program does not declare")
  })

  test('a deploy that stops declaring a key the state holds leaves the entity as it was', () => {
    const machine = checked((message) => message, () => ({ deadline: 'timer' }))
    const transition = stepped(machine, { _tag: 'Restart' }, { ...machine.program, keys: {} })
    expect(reasonOfSuspension(transition)).toBe(
      "the state holds work under 'deadline', which the program does not declare",
    )
    expect(transition.machine.stored).toEqual({ ...machine.stored, suspension: transition.machine.stored.suspension })
    expect(transition.machine.stored.suspension?.on).toEqual({ _tag: 'Activation' })
    expect(transition.outputs.filter((output) => output._tag === 'Armed')).toEqual([])
  })
})

describe('the runners a program gives', () => {
  const inbound = { _tag: 'Receive', request: by('r'), message: 'go' } as const
  // A cast lets a program through with no runner for an operation it holds: the machine admits none (decision
  // 0054).
  const unrun = (program: Program<Tiny>): Program<Tiny> => ({
    ...program,
    operations: {} as Program<Tiny>['operations'],
  })
  const missing = "the state holds the operation 'Work' under 'charge', which the program has no runner for"

  test('a state that holds an operation the program has no runner for is a defect, and starts nothing', () => {
    const machine = checked((message) => message, (state) => (state === 'start' ? {} : { charge: 'operation' }))
    const transition = handled({ ...machine, program: unrun(machine.program) }, inbound)
    expect(reasonOfSuspension(transition)).toBe(missing)
    expect(transition.machine.stored.state).toEqual({ last: 'start' })
    expect(transition.outputs.filter((output) => output._tag === 'Started')).toEqual([])
  })

  test('a first state that holds one stores nothing', () => {
    const created = Machine.start(
      unrun(tiny((message) => message, () => ({ charge: 'operation' }))),
      'tiny',
      null,
      epoch,
      by('creation'),
    )
    expect(created._tag === 'Defect' && created.cause instanceof InvariantDefect && created.cause.reason)
      .toBe(missing)
  })

  test('a deploy with no runner for an operation under way leaves the entity as it was', () => {
    const machine = checked((message) => message, () => ({ charge: 'operation' }))
    const transition = stepped(machine, { _tag: 'Restart' }, unrun(machine.program))
    expect(reasonOfSuspension(transition)).toBe(missing)
    expect(transition.machine.stored).toEqual({ ...machine.stored, suspension: transition.machine.stored.suspension })
    expect(transition.machine.stored.suspension?.on).toEqual({ _tag: 'Activation' })
    expect(transition.outputs.filter((output) => output._tag === 'Started')).toEqual([])
  })

  test('a timer needs no runner', () => {
    const machine = checked((message) => message, () => ({ deadline: 'timer' }))
    const transition = stepped(machine, { _tag: 'Restart' }, unrun(machine.program))
    expect(transition.machine.stored.suspension).toBeNull()
    expect(transition.outputs.map((output) => output._tag)).toEqual(['Armed'])
  })
})

describe('a suspended entity', () => {
  const accepted = { _tag: 'Accepted' } as const
  // Accepts `ok`, and dies on `bug`.
  const suspended = () => {
    const machine = checked((message) => (message === 'bug' ? defect('bug') : message), () => ({}))
    const answered = handled(machine, { _tag: 'Receive', request: by('first'), message: 'ok' })
    return handled(answered.machine, { _tag: 'Receive', request: by('second'), message: 'bug' }).machine
  }

  test('gives the replies it stored, and answers anything else Suspended', () => {
    const machine = suspended()
    expect(stepped(machine, { _tag: 'Receive', request: by('first'), message: 'ok' }).outputs)
      .toEqual([{ _tag: 'Replied', request: by('first'), reply: { _tag: 'Accepted' } }])
    expect(stepped(machine, { _tag: 'Receive', request: by('third'), message: 'ok' }).outputs)
      .toEqual([{ _tag: 'Replied', request: by('third'), reply: { _tag: 'Suspended' } }])
    expect(stepped(machine, { _tag: 'Create', request: by('creation') }).outputs)
      .toEqual([{ _tag: 'CreationReplied', request: by('creation'), reply: { _tag: 'Created' } }])
  })

  test('answers Suspended every caller waiting, and gives each its reply on a retry once resumed', () => {
    const machine = checked(
      (message) => (message === 'bug' ? defect('bug') : message),
      (state) => (state === 'start' ? { charge: 'operation' } : {}),
    )
    const receive = (requestId: string, message: string) =>
      ({ _tag: 'Receive', request: by(requestId), message }) as const
    // The operation's completion is ahead of them, so both wait in the mailbox (decision 0074).
    const completed = stepped(machine, { _tag: 'Complete', key: { name: 'charge' }, incarnation: 1, message: 'done' })
    const queued = stepped(stepped(completed.machine, receive('second', 'bug')).machine, receive('third', 'ok'))
    const died = stepped(stepped(queued.machine, { _tag: 'Handle', at }).machine, { _tag: 'Handle', at })
    for (const requestId of ['second', 'third']) {
      expect(died.outputs).toContainEqual({ _tag: 'Replied', request: by(requestId), reply: { _tag: 'Suspended' } })
    }
    const resumed = resumedBy(died.machine, { ...machine.program, update: (message) => () => ({ last: message }) })
    // A retry while its message is queued waits for the reply, which handling it gives.
    expect(stepped(resumed.machine, receive('third', 'ok')).outputs).toEqual([])
    const first = stepped(resumed.machine, { _tag: 'Handle', at })
    const second = stepped(first.machine, { _tag: 'Handle', at })
    expect(second.outputs).toContainEqual({ _tag: 'Replied', request: by('third'), reply: accepted })
    expect(stepped(second.machine, receive('third', 'ok')).outputs)
      .toEqual([{ _tag: 'Replied', request: by('third'), reply: accepted }])
  })

  test('an operation that dies answers Suspended every caller waiting', () => {
    const machine = checked((message) => message, () => ({ charge: 'operation', work: 'operation' }))
    // A completion is ahead of the message, which waits behind it (decision 0074).
    const completed = stepped(machine, { _tag: 'Complete', key: { name: 'work' }, incarnation: 2, message: 'done' })
    const queued = stepped(completed.machine, { _tag: 'Receive', request: by('r'), message: 'go' })
    const died = stepped(queued.machine, { _tag: 'Die', key: { name: 'charge' }, incarnation: 1, cause: 'died' })
    expect(died.outputs).toContainEqual({ _tag: 'Replied', request: by('r'), reply: { _tag: 'Suspended' } })
  })

  // The program is not the machine's: a fix is deployed, and the resumption is stepped by it (decision 0064).
  test('stays as it was through the deploy of a fix, and is resumed by the program deployed', () => {
    const machine = suspended()
    const fixed = { ...machine.program, update: (message: string) => () => ({ last: message }) }
    const deployed = stepped(machine, { _tag: 'Restart' }, fixed)
    expect(deployed.machine.stored).toBe(machine.stored)
    expect(deployed.outputs).toEqual([])
    expect(deployed.written).toBeNull()
    // Resumed by the program that died on it, it dies on it again; by the one deployed, it handles it.
    const again = stepped(stepped(machine, { _tag: 'Resume' }).machine, { _tag: 'Handle', at })
    expect(again.machine.stored.suspension?.on).toEqual({ _tag: 'Message' })
    const resumed = stepped(deployed.machine, { _tag: 'Resume' })
    expect(stepped(resumed.machine, { _tag: 'Handle', at }).machine.stored.state).toEqual({ last: 'bug' })
  })

  test('resumed with a fixed program, handles the message it died on', () => {
    const machine = suspended()
    const resumed = resumedBy(machine, { ...machine.program, update: (message) => () => ({ last: message }) })
    const transition = stepped(resumed.machine, { _tag: 'Handle', at })
    expect(transition.machine.stored.state).toEqual({ last: 'bug' })
    expect(transition.outputs).toContainEqual({
      _tag: 'Replied',
      request: by('second'),
      reply: { _tag: 'Accepted' },
    })
  })

  test('stays suspended when the fixed program dies on its state', () => {
    const machine = suspended()
    const broken = new Error('broken')
    const resumed = resumedBy(machine, {
      ...machine.program,
      work: () => {
        throw broken
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
    const transition = stepped(machine, { _tag: 'Restart' })
    expect(transition.machine.stored).toEqual(machine.stored)
    expect(transition.machine.running).toEqual(machine.running)
    expect(transition.outputs).toEqual([
      { _tag: 'Armed', key: { name: 'deadline' }, incarnation: 1, timer: timer(at, 'rang') },
      { _tag: 'Armed', key: { name: 'reminder' }, incarnation: 2, timer: timer(epoch, 'rang') },
    ])
  })
})

describe('a new program', () => {
  /** Restarts the entity with a program whose work on each state is `work`: a deploy. */
  const deployed = (machine: Entity, work: (state: string) => TinyWork) =>
    stepped(machine, { _tag: 'Restart' }, tiny((message) => message, work))

  test('restarts an operation it keeps equal under the same key', () => {
    const machine = checked((message) => message, () => ({ charge: 'operation' }))
    const transition = deployed(machine, () => ({ charge: 'operation' }))
    expect(transition.outputs).toContainEqual(
      expect.objectContaining({ _tag: 'Started', key: { name: 'charge' }, incarnation: 1 }),
    )
  })

  test('keeps an operation that differs only by what its schema does not store', () => {
    const machine = checked((message) => message, () => ({ charge: 'operation' }))
    const transition = deployed(machine, () => ({ charge: 'annotated operation' }))
    expect(transition.machine.stored.suspension).toBeNull()
    expect(transition.outputs).toContainEqual(
      expect.objectContaining({ _tag: 'Started', key: { name: 'charge' }, incarnation: 1 }),
    )
  })

  test('returning a key whose work was delivered starts new work, under a new key', () => {
    const machine = checked((message) => message, (state) => (state === 'start' ? { charge: 'operation' } : {}))
    const delivered = handled(machine, { _tag: 'Complete', key: { name: 'charge' }, incarnation: 1, message: 'charged' })
    const transition = deployed(delivered.machine, () => ({ charge: 'operation' }))
    expect(transition.outputs).toContainEqual(
      expect.objectContaining({ _tag: 'Started', key: { name: 'charge' }, incarnation: 2 }),
    )
  })

  test('a timer it changes is armed again, as new work', () => {
    const machine = checked((message) => message, () => ({ deadline: 'timer' }))
    const transition = deployed(machine, () => ({ deadline: 'later timer' }))
    expect(transition.outputs).toContainEqual(
      expect.objectContaining({ _tag: 'Armed', key: { name: 'deadline' }, incarnation: 2, timer: timer(at, 'rang') }),
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

  test('a droppable operation under way may be changed or dropped by a new program', () => {
    const machine = droppable((message) => message, () => ({ charge: 'operation' }))
    const by = (work: (state: string) => TinyWork) => {
      const base = tiny((message) => message, work)
      return stepped(machine, { _tag: 'Restart' }, {
        ...base,
        operations: { Work: operation.droppable(() => Effect.succeed('done')) },
      })
    }
    const changed = by(() => ({ charge: 'larger operation' }))
    expect(changed.machine.stored.suspension).toBeNull()
    expect(changed.outputs).toContainEqual(expect.objectContaining({ _tag: 'Started', key: { name: 'charge' }, incarnation: 2 }))
    const dropped = by(() => ({}))
    expect(dropped.machine.stored.suspension).toBeNull()
    expect(dropped.outputs.filter((output) => output._tag === 'Started')).toEqual([])
    // A program that delivers it otherwise starts it as the delivery it now declares, in the same incarnation: the
    // one stopped acted on nothing.
    const delivered = deployed(machine, () => ({ charge: 'operation' }))
    expect(delivered.machine.stored.suspension).toBeNull()
    expect(delivered.machine.stored.keys[Machine.keyText({ name: 'charge' })]).toMatchObject({ incarnation: 1, delivery: 'Idempotent' })
    expect(delivered.outputs).toContainEqual(expect.objectContaining({ _tag: 'Started', key: { name: 'charge' }, incarnation: 1 }))
    // The other way is a defect: an operation delivered otherwise may have acted.
    const plain = checked((message) => message, () => ({ charge: 'operation' }))
    const declared = stepped(plain, { _tag: 'Restart' }, {
      ...plain.program,
      operations: { Work: operation.droppable(() => Effect.succeed('done')) },
    })
    expect(reasonOfSuspension(declared)).toBe(
      "the program changed how the operation under 'charge' is delivered before its completion",
    )
  })

  test('an at-most-once operation that is new work at an activation starts: it never ran', () => {
    const machine = checked((message) => message, () => ({ deadline: 'timer' }))
    const program = machine.program
    const transition = stepped(machine, { _tag: 'Restart' }, {
      ...program,
      work: (state) => ({ ...program.work(state), mail: { _tag: 'Work', size: 1 } as const }),
      operations: { Work: operation.atMostOnce(() => Effect.succeed('done'), () => '?') },
    })
    expect(transition.outputs).toContainEqual(expect.objectContaining({ _tag: 'Started', key: { name: 'mail' }, incarnation: 2 }))
    expect(transition.machine.stored.mailbox).toEqual([])
  })

  test('changing how an operation under way is delivered is a defect', () => {
    const machine = checked((message) => message, () => ({ charge: 'operation' }))
    const program = machine.program
    const transition = stepped(machine, { _tag: 'Restart' }, {
      ...program,
      operations: { Work: operation.atMostOnce(() => Effect.succeed('done'), () => '?') },
    })
    expect(reasonOfSuspension(transition)).toBe(
      "the program changed how the operation under 'charge' is delivered before its completion",
    )
    expect(transition.outputs.filter((output) => output._tag === 'Started')).toEqual([])
  })

  test('an operation declared with its digest is started with the digest of its idempotency key', () => {
    const plain = checked((message) => message, () => ({ charge: 'operation' }))
    const program = { ...plain.program, operations: { Work: operation.digest(() => Effect.succeed('done')) } }
    const created = Machine.start(program, 'tiny', null, epoch, by('creation'))
    if (created._tag !== 'Created') throw created._tag === 'Defect' ? created.cause : created.reply
    const digest = Machine.digestOf(idempotencyKey({ name: 'Tiny', id: 'tiny' }, { name: 'charge' }, 1))
    const keysOf = (outputs: ReadonlyArray<Machine.Output<Tiny>>) =>
      outputs.flatMap((output) => (output._tag === 'Started' ? [output.idempotencyKey] : []))
    expect(keysOf(created.outputs)).toEqual([digest])
    // A restart starts the operation again under the same digest, as the stored delivery says.
    const machine: Entity = { ...created.machine, program, replies: new Map() }
    expect(keysOf(stepped(machine, { _tag: 'Restart' }).outputs)).toEqual([digest])
    expect(Machine.idempotencyKeyOf(machine, { name: 'charge' }, 1)).toBe(digest)
  })

  test("a renamed entity's work keeps the idempotency keys of the name its keys are drawn from (decision 0156)", () => {
    const plain = checked((message) => message, () => ({ charge: 'operation' }))
    const created = Machine.start(plain.program, 'tiny', null, epoch, by('creation'))
    if (created._tag !== 'Created') throw created._tag === 'Defect' ? created.cause : created.reply
    const first = idempotencyKey({ name: 'Tiny', id: 'tiny' }, { name: 'charge' }, 1)
    const keysOf = (outputs: ReadonlyArray<Machine.Output<Tiny>>) =>
      outputs.flatMap((output) => (output._tag === 'Started' ? [output.idempotencyKey] : []))
    expect(keysOf(created.outputs)).toEqual([first])
    // The launch renamed `Tiny` to `Small`: the entity holds the new name, and the name its keys are drawn from.
    const program = { ...plain.program, name: 'Small' }
    const stored = { ...created.machine.stored, name: 'Small', keyedAs: 'Tiny' }
    const machine: Entity = { ...created.machine, stored, program, replies: new Map() }
    expect(keysOf(stepped(machine, { _tag: 'Restart' }).outputs)).toEqual([first])
    expect(Machine.idempotencyKeyOf(machine, { name: 'charge' }, 1)).toBe(first)
  })

  test('declaring the digest of an operation under way is a defect, as changing its delivery is', () => {
    const machine = checked((message) => message, () => ({ charge: 'operation' }))
    const transition = stepped(machine, { _tag: 'Restart' }, {
      ...machine.program,
      operations: { Work: operation.digest(() => Effect.succeed('done')) },
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
    expect(reasonOfSuspension(stepped(machine, { _tag: 'Restart' }, renamed))).toBe(reason)
    const suspended = deployed(machine, () => ({ charge: 'larger operation' })).machine
    expect(reasonOfSuspension(resumedBy(suspended, renamed))).toBe(reason)
  })

  test('an entity it suspended is resumed by a program that keeps the operation', () => {
    const machine = checked((message) => message, () => ({ charge: 'operation' }))
    const suspended = deployed(machine, () => ({ charge: 'larger operation' })).machine
    const resumed = resumedBy(suspended, machine.program)
    expect(resumed.machine.stored.suspension).toBeNull()
    expect(resumed.outputs).toContainEqual(expect.objectContaining({ _tag: 'Started', key: { name: 'charge' }, incarnation: 1 }))
  })
})

/** The request named `name` of a run of an operation of another entity, which a reply is kept for (decision 0021). */
const ran = (program: string, name: string, incarnation = 1) =>
  ({ _tag: 'Operation', entity: { name: program, id: 'b1' }, key: { name: 'hold' }, incarnation, name }) as const

describe('who a request belongs to', () => {
  test('the same request id from different senders is different requests, each answered its own reply', () => {
    const machine = checked((message) => (message === 'no' ? reject : message), () => ({}))
    const first = handled(machine, { _tag: 'Receive', request: by('k'), message: 'no' })
    const second = handled(first.machine, { _tag: 'Receive', request: ran('Booking', 'k'), message: 'yes' })
    const third = handled(second.machine, { _tag: 'Receive', request: ran('Waitlist', 'k'), message: 'go' })
    const rejected = { _tag: 'Rejected', reason: null } as const
    const accepted = { _tag: 'Accepted' } as const
    expect(first.outputs).toContainEqual({ _tag: 'Replied', request: by('k'), reply: rejected })
    expect(second.outputs).toContainEqual({ _tag: 'Replied', request: ran('Booking', 'k'), reply: accepted })
    expect(third.outputs).toContainEqual({ _tag: 'Replied', request: ran('Waitlist', 'k'), reply: accepted })
    expect(third.machine.stored.state).toEqual({ last: 'go' })
  })

  test('two runs of an operation are different requests, though they give the same name', () => {
    const machine = checked((message) => message, () => ({}))
    const first = handled(machine, { _tag: 'Receive', request: ran('Booking', 'hold'), message: 'one' })
    const second = handled(first.machine, { _tag: 'Receive', request: ran('Booking', 'hold', 2), message: 'two' })
    expect(second.machine.stored.state).toEqual({ last: 'two' })
  })

  // Nothing parses a request back: it is a value, the same whoever built it, with its fields in any order.
  test('a request is the same as one that encodes alike, and a retry of it gets the stored reply', () => {
    const machine = checked((message) => message, () => ({}))
    const first = handled(machine, { _tag: 'Receive', request: ran('Booking', 'hold'), message: 'one' })
    const { name, incarnation, key, entity, _tag } = ran('Booking', 'hold')
    const again = stepped(first.machine, {
      _tag: 'Receive',
      request: { name, incarnation, key, entity: { id: entity.id, name: entity.name }, _tag },
      message: 'two',
    })
    expect(again.machine).toBe(first.machine)
    expect(again.outputs.map((output) => output._tag === 'Replied' && output.reply)).toEqual([{ _tag: 'Accepted' }])
  })

  // A sender whose schema is a record is written with its fields in the order they were set: the text a request is
  // keyed by orders them, so a caller is one caller however it builds its sender (decisions 0048, 0059).
  test("a caller's retry gets the stored reply, whatever the order of its sender's fields", () => {
    const base = tiny((message) => message, () => ({}))
    const program = {
      ...base,
      schemas: { ...base.schemas, sender: Schema.Record(Schema.String, Schema.String) },
    } as unknown as Program<Tiny>
    const caller = (sender: Readonly<Record<string, string>>, id: string) =>
      ({ _tag: 'Caller', sender, id }) as unknown as Request<null>
    const created = Machine.start(program, 'tiny', null, epoch, caller({ team: 'ops' }, 'creation'))
    if (created._tag !== 'Created') throw created._tag === 'Defect' ? created.cause : created.reply
    const machine: Entity = { ...created.machine, program, replies: new Map() }
    const first = handled(machine, {
      _tag: 'Receive',
      request: caller({ team: 'ops', user: 'ann' }, 'r'),
      message: 'one',
    })
    const again = stepped(first.machine, {
      _tag: 'Receive',
      request: caller({ user: 'ann', team: 'ops' }, 'r'),
      message: 'two',
    })
    expect(again.machine).toBe(first.machine)
    expect(again.outputs.map((output) => output._tag === 'Replied' && output.reply)).toEqual([{ _tag: 'Accepted' }])
  })

  // The machine holds no reply: what answers a retry is what storage read for it (decision 0065).
  test('a message is answered the reply it is given, and handled when it is given none', () => {
    const machine = checked((message) => message, () => ({}))
    const accepted = { _tag: 'Accepted' } as const
    const given = Machine.step(machine.program, machine, {
      _tag: 'Receive',
      request: by('r'),
      message: 'go',
      reply: accepted,
      at,
    })
    expect(given.machine).toBe(machine)
    expect(given.outputs).toEqual([{ _tag: 'Replied', request: by('r'), reply: accepted }])
    expect(given.written).toBeNull()
    const none = Machine.step(machine.program, machine, {
      _tag: 'Receive',
      request: by('r'),
      message: 'go',
      reply: null,
      at,
    })
    expect(none.outputs).toEqual([{ _tag: 'Replied', request: by('r'), reply: accepted }])
    expect(none.machine.stored.mailbox).toEqual([])
    expect(none.written?.queued).toEqual([])
    expect(Object.keys(none.machine.stored)).not.toContain('replies')
  })

  test('update reads who sent a request off it', () => {
    const seen: Array<unknown> = []
    const base = checked((message) => message, () => ({}))
    const machine = {
      ...base,
      program: {
        ...base.program,
        update: (message: string, meta: Parameters<Program<Tiny>['update']>[1]) => () => {
          seen.push(meta.from)
          return { last: message }
        },
      },
    }
    handled(machine, { _tag: 'Receive', request: ran('Booking', 'hold'), message: 'go' })
    handled(machine, { _tag: 'Receive', request: by('r'), message: 'go' })
    expect(seen).toEqual([{ _tag: 'Entity', entity: { name: 'Booking', id: 'b1' } }, { _tag: 'Caller', sender: null }])
  })

  // So its reply goes once that work no longer holds, which only the storage sees of another entity (decision 0021).
  test("a reply to another entity's operation says which work asked, and a caller's says none", () => {
    const machine = checked((message) => message, () => ({}))
    const operation = handled(machine, { _tag: 'Receive', request: ran('Booking', 'hold', 3), message: 'go' })
    expect(operation.written?.replies.map((reply) => reply.asked))
      .toEqual([{ name: 'Booking', id: 'b1', key: { name: 'hold' }, incarnation: 3 }])
    const caller = handled(machine, { _tag: 'Receive', request: by('r'), message: 'go' })
    expect(caller.written?.replies.map((reply) => reply.asked)).toEqual([null])
  })

  test('entities of two programs with the same id give their work different idempotency keys', () => {
    const charging = (state: string) => (state === 'start' ? {} : { charge: 'operation' as const })
    const started = (name: string) =>
      handled(checked((message) => message, charging, undefined, name), {
        _tag: 'Receive',
        request: by('r'),
        message: 'go',
      }).outputs.find((output) => output._tag === 'Started')
    const order = started('Order')
    const booking = started('Booking')
    expect(order?._tag === 'Started' && booking?._tag === 'Started').toBe(true)
    if (order?._tag === 'Started' && booking?._tag === 'Started') {
      expect(order.idempotencyKey).not.toBe(booking.idempotencyKey)
    }
  })
})

describe('how long a reply is kept (decision 0125)', () => {
  test("a caller's reply is kept for its keep from the step that answers it, and for ever without one", () => {
    const machine = checked((message) => message, () => ({}))
    const kept = handled(machine, { _tag: 'Receive', request: by('r'), message: 'go', keep: 500 })
    expect(kept.written?.replies.map((reply) => reply.until)).toEqual([DateTime.toEpochMillis(at) + 500])
    const forever = handled(machine, { _tag: 'Receive', request: by('r'), message: 'go' })
    expect(forever.written?.replies.map((reply) => reply.until)).toEqual([null])
  })

  test("another entity's reply has no time, whatever keep it is given: it goes with the work that asked", () => {
    const machine = checked((message) => message, () => ({}))
    const operation = handled(machine, { _tag: 'Receive', request: ran('Booking', 'hold'), message: 'go', keep: 500 })
    expect(operation.written?.replies.map((reply) => reply.until)).toEqual([null])
  })

  test('a message that waits in the mailbox keeps its keep there, and its time counts from the step', () => {
    const machine = checked(
      (message) => message,
      (state) => (state === 'start' ? { charge: 'operation' } : {}),
    )
    // The operation's completion is ahead of it, so the message waits in the mailbox (decision 0074).
    const completed = stepped(machine, { _tag: 'Complete', key: { name: 'charge' }, incarnation: 1, message: 'done' })
    const queued = stepped(completed.machine, { _tag: 'Receive', request: by('r'), message: 'go', keep: 500 })
    expect(queued.written?.queued).toEqual([expect.objectContaining({ _tag: 'Inbound', keep: 500 })])
    const later = DateTime.makeUnsafe(9_000)
    const first = stepped(queued.machine, { _tag: 'Handle', at: later })
    const second = stepped(first.machine, { _tag: 'Handle', at: later })
    expect(second.written?.replies.map((reply) => reply.until)).toEqual([9_500])
  })
})

describe('creation', () => {
  test('answers the request that created the entity Created, and stores nothing for the others', () => {
    const machine = checked((message) => message, () => ({}))
    const create = (request: Request<null>) => stepped(machine, { _tag: 'Create', request })
    expect(create(by('creation')).outputs)
      .toEqual([{ _tag: 'CreationReplied', request: by('creation'), reply: { _tag: 'Created' } }])
    // The same request id from another sender is another request.
    expect(create(ran('Booking', 'creation')).outputs)
      .toEqual([{ _tag: 'CreationReplied', request: ran('Booking', 'creation'), reply: { _tag: 'AlreadyExists' } }])
    expect(create(by('other')).machine).toBe(machine)
  })

  // A runtime waits for each apart: a reply to the one must not reach a caller of the other (decision 0050).
  test('a creation is answered apart from a message under the same request id', () => {
    const machine = checked((message) => message, () => ({}))
    expect(stepped(machine, { _tag: 'Create', request: by('creation') }).outputs)
      .toEqual([{ _tag: 'CreationReplied', request: by('creation'), reply: { _tag: 'Created' } }])
    const sent = handled(machine, { _tag: 'Receive', request: by('creation'), message: 'go' })
    expect(sent.outputs.filter((output) => output._tag === 'Replied' || output._tag === 'CreationReplied'))
      .toEqual([{ _tag: 'Replied', request: by('creation'), reply: { _tag: 'Accepted' } }])
  })

  test('a creation is not a message: its request id may be used again to send one', () => {
    const machine = checked((message) => message, () => ({}))
    const sent = handled(machine, { _tag: 'Receive', request: by('creation'), message: 'go' })
    expect(sent.machine.stored.state).toEqual({ last: 'go' })
  })
})

describe('what an event writes', () => {
  // The checks of a step encode what it stores, and publishing compares the projections before and after: what was
  // computed is kept by the value, and written as it is (decision 0057).
  test('a step that changes the state projects it once, and encodes it and its projection once', () => {
    const count = { projected: 0, state: 0, projection: 0 }
    const counted = (what: keyof typeof count) =>
      Schema.makeFilter(() => {
        count[what]++
        return true
      })
    const base = tiny((message) => message, () => ({}), (state) => {
      count.projected++
      return state
    })
    const program: Program<Tiny> = {
      ...base,
      schemas: {
        ...base.schemas,
        state: base.schemas.state.check(counted('state')),
        projection: base.schemas.projection.check(counted('projection')),
      },
    }
    const created = Machine.start(program, 'tiny', null, epoch, by('creation'))
    if (created._tag !== 'Created') throw created._tag === 'Defect' ? created.cause : created.reply
    const machine: Entity = { ...created.machine, program, replies: new Map() }
    count.projected = count.state = count.projection = 0
    const transition = handled(machine, { _tag: 'Receive', request: by('r'), message: 'go' })
    expect(transition.written?.published).toMatchObject({ projection: 'go', topics: ['projection'] })
    expect(count).toEqual({ projected: 1, state: 1, projection: 1 })
  })

  /** The rows of what is stored, as the machine encodes them: what a storage holds of the entity. */
  const table = (version: Program<T>, stored: Machine.Stored<T>) => {
    const written = Machine.writes(version, null, stored, null, null)
    if (written === null) throw new Error('an entity has rows')
    return {
      entity: written.entity,
      suspension: written.suspension?.on ?? null,
      keys: Object.fromEntries(written.keys.map((row) => [Machine.keyText(row.key), row])),
      incarnations: written.incarnations,
      mailbox: written.queued,
    }
  }

  type Table = ReturnType<typeof table>

  const applied = (rows: Table, written: Machine.Written): Table => ({
    entity: written.entity ?? rows.entity,
    suspension: written.suspension?.on ?? null,
    keys: Object.fromEntries(
      Object.entries({ ...rows.keys, ...Object.fromEntries(written.keys.map((row) => [Machine.keyText(row.key), row])) })
        .filter(([text]) => !written.gone.some((key) => Machine.keyText(key) === text)),
    ),
    incarnations: written.incarnations,
    mailbox: [...rows.mailbox.slice(written.handled), ...written.queued],
  })

  test('applied to the rows before the event, it gives the rows after it, and nothing when nothing changed', () =>
    property(({ trace }) => {
      for (const { program, before, after, written } of trace.slice(1)) {
        const was = table(program, before.stored)
        expect(written === null ? was : applied(was, written)).toEqual(table(program, after.stored))
      }
    }))

  // A storage gives back what a step wrote, and the machine holds none of it (decision 0065).
  test('a step writes the reply it answers the message it handles, and no other event writes one', () =>
    property(({ trace }) => {
      for (const { event, program, before, outputs, written } of trace.slice(1)) {
        const stored = outputs.flatMap((output) =>
          output._tag === 'Replied' && output.reply._tag !== 'Suspended' && handledBy(event, before) !== undefined
            ? [{
              request: Machine.requestKey(program, output.request),
              tag: output.reply._tag,
              reason: output.reply._tag === 'Rejected' ? output.reply.reason : null,
            }]
            : []
        )
        expect((written?.replies ?? []).map(({ request, tag, reason }) => ({ request, tag, reason })))
          .toEqual(stored)
      }
    }))

  test('it says which work ended, so that the replies to its requests go with it (decision 0021)', () =>
    property(({ trace }) => {
      for (const { before, after, written } of trace.slice(1)) {
        const ended = Object.values(before.stored.keys)
          .filter((held) => !Machine.holds(after.stored, held.key, held.incarnation))
          .map((held) => ({ key: held.key, incarnation: held.incarnation }))
        expect(written?.ended ?? []).toEqual(ended)
      }
    }))

  test('a step publishes what callers read when it changes, with the message it handled, and nothing else does', () =>
    property(({ trace }) => {
      const [creation, ...events] = trace
      expect(creation?.written?.published).toEqual({
        kind: 'Creation',
        message: null,
        projection: keys.length,
        topics: ['projection'],
      })
      for (const { event, program, before, after, written } of events) {
        const head = handledBy(event, before)
        const { project } = program
        const shows = head !== undefined && before.stored.state !== after.stored.state &&
          project(before.stored.state) !== project(after.stored.state)
        expect(written?.published ?? null).toEqual(
          shows
            ? {
              kind: head._tag,
              message: head.message,
              projection: project(after.stored.state),
              topics: ['projection'],
            }
            : null,
        )
      }
    }))

  test('a step that changes the state writes the row a query reads, and only such a step', () =>
    property(({ trace }) => {
      for (const { program, before, after, written } of trace.slice(1)) {
        expect(written?.shown ?? null).toEqual(
          before.stored.state === after.stored.state
            ? null
            : { projection: program.project(after.stored.state), indexes: {} },
        )
      }
    }))
})

// A key may take a parameter, and every piece of work of an entity draws its incarnation from one counter
// (decision 0132).
describe('topics of the log (decision 0138)', () => {
  // A tiny program whose log has two topics, each selecting of the projection, the last message: its length, and
  // its first letter.
  type Topical = Omit<Tiny, 'topics'> & Readonly<{ topics: Readonly<{ length: number; first: Json }> }>
  const topical = (first: (last: string) => Json = (last) => last.slice(0, 1)): Program<Topical> => ({
    ...tiny((message) => message, () => ({})),
    topics: { length: (last) => last.length, first },
  })
  const started = (program: Program<Topical>) => {
    const created = Machine.start(program, 'tiny', null, epoch, by('creation'))
    if (created._tag !== 'Created') throw created._tag === 'Defect' ? created.cause : created.reply
    return created
  }
  const step = (program: Program<Topical>, machine: Machine.Machine<Topical>, message: string) =>
    Machine.step(program, machine, { _tag: 'Receive', request: by(message), message, reply: null, at })

  test('a step is written in each topic whose selection changed, with the projection, and a creation in every topic', () => {
    const program = topical()
    const created = started(program)
    expect(created.written?.published).toEqual({
      kind: 'Creation',
      message: null,
      projection: 'start',
      topics: ['length', 'first'],
    })
    // The state and the projection change, and what no topic selects does: nothing is published.
    const shout = step(program, created.machine, 'shout')
    expect(shout.written?.shown?.projection).toBe('shout')
    expect(shout.written?.published).toBeNull()
    const go = step(program, shout.machine, 'go')
    expect(go.written?.published).toEqual({
      kind: 'Inbound',
      message: 'go',
      projection: 'go',
      topics: ['length', 'first'],
    })
    const gone = step(program, go.machine, 'gone')
    expect(gone.written?.published).toEqual({
      kind: 'Inbound',
      message: 'gone',
      projection: 'gone',
      topics: ['length'],
    })
  })

  test('a state a topic dies on, or selects what JSON does not hold of, is a defect, and is not stored', () => {
    const broken = new Error('broken')
    const dies = topical((last) => {
      if (last === 'go') throw broken
      return last.slice(0, 1)
    })
    const died = step(dies, started(dies).machine, 'go')
    expect(died.machine.stored.suspension?.cause).toBe(broken)
    expect(died.machine.stored.state).toEqual({ last: 'start' })
    expect(died.written?.published ?? null).toBeNull()
    // A cast lets through a value JSON does not hold.
    const unencoded = topical((last) => (last === 'go' ? new Date(0) : last.slice(0, 1)) as unknown as Json)
    const refused = step(unencoded, started(unencoded).machine, 'go')
    const cause = refused.machine.stored.suspension?.cause
    expect(cause instanceof InvariantDefect ? cause.reason : null).toContain("the topic 'first' does not encode")
    expect(refused.machine.stored.state).toEqual({ last: 'start' })
  })
})

describe('keys with a parameter', () => {
  // A message `+x` charges the line `x`, whose charge leaves once it completes with `charged x`. The shipment of
  // each line charged is a timer under `ship`, whose parameter `flip` writes with its properties in the other
  // order. `fee` arms or drops a timer under a key without a parameter.
  const lines = declare({
    state: Schema.Struct({ lines: Schema.Array(Schema.String), fee: Schema.Boolean, flipped: Schema.Boolean }),
    flags: Schema.Null,
    inbound: Schema.String,
    internal: Schema.String,
    operation: Schema.TaggedStruct('Charge', { line: Schema.String }),
    rejection: Schema.Never,
    sender: Schema.Null,
    projection: Schema.Number,
  })({
    name: 'Lines',
    keys: [
      'fee',
      keyWithParameter('charge', Schema.String),
      keyWithParameter('ship', Schema.Record(Schema.String, Schema.String)),
    ],
    init: () => ({ lines: [], fee: false, flipped: false }),
    update: (message) => (state) =>
      message === 'fee'
        ? { ...state, fee: !state.fee }
        : message === 'flip'
        ? { ...state, flipped: !state.flipped }
        : message.startsWith('+')
        ? { ...state, lines: [...state.lines, message.slice(1)] }
        : message.startsWith('charged ')
        ? { ...state, lines: state.lines.filter((line) => line !== message.slice('charged '.length)) }
        : state,
    work: (state) => ({
      fee: state.fee ? timer(at, 'due') : undefined,
      charge: state.lines.map((line) => [line, { _tag: 'Charge', line }] as const),
      ship: state.lines.map((line) => [state.flipped ? { box: 'one', line } : { line, box: 'one' }, timer(at, 'ship')]),
    }),
    operations: { Charge: operation(() => Effect.succeed('charged')) },
    project: (state) => state.lines.length,
    indexes: {},
  })
  type L = TypesOf<typeof lines>

  let requests = 0
  /** A message from a caller, handled as it arrives. */
  const send = (message: string): Machine.Event<L> =>
    ({ _tag: 'Receive', request: by(`r-${++requests}`), message, reply: null, at })
  /** The events, stepped in order, from the creation of the entity. */
  const run = (events: ReadonlyArray<Machine.Event<L>>) => {
    const created = Machine.start(lines, 'l', null, epoch, by('creation'))
    if (created._tag !== 'Created') throw created._tag === 'Defect' ? created.cause : created.reply
    let machine = created.machine
    const transitions: Array<Machine.Transition<L>> = []
    for (const event of events) {
      const transition = Machine.step(lines, machine, event)
      transitions.push(transition)
      machine = transition.machine
    }
    return { machine, transitions }
  }
  const begun = (transition: Machine.Transition<L> | undefined) =>
    (transition?.outputs ?? []).flatMap((output) =>
      output._tag === 'Started' || output._tag === 'Armed' ? [[output.key, output.incarnation]] : []
    )
  const charge = { name: 'charge', parameter: 'a' }
  const ship = { name: 'ship', parameter: { box: 'one', line: 'a' } }
  const fee = { name: 'fee' }

  test('holds a piece of work for each parameter, under the name and the encoded parameter', () => {
    const { machine, transitions } = run([send('+a'), send('+b')])
    expect(Object.values(machine.stored.keys).map((held) => held.key)).toEqual([
      charge,
      { name: 'charge', parameter: 'b' },
      ship,
      { name: 'ship', parameter: { box: 'one', line: 'b' } },
    ])
    expect(begun(transitions[1])).toEqual([
      [{ name: 'charge', parameter: 'b' }, 3],
      [{ name: 'ship', parameter: { box: 'one', line: 'b' } }, 4],
    ])
    // The key is JSON in the idempotency key, not a string of it, and a key without a parameter is its name.
    expect(String(Machine.idempotencyKeyOf(machine, charge, 1))).toBe('["Lines","l",["charge","a"],1]')
    expect(String(idempotencyKey({ name: 'Lines', id: 'l' }, fee, 5))).toBe('["Lines","l","fee",5]')
    expect(Machine.keyOf(lines, 'charge', 'a')).toEqual(charge)
    expect(Machine.keyOf(lines, 'fee')).toEqual(fee)
  })

  // Nothing tells a key with a parameter from a name by its text, so a name may read as one (decision 0136).
  test('a name that reads as the JSON of a key with a parameter is a key of its own', () => {
    const bracketed = { ...lines, keys: { ...lines.keys, '["charge","a"]': null } } as unknown as Program<L>
    const work = (state: L['state']) => ({ ...lines.work(state), '["charge","a"]': timer(at, 'odd') })
    const program = { ...bracketed, work } as Program<L>
    const created = Machine.start(program, 'l', null, epoch, by('creation'))
    if (created._tag !== 'Created') throw created._tag === 'Defect' ? created.cause : created.reply
    const added = Machine.step(program, created.machine, send('+a'))
    expect(Object.values(added.machine.stored.keys).map((held) => held.key)).toEqual([
      charge,
      ship,
      { name: '["charge","a"]' },
    ])
  })

  test('a key that leaves loses its row, and comes back in an incarnation no run of it had', () => {
    const { machine, transitions } = run([
      send('+a'),
      send('fee'),
      { _tag: 'Complete', key: charge, incarnation: 1, message: 'charged a' },
      { _tag: 'Handle', at },
      send('fee'),
      send('+a'),
      send('fee'),
    ])
    const [added, paid, , charged, unpaid, again, repaid] = transitions
    expect(begun(added)).toEqual([[charge, 1], [ship, 2]])
    expect(begun(paid)).toEqual([[fee, 3]])
    expect(charged?.machine.stored.keys[Machine.keyText(charge)]).toBeUndefined()
    expect(charged?.written?.gone).toEqual([charge, ship])
    expect(unpaid?.written?.gone).toEqual([fee])
    expect(unpaid?.machine.stored.keys).toEqual({})
    expect(begun(again)).toEqual([[charge, 4], [ship, 5]])
    expect(begun(repaid)).toEqual([[fee, 6]])
    expect(machine.stored.incarnations).toBe(6)
    // A late message of a first run is dropped, since its incarnation is no longer the key's.
    for (const [key, incarnation] of [[charge, 1], [ship, 2], [fee, 3]] as const) {
      const late = Machine.step(lines, machine, { _tag: 'Complete', key, incarnation, message: 'charged a' })
      expect(late.outputs).toEqual([{ _tag: 'Dropped', key, incarnation }])
    }
  })

  test('a parameter is compared by its JSON: one that encodes alike keeps its work', () => {
    const { transitions } = run([send('+a'), send('flip')])
    const [added, flipped] = transitions
    expect(begun(flipped)).toEqual([])
    expect(flipped?.machine.stored.keys).toEqual(added?.machine.stored.keys)
    expect(flipped?.written?.keys).toEqual([])
  })

  test('a parameter its schema refuses, two that encode alike, or no list under such a key is a defect', () => {
    const work = { _tag: 'Charge', line: 'a' } as const
    const broken: ReadonlyArray<readonly [() => unknown, string]> = [
      [() => ({ charge: [[7, work]] }), "parameter of the key 'charge'"],
      [() => ({ charge: [['a', work], ['a', work]] }), `the state holds two pieces of work under '["charge","a"]'`],
      [() => ({ charge: work }), "the state holds no list of work under 'charge', which takes a parameter"],
      [() => ({ fee: [['a', work]] }), "the state holds what is no work under 'fee'"],
      [() => ({ charge: [['a']] }), "the state holds what is no pair of a parameter and its work under 'charge'"],
      [() => ({ charge: [['a', work, work]] }), "the state holds what is no pair of a parameter and its work under 'charge'"],
    ]
    for (const [given, reason] of broken) {
      const program = { ...lines, work: given as Program<L>['work'] }
      const created = Machine.start(program, 'l', null, epoch, by('creation'))
      const cause = created._tag === 'Defect' ? created.cause : null
      expect(cause instanceof InvariantDefect ? cause.reason : String(cause)).toContain(reason)
    }
  })
})

// The digests were computed apart from this code, with Python's `hashlib` and `base64.urlsafe_b64encode`: a
// digest that changed would run an operation under way again under a new key (decision 0123).
test('the digest of an idempotency key is the SHA-256 of its JSON, in unpadded base64url (decision 0123)', () => {
  const of = (id: string): string => Machine.digestOf(idempotencyKey({ name: 'Order', id }, { name: 'charge' }, 1))
  expect(of('42')).toBe('HCSqboASEfxZ9VbqnZMHHhT3RAKlBw43wTMZfFDyotw')
  expect(of('caf\u00e9 \u2713')).toBe('3Hq7WV5mz3BQ1-DHpJ_MmRiZTcPfyVJqXEzyGfsxlhE')
  // JSON escapes a lone surrogate, which UTF-8 would turn into U+FFFD: two such ids keep two digests.
  expect(of('\ud800')).toBe('UShS5of2cuLYI16He18FfxZFLveZ8HXnS11ev3539r0')
  expect(of('\udbff')).not.toBe(of('\ud800'))
  expect(of('x'.repeat(1000))).toMatch(/^[A-Za-z0-9_-]{43}$/)
})

// A key's text and its idempotency key are what the work under way is found by after a restart: two parameters
// that are one value must give one, and two values two (decisions 0123, 0136).
test('a key is one text for one parameter, whatever the order of its fields, and an idempotency key one digest', () => {
  const slots = declare({
    state: Schema.Struct({}),
    flags: Schema.Null,
    inbound: Schema.Literal('Go'),
    internal: Schema.Literal('Booked'),
    operation: Schema.TaggedStruct('Book', {}),
    projection: Schema.Null,
  })({
    name: 'Slots',
    keys: [keyWithParameter('slot', Schema.Record(Schema.String, Schema.Int))],
    init: () => ({}),
    update: () => (state) => state,
    work: () => ({ slot: [] }),
    operations: { Book: operation(() => Effect.succeed('Booked' as const)) },
    project: () => null,
  })
  const field = fc.string({ unit: 'binary', maxLength: 4 })
  const parameter = fc.dictionary(field, fc.integer({ min: -3, max: 3 }), { maxKeys: 5 })
  fc.assert(
    fc.property(parameter, parameter, fc.string({ unit: 'binary' }), fc.nat(3), (left, right, id, incarnation) => {
      const reversed = Object.fromEntries(Object.entries(left).reverse())
      const text = (value: object) => Machine.keyText(Machine.keyOf(slots, 'slot', value))
      expect(text(reversed)).toBe(text(left))
      const alike = JSON.stringify(Object.entries(left).sort()) === JSON.stringify(Object.entries(right).sort())
      expect(text(left) === text(right)).toBe(alike)
      // JSON escapes a lone surrogate, so the key is text UTF-8 writes as it is, and its digest tells it apart.
      const keyed = (value: object) =>
        idempotencyKey({ name: 'Slots', id }, Machine.keyOf(slots, 'slot', value), incarnation)
      expect(keyed(left)).toMatch(/^[^\p{Cs}]*$/u)
      expect(Machine.digestOf(keyed(left)) === Machine.digestOf(keyed(right))).toBe(alike)
      expect(Machine.digestOf(keyed(left))).toMatch(/^[A-Za-z0-9_-]{43}$/)
    }),
    { numRuns: 2_000 },
  )
})
