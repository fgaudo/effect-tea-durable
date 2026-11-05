# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## Next

1. **A log ordered within a partition** ([open question](open-questions.md#storage-and-reading)). A consumer's
   cursor skips nothing because one transaction commits at a time, which holds on SQLite and on no store where two
   processes commit at once. Each row of the outbox gets a partition, drawn by the runtime from the entity's id
   among a number fixed when the database is created, 300 by default, as Cluster's shards per group. A step takes
   its `seq` within its partition under a lock of the partition's row, in its own transaction, so that the steps
   of one partition commit in the order of their `seq`, and steps of different partitions do not wait for each
   other. A consumer keeps a cursor per partition, and the log promises the order of one entity's rows, not an
   order across entities. That is what the step gives up: today the log is one sequence, and a consumer may then
   read an effect in one partition before its cause in another, as a consumer of Kafka may. A row holds the
   projection whole, so no row needs another to be read. The number of partitions is fixed for the life of the
   database, since a change moves rows between partitions and every consumer's cursors with them. The one
   alternative that keeps a total order, a lock every step of the cluster takes, gives up what more than one
   process is for. Whether a partition is Cluster's shard is decided with the step Effect Cluster: the lock keeps
   the order without it, and a partition that followed an option of the deployment would move every consumer's
   cursors. Nothing of this is code yet. The step is decided by
   [decision 0137](decisions/0137-the-log-is-ordered-within-a-partition.md), proposed.
2. **Two versions at once** ([open question](open-questions.md#running)). It waits for Effect Cluster: Cluster's
   runners carry no version, and a shard may go back to an older one.

## Later

- **Effect Cluster.** The runtime runs on it as [`docs/cluster.md`](cluster.md) and decisions 0081 to 0092 decide,
  with sharding and rolling deploys. It runs across machines once Cluster has a fence, or the runtime one of its own
  ([decision 0084](decisions/0084-a-step-commits-only-where-the-commit-checks-the-shard.md)). Before it is done, the
  two interleavings [decision 0104](decisions/archive/0104-the-runtimes-tests-choose-where-fibers-yield.md) reached are read
  again, since the runtime on Cluster may change them:
  - a sender that registers for its receiver's resumption only after it is answered `Suspended`
    ([decision 0063](decisions/archive/0063-the-runtime-waits-for-what-it-waits-for.md)), which a resumption told by a
    message changes ([decision 0092](decisions/0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md));
  - an entity's lock dropped while others wait for it ([decision 0067](decisions/archive/0067-each-entity-is-held-by-its-own-lock.md)).

  A caller's reply past its time ([decision 0125](decisions/0125-a-callers-reply-is-kept-as-long-as-its-boundary-says.md))
  is deleted on Cluster with Cluster's rows of its request, as an entity's reply is
  ([decision 0090](decisions/0090-on-cluster-a-reply-is-deleted-as-on-one-process.md)).
- **The library's name and release**, once there is code to publish. It is released as experimental while it depends
  on Effect's unstable modules ([decision 0099](decisions/archive/0099-a-library-on-unstable-modules-is-released-as-experimental.md)).
  The release archives the notes the design has come to cover since the last archiving, as
  [`AGENTS.md`](../AGENTS.md) says. It passes `bun run test:release`, which runs every seed of the explored tests.
