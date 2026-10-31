# 0018. Operations are data, and their runners never see the state

**Status:** accepted, 2026-10-30. Replaces [decision 0016](0016-work-is-what-it-was-started-with.md), and the
way [decision 0011](0011-an-operation-declares-what-a-crash-does.md) builds an operation. Its comparison by
`Equal.equals` is replaced by [decision 0058](0058-work-is-compared-by-what-is-stored.md): two works are the same
when they encode to the same JSON.

## Context

An operation was a closure, built by `durable` from the state. The runtime could not compare two closures, so a
kept key kept its operation even when the state it was built from had changed, and after a crash the operation
was built again from the stored state: a charge under way on one payment method restarted on another, under
the same idempotency key. [Decision 0016](0016-work-is-what-it-was-started-with.md) made it a rule for programs
to hold what an operation uses fixed, with nothing to check it. An input declared beside the closure would not
close the gap either: the closure could still read the state around it.

effect-tea's Guide already answers it: a command is the program's own data, which `runCommand` turns into an
Effect, and a command carries everything it needs, since `runCommand` does not see the state. Here operations
had departed from it, and the design did not say why.

## Decision

- An operation is a value of the program's own type, `T['operation']`, a union tagged by `_tag`: usually a
  `Data.TaggedEnum`. `durable` returns operations and timers by key.
- The program's `operations` hold a runner for each tag. A runner receives the operation, and the idempotency
  key for an idempotent one, never the state. It is built as
  [decision 0011](0011-an-operation-declares-what-a-crash-does.md) says: `operation(run)`,
  `operation.atLeastOnce(run)`, `operation.atMostOnce(run, unknown)`, where `unknown` is built from the
  operation.
- A kept key keeps its work only if it is the same by value (`Equal.equals`): an equal operation, or a timer at
  the same time with the same message. A timer that changes is armed again, in a new incarnation. An operation
  that changes while it runs is a defect, as one dropped is
  ([decision 0005](0005-an-operation-leaves-only-by-completing.md)).

So the operation under way is always the one the stored state holds, and an operation restarted after a crash
is the one that was running. The machine's tests check it as a property.

## Alternatives

- **Closures, and a rule for programs** ([decision 0016](0016-work-is-what-it-was-started-with.md)). Nothing
  checks the rule, and breaking it shows only after a crash.
- **An input declared beside the closure.** The machine would compare the input, and the closure would still
  read what it likes.
- **Storing the operation, and restarting what was stored.** No defect, but the state and what runs could
  disagree in silence, against [decision 0003](0003-durable-work-derived-from-state.md).
- **The operation itself as its key.** It would work the same, with keys nobody can read, which change with
  every renamed field, and idempotency keys with them.
- **A subscription's rule: a changed value starts anew.** An operation cannot be interrupted
  ([decision 0005](0005-an-operation-leaves-only-by-completing.md)).

## Consequences

- A test asserts what a state runs by value, as effect-tea's tests assert commands: `durable(state)`, or
  `pending(key).work` in a rehearsal.
- A program whose operation depends on something that may change while it runs holds it in the state when the
  operation starts, as the subscription's `Charging` holds its charge, or rejects the change.
- A function inside an operation is compared by reference, so it fails as a change at every step: loudly.
- The runtime has the operation as data. It could store it, or show an operator what was under way; neither is
  decided.
- A runner's purity is a convention, as `update`'s is: it may read a global, and nothing stops it.
