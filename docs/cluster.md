# Effect Cluster, as the runtime would meet it

A study of `effect/cluster` at `effect` 4.1.0, the version the project pins
([decision 0019](decisions/0019-unstable-effect-modules.md)), read from its source in `node_modules/effect/src/cluster`
and from `ai-docs/src/80_cluster`. It says what Cluster gives, what it leaves to the runtime, and which decisions
it bears on. Nothing here is decided: each finding is decided in a note of its own, as the
[roadmap](roadmap.md) says.

## What Cluster is

An entity is a set of RPCs (`Entity.make`), served by handlers that a layer builds once per entity id and keeps in
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
- **Locks.** A runner serves a shard only once it holds its lock (`RunnerStorage.acquire`). On PostgreSQL and MySQL
  the lock is an advisory lock of a reserved connection; on SQLite, PGlite and SQL Server it is a lease, a row of
  `cluster_locks` refreshed in time. A lock is refreshed every `shardLockRefreshInterval` (10 s), never less often
  than a third of `shardLockExpiration` (35 s). A lease not refreshed is free for another runner after its
  expiration; an advisory lock is freed when the server ends the idle session after the same time.
- **A shard that moves.** A runner that leaves the assignment of a shard interrupts its entities — gracefully,
  within `entityTerminationTimeout` (15 s) — then releases the lock. The new runner takes the lock, resets the
  shard's unprocessed messages (`resetShards`), and reads them from storage again. What a handler held in memory
  is lost; what was stored is read again by the new runner.
- **A runner that lost its lock.** A refresh that does not return a shard releases that shard as a move does,
  its entities interrupted gracefully: they may run on for `entityTerminationTimeout` after the lock is gone. A
  refresh that fails marks the locks unhealthy: the runner force-interrupts the entities of every shard it held
  and serves none until storage answers again. Nothing else stops it. No write of the message storage checks the
  lock: there is no fencing token. A runner frozen past the expiration — a pause of the process, a slow disk —
  that wakes in the middle of a transaction commits it, after another runner may have taken the shard.

For the runtime, the shard's lock takes the place of the file's lock
([decision 0080](decisions/0080-a-database-is-held-by-one-runtime.md)), and is weaker: the file's lock refuses a
second writer, the shard's lock only asks the first to stop. A runtime that stores an entity's state on a shared
store needs a fence of its own: something each step's transaction checks, which the next holder of the shard
changes when it takes it.

SQLite is a store for one runner. Two runners can share a file only on one machine, and a cluster of several
machines needs PostgreSQL or MySQL. `@effect/sql-sqlite-bun` is all the project depends on today.

## One transaction or two

Cluster's message storage commits apart from anything else by default
([decision 0007](decisions/0007-one-process-first.md)). But an RPC annotated `ClusterSchema.WithTransaction` runs
its handler inside `MessageStorage.withTransaction`, which `SqlMessageStorage` implements as a transaction of its
`SqlClient`. A success reply is saved inside that transaction, and saving it marks the request processed
(`UPDATE cluster_messages SET processed = TRUE`). A failure is saved after the rollback. A commit reported as failed
whose success reply was stored is answered with it; any other failure of the commit or the rollback delivers the
request again, so a handler must tolerate a retry.

So a step and the acknowledgement of its message can be one transaction, if the runtime's tables sit in the
database of Cluster's tables and are written through the same `SqlClient`: the state, the stored work, the read
model, the outbox and the reply commit together, or none does. The state need not record the last message it
handled, as decision 0007 foresaw. What the runtime must then keep is that everything a step answers is a
*success* of the RPC: a rejection is a reply the runtime encodes, never a failure of the handler, which Cluster
would save outside the transaction.

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
| Mailbox | `cluster_messages`, read per shard in `rowid` order; polled every `entityMessagePollInterval` (10 s), and woken at once by a send through its runner | its own table, in one transaction with the step | Cluster's, if steps run in its transaction; the runtime's mailbox goes |
| Deduplication | by `PrimaryKey` of the payload, as `entityType/entityId/tag/id`; a duplicate is answered with the last reply stored; keys over 255 characters stored as their SHA-256 | under the sender and its request id ([0015](decisions/0015-a-request-belongs-to-its-sender.md)) | adapted: the primary key carries the sender's address, so no sender takes another's ids |
| Replies | `cluster_replies`, kept until `clearReplies` or `clearAddress`; processed messages are never pruned by Cluster | kept while the sender's work holds ([0021](decisions/0021-a-reply-is-kept-while-the-work-that-asked-holds.md)) | Cluster keeps everything; the runtime decides what it deletes, and with what message |
| Timers | `DeliverAt` on a payload: a message not delivered before its time | `entity_keys.due`, armed by an activation, woken by the waker ([0029](decisions/0029-an-idle-entity-is-unloaded.md)) | open: a timer could be a message delivered at its time, so that an unloaded entity needs no waker |
| Passivation | `maxIdleTime` per entity (1 min by default), measured from the last message | `passivate.millis`, measured from the last event, and nothing under way ([0029](decisions/0029-an-idle-entity-is-unloaded.md)) | kept by the runtime: Cluster would unload an entity whose operation is under way unless the handler calls `Entity.keepAlive(true)` |
| Capacity | `maxResidentEntities` (10 000): beyond it, no new entity starts, and its messages wait in storage | the least recently used of the idle leave ([0076](decisions/0076-a-process-over-its-capacity-unloads-the-least-recently-used.md)) | different: Cluster refuses the new, the runtime evicts the old; the two bounds would both apply |
| A defect | the entity restarts after `defectRetryPolicy` and its messages are delivered again | the entity is suspended with the message it died on ([0006](decisions/0006-a-defect-suspends-the-entity.md)) | the runtime catches its own defects, stores the suspension and answers the RPC, so Cluster never sees one |
| A type not registered | the message waits in storage while the runner's registration window lasts (`entityRegistrationTimeout`, 1 min, counted from the first missing type it meets), then is answered with a defect | the operation waits for the program ([0045](decisions/0045-an-operation-waits-for-a-program-not-deployed-yet.md)) | adapted: a send to a program no runner deploys fails in Cluster; the operation would retry it |

