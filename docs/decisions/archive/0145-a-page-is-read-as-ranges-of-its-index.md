# 0145. A page is read as ranges of its index

**Status:** accepted, 2026-11-05. Changes
[decision 0143](0143-a-query-pages-after-the-last-row-it-gave.md), whose descending order ascends by the id among
the rows that tie, and [decision 0144](0144-a-page-reads-the-rows-before-its-cursor.md), whose page reads the rows
of its program before its cursor. [Decision 0198](../0198-every-object-the-runtime-makes-is-named-with-tea.md) names the index `tea_projections`, and the index a database had without the id is no longer dropped.

## Context

A query pages after the last row it gave, with one clause that holds of the rows past it
([decision 0143](0143-a-query-pages-after-the-last-row-it-gave.md)). SQLite searches the index by the name alone
with that clause, so a page walks the rows of its program from the first in the order, and drops the ones before
its cursor ([decision 0144](0144-a-page-reads-the-rows-before-its-cursor.md)). The last page of a large read model
reads all of it.

The index the storage creates holds the name and the value of the index, and not the id. A query ordered by an
index sorts each run of rows that tie by their id, on its first page too, so a page of an index with few values, a
status or a boolean, reads every row of the run it ends in.

## Decision

- **The index the storage creates holds the name, the value of the index and the id.** The rows that tie are then
  in the index in the order of their id, and a statement reads them past an id as a range.
- **A descending order is the ascending order reversed, the ids among the rows that tie included.** An index read
  backwards gives the ids descending, so an order whose ids ascend under a descending value sorts each run of rows
  that tie, and one that reverses them sorts nothing. The rows that hold no value stay first in an ascending order
  and last in a descending one. A row is past `after` in a descending order where its value comes earlier, or where
  the two values are equal and its id is smaller.
- **A page is read as at most three statements, each a range of the index in the order of the query.** In order:
  the rows that tie with the cursor, past its id; the rows past its value; and, in a descending order past a value,
  the rows that hold no value. Each statement takes what the statements before it left of the limit, and the page
  ends where one leaves nothing. A first page, and a page of a query without an order, is one statement, as before.
  Past a cursor that holds no value in an ascending order, the rows past it are those whose value is greater than
  `-Infinity`. A value of `json_extract` is never `-Infinity`, since the storage writes the indexes with
  `JSON.stringify`, which writes a non-finite number as `null`. `IS NOT NULL` would be read by the name alone, and
  walk every row that holds no value.
- **A page is read in one transaction.** A step that committed between two statements could move a row from the
  rows that tie to the rows past the value, and the page would give that row twice. The transaction is the
  storage's own, which holds the connection for its length, as every write does. A page is short, so a step
  waits for it no longer than for a page of one statement.
- **Every criterion of the query holds in each statement.** A criterion on another index may make SQLite search
  that index instead, which the planner decides as it does for a first page.

## What it rests on

- That SQLite searches each statement as a range of the index, and sorts in none of them: **seen**, in the spike
  [`spikes/sqlite-page-statements-plan.test.ts`](../../../spikes/sqlite-page-statements-plan.test.ts), which reads the
  plan of each on the table the storage creates and an index of the name, the value and the id.
- That a statement searched as a range, in the order it reads, with a limit, stops after the rows it gives: **reasoned**,
  from SQLite's page on the query planner, which says an index that gives the rows in the order of `ORDER BY`
  spares the sort, and of `LIMIT` that it ends the reading. No spike counts the rows SQLite visits, since
  `bun:sqlite` gives no count of a statement's steps.
- That `-Infinity` is bound as a real, and every value an index stores but `null` is greater: **seen**, in the same
  spike. **Documented**, by SQLite's page on datatypes, where a number and a text compare in the order of their
  storage classes, numbers before text.
- That an explicit transaction of the client holds its connection, and a write waits for it: **documented**, in
  the JSDoc of `SqliteClient` in `@effect/sql-sqlite-bun` 4.1.2, whose module serializes access to the database,
  and whose `make` says an explicit transaction takes the write lock for its duration, though it only reads.

## Alternatives

- **A `UNION ALL` of the statements**, in one statement. SQLite sorts the union whole, so a page early in the order
  reads every row past it instead, as the spike of decision 0144 shows.
- **Ids ascending in either order**, with a second index of the value descending and the id ascending for a
  descending query. Each step would write two index entries per index of the program, where one serves both orders.
- **A module of Effect.** No module of `effect/sql` reads past a cursor: `Statement` composes the clauses, with
  `sql.and`, and `SqlStream` streams the rows of one statement where a driver does, which `@effect/sql-sqlite-bun`
  does not. `Stream.paginate` gives every page of a reading to a caller that walks them all, and a caller can build
  it over `query` as it is.

## Consequences

- `query` in [`src/storage.ts`](../../../src/storage.ts) reads a page as those statements, in a transaction, and
  `indexed` creates the index of the name, the value and the id. A database made before keeps the index under the
  name it had, so the new index takes a new name, and `indexed` drops the old one. The test `an index of the program
  holds the value and the id, and the index a database had without the id goes` in
  [`src/storage.test.ts`](../../../src/storage.test.ts) checks both.
- The test `a page gives a row once though a step moves it while the page is read` runs a page and a step that
  moves a row past its value under every schedule within one deviation. Without the transaction, a schedule gives
  the row twice.
- The tests and the examples that read a descending order expect the ids descending among the rows that tie.
- `docs/design.md` says under Reading how a descending order reverses the ids, and the open question The cost of a
  page leaves `docs/open-questions.md`.
