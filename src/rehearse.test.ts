/**
 * Deploys, rehearsed on the order: what a new version keeps of the work under way, and what it may not change.
 */
import { describe, expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Schema from 'effect/Schema'
import { booking } from '../examples/booking/booking.ts'
import { inventory } from '../examples/booking/inventory.ts'
import { order, type Sender } from '../examples/order/order.ts'
import {
  create,
  type Entities,
  InvariantDefect,
  isTimer,
  operation,
  type Program,
  program as declare,
  type Runner,
  send,
  timer,
} from './program.ts'
import { rehearse } from './rehearse.ts'

const placedAt = DateTime.makeUnsafe('2026-10-30T10:00:00Z')

const start = { flags: { order: { customer: 'ada', totalInCents: 4_200 } }, at: placedAt }

const ada: Sender = { _tag: 'Customer', id: 'ada' }

const warehouse: Sender = { _tag: 'Warehouse' }

// A new version that gives an hour more to pay.
const patient: typeof order = {
  ...order,
  durable: (state) => {
    const work = order.durable(state)
    const deadline = work['payment-deadline']
    return deadline === undefined || !isTimer(deadline)
      ? work
      : { ...work, 'payment-deadline': timer(DateTime.add(deadline.at, { hours: 1 }), deadline.message) }
  },
}

// A new version that charges a cent more.
const greedy: typeof order = {
  ...order,
  durable: (state) => {
    const work = order.durable(state)
    const charge = work['charge']
    return charge === undefined || isTimer(charge) || !('_tag' in charge) || charge._tag !== 'Charge'
      ? work
      : { ...work, charge: { ...charge, totalInCents: charge.totalInCents + 1 } }
  },
}

describe('a deploy', () => {
  test('keeps a charge under way it returns the same, under the same idempotency key', () =>
    Effect.runPromise(rehearse(
      order,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, ada)
        const before = yield* rehearsal.pending('charge')
        yield* rehearsal.deploy(patient)
        const after = yield* rehearsal.pending('charge')
        expect(after.idempotencyKey).toBe(before.idempotencyKey)
        expect(yield* rehearsal.answer(before, { _tag: 'ChargeSucceeded', charge: 'ch-1' })).toBe('Delivered')
      }),
    )))

  test('arms a deadline it moves again, as new work: the old one\'s firing is dropped', () =>
    Effect.runPromise(rehearse(
      order,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        const before = yield* rehearsal.pending('payment-deadline')
        yield* rehearsal.deploy(patient)
        const after = yield* rehearsal.pending('payment-deadline')
        expect(after.incarnation).toBe(before.incarnation + 1)
        expect(isTimer(after.work) && isTimer(before.work) && DateTime.Equivalence(
          after.work.at,
          DateTime.add(before.work.at, { hours: 1 }),
        )).toBe(true)
        expect(yield* rehearsal.fire(before)).toBe('Dropped')
        expect(yield* rehearsal.fire(after)).toBe('Delivered')
        expect(yield* rehearsal.state).toMatchObject({ _tag: 'Cancelled', reason: 'Unpaid' })
      }),
    )))

  test('that changes a charge under way is a defect, which fails the scenario', async () => {
    const exit = await Effect.runPromiseExit(rehearse(
      order,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, ada)
        yield* rehearsal.deploy(greedy)
      }),
    ))
    const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
    expect(cause instanceof InvariantDefect && cause.reason)
      .toBe("the program changed the operation under 'charge' before its completion")
  })

  // The program is not the machine's: what follows a deploy is the deployed program's, its schemas too (decision 0064).
  test('runs what follows it by the program deployed, whose schemas a message is checked by', async () => {
    const strict: typeof order = {
      ...order,
      schemas: { ...order.schemas, inbound: order.schemas.inbound.check(Schema.makeFilter(() => 'nothing is taken')) },
    }
    const exit = await Effect.runPromiseExit(rehearse(
      order,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.deploy(strict)
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, ada)
      }),
    ))
    const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
    expect(cause instanceof InvariantDefect && cause.reason).toStartWith('the inbound message does not encode')
  })

  test('that changes a charge is taken once the charge has completed', () =>
    Effect.runPromise(rehearse(
      order,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, ada)
        yield* rehearsal.answer(yield* rehearsal.pending('charge'), { _tag: 'ChargeSucceeded', charge: 'ch-1' })
        yield* rehearsal.deploy(greedy)
        expect((yield* rehearsal.projection).status).toBe('Paid')
      }),
    )))
})

