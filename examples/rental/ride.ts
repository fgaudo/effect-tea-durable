/**
 * A ride of the rental, from the unlock of its bike to its dock. The customer pays the rate per minute they were
 * shown when they end the ride. A customer who finds the bike unfit cancels the ride within two minutes, and pays
 * nothing. An email tells them the ride has started. The guide's running example, with `bike.ts`.
 */
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Match from 'effect/Match'
import * as Schema from 'effect/Schema'
import {
  defect,
  noWork,
  type Origin,
  operation,
  program,
  reference,
  reject,
  type Rejected,
  send,
  timer,
} from '@fgaudo/effect-tea-persistent/program'
import type { bike } from './bike.ts'

// The bike imports the ride's name too, so each imports only the other's types (decision 0183).
const Bike = reference<typeof bike>('Bike')

// Checked with the flags, before the ride exists: the bike's schema refuses any other rate, and a ride that sent
// one would die in its operation (decision 0049).
const Rate = Schema.Int.check(Schema.isGreaterThan(0))

const Ride = Schema.Struct({
  customer: Schema.String,
  // Read by the boundary from the application's table of customers, and sent with the creation.
  email: Schema.String,
  // The bike's id.
  bike: Schema.String,
  // The rate the customer was shown, read by the boundary off the bike's projection.
  centsPerMinute: Rate,
})
type Ride = typeof Ride.Type

// An email is not idempotent: after a crash while sending it, the customer may or may not have it.
const Email = Schema.Literals(['Sending', 'Sent', 'Unsure'])
type Email = typeof Email.Type

const State = Schema.Union([
  // Only the bike's reply leaves it.
  Schema.TaggedStruct('Unlocking', { ride: Ride }),
  Schema.TaggedStruct('Refused', { ride: Ride, reason: Schema.Literals(['RateChanged', 'InUse', 'NoSuchBike']) }),
  Schema.TaggedStruct('Riding', {
    ride: Ride,
    startedAt: Schema.DateTimeUtcFromMillis,
    // Until when a cancellation is free, and null once that time has passed: a timer sets it, so that `project`
    // reads it and no clock.
    cancellableUntil: Schema.NullOr(Schema.DateTimeUtcFromMillis),
    email: Email,
  }),
  // The ride is over, and its cost known: only the bike's reply to the dock leaves it.
  Schema.TaggedStruct('Docking', { ride: Ride, costInCents: Schema.Int, email: Email }),
  Schema.TaggedStruct('Ended', { ride: Ride, costInCents: Schema.Int, email: Email }),
])
export type State = typeof State.Type

const Inbound = Schema.Union([
  Schema.TaggedStruct('EndRequested', {}),
  Schema.TaggedStruct('CancelRequested', {}),
])

const Internal = Schema.Union([
  Schema.TaggedStruct('Unlocked', {}),
  Schema.TaggedStruct('UnlockRefused', { reason: Schema.Literals(['RateChanged', 'InUse', 'NoSuchBike']) }),
  Schema.TaggedStruct('CancellationClosed', {}),
  Schema.TaggedStruct('Docked', {}),
  Schema.TaggedStruct('StartEmailed', {}),
  Schema.TaggedStruct('StartEmailUnsure', {}),
])
type Internal = typeof Internal.Type

const Sender = Schema.TaggedStruct('Customer', { id: Schema.String })
export type Sender = typeof Sender.Type

// What callers read. It is JSON, so a time is its milliseconds (decision 0139).
const Projection = Schema.Struct({
  status: Schema.Literals(['Unlocking', 'Refused', 'Riding', 'Docking', 'Ended']),
  bike: Schema.String,
  // Why the bike refused the ride, which the customer is told.
  refusal: Schema.NullOr(Schema.Literals(['RateChanged', 'InUse', 'NoSuchBike'])),
  cancellableUntil: Schema.NullOr(Schema.Number),
  costInCents: Schema.NullOr(Schema.Int),
  canEnd: Schema.Boolean,
  canCancel: Schema.Boolean,
})
export type Projection = typeof Projection.Type

export class Mailer extends Context.Service<Mailer, {
  readonly send: (email: Readonly<{ to: string; subject: string }>) => Effect.Effect<void>
}>()('Mailer') {}

const cancellationWindow = { minutes: 2 }

const isCustomer = (from: Origin<Sender>, ride: Ride) => from._tag === 'Caller' && from.sender.id === ride.customer

// A minute begun is a minute paid.
const costOf = (ride: Ride, startedAt: DateTime.Utc, at: DateTime.Utc) =>
  Math.max(1, Math.ceil(Duration.toMillis(DateTime.distance(startedAt, at)) / 60_000)) * ride.centsPerMinute

const Operation = Schema.TaggedUnion({
  Unlock: { bike: Schema.String, centsPerMinute: Rate },
  Dock: { bike: Schema.String },
  EmailStart: { to: Schema.String, bike: Schema.String },
})
type Operation = typeof Operation.Type

// The email under way, in every state that holds it. The same value under the same key keeps the email running:
// a state that dropped it while it runs would be a defect (decision 0005).
const emailing = (ride: Ride, email: Email) =>
  email === 'Sending' ? { email: Operation.cases.EmailStart.make({ to: ride.email, bike: ride.bike }) } : noWork

