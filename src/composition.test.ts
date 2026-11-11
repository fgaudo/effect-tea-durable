/**
 * The laws of composition (decision 0133): a parent with one child and nothing of its own does what the child does,
 * up to its messages, work and keys being wrapped, and a child of a child does what it does as a child of the
 * parent, wrapped twice. Then what a parent of children by id adds: routing by id, its events and its external
 * messages, the keys it derives, and the names it refuses.
 */
import { expect, test } from 'bun:test'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Optic from 'effect/Optic'
import * as Schema from 'effect/Schema'
import fc from 'fast-check'
import { accepted, rehearse } from './rehearse.ts'
import {
  andThen,
  child,
  defect,
  each,
  forEach,
  InvariantDefect,
  isRejected,
  isTimer,
  type Meta,
  noWork,
  operation,
  part,
  program,
  raise,
  reject,
  rejectWith,
  type Step,
  timer,
  key,
} from './program.ts'

const at = DateTime.makeUnsafe(0)
const meta: Meta<unknown> = { at, from: { _tag: 'Self' } }

const LineState = Schema.Struct({
  quantity: Schema.Int,
  charging: Schema.Boolean,
  charged: Schema.NullOr(Schema.String),
  reminders: Schema.Array(Schema.String),
})
type LineState = typeof LineState.Type

const LineInbound = Schema.Union([
  Schema.TaggedStruct('Added', { quantity: Schema.Int }),
  Schema.TaggedStruct('ChargeRequested', {}),
  Schema.TaggedStruct('ReminderSet', { who: Schema.String }),
])
const LineInternal = Schema.Union([
  Schema.TaggedStruct('Charged', { charge: Schema.String }),
  Schema.TaggedStruct('Reminded', { who: Schema.String }),
])
const Charge = Schema.TaggedStruct('Charge', { quantity: Schema.Int })
const LineCharged = Schema.TaggedStruct('LineCharged', { charge: Schema.String })
const Emptied = Schema.TaggedStruct('Emptied', {})
const LineProjection = Schema.Struct({ quantity: Schema.Int, charged: Schema.NullOr(Schema.String) })

/**
 * A line of an order: a part with a key of its own and a key with a parameter, an operation and timers, a reason of
 * its own, an event for its parent, and an external message its parent sends it.
 */
const line = part({
  state: LineState,
  flags: Schema.Null,
  inbound: LineInbound,
  internal: LineInternal,
  operation: Charge,
  rejection: Schema.Literal('Empty'),
  projection: LineProjection,
  event: LineCharged,
  external: Emptied,
})({
  keys: ['charge', key('reminder', Schema.String)],
  init: () => ({ quantity: 0, charging: false, charged: null, reminders: [] }),
  update: (message) => (state) => {
    switch (message._tag) {
      case 'Added':
        return state.charging || state.charged !== null ? reject : { ...state, quantity: state.quantity + message.quantity }
      case 'ChargeRequested':
        return state.quantity === 0
          ? rejectWith('Empty' as const)
          : state.charging || state.charged !== null
          ? reject
          : { ...state, charging: true }
      case 'ReminderSet':
        return state.reminders.includes(message.who) ? reject : { ...state, reminders: [...state.reminders, message.who] }
      case 'Charged':
        return state.charging
          ? raise({ _tag: 'LineCharged' as const, charge: message.charge })({
            ...state,
            charging: false,
            charged: message.charge,
          })
          : defect('a charge completed while nothing was charging')
      case 'Reminded':
        return state.reminders.includes(message.who)
          ? { ...state, reminders: state.reminders.filter((who) => who !== message.who) }
          : defect('a reminder fired that nobody set')
      case 'Emptied':
        return state.charging ? state : { ...state, quantity: 0 }
    }
  },
  work: (state) => ({
    charge: state.charging ? Charge.make({ quantity: state.quantity }) : undefined,
    reminder: state.reminders.map((who) => [who, timer(at, { _tag: 'Reminded' as const, who })] as const),
  }),
  operations: {
    Charge: operation((charge) => Effect.succeed({ _tag: 'Charged' as const, charge: `charge-${charge.quantity}` })),
  },
  project: (state) => ({ quantity: state.quantity, charged: state.charged }),
})

type LineMessage = typeof LineInbound.Type | typeof LineInternal.Type

const lineMessage: fc.Arbitrary<LineMessage> = fc.oneof(
  fc.record({ _tag: fc.constant('Added' as const), quantity: fc.integer({ min: 0, max: 3 }) }),
  fc.constant({ _tag: 'ChargeRequested' as const }),
  fc.record({ _tag: fc.constant('ReminderSet' as const), who: fc.constantFrom('ann', 'bob') }),
  fc.record({ _tag: fc.constant('Charged' as const), charge: fc.constantFrom('c-1', 'c-2') }),
  fc.record({ _tag: fc.constant('Reminded' as const), who: fc.constantFrom('ann', 'bob') }),
)

/** What a step gives, as data: its rejection, its defect, or its state and events. */
const outcome = (run: () => unknown) => {
  try {
    const result = run()
    if (isRejected(result)) return { _tag: 'Rejected', reason: result === reject ? null : result.reason }
    const raised = typeof result === 'object' && result !== null && 'events' in result && 'state' in result
    return raised
      ? { _tag: 'Stepped', state: result.state, events: result.events }
      : { _tag: 'Stepped', state: result, events: [] }
  } catch (cause) {
    if (cause instanceof InvariantDefect) return { _tag: 'Defect', reason: cause.reason }
    throw cause
  }
}

