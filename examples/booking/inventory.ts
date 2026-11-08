/**
 * The seats of an event. A booking holds seats, then confirms or releases them. The organizer closes the sales:
 * the holds already made may still be confirmed, since each one was a promise.
 */
import * as Match from 'effect/Match'
import * as Schema from 'effect/Schema'
import { type Origin, program, reference, reject, type Rejected, rejectWith } from '@fgaudo/effect-tea-persistent/program'
import type { booking } from './booking.ts'

// The booking sends to the inventory, so each imports only the other's types (decision 0183).
const Booking = reference<typeof booking>('Booking')

const State = Schema.Struct({
  open: Schema.Boolean,
  capacity: Schema.Int,
  // Seats by booking id.
  held: Schema.Record(Schema.String, Schema.Int),
  sold: Schema.Record(Schema.String, Schema.Int),
})
type State = typeof State.Type

const Flags = Schema.Struct({ capacity: Schema.Int })
type Flags = typeof Flags.Type

// A booking sends them as itself, so they name no booking.
const Inbound = Schema.Union([
  Schema.TaggedStruct('HoldRequested', { seats: Schema.Int }),
  Schema.TaggedStruct('ConfirmRequested', {}),
  Schema.TaggedStruct('ReleaseRequested', {}),
  Schema.TaggedStruct('CloseRequested', {}),
])
type Inbound = typeof Inbound.Type

// What a booking can tell its customer. The other rejections of a hold are the booking's own mistakes.
const Rejection = Schema.Literals(['SoldOut', 'SalesClosed'])
type Rejection = typeof Rejection.Type

/** Bookings are not senders: they arrive as entities, from their operations. */
const Sender = Schema.TaggedStruct('Organizer', {})
export type Sender = typeof Sender.Type

const Projection = Schema.Struct({ open: Schema.Boolean, available: Schema.Int, canClose: Schema.Boolean })
export type Projection = typeof Projection.Type

const total = (seats: Readonly<Record<string, number>>) => Object.values(seats).reduce((a, b) => a + b, 0)

const available = (state: State) => state.capacity - total(state.held) - total(state.sold)

// The return type is written. The booking's types are inferred from the inventory's, so a type inferred here from
// `Booking` would make the inventory's type depend on itself.
const bookingOf = (from: Origin<Sender>): string | null =>
  from._tag === 'Entity' && from.entity.name === Booking.name ? from.entity.id : null

const isOrganizer = (from: Origin<Sender>) => from._tag === 'Caller' && from.sender._tag === 'Organizer'

// The inventory holds no work of its own: it declares no internal message, operation or key.
export const inventory = program({
  state: State,
  flags: Flags,
  inbound: Inbound,
  rejection: Rejection,
  sender: Sender,
  projection: Projection,
})({
  name: 'Inventory',

  init: ({ capacity }) => ({ open: true, capacity, held: {}, sold: {} }),

  update: (message, { from }) => (state) => {
    const booking = bookingOf(from)
    return Match.value(message).pipe(
      Match.withReturnType<State | Rejected<Rejection>>(),
      Match.tagsExhaustive({
        // A booking holds once: a second hold would be a second booking under the same id.
        HoldRequested: ({ seats }) =>
          booking === null || booking in state.held || booking in state.sold || seats <= 0
            ? reject
            : !state.open
            ? rejectWith('SalesClosed')
            : seats > available(state)
            ? rejectWith('SoldOut')
            : { ...state, held: { ...state.held, [booking]: seats } },

        ConfirmRequested: () => {
          if (booking === null) return reject
          const { [booking]: seats, ...held } = state.held
          return seats === undefined ? reject : { ...state, held, sold: { ...state.sold, [booking]: seats } }
        },

        ReleaseRequested: () => {
          if (booking === null) return reject
          const { [booking]: seats, ...held } = state.held
          return seats === undefined ? reject : { ...state, held }
        },

        CloseRequested: () => state.open && isOrganizer(from) ? { ...state, open: false } : reject,
      }),
    )
  },

  project: (state) => ({
    open: state.open,
    available: available(state),
    canClose: state.open,
  }),
})