describe('a program that cannot run as written', () => {
  const reasonOf = (exit: Exit.Exit<unknown>) => {
    const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
    return cause instanceof InvariantDefect ? cause.reason : null
  }
  const acted: Array<string> = []
  const rehearsed = (program: typeof order) =>
    rehearse(
      program,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        acted.push('ran')
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, ada)
      }),
    )

  test('is refused before its scenario runs, as the runtime refuses it (decision 0054)', async () => {
    const refused: ReadonlyArray<readonly [typeof order, string]> = [
      [{ ...order, name: '' }, "the program '' has an empty name"],
      [
        { ...order, indexes: { ...order.indexes, 'not a word': () => null } as typeof order.indexes },
        "the program 'Order' has an index 'not a word' whose name is not a word",
      ],
    ]
    for (const [program, reason] of refused) {
      expect(reasonOf(await Effect.runPromiseExit(rehearsed(program)))).toBe(reason)
    }
    expect(acted).toEqual([])
  })

  test('is refused where a rehearsal deploys it', async () => {
    const exit = await Effect.runPromiseExit(rehearse(
      order,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.deploy({ ...order, indexes: { ...order.indexes, 'not a word': () => null } as typeof order.indexes })
      }),
    ))
    expect(reasonOf(exit)).toBe("the program 'Order' has an index 'not a word' whose name is not a word")
  })
})

