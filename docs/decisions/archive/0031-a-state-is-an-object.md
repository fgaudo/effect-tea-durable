# 0031. A state is an object

**Status:** accepted, 2026-10-30.

## Context

effect-tea's `Types` constrains a program's state to `object` (its `src/program.ts`), and this design follows the
Guide wherever it applies, with `docs/design.md` saying where it departs and why
([`AGENTS.md`](../../../AGENTS.md)). Here `Types['state']` was `unknown`: a program whose state is a string
compiled, and nothing said that it should not. That was no decision — it was a divergence nobody wrote down.

## Decision

`Types['state']` is `object`.

A tag is not required. The Guide's rule — one state machine per concern, a union with a case per state, no flags
— stays a rule of structure, which the examples follow and the types do not enforce: `durable` and `project`
match on the case, and all three examples use `Match.valueTags`. `Types['operation']` is tagged in the type
because the runners are indexed by the tag ([decision 0018](0018-operations-are-data.md)); nothing indexes a
state.

## Alternatives

- **A tagged state in the type** (`Readonly<{ _tag: string }>`). It would forbid a state with no phases — a
  counter, a set of flags held as data — and the Guide does not enforce tagging either. The agreement between
  `update` and `project` that a tag would help prove is checked by `projectionViolations`
  ([decision 0026](0026-the-test-maps-a-projection-to-its-messages.md)), and the proof would be lost at the
  codec anyway: a state read back is data, and its phase is re-established by its schema.
- **Leaving it `unknown`.** A silent divergence from the Guide, and a state with no room for the keys a program
  with children inside the entity would need ([open questions](../../open-questions.md)).

## Consequences

- A program whose state is one value wraps it. `Tiny`, the machine's test program, holds its last message as
  `{ last }` ([`src/machine.test.ts`](../../../src/machine.test.ts)).
- Nothing of the machine changes: it never reads a state, it only carries it.
