/**
 * The booking's and the inventory's scenarios, as tests would be written. The file is not named `*.test.ts`,
 * since `rehearse` is only declared: `bun test` would run it and fail.
 *
 * `rehearse` runs one entity. In the booking's scenarios the test answers for the inventory, and in the
 * inventory's it sends as the bookings would.
 */
import { describe, expect, test } from 'bun:test'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import { accepted, type Address, rehearse, rejected } from '../api.ts'
import { booking, type Sender } from './booking.ts'
import { inventory } from './inventory.ts'

const bookedAt = DateTime.makeUnsafe('2026-10-30T10:00:00Z')

const start = { flags: { customer: 'ada', event: 'concert-1', seats: 2 }, at: bookedAt }

const ada: Sender = { _tag: 'Customer', id: 'ada' }

describe('booking', () => {
  test('held seats are confirmed', () =>
    Effect.runPromise(rehearse(
      booking,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.answer(yield* rehearsal.pending('hold'), { _tag: 'SeatsHeld' })
        expect(yield* rehearsal.send({ _tag: 'ConfirmRequested' }, ada)).toEqual(accepted)
        yield* rehearsal.answer(yield* rehearsal.pending('confirm'), { _tag: 'SeatsConfirmed' })
        expect((yield* rehearsal.state)._tag).toBe('Confirmed')
      }),
    )))

  test('a booking the inventory rejects is cancelled', () =>
    Effect.runPromise(rehearse(
      booking,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.answer(yield* rehearsal.pending('hold'), { _tag: 'SeatsUnavailable', reason: 'SoldOut' })
        expect(yield* rehearsal.projection).toMatchObject({ status: 'Cancelled', canConfirm: false })
        expect(yield* rehearsal.state).toMatchObject({ reason: 'SoldOut' })
      }),
    )))

  test('a cancellation during the hold releases the seats once held', () =>
    Effect.runPromise(rehearse(
      booking,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        expect(yield* rehearsal.send({ _tag: 'CancelRequested' }, ada)).toEqual(accepted)
        expect((yield* rehearsal.projection).canCancel).toBe(false)
        yield* rehearsal.answer(yield* rehearsal.pending('hold'), { _tag: 'SeatsHeld' })
        yield* rehearsal.answer(yield* rehearsal.pending('release'), { _tag: 'SeatsReleased' })
        expect(yield* rehearsal.state).toMatchObject({ _tag: 'Cancelled', reason: 'ByCustomer' })
      }),
    )))

  test('seats held after the deadline are released', () =>
    Effect.runPromise(rehearse(
      booking,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.answer(yield* rehearsal.pending('hold'), { _tag: 'SeatsHeld' })
        // With no clock, firing the timer at once stands for a deadline already past when the seats were held.
        yield* rehearsal.fire(yield* rehearsal.pending('deadline'))
        expect(yield* rehearsal.send({ _tag: 'ConfirmRequested' }, ada)).toMatchObject(rejected)
        yield* rehearsal.answer(yield* rehearsal.pending('release'), { _tag: 'SeatsReleased' })
        expect(yield* rehearsal.state).toMatchObject({ _tag: 'Cancelled', reason: 'Expired' })
      }),
    )))

  test('a hold under way when the process dies sends the same request again', () =>
    Effect.runPromise(rehearse(
      booking,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        const before = yield* rehearsal.pending('hold')
        yield* rehearsal.restart
        // The idempotency key is the request id: the inventory answers from its stored reply.
        expect((yield* rehearsal.pending('hold')).idempotencyKey).toBe(before.idempotencyKey)
      }),
    )))

  test('only the customer confirms', () =>
    Effect.runPromise(rehearse(
      booking,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.answer(yield* rehearsal.pending('hold'), { _tag: 'SeatsHeld' })
        expect(yield* rehearsal.send({ _tag: 'ConfirmRequested' }, { _tag: 'Customer', id: 'eve' }))
          .toMatchObject(rejected)
      }),
    )))
})

const event = { flags: { capacity: 4 }, at: bookedAt }

const first: Address = { name: 'Booking', id: 'booking-1' }

const second: Address = { name: 'Booking', id: 'booking-2' }

describe('inventory', () => {
  test('holds never exceed the capacity', () =>
    Effect.runPromise(rehearse(
      inventory,
      event,
      Effect.fnUntraced(function*(rehearsal) {
        expect(yield* rehearsal.sendFrom({ _tag: 'HoldRequested', seats: 3 }, first)).toEqual(accepted)
        expect(yield* rehearsal.sendFrom({ _tag: 'HoldRequested', seats: 2 }, second))
          .toEqual({ _tag: 'Rejected', reason: 'SoldOut' })
        expect(yield* rehearsal.sendFrom({ _tag: 'ReleaseRequested' }, first)).toEqual(accepted)
        expect(yield* rehearsal.sendFrom({ _tag: 'HoldRequested', seats: 2 }, second)).toEqual(accepted)
        expect((yield* rehearsal.projection).available).toBe(2)
      }),
    )))

  test('a closed sale takes no hold, and confirms those it made', () =>
    Effect.runPromise(rehearse(
      inventory,
      event,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.sendFrom({ _tag: 'HoldRequested', seats: 2 }, first)
        expect(yield* rehearsal.send({ _tag: 'CloseRequested' }, { _tag: 'Organizer' })).toEqual(accepted)
        expect(yield* rehearsal.sendFrom({ _tag: 'HoldRequested', seats: 1 }, second))
          .toEqual({ _tag: 'Rejected', reason: 'SalesClosed' })
        expect(yield* rehearsal.sendFrom({ _tag: 'ConfirmRequested' }, first)).toEqual(accepted)
      }),
    )))

  test('a booking acts only on its own hold', () =>
    Effect.runPromise(rehearse(
      inventory,
      event,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.sendFrom({ _tag: 'HoldRequested', seats: 2 }, first)
        expect(yield* rehearsal.sendFrom({ _tag: 'HoldRequested', seats: 1 }, first)).toMatchObject(rejected)
        expect(yield* rehearsal.sendFrom({ _tag: 'ReleaseRequested' }, second)).toMatchObject(rejected)
        expect(yield* rehearsal.sendFrom({ _tag: 'HoldRequested', seats: 1 }, { name: 'Order', id: 'booking-2' }))
          .toMatchObject(rejected)
      }),
    )))
})
