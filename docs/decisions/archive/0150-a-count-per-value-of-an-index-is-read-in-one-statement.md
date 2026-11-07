# 0150. A count per value of an index is read in one statement, and an ack joins the caller's transaction

**Status:** accepted, 2026-11-06, with the step A count per value of an index of the roadmap. Decides the
[open question](../../open-questions.md#storage-and-reading) of a count grouped by an index. Changes
[decision 0149](0149-the-read-model-answers-what-a-program-acts-on.md), whose read model answers in three forms, and
[decision 0039](0039-a-consumer-of-the-outbox-keeps-its-cursor.md), whose ack is a transaction of its own.

## Context

`count` gives how many entities match the criteria
([decision 0148](0148-a-count-and-a-sum-are-read-in-one-statement.md)). How many orders are in each status, which
a dashboard shows at every view, is one count per status: a statement each, each on a snapshot of its own, so two
counts can disagree with a step that committed between them. [Decision 0149](0149-the-read-model-answers-what-a-program-acts-on.md)
said a grouping is a report's question, and left a count grouped by an index open, since it is one statement over
the indexes, under the criteria a query takes, which reads no projection.

[`examples/order/report.ts`](../../../examples/order/report.ts) answered the question as a report, and showed what a
report costs. A row of a topic gives the status its step left and not the one before, so the consumer keeps the
status of each order in a store of its own and groups over that: the store is a copy of the index. And the handle
did not say whether `ack` joins a transaction the caller left open. So the consumer writes its store in a
transaction of its own before the ack, and a page delivered again after a crash between the two must leave what it
left. A row that sets a value does, and a row that adds to a count would not.

An index holds any scalar of JSON ([decision 0032](0032-a-projection-is-a-row.md)). `json_extract` gives
`true` as `1` and `false` as `0`, and gives SQL's NULL both for JSON's null and for an index a row lacks, which a
later version added.

## Decision

- **The handle gives `countBy`.** `countBy({ index, where, limit })` gives, for each value `index` holds among the
  entities whose indexes match `where`, that value and how many entities hold it. The criteria are those a query
  takes, compared as a query compares them. It is one statement of SQLite, so every count is read on one snapshot,
  and it reads no projection. A value no entity holds has no entry.
- **The values come in the order a query orders the index by, at most `limit` of them.** Null comes first, then
  the numbers, then the strings, as SQLite orders them. A boolean is ordered as the `1` or `0` SQLite reads it as,
  and comes after that number, where a query orders the two by their ids.
  A grouping by an index of many values, such as a customer, is a report's question past its limit, and a caller
  that must know whether the values ended asks for one more than it shows.
- **A value is grouped as a query reads it.** `true` and `1` are two values, told apart by `json_type`. JSON's
  null and an index the row lacks are one value, null, as a query gives a row that lacks the index
  ([decision 0143](0143-a-query-pages-after-the-last-row-it-gave.md)).
- **A sum is not grouped.** A total per value of an index is a report's question, until a program asks it.
- **An ack joins a transaction the caller left open on the client the runtime was launched with.** `ack` runs its
  statements in the caller's fiber, in `SqlClient.withTransaction`, which runs as a savepoint inside a transaction
  already open. A consumer that writes its store in the database of the runtime, and acks in the same transaction,
  commits both or neither, so a page delivered again was never written. Within such a transaction the caller waits
  for nothing a step does: the transaction holds the one connection of SQLite, and a step that commits waits for it.
- **While `reindex` runs, `countBy` reads the rows as they stand**, as a query and a count do
  ([decision 0121](0121-a-read-answers-from-the-row-of-the-read-model.md)).

## What it rests on

- That one statement reads the rows as one transaction sees them: **documented**, by SQLite's page on isolation, as
  for [decision 0148](0148-a-count-and-a-sum-are-read-in-one-statement.md).
- That `json_type` gives `true`, `false`, `integer`, `real`, `text` and `null`, and SQL's NULL for a path the row
  lacks, and that `->` gives a value as its JSON text: **documented**, by SQLite's page on its JSON functions;
  **tested**, by the tests under `a count per value of an index` in
  [`src/storage.test.ts`](../../../src/storage.test.ts), at the SQLite that bun 1.4.2 holds, 3.53.2.
- That a nested `SqlClient.withTransaction` runs as a savepoint of the transaction open in the fiber's context, and
  that the transaction of a client is found in the context of the fiber that runs the statement: **documented**, by
  the JSDoc of `makeWithTransaction` and of `withTransaction` in `effect/src/sql/SqlClient.ts` at 4.1.2;
  **tested**, by the test `a report fed from the log counts the orders in each status, as the read model counts
  them` in [`examples/order/runtime.test.ts`](../../../examples/order/runtime.test.ts), where a transaction that
  fails after its ack leaves the store and the cursors as they were.
- That `ack` runs with its caller's context: **tested**, by the same test. An ack run without the caller's
  transaction, as one run in a context of the runtime's would be, waits for the connection the transaction holds,
  and the test hangs. A fiber forked by the caller inherits the context, and still joins.
- That the client of `@effect/sql-sqlite-bun` holds one connection, which a transaction holds until it ends: **read
  in the source**, in `SqliteClient.make`, whose acquirers share a semaphore of one permit.

## Alternatives

- **A field `by` on `count`**, which gives the groups where it is given and a number otherwise. The types would
  have to tell the two answers apart, as [decision 0148](0148-a-count-and-a-sum-are-read-in-one-statement.md)
  refused for an aggregate field on `query`.
- **The groups as a record by value.** A value is any scalar, and a record's keys are strings: `1`, `'1'` and
  `true` would be one key.
- **A page of groups, after the last value given.** A grouping of many values is a report's question, and a page
  after a value would need the kind of the value too, since `true` and `1` are one value to SQLite's order.
- **An ack that never joins**, as the handle left it. A report would have to be written so that a page written twice
  changes nothing, which a store that adds to a count is not.
- **A structure of Effect in place of the statement.** `Array.groupBy` and `Array.groupWith` group in the process,
  and need every row read out first, which is what the statement avoids, as `Number.sumAll` does for a sum.
  `HashMap` keyed by `Equal` would tell `true` from `1`, in the process too. `SqlSchema.findAll` decodes the rows of
  a statement, as `rows` of the storage does; it is marked `@stability unstable`, and `src/` does not import it.
  `SqlResolver` batches requests of one shape, and a grouping is one request. `SqlClient.withTransaction` is the
  structure the ack joins with, and `SqlClient.afterCommit` would run a callback after the caller's commit, which
  no part of the ack needs. None is used but `withTransaction`.

## Consequences

- `Storage.countBy` in [`src/storage.ts`](../../../src/storage.ts) builds the criteria as a query does, and
  `Handle.countBy` in [`src/runtime.ts`](../../../src/runtime.ts) gives it to callers, with its limit checked as a
  query's is ([decision 0141](0141-a-query-and-a-reading-of-the-log-take-a-limit.md)).
- `Handle.ack` says that it joins a transaction the caller left open.
- `docs/design.md` says under Reading that the read model answers in four forms, and the open question of a count
  grouped by an index leaves `docs/open-questions.md`.
- [`examples/order/report.ts`](../../../examples/order/report.ts) writes its store and acks in one transaction, and
  [`examples/order/runtime.test.ts`](../../../examples/order/runtime.test.ts) checks its counts against `countBy`.
- The glossary's handle, and the README's diagram of an entity's loop, name `countBy`.
