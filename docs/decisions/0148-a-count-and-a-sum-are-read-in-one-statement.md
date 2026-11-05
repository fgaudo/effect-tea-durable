# 0148. A count and a sum over the entities that match are read in one statement

**Status:** proposed, 2026-11-05, for the step A number over many entities of the roadmap. Decides the
[open question](../open-questions.md#storage-and-reading) of a number over many entities. Changes
[decision 0032](archive/0032-a-projection-is-a-row.md), whose read model answers only with rows.

## Context

`query` gives the entities whose indexes match, with their projections, at most `limit` of them
([decision 0141](0141-a-query-and-a-reading-of-the-log-take-a-limit.md)). A question whose answer is one number
over every entity that matches has no handle of its own. How many orders await their payment, or what the orders
paid today add up to, is answered by paging through every row
([decision 0143](0143-a-query-pages-after-the-last-row-it-gave.md)). Each page decodes each projection through its
migrations and its schema, and the process counts what it decoded. A dashboard that asks the number at every view
reads the whole read model of the program at every view.

A program can keep the number itself, in an entity sent a message by each entity that changes it. That costs a
message per change, and an entity every change waits behind. A consumer of the log can feed a store made for the
number, which is a store more to run. SQLite answers the number over the same rows and the same indexes in one
statement, and reads no projection to do it.

An index holds any scalar of JSON: a string, a number, a boolean or null
([decision 0032](archive/0032-a-projection-is-a-row.md)). The types of a program name its indexes, and say nothing
of the kind each holds. So a sum can meet a row whose index holds a string or a boolean. SQLite's `SUM` reads a
string as the number it starts with, `0` for most, and reads `true` as `1`, since `json_extract` gives a boolean as
an integer. A total that counts such rows as numbers is a wrong answer, and nobody is told.

## Decision

- **The handle gives `count` and `sum`.** `count({ where })` gives the number of entities of the program whose
  indexes match the criteria. `sum({ index, where })` gives the total of `index` over them. The criteria are those a
  query takes, compared as a query compares them, and none matches every entity. Each is one statement of SQLite,
  so each reads the rows as one transaction sees them, and reads no projection.
- **A sum adds the numbers, and leaves out the rows that hold none.** A row whose index holds null, or no value at
  all since a later version added the index, adds nothing, as in SQL. A sum over no row is `0`. The statement adds
  with `TOTAL`, which gives a double and never fails on an overflow of SQLite's integers, where `SUM` does: an
  integer beyond 2^53 is added as its double, as JavaScript would add it.
- **A sum that meets a string or a boolean is its caller's defect.** The statement reads the kind of each value with
  `json_type`, which tells `true` from `1`, and gives the least id of a row whose index holds a value that is no
  number and is not null. If there is one, the call dies with an `InvariantDefect` that names the index and that
  id, and gives no total. Summing an index whose values are not numbers is a call no caller meant, and a total that
  counts them wrongly is the silent loss the defect avoids.
- **While `reindex` runs, both read the rows as they stand**, as a query does: a row written by an older version
  holds the indexes it was written with until `reindex` or a step writes it again
  ([decision 0121](0121-a-read-answers-from-the-row-of-the-read-model.md)). A sum that meets a string an older
  version wrote dies until that row is written again, and the defect names the entity.

## What it rests on

- That one statement reads the rows as one transaction sees them, so that a step that commits meanwhile is counted
  wholly or not at all: **documented**, by SQLite's page on isolation, where a statement reads one snapshot of the
  database.
- That `json_type` gives `true` and `false` for a boolean, `integer` or `real` for a number, `null` for JSON's null
  and SQL's NULL for a path the row lacks, and that `TOTAL` gives `0.0` over no row: **documented**, by SQLite's
  pages on its JSON functions and its aggregates; **tested**, by the tests of `count` and `sum` in
  [`src/storage.test.ts`](../../src/storage.test.ts).
- That a criterion compares as a query's does: **tested**, by the same tests, which count the rows a query finds
  under the same criteria.
- That no caller sums an index of strings on purpose: **only reasoned**. A caller that wants the rows holding a
  string counts them with a criterion.

## Alternatives

- **An aggregate field on `query`**, a query that gives a number in place of rows. Its limit, its order and its
  cursor would mean nothing, and the types would have to tell the two answers apart.
- **More aggregates**: a minimum, a maximum and an average. A query ordered by the index with a limit of 1 gives the
  least or the greatest row, with its projection, and an average is the sum over the count. A grouping, a count per
  value of an index, is a question of a report, and a consumer of the log feeds a store made for reports.
- **A sum that passes over a string or a boolean** in silence. Its total would be a number that looks right.
- **Only the indexes that hold numbers may be summed, by their types.** The types of a program name its indexes and
  give each the type `Scalar`, so this would need each index's kind in the types, a change to every program.
  A row an older version wrote can hold another kind all the same, which the types do not see.

## Consequences

- `Storage.count` and `Storage.sum` in [`src/storage.ts`](../../src/storage.ts) build the criteria as a query does,
  and `Handle.count` and `Handle.sum` in [`src/runtime.ts`](../../src/runtime.ts) give them to callers.
- `docs/design.md` says under Reading what the two give, and the open question of a number over many entities
  leaves `docs/open-questions.md`.
- [`examples/order/runtime.test.ts`](../../examples/order/runtime.test.ts) counts the orders that await their
  payment, and sums what they owe.
