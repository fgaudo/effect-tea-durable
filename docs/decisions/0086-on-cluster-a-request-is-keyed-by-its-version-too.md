# 0086. On Cluster, a request is keyed by its version too

**Status:** accepted, 2026-10-31. Corrects [decision 0085](0085-on-cluster-a-request-is-keyed-as-the-machine-keys-it.md):
its primary key, what it says of the runtime's replies, and a rule it missed for what Cluster stores.

## Context

Decision 0085 keys an entity's payload on Cluster by the request's `requestKey`, its text as one version encodes
it. A migration of the sender that gives one caller's old JSON to another — a rename, a swap — gives the second
caller's request, at the new version, the text of the first one's request at the old. Cluster finds the first one's
row under that text and answers the second caller with the first one's reply, before the step runs: the hole
[decision 0069](0069-a-reply-is-keyed-by-the-version-that-wrote-it.md) closed for the runtime's replies, open
again in Cluster's, where the reply is not even read through the migration. Within a version, a text is one request
(decision 0069); across versions it is not.

Decision 0085 also says that a message is answered from the runtime's replies first. Cluster answers a request it
finds stored before any handler runs; the runtime's replies are read by the step, after.

And it puts the request in a payload that Cluster stores: on Cluster, Cluster's mailbox is the entity's
([decision 0081](0081-on-cluster-a-step-commits-with-its-reply.md)), so a message stored before a deploy is
handled after it, by the new version. On one process, what waits in the mailbox is stored with the version that
wrote it, and read through the migrations ([decision 0036](0036-a-migration-is-a-function-on-the-json.md)).

## Decision

- **The primary key of an entity's payload on Cluster is the version that keyed the request, and its
  `requestKey`.** Two versions never share a key in Cluster's table, as they never share a row in the runtime's.
- **Cluster answers a retry within a version; the runtime's replies answer one across versions.** A retry after a
  deploy is a new request to Cluster, whatever migrated, and its step finds the reply in the runtime's table, by its
  text at any version and then by its request id, read through the migrations
  ([decision 0065](0065-the-machine-holds-no-replies.md), decision 0069).
- **A payload is the version that wrote it, the request and the message, as JSON.** Cluster's schema of the payload
  decodes JSON alone, and the runtime reads the request and the message through the migrations, as it reads its own
  mailbox.
- The RPC for messages of decision 0085 carries what callers and other entities send. What an entity's own work
  delivers — a completion, a timer's firing — is not a request, and is not keyed here: what stays the runtime's is
  the [roadmap](../roadmap.md)'s next finding.

## Alternatives

- **The `requestKey` alone, as decision 0085 had it.** It answers one caller with another's reply after a migration
  that swaps their senders.
- **Rewriting Cluster's keys at a deploy.** It touches a table that is Cluster's, under keys it may have hashed, and
  races the messages delivered meanwhile.
- **The version in the RPC's tag, one RPC per version.** It keys the same, but a message stored before a deploy would
  name a tag the new version does not register, and find no handler.

## Consequences

- Every retry across a deploy runs a step, which reads the runtime's reply and changes nothing, and leaves Cluster a
  second reply under the new key. A retry within a version never reaches the step.
- The runtime's replies are what a retry across versions relies on, so on Cluster they are kept as decision 0021
  keeps them, and what deletes Cluster's is decided with them, in the next note.
- Nothing of this is code yet: the runtime on Cluster is a later step of the [roadmap](../roadmap.md).
