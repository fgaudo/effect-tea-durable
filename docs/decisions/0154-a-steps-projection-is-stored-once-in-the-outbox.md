# 0154. A step's projection is stored once in the outbox

**Status:** accepted, 2026-11-06, with the step The projection written once per step of the roadmap. Decided the
open question of the projection written once per topic. Changes [decision 0138](0138-the-log-publishes-topics.md),
whose every row of a step holds the projection, [decision 0140](0140-a-row-of-a-topic-gives-its-value.md), whose row
of a topic stores the projection, and
[decision 0135](0135-a-large-state-is-split-by-the-program-and-the-runtime-warns-of-it.md), whose warning counts the
projection once per topic since decision 0138.

## Context

A row of a topic stores the projection whole, and the selector runs where the row is read, so that a topic needs
no schema and no migration of its own ([decision 0140](0140-a-row-of-a-topic-gives-its-value.md)). A step written in
five topics writes the projection six times: once in the read model and once in each topic. The message the step
handled is written five times too. The topics were added so that a consumer reads less
([decision 0138](0138-the-log-publishes-topics.md)), and they make a step write more.

The spike `spikes/large-states.test.ts` measures it. An entity whose projection holds its state takes 20 steps, once
with one topic and once with five topics that each select a few bytes and change at every step. On Windows with Bun
1.4.2, on a file, a step took 21 ms with one topic and 34 ms with five at 0.5 MB, and 300 ms with one and 466 ms with
five at 5 MB. The outbox grew by the size of the projection per topic at each step: 25 MB per step with five topics
at 5 MB.

Every row of a step holds the same projection and the same message. Only the topic differs.

## Decision

### What a step writes

- **A step that publishes writes one publication**: a row of the table `publications`, keyed by the program, the
  partition and the `seq` the step drew, which holds the entity's id, the kind of the message, the version that
  wrote it, the message and the projection. It is written in the step's transaction, after the head of the
  partition is moved, as the rows of the outbox are today
  ([decision 0137](0137-the-log-is-ordered-within-a-partition.md)).
- **A row of the outbox names its publication.** It holds the program, the topic, the partition and the `seq`, and
  its `position`, and nothing more. The rows of one step share the `seq`, as
  [decision 0138](0138-the-log-publishes-topics.md) decided, and so share the publication.
- **The warning of a large step counts the projection once in the outbox**, however many topics the step is
  written in ([decision 0135](0135-a-large-state-is-split-by-the-program-and-the-runtime-warns-of-it.md)). A step
  then writes the projection twice, in the read model and in its publication, whatever the number of topics.

### What a consumer reads

- **`feed` and `published` read a row of the outbox with its publication**, in one statement that joins the two.
  The page is still a range of the index `outbox_topic`, in the order of `position`, and each row finds its
  publication by the key of `publications`. A row is read through the projection's migrations and the selector of
  the program deployed, as [decision 0140](0140-a-row-of-a-topic-gives-its-value.md) decided.
- **`Published` does not change**, nor do `ack`, `forget` and `consumers`. `consumers` counts the rows of the outbox,
  which are the rows of the topic.

### What a prune drops

- **`prune` drops the rows of the outbox as before**, in each topic and partition through the lowest cursor of the
  topic's consumers, and a topic no consumer is stored for whole
  ([decision 0152](0152-the-consumers-of-a-topic-are-declared-at-deploy.md)). It gives the number of rows of the
  outbox dropped.
- **A publication is dropped with the last row of the outbox that names it**, by a trigger of the table `outbox`,
  in the statement that drops the row. A publication some topic has not pruned yet stays, and is read by that
  topic's consumers.
- **The outbox has an index of its program, partition and `seq`**, so that the trigger finds whether another row
  names the publication without reading the rows of other partitions.

### What does not change

- **A database of the schema before this note is not read.** Its table `outbox` keeps its columns, and a step's
  write into it dies. Nothing is released yet, so no such database exists outside the tests, as
  [decision 0138](0138-the-log-publishes-topics.md) said of its own change.

## What it rests on

- That a step written in several topics costs, in time and in storage, the copies of its projection: **seen**, in
  `spikes/large-states.test.ts`, whose figures the context gives, measured once, by hand. Once this note's code was
  written, the spike saw a step written in five topics take 20 ms at 0.5 MB and 304 ms at 5 MB, as a step written in
  one does, and checks that the outbox keeps one copy of the projection per step.
