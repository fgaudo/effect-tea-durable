# Effect Cluster, as the runtime would meet it

A study of `effect/cluster` at `effect` 4.1.0, the version the project pinned then
([decision 0019](decisions/0019-unstable-effect-modules.md)); 4.1.1, pinned since
([decision 0083](decisions/0083-effect-moves-to-4-1-1.md)), changes none of what it says, and saves a success reply
under `WithTransaction` once instead of up to four times. Read from its source in `node_modules/effect/src/cluster`
(and `HashRing.ts` beside it) and from `ai-docs/src/80_cluster`. It says what Cluster gives, what it leaves to the runtime, and which decisions
it bears on. Nothing here is decided: each finding is decided in a note of its own, as the
[roadmap](roadmap.md) says, and the list [at the end](#the-decisions-it-bears-on) links the notes taken.

## What Cluster is

An entity is a set of RPCs (`Entity.make`), served by handlers that a layer builds anew for each entity id and keeps in
memory while the entity is resident (`Entity.toLayer`). Handlers run one at a time by default (`concurrency: 1`).
An RPC annotated `ClusterSchema.Persisted` is stored before it is delivered; one that is not is sent over the
network and lost with its runner.

A runner is a process that serves entities. Each entity id hashes to a shard (`shardsPerGroup`, 300 by default),
and each shard is served by one runner. `SingleRunner.layer` is a cluster of one process, with SQL storage and no
network; `TestRunner.layer` keeps everything in memory.

Cluster stores messages and replies, never an entity's state: what a handler keeps between messages is lost when
the entity leaves the runner, unless the handler stores it itself.

## Who holds an entity

- **Assignment.** Every runner registers in `cluster_runners` and reads the healthy runners every
  `refreshAssignmentsInterval` (3 s). Each runner computes the same assignment on its own, from a `HashRing` of the
  healthy runners weighted by `runnerShardWeight`. There is no shard manager.
- **Locks.** A runner reads a shard's messages only once it holds its lock (`RunnerStorage.acquire`). On PostgreSQL
  and MySQL the lock is an advisory lock of a reserved connection, unless `shardLockDisableAdvisory`; on SQLite,
  PGlite and SQL Server, and with advisory locks disabled, it is a lease, a row of `cluster_locks` refreshed in
  time. A lock is refreshed every `shardLockRefreshInterval` (10 s), or every third of `shardLockExpiration` (35 s)
  if that is shorter. A lease not refreshed is free for another runner after its expiration; an advisory lock is
  freed when the server ends the idle session after the same time — on PostgreSQL 14 and later, and on MySQL
  outside Vitess; elsewhere only when the connection closes.
- **A shard that moves.** A runner that leaves the assignment of a shard interrupts its entities — gracefully,
  within `entityTerminationTimeout` (15 s) — while it still holds the lock, then releases it. The new runner takes
  the lock, resets the claims on the shard's unprocessed messages (`resetShards`), and reads them from storage
  again. What a handler held in memory is lost; what was stored is read again by the new runner.
- **A runner that lost its lock.** A refresh that does not return a shard releases that shard as a move does, its
  entities interrupted gracefully, though the lock is already gone. A refresh that fails marks the locks
  unhealthy: the runner force-interrupts the entities of every shard it held and serves none until storage
  answers again.
- **The check before a reply.** The final reply of a persisted request is saved only once a refresh of its
  shard's lock confirms it, at that moment (`isShardOwned`, `confirmShardLock`). If it does not, the reply is not
  saved, the request's claim is reset, and the shard's next owner handles it again. Under `WithTransaction` the
  check runs before the handler's transaction commits, so a failed check rolls back what the handler wrote. On
  PostgreSQL and MySQL the refresh goes through the connection that holds the locks, a session apart from the
  transaction's, even with advisory locks disabled. SQLite, PGlite and SQL Server have no such connection: a
  statement takes the transaction's connection from its context, and the reply is saved in the handler's, so the
  refresh renews the lease inside the transaction, and commits or rolls back with it.

What the check leaves open on PostgreSQL and MySQL is the time between it and the commit: there is no fencing
token that the commit itself compares. A runner frozen after the refresh that confirmed its lock — a pause of the
process, a slow disk — for longer than the lock's expiration commits after another runner may have taken the shard
and handled the message again. A refresh renews a lease for a full expiration, so the window is a pause of 35 s at
the worst moment, not a slow refresh. On SQLite, PGlite and SQL Server the renewal holds the file's write lock, or
the lock row's, until the commit, so no runner takes the shard between the check and the commit: the check is made
by the commit — unless the check is shared. Writers on one shard share a refresh under way, and one started outside
the transaction, by a persisted request without `WithTransaction`, does not commit with it. On SQLite, whose client
runs one transaction or statement at a time, that refresh waits for the transaction, which waits for it, until the
check times out (10 s): the check fails, the transaction rolls back, and both requests are delivered again. Safe, but
a stall; it cannot happen while every persisted RPC of the runner runs under `WithTransaction`, since SQLite's
transactions then come one after the other. Where transactions run side by side, as on SQL Server, a refresh started
in one writer's transaction is shared by another's: the refresh runs in the context of the writer that started it,
on its transaction's connection, so a step it confirms is not confirmed by its own commit. What a handler writes
outside `WithTransaction`, and a chunk of a streamed reply, is not checked at all, on any database.

The gap is reported to Effect, against 4.0.6, as
[Effect-TS/effect#10058](https://github.com/Effect-TS/effect/issues/10058): a runner that lost its shard lock still
writes replies, requests and envelopes for the shard, and clears its replies and addresses, since none of these
writes checks who owns it. Its repro is a reply saved by the stale runner after the new owner took the shard and ran
the request again, which the check before a reply, in 4.1.0 and 4.1.1, narrows to the window above; the other writes
are still not checked. It proposes a fence in Cluster: a table of shard epochs, raised by `resetShards` under an
exclusive lock of the shard's row, and every write for a shard reading the epoch its writer acquired with under a
shared lock of that row (`FOR SHARE`, `LOCK IN SHARE MODE`, `HOLDLOCK`), in the write's transaction, and failing
with a typed error if it has moved on; a stale write either commits before the new owner's reset, or fails. On
2026-10-31 it is open, with no answer, and its fix not merged.
[#10226](https://github.com/Effect-TS/effect/pull/10226), merged that day and in no release yet, fences only the
workflow engine's reset of an activity, by comparing the reply it read, and says it is not that fence. Its
companion, [#10059](https://github.com/Effect-TS/effect/issues/10059) — a frozen runner holding its advisory locks
until TCP gave up — is closed, by the idle session timeout above.

For the runtime, the shard's lock takes the place of the file's lock
([decision 0080](decisions/0080-a-database-is-held-by-one-runtime.md)). On SQLite it holds as the file's lock
does: the check commits with the step. On PostgreSQL and MySQL it is weaker: the file's lock refuses a second
writer outright, the shard's lock is confirmed before a commit, not by it. Decided: the window is not accepted, and
until Cluster has a fence the runtime on Cluster does not run on PostgreSQL or MySQL; it waits for #10058, or for a
fence of its own, decided then
([decision 0084](decisions/0084-a-step-commits-only-where-the-commit-checks-the-shard.md)).

SQLite is a store for one runner. Two runners can share a file only on one machine, and a cluster of several
machines needs PostgreSQL or MySQL. `@effect/sql-sqlite-bun` is all the project depends on today.

## One transaction or two

Cluster's message storage commits apart from anything else by default
([decision 0007](decisions/0007-one-process-first.md)). But an RPC annotated `ClusterSchema.WithTransaction` runs
its handler inside `MessageStorage.withTransaction`, which `SqlMessageStorage` implements as a transaction of its
`SqlClient`. A success reply is saved inside that transaction, and saving it marks the request processed
(`UPDATE cluster_messages SET processed = TRUE`). A failure is saved after the rollback, unless the rollback added
a defect of its own, which delivers the request again. A commit reported as failed whose success reply was stored
is answered with it; any other failure of the commit delivers the request again, so a handler must tolerate a
retry.

So a step and the acknowledgement of its message can be one transaction, if the runtime's tables sit in the
database of Cluster's tables and are written through the same `SqlClient`: the state, the stored work, the read
model, the outbox and the reply commit together, or none does. The state need not record the last message it
handled, as decision 0007 foresaw. What the runtime must then keep is that everything a step answers is a
*success* of the RPC: a rejection is a reply the runtime encodes, never a failure of the handler, which Cluster
would save outside the transaction.

A spike on `SingleRunner` and `@effect/sql-sqlite-bun` confirmed it: a handler's row and its reply commit together,
a `COMMIT` that fails leaves neither and the request is handled again, a failure is saved as the reply after the
rollback, and a request sent again is answered from its stored reply without the handler running. All of it is
what the documentation of `WithTransaction` says. It found what a defect does too, which is of two other kinds
([decision 0082](decisions/0082-what-0081-saw-of-a-defect-is-not-cluster-s-contract.md)):

- **An option.** The entity restarts after `defectRetryPolicy` and is given the message again, without end under the
  default policy, its later messages waiting behind it.
- **A bug, of 4.1.0 and 4.1.1.** Once that message's caller is interrupted, by a timeout, messages to the runner's
  other entities are never delivered, with or without `WithTransaction`, on `TestRunner` too; a request that is only
  slow does not do it. Traced with logs: the runner's read of storage delivers messages one at a time, and stops on
  the caller's `Interrupt`, which waits for the entity's handlers; each rebuild replays the message that dies and fails
  before it publishes them, so the wait lasts while the handler dies
  ([decision 0083](decisions/0083-effect-moves-to-4-1-1.md)). Reported as
  [Effect-TS/effect#10238](https://github.com/Effect-TS/effect/issues/10238).

A caller that stops waiting is not a defect, and stores an answer too. A fiber interrupted while it waits for a
persisted RPC has Cluster's client store an `Interrupt` under the request's id, unless Cluster is shutting down or
tearing the caller down; the receiver interrupts the request if it waits or runs, and saves the interruption as its
reply, so the same key sent again is answered with it and the handler never runs. `ClusterSchema.Uninterruptible`
set to `"client"` keeps the client from sending it, and the request is handled when its turn comes
([decision 0091](decisions/0091-on-cluster-an-interrupted-caller-leaves-its-request-alone.md)).

What stays two transactions:

- **The arrival of a message and its handling.** `saveRequest` commits the message, and the handler commits the
  step. A message that finds the mailbox empty is handled as it arrives, in one transaction, on SQLite
  ([decision 0074](decisions/0074-a-message-that-finds-the-mailbox-empty-is-handled-as-it-arrives.md)); on
  Cluster it is not.
- **A send between entities.** The sender's operation commits nothing of the receiver's; the request is a
  message of Cluster's, the reply another, as they are already
  ([decision 0009](decisions/0009-entities-talk-through-operations.md)).

## What Cluster gives that the runtime already does

| What | Cluster | The runtime | Finding |
| --- | --- | --- | --- |
| Mailbox | `cluster_messages`, read per shard in `rowid` order; a message read is claimed (`last_read`) and read again if its claim is ten minutes old; polled every `entityMessagePollInterval` (10 s), and woken at once by a send through its runner | its own table, in one transaction with the step | Cluster's, if steps run in its transaction; the runtime's mailbox keeps what the machine queues: the message an entity died on, and its own work's ([0088](decisions/0088-on-cluster-the-message-an-entity-dies-on-stays-in-its-mailbox.md)) |
| Deduplication | only for a payload that implements `PrimaryKey`, under `entityType/entityId/tag/id`; a duplicate is answered with the last reply stored; keys over 255 characters stored as their SHA-256 | under the sender and its request id ([0015](decisions/0015-a-request-belongs-to-its-sender.md)) | adapted: the primary key is the request's version and `requestKey`, which carries its sender, so no sender takes another's ids ([0085](decisions/0085-on-cluster-a-request-is-keyed-as-the-machine-keys-it.md), [0086](decisions/0086-on-cluster-a-request-is-keyed-by-its-version-too.md)) |
| Replies | `cluster_replies`, kept until `clearAddress` deletes an entity's messages and replies, or `Sharding.reset` (which the workflow engine calls) deletes a request's reply and marks the request unprocessed, so that it is handled again; processed messages are never pruned by Cluster | kept while the sender's work holds ([0021](decisions/0021-a-reply-is-kept-while-the-work-that-asked-holds.md)) | Cluster keeps everything; the runtime deletes its replies as on one process, and Cluster's rows with them, by statements of its own ([0090](decisions/0090-on-cluster-a-reply-is-deleted-as-on-one-process.md)) |
| Timers | `DeliverAt` on a payload: a message not delivered before its time, and not woken at it either: the next read of storage finds it, up to `entityMessagePollInterval` (10 s) late | `entity_keys.due`, armed by an activation, woken by the waker ([0029](decisions/0029-an-idle-entity-is-unloaded.md)) | open: a timer could be a message delivered at its time, so that an unloaded entity needs no waker, if a timer may fire up to a poll late |
| Passivation | `maxIdleTime` per entity (1 min by default), measured from the end of its last request, while none is active, and checked every `maxIdleTime` or 30 s, whichever is shorter, but no more often than every 5 s | `passivate.millis`, measured from the last event, and nothing under way ([0029](decisions/0029-an-idle-entity-is-unloaded.md)) | kept by the runtime: Cluster would unload an entity whose operation is under way unless the handler calls `Entity.keepAlive(true)` |
| Capacity | `maxResidentEntities` (10 000): beyond it, no new entity starts, and its messages wait in storage | the least recently used of the idle leave ([0076](decisions/0076-a-process-over-its-capacity-unloads-the-least-recently-used.md)) | different: Cluster refuses the new, the runtime evicts the old; the two bounds would both apply |
| A defect | the entity restarts after `defectRetryPolicy` and its messages are delivered again | the entity is suspended with the message it died on ([0006](decisions/0006-a-defect-suspends-the-entity.md)) | the runtime catches its own defects, stores the suspension and answers the RPC, so Cluster never sees one; the message it died on stays in the runtime's mailbox, where a resumption handles it ([0088](decisions/0088-on-cluster-the-message-an-entity-dies-on-stays-in-its-mailbox.md)) |
| A type not registered | the message waits in storage while the runner's registration window lasts (`entityRegistrationTimeout`, 1 min, counted from the first entity of any type the runner registers; twice that, from the first message of a missing type, if it registers none), then is answered with a defect; the window never opens again, so a type registered after it fails every message that finds it missing | the operation waits for the program ([0045](decisions/0045-an-operation-waits-for-a-program-not-deployed-yet.md)) | adapted: a send to a program no runner deploys fails in Cluster; the operation would retry it |

Cluster polls: its mailbox every 10 s, its replies every `entityReplyPollInterval` (200 ms), its assignments every
3 s, as a fallback beside the notifications a runner sends itself. The runtime polls nothing
([decision 0063](decisions/0063-the-runtime-waits-for-what-it-waits-for.md)); on Cluster that holds of the
runtime's own fibers, not of Cluster's.

## Two versions at once

A `Runner` is an address, its shard groups and a weight. It carries no version, and the `HashRing` weighs every
healthy runner by its weight alone, whatever version it runs. During a rolling deploy the old runners stay in the ring until they leave, each departure
moves shards at once, and a joining runner takes shards as soon as it is published (`runnerJoinDebounce`, 0 by
default). The ring is not plain consistent hashing: `HashRing.getShards` caps what each runner takes at its share
of the shards, so every change of the ring changes every cap, and a shard may move between two runners neither of
which joined or left. So a shard can go from a new runner to an old one, and can whenever a new runner fails its
health check and leaves the ring. The old runner fails every row the new version wrote
([decision 0043](decisions/0043-a-row-no-version-reads-fails-what-reads-it.md)).

Shard groups do not separate versions: an entity's group is chosen by its type, from its id (the `ShardGroup`
annotation), and the group is part of its shard and so of its address: a group per version would change the
address of every entity at each deploy, and leave its stored messages under the old one.

What would keep a shard off an older runner is not in Cluster: a runtime that registers the versions of its
programs and refuses a shard whose rows are newer would leave the shard unserved until the ring changes again,
and gives it to a new runner only by chance. The choice is between a deploy that replaces every runner before any new one
writes (no rolling deploy), forward compatibility for one version, or a change to Cluster.

## The decisions it bears on

- **[0007](decisions/0007-one-process-first.md)** — one transaction is possible with `WithTransaction` and one
  `SqlClient`; the state need not record the last message it handled. Decided: a step commits with its reply
  ([decision 0081](decisions/0081-on-cluster-a-step-commits-with-its-reply.md)), and a caller that stops waiting stores
  no answer ([decision 0091](decisions/0091-on-cluster-an-interrupted-caller-leaves-its-request-alone.md)).
- **[0015](decisions/0015-a-request-belongs-to-its-sender.md)**, **[0017](decisions/0017-creation-in-the-machine.md)**
  — Cluster's deduplication is by a primary key global to the receiver; the sender's address goes into the key.
  The 255-character limit is Cluster's own and is met by its hashing, apart from the
  [idempotency keys services cap](open-questions.md#running). Decided: the primary key is the version that keyed the
  request and its `requestKey`, under one RPC for a creation and one for messages; Cluster answers a retry within a
  version, and the runtime's replies one across versions
  ([decision 0085](decisions/0085-on-cluster-a-request-is-keyed-as-the-machine-keys-it.md),
  [decision 0086](decisions/0086-on-cluster-a-request-is-keyed-by-its-version-too.md)).
- **[0006](decisions/0006-a-defect-suspends-the-entity.md)**, **[0023](decisions/0023-suspended-means-no-reply-yet.md)**
  — Cluster stores `Suspended` and `NotFound` as it stores a reply, and marks processed the message an entity dies
  on. Decided: a request so answered is handled again when sent again, through `Sharding.reset`
  ([decision 0087](decisions/0087-on-cluster-what-is-not-a-reply-is-handled-again.md)), and the message an entity dies
  on stays in the runtime's mailbox, as the machine writes it ([decision 0088](decisions/0088-on-cluster-the-message-an-entity-dies-on-stays-in-its-mailbox.md)).
- **[0021](decisions/0021-a-reply-is-kept-while-the-work-that-asked-holds.md)** — Cluster deletes no reply by
  itself, and has no operation that forgets a processed request without delivering it again
  ([Effect-TS/effect#10239](https://github.com/Effect-TS/effect/issues/10239)). The sender's work and the receiver's
  replies are on different shards, but in one database, where the runtime on Cluster's transactions come one after
  the other: one statement still reads both. So the runtime's replies are deleted as on one process, and
  Cluster's rows with them, by the runtime's own statements
  ([decision 0090](decisions/0090-on-cluster-a-reply-is-deleted-as-on-one-process.md)).
- **[0029](decisions/0029-an-idle-entity-is-unloaded.md)**,
  **[0076](decisions/0076-a-process-over-its-capacity-unloads-the-least-recently-used.md)** — the runtime keeps its
  own passivation and capacity, inside Cluster's; Cluster's `maxIdleTime` is set beyond the runtime's, or the
  handler calls `Entity.keepAlive` while something is under way.
- **[0038](decisions/0038-what-happened-is-published-through-an-outbox.md)** — on PostgreSQL or MySQL, runners on
  different shards commit at once, so a `seq` from the database no longer orders the log as it commits. What a
  consumer's cursor reads from is the [open question](open-questions.md#storage-and-reading) it was.
- **[0045](decisions/0045-an-operation-waits-for-a-program-not-deployed-yet.md)** — an operation waits by retrying
  a send that Cluster fails after `entityRegistrationTimeout`, a window that runs once per runner, from the first entity it registers.
- **[0067](decisions/0067-each-entity-is-held-by-its-own-lock.md)**,
  **[0068](decisions/0068-what-another-fiber-reads-changes-in-one-step.md)** — an entity's lock stays in the
  process: Cluster delivers one message at a time to a handler, but the runtime's activation, unloading and waker
  still meet in its memory. What a node keeps is per shard, which is what a shard leaving interrupts.
- **[0074](decisions/0074-a-message-that-finds-the-mailbox-empty-is-handled-as-it-arrives.md)** — on Cluster a
  message is stored, then handled: two transactions
  ([decision 0081](decisions/0081-on-cluster-a-step-commits-with-its-reply.md)).
- **[0080](decisions/0080-a-database-is-held-by-one-runtime.md)** — the shard's lock replaces the file's; on
  SQLite it is confirmed by the step's commit, on PostgreSQL and MySQL before it, not by it. Decided: the runtime
  runs only where the commit checks the shard, until Cluster has the fence
  [#10058](https://github.com/Effect-TS/effect/issues/10058) asks for
  ([decision 0084](decisions/0084-a-step-commits-only-where-the-commit-checks-the-shard.md)).
- **[0019](decisions/0019-unstable-effect-modules.md)** — everything read here is `@stability unstable` in
  `effect` 4.1.0 and 4.1.1.
