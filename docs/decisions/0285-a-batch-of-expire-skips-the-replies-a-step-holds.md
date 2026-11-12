# 0285. A batch of `expire` locks the replies it selects, and skips those a step holds

**Status:** accepted, 2026-11-12, as the fix of bug 13 of [`docs/bugs.md`](../bugs.md), a case of the rule of
[decision 0284](0284-a-statement-reads-its-condition-from-a-row-it-has-locked.md). Its test is the test of the pool of
[decision 0283](0283-a-contract-runs-one-set-of-calls-on-every-backend.md). It changes
[decision 0245](0245-a-reply-is-kept-as-long-as-send-says-and-the-runtime-sweeps.md): `expire` repeats its batches
until a batch deletes nothing, and not until a batch deletes fewer than a batch.

## Context

A batch of `expire` is a `DELETE` of the replies whose `(id, request, version)` a subquery selects, the replies past
their time in the order of the times (decision 0245). On a pool of PostgreSQL at `READ COMMITTED`
([decision 0222](0222-postgresql-with-many-connections.md)), the subquery reads the statement's snapshot. A step that
answers a retry writes the retry's reply again, under the same key, with a new time. If the step holds the row when the
`DELETE` reaches it, the `DELETE` waits, and then reads again only its outer `WHERE`, which holds no time. So the batch
deletes the reply with its new time, and the retry, sent again within its new `keep`, is applied once more.

## Decision

- **The subquery of a batch of `expire` locks the replies it selects, and skips those another transaction holds.** It
  ends with `FOR UPDATE SKIP LOCKED` on PostgreSQL, and with nothing on SQLite, where one transaction writes at a time.
  A reply a step holds is left to a later batch or sweep. A reply a step committed after the batch's snapshot is read
  again on the row committed, and the batch leaves it once its new time is not past.
- **The clause is `lockingTheConditionSkipping` of [`src/storage/held.ts`](../../src/storage/held.ts)**, beside
  `lockingTheCondition` of decision 0284, so that the rule keeps one place.
- **`expire` repeats its batches until a batch deletes nothing.** A batch that skips rows may delete fewer than a batch
  while rows past their time are left after it, so a batch that deletes fewer no longer says the sweep is done.
- **The batch of Cluster's ids, in `effecttea_given_requests`, is left as it is.** `forgetUnder` of
  [`src/storage/cluster.ts`](../../src/storage/cluster.ts) reads its subquery once in each of three statements, and
  Cluster runs on one file of SQLite, where no pool runs. The decision leaves out Cluster on a pool of PostgreSQL, and
  that case is an [open question](../open-questions.md#running).

## What it rests on

- That `expire` beside a step that answers a retry again, on a pool, keeps the reply the step wrote with its new time:
  **tested**, by the examples of bug 13 in `two calls held at a statement on a pool answer as one order of them`, of
  [`src/contract.test.ts`](../../src/contract.test.ts), in the job `postgres` of the CI. The examples hold the step
  after it wrote the reply, at a row of another reply of its entity that the step deletes. They fail against the code
  before this note.
- That PostgreSQL skips a row another transaction locks under `SKIP LOCKED`, rather than waiting for it:
  **documented**, in the locking clause of `SELECT` of PostgreSQL 17, the version of the CI's server. Whether the
  `LIMIT` is then filled from the rows after it is not needed, since the sweep ends only at a batch that deletes
  nothing.
- That PostgreSQL reads the `WHERE` of a `SELECT … FOR UPDATE` again on a row committed after the statement's snapshot,
  and leaves the row if it no longer holds: **documented**, in the same section.
- That the clause changes nothing on SQLite and on PGlite, and that the sweep ends: **tested**, by `expire deletes past
  a batch, counts every row, and on Cluster takes the ids of every batch` and the other tests of `expire` of
  [`src/storage.test.ts`](../../src/storage.test.ts), which run on both.
- That a sweep skips a reply a step holds rather than waiting for the step: **chosen** by this note. A batch that waits
  holds the rows it already locked while it waits, and a reply skipped is deleted by a later sweep, or by the step
  itself, which deletes its entity's replies past their time.

## Alternatives

- **The time in the outer `WHERE` of the `DELETE`.** PostgreSQL reads that `WHERE` again on the row committed, so it
  would fix the case too. It keeps a guard where decision 0284 says a condition is read from a row locked, and
  leaves the batch waiting for every step that holds one of its rows.
- **`FOR UPDATE` that waits.** It reads the row committed too, and makes a sweep wait for the steps.

## Consequences

- Bug 13 is fixed. Bug 49, a deadlock of the batch and a step's deletion of its entity's replies, is checked by a test
  of its own, since a batch now never waits for a reply's row and a step may still wait for a batch's.
- A sweep runs one batch more, the one that deletes nothing.
