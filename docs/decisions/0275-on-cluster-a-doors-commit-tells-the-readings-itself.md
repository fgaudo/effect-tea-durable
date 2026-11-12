# 0275. On Cluster, a door's commit tells the readings itself

**Status:** accepted, 2026-11-12, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the fix of bug 92. It changes
[decision 0161](archive/0161-on-cluster-a-step-settles-the-machine-by-the-count-of-the-steps-that-wrote-it.md): the
readings that wait are told of a door's commit by the commit's callback, and no longer by the loop's `Settle` alone.
The maintainer chose it on 2026-11-12, after an opinion of a Fable 5.2 agent.

## Context

A reading that waits, a `fetch` given a wait or a reader of `consume` with `wait: true`, is woken by the commit of a
row of its topic ([decisions 0142](archive/0142-a-consumer-waits-for-a-row-of-its-topic.md),
[0184](0184-consume-runs-a-reader-of-a-consumer.md)). Only another runner's commit reaches it through the watcher
([decision 0163](archive/0163-on-cluster-a-reading-that-waits-learns-of-another-runners-commit-from-the-file.md)),
since `PRAGMA data_version` does not move at the commits of the runner's own connection.

On Cluster a door's step writes in Cluster's transaction, and leaves its machine uncommitted. The commit's callback
offers the loop a `Settle`, and the loop's `Settle` makes the machine the entity's once the count of the steps stored
proves the commit (decision 0161). That `Settle` told the readings. An entity that crashes before its `Settle` drops
the uncommitted machine, and nobody told the readings. A reading of this runner then waited for a row already
committed until another commit of its topic. The entity crashes so when the guard refuses the loop's `Settle`
([decision 0175](archive/0175-on-cluster-every-step-checks-the-newest-version-and-the-shards-lease.md)), or when the
shard is let go between the door's commit and the `Settle`. The door gives the entity's lock back inside the
transaction, so the shard may also be let go before the commit itself. That is bug 92 of the roadmap.

## Decision

- **A reading that waits is told of a door's commit by the commit's callback, once the `COMMIT` returns.** The
  callback that `finishIn` of `src/runtime/doors.ts` registers with `afterCommit` tells the readings of every topic the
  steps of the transaction wrote, then offers the loop its `Settle`. The tell needs the readings, the program's name
  and what was written, so it does not depend on the entity being still loaded. A door's step, a creation through the
  door and an activation on Cluster all end in `finishIn`, so the rule is kept in that one place.
- **`settle` tells the readings again.** A callback is lost where the outcome of the `COMMIT` is unknown, and the next
  `settle` that proves the commit is then the only tell. A reading told twice reads again, finds its row or waits
  again, so a second tell costs one reading.
- **A crash tells nobody.** A crash may run before the door's commit, since the door gives the entity's lock back
  inside the transaction, and a tell before the commit would let a reading read nothing and wait again.

The decision leaves out a `COMMIT` whose outcome is unknown, after which the entity crashes before any `settle`. The
row may be committed, and no reading of this runner is told. It goes in the [open questions](../open-questions.md),
under A reader with no time that misses a commit. It leaves out bug 39 too, a commit of another runner on PostgreSQL,
which the watcher does not see.

## Alternatives

- **A crash tells the readings of its uncommitted machine.** Rejected: the crash may run before the commit, as said
  above, and a reading on a pool of PostgreSQL then reads nothing and waits again. A rollback would also tell.
- **`wait: true` reads again at an interval of its own**, as the timed wait of 0142 did. Rejected for this bug: it costs
  a query per reader per interval for ever, to hold a case one tell holds. It stays a way to decide bug 39.

## What it rests on

- That a reading of this runner is given the row a door committed, though the entity crashes before the loop's
  `Settle`, whether the guard refuses that `Settle` or the shard is let go while the door's transaction is open:
  **tested** by `a reading is told of the row a door committed, though its entity crashes before the loop settles it`,
  in [`src/runtime/readings.test.ts`](../../src/runtime/readings.test.ts), in its two cases `refused` and `lost`, on
  SQLite and on PGlite. Both cases failed on the code before this note. The case `refused` was the `test.failing` of
  bug 92.
- That a callback of `afterCommit` runs only once the `COMMIT` succeeds, before `withTransaction` returns, and is
  discarded on a rollback: **documented** by the JSDoc of `afterCommit` in `SqlClient.ts` of Effect 4.1.3, "Callbacks
  are discarded if the transaction rolls back or its `COMMIT` fails". So a rollback tells no reading.
- That a callback runs though the fiber of the transaction was interrupted: **documented** by the same JSDoc, "After
  `COMMIT`, callbacks run uninterruptibly, even if the fiber was interrupted".
- That Cluster's transaction and the runtime's `transaction` keep their callbacks until the commit:
  **read in the source**, since both call `withTransaction` of a client that `SqlClient.make` builds through
  `makeWithTransaction`.
  Decision 0161 rests on the same premise for the `Settle`. The test above does not hold it: on one connection a
  reading told before the commit waits for the transaction, and reads the row all the same.
- That a reading takes what it waits for before it reads, so a tell between its page and its wait wakes it: **tested**
  by `a reading is woken by a commit of another runner between its page and its wait, under prioritized schedules`,
  in the same file.
