# 0002. Store the state after each message, never replay messages

**Status:** accepted, 2026-10-30.

## Context

Since `update` is pure and everything nondeterministic enters as a message, storing the messages and replaying
them would rebuild the state: event sourcing for free, seemingly.

## Decision

The runtime stores the state after each message, in the transaction that marks the message handled. Nothing
replays messages. They may be kept as an audit.

## Alternatives

- **Replaying the messages.** The history would be bound to the version of `update`. Fix a handler, and an old
  order replayed through it reaches a state its customer never saw. Every change of `update` would need the
  old version kept beside the new, or snapshots taken before it.
- **Storing events, as Akka Persistence does.** `update` would return events, and a second function would
  apply them. Replay then survives a change of the decisions, but the program has two functions to keep in
  step, and still needs snapshots to load quickly.

## Consequences

- `update` may change freely between versions. Only the state's schema needs migrating, as any stored data
  does.
- Each message writes the whole state. That suits small states (an order), not large ones (a room with
  thousands of items). The limit is in [open questions](../open-questions.md).
- There is no history to rebuild a past state from, beyond the audit.
