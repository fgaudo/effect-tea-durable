/**
 * Deploys, rehearsed on the order: what a new version keeps of the work under way, and what it may not change.
 */
import { describe, expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'
import { booking } from './fixtures/booking.ts'
import { inventory } from './fixtures/inventory.ts'
import { order, type Sender } from './fixtures/order.ts'
import {
  create,
  type Entities,
  InvariantDefect,
  isTimer,
  operation,
  type Program,
  program as declare,
  reference,
  rejectWith,
  type Runner,
  send,
  timer,
  type TypesOf,
  key,
} from './program.ts'
import { rehearse, type World } from './rehearse.ts'

const placedAt = DateTime.makeUnsafe('2026-10-30T10:00:00Z')

const start = { flags: { order: { customer: 'ada', totalInCents: 4_200 } }, at: placedAt }

const ada: Sender = { _tag: 'Customer', id: 'ada' }

const warehouse: Sender = { _tag: 'Warehouse' }

// A new version that gives an hour more to pay.
const patient: typeof order = {
  ...order,
  work: (state) => {
    const work = order.work(state)
    const deadline = work['payment-deadline']
    return deadline === undefined || !isTimer(deadline)
      ? work
      : { ...work, 'payment-deadline': timer(DateTime.add(deadline.at, { hours: 1 }), deadline.message) }
  },
}

// A new version that charges a cent more.
const greedy: typeof order = {
  ...order,
  work: (state) => {
    const work = order.work(state)
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
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, { sender: ada })
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
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, { sender: ada })
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
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, { sender: ada })
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
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, { sender: ada })
        yield* rehearsal.answer('charge', { _tag: 'ChargeSucceeded', charge: 'ch-1' })
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
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, { sender: ada })
      }),
    )

  test('is refused before its scenario runs, as the runtime refuses it (decision 0054)', async () => {
    const refused: ReadonlyArray<readonly [typeof order, string]> = [
      [{ ...order, name: '' as typeof order.name }, "the program '' has an empty name"],
      [
        { ...order, indexes: { ...order.indexes, 'not a word': () => null } as typeof order.indexes },
        "the program 'Order' has an index 'not a word' whose name is not a word",
      ],
      // A program that declares topics publishes them alone (decision 0138).
      [
        { ...order, topics: {} as NonNullable<typeof order.topics> },
        "the program 'Order' declares no topic in its topics",
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
  // latest time the scenario reached, never at the start's again (decision 0187).
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
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, { sender: ada })
        const charge = yield* rehearsal.pending('charge')
        yield* rehearsal.answer(charge, { _tag: 'ChargeDeclined' })
        const deadline = yield* rehearsal.pending('payment-deadline')
        expect(isTimer(deadline.work)).toBe(true)
        yield* rehearsal.fire(deadline)
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-2' }, { sender: ada })
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
      work: (state) =>
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
        yield* rehearsal.send({ _tag: 'Ping' }, { sender: { _tag: 'Tester' } })
        expect((yield* rehearsal.state).seen.map(DateTime.formatIso))
          .toEqual([dueOf.late, dueOf.late, dueOf.late].map(DateTime.formatIso))
      }),
    ))
  })

  // The runtime gives a caller the projection decoded from the JSON it stored, where `-0` is written `0`.
  test('gives the projection as a caller reads it from its JSON, -0 as 0 (decision 0211)', () =>
    Effect.runPromise(rehearse(
      inventory,
      { flags: { capacity: -0 }, at: placedAt },
      Effect.fnUntraced(function*(rehearsal) {
        expect(Object.is((yield* rehearsal.state).capacity, -0)).toBe(true)
        expect(Object.is((yield* rehearsal.projection).available, 0)).toBe(true)
      }),
    )))

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
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, { sender: ada })
        yield* rehearsal.answer('charge', { _tag: 'ChargeDeclined' })
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
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, { sender: ada })
        const first = yield* rehearsal.pending('charge')
        expect(yield* rehearsal.answer(first, { _tag: 'ChargeDeclined' })).toBe('Delivered')
        const second = yield* rehearsal.pending('charge')
        expect(second.incarnation).toBe(first.incarnation + 1)
        expect(second.work).toMatchObject({ payment: 'card-2' })
      }),
    )))
})

