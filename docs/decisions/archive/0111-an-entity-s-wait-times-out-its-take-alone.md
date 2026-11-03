# 0111. An entity's wait times out its take alone

**Status:** accepted, 2026-11-01. Adds a rule to the wait of [decision 0029](0029-an-idle-entity-is-unloaded.md), and
changes what decision 0107 says of the take a timeout interrupts: Effect
promises it, under a condition. Closes its [open question](../../open-questions.md#running).

## Context

An entity waits for its next event with `Effect.timeoutOption(Queue.take(events), …)`, and is unloaded when the time
runs out ([decision 0029](0029-an-idle-entity-is-unloaded.md)). That an event offered as the time runs out is never
lost was seen in `spikes/effect-queue-take-timeout.test.ts`, and not promised by Effect's documentation
(decision 0107). The question was asked in
[Effect's Discord](https://discord.com/channels/795981131316985866/1566436021133119649), and a maintainer of Effect
answered: "It is guaranteed if you only timeout that single op."

The condition matters. A timeout around a larger effect can fire once the take inside it has its item and before the
effect ends: the item is taken, the effect is interrupted, and the item is lost. The runtime's wait times out the take
alone, but nothing held it to that.

## Decision

- **The timeout of an entity's wait wraps the take alone.** No step runs between the take and the timeout's end: what
  the wait does with the event comes after `timeoutOption`, as the code does now.
- **The premise of 0029's wait is confirmed by Effect's maintainers**, under that condition. It is not in the
  documentation, so it is not **documented** in the sense of
  decision 0108; the spike stays,
  and tells if a release breaks it.

## What it rests on

- That Effect keeps an item offered as a timeout of the take alone fires: **confirmed** by a maintainer of Effect in its
  Discord, 2026-11-01, and **seen**, `spikes/effect-queue-take-timeout.test.ts`.
- That a step after the take inside the timeout loses an event: **tested**, by `a message that arrives as the wait of
  its entity runs out is handled, under prioritized schedules`, in [`src/runtime.test.ts`](../../../src/runtime.test.ts).
  With a `yieldNow` after the take inside the timeout, 21 seeds of 2,000 do not end: the caller waits for ever. Without
  it, none fails.

## Alternatives

- **A guard of the runtime's**, reading the queue again under the entity's lock before it unloads, which the open
  question proposed. It would hold whatever Effect does, at the cost of a mechanism whose case Effect now promises
  not to reach.
- **A pull request to Effect's documentation of `take`**, which would make the premise **documented**. It is Effect's
  to take; this note does not wait for it.

## Consequences

- [`src/runtime.ts`](../../../src/runtime.ts) says at the wait that the timeout wraps the take alone, and why.
- The open question leaves `docs/open-questions.md`.
