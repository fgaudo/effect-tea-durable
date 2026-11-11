/**
 * An electricity meter, fed by a stream of its readings. A reading gives the meter's index, the kilowatt-hours it
 * counted since it was installed, and the meter's consumption grows by the difference. The state keeps the offset
 * of the last reading applied, so a reading the source gives again is rejected, whatever the reply's keep.
 */
import * as Schema from 'effect/Schema'
import { program, rejectWith } from '@fgaudo/effect-tea-persistent/program'

const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

const State = Schema.Struct({
  // The offset of the last reading applied, or null before the first one.
  last: Schema.NullOr(Count),
  index: Count,
  kwh: Count,
})

const Inbound = Schema.TaggedStruct('Read', { offset: Count, index: Count })

// A reading at or before the last offset applied was applied already.
const Rejection = Schema.Literals(['Stale'])

/** The feed's boundary is the only sender. */
const Sender = Schema.TaggedStruct('Feed', {})

const Projection = Schema.Struct({ last: Schema.NullOr(Schema.Int), kwh: Schema.Int })

export const meter = program({
  state: State,
  flags: Schema.Null,
  inbound: Inbound,
  rejection: Rejection,
  sender: Sender,
  projection: Projection,
})({
  name: 'Meter',

  // A meter is installed at an index of 0.
  init: () => ({ last: null, index: 0, kwh: 0 }),

  update: ({ offset, index }) => (state) =>
    state.last !== null && offset <= state.last
      ? rejectWith('Stale')
      // A meter's index never goes back, so a lower index is a meter replaced, which counts again from 0.
      : { last: offset, index, kwh: state.kwh + (index >= state.index ? index - state.index : index) },

  project: ({ last, kwh }) => ({ last, kwh }),
})