describe('a rehearsal', () => {
  // No one retries a rehearsal's creation, so its request is the entity's own: a program need not have a sender for
  // it, nor take any (decision 0048).
  test('creates its entity under the entity itself, whatever senders the program takes', () =>
    Effect.runPromise(rehearse(
      { ...order, schemas: { ...order.schemas, sender: order.schemas.sender.check(Schema.makeFilter(() => 'none')) } },
      start,
      Effect.fnUntraced(function*(rehearsal) {
        expect((yield* rehearsal.pending('payment-deadline')).work).toBeDefined()
      }),
    )))

  // Time stands at the start's time, and moves to a timer's when it fires: a message after it is handled at the
  // latest time the scenario reached, never at the start's again (decision 0014).
  test('handles each message at the latest time it reached', () => {
    const seen: Array<DateTime.Utc> = []
    const clocked: typeof order = {
      ...order,
      update: (message, meta) => {
        seen.push(meta.at)
        return order.update(message, meta)
      },
    }
    return Effect.runPromise(rehearse(
      clocked,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, ada)
        const charge = yield* rehearsal.pending('charge')
        yield* rehearsal.answer(charge, { _tag: 'ChargeDeclined' })
        const deadline = yield* rehearsal.pending('payment-deadline')
        expect(isTimer(deadline.work)).toBe(true)
        yield* rehearsal.fire(deadline)
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-2' }, ada)
        const due = isTimer(deadline.work) ? deadline.work.at : placedAt
        expect(DateTime.isGreaterThan(due, placedAt)).toBe(true)
        expect(seen.map(DateTime.formatIso)).toEqual([placedAt, placedAt, due, due].map(DateTime.formatIso))
      }),
    ))
  })

  // Two timers under way, fired out of their order: the earlier one firing after the later does not take time back.
  test('keeps its time when a timer due earlier fires after one due later', () => {
    const timers = ['early', 'late'] as const
    const Timer = Schema.Literals(timers)
    const dueOf = { early: DateTime.add(placedAt, { hours: 1 }), late: DateTime.add(placedAt, { hours: 2 }) }
    type Clocked = {
      state: { pending: ReadonlyArray<typeof Timer.Type>; seen: ReadonlyArray<DateTime.Utc> }
      flags: Readonly<{}>
      inbound: Readonly<{ _tag: 'Ping' }>
      internal: Readonly<{ _tag: 'Rang'; key: typeof Timer.Type }>
      operation: never
      key: typeof Timer.Type
      parameter: {}
      rejection: never
      sender: Readonly<{ _tag: 'Tester' }>
      projection: number
      index: never
      services: never
    }
    const clock: Program<Clocked> = {
      name: 'Clock',
      keys: { early: null, late: null },
      schemas: {
        state: Schema.Struct({ pending: Schema.Array(Timer), seen: Schema.Array(Schema.DateTimeUtcFromMillis) }),
        flags: Schema.Struct({}),
        inbound: Schema.TaggedStruct('Ping', {}),
        internal: Schema.TaggedStruct('Rang', { key: Timer }),
        operation: Schema.Never,
        rejection: Schema.Never,
        sender: Schema.TaggedStruct('Tester', {}),
        projection: Schema.Int,
      },
      init: () => ({ pending: timers, seen: [] }),
      update: (message, { at }) => (state) => ({
        pending: message._tag === 'Rang' ? state.pending.filter((key) => key !== message.key) : state.pending,
        seen: [...state.seen, at],
      }),
      durable: (state) =>
        Object.fromEntries(state.pending.map((key) => [key, timer(dueOf[key], { _tag: 'Rang', key } as const)])),
      operations: {},
      project: (state) => state.seen.length,
      indexes: {},
    }
    return Effect.runPromise(rehearse(
      clock,
      { flags: {}, at: placedAt },
      Effect.fnUntraced(function*(rehearsal) {
        const early = yield* rehearsal.pending('early')
        const late = yield* rehearsal.pending('late')
        expect(yield* rehearsal.fire(late)).toBe('Delivered')
        expect(yield* rehearsal.fire(early)).toBe('Delivered')
        yield* rehearsal.send({ _tag: 'Ping' }, { _tag: 'Tester' })
        expect((yield* rehearsal.state).seen.map(DateTime.formatIso))
          .toEqual([dueOf.late, dueOf.late, dueOf.late].map(DateTime.formatIso))
      }),
    ))
  })

  // A retry belongs inside the runner, or behind a timer: one with no pause loops (decision 0130).
  test('fails when a completion returns the same operation, which would run again at once', async () => {
    const insistent: typeof order = {
      ...order,
      update: (message, meta) => (state) =>
        message._tag === 'ChargeDeclined' && state._tag === 'Charging' ? state : order.update(message, meta)(state),
    }
    const exit = await Effect.runPromiseExit(rehearse(
      insistent,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, ada)
        yield* rehearsal.answer(yield* rehearsal.pending('charge'), { _tag: 'ChargeDeclined' })
      }),
    ))
    expect(Exit.isFailure(exit) && Cause.squash(exit.cause))
      .toBe("the operation under 'charge' came back the same on its completion, and runs again at once")
  })

  test('takes an operation its completion returns changed, as a new attempt', () =>
    Effect.runPromise(rehearse(
      {
        ...order,
        update: (message, meta) => (state) =>
          message._tag === 'ChargeDeclined' && state._tag === 'Charging'
            ? { ...state, payment: 'card-2' }
            : order.update(message, meta)(state),
      },
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, ada)
        const first = yield* rehearsal.pending('charge')
        expect(yield* rehearsal.answer(first, { _tag: 'ChargeDeclined' })).toBe('Delivered')
        const second = yield* rehearsal.pending('charge')
        expect(second.incarnation).toBe(first.incarnation + 1)
        expect(second.work).toMatchObject({ payment: 'card-2' })
      }),
    )))
})

