# 0052. What crosses the library is never mutated

**Status:** accepted, 2026-10-31.

## Context

The Guide says that a state is never mutated, nested objects included, and that `update` returns a new one: the
library reuses what is the same object. This design follows the Guide where it applies, but never wrote the rule
down, and leans on it in more places than effect-tea does:

- the runtime writes the read model and publishes a step only when the next state is another object than the
  one before ([decision 0038](0038-what-happened-is-published-through-an-outbox.md)): a state mutated in place
  and returned is neither stored as read nor published;
- the machine compares the work of a state with the work it keeps under way
  ([decision 0018](0018-operations-are-data.md)): an operation mutated in place is the same object as the one it
  compares it with, and its change is never seen;
- the machine shares values between one step and the next instead of copying them, and `rehearse` gives a test
  the stored state as it is;
- a program is read at each step — its keys, its runners, its indexes — and checked once, where it enters
  (see the [roadmap](../../roadmap.md)): a program changed after that runs unchecked.

Nothing enforces it, as nothing enforces that `update`, `durable` and `project` are pure.

## Decision

- **Nothing that crosses the library is mutated**, by the program, by its tests, or by the library. That is
  everything a program gives — the program itself and its schemas, its states, flags, messages, rejections,
  senders, operations, timers and projections — and everything the library gives back: the state and the
  projection of a rehearsal, what a query finds, and the rows of the outbox. A new value is a new object: a
  spread, or a schema's `make`.
- **It is a contract, as purity is.** The library freezes nothing and copies nothing to protect itself: a frozen
  object would cost every step, and would not catch a mutation of the program's own copy. A program that
  mutates breaks what the design guarantees, as one whose `update` reads the clock does.

## Alternatives

- **Freezing what the library is given**, deeply, where it enters. Every message and every state would be walked
  at every step, and an object the program holds elsewhere would be frozen under it.
- **Copying what the library relies on**, a program at its deploy for instance. It protects one value of many,
  and lets the program believe that the others are protected too.
- **Leaving it to the Guide.** The rule is the Guide's for a state, and this design relies on it for every value
  it is given: a program reads the design, and should find it there.

## Consequences

- The design states the rule where it describes a program
  ([`docs/design.md`](../../design.md#a-program)).
- A check of a program made once, where it enters the runtime, holds for as long as the program runs: nothing
  needs to be checked again, or remembered by the identity of an object.
