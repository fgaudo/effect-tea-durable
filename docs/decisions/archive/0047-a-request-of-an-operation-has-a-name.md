# 0047. A request of an operation has a name

**Status:** accepted, 2026-10-31. The request id made of the idempotency key, and the work found through it, are
replaced by [decision 0059](0059-a-request-is-a-value.md): a request is a value that names the run, which the work
is read off. That `send` takes the key and `create` keeps it as its request id is replaced by
[decision 0060](0060-send-and-create-take-no-key.md): neither takes a key, and `create` takes a name too, used once
per receiver apart from a message's.

## Context

`send` took the operation's idempotency key as the request id
([decision 0009](0009-entities-talk-through-operations.md)), and a receiver stores its replies under the sender and
the request id ([decision 0015](0015-a-request-belongs-to-its-sender.md)). A second message from the same
operation to the same entity came with the same request id: it was answered the reply stored for the first, and
never applied. Nothing failed, so an operation that held seats and then released them left them held.

## Decision

- **`send` takes the operation's idempotency key and a name**, which names the request among those the operation
  makes. The runtime makes the request id of both, so an operation sends as many messages to one entity as it
  has names, and a restarted operation sends the same requests and gets their stored replies.
- **A name sent under twice to the same entity in one run of the operation is a defect** of the sender's own: the
  operation dies, and suspends its entity ([decision 0046](0046-a-receiver-that-crashes-is-sent-again.md)). The
  second request would be answered the first one's reply. A run that starts again after a crash may use every
  name again: that is how it gets the stored replies.
- Storage finds the work that asked for a reply through the idempotency key in the request id, so a reply to an
  entity is still kept while that work holds, and no longer
  ([decision 0021](0021-a-reply-is-kept-while-the-work-that-asked-holds.md)).
- `create` keeps the idempotency key as its request id: a creation is stored apart from messages
  ([decision 0017](0017-creation-in-the-machine.md)), and an operation creates an entity once.

## Alternatives

- **A request id that comes back with another message is a defect**, and no name. The receiver would have to
  store each message with its reply, as the schema writes it and through the migrations, to compare them, and an
  operation could never send two messages to one entity. A message an operation builds from the clock would
  differ after a restart, and its retry would be taken for a defect.
- **Names alone, with no check.** A name used twice would be answered as before, and nothing would fail.
- **A counter of the sends in a run** as the request id. A restarted operation that sends in another order, or
  skips a send on what a reply said, would take the replies of other requests.

## Consequences

- Every `send` names its request: [`examples/booking`](../../../examples/booking) names its hold, its confirmation
  and its release, and checks that an operation that holds and releases in one run has both applied, and that
  one that sends twice under one name is suspended.
- The check holds within a run: two runs of the same work, one after the other, cannot be told apart from a
  retry, and the name is the operation's to keep stable.
