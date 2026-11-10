# 0240. A step that tells many children is written with forEach, and andThen stays a step taken at once

**Status:** accepted, 2026-11-10. Decides the open question of a chain of `andThen` over many children. Changes
[decision 0155](archive/0155-a-foreach-of-messages-to-children-puts-them-back-once.md), whose rule that only
`forEach` tells a run at once the guide and the doc comment of `andThen` now say to the author of a program.

## Context

`forEach` tells a run of messages to children of one name by id at once, and puts the children back in the
parent's state once (decision 0155). A step written as one `andThen` after the other gives the same state, the same
events and the same defects. It puts the children back once per message, a copy of the record of children each
time. The spike [`many-children`](../../spikes/many-children.test.ts) saw 103 to 111 ms for a message to each of
1 000 children by `andThen`, against 4 to 5 ms by `forEach`, and 1.4 to 1.5 s at 4 000. Nothing told the author of
such a program that the step is slow.

The question named two criteria. The first is whether `andThen` can find a run of messages to children without
changing the step it gives. The second is whether a program has a reason to chain the messages by hand, where
`forEach` would not serve.

`andThen(step, next)` returns the step itself: the state, or the state with its events. It calls `next` at once, on
the state of `step`. `forEach` can join a run because it holds every item before it gives a step, and makes the
steps of the run before it takes the first (decision 0155).

## Decision

- **`andThen` stays a step taken at once.** A chain cannot join a run of messages without changing what each
  `andThen` returns. Each `andThen` of a chain returns a state, and the next `andThen` receives that state. To put
  the children back once, the earlier `andThen` would have to return a step not yet made, which is no state of the
  program, or the later one would have to change in place a state already returned to the program. The first is a
  new kind of step, which a program reading the state of its step would see. The second breaks the purity a program
  relies on, since a program may keep a step and read it after making the next.
- **A step that tells many children is written with `forEach`.** The doc comment of `andThen` and `docs/design.md`,
  under Declaring children, say so. A program that tells the children over the ids writes
  `forEach(state, ids, (id) => children.Line.update(id, message))`.
- **A chain that a program makes by hand is told through `forEach` with the identity.** A program that builds its
  list of steps first, with steps of its own among them, writes `forEach(state, steps, (step) => step)`. `forEach`
  finds a handle's step by the function the handle returned, whatever made the list, so the run is joined as over
  the ids. So no program has a reason to chain many messages with `andThen` where `forEach` does not serve, and the
  question needs no program that tells many children one message at a time to be decided.
- **No warning is logged for a chain.** `andThen` cannot tell a chain of many from a chain of two, since each call
  sees one step. A count across calls would be state outside the step, which a pure function does not hold.

## What it rests on

- That `andThen` gives its state at once, and that a program reads the state of a step. **Read** in
  [`src/program.ts`](../../src/program.ts): `andThen` calls `next` on the state of its first step and returns
  `stepOf` of the result. The type `Step<State, Event>` is the state, or the state with its events, so a step not yet
  made would be a new member of that union. That a program keeps and reads the steps it chains is **only reasoned**:
  nothing in the library forbids it.
- That `forEach` over the steps already made, with the identity, joins a run as `forEach` over the ids does.
  **Tested**, by `a forEach of messages to children by id gives the step the messages told one after the other give`
  and `a forEach of messages to children by id that raise no event puts the children back once` in
  [`src/composition.test.ts`](../../src/composition.test.ts). Both now tell the list a third way, as steps made first
  and told through `forEach` with the identity: the step is the one of `andThen`, and the children are put back
  once.
- That the chain is worth telling the author about. **Seen** in the spike
  [`many-children`](../../spikes/many-children.test.ts), on 2026-11-06, as decision 0155 records.

## Alternatives

- **An `andThen` that defers its step**, a value that holds the chain and is made when the machine reads it. A
  program that reads its step's state, in a test or between two steps, would read something else, and the type of a
  step would grow a member every handler of a parent must accept.
- **An `andThen` that changes the record of children in place** when its first step came from a handle of the same
  name. It gives the right final state, and changes a state the program already holds, which no piece of a program
  expects.
- **A warning past a number of `andThen` in one step.** It needs a count across calls, which `andThen` has no place
  to keep, and the runtime does not see the chain, only its result.

## Consequences

- The doc comment of `andThen` and `docs/design.md`, under Declaring children, say to write a step that tells many
  children with `forEach`.
- The open question of a chain of `andThen` over many children leaves `docs/open-questions.md`.
