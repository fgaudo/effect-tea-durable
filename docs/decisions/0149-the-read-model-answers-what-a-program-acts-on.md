# 0149. The read model answers what a program acts on, and a report is fed from the log

**Status:** accepted, 2026-11-06. Says where the read model of
[decision 0032](archive/0032-a-projection-is-a-row.md) and the aggregates of
[decision 0148](0148-a-count-and-a-sum-are-read-in-one-statement.md) stop, and where the questions they leave out
are answered. Changes neither.

## Context

The read model is one row per entity, holding the projection and the value of each index the program declares.
A query gives the entities whose indexes match a conjunction of comparisons, ordered by one index, a page at a
time ([decision 0032](archive/0032-a-projection-is-a-row.md),
[decision 0143](0143-a-query-pages-after-the-last-row-it-gave.md)). A count and a sum give one number over the
entities that match the same criteria ([decision 0148](0148-a-count-and-a-sum-are-read-in-one-statement.md)).

A backend asks more of its entities than that. How many orders per status, and how many per day. The orders whose
status is one of several. The customers whose name contains a word. The orders of a customer, with what the
customer's own program holds of them. The average of what the orders owe. None of these is a query, a count or a
sum: a criterion is one comparison and the criteria are a conjunction, an aggregate is one number over the rows
that match, a program's rows are its own, and a question nobody indexed needs an index, a deploy and a `reindex`.

Each aggregate the handle gained was decided on its own, and the design said nowhere what the read model is for
and what it is not. A reader could not tell whether a grouping was missing or left out on purpose, and the
library could grow one aggregate at a time towards a query language over SQLite, which it is not meant to be.

## Decision

- **The read model answers what the program's application reads to act.** It is read from the rows a step writes
  in its own transaction, so what it answers is consistent with the states. Its questions are declared: an index
  for each value a question filters, orders or adds by, and a question added is a deploy and a `reindex`. It
  answers in three forms: the entities whose indexes match, with their projections
  ([decision 0032](archive/0032-a-projection-is-a-row.md)), their count, and the sum of one index over them
  ([decision 0148](0148-a-count-and-a-sum-are-read-in-one-statement.md)).
- **Any other question over the entities is a report, and a report is fed from the log.** A consumer of a topic
  reads its rows and writes a store made for the question, a table of a relational database, a search index or a
  warehouse, and the question is asked of that store. A grouping, a disjunction, a search in a text, a join across
  programs and a series over time are reports. What such a consumer needs is in the projection, since the
  projection is the entity's one contract, for its callers and for the consumers of its log
  ([decision 0138](0138-the-log-publishes-topics.md)), and a consumer keeps its cursor, so a row it acked is not
  read again ([decision 0039](archive/0039-a-consumer-of-the-outbox-keeps-its-cursor.md)).
- **A form the read model gains is one statement over the indexes, under the criteria a query takes, which reads
  no projection.** A question proposed for the read model is measured against that, and against the report that
  answers it from the log. A count grouped by an index passes the first measure, and whether it is the read model's
  is an [open question](../open-questions.md#storage-and-reading).

## What it rests on

- That a report's consumer finds what it needs in the projection: **documented**, by
  [decision 0138](0138-the-log-publishes-topics.md), which keeps the projection the one contract; **only
  reasoned** for the stores a report is fed into, since no example feeds one yet. The open question of a grouped
  count names the example that would.
- That a consumer reads the rows of its topic once past its cursor, page after page: **tested**, by the test `a
  reading passes over the rows its cursors have read, page after page, and stops at its limit` in
  [`src/storage.test.ts`](../../src/storage.test.ts).
- That a question answered better by a store made for it than by SQLite over the read model is every question
  beyond the three forms: **only reasoned**. A grouped count is the one in doubt, and is the open question.

## Alternatives

- **A query language over the projection**, with paths into it, a disjunction and a search in a text. It would be
  a second read contract beside the indexes, SQLite's dialect in the handle, and every question no index serves
  would walk the rows of its program.
- **One aggregate at a time, as a program asks for it**, with no rule of where they end. Each would be a note, and
  the design would still not say what a reader may expect of the read model.
- **Tables declared by the program, written by its steps.** [Decision 0032](archive/0032-a-projection-is-a-row.md)
  refused them as a second contract with a migration of its own. A store a consumer feeds is the same thing outside
  the library, with the log between the two, so the program's transaction never waits for the store.

## Consequences

- `docs/design.md` says under Reading what the read model answers and what a report is, and the glossary defines
  a report.
- The question of a count grouped by an index is in
  [`docs/open-questions.md`](../open-questions.md#storage-and-reading).
- No example feeds a store of reports from the log yet. One that keeps a count per status of the orders would be
  the first, and the open question names it among what decides it.
