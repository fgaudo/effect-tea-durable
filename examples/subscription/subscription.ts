/**
 * A subscription billed every month, in advance, for as long as the customer keeps it. A period is paid from
 * the account's credit when it covers the price, and charged otherwise. A declined charge is retried a few
 * times before the subscription is cancelled.
 */
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Schema from 'effect/Schema'
import {
  defect,
  type IdempotencyKey,
  noWork,
  type Origin,
  operation,
  type Program,
  reject,
  type Rejected,
  timer,
} from '../../src/index.ts'

const Plan = Schema.Struct({ name: Schema.String, priceInCents: Schema.Int })
type Plan = typeof Plan.Type

// The state stays the same size forever: it holds the present, and counts the past.
const Account = Schema.Struct({
  customer: Schema.String,
  payment: Schema.String,
  plan: Plan,
  // Applied at the next renewal.
  nextPlan: Schema.NullOr(Plan),
  creditInCents: Schema.Int,
  // Periods end on the day of the month the subscription started, counted from it: adding a month to the end
  // of the last period would move a start on the 31st to the 28th, and keep it there.
  startedAt: Schema.DateTimeUtc,
  paidPeriods: Schema.Int,
  cancelAtPeriodEnd: Schema.Boolean,
})
type Account = typeof Account.Type

const State = Schema.Union([
  // Paid until the end of the period.
  Schema.TaggedStruct('Active', { account: Account }),
  // Charging the next period. Only the charge's completion leaves it: a cancellation meanwhile is remembered.
  // What the charge uses is fixed when it starts: a charge does not change while it runs (decision 0018), so a
  // new payment method meanwhile is used from the next one.
  Schema.TaggedStruct('Charging', {
    account: Account,
    attempt: Schema.Int,
    charge: Schema.Struct({ payment: Schema.String, totalInCents: Schema.Int }),
  }),
  Schema.TaggedStruct('PastDue', { account: Account, attempt: Schema.Int, retryAt: Schema.DateTimeUtc }),
  Schema.TaggedStruct('Cancelled', { account: Account, reason: Schema.Literals(['ByCustomer', 'Unpaid']) }),
])
export type State = typeof State.Type

const Flags = Schema.Struct({ customer: Schema.String, payment: Schema.String, plan: Plan })
type Flags = typeof Flags.Type

const Inbound = Schema.Union([
  Schema.TaggedStruct('PlanChangeRequested', { plan: Plan }),
  Schema.TaggedStruct('PaymentMethodUpdated', { payment: Schema.String }),
  Schema.TaggedStruct('CancelRequested', {}),
  Schema.TaggedStruct('ResumeRequested', {}),
  Schema.TaggedStruct('CreditGranted', { amountInCents: Schema.Int }),
])
type Inbound = typeof Inbound.Type

const Internal = Schema.Union([
  Schema.TaggedStruct('ChargeSucceeded', {}),
  Schema.TaggedStruct('ChargeDeclined', {}),
  Schema.TaggedStruct('RenewalDue', {}),
  Schema.TaggedStruct('RetryDue', {}),
])
type Internal = typeof Internal.Type

export type Sender =
  | Readonly<{ _tag: 'Customer'; id: string }>
  | Readonly<{ _tag: 'Support' }>

const Projection = Schema.Struct({
  status: Schema.Literals(['Active', 'Charging', 'PastDue', 'Cancelled']),
  plan: Plan,
  nextPlan: Schema.NullOr(Plan),
  paidUntil: Schema.DateTimeUtc,
  creditInCents: Schema.Int,
  canChangePlan: Schema.Boolean,
  canUpdatePayment: Schema.Boolean,
  canCancel: Schema.Boolean,
  canResume: Schema.Boolean,
})
export type Projection = typeof Projection.Type

export class Payments extends Context.Service<Payments, {
  readonly charge: (
    request: Readonly<{ payment: string; totalInCents: number; idempotencyKey: IdempotencyKey }>,
  ) => Effect.Effect<string, 'Declined'>
}>()('Payments') {}

const maxAttempts = 3

const retryDelay = { days: 2 }

const paidUntil = (account: Account) => DateTime.add(account.startedAt, { months: account.paidPeriods })

const isCustomer = (from: Origin<Sender>, account: Account) =>
  from._tag === 'Caller' && from.sender._tag === 'Customer' && from.sender.id === account.customer

const isSupport = (from: Origin<Sender>) => from._tag === 'Caller' && from.sender._tag === 'Support'

const Operation = Schema.TaggedUnion({
  Charge: { payment: Schema.String, totalInCents: Schema.Int },
})
type Operation = typeof Operation.Type

// A charge of the account's plan, with its payment method as they are now.
const charging = (account: Account, attempt: number): State => ({
  _tag: 'Charging',
  account,
  attempt,
  charge: { payment: account.payment, totalInCents: account.plan.priceInCents },
})

const charge = Effect.fn('Charge')(
  function*({ payment, totalInCents }: Extract<Operation, { _tag: 'Charge' }>, idempotencyKey: IdempotencyKey) {
    const payments = yield* Payments
    return yield* payments.charge({ payment, totalInCents, idempotencyKey })
  },
  Effect.match({
    onSuccess: (): Internal => ({ _tag: 'ChargeSucceeded' }),
    onFailure: (): Internal => ({ _tag: 'ChargeDeclined' }),
  }),
)

