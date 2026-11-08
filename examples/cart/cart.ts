/**
 * A cart of lines, one for each article. The cart adds a line and drops one that tells it it is gone, and its
 * checkout is told to every line in the step that takes it. Each line is a child by id: its reservation, its removal
 * and its sale are its own, and the cart never reads a line's state to decide.
 */
import * as Optic from 'effect/Optic'
import * as Schema from 'effect/Schema'
import { each, forEach, program, reject } from '@fgaudo/effect-tea-persistent/program'
import { line, Projection as LineProjection, type State as LineState } from './line.ts'

const Line = line.schemas.state

const State = Schema.Struct({
  phase: Schema.Literals(['Open', 'CheckedOut']),
  // By article: the line of an article is its child under the article's id.
  lines: Schema.Record(Schema.String, Line),
})
type State = typeof State.Type

const Inbound = Schema.Union([
  Schema.TaggedStruct('ItemAdded', { sku: Schema.String, quantity: Schema.Int }),
  Schema.TaggedStruct('CheckoutRequested', {}),
])

const Projection = Schema.Struct({
  phase: Schema.Literals(['Open', 'CheckedOut']),
  // A line's projection, with its article: a line in `Removed` is dropped in the step that removes it, so none shows.
  lines: Schema.Array(Schema.Struct({ sku: Schema.String, ...LineProjection.fields })),
  canCheckout: Schema.Boolean,
})

const lines = Optic.id<State>().key('lines').compose(Optic.entries())

export const cart = program({
  state: State,
  flags: Schema.Null,
  inbound: Inbound,
  projection: Projection,
})({
  name: 'Cart',

  children: { Line: each(line, { id: Schema.String, at: lines }) },

  init: () => ({ phase: 'Open', lines: {} }),

  update: (message, { at }, children) => (state) => {
    switch (message._tag) {
      // An article already in the cart is a line already: its quantity is the line's, which this cart never
      // changes.
      case 'ItemAdded':
        return state.phase === 'Open' && !Object.hasOwn(state.lines, message.sku)
          ? { ...state, lines: { ...state.lines, [message.sku]: line.init(message, at) } }
          : reject
      case 'CheckoutRequested':
        return state.phase === 'Open'
          ? forEach(
            { ...state, phase: 'CheckedOut' },
            Object.keys(state.lines),
            (sku) => children.Line.update(sku, { _tag: 'CheckedOut' }),
          )
          : reject
    }
  },

  project: (state, children) => ({
    phase: state.phase,
    lines: Object.keys(state.lines).map((sku) => ({ sku, ...children.Line(state, sku) })),
    canCheckout: state.phase === 'Open',
  }),

  onEvent: {
    Line: (sku) => (state) => {
      const { [sku]: _, ...kept } = state.lines
      return { ...state, lines: kept satisfies Readonly<Record<string, LineState>> }
    },
  },
})
