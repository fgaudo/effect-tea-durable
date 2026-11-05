# 0137. The log is ordered within a partition

**Status:** accepted, 2026-11-05. Changes [decision 0038](archive/0038-what-happened-is-published-through-an-outbox.md),
whose `seq` is one sequence of the database, and [decision 0039](archive/0039-a-consumer-of-the-outbox-keeps-its-cursor.md),
whose consumer keeps one cursor per program. Its row keyed by its program, its partition and its `seq` is changed
by [decision 0138](0138-the-log-publishes-topics.md): a row is keyed by its topic too, and the rows of one step
share its `seq`.

## Context

A consumer reads the outbox from a cursor, and the cursor skips no row only because one transaction commits at a
time ([decision 0038](archive/0038-what-happened-is-published-through-an-outbox.md)). The runtime on SQLite keeps
that rule: the client leases its one connection under a semaphore of one. A store where two processes commit at
once does not keep it. There, a step may take `seq` 7, another step may take `seq` 8 and commit first, and a
consumer that reads in between acks 8 and never sees 7. Effect Cluster is such a store, and the roadmap runs the
runtime on it later.

A sequence stays gapless for a reader only if the steps commit in the order of their `seq`. One way to get that
is a lock that every step takes, from the moment it draws its `seq` until it commits. A lock shared by every
step of the cluster makes the steps of the whole cluster commit one at a time, which takes away what more than
one process is for. A lock for each part of the log keeps the order within the part, and lets the steps of
different parts commit at once.

Effect Cluster already divides entities in this way. An entity's id hashes to one of 300 shards per group, by
`Math.abs(hashString(entityId) % shardsPerGroup) + 1` (`getShardId` in `effect/src/cluster/Sharding.ts`, read in
the source). A consumer of Kafka reads in the same way: it keeps a cursor per partition of a topic, and is promised
the order of one partition only.

## Decision

### A partition

- **Each entity belongs to one partition of the log.** The runtime draws the partition from the entity's id when
  the entity is created, and stores it in the entity's row. A partition is a number from `1` to the number of
  partitions, given by `Math.abs(Hash.string(id) % partitions) + 1`. This is the formula Cluster gives a shard,
  with a copy of the hash of its own that is `Hash.string` line for line today, so that the step Effect Cluster
  can make the two one without moving a cursor, if it decides to. Whether it does is not decided here.
- **The partition is stored, and never computed again.** A change of `Hash.string` in a later release of Effect
  would then change the partition of the entities created after it, and of none created before. The order of an
  entity's rows depends only on its own partition, so such a change breaks no order.
- **The number of partitions is fixed for the life of the database.** `launch` takes `log: { partitions }`, 300 by
  default.
  The first launch stores the number in the database. A launch that passes a different number than the one stored
  fails, and names both numbers. A change would move entities between partitions, and every consumer's cursors with
  them.

### A `seq` within a partition

- **A step takes its `seq` within its entity's partition**, in the step's transaction, by moving the head of the
  partition: `UPDATE ... SET seq = seq + 1 ... RETURNING seq` on a row per program and partition. The update
  locks the row until the transaction ends, on a store that locks rows. So the steps of one partition commit in the
  order of their `seq`, and the steps of different partitions do not wait for each other. The step draws its
  `seq` after its other writes and right before it writes its row of the outbox, the one write that needs it, so
  that the head row is held for the least of the transaction. A partition's head row is written by the first step
  that publishes in it, and is never deleted, so that a `seq` is never given again.
- **A row of the outbox is keyed by its program, its partition and its `seq`.** It holds the projection whole, as
  [decision 0135](0135-a-large-state-is-split-by-the-program-and-the-runtime-warns-of-it.md) keeps it, so no row
  needs another row to be read.

### What a consumer reads

- **The log promises the order of one entity's rows, not an order across entities.** A consumer may read an
  effect in one partition before its cause in another. A row of entity A that was committed before a row of
  entity B may come after it, as it may on Kafka.
- **A consumer keeps a cursor per partition.** A consumer is a name of its own, stored on its first reading. A
  partition it has no cursor for is read from `0`.
- **`feed(consumer, limit)` gives at most `limit` rows past the consumer's cursors, the oldest first.** Each row
  carries its `partition` and its `seq`. The rows come in the order they were written, which the store keeps in a
  column of its own: an integer that rises with each row, as the outbox's `seq` does today. That column orders
  the rows and is no cursor. A row written before one a consumer has read may commit after it, and is read then,
  from its partition's cursor. Within a partition the column rises with `seq`, since a step draws its `seq`
  under the partition's lock before it writes its row, and the next step of the partition draws after the first
  committed. So the rows of one partition come in the order of their `seq`, and the rows of different partitions
  come as the entities wrote them, give or take the transactions in flight at once.
- **`ack(consumer, through)` takes a list of partitions and `seq`s**, and moves each of those cursors. A row has
  the fields `partition` and `seq`, so the rows that `feed` gave are such a list. Each cursor never moves back,
  and never moves past the head of its partition, as one cursor does today.
- **`published(after, limit)` takes the same list as its cursor**, and stores nothing. `[]` is the whole log.
- **`consumers` gives, for each consumer, how many rows are past its cursors in all**, and the cursors of the
  partitions it is behind in.
- **`prune` drops, in each partition, the rows through the lowest cursor of every consumer.** A consumer with no
  cursor for a partition holds that partition from `0`. Where no consumer is stored, it drops nothing, as today.

## What it rests on

