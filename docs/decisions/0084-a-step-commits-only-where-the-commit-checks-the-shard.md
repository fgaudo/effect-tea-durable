# 0084. A step commits only where the commit checks the shard

**Status:** accepted, 2026-10-31. Decides the second of the [roadmap](../roadmap.md)'s findings from
[Effect Cluster](../cluster.md#who-holds-an-entity), the fence; corrects what an alternative of
[decision 0080](archive/0080-a-database-is-held-by-one-runtime.md) says of Cluster's shard locks. What an
alternative says of a step that dies is changed by
[decision 0159](0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md): Cluster
restarts the entity without end, and the message is delivered again.

## Context

On Cluster, a step commits with its reply, in the transaction of a `WithTransaction` handler
([decision 0081](0081-on-cluster-a-step-commits-with-its-reply.md)), and Cluster saves the reply only once a refresh of
the shard's lock confirms it. Where the refresh commits with the step, no other runner takes the shard between the
check and the commit: on SQLite, the refresh renews the lease inside the transaction, and holds the file's write lock
until the commit, and transactions come one after the other. Writers on one shard share a refresh under way, so where
transactions run side by side, as on SQL Server, a step may be confirmed by a refresh that commits with another
step's transaction, not its own. On PostgreSQL and MySQL the refresh goes through the
connection that holds the locks, a session apart from the transaction's. A runner paused between the check and the
commit for longer than the lock's expiration commits after another runner has reset the shard and handled the message
again: the step is applied twice, or an older state is written over the new owner's, and nobody is told. It is what
decision 0080 refused to leave to the deployer on one database.

The gap is Cluster's, and wider than a step: besides the check before a reply, none of the writes it makes for a
shard — requests, envelopes, the clearing of replies and addresses — compares who owns the shard. It is reported as
[Effect-TS/effect#10058](https://github.com/Effect-TS/effect/issues/10058), which proposes a fence in Cluster's
storage: an epoch per shard, raised by `resetShards` under an exclusive lock of its row, and read under a shared lock
of that row by every write for the shard, in the write's transaction, which fails with a typed error if the epoch has
moved on. On 2026-10-31 it is open, with no answer.

The runtime on Cluster is not written yet: it is a later step of the roadmap, and the project depends on
`@effect/sql-sqlite-bun` alone.

## Decision

- **A step commits only while its runner holds the shard, and the commit itself compares it.** No window is accepted,
  on any database: a check made before the commit, through another session, is not one.
- **The runtime on Cluster runs on SQLite**, where the commit makes the check. Every persisted RPC of a runner that
  hosts the runtime runs under `WithTransaction`, so that no check is shared with a request outside a transaction
  ([Cluster](../cluster.md#who-holds-an-entity)). Another database is taken only once it is shown to make the check
  by the commit, shared refreshes included.
- **On PostgreSQL and MySQL, the runtime waits for Cluster's fence.** Until Cluster's storage compares a token that the
  next holder of a shard changes, in the transaction of the write, the runtime does not run there. The fence it
  expects is the one #10058 proposes; once it is in a release, what the runtime relies on of it becomes a test of this
  repository, as [`AGENTS.md`](../../AGENTS.md) asks of a premise about a dependency.
- **A fence of the runtime's own is the way out, decided in a note of its own** if Effect refuses #10058, or if the
  runtime is needed on PostgreSQL before it is fixed. Cluster's source, read for this note, shows where it would
  sit: a wrapper of `RunnerStorage.acquire` raising an epoch per shard before Cluster resets the shard and reads its
  messages, and each step reading that epoch under a shared lock of its row, in its transaction.

## Alternatives

- **Accepting the window on PostgreSQL and MySQL.** It takes a pause of 35 s at the worst moment, and is rare; but what
  it costs is a step applied twice or lost without a word, which decision 0080 found and refused.
- **The runtime's own fence, now.** It covers the step's writes alone, not Cluster's own: a stale `clearReplies` or
  `clearAddress` still deletes what the new owner wrote. It rests on an order of `Sharding` — acquire, reset, then
  read — that its source shows and no documentation says, of a module `@stability unstable`
  ([decision 0019](archive/0019-unstable-effect-modules.md)). The only way the source shows for a step that finds the epoch
  moved to roll back without a reply is to die, which Cluster handles by its `defectRetryPolicy`, an option the
  runtime does not count on (decision 0082, deleted; git keeps it). And it would be written for a runtime on Cluster that does not exist
  yet, beside the table Cluster adds if #10058 is fixed.
- **Comparing the version of the entity's row in each step.** It keeps an older state from being written over a newer,
  but not a step from being applied twice: a stale runner that commits a message after the new owner has read it as
  unprocessed, and before it loads the entity, leaves nothing in the row to keep the new owner from stepping it again.

## Consequences

- Until Cluster has a fence, the runtime on Cluster runs on one machine: SQLite is a store for one runner, and two
  runners share a file only on one machine. Sharding across machines and rolling deploys across them, the
  [roadmap](../roadmap.md)'s later step, wait for it, or for the runtime's own fence.
- The limitation, and the issue it waits on, are said in the [study of Cluster](../cluster.md#who-holds-an-entity),
  which links this note.
- Decision 0080's first alternative says that a row held by a heartbeat, with a token every transaction checks, is
  what Cluster's shard locks are. They are the row and the heartbeat, with no token: a lock is checked before the
  commit, and on PostgreSQL and MySQL not by it. The alternative's conclusion, that such a token belongs to Cluster,
  is what this note decides.
- Nothing of this is code yet.