// The next period, from the credit when it covers the price. Staying `Active` keeps the `renewal` key: its
// timer has fired, so it is armed again at the end of the new period (decision 0008).
const renew = (account: Account): State => {
  const plan = account.nextPlan ?? account.plan
  const next = { ...account, plan, nextPlan: null }
  return next.cancelAtPeriodEnd
    ? { _tag: 'Cancelled', account: next, reason: 'ByCustomer' }
    : next.creditInCents >= plan.priceInCents
    ? {
      _tag: 'Active',
      account: { ...next, creditInCents: next.creditInCents - plan.priceInCents, paidPeriods: next.paidPeriods + 1 },
    }
    : charging(next, 1)
}

export const subscription: Program<{
  state: State
  flags: Flags
  inbound: Inbound
  internal: Internal
  operation: Operation
  rejection: never
  sender: Sender
  projection: Projection
  services: Payments
}> = {
  name: 'Subscription',

  schemas: {
    state: State,
    flags: Flags,
    inbound: Inbound,
    internal: Internal,
    operation: Operation,
    rejection: Schema.Never,
    projection: Projection,
  },

  // The first period is charged at once.
  init: ({ customer, payment, plan }, at) =>
    charging({
      customer,
      payment,
      plan,
      nextPlan: null,
      creditInCents: 0,
      startedAt: at,
      paidPeriods: 0,
      cancelAtPeriodEnd: false,
    }, 1),

  update: (message, { at, from }) => (state) =>
    Match.value(message).pipe(
      Match.withReturnType<State | Rejected>(),
      Match.tagsExhaustive({
        PlanChangeRequested: ({ plan }) =>
          state._tag !== 'Cancelled' && isCustomer(from, state.account)
            ? { ...state, account: { ...state.account, nextPlan: plan } }
            : reject,

        // A charge under way goes on with the method it started with, even after a crash: the new one is used
        // from the next.
        PaymentMethodUpdated: ({ payment }) =>
          !isCustomer(from, state.account)
            ? reject
            : state._tag === 'PastDue'
            ? charging({ ...state.account, payment }, state.attempt + 1)
            : state._tag === 'Active' || state._tag === 'Charging'
            ? { ...state, account: { ...state.account, payment } }
            : reject,

        CancelRequested: () =>
          !isCustomer(from, state.account)
            ? reject
            : state._tag === 'PastDue'
            ? { _tag: 'Cancelled', account: state.account, reason: 'ByCustomer' }
            : (state._tag === 'Active' || state._tag === 'Charging') && !state.account.cancelAtPeriodEnd
            ? { ...state, account: { ...state.account, cancelAtPeriodEnd: true } }
            : reject,

        ResumeRequested: () =>
          (state._tag === 'Active' || state._tag === 'Charging') && state.account.cancelAtPeriodEnd &&
            isCustomer(from, state.account)
            ? { ...state, account: { ...state.account, cancelAtPeriodEnd: false } }
            : reject,

        CreditGranted: ({ amountInCents }) =>
          state._tag !== 'Cancelled' && amountInCents > 0 && isSupport(from)
            ? { ...state, account: { ...state.account, creditInCents: state.account.creditInCents + amountInCents } }
            : reject,

        ChargeSucceeded: () =>
          state._tag === 'Charging'
            ? { _tag: 'Active', account: { ...state.account, paidPeriods: state.account.paidPeriods + 1 } }
            : defect('a charge completed while nothing was charging'),

        ChargeDeclined: () =>
          state._tag !== 'Charging'
            ? defect('a charge was declined while nothing was charging')
            : state.account.cancelAtPeriodEnd
            ? { _tag: 'Cancelled', account: state.account, reason: 'ByCustomer' }
            : state.attempt >= maxAttempts
            ? { _tag: 'Cancelled', account: state.account, reason: 'Unpaid' }
            : {
              _tag: 'PastDue',
              account: state.account,
              attempt: state.attempt,
              retryAt: DateTime.add(at, retryDelay),
            },

        RenewalDue: () =>
          state._tag === 'Active'
            ? renew(state.account)
            : defect('a renewal came due outside an active period'),

        RetryDue: () =>
          state._tag === 'PastDue'
            ? charging(state.account, state.attempt + 1)
            : defect('a retry came due while nothing was past due'),
      }),
    ),

  durable: (state) =>
    Match.valueTags(state, {
      Active: ({ account }) => ({ renewal: timer<Internal>(paidUntil(account), { _tag: 'RenewalDue' }) }),
      Charging: ({ charge }) => ({ charge: Operation.cases.Charge.make(charge) }),
      PastDue: ({ retryAt }) => ({ retry: timer<Internal>(retryAt, { _tag: 'RetryDue' }) }),
      Cancelled: () => noWork,
    }),

  operations: { Charge: operation(charge) },

  project: (state) => {
    const open = state._tag !== 'Cancelled'
    const renewing = state._tag === 'Active' || state._tag === 'Charging'
    return {
      status: state._tag,
      plan: state.account.plan,
      nextPlan: state.account.nextPlan,
      paidUntil: paidUntil(state.account),
      creditInCents: state.account.creditInCents,
      canChangePlan: open,
      canUpdatePayment: open,
      canCancel: state._tag === 'PastDue' || (renewing && !state.account.cancelAtPeriodEnd),
      canResume: renewing && state.account.cancelAtPeriodEnd,
    }
  },
}
