# 0157. The storage speaks SQLite and PostgreSQL, in the same tables, and a query reads alike on both

**Status:** proposed, 2026-11-06, for the step A store on PostgreSQL of the roadmap. Changes
[decision 0007](archive/0007-one-process-first.md), which puts the runtime on SQLite;
[decision 0065](archive/0065-the-machine-holds-no-replies.md), whose index reads a caller's request id out of the
request; and [decision 0156](0156-a-program-is-renamed-by-its-launch-and-keeps-its-keys.md), whose rename rewrites a
request in the database.

## Context

The storage writes every statement in SQLite's dialect: `json_extract`, `json_set`, `INSERT OR REPLACE`, a trigger
written in SQL, `PRAGMA locking_mode`, `TOTAL`. A database of one file serves the processes of one machine. A
serious backend keeps its data on a database server, and Effect Cluster across machines needs a database its runners
share ([Cluster](../cluster.md)).

The runtime reaches the database through `SqlClient` alone
([decision 0019](archive/0019-unstable-effect-modules.md)). So the dialect is all a second database changes: the
runtime, the machine and the program stay as they are.

A program is rehearsed and tested on SQLite, and may run on PostgreSQL. So what a query finds, and in which order,
must not depend on the database.

The spike [`spikes/pglite-dialect.test.ts`](../../spikes/pglite-dialect.test.ts) runs on PGlite the statements the
storage would write on PostgreSQL. PGlite is PostgreSQL compiled to run in the process. The spike sees six things
that differ from SQLite:

- jsonb writes its text again, with its keys in its own order and with spaces;
- jsonb orders null first, then strings, then numbers, then booleans, where SQLite reads a boolean as 1 or 0 and
  orders text after numbers;
- neither json nor jsonb parses a text that escapes U+0000 or holds a lone surrogate, whichever field a statement
  reads of it, and no text of PostgreSQL holds U+0000;
- a parameter whose type PostgreSQL cannot infer, as in `$1 IS NULL`, is refused;
- a bigint is read as a number up to 2^53, and as a JS `bigint` past it;
- an advisory lock is taken again by the session that holds it, and PGlite runs every statement on one session.

## Decision

### Which databases

- **The storage speaks SQLite and PostgreSQL.** It reads the dialect from the client once, with `sql.onDialect`,
  and a statement that differs is written once per dialect.
- **A launch on a client of any other dialect is the launcher's defect**, and names the dialect.
- **Both dialects hold the same tables, with the same columns.** A statement both dialects read alike is written
  once, so that each rule of the storage is written in one place. An upsert is `INSERT … ON CONFLICT … DO UPDATE`
  on both, where SQLite's statements wrote `INSERT OR REPLACE`.
- **Text of PostgreSQL is compared by its bytes**, with the collation `C`, as SQLite compares text. So ids are
  ordered alike on both dialects.

### JSON

- **A JSON column is text on both dialects.** The runtime finds a stored reply by the text of its request
  ([decision 0065](archive/0065-the-machine-holds-no-replies.md)), and jsonb would write that text again.
- **No statement of PostgreSQL parses JSON that holds the program's data**, since the data may escape U+0000, which
  PostgreSQL does not parse. Three readings change for it:
  - a reply holds the id of a caller's request in a column of its own, `request_id`, written by the process, and a
    caller's request a version before stored is found by an index of it, on both dialects;
  - on PostgreSQL a rename finds the requests whose text holds the old name as JSON writes it, and the process
    parses each, keeps those whose `entity` is the old name, and writes the new name with `JSON.parse` and
    `JSON.stringify`, in the rename's transaction. A text that `JSON.stringify` does not give back as it is makes the
    rename die before it moves anything. On SQLite a rename stays as decision 0156 decides;
  - the indexes of the read model are parsed, so an index that is a string holding U+0000 or a lone surrogate is a
    defect of the program, on both dialects, as an index that is a number JSON does not hold is. A database also
    writes a lone surrogate as U+FFFD, so that two strings would be one.

### Indexes and queries

- **A query finds and orders the same rows on both dialects.** On PostgreSQL an index of the read model is three
  expressions, which order a value as SQLite's `json_extract` does: its kind, null first, then numbers and booleans,
  then strings; its number, a boolean being 1 or 0; and its string, by its bytes. A row that lacks the index reads as
  null, as on SQLite. A query compares the row of the three with the row of the value bound, and an index that holds
  no value holds of no comparison, as in SQL.
- **An integer beyond 2^53 is bound by the exact digits of its double**, which are the digits the row holds
  ([decision 0146](0146-an-integer-beyond-2-53-is-written-with-its-exact-digits.md)).
- **On PostgreSQL each part of a page is ordered by every expression of the index, then the id.** In a part whose
  rows tie, that order is the order of the id, and PostgreSQL would sort rows ordered by the id alone.
- **On PostgreSQL the parts of a page are read in one transaction begun at `REPEATABLE READ`**, with
  `SqlClient.BeginTransaction`. At PostgreSQL's default level each statement reads its own snapshot, and a step
  between two parts would move a row into the page twice
  ([decision 0145](0145-a-page-is-read-as-ranges-of-its-index.md)).
- **On PostgreSQL an index's name is cut by the storage** past 63 bytes, which PostgreSQL keeps of a name, and ends
  with a hash of the whole, so that two long names sharing their first bytes name two indexes.

### Holding the database