/** A part as the law reads it, its types out of the way. */
type AnyPart = Readonly<{
  init: (flags: null, at: DateTime.Utc) => unknown
  update: (message: unknown, meta: Meta<unknown>) => (state: unknown) => unknown
  work: (state: unknown) => Readonly<Record<string, unknown>>
  project: (state: unknown) => unknown
}>

/**
 * How a child is seen from a parent: its messages wrapped, its state found in the parent's, its keys renamed and
 * its work lifted, and its reasons wrapped. Each is the composition's rule, written out here once.
 */
type Lens = Readonly<{
  wrap: (message: unknown) => unknown
  focus: (state: unknown) => unknown
  key: (name: string) => string
  work: (work: unknown) => unknown
  reason: (reason: unknown) => unknown
}>

const wrappedBy = (name: string): Lens => ({
  wrap: (message) => ({ _tag: name, message }),
  focus: (state) => (state as Readonly<Record<string, unknown>>)[name.toLowerCase()],
  key: (key) => `${name}.${key}`,
  work: (work) =>
    isTimer(work)
      ? timer(work.at, { _tag: name, message: work.message })
      : { _tag: `${name}.${(work as { _tag: string })._tag}`, operation: work },
  reason: (reason) => ({ _tag: name, reason }),
})

const then = (outer: Lens, inner: Lens): Lens => ({
  wrap: (message) => outer.wrap(inner.wrap(message)),
  focus: (state) => inner.focus(outer.focus(state)),
  key: (key) => outer.key(inner.key(key)),
  work: (work) => outer.work(inner.work(work)),
  reason: (reason) => outer.reason(inner.reason(reason)),
})

const lifted = (lens: Lens, work: Readonly<Record<string, unknown>>) =>
  Object.fromEntries(
    Object.entries(work)
      .filter(([, held]) => held !== undefined)
      .map(([key, held]) => [
        lens.key(key),
        Array.isArray(held) ? held.map(([parameter, piece]) => [parameter, lens.work(piece)]) : lens.work(held),
      ]),
  )

/**
 * The law: on any sequence of the child's messages, the parent, given each wrapped, rejects what the child rejects
 * with the reason wrapped, dies where the child dies, holds the child's state where the lens finds it, raises its
 * events, holds its work lifted under its keys renamed, and projects what it projects.
 */
const behavesAs = (alone: AnyPart, composed: AnyPart, lens: Lens) =>
  fc.assert(
    fc.property(fc.array(lineMessage, { maxLength: 30 }), (messages) => {
      let mine: unknown = alone.init(null, at)
      let theirs: unknown = composed.init(null, at)
      for (const message of messages) {
        const own = outcome(() => alone.update(message, meta)(mine))
        const seen = outcome(() => composed.update(lens.wrap(message), meta)(theirs))
        if (own._tag === 'Stepped' && seen._tag === 'Stepped') {
          expect(lens.focus(seen.state)).toEqual(own.state)
          expect(seen.events).toEqual(own.events)
          mine = own.state
          theirs = seen.state
        } else if (own._tag === 'Rejected') {
          expect(seen).toEqual({ _tag: 'Rejected', reason: own.reason === null ? null : lens.reason(own.reason) })
        } else {
          expect(seen).toEqual(own)
        }
        expect(composed.work(theirs)).toEqual(lifted(lens, alone.work(mine)))
        expect(composed.project(theirs)).toEqual(alone.project(mine))
      }
    }),
  )

const Single = Schema.Struct({ line: LineState })

/** A parent with one child and nothing of its own, which passes the child's events on. */
const single = part({
  state: Single,
  flags: Schema.Null,
  inbound: Schema.Never,
  internal: Schema.Never,
  operation: Schema.Never,
  rejection: Schema.Never,
  projection: LineProjection,
  event: LineCharged,
})({
  keys: [],
  children: { Line: child(line, { at: Optic.id<typeof Single.Type>().key('line') }) },
  init: (flags, at) => ({ line: line.init(flags, at) }),
  update: () => () => defect('a parent with no messages of its own'),
  work: () => noWork,
  operations: {},
  project: (state, children) => children.Line(state),
  onEvent: { Line: (event) => raise(event) },
})

test('a parent with one child and nothing of its own does what the child does (decision 0133)', () => {
  behavesAs(line as unknown as AnyPart, single as unknown as AnyPart, wrappedBy('Line'))
})

const Nested = Schema.Struct({ single: Single })

const nested = part({
  state: Nested,
  flags: Schema.Null,
  inbound: Schema.Never,
  internal: Schema.Never,
  operation: Schema.Never,
  rejection: Schema.Never,
  projection: LineProjection,
  event: LineCharged,
})({
  keys: [],
  children: { Single: child(single, { at: Optic.id<typeof Nested.Type>().key('single') }) },
  init: (flags, at) => ({ single: single.init(flags, at) }),
  update: () => () => defect('a parent with no messages of its own'),
  work: () => noWork,
  operations: {},
  project: (state, children) => children.Single(state),
  onEvent: { Single: (event) => raise(event) },
})

test('a child of a child does what it does as a child of the parent, wrapped twice (decision 0133)', () => {
  behavesAs(line as unknown as AnyPart, nested as unknown as AnyPart, then(wrappedBy('Single'), wrappedBy('Line')))
})