describe('a world', () => {
  const at = placedAt
  const flags = { customer: 'ada', event: 'concert-1', seats: 2 }
  const reasonOf = (exit: Exit.Exit<unknown>) => {
    const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
    return cause instanceof InvariantDefect ? cause.reason : cause
  }
  // A booking whose hold is the runner given: the rest of the booking is the example's.
  // A new version of the booking, which shows callers no cancellation: it keeps every work the same.
  const tacit: typeof booking = { ...booking, project: (state) => ({ ...booking.project(state), canCancel: false }) }
  const holdingBy = (hold: Runner<{ _tag: 'Hold'; event: string; seats: number }, unknown, Entities>) =>
    ({ ...booking, operations: { ...booking.operations, Hold: hold } }) as unknown as typeof booking

  // The runtime answers a second request under one name with the first one's reply, so it is a defect (decision 0047).
  test('fails a run that sends twice under one name to one entity', async () => {
    const twice = holdingBy(operation.atLeastOnce(({ event, seats }) =>
      Effect.as(
        Effect.andThen(
          send(inventory, event, { _tag: 'HoldRequested', seats }, 'hold'),
          send(inventory, event, { _tag: 'HoldRequested', seats }, 'hold'),
        ),
        { _tag: 'SeatsHeld' } as const,
      )
    ))
    const exit = await Effect.runPromiseExit(rehearse.together(
      at,
      Effect.fnUntraced(function*(world) {
        yield* world.create(inventory, 'concert-1', { capacity: 4 })
        const held = yield* world.create(twice, 'booking-1', flags)
        yield* held.run(yield* held.pending('hold'))
      }),
    ))
    expect(reasonOf(exit)).toBe("the operation sent 'hold' to Inventory 'concert-1' twice")
  })

  // A creation is stored under its request, so a run after a crash is answered `Created` again (decision 0017).
  test('creates an entity from a run, and answers the run sent again after a crash as the first', () => {
    const creating = holdingBy(operation.atLeastOnce(({ event, seats }) =>
      Effect.gen(function*() {
        const created = yield* create(inventory, event, { capacity: 4 }, 'inventory')
        if (created._tag !== 'Created') return yield* Effect.die('the inventory was there already')
        const reply = yield* send(inventory, event, { _tag: 'HoldRequested', seats }, 'hold')
        return reply._tag === 'Accepted' ? { _tag: 'SeatsHeld' } as const : yield* Effect.die('no hold')
      })
    ))
    return Effect.runPromise(rehearse.together(
      at,
      Effect.fnUntraced(function*(world) {
        const held = yield* world.create(creating, 'booking-1', flags)
        yield* held.run(yield* held.pending('hold'), { crash: true })
        expect(yield* held.run(yield* held.pending('hold'))).toBe('Delivered')
        expect((yield* held.state)._tag).toBe('Held')
        const exit = yield* Effect.exit(world.create(inventory, 'concert-1', { capacity: 4 }))
        expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toBe("Inventory 'concert-1' exists in the world already")
      }),
    ))
  })

  test('fails a run of an operation no longer under way', async () => {
    const exit = await Effect.runPromiseExit(rehearse.together(
      at,
      Effect.fnUntraced(function*(world) {
        yield* world.create(inventory, 'concert-1', { capacity: 4 })
        const held = yield* world.create(booking, 'booking-1', flags)
        const hold = yield* held.pending('hold')
        yield* held.run(hold)
        yield* held.run(hold)
      }),
    ))
    expect(reasonOf(exit)).toBe("no operation is running under 'hold' in incarnation 1")
  })

  test('restarts every entity of the world, each keeping its charge under the same key', () =>
    Effect.runPromise(rehearse.together(
      at,
      Effect.fnUntraced(function*(world) {
        const placed = [
          yield* world.create(order, 'order-1', start.flags),
          yield* world.create(order, 'order-2', start.flags),
        ]
        const before: Array<string> = []
        for (const one of placed) {
          yield* one.send({ _tag: 'PayRequested', payment: 'card-1' }, ada)
          before.push((yield* one.pending('charge')).idempotencyKey)
        }
        yield* world.restart
        const after: Array<string> = []
        for (const one of placed) after.push((yield* one.pending('charge')).idempotencyKey)
        expect(after).toEqual(before)
        expect(new Set(after).size).toBe(2)
      }),
    )))

  // One process holds every entity, so a deploy of one program restarts the entities of the others too.
  test('deploys a new version of one program, and restarts the entities of the others', () =>
    Effect.runPromise(rehearse.together(
      at,
      Effect.fnUntraced(function*(world) {
        const seats = yield* world.create(inventory, 'concert-1', { capacity: 4 })
        const held = yield* world.create(booking, 'booking-1', flags)
        yield* held.run(yield* held.pending('hold'))
        const deadline = yield* held.pending('deadline')
        const shipped = yield* world.create(order, 'order-1', start.flags)
        yield* shipped.send({ _tag: 'PayRequested', payment: 'card-1' }, ada)
        yield* shipped.answer(yield* shipped.pending('charge'), { _tag: 'ChargeSucceeded', charge: 'ch-1' })
        yield* shipped.answer(yield* shipped.pending('tell-warehouse'), { _tag: 'WarehouseTold' })
        yield* shipped.send({ _tag: 'ShipmentReported', tracking: 'tr-1' }, warehouse)
        yield* world.deploy(tacit)
        // The order's at-most-once email delivers its `unknown` message: the order was restarted.
        expect(yield* shipped.state).toMatchObject({ _tag: 'Shipped', email: 'Unsure' })
        expect(yield* held.pending('deadline')).toEqual(deadline)
        expect((yield* seats.projection).available).toBe(2)
      }),
    )))

  // The runtime refuses a second deploy of a name (decision 0075): a test that creates by the old version is told.
  test('fails a creation by a program the world runs another version of', async () => {
    const exit = await Effect.runPromiseExit(rehearse.together(
      at,
      Effect.fnUntraced(function*(world) {
        yield* world.create(booking, 'booking-1', flags)
        yield* world.deploy(tacit)
        yield* world.create(booking, 'booking-2', flags)
      }),
    ))
    expect(reasonOf(exit)).toBe("the world runs another program under the name 'Booking'")
  })
})

