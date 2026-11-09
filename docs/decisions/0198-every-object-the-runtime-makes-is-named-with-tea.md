# 0198. Every table, index, trigger and function the runtime makes is named with `tea_`

**Status:** accepted, 2026-11-08. Changes
[decision 0191](0191-a-launch-creates-the-tables.md), whose launch gives a database made before the columns it
lacks. Changes [decision 0145](archive/0145-a-page-is-read-as-ranges-of-its-index.md),
[decision 0158](archive/0158-an-older-database-of-sqlite-is-given-request-id-and-a-page-keeps-the-level-of-a-callers-transaction.md),
[decision 0161](archive/0161-on-cluster-a-step-settles-the-machine-by-the-count-of-the-steps-that-wrote-it.md) and
[decision 0176](archive/0176-on-cluster-a-rename-marks-the-old-name-and-keeps-its-door.md), each of which gave a
database made before an index or a column of its own.
[Decision 0218](0218-the-prefix-is-effecttea-and-a-launch-dies-on-a-name-taken.md) makes the prefix `effecttea_`,
since `tea` is a common word, and makes a launch die on a name the runtime's objects would take.

## Context

The roadmap's guide tells whoever writes a program that a row with no life of its own, such as a customer, is a
table of the application, and that the table may live in the runtime's database. A consumer's store may already
live there, since `ack` joins a transaction the caller left open on the runtime's client
([decision 0150](archive/0150-a-count-per-value-of-an-index-is-read-in-one-statement.md)).

The runtime named its sixteen tables `entities`, `entity_keys`, `mailbox`, `replies`, `projections`,
`publications`, `outbox`, `log`, `heads`, `consumers`, `cursors`, and on Cluster `versions`, `runner_versions`,
`waiting`, `sent_requests` and `given_requests`. `createTables` created each with `CREATE TABLE IF NOT EXISTS`, so a
table of the application under one of those names was taken for the runtime's own, without an error:

- a launch gave an application's `versions` the column `renamed_to`, and a launch on Cluster then wrote the versions
  of its programs in it, and read them back as its own;
- a launch gave an application's `entities` the column `steps`, and on SQLite an application's `replies` the column
  `request_id`, filled by an `UPDATE` of its rows;
- a rename moved the rows of every table it names whose column `name` held the old name, an application's
  `consumers` included;
- on SQLite a launch dropped any index named `replies_request_id`, and on PostgreSQL it replaced any function named
  `outbox_drops_its_publication`.

`log`, `versions` and `consumers` are names an application plausibly uses. The library has no release yet, so no
database of a user holds the tables under their old names.

## Decision

- **Every table, index, trigger and function the runtime makes is named with `tea_`**: `tea_entities`,
  `tea_log`, `tea_outbox_topic`, `tea_outbox_drops_its_publication`, and an index of a program's read model
  `"tea_projections <program> <index> by id"`. The prefix is the package's word, as Cluster's tables are named with
  `cluster_`. SQLite's own objects, `sqlite_sequence` and the indexes it makes for a primary key, are named by SQLite.
- **The prefix is fixed.** It is no option of the launch. A name the runtime uses is part of what a release reads, as
  the names of the singletons on Cluster are ([decision 0195](0195-the-package-is-effect-tea-persistent.md)).
- **A launch creates the tables where they are missing, and adds no column.** No database holds the tables under
  their new names with fewer columns than this release gives them, so the checks of a column a database made before
  lacked go, with their tests: `steps` of `tea_entities`, `request_id` of `tea_replies`, `renamed_to` of
  `tea_versions`, and the index of a read model without the id. `createTables` stays one transaction, under an
  advisory lock on PostgreSQL, so that two launches on one database create each table once.
- **A database made before keeps its tables under their old names, and a launch of this release does not read
  them.** It starts on new tables, as on an empty database. No such database belongs to a user.

## What it rests on

- That every object the runtime makes is named with `tea_`: **tested** by
  `every table, index, trigger and function the runtime makes is named with tea_` in
  [`src/storage.test.ts`](../../src/storage.test.ts), on SQLite and on PostgreSQL, which reads `sqlite_master`, and
  `pg_class`, `pg_proc` and `pg_trigger`.
- That a launch and a rename leave alone a table of the application under a name the runtime once used: **tested** by
  `a launch and a rename leave alone the tables of an application named as the runtime once named its own` in
  [`src/storage.test.ts`](../../src/storage.test.ts), on both dialects. Run against the code before this note, both
  tests fail.
- That no database of a user holds the tables under their old names: **documented**, since the package has no
  release ([`README.md`](../../README.md)).
- That an application names no table of its own with `tea_`: **only reasoned**. The guide says the prefix is the
  runtime's.

## Alternatives

Each structure of Effect that could do the work was weighed.

- **A prefix the launch takes, as `SqlMessageStorage` and `SqlRunnerStorage` of `effect/cluster` take `prefix`.** It
  lets two runtimes share one database. A runtime holds its database
  ([decision 0080](archive/0080-a-database-is-held-by-one-runtime.md)), so two runtimes never share one. Every
  statement would interpolate its tables, and the runtime already reads Cluster's tables under the default prefix
  alone ([decision 0169](archive/0169-on-cluster-an-operations-request-ids-are-kept-under-its-work-and-deleted-with-it.md)).
- **`Migrator` of `effect/sql`.** It records numbered migrations in a table of its own, and decides nothing of the
  names of the tables it creates. Whether the library adopts it stays an
  [open question](../open-questions.md#storage-and-reading).
- **A schema of PostgreSQL of the runtime's own.** SQLite has none, and the storage writes one statement for both
  dialects ([decision 0157](archive/0157-the-storage-speaks-sqlite-and-postgresql.md)).
- **The names kept, and a launch that reads the columns of each table it finds and dies on a table it did not
  make.** A table whose columns happen to be the runtime's passes the check. Each launch reads every table, and a
  later release that adds a column must tell a table made by an older release from a foreign one.
- **The names kept, and the guide listing them.** An application that never read the guide loses a column of its
  `versions` without an error.

## Consequences

- Every statement of [`src/storage.ts`](../../src/storage.ts) and of the tests names the tables with the prefix.
  The spikes that read the runtime's database do too. The spikes that make tables of their own keep their names.
- The design says the prefix under The tables, and the README's diagram of the modules names the tables with it.
- The open question of `Migrator` no longer speaks of the checks of each column, which are gone.
