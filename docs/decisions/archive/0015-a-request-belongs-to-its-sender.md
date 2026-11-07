# 0015. A request belongs to its sender, and work to its entity

**Status:** accepted, 2026-10-30. Its consequence on renaming a program is replaced by
[decision 0022](0022-a-new-program-keeps-what-work-started-with.md), and the one that callers share one space of
request ids by [decision 0048](0048-a-callers-request-belongs-to-its-sender.md). A runner may be given the key's
digest instead of the key, by [decision 0123](0123-an-idempotent-runner-may-be-given-the-digest-of-its-key.md).

## Context

An idempotency key was the entity's id, the work's key and its incarnation, and a receiver stored its replies
under the request id alone. Two holes followed.

- A booking `42` and an entity `42` of another program, each with a `hold` key, gave their work the same
  idempotency key. Both send it to the inventory as a request id, and the second is answered the first's stored
  reply. A payment provider sees the same key for two charges.
- A caller chooses its request ids, and an operation's are readable JSON. A caller that sends first under a
  booking's next request id leaves the booking a reply its protocol rules out: a defect
  ([decision 0009](0009-entities-talk-through-operations.md)), which suspends it. Resuming does not help, since
  the restarted operation gets the same stored reply.

[Decision 0009](0009-entities-talk-through-operations.md) already says that an entity is its program's name and
its id.

## Decision

- An idempotency key is the entity's program name and id, the work's key and its incarnation.
- A receiver stores and deduplicates a request under its sender and its request id: an entity's requests under
  its address, apart from every other entity's and from the callers'. The runtime fills the address in
  ([decision 0009](0009-entities-talk-through-operations.md)), so no one can take another entity's request ids.
- A reply goes back with the sender it belongs to.

## Alternatives

- **The entity's id alone, with ids unique across programs.** Every creator would have to know every other
  program's ids.
- **Request ids nobody can guess** (a random part stored with the incarnation). It would hide the collision
  between callers and entities, not remove it, and add a write per piece of work.
- **Scoping callers' requests too, by sender.** The caller's sender is the program's own type, decided by a
  boundary that does not exist yet ([who may send what](../../open-questions.md#programs)).

## Consequences

- Callers share one space of request ids, as before. A caller who reuses another's request id gets the other's
  reply; whether a caller's requests should be its own is open with
  [who may send what](../../open-questions.md#programs).
- The machine's `requestKey` is how a request is stored, and the runtime's table of replies is keyed the same
  way.
- Renaming a program changes its idempotency keys. An operation under way during the deploy that renames it
  restarts under a new key: the name is part of what is stored, as the state's schema is.
