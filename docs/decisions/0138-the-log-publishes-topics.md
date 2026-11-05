# 0138. The log publishes topics, and a consumer reads one

**Status:** proposed, 2026-11-05. Would change [decision 0038](archive/0038-what-happened-is-published-through-an-outbox.md),
whose row holds the projection and nothing else is declared, [decision 0039](archive/0039-a-consumer-of-the-outbox-keeps-its-cursor.md),
whose consumer reads every row of its program, and [decision 0137](0137-the-log-is-ordered-within-a-partition.md),
whose row of the outbox is keyed by its program, its partition and its `seq`.

## Context

A program has one `project`, and a step that changes the projection writes it whole in the row of the read model
and in a row of the outbox ([decision 0032](archive/0032-a-projection-is-a-row.md),
[decision 0038](archive/0038-what-happened-is-published-through-an-outbox.md)). The design advises a projection that
shows what a caller acts on ([decision 0135](0135-a-large-state-is-split-by-the-program-and-the-runtime-warns-of-it.md)).
Different readers act on different things. A billing service reads what an order was charged, and a dashboard reads
its status. The one projection is then the union of what every reader needs. Each consumer of the outbox receives
the whole projection at every step that changes any part of it, and cannot tell a change of the part it reads from a
change of another part.

The read model does not have this cost in the same way. A caller of `read` gets one row, and the boundary that
answers it can pick the fields its reader needs. A query filters by indexes, which read only what they name. The
log is where the cost shows: every row is written for every consumer, and every consumer reads every row.

Kafka divides a log the same way. A producer writes to a topic, a consumer subscribes to a topic, and a topic is
divided into partitions. [Decision 0137](0137-the-log-is-ordered-within-a-partition.md) already took the partitions.

## Decision

### Topics

- **A program may declare `topics`**: by name, a pure function of the state and of its children's projections, as
  `project` is. Each topic has a schema in `schemas.topics`, under the same name, which encodes to what JSON holds
  ([decision 0030](archive/0030-a-schema-encodes-to-json.md)). A migration reads a topic's JSON by the topic's name,
  in `topics` of the migration, as it reads the projection's in `projection`
  ([decision 0036](archive/0036-a-migration-is-a-function-on-the-json.md)).
- **A program that declares no topics publishes its projection as the one topic `projection`.** Such a program's
  log is the log of today. A program that declares topics publishes them alone, and its projection is no topic,
  unless the program declares one whose function is `project`.
- **The machine computes every topic wherever it computes the projection**: at a step's next state, at a
  creation's first state, and at an activation's stored state. A topic that dies, or that does not encode, suspends
  the entity, as a `project` that dies does ([decision 0014](archive/0014-rules-the-machine-settled.md)).

### What a step publishes

- **A step writes one row of the outbox for each topic whose value changed in that step**, as the program deployed
  computes it before and after the step, by its encoded JSON, as
  [decision 0072](archive/0072-the-log-shows-what-a-step-changed.md) compares the projection. A creation writes a row
  for every topic. A step in which no topic changed publishes nothing, and draws no `seq`.
- **The rows of one step share one `seq`**, drawn from the head of the entity's partition once, as
  [decision 0137](0137-the-log-is-ordered-within-a-partition.md) draws it. So a step takes one lock however many topics
  it publishes, and the rows of one topic come in the order of their `seq` within a partition, as the rows of the log
  do today. A topic's rows have gaps in their `seq`, where a step published only other topics.
- **A row of the outbox is keyed by its program, its partition, its `seq` and its topic**, and holds the message the
  step handled and the topic's value. `Published` gains `topic`, and its `projection` is the topic's value.
- **The warning of a large step counts every row it writes**, the outbox's rows of each topic included
  ([decision 0135](0135-a-large-state-is-split-by-the-program-and-the-runtime-warns-of-it.md)).

### What a consumer reads

- **A consumer reads one topic.** A consumer is a name within a topic: `feed`, `ack` and `forget` take the topic
  first, and two consumers of the same name in two topics are two consumers. A consumer keeps a cursor per
  partition of its topic, as [decision 0137](0137-the-log-is-ordered-within-a-partition.md) keeps one per partition.
