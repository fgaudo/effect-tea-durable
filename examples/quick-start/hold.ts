import * as DateTime from 'effect/DateTime'
import * as Schema from 'effect/Schema'
import { noWork, program, reject, timer } from '@fgaudo/effect-tea-persistent/program'

// A seat held for a quarter of an hour: confirmed in time, or released when the time runs out.
const State = Schema.Union([
  Schema.TaggedStruct('Held', { until: Schema.DateTimeUtcFromMillis }),
  Schema.TaggedStruct('Confirmed', {}),
  Schema.TaggedStruct('Released', {}),
])

export const hold = program({
  state: State,
  flags: Schema.Null,
  inbound: Schema.TaggedStruct('Confirm', {}),
  internal: Schema.TaggedStruct('Expired', {}),
  projection: Schema.Struct({ status: Schema.Literals(['Held', 'Confirmed', 'Released']) }),
})({
  name: 'Hold',
  keys: { expiry: null },
  init: (_, at) => ({ _tag: 'Held', until: DateTime.add(at, { minutes: 15 }) }),
  // `Expired` arrives only while the state holds its timer, so only while the seat is held.
  update: (message) => (state) =>
    message._tag === 'Expired' ? { _tag: 'Released' } : state._tag === 'Held' ? { _tag: 'Confirmed' } : reject,
  // The timer is data, derived from the state: a confirmed seat holds none, and nothing has to cancel it.
  work: (state) => (state._tag === 'Held' ? { expiry: timer(state.until, { _tag: 'Expired' }) } : noWork),
  project: (state) => ({ status: state._tag }),
})
