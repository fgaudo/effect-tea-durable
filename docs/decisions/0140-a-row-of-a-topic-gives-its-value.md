# 0140. A row of a topic gives the value the topic selects

**Status:** accepted, 2026-11-05. Changes [decision 0138](0138-the-log-publishes-topics.md), whose row of a topic
holds the projection whole, and whose `Published` gives the projection. Its row that stores the projection is
changed by [decision 0154](0154-a-steps-projection-is-stored-once-in-the-outbox.md): the rows of a step name one
publication, which stores it.

## Context

[Decision 0138](0138-the-log-publishes-topics.md) gave each consumer a topic, written when what the topic selects
changed, and kept the projection whole in every row: the topic said why the row was written, not what it held. A
consumer of the topic `billing` then receives every field of the order's projection, and its type is the
projection's. A field added for the dashboard changes what billing receives, and a consumer that forwards the row
to another system forwards it all. A consumer wants a contract of its own, as a consumer of Kafka has the type of
its topic's records.

Decision 0138 did not take a row that holds only the selection, because such a row cannot be read through the
projection's migrations, which are functions on the whole JSON: each topic would have needed a schema and
migrations of its own. The projection is JSON now ([decision 0139](0139-the-projection-is-json.md)), so what a
selector gives is JSON by construction, and a selector may run where the row is read, on the stored projection
migrated to the program's version.

## Decision

- **A row of a topic gives the value the topic selects.** `Published` has `value` in place of `projection`, typed
  by the topic's selector: `Published<T, Name>` gives `Value<T, Name>`. The topic `projection` of a program that
  declares no topics gives the projection whole, as every row did before this note.
- **The row stores the projection**, with the version that wrote it, as before. `feed` and `published` read it
  through the projection's migrations and its schema, and apply the selector of the program deployed. So a topic
  needs no schema and no migration of its own, and a row written before a deploy that changed a selector gives
  what the new selector selects. A selector that dies on a row gives the defect to whoever reads the row, as a
  schema or a migration that dies does ([decision 0121](0121-a-read-answers-from-the-row-of-the-read-model.md)).
- **A row of a topic is written because its value changed, and gives that value.** What a step compares to decide
  whether it writes a row, and what the row gives, are one function of the projection.
- **The row keeps the message the step handled, and its kind**, as [decision 0038](archive/0038-what-happened-is-published-through-an-outbox.md)
  decided: the log records what an entity did ([decision 0072](archive/0072-the-log-shows-what-a-step-changed.md)),
  and the tests of the runtime read it as the trace of the messages an entity handled.
- **`Types` names the topics with their values.** Its slot `topics` is a record, by name, of the type of each
  topic's value, in place of `topic`, the names. `Topic<T>` is its keys, and `Value<T, Name>` the value of one.
  `program(schemas)(…)` infers both from the selectors. A program that declares no topics has `undefined` in its
  `topics` slot: `Topic<T>` is `projection`, and `Value<T, 'projection'>` is the projection.
- **`published` and `feed` take the name of a topic and give `Published<T, Name>`.** `ack`, `forget`,
  `consumers` and `prune` do not change.

## What it rests on

- That a selection of the projection is JSON by construction, so that a value needs no schema to be given to a
  consumer: it follows from [decision 0139](0139-the-projection-is-json.md), whose test compiles the constraint.
- That the selector of the program deployed, applied to a row migrated to the program's version, gives a consumer
  the value of the topic as the program declares it today: **tested** by `each topic is read alone, through the
  projection's migrations, and a step's rows share its seq` in [`src/storage.test.ts`](../../src/storage.test.ts),
  which reads the rows a version wrote through a migration of the projection of the next, and through a selector
  the next version changed, and by `what an order published is what another system learns of it, each consumer in
  its topic` in [`examples/order/runtime.test.ts`](../../examples/order/runtime.test.ts), which reads each
  consumer's value.
- That a consumer acts on the value of its topic and not on the projection: **only reasoned**, and seen in
  [`examples/order`](../../examples/order), whose billing consumer reads the charge and the refund.

## Alternatives

- **A row that gives the projection whole**, as [decision 0138](0138-the-log-publishes-topics.md) took it. A
  consumer reads what it acts on and may read the rest, and is typed by the whole projection.
- **A row that stores only the value.** It is smaller, and cannot be read through the projection's migrations:
  each topic would need a schema and migrations of its own. Where the volume of the log asks for less storage, the
  way is a projection stored once per step, with the rows of its topics referring to it, which keeps the
  migrations and writes the projection once however many topics a step is written in.
- **A row without the message.** It narrows a row to its kind and its value. The tests of the runtime read the log
  as the trace of what an entity handled, and [decision 0072](archive/0072-the-log-shows-what-a-step-changed.md)
  says the log records what an entity did. A note that takes it says what a consumer that wants the trace reads
  instead.
- **A topic of two functions, one compared and one given**, `{ watch, select }`, so that a topic gives a field
  when another changes. A function would stay the shorthand for both, so the form can be added when a case asks
  for it, without a change to the programs declared until then. Until then, a topic that wants a field when
  another changes selects both.

## Consequences

- `Types.topic` becomes `topics`, and `Topic<T>` and `Value<T, Name>` read it, in [`src/program.ts`](../../src/program.ts).
  `Published<T, Name>` gives `value`, and `published` and `feed` are typed by the topic's name, in
  [`src/storage.ts`](../../src/storage.ts) and [`src/runtime.ts`](../../src/runtime.ts). `Value` is exported.
- The storage applies the selector where a row is read. The machine and the columns of the outbox do not change.
- [`src/storage.test.ts`](../../src/storage.test.ts) reads each topic's value, through a migration and through a
  changed selector. The tests of the runtime and of the examples read `value` where they read `projection`.
- [`examples/order`](../../examples/order) reads each consumer's value.
- `docs/design.md` says, under Publishing what happened, what a row gives. The glossary's entries for the outbox
  and the topic say so, and the text and the diagram of an entity's loop in [`README.md`](../../README.md) do.