- That a page of a topic, read with its publications, is a range of `outbox_topic` and a search of the key of
  `publications` per row, with no scan and no sort: **tested**, by `a consumer reads from its cursors through
  indexes, and never scans the log` in [`src/runtime.test.ts`](../../src/runtime.test.ts), which reads the plan
  SQLite chooses for the statement.
- That a publication is dropped with the last row of the outbox that names it, and kept while one names it:
  **tested**, by `a step's publication is stored once, and dropped with the last topic that names it` in
  [`src/storage.test.ts`](../../src/storage.test.ts), on the SQLite 3.53.2 that `bun:sqlite` embeds.
- That a prune and the publications its trigger drops commit together: **tested** as far as a test reaches, by the
  same test, which sees no publication left without a row. A trigger runs in the statement that fires it, which
  commits whole or not at all. SQLite's documentation says so, and is no documentation of a version the
  repository pins, so a guard keeps it: the prune runs in a transaction of `SqlClient.withTransaction`, whose
  JSDoc in `effect/src/sql/SqlClient.ts` promises that every statement in it runs in one transaction.
- That a step that writes its publication and its rows in one transaction is never seen by a prune half written:
  **documented**, by the JSDoc of `SqlClient.withTransaction` in `effect/src/sql/SqlClient.ts`, and by SQLite,
  which has one writer at a time.

## Alternatives

- **A structure of Effect in place of the table.** Each module of the pinned version that could do part of the work
  was weighed. `eventlog/SqlEventJournal` stores an event once, in a table of entries, and orders it in a second
  table of sequences that names the entry by its id: the shape this note takes, read in the source. It is marked
  `@stability unstable`, `src/` does not import it, and it is a journal of events kept by clients that sync with a
  server, with no topics, partitions or cursors, so it would replace none of the outbox. Cluster's
  `SqlMessageStorage` stores a message and its replies in two tables, and has no topics. `sql/SqlModel` builds the
  statements of one table by its schema, and has no join. `sql/SqlResolver` batches requests of one shape into one
  statement, which the join already is. `sql/Migrator` runs numbered migrations of the database's tables. The
  storage creates its tables where it starts and moves no database, since none is released, so a migration of the
  outbox is not written; the first release decides how the tables move. `Cache` would keep a projection decoded
  for the readers of several topics, and each reader reads its page at its own time. None of them is used.
- **The first topic's row stores the projection, and the others name it.** It needs no table, and a prune of the
  first topic before the others would drop what they still read.
- **A count, in the publication, of the rows that name it**, decremented by the prune. It drops the publication with
  no index of the outbox, and writes the publication again at every row pruned. The index costs a few bytes per row,
  which now holds no projection.
- **A second statement of the prune**, which drops the publications no row names, in place of a trigger. It needs the
  keys of the rows dropped, given back to the process and sent again. The trigger keeps the rule in the schema,
  where any later statement that drops a row of the outbox keeps it too.
- **A publication keyed by its content**, a hash of the projection, so that two steps that leave the same projection
  share it. A step writes in a topic because what the topic selects changed, so two steps that leave the same
  projection are rare, and the key would cost a hash of the projection at every step.
- **A row of a topic that stores only its value**, as [decision 0140](0140-a-row-of-a-topic-gives-its-value.md)
  weighed it. It cannot be read through the projection's migrations.

## Consequences

- [`src/storage.ts`](../../src/storage.ts) creates `publications`, the trigger and the index of the outbox, writes a
  step's publication once, reads a page with its publications, and counts the projection once in what a step
  writes.
- [`src/storage.test.ts`](../../src/storage.test.ts) checks that a step written in several topics stores one
  publication, and that a prune keeps it while a topic names it and drops it with the last.
  [`src/runtime.test.ts`](../../src/runtime.test.ts) reads the plan of the page with its publications.
- `spikes/large-states.test.ts` measures a step written in five topics beside one written in one, and checks that the
  outbox keeps one copy of the projection per step.
- `docs/design.md` says, under What a step costs and Publishing what happened, that a step writes its projection
  once in the outbox. The glossary defines a **publication**, and its entry for the outbox says that a row names one.
  The diagram of the modules in [`README.md`](../../README.md) names the table `publications`. The open question of
  the projection written once per topic leaves `docs/open-questions.md`, and the step leaves the roadmap.
