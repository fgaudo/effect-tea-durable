# Open questions

What is not decided yet. A question leaves this file when a note in [`decisions/`](decisions) decides it.

## Storage and reading

- **A disk that is really full.** A step that cannot commit dies, and a forget and a prune free the room steps need
  ([decision 0152](decisions/0152-the-consumers-of-a-topic-are-declared-at-deploy.md)). The spike `spikes/full-database.test.ts` sees it
  under `PRAGMA max_page_count`, with the rollback journal, which caps the database file and not its journal. On a
  disk that is really full a delete needs room in the journal too, and in WAL mode, the client's default, the rows
  go to the WAL, which `max_page_count` does not cap. Whether a prune can still run there, and what an operator does
  where it cannot, is not decided. It would be decided by:
  - a database on a volume of fixed size, in WAL mode, filled under a consumer that stalled, and the forget and the
    prune run on it;
  - whether the runtime keeps room of its own, a file it drops once the disk is full, so that a prune always has
    the room it needs.
- **Generated cases of a migration.** A case of a migration is recorded by hand, with the JSON a version wrote and
  the JSON the next one reads
  ([decision 0126](decisions/0126-a-program-keeps-every-migration-and-a-test-records-what-each-did.md)). A changed
  migration that keeps every recorded case is not seen. That a row of an older version is still read at the
  program's version needs no recorded reading: a generated value of the older version, migrated and decoded,
  must not die. A case without `read` would check that alone, over values a property test generates. But an
  arbitrary of an older version's JSON is a shape of that version kept in the tests for as long as the
  migration, which decision 0036 keeps out of the code. Whether it is worth it is not decided. It would be decided by:
  - a program with a migration of many branches, whose recorded cases a change could keep while it reads other
    rows otherwise;
  - what an arbitrary of an older version costs to keep, next to the cases recorded of it.

## Running

- **PostgreSQL with many connections.** The storage's tests run on PGlite, which runs one statement at a time on
  one session ([decision 0157](decisions/0157-the-storage-speaks-sqlite-and-postgresql.md)). On a server with a
  pool, steps of different entities commit at once. That the head of a partition still orders the commits of its
  steps, that a session advisory lock holds the database, that a page read at `REPEATABLE READ` gives a row once, and
  what a deadlock or a failure of serialization does to a step, are only reasoned. A page read inside a transaction
  the caller left open reads at the caller's level, and at PostgreSQL's default a step committed between two of its
  parts may move a row into it twice
  ([decision 0158](decisions/0158-an-older-database-of-sqlite-is-given-request-id-and-a-page-keeps-the-level-of-a-callers-transaction.md)).
  It would be decided by:
  - the storage's tests and the runtime's tests of the log run against a server, in CI or by hand;
  - a test with two writers of one partition, which checks that its steps commit in the order of their `seq`. On
    SQLite and on PGlite two writers commit one after the other whatever the head does, so only a server runs it
    ([decision 0162](decisions/0162-on-cluster-an-entitys-shard-is-its-partition-and-each-deployment-serves-its-shards.md));
  - whether a step whose transaction fails with `DeadlockError` or `SerializationError` is retried, as the JSDoc of
    `SqlClient.withTransaction` shows, or crashes its entity, as a write that fails does.
