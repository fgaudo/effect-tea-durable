# 0116. Effect moves to 4.1.2

**Status:** accepted, 2026-11-02. Moves the pinned version of [decision 0019](0019-unstable-effect-modules.md), after
[decision 0083](0083-effect-moves-to-4-1-1.md). Takes the roadmap's step for a release past 4.1.1, which
[decision 0108](0108-a-premise-about-a-dependency-is-looked-up-in-its-documentation-first.md) asked for: a script
compares the JSDoc the premises rest on. Makes **documented** what [decision 0107](0107-what-effect-documents-of-the-premises.md)
found undocumented of `defectRetryPolicy`.

## Context

`effect` 4.1.2 came out on 2026-11-02, with `@effect/sql-sqlite-bun` 4.1.2. It fixes the stall and the shared backoff
the project reported ([decision 0115](0115-effect-4-1-2-fixes-the-stall-and-the-shared-backoff.md)).

The roadmap asked that a move past 4.1.1 compare the JSDoc of the functions decision 0107 reads, in the old release and
the new. A spike tells when a behaviour changes; only the comparison tells when a promise is added or taken away.

## Decision

- **`effect` and `@effect/sql-sqlite-bun` are pinned at 4.1.2.** The runtime's code does not change with them.
- **A move of Effect's version runs [`scripts/compare-docs.ts`](../../scripts/compare-docs.ts)** with the old version
  and the new, and its note says what the comparison found. The script packs both releases from npm and compares the
  JSDoc of a list of declarations: those 0107 reads, `Effect.forkIn` and the forks of 0112, the annotations of Cluster
  the notes on Cluster rest on, and `entityRegistrationTimeout`. A note that rests on another declaration's
  documentation adds it to the list.
- **What the comparison found from 4.1.1 to 4.1.2**: 32 declarations keep their JSDoc, and two gain one, both on
  `Entity.toLayer`. `defectRetryPolicy` says that the default goes on once the policy ends, so restarts never stop.
  `disableFatalDefects` says that a defect then fails only its request. What 0095 read in the source is now
  **documented**, and 0107's "no documentation" no longer holds of either option.
- **What else changed of what the notes read**, in the source:
  - `@effect/sql-sqlite-bun`'s source is the same, and so are Effect's `internal/effect.ts` and `Scheduler.ts`, which
    [decision 0104](0104-the-runtimes-tests-choose-where-fibers-yield.md) reads;
  - `SqlClient`'s transactions trace their `BEGIN`, `COMMIT` and `ROLLBACK` in spans of their own, and nothing else
    of them changes;
  - a persisted send that a handler under `WithTransaction` discards wakes its runner after the commit
    ([Effect-TS/effect#10218](https://github.com/Effect-TS/effect/pull/10218)). [Decision 0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md)
    saw such a message delivered after the commit; it is still, without waiting for the next poll;
  - the workflow engine's reset of an activity compares the reply it read
    ([Effect-TS/effect#10226](https://github.com/Effect-TS/effect/pull/10226)), which [`docs/cluster.md`](../cluster.md)
    named as merged and in no release.

## What it rests on

- The JSDoc compared: **documented**, by the run of `bun scripts/compare-docs.ts 4.1.1 4.1.2` on 2026-11-02.
- The source unchanged or changed as above: **read in the source**, the two releases packed from npm and compared file
  by file, with each pull request of Cluster in the range read.
- The runtime's behaviour unchanged: **tested**, `bun run typecheck` and `bun test` on 4.1.2, the spikes included.

## Alternatives

- **Staying at 4.1.1** until the runtime runs on Cluster. Reports to Effect would be against an old release, and the
  premise of 0095 would stay read in the source where the new release documents it.

## Consequences

- The roadmap's step for a release past 4.1.1 is done, and leaves it.
- The spikes, and the comment of `src/testing.ts` on Effect's scheduler, say they run at 4.1.2.
- [`docs/cluster.md`](../cluster.md) says what 4.1.2 changes of it.
