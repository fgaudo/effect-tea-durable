# 0175. On Cluster, every step checks the newest version and the shard's lease

**Status:** accepted, 2026-11-07, with the step of the roadmap that makes every step on Cluster check them. Decides
the [open question](../open-questions.md#running) of a step on Cluster that is not a door's, and the shard's lease.
Changes [decision 0159](0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md), whose check by
the commit only a door's step made, and makes the lease check of
[decision 0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md), which no code made, a check
of every step.

## Context

On Cluster three kinds of step commit the runtime's rows: a door's step, in Cluster's transaction; a step of the
entity's own loop, as a timer or an operation's completion, in a transaction of its own (`applyOnCluster` in
[`src/runtime.ts`](../../src/runtime.ts)); and an activation, which loads an entity and steps its `Restart` in a
transaction of its own (`activateOnCluster`). Until this note only a door's step read the newest version recorded
(`atNewest` in [`src/cluster.ts`](../../src/cluster.ts)). No step read the shard's lease.

So an older runner stepped the timers and the completions of the entities it held, and activated others, until the
health check took its shards, a minute late at worst (decision 0159). A runner frozen past its lease's expiration
stepped the same way until its next refresh, up to `shardLockRefreshInterval` later. The count of `steps`
([decision 0161](0161-on-cluster-a-step-settles-the-machine-by-the-count-of-the-steps-that-wrote-it.md)) refuses a
row another runner wrote, so no row was lost. What the gap cost was a step of an older version, which writes its own
version into a row a newer one may read, and a frozen runner's step where the other runner has not written yet.

A lease on SQLite is a row of `cluster_locks`: `shard_id` as `group:id`, `address` as `host:port`, and
`acquired_at`, written as `CURRENT_TIMESTAMP`. Cluster's `SqlRunnerStorage` lets another runner take a lease whose
age, counted in whole seconds by `strftime('%s', …)`, is more than the `shardLockExpiration` in seconds, rounded up.
Its own refresh renews a lease that names its runner, expired or not, and a refresh that finds the lease gone
releases the shard (decision 0092).

## Decision

- **Every step on Cluster runs the check first in its transaction**: a door's step, a step of the entity's loop, and
  an activation, after it finds the entity stored and before it ends. The check is `guard` of `OnCluster`, given by
  [`src/cluster.ts`](../../src/cluster.ts). One function covers the three, so that a step added later has one call to
  make.
- **The check dies unless the program's version is the newest a launch recorded**, as decision 0159 has a door's step
  read it.
- **The check dies unless the lease of the entity's shard names this runner and has not expired.** The lease is read
  by `leased` of [`src/storage.ts`](../../src/storage.ts). Its condition is the exact complement of the one under
  which Cluster lets another runner take the lease: the row names the runner's address, and its age in whole seconds
  is at most the expiration. An expired lease that no runner has taken yet is refused too, since Cluster counts it
  free.
- **A process with no runner address never passes the check.** It holds no shard, and steps nothing.
- **A step the check refuses writes nothing, and goes as a step that dies goes.** A door's step rolls back, and
  Cluster delivers the request again (decision 0159). A step of the loop rolls back and crashes its entity, which
  leaves the process, as an event the runtime cannot finish
  ([decision 0042](archive/0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md)). An activation rolls
  back, and the waker or the shard's round tries it again after `retry`. So an older runner, and a runner whose
  lease is gone, keep trying until Cluster moves the shard, and commit nothing meanwhile.
- **On SQLite the commit makes the check.** A transaction of the runtime begins with `BEGIN IMMEDIATE`, and holds the
  file's one writer until it ends, so no runner takes the lease, nor records a newer version, between the check and
  the commit ([decision 0084](0084-a-step-commits-only-where-the-commit-checks-the-shard.md)).
- **The check is a guard beside the count of `steps`, not in its place.** The table and its columns are Cluster's,
  and no release promises them. A release that renames them makes every step die, which is loud. A release that
  changes what a column holds may let a step through that should not pass, which is the gap this note closes, and
  the count still refuses the row another runner wrote.

## What it rests on

- That the lease the check reads as held is the one Cluster lets no other runner take: **tested** by `a lease the
  runtime reads as held is one Cluster lets no other runner take, at the boundary of its expiration` in
  [`src/cluster.test.ts`](../../src/cluster.test.ts). It ages a lease 33 to 37 seconds with an expiration of 35 s,
  on SQLite and on PGlite, and compares `leased` with what `RunnerStorage.acquire` of another address takes. On
  PGlite the ages stand a tenth of a second off the boundary, since `NOW()` moves between the check and the take.
  At the boundary's instant itself the two readings can disagree there, and no step is affected, since the runtime
  on Cluster does not run on PostgreSQL ([decision 0084](0084-a-step-commits-only-where-the-commit-checks-the-shard.md)). Also
  **read in the source** of `SqlRunnerStorage.ts` at 4.1.2, where the take compares whole seconds on SQLite and
  `acquired_at < NOW() - INTERVAL` on PostgreSQL.
- That a lease names its runner by `host:port` and its shard by `group:id`: **documented** by the JSDoc of
  `RunnerAddress.make`, whose primary key is formatted as `host:port`, and of `ShardId`, which formats as `group:id`.
  That `SqlRunnerStorage` writes those very texts is **read in the source** of `RunnerStorage.ts`
  (`encodeRunnerAddress`) at 4.1.2, and **tested** by every test of the runtime on Cluster, whose steps pass the
  check.
- That the table is `cluster_locks`: **read in the source** of `SqlRunnerStorage.ts`, whose default prefix is
  `cluster`. The runtime already reads `cluster_messages` and `cluster_replies` under that prefix
  ([decision 0090](0090-on-cluster-a-reply-is-deleted-as-on-one-process.md)).
- That a runner whose lease another address wrote over still holds the shard until its next refresh: **read in the
  source** of `Sharding.ts`, as decision 0092 saw, and **tested** by the test below, which finds the shard still held
  after its steps died.
- That each kind of step calls `guard`: **tested** in [`src/cluster.test.ts`](../../src/cluster.test.ts). `a timer of
  an older version, stepped by the entity's loop, dies and writes nothing` fails without `guard` in
  `applyOnCluster`. `an activation of an older version dies before it steps the restart` fails without it in
  `activateOnCluster`. `a step under a lease another runner took, or that expired, dies, a door's as the loop's`
  fails without it in `applyOnCluster`, and without it in the door's step: under an expired lease the door's step
  then commits, and under a lease another address took Cluster's own check refuses the step and releases the shard. `a step of an older version dies and saves
  no reply, and a runner of the newest version steps its requests` fails without it in the door's step.
- That a transaction of SQLite holds the file's write lock from its beginning: **documented**, as decision 0159 says.
- That a step that dies in the loop crashes its entity, and an activation that dies is tried again after `retry`:
  kept by the runtime, and **tested** by the same tests, whose entities step nothing while the runner runs on.

## Alternatives

- **The structures of Effect.** Each module of the pinned version that could say whether this runner holds a shard
  was weighed.
  - `Sharding.hasShardId` says what the runner holds in memory, which the runtime already reads before it loads an
    entity ([decision 0162](0162-on-cluster-an-entitys-shard-is-its-partition-and-each-deployment-serves-its-shards.md)).
    A frozen runner keeps it true until its next refresh, which is the gap itself.
  - `RunnerStorage.refresh` gives the shards the runner still holds, by a typed API. It writes: it renews the lease,
    expired or not, so it checks no expiration. Its JSDoc does not say that it runs in the caller's transaction. On
    PostgreSQL with advisory locks it reads the lock session, a connection apart from the step's.
  - `RunnerStorage.acquire` takes a lease that is free, which is a write, and a step must not take a shard.
  - `PrimaryKey.value` of a `RunnerAddress`, `@stability stable`, is the text of the runner's address. `addressText`
    gives it, and so does the lease's `address`.
  - `ShardId.toString` gives the text of the shard, and is used.
  - A fence of Cluster's own, [Effect-TS/effect#10058](https://github.com/Effect-TS/effect/issues/10058), would
    replace the lease check, and is not in a release. The version check stays whatever Cluster gives.
- **The check in `settle`.** `settle` runs only for an entity the runner holds, and an activation loads one it does
  not hold. A function of its own, called first, covers the three steps.
- **The version alone.** It leaves a frozen runner's steps to the count.
- **The lease alone.** An older runner holds its leases until the health check moves them, and its steps would pass.
- **Cluster's check before a reply alone.** Cluster refreshes the lease inside a door's transaction before it saves
  the reply ([Cluster](../cluster.md#who-holds-an-entity)), so a door's step whose lease another runner took already
  rolls back, and the runner releases the shard. With the door's call to `guard` taken out, the test of a lease
  written over sees it so. That check renews an expired lease that no runner took, and runs for a door alone. The
  guard makes one rule hold of the three steps, and refuses the step before Cluster's check is reached.

## Consequences

- `OnCluster` of [`src/runtime.ts`](../../src/runtime.ts) carries `guard`, which `onCluster` of
  [`src/cluster.ts`](../../src/cluster.ts) gives, and the door's handlers no longer call `atNewest` themselves.
  [`src/storage.ts`](../../src/storage.ts) gives `leased`.
- Every step on Cluster reads two rows more: the newest version and the lease.
- On PostgreSQL, Cluster holds its leases by advisory locks unless `shardLockDisableAdvisory`, and writes no row of
  `cluster_locks`. Every step there dies, which keeps the rule of decision 0084 that a step commits only where the
  commit checks the shard. PGlite writes the rows, as the module's JSDoc says.
- A runner whose lease is gone logs Cluster's `Defect in entity, restarting` for each door's request until its
  refresh releases the shard, and crashes each entity whose loop steps meanwhile.
- The open question of a step on Cluster that is not a door's leaves
  [`docs/open-questions.md`](../open-questions.md), and [`docs/design.md`](../design.md) says that every step checks.
