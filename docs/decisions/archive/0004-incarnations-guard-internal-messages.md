# 0004. Incarnations guard internal messages

**Status:** accepted, 2026-10-30. An incarnation is drawn from one counter of the entity, and a key whose work is
gone has no row, since [decision 0132](0132-a-key-may-take-a-parameter.md).

## Context

Internal messages are delivered at least once, and a key may leave the state and come back. A payment is
declined, the customer pays again, and the late duplicate of the first attempt's answer arrives during the
second: `update` would take it as the second's.

## Decision

Each key has an incarnation, stored with the state, which grows each time the key comes back. Work carries
the incarnation it was started in, and the runtime delivers its message only while the key is present in that
same incarnation. The idempotency key of an operation includes its incarnation.

## Alternatives

- **Attempt numbers kept by each program.** Every program would have to remember them, and one forgotten is a
  bug that tests rarely meet.
- **Rejecting stale messages in `update`.** `update` cannot tell a stale answer from a current one without the
  attempt number.

## Consequences

- An internal message in a state without its key cannot arrive: `update` answers it with a defect, and the
  defect is a real bug.
- A new attempt is a new incarnation, so a new idempotency key: the payment provider sees a new charge, as it
  should.
