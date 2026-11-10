# 0223. On a disk that is really full an operator frees room first, and the runtime keeps none of its own

**Status:** accepted, 2026-11-09, with the step PostgreSQL on a server with a pool of the roadmap. Decides the open
question of a disk that is really full, which
[decision 0152](archive/0152-the-consumers-of-a-topic-are-declared-at-deploy.md) left, and says how that note's
forget and prune hold in WAL mode. Changed by
[decision 0245](0245-a-reply-is-kept-as-long-as-send-says-and-the-runtime-sweeps.md): a prune deletes in batches, which
fail on the full volume as one prune did, so the procedure stands.

## Context

Decision 0152 says that a database that is full fails the commit of every step, and that a forget and a prune free
the room steps need. The spike [`spikes/full-database.test.ts`](../../spikes/full-database.test.ts) sees it under
`PRAGMA max_page_count`, with the rollback journal, which caps the database file and not its journal. On a disk that
is really full a delete needs room too, and in WAL mode, the client's default, the pages of every write go to the
WAL before the database.

The spike [`spikes/full-volume.test.ts`](../../spikes/full-volume.test.ts) fills a volume of ext4 of 32 MB that the CI
mounts on Linux, in WAL mode, under a consumer that stalled. It saw this at Effect 4.1.2 and Bun 1.4.2:

- 1289 steps committed, and the next failed with `database or disk is full`. The database held 20 MB and the WAL
  4 MB, and the volume had no room left.
- On the full volume a reading, `consumers`, a consumer's reading and its acks, and a prune with nothing to drop all
  answered. Every step failed.
- A second process launched on the full volume, and its forget of the stalled consumer committed. Its prune of the
  1292 rows that consumer held failed with `database or disk is full`.
- Once 1 MB of the volume was freed, the prune dropped the 1292 rows, and the next 50 steps committed. The database
  grew by 0.7 MB, and the volume kept 132 KB free.

A small write still finds room in the WAL, which keeps its size once checkpointed. A prune of many rows writes a page
of the WAL for each page it changes, and needs more than the WAL holds.

## Decision

- **On a disk that is really full, an operator frees room on the volume before the forget and the prune.** Room of
  about a twentieth of what the stalled consumer holds is enough, as the spike sees: it deleted 20 MB with 1 MB freed.
  The operator finds the consumer in `consumers`, frees room or grows the volume, deploys without the consumer,
  forgets it and prunes. The forget alone commits on a full volume, and the prune does not.
- **The runtime keeps no room of its own.** It does not hold the volume: a client of SQLite is the launcher's, and it
  names a file the runtime knows nothing else of. A file of reserved room is a practice of the operator's, kept where
  the operator keeps the database, and dropped on the day the volume fills.
- **A database of PostgreSQL that fills its disk is the server's operator's.** The spike runs SQLite alone. PostgreSQL
  stops taking writes on its own terms, and what frees room there is the server's, not the runtime's.

## What it rests on

- That a step on a full volume dies and the readings and acks still answer: **seen** in
  `spikes/full-volume.test.ts`, in the CI's job `postgres`.
- That in WAL mode a forget commits on a full volume, and a prune of many rows does not: **seen** in the same spike.
- That a prune commits once some room is freed, and the steps commit after it: **seen** in the same spike.
- That the room a prune needs grows with what it deletes: **only reasoned**, from the pages of the WAL each change
  writes. The spike tried one size, and an operator who frees too little sees the prune fail again.

## Alternatives

- **A file of reserved room the runtime makes and drops.** The runtime would need a path on the volume, which a
  client of SQLite does not give, and nothing on PostgreSQL. It would also pick a size the database outgrows.
- **A prune in batches, each in a transaction of its own**, which a WAL checkpointed between two batches might hold
  without room freed. It is not seen, and it changes what `prune` counts and keeps in one transaction. The step of
  the runtime's housekeeping in the [roadmap](../roadmap.md), which decides whether the runtime prunes by itself, weighs
  it.
- **The rollback journal in place of WAL.** A prune would need room for its journal all the same, and every reader
  would wait for the writer.

## Consequences

- The design says, under Declared consumers, what an operator does on a disk that is really full.
- The CI fills the volume on every push, so that a release of Effect or of Bun that changes what a full volume does
  fails the spike.
