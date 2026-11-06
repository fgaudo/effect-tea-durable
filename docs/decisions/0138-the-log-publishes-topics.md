# 0138. The log publishes topics, and a consumer reads one

**Status:** accepted, 2026-11-05. Changes [decision 0038](archive/0038-what-happened-is-published-through-an-outbox.md),
whose log has nothing declared of it and one row per step, [decision 0039](archive/0039-a-consumer-of-the-outbox-keeps-its-cursor.md),
whose consumer reads every row of its program, [decision 0072](archive/0072-the-log-shows-what-a-step-changed.md),
whose step publishes when what callers read changed, and [decision 0137](0137-the-log-is-ordered-within-a-partition.md),
whose row of the outbox is keyed by its program, its partition and its `seq`. Its topic converting what it selects
to JSON is changed by [decision 0139](0139-the-projection-is-json.md): the projection is JSON, and a selector
converts nothing. Its row holding the projection whole, and its `Published` giving the projection, are changed by
[decision 0140](0140-a-row-of-a-topic-gives-its-value.md): a row gives the value its topic selects. Its prune
that drops nothing of a topic with no consumer is changed by [decision 0152](0152-the-consumers-of-a-topic-are-declared-at-deploy.md):
such a topic is pruned whole.

## Context

A program has one `project`, and a step that changes the projection writes it whole in the row of the read model
and in a row of the outbox ([decision 0032](archive/0032-a-projection-is-a-row.md),
[decision 0038](archive/0038-what-happened-is-published-through-an-outbox.md)). The design advises a projection that
shows what a caller acts on ([decision 0135](0135-a-large-state-is-split-by-the-program-and-the-runtime-warns-of-it.md)).
Different readers act on different parts of it. A billing service reads what an order was charged, and a dashboard
reads its status. Each consumer of the outbox receives a row at every step that changes any part of the
projection, and cannot tell a change of the part it reads from a change of another part without keeping the row
before.

The read model does not have this cost in the same way. A caller of `read` gets one row, and the boundary that
answers it can pick the fields its reader needs. A query filters by indexes, which read only what they name. The
log is where the cost shows: every consumer reads every row.

Kafka divides a log the same way. A producer writes to a topic, a consumer subscribes to a topic, and a topic is
divided into partitions. [Decision 0137](0137-the-log-is-ordered-within-a-partition.md) already took the partitions.

## Decision

### Topics

- **A program may declare `topics`**: by name, a pure function of the projection that selects what the topic
  watches, as JSON, as an index selects a scalar of the projection
  ([decision 0032](archive/0032-a-projection-is-a-row.md)). A topic selects and does not decide: a part of the
  projection, the whole of it, all of it but a field, a value nested in it, or a comparison with a threshold, which
  changes when the threshold is crossed. A topic has no schema and no migration of its own. The projection stays
  the one contract of the entity, for its callers and for the consumers of its log: what a consumer needs of an
  entity is in the projection, and a boundary that answers a caller leaves out what that caller is not shown.
- **What a topic selects is JSON**, so a `DateTime` or an `Option` of the projection is converted where it is
  selected, by the program, which decides there what counts as a change of it. The types refuse a selection that is
  not JSON where the program is declared with `program(schemas)(…)`. A topic that dies on a projection, or that
  selects what JSON does not hold, suspends the entity, as a `project` that dies does
  ([decision 0014](archive/0014-rules-the-machine-settled.md), [decision 0040](archive/0040-what-is-stored-encodes-to-json-as-it-is.md)).
- **A program is refused where it enters** if its `topics` is empty, or if a topic has an empty name
  ([decision 0054](archive/0054-a-program-is-checked-where-it-enters.md)).
- **A program that declares no topics publishes its projection as the one topic `projection`**, at each step
  that changes it. Such a program's log is the log of today.

### What a step publishes

- **A step is written in each topic whose selection changed in that step**, as the program deployed computes the
  projection before and after, compared by the canonical JSON of what the topic selects, as
  [decision 0072](archive/0072-the-log-shows-what-a-step-changed.md) compares the projection. A creation is written
  in every topic. A step in which no topic's selection changed publishes nothing, and draws no `seq`.
- **Every row of a step holds the projection**, whole, with the message the step handled. The topic says why the
  row was written, not what it holds, so a consumer reads what it acts on and may read the rest. A row is read
  through the projection's migrations, whatever its topic
  ([decision 0036](archive/0036-a-migration-is-a-function-on-the-json.md)).
- **The rows of one step share one `seq`**, drawn from the head of the entity's partition once, as
  [decision 0137](0137-the-log-is-ordered-within-a-partition.md) draws it. So a step takes one lock however many
  topics it is written in, and the rows of one topic come in the order of their `seq` within a partition, as the
  rows of the log do today. A topic's rows have gaps in their `seq`, where a step was written in other topics only.
- **A row of the outbox is keyed by its program, its topic, its partition and its `seq`.** `Published` gains
  `topic`.
- **The warning of a large step counts every row it writes**, the projection once per topic the step is written
  in ([decision 0135](0135-a-large-state-is-split-by-the-program-and-the-runtime-warns-of-it.md)).

### What a consumer reads

- **A consumer reads one topic.** A consumer is a name within a topic: `feed`, `ack` and `forget` take the topic
  first, and two consumers of the same name in two topics are two consumers. A consumer keeps a cursor per
  partition of its topic, as [decision 0137](0137-the-log-is-ordered-within-a-partition.md) keeps one per partition.
