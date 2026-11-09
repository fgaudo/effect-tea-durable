/**
 * The subscription's properties, for generated states.
 */
import { describe, expect, test } from 'bun:test'
import * as DateTime from 'effect/DateTime'
import fc from 'fast-check'
import { projectionViolations } from '@fgaudo/effect-tea-persistent/testing'
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
  // The projection shows the customer's actions and support's. Each message is sent by both, and only one may send it.
  test('the projection allows what update accepts, all of it, to each sender', () => {
    const customerMay = (sender: Sender, allowed: boolean) => sender._tag === 'Customer' && allowed
    const check = projectionViolations(subscription, {
      PlanChangeRequested: (projection, _, sender) => customerMay(sender, projection.canChangePlan),
      PaymentMethodUpdated: (projection, _, sender) => customerMay(sender, projection.canUpdatePayment),
      CancelRequested: (projection, _, sender) => customerMay(sender, projection.canCancel),
      ResumeRequested: (projection, _, sender) => customerMay(sender, projection.canResume),
      CreditGranted: (projection, _, sender) => sender._tag === 'Support' && projection.canGrantCredit,
    })
    const support: Sender = { _tag: 'Support' }
    fc.assert(fc.property(state, (state) => {
      const customer: Sender = { _tag: 'Customer', id: state.account.customer }
      expect(check(state, [customer, support].flatMap((sender) => [
        { message: { _tag: 'PlanChangeRequested', plan: { name: 'Pro', priceInCents: 1_900 } }, sender },
        { message: { _tag: 'PaymentMethodUpdated', payment: 'card-3' }, sender },
        { message: { _tag: 'CancelRequested' }, sender },
        { message: { _tag: 'ResumeRequested' }, sender },
        { message: { _tag: 'CreditGranted', amountInCents: 2_000 }, sender },
      ]), at)).toEqual([])
    }))
  })
})
