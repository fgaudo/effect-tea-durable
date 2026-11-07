# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## Next

1. **A rename on Cluster**, as the open question of a rename on Cluster, under [Running](open-questions.md#running),
   decides: a launch that dies while Cluster's rows stay under the old name, or a rename that moves them too
   ([decision 0156](decisions/0156-a-program-is-renamed-by-its-launch-and-keeps-its-keys.md)).

2. **The runtime's bookkeeping in Effect's `Tx` modules**, if the open question of bookkeeping in transactions, under
   [Running](open-questions.md#running), decides for them. What another fiber reads would change in one transaction,
   and not in one synchronous step kept by hand
   ([decision 0068](decisions/archive/0068-what-another-fiber-reads-changes-in-one-step.md)). The waker's reading of the
   entities held and its wait for a poke would be one transaction. On Effect Cluster a runner keeps the same
   bookkeeping over the shards it holds
   ([decision 0162](decisions/0162-on-cluster-an-entitys-shard-is-its-partition-and-each-deployment-serves-its-shards.md)).
   The tests under prioritized schedules check the rewrite, and the seeds they pin
   are found again after it.

## Later

- **The library's name and release**, once there is code to publish. It is released as experimental while it depends
  on Effect's unstable modules ([decision 0099](decisions/archive/0099-a-library-on-unstable-modules-is-released-as-experimental.md)).
  The release archives the notes the design has come to cover since the last archiving, as
  [`AGENTS.md`](../AGENTS.md) says. It passes `bun run test:release`, which runs every seed of the explored tests.

- **The runtime on Cluster across machines, on PostgreSQL**, once Cluster has a fence
  ([Effect-TS/effect#10058](https://github.com/Effect-TS/effect/issues/10058)), or the runtime one of its own. Until
  then a step commits only where the commit checks the shard, which on Cluster is SQLite
  ([decision 0084](decisions/0084-a-step-commits-only-where-the-commit-checks-the-shard.md)). A fence of the runtime's
  own waits for tests on a server of PostgreSQL with a pool, which the open question of many connections asks for.

- **A model of the runtime's protocol on Cluster**, in TLA+ or a model checker like it, if the tests on Cluster
  keep finding interleavings between runners. The model checks every state the protocol reaches within its bounds:
  the shards a runner holds and lets go, a step's commit that checks the shard, and two versions at once
  (decisions 0084, 0159 and 0162). A model proves the protocol and not the code, so the tests stay.
