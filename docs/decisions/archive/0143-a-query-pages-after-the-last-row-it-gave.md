# 0143. A query pages after the last row it gave

**Status:** accepted, 2026-11-05. Changes
[decision 0141](0141-a-query-and-a-reading-of-the-log-take-a-limit.md), whose query gives only its first page, and
[decision 0032](0032-a-projection-is-a-row.md), whose query gives an id and a projection. Changed by
[decision 0144](0144-a-page-reads-the-rows-before-its-cursor.md), which reads the alternative of an offset without the
reading of every row skipped, since the clause taken reads the rows before its cursor too. Changed by
[decision 0145](0145-a-page-is-read-as-ranges-of-its-index.md), whose descending order reverses the ids of the rows
that tie too, and whose page is read as ranges of an index of the value and the id. Changed by
[decision 0146](0146-an-integer-beyond-2-53-is-written-with-its-exact-digits.md), which writes an integer beyond
2^53 with the exact digits of its double, since the digits `JSON.stringify` writes are read by SQLite as another
number, and a page whose cursor held one gave the row for ever. A cursor whose id is no text a database
holds, or whose string is none, is refused too, by [decision 0207](../0207-a-criterion-is-a-scalar-both-dialects-compare-alike.md).

## Context

`query` takes a limit, and gives the first `limit` rows in its order
([decision 0141](0141-a-query-and-a-reading-of-the-log-take-a-limit.md)). A caller that needs every row that
matches, a report or an export, can read no row past the first page. It can only ask for as many rows as it can
hold, or narrow its criteria by the last value it was given. A narrowed criterion misses rows. A query ordered by an
index orders the rows that tie on the index by their id, and a criterion `> value` drops the rows that tie with the
last one given, while `>= value` gives them again.

`published` already reads past a page: each row carries its cursors, and the caller passes the cursors of the last
row it was given. A read model has no `seq`, but a query's order is total, by the index and then by the id, so the
last row given is a place in it.

## Decision

- **`query` takes `after`, a row a page gave, and gives the rows past it in the query's order.** Without an
  `order`, the rows past it are those whose id is greater. With an `order`, a row is past `after` where its value of
  the index comes later in the order, or where the two values are equal and its id is greater. The ids are ascending
  among the rows that tie, in a descending order too, as the order already reads them. A page read with `after`
  gives at most `limit` rows, as any query does.
- **Each row found carries `indexes`, the value of each index of the program as its row stores it.** The cursor is
  the value the query compared, and not one the caller recomputes from the projection with the program's own
  functions: a row written by an older version holds the index that version computed until `reindex` writes it
  again. An index the stored row lacks, one added since, is `null`, as the query reads it.
- **`after` is `{ id, indexes }`, so the last row of a page is passed as it is.** An `after` left out, or
  `undefined`, reads the first page, so `page.at(-1)` is passed as it is whether the page had rows or none. The id
  of `after` is a string. Where the query has an `order`, the value of `after` for that index is a scalar: a
  string, a finite number, a boolean or `null`.
  Anything else is the caller's defect, and nothing is read, as decision 0053 decided of what a handle is given.
  The test `a cursor that holds no id, or no scalar of the index ordered by, is its caller’s defect` in
  [`src/storage.test.ts`](../../../src/storage.test.ts) checks it.
- **Nothing is held between two pages.** Each page is a statement of its own, read at its time. A row whose index a
  step changes between two pages is given where it stands when the next page is read: a row moved past the cursor
  is given again, and a row moved behind it is not given. A row no step changes is given exactly once, on one page.

## What it rests on

- That SQLite compares the value of `json_extract` with a parameter in the order its `ORDER BY` sorts them:
  **documented**, by SQLite's page on datatypes, where an expression and a parameter have no affinity, so neither is
  converted, and a comparison and `ORDER BY` share the order of the storage classes, `NULL` first, then numbers, then
  text. **Tested**, by the test `a query pages past the last row it gave, through ties and nulls, in either order` in
  [`src/storage.test.ts`](../../../src/storage.test.ts), whose index holds numbers that tie, nulls and a string.
- That `NULL` sorts first in an ascending order and last in a descending one: **documented**, by SQLite's page on
  `SELECT`, and kept in the clause that reads past a `null`, which the same test checks in either order.
- That the indexes stored with a row are the ones the query compares: **seen**, in
  [`src/storage.ts`](../../../src/storage.ts), where `row` writes the indexes the machine computed and `query` reads
  each through `json_extract` of the same column.
- That a boolean index is compared as 1 or 0: **seen**, in `json_extract`, which gives JSON's `true` as 1, as the
  criteria of a query already rest on. The cursor's boolean is bound as 1 or 0 for the same reason.

## Alternatives

- **The id alone as the cursor**, with the query reading the index of that row again. A row whose index changed
  since moves the cursor with it, and a page skips or repeats the rows between the two places. A row nobody changes
  would be given exactly once only where the cursor's row stays put too.
- **An offset**, the number of rows to skip. SQLite reads every row skipped, so the last page of a large read model
  reads all of it, and a row written before the cursor shifts every page after it.
- **A cursor the runtime encodes**, a string that holds the value and the id. It hides what the caller can read
  already, and a string the caller cannot read is one more thing to check. A row passed back as it was given is as
  short to write.
- **A snapshot held across pages**, a read transaction kept open from the first page to the last. A reader that
  stops calling would hold the snapshot open, and the runtime holds nothing for a caller between two calls ([decision 0142](0142-a-consumer-waits-for-a-row-of-its-topic.md)).

## Consequences

- `Found` has `indexes`, and `Query` has `after`, in [`src/storage.ts`](../../../src/storage.ts). A test and an example
  that compared a row found with `{ id, projection }` compare `indexes` too.
- `docs/design.md` says under Reading how a query pages, and the open question Paging a query leaves
  `docs/open-questions.md`.