// A test finds the work under a key with a parameter by the key's name and the parameter (decision 0132).
describe('a rehearsal of keys with a parameter', () => {
  const lines = declare({
    state: Schema.Struct({ lines: Schema.Array(Schema.String) }),
    flags: Schema.Null,
    inbound: Schema.String,
    internal: Schema.String,
    operation: Schema.TaggedStruct('Charge', { line: Schema.String }),
    rejection: Schema.Never,
    sender: Schema.Null,
    projection: Schema.Number,
  })({
    name: 'Lines',
    keys: { charge: Schema.String },
    init: () => ({ lines: [] }),
    update: (message) => (state) =>
      message.startsWith('+')
        ? { lines: [...state.lines, message.slice(1)] }
        : { lines: state.lines.filter((line) => `charged ${line}` !== message) },
    durable: (state) => ({ charge: state.lines.map((line) => [line, { _tag: 'Charge', line }] as const) }),
    operations: { Charge: operation(() => Effect.succeed('charged')) },
    project: (state) => state.lines.length,
    indexes: {},
  })

  test('gives the work under each parameter, and answers it alone', () =>
    Effect.runPromise(rehearse(
      lines,
      { flags: null, at: placedAt },
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send('+a', null)
        yield* rehearsal.send('+b', null)
        const a = yield* rehearsal.pending('charge', 'a')
        expect(a.key).toEqual({ name: 'charge', parameter: 'a' })
        expect(a.work).toEqual({ _tag: 'Charge', line: 'a' })
        expect(String(a.idempotencyKey)).toBe('["Lines","rehearsal",["charge","a"],1]')
        expect(yield* rehearsal.answer(a, 'charged a')).toBe('Delivered')
        expect(yield* rehearsal.state).toEqual({ lines: ['b'] })
        expect((yield* rehearsal.pending('charge', 'b')).incarnation).toBe(2)
      }),
    )))
})