// A request is the run of the operation and the name it gives, so an unlock run again after a crash is given the
// stored reply, and unlocks once. It may run at least once.
const unlock = Effect.fn('Unlock')(
  function*({ bike, centsPerMinute }: Extract<Operation, { _tag: 'Unlock' }>) {
    const reply = yield* send(Bike, bike, { _tag: 'UnlockRequested', centsPerMinute }, 'unlock')
    // A rejection with no reason means the two entities disagree: a ride unlocks as itself.
    return reply._tag === 'Accepted'
      ? { _tag: 'Unlocked' } satisfies Internal
      : reply._tag === 'NotFound'
      ? { _tag: 'UnlockRefused', reason: 'NoSuchBike' } satisfies Internal
      : reply.reason !== null
      ? { _tag: 'UnlockRefused', reason: reply.reason } satisfies Internal
      : yield* Effect.die('the bike rejected an unlock for no reason')
  },
)

// The bike docks the ride that unlocked it. Any other reply is a defect, and suspends the ride.
const dock = Effect.fn('Dock')(
  function*({ bike }: Extract<Operation, { _tag: 'Dock' }>) {
    const reply = yield* send(Bike, bike, { _tag: 'DockRequested' }, 'dock')
    return reply._tag === 'Accepted'
      ? { _tag: 'Docked' } satisfies Internal
      : yield* Effect.die('the bike did not accept the dock of its own ride')
  },
)

const emailStart = Effect.fn('EmailStart')(
  function*({ to, bike }: Extract<Operation, { _tag: 'EmailStart' }>) {
    const mailer = yield* Mailer
    yield* mailer.send({ to, subject: `Your ride on bike ${bike} has started` })
    return { _tag: 'StartEmailed' } satisfies Internal
  },
)

export const ride = program({
  state: State,
  flags: Ride,
  inbound: Inbound,
  internal: Internal,
  operation: Operation,
  sender: Sender,
  projection: Projection,
})({
  name: 'Ride',

  keys: ['unlock', 'cancellation', 'email', 'dock'],

  init: (ride) => ({ _tag: 'Unlocking', ride }),

  update: (message, { from, at }) => (state) =>
    Match.value(message).pipe(
      Match.withReturnType<State | Rejected>(),
      Match.tagsExhaustive({
        // The email under way is carried into the next state, with its key.
        EndRequested: () =>
          state._tag === 'Riding' && isCustomer(from, state.ride)
            ? {
              _tag: 'Docking',
              ride: state.ride,
              costInCents: costOf(state.ride, state.startedAt, at),
              email: state.email,
            }
            : reject,

        CancelRequested: () =>
          state._tag === 'Riding' && state.cancellableUntil !== null && isCustomer(from, state.ride)
            ? { _tag: 'Docking', ride: state.ride, costInCents: 0, email: state.email }
            : reject,

        Unlocked: () =>
          state._tag === 'Unlocking'
            ? {
              _tag: 'Riding',
              ride: state.ride,
              startedAt: at,
              cancellableUntil: DateTime.add(at, cancellationWindow),
              email: 'Sending',
            }
            : defect('a bike was unlocked while nothing was unlocking it'),

        UnlockRefused: ({ reason }) =>
          state._tag === 'Unlocking'
            ? { _tag: 'Refused', ride: state.ride, reason }
            : defect('an unlock was refused while nothing was unlocking'),

        // The timer's message is the fact that the time has passed: `update` compares no clock with it.
        CancellationClosed: () =>
          state._tag === 'Riding' && state.cancellableUntil !== null
            ? { ...state, cancellableUntil: null }
            : defect('the cancellation closed while it was not open'),

        Docked: () =>
          state._tag === 'Docking'
            ? { _tag: 'Ended', ride: state.ride, costInCents: state.costInCents, email: state.email }
            : defect('a bike was docked while nothing was docking it'),

        StartEmailed: () =>
          (state._tag === 'Riding' || state._tag === 'Docking' || state._tag === 'Ended') && state.email === 'Sending'
            ? { ...state, email: 'Sent' }
            : defect('a start email was sent while nothing was sending it'),

        StartEmailUnsure: () =>
          (state._tag === 'Riding' || state._tag === 'Docking' || state._tag === 'Ended') && state.email === 'Sending'
            ? { ...state, email: 'Unsure' }
            : defect('a start email was unsure while nothing was sending it'),
      }),
    ),

  work: (state) =>
    Match.valueTags(state, {
      Unlocking: ({ ride }) => ({
        unlock: Operation.cases.Unlock.make({ bike: ride.bike, centsPerMinute: ride.centsPerMinute }),
      }),
      Refused: () => noWork,
      Riding: ({ ride, cancellableUntil, email }) => ({
        ...(cancellableUntil === null
          ? noWork
          : { cancellation: timer(cancellableUntil, { _tag: 'CancellationClosed' }) }),
        ...emailing(ride, email),
      }),
      Docking: ({ ride, email }) => ({
        dock: Operation.cases.Dock.make({ bike: ride.bike }),
        ...emailing(ride, email),
      }),
      Ended: ({ ride, email }) => emailing(ride, email),
    }),

  operations: {
    Unlock: operation.atLeastOnce(unlock),
    Dock: operation.atLeastOnce(dock),
    // Sent at most once: a second email is worse than none, and the state says when it is not known.
    EmailStart: operation.atMostOnce(emailStart, (): Internal => ({ _tag: 'StartEmailUnsure' })),
  },

  project: (state) => ({
    status: state._tag,
    bike: state.ride.bike,
    refusal: state._tag === 'Refused' ? state.reason : null,
    cancellableUntil: state._tag === 'Riding' && state.cancellableUntil !== null
      ? DateTime.toEpochMillis(state.cancellableUntil)
      : null,
    costInCents: state._tag === 'Docking' || state._tag === 'Ended' ? state.costInCents : null,
    canEnd: state._tag === 'Riding',
    canCancel: state._tag === 'Riding' && state.cancellableUntil !== null,
  }),
})
