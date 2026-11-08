/**
 * The order's properties, for generated states.
 */
import { describe, expect, test } from 'bun:test'
import * as DateTime from 'effect/DateTime'
import fc from 'fast-check'
import { projectionViolations } from 'effect-tea-durable/testing'
import { order, type Sender, type State } from './order.ts'

const at = DateTime.makeUnsafe('2026-10-30T10:00:00Z')

const time = fc.date({ min: new Date('2026-01-01'), max: new Date('2027-01-01'), noInvalidDate: true })
  .map(DateTime.fromDateUnsafe)

const anOrder = fc.record({ customer: fc.constantFrom('ada', 'bob'), totalInCents: fc.nat() })

// Every case of the order's states, with any data.
const state: fc.Arbitrary<State> = fc.oneof(
  fc.record({ _tag: fc.constant('AwaitingPayment'), order: anOrder, deadline: time }),
  fc.record({ _tag: fc.constant('Charging'), order: anOrder, deadline: time, payment: fc.string() }),
  fc.record({
    _tag: fc.constant('Paid'),
    order: anOrder,
    charge: fc.string(),
    warehouse: fc.constantFrom('Telling', 'Told'),
  }),
  fc.record({ _tag: fc.constant('Refunding'), order: anOrder, charge: fc.string() }),
  fc.record({
    _tag: fc.constant('Shipped'),
    order: anOrder,
    charge: fc.string(),
    tracking: fc.string(),
    email: fc.constantFrom('Sending', 'Sent', 'Unsure'),
  }),
  fc.record({
    _tag: fc.constant('Cancelled'),
    order: anOrder,
    reason: fc.constantFrom('ByCustomer', 'Unpaid', 'Refunded'),
  }),
)

describe('order', () => {
  // The projection speaks to the customer: the warehouse's reports are not among its actions.
  test('the projection allows what update accepts, all of it', () => {
    const check = projectionViolations(order, {
      PayRequested: (projection) => projection.canPay,
      CancelRequested: (projection) => projection.canCancel,
    })
    fc.assert(fc.property(state, (state) => {
      const customer: Sender = { _tag: 'Customer', id: state.order.customer }
      expect(check(state, [
        { message: { _tag: 'PayRequested', payment: 'card-1' }, sender: customer },
        { message: { _tag: 'CancelRequested' }, sender: customer },
      ], at)).toEqual([])
    }))
  })
})
