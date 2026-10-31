# 0071. A process starts the entities whose mailbox holds a message

**Status:** accepted, 2026-10-31. Decides [messages a crash left in a mailbox](../open-questions.md#running), and
adds to what [decision 0029](0029-an-idle-entity-is-unloaded.md) has a process start with. The alternative it rejects, a
`Receive` and its step in one transaction, is taken by
[decision 0074](0074-a-message-that-finds-the-mailbox-empty-is-handled-as-it-arrives.md) for a message that finds the
mailbox empty: a crash no longer leaves an inbound message in a mailbox, and what a process starts for is a
completion or a firing recorded and not handled, or a message stored before that decision.

## Context

An inbound message is two transactions: its `Receive`, which stores it in the mailbox, and the step that handles
it. A crash between them left it in the mailbox of an entity that a process started only if its state held an
operation ([decision 0029](0029-an-idle-entity-is-unloaded.md)). An entity with no operation and no timer due was
never loaded again on its own: the message waited for a caller to load the entity, and was handled at whatever
time that was, under whatever its state was by then. `settled` did not wait for it either.

## Decision

- **A process starts with the entities whose mailbox holds a message**, beside those whose state holds an
  operation. Storage's `interrupted` gives both. An activation is a `Restart`, and an entity whose mailbox holds a
  message handles it at once: nothing else is needed.
- **A suspended entity is left out**, as it is of the operations: it is unloaded with the message it died on,
  which an operator resumes or discards ([decision 0006](0006-a-defect-suspends-the-entity.md)).

## Alternatives

- **The `Receive` and the step in one transaction** for a message that finds the entity idle, which the open
  question of [a mailbox under a burst](../open-questions.md#storage-and-reading) asks about. It would make the
  crash in between impossible for that message, not for one queued behind another, which waits in the mailbox for
  its turn and is left there by a crash all the same.
- **Leaving it to the sender's retry.** An operation of another entity sends again once its own process starts
  it, but a caller that crashed with the process may never retry, and its message is then handled by chance.

## Consequences

- [`src/storage.ts`](../../src/storage.ts) reads `interrupted` from the keys and from the mailbox, a union of two
  readings by the program's name.
- [`src/runtime.test.ts`](../../src/runtime.test.ts) crashes a process between a message's `Receive` and its step,
  for an entity with nothing under way, and checks that the next process handles it with no caller retrying. Run
  before this decision, the message was still in the mailbox.
- A process starts every entity a crash left a message to: as many as there were messages between their arrival
  and their step when it crashed.
