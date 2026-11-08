/**
 * An order, from its creation to its shipment or its cancellation. The customer pays before a deadline, then
 * the warehouse is told and ships. A cancellation after the payment refunds it. The warehouse reports a shipment
 * before it hands the parcel over, and ships only if the order accepts the report: a cancellation that comes
 * first wins, and nothing needs to stop the warehouse.
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
  program,
  reject,
  type Rejected,
  timer,
} from '@fgaudo/effect-tea-persistent/program'

const Order = Schema.Struct({
  customer: Schema.String,
  totalInCents: Schema.Int,
})
type Order = typeof Order.Type

const ChargeId = Schema.String

const State = Schema.Union([
  Schema.TaggedStruct('AwaitingPayment', { order: Order, deadline: Schema.DateTimeUtcFromMillis }),
  // Only the charge's completion leaves it: a cancellation meanwhile is rejected.
  Schema.TaggedStruct('Charging', { order: Order, deadline: Schema.DateTimeUtcFromMillis, payment: Schema.String }),
  Schema.TaggedStruct('Paid', {
    order: Order,
    charge: ChargeId,
    // A cancellation waits for `Told`: until then the warehouse is being told, an operation only its completion
    // ends. Once told, the warehouse ships only if the order accepts its report, so a refund after `Told` never
    // leaves a parcel on its way.
    warehouse: Schema.Literals(['Telling', 'Told']),
  }),
  Schema.TaggedStruct('Refunding', { order: Order, charge: ChargeId }),
  Schema.TaggedStruct('Shipped', {
    order: Order,
    charge: ChargeId,
    tracking: Schema.String,
    // An email is not idempotent: after a crash while sending it, the customer may or may not have it.
    email: Schema.Literals(['Sending', 'Sent', 'Unsure']),
  }),
  Schema.TaggedStruct('Cancelled', {
    order: Order,
    reason: Schema.Literals(['ByCustomer', 'Unpaid', 'Refunded']),
  }),
])
export type State = typeof State.Type

const Flags = Schema.Struct({ order: Order })
type Flags = typeof Flags.Type

const Inbound = Schema.Union([
  Schema.TaggedStruct('PayRequested', { payment: Schema.String }),
  Schema.TaggedStruct('CancelRequested', {}),
  Schema.TaggedStruct('ShipmentReported', { tracking: Schema.String }),
])
type Inbound = typeof Inbound.Type

const Internal = Schema.Union([
  Schema.TaggedStruct('ChargeSucceeded', { charge: ChargeId }),
  Schema.TaggedStruct('ChargeDeclined', {}),
  Schema.TaggedStruct('WarehouseTold', {}),
  Schema.TaggedStruct('RefundCompleted', {}),
  Schema.TaggedStruct('PaymentDeadlinePassed', {}),
  Schema.TaggedStruct('ShipmentEmailed', {}),
  Schema.TaggedStruct('ShipmentEmailUnsure', {}),
])
type Internal = typeof Internal.Type

// Who may send a message: it arrives from outside, and waits in the mailbox with it, so it has a schema.
const Sender = Schema.Union([
  Schema.TaggedStruct('Customer', { id: Schema.String }),
  Schema.TaggedStruct('Warehouse', {}),
])
export type Sender = typeof Sender.Type

// What callers read: it leaves the process, so it has a schema too.
const Projection = Schema.Struct({
  status: Schema.Literals(['AwaitingPayment', 'Charging', 'Paid', 'Refunding', 'Shipped', 'Cancelled']),
  // By when the customer has to pay, while there is still something to pay: it is what a query reads to find
  // the orders nobody paid, so what it filters by is what the customer is told, in milliseconds, since the
  // projection is JSON (decisions 0032, 0139).
  deadline: Schema.NullOr(Schema.Number),
  // What the order costs, which a sum over the orders still awaiting their payment adds up (decision 0148).
  totalInCents: Schema.Int,
  canPay: Schema.Boolean,
  canCancel: Schema.Boolean,
  // What billing acts on: the charge the order took, and whether it was given back. The projection is the one
  // contract of the order, so what a consumer of the log needs is in it too (decision 0138).
  charge: Schema.NullOr(ChargeId),
  refunded: Schema.Boolean,
})
export type Projection = typeof Projection.Type

export class Payments extends Context.Service<Payments, {
  readonly charge: (
    request: Readonly<{ payment: string; totalInCents: number; idempotencyKey: IdempotencyKey }>,
  ) => Effect.Effect<string, 'Declined'>
  readonly refund: (request: Readonly<{ charge: string; idempotencyKey: IdempotencyKey }>) => Effect.Effect<void>
}>()('Payments') {}

export class Warehouse extends Context.Service<Warehouse, {
  readonly prepare: (request: Readonly<{ order: Order; idempotencyKey: IdempotencyKey }>) => Effect.Effect<void>
}>()('Warehouse') {}

export class Mailer extends Context.Service<Mailer, {
  readonly send: (email: Readonly<{ to: string; subject: string }>) => Effect.Effect<void>
}>()('Mailer') {}

const paymentWindow = { minutes: 30 }

const isCustomer = (from: Origin<Sender>, order: Order) =>
  from._tag === 'Caller' && from.sender._tag === 'Customer' && from.sender.id === order.customer

const isWarehouse = (from: Origin<Sender>) => from._tag === 'Caller' && from.sender._tag === 'Warehouse'

// The work an order's states hold, as data: a test sees it without running it, and the runtime stores it.
const Operation = Schema.TaggedUnion({
  Charge: { payment: Schema.String, totalInCents: Schema.Int },
  TellWarehouse: { order: Order },
  EmailShipment: { to: Schema.String, tracking: Schema.String },
  Refund: { charge: ChargeId },
})
type Operation = typeof Operation.Type

const charge = Effect.fn('Charge')(
  function*({ payment, totalInCents }: Extract<Operation, { _tag: 'Charge' }>, idempotencyKey: IdempotencyKey) {
    const payments = yield* Payments
    return yield* payments.charge({ payment, totalInCents, idempotencyKey })
  },
  Effect.match({
    onSuccess: (charge): Internal => ({ _tag: 'ChargeSucceeded', charge }),
    onFailure: (): Internal => ({ _tag: 'ChargeDeclined' }),
  }),
)

const tellWarehouse = Effect.fn('TellWarehouse')(
  function*({ order }: Extract<Operation, { _tag: 'TellWarehouse' }>, idempotencyKey: IdempotencyKey) {
    const warehouse = yield* Warehouse
    yield* warehouse.prepare({ order, idempotencyKey })
    return { _tag: 'WarehouseTold' } satisfies Internal
  },
)

const emailShipment = Effect.fn('EmailShipment')(
  function*({ to, tracking }: Extract<Operation, { _tag: 'EmailShipment' }>) {
    const mailer = yield* Mailer
    yield* mailer.send({ to, subject: `Your order has shipped: ${tracking}` })
    return { _tag: 'ShipmentEmailed' } satisfies Internal
  },
)

const refund = Effect.fn('Refund')(
  function*({ charge }: Extract<Operation, { _tag: 'Refund' }>, idempotencyKey: IdempotencyKey) {
    const payments = yield* Payments
    yield* payments.refund({ charge, idempotencyKey })
    return { _tag: 'RefundCompleted' } satisfies Internal
  },
)

export const order = program({
  state: State,
  flags: Flags,
  inbound: Inbound,
  internal: Internal,
  operation: Operation,
  sender: Sender,
  projection: Projection,
})({
  name: 'Order',

  keys: ['payment-deadline', 'charge', 'tell-warehouse', 'email-shipment', 'refund'],

  init: ({ order }, at) => ({
    _tag: 'AwaitingPayment',
    order,
    deadline: DateTime.add(at, paymentWindow),
  }),

  // Inbound messages may arrive in any state, and are rejected where they do not apply. An internal message
  // arrives only while its key is in `work`, so elsewhere it is a defect.
  update: (message, { from }) => (state) =>
    Match.value(message).pipe(
      Match.withReturnType<State | Rejected>(),
      Match.tagsExhaustive({
        PayRequested: ({ payment }) =>
          state._tag === 'AwaitingPayment' && isCustomer(from, state.order)
            ? { _tag: 'Charging', order: state.order, deadline: state.deadline, payment }
            : reject,

        CancelRequested: () =>
          !isCustomer(from, state.order)
            ? reject
            : state._tag === 'AwaitingPayment'
            ? { _tag: 'Cancelled', order: state.order, reason: 'ByCustomer' }
            : state._tag === 'Paid' && state.warehouse === 'Told'
            ? { _tag: 'Refunding', order: state.order, charge: state.charge }
            : reject,

        ShipmentReported: ({ tracking }) =>
          state._tag === 'Paid' && state.warehouse === 'Told' && isWarehouse(from)
            ? { _tag: 'Shipped', order: state.order, charge: state.charge, tracking, email: 'Sending' }
            : reject,

        ChargeSucceeded: ({ charge }) =>
          state._tag === 'Charging'
            ? { _tag: 'Paid', order: state.order, charge, warehouse: 'Telling' }
            : defect('a charge completed while nothing was charging'),

        // The deadline may have passed meanwhile: its timer comes back, and fires at once.
        ChargeDeclined: () =>
          state._tag === 'Charging'
            ? { _tag: 'AwaitingPayment', order: state.order, deadline: state.deadline }
            : defect('a charge was declined while nothing was charging'),

        WarehouseTold: () =>
          state._tag === 'Paid' && state.warehouse === 'Telling'
            ? { ...state, warehouse: 'Told' }
            : defect('the warehouse was told while nobody was telling it'),

        RefundCompleted: () =>
          state._tag === 'Refunding'
            ? { _tag: 'Cancelled', order: state.order, reason: 'Refunded' }
            : defect('a refund completed while nothing was refunding'),

        PaymentDeadlinePassed: () =>
          state._tag === 'AwaitingPayment'
            ? { _tag: 'Cancelled', order: state.order, reason: 'Unpaid' }
            : defect('the payment deadline passed outside its wait'),

        ShipmentEmailed: () =>
          state._tag === 'Shipped' && state.email === 'Sending'
            ? { ...state, email: 'Sent' }
            : defect('a shipment email was sent while nothing was sending it'),

        ShipmentEmailUnsure: () =>
          state._tag === 'Shipped' && state.email === 'Sending'
            ? { ...state, email: 'Unsure' }
            : defect('a shipment email was unsure while nothing was sending it'),
      }),
    ),

  work: (state) =>
    Match.valueTags(state, {
      AwaitingPayment: ({ deadline }) => ({
        'payment-deadline': timer(deadline, { _tag: 'PaymentDeadlinePassed' }),
      }),
      Charging: ({ order, payment }) => ({
        charge: Operation.cases.Charge.make({ payment, totalInCents: order.totalInCents }),
      }),
      Paid: ({ order, warehouse }) =>
        warehouse === 'Telling' ? { 'tell-warehouse': Operation.cases.TellWarehouse.make({ order }) } : noWork,
      Refunding: ({ charge }) => ({ refund: Operation.cases.Refund.make({ charge }) }),
      Shipped: ({ order, tracking, email }) =>
        email === 'Sending'
          ? { 'email-shipment': Operation.cases.EmailShipment.make({ to: order.customer, tracking }) }
          : noWork,
      Cancelled: () => noWork,
    }),

  operations: {
    // A payment provider caps the length of an idempotency key, and an order's id may be long: the provider is
    // given the key's digest.
    Charge: operation.digest(charge),
    TellWarehouse: operation(tellWarehouse),
    // Sent at most once: a second email is worse than none, and the state says when it is not known.
    EmailShipment: operation.atMostOnce(emailShipment, (): Internal => ({ _tag: 'ShipmentEmailUnsure' })),
    Refund: operation.digest(refund),
  },

  project: (state) => ({
    status: state._tag,
    deadline: state._tag === 'AwaitingPayment' || state._tag === 'Charging'
      ? DateTime.toEpochMillis(state.deadline)
      : null,
    totalInCents: state.order.totalInCents,
    canPay: state._tag === 'AwaitingPayment',
    canCancel: state._tag === 'AwaitingPayment' || (state._tag === 'Paid' && state.warehouse === 'Told'),
    charge: 'charge' in state ? state.charge : null,
    refunded: state._tag === 'Cancelled' && state.reason === 'Refunded',
  }),

  // The topics of the log, each selecting of the projection what a consumer acts on: a row is written in a topic
  // only when that changed, and gives it (decisions 0138, 0140). A dashboard reads the status. Billing reads the
  // charge and the refund, and is not told when the warehouse is.
  topics: {
    status: ({ status }) => status,
    billing: ({ charge, refunded }) => ({ charge, refunded }),
  },

  // "The orders nobody paid by now": the deadline of an order still awaiting its payment, as the projection
  // holds it, and nothing for an order that is being charged, paid or over (decisions 0032, 0139). "What they
  // owe": the total of such an order, which a sum adds up and leaves out where it is null (decision 0148). "How
  // many orders are in a status": its status, which a count takes one status at a time; how many are in each is
  // a report, built from the log in `report.ts` (decision 0149).
  indexes: {
    unpaidUntil: ({ deadline, status }) => (status === 'AwaitingPayment' ? deadline : null),
    owedInCents: ({ status, totalInCents }) => (status === 'AwaitingPayment' ? totalInCents : null),
    status: ({ status }) => status,
  },
})
