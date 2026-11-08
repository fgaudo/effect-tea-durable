# Children

This page holds items inside an entity, each with a life of its own. Its code is
[`examples/cart`](../../examples/cart), a cart that holds a line for each article, which `bun test` runs. Read the
guide's [first page](README.md) before it: this page uses its words for a state, `work`, a key and an operation.
The words in bold are defined in [`glossary.md`](../glossary.md), and [`design.md`](../design.md#children) is the
specification behind each rule.

## Contents

- [The requirement](#the-requirement)
- [Where an item goes](#where-an-item-goes)
- [A line is a part](#a-line-is-a-part)
- [The cart holds its lines](#the-cart-holds-its-lines)
- [What a caller sends a line](#what-a-caller-sends-a-line)
- [What the cart tells its lines](#what-the-cart-tells-its-lines)
- [What a line tells the cart](#what-a-line-tells-the-cart)
- [A line's work is the cart's](#a-lines-work-is-the-carts)
- [Rehearsing a cart](#rehearsing-a-cart)
- [The rules, in one list](#the-rules-in-one-list)

## The requirement

A shop sells articles by the unit. The requirement, as the business writes it:

- A customer adds an article to a cart with a quantity, once per article.
- The stock of an article is reserved as soon as it is added.
- A customer removes an article whose stock is reserved, or was refused. The stock reserved is released first.
- A customer checks the cart out. Each article is then sold, and one whose reservation is under way is sold when
  the reservation is made.

## Where an item goes

A line of a cart could be an entity of its own, a field of the cart's state, or a **child** of the cart. The choice
follows two questions.

The first is whether a rule holds across the item and the rest within one step. The checkout is such a rule: in the
step that checks the cart out, every reserved line is sold, and no line is added after it. Were each line an
entity, the checkout would reach a line by a request after the cart's step. A customer could remove a reserved line
in between, and the cart would count as sold a stock already released. So a line is inside the cart. An item is
an entity of its own when others address it by itself, or when its parent would hold more than one step should
write.

The second question is whether the item is a concern of its own. A line reserves its stock, releases it and is
sold, with an operation and states of its own. The cart never reads a line's state to decide anything. So a line
is a child, which the cart hears of only through the events the line raises. An item the parent reads to decide is
a field of the parent's own state instead.

## A line is a part

A child is declared as a **part**, with `part(schemas)(…)`. A part is a program without a name, topics, indexes
or migrations, which are its parent's:

```ts
// What the line tells the cart: it is gone, and the cart drops it from its state.
const Event = Schema.TaggedStruct('Removed', {})

// What the cart tells every line: the checkout is a fact of the cart's, which no caller sends a line.
const External = Schema.TaggedStruct('CheckedOut', {})

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
  // update, work, operations and project, as a program's
})
```

A part's schemas are a program's, with two more that nothing stores, since they only type the part:

- **`event`** is what the line tells its parent, a **raised event**. A line that is gone raises `Removed`.
- **`external`** is what only its parent sends the line, an **external message**. A caller cannot send one. The
  checkout is a fact of the cart's, so it reaches each line from the cart alone.

A part's `init` never rejects. The parent calls it, and decides in its own `init` or `update` whether the child
starts. A part may hold children of its own, so a tree is as deep as a program needs.

## The cart holds its lines

The cart keeps its lines in a record by article, and declares them as children by id:

```ts
const State = Schema.Struct({
  phase: Schema.Literals(['Open', 'CheckedOut']),
  // By article: the line of an article is its child under the article's id.
  lines: Schema.Record(Schema.String, line.schemas.state),
})

const lines = Optic.id<State>().key('lines').compose(Optic.entries())

export const cart = program({ state: State, flags: Schema.Null, inbound: Inbound, projection: Projection })({
  name: 'Cart',
  children: { Line: each(line, { id: Schema.String, at: lines }) },
  init: () => ({ phase: 'Open', lines: {} }),
  // …
})
```

`children` names each child. `each(part, { id, at })` declares children by id, and its `at` is an optic of Effect
that focuses the entries of the record, each an id and a child's state. One optic says both where a line is and
which lines are there. `child(part, { at })` declares one child instead, with an optic that focuses its state, and
`.compose(Optic.some())` makes one that may not be there. An id has a schema, and two ids are one when they encode
alike.

The child's state is part of the parent's, written in the same step. A line starts when the cart puts the line's
first state in its own:

```ts
case 'ItemAdded':
  return state.phase === 'Open' && !Object.hasOwn(state.lines, message.sku)
    ? { ...state, lines: { ...state.lines, [message.sku]: line.init(message, at) } }
    : reject
```

## What a caller sends a line

A line's inbound messages are the cart's, wrapped with the child's name and its id. A customer removes the mug with
one message to the cart:

```ts
yield* rehearsal.send({ _tag: 'Line', id: 'mug', message: { _tag: 'RemoveRequested' } }, null)
```

The library routes the message to the line under `mug`, with the same `meta.from` the cart received. The line's
`update` decides, as any program's does. A line that is not in the cart rejects what it is sent, and so does a line
whose state does not take the message. A cart cannot declare a message of its own under a child's name, since the
library would route it to the child: the compiler refuses one.

A reason a line gives reaches the caller wrapped the same way, as `{ _tag: 'Line', id: 'mug', reason }`.

## What the cart tells its lines

The checkout is the cart's message, and every line learns of it in the same step:

```ts
case 'CheckoutRequested':
  return state.phase === 'Open'
    ? forEach(
      { ...state, phase: 'CheckedOut' },
      Object.keys(state.lines),
      (sku) => children.Line.update(sku, { _tag: 'CheckedOut' }),
    )
    : reject
```

`children` is the third argument of the cart's `update`. `children.Line.update(id, message)` sends a line an
external message, and returns the cart's step. `forEach` starts from a step and adds one more for each item, each
made from the state the one before left. It puts the lines back in the cart's state once, and not once per line.

A line takes an external message in every state, since its parent decides when to send it:

```ts
// An external message is taken in every state: the cart decides when to send it.
CheckedOut: () =>
  state._tag === 'Reserved'
    ? { ...state, _tag: 'Sold' as const }
    : state._tag === 'Reserving'
    ? { _tag: 'Selling' as const, sku: state.sku, quantity: state.quantity }
    : state,
```

**A child that rejects an external message is a defect**, and so is a child that is not there. A caller may send
a message that does not apply, but the parent's own step does not. A child whose external message does not apply in
a state returns its state unchanged, as the line does once it is sold. To combine steps by hand, `andThen(step,
next)` makes the next step from the state of the first, and keeps the events both raised.

## What a line tells the cart

A line that is gone raises `Removed`, and the cart drops it:

```ts
// in the line's update
StockReleased: () =>
  state._tag === 'Releasing'
    ? raise({ _tag: 'Removed' as const })({ _tag: 'Removed' as const, sku: state.sku, quantity: state.quantity })
    : defect('stock was released while nothing was releasing it'),

// in the cart
onEvent: {
  Line: (sku) => (state) => {
    const { [sku]: _, ...kept } = state.lines
    return { ...state, lines: kept }
  },
},
```

`raise(event)(state)` is a step of the line: its next state, with an event for the cart. The cart's `onEvent` has a
handler for each child that raises events, and is required exactly when one does. A handler of children by id
takes the id, then the event and `children`. It runs in the step that raised the event, and nothing stores the
event.

The line raises `Removed` only from the state `Removed`, which holds no work. **A child leaves its work before its
parent drops it.** A reserved line that is removed first releases its stock in `Releasing`, and only the release's
answer moves it to `Removed`. The cart drops it in that step. Had the line raised `Removed` while releasing, the
cart would have dropped a key whose operation still runs, and that is a defect. Had the line raised `Removed` and
stayed in `Releasing`, the release already done would still be its work, and a cart that kept the line would run it
again. `Removed` holds no work, so the cart may keep a line or drop it, and nothing runs twice.

A line removed and added again comes back under new **incarnations**, so an answer of its earlier run is dropped.

## A line's work is the cart's

A line's keys are the cart's, under the child's name. A line by id takes its id as the key's parameter:

```ts
const reserve = yield* rehearsal.pending('Line.reserve', 'mug')
expect(reserve.work).toEqual({
  _tag: 'Line.Reserve',
  id: 'mug',
  operation: { _tag: 'Reserve', sku: 'mug', quantity: 2 },
})
```

A key of a child by id that has a parameter of its own takes the id and the parameter as a pair. The line's
operation reaches the runtime under the tag `Line.Reserve`, with the id, and the line's runner runs it with the
line's delivery. The cart declares no runner for it, and the application provides `Stock`, the service the line's
runner asks for, as it provides any program's. A name with a `.` belongs to this composition, so a parent whose own
key, operation or child has one is refused where it is declared.

The cart's state holds every line, so each step of the cart writes every line, and lists the work of every line.
A step costs more with every child. A cart of a few dozen lines is cheap. An item a parent would hold by the
thousand is an entity of its own, which others address with a request
([entities that talk](../design.md#entities-that-talk)).

## Rehearsing a cart

A rehearsal answers a line's work with a message wrapped as the line's, and reads the line in the cart's state:

```ts
yield* rehearsal.send({ _tag: 'ItemAdded', sku: 'mug', quantity: 1 }, null)
yield* rehearsal.answer('Line.reserve', 'mug', {
  _tag: 'Line',
  id: 'mug',
  message: { _tag: 'StockReserved', reservation: 'r-1' },
})
yield* rehearsal.send({ _tag: 'Line', id: 'mug', message: { _tag: 'RemoveRequested' } }, null)
expect((yield* rehearsal.state).lines['mug']?._tag).toBe('Releasing')
yield* rehearsal.answer('Line.release', 'mug', { _tag: 'Line', id: 'mug', message: { _tag: 'StockReleased' } })
expect((yield* rehearsal.state).lines).toEqual({})
```

The cart's projection holds each line's, through `children` in `project`:

```ts
project: (state, children) => ({
  phase: state.phase,
  lines: Object.keys(state.lines).map((sku) => ({ sku, ...children.Line(state, sku) })),
  canCheckout: state.phase === 'Open',
}),
```

`children.Line(state, id)` is the line's projection. Asking for the projection of a line that is not there is a
defect.

## The rules, in one list

1. **An item is inside the entity when a rule holds across it and the rest within one step**, and an entity of its
   own when others address it, or when its parent would hold more than one step should write.
2. **Inside the entity, an item is a child when it is a concern of its own**, which the parent hears of through
   its raised events and never reads to decide. Otherwise it is a field of the parent's state.
3. **What a parent tells a child is an external message**, which no caller can send, and which the child takes in
   every state: a child that rejects one is a defect.
4. **A child leaves its work before its parent drops it.** It raises the event that asks for its removal from a
   state that holds no work.
5. **A child's messages, keys, operations and reasons are the parent's**, under the child's name, with the id for
   a child by id.
