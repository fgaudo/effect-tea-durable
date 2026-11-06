# 0153. A reader of a consumer names the partitions it reads

**Status:** proposed, 2026-11-06, for the step Readers of one consumer of the [roadmap](../roadmap.md). Decides the
[open question](../open-questions.md#storage-and-reading) of the readers of one consumer. Changes
[decision 0142](0142-a-consumer-waits-for-a-row-of-its-topic.md), whose `wait` is the fourth argument of `feed`.

## Context

A consumer is a name within a topic, with a stored cursor per partition
([decision 0137](0137-the-log-is-ordered-within-a-partition.md)). `feed` gives every reader of the name the rows past
its cursors, in every partition. Two fibers that read under one name are given the same rows, and act on them twice.

A consumer whose work on a row is slow cannot keep up with its topic alone. A consumer that sends an email per row,
at 50 ms a call, acts on twenty rows a second, whatever the runtime reads. It has two ways out today, and both cost
it something:

- **One reader acts on its page in parallel**, one fiber per partition, so that the order within a partition holds.
  It cannot read the next page before the slowest partition of this one is acked: a page read earlier gives again
  the rows not acked yet, and two fibers would act on them at once. So a slow row in one partition holds every other
  partition of the consumer.
- **A name per reader**, each reading the partitions it takes and skipping the others by hand. Every name holds the
  whole topic in a prune, since it has no cursor past what it skipped. A reader added moves the division, and the
  cursors of each partition stay with the name that read it before.

The cursors are already kept per partition. What is missing is a reading that reads some of them.

## Decision

### A reader names its partitions

- **`feed` takes its options as one object**: `feed(topic, consumer, limit, { wait, partitions })`, both optional.
  `wait` is `{ millis }`, as [decision 0142](0142-a-consumer-waits-for-a-row-of-its-topic.md) decided it, moved
  into the object.
- **Given `partitions`, `feed` reads those partitions only**, from the consumer's cursors there, the oldest row
  first, as it reads every partition without them. A wait ends at a commit in the topic, as before, and a reader
  woken by a commit in a partition it does not read finds an empty page, and waits again.
- **`partitions` is a list of integers from 1 to the number of partitions of the log**, with at least one. A list
  that is empty, or holds anything else, is the caller's defect, which reads nothing
  ([decision 0053](archive/0053-what-a-handle-is-given-is-checked.md)). A partition named twice is read once.
- **The handle gives the number of partitions of the log** as `partitions`, so that a reader divides them without
  repeating the option it was launched with.
- **`ack` does not change.** A reader acks the rows it was given, which are of its partitions, and moves no other
  cursor. A prune reads the consumer's cursors as one, whoever moved them.

### The division is the caller's

- **The runtime holds no reader.** It does not know how many read a name, and does not divide the partitions among
  them. A reader that stops costs the runtime nothing, as a consumer that stops calling does
  ([decision 0142](0142-a-consumer-waits-for-a-row-of-its-topic.md)).
- **Two readers that name one partition are given the same rows**, as two readers of one name are without
  `partitions`. Each reads them in their order, and their work on them interleaves. A division that changes keeps
  the order within each partition where the readers of the old division stop, after their acks, before the
  readers of the new one start. A division changed while both read delivers some rows twice, and may act on two
  rows of one partition out of their order.
- **A partition no reader names is read by nobody**, and holds its topic in a prune. `consumers` shows it, with the
  rows past its cursor there.
- **A division by a fixed pool** is a line: the reader `i` of `n` reads the partitions `p` where `p % n === i`. A
  pool whose readers come and go divides with what it already uses to know its members: an ordinal of the
  orchestrator, a lease of its own store, or Effect's `HashRing.getShards`, which balances a fixed number of shards
  among the nodes of a ring. `src/` does not import `HashRing`, which is marked `@stability unstable`.

## What it rests on

- That a reading restricted to a list of partitions is searched as a range of the index `outbox_topic`, in its
  order, without a sort: **seen**, in `spikes/sqlite-partitions-plan.test.ts`, on a database with no statistics, as
  the runtime leaves it. A reader of a quarter of 300 partitions read 20 000 rows in 22 ms where a reader of all of
  them read the same number in 11 ms, on Windows with Bun 1.4.2, measured once, by hand. A reader of one partition
  passes over the index entries of every other partition between its rows.
- That a slow row of one reader holds no row of another reader of the same name: **tested**, by the test `two
  readers of one consumer read their own partitions, and a slow one holds no other` in
  [`src/runtime.test.ts`](../../src/runtime.test.ts).
- That the cursors of one name, moved by several readers, are pruned as one: **tested**, by the same test.
- That every reader runs where the program is deployed, or calls a boundary of its process: **documented**, by
  [decision 0080](archive/0080-a-database-is-held-by-one-runtime.md).

## Alternatives

- **The runtime divides the partitions among the readers of a name**, as Kafka divides them among the consumers of
  a group. Each reader would give an id, and hold its partitions by a lease that each reading renews. The runtime
  would keep the readers between two calls, which it does not today, and a partition moved to a new reader would
  have to wait out the old reader's lease, or be read by both at once and lose its order. A caller that knows its
  readers divides as well, and a division of the runtime's can be added over this one later, since it is a reading
  of some partitions too.
- **One reader acts on its page in parallel by partition**, with no change to the runtime. It keeps the order, and
  a slow row holds every partition of the page, as the context says.
- **A name per reader.** It needs no change, and each name holds the whole topic in a prune.
- **`published` takes `partitions` too.** Its cursors are the caller's, and a partition left out of `after` is read
  from `0`: a caller reads some partitions by giving their cursors and reading past them. It is the reading of a test
  or of an operator looking, and gains nothing.
- **A signal per partition**, so that a commit wakes only the readers of its partition. With `n` readers, a commit
  wakes `n - 1` of them for an empty page each, a reading of the heads. It is cheap next to the work a reader does,
  and a signal per partition makes a `Deferred` per partition each reader waits for.
- **An index of the topic, its position and its partition**, which the reading of some partitions searches without
  reading a row of another. It halved the time of a reader of one partition, and changed nothing for a reader of a
  quarter. It would move an index of every database made before.

## Consequences

- [`src/runtime.ts`](../../src/runtime.ts) takes `feed`'s options as an object, checks `partitions`, and gives the
  handle `partitions`. [`src/storage.ts`](../../src/storage.ts) reads a consumer's page from the partitions given.
- [`src/runtime.test.ts`](../../src/runtime.test.ts) checks that a reader is given only its partitions, that a slow
  reader holds no other, that two readers' acks are pruned as one consumer's, and that a list of partitions it
  cannot read is a defect.
- `docs/design.md` says so under Consumers. The glossary's consumer says that its readers may divide its partitions.
  The open question of the readers of one consumer leaves `docs/open-questions.md`.
