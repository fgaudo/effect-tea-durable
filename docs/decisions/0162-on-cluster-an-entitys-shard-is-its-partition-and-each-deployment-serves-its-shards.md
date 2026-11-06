# 0162. On Cluster, an entity's shard is its partition, and each deployment serves its shards

**Status:** proposed, 2026-11-06, for the step Effect Cluster of the roadmap. Says how
[decision 0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md) learns a runner's shards
from a singleton of each, and changes two of its rules: each deployment registers its own singletons, and the rows
the waker and an activation read carry their entity's shard through the entity's row. Decides the roadmap's
question of whether a partition of the log is Cluster's shard
([decision 0137](0137-the-log-is-ordered-within-a-partition.md)).

## Context

On Cluster a runner holds the shards Cluster gives it, and gains or loses them while it runs. Cluster tells a runner
nothing when it does. Decision 0092 has the runtime register one singleton per shard, under a name whose hash gives
that shard: Cluster starts the singleton on the runner that holds the shard, and interrupts it before the runner
lets the shard go. A singleton that starts is a shard gained, and its finalizer is the shard lost.

Until this note, the runtime on Cluster ran no waker and activated nothing at deploy
([decision 0161](0161-on-cluster-a-step-settles-the-machine-by-the-count-of-the-steps-that-wrote-it.md)). A timer of
an entity not loaded was not woken, and an operation a crash interrupted ran again only when a request reached its
entity.

Decision 0092 wants the rows the waker and an activation read, the stored work and the mailbox, to carry their
entity's shard. Decision 0137 already stores an entity's partition of the log in the entity's row, written once when
the entity is created. The partition is drawn by Cluster's formula for a shard, on `Hash.string`, which is Cluster's
own hash line for line at 4.1.2. With as many partitions as Cluster has shards per group, the partition is the shard.

Cluster's source at 4.1.2 says three more things the runtime needs. A runner reads the messages of a shard it
acquires before it starts the shard's singletons, so a door may load an entity before its shard's singleton runs. A
runner takes a shard out of the ones `hasShardId` answers before it interrupts the shard's singletons. A singleton
runs in a scope of its own, which closes when Cluster interrupts it, and a failure of the singleton's effect is made a
defect, as the JSDoc of `Singleton.make` says.

## Decision

### The shard of an entity

- **On Cluster an entity's partition of the log is its shard.** The log has as many partitions as Cluster has shards
  per group: a launch on Cluster takes `shardsPerGroup` where the options give no partitions, and dies where they give
  another number. No row gains a column. The stored work and the mailbox are read by the partition of their entity's
  row, written once with the entity, and a hash that changes in a later release moves no stored partition.
- **A deploy checks that Cluster's hash is the storage's.** Each name it tries for a singleton is routed by
  `Sharding.getShardId` and given a partition by the storage. A name the two place apart makes the deploy die.
  Otherwise the waker of the shard Cluster routes an entity to would never read the entity's timers.
- **Every door is in Cluster's default shard group**, since a door annotates none, and so is every singleton of the
  runtime.

### A singleton per shard, for each deployment

- **Each deployment registers its own singletons**, one per shard, in its scope: decision 0092 had the runtime
  register them. The singleton of a shard is named by the first `effect-tea-durable/<program>/<n>`, for `n` from 0,
  that Cluster routes to the shard. A deploy made after its runner gained a shard has that shard's singleton started
  as it registers it, and so activates its own entities. A deployment whose scope closes lets its shards go.
- **A shard gained is held by the deployment.** The singleton marks it held, has the waker read again, and activates
  the entities of the shard whose state holds an operation, or whose mailbox holds a message, that the deployment
  does not hold yet ([decision 0071](archive/0071-a-process-starts-the-entities-with-a-message.md), for one shard).
- **An activation on Cluster begins a transaction, then takes the entity's lock, then loads**, as a door's step does,
  and steps the entity's `Restart` in the same transaction. What the `Restart` sets going starts as after a door's
  step: at once if it wrote nothing, and otherwise once a later step proves the commit (decision 0161). An activation
  is not interrupted halfway.
