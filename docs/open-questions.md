# Open questions

What is not decided yet. A question leaves this file when a note in [`decisions/`](decisions) decides it.

## Storage and reading

- **The tables migrated by Effect's `Migrator`.** `createTables` checks each column a database made before lacks,
  and adds it, in one transaction under a lock of its own
  ([decision 0191](decisions/0191-a-launch-creates-the-tables.md)). `Migrator` of `effect/sql` runs numbered
  migrations, records each in a table of its own, and runs those not recorded in one transaction under a lock. The
  library has no release yet, so no database of a user holds an older schema. A first migration that is the schema
  of the first release would let the checks of each column go, with their tests, and each later change of the
  schema would be a migration. The indexes of each program, made at deploy, would stay outside it, and so would
  `tables: 'existing'`, since `Migrator` creates its own table. Whether the library adopts it before its release is
  not decided. It would be decided by:
  - the maintainer's agreement, since the module is `@stability unstable` and `src/` does not import it yet;
  - a spike of two runs at once on SQLite and on PostgreSQL, which sees whether the run that meets `Locked` goes on
    before the other has committed;
  - a name of its table that no `Migrator` of the application uses in the same database.

- **A disk that is really full.** A step that cannot commit dies, and a forget and a prune free the room steps need
  ([decision 0152](decisions/archive/0152-the-consumers-of-a-topic-are-declared-at-deploy.md)). The spike `spikes/full-database.test.ts` sees it
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
  ([decision 0126](decisions/archive/0126-a-program-keeps-every-migration-and-a-test-records-what-each-did.md)). A changed
  migration that keeps every recorded case is not seen. That a row of an older version is still read at the
  program's version needs no recorded reading: a generated value of the older version, migrated and decoded,
  must not die. A case without `read` would check that alone, over values a property test generates. But an
  arbitrary of an older version's JSON is a shape of that version kept in the tests for as long as the
  migration, which decision 0036 keeps out of the code. Whether it is worth it is not decided. It would be decided by:
  - a program with a migration of many branches, whose recorded cases a change could keep while it reads other
    rows otherwise;
  - what an arbitrary of an older version costs to keep, next to the cases recorded of it.
- **A caller that follows a projection.** A caller learns that an entity changed only by reading its projection
  again: `read` answers once, and the runtime writes the log without delivering it. A program of effect-tea in a
  browser would follow an entity with a subscription, and send to it with a command that retries under the same
  request id while the entity answers `Suspended`. That client would be a module of its own, which depends on both
  libraries while neither depends on the other. How a caller follows the changes of one projection, and whether the
  library ships that client, is not decided. It would be decided by:
  - whether a boundary reads the log as one consumer and sends each row to the callers that follow its entity, given
    that the consumers of a topic are declared at deploy
    ([decision 0152](decisions/archive/0152-the-consumers-of-a-topic-are-declared-at-deploy.md)) and a browser is not one;
  - what a caller that reconnects reads first, so that it misses no change between its last row and the next;
  - an example in which a program of effect-tea drives an entity of `examples/order`, whose view shows only the
    actions the projection allows.

## Running

- **PostgreSQL with many connections.** The storage's tests run on PGlite, which runs one statement at a time on
  one session ([decision 0157](decisions/archive/0157-the-storage-speaks-sqlite-and-postgresql.md)). On a server with a
  pool, steps of different entities commit at once. That the head of a partition still orders the commits of its
  steps, that a session advisory lock holds the database, that a page read at `REPEATABLE READ` gives a row once, and
  what a deadlock or a failure of serialization does to a step, are only reasoned. A page read inside a transaction
  the caller left open reads at the caller's level, and at PostgreSQL's default a step committed between two of its
  parts may move a row into it twice
  ([decision 0158](decisions/archive/0158-an-older-database-of-sqlite-is-given-request-id-and-a-page-keeps-the-level-of-a-callers-transaction.md)).
  It would be decided by:
  - the storage's tests and the runtime's tests of the log run against a server, in CI or by hand;
  - a test with two writers of one partition, which checks that its steps commit in the order of their `seq`. On
    SQLite and on PGlite two writers commit one after the other whatever the head does, so only a server runs it
    ([decision 0162](decisions/archive/0162-on-cluster-an-entitys-shard-is-its-partition-and-each-deployment-serves-its-shards.md));
  - whether a step whose transaction fails with `DeadlockError` or `SerializationError` is retried, as the JSDoc of
    `SqlClient.withTransaction` shows, or crashes its entity, as a write that fails does.
