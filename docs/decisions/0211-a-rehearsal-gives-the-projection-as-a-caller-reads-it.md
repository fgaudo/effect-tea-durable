# 0211. A rehearsal gives the projection as a caller reads it, from its JSON

**Status:** accepted, 2026-11-09. Changes the `projection` of a rehearsal, which
[decision 0131](archive/0131-a-rehearsal-runs-the-entities-an-operation-sends-to.md) gives a member of a world and
`rehearse` gives its entity. It holds of the projection what
[decision 0210](0210-a-sparse-array-is-no-json-and-negative-zero-is-read-as-zero.md) decides of `-0`. Its open
question of a rejection's reason is decided by
[decision 0214](0214-a-rejections-reason-is-given-as-a-caller-reads-it.md).

## Context

A rehearsal's `projection` is documented as the entity's projection "as a caller reads it". It gave
`project(state)` of the state in memory. The runtime gives a caller the projection its storage holds, decoded from
the JSON a step wrote. The two differ where JSON does not give a value back as it is. `-0` is let through, and
written `0` ([decision 0210](0210-a-sparse-array-is-no-json-and-negative-zero-is-read-as-zero.md)). So an inventory
created with the capacity `-0` was projected with `available: -0` by its rehearsal, and with `available: 0` by the
runtime. The property of [decision 0212](0212-the-property-tests-of-the-fixtures-derive-their-values-from-the-schemas.md)
found it on its first run.

## Decision

- **A rehearsal's `projection` is encoded by the projection's schema, written as JSON, read back and decoded.** It is
  the value a caller of the runtime reads, `-0` as `0`.
- **A rehearsal's `state` is the state in memory, as before.** A caller of the runtime reads no state, so no reading
  of the runtime is the one to match.

## What it rests on

- That the runtime gives a caller the projection decoded from the JSON its storage holds: **tested**, by
  `Inventory answers on the runtime as its rehearsal does, over values of its schemas` in
  [`src/fixtures.property.test.ts`](../../src/fixtures.property.test.ts), which fails on `-0` against the code before
  the change, on SQLite and on PostgreSQL.
- That a rehearsal now gives `0` where the state holds `-0`: **tested**, by
  `gives the projection as a caller reads it from its JSON, -0 as 0` in
  [`src/rehearse.test.ts`](../../src/rehearse.test.ts), which fails without the change.
- That `JSON.stringify` writes `-0` as `0`: **documented**, by ECMAScript's `SerializeJSONProperty`, as decision 0210
  says.

## Alternatives

- **A test compares a rehearsal with the runtime under `===` rather than `Object.is`.** It would pass, and leave a
  rehearsal that gives a caller what no caller of the runtime reads. A test's `toEqual` tells `-0` from `0`.
- **The runtime gives the projection in memory.** A caller of a loaded entity would then read another value than a
  caller after a passivation, for the same state.

## Consequences

- The design says under Rehearsing that `projection` is read back from its JSON.
- A rejection whose reason holds `-0` may be given `-0` on the first send and `0` on a retry. That is only
  reasoned from [`src/callers.ts`](../../src/callers.ts), and no fixture's rejection holds a number. It is an
  [open question](../open-questions.md#programs).
