# 0003. All durable work is derived from the state

**Status:** accepted, 2026-10-30. The function `durable` is renamed `work`, and the type `Durable` `Piece`, by
[decision 0195](../0195-the-package-is-effect-tea-persistent.md).

## Context

In effect-tea a step returns commands, started once. On a server, a command started after the commit and
before the process died is lost: the entity stays in the state that waits for its completion, forever. The
usual fix is an outbox stored with the state.

effect-tea's Guide already says that an operation is a state only its completion leaves. Then the operations
under way can be read from the state, as subscriptions are.

## Decision

A program has no commands. `durable(state)` returns the work under way, by key, and the runtime keeps what runs
equal to it: at each step, and at each activation after a crash.

## Alternatives

- **Commands with an outbox.** The outbox duplicates what the state already says, and the two can disagree.
- **Commands for what may be lost** (a metric, a log line). Logging and metrics are Effect's, in the runtime;
  no example so far needs a command. If one does, it comes back as a separate kind of work.

## Consequences

- Whatever must happen is visible in the state, and testable by calling `durable`.
- A program that must send an email once holds a state saying the email is to be sent, which only its
  completion leaves.
- Work on the world runs at least once: an operation restarted after a crash acts again, with the same
  idempotency key.