- **`published` takes the topic first too**, and reads only that topic's rows. A topic the program does not publish
  is its caller's defect, which reads and stores nothing, in `published`, `feed`, `ack` and `forget`
  ([decision 0053](archive/0053-what-a-handle-is-given-is-checked.md)).
- **`consumers` gives each consumer with its topic.**
- **`prune` drops, in each topic and partition, the rows through the lowest cursor of that topic's consumers.** A
  topic with no consumer drops nothing, as a log with no consumer drops nothing today
  ([decision 0039](archive/0039-a-consumer-of-the-outbox-keeps-its-cursor.md)).

### What does not change

- **The read model holds the projection**, and `read`, `query`, `reindex` and the indexes read it, as before.
  `projectionViolations` checks it against `update`. Nothing of a topic is stored but the rows of the log.
- **A step that changes nothing a caller reads publishes nothing**, as
  [decision 0038](archive/0038-what-happened-is-published-through-an-outbox.md) decided: a fact that must reach
  another system is shown in the projection, where a topic selects it.
- **`reindex` publishes nothing**, and a new `project` reaches the log at an entity's next step that changes what a
  topic selects, as it reaches it today ([decision 0072](archive/0072-the-log-shows-what-a-step-changed.md)).

## What it rests on

- That a consumer of the outbox acts on a part of the projection, and that the rows of the other parts cost it:
  **only reasoned**, and seen in [`examples/order`](../../examples/order), whose billing consumer reads the order's
  charge and whose dashboard reads its status. The test of the example counts the rows each consumer reads.
- That a topic is a pure function of the projection, so that two steps that leave the same projection select the
  same: **only reasoned**, as the purity of `project` and of an index is
  ([decision 0032](archive/0032-a-projection-is-a-row.md)). The library checks no purity, of a topic as of `project`.
- That rows sharing a `seq` keep the order of each topic within a partition: it follows from
  [decision 0137](0137-the-log-is-ordered-within-a-partition.md), since the step draws the `seq` once, under the
  head's lock, and writes all its rows before it commits. **Tested** on SQLite: `each topic is read alone, through
  the projection's migrations, and a step's rows share its seq` in [`src/storage.test.ts`](../../src/storage.test.ts)
  reads each topic in the order of its `seq`, with none of another topic's rows, and the test of
  [`examples/order/runtime.test.ts`](../../examples/order/runtime.test.ts) does it through the runtime.

## Alternatives

- **A topic as a function of the state, with a schema and migrations of its own**, as `project` is. It lets a
  program publish what no caller reads, and gives each consumer a row of its own shape. It is a second way to
  derive a model from the state, next to `project`: the two can say different things of one state, nothing checks a
  topic against `update`, and every topic is one more schema to migrate. A boundary that picks fields gives a
  consumer its shape already. If a program must one day publish what its callers must not read, this is the
  alternative to take, with a note that says why.
- **A topic as a list of fields of the projection.** It is data, which the runtime checks against the projection's
  schema where the program enters, and which a test can read. Every case a list leaves out is a request for a form
  of its own: the whole projection, all of it but a field, a value nested in a field. A selector says each in
  TypeScript, and the types check what it reads.
- **A topic as a predicate on the projection before and after the step**, which says whether to publish. It puts
  a decision in the program's hands, and the equality of what it compares: `!==` between two `DateTime`s publishes
  at every step. A selector leaves the comparison to the runtime, on canonical JSON, and a threshold is a
  selection too, a boolean that changes when it is crossed.
- **A topic as a function of the encoded projection.** The comparison is the same, but the program writes its
  topics in the encoded shape, milliseconds for a `DateTime`, which it writes nowhere else but in a migration.
- **A row that holds only what the topic selects.** The row is smaller, and cannot be read through the projection's
  migrations, which are functions on the whole JSON: each topic would need a schema and migrations of its own.
- **One row per step, naming every topic that changed.** It writes one row, and every consumer reads the rows of
  every topic, which is the cost this note takes away.
- **A head per topic and partition.** A topic's `seq` would have no gaps. A step written in two topics would take
  two locks, in an order every step must keep.
- **A consumer of every topic, which filters.** It needs no topic in `feed`, and it reads every row again.

## Consequences

- The open question of one projection for every reader leaves [`docs/open-questions.md`](../open-questions.md) once
  this note is taken.
- `Program` gains `topics`, and `Types` gains an optional `topic`, the names of the topics, in
  [`src/program.ts`](../../src/program.ts): `Topic<T>` is `projection` for types without it. The machine's
  `Publication` gains the names of the topics a step is written in, in [`src/machine.ts`](../../src/machine.ts), and
  [`src/machine.test.ts`](../../src/machine.test.ts) checks that a step is written in the topics whose selection
  changed and in no other, and that a topic that dies or selects what JSON does not hold suspends the entity.
- The outbox, the consumers and the cursors gain a column `topic`, in [`src/storage.ts`](../../src/storage.ts). A
  database of the schema before this note is not read. Nothing is released yet, so no such database exists outside
  the tests.
- `published`, `feed`, `ack` and `forget` take the topic first, and `consumers` gives it, in
  [`src/runtime.ts`](../../src/runtime.ts).
- [`examples/order`](../../examples/order) shows its charge in the projection, and declares two topics, read by two
  consumers. The other examples publish their projection as the topic `projection`.
- `docs/design.md` says, under Publishing what happened, what a topic is and what a consumer reads. The glossary
  defines **topic**, and its entries for the consumer and the outbox say that a consumer reads one topic. The diagram
  of an entity's loop in [`README.md`](../../README.md) shows the projection going to the outbox by topic.
