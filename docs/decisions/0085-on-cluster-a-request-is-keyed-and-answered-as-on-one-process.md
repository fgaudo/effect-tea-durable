# 0085. On Cluster, a request is keyed and answered as on one process

**Status:** proposed, for the Effect Cluster step of the [roadmap](../roadmap.md); rewritten in place while the step
is under way. Holds what decisions 0085 to 0088 (0086 to 0088 deleted; git keeps them) decided on 2026-10-31, each correcting the one before, as one note:
how [decision 0015](archive/0015-a-request-belongs-to-its-sender.md),
[0017](archive/0017-creation-in-the-machine.md), [0006](archive/0006-a-defect-suspends-the-entity.md) and
[0023](archive/0023-suspended-means-no-reply-yet.md) hold on
[Effect Cluster](../cluster.md#what-cluster-gives-that-the-runtime-already-does). Changes what
[decision 0081](0081-on-cluster-a-step-commits-with-its-reply.md) says of a stored answer and of the runtime's
mailbox there. What an entity's own work delivers, and how the step of an RPC gets its answer from a message
queued behind it, are [decision 0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md)'s.

## Context

Cluster deduplicates a persisted request only when its payload implements `PrimaryKey`, under
`entityType/entityId/tag/id`, where `id` is the payload's primary key: global to the receiver, with no sender in it.
A key over 255 characters is stored as its SHA-256. A request found stored is answered from its reply before any
handler runs. The machine stores a request under its `requestKey`, the request's JSON as text, which holds its
sender: a caller's sender as the program's schema writes it
([decision 0048](archive/0048-a-callers-request-belongs-to-its-sender.md)), or the entity, key, incarnation and name
of another entity's operation ([decision 0059](archive/0059-a-request-is-a-value.md)). A creation and a message under
one request id are answered apart ([decision 0050](archive/0050-a-creation-is-answered-apart-from-a-message.md)).

Within a version a text is one request; across versions it is not. A migration of the sender that gives one
caller's old JSON to another, a rename or a swap, gives the second caller's request at the new version the text of
the first one's at the old. Keyed by the text alone, Cluster would find the first one's row and answer the second
caller with the first one's reply, before the step runs: the hole
[decision 0069](archive/0069-a-reply-is-keyed-by-the-version-that-wrote-it.md) closed for the runtime's replies,
open again in Cluster's, where the reply is not even read through the migration. And on Cluster, Cluster's mailbox
is the entity's (decision 0081): a message stored before a deploy is handled after it, by the new version, where on
one process it is stored with the version that wrote it and read through the migrations
([decision 0036](archive/0036-a-migration-is-a-function-on-the-json.md)).

Everything a step answers is a success of the RPC, which Cluster stores under the request's key (decision 0081).
Two answers are not replies. `Suspended` says that the request has none yet, and a retry once the entity is resumed
is handled as a new message (decision 0023). `NotFound` is answered for an entity with nothing stored, and stored
nowhere: a retry once the entity is created reaches it. Stored by Cluster, either would answer every retry within
the version, for ever. Entities are never deleted, so `AlreadyExists` stays true once answered, and is a reply.
Cluster's `Sharding.reset`, its storage's `clearReplies`, deletes a request's reply and marks the request
unprocessed, so that it is delivered again; given the id of the reply expected, it does so only while that reply is
still the latest.

Cluster marks the message it delivers processed once the step has answered it. But the machine suspends with the
mailbox as it was, the message included (decision 0006): a message that finds the mailbox empty is handled as it
arrives and never written
([decision 0074](archive/0074-a-message-that-finds-the-mailbox-empty-is-handled-as-it-arrives.md)), unless the
program dies on it, and then the step writes it to the mailbox with the suspension. The storage writes what the
machine gives, and decides nothing ([decision 0057](archive/0057-the-machine-gives-what-is-written.md)).

Spikes at `effect` 4.1.1, with `SingleRunner` on `@effect/sql-sqlite-bun` and an entity whose persisted RPCs run
under `WithTransaction`, saw:

- two callers with one request id, and two entities of different programs with the same id and key, are each two
  requests; the same request sent again is answered from the stored reply, and the handler does not run; a request
  sent as a creation and as a message is two requests, apart by the tag; a key over 255 characters is stored under
  its SHA-256 and deduplicated; the same caller and request id with the sender written otherwise is a new request;
- a request answered `Suspended`, reset with the id of that answer and sent again, is handled again at once: while
  the entity is suspended it is answered `Suspended` once more, and once it is resumed it is applied; two retries
  at once, each reading the same `Suspended` and resetting it, are both answered the one reply, and the handler
  runs once, since the second reset finds its reply no longer the latest.

## Decision

- **The primary key of an entity's payload on Cluster is the version that keyed the request, and its
  `requestKey`.** Cluster keys it under the receiver's address and the RPC's tag, so a request is deduplicated under
  its receiver, its kind, its sender and its version, and two versions never share a key in Cluster's table, as they
  never share a row in the runtime's.
- **A program has one RPC for a creation and one for its messages**, whatever the message: the machine deduplicates
  a message by its request alone, and so does Cluster then. A payload is the version that wrote it, the request and
  the message, as JSON; Cluster's schema of it decodes JSON alone, and the runtime reads the request and the message
  through the migrations, as it reads its own mailbox. The runtime's client builds every payload, and fills an
  operation's sender in (decision 0015): Cluster's RPCs, like the runtime's tables, are inside its boundary.
- **Cluster answers a retry within a version; the runtime's replies answer one across versions.** A retry after a
  deploy is a new request to Cluster, whatever migrated, and its step finds the reply in the runtime's table, by its
  text at any version and then by its request id, read through the migrations
  ([decision 0065](archive/0065-the-machine-holds-no-replies.md), decision 0069). So the runtime keeps its replies
  on Cluster as [decision 0021](archive/0021-a-reply-is-kept-while-the-work-that-asked-holds.md) keeps them, and
  what deletes Cluster's is decided with them
  ([decision 0090](0090-on-cluster-a-reply-is-deleted-as-on-one-process.md)).
- **A request answered `Suspended` or `NotFound` is handled again when it is sent again.** The runtime's client
  that receives either from Cluster reads the id of that answer, resets the request with it as the reply expected,
  and sends the request again, whose answer it gives. A step that answers either changes nothing of the entity, but
  for a suspension it stores when the program dies in it.
- **The message an entity dies on stays in the runtime's mailbox**, written with the suspension, and a resumption
  and a discard are the machine's, as on one process: a resumption handles it first, a discard drops it. A
  suspension holds no Cluster request id, and a resumption resets nothing in Cluster's storage. A retry of that
  message once the entity is resumed is reset by the client and handled again, and its step answers it from the
  reply the resumption stored; once it is discarded, it is handled as a new message.
- **A resumption and a discard run as steps of the entity**, under `WithTransaction` on the runner that holds its
  shard ([decision 0084](0084-a-step-commits-only-where-the-commit-checks-the-shard.md)). Cluster delivers an
  entity's messages one at a time, so no step of the message it died on runs beside them; and while the suspension
  holds, every answer to that request is `Suspended`, so the reply a client resets is never one the program gave.

## What it rests on

- Cluster's primary key, its hashing over 255 characters, and a stored request answered before any handler: **seen**,
  by a spike run at 4.1.1 and not kept, and **read in the source**, `cluster/SqlMessageStorage.ts` and
  `cluster/Runners.ts`. The step of the roadmap keeps a spike of it in `spikes/`.
- `Sharding.reset` deletes a reply and marks the request unprocessed only while that reply is the latest, and a
  request reset is delivered again at once after `Sharding.pollStorage`: **seen**, by a spike run at 4.1.1 and not
  kept, and **read in the source**, `clearReplies` of `cluster/SqlMessageStorage.ts`. The step keeps a spike of it.
- A success reply is saved in the handler's transaction under `WithTransaction`: **documented**, in the JSDoc of
  `ClusterSchema.WithTransaction`.
- The machine suspends with the message in its mailbox, and the storage writes what it gives: **tested**, in
  `src/machine.test.ts` and `src/storage.test.ts`, for decisions 0006 and 0057.
- Cluster delivers an entity's messages one at a time: **read in the source**, `cluster/internal/entityManager.ts`,
  `concurrency: 1` by default. The step of the roadmap keeps it as the option it sets.

## Alternatives

- **The `requestKey` alone as the primary key**, as this note first had it. It answers one caller with another's
  reply after a migration that swaps their senders.
- **A primary key of the request id alone, with the sender in a column of the runtime's.** Cluster would answer a
  second sender with the first one's reply before the step runs, which is the hole decision 0015 closed.
- **Rewriting Cluster's keys at a deploy.** It touches a table that is Cluster's, under keys it may have hashed, and
  races the messages delivered meanwhile.
- **The version in the RPC's tag, one RPC per version.** It keys the same, but a message stored before a deploy would
  name a tag the new version does not register, and find no handler.
- **An RPC for each message of a program.** The same request with two messages would be two requests to Cluster and
  one to the machine, and only the runtime's replies would keep them one.
- **Cluster's replies alone.** A retry across a deploy that changes how the sender is written would be applied
  again, and decision 0048 would not hold.
- **Hashing the key in the runtime.** Cluster already hashes what is over its column; a key the runtime hashed would
  no longer show who sent it, in either table.
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
- **A resumption that resets the message the entity died on in Cluster's storage**, from a Cluster request id the
  suspension holds, as this note once had it. The machine's resumption has already handled the message: the reset
  delivers it twice, and gives Cluster's storage a part of what the machine decides.
- **Keeping no mailbox of the runtime's on Cluster.** The machine's discard drops the head of its mailbox, and its
  resumption handles it: with an empty mailbox a discard would do nothing, and the suspension could not be lifted
  past the message.

## Consequences

- A reply is stored twice on Cluster: in Cluster's table, with the step, and in the runtime's. A retry within a
  version never reaches the step; every retry across a deploy runs a step, which reads the runtime's reply, changes
  nothing, and leaves Cluster a second reply under the new key.
- On Cluster, the messages waiting when the entity suspends are each answered `Suspended`, and are not kept, where
  on one process they stay queued (decision 0023). What decision 0023 tells a caller holds: `Suspended` says nothing
  of whether the message is queued, and a retry under the same request id gets the reply once the entity is resumed.
- A request answered `Suspended` or `NotFound` costs two steps, its first sending included: Cluster's client gives a
  stored answer and a new one alike, so the client resets either, once for each sending, and the second step answers
  as the entity is then. An operation that sends to a suspended entity waits by retrying; how it learns of the
  resumption, without polling it ([decision 0063](archive/0063-the-runtime-waits-for-what-it-waits-for.md)), is
  decision 0092's.
- The reset is a write to Cluster's tables from whatever runner the client runs on, outside the shard's lock. It
  clears only an answer whose id the client read, which is no reply, and only makes the request delivered again to
  the runner that holds the shard.
- The runtime's mailbox on Cluster holds what the machine queues: the message an entity died on, and the messages
  its own work records. A message from Cluster that finds the mailbox holding the entity's own work is queued behind
  it, and the event that queues it answers nothing, where the RPC must answer: how that step gets its answer is
  decision 0092's.
- The [idempotency keys that services cap](../open-questions.md#running) are not Cluster's limit, which hashes its
  own, and stay open.
- Nothing of this is code yet: the runtime on Cluster is a later step of the roadmap.
