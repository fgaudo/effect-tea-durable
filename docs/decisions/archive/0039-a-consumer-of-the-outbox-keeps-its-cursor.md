# 0039. A consumer of the outbox keeps its cursor

**Status:** accepted, 2026-10-30. Its one cursor per consumer is changed by
[decision 0137](0137-the-log-is-ordered-within-a-partition.md): a consumer keeps a cursor per partition of the
log. Its consumer of every row of the program is changed by [decision 0138](0138-the-log-publishes-topics.md): a
consumer reads one topic. Its limit as an option of `feed` and `published` is changed by
[decision 0141](0141-a-query-and-a-reading-of-the-log-take-a-limit.md): each takes one. Its `feed` that gives
at once what it reads is changed by [decision 0142](0142-a-consumer-waits-for-a-row-of-its-topic.md): given a
`wait`, a reading that finds no row waits for a commit in its topic. Its ack, a transaction of its own, is changed
by [decision 0150](0150-a-count-per-value-of-an-index-is-read-in-one-statement.md): an ack joins a transaction
the caller left open. Its consumer that declares itself by reading, and its topic with no consumer that keeps every
row, are changed by [decision 0152](0152-the-consumers-of-a-topic-are-declared-at-deploy.md): consumers are declared at deploy,
and a topic no consumer holds is pruned whole. Its loop of a consumer, left to the caller, is changed by
[decision 0184](../0184-consume-runs-a-reader-of-a-consumer.md): `consume` runs a reader, a page and its ack in one
transaction. Its `feed` is renamed `fetch` by [decision 0195](../0195-the-package-is-effect-tea-persistent.md).

## Context

A step publishes a row, kept until a prune drops it
([decision 0038](0038-what-happened-is-published-through-an-outbox.md)). With one consumer, the consumer prunes
what it has read. With several, who decides, and what a consumer that falls behind costs, was an
[open question](../../open-questions.md); so was the log as the place the history of an entity that never ends — a
subscription's past invoices — would be read from, which is a retention nobody prunes.

Nothing in the runtime knew who read the log. `prune(through)` took the cursor from its caller, so two consumers
had to agree on the lowest of their cursors outside the library, and a consumer that passed its own dropped the
rows the other had not read yet.

## Decision

This decides what decision 0038 left open, and changes the shape it gave `prune`, which stands as it was taken.

- **A consumer is a name, and its cursor is stored.** `feed(consumer, limit)` gives the rows past that
  consumer's cursor, and `ack(consumer, through)` moves it. A cursor is written outside the transaction of the
  step that published, so what an entity commits never depends on a consumer.
- **A consumer declares itself by reading.** Its first `feed` stores a cursor at `0`, so it holds the log from
  its first read, acked or not. Nothing is declared where the program is deployed: what an entity publishes is
  the program's, and who reads it is the deployment's.
- **`prune` takes no cursor.** It drops every row through the lowest stored cursor — what every consumer has
  read — and gives how many went. Where no consumer has stored one it drops nothing: a log no consumer has ever
  read from is one somebody reads by hand.
- **`published(after, limit)` stays, and registers nothing.** A one-off reading — a test, an operator looking —
  carries its own cursor and has no say in the prune.
- **An ack never moves a cursor back**, since what is behind it may be gone.
- **A consumer that falls behind costs rows, and they are visible.** `consumers` gives each stored cursor with
  how many rows are past it. The runtime never drops a row a consumer has not read, which is what reading at
  least once means, so a consumer that is gone leaves through `forget(consumer)` — which is also how a name
  misspelt once stops holding the log.
- **The log is kept for its consumers, and is not an archive.** A program whose past must stay readable keeps it
  where callers read it: in the state, or in entities of its own. An invoice read a year later is an entity, not
  a row of a log whose retention is a consumer's cursor.

## Alternatives

- **Consumers declared where the program is deployed**, reconciled at each deploy. The set would be explicit,
  and the prune would derive from a list rather than from what the database holds; but the names would live in
  two places, and a process deployed without the list would have to be told whether that means no consumers or
  the ones already stored.
- **Keeping `prune(through)`.** It leaves the question where it was: the callers agree outside the library, and
  one that passes its own cursor drops what another never read.
- **Pruning on the ack**, with no prune of its own. Every ack would count the other cursors and delete, which
  makes reading pay for a retention an operator wants to see before it runs.
- **A retention in time**, a row kept a week whether it was read or not. It is a second rule beside the cursors,
  and the consumer it takes rows from learns of it as a hole, not as an error.
- **A cap on the log**, refusing to publish once it is too long. A step that cannot publish cannot commit, so a
  consumer that stalled would stop the entities: the log costs disk, and disk is the operator's to watch.

## Consequences

- A consumer holds no state of its own: its name is its state, and its cursor survives a restart. Two processes
  reading one name share one cursor and would each act on rows the other read, so a consumer that runs in more
  than one process is a consumer per process, with a name each.
- A consumer that stops acking stops the prune, and the log grows until an operator fixes it or forgets it.
  Nothing caps that: what a deployment does when nobody prunes is an [open question](../../open-questions.md).
- A consumer forgotten and started again under the same name reads from `0`, so it acts again on the rows still
  there. It is the same at-least-once a crash before an ack gives, deduplicated by `seq`.
- The history of an entity that never ends is not read from the log: for its rows to be kept, one cursor would
  have to stand still for every entity of the program. A past that must be read belongs to a state, or to
  entities of its own.
- A `prune` that drops nothing is not an error, and tells an operator nothing by itself. `consumers` is what
  says why: no cursor stored, or one standing still.
- A prune reads the cursors and drops the rows in one transaction, since the two are one decision. A consumer
  whose first reading lands in the middle either holds the log, and nothing goes, or starts after the drop: no
  consumer reads rows and has them dropped behind a cursor still at `0`, which would skip them and say nothing.
- A consumer that polls writes nothing: only its first reading stores a cursor, and an ack is a write of its
  own.
- One sequence serves every program's rows, and a cursor is a consumer's of one program: a `seq` of another
  program's log is no cursor into this one, only a number that happens to be lower or higher. A consumer reads
  and acks the rows of the program it reads.