- **A round of activations that fails is made again after `retry`**, its reading included. A defect would end the
  singleton, whose finalizer would mark the shard lost while Cluster still routes it here. A round is counted while it
  runs, so that the process is not settled meanwhile.

### A shard lost

- **The singleton's finalizer marks the shard lost, and reads the entities of it that the deployment holds, in one
  step.** It has the waker read again, then crashes each of those entities under its own lock. A crash forks the
  interruption of the entity's operations, and waits for none of them
  ([decision 0056](archive/0056-nothing-waits-for-an-operation-under-the-permit.md)): Cluster waits for the finalizer,
  with no bound, and keeps the shard from every runner while it runs.
- **An entity is loaded on Cluster only where Cluster holds its shard and the deployment has not marked it lost.** A
  door's step and an activation check it before they load, and again as the entity enters the process, in one step
  with the entry. So an entity either entered before the mark, and the finalizer reads it, or finds the mark. A door's
  step that finds the shard not loadable dies, and Cluster delivers the request again. An activation that finds it
  loads nothing.
- **A door loads an entity of a shard not held yet.** Cluster delivers a shard's messages before it starts the shard's
  singleton. Waiting for the singleton would only make the door die and wait for Cluster's backoff.
- **An entity that left the process on Cluster steps nothing more.** Its loop ends, and an event it took after it left
  is dropped. A crash its loop does not make — a shard lost, or a door that found the entity's row written by another
  runner — would otherwise leave a loop that steps for an entity another runner may hold.

### The waker

- **The waker runs on Cluster too, over the shards held.** It reads the earliest due among the unloaded entities of
  the partitions the deployment holds, and nothing where it holds none. It reads again when an entity is unloaded,
  when a shard is gained and when a shard is lost. It activates an entity as an activation on Cluster does.

## What it rests on

- That Cluster starts a shard's singleton on the runner that holds the shard, interrupts it before the shard moves,
  and waits for its finalizer: **seen** in the spike of decision 0092, and **tested** by `a shard that moves to a second
  runner crashes its entities on the first, and the second activates them` in
  [`src/cluster.test.ts`](../../src/cluster.test.ts). The test fails where the finalizer crashes nothing, and where a
  shard gained activates nothing.
- That a singleton registered where its shard is held starts at once: **documented** by the JSDoc of
  `Singleton.make`, which says that sharding starts the effect when the local runner owns the shard, and **read in the
  source** of `registerSingleton` in `Sharding.ts` at 4.1.2.
- That a singleton runs in a scope of its own, which its interruption closes: **read in the source** of
  `registerSingleton`, which wraps the effect in `Effect.scoped`, and the type of `Singleton.make`, which takes the
  `Scope` out of what the effect needs. That a failure of it is made a defect: **documented** by the JSDoc of
  `Singleton.make`. The retry of a round rests on it.
- That an entity left with work is activated by the runner that gains its shard: **tested** by `an entity left with
  work is activated by the runner that gains its shard`, which fails where a shard gained activates nothing.
- That a timer of an entity not loaded is woken on Cluster: **tested** by `a timer of an entity no runner holds is
  woken by the runner that holds its shard`, which fails where the waker does not run on Cluster.
- That the waker and an activation read the partitions held alone: **tested** by `the work and the timers of some
  partitions are read apart from the others` in [`src/storage.test.ts`](../../src/storage.test.ts), which fails where
  the storage reads every partition. That a waker which read every partition would activate an entity of another
  runner's shard again and again, each activation refused: **only reasoned**.
- That Cluster's hash of an id is `Hash.string`: **read in the source** of `internal/hash.ts` at 4.1.2, whose JSDoc
  says that changing it changes the assignment of entities to shards. The rule does not rest on it alone: a deploy
  dies where the two differ on the names it tries.
- That Cluster delivers a shard's messages before it starts the shard's singletons, and stops answering `hasShardId`
  for a shard before it interrupts the shard's singletons: **read in the source** of the acquisition loop in
  `Sharding.ts`. The first only makes a door load early. The rule does not rest on the second: the mark the finalizer
  makes keeps an entity of the shard out whatever `hasShardId` answers.
