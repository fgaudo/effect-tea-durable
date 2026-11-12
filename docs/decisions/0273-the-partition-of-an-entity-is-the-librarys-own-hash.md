# 0273. The partition of an entity is the library's own hash

**Status:** accepted, 2026-11-12, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the fix of bug 64. It changes
[decision 0137](archive/0137-the-log-is-ordered-within-a-partition.md), whose partition is Cluster's formula on
`Hash.string`, and adds a check to
[decision 0162](archive/0162-on-cluster-an-entitys-shard-is-its-partition-and-each-deployment-serves-its-shards.md).
The maintainer chose it on 2026-11-12, after an opinion of a Fable 5.2 agent.

## Context

Decision 0137 computes an entity's partition once, when the entity is created, and stores it. The formula is
Cluster's formula for a shard, on `Hash.string`. Decision 0162 makes the partition the shard on Cluster. The round of
a shard and the waker read an entity by its stored partition, and Cluster routes a message by the shard it computes
from the id at each delivery. So an entity whose stored partition is not its shard is read by the round of one
shard and routed to another. Its activation is refused as unheld wherever one runner does not hold both shards, and
its timers and its work after a crash then wait for ever, with no log. This is bug 64 of the roadmap.

A release of Effect makes such entities if it changes the hash. In Effect 4.1.3, Cluster's `getShardId` does not call
`Hash.string`. It calls `hashString` of `cluster/internal/hash.ts`, which is marked `@internal`, and whose comment says
that a change of it changes every entity's shard. `Hash.string` is the same djb2, and is `@stability stable`.
`singletonsOf` of `src/runtime/doors.ts` already compares, at every deploy on Cluster, Cluster's shard of each name of
a singleton with the storage's partition of it, and makes a deploy that finds them apart die. So a release that
changes one of the two hashes is a defect at deploy. A release that changes both together is the silent case: new
entities and Cluster agree, and the entities stored before are lost.

## Decision

- **The partition is the library's own hash.** `partitionOf` of `src/storage/tables.ts` hashes the id with a djb2
  written in the library, which gives the values of `Hash.string` in Effect 4.1.3, bit for bit. No release of Effect
  changes it. A release whose hash of Cluster differs then always differs from the storage's, and `singletonsOf`
  makes every deploy on Cluster die, before any step runs. The entities stored before keep their partitions.
- **The round of a shard and the waker log an entity stored under a partition that is not its shard.** The round of
  the shard `shard` reads each entity whose work is under way under the partition `shard`. An entity that Cluster
  routes to another shard is logged as an error, with an `InvariantDefect` naming the entity, its partition and its
  shard, and its activation goes on, since it runs where this runner holds both. The waker reads the timers due
  under every partition this runner holds. An entity that Cluster routes to a shard this runner does not hold is
  logged once in the process, and left out of the readings until `retry`, since its activation would be refused at
  every reading. An entity a crash's mark brings is not checked, since it is read under no partition, and its shard
  may have left the runner since the crash. Neither check costs a statement.
- **A move of Effect at which the partition is not Cluster's formula on `Hash.string` is not taken.** The test
  `the partition of an id is Cluster’s formula on Hash.string at the pinned version, for ids of every script`, of
  `src/storage.test.ts`, fails at such a move. The pinned values of the partition are never updated to pass. The move
  waits for a note that decides a migration of the partitions, and the
  [open question](../open-questions.md#running) The partitions after a release of Effect whose hash of Cluster
  differs holds it until then. `AGENTS.md` states the rule.

The decision leaves out an entity that only messages reach: a door loads an entity by its id, and reads no
partition, so such an entity is not logged. The [open question](../open-questions.md#running) An entity reached by a
message under a partition not its shard holds it.

## What it rests on

- That the library's djb2 gives the values of `Hash.string` at the pinned version, so that no entity stored before
  this note changes partition: **tested** by `the partition of an id is Cluster’s formula on Hash.string at the
  pinned version, for ids of every script`, in [`src/storage.test.ts`](../../src/storage.test.ts), on strings of any
  UTF-16 unit, and by `the partition of an id is the library’s own formula, pinned for a few ids`.
- That Cluster's shard of an id is the storage's partition of it at the pinned version, for ids outside ASCII too:
  **tested** by `Cluster’s shard of an id is the storage’s partition, for ids of every script (decision 0273)`, in
  [`src/cluster.test.ts`](../../src/cluster.test.ts), on composed and decomposed accents, a surrogate pair and an id
  of 300 characters.
- That a release whose hash of Cluster differs from the library's makes `singletonsOf` die: **tested** by `a hash of
  Cluster that differs from the storage's dies at the first name it moves`, in
  [`src/runtime/doors.test.ts`](../../src/runtime/doors.test.ts). `singletonsOf` compares names until each shard has
  one, some 1,900 names for 300 shards, and an unrelated formula agrees with the library's on one name with a chance
  of one in the number of shards. A change that moves only ids outside ASCII, as a normalization of Unicode, passes
  it, since the names are ASCII. Such a change is seen at the move by the test of ids of every script above.
- That the round of a shard reads, under its partition, an entity whose shard is another, and logs it: **tested** by
  `a round that reads an entity stored under a partition not its shard logs it, and activates it where it may`, in
  [`src/cluster.test.ts`](../../src/cluster.test.ts), which fails on the code before this note.
- That the waker reads such an entity's timer under a partition its runner holds, and logs it once: **tested** by `a
  timer the waker reads of an entity stored under a partition not its shard is logged, once`, in
  [`src/cluster.test.ts`](../../src/cluster.test.ts), with two runners, which fails on the code before this note. It
  runs under `bun run test:slow`, since it lasts about two seconds. That an entity a crash's mark brings, whose
  shard another runner holds, is not logged: **tested** by `a step of an older version dies and saves no reply, and a
  runner of the newest version steps its requests`, in [`src/cluster.test.ts`](../../src/cluster.test.ts), which
  fails when the waker checks it, under `bun run test:slow`.
- That `Hash.string` does not promise its values across a release: **documented** by its JSDoc in Effect 4.1.3, which
  gives values for a few strings and promises none for a later release. Cluster's `hashString` is `@internal`.
- That stopping every deploy on Cluster is better than losing the work of the entities stored before: **chosen** by
  the maintainer, on 2026-11-12.

## Alternatives

- **A check at launch of a sample of the stored entities.** It would catch the change of both hashes, at the cost of
  a statement at each deploy, and only for the entities of the sample. The checks of the round and of the waker cost
  no statement and read every entity whose work is under way.
- **A migration that writes each entity's partition again.** It would move the rows of an entity to another
  partition of the log, out of the order of decision 0137, and the cursors of its consumers with them. No release
  needs it yet, and the open question above holds it.
- **Keeping `Hash.string` and relying on the test of the pinned values.** The test fails in this repository at the
  move, and a user who runs a newer Effect whose two hashes changed together sees nothing. The library's own hash makes the change of Cluster's a
  defect at deploy wherever it runs.

## Consequences

- `partitionOf` no longer imports `Hash`. Its partitions are those of before.
- [`docs/cluster.md`](../cluster.md) says that a release of Effect whose hash of an entity's id differs makes every
  deploy on Cluster die.
