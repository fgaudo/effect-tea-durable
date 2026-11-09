# 0158. A database of SQLite made before is given `request_id`, and a page keeps the level of a caller's transaction

**Status:** accepted, 2026-11-06. Changes
[decision 0157](0157-the-storage-speaks-sqlite-and-postgresql.md), which gives a reply the column `request_id` and
begins a page's transaction at `REPEATABLE READ` on PostgreSQL. The column is added and filled in one transaction, so
that a crash between the two leaves neither, since [decision 0191](../0191-a-launch-creates-the-tables.md). [Decision 0198](../0198-every-object-the-runtime-makes-is-named-with-tea.md) names every table with `tea_`, and `tea_replies` is never given `request_id`: no database holds it without the column. On a server, a page in a caller's transaction at `READ COMMITTED` is seen to give a row twice, and the design tells such a caller to begin at `REPEATABLE READ`, by [decision 0222](../0222-postgresql-with-many-connections.md).

## Context

A review of decision 0157 found two things it left unsaid.

`createTables` drops, from a database of SQLite made before decision 0157, the index that read a caller's request id
out of the request. It leaves the replies of that database without `request_id`: `CREATE TABLE IF NOT EXISTS` adds no
column to a table made before. The first reply written on such a database would fail, and a caller's request a
version before stored would be found by no row. [Decision 0145](0145-a-page-is-read-as-ranges-of-its-index.md) moves
an index of a database made before the same way, so the storage cares for such a database already.

A page's transaction begins at `REPEATABLE READ` on PostgreSQL, so that its parts read one snapshot. `withTransaction`
begins a transaction with `BeginTransaction` only where no transaction is open on the client, and opens a savepoint
inside one. A consumer whose store is a table of the runtime's database reads and acks in one transaction it leaves
open, and may read a page in it: that page reads at the caller's level.

## Decision

- **On SQLite `createTables` gives the replies of a database made before the column `request_id`**, and fills it
  with the id `json_extract` reads out of a caller's request, as the index that goes read it. It is done where the
  table lacks the column, before the index of the column is made, and a database that holds the column is left as
  it is. No database of PostgreSQL was made before, since the storage spoke none.
- **A page begins its transaction at `REPEATABLE READ` only where the transaction is its own.** Inside a transaction
  a caller left open, the page reads at that transaction's level, which is the caller's. On SQLite and PGlite one
  connection serves every statement, so nothing commits between the parts of a page, and the page gives a row once.
  On a server with many connections, at PostgreSQL's default level, a step committed between two parts may move a row
  into such a page twice. What a server does goes with the
  [open question](../../open-questions.md#running) of decision 0157.

## What it rests on

- That `CREATE TABLE IF NOT EXISTS` leaves a table made before as it is, and that `ALTER TABLE ADD COLUMN` adds a
  column to it, which `pragma_table_info` lists: **documented** by SQLite, and **tested** by the test of
  [`src/storage.test.ts`](../../../src/storage.test.ts) that makes the replies of a database made before.
- That `withTransaction` reads `BeginTransaction` where it begins the outermost transaction alone, and opens a
  savepoint inside one: **documented** by the JSDoc of `withTransaction` in `node_modules/effect/src/sql/SqlClient.ts`,
  which says a top-level transaction is begun with it, and **read in the source**, in `makeWithTransaction` of the
  same file, which gives `begin` the statement at the outermost level and a `SAVEPOINT` past it.
- That a consumer reads a page in the transaction it acks in: **only reasoned**. No test of the repository does it,
  and the design allows it.

## Alternatives

- **The structures of Effect.** `sql/Migrator` runs numbered migrations of a schema, with a table of its own and a
  first migration that is the whole schema. The storage moves one column of one dialect where it finds it missing,
  as it moves the index of decision 0145, and keeps no numbering yet. `SqlClient.reserve` would read a page on a
  connection of its own, outside the caller's transaction, at a level the storage chooses: the page would then not
  hold the caller's own writes, which a page read in the caller's transaction holds. `CurrentTransactionService`
  tells whether a transaction is open, and the storage could refuse a page inside one: a consumer that reads a page
  where it acks is what the design allows, so it stays.
- **Leaving a database made before as it is**, since no release is out. Decision 0145 cares for such a database
  already, and a rule kept for one index and not for the column next to it is a rule kept by accident.

## Consequences

- [`src/storage.ts`](../../../src/storage.ts) adds and fills `request_id` on SQLite where the table lacks it, and
  says at the page's transaction where its level holds. [`src/storage.test.ts`](../../../src/storage.test.ts) tests the
  column of a database made before.
- `docs/open-questions.md` says, under PostgreSQL with many connections, what a page read inside a caller's
  transaction may give there.
