# 0026. The test says which messages a projection's actions stand for

**Status:** accepted, 2026-10-30. Changed by [decision 0213](../0213-a-projections-allows-is-given-the-sender.md),
which gives each function of `allows` the sender.

## Context

The design promises a check that the projection agrees with `update`: every action it shows is accepted, and
every accepted action is shown. effect-tea's `dispatchViolations` checks a view this way, from the messages the
renderer collects from what it draws. A projection draws nothing: it is plain data, read by a remote caller, and
`canCancel: true` is a message only once someone says it stands for `CancelRequested`. Nor does it say who reads
it: an order's `canCancel` is true for its customer, and a cancellation from anyone else is rejected.

## Decision

- `projectionViolations(program, allows)` checks a state. `allows` gives, for each kind of inbound message the
  projection speaks of, by its tag, whether the projection allows a message of that kind. The test writes it;
  the program declares nothing more.
- It is called with a state, the candidate messages with their senders, and the time of `meta.at`. Each candidate
  is sent to `update` as a caller: one the projection allows and `update` rejects is `Rejected`, one `update`
  accepts and the projection does not allow is `Missing`. A candidate of a kind `allows` leaves out is skipped.
- The candidates come from the senders the projection speaks for: the order's customer, never a stranger.

## Alternatives

- **A field of the program that maps a projection to its messages.** Every program would carry a function only
  its tests call, and the projection's reader, which builds the messages, would not use it.
- **Projections whose actions are messages**, as effect-tea's model holds the messages the view sends. A caller
  is remote and receives data; a message with a payload (a payment method) is the caller's to fill in.
- **Checking that a message acts once**, as `dispatchViolations` checks a double tap. A retry with the same
  request id is answered from the stored reply, so the runtime ensures it.

## Consequences

- Each example has a property test that generates its states with fast-check and checks its projection.
- A projection that speaks to several readers (a customer and support) is checked once for each, with that
  reader's candidates.
- Who may send what is decided by `update` ([open questions](../../open-questions.md#programs)): the check takes the
  senders as the test gives them.
