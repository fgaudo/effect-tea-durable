# 0159. On Cluster, an older version serves no shard once a newer one launches

**Status:** accepted, 2026-11-07, with the step Effect Cluster of the roadmap. Decides the
[open question](../../open-questions.md#running) of two versions at once on Cluster. Changes what an alternative of
[decision 0084](0084-a-step-commits-only-where-the-commit-checks-the-shard.md) says of a step that dies, which rested
on decision 0082 (deleted; git keeps it): since 4.1.2, Cluster's JSDoc promises that a handler's defect restarts its
entity without end. The check by the commit is made by every step, the loop's and an activation's too, with the
shard's lease, by [decision 0175](0175-on-cluster-every-step-checks-the-newest-version-and-the-shards-lease.md). A
runner of a name a launch renamed is outranked as an older version is, by [decision 0176](0176-on-cluster-a-rename-marks-the-old-name-and-keeps-its-door.md).

## Context

A runner of Cluster is an address, its shard groups and a weight, and carries no version
([Cluster](../../cluster.md#two-versions-at-once)). During a rolling deploy the `HashRing` weighs old and new runners
alike, so a shard can go from a runner of the new version back to one of the old. The old version fails every row
the new one wrote ([decision 0043](0043-a-row-no-version-reads-fails-what-reads-it.md)). It would also step
a request the new version sent, through migrations it does not have.

Three ways out were open: deploys that replace every runner before a new one writes, forward compatibility for one
version, or a change to Cluster. The first stops a rolling deploy. The second asks every program to read rows of a
version it does not know. The third waits for the Effect team, whose answer is not known.

Cluster leaves a door the runtime can hold alone. A runner is in the ring only while it is marked healthy, and a
singleton of the cluster marks each runner by what `RunnerHealth.isAlive` answers. The JSDoc of `RunnerHealth` says
that the shards of a runner that is not alive "can and will be re-assigned". `RunnerHealth` is a service the
launcher provides, with a ping, Kubernetes or nothing.

The spike [`spikes/cluster-unhealthy-runner-gives-up-its-shards.test.ts`](../../../spikes/cluster-unhealthy-runner-gives-up-its-shards.test.ts)
runs two runners on one SQLite file, with a `RunnerHealth` that answers by version. It sees two things:

- once a runner of a newer version registers, the older one is marked unhealthy, gives up every shard, and takes none
  back while it runs on;
- a runner registers itself as healthy when it starts, and again whenever it misses itself among the runners that
  `getRunners` returns. So an older runner started again holds shards until the next health check, which comes once a
  minute by default. The health check alone does not keep the old version from a shard.

## Decision

### What the database holds

- **A launch on Cluster records, in the database, the version each of its programs runs.** A table of the runtime
  holds, for each program, the newest version any launch has recorded, and, for each runner's address, the version
  of each program the runner runs. The newest version of a program never goes down.
- **A launch whose version of a program is older than the newest recorded dies**, naming the program and both
  versions, before Cluster registers its runner. A rollback to an older version is refused, as the rows of the newer
  one would fail it. The check and the record are one transaction, so two launches see each other's versions.
- **The runtime builds Cluster's `Sharding` itself, after the check.** It takes the launcher's `ShardingConfig`,
  `Runners`, storages and `RunnerHealth`, and gives `Sharding.layer` its own `RunnerHealth`. So a runner whose
  launch dies never registers, and holds no shard where its entity types are missing.
- **So the programs a runner runs are named where its `Sharding` is built**, by `sharding(programs)` of
  [`src/cluster.ts`](../../../src/cluster.ts). A program is deployed after a launch, and `Sharding` registers its
  runner as it is built, so the versions cannot wait for the deploys. A process with no `runnerAddress`, a client
  of the cluster alone, holds no shard and records nothing. A runner's address is recorded as `host:port`. A shard of a runner without
  its types holds its messages for `entityRegistrationTimeout`, then answers each with a defect
  ([decision 0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md)).

### The health of a runner

- **A runner is alive only while it runs the newest version of every program it runs.** The runtime gives Cluster a
  `RunnerHealth` that answers so from its table, and asks the launcher's own `RunnerHealth` too: a runner is alive
  when both say it is. An address the table does not hold, a runner without the runtime, is answered by the
  launcher's alone.
- **So a rolling deploy moves every shard to the newer runners**, once the next health check runs after a newer
  runner registers. The older runners run on, serve no shard, and can be stopped at leisure.

### The check by the commit

- **A step on Cluster commits only while its program's version is the newest recorded.** The step reads the newest
  version in its own transaction, and a newer one makes the step die. The health check moves shards a minute late at
  worst, and an older runner that starts again or misses its heartbeat is healthy until then. The commit is what keeps
  the old version from the new rows.
- **A step that dies rolls back, and its message is delivered again.** Cluster restarts the entity after a defect of
  its handler, "so restarts never stop", as the JSDoc of `Entity.toLayer`'s `defectRetryPolicy` says. Nothing is
  saved as the request's reply. The message is given again, after a backoff of up to 10 s, until its shard moves to a
  runner of the newest version, which steps it.
- **The runtime registers its entity types without `disableFatalDefects`.** With it, a defect would be saved as the
  request's reply, and the message would be lost.
- **On SQLite the check is made by the commit.** A launch's record and a step are transactions of one file, and
  each takes the file's write lock as it begins, so that one waits for the other, even where a step has only read.
  On PostgreSQL the step reads the row under `FOR SHARE`, so that a launch's record waits for the steps that read
  the version before it. Until Cluster has a fence, the runtime on Cluster runs on SQLite
  alone ([decision 0084](0084-a-step-commits-only-where-the-commit-checks-the-shard.md)).

### What a deploy costs

- **Between a newer launch and the next health check, the older runners' steps die and wait.** Their messages are
  delivered again once their shards have moved. A launcher that wants a shorter pause sets a shorter
  `runnerHealthCheckInterval`.
- **Where every runner of the newest version stops, no runner steps.** The older runners take the shards again, since
  Cluster never marks its last runner unhealthy, but their steps die, and the messages wait in storage for a runner of
  the newest version. Nothing is stepped by a version that cannot read what it would find.

## What it rests on

- That the spike and the tests of two runners see what two processes would: each runner opens a connection of its
  own to the file, as a runner of its own process does. A layer of the client built once is shared by whatever is
  built under it, so two runners in one process would otherwise share one connection, and no lock of the file
  would come between them. **Seen**: with one layer built once, the `data_version` of one runner did not move at
  the other's commits ([decision 0163](0163-on-cluster-a-reading-that-waits-learns-of-another-runners-commit-from-the-file.md)).
- That a runner not alive gives up its shards, and that the ring holds only the runners marked healthy:
  **documented** by the JSDoc of `RunnerHealth`, **seen in the spike**, and **read in the source** of `Sharding.ts`
  at 4.1.2.
- That a runner registers itself healthy as it starts, and again when it misses itself in `getRunners`: **read in the
  source** of `Sharding.ts`, and **seen in the spike**, whose second test sees an older runner hold shards until the
  next health check. The rule does not rest on the health check alone, for this reason.
- That a defect of a handler restarts the entity without end, and saves no reply: **documented** by the JSDoc of
  `defectRetryPolicy` and `disableFatalDefects` at 4.1.2, and **tested** by the test of
  [`src/cluster.test.ts`](../../../src/cluster.test.ts) in which a step of an older version dies. Under
  `WithTransaction`, the message stays unprocessed and no reply is saved while the older runner dies on it, and a
  runner of the newest version steps it once. Both runners run the runtime, and the newer one's step writes the
  entity at its version. With `disableFatalDefects`, or without the check of the newest version in the step's
  transaction, the test fails.
- That Cluster never marks its last healthy runner unhealthy: **read in the source** of `Sharding.ts`. Only what a
  deploy costs rests on it.
- That a transaction of SQLite takes the file's write lock as it begins, so that a launch's record and a step come
  one after the other: **documented** by the JSDoc of `SqliteClient.layer` of `@effect/sql-sqlite-bun` at 4.1.2,
  which begins every transaction of a writable connection with `BEGIN IMMEDIATE`. SQLite alone, in WAL mode, as its
  documentation says, lets a launch commit while a step reads, and refuses the step's first write after it, with
  `SQLITE_BUSY_SNAPSHOT`. `recordVersions` asks for
  `BEGIN IMMEDIATE` itself, so that the rule holds if the driver's default changes.
- That the newest version only grows: kept by the launch, which dies before it records an older one.

## Alternatives

- **The structures of Effect.** Each module of the pinned version that could keep a version was weighed.
  - `Runner` has no field for a version, and `RunnerStorage` stores it as its schema encodes it.
  - `ShardingConfig`'s shard groups would separate versions, but a group is part of an entity's address, so a deploy
    would move every address and leave the stored messages under the old one ([Cluster](../../cluster.md#two-versions-at-once)).
  - `runnerShardWeight` is read once, as a runner starts, so an older runner cannot learn to weigh nothing.
  - `RunnerHealth` is used. It is the one service of Cluster that decides which runners hold shards, and the launcher
    provides it.
  - `ClusterSchema.InterruptOnTermination` leaves a persisted request to the next owner without a reply, but only
    once the entity terminates. A step that waits for that inside its transaction holds the runner's one connection
    of SQLite, so that the runner's locks and its other entities wait too.
  - `SemVer` compares versions of three numbers, and a program's version is one integer.
- **Deploys that replace every runner first.** A launch would wait until no older runner is registered. It is safe,
  but it stops every shard for the length of the deploy, where this rule stops only an older runner's.
- **Forward compatibility for one version.** Every program would read the rows of the version after it, which its
  migrations cannot say, since a migration reads an older row and never a newer one.
- **The health check alone.** It leaves the old version a shard for up to a minute after a restart, as the spike sees.
- **The check by the commit alone.** It loses nothing, but the older runners would keep their share of the shards,
  and every one of their steps would die until they stop.
- **Waiting for Effect.** A version of Cluster's own would replace the health check, and leave the check by the commit
  as it is. The rule is written so that it holds whatever Cluster comes to give.

## Consequences

- [`src/storage.ts`](../../../src/storage.ts) holds the tables `versions` and `runner_versions`, which
  `recordVersions` writes and `outranked` reads. [`src/cluster.ts`](../../../src/cluster.ts) gives `byVersion`, the
  `RunnerHealth`, and `sharding`, which records the versions and builds `Sharding`.
  [`src/cluster.test.ts`](../../../src/cluster.test.ts) checks the record on both dialects, the health, and two
  runners on one SQLite file during a rolling deploy.
- [`src/cluster.ts`](../../../src/cluster.ts) gives the door too: `doorOf`, Cluster's entity of a program with its
  two RPCs, and `door`, which serves it, each request stepped once `atNewest` has read the newest version in
  Cluster's transaction. `newestVersion` of the storage reads it, `FOR SHARE` on PostgreSQL.
- A deploy of a program the runner's `sharding` does not name, at the version deployed, dies
  ([decision 0174](0174-on-cluster-a-runner-deploys-only-the-programs-its-sharding-names.md)).
- [`docs/cluster.md`](../../cluster.md#two-versions-at-once) says what this note decides, and the open question of two
  versions at once leaves `docs/open-questions.md` with it.