- **A fiber that outlives its transaction.** A fiber forked inside a transaction keeps the transaction's connection
  in its context. At 4.1.2 its statements and savepoints then run on that connection after the commit, outside the
  client's semaphore, and nothing says so: on SQLite another fiber's transaction later fails to begin. The runtime
  forks every fiber a step sets going without the transaction
  ([decision 0161](decisions/archive/0161-on-cluster-a-step-settles-the-machine-by-the-count-of-the-steps-that-wrote-it.md)),
  and a test holds the rule for the operations and for the loop. A fork that the tests do not reach would still fail
  in silence. Reported as [Effect-TS/effect#10431](https://github.com/Effect-TS/effect/issues/10431), with
  [Effect-TS/effect#10433](https://github.com/Effect-TS/effect/pull/10433) open on 2026-11-07, which makes such a
  statement fail with a `SqlError`. It would be decided by:
  - a release of Effect with the fix, after which a fork that keeps the transaction fails where it runs;
  - the spikes and the tests of the runtime run at that release, which a fork the rule missed would then fail.
- **A runner that stops on a signal.** A rolling deploy stops each runner with `SIGTERM`. `BunRuntime.runMain`
  interrupts the main fiber on `SIGINT` and `SIGTERM`, so the layer's scope closes. Cluster then unregisters the
  runner and lets its shards go before its lease expires. The tests of `examples/server` kill each runner with
  `SIGKILL` alone ([decision 0178](decisions/archive/0178-a-server-of-the-orders-on-cluster-is-run-as-a-process.md)), so that
  the orders of a runner that stops are taken by another one before its lease expires is only reasoned. So is what
  the runtime's planned stop does there, which drains the at-most-once operations and stops the rest at once
  ([decision 0119](decisions/archive/0119-a-planned-stop-drains-the-at-most-once-operations.md)). On Windows a child process
  is ended at once by any signal, so a test of the stop runs only elsewhere. It would be decided by:
  - a test of `examples/server` that stops one of two runners with `SIGTERM`, under a lease longer than the test, and
    checks that the other runner finishes the orders;
  - where such a test runs: in CI on Linux, or skipped on Windows by the test itself.
- **A timer and the wall clock.** A timer stores its time on the wall clock, and is slept as the milliseconds left
  when it is armed, measured on the host's timers ([decision 0194](decisions/0194-a-timer-months-away-sleeps-on-effects-promise-of-a-duration.md)). A host suspended
  during the sleep, a virtual machine paused, or a wall clock set back makes the sleep end late or early. A loaded
  entity's timer then fires when its sleep ends, and nothing checks its time against the clock: it fires late by the
  time the host was suspended, or early by a step of the clock back. The waker activates only the entities whose time
  has come on the wall clock, so it fires no timer early. It reads the clock again only when its sleep ends or it is
  poked, so it fires late by the time the host was suspended. It would be decided by:
  - whether a host that runs the library is suspended or set back by more than a program can bear, which the
    examples do not say;
  - whether the waker sleeps at most a bound, such as an hour, and reads the clock again, and whether a loaded
    entity's timer sleeps again when it ends before its time. Both add yields to the runtime, after which the
    pinned seeds of the explored tests are found again.
- **What the runtime tells a tracer.** The runtime opens no span and records no metric of its own: `src/` calls
  neither `Effect.withSpan` nor `Metric`. A deployment sees only the spans Effect opens beneath the runtime: a
  statement of `effect/sql`, a request of `effect/rpc`, and a message to an entity of Cluster. So a step, an
  operation, a timer's firing and a suspension are no span, and the length of a mailbox or the age of the oldest
  row a consumer has not read is no metric. Which spans and metrics the runtime records, under which names, and
  whether a span follows a request into the operation it sets going, is not decided. It would be decided by:
  - the questions an operator asks of a stuck entity, such as why an order did not move, each answered by a span
    or a metric of the machine's events;
  - whether a span opened in the loop of `src/loop.ts` adds a point where fibers yield, after which the pinned
    seeds of the explored tests are found again;
  - the modules of `effect/observability`, `OtlpTracer`, `OtlpMetrics` and `PrometheusMetrics`, which export what
    the runtime records and need only its names.

## Naming

- The name of the library, once there is code to publish.
