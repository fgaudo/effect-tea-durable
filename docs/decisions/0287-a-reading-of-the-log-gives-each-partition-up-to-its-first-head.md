# 0287. A reading of the log gives of each partition only the rows up to the head its first statement read

**Status:** accepted, 2026-11-12, as the fix of bug 78 of [`docs/bugs.md`](../bugs.md), the second half of the rule
of [decision 0284](0284-a-statement-reads-its-condition-from-a-row-it-has-locked.md). It changes the reading of
[decision 0137](archive/0137-the-log-is-ordered-within-a-partition.md), which held on SQLite's one writer only.

## Context

A cursor skips no row, since the rows of one partition commit in the order of their `seq` (decision 0137). The rule
also needs a reading to see the log as it stood at one moment. `published` of
[`src/storage/log.ts`](../../src/storage/log.ts) reads the heads of the partitions, then the position of the first
row past each cursor, then its pages, each a statement of its own. On a pool of PostgreSQL at `READ COMMITTED`
([decision 0222](0222-postgresql-with-many-connections.md)) each statement reads a snapshot of its own. A step of a
partition that commits between two statements, followed by the next step of that partition, gives the second row
and not the first. An ack of the second row then moves the cursor past the first, which no reading gives again. The
same holds between two pages.

## Decision

- **A reading of the log keeps the head of each partition behind, as its first statement read it.**
- **It leaves out of each page a row whose `seq` passes that head, or whose partition was not behind.** Such a row is
  given by a later reading. A row up to the head committed before the heads were read, since a step holds its
  partition's head until it commits, and the steps of a partition draw their `seq` one after the other
  (decision 0137). So a row the reading gives has no row of its partition before it that the reading missed.
- **The reading takes no lock, and runs at the level of its caller.** It holds at every level: at `REPEATABLE READ`
  the statements read one snapshot, and the rows past the heads are none.

## What it rests on

- That the reading gives every row of a partition before one it gives, when steps commit between its statements:
  **tested**, by `a reading of the log gives no row of a partition past a row of it that committed between its
  statements` and `a reading of the log gives no row of a partition past a row of it that committed between two
  pages`, of [`src/storage.test.ts`](../../src/storage.test.ts), on SQLite and on PGlite. They write the rows by hand
  between the reading's statements, as a server would commit them, and fail against the code before this note.
- That steps of a pool commit so between a reading's statements, and that the reading then gives every row: **tested**,
  by `a reading of the log gives no row of a partition past one it skipped`, of
  [`src/postgres.test.ts`](../../src/postgres.test.ts), in the job `postgres` of the CI. It fails against the code
  before this note.
- That a step draws its `seq` by an update of its partition's head, in its own transaction: **read in the source**, of
  `write` in [`src/storage/entities.ts`](../../src/storage/entities.ts).
- That the row an update locks stays locked until its transaction ends: **documented**, in the chapter on explicit
  locking of PostgreSQL 17.

## Alternatives

- **The reading in `snapshot` of [`src/storage/held.ts`](../../src/storage/held.ts).** Its statements would read one
  snapshot. Inside a transaction a caller left open, `snapshot` keeps the caller's level
  ([decision 0158](archive/0158-an-older-database-of-sqlite-is-given-request-id-and-a-page-keeps-the-level-of-a-callers-transaction.md)),
  so a `fetch` within a caller's transaction at `READ COMMITTED` would skip rows still.
- **A lock of the heads.** It would make every step of a partition wait for a reading, where leaving rows out makes no
  one wait.

## Consequences

- Bug 78 is fixed.
- A reading may give fewer rows than its limit while rows past a head are committed. A consumer reads them at its
  next `fetch`.
