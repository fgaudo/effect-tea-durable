/**
 * The booking's properties, for generated states.
 */
import { describe, expect, test } from 'bun:test'
import * as DateTime from 'effect/DateTime'
import fc from 'fast-check'
import { projectionViolations } from 'effect-tea-durable/testing'
import { booking, type Sender, type State } from './booking.ts'

const at = DateTime.makeUnsafe('2026-10-30T10:00:00Z')

const time = fc.date({ min: new Date('2026-01-01'), max: new Date('2027-01-01'), noInvalidDate: true })
  .map(DateTime.fromDateUnsafe)

const aBooking = fc.record({
  customer: fc.constantFrom('ada', 'bob'),
  event: fc.constantFrom('concert-1', 'concert-2'),
  seats: fc.integer({ min: 1, max: 10 }),
  deadline: time,
})

// Every case of the booking's states, with any data.
const state: fc.Arbitrary<State> = fc.oneof(
  fc.record({ _tag: fc.constant('Holding'), booking: aBooking, cancelled: fc.boolean() }),
  fc.record({ _tag: fc.constant('Held'), booking: aBooking }),
  fc.record({ _tag: fc.constant('Confirming'), booking: aBooking }),
  fc.record({ _tag: fc.constant('Releasing'), booking: aBooking, reason: fc.constantFrom('ByCustomer', 'Expired') }),
  fc.record({ _tag: fc.constant('Confirmed'), booking: aBooking }),
  fc.record({
    _tag: fc.constant('Cancelled'),
    booking: aBooking,
    reason: fc.constantFrom('ByCustomer', 'Expired', 'SoldOut', 'SalesClosed', 'NoSuchEvent'),
  }),
)

describe('booking', () => {
  test('the projection allows what update accepts, all of it', () => {
    const check = projectionViolations(booking, {
      ConfirmRequested: (projection) => projection.canConfirm,
      CancelRequested: (projection) => projection.canCancel,
    })
    fc.assert(fc.property(state, (state) => {
      const customer: Sender = { _tag: 'Customer', id: state.booking.customer }
      expect(check(state, [
        { message: { _tag: 'ConfirmRequested' }, sender: customer },
        { message: { _tag: 'CancelRequested' }, sender: customer },
      ], at)).toEqual([])
    }))
  })
})
