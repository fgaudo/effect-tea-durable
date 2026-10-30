/**
 * The booking and its inventory on the runtime, in one database: two entities that talk through operations
 * (decision 0009), where the scenarios of `scenarios.test.ts` rehearse the booking alone and answer for the
 * inventory. It is also how a program is run: a client, the tables, a runtime, and a handle per program.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import { SqlClient } from 'effect/sql'
import { createTables, launch } from '../../src/index.ts'
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
