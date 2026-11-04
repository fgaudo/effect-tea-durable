# 0011. An operation declares what a crash does to it

**Status:** accepted, 2026-10-30. The way it builds an operation is replaced by
[decision 0018](0018-operations-are-data.md). The drain before a planned stop is decided by
[decision 0119](../0119-a-planned-stop-drains-the-at-most-once-operations.md). A fourth delivery, idempotent and
given the digest of its key, is added by [decision 0123](../0123-an-idempotent-runner-may-be-given-the-digest-of-its-key.md).
A fifth, droppable, is added by [decision 0128](../0128-an-operation-that-acts-on-nothing-may-be-dropped.md).

## Context

An operation restarted after a crash acts on the world again. With an idempotency key passed on, the world
recognises it (a payment provider, another entity). Without one, it acts twice: an email sent twice. And for
some work, acting twice is worse than not knowing whether it acted.

## Decision

An operation is built in one of three ways, and the way shows where it is built:

- `operation((key) => …)` is **idempotent**: it receives the idempotency key, and passes it on. A crash runs it
  again with the same key.
- `operation.atLeastOnce(effect)` receives no key, and **may act twice**: a crash runs it again.
- `operation.atMostOnce(effect, unknown)` receives no key, and **never runs again**. An activation that finds
  it in the stored state, with no completion of its incarnation in the mailbox, does not start it, and delivers
  `unknown` as its completion instead: it may or may not have acted. The state then says so, and the program
  decides what to do. A completion already recorded is handled as any message, and `unknown` is not sent.

The runtime needs no mark of its own for the third kind: an operation whose key is in the stored state may have
started.

## Alternatives

- **One kind, with a key every operation may ignore.** Ignoring the key would typecheck, and the difference
  would be invisible.
- **A mark written before the operation starts.** It would tell "never started" from "maybe acted", for one more
  write per operation. Between the mark and the effect the process may die too, so `unknown` remains.
- **Only idempotent operations.** Many services have no idempotency keys, and a program would wrap them in
  something that pretends.

## Consequences

- The idempotent and the at-least-once kinds behave the same in the runtime. The difference is what the program
  says, and whether it holds the key.
- Nothing checks that an idempotent operation passes its key on: one that ignores it still typechecks. It reads
  as a mistake, since a program that means to act twice says `atLeastOnce`.
- An at-most-once operation under way when the process stops, a deploy included, delivers `unknown` at the next
  activation: the runtime should drain them before a planned stop. The same holds for one stopped by a
  suspension ([decision 0006](0006-a-defect-suspends-the-entity.md)), once resumed.
- `rehearse`'s `restart` delivers `unknown` for the at-most-once operations under way. The order's shipment
  email shows it.
- The `unknown` message is the work's message ([decision 0008](0008-delivered-work-is-done.md)): it ends the
  work, and a state that returns the key again starts a new attempt, chosen by the program.
