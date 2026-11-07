# 0048. A caller's request belongs to its sender

**Status:** accepted, 2026-10-31. Replaces the consequence of
[decision 0015](0015-a-request-belongs-to-its-sender.md) that callers share one space of request ids. Where the
sender is found in a stored request is changed by [decision 0059](0059-a-request-is-a-value.md): by the request's
tag. That a load computes a stored request's key again is changed by
[decision 0065](0065-the-machine-holds-no-replies.md): the machine holds no replies, and the storage reads a
caller's by its text, then among the rows other versions wrote under its request id, compared once migrated. A
reply's row is keyed by its version too, by [decision 0069](0069-a-reply-is-keyed-by-the-version-that-wrote-it.md).
Who a sender is, the identity the boundary authenticated, is decided by [decision 0124](0124-the-boundary-authenticates-and-update-authorizes.md).

## Context

A receiver stores and deduplicates an entity's request under its address and its request id
([decision 0015](0015-a-request-belongs-to-its-sender.md)), and a caller's under its request id alone. A second
caller that picked an id another had used was answered `Accepted` with the first one's reply, or its reason, and
its message was never applied. Nothing failed.

Decision 0015 left callers in one space because the caller's sender was the program's own type, decided by a
boundary that did not exist yet. Every `send` and `create` of a caller already gives its sender: `update` reads
it as `meta.from` to decide who may do what, and the mailbox stores it through `schemas.sender`
([decision 0027](0027-a-program-gives-the-schema-of-its-senders.md)).

## Decision

- **A caller's request is stored and deduplicated under its sender and its request id**, the sender as
  `schemas.sender` writes it: two senders the schema writes the same are one caller. A creation is stored the
  same way ([decision 0017](0017-creation-in-the-machine.md)).
- **A sender that does not encode is the caller's defect**, for a creation as for a message, and reaches no
  entity ([decision 0040](0040-what-is-stored-encodes-to-json-as-it-is.md)).
- **A request stored by an older version is read through the migration of the sender**
  ([decision 0036](0036-a-migration-is-a-function-on-the-json.md)): storage decodes the sender it holds as that
  version wrote it, and computes the request's key again, so that a retry after a deploy that changes the sender
  finds its reply. The request that created the entity is written again with the entity's row, in the version the
  row is written in.
- `rehearse` creates its entity under the entity itself: no one retries the rehearsal's creation, and a program
  need not have a sender for it.

## Alternatives

- **One space, with ids callers keep unique** (a UUID each). A caller that reuses another's id, by mistake or on
  purpose, takes its reply, and its message is not applied; the runtime cannot tell the two apart.
- **A caller identity apart from the sender**, a string the runtime is given. It would be a second notion of who a
  caller is, beside the sender `update` authorizes by, and the boundary that would give it does not exist.
- **The sender as the version that stored it wrote it**, never read again. A deploy that migrates the sender would
  have every retry after it applied again.
- **Comparing decoded senders by value.** Replies are stored and found by a key, in the machine as in the table.

## Consequences

- Who a request belongs to is as fine as the sender: a program whose sender is one value for every caller keeps
  one space of request ids among them. Who a sender is stays the boundary's to say
  ([who may send what](../../open-questions.md#programs)).
- [`src/machine.test.ts`](../../../src/machine.test.ts) gives two callers the same request ids, and checks that each
  message answered `Accepted` is applied; [`src/runtime.test.ts`](../../../src/runtime.test.ts) migrates the sender,
  and checks that a caller's creation and message stored by version 1 are found by version 2.
- An older version's request is read through the migration at each load, and its row is not written again. A
  caller's replies are still kept for ever ([callers' stored replies](../../open-questions.md#running)).
