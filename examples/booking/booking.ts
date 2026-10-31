/**
 * A booking of seats for an event. It holds them in the event's inventory at once, then waits for the customer
 * to confirm before a deadline. A booking cancelled or expired once its seats are held releases them.
 */
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
  send,
  timer,
} from '../../src/index.ts'
import { inventory } from './inventory.ts'

// Checked with the flags, before the booking exists: a booking holds some seats (decision 0049).
const Seats = Schema.Int.check(Schema.isGreaterThan(0))

const Booking = Schema.Struct({
  customer: Schema.String,
  // The inventory's id.
  event: Schema.String,
  seats: Seats,
  deadline: Schema.DateTimeUtcFromMillis,
})
type Booking = typeof Booking.Type

const State = Schema.Union([
  // Only the inventory's reply leaves it: a cancellation meanwhile is remembered.
  Schema.TaggedStruct('Holding', { booking: Booking, cancelled: Schema.Boolean }),
  Schema.TaggedStruct('Held', { booking: Booking }),
  Schema.TaggedStruct('Confirming', { booking: Booking }),
  Schema.TaggedStruct('Releasing', { booking: Booking, reason: Schema.Literals(['ByCustomer', 'Expired']) }),
  Schema.TaggedStruct('Confirmed', { booking: Booking }),
  Schema.TaggedStruct('Cancelled', {
    booking: Booking,
    reason: Schema.Literals(['ByCustomer', 'Expired', 'SoldOut', 'SalesClosed', 'NoSuchEvent']),
  }),
])
export type State = typeof State.Type

const Flags = Schema.Struct({ customer: Schema.String, event: Schema.String, seats: Seats })
type Flags = typeof Flags.Type

const Inbound = Schema.Union([
  Schema.TaggedStruct('ConfirmRequested', {}),
  Schema.TaggedStruct('CancelRequested', {}),
])
type Inbound = typeof Inbound.Type

const Internal = Schema.Union([
  Schema.TaggedStruct('SeatsHeld', {}),
  Schema.TaggedStruct('SeatsUnavailable', { reason: Schema.Literals(['SoldOut', 'SalesClosed', 'NoSuchEvent']) }),
  Schema.TaggedStruct('SeatsConfirmed', {}),
  Schema.TaggedStruct('SeatsReleased', {}),
  Schema.TaggedStruct('DeadlinePassed', {}),
])
type Internal = typeof Internal.Type

const Sender = Schema.TaggedStruct('Customer', { id: Schema.String })
export type Sender = typeof Sender.Type

// What callers read: it leaves the process, with the deadline in it, so it has a schema too.
const Projection = Schema.Struct({
  status: Schema.Literals(['Holding', 'Held', 'Confirming', 'Releasing', 'Confirmed', 'Cancelled']),
  seats: Schema.Int,
  deadline: Schema.DateTimeUtcFromMillis,
  canConfirm: Schema.Boolean,
  canCancel: Schema.Boolean,
})
export type Projection = typeof Projection.Type

const holdWindow = { minutes: 15 }

const isCustomer = (from: Origin<Sender>, booking: Booking) =>
  from._tag === 'Caller' && from.sender.id === booking.customer

// What the booking asks of the event's inventory, as data: a test sees it without running it.
const Operation = Schema.TaggedUnion({
  Hold: { event: Schema.String, seats: Seats },
  Confirm: { event: Schema.String },
  Release: { event: Schema.String },
})
type Operation = typeof Operation.Type

// The idempotency key and the request's name are the request id: a hold restarted after a crash is answered from
// the stored reply, and holds nothing twice.
const hold = Effect.fn('Hold')(
  function*({ event, seats }: Extract<Operation, { _tag: 'Hold' }>, idempotencyKey: IdempotencyKey) {
    const reply = yield* send(inventory, event, { _tag: 'HoldRequested', seats }, idempotencyKey, 'hold')
    // A rejection with no reason means the two entities disagree: a booking holds once, and holds some seats.
    return reply._tag === 'Accepted'
      ? { _tag: 'SeatsHeld' } satisfies Internal
      : reply._tag === 'NotFound'
      ? { _tag: 'SeatsUnavailable', reason: 'NoSuchEvent' } satisfies Internal
      : reply.reason !== null
      ? { _tag: 'SeatsUnavailable', reason: reply.reason } satisfies Internal
      : yield* Effect.die('the inventory rejected a hold for no reason')
  },
)

