# 0009. Entities talk through operations, as themselves

**Status:** accepted, 2026-10-30. Its consequence that an operation sends one message to a given entity is
replaced by [decision 0047](0047-a-request-of-an-operation-has-a-name.md), and `send` taking the request id by
[decision 0060](0060-send-and-create-take-no-key.md). The two programs it left to two rehearsals are rehearsed
together by [decision 0131](0131-a-rehearsal-runs-the-entities-an-operation-sends-to.md).
That a run after a crash is given every answer the run before it acted on holds since [decision
0253](../0253-an-answer-no-entity-stores-is-kept-for-the-operation-that-was-given-it.md), which keeps the answers no
entity stores.

## Context

A booking holds seats in an event's inventory, and later confirms or releases them. Two entities talk, and
each message between them must survive a crash on either side: a hold sent twice holds the seats twice, and a
release lost keeps them forever.

The inventory must also know who asks. A booking may confirm or release only its own hold, so the inventory
needs the sender's id, and needs it to be true.

## Decision

An entity sends a message to another from an **operation**, with `send(program, id, message, requestId)`, and
waits for the reply. `update` never sends: a step stays pure, and never waits on another entity.

The request id is the operation's idempotency key. A restarted operation sends the same request, and the
receiver answers it from its stored reply, as it answers any caller that retries. `send` takes an
`IdempotencyKey`, so that a request id that changes on restart does not typecheck.

The receiver sees the message from `{ _tag: 'Entity', entity: { name, id } }`. The runtime fills it in from the
operation that sends, so an entity cannot pass for another, and needs no access to its own id. Each program has
a `name`, which is what the receiver compares.

## Alternatives

- **A kind of work of its own** (`tell(program, id, message, onReply)` in `durable`). It would be declarative,
  and a runtime could write the message to the receiver's mailbox in the sender's transaction. But it is an
  operation with a fixed body, and the booking reads as well with an operation. It may come back as an
  optimisation, with the same meaning.
- **The sender names itself**, as a caller does, through the receiver's `Sender` type. Any entity could claim to
  be any booking, and each would need its own id, which a program does not have.
- **Sending from `update`**, as a command. It is what [decision 0003](0003-durable-work-derived-from-state.md)
  rejects: a message started by a step is lost in a crash.

## Consequences

- Talking to another entity is at least once, and made exactly once by the receiver's stored replies. It is
  the fourth line of the crash table, closed by the library itself.
- An operation sends one message to a given entity: a second would reuse the request id, and receive the
  first one's reply. A protocol that needs two messages takes two operations, in two states.
- A reply that the protocol rules out (the inventory rejecting the confirmation of its own hold) is a defect in
  the operation, and suspends the sender ([decision 0006](0006-a-defect-suspends-the-entity.md)).
- What a sender gets from a receiver that does not exist, or is suspended, is open with
  [creation](../../open-questions.md#programs) and [suspended entities](../../open-questions.md#running). So is how long
  a receiver keeps its stored replies, which a restarted operation may still ask for.
- `rehearse` runs one entity: the test answers for the other. Two programs that disagree on their protocol pass
  both rehearsals ([open questions](../../open-questions.md#programs)).
