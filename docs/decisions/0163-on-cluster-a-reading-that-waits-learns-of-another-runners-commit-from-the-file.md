# 0163. On Cluster, a reading that waits learns of another runner's commit from the file

**Status:** accepted, 2026-11-07, with the step Effect Cluster of the roadmap. Changes
[decision 0142](0142-a-consumer-waits-for-a-row-of-its-topic.md), whose wait on Cluster ends at its time where another
runner commits, and decides the question it left to the step: whether runners tell each other of their commits.
Narrows [decision 0063](archive/0063-the-runtime-waits-for-what-it-waits-for.md) on Cluster: the runtime polls one
thing there, the file, and only while a reading waits.

## Context

A reading of `feed` with a `wait` waits for its topic's signal, which a step completes after its commit
(decision 0142). The signal lives in the process. On Cluster an entity steps on the runner that holds its shard
([decision 0162](0162-on-cluster-an-entitys-shard-is-its-partition-and-each-deployment-serves-its-shards.md)), so
with several runners most commits are another runner's. A reading then waits out its whole `wait.millis`. A
consumer of payments that waits 30 s is given its row up to 30 s late. A consumer that waits less reads more often,
which is the polling of every consumer that decision 0142 was taken to end.

On this step the runtime on Cluster runs on SQLite, and its runners share one file on one machine
([decision 0084](0084-a-step-commits-only-where-the-commit-checks-the-shard.md)). SQLite documents
`PRAGMA data_version`: a number of the connection that moves once another connection commits to the file, and does
not move at the connection's own commits. A runner's client of SQLite has one connection.

## Decision

- **On Cluster, while a reading waits, the runner reads a version of the other runners' commits** every
  `entityReplyPollInterval` of Cluster's `ShardingConfig`, 200 ms by default. On SQLite the version is
  `PRAGMA data_version`. Where it has moved since the last reading, every reading that waits on this runner is
  woken, whatever its topic, and reads again.
- **Nothing reads while no reading waits.** A count of the readings that wait opens a `Latch`, and closes it as the
  last one ends. The watcher waits on the latch. The count is raised and lowered by one `Effect.acquireUseRelease`,
  whose raise no interruption splits from its lowering. A count raised before an `ensuring` stayed raised where a
  reading was interrupted at a yield between the two, and the watcher read at every interval for ever.
- **The version is read once at launch, and kept while no reading waits.** So a commit of another runner after a
  reading's page and before its wait still moves the version from the one kept, and the reading is woken at the next
  read. A version read anew whenever a wait begins would already count that commit, and the reading would wait out
  its time.
- **The signal says that another connection committed, not that a row of the topic was written.** A woken reading may
  find an empty page, and waits again. Cluster's own writes, its lease refreshes among them, move the version too: a
  reading that waits is read again at most once per interval.
- **A version that cannot be read is a version that has not moved.** The reading waits out its time, as before this
  note. On SQLite a `PRAGMA data_version` that gives no row fails, so that no `NaN`, which differs from itself, is
  ever kept as a version. A launch that cannot read it keeps a value no version is, so that the first reading after it is woken once.
- **A step's commit on this runner is told as before**, at once and to its topics alone (decision 0142).
- **What gives the version is the storage's.** `OnCluster` takes it, with its interval, so that another database
  gives its own: on PostgreSQL, a `LISTEN` the steps `NOTIFY`, decided with that database.

## What it rests on

- That `data_version` moves on a connection once another process commits to the file, and not at the connection's
  own commits: **documented** by SQLite's page on `PRAGMA data_version`, and **seen** in
  [`spikes/sqlite-data-version.test.ts`](../../spikes/sqlite-data-version.test.ts), which commits from a second
  process. Within one process, with a connection per runner, it is **tested** by `a consumer that waits is woken by a
  commit of another runner, within its poll` in [`src/cluster.test.ts`](../../src/cluster.test.ts), which fails without
  the watcher.
- That a reading after the version moved reads what the other connection committed: **documented** by SQLite, whose
  read transaction in WAL mode sees the last commit, and **seen** in the same spike.
- That a runner's client has one connection, so that the version is the one the runner's readings read through:
  **documented** by the JSDoc of `SqliteClient` of `@effect/sql-sqlite-bun` at 4.1.2.
