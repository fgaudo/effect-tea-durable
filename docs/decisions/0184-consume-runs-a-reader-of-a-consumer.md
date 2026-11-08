# 0184. `consume` runs a reader of a consumer, a page and its ack in one transaction

**Status:** proposed, 2026-11-08, for the step The API before the release of the [roadmap](../roadmap.md). Changes
[decision 0039](archive/0039-a-consumer-of-the-outbox-keeps-its-cursor.md), whose runtime leaves the loop of a
consumer to its caller. Changes [decision 0142](archive/0142-a-consumer-waits-for-a-row-of-its-topic.md), whose wait
always ends at a time.

## Context

Every consumer wrote the same loop by hand. It read a page with `feed`, wrote the page to its store and acked it in
one transaction of the client the runtime was launched with, and read again, until a page was empty or for ever with
a wait. [`examples/order/runtime.test.ts`](../../examples/order/runtime.test.ts) wrote it, and so would every
consumer of a deployment. Three of its rules are easy to miss:

- The next page is read only after the last one is acked. `feed` reads from the stored cursors, so a page read
  before the ack gives the same rows again.
- The reading is outside the transaction. A reading that waits within a transaction holds its connection, and on
  SQLite and PGlite the commit of the step that would end the wait waits for that connection
  ([decision 0150](archive/0150-a-count-per-value-of-an-index-is-read-in-one-statement.md)).
- A loop that waits for ever has to stop when the runtime stops. Once the runtime stops, a `feed` that waits gives
  no row at once, so a loop that reads again on an empty page turns without end.

## Decision

- **`consume(topic, consumer, handler, { limit, wait?, partitions? })` runs one reader.** It reads a page with
  `feed`, gives it to `handler`, and acks it, `handler` and the ack in one transaction of the client the runtime was
  launched with. Then it reads the next page. A store that `handler` writes on that client commits with the
  cursors. `handler` is given no empty page.
- **Without `wait`, the reader ends at the first page that is empty, or once the runtime stops.** That is what a
  test or a batch runs. A reader that ends at the stop leaves the rows it did not read to the next reader, since
  its cursors are where its last ack left them.
- **Given `wait: true`, the reader ends only when the runtime stops.** A reading that finds no row waits for a
  commit in the topic, with no time limit, as `feed` waits within its time. That is what a deployment runs, forked in
  its scope. A wait with a time limit would only make the reader read again, since an empty page does not end a reader
  that waits. Anything but `true` or nothing as `wait` is the caller's defect.
- **The reader reads the partitions it is given, as `feed` does.** Several readers of one consumer are several
  calls, each with its partitions ([decision 0153](archive/0153-a-reader-of-a-consumer-names-the-partitions-it-reads.md)).
  The division stays the caller's.
- **A failure rolls the page back and fails the reader.** A failure of `handler`, or a `SqlError` of the transaction,
  leaves the store and the cursors as they were, and the reader fails with it. The next reader reads the page again.
  Retries are the caller's, as `Effect.retry` with a schedule. The reader's error is `handler`'s error or a
  `SqlError`, since a caller cannot tell a `SqlError` of its store from one of the commit.
- **A reader within a transaction of the client is the caller's defect.** It is refused before it reads. The limit
  is a positive integer, since a limit of 0 would give a reader that waits an empty page for ever. Whatever `feed`
  refuses, `consume` refuses too.

## What it rests on

- That the store and the cursors commit together, and a failed page is read again: **tested** by `a reader of
  consume writes each page and its ack in one transaction, and reads a failed page again` in
  [`src/runtime.test.ts`](../../src/runtime.test.ts), on SQLite and PGlite.
- That a reader that waits is woken by a commit, waits past any time, and ends when the runtime stops: **tested** by
  `a reader of consume that waits is given the rows steps commit, and ends when the runtime stops` in
  [`src/runtime.test.ts`](../../src/runtime.test.ts), on one process. On Cluster, that the watcher wakes it at the
  next interval for a commit of another runner, page after page: **tested** by `a reader of consume that waits is
  given each row another runner commits, within the interval` in the same file.