test('a parent with no own message leaves out update, and its children and events keep their types (decision 0202)', () => {
  const Shelf = Schema.Struct({ line: LineState, charges: Schema.Array(Schema.String) })
  const own = { state: Shelf, flags: Schema.Null, inbound: Schema.Never, projection: LineProjection }
  const pieces = {
    children: { Line: child(line, { at: Optic.id<typeof Shelf.Type>().key('line') }) },
    init: (flags: null, at: DateTime.Utc) => ({ line: line.init(flags, at), charges: [] }),
    project: (state: typeof Shelf.Type, children: { Line: (state: typeof Shelf.Type) => typeof LineProjection.Type }) =>
      children.Line(state),
  }
  const shelf = program(own)({
    ...pieces,
    name: 'Shelf',
    keys: [],
    onEvent: {
      Line: (event) => (state) => {
        // @ts-expect-error the child's event keeps its type, which has no such field
        expect(event.missing).toBeUndefined()
        return { ...state, charges: [...state.charges, event.charge] }
      },
    },
  })
  const self = { at, from: { _tag: 'Self' } } as const
  const empty = { line: line.init(null, at), charges: [] }
  const step = shelf.update({ _tag: 'Line', message: { _tag: 'Added', quantity: 2 } }, self)(empty)
  expect(outcome(() => step)).toEqual({
    _tag: 'Stepped',
    state: { line: { quantity: 2, charging: false, charged: null, reminders: [] }, charges: [] },
    events: [],
  })
  const charged = shelf.update({ _tag: 'Line', message: { _tag: 'Charged', charge: 'c-1' } }, self)({
    line: { quantity: 2, charging: true, charged: null, reminders: [] },
    charges: [],
  })
  expect(charged).toEqual({ line: { quantity: 2, charging: false, charged: 'c-1', reminders: [] }, charges: ['c-1'] })
  const handled = { Line: () => (state: typeof Shelf.Type) => state }
  const whole = program(own)({ ...pieces, name: 'Whole', onEvent: handled })
  // @ts-expect-error a parent with a message of its own says how it handles it
  const inbound = program({ ...own, inbound: Schema.TaggedStruct('Emptied', {}) })({ ...pieces, name: 'A', onEvent: handled })
  // @ts-expect-error a parent with an internal message of its own says how it handles it
  const internal = program({ ...own, internal: Schema.TaggedStruct('Emptied', {}) })({ ...pieces, name: 'B', onEvent: handled })
  expect([whole, inbound, internal]).toHaveLength(3)
})

test("a child's runner answers its parent with the child's message, wrapped", async () => {
  const runner = single.operations['Line.Charge']
  expect(runner.delivery).toBe('Idempotent')
  const lifted = { _tag: 'Line.Charge' as const, operation: Charge.make({ quantity: 2 }) }
  const answer = await Effect.runPromise(
    (runner.run as (operation: unknown, key: unknown) => Effect.Effect<unknown>)(lifted, 'key'),
  )
  expect(answer).toEqual({ _tag: 'Line', message: { _tag: 'Charged', charge: 'charge-2' } })
})

const Order = Schema.Struct({
  lines: Schema.Record(Schema.String, LineState),
  charged: Schema.Int,
})
type Order = typeof Order.Type

const OrderInbound = Schema.Union([
  Schema.TaggedStruct('LineAdded', { id: Schema.String }),
  Schema.TaggedStruct('LineRemoved', { id: Schema.String }),
  Schema.TaggedStruct('Emptied', {}),
])

const OrderProjection = Schema.Struct({ lines: Schema.Int, quantity: Schema.Int, charged: Schema.Int })

/** An order of lines by id: it adds them, counts the charged ones, and empties them all at once. */
const order = program({
  state: Order,
  flags: Schema.Null,
  inbound: OrderInbound,
  internal: Schema.Never,
  operation: Schema.Never,
  rejection: Schema.Never,
  sender: Schema.Null,
  projection: OrderProjection,
})({
  name: 'Order',
  keys: [],
  children: {
    Line: each(line, { id: Schema.String, at: Optic.id<Order>().key('lines').compose(Optic.entries()) }),
  },
  init: () => ({ lines: {}, charged: 0 }),
  update: (message, { at }, children) => (state) => {
    switch (message._tag) {
      case 'LineAdded':
        return Object.hasOwn(state.lines, message.id)
          ? reject
          : { ...state, lines: { ...state.lines, [message.id]: line.init(null, at) } }
      case 'LineRemoved': {
        if (!Object.hasOwn(state.lines, message.id)) return reject
        const { [message.id]: _, ...lines } = state.lines
        return { ...state, lines }
      }
      case 'Emptied':
        return Object.keys(state.lines).reduce(
          (next, id) => children.Line.update(id, { _tag: 'Emptied' })(next),
          state,
        )
    }
  },
  work: () => noWork,
  operations: {},
  project: (state, children) => ({
    lines: Object.keys(state.lines).length,
    quantity: Object.keys(state.lines).reduce((sum, id) => sum + children.Line(state, id).quantity, 0),
    charged: state.charged,
  }),
  indexes: {},
  onEvent: { Line: () => (state) => ({ ...state, charged: state.charged + 1 }) },
})

/** The steps of `messages` from the order's first state, each from the one before. */
const after = (...messages: ReadonlyArray<typeof order.schemas.inbound.Type | typeof order.schemas.internal.Type>) =>
  messages.reduce((state: unknown, message) => {
    const next = order.update(message, { at, from: { _tag: 'Self' } })(state as Order)
    if (isRejected(next)) throw new Error(`rejected: ${JSON.stringify(message)}`)
    return next
  }, order.init(null, at)) as Order

