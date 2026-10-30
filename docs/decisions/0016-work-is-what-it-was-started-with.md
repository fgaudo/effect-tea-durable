# 0016. Work under a kept key is the work that started

**Status:** accepted, 2026-10-30. Superseded by [decision 0018](0018-operations-are-data.md).

## Context

A kept key leaves its work as it is. The work is built from the state, and the state may change while the work
runs: a subscription's payment method is updated during a charge. The charge under way goes on with the old
method, but after a crash activation builds it from the stored state, and it charges the new one, under the
idempotency key of the attempt on the old one. A provider may refuse a key reused with other parameters, or
answer for the first. A timer kept at an old time is armed at the new one after a crash, and not before.

That is the inconsistency [decision 0008](0008-delivered-work-is-done.md) set out to remove: a program behaved
one way while the process lived, and another after a crash.

effect-tea's Guide says that a subscription sees the state only through its key: what it depends on goes into
the key, and a new value starts it anew.

## Decision

- **A timer is its key and its time.** A step that keeps a timer's key with another time ends the timer and
  arms a new one, in a new incarnation: it has done nothing yet. A firing of the old time already in the
  mailbox is dropped. The machine checks it, since a timer is data.
- **An operation is its key.** The runtime cannot compare an operation, which is a function. What it uses must
  not change while it runs: either the state that runs it holds what it uses, fixed when it starts, or what it
  uses is part of its key, and a new value is a new key, which a step cannot give while it runs
  ([decision 0005](0005-an-operation-leaves-only-by-completing.md)). The subscription does the first: its
  `Charging` state holds the charge, and a new payment method is used from the next.

## Alternatives

- **Operations that carry their parameters as data**, which the runtime compares and stores. It would catch the
  mistake, and a restarted operation could run with what it was started with. It needs a schema and an
  equality for every operation's parameters, for a mistake a program avoids by holding them in its state.
- **Timers compared by key only**, with the time in the key as the Guide does. Every timer whose time may move
  would need such a key, and one that forgets behaves differently after a crash, without a test failing.
- **Interrupting an operation whose parameters change.** It is what
  [decision 0005](0005-an-operation-leaves-only-by-completing.md) rules out.

## Consequences

- A program behaves the same with and without a crash for timers, by the machine, and for operations, by the
  rule above. Nothing checks the rule for operations: a test of the scenario does
  ([`examples/subscription/scenarios.test.ts`](../../examples/subscription/scenarios.test.ts)).
- A timer's message is still read from the state when it fires: only its time decides whether it is the same.
- The question of work whose parameters change leaves [open questions](../open-questions.md).