- **A fiber that outlives its transaction.** A fiber forked inside a transaction keeps the transaction's connection
  in its context. At 4.1.2 its statements and savepoints then run on that connection after the commit, outside the
  client's semaphore, and nothing says so: on SQLite another fiber's transaction later fails to begin. The runtime
  forks every fiber a step sets going without the transaction
  ([decision 0161](decisions/0161-on-cluster-a-step-settles-the-machine-by-the-count-of-the-steps-that-wrote-it.md)),
  and a test holds the rule for the operations and for the loop. A fork that the tests do not reach would still fail
  in silence. Reported as [Effect-TS/effect#10431](https://github.com/Effect-TS/effect/issues/10431), with
  [Effect-TS/effect#10433](https://github.com/Effect-TS/effect/pull/10433) open on 2026-11-07, which makes such a
  statement fail with a `SqlError`. It would be decided by:
  - a release of Effect with the fix, after which a fork that keeps the transaction fails where it runs;
  - the spikes and the tests of the runtime run at that release, which a fork the rule missed would then fail.
- **A step on Cluster that is not a door's, and the shard's lease.** On Cluster only a door's step reads the
  newest version recorded in its transaction
  ([decision 0159](decisions/0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md)). A step
  of the entity's own loop, as a timer or an operation's completion, and the `Restart` of an activation commit
  without it (`applyOnCluster` and `activateOnCluster` in `src/runtime.ts`). So an older runner still steps the
  entities it holds until the health check takes its shards. No step reads the shard's lease in `cluster_locks`
  either, which [decision 0092](decisions/0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md)
  found a transaction can read, and which
  [decision 0162](decisions/0162-on-cluster-an-entitys-shard-is-its-partition-and-each-deployment-serves-its-shards.md)
  names the guard of a runner whose finalizer did not run. The count of `steps`
  ([decision 0161](decisions/0161-on-cluster-a-step-settles-the-machine-by-the-count-of-the-steps-that-wrote-it.md))
  refuses a row another runner wrote, so no row is lost. What the gap costs is a step of an older version, and a
  frozen runner's step where the other runner has not written yet. It would be decided by:
  - a test with two runners on one file, in which a timer of an entity the older runner holds falls due after a
    newer launch is recorded, and fails where the loop's step commits;
  - whether the version and the lease are read by `settle`, which every step on Cluster runs first in its
    transaction, so that one check covers the door, the loop and an activation;
  - whether a lease read in the step's transaction is a premise of Cluster's storage that no release promises, and
    so a guard beside the count, or the fence of
    [Effect-TS/effect#10058](https://github.com/Effect-TS/effect/issues/10058) to wait for.
- **A rename on Cluster.** A launch's `renames` move the runtime's rows to the new name, in one transaction
  ([decision 0156](decisions/0156-a-program-is-renamed-by-its-launch-and-keeps-its-keys.md)). Cluster's rows of a
  door's requests, in `cluster_messages` and `cluster_replies`, are stored under the entity's type, which is the
  program's name, and nothing moves them. A request saved and not yet delivered under the old name is then never
  delivered, and a retry under the new name is a new request to Cluster, answered from the runtime's replies. No
  test runs a rename on Cluster. It would be decided by:
  - whether a launch on Cluster with `renames` dies until a rename moves Cluster's rows, as a guard of a few lines;
  - whether the runtime writes Cluster's tables, whose names and columns are read in Cluster's source and are no
    stable API ([decision 0169](decisions/0169-on-cluster-an-operations-request-ids-are-kept-under-its-work-and-deleted-with-it.md)),
    or a rename waits for the old type's requests to be delivered first;
  - a test with two runners, in which a message saved for the old name is delivered after the launch that renames.
- **Bookkeeping in transactions.** What another fiber reads changes in one synchronous step
  ([decision 0068](decisions/archive/0068-what-another-fiber-reads-changes-in-one-step.md)): a rule kept by hand, which
  a step that waits cannot keep. The waker reads the entities held and then waits for a poke, and only the steps
  between the two keep a timer from being slept past. Effect's `Tx` modules (`TxRef`, `TxHashMap`, `Effect.tx`,
  `Effect.txRetry`) would make the reading and the wait one transaction, and `settled` a wait on a condition. A
  transaction does no I/O, so an entity's lock stays
  ([decision 0067](decisions/archive/0067-each-entity-is-held-by-its-own-lock.md)), and holds in one process only. Is it
  worth it once the runtime is whole, and once Effect Cluster says what bookkeeping a node keeps? The tests that
  run the runtime under prioritized schedules are what such a rewrite is checked against, and the two interleavings
  [decision 0104](decisions/archive/0104-the-runtimes-tests-choose-where-fibers-yield.md) reached are of the same kind:
  either way they stay to be reached by a test, and what changes is the rule each test takes out. What a rewrite
  would be, and what the spike `spikes/effect-tx-under-the-scheduler.test.ts` saw of it under the scheduler of 0104:
  - an operation that sends a message to a suspended entity waits for that entity's resumption (`awaitResumption` in
    `src/runtime.ts`). The operation would read a count of resumptions in a `TxRef`, and wait with `txRetry` while
    the count is unchanged. The `Deferred` each waiting operation registers today would go. A list of the waiting
    operations would stay, since `suspended` shows them to an operator
    ([decision 0114](decisions/0114-an-operator-sees-the-suspended-entities-and-what-a-resume-did.md)).
    `txRetry` checks what it read and registers its wait in one synchronous step (`awaitPendingTransaction` in
    `effect/src/Effect.ts`, read in the source). A rule stays: the count is read before the send, or a resumption
    between the answer and the read is missed, and the operation waits for one that may never come. The spike runs
    both orders. With the count read first, no resumption is missed in any schedule within 3 deviations or among
    500 prioritized ones, and the schedules reach a resumption before the send, one between the answer and the wait,
    and one during the wait. With the count read after the answer, the operation waits for ever in a schedule within
    1 deviation;
  - a commit's wake is a task of the committing fiber's dispatcher, so the tests pick when it runs. `commitTransaction`
    calls `scheduleTask`, read in the source. The spike sees it: a run under `scheduled` ends, with no timer and no
    microtask, after its body waited on `txRetry`;
  - a conflict reruns an attempt at most once, however many commits fall in it, and only after a commit of a value
    it read. So the k-th body to commit reruns k - 1 times at most. In the spike, three bodies that yield between
    their read and their write rerun from 0 to 3 times in all, and lose no update;
  - an entity's lock (`holding`) would be a `TxHashSet` of the entities held, taken by one transaction that retries
    while the entity is in it and given back by another, held between the two across the I/O, with no count of users
    to keep. Such a lock does not serve its waiters in order. A commit wakes every waiter, and the first to run again
    takes the lock, so a waiter that came later can take it first, as the spike shows of a `TxSemaphore`. The
    `Semaphore` the runtime uses now serves its waiters in the order they came. The JSDoc of `Semaphore.take`
    promises it, and the spike sees it. With many waiters, each commit also runs every waiter's body again. Whether
    the runtime needs its callers served in order is not decided.

## Naming

- The name of the library, once there is code to publish.
