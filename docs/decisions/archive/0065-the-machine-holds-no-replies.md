# 0065. The machine holds no replies, and a receive is given the one it asks for

**Status:** accepted, 2026-10-31. Decides [the replies an entity holds](../../open-questions.md#storage-and-reading).
A caller's request a version before stored is found by a column of its id, and not by its JSON, by
[decision 0157](../0157-the-storage-speaks-sqlite-and-postgresql.md).

## Context

`Stored` held every reply stored for the entity. An activation read them all, and every step that answered a
caller copied the record, though a step reads only the reply of the request it receives. A caller's reply is kept
for ever ([decision 0021](0021-a-reply-is-kept-while-the-work-that-asked-holds.md)), so an entity that lives long
held more of them at each message, and paid for them at each step.

And a step was not the only thing that changed a machine. A reply to another entity is deleted by the storage in
the transaction that ends the work that asked for it, which may be another entity's, and the runtime's `forget`
took it out of the loaded receiver's machine outside any event: the one change of a machine that no event stepped,
and that neither `rehearse` nor the machine's tests could see.

## Decision

- **The machine holds no replies.** `Stored` has no `replies`. The reply a step stores is in what it writes, as
  before ([decision 0057](0057-the-machine-gives-what-is-written.md)), and in its outputs.
- **A `Receive` carries the reply stored under its request**, or null for none. The runtime reads it from storage
  in the entity's loop, just before it steps the event, where no other event of the entity is applied, so what it
  reads is what the steps before wrote. The machine's tests keep the replies their steps wrote, as a storage does;
  `rehearse` sends each request once, so none has one. What a caller offers is an `Offered` event, a `Receive` with
  no reply yet.
- **The storage reads a reply by its request.** A request is found by its text, as the machine keys it
  ([decision 0059](0059-a-request-is-a-value.md)). A caller's request that a version before stored may be another
  text, since its sender may be migrated: when its text finds nothing, the rows other versions wrote under the same
  caller's request id are read, through an index on that id, and compared once migrated.
- **Only a step changes a machine.** The runtime's `forget` is gone, and the storage's `write` gives nothing back:
  a reply it deletes is in no machine.

## Alternatives

- **Forgetting through an event of its own**, offered to the loaded receiver by the storage's deletion. Every
  machine would still hold every reply stored for it, which is the cost this decision removes, and the event would
  cross from the entity whose work ended to another's loop.
- **Reading the reply in the machine, through a function it is given.** The machine runs no effect
  ([decision 0013](0013-the-runtime-is-a-pure-machine.md)): the event carries what was read, as `Handle` carries
  the time.

## Consequences

- An activation reads no reply, and what a loaded entity holds grows with its mailbox and its keys only. A message
  costs a reading by the table's key, and a caller's message that finds nothing one more, by its request id.
- A reply deleted between its reading and the step is one whose asker's work ended: nothing asks for it again
  ([decision 0021](0021-a-reply-is-kept-while-the-work-that-asked-holds.md)).
- The machine's tests check that the replies a step writes are the ones its outputs give, which is what lets a
  storage give them back.
