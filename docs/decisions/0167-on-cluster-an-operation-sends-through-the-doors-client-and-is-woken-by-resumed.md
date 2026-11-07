# 0167. On Cluster, an operation sends through the door's client, and is woken by `Resumed`

**Status:** proposed, 2026-11-07, for the step Effect Cluster of the roadmap. Says how
[decision 0085](0085-on-cluster-a-request-is-keyed-and-answered-as-on-one-process.md) is code for an operation's
request. Changes how [decision 0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md) tells a
resumption: once for each sender's entity, not once for each request, and with the receiver's address alone.

## Context

On one process, an operation's `send` registers for the receiver's resumption before it sends. An answer
`Suspended` makes it wait for that resumption, and then send again under the same request id
([decision 0063](archive/0063-the-runtime-waits-for-what-it-waits-for.md)). The resumption wakes every sender that
waits for the receiver in the process.

Until this note, an operation's `create` and `send` died on Cluster. A caller's request and an operator's already go
through Cluster's client of the door
([decision 0165](0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md),
[decision 0166](0166-on-cluster-an-operator-resumes-and-discards-through-the-doors-client.md)). On Cluster the
step that resumes a receiver runs on the runner that holds the receiver's shard, and the operation runs on the
runner that holds its own entity's shard. Decision 0092 has the resuming step tell each sender by a message,
`Resumed`.

Three things in Cluster's source at 4.1.2 bear on how that message is sent:
- RpcClient's JSDoc of `discard` says a call with it completes once the request is delivered, and does not wait
  for the handler's result.
- `Sharding` sends a call with `discard` by `sendOutgoing`, and acknowledges it once the message is sent.
- For a persisted request inside a transaction, `notifyAfterCommit` of `cluster/Runners.ts` saves the request in
  the transaction, and pushes its delivery to `TransactionNotifications`, which run after the commit.

## Decision

- **An operation's `create` and `send` on Cluster go through Cluster's client of the door**, as a caller's do. The
  request is the operation's, which the runtime fills in (decision 0085). A message answered `Suspended` or
  `NotFound` is reset once and sent again, as decision 0165 decides for a caller.
- **The step that answers an operation `Suspended` records the sender's entity beside the receiver**, in its
  transaction, in the table `waiting`. The table has one row for each sender's entity and receiver, however often
  the receiver answers so, and whatever request asked.
- **The step that takes the receiver out of its suspension, an operator's `Resume` or `Discard`, tells each recorded
  sender `Resumed`**, and deletes the rows, in its transaction. `Resumed` is a persisted RPC of the sender's door,
  sent with `discard`, so that the step never waits for another door. Cluster saves it in the step's transaction,
  and delivers it once that transaction commits. A step that rolls back tells nobody, and leaves the rows.
- **`Resumed` carries the receiver's address, and its handler wakes every sender in its process that waits for
  that receiver**, as a resumption wakes them on one process. The handler writes nothing. A sender whose operation
  no longer runs on that runner is woken by nothing there. Its operation runs again at its entity's next
  activation, and sends again (decision 0092).
- **An operation's request ids are kept under its work, and Cluster's rows deleted with it**, as
  [decision 0090](0090-on-cluster-a-reply-is-deleted-as-on-one-process.md) decides and [decision 0169](0169-on-cluster-an-operations-request-ids-are-kept-under-its-work-and-deleted-with-it.md) makes
  code. An answer of Cluster's own defect is
  reset by the client before it is given, and the operation takes it as a receiver's crash, and sends again after
  `retry` ([decision 0168](0168-on-cluster-a-failure-cluster-saved-is-reset-before-it-is-given.md)).

## What it rests on

- A request sent with `discard` from a handler under `WithTransaction` is saved in the handler's transaction and
  delivered after its commit: **read in the source**, `notifyAfterCommit` of `cluster/Runners.ts` and the
  `discard` path of `cluster/Sharding.ts` at 4.1.2. That the call does not wait for the handler is **documented**,
  in the JSDoc of `discard` in `rpc/RpcClient.ts`, `@stability unstable`. It is **tested** by `an operation creates
  and sends through the door, and a resumption on another runner wakes it` in
  [`src/cluster.test.ts`](../../src/cluster.test.ts), which hangs if the step does not tell the sender.
- A sender registers for the resumption before it sends, so a `Resumed` delivered after the answer `Suspended`
  finds it: **tested** on one process for decision 0063, and on Cluster by the same test.
- `DELETE … RETURNING` gives the rows it deletes on SQLite and on PostgreSQL: **documented**, by each database.
  It is **tested** on SQLite alone, since the runtime on Cluster runs on SQLite until PostgreSQL has a fence
  ([decision 0084](0084-a-step-commits-only-where-the-commit-checks-the-shard.md)).
- That one `Resumed` for each sender's entity wakes every request of that entity which waits: **only reasoned**,
  since the handler wakes every sender of its process that waits for the receiver.
- That a `Resumed` lost to a sender whose shard moved costs nothing, the operation sending again once it runs:
  **only reasoned**, from decision 0092.

## Alternatives

Effect's modules weighed, in `node_modules/effect/src` at 4.1.2:
- **`Resumed` sent without `discard`, its reply waited for in the step.** The step would wait for another door,
  inside its transaction. A sender on the same runner would need the connection that transaction holds, and the
  step would never end.
- **`Resumed` sent from `SqlClient.afterCommit`.** The rows are deleted in the step's transaction, so a process
  that dies between the commit and the send loses the message, and the sender waits for ever.
- **A sender that polls, with a `Schedule`, instead of waiting for a message.** Each try would reset its request
  and step the receiver again, for every sender, for as long as the suspension lasts. Decision 0092 decided a
  message.
- **`Sharding.reset` of the senders' requests, from the receiver's step.** A reset marks a request unprocessed,
  and tells no client: the sender's operation would still wait in its process.
- **A `Deferred` or a `PubSub` of Effect's, as on one process.** Either reaches one process only, and the runtime
  keeps one already for the senders of its own process.

Other ways:
- **One row and one `Resumed` for each request answered `Suspended`, as decision 0092 says.** The handler wakes
  every sender of its process that waits for the receiver, so a second message for the same sender's entity wakes
  nothing more.
- **The sender's request in `Resumed`, and a wake of that request alone.** It would need a wait keyed by request,
  which one process does not keep, and gives the sender nothing it lacks.

## Consequences

- An operation can send to an entity on any runner, and waits for a suspended receiver at no cost.
- Every `Resumed` leaves its own id pending, and the next step of any entity deletes its rows in Cluster's
  tables (decision 0169).
- A rename moves the receiver's name and the sender's in `waiting`, with their other rows
  ([decision 0156](0156-a-program-is-renamed-by-its-launch-and-keeps-its-keys.md)). It is **tested** by `on Cluster,
  a rename moves the senders a receiver tells of its resumption, and the request ids they sent` in
  [`src/storage.test.ts`](../../src/storage.test.ts).