- **`published` takes the topic first too**, and reads only that topic's rows.
- **`consumers` gives each consumer with its topic.**
- **`prune` drops, in each topic and partition, the rows through the lowest cursor of that topic's consumers.** A
  topic with no consumer drops nothing, as a log with no consumer drops nothing today
  ([decision 0039](archive/0039-a-consumer-of-the-outbox-keeps-its-cursor.md)).

### What does not change

- **The read model holds the projection, and only the projection.** `read`, `query`, `reindex` and the indexes read
  it, and `projectionViolations` checks it against `update`. A topic has no row in the read model, so a topic cannot
  be read by id and no index reads a topic. A reader of one entity that needs a part of the projection gets it from
  a boundary that picks fields.
- **`reindex` publishes nothing**, and a new topic reaches the log at an entity's next step that changes it, as a new
  `project` does ([decision 0072](archive/0072-the-log-shows-what-a-step-changed.md)).

## What it rests on

- That a consumer of the outbox needs a part of what an entity shows, and that the rows of the other parts cost it:
  **only reasoned**, and seen in [`examples/order`](../../examples/order), whose billing consumer reads the order's
  charge and whose dashboard reads its status. The test of the example counts the rows each consumer reads.
- That every topic is a pure function of the state, so that no topic drifts from the projection: **only reasoned**,
  as the projection's purity is ([decision 0032](archive/0032-a-projection-is-a-row.md)). The library checks no
  purity, of a topic as of `project`.
- That rows sharing a `seq` keep the order of each topic within a partition: it follows from
  [decision 0137](0137-the-log-is-ordered-within-a-partition.md), since the step draws the `seq` once, under the head's
  lock, and writes all its rows before it commits. A test of `src/runtime.test.ts` checks that a consumer of each topic
  reads its rows in the order of their `seq`, and none of another topic's.

## Alternatives

- **One row per step, holding every topic that changed.** It writes one row, and every consumer reads the rows of
  every topic, which is the cost this note takes away.
- **A head per topic and partition.** A topic's `seq` would have no gaps. A step that publishes two topics would take
  two locks, in an order every step must keep.
- **Topics in the read model too**, each a row that `read` takes by name and an index may read. It gives a read of a
  topic by id, and writes a row of the read model for each topic that changed, which is the write this note saves.
  A boundary that picks fields already gives a reader of one entity the part it needs.
- **A consumer of every topic, which filters.** It needs no topic in `feed`, and it reads every row again.
- **The projection always published, beside the topics.** A program whose callers act on a large projection would
  write it to the log at every step, with no consumer that needs it.

## Consequences

- The open question of one projection for every reader leaves [`docs/open-questions.md`](../open-questions.md) once
  this note is taken.
- `Program` gains `topics`, `Schemas` gains `topics`, and `Migration` gains `topics`, in
  [`src/program.ts`](../../src/program.ts). `Types` gains a `topic` slot, the names of the topics, with their values.
  The machine's `Publication` becomes a list of rows, one per topic, in [`src/machine.ts`](../../src/machine.ts), and
  [`src/machine.test.ts`](../../src/machine.test.ts) checks that a step publishes the topics that changed and no other.
- The outbox, the consumers and the cursors gain a column `topic`, in [`src/storage.ts`](../../src/storage.ts). A
  database of the schema before this note is not read. Nothing is released yet, so no such database exists outside
  the tests.
- `published`, `feed`, `ack`, `forget` and `consumers` take or give the topic, in [`src/runtime.ts`](../../src/runtime.ts).
- [`examples/order`](../../examples/order) declares two topics, read by two consumers. The other examples publish their
  projection as the topic `projection`.
- `docs/design.md` says, under Publishing what happened, what a topic is and what a consumer reads. The glossary
  defines **topic**, and its entries for the consumer and the outbox say that a consumer reads one topic. The diagram
  of the modules in [`README.md`](../../README.md) shows the topics if it names what the outbox holds.
