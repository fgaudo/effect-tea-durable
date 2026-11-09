# 0191. A launch creates the tables, in one transaction, unless it is told they exist

**Status:** accepted, 2026-11-08, with the step The API before the release of the [roadmap](../roadmap.md). Changes
[decision 0055](archive/0055-the-public-surface-is-what-its-users-use.md), whose operator creates the tables, and
[decision 0158](archive/0158-an-older-database-of-sqlite-is-given-request-id-and-a-page-keeps-the-level-of-a-callers-transaction.md),
whose column `request_id` is added and filled by two statements that commit apart. [Decision 0198](0198-every-object-the-runtime-makes-is-named-with-tea.md) names every table with `tea_`, and a launch adds no column: a database made before keeps its tables under their old names.
[Decision 0216](0216-the-tables-are-made-by-effects-migrator.md) runs the migrations with `Migrator`, in place of the
transaction and the lock this note writes, and lets a role of rows run `createTables` where every migration is
recorded.

## Context

Every example called `createTables` before `launch`, and a launch on a database without its tables died on its
first statement. A launch on Cluster already had its tables, since `sharding` creates them before any runner
registers. On one process the call was a step every application had to remember, and a step it could get wrong:
an application that upgraded the library and forgot it launched on a database without the columns the release adds.

`createTables` ran its statements one by one, each committed alone. Two defects followed from it.

- Two launches on one database made before both found a column missing, and both added it. The second died on
  `duplicate column name`. On Cluster this happens when two runners start at once on a file of an older release.
- A crash between the statement that adds `request_id` to the replies and the statement that fills it left the
  column added and empty. The next `createTables` found the column, and filled nothing. So a caller's retry, under
  a version of the program after the one that wrote its reply, found no reply and ran its message again.

A role of PostgreSQL that may only read and write rows may not run `createTables`, even where every table exists.
`CREATE TABLE IF NOT EXISTS` checks the right to create in the schema before it looks for the table, and
`ALTER TABLE` and `CREATE INDEX` need the table's owner. A deployment that runs the application under such a role
and creates the tables under their owner is common on PostgreSQL.

## Decision

- **A launch creates the tables, once it holds the database.** `launch` runs `createTables` after `hold` and before
  anything else reads a table. A launch refused, since another runtime or connection holds the database, writes
  nothing to it. On Cluster `launchOnCluster` runs it too, after `sharding` did, so a runtime never relies on its
  launcher for the tables.
- **`createTables` is one transaction.** On SQLite the transaction begins with `BEGIN IMMEDIATE`, which takes the
  file's write lock, so a second launch looks for a column only once the first has committed. The driver begins so
  by default, and the code asks for it by name, as `recordVersions` does. On PostgreSQL the transaction takes an
  advisory lock of its own, `pg_advisory_xact_lock`, under a key that is not the one `hold` takes. A launch holds
  the database by one connection and creates the tables by another, and the same key would make the launch wait for
  itself. A crash in the transaction leaves the database as it was, and the next launch does all of it again.
- **`tables: 'existing'` creates nothing.** `Options.tables` is `'create'` by default. A launch given `'existing'`
  runs no `createTables`, and dies where a table is missing. An operator then runs `createTables` under the owner of
  the tables, before the first launch of each new release of the library. Any other value is the launcher's defect.
  On Cluster `sharding` creates the tables whatever a launch is given, since the runners share a file of SQLite,
  which has no roles.
- **`createTables` stays exported, for that operator.** Decision 0055 kept it since an operator creates the tables.
  The operator now runs it only where the application's role may not.

## What it rests on

- That two `createTables` at once on a database made before both add a column, and that one transaction keeps the
  second from it: **tested** by `two launches on a database made before add a missing column once` in
  [`src/storage.test.ts`](../../src/storage.test.ts). Without the transaction, seed 45 of the prioritized schedules
  had the second look before the first added the column, and the second died on `duplicate column name: steps`.
  The test runs two fibers on one client, whose transactions wait for each other on the client's semaphore. Two
  processes wait instead on the file's write lock, which `BEGIN IMMEDIATE` takes as it begins: **documented** by
  SQLite, and the client's `busyTimeout` of five seconds is how long the second waits.
- That a failure between adding `request_id` and filling it leaves neither: **tested** by `a launch that fails while
  it fills a column it added leaves the column out` in [`src/storage.test.ts`](../../src/storage.test.ts), where a
  trigger of the test fails the filling. Without the transaction the column stayed added and empty. That SQLite
  rolls back an `ALTER TABLE` with its transaction is **documented** by SQLite, and seen in the test.
- That a launch creates the tables once it holds the database, and a launch refused creates none: **tested** by `a
  launch creates the tables of a new database, and a launch refused creates none` in
  [`src/runtime.test.ts`](../../src/runtime.test.ts). With the tables created before the hold, the test found them in
  the file the refused launch left.
- That a role of PostgreSQL granted the rows alone may not run `createTables` where the tables exist, and runs a
  runtime launched with `tables: 'existing'`: **seen** in
  [`spikes/pglite-role-without-ddl.test.ts`](../../spikes/pglite-role-without-ddl.test.ts) on PGlite 0.5.15, which is
  PostgreSQL 18. That the runtime's statements need no right beyond the rows of each table rests on it too: the
  spike creates an entity and steps it under the role.
- That `SqlClient.BeginTransaction` sets the statement a top-level transaction begins with: **documented** in its
  JSDoc in `node_modules/effect/src/sql/SqlClient.ts` at 4.1.2.
- That the advisory lock of the transaction is let go at its end, commit or rollback: **documented** by PostgreSQL
  for `pg_advisory_xact_lock`. Two launches on one database of PostgreSQL never run `createTables` at once on one
  process, since `hold` refuses the second first. The lock is for `sharding` and `launchOnCluster` on PostgreSQL,
  and for an operator's `createTables` run while a launch runs it: **only reasoned**, since PGlite runs on one
  session and a server with many connections waits for the CI of the [roadmap](../roadmap.md).
- That the schedules of the two seeds pinned in [`src/runtime.test.ts`](../../src/runtime.test.ts), 818138843 and
  169, are the same with the launch's `createTables`: **seen**, by the hash of every decision each run asked with its
  window open, before the change and after. Both tests begin with the window closed, so the launch runs in order and
  asks no decision of the strategy.

## Alternatives

Each structure of Effect that creates or migrates tables was weighed.

- **`Migrator` of `effect/sql`.** It records each migration by its number in a table of its own, and runs those
  not recorded in a transaction, under a lock of the table on PostgreSQL. It would replace the checks of each
  column with numbered migrations. The tables of a database made before have no record of a migration, so the first
  migration would still be written with `IF NOT EXISTS`, and the checks would stay for the databases of the releases
  before. Its lock and its transaction are what this note adds by hand in a few lines. The module is
  `@stability unstable`, and `src/` imports `effect/sql` already, so the choice waits for a migration that a check
  of a column cannot write, such as one that rewrites rows across tables.
- **The README says to call `createTables`, and `launch` creates nothing.** The examples showed it, and an
  application that upgrades the library has to remember it at each release. The launch knows every table it reads.
- **`launch` checks that the tables exist, and dies with a message that names `createTables`.** It reads every
  table and column the release needs, which is the same list as `createTables`, written a second time.
- **A role of PostgreSQL without the rights is refused by the library.** The role is the deployment's choice, and
  a runtime that only reads and writes rows needs no more.
- **`createTables` that tolerates `duplicate column name`, without a transaction.** It fixes the race of two launches,
  and leaves the crash between adding `request_id` and filling it.
