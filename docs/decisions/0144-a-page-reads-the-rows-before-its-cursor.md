# 0144. A page reads the rows of its program before its cursor

**Status:** accepted, 2026-11-05. Changes
[decision 0143](0143-a-query-pages-after-the-last-row-it-gave.md), whose alternative of an offset is set aside for
reading every row skipped, which the clause taken reads too. Changed by
[decision 0145](0145-a-page-is-read-as-ranges-of-its-index.md), whose page reads only the rows it gives.

## Context

A query pages after the last row it gave, with a clause that holds of the rows past it in the query's order: past
the value of the index ordered by, or equal to it and past the id
([decision 0143](0143-a-query-pages-after-the-last-row-it-gave.md)). The note sets an offset aside for two reasons:
SQLite reads every row an offset skips, and a row written before the cursor shifts every page after it.

The storage creates one index per index of the program, on the name and the expression that reads the index out of
the row. SQLite searches that index as a range only where the clause compares the expression alone. The clause of a
page joins two comparisons with `OR`, and SQLite searches the index by the name alone: it walks the rows of the
program in the order of the index from the first, and drops each row before the cursor. A page late in the order
reads every row before it, as the page of an offset would. An index that holds the id too, or the clause written
as a comparison of row values, is searched the same way.

## Decision

- **Decision 0143 stands, on its other reasons.** A row written before the cursor shifts no page read after it, a
  row no step changes is given once, and the cursor is the row the caller was given. The reading of the rows
  before the cursor tells an offset and the clause apart in no way, and the alternative of an offset is read without
  that sentence.
- **What a page costs is an open question.** A page reads the rows of its program before its cursor, and the
  number read grows with the place of the cursor in the order. What would read only the rows past the cursor is
  in [`docs/open-questions.md`](../open-questions.md), under The cost of a page.

## What it rests on

- That SQLite searches the index by the name alone with the clause of a page, and as a range with a comparison of
  the expression alone: **seen**, in the spike
  [`spikes/sqlite-page-clause-plan.test.ts`](../../spikes/sqlite-page-clause-plan.test.ts), which reads the plan
  of each on the table and the index the storage creates. **Documented**, by SQLite's page on the query planner,
  whose `OR` optimization needs each term to be searched by an index of its own, and which sorts the rows it finds
  that way.
- That the index the storage creates holds the name and the expression, and the id in no index but the primary
  key: **seen**, in [`src/storage.ts`](../../src/storage.ts), where `indexed` creates it and `createTables` the table.

## Alternatives

- **A clause SQLite reads as a range.** Two statements, the rows that tie with the cursor past its id and the rows
  past its value, each searched as a range, as the spike shows of a `UNION ALL` of the two. SQLite sorts the union
  whole, so a page early in the order would read every row past it instead. Two readings, each with its own limit,
  would read a page's rows alone, at two statements per page. Which of them a page is made of is what the open
  question would decide, and nothing in the design of decision 0143 depends on it.

## Consequences

- The status line of decision 0143 names this note, and the open question The cost of a page is in
  `docs/open-questions.md`.
