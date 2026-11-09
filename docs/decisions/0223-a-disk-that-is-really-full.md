# 0223. What an operator does on a disk that is really full

**Status:** proposed, 2026-11-09, with the step PostgreSQL on a server with a pool of the roadmap. Decides the open
question of a disk that is really full, which
[decision 0152](archive/0152-the-consumers-of-a-topic-are-declared-at-deploy.md) left.

## Context

Decision 0152 says that a database that is full fails the commit of every step, and that a forget and a prune free
the room steps need. The spike [`spikes/full-database.test.ts`](../../spikes/full-database.test.ts) sees it under
`PRAGMA max_page_count`, with the rollback journal, which caps the database file and not its journal. On a disk that
is really full a delete needs room too, and in WAL mode, the client's default, the rows of every write go to the WAL
before the database.

The spike [`spikes/full-volume.test.ts`](../../spikes/full-volume.test.ts) fills a volume of 32 MB that the CI mounts
on Linux, in WAL mode, under a consumer that stalled. It then forgets the consumer and prunes on the full volume,
and again once 1 MB of the volume is freed.

## Decision

Not taken yet: the step waits for what the spike sees in the CI.

## What it rests on

- What a forget and a prune do on a volume that is really full, in WAL mode: to be **seen** in
  `spikes/full-volume.test.ts`.

## Alternatives

- **Room the runtime keeps of its own**, a file it drops once the disk is full, so that a prune always has the room
  it needs.

## Consequences

- The design says, under Declared consumers, what an operator does on a disk that is really full.
