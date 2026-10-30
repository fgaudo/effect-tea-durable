# 0005. An operation leaves the state only through its completion

**Status:** accepted, 2026-10-30.

## Context

In effect-tea, a subscription whose key leaves the state is interrupted. On a server an operation acts on the
world: interrupted after the warehouse was told, the order is cancelled but the parcel ships. Removing the key
does not undo what the operation did.

## Decision

A step whose next state drops the key of an operation still running is a defect, checked by the runtime. A
program that wants to stop something waits for its completion, then acts on it: a cancellation during a payment
is rejected, or remembered and applied once the payment ends.

Timers may be dropped in any state, since they have done nothing yet.

## Alternatives

- **Interrupting the operation.** Its effect may already be done, and its completion would be lost.
- **Letting it run and dropping its completion.** The state would no longer know what the world holds.

## Consequences

- The rule is the Guide's ("an operation is a state only its completion leaves"), enforced instead of
  advised.
- Work with no effect on the world, that may be abandoned (a long computation), has no kind of its own yet
  ([open questions](../open-questions.md)).
