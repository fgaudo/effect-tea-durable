# 0141. A query and a reading of the log take a limit

**Status:** accepted, 2026-11-05. Changes [decision 0053](archive/0053-what-a-handle-is-given-is-checked.md), whose
limit left out was no limit, [decision 0032](archive/0032-a-projection-is-a-row.md), whose query takes `limit` as an
option, and [decision 0039](archive/0039-a-consumer-of-the-outbox-keeps-its-cursor.md), whose `feed` and `published`
take one as an option.

## Context

`query`, `published` and `feed` give an array of rows, each decoded through the projection's migrations and its
schema. Each took `limit` as an option, and [decision 0053](archive/0053-what-a-handle-is-given-is-checked.md) read
one left out as no limit: `query` ran its statement with `LIMIT -1`, and the reading of the log went on until the
topic's end. So a call that left out one argument held a program's whole read model, or a whole topic of a log that
nobody prunes ([open question](../open-questions.md#storage-and-reading)), in one array of the process, with every
row decoded. The design said that `query` takes a limit, and the code did not ask for one. Nothing else in the
library reads rows without a bound: `reindex` reads the states in batches of `batch` rows, and the log is read in
pages of the same size.

The library is meant for a backend of any size, where a read model of a program counts millions of rows, and a
topic the consumer behind it has not read for a day counts as many. A call that reads it whole is never what its
caller meant, and the process that runs it is the one that runs the entities.

## Decision

- **`query`, `published` and `feed` take a limit, and give at most that many rows.** `Query` has `limit` as a
  field required, and `published` and `feed` take `limit` as a parameter required. The limit is a non-negative
  integer, and a safe one, as decision 0053 checks; `0` gives no row.
- **A limit left out is the caller's defect**, at runtime too: `counted` refuses `undefined` as it refuses `-1`,
  before anything is read or stored, so a caller that passes the types with a cast, or calls from JavaScript, is
  told. A missing `keep` of `send` is still none, since a reply kept for ever is what
  [decision 0125](0125-a-callers-reply-is-kept-as-long-as-its-boundary-says.md) decided.
- **A caller that wants more reads again.** `published` is read again from the cursors of the last row it gave, and
  `feed` from the stored cursors once the rows are acked. A `query` gives the first `limit` rows in its order, and a
  caller that needs more narrows its criteria or asks for as many as it can hold: how a query pages is an
  [open question](../open-questions.md#storage-and-reading).

## What it rests on

- That a call without a limit read every row: **seen**, in the context of decision 0053, where a negative limit
  read everything, and in the loop of `published` in [`src/storage.ts`](../../src/storage.ts), which went on while
  `limit` was `undefined`.
- That a limit the statement carries bounds what the call holds: **documented**, by SQLite's `LIMIT`, which the
  statement of `query` carries; for the log, **tested**, by the test `a row that commits after one a consumer has read is read then, from
  its partition’s cursor` in [`src/storage.test.ts`](../../src/storage.test.ts), which reads with a limit of 1 and
  of 260, over the page of 256 rows the log is read in.
- That a parameter the types require may still be left out: **only reasoned**, from a cast or a call from
  JavaScript, which is why `counted` refuses `undefined`. **Tested**, by the test `a cursor, a partition or a limit
  out of its range is its caller’s defect, and stores nothing` in [`src/runtime.test.ts`](../../src/runtime.test.ts),
  which passes each call without its limit through a cast.

## Alternatives

- **A default limit** where none is given, say 100. A caller that reads 100 rows and takes them for all of them is
  never told; a required one says, at the call, that what comes back is a page.
- **A limit the runtime sets** in its options, a cap on every reading. The cap would be the operator's, and a caller
  that needs more than the cap would be cut without knowing; what a caller can hold is the caller's to say.
- **A stream** in place of an array, read row by row. It bounds nothing a consumer collects, and the handle's
  readings are a page a consumer acts on and acks, which an array is.

## Consequences

- [`src/runtime.ts`](../../src/runtime.ts) and [`src/storage.ts`](../../src/storage.ts) take the limit as
  required, and `counted` refuses one left out. `docs/design.md` says so under Reading and under Consumers.
- Every test and example that read a topic or a read model whole now says how many rows it takes.
- `docs/open-questions.md` asks how a query pages, since a limit without a cursor after the last row caps what a
  query gives.
