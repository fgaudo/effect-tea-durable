/**
 * An order, from its creation to its shipment or its cancellation. The customer pays before a deadline, then
 * the warehouse is told and ships. A cancellation after the payment refunds it.
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

const Order = Schema.Struct({
  customer: Schema.String,
  totalInCents: Schema.Int,
})
type Order = typeof Order.Type

const ChargeId = Schema.String

const State = Schema.Union([
  Schema.TaggedStruct('AwaitingPayment', { order: Order, deadline: Schema.DateTimeUtc }),
  // Only the charge's completion leaves it: a cancellation meanwhile is rejected.
  Schema.TaggedStruct('Charging', { order: Order, deadline: Schema.DateTimeUtc, payment: Schema.String }),
  Schema.TaggedStruct('Paid', {
    order: Order,
    charge: ChargeId,
    // The warehouse may ship once told, so a cancellation waits for `Told`.
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

export type Sender =
  | Readonly<{ _tag: 'Customer'; id: string }>
  | Readonly<{ _tag: 'Warehouse' }>

// What callers read: it leaves the process, so it has a schema too.
const Projection = Schema.Struct({
  status: Schema.Literals(['AwaitingPayment', 'Charging', 'Paid', 'Refunding', 'Shipped', 'Cancelled']),
  canPay: Schema.Boolean,
  canCancel: Schema.Boolean,
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

export const order: Program<{
  state: State
  flags: Flags
  inbound: Inbound
  internal: Internal
  operation: Operation
  rejection: never
  sender: Sender
  projection: Projection
  services: Payments | Warehouse | Mailer
}> = {
  name: 'Order',

  schemas: {
    state: State,
    flags: Flags,
    inbound: Inbound,
    internal: Internal,
    operation: Operation,
    rejection: Schema.Never,
    projection: Projection,
  },

  init: ({ order }, at) => ({
    _tag: 'AwaitingPayment',
    order,
    deadline: DateTime.add(at, paymentWindow),
  }),

  // Inbound messages may arrive in any state, and are rejected where they do not apply. An internal message
  // arrives only while its key is in `durable`, so elsewhere it is a defect.
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

  durable: (state) =>
    Match.valueTags(state, {
      AwaitingPayment: ({ deadline }) => ({
        'payment-deadline': timer<Internal>(deadline, { _tag: 'PaymentDeadlinePassed' }),
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
    Charge: operation(charge),
    TellWarehouse: operation(tellWarehouse),
    // Sent at most once: a second email is worse than none, and the state says when it is not known.
    EmailShipment: operation.atMostOnce(emailShipment, (): Internal => ({ _tag: 'ShipmentEmailUnsure' })),
    Refund: operation(refund),
  },

  project: (state) => ({
    status: state._tag,
    canPay: state._tag === 'AwaitingPayment',
    canCancel: state._tag === 'AwaitingPayment' || (state._tag === 'Paid' && state.warehouse === 'Told'),
  }),
}