- That a reader without a wait ends once the runtime stops, and reads no page then: **tested** by `a reader of
  consume without a wait ends once the runtime stops, and leaves the rows it did not read` in
  [`src/runtime.test.ts`](../../src/runtime.test.ts).
- That a reader within a transaction, a limit of 0 and a wait that is not `true` are refused before anything is
  read: **tested** by `a reader of consume within a transaction, of a limit of 0, or of a wait that is not true is
  refused` in [`src/runtime.test.ts`](../../src/runtime.test.ts).
- That `handler`'s statements join the reader's transaction where they run on the client the runtime was launched
  with: **documented** by `withTransaction` of `SqlClient` in `node_modules/effect/src/sql/SqlClient.ts`, whose
  statements run on the transaction's connection inside it. **Read** there too: the transaction is kept under a
  service of each client, so a statement on another client does not join it.
- That a reader can tell it runs within a transaction: **read** in `node_modules/effect/src/sql/SqlClient.ts`, where
  `transactionService` is the client's service of its open transaction, and `withTransaction` provides it. The
  reader looks it up with `Effect.serviceOption`, and every fork of the runtime takes it out
  ([decision 0164](archive/0164-two-rules-of-the-runtime-are-kept-by-the-form-of-the-code-and-a-test-reads-it.md)).
- That a commit wakes a wait with no time limit as it wakes one with a limit: **reasoned**. The wait races the
  commit's signal and the runtime's stop, and leaves out only the sleep, so what
  [decision 0142](archive/0142-a-consumer-waits-for-a-row-of-its-topic.md) tests of the signal holds.

## Alternatives

Each structure of Effect that could run a consumer was weighed.

- **A `Stream` of pages**, made with `Stream.paginate` or `Stream.repeatEffect` over `feed`, that a caller runs with
  `Stream.runForEach`. A stream lets its caller read ahead, with `Stream.buffer` or a `mapEffect` with concurrency,
  and a page read before the last ack is the same rows again. Nothing in a stream keeps the ack in the transaction
  of the work either. `consume` takes the handler, so the order of the reading, the work and the ack is the
  runtime's.
- **`Effect.repeat` with a `Schedule`** for the loop. The loop ends on an empty page or on the stop of the runtime,
  which the runtime holds as a `Deferred`. A schedule decides from the value it is given, and the stop is not a
  value of the page. The loop is a `while` over the two.
- **`SqlClient.withTransaction`** is the transaction of each page. `consume` uses it.
- **`FiberSet` or `FiberMap` for the readers of one consumer.** `consume` runs one reader, and the division of the
  partitions is the caller's ([decision 0153](archive/0153-a-reader-of-a-consumer-names-the-partitions-it-reads.md)).
  A caller runs several readers with `Effect.forEach` and a concurrency, or forks each in its scope.
- **`Effect.retry` inside `consume`.** The retries of a consumer depend on what fails: a page whose row never decodes
  in the consumer's store fails every time. The caller wraps the reader in the retry that fits.
- **A handler of one row**, and not of a page. A store that writes a page in one statement, or in one transaction of
  many statements, writes it faster than row by row. A handler of one row is `Effect.forEach` over the page.
- **A `wait` with a time limit**, as `feed`'s `{ millis }`. A reader that waits does not end on an empty page, so
  the limit would only read again. A reader that should end once its topic has been quiet a while is not a case of
  the examples.
- **A reader within a transaction that runs each page as a savepoint.** Its reading would wait on the transaction's
  connection, and on SQLite and PGlite the commit that ends the wait waits for that connection.

## Consequences

- `Handle` gains `consume`, beside `feed` and `ack`, which stay for a consumer that keeps cursors of its own.
- `waited` in [`src/runtime.ts`](../../src/runtime.ts) takes a wait without a time limit.
- [`examples/order/runtime.test.ts`](../../examples/order/runtime.test.ts) runs its report with `consume`, and
  [`examples/order/report.ts`](../../examples/order/report.ts) is its handler.