test('a message to a child by id reaches that child, and one to a child that is not there is rejected', () => {
  const state = after(
    { _tag: 'LineAdded', id: 'a' },
    { _tag: 'LineAdded', id: 'b' },
    { _tag: 'Line', id: 'b', message: { _tag: 'Added', quantity: 2 } },
  )
  expect(state.lines['a']!.quantity).toBe(0)
  expect(state.lines['b']!.quantity).toBe(2)
  const absent = order.update({ _tag: 'Line', id: 'c', message: { _tag: 'Added', quantity: 1 } }, meta as never)(state)
  expect(absent).toBe(reject)
})

test("a child's reason reaches the caller wrapped, with the child's id", () => {
  const state = after({ _tag: 'LineAdded', id: 'a' })
  const rejected = order.update({ _tag: 'Line', id: 'a', message: { _tag: 'ChargeRequested' } }, meta as never)(state)
  expect(rejected).toEqual(rejectWith({ _tag: 'Line', id: 'a', reason: 'Empty' }))
  expect(order.schemas.rejection).toBeDefined()
})

test("a child by id's keys take its id, and its id beside the key's own parameter", () => {
  const state = after(
    { _tag: 'LineAdded', id: 'a' },
    { _tag: 'Line', id: 'a', message: { _tag: 'Added', quantity: 1 } },
    { _tag: 'Line', id: 'a', message: { _tag: 'ChargeRequested' } },
    { _tag: 'Line', id: 'a', message: { _tag: 'ReminderSet', who: 'ann' } },
  )
  expect(Object.keys(order.keys).sort()).toEqual(['Line.charge', 'Line.reminder'])
  expect(order.work(state)).toEqual({
    'Line.charge': [['a', { _tag: 'Line.Charge', id: 'a', operation: { _tag: 'Charge', quantity: 1 } }]],
    'Line.reminder': [[['a', 'ann'], timer(at, { _tag: 'Line', id: 'a', message: { _tag: 'Reminded', who: 'ann' } })]],
  })
})

test("a child's event is handled by its parent in the same step", () => {
  const state = after(
    { _tag: 'LineAdded', id: 'a' },
    { _tag: 'Line', id: 'a', message: { _tag: 'Added', quantity: 1 } },
    { _tag: 'Line', id: 'a', message: { _tag: 'ChargeRequested' } },
    { _tag: 'Line', id: 'a', message: { _tag: 'Charged', charge: 'c-1' } },
  )
  expect(state.charged).toBe(1)
  expect(state.lines['a']!.charged).toBe('c-1')
})

test('a parent tells its children an external message, and projects from their projections', () => {
  const state = after(
    { _tag: 'LineAdded', id: 'a' },
    { _tag: 'LineAdded', id: 'b' },
    { _tag: 'Line', id: 'a', message: { _tag: 'Added', quantity: 1 } },
    { _tag: 'Line', id: 'b', message: { _tag: 'Added', quantity: 2 } },
  )
  expect(order.project(state)).toEqual({ lines: 2, quantity: 3, charged: 0 })
  expect(order.project(after(
    { _tag: 'LineAdded', id: 'a' },
    { _tag: 'Line', id: 'a', message: { _tag: 'Added', quantity: 1 } },
    { _tag: 'Emptied' },
  ))).toEqual({ lines: 1, quantity: 0, charged: 0 })
})

test('an external message to a child that is not there is a defect', () => {
  const parent = part({
    state: Order,
    flags: Schema.Null,
    inbound: Schema.TaggedStruct('EmptyGhost', {}),
    internal: Schema.Never,
    operation: Schema.Never,
    rejection: Schema.Never,
    projection: Schema.Null,
  })({
    keys: [],
    children: {
      Line: each(line, { id: Schema.String, at: Optic.id<Order>().key('lines').compose(Optic.entries()) }),
    },
    init: () => ({ lines: {}, charged: 0 }),
    update: (_, __, children) => children.Line.update('ghost', { _tag: 'Emptied' }),
    work: () => noWork,
    operations: {},
    project: () => null,
    onEvent: { Line: () => (state) => state },
  })
  expect(outcome(() => parent.update({ _tag: 'EmptyGhost' }, meta)({ lines: {}, charged: 0 }))).toEqual({
    _tag: 'Defect',
    reason: "an external message to the child 'Line', which is not in this state",
  })
})

test('andThen keeps the events of both steps, in order', () => {
  const first = raise('one')({ n: 1 })
  const step = andThen(first, (state: { n: number }) => raise('two')({ n: state.n + 1 }))
  expect(outcome(() => step)).toEqual({ _tag: 'Stepped', state: { n: 2 }, events: ['one', 'two'] })
  expect(andThen({ n: 1 }, (state: { n: number }) => ({ n: state.n + 1 }))).toEqual({ n: 2 })
})

const lines = Optic.id<Order>().key('lines').compose(Optic.entries())

