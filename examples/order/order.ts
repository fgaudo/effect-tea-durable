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
} from '../api.ts'

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
  Schema.TaggedStruct('Shipped', { order: Order, charge: ChargeId, tracking: Schema.String }),
  Schema.TaggedStruct('Cancelled', {
    order: Order,
    reason: Schema.Literals(['ByCustomer', 'Unpaid', 'Refunded']),
  }),
])
type State = typeof State.Type

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
])
type Internal = typeof Internal.Type

export type Sender =
  | Readonly<{ _tag: 'Customer'; id: string }>
  | Readonly<{ _tag: 'Warehouse' }>

export type Projection = Readonly<{
  status: State['_tag']
  canPay: boolean
  canCancel: boolean
}>

export class Payments extends Context.Service<Payments, {
  readonly charge: (
    request: Readonly<{ payment: string; totalInCents: number; idempotencyKey: IdempotencyKey }>,
  ) => Effect.Effect<string, 'Declined'>
  readonly refund: (request: Readonly<{ charge: string; idempotencyKey: IdempotencyKey }>) => Effect.Effect<void>
}>()('Payments') {}

export class Warehouse extends Context.Service<Warehouse, {
  readonly prepare: (request: Readonly<{ order: Order; idempotencyKey: IdempotencyKey }>) => Effect.Effect<void>
}>()('Warehouse') {}

const paymentWindow = { minutes: 30 }

const isCustomer = (from: Origin<Sender>, order: Order) =>
  from._tag === 'Caller' && from.sender._tag === 'Customer' && from.sender.id === order.customer

const isWarehouse = (from: Origin<Sender>) => from._tag === 'Caller' && from.sender._tag === 'Warehouse'

const charge = (order: Order, payment: string) =>
  operation(Effect.fn('Charge')(
    function*(idempotencyKey: IdempotencyKey) {
      const payments = yield* Payments
      return yield* payments.charge({ payment, totalInCents: order.totalInCents, idempotencyKey })
    },
    Effect.match({
      onSuccess: (charge): Internal => ({ _tag: 'ChargeSucceeded', charge }),
      onFailure: (): Internal => ({ _tag: 'ChargeDeclined' }),
    }),
  ))

const tellWarehouse = (order: Order) =>
  operation(Effect.fn('TellWarehouse')(function*(idempotencyKey: IdempotencyKey) {
    const warehouse = yield* Warehouse
    yield* warehouse.prepare({ order, idempotencyKey })
    return { _tag: 'WarehouseTold' } satisfies Internal
  }))

const refund = (charge: string) =>
  operation(Effect.fn('Refund')(function*(idempotencyKey: IdempotencyKey) {
    const payments = yield* Payments
    yield* payments.refund({ charge, idempotencyKey })
    return { _tag: 'RefundCompleted' } satisfies Internal
  }))

export const order: Program<{
  state: State
  flags: Flags
  inbound: Inbound
  internal: Internal
  sender: Sender
  projection: Projection
  services: Payments | Warehouse
}> = {
  name: 'Order',

  schemas: { state: State, flags: Flags, inbound: Inbound, internal: Internal },

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
            ? { _tag: 'Shipped', order: state.order, charge: state.charge, tracking }
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
      }),
    ),

  durable: (state) =>
    Match.valueTags(state, {
      AwaitingPayment: ({ deadline }) => ({
        'payment-deadline': timer<Internal>(deadline, { _tag: 'PaymentDeadlinePassed' }),
      }),
      Charging: ({ order, payment }) => ({ charge: charge(order, payment) }),
      Paid: ({ order, warehouse }) => warehouse === 'Telling' ? { 'tell-warehouse': tellWarehouse(order) } : noWork,
      Refunding: ({ charge }) => ({ refund: refund(charge) }),
      Shipped: () => noWork,
      Cancelled: () => noWork,
    }),

  project: (state) => ({
    status: state._tag,
    canPay: state._tag === 'AwaitingPayment',
    canCancel: state._tag === 'AwaitingPayment' || (state._tag === 'Paid' && state.warehouse === 'Told'),
  }),
}
