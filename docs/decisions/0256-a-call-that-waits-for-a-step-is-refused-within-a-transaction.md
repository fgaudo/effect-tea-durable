# 0256. A call that runs a step or waits for one is refused within a transaction of the client

**Status:** accepted, 2026-11-11, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the fix of bugs 26 and 81, of no family. It changes
[decision 0184](0184-consume-runs-a-reader-of-a-consumer.md): the handler of `consume` runs within the page's
transaction, so a call of the handle there that runs a step or waits for one fails the reader.

## Context

`consume` runs its handler and the page's ack in one transaction of the client the runtime was launched with, so that
a store the handler writes commits with the cursors ([decision 0184](0184-consume-runs-a-reader-of-a-consumer.md)). A
step of the runtime commits in a transaction of its own, on a fiber forked without the caller's transaction
([decision 0164](archive/0164-two-rules-of-the-runtime-are-kept-by-the-form-of-the-code-and-a-test-reads-it.md)).

On SQLite and PGlite the client has one connection, which an open transaction holds
([decision 0150](archive/0150-a-count-per-value-of-an-index-is-read-in-one-statement.md)). So a handler that calls
`create` or `send` waits for a step, and the step waits for the connection the handler holds. The whole runtime
stops, with nothing said. A caller that makes the same call within a transaction of its own stops it too. This is bug
26 of the premise review, reproduced. On a pool of PostgreSQL the same happens once every connection is held so,
which is bug 81, not checked.

`consume` already refused a reader run within a transaction, for the same reason. Nothing refused the calls of its
handler.

## Decision

- **A call that runs a step of the runtime or waits for one dies within a transaction of the client of the runtime,
  as the caller's defect.** The calls are `deploy`, `create`, `send`, `resume`, `discard` and a `fetch` that waits.
  The defect names the call: `create runs within a transaction of the client of the runtime`. Nothing of the call
  runs or is stored.
- **The rule lies in one place, `outside` of `src/runtime.ts`.** Each of those calls goes through it, and so does the
  reader of `consume`, whose refusal decision 0184 decided. It looks up the client's `transactionService`, as the
  reader's check did.
- **`deploy` is refused too, though it does not wait for a fiber.** It runs its activations in the caller's fiber, so
  within a transaction each activation would commit as a savepoint of the caller's. A caller that rolls back would
  leave the runtime holding in memory what the database does not.
- **A call that only reads or writes rows runs within the transaction.** `ack`, a `fetch` that does not wait,
  `prune`, `forget`, `expire`, `reindex` and the readings join the caller's transaction, as decision 0184 says of
  `ack`.
- **A handler of `consume` that must create or send stores the request in its store.** A fiber outside the
  transaction makes the call, and its request id makes a retry safe. The handler's call fails the reader, and the page
  rolls back, so the next reader is given it again.

## What it rests on

- That each call is refused within a caller's transaction, before it runs, and that the runtime goes on: **tested** by
  `a deploy, a create, a send, a resume, a discard and a fetch that waits are refused within a transaction`, in
  `src/runtime.test.ts`, on SQLite, PGlite, and the CI's server of PostgreSQL. It fails against the code before the
  change.
- That a handler of `consume` that creates an entity fails its reader, leaves its page unread, and holds no step:
  **tested** by `a handler of consume that creates an entity is refused, and holds no step of the runtime`, in
  `src/runtime.test.ts`. It fails against the code before the change, where the reader never ends.
- That a call can tell it runs within a transaction of the client: **read** in `node_modules/effect/src/sql/SqlClient.ts`,
  as decision 0184 read it. Its premise holds: `transactionService` is still the client's service of its open
  transaction.
- That the premises of decision 0184 still hold: **read**. The store and the cursors still commit together, the
  reader's refusal is kept, now through `outside`, and its test passes.
- That on a pool of PostgreSQL the refusal keeps every connection from being held by a handler that waits for a step:
  **only reasoned**. The refusal reads the caller's transaction, whatever the dialect, so a handler holds its
  connection only for its own statements. Bug 81 was never run, and no test fills a pool.
- That a call made on another client than the runtime's, within a transaction of that client, does not wait for the
  runtime's connection: **only reasoned**. The transaction holds a connection of the other client, which a step does
  not use, and the refusal does not see it.
