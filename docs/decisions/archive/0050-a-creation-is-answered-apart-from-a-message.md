# 0050. A creation is answered apart from a message

**Status:** accepted, 2026-10-31.

## Context

A creation is a request of its own, stored apart from messages, so its request id may be used again to send one
([decision 0012](0012-creation-is-a-request-of-its-own.md),
[decision 0017](0017-creation-in-the-machine.md)). The machine kept them apart in what it stores, but answered
both with one output, `Replied`, under the same `requestKey`. The runtime waits for a reply by entity and by
`requestKey`, so a message waiting in the mailbox and a creation under the same request id waited together: the
creation's `AlreadyExists` reached the message's caller as its answer, and a fallback in `create` turned a
message's `Accepted` that reached a creation's caller into `AlreadyExists`.

## Decision

- **The machine answers a creation with `CreationReplied`**, whose reply is a `Creation`, and a message with
  `Replied`, whose reply is a stored reply or `Suspended`. The two are different requests, and the outputs say
  which.
- **The runtime keeps the callers of a creation apart from the callers of a message**, each waiting for the reply
  of its kind. A creation's caller is given a `Creation`, and the fallback is gone.

## Alternatives

- **Keying the runtime's waiting by the kind of the reply** (`Created` and `AlreadyExists` are a creation's).
  It fixes the runtime and leaves the machine saying less than it knows: what a reply is for would be read off
  its value, where the event already said it.
- **One output with a field for the kind of request.** The reply's type would not follow the field, and every
  test that compares a message's reply would carry it.

## Consequences

- [`src/machine.test.ts`](../../../src/machine.test.ts) checks that a creation and a message under one request id
  are answered by two outputs, and counts their replies apart; [`src/runtime.test.ts`](../../../src/runtime.test.ts)
  that a creation and a message under one request id, waiting together, are each given their own reply.