describe("a rehearsal's request ids", () => {
  // A tally of entries, which a closed door refuses: a message applied twice counts twice.
  const Sender = Schema.TaggedStruct('Turnstile', { id: Schema.String })
  const door = declare({
    state: Schema.Struct({ open: Schema.Boolean, entries: Schema.Int }),
    flags: Schema.Null,
    inbound: Schema.Union([Schema.TaggedStruct('Entered', {}), Schema.TaggedStruct('Opened', {})]),
    rejection: Schema.Literal('Closed'),
    sender: Sender,
    projection: Schema.Struct({ entries: Schema.Int }),
  })({
    name: 'Door',
    init: () => ({ open: false, entries: 0 }),
    update: (message) => (state) =>
      message._tag === 'Opened'
        ? { ...state, open: true }
        : state.open
        ? { ...state, entries: state.entries + 1 }
        : rejectWith('Closed'),
    project: ({ entries }) => ({ entries }),
  })
  const north = { _tag: 'Turnstile', id: 'north' } as const
  const south = { _tag: 'Turnstile', id: 'south' } as const
  const opened = { at: placedAt }
  const entered = { _tag: 'Entered' } as const

  test('answers a retry under the same request id from the stored reply, and applies the message once', () =>
    Effect.runPromise(rehearse(
      door,
      opened,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'Opened' }, { sender: north })
        expect(yield* rehearsal.send(entered, { sender: north, requestId: 'entry-1' })).toEqual({ _tag: 'Accepted' })
        expect(yield* rehearsal.send(entered, { sender: north, requestId: 'entry-1' })).toEqual({ _tag: 'Accepted' })
        expect(yield* rehearsal.projection).toEqual({ entries: 1 })
        yield* rehearsal.send(entered, { sender: north, requestId: 'entry-2' })
        expect(yield* rehearsal.projection).toEqual({ entries: 2 })
      }),
    )))

  // The runtime refuses such a request id, so that a test passes only what a deployment runs (decision 0204).
  test('fails a send under a request id that is no text a database holds', () =>
    Effect.runPromise(rehearse(
      door,
      opened,
      Effect.fnUntraced(function*(rehearsal) {
        const exit = yield* Effect.exit(rehearsal.send(entered, { sender: north, requestId: 'entry\u0000' }))
        const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
        expect(cause instanceof InvariantDefect && cause.reason)
          .toBe('the request id is "entry\\u0000", which is no text a database holds')
      }),
    )))

  test('answers a retry with the rejection stored, once the state would accept the message', () =>
    Effect.runPromise(rehearse(
      door,
      opened,
      Effect.fnUntraced(function*(rehearsal) {
        expect(yield* rehearsal.send(entered, { sender: north, requestId: 'entry-1' }))
          .toEqual({ _tag: 'Rejected', reason: 'Closed' })
        yield* rehearsal.send({ _tag: 'Opened' }, { sender: north })
        expect(yield* rehearsal.send(entered, { sender: north, requestId: 'entry-1' }))
          .toEqual({ _tag: 'Rejected', reason: 'Closed' })
        expect(yield* rehearsal.projection).toEqual({ entries: 0 })
      }),
    )))

  test('keeps the reply across a restart and a deploy', () =>
    Effect.runPromise(rehearse(
      door,
      opened,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'Opened' }, { sender: north })
        yield* rehearsal.send(entered, { sender: north, requestId: 'entry-1' })
        yield* rehearsal.restart
        yield* rehearsal.send(entered, { sender: north, requestId: 'entry-1' })
        yield* rehearsal.deploy(door)
        yield* rehearsal.send(entered, { sender: north, requestId: 'entry-1' })
        expect(yield* rehearsal.projection).toEqual({ entries: 1 })
      }),
    )))

  // A request id is its sender's (decision 0048).
  test('applies the same request id of two senders as two requests', () =>
    Effect.runPromise(rehearse(
      door,
      opened,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'Opened' }, { sender: north })
        yield* rehearsal.send(entered, { sender: north, requestId: 'entry-1' })
        yield* rehearsal.send(entered, { sender: south, requestId: 'entry-1' })
        expect(yield* rehearsal.projection).toEqual({ entries: 2 })
      }),
    )))

  test('gives a send without a request id no reply of a named request, whatever id it draws', () =>
    Effect.runPromise(rehearse(
      door,
      opened,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'Opened' }, { sender: north, requestId: 'request-2' })
        yield* rehearsal.send(entered, { sender: north, requestId: 'request-3' })
        yield* rehearsal.send(entered, { sender: north })
        yield* rehearsal.send(entered, { sender: north })
        expect(yield* rehearsal.projection).toEqual({ entries: 3 })
      }),
    )))

  // Only a named request's reply is kept, so a send drawn first leaves no reply that a request named later under the
  // same id would be given as a retry (decision 0200).
  test('gives a named request no reply of a send drawn before it, whatever id that send drew', () =>
    Effect.runPromise(rehearse(
      door,
      opened,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'Opened' }, { sender: north })
        yield* rehearsal.send(entered, { sender: north })
        yield* rehearsal.send(entered, { sender: north })
        for (const requestId of ['request-1', 'request-2', 'request-3', 'request-4']) {
          yield* rehearsal.send(entered, { sender: north, requestId })
        }
        expect(yield* rehearsal.projection).toEqual({ entries: 6 })
      }),
    )))

  test('answers a retry of a member of a world as the rehearsal of one entity does', () =>
    Effect.runPromise(rehearse.together(
      placedAt,
      Effect.fnUntraced(function*(world) {
        const member = yield* world.create(door, 'door-1')
        yield* member.send({ _tag: 'Opened' }, { sender: north })
        yield* member.send(entered, { sender: north, requestId: 'entry-1' })
        yield* member.send(entered, { sender: north, requestId: 'entry-1' })
        expect(yield* member.projection).toEqual({ entries: 1 })
      }),
    )))

  // The request's key encodes the sender too, so the sender is checked before it, as the caller's (decision 0040).
  test('fails a send whose sender does not encode as the caller\'s defect, with a request id or without', async () => {
    for (const request of [undefined, { requestId: 'entry-1' }]) {
      const exit = await Effect.runPromiseExit(rehearse(
        door,
        opened,
        Effect.fnUntraced(function*(rehearsal) {
          yield* rehearsal.send(entered, { sender: { _tag: 'Turnstile', id: 7 } as unknown as typeof north, ...request })
        }),
      ))
      const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
      expect(cause instanceof InvariantDefect && cause.reason).toStartWith('the sender does not encode')
    }
  })
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

  // A booking whose confirmation mails a receipt: its runners need a service besides `Entities`.
  class Receipts extends Context.Service<Receipts, {
    readonly mail: (event: string) => Effect.Effect<void>
  }>()('Receipts') {}
  const mailing = {
    ...booking,
    operations: {
      ...booking.operations,
      Confirm: operation.atLeastOnce(({ event }: { _tag: 'Confirm'; event: string }) =>
        Effect.gen(function*() {
          const receipts = yield* Receipts
          yield* receipts.mail(event)
          const reply = yield* send(inventory, event, { _tag: 'ConfirmRequested' }, 'confirm')
          return reply._tag === 'Accepted' ? { _tag: 'SeatsConfirmed' } as const : yield* Effect.die('not confirmed')
        })
      ),
    },
  } as unknown as Program<Omit<TypesOf<typeof booking>, 'services'> & { services: Entities | Receipts }>

  // A program's types hold its runners' services as one union, and a key holds any of its operations, so a run asks
  // for them all: a test provides a service it does not run with `Layer.mock` (decision 0189).
  test('asks a run for every service of its program, and takes a mock of the ones it does not run', async () => {
    const scenario = Effect.fnUntraced(function*(world: World) {
      const seats = yield* world.create(inventory, 'concert-1', { capacity: 4 })
      const held = yield* world.create(mailing, 'booking-1', flags)
      expect(yield* held.run('hold')).toBe('Delivered')
      yield* held.send({ _tag: 'ConfirmRequested' }, { sender: { _tag: 'Customer', id: 'ada' } })
      expect(yield* held.answer('confirm', { _tag: 'SeatsConfirmed' })).toBe('Delivered')
      expect((yield* held.state)._tag).toBe('Confirmed')
      expect((yield* seats.projection).available).toBe(2)
    })
    // @ts-expect-error the run of the hold asks for `Receipts`, which only the confirmation uses
    void (() => Effect.runPromise(rehearse.together(at, scenario)))
    await Effect.runPromise(rehearse.together(at, scenario).pipe(Effect.provide(Layer.mock(Receipts, {}))))
  })

  // A mock's member that is called dies, so a runner the test meant to answer, and ran, fails the test.
  test('fails a run that calls a member a mock does not give', async () => {
    const exit = await Effect.runPromiseExit(rehearse.together(
      at,
      Effect.fnUntraced(function*(world) {
        yield* world.create(inventory, 'concert-1', { capacity: 4 })
        const held = yield* world.create(mailing, 'booking-1', flags)
        yield* held.run('hold')
        yield* held.send({ _tag: 'ConfirmRequested' }, { sender: { _tag: 'Customer', id: 'ada' } })
        yield* held.run('confirm')
      }),
    ).pipe(Effect.provide(Layer.mock(Receipts, {}))))
    const reason = reasonOf(exit)
    expect(reason instanceof Error ? reason.message : reason).toBe('Receipts: Unimplemented method "mail"')
  })

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
        yield* held.run('hold')
      }),
    ))
    expect(reasonOf(exit)).toBe("the operation sent 'hold' to Inventory 'concert-1' twice")
  })

  // A droppable operation interrupted between a request and its reply would leave the receiver acted on, so the
  // runtime makes its send a defect, and the world fails the test (decision 0128).
  test('fails a run of a droppable operation that sends', async () => {
    const dropping = holdingBy(operation.droppable(({ event, seats }) =>
      // The type refuses a droppable runner that sends (decision 0129), and the world is what a cast meets.
      // @ts-expect-error a droppable operation sends to no entity
      Effect.as(
        send(inventory, event, { _tag: 'HoldRequested', seats }, 'hold'),
        { _tag: 'SeatsHeld' } as const,
      )
    ))
    const exit = await Effect.runPromiseExit(rehearse.together(
      at,
      Effect.fnUntraced(function*(world) {
        yield* world.create(inventory, 'concert-1', { capacity: 4 })
        const held = yield* world.create(dropping, 'booking-1', flags)
        yield* held.run('hold')
      }),
    ))
    expect(reasonOf(exit)).toBe("the droppable operation under 'hold' sent to Inventory 'concert-1'")
  })

  // A rehearsal refuses the ids the runtime refuses (decision 0179).
  test('fails a creation and a send under an id that is empty', async () => {
    const empty = 'the id is empty, and an id is not'
    const created = await Effect.runPromiseExit(rehearse.together(
      at,
      (world) => Effect.asVoid(world.create(inventory, '', { capacity: 4 })),
    ))
    expect(reasonOf(created)).toBe(empty)
    const sending = holdingBy(operation.atLeastOnce(({ seats }) =>
      Effect.as(send(inventory, '', { _tag: 'HoldRequested', seats }, 'hold'), { _tag: 'SeatsHeld' } as const)
    ))
    const sent = await Effect.runPromiseExit(rehearse.together(
      at,
      Effect.fnUntraced(function*(world) {
        const held = yield* world.create(sending, 'booking-1', flags)
        yield* held.run('hold')
      }),
    ))
    expect(reasonOf(sent)).toBe(empty)
  })

  // A creation is stored under its request, so a run after a crash is answered `Created` again (decision 0017).
  test('creates an entity from a run, and answers the run sent again after a crash as the first', () => {
    const creating = holdingBy(operation.atLeastOnce(({ event, seats }) =>
      Effect.gen(function*() {
        const created = yield* create(inventory, event, 'inventory', { capacity: 4 })
        if (created._tag !== 'Created') return yield* Effect.die('the inventory was there already')
        const reply = yield* send(inventory, event, { _tag: 'HoldRequested', seats }, 'hold')
        return reply._tag === 'Accepted' ? { _tag: 'SeatsHeld' } as const : yield* Effect.die('no hold')
      })
    ))
    return Effect.runPromise(rehearse.together(
      at,
      Effect.fnUntraced(function*(world) {
        const held = yield* world.create(creating, 'booking-1', flags)
        yield* held.run('hold', { crash: true })
        expect(yield* held.run('hold')).toBe('Delivered')
        expect((yield* held.state)._tag).toBe('Held')
        const exit = yield* Effect.exit(world.create(inventory, 'concert-1', { capacity: 4 }))
        expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toBe("Inventory 'concert-1' exists in the world already")
      }),
    ))
  })

  // A reference brings no code, so a world creates through one only a program it runs (decision 0183).
  test('creates through a reference a program the world runs, and fails the run where it runs none', async () => {
    const Inventory = reference<typeof inventory>('Inventory')
    const creating = holdingBy(operation.atLeastOnce(({ event, seats }) =>
      Effect.gen(function*() {
        const created = yield* create(Inventory, event, 'inventory', { capacity: 4 })
        if (created._tag !== 'Created') return yield* Effect.die('the inventory was there already')
        const reply = yield* send(Inventory, event, { _tag: 'HoldRequested', seats }, 'hold')
        return reply._tag === 'Accepted' ? { _tag: 'SeatsHeld' } as const : yield* Effect.die('no hold')
      })
    ))
    await Effect.runPromise(rehearse.together(
      at,
      Effect.fnUntraced(function*(world) {
        // Another event's inventory makes the world run the program.
        yield* world.create(inventory, 'concert-0', { capacity: 1 })
        const held = yield* world.create(creating, 'booking-1', flags)
        expect(yield* held.run('hold')).toBe('Delivered')
        expect((yield* held.state)._tag).toBe('Held')
      }),
    ))
    const exit = await Effect.runPromiseExit(rehearse.together(
      at,
      Effect.fnUntraced(function*(world) {
        const held = yield* world.create(creating, 'booking-1', flags)
        yield* held.run('hold')
      }),
    ))
    expect(Exit.isFailure(exit) && Cause.squash(exit.cause)).toBe(
      "the world runs no program 'Inventory', and a reference to it brings no code to run",
    )
  })

  // A rejection at creation creates nothing, and a run's `create` is answered it (decision 0182).
  test("answers a run's creation init rejects, creates nothing, and fails the test's own", async () => {
    const closed = { ...inventory, init: () => rejectWith('SalesClosed' as const) }
    const creating = holdingBy(operation.atLeastOnce(({ event }) =>
      Effect.gen(function*() {
        const created = yield* create(closed, event, 'inventory', { capacity: 4 })
        expect(created).toEqual({ _tag: 'Rejected', reason: 'SalesClosed' })
        return { _tag: 'SeatsUnavailable', reason: 'SalesClosed' } as const
      })
    ))
    const exit = await Effect.runPromiseExit(rehearse.together(
      at,
      Effect.fnUntraced(function*(world) {
        const held = yield* world.create(creating, 'booking-1', flags)
        expect(yield* held.run('hold')).toBe('Delivered')
        expect((yield* held.state)._tag).toBe('Cancelled')
        // Created, the inventory would be in the world already, and the test fail on that.
        yield* world.create(closed, 'concert-1', { capacity: 4 })
      }),
    ))
    expect(reasonOf(exit)).toBe("the init of Inventory rejected the flags of 'concert-1'")
  })

  // A rejection at creation and a message to no entity store no entity, and the world keeps each for the work that
  // asked, as the runtime does: a run after a crash is given the same answers, though the entity exists by then
  // (decision 0253).
  test('answers a run after a crash as the first, where init rejected its creation or its message found no entity', () => {
    const gated = {
      ...inventory,
      init: (flags: { capacity: number }, now: DateTime.Utc) =>
        flags.capacity === 0 ? rejectWith('SalesClosed' as const) : inventory.init(flags, now),
    }
    const told: Array<string> = []
    const creating = holdingBy(operation.atLeastOnce(({ event, seats }) =>
      Effect.gen(function*() {
        const created = yield* create(gated, event, 'inventory', { capacity: 0 })
        const reply = yield* send(gated, 'concert-2', { _tag: 'HoldRequested', seats }, 'hold')
        told.push(`${created._tag}/${reply._tag}`)
        return { _tag: 'SeatsUnavailable', reason: 'SalesClosed' } as const
      })
    ))
    return Effect.runPromise(rehearse.together(
      at,
      Effect.fnUntraced(function*(world) {
        const held = yield* world.create(creating, 'booking-1', flags)
        yield* held.run('hold', { crash: true })
        // Another creator makes both entities between the two runs.
        yield* world.create(gated, 'concert-1', { capacity: 4 })
        const second = yield* world.create(gated, 'concert-2', { capacity: 4 })
        expect(yield* held.run('hold')).toBe('Delivered')
        expect(told).toEqual(['Rejected/NotFound', 'Rejected/NotFound'])
        expect((yield* second.state).held).toEqual({})
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
          yield* one.send({ _tag: 'PayRequested', payment: 'card-1' }, { sender: ada })
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
        yield* held.run('hold')
        const deadline = yield* held.pending('deadline')
        const shipped = yield* world.create(order, 'order-1', start.flags)
        yield* shipped.send({ _tag: 'PayRequested', payment: 'card-1' }, { sender: ada })
        yield* shipped.answer('charge', { _tag: 'ChargeSucceeded', charge: 'ch-1' })
        yield* shipped.answer('tell-warehouse', { _tag: 'WarehouseTold' })
        yield* shipped.send({ _tag: 'ShipmentReported', tracking: 'tr-1' }, { sender: warehouse })
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
    keys: [key('charge', Schema.String)],
    init: () => ({ lines: [] }),
    update: (message) => (state) =>
      message.startsWith('+')
        ? { lines: [...state.lines, message.slice(1)] }
        : { lines: state.lines.filter((line) => `charged ${line}` !== message) },
    work: (state) => ({ charge: state.lines.map((line) => [line, { _tag: 'Charge', line }] as const) }),
    operations: { Charge: operation(() => Effect.succeed('charged')) },
    project: (state) => state.lines.length,
    indexes: {},
  })

  test('gives the work under each parameter, and answers it alone', () =>
    Effect.runPromise(rehearse(
      lines,
      { at: placedAt },
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send('+a')
        yield* rehearsal.send('+b')
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

// A test names the work by its key where it does not keep the pending, and asserts that a key holds none in one line
// (decision 0186).
describe('a rehearsal by a key', () => {
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
    keys: [key('charge', Schema.String)],
    init: () => ({ lines: [] }),
    update: (message) => (state) =>
      message.startsWith('+')
        ? { lines: [...state.lines, message.slice(1)] }
        : { lines: state.lines.filter((line) => `charged ${line}` !== message) },
    work: (state) => ({ charge: state.lines.map((line) => [line, { _tag: 'Charge', line }] as const) }),
    operations: { Charge: operation(() => Effect.succeed('charged')) },
    project: (state) => state.lines.length,
    indexes: {},
  })
  const failure = (exit: Exit.Exit<unknown, unknown>) => Exit.isFailure(exit) ? Cause.squash(exit.cause) : null

  test('answers the work under a key and its parameter, and gives null under a key that holds none', () =>
    Effect.runPromise(rehearse(
      lines,
      { flags: null, at: placedAt },
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send('+a')
        yield* rehearsal.send('+b')
        expect(yield* rehearsal.underWay('charge', 'a')).toEqual(yield* rehearsal.pending('charge', 'a'))
        expect(yield* rehearsal.answer('charge', 'a', 'charged a')).toBe('Delivered')
        expect(yield* rehearsal.underWay('charge', 'a')).toBeNull()
        expect((yield* rehearsal.underWay('charge', 'b'))?.work).toEqual({ _tag: 'Charge', line: 'b' })
        expect(yield* rehearsal.state).toEqual({ lines: ['b'] })
        // @ts-expect-error a key that takes a parameter is answered with its parameter
        const _bare = () => rehearsal.answer('charge', 'charged b')
        expect(failure(yield* Effect.exit(rehearsal.answer('charge', 'a', 'charged a')))).toBe(
          `no work is under way under '["charge","a"]'`,
        )
      }),
    )))

  test('fires a timer by its key, and refuses to answer it', () =>
    Effect.runPromise(rehearse(
      order,
      { flags: { order: { customer: 'ada', totalInCents: 4_200 } }, at: placedAt },
      Effect.fnUntraced(function*(rehearsal) {
        expect(failure(yield* Effect.exit(rehearsal.answer('payment-deadline', { _tag: 'WarehouseTold' })))).toBe(
          "the work under 'payment-deadline' is a timer: it fires",
        )
        expect(failure(yield* Effect.exit(rehearsal.fire('charge')))).toBe("no work is under way under 'charge'")
        // @ts-expect-error a key without a parameter takes none
        const _extra = () => rehearsal.fire('payment-deadline', 'x')
        expect(yield* rehearsal.fire('payment-deadline')).toBe('Delivered')
        expect(yield* rehearsal.state).toMatchObject({ _tag: 'Cancelled', reason: 'Unpaid' })
        expect(yield* rehearsal.underWay('payment-deadline')).toBeNull()
      }),
    )))

  test('runs an operation of a world by its key, with a crash and without', () =>
    Effect.runPromise(rehearse.together(
      placedAt,
      Effect.fnUntraced(function*(world) {
        yield* world.create(inventory, 'concert-1', { capacity: 4 })
        const held = yield* world.create(booking, 'booking-1', { customer: 'ada', event: 'concert-1', seats: 2 })
        const hold = yield* held.pending('hold')
        yield* held.run('hold', { crash: true })
        expect((yield* held.pending('hold')).idempotencyKey).toBe(hold.idempotencyKey)
        expect(yield* held.run('hold')).toBe('Delivered')
        expect((yield* held.state)._tag).toBe('Held')
      }),
    )))
})

// A meter arms a timer under a key at a time it is sent, and records the time each message is handled at. Given
// `every`, each firing arms the timer again `every` later, under `next` when it is given one, which then arms the
// first key in its turn (decision 0187).
describe('time that passes', () => {
  const Name = Schema.Literals(['a', 'b'])
  type Name = typeof Name.Type
  const Armed = Schema.Struct({
    key: Name,
    at: Schema.DateTimeUtcFromMillis,
    every: Schema.NullOr(Schema.Number),
    next: Schema.NullOr(Name),
  })
  type Metered = {
    state: { armed: ReadonlyArray<typeof Armed.Type>; seen: ReadonlyArray<string> }
    flags: Readonly<{}>
    inbound: Readonly<{ _tag: 'Arm' } & typeof Armed.Type> | Readonly<{ _tag: 'Ping' }>
    internal: Readonly<{ _tag: 'Rang'; key: Name }>
    operation: never
    key: Name
    parameter: {}
    rejection: never
    sender: Readonly<{ _tag: 'Tester' }>
    projection: number
    index: never
    services: never
  }
  const seenAs = (what: string, at: DateTime.Utc) => `${what}@${DateTime.formatIso(at)}`
  const meter = (name: string): Program<Metered> => ({
    name,
    keys: { a: null, b: null },
    schemas: {
      state: Schema.Struct({ armed: Schema.Array(Armed), seen: Schema.Array(Schema.String) }),
      flags: Schema.Struct({}),
      inbound: Schema.Union([
        Schema.TaggedStruct('Arm', Armed.fields),
        Schema.TaggedStruct('Ping', {}),
      ]),
      internal: Schema.TaggedStruct('Rang', { key: Name }),
      operation: Schema.Never,
      rejection: Schema.Never,
      sender: Schema.TaggedStruct('Tester', {}),
      projection: Schema.Int,
    },
    init: () => ({ armed: [], seen: [] }),
    update: (message, { at }) => (state) => {
      const seen = [...state.seen, seenAs(message._tag === 'Ping' ? 'Ping' : message.key, at)]
      if (message._tag === 'Ping') return { ...state, seen }
      const others = state.armed.filter(({ key }) => key !== message.key)
      if (message._tag === 'Arm') {
        const { _tag: _, ...armed } = message
        return { armed: [...others, armed], seen }
      }
      const rang = state.armed.find(({ key }) => key === message.key)
      if (rang === undefined || rang.every === null) return { armed: others, seen }
      const again = {
        key: rang.next ?? rang.key,
        at: DateTime.addDuration(at, Duration.millis(rang.every)),
        every: rang.every,
        next: rang.next === null ? null : rang.key,
      }
      return { armed: [...others.filter(({ key }) => key !== again.key), again], seen }
    },
    work: (state) =>
      Object.fromEntries(state.armed.map(({ key, at }) => [key, timer(at, { _tag: 'Rang', key } as const)])),
    operations: {},
    project: (state) => state.seen.length,
    indexes: {},
  })
  const tester = { _tag: 'Tester' } as const
  const hours = (count: number) => DateTime.add(placedAt, { hours: count })
  const failure = (exit: Exit.Exit<unknown>) => Exit.isFailure(exit) ? Cause.squash(exit.cause) : null

  test('handles a message after it at the time it reached', () =>
    Effect.runPromise(rehearse(
      meter('Meter'),
      { flags: {}, at: placedAt },
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'Ping' }, { sender: tester })
        yield* rehearsal.advance('3 hours')
        yield* rehearsal.send({ _tag: 'Ping' }, { sender: tester })
        yield* rehearsal.advance(0)
        yield* rehearsal.send({ _tag: 'Ping' }, { sender: tester })
        expect((yield* rehearsal.state).seen).toEqual([
          seenAs('Ping', placedAt),
          seenAs('Ping', hours(3)),
          seenAs('Ping', hours(3)),
        ])
      }),
    )))

  test('fires each timer due within it at its time, in their order, and none due after it', () =>
    Effect.runPromise(rehearse(
      meter('Meter'),
      { flags: {}, at: placedAt },
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'Arm', key: 'b', at: hours(2), every: null, next: null }, { sender: tester })
        yield* rehearsal.send({ _tag: 'Arm', key: 'a', at: hours(1), every: 30 * 60 * 1000, next: null }, { sender: tester })
        // Within two hours, `a` fires at 1h, 1h30 and 2h. `b` fires at 2h before `a` does, since `a` came back at
        // 2h after `b` was armed.
        yield* rehearsal.advance('2 hours')
        expect(yield* rehearsal.underWay('b')).toBeNull()
        yield* rehearsal.send({ _tag: 'Ping' }, { sender: tester })
        expect((yield* rehearsal.state).seen.slice(2)).toEqual([
          seenAs('a', hours(1)),
          seenAs('a', hours(1.5)),
          seenAs('b', hours(2)),
          seenAs('a', hours(2)),
          seenAs('Ping', hours(2)),
        ])
        expect((yield* rehearsal.pending('a')).work).toEqual(timer(hours(2.5), { _tag: 'Rang', key: 'a' }))
      }),
    )))

  test('fires a timer due before the time already reached when it passes', () =>
    Effect.runPromise(rehearse(
      meter('Meter'),
      { flags: {}, at: hours(1) },
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'Arm', key: 'a', at: placedAt, every: null, next: null }, { sender: tester })
        yield* rehearsal.advance(0)
        expect((yield* rehearsal.state).seen).toEqual([seenAs('a', hours(1)), seenAs('a', hours(1))])
      }),
    )))

  test('fails on a duration below zero or infinite, and on a timer armed again at a time already reached', async () => {
    const backwards = await Effect.runPromiseExit(rehearse(
      meter('Meter'),
      { flags: {}, at: placedAt },
      (rehearsal) => rehearsal.advance('-1 second'),
    ))
    expect(failure(backwards)).toBe('time passes by a finite duration of zero or more, not -1s')
    const endless = await Effect.runPromiseExit(rehearse(
      meter('Meter'),
      { flags: {}, at: placedAt },
      (rehearsal) => rehearsal.advance(Duration.infinity),
    ))
    expect(failure(endless)).toStartWith('time passes by a finite duration of zero or more, not ')
    const looping = await Effect.runPromiseExit(rehearse(
      meter('Meter'),
      { flags: {}, at: placedAt },
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'Arm', key: 'a', at: hours(1), every: 0, next: null }, { sender: tester })
        yield* rehearsal.advance('1 day')
      }),
    ))
    expect(failure(looping)).toBe(
      "the timer under 'a' of Meter 'rehearsal' fires twice at 2026-10-30T11:00:00.000Z, and time would never pass",
    )
  })

  // Two timers that arm each other at one time loop as one timer does, though neither arms itself.
  test('fails on two timers that arm each other again at a time already reached', async () => {
    const looping = await Effect.runPromiseExit(rehearse(
      meter('Meter'),
      { flags: {}, at: placedAt },
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'Arm', key: 'a', at: hours(1), every: 0, next: 'b' }, { sender: tester })
        yield* rehearsal.advance('1 day')
      }),
    ))
    expect(failure(looping)).toBe(
      "the timer under 'a' of Meter 'rehearsal' fires twice at 2026-10-30T11:00:00.000Z, and time would never pass",
    )
  })

  // A key fires again at a later time: each firing arms the other key an hour on, and three hours pass.
  test('fires two timers that arm each other later, each at its time', () =>
    Effect.runPromise(rehearse(
      meter('Meter'),
      { flags: {}, at: placedAt },
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'Arm', key: 'a', at: hours(1), every: 60 * 60 * 1000, next: 'b' }, { sender: tester })
        yield* rehearsal.advance('3 hours')
        expect((yield* rehearsal.state).seen.slice(1)).toEqual([
          seenAs('a', hours(1)),
          seenAs('b', hours(2)),
          seenAs('a', hours(3)),
        ])
        expect((yield* rehearsal.pending('b')).work).toEqual(timer(hours(4), { _tag: 'Rang', key: 'b' }))
      }),
    )))

  test('fires the timers of every entity of a world in the order of their times', () =>
    Effect.runPromise(rehearse.together(
      placedAt,
      Effect.fnUntraced(function*(world) {
        const one = yield* world.create(meter('One'), 'one', {})
        const other = yield* world.create(meter('Other'), 'other', {})
        yield* other.send({ _tag: 'Arm', key: 'a', at: hours(1), every: null, next: null }, { sender: tester })
        yield* one.send({ _tag: 'Arm', key: 'a', at: hours(2), every: null, next: null }, { sender: tester })
        yield* world.advance('90 minutes')
        yield* one.send({ _tag: 'Ping' }, { sender: tester })
        expect((yield* other.state).seen.slice(1)).toEqual([seenAs('a', hours(1))])
        expect((yield* one.state).seen.slice(1)).toEqual([seenAs('Ping', hours(1.5))])
        yield* world.advance('1 hour')
        expect((yield* one.state).seen.slice(2)).toEqual([seenAs('a', hours(2))])
      }),
    )))

  // Of two timers due at one time, the one of the entity created first fires first, whatever the order they were
  // armed in, so a scenario replays the same steps.
  test('fires the timers of two entities due at one time in the order the entities were created', () => {
    const fired: Array<string> = []
    const logged = (name: string): Program<Metered> => {
      const plain = meter(name)
      return {
        ...plain,
        update: (message, meta) => {
          if (message._tag === 'Rang') fired.push(name)
          return plain.update(message, meta)
        },
      }
    }
    return Effect.runPromise(rehearse.together(
      placedAt,
      Effect.fnUntraced(function*(world) {
        const first = yield* world.create(logged('First'), 'first', {})
        const second = yield* world.create(logged('Second'), 'second', {})
        yield* second.send({ _tag: 'Arm', key: 'a', at: hours(1), every: null, next: null }, { sender: tester })
        yield* first.send({ _tag: 'Arm', key: 'a', at: hours(1), every: null, next: null }, { sender: tester })
        yield* world.advance('1 hour')
        expect(fired).toEqual(['First', 'Second'])
      }),
    ))
  })
})
