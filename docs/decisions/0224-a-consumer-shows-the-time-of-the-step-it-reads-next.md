# 0224. A consumer shows the time of the step it reads next, and the runtime records no metric of its age

**Status:** accepted, 2026-11-10. Decides the open question of the age of a consumer's oldest unread row, which
[decision 0220](0220-the-runtime-records-a-span-for-each-step-and-each-operation.md) left. Changes
[decision 0154](archive/0154-a-steps-projection-is-stored-once-in-the-outbox.md), whose publication now holds the
step's time.

## Context

An operator asks of a consumer how far it is behind. `consumers` gives how many rows are past its cursors, which
says what it costs the log to keep the consumer, and not how old the rows are. A thousand rows are a minute of a
busy topic, or a month of a quiet one.

The log stored no time. A row of `effecttea_outbox` holds its position, its partition and its `seq`, and a
publication of `effecttea_publications` holds the message and the projection. Decision 0220 left the column for the
step on PostgreSQL of the roadmap, which changed the log's tables. That step is done
([decision 0222](0222-postgresql-with-many-connections.md)), and no release of the library has made a database
yet, so the migration of the tables still changes in place.

A step's time is not in the order of its `seq`. The loop reads the time before the step's transaction begins, and
the step draws its `seq` last, once the head of its partition is free
([decision 0137](archive/0137-the-log-is-ordered-within-a-partition.md)). Two entities of one partition may then
commit in the order opposite to their times, on one process. On Cluster the gap grows to the difference between
the clocks of two runners, and a clock set back gives the same.

## Decision

- **A publication holds the time of its step**, in the column `written_at` of `effecttea_publications`, as
  milliseconds of the epoch. The time is the one the step is written with: the time a message is handled, a timer
  fires or an entity is created, on the clock of the process that writes it. A step writes one publication however
  many topics it publishes in, so the time costs one integer per step that publishes. The column stands before the
  message and the projection, which SQLite would walk past to reach it.
- **`consumers` gives each consumer `since`**, the time of the step that wrote the oldest of the rows the consumer
  reads next, or `null` where it has read every row. A consumer reads next, in each partition, the row of the lowest
  `seq` past its cursor, since `seq` is the order the steps of a partition committed in. `since` is the earliest of
  those times across the partitions. That row is the one a consumer that is stuck is stuck on.
- **`since` is a time, not an age.** The storage reads no clock. The age is the caller's clock less `since`. Under
  clocks that disagree an age may come out a little below zero, and the JSDoc of `Consumer` says so.
- **The runtime records no metric of the age, and runs nothing at an interval for it.** An application that wants a
  gauge reads `consumers` at an interval it chooses, and sets a gauge of its own.

## What it rests on

- That a partition's `seq` is the order its steps committed in: **tested** on a server of PostgreSQL by
  `two writers of one partition commit in the order of their seq, the second waiting for the first` in
  [`src/postgres.test.ts`](../../src/postgres.test.ts) (decision 0222).
- That a step's time may run against its `seq`: **only reasoned**, from where the loop reads the time
  ([`src/loop.ts`](../../src/loop.ts)) and where the step draws its `seq` ([`src/storage.ts`](../../src/storage.ts)).
  The rule does not need it to happen, only that it may.
- That `since` follows the `seq` and not the earliest time: **tested** by
  `a consumer's time is the step of its next row in each partition, the oldest of them, whatever the clock` in
  [`src/storage.test.ts`](../../src/storage.test.ts), which writes two steps of one partition with times in the
  opposite order.
- That every row of the outbox has its publication, so that the join reads a time for each partition behind:
  **tested** by the tests of decision 0154, whose trigger drops a publication only with the last row that names it.
- That the reading costs one lookup of a publication by its key for each consumer and partition, whatever the rows
  behind: **only reasoned**. The lowest `seq` comes from the grouping that already counts the rows behind, over the
  index `effecttea_outbox_partition`, and a publication is read by its primary key.
- That `written_at` is read through the one schema of integers, as a bigint of PostgreSQL is: **tested** by the
  tests of the storage on the server (decision 0222).

## Alternatives

- **The earliest time of the rows past the cursors.** It would read every publication behind, or need an index on
  a column only this reading reads. It gives the time of a row the consumer reads later, where a time runs against
  the `seq`, and not of the row it is stuck on.
- **The time in each row of `effecttea_outbox`.** One integer per topic instead of one per step, for the same time.
- **The time on each row `fetch` gives.** It would give a reader the delay from a step to its reading, nearly for
  free, since `fetch` already reads the publication. It is a promise of its own, and nothing asks it yet. Adding it
  later breaks no caller.
- **A gauge `tea.consumer.age` that a fiber of the runtime sets at an interval.** On Cluster every runner would set
  the same series. A consumer forgotten would keep its last value. Every deployment would pay for the fiber and for
  an interval it did not choose. The roadmap's step of the runtime's housekeeping decides whether the runtime runs
  anything at an interval. A gauge that each reader sets as it reads a page says nothing of a consumer no reader
  runs, which is the case an operator looks for.

## Consequences

- A test that compares what `consumers` gives whole compares `since` too.
- The guide's page on the outbox says how an operator reads the age, and how an application makes a gauge of it.
