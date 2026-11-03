# 0013. The runtime's semantics are a pure machine

**Status:** accepted, 2026-10-30. The stored replies it has the machine hold are taken out of it by
[decision 0065](0065-the-machine-holds-no-replies.md).

## Context

The design says what survives each crash in a table, in prose. The runtime on SQLite, `rehearse` and the
runtime's tests must all agree with that table, and three readings of prose would not.

## Decision

The semantics are a pure function, `step(machine, event)`, in [`src/machine.ts`](../../../src/machine.ts). It gives
the next machine, and the outputs a runtime acts on: an operation to start with its idempotency key, a timer to
arm or disarm, a reply to send, a suspension.

- The machine holds what is **stored** (the state, the incarnations, the mailbox, the stored replies, the
  suspension) apart from what is **running** (the operations started and the timers armed), which a crash loses.
- Its events are a message arriving, an operation completing or dying, a timer firing, the mailbox's first
  message handled, the process dying, and an operator resuming the entity or discarding its message. Each event
  changes what is stored at once or not at all: it is one transaction.
- A completion or a firing is recorded in the mailbox first, then handled, so that a crash between the two is
  an event sequence like any other.
- `rehearse` is this machine, with the mailbox handled to its end after each act of the test.

The examples import the library from `src/`, and their scenarios are tests: the imagined API of
`examples/api.ts` is gone.

## Alternatives

- **The runtime first, then tests.** Its tests would check it against the prose, and `rehearse` would be a
  second implementation that could disagree with it.
- **An effectful machine, with a clock and fibers.** Property tests would be slower and harder to reproduce, and
  the runtime would inherit choices (how work runs) that belong to it.

## Consequences

- [`src/machine.test.ts`](../../../src/machine.test.ts) checks the design's guarantees with properties, under
  random sequences of events, crashes included, and the checks of a step with a test each. Each of the
  machine's rules has a test that fails without it.
- The runtime on SQLite (the next step of the [roadmap](../../roadmap.md)) interprets the outputs, and its tests
  compare where it ends with where the machine ends.
- The rules the machine had to settle are in [decision 0014](0014-rules-the-machine-settled.md).
