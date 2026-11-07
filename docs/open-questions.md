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
- **What the runtime tells a tracer.** The runtime opens no span and records no metric of its own: `src/` calls
  neither `Effect.withSpan` nor `Metric`. A deployment sees only the spans Effect opens beneath the runtime: a
  statement of `effect/sql`, a request of `effect/rpc`, and a message to an entity of Cluster. So a step, an
  operation, a timer's firing and a suspension are no span, and the length of a mailbox or the age of the oldest
  row a consumer has not read is no metric. Which spans and metrics the runtime records, under which names, and
  whether a span follows a request into the operation it sets going, is not decided. It would be decided by:
  - the questions an operator asks of a stuck entity, such as why an order did not move, each answered by a span
    or a metric of the machine's events;
  - whether a span opened in the loop of `src/runtime.ts` adds a point where fibers yield, after which the pinned
    seeds of the explored tests are found again;
  - the modules of `effect/observability`, `OtlpTracer`, `OtlpMetrics` and `PrometheusMetrics`, which export what
    the runtime records and need only its names.

## Naming

- The name of the library, once there is code to publish.