// The inventory confirms and releases any hold it made, and existed when it made it. Any other reply means the
// two entities disagree, which no message of this program can repair: it is a defect, and suspends the booking.
const confirm = Effect.fn('Confirm')(
  function*({ event }: Extract<Operation, { _tag: 'Confirm' }>, idempotencyKey: IdempotencyKey) {
    const reply = yield* send(inventory, event, { _tag: 'ConfirmRequested' }, idempotencyKey, 'confirm')
    return reply._tag === 'Accepted'
      ? { _tag: 'SeatsConfirmed' } satisfies Internal
      : yield* Effect.die('the inventory did not accept the confirmation of its own hold')
  },
)

const release = Effect.fn('Release')(
  function*({ event }: Extract<Operation, { _tag: 'Release' }>, idempotencyKey: IdempotencyKey) {
    const reply = yield* send(inventory, event, { _tag: 'ReleaseRequested' }, idempotencyKey, 'release')
    return reply._tag === 'Accepted'
      ? { _tag: 'SeatsReleased' } satisfies Internal
      : yield* Effect.die('the inventory did not accept the release of its own hold')
  },
)

export const booking = program({
  state: State,
  flags: Flags,
  inbound: Inbound,
  internal: Internal,
  operation: Operation,
  rejection: Schema.Never,
  sender: Sender,
  projection: Projection,
})({
  name: 'Booking',

  keys: ['hold', 'deadline', 'confirm', 'release'],

  // The deadline counts from the booking, not from the hold: a slow inventory shortens the customer's wait.
  init: ({ customer, event, seats }, at) => ({
    _tag: 'Holding',
    booking: { customer, event, seats, deadline: DateTime.add(at, holdWindow) },
    cancelled: false,
  }),

  update: (message, { from }) => (state) =>
    Match.value(message).pipe(
      Match.withReturnType<State | Rejected>(),
      Match.tagsExhaustive({
        ConfirmRequested: () =>
          state._tag === 'Held' && isCustomer(from, state.booking)
            ? { _tag: 'Confirming', booking: state.booking }
            : reject,

        CancelRequested: () =>
          !isCustomer(from, state.booking)
            ? reject
            : state._tag === 'Holding' && !state.cancelled
            ? { ...state, cancelled: true }
            : state._tag === 'Held'
            ? { _tag: 'Releasing', booking: state.booking, reason: 'ByCustomer' }
            : reject,

        // The deadline may have passed meanwhile: its timer comes with `Held`, and fires at once.
        SeatsHeld: () =>
          state._tag !== 'Holding'
            ? defect('seats were held while nothing was holding them')
            : state.cancelled
            ? { _tag: 'Releasing', booking: state.booking, reason: 'ByCustomer' }
            : { _tag: 'Held', booking: state.booking },

        SeatsUnavailable: ({ reason }) =>
          state._tag === 'Holding'
            ? { _tag: 'Cancelled', booking: state.booking, reason: state.cancelled ? 'ByCustomer' : reason }
            : defect('seats were unavailable while nothing was holding them'),

        SeatsConfirmed: () =>
          state._tag === 'Confirming'
            ? { _tag: 'Confirmed', booking: state.booking }
            : defect('seats were confirmed while nothing was confirming them'),

        SeatsReleased: () =>
          state._tag === 'Releasing'
            ? { _tag: 'Cancelled', booking: state.booking, reason: state.reason }
            : defect('seats were released while nothing was releasing them'),

        DeadlinePassed: () =>
          state._tag === 'Held'
            ? { _tag: 'Releasing', booking: state.booking, reason: 'Expired' }
            : defect('the deadline passed while no seats were held'),
      }),
    ),

  durable: (state) =>
    Match.valueTags(state, {
      Holding: ({ booking }) => ({ hold: Operation.cases.Hold.make({ event: booking.event, seats: booking.seats }) }),
      Held: ({ booking }) => ({ deadline: timer<Internal>(booking.deadline, { _tag: 'DeadlinePassed' }) }),
      Confirming: ({ booking }) => ({ confirm: Operation.cases.Confirm.make({ event: booking.event }) }),
      Releasing: ({ booking }) => ({ release: Operation.cases.Release.make({ event: booking.event }) }),
      Confirmed: () => noWork,
      Cancelled: () => noWork,
    }),

  operations: { Hold: operation(hold), Confirm: operation(confirm), Release: operation(release) },

  project: (state) => ({
    status: state._tag,
    seats: state.booking.seats,
    deadline: state.booking.deadline,
    canConfirm: state._tag === 'Held',
    canCancel: (state._tag === 'Holding' && !state.cancelled) || state._tag === 'Held',
  }),

  // Nothing is asked across these entities: no query, so no index (decision 0032).
  indexes: {},
})
