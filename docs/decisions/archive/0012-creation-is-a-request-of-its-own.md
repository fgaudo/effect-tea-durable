# 0012. Creating an entity is a request of its own

**Status:** accepted, 2026-10-30. Its consequence that flags are decoded before anything is stored is replaced by
[decision 0049](0049-flags-are-checked-by-their-schema.md). `create` taking the request id,
and counting as the operation's one message to the entity, are replaced by
[decision 0060](0060-send-and-create-take-no-key.md). Who may create an entity is decided by
[decision 0124](../0124-the-boundary-authenticates-and-update-authorizes.md): the boundary, or an entity whose operation calls `create`.

## Context

An entity starts from `init`, with the flags it is created with. Who creates it, what creating one that exists
answers, and what a message to one that does not exist answers were open. The booking sends to an event's
inventory that may not exist.

## Decision

- An entity is created by a caller, or by an operation with `create(program, id, flags, requestId)`, with the
  operation's idempotency key as the request id. It counts as the operation's one message to that entity.
- The first request is answered `Created`, stored under its request id: a retry gets `Created` again.
- Any other request for an entity that exists is answered `AlreadyExists`, whatever its flags. A caller that
  only wants the entity to exist takes both as success.
- A message to an entity that does not exist is answered `NotFound`
  ([decision 0010](0010-a-rejection-may-carry-a-reason.md)). It never creates one: a message has no flags.

## Alternatives

- **`AlreadyExists` only for different flags.** It would compare flags encoded in a schema that changes between
  versions, and two callers creating the same entity would both be told they created it.
- **Creation on the first message.** The flags would travel with every message, or the entity would start
  without them.

## Consequences

- An id is chosen by its creator. Two creators that mean the same entity derive its id from what makes it one
  (an order's shipment from the order's id), and one of them is told `AlreadyExists`.
- Flags are decoded with the program's schema before anything is stored: flags that do not decode create
  nothing. A check the program needs on its flags (the booking's seats) goes in their schema, since `init`
  cannot reject.
- Who may create an entity is not domain, since `init` sees no sender, and what a caller gets for flags that
  do not decode is not a reply: both stay open with [who may send what](../../open-questions.md#programs).