Cluster polls: its mailbox every 10 s, its replies every `entityReplyPollInterval` (200 ms), its assignments every
3 s, as a fallback beside the notifications a runner sends itself. The runtime polls nothing
([decision 0063](decisions/0063-the-runtime-waits-for-what-it-waits-for.md)); on Cluster that holds of the
runtime's own fibers, not of Cluster's.

## Two versions at once

A `Runner` is an address, its shard groups and a weight. It carries no version, and the `HashRing` weighs every
healthy runner alike. During a rolling deploy the old runners stay in the ring until they leave, each departure
moves shards at once, and a joining runner takes shards as soon as it is published (`runnerJoinDebounce`, 0 by
default). The ring is not plain consistent hashing: `HashRing.getShards` caps what each runner takes at its share
of the shards, so every change of the ring changes every cap, and a shard may move between two runners neither of
which joined or left. So a shard can go from a new runner to an old one, and does whenever a new runner fails its
health check. The old runner fails every row the new version wrote
([decision 0043](decisions/0043-a-row-no-version-reads-fails-what-reads-it.md)).

Shard groups do not separate versions: an entity's group is chosen by its type, so a group per version would
change the address of every entity at each deploy.

What would keep a shard off an older runner is not in Cluster: a runtime that registers the versions of its
programs and refuses a shard whose rows are newer would leave the shard unserved until a new runner takes it —
which the ring never asks for. The choice is between a deploy that replaces every runner before any new one
writes (no rolling deploy), forward compatibility for one version, or a change to Cluster.

## The decisions it bears on

- **[0007](decisions/0007-one-process-first.md)** — one transaction is possible with `WithTransaction` and one
  `SqlClient`; the state need not record the last message it handled.
- **[0015](decisions/0015-a-request-belongs-to-its-sender.md)**, **[0017](decisions/0017-creation-in-the-machine.md)**
  — Cluster's deduplication is by a primary key global to the receiver; the sender's address goes into the key.
  The 255-character limit is Cluster's own and is met by its hashing, apart from the
  [idempotency keys services cap](open-questions.md#running).
- **[0021](decisions/0021-a-reply-is-kept-while-the-work-that-asked-holds.md)** — Cluster deletes no reply by
  itself. The sender's work and the receiver's replies are on different shards, and maybe different runners: one
  statement no longer reads both. A deletion is a message, delivered at least once, that may arrive before the
  request it ends; the receiver must then remember a request ended, or keep the reply.
- **[0029](decisions/0029-an-idle-entity-is-unloaded.md)**,
  **[0076](decisions/0076-a-process-over-its-capacity-unloads-the-least-recently-used.md)** — the runtime keeps its
  own passivation and capacity, inside Cluster's; Cluster's `maxIdleTime` is set beyond the runtime's, or the
  handler calls `Entity.keepAlive` while something is under way.
- **[0038](decisions/0038-what-happened-is-published-through-an-outbox.md)** — on PostgreSQL or MySQL, runners on
  different shards commit at once, so a `seq` from the database no longer orders the log as it commits. What a
  consumer's cursor reads from is the [open question](open-questions.md#storage-and-reading) it was.
- **[0045](decisions/0045-an-operation-waits-for-a-program-not-deployed-yet.md)** — an operation waits by retrying
  a send that Cluster fails after `entityRegistrationTimeout`.
- **[0067](decisions/0067-each-entity-is-held-by-its-own-lock.md)**,
  **[0068](decisions/0068-what-another-fiber-reads-changes-in-one-step.md)** — an entity's lock stays in the
  process: Cluster delivers one message at a time to a handler, but the runtime's activation, unloading and waker
  still meet in its memory. What a node keeps is per shard, which is what a shard leaving interrupts.
- **[0074](decisions/0074-a-message-that-finds-the-mailbox-empty-is-handled-as-it-arrives.md)** — on Cluster a
  message is stored, then handled: two transactions.
- **[0080](decisions/0080-a-database-is-held-by-one-runtime.md)** — the shard's lock replaces the file's, and needs a
  fence the runtime adds.
- **[0019](decisions/0019-unstable-effect-modules.md)** — everything read here is `@stability unstable` in
  `effect` 4.1.0.
