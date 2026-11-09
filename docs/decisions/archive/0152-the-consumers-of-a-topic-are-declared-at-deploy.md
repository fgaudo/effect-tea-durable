# 0152. The consumers of a topic are declared at deploy

**Status:** accepted, 2026-11-06, with the step A log that nobody prunes of the roadmap. Decides the
[open question](../../open-questions.md#storage-and-reading) of a log that nobody prunes. Changes
[decision 0039](0039-a-consumer-of-the-outbox-keeps-its-cursor.md), whose consumer declares itself by
reading and whose topic with no consumer keeps every row, [decision 0137](0137-the-log-is-ordered-within-a-partition.md),
whose consumer is stored on its first reading, and [decision 0138](0138-the-log-publishes-topics.md), whose prune
drops nothing of a topic with no consumer. On a disk that is really full, in WAL mode, the forget commits and the prune
waits for room an operator frees, by [decision 0223](../0223-a-disk-that-is-really-full.md).

## Context

A consumer is a name within a topic, stored by its first `feed` or `ack`, and the runtime never drops a row a
stored consumer has not read ([decision 0039](0039-a-consumer-of-the-outbox-keeps-its-cursor.md)). Three
cases hold a topic for ever, and nothing tells an operator which one is at hand:

- a consumer that stopped acking, because its code is gone or stuck;
- a name mistyped once, which `feed` stored at its first reading;
- a topic no consumer ever read, which `prune` keeps whole, since a log nobody reads was taken to be one somebody
  reads by hand. A program that declares no topics publishes its projection at every step that changes it, so a
  deployment that reads no log keeps every step's projection for ever.

The way out decision 0039 gave is `forget`. The spike
[`spikes/full-database.test.ts`](../../../spikes/full-database.test.ts) shows that it frees nothing where the consumer
forgotten was the topic's only one: the topic then has no consumer, and `prune` drops nothing of it.

The spike also shows what a full database does, on Windows with Bun 1.4.2. `PRAGMA max_page_count` caps the file
of a database in the rollback journal, as a full disk would, under a consumer that read once and never acked:

- a step that cannot commit dies with SQLite's `database or disk is full`, and its caller is given the defect, in
  every entity;
- `read`, `consumers` and `forget` still answer, and a consumer still reads and acks;
- once a prune behind that consumer has dropped rows, the steps commit again, the step of the entity whose step had
  died included.

A database in WAL mode, the client's default, is not capped by `max_page_count` within the spike's run: the rows
go to the WAL, and the file grows only at a checkpoint. A delete needs room in the journal too, so on a disk that
is really full a prune may fail where the spike's prune succeeded.

## Decision

### Consumers are declared

- **`deploy` takes the consumers of each topic**, by name: `deploy(program, { consumers: { status: ['dashboard'] } })`.
  The handle's `feed` and `ack` are typed with the names declared for their topic, so a name mistyped is refused by
  the compiler. A name not declared for the topic is the caller's defect at run time, which reads and stores
  nothing ([decision 0053](0053-what-a-handle-is-given-is-checked.md)).
- **A deploy whose consumers cannot be read as written dies**, before anything is stored: a topic the program does
  not publish, an empty name, or a name declared twice in one topic
  ([decision 0054](0054-a-program-is-checked-where-it-enters.md)).
- **A deploy stores each consumer it declares that is not stored yet**, with no cursor. So a consumer holds its
  topic from the deploy that first declares it, and not from its first reading. A `feed` writes nothing, at its
  first reading as at any other, and an ack moves cursors only.
- **Who reads the log stays the deployment's**, as decision 0039 decided. The program says what it publishes, and
  the same program is deployed with other consumers, or none, in a test.

### A consumer no longer declared

- **A stored consumer that the deploy does not declare is kept**, and holds its topic as before. The deploy logs a
  warning for each, with its topic, its name and how many rows are past its cursors. Dropping it would drop rows a
  consumer may still need, in silence, where a deploy left a name out by mistake.
- **`consumers` says whether each consumer is declared.** `forget` drops a stored consumer that is not declared. A
  consumer the deploy declares is not forgotten, which is the caller's defect: it is dropped by a deploy without
  it, and then forgotten.

### What a prune drops

- **A topic that no stored consumer holds is pruned whole.** Since every consumer is declared and stored at deploy,
  such a topic has no reader that keeps cursors. A reading by hand, with `published`, carries its own cursors and
  has no say in a prune, as before. So the log of a deployment with no consumers stays as long as the time between
  two prunes, and forgetting a topic's last consumer frees the topic.
- **A topic with a stored consumer is pruned as before**, in each partition through the lowest cursor of its
  consumers ([decision 0137](0137-the-log-is-ordered-within-a-partition.md)).

### A full database

- **The runtime caps nothing and drops nothing by time.** A step that cannot commit dies, and its caller is given
  the defect. An operator sees which consumer holds the log in `consumers`, by the rows past its cursors, and frees
  the room with a forget and a prune. Watching the disk stays the operator's, as decision 0039 said.

## What it rests on

- That a full database fails a step's commit, leaves the readings and the forget answering, and takes steps again
  once a prune has dropped rows: **seen**, in `spikes/full-database.test.ts`, under `max_page_count` with the
  rollback journal. A disk that is really full, and a database in WAL mode, are **not seen**: a prune that needs
  room in the journal may fail there, which goes in [`docs/open-questions.md`](../../open-questions.md).
- That a consumer runs where the program is deployed, so that the deploy knows its name: **documented**, by
  [decision 0080](0080-a-database-is-held-by-one-runtime.md), under which the handle a consumer reads with
  is the one process's.
- That a topic no consumer holds has no reader that needs its rows kept: **only reasoned**. A reader by hand that
  reads past a prune loses rows, as it does today past the lowest cursor of the consumers.

## Alternatives

- **Consumers declared with the program**, in its `topics`. A topic and its readers would be read together, but a
  test, a replay or a second deployment of the same program would publish to readers it does not run. Decision
  0039 put the readers in the deployment's hands, and nothing here moves them.
- **A stored consumer that the deploy does not declare is dropped by the deploy.** It needs no `forget`, and drops
  rows another deploy of the same database may still need, without a word, where a name was left out by mistake.
- **A consumer that has not acked within a time of the operator's is forgotten**, and told so at its next reading.
  A consumer slow for a day loses rows for being slow, and the runtime must keep what it forgot to tell it.
- **A cap on the rows a topic holds.** A step that cannot publish cannot commit, so a consumer that stalls stops
  the entities, as a full disk does, sooner and by the runtime's choice.
- **A step writes no row in a topic no consumer holds.** It saves the writes, and a consumer declared later would
  find nothing of the steps before it. A prune gets the room back as well, and the cost of the writes is the
  [open question](../../open-questions.md#storage-and-reading) of the projection written once per topic.
- **Effect's `PersistedQueue`.** It holds a queue of elements, each taken by one worker and marked complete or
  failed. The log is read by every consumer of its topic, each at its own cursor, and its rows are written in the
  step's transaction, which a queue of its own store does not join.

## Consequences

- `Runtime.deploy` in [`src/runtime.ts`](../../../src/runtime.ts) takes `consumers` and gives a handle typed by them.
  `feed`, `ack` and `forget` check the name against the declared ones. `Consumer` gains `declared`.
- [`src/storage.ts`](../../../src/storage.ts) stores the declared consumers at deploy, writes nothing at a `feed` or an
  ack beyond the cursors, and prunes a topic no consumer holds whole.
- A consumer is stored only by a deploy, before its handle exists, so no consumer is stored in the middle of a prune.
  The explored test of a consumer whose first reading lands in a prune is dropped with the race it reached. The
  prune still reads the cursors and drops the rows in one statement, as decision 0039 decided.
- [`src/runtime.test.ts`](../../../src/runtime.test.ts) checks that an undeclared name is a defect, that a deploy dies
  on consumers it cannot read, that a declared consumer holds the rows published before its first reading, that a
  stored consumer no longer declared is kept, warned of and forgotten, and that a topic with no consumer is pruned
  whole.
- [`examples/order`](../../../examples/order) declares its two consumers where it deploys.
- `docs/design.md` says, under Consumers, what a prune drops, and under Declared consumers, how consumers are
  declared and what a full database does. The glossary's consumer says that it is declared. The open question of
  a log that nobody prunes leaves `docs/open-questions.md`, and the one of a disk that is really full enters it.
