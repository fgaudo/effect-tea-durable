# 0157. The storage speaks SQLite and PostgreSQL, in the same tables

**Status:** proposed, 2026-11-06, for the step A store on PostgreSQL of the roadmap. Changes
[decision 0007](archive/0007-one-process-first.md), which puts the runtime on SQLite, and
[decision 0156](0156-a-program-is-renamed-by-its-launch-and-keeps-its-keys.md), whose rename rewrites a request in
the database.

## Context

The storage writes every statement in SQLite's dialect: `json_extract`, `json_set`, `INSERT OR REPLACE`, a trigger
written in SQL, `PRAGMA locking_mode`, `TOTAL`. A database of one file serves the processes of one machine. A
serious backend keeps its data on a database server, and Effect Cluster across machines needs a database its runners
share ([Cluster](../cluster.md)).

The runtime reaches the database through `SqlClient` alone
([decision 0019](archive/0019-unstable-effect-modules.md)). So the dialect is all a second database changes: the
runtime, the machine and the program stay as they are.

The spike [`spikes/pglite-dialect.test.ts`](../../spikes/pglite-dialect.test.ts) runs on PGlite the statements the
storage would write on PostgreSQL. PGlite is PostgreSQL compiled to run in the process. The spike sees five things
that differ from SQLite:

- jsonb writes its text again, with its keys in its own order and with spaces;
- jsonb orders null first, then strings, then numbers, then booleans, where SQLite reads a boolean as 1 or 0 and
  orders text after numbers;
- a parameter whose type PostgreSQL cannot infer, as in `$1 IS NULL`, is refused;
- a bigint is read as a number up to 2^53, and as a JS `bigint` past it;
- an advisory lock is taken again by the session that holds it, and PGlite runs every statement on one session.

## Decision

### Which databases

- **The storage speaks SQLite and PostgreSQL.** It reads the dialect from the client, and a statement that differs
  is written once per dialect with `sql.onDialectOrElse`, as Cluster's `SqlMessageStorage` does.
- **A launch on a client of any other dialect is the launcher's defect**, and names the dialect.
- **Both dialects hold the same tables, with the same columns.** A statement both dialects read alike is written
  once, so that each rule of the storage is written in one place.

### JSON

- **A JSON column is text on both dialects.** The runtime finds a stored reply by the text of its request
  ([decision 0065](archive/0065-the-machine-holds-no-replies.md)), and jsonb would write that text again. A
  statement of PostgreSQL that reads a field of a column casts the column to jsonb as it reads it.
- **On PostgreSQL a rename writes a request's text again in the process**, with `JSON.parse` and `JSON.stringify`,
  in the rename's transaction. jsonb's `jsonb_set` would give back another text. On SQLite a rename stays as
  decision 0156 decides.

### Indexes and queries

- **On PostgreSQL an index of the read model is an expression index of the index's jsonb value**, and a row that
  lacks the index reads as JSON's null, as on SQLite.
- **A query compares the index's jsonb value with the bound value as jsonb.** An integer beyond 2^53 is bound by
  the exact digits of its double, which are the digits the row holds
  ([decision 0146](0146-an-integer-beyond-2-53-is-written-with-its-exact-digits.md)).
- **The order of values of different kinds is the database's.** An index whose values are all of one kind is ordered
  alike on both dialects. On PostgreSQL `true` and `1` are two values in a criterion too.
- **On PostgreSQL the parts of a page are read in one transaction begun at `REPEATABLE READ`**, with
  `SqlClient.BeginTransaction`. At PostgreSQL's default level each statement reads its own snapshot, and a step
  between two parts would move a row into the page twice
  ([decision 0145](0145-a-page-is-read-as-ranges-of-its-index.md)).

### Holding the database

- **On PostgreSQL a runtime holds the database with a session advisory lock**, on a connection it reserves for its
  scope with `sql.reserve`. A second runtime on the database, in this process or another, finds the lock taken, and
  dies as it launches ([decision 0080](archive/0080-a-database-is-held-by-one-runtime.md)).
