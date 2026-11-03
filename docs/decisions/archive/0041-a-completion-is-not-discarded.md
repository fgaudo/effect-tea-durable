# 0041. A completion is not discarded

**Status:** accepted, 2026-10-30. Replaces what [decision 0014](0014-rules-the-machine-settled.md) and
[decision 0008](0008-delivered-work-is-done.md) said of discarding an internal message, for an operation's
completion. Its bullet that discards a timer's firing is replaced by [decision 0044](0044-a-firing-is-not-discarded.md). How a fixed program is brought is changed by
[decision 0064](0064-the-program-is-not-the-machines-state.md): it is deployed, and `Resume` takes no program. What a
`discard` that drops nothing answers is added by [decision
0114](../0114-an-operator-sees-the-suspended-entities-and-what-a-resume-did.md).

## Context

An operator discards the message a suspended entity died on, and the entity goes on
([decision 0006](0006-a-defect-suspends-the-entity.md)). Decision 0014 had a discarded internal message end its
work, which starts again in a new incarnation if the state still returns its key, since "that work never ran".

That holds of a timer, which does nothing until its message is handled. It does not hold of an operation: its
completion is in the mailbox because it ran, and acted. And the case is the common one: `update` dies on the
completion, so the state is the one before it, which still holds the operation. Discarding then started it
again under a new idempotency key — a payment provider charged a second time, and an at-most-once operation
acted twice, against [decision 0011](0011-an-operation-declares-what-a-crash-does.md).

## Decision

- **An operation's completion, its `unknown` included, is not discarded.** `Discard` on an entity suspended on
  one changes nothing: the entity stays suspended, with the completion at the head of its mailbox.
- **What gets the entity past it is a program that handles it**, brought with `Resume`: the completion is
  handled as it was recorded, and the operation's work ends in its own incarnation.
- An inbound message and a timer's firing are discarded as before: an inbound message stores no reply, and a
  timer whose key the state still returns is armed again, in a new incarnation.

## Alternatives

- **Discarding it and keeping the operation done**, while the state still holds it. The state would say an
  operation is under way that nothing runs, and every activation computes the work from the state
  ([decision 0003](0003-durable-work-derived-from-state.md)).
- **Running it again in the same incarnation**, under the same idempotency key. An idempotent operation would
  get the same answer and die again; an at-most-once one would act twice.
- **Discarding it with a message the operator writes.** It is a second `update`, by hand, outside the program.

## Consequences

- An operator learns that a discard did nothing from the entity, which is still suspended: the runtime's
  `discard` gives nothing back.
- An entity whose program dies on a completion waits for a fixed program. [Open
  questions](../../open-questions.md#running) already asked how an operator sees and resumes a suspended entity.
- The machine's tests resume with a version fixed to handle the completion it died on, where they discarded it.
