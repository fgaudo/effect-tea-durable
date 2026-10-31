# 0085. On Cluster, a request is keyed as the machine keys it

**Status:** accepted, 2026-10-31. Decides the first half of the [roadmap](../roadmap.md)'s finding on requests and
replies from [Effect Cluster](../cluster.md#what-cluster-gives-that-the-runtime-already-does): how
[decision 0015](0015-a-request-belongs-to-its-sender.md) and [decision 0017](0017-creation-in-the-machine.md) hold
on it. Its primary key, what it says of the runtime's replies, and a rule it missed for what Cluster stores are
corrected by [decision 0086](0086-on-cluster-a-request-is-keyed-by-its-version-too.md).

## Context

Cluster deduplicates a persisted request only when its payload implements `PrimaryKey`, under
`entityType/entityId/tag/id`, where `id` is the payload's primary key: global to the receiver, with no sender in it.
A key over 255 characters is stored as its SHA-256. The machine stores a request under its `requestKey`, the
request's JSON as text, which holds its sender: a caller's sender as the program's schema writes it
([decision 0048](0048-a-callers-request-belongs-to-its-sender.md)), or the entity, key, incarnation and name of
another entity's operation ([decision 0059](0059-a-request-is-a-value.md)). A creation and a message under one
request id are answered apart ([decision 0050](0050-a-creation-is-answered-apart-from-a-message.md)). A request
stored by an older version is read through the migration of its sender, and its key computed again, so that a retry
after a deploy that changes the sender finds its reply (decision 0048).

A spike checked this against `effect` 4.1.1, with `SingleRunner` on `@effect/sql-sqlite-bun`, an entity with two RPCs
`Create` and `Send` annotated `Persisted` and `WithTransaction`, and a payload whose primary key is the text of a
request as `requestKey` writes it:

- two callers with one request id, and two entities of different programs with the same id and key, are each two
  requests; the same request sent again is answered from the stored reply, and the handler does not run;
- one request sent as a creation and as a message is two requests, apart by the tag;
- a request whose key is over 255 characters is stored under its SHA-256, and deduplicated;
- the same caller and request id, with the sender written otherwise, is a new request to Cluster, and the handler
  runs.

## Decision

- **The primary key of an entity's payload on Cluster is the request's `requestKey`.** Cluster keys it under the
  receiver's address and the RPC's tag, so a request is deduplicated under its receiver, its kind and its sender, as on
  one process.
- **A program has one RPC for a creation and one for its messages**, whatever the message: the machine deduplicates a
  message by its request alone, and so does Cluster then.
- **The runtime keeps its own replies on Cluster, and a message is answered from them first**, as on one process.
  Cluster's stored reply answers a request delivered again under the key it was stored with; the runtime's answers a
  retry whose key has changed with a migration of the sender, which Cluster sees as new and hands to the step.
- **The runtime's client builds every payload.** The runtime fills an operation's sender in
  ([decision 0015](0015-a-request-belongs-to-its-sender.md)); Cluster's RPCs, like the runtime's tables, are inside
  its boundary, and nothing else sends to an entity through `Sharding`.

## Alternatives

- **A primary key of the request id alone, with the sender in a column of the runtime's.** Cluster would answer
  a second sender with the first one's reply before the step runs, which is the hole decision 0015 closed.
- **An RPC for each message of a program.** The same request with two messages would be two requests to Cluster and
  one to the machine, and only the runtime's replies would keep them one.
- **Cluster's replies alone.** A retry across a deploy that changes how the sender is written would be applied again,
  and decision 0048 would not hold. Rewriting Cluster's `message_id` on a migration would touch a table that is
  Cluster's, and a key it may have hashed.
- **Hashing the key in the runtime.** Cluster already hashes what is over its column; a key the runtime hashed would
  no longer show who sent it, in either table.

## Consequences

- A reply is stored twice on Cluster: in Cluster's table, with the step, and in the runtime's. What deletes either is
  the second half of the finding ([decision 0021](0021-a-reply-is-kept-while-the-work-that-asked-holds.md)), decided
  next.
- A retry whose key changed with a migration runs a step that only reads the runtime's reply, and leaves Cluster a
  second reply under the new key.
- The [idempotency keys that services cap](../open-questions.md#running) are not Cluster's limit, which hashes its
  own, and stay open.
- Nothing of this is code yet: the runtime on Cluster is a later step of the [roadmap](../roadmap.md).
