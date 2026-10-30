/**
 * The booking and its inventory on the runtime, in one database: two entities that talk through operations
 * (decision 0009), where the scenarios of `scenarios.test.ts` rehearse the booking alone and answer for the
 * inventory. It is also how a program is run: a client, the tables, a runtime, and a handle per program.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import { SqlClient } from 'effect/sql'
import { createTables, launch, operation, send } from '../../src/index.ts'
import { booking } from './booking.ts'
import { inventory } from './inventory.ts'

const organizer = { _tag: 'Organizer' } as const
const ann = { _tag: 'Customer', id: 'ann' } as const

const database = <A, E>(test: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.runPromise(
    Effect.scoped(Effect.flatMap(createTables, () => test)).pipe(
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

    expect(yield* inventories.create('gig', { capacity: 10 }, { requestId: 'c-gig', sender: organizer }))
      .toEqual({ _tag: 'Created' })
    expect(
      yield* bookings.create('b1', { customer: 'ann', event: 'gig', seats: 3 }, { requestId: 'c-b1', sender: ann }),
    ).toEqual({ _tag: 'Created' })

    // The booking's hold is an operation: it sends to the inventory and waits for its reply.
    yield* runtime.settled
    expect(yield* bookings.read('b1')).toMatchObject({ status: 'Held', canConfirm: true })
    expect(yield* inventories.read('gig')).toMatchObject({ open: true, available: 7 })

    expect(yield* bookings.send('b1', { _tag: 'ConfirmRequested' }, { requestId: 'r1', sender: ann }))
      .toEqual({ _tag: 'Accepted' })
    yield* runtime.settled
    expect(yield* bookings.read('b1')).toMatchObject({ status: 'Confirmed', canConfirm: false })
    // The seats are sold, not held: the booking's confirmation moved them.
    expect(yield* inventories.read('gig')).toMatchObject({ available: 7 })

    // What other systems learn: the booking's whole story, step by step (decision 0038).
    expect(
      (yield* bookings.published(0)).map(({ kind, message, projection }) =>
        [kind, message?._tag ?? null, projection.status]
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
      (yield* inventories.published(0)).map(({ kind, message, projection }) =>
        [kind, message?._tag ?? null, projection.available]
      ),
    ).toEqual([['Creation', null, 10], ['Inbound', 'HoldRequested', 7]])
  }))))

test('a booking of more seats than are left is cancelled with the inventory’s reason', () =>
  database(Effect.scoped(Effect.gen(function*() {
    const runtime = yield* launch()
    const inventories = yield* runtime.deploy(inventory)
    const bookings = yield* runtime.deploy(booking)

    yield* inventories.create('small', { capacity: 2 }, { requestId: 'c-small', sender: organizer })
    yield* bookings.create('b2', { customer: 'ann', event: 'small', seats: 5 }, { requestId: 'c-b2', sender: ann })
    yield* runtime.settled

    expect(yield* bookings.read('b2')).toMatchObject({ status: 'Cancelled', canConfirm: false })
    expect(yield* inventories.read('small')).toMatchObject({ available: 2 })
  }))))

test('a booking for an event that does not exist is cancelled', () =>
  database(Effect.scoped(Effect.gen(function*() {
    const runtime = yield* launch()
    yield* runtime.deploy(inventory)
    const bookings = yield* runtime.deploy(booking)

    yield* bookings.create('b3', { customer: 'ann', event: 'nowhere', seats: 1 }, { requestId: 'c-b3', sender: ann })
    yield* runtime.settled

    expect(yield* bookings.read('b3')).toMatchObject({ status: 'Cancelled' })
  }))))

test('the inventory keeps its reply to a booking while the booking’s hold waits for it, and no longer', () =>
  database(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const repliesToBookings = sql<{ count: number }>`
      SELECT count(*) AS count FROM replies WHERE name = 'Inventory' AND sender_name = 'Booking'
    `.pipe(Effect.orDie)
    const seen: Array<number> = []
    yield* Effect.scoped(Effect.gen(function*() {
      const runtime = yield* launch({
        // Before the booking's step that handles the inventory's answer commits, the hold that asked still holds.
        at: (point, entity, event) =>
          point === 'BeforeCommit' && entity.name === 'Booking' && event._tag === 'Handle'
            ? Effect.flatMap(repliesToBookings, ([row]) => Effect.sync(() => seen.push(row?.count ?? 0)))
            : Effect.void,
      })
      const inventories = yield* runtime.deploy(inventory)
      const bookings = yield* runtime.deploy(booking)
      yield* inventories.create('gig', { capacity: 10 }, { requestId: 'c-gig', sender: organizer })
      yield* bookings.create('b1', { customer: 'ann', event: 'gig', seats: 3 }, { requestId: 'c-b1', sender: ann })
      yield* runtime.settled
      expect(yield* bookings.read('b1')).toMatchObject({ status: 'Held' })
    }))
    // The reply was there for the hold to read again after a crash, and went with the step that ended the hold
    // (decision 0021).
    expect(seen).toContain(1)
    expect((yield* repliesToBookings)[0]?.count).toBe(0)
  })))

test('a booking whose hold a crash interrupted holds its seats, whichever program is deployed first', () =>
  database(Effect.gen(function*() {
    yield* Effect.scoped(Effect.gen(function*() {
      const crashed = yield* Deferred.make<void>()
      const runtime = yield* launch({
        // The booking is stored, and the process dies before its hold starts.
        at: (point, entity) =>
          point === 'AfterCommit' && entity.name === 'Booking'
            ? Effect.andThen(Deferred.succeed(crashed, undefined), Effect.never)
            : Effect.void,
      })
      const inventories = yield* runtime.deploy(inventory)
      const bookings = yield* runtime.deploy(booking)
      yield* inventories.create('gig', { capacity: 10 }, { requestId: 'c-gig', sender: organizer })
      yield* Effect.raceFirst(
        bookings.create('b1', { customer: 'ann', event: 'gig', seats: 3 }, { requestId: 'c-b1', sender: ann }),
        Deferred.await(crashed),
      )
    }))
    yield* Effect.scoped(Effect.gen(function*() {
      const runtime = yield* launch()
      // The booking first: its hold starts again at once, and waits for the inventory (decision 0045).
      const bookings = yield* runtime.deploy(booking)
      // The inventory comes later, once the hold has had the time to send.
      yield* Effect.sleep('50 millis')
      const inventories = yield* runtime.deploy(inventory)
      yield* runtime.settled
      expect(yield* bookings.read('b1')).toMatchObject({ status: 'Held', canConfirm: true })
      expect(yield* inventories.read('gig')).toMatchObject({ available: 7 })
    }))
  })))

test('a booking whose hold the inventory crashed on sends it again, and is not suspended', () =>
  database(Effect.scoped(Effect.gen(function*() {
    let crashes = true
    const runtime = yield* launch({
      // The hold is written, and the runtime fails before it answers: the hook stands for a failed write.
      observe: (entity, event) => {
        if (entity.name !== 'Inventory' || event._tag !== 'Receive' || !crashes) return Effect.void
        crashes = false
        return Effect.die('the runtime failed')
      },
    })
    const inventories = yield* runtime.deploy(inventory)
    const bookings = yield* runtime.deploy(booking)
    yield* inventories.create('gig', { capacity: 10 }, { requestId: 'c-gig', sender: organizer })
    yield* bookings.create('b1', { customer: 'ann', event: 'gig', seats: 3 }, { requestId: 'c-b1', sender: ann })
    // The hold sends again, and gets the reply the inventory stored before it crashed (decision 0046).
    yield* runtime.settled
    expect(crashes).toBe(false)
    expect(yield* bookings.read('b1')).toMatchObject({ status: 'Held', canConfirm: true })
    expect(yield* inventories.read('gig')).toMatchObject({ available: 7 })
  }))))

test('a booking whose hold sends a message the inventory cannot encode is suspended, not sent again', () =>
  database(Effect.scoped(Effect.gen(function*() {
    const runtime = yield* launch()
    // Half a seat is no `Int`: the message is the booking's defect, and reaches no inventory (decision 0040).
    const halving = {
      ...booking,
      operations: {
        ...booking.operations,
        Hold: operation((op: { event: string }, idempotencyKey) =>
          Effect.flatMap(
            send(inventory, op.event, { _tag: 'HoldRequested', seats: 0.5 }, idempotencyKey, 'hold'),
            () => Effect.succeed({ _tag: 'SeatsHeld' } as const),
          )
        ),
      },
    } as typeof booking
    const inventories = yield* runtime.deploy(inventory)
    const bookings = yield* runtime.deploy(halving)
    yield* inventories.create('gig', { capacity: 10 }, { requestId: 'c-gig', sender: organizer })
    yield* bookings.create('b1', { customer: 'ann', event: 'gig', seats: 3 }, { requestId: 'c-b1', sender: ann })
    yield* runtime.settled
    expect(yield* bookings.send('b1', { _tag: 'ConfirmRequested' }, { requestId: 'r1', sender: ann }))
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
        Hold: operation((op: { event: string; seats: number }, idempotencyKey) =>
          Effect.flatMap(
            send(inventory, op.event, { _tag: 'HoldRequested', seats: op.seats }, idempotencyKey, 'hold'),
            () =>
              Effect.as(
                send(inventory, op.event, { _tag: 'ReleaseRequested' }, idempotencyKey, 'release'),
                { _tag: 'SeatsHeld' } as const,
              ),
          )
        ),
      },
    } as typeof booking
    const inventories = yield* runtime.deploy(inventory)
    const bookings = yield* runtime.deploy(undoing)
    yield* inventories.create('gig', { capacity: 10 }, { requestId: 'c-gig', sender: organizer })
    yield* bookings.create('b1', { customer: 'ann', event: 'gig', seats: 3 }, { requestId: 'c-b1', sender: ann })
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
        Hold: operation((op: { event: string; seats: number }, idempotencyKey) =>
          Effect.flatMap(
            send(inventory, op.event, { _tag: 'HoldRequested', seats: op.seats }, idempotencyKey, 'hold'),
            () =>
              Effect.as(
                send(inventory, op.event, { _tag: 'ReleaseRequested' }, idempotencyKey, 'hold'),
                { _tag: 'SeatsHeld' } as const,
              ),
          )
        ),
      },
    } as typeof booking
    const inventories = yield* runtime.deploy(inventory)
    const bookings = yield* runtime.deploy(twice)
    yield* inventories.create('gig', { capacity: 10 }, { requestId: 'c-gig', sender: organizer })
    yield* bookings.create('b1', { customer: 'ann', event: 'gig', seats: 3 }, { requestId: 'c-b1', sender: ann })
    yield* runtime.settled
    expect(yield* bookings.send('b1', { _tag: 'ConfirmRequested' }, { requestId: 'r1', sender: ann }))
      .toEqual({ _tag: 'Suspended' })
    // The release reached no inventory.
    expect(yield* inventories.read('gig')).toMatchObject({ available: 7 })
  }))))
