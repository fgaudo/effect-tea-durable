# Open questions

What is not decided yet. A question leaves this file when a note in [`decisions/`](decisions) decides it.

## Programs

- **Work under many keys.** A program declares its keys, so an entity holds as many pieces of work as it has
  keys, and no more ([decision 0033](decisions/0033-a-program-declares-its-keys.md)). A state that would hold one
  operation per line of an order has nowhere to put them. Do such items want to be entities of their own, as a
  large state does, or is there a kind of work held under keys a state computes?
- **The machine and the declared keys.** The types catch a key a program never declared where the state holds
  that key alone, and not where it holds a declared key beside a misspelt one
  ([decision 0033](decisions/0033-a-program-declares-its-keys.md)). Should the machine check the keys of
  `durable` against the declared ones, and suspend the entity on one it does not declare, as it suspends it on a
  `project` that dies ([decision 0014](decisions/0014-rules-the-machine-settled.md))?
- **Work that may be abandoned.** An operation leaves only through its completion. Is there a kind of work with
  no effect on the world (a computation, a read) that a state may drop, as effect-tea drops a subscription?
- **Live streams.** A timer and an operation survive passivation. A stream from a socket or a feed does not.
  Are they allowed, keeping the entity loaded while their key is present, or left out?
- **Children inside an entity.** effect-tea composes programs into a tree. Does an entity's program compose
  children the same way, stored as one state? The decider pattern (Jérémie Chassaing's `Decider`) has an algebra
  for it — two state machines compose into one, with laws a test can check — and is worth reading before this is
  designed, although it stores the events where this design stores the state
  ([decision 0002](decisions/0002-store-the-state-not-the-messages.md)).
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

- **Publishing what happened.** Other systems (a queue, an event store, another service) need to learn what an
  entity did. The runtime could write `(id, the accepted message, the projection after)` to an outbox in the
  step's transaction whenever the projection changes, where it already writes the row a query reads
  ([decision 0032](decisions/0032-a-projection-is-a-row.md)), and deliver it at least once. The message names
  the fact (`ChargeSucceeded`), and the projection is already the public contract, so the program would declare
  nothing more. Is that the way, and what does a consumer use to deduplicate? It is also where the history of
  an entity that never ends (a subscription's past invoices) would go, since its state keeps only the present.
- **Large states.** Each message stores the whole state. Where is the limit, and what does a program with a
  large state do: split into entities, or store a difference?
- **Renaming a program.** A program's name is the entities' address, and a schema's migration does not move
  what is stored under it: its entities, and the replies stored for them by other entities
  ([decision 0022](decisions/0022-a-new-program-keeps-what-work-started-with.md)). How a rename is run, and
  what reaches the senders that stored a reply under the old name, is not decided. A schema that changes is
  ([decision 0036](decisions/0036-a-migration-is-a-function-on-the-json.md)).

## Running

- **How many entities a process holds.** An entity is unloaded once it has had nothing to do for a while, and
  nothing caps how many are loaded at once: a burst of callers loads them all
  ([decision 0029](decisions/0029-an-idle-entity-is-unloaded.md)). Should a process unload the least recently
  used of them once it holds too many, and what does a program whose entity must stay loaded
  ([live streams](#programs)) say then?
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
