# 0092. On Cluster, the runtime keeps its entities, and learns its shards from a singleton of each

**Status:** accepted, 2026-10-31. Decides the [roadmap](../roadmap.md)'s finding on what stays the runtime's on
[Effect Cluster](../cluster.md#what-cluster-gives-that-the-runtime-already-does): passivation, the capacity, the
timers, an operation that waits for a program no runner deploys, a sender that waits on a suspended entity, and the
step of a request queued behind the entity's own work. Changes what
[decision 0081](0081-on-cluster-a-step-commits-with-its-reply.md) says of what a step sets going, and how
[decision 0079](archive/0079-what-a-caller-sets-going-is-finished-without-it.md) holds for an activation on Cluster, and says
how [decision 0056](archive/0056-nothing-waits-for-an-operation-under-the-permit.md) holds for a shard that leaves. What it
says of Cluster is read from its source at `effect` 4.1.1, and what the runtime relies on is checked by two spikes.
Decides what decision 0096 left to it: who
keeps the Cluster id of a request answered with Cluster's defect, which changes which steps keep an id in
[decision 0090](0090-on-cluster-a-reply-is-deleted-as-on-one-process.md); and corrects 0096's rule of what Cluster
stores without a step. A pending id is written by more than a step, which changes how many decision 0090 says the
database holds.

## Context

On one process, the runtime holds its entities in memory, unloads the idle ones after `passivate.millis`
([decision 0029](archive/0029-an-idle-entity-is-unloaded.md)) and the least recently used of them past a capacity
([decision 0076](archive/0076-a-process-over-its-capacity-unloads-the-least-recently-used.md),
[decision 0078](archive/0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md)), starts with the
entities that hold an operation or a message ([decision 0071](archive/0071-a-process-starts-the-entities-with-a-message.md)),
wakes the unloaded ones from their stored timers, and signals in memory the operations waiting for a deploy or a
resumption ([decision 0063](archive/0063-the-runtime-waits-for-what-it-waits-for.md)). Every one of these assumes that the
process holds every entity, for its whole life. On Cluster a runner holds the shards the `HashRing` gives it, and
gains or loses them while it runs.

Cluster's source says:

- **An entity's handlers are kept while the entity is resident**, and the reaper removes one with no request active,
  no keep-alive, and no request ended for `maxIdleTime` (1 min by default; checked every `maxIdleTime` or 30 s,
  whichever is shorter, and no more often than every 5 s). An infinite `maxIdleTime` registers no reaper. Nothing
  else removes an entity but a shard leaving the runner and the runner's end: there is no operation that passivates
  one.
- **`Entity.keepAlive(true)` sends `KeepAliveRpc`**, a request annotated `Persisted` and `Uninterruptible`, not
  `WithTransaction`, whose reply is saved once `keepAlive(false)` opens the entity's latch. A runner that hosts the
  runtime runs every persisted RPC under `WithTransaction`, so that no check of the shard is shared with a request
  outside a transaction ([decision 0084](0084-a-step-commits-only-where-the-commit-checks-the-shard.md)), and its
  rows would stay in Cluster's tables ([decision 0090](0090-on-cluster-a-reply-is-deleted-as-on-one-process.md)).
- **`maxResidentEntities` (10 000) refuses a new entity**: its messages wait in storage, and are read again when a
  slot frees, which only the reaper and a shard leaving do.
- **A runner is told nothing when it gains or loses a shard.** `Sharding` exposes the registration of entities and
  singletons, not its shards; what reaches a runner that gains one is the shard's unprocessed messages. A singleton
  is registered under a name, whose hash gives its shard, and runs on the runner that holds that shard: started
  when the runner acquires the shard's lock, interrupted before it releases it.
- **`DeliverAt` holds a message until its time**, and nothing wakes the runner at it: the next read of storage finds
  it, up to `entityMessagePollInterval` (10 s) late.
- **A message to a type its shard's runner did not register waits while that runner's registration window lasts**,
  then dies. Sent to a shard of the sender's own runner, it dies at the sender, and nothing is stored. Sent to a
  shard of another runner, it is stored, and that runner saves the defect as its reply: a retry under the same key
  is given that defect, for ever.
- **What else a runner saves as a reply without a handler is a defect too**: a request that the RPC's schema does
  not decode is answered `MalformedMessage`, as a defect, and a defect while a message read from storage is delivered
  is saved under its request. A full mailbox, a runner that no longer holds the shard, and a
  request already being processed save nothing: the message stays in storage, and is read again. A defect of a
  handler is not saved, and restarts the entity
  (decision 0095).
- **A shard's lease on SQLite is a row of `cluster_locks`**, `shard_id`, `address` and `acquired_at`, and a runner
  takes it from another only by writing it, where `acquired_at` is more than 35 s (the `shardLockExpiration`) before
  `CURRENT_TIMESTAMP`, counted in whole seconds by `strftime('%s', …)`; the write waits for the file's one writer.
  Both are written to the second, so it is `acquired_at < datetime(CURRENT_TIMESTAMP, '-35 seconds')`.

A spike against `effect` 4.1.1, with `SingleRunner` on `@effect/sql-sqlite-bun`, `runnerStorage: "sql"`, four
shards, and two runners on one file where it needs them, found:

- a singleton registered under a name for each shard, the names found by trying `runtime-shard-0`, `-1`, … with
  `Sharding.getShardId`, starts on the runner that holds the shard, once its lease names that runner;
- when a second runner joins, the first interrupts the singletons of the shards it gives up while their lease still
  names it, and runs their finalizers to the end — a sleep of 1.5 s in each — before the second starts them: the
  shard does not change hands while a finalizer runs. A runner that leaves does the same, one singleton after another;
- a persisted send from a handler under `WithTransaction`, `discard: true`, is a row of `cluster_messages` that the
  handler's transaction sees; a handler that then fails leaves no row, and its receiver never runs; one that
  succeeds has the message delivered after its commit;
- a send to a type not registered, from the runner that holds its shard, dies once the window ends, with no row in
  either table; from another runner, the holder saves a defect as its reply, a retry gets it again, and
  `Sharding.reset` with its id as the reply expected marks the request unprocessed, after which the holder handles
  it again — and, still without the type, saves another defect;
- the lease row of an entity's shard is read in a transaction, its liveness by the complement of the expression
  above;
- with a transaction waiting for the connection while another commits, the waiting one begins, and reads what the
  first committed, before any of the first's `afterCommit` callbacks that yields or reads: only a callback that
  runs without yielding comes first. A transaction that rolls back runs none of its callbacks;
- a handler under `WithTransaction` whose `COMMIT` fails, on a deferred foreign key, returns its answer first and is
  told nothing: Cluster logs a defect, restarts the entity's handlers, and delivers the request again half a second
  later, with no `afterCommit` run. A toy entity that keeps its machine in memory and a count of steps in its row,
  stepped by that handler, by a second request and by a step of its own outside Cluster, ends with the right total,
  stored and held, when each step first checks the count, as below: the delivery again finds the count of the machine
  it held, and drops the pending one. Adopting the handler's machine at once instead counts the rolled-back step
  twice, in memory and in its row.

- a singleton's finalizer that sleeps 8 s, with `entityTerminationTimeout` at 3 s, runs to its end: the timeout does
  not bound it. Its runner keeps refreshing the shard's lease meanwhile, and a second runner that joined to take the
  shard has none of it until the finalizer ends;
- a transaction another process holds open on the file for 25 s takes no runner's lease, but the runner's refresh,
  which cannot write, times out after 10 s (`Shard lock storage is unhealthy`), and the runner interrupts the
  singletons of every shard it holds, and starts them again only once the transaction commits. Its read of storage
  fails before that, on the client's `busy_timeout` of 5 s;
- a lease written over by another address while its runner runs is seen by that runner at its next refresh, up to
  `shardLockRefreshInterval` (10 s) later: only then does it interrupt the shard's singleton, whose finalizer runs
  while the lease already names the other.

A second spike, on one runner of the same setup, with an RPC whose payload the receiver refuses to decode at will,
found:

- the runner saves `MalformedMessage` as a defect under the request, and the client is given the defect alone: no
  request id, no reply id;
- `MessageStorage.requestIdForPrimaryKey` gives the request's id from its primary key, and `repliesForUnfiltered` the
  id of the defect's reply, as `ClusterWorkflowEngine` reads its own;
- the same key sent again is given the same defect, under the same request id, and writes no row;
- `Sharding.reset` with the defect's id as the reply expected has the request handled again, and the handler is
  given the same request id; with another id it changes nothing, and answers `true` all the same: its result says
  only that the storage did not fail, as `clearReplies` in `SqlMessageStorage.ts` shows;
- an id of Cluster's read by a `SELECT` through `@effect/sql-sqlite-bun` comes back as a JavaScript number, its last
  digits lost, where `MessageStorage` gives it whole;
- Cluster's take condition and the lease check below agree on a lease 33, 34, 35, 36 and 37 seconds old.

On one process every event of an entity, a caller's included, is offered to the entity's queue, and its loop
computes each step and writes it in a transaction of its own ([`src/runtime.ts`](../../src/runtime.ts)). On Cluster
that cannot hold for a request: its step must be written in the transaction Cluster opens around its handler
([decision 0081](0081-on-cluster-a-step-commits-with-its-reply.md)), which a transaction of the loop's fiber is not,
and `@effect/sql-sqlite-bun` runs one transaction at a time, so a handler that waited in its transaction for the
loop would wait for ever on the loop waiting for the connection. And a step of the entity's own work — an
operation's completion, a timer firing, an operation dying, an activation — is no RPC: it commits in a transaction
of the loop's, which no check of the shard confirms. Decision 0084 wants every step committed only where the commit
checks the shard; it said so of the RPCs alone.

## Decision

- **The runtime keeps its entities, as on one process.** Passivation, the capacity and what is spare are the
  runtime's, by decisions 0029, 0076 and 0078. Cluster's handler of an entity is a door: it finds the runtime's
  entity, loading it if it must, as a caller does. The entity type is registered with a `maxIdleTime` no longer than
  `passivate.millis`, and `maxResidentEntities` is left unbounded: a door outlives the runtime's entity by up to
  `maxIdleTime` and the reaper's period, so a bound of Cluster's counts doors the runtime has already closed, and
  would refuse entities the runtime has room for. `Entity.keepAlive` is not used.
- **A request is stepped in its handler's fiber, in Cluster's transaction**, never offered to the entity's queue.
  The entity's loop steps its own work, each step in a transaction of its own. Every step computes from the machine
  as it finds it inside its transaction, never from one read before it began: the runner's one connection runs one
  transaction at a time, so no other step of the entity runs meanwhile, and nothing else of the runtime takes a turn
  that a transaction could wait on. A door that must load the entity activates it in the handler's fiber and
  transaction too, not detached from it as on one process
  ([decision 0079](archive/0079-what-a-caller-sets-going-is-finished-without-it.md)): a detached activation would wait for
  the connection the handler holds.
- **What is in memory is checked against what is stored, in each step's transaction.** Cluster commits the handler's
  transaction after the handler returns, may roll it back — a failed check of the shard, a `COMMIT` that fails —
  and tells the handler neither; `SqlClient.afterCommit` runs its callbacks only after a commit, and only once the
  connection is released, when another transaction may already have begun. So the entity's row stores a count of
  the steps that wrote it, raised by each. A handler's step leaves the machine it computed beside the one the entity
  holds, as pending; the next step of the entity, which runs after the handler's transaction ended, reads the count
  first, and takes the pending machine if the count is its, keeps the one it holds if the count is that one's, and
  otherwise loads the entity again from what is stored. A step that writes nothing has nothing to roll back, and its
  machine is the entity's at once. An entity with a pending machine is not idle, and is neither passivated nor told to
  leave until a check has settled it.
- **What a step sets going is started from the machine, not from the step.** Its `afterCommit` callback asks the
  entity to start the operations and arm the timers its machine holds and nothing runs yet, once it has checked the
  machine as above: a step committed between the commit and the callback may have ended work the first one started
  ([decision 0081](0081-on-cluster-a-step-commits-with-its-reply.md) starts them from the step).
- **A runner learns its shards from a singleton of each.** The runtime registers one singleton per shard of every
  shard group its programs use, under a name whose hash gives that shard, found once from `Sharding.getShardId`. A
  singleton that starts is a shard gained: it gives the shard to the waker, and activates the entities of that shard
  whose state holds an operation, or whose mailbox holds a message, that the runtime does not hold yet (decision
  0071, for one shard): a door may have loaded one first. A singleton that is interrupted is a shard lost: before it
  ends, the runtime marks the shard as not held, so that neither the waker nor a door loads an entity of it again,
  takes it from the waker, and then crashes every entity of that shard it holds, forking the interruption of their
  operations without waiting for them to stop, as every crash does
  ([decision 0056](archive/0056-nothing-waits-for-an-operation-under-the-permit.md)): Cluster waits for the finalizer, with
  no bound, and keeps the shard from every runner while it runs. The
  rows the waker and the activation read — the stored work and the mailbox — carry the shard of their entity,
  written with them.
- **The waker stays, over the shards its runner holds.** It reads the earliest due among the unloaded entities of
  those shards, and reads again when an entity is unloaded and when the shards change. A timer is never a
  `DeliverAt` message.
- **A step of the entity's own work checks the shard's lease in its transaction**: it reads, before it writes, that
  the row of `cluster_locks` for its entity's shard names its runner, and that `acquired_at` is not before
  `datetime(CURRENT_TIMESTAMP, '-<shardLockExpiration in seconds> seconds')`, the exact complement of the condition
  under which another runner takes it; otherwise it
  writes nothing, and the entity crashes, as an event the runtime cannot finish
  ([decision 0042](archive/0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md)). On SQLite the transaction holds
  the file's one writer from `BEGIN IMMEDIATE`, so no runner takes the shard between the read and the commit: the
  commit makes the check, as decision 0084 asks.
- **A transaction of the runtime waits on nothing but its own statements**: no operation, no other fiber, nothing of
  the world, and the program's pure step. The file has one writer, and every runner on it refreshes its leases by
  writing: a transaction held open past the refresh's timeout, 10 s, makes every other runner on the file give up
  all its shards for as long as it lasts, and its own runner too.
- **A request whose message finds the mailbox holding the entity's own work handles the mailbox up to its message,
  in its own transaction**: the step of its arrival queues it, as the machine does, and the handler steps the head of
  the mailbox until its message is handled, then answers as that step answers. A suspension on the way answers it
  `Suspended` ([decision 0023](archive/0023-suspended-means-no-reply-yet.md)). Its transaction holds the connection
  throughout, so the loop steps nothing of the entity meanwhile; what the loop holds in memory and has not written is
  stepped after.
- **A defect from Cluster is no reply.** The runtime never answers with one
  ([decision 0081](0081-on-cluster-a-step-commits-with-its-reply.md)), and a defect of a receiver that escapes the
  runtime is not saved (decision 0095), so a defect saved under a request is Cluster's own: a type not registered in
  time, a payload the RPC's schema does not decode, or a delivery that died. The runtime's payload is JSON, which
  that schema decodes as it is ([decision 0085](0085-on-cluster-a-request-is-keyed-and-answered-as-on-one-process.md)), so the
  second needs a row Cluster's encoding did not write. An operation's client that is given one keeps the request's
  id and resets the request, as below, with the id of the stored defect as the reply expected
  ([decision 0085](0085-on-cluster-a-request-is-keyed-and-answered-as-on-one-process.md)), and sends again after `retry`, as it
  does after a receiver that crashed ([decision 0046](archive/0046-a-receiver-that-crashes-is-sent-again.md)). A defect
  that died at the sender stored nothing, and is simply sent again. While the window lasts, the message waits, and
  the operation with it, at no cost.
- **The client that is given Cluster's defect keeps the request's Cluster id before it resets the request.** The
  defect carries no id: the client reads the request's id from `MessageStorage.requestIdForPrimaryKey`, by the
  payload's primary key, and the id of the defect's reply from `repliesForUnfiltered`, never by a `SELECT` of its
  own, which loses digits of an id. In a transaction of its own, it keeps the request's id under the asker's work, as
  the step that answers a request keeps it ([decision 0090](0090-on-cluster-a-reply-is-deleted-as-on-one-process.md)),
  if the asker's row still holds that work; then it resets the request and sends again. If the work has ended, it
  keeps the id pending instead, as a request answered after its asker's work ended, and neither resets nor sends:
  nothing waits for the answer. So the step that ends the work deletes the defect's rows with the others, whichever
  way the work ends. The transaction checks no lease: it writes no state, only an id, which the step that ends the
  work reads on whichever runner holds the shard then.
- **An id already kept is not kept again.** The step that answers the request once it is reset is given the same id,
  and keeps it as decision 0090 has every answering step do: that keep writes nothing.
- **The result of `Sharding.reset` is not read.** It says only that the storage did not fail. A reset that failed, or
  found another reply than the defect, leaves what is stored, and the send after it is given that again: the client
  starts over from it.
- **A resumption tells the senders that wait for it, by a message.** A step that answers `Suspended` to an entity's
  operation writes, in its transaction, the sender's address and request beside the suspension, once for each
  request however often it is answered so. The step that takes the entity out of its suspension, a resumption or a
  discard, sends each of them `Resumed`, a persisted RPC under `WithTransaction`, from its transaction, and deletes
  the rows. The sender's handler completes the wait the operation registered (decision 0063), and leaves its own
  Cluster request id pending, in its transaction, as decision 0090 does for a request answered after its asker's
  work ended; the operation sends again under the same request id. A sender whose operation is no longer running
  there sends again anyway, when its activation runs the operation. A caller outside the runtime is told nothing, as
  on one process.

## What it rests on

- The reaper, `maxResidentEntities`, `KeepAliveRpc` and `DeliverAt` behave as the context says: **read in the
  source**, at 4.1.1, `entityReaper.ts`, `entityManager.ts`, `Sharding.ts`, `DeliverAt.ts` and `MessageStorage.ts`. That a door bounded by a `maxIdleTime`
  no longer than `passivate.millis` follows the runtime's entity out is **reasoned** from it.
- A singleton per shard starts on the shard's holder, and its finalizer runs to its end, unbounded, before the shard
  changes hands, a runner leaving included: **seen** in the spike.
- A runner learns that its lease was taken only at its next refresh, and a transaction held past the refresh's
  timeout makes every runner on the file give up its shards: **seen** in the spike.
- A persisted send under `WithTransaction` is a row of the handler's transaction, gone if the handler fails: **seen**
  in the spike.
- A `COMMIT` that fails is told to no handler, and the request is delivered again; `afterCommit` runs after the
  connection is released, and not at all on a rollback: **seen** in the spike.
- The count of steps keeps what is in memory equal to what is stored: **seen** in the spike, on a toy entity; that it
  holds of the runtime's machine, whose steps write more than a count, is **reasoned**.
- `@effect/sql-sqlite-bun` runs one transaction at a time, and begins a writable one with `BEGIN IMMEDIATE`: **seen**
  in the spike, and **read in the source** of its `SqliteClient.ts`. That two fibers stepping one entity are ordered
  by it, and so need no lock of their own, is **reasoned**.
- The lease check is the exact complement of the condition under which another runner takes the lease: **read in the
  source**, `SqlRunnerStorage.ts`, where the take counts whole seconds, and **seen** in the second spike at the
  boundary. That they stay equal rests on `acquired_at` being written as `CURRENT_TIMESTAMP`, to the second, which is
  **read in the source**.
- A runner saves as a reply without a handler only a defect — for a type not registered, a request that does not
  decode, a delivery that died — and saves nothing for a full mailbox, a shard it no longer holds, or a request
  already being processed: **read in the source**, the storage read of `Sharding.ts` and `send` in
  `entityManager.ts`. A type not registered is **seen** in the first spike, a request that does not decode in the
  second; the others are not.
- A defect of a handler is not saved: decision 0095, **read in the source**.
- The client is given the defect alone, and finds the request's id and the reply's from `MessageStorage`; the same
  key sent again is given the same defect under the same id; after a reset the handler is given that id: **seen** in
  the second spike.
- `Sharding.reset` with the id of the stored defect has the request handled again: **seen** in both spikes. That it
  answers `true` when it changed nothing: **seen** in the second, and **read in the source**.
- An id read by a `SELECT` through `@effect/sql-sqlite-bun` loses digits: **seen** in the second spike.
- A reset with a reply expected leaves the request's interrupts in `cluster_messages`, where one without deletes them:
  **read in the source**. The runtime's RPCs leave none, since a caller that stops waiting stores nothing
  ([decision 0091](0091-on-cluster-an-interrupted-caller-leaves-its-request-alone.md)): **reasoned**.
- That a resumption reaches every sender that waits, by `Resumed`, and that keeping a defect's id before the reset
  leaves no rows behind but in the window below: **reasoned**.

## Alternatives

- **Cluster's reaper as the runtime's passivation, with `Entity.keepAlive` while work is under way.** One lifetime
  instead of two, and a keep-alive is redelivered to a runner that gains the shard, which would activate the entity.
  But `KeepAliveRpc` runs outside `WithTransaction`, which decision 0084 forbids on a runner of the runtime, it
  leaves rows that nothing deletes, and Cluster's capacity refuses the new where the runtime's unloads the old.
- **An infinite `maxIdleTime`.** Cluster would hold a door for every entity that ever had a request, for the life of
  the runner.
- **A bound of Cluster's beside the runtime's.** It counts doors, which outlive the runtime's entities, and its
  refusal leaves messages in storage until the reaper frees a slot, up to `maxIdleTime` later.
- **Offering a request's event to the entity's queue, as on one process.** Its step would be written outside
  Cluster's transaction, and the handler, waiting in that transaction for it, would hold the connection the loop
  needs to write it.
- **A timer as a `DeliverAt` message**, written by the step that changes the earliest due. It reaches whatever runner
  holds the shard, and needs no waker. But it fires up to a read of storage late, which on one process it does not,
  and writes rows in Cluster's tables for every timer, which decision 0090 then deletes.
- **Reading `Sharding.hasShardId` on a clock.** The runtime polls nothing (decision 0063).
- **An event of Cluster for a shard gained or lost.** What the singletons give, without a name searched for each
  shard; it is not in Cluster, and a request for it would be an issue of Effect's. The singletons do not wait on it.
- **The entity's own work as RPCs it sends itself**, so that every step is a request under `WithTransaction`, and
  nothing queues behind it in the runtime's mailbox. It checks the shard by Cluster's contract alone, but writes a
  request and a reply in Cluster's tables for every completion and every timer, for decision 0090 to delete.
- **A request that waits, without answering, for the work queued before it.** It holds its transaction open while
  it waits, the file's one writer (decision 0085).
- **A sender to a suspended entity sending again on a clock.** Polling, which decision 0063 replaced.
- **The asker's step that ends its work keeping the id of a request answered with Cluster's defect.** It never saw
  the id: only the client that was given the defect did.
- **Keeping the Cluster id of every request when it is sent.** No window is left, but every send writes a row of
  the runtime's for what only a defect needs, and the step that answers keeps the id again.
- **Reading the ids from Cluster's tables by a statement of the runtime's.** It is what decision 0090 does to delete,
  inside the database; read into the runtime, an id loses digits, and `MessageStorage` already gives it whole.
- **Reading the result of the reset to decide whether to send again.** It is `true` whether or not the reset changed
  anything.

## Consequences

- The singleton's finalizer is where the runtime crashes a shard's entities, and nothing of Cluster's bounds how long
  it is waited for: a finalizer that hung would leave the shard served by no runner. It waits for nothing, so an
  operation of a crashed entity may still be stopping when the next holder starts it again, as after a crash on one
  process (decision 0056). Waiting for the operations to stop would keep them from overlapping on a planned move,
  for as long as the slowest takes, with no bound.
- A runner that dies runs no finalizer, and its operations die with it; the next holder takes the shard once its
  lease expires, as on one process after a crash. A runner that loses its lease without giving it up — frozen past
  its expiration, or cut off from the file — may still run operations while the next holder starts them again: their
  steps fail the lease check and commit nothing, but their effects on the world may run on both, as an at-least-once
  operation allows and an at-most-once one reports as `unknown` on the next holder. It learns that the lease is gone
  only at its next refresh, up to `shardLockRefreshInterval` later, and runs the singleton's finalizer after the next
  holder took the shard: until then the lease check is all that keeps its steps from committing.
- A long transaction is an outage of the file, not of its entity: every runner on it gives up its shards, and starts
  them again once it ends. A program whose step is slow makes it one.
- On one process the loop steps every event; on Cluster a request is stepped by its handler and the entity's own
  work by the loop. That two fibers step one entity is safe because the runner's one connection orders their
  transactions; on a database where transactions run side by side it is not, and decides again with the fence
  (decision 0084). The count of steps is a column the entity's row gains on Cluster. A burst of callers waits in Cluster's
  storage, where on one process it waits in memory
  ([decision 0074](archive/0074-a-message-that-finds-the-mailbox-empty-is-handled-as-it-arrives.md)).
- The shard a row carries is computed with `shardsPerGroup`, which Cluster's own rows depend on too: it cannot change
  while rows are stored.
- The lease check reads a table of Cluster's, by columns a release may change, as decision 0090 writes them; the
  spike checks it at the version the project pins. On PostgreSQL and MySQL it does not hold, and the step of an
  entity's own work waits for the fence with every other step (decision 0084).
- The runtime's capacity is the only bound on its entities: Cluster's doors follow them out within `maxIdleTime` and
  the reaper's period, and a burst may open more doors than the capacity meanwhile.
- `Resumed` and the rows of the senders that wait are new: the sender's request is the one decision 0090 keeps the
  Cluster ids of, and `Resumed`'s own rows are deleted as a request answered for work that ended.
- The rows decision 0096 found left behind are left only in a window: a process that dies after its client is given
  Cluster's defect and before it keeps the id, under an at-most-once operation whose work then ends with `unknown`.
  An operation run again sends under the same key, is given the same defect, and keeps the id then. A process that
  dies after the keep and before the reset leaves a defect under a kept id, deleted when the work ends.
- A pending id is written by a step, by the sender's handler of `Resumed`, and by a client given Cluster's defect,
  not only by a step answering a request after its asker's work ended: the database holds one for each transaction
  committed since the last step of any entity, not one, as decision 0090 has it. That step deletes them all.
- Every answer Cluster stores for an entity is a step's or a defect of Cluster's own, which corrects the rule of
  decision 0096 that names only a type not registered: a request that does not decode, or whose delivery died, is
  answered the same way, and its id kept the same way.
- Nothing of this is code yet: the runtime on Cluster is a later step of the [roadmap](../roadmap.md).
