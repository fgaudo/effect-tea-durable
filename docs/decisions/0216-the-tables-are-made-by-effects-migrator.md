# 0216. The tables are made by Effect's `Migrator`, which records each migration in `tea_migrations`

**Status:** accepted, 2026-11-09. Changes [decision 0191](0191-a-launch-creates-the-tables.md), whose transaction
and advisory lock `createTables` wrote by hand, and whose role of PostgreSQL that may only read and write rows could
not run `createTables` where every table exists. Changes
[decision 0215](0215-the-runtimes-tables-are-made-in-the-schema-of-the-search-path.md), whose lock of `createTables`
was the database's.

## Context

`createTables` created the tables where they were missing, in one transaction under a lock of its own, and added no
column, since no database holds an older schema of the tables named with `tea_`
([decision 0198](0198-every-object-the-runtime-makes-is-named-with-tea.md)). A release that changes a table needs a
way to change it, and to know whether a database has the change already. Decision 0191 weighed `Migrator` of
`effect/sql` and left it for the first migration that a check of a column cannot write.

Three facts moved the question.

- Cluster migrates its own tables with `Migrator` at 4.1.2. `SqlMessageStorage` and `SqlRunnerStorage` record their
  migrations in `cluster_migrations` and `cluster_runner_migrations`. Each lets an owner run the migrations at
  deploy, apart from the storage that a role of rows runs, as `createTables` and `tables: 'existing'` are run.
- No database holds the tables of a release yet, so a first migration can be the schema as it is, with nothing to
  carry over.
- The module is `@stability unstable`. The maintainer agreed on 2026-11-09 that `src/` import it. `src/` imports
  `SqlClient` of the same family already, and the runtime on Cluster runs `Migrator` through Cluster's storage.

## Decision

- **`createTables` runs `Migrator`.** Its migrations are a record of `Migrator.fromRecord`, and its history is the
  table `tea_migrations`. Neither `Migrator`'s default table, `effect_sql_migrations`, nor Cluster's tables have that
  name. The first migration, `0001_tables`, is the schema of the first release. It keeps `IF NOT EXISTS`, so that a
  database made by an earlier commit gets its record without an error. A later change of a table is a migration
  after it, numbered in order, and `0001_tables` is never changed once released.
- **The pending migrations run in one transaction.** `Migrator` records them and runs them in that transaction, so a
  migration that fails leaves neither its changes nor its record. On SQLite the transaction begins with
  `BEGIN IMMEDIATE`, which the driver does by default and `createTables` asks for by name. A second launch then waits
  on the file's write lock until the first commits, finds every migration recorded, and runs none. On PostgreSQL
  `Migrator` takes `LOCK TABLE tea_migrations IN ACCESS EXCLUSIVE MODE` in the transaction, in place of the advisory
  lock of decision 0191.
- **`tables: 'existing'` stays as decision 0191 has it.** A launch given it runs no migration. An operator runs
  `createTables` under the tables' owner before each launch of a new release. Under a role of rows, `createTables`
  now succeeds where every migration is recorded, and dies on a pending one without recording it.
- **The indexes of each program stay outside the migrations.** A deploy makes them, as before.
- **`tea_migrations` is `Migrator`'s table.** Its columns are the ones `Migrator` makes. On PostgreSQL its column
  `name` keeps the database's collation, and not the `C` of every other text column
  ([decision 0157](archive/0157-the-storage-speaks-sqlite-and-postgresql.md)): `Migrator` orders the history by
  `migration_id`, and nothing of the runtime compares the text of the table.

## What it rests on

- That a second run on a file of SQLite waits until the first commits, then runs nothing: **seen** in
  [`spikes/migrator-two-runs-at-once.test.ts`](../../spikes/migrator-two-runs-at-once.test.ts), with the first run
  in another process that waits inside its migration.
- That a run begun with `BEGIN` dies at once with `LockTimeoutError` while another runs: **seen** in the same spike.
  This is why `createTables` asks for `BEGIN IMMEDIATE` by name.
- That a run that waits longer than the client's `busyTimeout` dies and runs nothing: **seen** in the same spike. A
  launch dies so, as under decision 0191.
- That `BeginTransaction` sets how `Migrator`'s transaction begins: **documented** in the JSDoc of `BeginTransaction`
  in `node_modules/effect/src/sql/SqlClient.ts` at 4.1.2, and **read in source**: `Migrator` begins its
  transaction with `sql.withTransaction`, which reads the reference.
- That a role of rows runs migrations already recorded, and fails on a pending one without recording it: **seen** in
  the same spike and in [`spikes/pglite-role-without-ddl.test.ts`](../../spikes/pglite-role-without-ddl.test.ts), on
  PGlite 0.5.15.
- That two runs at once on PostgreSQL wait for each other on the lock of `tea_migrations`: **read in source** of
  `Migrator` at 4.1.2, and **only reasoned**, since PGlite runs one session. On a server, a concurrent creation of
  `tea_migrations` itself is tolerated: `Migrator` creates the table outside the transaction, and looks for it again
  when the creation fails. It is an [open question](../open-questions.md#running), with PostgreSQL on a server.
- That `tea_migrations` is made in the schema of the `search_path`: **tested** by
  `on PostgreSQL every object the runtime makes is in the schema its client’s search_path names` in
  [`src/storage.test.ts`](../../src/storage.test.ts), which finds every relation named with `tea_` there.
- That the runtime's tests, the pinned seeds among them, pass with `Migrator` in the launch: **tested** by `bun test`.
  Whether the schedules of the pinned seeds are the same was not compared.

## Alternatives

- **`createTables` by hand, as decision 0191 has it.** Each later change would need a check of what a database
  holds, written for that change. `Migrator` records what ran, with the lock and the transaction this note no longer
  writes.
- **`SqliteMigrator` of `@effect/sql-sqlite-bun` and `PgliteMigrator` of `@effect/sql-pglite`.** Each ties the
  storage to one driver. Their only addition is a dump of the schema through a command line tool. The storage speaks
  to a `SqlClient` alone.
- **`MigratorFileSystem` and `Migrator.fromGlob`.** They load the migrations from files. The library's migrations
  are code of the library.
- **Cluster's loaders of its own tables.** They make only Cluster's tables.
- **`tables: 'existing'` runs the migrations, and dies on a pending one.** It would tell an operator who forgot the
  migrations of a release. Until a release adds a second migration, no launch meets a pending one, so it waits for
  that release.

## Consequences

- The design says, under Where it runs, that the launch runs the migrations not yet recorded.
- A release that changes a table adds a migration, and a test that runs it on a database of the release before.
- A release older than a database's latest migration launches on it, and runs nothing. Nothing refuses it.