- That a consumer can act on the order of one entity's rows without an order across entities: **only reasoned**,
  on what consumers of Kafka are promised. A consumer that needs an effect after its cause in another entity waits
  for the cause, or reads the cause's projection, which holds the state whole.
- That a row locked by an `UPDATE` stays locked until the transaction ends, so that the steps of a partition commit
  in the order of their `seq`: **documented** by PostgreSQL, under Explicit Locking, for row-level locks. No store
  of the runtime has two writers yet, so no test sees it. On SQLite every transaction commits one at a time, as
  [decision 0038](archive/0038-what-happened-is-published-through-an-outbox.md) documents. The step Effect Cluster
  runs a test with two writers.
- That `Hash.string` gives the same number for the same text within a release: **documented**, in its JSDoc in
  `effect/src/Hash.ts`, which is `@stability stable` and gives the values of three texts. That it gives the same
  number in a later release is not promised, and the partition is stored so that the order does not rest on it. A
  test pins the partitions of a few ids, so that a move of Effect's version that changes them is seen: `the
  partition of an id is Cluster’s formula on Hash.string, pinned for a few ids`, in
  [`src/storage.test.ts`](../../src/storage.test.ts).
- That Cluster draws a shard by the same formula: **read in the source**, in `getShardId` of
  `effect/src/cluster/Sharding.ts`, which is `@stability unstable`, and in `hashString` of
  `effect/src/cluster/internal/hash.ts`, which is `@internal` and the code of `Hash.string` line for line. The
  two may part in a release without `Hash.string` changing, which the test that pins the partitions would not
  see. Nothing of this decision falls without it, since a partition and a shard are one only if the step Effect
  Cluster decides so.
- That SQLite runs `INSERT ... ON CONFLICT DO UPDATE ... RETURNING`, which writes a partition's head row at its
  first step and moves it at the next ones: documented by SQLite from 3.35, and **tested** on SQLite 3.53.2, which
  Bun 1.4.2 bundles, by every test that publishes, `the entities of one partition share its sequence, in the order
  their steps committed` in [`src/runtime.test.ts`](../../src/runtime.test.ts) among them.
- That `position` rises with `seq` within a partition, so that `feed` may start from the lowest `seq` past each
  cursor: on SQLite **documented**, since `AUTOINCREMENT` gives each row a rowid larger than any before it, and a
  step draws its `seq` in the same transaction, before it writes its row. On a store with two writers it holds
  where the store gives `position` as the row is written, after the head's row is locked: **only reasoned**. The
  step Effect Cluster runs a test with two writers.
- That a consumer that reads a row of one partition and acks it still reads a row of another partition committed
  after it with a lower `position`: **tested**, by `a row that commits after one a consumer has read is read then,
  from its partition’s cursor` in [`src/storage.test.ts`](../../src/storage.test.ts), which writes the rows by hand
  in that order.

## Alternatives

- **One sequence, with a lock every step of the cluster takes.** It keeps a total order, and makes every step of
  the cluster commit one at a time.
- **One sequence, read only below the oldest transaction in flight**, as an outbox on PostgreSQL does with
  `pg_current_snapshot`. It keeps a total order and costs the writers nothing. It ties the log to the internals of
  one store, and holds every consumer behind the longest transaction.
- **A cursor per entity.** It keeps the same order as a partition, and a consumer stores one cursor per entity that
  ever published, which grows with the entities.
- **A partition that is Cluster's shard by definition.** A partition would then follow `shardsPerGroup`, an option
  of the deployment, and a change of the option would move every consumer's cursors. The step Effect Cluster decides
  whether to bind them.
- **The rows of different partitions by `seq`, then by partition.** It needs no column of its own, and a consumer
  that is behind reads the first row of every partition before the second row of any. A consumer that is at pace
  reads the rows of a partition whose head is low before those of one whose head is high, however old those are,
  for as long as the low head stays behind: a partition at `seq` 10000 waits behind every new row of one at
  `seq` 5 until that one catches up.
- **A partition computed from the id at each step**, with nothing stored. It saves a column, and a change of the
  hash in a later release of Effect would move an entity's later rows to another partition, out of order with its
  earlier rows.

## Consequences

- The open question of the order of what is published leaves
  [`docs/open-questions.md`](../open-questions.md) once this note is taken.
- `Published` gains a `partition`. `published`, `feed`, `ack`, `consumers` and `prune` change as above, in
  [`src/runtime.ts`](../../src/runtime.ts) and [`src/storage.ts`](../../src/storage.ts). The storage gains a table of
  consumers, a table of the heads of the partitions, and a column `partition` in `entities` and in `outbox`. The
  integer the outbox gives each row today stays, under a name of its own, as the order `feed` reads in. A
  database of the schema before this note is not read. Nothing is released yet, so no such database exists outside
  the tests.
- [`src/storage.test.ts`](../../src/storage.test.ts) and [`src/runtime.test.ts`](../../src/runtime.test.ts) check that
  a consumer reads every row of every partition in the order of its `seq`, that an ack moves only the partitions it
  names, that a prune keeps what any consumer has not read in each partition, and that a launch with another number
  of partitions fails. A test pins the partitions of a few ids.
- `docs/design.md` says, under Publishing what happened, what the log promises and what it does not. The glossary defines
  **partition**, and its entries for the consumer and the outbox say that a cursor and a `seq` are per partition.
  The diagram of the modules in [`README.md`](../../README.md) names the new tables.
- The examples whose tests read the log, [`examples/order`](../../examples/order) and
  [`examples/booking`](../../examples/booking), read it with the new cursors.
