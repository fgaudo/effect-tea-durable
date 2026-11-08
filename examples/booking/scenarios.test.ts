/**
 * The booking's and the inventory's scenarios, rehearsed.
 *
 * `rehearse` runs one entity. In the booking's scenarios the test answers for the inventory, and in the
 * inventory's it sends as the bookings would. `rehearse.together` runs both, and the booking's runners with them.
 */
import { describe, expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import { accepted, type Address, rehearse, rejected } from '../../src/index.ts'
import { booking, type Sender } from './booking.ts'
import { inventory } from './inventory.ts'

const bookedAt = DateTime.makeUnsafe('2026-10-30T10:00:00Z')

const start = { flags: { customer: 'ada', event: 'concert-1', seats: 2 }, at: bookedAt }

const ada: Sender = { _tag: 'Customer', id: 'ada' }

describe('booking', () => {
  test('a booking of no seats is never created', async () => {
    const exit = await Effect.runPromiseExit(
      rehearse(booking, { ...start, flags: { ...start.flags, seats: 0 } }, () => Effect.void),
    )
    expect(exit._tag).toBe('Failure')
  })

  test('held seats are confirmed', () =>
    Effect.runPromise(rehearse(
      booking,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.answer('hold', { _tag: 'SeatsHeld' })
        expect(yield* rehearsal.send({ _tag: 'ConfirmRequested' }, ada)).toEqual(accepted)
        yield* rehearsal.answer('confirm', { _tag: 'SeatsConfirmed' })
        expect((yield* rehearsal.state)._tag).toBe('Confirmed')
      }),
    )))

  test('a booking the inventory rejects is cancelled', () =>
    Effect.runPromise(rehearse(
      booking,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.answer('hold', { _tag: 'SeatsUnavailable', reason: 'SoldOut' })
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
        yield* rehearsal.answer('hold', { _tag: 'SeatsHeld' })
        yield* rehearsal.answer('release', { _tag: 'SeatsReleased' })
        expect(yield* rehearsal.state).toMatchObject({ _tag: 'Cancelled', reason: 'ByCustomer' })
      }),
    )))

  test('seats held after the deadline are released', () =>
    Effect.runPromise(rehearse(
      booking,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.answer('hold', { _tag: 'SeatsHeld' })
        // With no clock, firing the timer at once stands for a deadline already past when the seats were held.
        yield* rehearsal.fire('deadline')
        expect(yield* rehearsal.send({ _tag: 'ConfirmRequested' }, ada)).toMatchObject(rejected)
        yield* rehearsal.answer('release', { _tag: 'SeatsReleased' })
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
        yield* rehearsal.answer('hold', { _tag: 'SeatsHeld' })
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

const reasonOf = (exit: Exit.Exit<unknown>) => (Exit.isFailure(exit) ? Cause.squash(exit.cause) : null)

describe('booking and inventory together', () => {
  test('held seats are confirmed, and sold', () =>
    Effect.runPromise(rehearse.together(
      bookedAt,
      Effect.fnUntraced(function*(world) {
        const seats = yield* world.create(inventory, 'concert-1', { capacity: 4 })
        const ada1 = yield* world.create(booking, 'booking-1', start.flags)
        expect(yield* ada1.run('hold')).toBe('Delivered')
        expect((yield* seats.projection).available).toBe(2)
        expect(yield* ada1.send({ _tag: 'ConfirmRequested' }, ada)).toEqual(accepted)
        yield* ada1.run('confirm')
        expect((yield* ada1.state)._tag).toBe('Confirmed')
        expect((yield* seats.state).sold).toEqual({ 'booking-1': 2 })
      }),
    )))

  test('a booking the inventory cannot seat is cancelled, and holds nothing', () =>
    Effect.runPromise(rehearse.together(
      bookedAt,
      Effect.fnUntraced(function*(world) {
        const seats = yield* world.create(inventory, 'concert-1', { capacity: 1 })
        const ada1 = yield* world.create(booking, 'booking-1', start.flags)
        yield* ada1.run('hold')
        expect(yield* ada1.state).toMatchObject({ _tag: 'Cancelled', reason: 'SoldOut' })
        expect((yield* seats.projection).available).toBe(1)
      }),
    )))

  test('a booking of an event with no inventory is cancelled', () =>
    Effect.runPromise(rehearse.together(
      bookedAt,
      Effect.fnUntraced(function*(world) {
        const ada1 = yield* world.create(booking, 'booking-1', start.flags)
        yield* ada1.run('hold')
        expect(yield* ada1.state).toMatchObject({ _tag: 'Cancelled', reason: 'NoSuchEvent' })
      }),
    )))

  test('a cancellation during the hold gives the seats back to the inventory', () =>
    Effect.runPromise(rehearse.together(
      bookedAt,
      Effect.fnUntraced(function*(world) {
        const seats = yield* world.create(inventory, 'concert-1', { capacity: 4 })
        const ada1 = yield* world.create(booking, 'booking-1', start.flags)
        yield* ada1.send({ _tag: 'CancelRequested' }, ada)
        yield* ada1.run('hold')
        expect((yield* seats.projection).available).toBe(2)
        yield* ada1.run('release')
        expect(yield* ada1.state).toMatchObject({ _tag: 'Cancelled', reason: 'ByCustomer' })
        expect((yield* seats.projection).available).toBe(4)
      }),
    )))

  // The inventory takes one hold per booking: a hold sent again were refused, had it no stored reply.
  test('a hold the process died on is sent again, and given its stored reply', () =>
    Effect.runPromise(rehearse.together(
      bookedAt,
      Effect.fnUntraced(function*(world) {
        const seats = yield* world.create(inventory, 'concert-1', { capacity: 4 })
        const ada1 = yield* world.create(booking, 'booking-1', start.flags)
        yield* ada1.run('hold', { crash: true })
        expect((yield* ada1.state)._tag).toBe('Holding')
        expect(yield* ada1.run('hold')).toBe('Delivered')
        expect((yield* ada1.state)._tag).toBe('Held')
        expect((yield* seats.projection).available).toBe(2)
      }),
    )))

  // A test that answers for the inventory answers `SeatsConfirmed`, and passes: only the inventory rejects it.
  test('a booking that confirms seats it could not hold fails, where the inventory rejects the confirmation', async () => {
    const hopeful: typeof booking = {
      ...booking,
      update: (message, meta) => (state) =>
        message._tag === 'SeatsUnavailable' && state._tag === 'Holding'
          ? { _tag: 'Confirming', booking: state.booking }
          : booking.update(message, meta)(state),
    }
    const exit = await Effect.runPromiseExit(rehearse.together(
      bookedAt,
      Effect.fnUntraced(function*(world) {
        yield* world.create(inventory, 'concert-1', { capacity: 1 })
        const ada1 = yield* world.create(hopeful, 'booking-1', start.flags)
        yield* ada1.run('hold')
        yield* ada1.run('confirm')
      }),
    ))
    expect(reasonOf(exit)).toBe('the inventory did not accept the confirmation of its own hold')
  })
})
