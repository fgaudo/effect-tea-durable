# 0044. A timer's firing is not discarded

**Status:** accepted, 2026-10-31. Replaces the bullet of [decision 0041](0041-a-completion-is-not-discarded.md)
that discards a timer's firing, and what [decision 0014](0014-rules-the-machine-settled.md) said of discarding an
internal message. How a fixed program is brought is changed by
[decision 0064](0064-the-program-is-not-the-machines-state.md): it is deployed, and `Resume` takes no program.

## Context

Decision 0041 kept discarding a timer's firing, since a timer "does nothing until its message is handled": the
firing was dropped, and the timer armed again in a new incarnation if the state still returned its key.

It always does. `update` died on the firing, so the state is the one before it, and `durable` returns the same
timer, at the same time, which has passed. Armed again, it fires at once, and a pure `update` dies on the same
message. A discard got no entity past a firing: it only spent an incarnation.

## Decision

- **A timer's firing is not discarded**, as an operation's completion is not. `Discard` on an entity suspended on
  one changes nothing: the entity stays suspended, with the firing at the head of its mailbox.
- **What gets the entity past it is a program that handles it**, brought with `Resume`, as for a completion.
- **`Discard` drops an inbound message only**, storing no reply, as before.

## Alternatives

- **Arming the discarded timer again only at a time to come.** The machine would hold a timer at a time the state
  does not say, against what runs being what the state says
  ([decision 0003](0003-durable-work-derived-from-state.md)): an activation, which computes `durable(state)`, would
  arm it at the old time and fire it at once. And at that time to come, unless an inbound message changed the state
  meanwhile — which a suspended entity takes none of — the same `update` dies on the same message.
- **Dropping the timer for good** while the state still returns it: the state would hold work nothing runs.

## Consequences

- Every internal message an entity dies on waits for a fixed program; an operator discards only a caller's
  message. That a runtime's `discard` gives nothing back for the rest stays open, with how an operator sees a
  suspended entity ([open questions](../../open-questions.md#running)).
- The machine's tests resume with a fixed version where they discarded a firing, and check that a discard leaves
  an entity suspended on one as it was.
