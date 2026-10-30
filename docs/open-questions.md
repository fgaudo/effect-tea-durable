# Open questions

What is not decided yet. A question leaves this file when a note in [`decisions/`](decisions) decides it.

## Programs

- **Work that may be abandoned.** An operation leaves only through its completion. Is there a kind of work with
  no effect on the world (a computation, a read) that a state may drop, as effect-tea drops a subscription?
- **Live streams.** A timer and an operation survive passivation. A stream from a socket or a feed does not.
  Are they allowed, keeping the entity loaded while their key is present, or left out?
- **Children inside an entity.** effect-tea composes programs into a tree. Does an entity's program compose
  children the same way, stored as one state?
- **Rehearsing entities together.** `rehearse` runs one entity, and the test answers for the others. A booking
  that sends a confirmation the inventory would reject passes both rehearsals
  ([decision 0009](decisions/0009-entities-talk-through-operations.md)). Is a rehearsal of several entities
  needed, where `send` reaches the other program, or a check that two programs agree on their messages?
- **Who may send what.** `update` reads `meta.from` and rejects what a sender may not do. Should authorization
  that is not domain (a valid token) happen before the mailbox, and what does the caller get then, or for
  flags that do not decode? And who may create an entity, since `init` sees no sender
  ([decision 0012](decisions/0012-creation-is-a-request-of-its-own.md))? A defect at creation stores nothing
  ([decision 0014](decisions/0014-rules-the-machine-settled.md)): what is its creator answered? Callers share
  one space of request ids ([decision 0015](decisions/0015-a-request-belongs-to-its-sender.md)): should a
  caller's requests be its own, once the boundary knows who it is?

## Storage and reading

- **Queries across entities.** "Orders unpaid for a day" cannot be asked of stored states. A pure function
  from the state to rows of a read table, written in the step's transaction, would answer it. How are those
  tables declared and migrated?
- **Publishing what happened.** Other systems (a queue, an event store, another service) need to learn what an
  entity did. The runtime could write `(id, the accepted message, the projection after)` to an outbox in the
  step's transaction whenever the projection changes, and deliver it at least once. The message names the fact
  (`ChargeSucceeded`), and the projection is already the public contract, so the program would declare nothing
  more. Is that the way, and what does a consumer use to deduplicate? It is also where the history of an entity
  that never ends (a subscription's past invoices) would go, since its state keeps only the present.
- **Large states.** Each message stores the whole state. Where is the limit, and what does a program with a
  large state do: split into entities, or store a difference?
- **Schemas that change.** States, flags, messages in the mailbox and the work under way are stored in the
  schema of the version that wrote them. How does a migration of a state's schema look, and when does it run:
  at activation, or all at once? A stored operation is compared with the new program's by value
  ([decision 0020](decisions/0020-a-new-program-is-checked-against-the-stored-work.md)): how is one read whose
  schema changed ([decision 0025](decisions/0025-operations-and-projections-have-schemas.md))? A projection's
  schema is a contract with callers: how does it change under them? And renaming a program moves its entities,
  and the replies stored for them by others
  ([decision 0022](decisions/0022-a-new-program-keeps-what-work-started-with.md)).

## Running

- **Two versions at once.** During a rolling deploy, a state written by the new version may be read by the
  old one. Is forward compatibility for one version required, or do deploys avoid it?
- **Suspended entities.** A caller gets `Suspended`, and an operation that sends waits, keeping its own entity
  waiting with it ([decision 0010](decisions/0010-a-rejection-may-carry-a-reason.md)). How does an operator see,
  resume and discard? And how long may a sender wait before someone is told?
  A suspension stops every operation of the entity, and drops what they deliver meanwhile
  ([decision 0006](decisions/0006-a-defect-suspends-the-entity.md)): a charge interrupted because another
  operation died runs again, or delivers `unknown` if at most once. Should a suspension stop only the handling
  of messages, and let the work under way record its completions? And an operation that dies cannot be
  discarded, only resumed: one that dies on a reply stored by another entity dies again on every resume, and
  only a new version of the program gets it out.
- **Callers' stored replies.** A caller's reply is stored so that a retry gets it, and is kept for ever: a time
  after which a retry is applied again would depend on the protocol, and on who callers are
  ([who may send what](#programs)). Replies to entities are kept while the work that asked is stored
  ([decision 0021](decisions/0021-a-reply-is-kept-while-the-work-that-asked-holds.md)).
- **Idempotency keys that services cap.** An idempotency key is readable JSON, the entity's program name and id,
  the key and the incarnation ([decision 0015](decisions/0015-a-request-belongs-to-its-sender.md)), and an id
  may be long. Payment providers cap the length of a key (Stripe at 255 characters). The machine keeps the key
  readable; should the runtime, or the runner, hash it for such services, and with what, so that it stays the
  same across versions?
- **Failing operations.** A transient failure (a timeout) is retried inside the operation, or becomes a
  message. After how many retries does it become a defect, if ever? And
  should the runtime notice work that comes back at once, turn after turn: a timer kept at a time already past,
  an operation kept on its own completion ([decision 0008](decisions/0008-delivered-work-is-done.md))?

## Naming

- The name of the library, once there is code to publish.
