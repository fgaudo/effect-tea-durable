# 0074. A message that finds the mailbox empty is handled as it arrives

**Status:** accepted, 2026-10-31. Decides [a mailbox under a burst](../../open-questions.md#storage-and-reading), and
takes the alternative [decision 0071](0071-a-process-starts-the-entities-with-a-message.md) left, which that
decision still holds beside. It does not hold on Cluster, as
[decision 0081](0081-on-cluster-a-step-commits-with-its-reply.md) says. A burst is bounded since
[decision 0147](0147-an-entity-holds-a-bounded-number-of-callers-messages.md): an entity holds a bounded number of callers' messages, and a `send` past it is
answered `Full`.

## Context

An inbound message was two transactions: its `Receive`, which wrote it to the mailbox, and the `Handle` that
stepped it and took it out again. The entity's loop takes an offered event only once its mailbox is empty, so every
inbound message the runtime received was written to a mailbox with nothing ahead of it, and deleted by the next
transaction: a row inserted and deleted, and a commit, for each message, for nothing a crash table needs. A crash
between the two left a message that only decision 0071 had a process find.

The open question also asked whether a burst should be refused past a bound, since the machine holds the whole
mailbox in memory. But a burst never reaches the mailbox: while the entity handles a message, the others wait in
the loop's queue of offered events, in memory, each the event of a caller that waits for its answer. What the
machine holds is the messages its own work recorded, which the loop handles before it takes another event.

## Decision

- **A `Receive` that finds the mailbox empty, the entity not suspended and no reply stored under its request is
  handled in the same event**, at the time it carries, and writes no row of the mailbox: one transaction. One that
  finds a message ahead of it is queued behind it, as before. `Receive` carries `at`, which the runtime reads with
  the stored reply just before the step; an `Offered` receive carries neither.
- **The runtime bounds no burst.** The callers waiting for an entity wait in memory, unstored; a crash drops what
  they offered, and they retry as after any crash before a commit. How many callers a process accepts is the
  server's in front of it, which holds a fiber for each of them already.

## Alternatives

- **The runtime composing a `Receive` and a `Handle`** into one transaction, the machine unchanged. What is
  written would be the runtime's, worked out from two transitions, where the machine gives what an event writes
  ([decision 0057](0057-the-machine-gives-what-is-written.md)).
- **A bound past which a caller is refused**, answered something like `Suspended` that is not stored. Every caller
  and every operation's `send` would handle one more answer, retried on a clock, to bound what the process holds
  for a caller it has accepted anyway: one event and one deferred.

## Consequences

- In this runtime an inbound message is never written to the mailbox: a defect it dies on leaves it there, the
  message the suspension is on, as before.
- A process still starts the entities whose mailbox holds a message
  ([decision 0071](0071-a-process-starts-the-entities-with-a-message.md)): a completion or a firing recorded and
  not handled, and a message a store kept from before this decision.
- [`src/machine.test.ts`](../../../src/machine.test.ts) answers a message given no reply in its `Receive`, and queues
  one behind a completion.