- That a reading whose wait begins after a commit of another runner is woken: **tested** by `a reading is woken by a
  commit of another runner between its page and its wait, under prioritized schedules` in
  [`src/runtime.test.ts`](../../src/runtime.test.ts), whose clock never moves. It fails where the watcher reads a new
  version as a wait begins after another has ended. That a reading is woken within the interval: **tested** by `a
  reading that waits is given the row another runner commits, within the interval`, which fails without the watcher.
- That a reading interrupted as its wait begins lowers the count it raised: **documented** by the JSDoc of
  `Effect.acquireUseRelease` at 4.1.2, `@stability stable`, whose acquisition is not interrupted and whose release runs
  once it has acquired. **Tested** by `a reading interrupted as it begins its wait leaves the watcher still, under
  every schedule of one deviation` in [`src/runtime.test.ts`](../../src/runtime.test.ts), which fails where the count
  is raised before an `ensuring`.
- That a `Latch` opened releases its waiters and later ones, and that `openUnsafe` and `closeUnsafe` change it in one
  step: **documented** by the JSDoc of `Latch` at 4.1.2, `@stability stable`.
- That Cluster has no way to tell every runner: **read in the source** of `Runners.ts` and `Sharding.ts` at 4.1.2.
  `Runners` sends and notifies one runner, or one entity, and the RPCs between runners are a closed group. Nothing of
  this decision falls if Cluster comes to have one: the watcher would give way to it.
- That a `PRAGMA data_version` on the runner's one connection costs little beside the steps: **only reasoned**, from a
  statement that reads a counter of the connection, once per interval at most, and only while a reading waits.

## Alternatives

- **The structures of Effect.** Each module of the pinned version that could tell a runner of another's commit, or
  keep the watcher, was weighed.
  - `Runners.notify` and `Sharding.notify` tell a runner of a message of an entity, routed by its shard. Nothing
    reaches every runner, and a runner is not an address a message can be sent to.
  - `Singleton` runs on one runner, and `Sharding.getRegistrationEvents` tells registrations, not commits.
  - `Reactivity` invalidates within one process. Neither `effect/sql` nor `@effect/sql-sqlite-bun` gives a hook of
    another connection's commits.
  - `Latch` is used, to keep the watcher still while no reading waits. `SubscriptionRef` of the count would tell the
    same through a stream, at a subscription the one watcher does not need.
  - `Effect.forever` with `Effect.sleep` makes the interval. `Effect.repeat` with `Schedule.spaced` would make it
    too, and gives no way to wait on the latch between two readings.
  - The `Deferred` of each topic (decision 0142) is kept. The watcher completes every one of them.
- **No signal: a wait on Cluster ends at its time**, as decision 0142 had it. A consumer on Cluster then picks a short
  wait, and reads once per wait: what decision 0142 refused, for every consumer of every runner.
- **A hub entity per topic**, which every committing runner sends a message after its commit, and whose readings it
  answers. It uses Cluster alone, and works on any database. It costs a message per commit per topic, makes one hot
  entity of each topic, and loses its readings when its shard moves.
- **A transport of the runtime's own between runners.** Cluster's RPCs between runners are a closed group, so it
  would be a second server on every runner.
- **A version per topic**, the head of each partition of the topic read on every interval. It would wake only the
  readings of a topic written, at a statement over the partitions held for each topic waited for. A reading woken in
  vain costs one page, which reads an index.
- **A new option for the interval.** `entityReplyPollInterval` is the interval at which Cluster itself reads replies
  for a caller that waits. One interval of the runner keeps one setting, at the cost of tying a consumer's delay to
  Cluster's.

## Consequences

- [`src/runtime.ts`](../../src/runtime.ts) counts the readings that wait, forks the watcher on Cluster, and wakes every
  reading where the version moves. `OnCluster` gives `others`, the version and its interval, which
  [`src/cluster.ts`](../../src/cluster.ts) reads as `PRAGMA data_version` and `entityReplyPollInterval`.
- The tests of the shards of a runner in [`src/cluster.test.ts`](../../src/cluster.test.ts) give each runner a
  connection of its own. With one layer of the client built once, two runners shared one connection, and no
  `data_version` moved.
- On PostgreSQL the version reads nothing, and a wait ends at its time, until that database gives its own signal.
  The runtime on Cluster does not run there yet (decision 0084).
- [`docs/cluster.md`](../cluster.md) and [`docs/design.md`](../design.md) say so where they speak of a consumer's wait.