test("a parent's name with a '.' is refused where it is declared, since a child's names hold one (decision 0133)", () => {
  const declare = (keys: ReadonlyArray<string>, name: string) => () =>
    part({
      state: Order,
      flags: Schema.Null,
      inbound: Schema.Never,
      internal: Schema.Never,
      operation: Schema.Never,
      rejection: Schema.Never,
      projection: Schema.Null,
    })({
      // A list of names typed `string` does not compile (decision 0199), and the check under test is at runtime.
      keys: keys as unknown as readonly [],
      children: { [name]: each(line, { id: Schema.String, at: lines }) },
      init: () => ({ lines: {}, charged: 0 }),
      update: () => () => reject,
      work: () => noWork,
      operations: {},
      project: () => null,
      onEvent: { [name]: () => (state: Order) => state } as never,
    })
  expect(declare([], 'Li.ne')).toThrow("a parent has a child 'Li.ne', and a name of a parent's is a word with no '.'")
  expect(declare(['Line.charge'], 'Line')).toThrow("a parent has a key 'Line.charge'")
  expect(declare([], 'Line')).not.toThrow()
})

test("an own message that takes a child's name does not compile", () => {
  const declaration = () =>
    program({
      state: Order,
      flags: Schema.Null,
      inbound: Schema.TaggedStruct('Line', {}),
      internal: Schema.Never,
      operation: Schema.Never,
      rejection: Schema.Never,
      sender: Schema.Null,
      projection: Schema.Null,
    })(
      // @ts-expect-error an own message takes the name of a child
      {
        name: 'Clash',
        keys: [],
        children: { Line: each(line, { id: Schema.String, at: lines }) },
        init: () => ({ lines: {}, charged: 0 }),
        update: () => () => reject,
        work: () => noWork,
        operations: {},
        project: () => null,
        indexes: {},
        onEvent: { Line: () => (state: Order) => state },
      },
    )
  expect(declaration).toBeFunction()
})

test('a program whose child raises events and that handles none does not compile', () => {
  const declaration = () =>
    program({
      state: Order,
      flags: Schema.Null,
      inbound: Schema.Never,
      internal: Schema.Never,
      operation: Schema.Never,
      rejection: Schema.Never,
      sender: Schema.Null,
      projection: Schema.Null,
    })(
      // @ts-expect-error `onEvent` is required where a child raises events
      {
        name: 'Deaf',
        keys: [],
        children: { Line: each(line, { id: Schema.String, at: lines }) },
        init: () => ({ lines: {}, charged: 0 }),
        update: () => () => reject,
        work: () => noWork,
        operations: {},
        project: () => null,
        indexes: {},
      },
    )
  expect(declaration).toBeFunction()
})

test("a child's operation runs as the parent's, and its answer reaches the child", () =>
  Effect.runPromise(rehearse(
    order,
    { at },
    Effect.fnUntraced(function*(rehearsal) {
      yield* rehearsal.send({ _tag: 'LineAdded', id: 'a' })
      yield* rehearsal.send({ _tag: 'Line', id: 'a', message: { _tag: 'Added', quantity: 2 } })
      expect(yield* rehearsal.send({ _tag: 'Line', id: 'a', message: { _tag: 'ChargeRequested' } })).toEqual(
        accepted,
      )
      const charge = yield* rehearsal.pending('Line.charge', 'a')
      expect(charge.work).toEqual({ _tag: 'Line.Charge', id: 'a', operation: { _tag: 'Charge', quantity: 2 } })
      yield* rehearsal.answer(charge, { _tag: 'Line', id: 'a', message: { _tag: 'Charged', charge: 'c-2' } })
      expect(yield* rehearsal.projection).toEqual({ lines: 1, quantity: 2, charged: 1 })
    }),
  )))

test('a child by id removed and added again does not get the answer of its earlier run (decision 0004)', () =>
  Effect.runPromise(rehearse(
    order,
    { at },
    Effect.fnUntraced(function*(rehearsal) {
      yield* rehearsal.send({ _tag: 'LineAdded', id: 'a' })
      yield* rehearsal.send({ _tag: 'Line', id: 'a', message: { _tag: 'ReminderSet', who: 'ann' } })
      const earlier = yield* rehearsal.pending('Line.reminder', ['a', 'ann'])
      yield* rehearsal.send({ _tag: 'LineRemoved', id: 'a' })
      yield* rehearsal.send({ _tag: 'LineAdded', id: 'a' })
      yield* rehearsal.send({ _tag: 'Line', id: 'a', message: { _tag: 'ReminderSet', who: 'ann' } })
      expect(yield* rehearsal.fire(earlier)).toBe('Dropped')
      expect(yield* rehearsal.fire('Line.reminder', ['a', 'ann'])).toBe('Delivered')
      expect((yield* rehearsal.state).lines['a']!.reminders).toEqual([])
    }),
  )))

const Counter = Schema.Struct({ n: Schema.Int })

/** A part that raises two events at a bump, leaves its state as it is at a look, and rejects what its parent tells it. */
const counter = part({
  state: Counter,
  flags: Schema.Null,
  inbound: Schema.Union([Schema.TaggedStruct('Bump', {}), Schema.TaggedStruct('Look', {})]),
  internal: Schema.Never,
  operation: Schema.Never,
  rejection: Schema.Never,
  projection: Schema.Int,
  event: Schema.Literals(['first', 'second']),
  external: Schema.TaggedStruct('Refuse', {}),
})({
  keys: [],
  init: () => ({ n: 0 }),
  update: (message) => (state) =>
    message._tag === 'Bump'
      ? andThen(raise('first' as const)({ n: state.n + 1 }), raise('second' as const))
      : message._tag === 'Look'
      ? state
      : reject,
  work: () => noWork,
  operations: {},
  project: (state) => state.n,
})

const Counters = Schema.Struct({
  counters: Schema.Record(Schema.String, Counter),
  heard: Schema.Array(Schema.String),
  peek: Schema.NullOr(Schema.String),
})
type Counters = typeof Counters.Type

