/**
 * The booking and its inventory on the runtime, in one database: two entities that talk through operations
 * (decision 0009), where the scenarios of `scenarios.test.ts` rehearse the booking alone and answer for the
 * inventory. It is also how a program is run: a client, a runtime that creates its tables, and a handle per program.
 * What only a probe or values frozen through show is the library's, under `two entities that talk` in
 * `src/runtime/callers.test.ts`.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import type { SqlClient } from 'effect/sql'
import { create, launch, operation, send } from '@fgaudo/effect-tea-persistent'
import { booking } from './booking.ts'
import { inventory } from './inventory.ts'

/** A limit no reading of this test reaches: a reading says how many rows it takes (decision 0141). */
const all = 100

const organizer = { _tag: 'Organizer' } as const
const ann = { _tag: 'Customer', id: 'ann' } as const

const database = <A, E>(test: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.runPromise(
    Effect.scoped(test).pipe(
      Effect.provide(SqliteClient.layer({ filename: ':memory:' })),
      Effect.orDie,
    ),
  )

test('a booking holds its seats in the inventory, and confirms them', () =>
  database(Effect.scoped(Effect.gen(function*() {
    const runtime = yield* launch()
    // Neither program needs a service of its own: the booking talks to the inventory, which the runtime routes.
    const inventories = yield* runtime.deploy(inventory)
    const bookings = yield* runtime.deploy(booking)

    expect(yield* inventories.create('gig', { flags: { capacity: 10 }, requestId: 'c-gig', sender: organizer }))
      .toEqual({ _tag: 'Created' })
    expect(
      yield* bookings.create('b1', { flags: { customer: 'ann', event: 'gig', seats: 3 }, requestId: 'c-b1', sender: ann }),
    ).toEqual({ _tag: 'Created' })

    // The booking's hold is an operation: it sends to the inventory and waits for its reply.
    yield* runtime.settled
    expect(yield* bookings.read('b1')).toMatchObject({ status: 'Held', canConfirm: true })
    expect(yield* inventories.read('gig')).toMatchObject({ open: true, available: 7 })

    expect(yield* bookings.send('b1', { _tag: 'ConfirmRequested' }, { requestId: 'r1', sender: ann, keep: 'forever' }))
      .toEqual({ _tag: 'Accepted' })
    yield* runtime.settled
    expect(yield* bookings.read('b1')).toMatchObject({ status: 'Confirmed', canConfirm: false })
    // The seats are sold, not held: the booking's confirmation moved them.
    expect(yield* inventories.read('gig')).toMatchObject({ available: 7 })

    // What other systems learn: the booking's whole story, step by step (decision 0038).
    expect(
      (yield* bookings.published('projection', [], all)).map(({ kind, message, value }) =>
        [kind, message?._tag ?? null, value.status]
      ),
    ).toEqual([
      ['Creation', null, 'Holding'],
      ['Internal', 'SeatsHeld', 'Held'],
      ['Inbound', 'ConfirmRequested', 'Confirming'],
      ['Internal', 'SeatsConfirmed', 'Confirmed'],
    ])
    // Of the inventory, only the hold. Confirming the seats moves them from held to sold, which leaves
    // `available` where it was: a fact no caller can read is not published, and an inventory whose sales must
    // be is one that shows them.
    expect(
      (yield* inventories.published('projection', [], all)).map(({ kind, message, value }) =>
        [kind, message?._tag ?? null, value.available]
      ),
    ).toEqual([['Creation', null, 10], ['Inbound', 'HoldRequested', 7]])
  }))))

test('a booking of more seats than are left is cancelled with the inventory’s reason', () =>
  database(Effect.scoped(Effect.gen(function*() {
    const runtime = yield* launch()
    const inventories = yield* runtime.deploy(inventory)
    const bookings = yield* runtime.deploy(booking)

    yield* inventories.create('small', { flags: { capacity: 2 }, requestId: 'c-small', sender: organizer })
    yield* bookings.create('b2', { flags: { customer: 'ann', event: 'small', seats: 5 }, requestId: 'c-b2', sender: ann })
    yield* runtime.settled

    expect(yield* bookings.read('b2')).toMatchObject({ status: 'Cancelled', canConfirm: false })
    expect(yield* inventories.read('small')).toMatchObject({ available: 2 })
  }))))

test('a booking for an event that does not exist is cancelled', () =>
  database(Effect.scoped(Effect.gen(function*() {
    const runtime = yield* launch()
    yield* runtime.deploy(inventory)
    const bookings = yield* runtime.deploy(booking)

    yield* bookings.create('b3', { flags: { customer: 'ann', event: 'nowhere', seats: 1 }, requestId: 'c-b3', sender: ann })
    yield* runtime.settled

    expect(yield* bookings.read('b3')).toMatchObject({ status: 'Cancelled' })
  }))))

test('a booking whose hold sends a message the inventory cannot encode is suspended, not sent again', () =>
  database(Effect.scoped(Effect.gen(function*() {
    const runtime = yield* launch()
    // Half a seat is no `Int`: the message is the booking's defect, and reaches no inventory (decision 0040).
    const halving = {
      ...booking,
      operations: {
        ...booking.operations,
        Hold: operation.atLeastOnce((op: { event: string }) =>
          Effect.flatMap(
            send(inventory, op.event, { _tag: 'HoldRequested', seats: 0.5 }, 'hold'),
            () => Effect.succeed({ _tag: 'SeatsHeld' } as const),
          )
        ),
      },
    } as typeof booking
    const inventories = yield* runtime.deploy(inventory)
    const bookings = yield* runtime.deploy(halving)
    yield* inventories.create('gig', { flags: { capacity: 10 }, requestId: 'c-gig', sender: organizer })
    yield* bookings.create('b1', { flags: { customer: 'ann', event: 'gig', seats: 3 }, requestId: 'c-b1', sender: ann })
    yield* runtime.settled
    expect(yield* bookings.send('b1', { _tag: 'ConfirmRequested' }, { requestId: 'r1', sender: ann, keep: 'forever' }))
      .toEqual({ _tag: 'Suspended' })
    expect(yield* inventories.read('gig')).toMatchObject({ available: 10 })
  }))))

test('an operation that sends two requests to one inventory has both applied, each under its name', () =>
  database(Effect.scoped(Effect.gen(function*() {
    const runtime = yield* launch()
    // A hold taken back at once: two messages to the same entity from one run, which their names keep apart
    // (decision 0047).
    const undoing = {
      ...booking,
      operations: {
        ...booking.operations,
        Hold: operation.atLeastOnce((op: { event: string; seats: number }) =>
          Effect.flatMap(
            send(inventory, op.event, { _tag: 'HoldRequested', seats: op.seats }, 'hold'),
            () =>
              Effect.as(
                send(inventory, op.event, { _tag: 'ReleaseRequested' }, 'release'),
                { _tag: 'SeatsHeld' } as const,
              ),
          )
        ),
      },
    } as typeof booking
    const inventories = yield* runtime.deploy(inventory)
    const bookings = yield* runtime.deploy(undoing)
    yield* inventories.create('gig', { flags: { capacity: 10 }, requestId: 'c-gig', sender: organizer })
    yield* bookings.create('b1', { flags: { customer: 'ann', event: 'gig', seats: 3 }, requestId: 'c-b1', sender: ann })
    yield* runtime.settled
    expect(yield* inventories.read('gig')).toMatchObject({ available: 10 })
  }))))

test('an operation that sends twice under one name to one inventory is suspended', () =>
  database(Effect.scoped(Effect.gen(function*() {
    const runtime = yield* launch()
    // The second message would be answered the first one's reply, and never applied: it is the booking's defect
    // (decision 0047).
    const twice = {
      ...booking,
      operations: {
        ...booking.operations,
        Hold: operation.atLeastOnce((op: { event: string; seats: number }) =>
          Effect.flatMap(
            send(inventory, op.event, { _tag: 'HoldRequested', seats: op.seats }, 'hold'),
            () =>
              Effect.as(
                send(inventory, op.event, { _tag: 'ReleaseRequested' }, 'hold'),
                { _tag: 'SeatsHeld' } as const,
              ),
          )
        ),
      },
    } as typeof booking
    const inventories = yield* runtime.deploy(inventory)
    const bookings = yield* runtime.deploy(twice)
    yield* inventories.create('gig', { flags: { capacity: 10 }, requestId: 'c-gig', sender: organizer })
    yield* bookings.create('b1', { flags: { customer: 'ann', event: 'gig', seats: 3 }, requestId: 'c-b1', sender: ann })
    yield* runtime.settled
    expect(yield* bookings.send('b1', { _tag: 'ConfirmRequested' }, { requestId: 'r1', sender: ann, keep: 'forever' }))
      .toEqual({ _tag: 'Suspended' })
    // The release reached no inventory.
    expect(yield* inventories.read('gig')).toMatchObject({ available: 7 })
  }))))

// A booking that opens its event's inventory itself: an operation creates an entity under a name, and a creation
// and a message are requests apart, so the same name serves both (decisions 0050, 0060).
const opening = (creations: number) => ({
  ...booking,
  operations: {
    ...booking.operations,
    Hold: operation.atLeastOnce((op: { event: string; seats: number }) =>
      Effect.gen(function*() {
        for (let made = 0; made < creations; made++) yield* create(inventory, op.event, { capacity: 10 }, 'hold')
        yield* send(inventory, op.event, { _tag: 'HoldRequested', seats: op.seats }, 'hold')
        return { _tag: 'SeatsHeld' } as const
      })
    ),
  },
} as typeof booking)

test('an operation creates an entity, and sends it a message under the same name', () =>
  database(Effect.scoped(Effect.gen(function*() {
    const runtime = yield* launch()
    const inventories = yield* runtime.deploy(inventory)
    const bookings = yield* runtime.deploy(opening(1))
    yield* bookings.create('b1', { flags: { customer: 'ann', event: 'gig', seats: 3 }, requestId: 'c-b1', sender: ann })
    yield* runtime.settled
    expect(yield* inventories.read('gig')).toMatchObject({ available: 7 })
  }))))

test('an operation that creates twice under one name is suspended', () =>
  database(Effect.scoped(Effect.gen(function*() {
    const runtime = yield* launch()
    const inventories = yield* runtime.deploy(inventory)
    const bookings = yield* runtime.deploy(opening(2))
    yield* bookings.create('b1', { flags: { customer: 'ann', event: 'gig', seats: 3 }, requestId: 'c-b1', sender: ann })
    yield* runtime.settled
    expect(yield* bookings.send('b1', { _tag: 'ConfirmRequested' }, { requestId: 'r1', sender: ann, keep: 'forever' }))
      .toEqual({ _tag: 'Suspended' })
    // The first creation reached the inventory, and the hold did not.
    expect(yield* inventories.read('gig')).toMatchObject({ available: 10 })
  }))))
