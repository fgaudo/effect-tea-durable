# 0017. Creation is part of the machine

**Status:** accepted, 2026-10-30.

## Context

[Decision 0012](0012-creation-is-a-request-of-its-own.md) says that the request creating an entity is answered
`Created`, and stored, and that any other is answered `AlreadyExists`. The machine created an entity with no
request, so the runtime would have had these rules from prose, with nothing to be tested against.

## Decision

- `start` takes the creating request, its id and its sender, and answers it `Created`. The machine stores it
  under its `requestKey` ([decision 0015](0015-a-request-belongs-to-its-sender.md)), apart from the replies to
  messages.
- A `Create` event on an entity that exists answers `Created` to that request and `AlreadyExists` to any other.
  It is read from storage, so a suspended entity answers it too, and it changes nothing.
- An id with nothing stored has no machine. The runtime answers a message to it `NotFound`, and a creation
  `start`s it.

## Alternatives

- **`Created` stored among the replies to messages.** A message with the creation's request id would be answered
  `Created`, which is not a reply to a message.
- **A machine for an id with nothing stored**, which answers `NotFound`. It would hold one rule, which the
  runtime keeps in the lookup it does anyway.

## Consequences

- An operation may create an entity and then send it a message with the same idempotency key: the two are
  stored apart. The limit of one message per operation and receiver
  ([decision 0009](0009-entities-talk-through-operations.md)) holds for messages.
- `rehearse` creates its entity with a request of its own, which a scenario does not see.
