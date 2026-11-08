/**
 * The subscription's properties, for generated states.
 */
import { describe, expect, test } from 'bun:test'
import * as DateTime from 'effect/DateTime'
import fc from 'fast-check'
import { projectionViolations } from '../../src/index.testing.ts'
import { type Sender, type State, subscription } from './subscription.ts'

const at = DateTime.makeUnsafe('2026-10-30T10:00:00Z')

const time = fc.date({ min: new Date('2026-01-01'), max: new Date('2027-01-01'), noInvalidDate: true })
  .map(DateTime.fromDateUnsafe)

const plan = fc.record({ name: fc.constantFrom('Basic', 'Pro'), priceInCents: fc.nat(10_000) })

const account = fc.record({
  customer: fc.constantFrom('ada', 'bob'),
  payment: fc.constantFrom('card-1', 'card-2'),
  plan,
  nextPlan: fc.option(plan, { nil: null }),
  creditInCents: fc.nat(10_000),
  startedAt: time,
  paidPeriods: fc.nat(24),
  cancelAtPeriodEnd: fc.boolean(),
})

const attempt = fc.integer({ min: 1, max: 3 })

// Every case of the subscription's states, with any data.
const state: fc.Arbitrary<State> = fc.oneof(
  fc.record({ _tag: fc.constant('Active'), account }),
  fc.record({
    _tag: fc.constant('Charging'),
    account,
    attempt,
    charge: fc.record({ payment: fc.string(), totalInCents: fc.nat(10_000) }),
  }),
  fc.record({ _tag: fc.constant('PastDue'), account, attempt, retryAt: time }),
  fc.record({ _tag: fc.constant('Cancelled'), account, reason: fc.constantFrom('ByCustomer', 'Unpaid') }),
)

describe('subscription', () => {
  // The projection speaks to the customer: support's credits are not among its actions.
  test('the projection allows what update accepts, all of it', () => {
    const check = projectionViolations(subscription, {
      PlanChangeRequested: (projection) => projection.canChangePlan,
      PaymentMethodUpdated: (projection) => projection.canUpdatePayment,
      CancelRequested: (projection) => projection.canCancel,
      ResumeRequested: (projection) => projection.canResume,
    })
    fc.assert(fc.property(state, (state) => {
      const customer: Sender = { _tag: 'Customer', id: state.account.customer }
      expect(check(state, [
        { message: { _tag: 'PlanChangeRequested', plan: { name: 'Pro', priceInCents: 1_900 } }, sender: customer },
        { message: { _tag: 'PaymentMethodUpdated', payment: 'card-3' }, sender: customer },
        { message: { _tag: 'CancelRequested' }, sender: customer },
        { message: { _tag: 'ResumeRequested' }, sender: customer },
      ], at)).toEqual([])
    }))
  })
})
