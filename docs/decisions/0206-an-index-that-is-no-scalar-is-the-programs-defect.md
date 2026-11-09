# 0206. An index that is no scalar is the program's defect

**Status:** accepted, 2026-11-09, with the step An index that is no scalar is the program's defect of the
[roadmap](../roadmap.md). Changes [decision 0032](archive/0032-a-projection-is-a-row.md), whose index is a pure
function from the projection to a scalar.

## Context

An index that gave `undefined` crashed its entity on both dialects, at every step that reached the state.
`shownOf` of [`src/machine.ts`](../../src/machine.ts) refused an index that was a number JSON does not hold, or a
string a database does not hold, and nothing else. `indexesText` of [`src/storage.ts`](../../src/storage.ts) then
wrote `{"first":undefined}`, which is no JSON, and the write failed. A write that fails crashes its entity
([decision 0042](archive/0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md)), and the next load reached
the same state. A program needs no cast for it. `(p) => p.tags[0]` is typed `string` where the compiler runs
without `noUncheckedIndexedAccess`, and is `undefined` for a projection with no tag.

## Decision

- **An index is null, a string, a boolean or a finite number.** `shownOf` checks the value of each index first. Any
  other value is a defect of the machine, as an index that is a number JSON does not hold is. The reason is
  `the index '…' is no scalar: null, a string, a boolean or a number`.
- **The defect suspends the entity.** The step that reached the state is not stored, as for any defect of the
  program ([decision 0006](archive/0006-a-defect-suspends-the-entity.md)). An operator resumes it once a deploy
  fixes the index, or discards the message.
- **`reindex` meets the same defect.** It calls `shownOf`, and lists the entity among its failures, as it lists an
  index that is a number JSON does not hold.

## What it rests on

- That every value an index gives passes through `shownOf` before the storage writes it: **read in the code** of
  [`src/machine.ts`](../../src/machine.ts), in `writes`, and of [`src/storage.ts`](../../src/storage.ts), in
  `reindex`. The test `a state whose projection or work does not encode to JSON is a defect, and is not stored` in
  [`src/machine.test.ts`](../../src/machine.test.ts), and
  `an index that is no scalar suspends the entity, and lists it` in
  [`src/runtime.test.ts`](../../src/runtime.test.ts), on both dialects, **test** it, and each fails against the
  code before the change.
- That `JSON.stringify` writes a property whose value is `undefined` as no JSON in the text the storage builds:
  **seen** in the reproduction of this bug, on both dialects.

## Alternatives

- **An index that gives `undefined` is read as null.** A row would then lack the value rather than crash. It hides a
  mistake of the program, and a query that filters for null finds rows the program never meant to give null. A
  program that means null writes `?? null`.
- **The storage refuses the row.** The write would fail as before, and the entity would crash at every step. A
  defect is the program's, and suspends the entity where an operator sees it.