- **On PostgreSQL a runtime holds the database with a session advisory lock**, on a connection it reserves for its
  scope with `sql.reserve`. A second runtime on the database, in this process or another, finds the lock taken, and
  dies as it launches ([decision 0080](archive/0080-a-database-is-held-by-one-runtime.md)).
- **On PGlite the runtime holds the client in the process alone.** PGlite has one session, so an advisory lock
  would be taken again by a second runtime. Cluster's `SqlRunnerStorage` skips advisory locks on PGlite for the
  same reason.

### Integers

- **A time, a `seq`, a count and a position are bigints on PostgreSQL.** A row gives each as a number up to 2^53, and
  a value past it is no row the runtime writes, and fails the call that meets it
  ([decision 0043](archive/0043-a-row-no-version-reads-fails-what-reads-it.md)).

### Tests

- **The tests of the storage run on both dialects**, PostgreSQL on PGlite. A test that reads what only SQLite holds,
  a plan of SQLite or a trigger written in its dialect, runs on SQLite, and has a form of PostgreSQL where the rule
  holds there too. Each test of PostgreSQL starts from a copy of a new database, which the spike sees take a fifth of
  the time of a new one.
- **On PostgreSQL a test reads the plans of the statements the storage runs**, recorded with
  `Statement.CurrentTransformer`, with scans of whole tables turned off. Each page, count and reading of a caller's
  reply is served by its index, and no page sorts.

### Still to decide in this step

- **The runtime on PGlite.** Its tests pass on PGlite but for twenty. Some read SQLite's plans. Others show that
  `runtime.settled` returns while the waker's reading is under way. A statement of bun:sqlite ends before its fiber
  yields, and one of PGlite does not.
- **Ids and names.** An id, a program's name and a consumer's name are text of their own column, and a database
  writes a lone surrogate in them as U+FFFD, on both dialects. PostgreSQL refuses one that holds U+0000.
- **`docs/design.md`, the glossary and the diagrams of `README.md`**, which say the runtime runs on SQLite.

## What it rests on

- That jsonb writes its text again: **seen in the spike**.
- That jsonb orders kinds otherwise than SQLite, and that a key a row lacks reads as SQL's NULL: **seen in the
  spike**. The order of SQLite is kept by expressions, which a test of the read model checks on both dialects.
- That neither json nor jsonb parses a text escaping U+0000 or holding a lone surrogate, and that no text holds
  U+0000: **seen in the spike**.
- That jsonb compares a number by its exact digits: **seen in the spike**, with 2^70.
- That a row trigger after a delete sees every row the statement deleted, so that a publication goes with the last
  row of the outbox that names it ([decision 0154](0154-a-steps-projection-is-stored-once-in-the-outbox.md)):
  **seen in the spike**, and tested on both dialects by the tests of the log.
- That the collation `C` compares text by its bytes, as SQLite's `BINARY` does: **documented** by PostgreSQL, whose
  pinned version is the one PGlite embeds, and **tested** by the order of ids of the tests of the read model.
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
  `Statement`'s `onDialect` is used, as Cluster's `SqlMessageStorage` and `SqlRunnerStorage` use it.
  `SqlClient.reserve` is used, and keeps the connection that holds the advisory lock, as `SqlRunnerStorage` keeps
  its own. `SqlClient.BeginTransaction` is used, and begins a page's transaction at its level.
  `Statement.CurrentTransformer` is used by a test, and records the statements the storage runs.
  `SqlClient.SafeIntegers` makes a driver give every integer as a bigint, and the storage reads no integer past 2^53.
  `sql/Migrator` and `PgliteMigrator` run numbered migrations of a schema, and the storage creates its tables with
  `IF NOT EXISTS` and moves no schema yet. `SqlSchema` and `SqlModel` build statements of one table by its schema,
  and most statements of the storage read several tables. `PgliteClient.json` binds a value as jsonb, which the
  storage parses nowhere.
- **A storage per dialect, each a module of its own.** Every rule of the storage would be written twice, and a fix of
  one would be missed in the other.
- **JSON in jsonb columns on PostgreSQL.** A request would be found by a value and not by its text, and jsonb does
  not hold every text the program's data encodes to.
- **jsonb's own order on PostgreSQL**, one expression per index. A query that compares values of two kinds would
  find other rows on PostgreSQL than on SQLite, where the program was tested.
- **A rename that writes a request again in the process on both dialects.** It would read every request of the
  tables into the process on SQLite too, where one statement per table does the work.
- **Strings of an index refused on PostgreSQL alone.** A program tested on SQLite would meet the defect only once
  deployed on PostgreSQL.

## Consequences

- [`src/storage.ts`](../../src/storage.ts) writes each statement that differs once per dialect, holds a database of
  PostgreSQL with an advisory lock, writes `request_id`, and gives PostgreSQL the expressions of an index.
- [`src/machine.ts`](../../src/machine.ts) refuses an index that is a string holding U+0000 or a lone surrogate, and
  [`src/machine.test.ts`](../../src/machine.test.ts) checks it.
- [`src/storage.test.ts`](../../src/storage.test.ts) runs its tests on both dialects, and reads the plans of
  PostgreSQL. [`src/runtime.test.ts`](../../src/runtime.test.ts) runs on PGlite the tests that write what differs.
- `docs/design.md` says, under Where it runs, which databases the runtime runs on. The step leaves the roadmap.
