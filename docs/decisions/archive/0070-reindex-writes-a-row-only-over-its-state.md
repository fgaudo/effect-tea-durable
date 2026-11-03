# 0070. `reindex` writes a row only over the state it was computed from

**Status:** accepted, 2026-10-31. Replaces the consequence of [decision 0032](0032-a-projection-is-a-row.md) that
lets `reindex` write a row back over a step.

## Context

`reindex` read a page of states and then wrote each one's row, outside any transaction. A step that committed in
between wrote its own row, which `reindex` then replaced with the projection of the state before it, until the
entity's next step, which may never come. A query then read a projection the entity had moved past, which
[decision 0032](0032-a-projection-is-a-row.md) says it never does; and an operator runs `reindex` after a deploy
that changed the projection or an index, while the entities step. Decision 0032 accepted it as a consequence.

## Decision

- **A row is written only if the state it was computed from is still the one stored.** Each row is one
  statement, an insert that selects the entity's row where its state and version are the ones read: the check
  and the write are one, and nothing commits between them.
- An entity that took a step since is skipped, and keeps the row its step wrote, which is computed from its
  state by the program deployed. `reindex` gives how many rows it wrote, so it counts none for it.

## Alternatives

- **A transaction per page.** It would hold every step of the program out for the time a page takes to be read,
  projected and written, where one statement holds them for the time of one row.
- **Reading the state again in a transaction per row.** Two statements for what one does.

## Consequences

- [`src/storage.ts`](../../../src/storage.ts) writes each row of `reindex` with `INSERT … SELECT … WHERE state = …`.
- [`src/runtime.test.ts`](../../../src/runtime.test.ts) runs a step while `reindex` walks forty-three entities,
  under every budget from 3 to 100 steps (`Scheduler.MaxOpsBeforeYield`), and checks that every row is what its
  entity reads. Run before this decision, it failed under the first budget.
- A state is compared by its text, as the version that wrote it encoded it: a step that writes a state equal to
  the one read leaves a row `reindex` may write, which is the same row.