- That an entity either enters before the mark or finds it: **only reasoned**, from the check and the entry, and the
  mark and the reading of the entities held, each being one step that does not yield. No test reaches the
  interleaving, which needs an entity to load during the finalizer.
- That the loop of an entity that left steps nothing more: **only reasoned**. Without the rule the loop waits out
  `passivate.millis` and finds the entity gone, again and again, which no test sees in its time.
- That a list of the partitions held fits in one statement: **documented** by SQLite, which takes 32766 parameters
  since 3.32. The default is 300 shards.

## Alternatives

- **The structures of Effect.** Each module of the pinned version that could tell a runner its shards, or keep them,
  was weighed.
  - `Sharding.registerSingleton` is used. `Singleton.make` makes the same call as a `Layer`, and a deploy is an effect
    in a scope, not a layer.
  - `Sharding.getShardId` names the singletons, and `Sharding.hasShardId` is Cluster's half of whether an entity may
    be loaded. Reading `hasShardId` on a clock to learn the shards polls, which decision 0063 refuses.
  - `Sharding.getRegistrationEvents` tells registrations, not shards, and the shard Cluster gives a singleton's
    context is a service Cluster does not export.
  - `Effect.acquireRelease` makes the shard gained and lost one resource of the singleton's scope.
  - `Effect.repeat` with `Schedule.spaced` makes a round again after `retry`.
  - `FiberMap` and `FiberSet` would run the activations of a shard side by side. They run one after the other on the
    runner's one connection anyway, in the singleton's own fiber.
  - `MutableHashSet` of `ShardId`s, which compare by `Equal`, would hold the shards held. One group is used, so a
    shard is its number, and a `Map` of numbers holds them.
- **A column for the shard in the stored work and the mailbox**, as decision 0092 says. Every write of a key or a
  message would write it, and a database made before would need a pass in JavaScript to fill it, since SQL cannot
  compute the hash. The entity's row already holds the partition, by the same formula, and the stored work and the
  mailbox are read through the entity's primary key.
- **A partition apart from the shard**, with a column of its own for the shard. It lets the log have fewer partitions
  than Cluster has shards, at the cost above. The default of both is 300, which decision 0137 chose so that they
  agree.
- **One singleton per shard for the whole runtime**, as decision 0092 says. It registers fewer singletons, but a
  deploy made after a shard was gained would have to read the shards held and activate its entities itself, beside a
  singleton that may gain the shard at the same time.
- **A door that waits for its shard to be held.** Cluster delivers before the singleton starts, so the door would die
  and wait for Cluster's backoff, though nothing is lost by loading.
- **Waiting in the finalizer for the operations to stop.** It keeps an operation from running on two runners at a
  planned move, for as long as the slowest takes to stop, with no bound (decision 0092).

## Consequences

- [`src/runtime.ts`](../../src/runtime.ts) gives `serving`, the singleton of a shard, with `activating` and `losing`,
  `activateOnCluster`, and `loadable`, which says whether an entity may be loaded. A door's step and an activation
  share `loadIn` and `finishIn`. `OnCluster` gives the number of shards, the shard of a name, whether Cluster holds a
  shard, and the registration of a singleton. [`src/storage.ts`](../../src/storage.ts) gives `interruptedIn` and
  `due` over some partitions. The `launch` of [`src/cluster.ts`](../../src/cluster.ts) needs `ShardingConfig`.
- A runner registers as many singletons as it has shards per group for each program it deploys: 300 for each, by
  default.
- A door that loads an entity while its shard is acquired, and released before the shard's singleton starts, leaves
  the entity loaded with no finalizer to crash it. Only the lease check of decision 0092, a later part of the step,
  keeps its own steps from committing then. A step of the entity's own work does not check the newest version yet
  either ([decision 0159](0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md)), and is
  checked with the lease.
- A door's step that crashes an entity whose row another runner wrote no longer wakes the entity's loop to crash it
  again: the loop finds the entity gone, and ends.