const counters = part({
  state: Counters,
  flags: Schema.Null,
  inbound: Schema.TaggedStruct('Tell', { id: Schema.String }),
  internal: Schema.Never,
  operation: Schema.Never,
  rejection: Schema.Never,
  projection: Schema.NullOr(Schema.Int),
})({
  keys: [],
  children: {
    Counter: each(counter, { id: Schema.String, at: Optic.id<Counters>().key('counters').compose(Optic.entries()) }),
  },
  init: () => ({ counters: { a: { n: 0 } }, heard: [], peek: null }),
  update: (message, _, children) => children.Counter.update(message.id, { _tag: 'Refuse' }),
  work: () => noWork,
  operations: {},
  project: (state, children) => (state.peek === null ? null : children.Counter(state, state.peek)),
  onEvent: { Counter: (id, event) => (state) => ({ ...state, heard: [...state.heard, `${id}:${event}`] }) },
})

test("a child's events are handled in the order it raised them, and a child left as it was leaves its parent so", () => {
  const start = counters.init(null, at)
  expect(outcome(() => counters.update({ _tag: 'Counter', id: 'a', message: { _tag: 'Bump' } }, meta)(start)))
    .toMatchObject({ _tag: 'Stepped', state: { counters: { a: { n: 1 } }, heard: ['a:first', 'a:second'] } })
  // A step that changes nothing gives the state it was given, so the machine stores nothing new.
  expect(counters.update({ _tag: 'Counter', id: 'a', message: { _tag: 'Look' } }, meta)(start)).toBe(start)
})

test('a child that rejects an external message, and the projection of a child that is not there, are defects', () => {
  const start = counters.init(null, at)
  expect(outcome(() => counters.update({ _tag: 'Tell', id: 'a' }, meta)(start))).toEqual({
    _tag: 'Defect',
    reason: "the child 'Counter' rejected an external message, which it takes",
  })
  expect(counters.project({ ...start, peek: 'a' })).toBe(0)
  expect(outcome(() => counters.project({ ...start, peek: 'ghost' }))).toEqual({
    _tag: 'Defect',
    reason: "the projection of the child 'Counter', which is not in this state",
  })
})

test("a parent's operation with a '.' is refused where it is declared (decision 0133)", () => {
  const declare = () =>
    part({
      state: Order,
      flags: Schema.Null,
      inbound: Schema.Never,
      internal: Schema.Never,
      operation: Schema.TaggedStruct('Li.ne', {}),
      rejection: Schema.Never,
      projection: Schema.Null,
    })({
      keys: [],
      children: { Line: each(line, { id: Schema.String, at: lines }) },
      init: () => ({ lines: {}, charged: 0 }),
      update: () => () => reject,
      work: () => noWork,
      operations: { 'Li.ne': operation(() => Effect.die('never run')) } as never,
      project: () => null,
      onEvent: { Line: () => (state: Order) => state },
    })
  expect(declare).toThrow("a parent has an operation 'Li.ne'")
})

const Tally = Schema.Struct({ n: Schema.Int })

/** A part its parent tells to add, to stay as it is, to raise an event, or to refuse. */
const tally = part({
  state: Tally,
  flags: Schema.Null,
  inbound: Schema.Never,
  internal: Schema.Never,
  operation: Schema.Never,
  rejection: Schema.Never,
  projection: Schema.Int,
  event: Schema.Literals(['drop', 'poke']),
  external: Schema.Union([
    Schema.TaggedStruct('Add', { by: Schema.Int }),
    Schema.TaggedStruct('Keep', {}),
    Schema.TaggedStruct('Raise', { event: Schema.Literals(['drop', 'poke']) }),
    Schema.TaggedStruct('Refuse', {}),
  ]),
})({
  keys: [],
  init: () => ({ n: 0 }),
  update: (message) => (state) => {
    switch (message._tag) {
      case 'Add':
        return { n: state.n + message.by }
      case 'Keep':
        return state
      case 'Raise':
        return raise(message.event)({ n: state.n + 1 })
      case 'Refuse':
        return reject
    }
  },
  work: () => noWork,
  operations: {},
  project: (state) => state.n,
})

const Tallies = Schema.Struct({
  tallies: Schema.Record(Schema.String, Tally),
  own: Schema.Int,
  heard: Schema.Array(Schema.String),
})
type Tallies = typeof Tallies.Type

const Told = Schema.Union([
  Schema.TaggedStruct('Tell', {
    id: Schema.String,
    message: Schema.Union([
      Schema.TaggedStruct('Add', { by: Schema.Int }),
      Schema.TaggedStruct('Keep', {}),
      Schema.TaggedStruct('Raise', { event: Schema.Literals(['drop', 'poke']) }),
      Schema.TaggedStruct('Refuse', {}),
    ]),
  }),
  Schema.TaggedStruct('Own', {}),
])
type Told = typeof Told.Type

let replacements = 0
// The optic counts the records of tallies it puts back, so that a test sees how many times a step replaced them.
const tallies = Optic.id<Tallies>().key('tallies').compose(
  Optic.makeIso<Readonly<Record<string, typeof Tally.Type>>, ReadonlyArray<readonly [string, typeof Tally.Type]>>(
    Object.entries,
    (entries) => {
      replacements++
      return Object.fromEntries(entries)
    },
  ),
)

