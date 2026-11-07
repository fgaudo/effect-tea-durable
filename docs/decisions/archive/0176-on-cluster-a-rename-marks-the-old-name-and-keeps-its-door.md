# 0176. On Cluster, a rename marks the old name, and keeps a door under it

**Status:** accepted, 2026-11-07, with the step A rename on Cluster of the roadmap. Decides the
[open question](../../open-questions.md#running) of a rename on Cluster. Changes
[decision 0156](0156-a-program-is-renamed-by-its-launch-and-keeps-its-keys.md), which left a rename on Cluster to
the step Effect Cluster, and refused two names renamed to one. Changes
[decision 0159](0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md) and
[decision 0175](0175-on-cluster-every-step-checks-the-newest-version-and-the-shards-lease.md): a renamed name is
outranked as an older version is, and the check of every step refuses it.

## Context

A launch's `renames` move the runtime's rows from each old name to its new name, in one transaction
([decision 0156](0156-a-program-is-renamed-by-its-launch-and-keeps-its-keys.md)). On one process the database is held
by one runtime ([decision 0080](0080-a-database-is-held-by-one-runtime.md)), so nothing runs under the old
name while the rows move. On Cluster that premise does not hold, and three things were left open.

- **Cluster's rows stay under the old name.** A program's name is the entity type of its door, and Cluster stores a
  door's requests in `cluster_messages` and `cluster_replies` under that type. A request saved under the old name and
  not yet delivered was never delivered, since no runner registered a door of that name.
- **Other runners still run the old code.** Several runners share the database. A runner of the old code kept
  stepping the old name's entities while the new runner's launch moved their rows, and could create an entity under
  the old name after the move.
- **Every runner's launch runs the rename.** A launch that declares a rename runs it at each runner of the new code.

Cluster's rows cannot be moved by the runtime. `SqlMessageStorage` keys a request by a `message_id` built from
`entityType/entityId/tag/id`, and digests it with SHA-256 past 255 characters. A move would write the entity type in
that key, which is Cluster's own column. Cluster's tables are no stable API
([decision 0169](0169-on-cluster-an-operations-request-ids-are-kept-under-its-work-and-deleted-with-it.md)).

## Decision

### The old name is marked renamed

- **On Cluster the launch marks each old name renamed**, in the transaction that moves the rows. The mark is the
  column `renamed_to` of the old name's row in `versions`, which holds the new name. The old name is marked whether or
  not it holds anything, since a runner of the old code may create an entity under it after the move.
- **The newest version moves to the new name.** Where the old name's newest version is newer than the new name's,
  the launch dies and moves nothing. Where the new name has no version recorded, it is given the old name's. Where
  two old names are renamed to that new name, the new name is given the newer of their versions, whatever the order
  of the renames. An old name no launch on Cluster recorded is marked at version 0.
- **The transaction takes `versions` as `recordVersions` does**: on SQLite it begins with `BEGIN IMMEDIATE`, and on
  PostgreSQL it locks the table. So a launch that renames and a launch that records versions see each other.
- **A launch of one process writes no mark.** No other runner runs there, and nothing reads `versions`.

### No runner of the old code steps the old name again

- **The check of every step dies for a renamed name.** `atNewest` of [`src/cluster.ts`](../../../src/cluster.ts) reads
  the program's row of `versions` in the step's transaction, and dies where it names a new name. A door's step then
  rolls back and Cluster delivers the request again. A step of the loop crashes its entity, and an activation is
  tried again after `retry`, as decision 0175 says of a step the check refuses.
- **A runner of a renamed name is outranked.** `outranked` counts a program whose row is marked as older than the
  newest, so the health check of decision 0159 takes the runner's shards.
- **A runner of the old code that launches again dies.** `recordVersions` refuses a program whose name a launch
  renamed, and the runner never registers.

### The old name's door delivers to the new program

- **A deploy of the new program registers its door under each old name too**, the names the launch renames to it.
  The old name's door has the same handlers as the new one's, and steps the entity under the new name. So a request
  Cluster saved under the old name is delivered, and stepped by the new program.
- **The old name's entities are on the shards the runner holds.** Cluster draws an entity's shard from its id alone,
  so a door of the old name and one of the new name route an id to the same shard, and the step's lease check passes.
- **The old name's door stays for as long as the launch declares the rename.** A rename stays in the launch for as
  long as a database of the old name may be launched (decision 0156), and a client of the old code may still send
  under the old name.

### A request is named as the launch names it

- **A door's step names a request's sender by its new name.** Where a request that reached a door is an operation's,
  and its sender's name is one the launch renames, the step reads it with the new name. The rename wrote every stored
  request of the old name's entities with the new name, and a reply is found by the request's text. A runner of the
  old code sends under the old name until its shards move, and its retry would otherwise be a request of its own,
  applied a second time.
- **A `Resumed` names its receiver by its new name.** A `Resumed` saved before the rename names the entity that left
  its suspension by its old name, and the runner wakes the entity under its new one.
- **A caller's retry under the old name is answered by Cluster**, from the reply it saved, or delivered to the old
  name's door and answered from the runtime's replies. A retry under the new name is a new request to Cluster,
  answered from the runtime's replies.

### Two names renamed to one

- **A launch may rename two names to one**, as `{ a: 'c', b: 'c' }`. A program renamed twice, `a` to `b` and then `b`
  to `c`, declares both of its former names, so that a door of each stays registered. The launch no longer refuses
  it before the database is held. The storage still refuses to move a name onto one that holds an entity, a head of
  the log or a consumer, so the entities of two names never mix.
- **A name both renamed and the new name of another stays refused**, as `{ a: 'b', b: 'c' }`. It is written
  `{ a: 'c', b: 'c' }`.

## What it rests on

- That Cluster draws an entity's shard from its id alone: **read in the source** of `Sharding.ts` at 4.1.2, whose
  `getShardId` hashes the entity id and takes the group. **Tested** by `a rename stops the runners of the old name,
  and its door delivers what Cluster saved under it` in [`src/cluster.test.ts`](../../../src/cluster.test.ts), whose
  message under the old name is stepped under the new one's lease.
- That a door registered after Cluster read a shard's messages gets them: **read in the source** of `Sharding.ts`,
  whose `registerEntity` opens the latch of the storage's reading once the type is registered, and whose reading
  resets a message of a type not registered yet, until `entityRegistrationTimeout`. A request of a type registered
  too late is failed by Cluster, and reset before the failure is given
  ([decision 0168](0168-on-cluster-a-failure-cluster-saved-is-reset-before-it-is-given.md)).
- That `registerEntity` registers a type once per runner: **read in the source**, where a type already registered
  returns at once.
- That a step and a launch that renames come one after the other: **documented**, as decision 0159 says of
  `BEGIN IMMEDIATE` on SQLite. On PostgreSQL the step reads the row `FOR SHARE`, and the rename's lock of the table
  waits for it. The runtime on Cluster does not run on PostgreSQL
  ([decision 0084](0084-a-step-commits-only-where-the-commit-checks-the-shard.md)).
- That each of the four rules is kept: **tested** by the same test. Without the old name's door the message saved
  under the old name is never delivered. Without the mark the runner of the old code keeps its shards. Without the
  check of the mark the runner of the old code steps the message under the old name. Without the sender named anew,
  an operation's retry under the old name is applied twice. The test fails in each case.
- That the mark is written in the rename's transaction, though the old name holds nothing, and that the newest
  version moves: **tested** by `on Cluster, a rename marks the old name though it holds nothing, and its newest
  version moves` and `on Cluster, a rename from a version newer than the new name runs dies, and moves nothing` in
  [`src/storage.test.ts`](../../../src/storage.test.ts), on SQLite and on PGlite.
- That two names renamed to one move where one holds entities, and die where both do: **tested** by `two names
  renamed to one move where one of them holds entities, and die where both do` in
  [`src/storage.test.ts`](../../../src/storage.test.ts).

## Alternatives

- **The structures of Effect.** Each module of the pinned version that could move or drain Cluster's rows was
  weighed.
  - `Entity.make` under the old name and `Sharding.registerEntity` are used: they make the old name's door.
  - `Sharding.getShardId` is used, and shows that an id's shard does not depend on the entity type.
  - `MessageStorage.unprocessedMessages` reads a shard's messages and claims them. A rename that waits on it would
    need every shard, and would never end while a client of the old code sends.
  - `MessageStorage.clearAddress` and `MessageStorage.resetAddress` delete or reset an address's rows, and move
    none.
  - `MessageStorage.requestIdForPrimaryKey` under the old address reads a request's id, which no code of the new
    name needs.
  - `Sharding.getRegistrationEvents` tells of the types registered, and not of a rename.
  - `sql/Migrator` was weighed by decision 0156, and does not fit a rename for the same reasons.
  - No module of Cluster renames an entity type.
- **A launch on Cluster that dies where it renames.** A guard of a few lines, which keeps every application on
  Cluster from renaming a program.
- **A rename that writes Cluster's tables.** It must write the entity type into `message_id`, and digest it where
  Cluster does. Both are Cluster's own, and no release promises them.
- **A rename that waits until the old name's requests are delivered.** A client of the old code keeps sending, so
  the wait has no end, and it blocks the launch.
- **A table of its own for the mark.** A step reads the program's row of `versions` already, `FOR SHARE` on
  PostgreSQL. A column of that row is read in the same statement, and is locked with it.

## Consequences

- [`src/storage.ts`](../../../src/storage.ts) adds the column `renamed_to` to `versions`, and gives a database made before
  the column. `renamed` takes `marked`, and marks each old name. `standingOf` reads a program's row of `versions`.
  `recordVersions` refuses a renamed name, and `outranked` counts one as older.
- [`src/cluster.ts`](../../../src/cluster.ts) registers a door under each former name, and `atNewest` dies for a renamed
  name. `register` of `OnCluster` takes `formerly`.
- [`src/runtime.ts`](../../../src/runtime.ts) marks the renames on Cluster, names a request's sender and a `Resumed`'s
  receiver by their new names, and no longer refuses two names renamed to one.
- A rename adds an entity type to Cluster for as long as the launch declares it.
- A name a launch on Cluster renamed is never run again under that name, by any runner, while the mark stays.
- [`docs/design.md`](../../design.md) says how a program is renamed on Cluster. The open question of a rename on
  Cluster leaves [`docs/open-questions.md`](../../open-questions.md), and the step leaves the roadmap.
