# 0096. Cluster stores an answer no step gave, for a type not registered

**Status:** accepted, 2026-10-31. Corrects the rule of
[decision 0091](0091-on-cluster-an-interrupted-caller-leaves-its-request-alone.md) that every answer Cluster stores
for an entity is a step's, and what [decision 0090](0090-on-cluster-a-reply-is-deleted-as-on-one-process.md) rests on
of it. Found by the first review
([decision 0094](0094-the-notes-are-reviewed-every-fifteen-by-a-reader-that-did-not-write-them.md)). Who keeps the id is
decided, and a request that does not decode or whose delivery died is found to be answered with Cluster's defect too,
by [decision 0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md).

## Context

Decision 0091 annotates the runtime's RPCs so that a caller that stops waiting stores nothing, and concludes that
every answer Cluster stores for an entity is a step's. Decision 0090 relies on it: the runtime keeps the Cluster id of
every request an entity's operation sends, and it is the step that answers the request that keeps it, so that every
id with rows to delete is kept.

[Decision 0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md), proposed, found one answer
that is not a step's: a message to a type that its shard's runner has not registered once its registration window
ends is stored, and that runner saves a defect as its reply. A retry under the same key is given the defect.
0092 has the client reset such a request and send it again, so that a step answers it in the end.

Until it does, the request's rows sit in `cluster_messages` and `cluster_replies` under an id no step has kept. If
the asker's work ends before a step answers — an at-most-once operation whose process dies, and whose work ends
with `unknown` — nothing keeps the id, and nothing deletes the rows.

A defect of a receiver that escapes the runtime is not such an answer: it restarts the entity, and is not saved
([decision 0095](0095-cluster-restarts-an-entity-after-a-defect-whatever-its-policy.md)). 0092 counts it among the
defects Cluster saves; that is for its step to correct.

## Decision

- **Every answer Cluster stores for an entity is a step's, or a defect for a type its runner did not register.** The
  rule of decision 0091 holds of every answer of a runner that registered the type.
- **Decision 0090 keeps every id with rows to delete only once a step has answered it.** A request answered with
  Cluster's defect, whose asker's work ends before a step answers it, keeps its rows. Which step keeps the id of such
  a request — the client that reads the defect, or the step of the asker that ends its work — is decided with the
  rest of what a defect from Cluster does, in decision 0092's step.

## What it rests on

- Cluster saves a defect for a type not registered on the shard's runner: **read in the source** and **seen**, in
  decision 0092's study and spike at 4.1.1.
- No other answer is stored for an entity of the runtime's: **reasoned**, from decision 0091 and from what decision
  0095 reads of a handler's defect. That Cluster's other refusals — a full mailbox, a runner that does not hold the
  shard — are given to the caller and not stored is **reasoned** too: the review read no source for them, and no
  spike tried them. Decision 0092's step checks them.

## Alternatives

- **Leaving the rule as decision 0091 says it.** The note would read as complete, and decision 0092's step would
  not know that 0090 leaves rows behind for its case.
- **Deciding here which step keeps the id.** It depends on how the client resets a defect, which is 0092's to
  decide while its step is under way.

## Consequences

- Decision 0092 decides, before its step is taken, how the id of a request answered with Cluster's defect is kept,
  and corrects what it says of a receiver's defect.
- The leak is bounded: one request per operation whose work ends with `unknown` while its request held Cluster's
  defect.
