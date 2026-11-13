# 0286. The trigger of the outbox locks the publications of a statement's rows in order, once for each statement

**Status:** accepted, 2026-11-12, as the fix of bug 80 of [`docs/bugs.md`](../bugs.md), a case of the rule of
[decision 0284](0284-a-statement-reads-its-condition-from-a-row-it-has-locked.md). It changes the trigger of
PostgreSQL of [decision 0154](archive/0154-a-steps-projection-is-stored-once-in-the-outbox.md), as
[decision 0157](archive/0157-the-storage-speaks-sqlite-and-postgresql.md) wrote it: the trigger runs once for each
statement, and not once for each row. Its premise that no pair of the test of a contract reaches the case fell on
2026-11-13: the pool of [decision 0283](0283-a-contract-runs-one-set-of-calls-on-every-backend.md) reaches it, with an
ack between two prunes, and its examples `bug80` fail against the trigger before this note.

## Context

A publication goes with the last row of the outbox that names it, by a trigger of the statement that drops the row
(decision 0154). On PostgreSQL the trigger ran once for each row dropped, and read whether another row still named
the row's publication. On a pool at `READ COMMITTED` ([decision 0222](0222-postgresql-with-many-connections.md)), two
transactions may drop the two rows of one publication at once: two batches of `prune` whose snapshots differ by a
deploy that declares a consumer and by an ack select different rows. Each trigger then sees the other's row, which
its transaction has not committed the deletion of, and both keep the publication. No row names it afterwards, so no
prune drops it.

## Decision

- **On PostgreSQL the trigger runs once for each statement that drops rows of the outbox**, on the rows the
  statement dropped, which its transition table `effecttea_outbox_dropped` holds.
- **It first locks the publications of those rows, in the order of their keys**, `FOR UPDATE`. A statement that
  dropped another row of a publication then waits for the transaction that holds the publication. A transaction
  holds the lock until it commits, and its rows of the outbox are gone by then.
- **It then drops each of those publications that no row of the outbox names**, in a statement of its own. On a pool
  that statement reads a snapshot taken after the lock, so it sees the rows a transaction that held the publication
  dropped.
- **The order of the keys keeps two statements from locking two publications in opposite orders.** A trigger once
  for each row would lock them in the order the statement drops its rows, which no clause orders.
- **SQLite's trigger is left as it is.** One transaction writes at a time there.
- **The schema of the first release is changed in place**, since no release has been published and the first
  migration is the schema of the first release
  ([decision 0216](0216-the-tables-are-made-by-effects-migrator.md)).

## What it rests on

- That two transactions that each drop one row of a publication, the second while the first is open, leave no
  publication once both commit, on two publications in opposite orders: **tested**, by `a publication goes with the
  last row that names it, though two transactions drop its rows at once` of
  [`src/postgres.test.ts`](../../src/postgres.test.ts), in the job `postgres` of the CI. It fails against the trigger
  before this note.
- That the trigger keeps a publication while another row names it, and drops it with its last row, on PGlite: **tested**,
  by `a consumer is a name within its topic, and a prune drops in each topic what its consumers read` and the tests of
  the search path of [`src/storage.test.ts`](../../src/storage.test.ts).
- That a statement of a function of PL/pgSQL at `READ COMMITTED` reads a snapshot of its own, taken when it begins:
  **documented**, in the section on the volatility of functions of PostgreSQL 17, the version of the CI's server: a
  `VOLATILE` function, the default, takes a new snapshot at each of its queries. The first premise tests it too.
- That `ORDER BY` with `FOR UPDATE` locks the rows in the order of the sort: **documented**, in the locking clause of
  `SELECT` of PostgreSQL 17, which says the sort is applied before the rows are locked.
- That a pair of calls of the test of a contract cannot reach the case, so that a scenario holds it: **chosen** by this
  note, on 2026-11-12, at the maintainer's question. Two prunes of one view select the same rows, and the second
  waits for the first. The two views need a deploy and an ack between a batch's snapshot and its commit.

## Alternatives

- **The trigger once for each row, with `FOR UPDATE` on the row's publication.** It fixes the case, and two statements
  may lock two publications in opposite orders, which PostgreSQL ends as a deadlock. Ordering the rows of the outbox
  first in `prune` does not order the trigger's locks, since the trigger runs in the order the statement drops the rows.
- **An advisory lock of the program in `prune`.** It orders every prune of a program, and is a second way of locking
  beside the rows', as decision 0284 says of `reindex`.

## Consequences

- Bug 80 is fixed.
- The pool's test of a contract does not hold bug 80. A pool that runs histories with a deploy and an ack inside a
  batch of `prune` would.
