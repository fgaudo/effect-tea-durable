/**
 * A bike of the rental, docked or ridden. An operator sets its rate per minute. A ride unlocks it at the rate the
 * customer was shown, and docks it at the end. The guide's running example, with `ride.ts`.
 */
import * as Match from 'effect/Match'
import * as Schema from 'effect/Schema'
import {
  type Origin,
  program,
  reference,
  reject,
  type Rejected,
  rejectWith,
} from '@fgaudo/effect-tea-persistent/program'
import type { ride } from './ride.ts'

// The ride sends to the bike, so each imports only the other's types (decision 0183).
const Ride = reference<typeof ride>('Ride')

const Rate = Schema.Int.check(Schema.isGreaterThan(0))

const State = Schema.Union([
  Schema.TaggedStruct('Docked', { centsPerMinute: Rate }),
  Schema.TaggedStruct('Ridden', { centsPerMinute: Rate, ride: Schema.String }),
])
type State = typeof State.Type

const Flags = Schema.Struct({ centsPerMinute: Rate })

// A ride sends them as itself, so they name no ride.
const Inbound = Schema.Union([
  // The rate the customer was shown: the bike refuses it once it has changed.
  Schema.TaggedStruct('UnlockRequested', { centsPerMinute: Rate }),
  Schema.TaggedStruct('DockRequested', {}),
  Schema.TaggedStruct('RateSet', { centsPerMinute: Rate }),
])

// What a ride tells its customer. The other rejections are a ride's own mistakes.
const Rejection = Schema.Literals(['RateChanged', 'InUse'])
type Rejection = typeof Rejection.Type

/** Rides are not senders: they arrive as entities, from their operations. */
const Sender = Schema.TaggedStruct('Operator', {})
export type Sender = typeof Sender.Type

const Projection = Schema.Struct({
  status: Schema.Literals(['Docked', 'Ridden']),
  centsPerMinute: Schema.Int,
  canUnlock: Schema.Boolean,
})
export type Projection = typeof Projection.Type

// The return type is written. The ride's types are inferred from the bike's, so a type inferred here from `Ride`
// would make the bike's type depend on itself.
const rideOf = (from: Origin<Sender>): string | null =>
  from._tag === 'Entity' && from.entity.name === Ride.name ? from.entity.id : null

const isOperator = (from: Origin<Sender>) => from._tag === 'Caller' && from.sender._tag === 'Operator'

export const bike = program({
  state: State,
  flags: Flags,
  inbound: Inbound,
  rejection: Rejection,
  sender: Sender,
  projection: Projection,
})({
  name: 'Bike',

  init: ({ centsPerMinute }) => ({ _tag: 'Docked', centsPerMinute }),

  update: (message, { from }) => (state) => {
    const ride = rideOf(from)
    return Match.value(message).pipe(
      Match.withReturnType<State | Rejected<Rejection>>(),
      Match.tagsExhaustive({
        UnlockRequested: ({ centsPerMinute }) =>
          ride === null
            ? reject
            : state._tag === 'Ridden'
            ? rejectWith('InUse')
            : centsPerMinute !== state.centsPerMinute
            ? rejectWith('RateChanged')
            : { _tag: 'Ridden', centsPerMinute: state.centsPerMinute, ride },

        DockRequested: () =>
          state._tag === 'Ridden' && ride === state.ride
            ? { _tag: 'Docked', centsPerMinute: state.centsPerMinute }
            : reject,

        // A ride under way keeps the rate it was unlocked at: the new rate is for the next one.
        RateSet: ({ centsPerMinute }) => isOperator(from) ? { ...state, centsPerMinute } : reject,
      }),
    )
  },

  project: (state) => ({
    status: state._tag,
    centsPerMinute: state.centsPerMinute,
    canUnlock: state._tag === 'Docked',
  }),
})