/**
 * A parent of tallies by id that tells them a list of messages, in one `forEach`, in one `forEach` over the steps
 * made first, or in one `andThen` after the other, with steps of its own among them. Its handler drops a tally that asks, and pokes the tally `x` behind the back of
 * the messages still to be told, so that a run told at once must read the children again after an event.
 */
const talliesOf = (telling: 'forEach' | 'steps' | 'andThen') =>
  part({
    state: Tallies,
    flags: Schema.Null,
    inbound: Schema.TaggedStruct('Broadcast', { told: Schema.Array(Told) }),
    internal: Schema.Never,
    operation: Schema.Never,
    rejection: Schema.Never,
    projection: Schema.Null,
    event: Schema.String,
  })({
    keys: [],
    children: { Tally: each(tally, { id: Schema.String, at: tallies }) },
    init: () => ({ tallies: {}, own: 0, heard: [] }),
    update: (message, _, children) => (state) => {
      // The handle's step itself, which `forEach` tells with the others of its run.
      const next = (told: Told) =>
        told._tag === 'Own'
          ? (state: Tallies) => ({ ...state, own: state.own + 1 })
          : children.Tally.update(told.id, told.message)
      if (telling === 'forEach') return forEach(state, message.told, next)
      // A chain the program made itself, told through `forEach` with the identity (decision 0240).
      if (telling === 'steps') return forEach(state, message.told.map(next), (step) => step)
      return message.told.reduce((step: Step<Tallies, string>, told) => andThen(step, next(told)), state)
    },
    work: () => noWork,
    operations: {},
    project: () => null,
    onEvent: {
      Tally: (id, event) => (state) => {
        const heard = { ...state, heard: [...state.heard, `${id}:${event}`] }
        if (event === 'drop') {
          const { [id]: _, ...kept } = state.tallies
          return raise(`${id} dropped`)({ ...heard, tallies: kept })
        }
        const x = state.tallies['x']
        return x === undefined ? heard : { ...heard, tallies: { ...state.tallies, x: { n: x.n + 100 } } }
      },
    },
  })

test('a forEach of messages to children by id gives the step the messages told one after the other give (decision 0155)', () => {
  const ids = fc.constantFrom('a', 'b', 'x', 'ghost')
  const message = fc.oneof(
    { weight: 4, arbitrary: fc.record({ _tag: fc.constant('Add' as const), by: fc.integer({ min: -3, max: 3 }) }) },
    { weight: 2, arbitrary: fc.constant({ _tag: 'Keep' as const }) },
    {
      weight: 2,
      arbitrary: fc.record({ _tag: fc.constant('Raise' as const), event: fc.constantFrom('drop' as const, 'poke' as const) }),
    },
    // Rare, so that most lists are told to the end.
    { weight: 1, arbitrary: fc.constant({ _tag: 'Refuse' as const }) },
  )
  const told: fc.Arbitrary<Told> = fc.oneof(
    { weight: 6, arbitrary: fc.record({ _tag: fc.constant('Tell' as const), id: ids, message }) },
    { weight: 1, arbitrary: fc.constant({ _tag: 'Own' as const }) },
  )
  const start = fc.record({
    tallies: fc.dictionary(fc.constantFrom('a', 'b', 'x'), fc.record({ n: fc.integer({ min: 0, max: 9 }) })),
    own: fc.constant(0),
    heard: fc.constant([]),
  })
  const atOnce = talliesOf('forEach')
  const asSteps = talliesOf('steps')
  const inTurn = talliesOf('andThen')
  fc.assert(
    fc.property(start, fc.array(told, { maxLength: 12 }), (state, list) => {
      const broadcast = { _tag: 'Broadcast', told: list } as const
      const expected = outcome(() => inTurn.update(broadcast, meta)(state))
      expect(outcome(() => atOnce.update(broadcast, meta)(state))).toEqual(expected)
      expect(outcome(() => asSteps.update(broadcast, meta)(state))).toEqual(expected)
    }),
    { numRuns: 2_000 },
  )
})

test('a forEach of messages to children by id that raise no event puts the children back once (decision 0155)', () => {
  const start: Tallies = {
    tallies: Object.fromEntries(Array.from({ length: 50 }, (_, id) => [`t${id}`, { n: 0 }])),
    own: 0,
    heard: [],
  }
  const told = Object.keys(start.tallies).map((id) => ({ _tag: 'Tell', id, message: { _tag: 'Add', by: 1 } }) as const)
  const count = (telling: 'forEach' | 'steps' | 'andThen') => {
    replacements = 0
    const step = talliesOf(telling).update({ _tag: 'Broadcast', told }, meta)(start) as Tallies
    expect(Object.values(step.tallies).every(({ n }) => n === 1)).toBe(true)
    return replacements
  }
  expect(count('forEach')).toBe(1)
  expect(count('steps')).toBe(1)
  expect(count('andThen')).toBe(50)
})

/** A parent's declaration beside the child `Line`, which compiles or not by the own schemas it is given. */
const besideLine = {
  name: 'Clash',
  keys: [],
  children: { Line: each(line, { id: Schema.String, at: lines }) },
  init: () => ({ lines: {}, charged: 0 }),
  update: () => (state: Order) => state,
  work: () => noWork,
  operations: {},
  project: () => null,
  indexes: {},
  onEvent: { Line: () => (state: Order) => state },
} as const

const schemasBesideLine = {
  state: Order,
  flags: Schema.Null,
  inbound: Schema.Never,
  internal: Schema.Never,
  operation: Schema.Never,
  rejection: Schema.Never,
  sender: Schema.Null,
  projection: Schema.Null,
} as const

