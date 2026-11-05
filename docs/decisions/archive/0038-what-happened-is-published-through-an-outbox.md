# 0038. What happened is published through an outbox

**Status:** accepted, 2026-10-30. Its consequence that the entity's next step publishes the new projection is corrected
by [decision 0072](0072-the-log-shows-what-a-step-changed.md): it holds only for a step that changes it. Where the
rule is applied, and its cost, are changed by [decision 0057](0057-the-machine-gives-what-is-written.md): the machine
gives the row, and the projection of the state before a step is the one the step before computed. Its `seq`, one
sequence of the database, is changed by [decision 0137](../0137-the-log-is-ordered-within-a-partition.md):
a `seq` is within a partition of the log.

## Context

Other systems — a queue, an event store, another service — need to learn what an entity did, and the design had
nowhere for it. The state keeps only the present ([decision 0002](0002-store-the-state-not-the-messages.md)),
callers read the projection of one entity or query across them
([decision 0032](0032-a-projection-is-a-row.md)), and `send` reaches one entity, named
([decision 0009](0009-entities-talk-through-operations.md)): nothing leaves the entity for a reader it does not
know. Whether an outbox written in the step's transaction is the way, and what a consumer deduplicates by, was
an [open question](../../open-questions.md).

## Decision

- **A step publishes a row**, written in its own transaction, beside the row a query reads: the entity's
  address, the message the step handled, and what callers read of it after the step. A transaction that
  commits publishes; one that does not leaves nothing, as it leaves no step.
- **A row is written when what callers read changed.** The projection is already the public contract, so a step
  that changes the state without changing the projection publishes nothing. An entity's creation publishes its
  first projection, with no message: a creation is a request of its own, not a message
  ([decision 0012](0012-creation-is-a-request-of-its-own.md)).
- **The program declares nothing more.** The message names the fact (`ChargeSucceeded`) and has a schema, the
  projection has one ([decision 0025](0025-operations-and-projections-have-schemas.md)), and a row carries the
  version that wrote it, read through the migrations like every other row
  ([decision 0036](0036-a-migration-is-a-function-on-the-json.md)).
- **`seq` is what a consumer deduplicates by**: an integer of the database, rising with each row and never
  reused, so a consumer stores the one it reached and reads from it again. A cursor skips nothing because the
  runtime writes one transaction at a time — the SQLite client leases its one connection under a semaphore of
  one — so a row's `seq` is given and committed in the same order
  ([decision 0007](0007-one-process-first.md)).
- **The runtime writes the log and does not deliver it.** `published(after, limit)` reads from a cursor and
  `prune(through)` drops what every consumer has read. A consumer acts and then stores its cursor, which is
  delivery at least once; the transport, the retries and the acknowledgements are its own.

## Alternatives

- **A row for every step.** It publishes the entity's bookkeeping — a retry counted, a deadline moved — which
  no caller can read, and makes consumers filter what the projection already decides.
- **A declared union of published events**, apart from the messages. A program would write a third union and a
  function from the step to it, where the message it handled and the projection it left already say what
  happened.
- **The message without the projection.** A consumer would rebuild the entity's state from the messages to know
  anything, which is the event sourcing this design refused
  ([decision 0002](0002-store-the-state-not-the-messages.md)).
- **Delivering from the runtime** to a queue or an HTTP endpoint. The library would own a transport and a retry
  policy, which belong where the consumer is; the log is enough to write either.
- **A timestamp as the cursor.** Two rows may share a millisecond, and a clock moves backwards; a sequence does
  neither.

## Consequences

- A fact that changes nothing a caller can read is not published. Making it visible means putting it in the
  projection, which is what makes the projection the contract. The booking's inventory is the case in the
  flesh: a confirmation moves seats from held to sold, which leaves `available` where it was, so the inventory
  publishes the hold and not the sale ([`examples/booking`](../../../examples/booking)). An inventory whose sales
  must be published is one that shows them to callers.
- A `seq` is never given again, so a consumer's cursor still means what it meant after a `prune`. The outbox
  relies on it: a sequence that filled the holes a deletion left would hand a consumer a cursor beyond rows it
  never saw.
- A new version that changes `project` publishes nothing by itself: the rows already written hold what the
  version before showed, and the entity's next step publishes the new projection. `reindex` writes the read
  model again and publishes nothing — a deploy is not something an entity did.
- A rejected message, an internal message dropped, and a step that suspends the entity publish nothing: none of
  them changes the state.
- The log is where the history of an entity that never ends would be read from — a subscription's past invoices
  — for as long as it is kept. What keeps it, with more than one consumer, is an
  [open question](../../open-questions.md).
- The cursor rests on writes being serialized, not on the entities being few: two transactions that write at
  once could commit a higher `seq` before a lower one, and a consumer reading in between would step over the
  row still in flight. A store that allows that, or a cluster, needs more than a sequence: an
  [open question](../../open-questions.md).
- Publishing costs one projection more per step that changes the state: the one the state before gave, encoded
  and compared with the one after. Two projections are the same when they are written the same, so a schema
  that encodes equal values differently publishes a row that says nothing new, and never misses one.
