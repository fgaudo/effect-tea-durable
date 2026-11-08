/**
 * A line of a cart: one article, whose stock it reserves as soon as it is added. A line decides its own removal: a
 * reserved one releases its stock first, moves to `Removed`, a state that holds no work, and from there tells the
 * cart it is gone. So a parent that kept the line would not release its stock again. The cart hands down its
 * checkout, which every line takes in whatever state it is.
 */
import * as Context from 'effect/Context'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Schema from 'effect/Schema'
import { defect, type IdempotencyKey, noWork, operation, part, raise, reject } from '@fgaudo/effect-tea-persistent/program'

// How many units of the article: a line of none would reserve nothing, and a negative one would give stock back.
export const Quantity = Schema.Int.check(Schema.isGreaterThan(0))

const State = Schema.Union([
  // Only the reservation's answer leaves it: a removal meanwhile is rejected.
  Schema.TaggedStruct('Reserving', { sku: Schema.String, quantity: Quantity }),
  Schema.TaggedStruct('Reserved', { sku: Schema.String, quantity: Quantity, reservation: Schema.String }),
  Schema.TaggedStruct('Unavailable', { sku: Schema.String, quantity: Quantity }),
  Schema.TaggedStruct('Releasing', { sku: Schema.String, quantity: Quantity, reservation: Schema.String }),
  // Checked out while its reservation was under way: the answer decides whether it is sold.
  Schema.TaggedStruct('Selling', { sku: Schema.String, quantity: Quantity }),
  Schema.TaggedStruct('Sold', { sku: Schema.String, quantity: Quantity, reservation: Schema.String }),
  // Gone, and waiting for the cart to drop it: the one state a line raises `Removed` from, and it holds no work.
  Schema.TaggedStruct('Removed', { sku: Schema.String, quantity: Quantity }),
])
export type State = typeof State.Type

const Flags = Schema.Struct({ sku: Schema.String, quantity: Quantity })

const Inbound = Schema.TaggedStruct('RemoveRequested', {})

const Internal = Schema.Union([
  Schema.TaggedStruct('StockReserved', { reservation: Schema.String }),
  Schema.TaggedStruct('StockRefused', {}),
  Schema.TaggedStruct('StockReleased', {}),
])
type Internal = typeof Internal.Type

// What the line tells the cart: it is gone, and the cart drops it from its state.
const Event = Schema.TaggedStruct('Removed', {})

// What the cart tells every line: the checkout is a fact of the cart's, which no caller sends a line.
const External = Schema.TaggedStruct('CheckedOut', {})

const Operation = Schema.TaggedUnion({
  Reserve: { sku: Schema.String, quantity: Quantity },
  Release: { reservation: Schema.String },
})
type Operation = typeof Operation.Type

export const Projection = Schema.Struct({
  status: Schema.Literals(['Reserving', 'Reserved', 'Unavailable', 'Releasing', 'Selling', 'Sold', 'Removed']),
  quantity: Schema.Int,
  canRemove: Schema.Boolean,
})

export class Stock extends Context.Service<Stock, {
  readonly reserve: (
    request: Readonly<{ sku: string; quantity: number; idempotencyKey: IdempotencyKey }>,
  ) => Effect.Effect<string, 'OutOfStock'>
  readonly release: (request: Readonly<{ reservation: string; idempotencyKey: IdempotencyKey }>) => Effect.Effect<void>
}>()('Stock') {}

const reserve = Effect.fn('Reserve')(
  function*({ sku, quantity }: Extract<Operation, { _tag: 'Reserve' }>, idempotencyKey: IdempotencyKey) {
    const stock = yield* Stock
    return yield* stock.reserve({ sku, quantity, idempotencyKey })
  },
  Effect.match({
    onSuccess: (reservation): Internal => ({ _tag: 'StockReserved', reservation }),
    onFailure: (): Internal => ({ _tag: 'StockRefused' }),
  }),
)

const release = Effect.fn('Release')(
  function*({ reservation }: Extract<Operation, { _tag: 'Release' }>, idempotencyKey: IdempotencyKey) {
    const stock = yield* Stock
    yield* stock.release({ reservation, idempotencyKey })
    return { _tag: 'StockReleased' } satisfies Internal
  },
)

export const line = part({
  state: State,
  flags: Flags,
  inbound: Inbound,
  internal: Internal,
  operation: Operation,
  projection: Projection,
  event: Event,
  external: External,
})({
  keys: ['reserve', 'release'],

  init: ({ sku, quantity }) => ({ _tag: 'Reserving', sku, quantity }),

  update: (message) => (state) =>
    Match.value(message).pipe(
      Match.tagsExhaustive({
        RemoveRequested: () =>
          state._tag === 'Reserved'
            ? { _tag: 'Releasing' as const, sku: state.sku, quantity: state.quantity, reservation: state.reservation }
            : state._tag === 'Unavailable'
            ? raise({ _tag: 'Removed' as const })({ _tag: 'Removed' as const, sku: state.sku, quantity: state.quantity })
            : reject,

        StockReserved: ({ reservation }) =>
          state._tag === 'Reserving'
            ? { _tag: 'Reserved' as const, sku: state.sku, quantity: state.quantity, reservation }
            : state._tag === 'Selling'
            ? { _tag: 'Sold' as const, sku: state.sku, quantity: state.quantity, reservation }
            : defect('a reservation was made while nothing was reserving'),

        StockRefused: () =>
          state._tag === 'Reserving' || state._tag === 'Selling'
            ? { _tag: 'Unavailable' as const, sku: state.sku, quantity: state.quantity }
            : defect('a reservation was refused while nothing was reserving'),

        StockReleased: () =>
          state._tag === 'Releasing'
            ? raise({ _tag: 'Removed' as const })({ _tag: 'Removed' as const, sku: state.sku, quantity: state.quantity })
            : defect('stock was released while nothing was releasing it'),

        // An external message is taken in every state: the cart decides when to send it.
        CheckedOut: () =>
          state._tag === 'Reserved'
            ? { ...state, _tag: 'Sold' as const }
            : state._tag === 'Reserving'
            ? { _tag: 'Selling' as const, sku: state.sku, quantity: state.quantity }
            : state,
      }),
    ),

  work: (state) =>
    Match.valueTags(state, {
      Reserving: ({ sku, quantity }) => ({ reserve: Operation.cases.Reserve.make({ sku, quantity }) }),
      Selling: ({ sku, quantity }) => ({ reserve: Operation.cases.Reserve.make({ sku, quantity }) }),
      Releasing: ({ reservation }) => ({ release: Operation.cases.Release.make({ reservation }) }),
      Reserved: () => noWork,
      Unavailable: () => noWork,
      Sold: () => noWork,
      Removed: () => noWork,
    }),

  operations: { Reserve: operation(reserve), Release: operation(release) },

  project: (state) => ({
    status: state._tag,
    quantity: state.quantity,
    canRemove: state._tag === 'Reserved' || state._tag === 'Unavailable',
  }),
})