test("an own message, reason or operation whose tag may be a child's does not compile (decision 0270)", () => {
  const declarations = [
    // @ts-expect-error an own message takes the name of a child
    () => program({ ...schemasBesideLine, inbound: Schema.Struct({ _tag: Schema.String }) })(besideLine),
    // @ts-expect-error an own message takes the name of a child
    () => program({ ...schemasBesideLine, internal: Schema.Struct({ _tag: Schema.TemplateLiteral(['Li', Schema.String]) }) })(besideLine),
    // @ts-expect-error an own message takes the name of a child
    () => program({ ...schemasBesideLine, inbound: Schema.Record(Schema.String, Schema.String) })(besideLine),
    // @ts-expect-error an own reason takes the name of a child
    () => program({ ...schemasBesideLine, rejection: Schema.TaggedStruct('Line', {}) })(besideLine),
    // @ts-expect-error an own reason takes the name of a child
    () => program({ ...schemasBesideLine, rejection: Schema.Struct({ _tag: Schema.String }) })(besideLine),
    // @ts-expect-error an own operation takes the name of a child's
    () => program({ ...schemasBesideLine, operation: Schema.Struct({ _tag: Schema.String }) })(besideLine),
  ]
  // What no child's tag reaches compiles: a reason with no tag, a message with none, and a template of other names.
  const allowed = [
    () => program({ ...schemasBesideLine, rejection: Schema.Literal('Full') })(besideLine),
    () => program({ ...schemasBesideLine, inbound: Schema.Struct({ id: Schema.String }) })(besideLine),
    () => program({ ...schemasBesideLine, inbound: Schema.Struct({ _tag: Schema.TemplateLiteral(['Own', Schema.String]) }) })(besideLine),
  ]
  expect([...declarations, ...allowed].every((declaration) => typeof declaration === 'function')).toBe(true)
})

/**
 * A parent beside the child `Line` with own schemas as wide as `own` gives, declared untyped, since the compiler
 * refuses most of them and only what the composed schemas do is tested here.
 */
const wide = (own: Readonly<Record<string, Schema.Codec<unknown, never>>>) =>
  (program as unknown as (schemas: unknown) => (declaration: unknown) => { schemas: typeof order.schemas })({
    ...schemasBesideLine,
    ...own,
  })(besideLine)

const encodes = (schema: unknown, value: unknown) => Schema.encodeUnknownSync(schema as Schema.Codec<unknown, unknown>)(value)

// Bug 8 of the roadmap: a union takes its first member that fits, so an own member with a tag typed `string`, or
// with no tag, that stood first took a child's wrapper and dropped the fields the wrapper adds.
test("a child's message keeps its wrapper beside an own message whose tag is typed string (decision 0270)", () => {
  const message = { _tag: 'Line', id: 'a', message: { _tag: 'Added', quantity: 1 } }
  const inbound = wide({ inbound: Schema.Struct({ _tag: Schema.String }) as never }).schemas.inbound
  expect(encodes(inbound, message)).toEqual(message)
  expect(Schema.decodeUnknownSync(inbound as Schema.Codec<unknown, unknown>)(message)).toEqual(message)
})

test("a child's internal message keeps its wrapper beside an own message with no tag (decision 0270)", () => {
  const message = { _tag: 'Line', id: 'a', message: { _tag: 'Charged', charge: 'c' } }
  const internal = wide({ internal: Schema.Struct({ id: Schema.String }) as never }).schemas.internal
  expect(encodes(internal, message)).toEqual(message)
})

test("a child's reason keeps its wrapper beside an own reason named like the child (decision 0270)", () => {
  const reason = { _tag: 'Line', id: 'a', reason: 'Empty' }
  const rejection = wide({ rejection: Schema.TaggedStruct('Line', {}) as never }).schemas.rejection
  expect(encodes(rejection, reason)).toEqual(reason)
})

test("a child's operation keeps its wrapper beside an own operation whose tag is typed string (decision 0270)", () => {
  const lifted = { _tag: 'Line.Charge', id: 'a', operation: { _tag: 'Charge', quantity: 1 } }
  const operation = wide({ operation: Schema.Struct({ _tag: Schema.String }) as never }).schemas.operation
  expect(encodes(operation, lifted)).toEqual(lifted)
})

test("an own value tagged as a child's, which no wrapper takes, is refused by the composed schemas (decision 0270)", () => {
  const program = wide({
    inbound: Schema.Struct({ _tag: Schema.String }) as never,
    operation: Schema.Struct({ _tag: Schema.String }) as never,
    rejection: Schema.Record(Schema.String, Schema.String) as never,
  })
  expect(() => encodes(program.schemas.inbound, { _tag: 'Line' })).toThrow("a message of the parent's own is tagged 'Line'")
  expect(() => Schema.decodeUnknownSync(program.schemas.inbound as Schema.Codec<unknown, unknown>)({ _tag: 'Line' })).toThrow()
  expect(() => encodes(program.schemas.operation, { _tag: 'Line.Other' })).toThrow("tagged 'Line.Other'")
  expect(() => encodes(program.schemas.rejection, { _tag: 'Line' })).toThrow("a reason of the parent's own")
  expect(encodes(program.schemas.inbound, { _tag: 'Own' })).toEqual({ _tag: 'Own' })
  expect(encodes(program.schemas.operation, { _tag: 'Charge' })).toEqual({ _tag: 'Charge' })
})
