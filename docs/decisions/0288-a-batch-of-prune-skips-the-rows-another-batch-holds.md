# 0288. A batch of `prune` locks the rows it selects, and skips those another batch holds

**Status:** accepted, 2026-11-12, as the fix of bug 111 of [`docs/bugs.md`](../bugs.md), a case of the rule of
[decision 0284](0284-a-statement-reads-its-condition-from-a-row-it-has-locked.md). It changes
[decision 0245](0245-a-reply-is-kept-as-long-as-send-says-and-the-runtime-sweeps.md): `prune` repeats its batches
until a batch deletes nothing, as `expire` does under
[decision 0285](0285-a-batch-of-expire-skips-the-replies-a-step-holds.md).

## Context

A batch of `prune` is a `DELETE` of the rows of the outbox whose `position` a subquery selects, in the order of
`position` (decision 0245). On a pool of PostgreSQL ([decision 0222](0222-postgresql-with-many-connections.md)), the
sweep and a caller's `prune` may run batches at once, and both select the same rows. The `DELETE` locks the rows in
the order its plan reads them, which no clause orders. Two batches whose plans read the rows in different orders each
hold a row the other waits for, and PostgreSQL ends one of them as a deadlock. The prune that loses dies. The test of
a contract of the pool met it on the CI's server, for the pair of two prunes, in the run of the fix of bug 78.

## Decision

- **The subquery of a batch of `prune` locks the rows it selects, and skips those another transaction holds.** It
  ends with `lockingTheConditionSkipping` of [`src/storage/held.ts`](../../src/storage/held.ts), `FOR UPDATE SKIP
  LOCKED` on PostgreSQL and nothing on SQLite. A batch then waits for no row of the outbox, so two batches close no
  cycle of locks on those rows. A row another batch holds is that batch's to delete.
- **`prune` repeats its batches until a batch deletes nothing.** A batch that skips rows may delete fewer than a batch
  while rows are left after it.

## What it rests on

- That two prunes at once on a pool met a deadlock on the rows of the outbox before this note: **seen**, in the job
  `postgres` of the CI on 2026-11-12, at the commit `8e74330` of `claude/log-reads-up-to-its-heads`. The server's log
  read `deadlock detected`, `while deleting tuple … in relation "effecttea_outbox"`, with both sessions in the prune's
  `DELETE`. Which plan each session ran is not known, so the history found is pinned among the examples of the test of
  the pool, `bug111`, and is not known to fail on every run against the code before.
- That PostgreSQL skips a row another transaction locks under `SKIP LOCKED`, rather than waiting for it:
  **documented**, in the locking clause of `SELECT` of PostgreSQL 17, the version of the CI's server.
- That the clause changes nothing on SQLite and on PGlite, and that a prune ends: **tested**, by `a prune drops past a
  batch, counts every row, and keeps what a cursor holds` and the other tests of `prune` of
  [`src/storage.test.ts`](../../src/storage.test.ts), which run on both.
- That two prunes at once on a pool answer as one order of them under this note: **tested**, by `two calls held at a
  statement on a pool answer as one order of them`, of [`src/contract.test.ts`](../../src/contract.test.ts), in the
  job `postgres` of the CI.

## Alternatives

- **`FOR UPDATE` in the order of `position`, waiting.** Two batches would lock in one order and close no cycle, and
  rest on the order of the locks of a sorted `LIMIT`. A batch that skips waits for nothing at all.
- **An advisory lock of the program.** It is a second way of locking beside the rows', as decision 0284 says of
  `reindex`.

## Consequences

- Bug 111 is fixed.
- A prune runs one batch more, the one that deletes nothing.
