# 0155. A forEach of messages to children puts them back once

**Status:** accepted, 2026-11-06. Decided the open question of a message to every child by id. Changes
[decision 0133](0133-an-entity-composes-children-as-effect-tea-does.md), under which a step that sends to each child
in turn replaces the parent's state once per child.

## Context

`children.Line.update(id, message)` returns the parent's step. Such a step puts the one child back in the parent's
state through the optic of `each`. For a record by id, that is a copy of the record of children. A step that tells
every child something, a checkout told to each line, therefore copies the record once per child. The cost of the
step grows with the square of the number of children. The spike
[`many-children`](../../spikes/many-children.test.ts) times a message to every child on the runtime over SQLite. It
sees 103 ms at 1 000 children and 1.4 to 1.5 s at 4 000, where a step that changes one child takes 3.5 ms at 1 000.

effect-tea writes such a step with `forEach`: `forEach({ state }, state.rows, ({ id }) => children.Row.update(id,
Cleared()))`, one step per item, each made from the state the previous one left (the Guide, under Composition). Its
`each` gives an optic per id, so effect-tea copies the record once per child too.

## Decision

- **`forEach` tells a run of messages to children of one name by id at once.** An item whose step is the one
  `children.<child>.update(id, message)` returned joins the run before it, when that run is of the same child's name
  in the same step. Any other item ends the run. A run is told in order, and the children it changes are put back
  through the optic once. A step of the parent's own between two messages ends the run, and starts a new one after
  it.
- **The step is the one the messages told one after the other give.** The state, the events and the defects are the
  same, in the same order. A child's step is the one a single message gives, from the child's state as the messages
  before it in the run left it. Two messages to one id in a run reach the child one after the other.
- **A child that raises an event puts the run's children back before its parent handles it.** The handler of
  `onEvent` then reads the parent's state with every child told so far, as it would have one message after the other.
  A handler may change any child, drop one or add one, so the run lists the children again from the state the handler
  left, and goes on from there. A run therefore puts the children back once per child that raises an event, and once
  at its end.
- **A child that rejects the message, or is not there, is a defect,** as for a single message
  ([decision 0133](0133-an-entity-composes-children-as-effect-tea-does.md)).
- **Only `forEach` tells a run at once.** One `andThen` after the other, a `reduce` over the ids, or an item whose
  function wraps the handle's step in one of its own, puts the children back once per message, as before. The cart
  in [`examples/cart/cart.ts`](../../examples/cart/cart.ts) tells its checkout with `forEach`.

No form is added: the program writes what effect-tea's Guide writes, and the library makes it cost one replacement.

## What it rests on

- That a run told at once gives the step the messages told one after the other give. **Tested**, by the property
  test `a forEach of messages to children by id gives the step the messages told one after the other give` in
  [`src/composition.test.ts`](../../src/composition.test.ts). It compares the two on generated states and lists of
  messages, with steps of the parent's own among them, children that are not there, a child that rejects, events, a
  handler that drops a child and a handler that changes a child further in the run. Without the children put back
  before an event is handled, or without the children listed again after it, the test fails.
- That a run that raises no event puts the children back once. **Tested**, by
  `a forEach of messages to children by id that raise no event puts the children back once`, with an optic that
  counts its replacements: one through `forEach`, fifty through fifty `andThen`.
- That a handle's step is a function of the parent's state alone, so that making the steps of a run before taking
  the first one changes nothing. **Reasoned**: the handle is pure, as every piece of a program is, and it reads only
  the id and the message it was given.
- That putting back the final entries once gives the state that putting back the entries after each message
  gives. For the optic of a record by id, `key` composed with `entries`, a replacement sets the field to the record
  its entries make, whatever the field held before. **Read** in `node_modules/effect/src/Optic.ts`: `entries` is an `Iso` of
  `Object.entries` and `Object.fromEntries`, whose JSDoc states its round-trip laws, and `key` replaces the field. An
  optic a program writes by hand is **only reasoned**: one that kept something of the state it replaces would differ.
  The machine compares what is stored, so such an optic would store a different state, and raise no defect.
- That the run is worth it. **Seen** in the spike [`many-children`](../../spikes/many-children.test.ts), on
  2026-11-06: through `forEach`, a message to every child takes 5 ms at 1 000 children, 8.5 ms at 4 000 and 20 ms
  at 10 000, against 103 ms and 1.4 to 1.5 s through one `andThen` after the other.

## Effect's structures weighed

- **`Optic.modifyAll`** applies one function to every focus of a traversal. A child's step may raise events, which
  the parent handles between two children, and may be a defect. A function from a focus to a focus holds neither,
  and every message of a run is not the same.
- **`Optic.replace`** over the optic of `each` is what puts the children back, once per run.
- **`Record.set`, `Record.modify`, `Array.modify` and `Array.replace`** each copy the whole record or array, once per
  call: the cost this note removes.
- **`HashMap`**, persistent, with `Schema.HashMap` to store it, would replace one child without copying the others.
  A program's state would then hold a `HashMap` where it holds a record, in its schema, its `init`, its `onEvent` and
  its optic, and a state would no longer be what effect-tea's programs write. The cost is the library's, so the
  library pays it.
- **`MutableHashMap`**, to hold the children a run changed, is not needed. A run keeps each value replaced at its
  position in a copy of the listed entries, made at the first change. A position is a number, so neither `Equal`
  nor `Hash` is needed, and the copy is what the optic is given.
- **`Arr.reduce`**, as effect-tea's `forEach` folds its items. The fold here must hold a run back, and a loop says it
  with less.
- **`Effect.forEach`** runs effects. A step is pure, and runs no effect.

## Alternatives

- **A handle that tells every child at once**, `children.Line.updateAll(message)` or `updateEach(ids, message)`. It
  is explicit, and a program could not lose it by wrapping the handle's step. But it is a form effect-tea has not,
  for what effect-tea writes with `forEach`, and a program would have two ways to say one thing.
- **A state of children by id held in a `HashMap`.** See above.
- **Telling a run at once and handling the events at its end.** It puts the children back once whatever they raise.
  But a handler that changes another child would see it before that child took its message, unlike one message
  after the other.
- **Leaving it**, with the cost said in the design. A checkout of a cart with a few thousand lines would take seconds,
  under the entity's lock.

## Consequences

- `docs/design.md`, under Declaring children, says that `forEach` puts children back once.
- The open question of a message to every child by id leaves `docs/open-questions.md`.
