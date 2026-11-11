# 0021. A reply to an entity is kept while the work that asked is stored

**Status:** accepted, 2026-10-30. What its consequences say of Cluster is corrected by
[decision 0090](0090-on-cluster-a-reply-is-deleted-as-on-one-process.md): one statement reads both shards. Which
replies are deleted is given by the machine's step since [decision 0057](0057-the-machine-gives-what-is-written.md): the
storage checks only another entity's keys. How long a caller's replies are kept, which this note left open, is decided
by [decision 0125](0125-a-callers-reply-is-kept-as-long-as-its-boundary-says.md): as long as its boundary says.
[Decision 0253](../0253-an-answer-no-entity-stores-is-kept-for-the-operation-that-was-given-it.md) keeps by the same
rule the answers no entity stores: a creation `init` rejected, and `NotFound`.

## Context

A receiver stores the reply to each request, so that a retry gets it. Another entity's operation sends under
its idempotency key, and may retry long after, once it is restarted or resumed
([decision 0009](0009-entities-talk-through-operations.md)). A receiver cannot tell when a reply is no longer
needed, and a fixed time would drop one that a suspended sender, resumed after a week, still asks for.

The sender knows. Its request id is the idempotency key of its work: the program's name, the entity's id, the
key and the incarnation ([decision 0015](0015-a-request-belongs-to-its-sender.md)). Once that work is done, or
no longer in the state, the key moves to another incarnation or leaves, and an activation never brings it back
in the same one ([decision 0020](0020-a-new-program-is-checked-against-the-stored-work.md)). No one else can
send under the sender's address, which the runtime fills in. So no one asks for the reply again.

## Decision

- A reply to an entity is kept while the work that sent the request is stored and not done: the sender's
  stored work holds the key, in the incarnation of the request. The machine's `holds` says it.
- The runtime deletes the others. Deleting one changes no answer, so it is the runtime's storage, not a rule of
  the machine: on SQLite, one statement deletes every reply whose sender's work no longer holds, against the
  table where the runtime stores the work and its incarnations.
- A caller's replies are kept: how long is open, with who callers are
  ([open questions](../../open-questions.md#running)).
- The reply to a creation is kept with the entity, as it is now
  ([decision 0017](0017-creation-in-the-machine.md)).

## Alternatives

- **A time to keep them.** A reply could be dropped while its sender, suspended, still needs it, and the request
  would then be applied twice: the hole the stored reply closes.
- **Deleting in the sender's step that ends its work.** A reply stored after that step would stay forever: one
  to an at-most-once operation that delivered its `unknown` while its request was still in the receiver's
  mailbox, to an operation that stopped waiting, or to a program renamed by a deploy. The statement over what
  is stored covers them all, and needs no message between entities.
- **A time to keep callers' replies**, like a payment provider's idempotency keys. A caller that retries after
  it would be applied twice without knowing; the time depends on the protocol and on who the callers are, which
  is not designed yet.

## Consequences

- The replies stored for entities grow with the work under way, not with the messages handled.
- The runtime stores, with each reply to an entity, its sender's address, key and incarnation, so that the
  statement compares columns.
- On Effect Cluster, the sender's work and the receiver's replies sit on different shards, and one statement
  cannot read both. A deletion there is a message from the sender, delivered at least once, and may arrive
  before the request it ends: it is decided with Cluster ([roadmap](../../roadmap.md)).
