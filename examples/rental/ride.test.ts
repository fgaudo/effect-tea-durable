/**
 * The ride's properties, for generated states.
 */
import { describe, expect, test } from 'bun:test'
import * as DateTime from 'effect/DateTime'
import fc from 'fast-check'
import { projectionViolations } from '@fgaudo/effect-tea-persistent/testing'
import { ride, type Sender, type State } from './ride.ts'

const at = DateTime.makeUnsafe('2026-11-08T10:00:00Z')

const time = fc.date({ min: new Date('2026-01-01'), max: new Date('2027-01-01'), noInvalidDate: true })
  .map(DateTime.fromDateUnsafe)

const aRide = fc.record({
  customer: fc.constantFrom('ann', 'bob'),
  email: fc.constant('someone@example.com'),
  bike: fc.constantFrom('bike-7', 'bike-8'),
  centsPerMinute: fc.integer({ min: 1, max: 100 }),
})

const email = fc.constantFrom('Sending', 'Sent', 'Unsure')

// Every case of the ride's states, with any data.
const state: fc.Arbitrary<State> = fc.oneof(
  fc.record({ _tag: fc.constant('Unlocking'), ride: aRide }),
  fc.record({
    _tag: fc.constant('Refused'),
    ride: aRide,
    reason: fc.constantFrom('RateChanged', 'InUse', 'NoSuchBike'),
  }),
  fc.record({ _tag: fc.constant('Riding'), ride: aRide, startedAt: time, cancellableUntil: fc.option(time), email }),
  fc.record({ _tag: fc.constant('Docking'), ride: aRide, costInCents: fc.nat(), email }),
  fc.record({ _tag: fc.constant('Ended'), ride: aRide, costInCents: fc.nat(), email }),
)

describe('ride', () => {
  // The projection reads no clock, so `canCancel` agrees with `update` at any time the test hands it.
  test('the projection allows what update accepts, all of it', () => {
    const check = projectionViolations(ride, {
      EndRequested: (projection) => projection.canEnd,
      CancelRequested: (projection) => projection.canCancel,
    })
    fc.assert(fc.property(state, (state) => {
      const customer: Sender = { _tag: 'Customer', id: state.ride.customer }
      expect(check(state, [
        { message: { _tag: 'EndRequested' }, sender: customer },
        { message: { _tag: 'CancelRequested' }, sender: customer },
      ], at)).toEqual([])
    }))
  })
})
