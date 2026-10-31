# 0020. A new program is checked against the work it finds stored

**Status:** accepted, 2026-10-30. That a restart or a resumption carries the program it activates with is replaced
by [decision 0064](0064-the-program-is-not-the-machines-state.md): an event is stepped by the program deployed, and a
resumption brings none.

## Context

An activation computed `durable(state)` and started each key in its stored incarnation. That holds while the
program is the one that stored the state. A deploy, or an operator resuming with a fixed program
([decision 0014](0014-rules-the-machine-settled.md)), activates the stored state with another program, and its
`durable` may differ. The machine then broke two promises:

- **A delivered key came back in its old incarnation.** Work under `charge` was delivered, and the key left,
  its incarnation kept. A new program that returns `charge` on the same state started it under the delivered
  work's idempotency key: a payment provider answers it as the first charge, and another entity with its stored
  reply ([decision 0009](0009-entities-talk-through-operations.md)).
- **An operation under way changed under the same key.** A new program that returns another amount for the
  `charge` under way restarted it with that amount, under the key of the first one. A step may not do this
  ([decision 0018](0018-operations-are-data.md)), and a deploy did it unchecked.

## Decision

- The runtime stores, with the state, the work it holds: `durable(state)` as the program that stored it
  computed it. Operations are data, so they can be stored and compared
  ([decision 0018](0018-operations-are-data.md)).
- An activation compares the new program's work with the stored one, by key, as a step compares the previous
  state's work with the next: work that is the same keeps its incarnation and restarts, and a key that is new,
  comes back or holds another timer is new work, in a new incarnation.
- A new program that changes or drops an operation stored as under way is a defect, as a step that does is
  ([decision 0005](0005-an-operation-leaves-only-by-completing.md)). The entity is suspended on its activation,
  with everything stored as it was, and waits for a program that keeps the operation.
- An event that activates (a restart, a resumption, a discard) changes what is stored at once or not at all: a
  discard whose activation is a defect discards nothing.
- A restart may bring a new program: it is how the machine models a deploy.

## Alternatives

- **A new incarnation for every key at every deploy.** A charge under way during a deploy would restart under a
  new key, and charge twice.
- **Only the incarnations of keys that left.** It closes the first hole and not the second, which needs the
  operation's value.
- **Letting a new program change an operation under way.** A deploy that fixes a bad amount would charge the
  fixed amount under the old key, or charge both. The operation started in the world; only its completion
  ends it.

## Consequences

- What runs is still what the state says: the stored work decides only which incarnation it runs in.
- A step reads the previous state's work from storage, and calls `durable` only on the next state.
- A deploy that changes an operation's value, its schema included, suspends every entity running one, until a
  program that keeps it resumes them. How a stored operation reads after its schema changes is open with
  [schemas that change](../open-questions.md#storage-and-reading).
- An idempotency key is never started for two operations, nor after its work is done. A stored reply is needed
  only while that work is stored, which decides how long other entities' replies are kept.