- **On PGlite the runtime holds the client in the process alone.** PGlite has one session, so an advisory lock
  would be taken again by a second runtime. Cluster's `SqlRunnerStorage` skips advisory locks on PGlite for the
  same reason.

### Integers

- **A time, a `seq` and a position are bigints on PostgreSQL.** A row gives each as a number or a bigint, and the
  storage reads both. A value past 2^53 is no row the runtime writes, and fails the call that meets it
  ([decision 0043](archive/0043-a-row-no-version-reads-fails-what-reads-it.md)).

### Tests

- **The tests of the storage run on both dialects**, PostgreSQL on PGlite. Each test of PostgreSQL starts from a
  copy of a database whose tables are created, which the spike sees take a fifth of the time of a new one.
- **The tests of the runtime run on SQLite, and a part of them on PGlite.** The rules of the runtime are the same
  on both dialects, so the tests run on PGlite are those whose steps write what differs: the read model, the log,
  the replies and the rename.

## What it rests on

- That jsonb writes its text again: **seen in the spike**.
- That jsonb orders kinds otherwise than SQLite, and that a key a row lacks reads as SQL's NULL: **seen in the
  spike**.
- That jsonb compares a number by its exact digits: **seen in the spike**, with 2^70.
- That a row trigger after a delete sees every row the statement deleted, so that a publication goes with the last
  row of the outbox that names it ([decision 0154](0154-a-steps-projection-is-stored-once-in-the-outbox.md)):
  **seen in the spike**.
- That a session advisory lock is held until its session ends: **only reasoned** on a server, since PGlite has one
  session. The spike sees PGlite give the lock again to its own session.
- That `REPEATABLE READ` gives every statement of a transaction its first snapshot: **only reasoned**, since PGlite
  runs one transaction at a time. The spike sees the level taken.
- That PGlite runs one statement at a time: **read in the source** of `@effect/sql-pglite` 4.1.2, whose client takes
  a semaphore of one permit for each statement and transaction.
- That a server with many connections runs steps of different entities at once, and that the head of a partition
  still orders the commits of its steps ([decision 0137](0137-the-log-is-ordered-within-a-partition.md)): **only
  reasoned**. No server runs in the tests, and the question goes in `docs/open-questions.md`.

## Alternatives

- **The structures of Effect.** Each module of the pinned version that does part of the work was weighed.
  `Statement`'s `onDialectOrElse` is used, as Cluster's `SqlMessageStorage` and `SqlRunnerStorage` use it.
  `SqlClient.reserve` is used, and keeps the connection that holds the advisory lock, as `SqlRunnerStorage` keeps
  its own. `SqlClient.BeginTransaction` is used, and begins a page's transaction at its level. `SqlClient.SafeIntegers`
  makes a driver give every integer as a bigint, which only some drivers read, so the storage decodes both forms.
  `sql/Migrator` and `PgliteMigrator` run numbered migrations of a schema, and the storage creates its tables with
  `IF NOT EXISTS` and moves no schema yet. `SqlSchema` and `SqlModel` build statements of one table by its schema,
  and most statements of the storage read several tables. `PgliteClient.json` binds a value as jsonb, and the
  storage binds text, which it casts.
- **A storage per dialect, each a module of its own.** Every rule of the storage would be written twice, and a fix of
  one would be missed in the other.
- **JSON in jsonb columns on PostgreSQL.** A request would be found by a value and not by its text, which changes
  the reading of replies, and a row of SQLite and one of PostgreSQL would hold a request differently.
- **A rename that writes a request again in the process on both dialects.** It would read every request of the
  tables into the process on SQLite too, where one statement per table does the work.

## Consequences

- [`src/storage.ts`](../../src/storage.ts) writes each statement that differs once per dialect, holds a database of
  PostgreSQL with an advisory lock, and reads integers in both forms.
- [`src/storage.test.ts`](../../src/storage.test.ts) runs its tests on both dialects.
  [`src/runtime.test.ts`](../../src/runtime.test.ts) runs on PGlite the tests that write what differs.
- `docs/design.md` says, under Where it runs, which databases the runtime runs on. The step leaves the roadmap.
