# 0088. On Cluster, the message an entity dies on stays in its mailbox

**Status:** accepted, 2026-10-31. Corrects [decision 0087](0087-on-cluster-what-is-not-a-reply-is-handled-again.md):
what a resumption and a discard do on Cluster. Corrects what
[decision 0081](0081-on-cluster-a-step-commits-with-its-reply.md) says of the runtime's mailbox there.

## Context

Decision 0087 says that Cluster marks processed the message an entity dies on, so that nothing would deliver it
again, and has a resumption reset it in Cluster's storage, from a Cluster request id the suspension holds. But the
machine suspends with the mailbox as it was, the message included
([decision 0006](0006-a-defect-suspends-the-entity.md)): a message that finds the mailbox empty is handled as it
arrives, and never written ([decision 0074](0074-a-message-that-finds-the-mailbox-empty-is-handled-as-it-arrives.md)),
unless the program dies on it, and then the step writes it to the mailbox with the suspension. The storage writes
what the machine gives, and decides nothing ([decision 0057](0057-the-machine-gives-what-is-written.md)), so on
Cluster too the message stays in the runtime's mailbox. A resumption handles it first, and a discard drops it, in
the machine, as on one process.

So decision 0087's reset was a second delivery of a message the resumption had already handled: harmless, since
the step finds the reply the resumption stored, but a write to Cluster's storage, a poke of it and a column of the
suspension for nothing. And its consequence that a message sent meanwhile may be handled before the message the
entity died on does not hold.

Decision 0081 says that on Cluster the runtime keeps no mailbox of its own. It keeps what the machine queues.

## Decision

- **On Cluster, the message an entity dies on stays in the runtime's mailbox**, written with the suspension, and a
  resumption and a discard are the machine's, as on one process. A suspension holds no Cluster request id, and a
  resumption resets nothing in Cluster's storage.
- What decision 0087 decides of a request answered `Suspended` or `NotFound` holds: a retry of the message the
  entity died on, once it is resumed, is reset by the client and handled again, and the step answers it from the
  reply the resumption stored; once it is discarded, it is handled as a new message.
- A resumption and a discard run as steps of the entity, under `WithTransaction` on the runner that holds its shard
  ([decision 0084](0084-a-step-commits-only-where-the-commit-checks-the-shard.md)), as decision 0087 says.

## Alternatives

- **Keeping decision 0087's reset beside the mailbox.** It delivers the message twice, and gives Cluster's storage a
  part of what the machine already decides.
- **Keeping no mailbox on Cluster, and the reset.** The machine's discard drops the head of its mailbox, and its
  resumption handles it: with an empty mailbox a discard would do nothing, and the suspension could not be lifted
  past the message.

## Consequences

- The runtime's mailbox on Cluster holds what the machine queues: the message an entity died on, and the messages its
  own work records. A message from Cluster that finds the mailbox holding the entity's own work is queued behind it,
  and the event that queues it answers nothing, where the RPC must answer; how the step of that RPC gets its answer
  is part of what stays the runtime's, the [roadmap](../roadmap.md)'s next finding.
- Nothing of this is code yet: the runtime on Cluster is a later step of the [roadmap](../roadmap.md).
