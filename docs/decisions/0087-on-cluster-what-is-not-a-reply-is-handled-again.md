# 0087. On Cluster, what is not a reply is handled again

**Status:** accepted, 2026-10-31. Decides the [roadmap](../roadmap.md)'s finding on what Cluster stores that is not
a reply; changes what [decision 0081](0081-on-cluster-a-step-commits-with-its-reply.md) and
[decision 0086](0086-on-cluster-a-request-is-keyed-by-its-version-too.md) say of a stored answer, and says how
[decision 0006](0006-a-defect-suspends-the-entity.md) and [decision 0023](0023-suspended-means-no-reply-yet.md)
hold on Cluster. What a resumption and a discard do on Cluster is corrected by
[decision 0088](0088-on-cluster-the-message-an-entity-dies-on-stays-in-its-mailbox.md).

## Context

On Cluster, everything a step answers is a success of the RPC, which Cluster stores under the request's key
(decision 0081), and a retry within a version is answered from it (decision 0086). Two answers are not replies.
`Suspended` says that the request has none yet, and a retry once the entity is resumed is handled as a new message
(decision 0023). `NotFound` is answered for an entity with nothing stored, and stored nowhere: a retry once the
entity is created reaches it. Stored by Cluster, either is the answer to every retry within the version, for ever.

And Cluster marks the message it delivers processed once the step has answered it. On one process the message an
entity dies on stays in the mailbox, and a resumption handles it again (decision 0006), where on Cluster nothing
would deliver it again. Entities are never deleted, so `AlreadyExists` stays true once answered, and is a reply.

Cluster's `Sharding.reset` (its storage's `clearReplies`) deletes a request's reply and marks the request
unprocessed, so that it is delivered again; given the id of the reply expected, it does so only while that reply is
still the latest. A spike checked this against `effect` 4.1.1, with `SingleRunner` on `@effect/sql-sqlite-bun`, an
entity whose persisted RPCs run under `WithTransaction`:

- a request answered `Suspended`, reset with the id of that answer and sent again, is handled again at once: while
  the entity is suspended it is answered `Suspended` once more, and once it is resumed it is applied;
- two retries at once, each reading the same `Suspended` and resetting it, are both answered the one reply, and the
  handler runs once: the second reset finds its reply no longer the latest, and does nothing;
- a resumption that clears the reply of the message the entity died on, in its own transaction, has the message
  delivered again without its caller: by Cluster's next read of storage, 10 s later, or at once after
  `Sharding.pollStorage`.

## Decision

- **A request answered `Suspended` or `NotFound` is handled again when it is sent again.** The runtime's client
  that receives either from Cluster reads the id of that answer, resets the request with it as the reply expected,
  and sends the request again, whose answer it gives. A step that answers either changes nothing of the entity, but
  for a suspension it stores when the program dies in it.
- **A suspension on a message holds the Cluster request id of the message**, written with it in the step's
  transaction. A resumption clears that request's reply in its own transaction, and calls `Sharding.pollStorage`
  once it commits, so that the message is delivered again at once. A discard clears nothing: the message's caller
  gets its request handled again by sending it again, as on one process.
- **A resumption and a discard run as steps of the entity**, under `WithTransaction` on the runner that holds its
  shard ([decision 0084](0084-a-step-commits-only-where-the-commit-checks-the-shard.md)). Cluster delivers an
  entity's messages one at a time, so no step of the message it died on runs beside them; and while the suspension
  holds, every answer to that request is `Suspended`, so the reply a resumption clears is never one the program
  gave.

## Alternatives

- **A rejection of the RPC for what is not a reply.** Cluster stores a failure too, after rolling the step back,
  which would lose the suspension the step stored.
- **A step that waits, without answering, until the entity is resumed.** It holds its transaction open while it
  waits, and on SQLite, where the runtime on Cluster runs (decision 0084), the transaction is the file's one writer.
- **A resumption that puts back every request answered `Suspended`.** It would apply messages a caller sent while
  the entity was suspended without the caller sending them again, which decision 0023 does not; and the message a
  discard drops would stay answered `Suspended` for ever, since nothing in Cluster deletes a reply without
  delivering the request again.
- **The client checking the entity before it sends**, and answering `NotFound` or `Suspended` itself. An entity
  created, suspended or resumed between the check and the step leaves the step to answer it anyway.

## Consequences

- On Cluster, the messages waiting when the entity suspends are each answered `Suspended`, and are not kept, where
  on one process they stay queued (decision 0023). What decision 0023 tells a caller holds: `Suspended` says nothing
  of whether the message is queued, and a retry under the same request id gets the reply once the entity is resumed.
- After a resumption, the message the entity died on is no longer the first handled: a message sent meanwhile may
  be handled before Cluster delivers it again. A caller has no reply to that message, so nothing it sent after it
  waited for it, and messages of different callers have no order between them.
- A request answered `Suspended` or `NotFound` costs two steps, its first sending included: Cluster's client gives
  a stored answer and a new one alike, so the client resets either, once for each sending, and the second step
  answers as the entity is then. An operation that sends to a suspended entity waits by retrying; how it learns of the resumption, without
  polling it ([decision 0063](0063-the-runtime-waits-for-what-it-waits-for.md)), is what stays the runtime's, the
  [roadmap](../roadmap.md)'s next finding.
- The reset is a write to Cluster's tables from whatever runner the client runs on, outside the shard's lock. It
  clears only an answer whose id the client read, which is no reply, and only makes the request delivered again to
  the runner that holds the shard.
- Nothing of this is code yet: the runtime on Cluster is a later step of the [roadmap](../roadmap.md).
