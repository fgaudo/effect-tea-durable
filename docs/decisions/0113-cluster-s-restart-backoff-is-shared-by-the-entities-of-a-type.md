# 0113. Cluster's restart backoff is shared by the entities of a type

**Status:** accepted, 2026-11-01. Adds to [decision 0095](0095-cluster-restarts-an-entity-after-a-defect-whatever-its-policy.md)
what a run shows of Cluster's restarts after a defect: what 0095 read in the source is seen, and the backoff is one
for the entity type, which never resets. Reported to Effect as
[Effect-TS/effect#10252](https://github.com/Effect-TS/effect/issues/10252).

## Context

[Decision 0095](0095-cluster-restarts-an-entity-after-a-defect-whatever-its-policy.md) read in Cluster's source at
4.1.1 that the `defectRetryPolicy` of an entity is concatenated with an endless default, and that the restart ignores
the end of the schedule. It noted that the schedule's driver is made once per entity type, and no run had shown
either.

## Decision

- **0095's reading holds on a run**, and on Effect's `main` of 2026-11-01, whose code is the same. With
  `defectRetryPolicy: Schedule.recurs(1)`, a message whose handler always dies was handled six times in six seconds,
  at the default's growing delays.
- **The backoff is one for the entity type, and never resets.** Every restart of any entity of the type steps the same
  schedule, and an entity's recovery does not reset it. An entity that dies once after another of its type died five
  times waits about 3,800 ms, the default's sixth delay, where alone it waits about 500 ms. A policy of the program's
  is spent once for the type, not for each entity.
- **The end of the policy being ignored looks intended.** The concatenation dates from the option's first commit, in
  Effect 3, with `disableFatalDefects`, which is the way an entity stops being restarted: the defect becomes a reply,
  saved. The shared backoff looks like a bug, and is the issue's subject; the other is noted in it as a question for
  the option's documentation.
- 0095's decision, and [decision 0082](0082-what-0081-saw-of-a-defect-is-not-cluster-s-contract.md)'s, stand: the
  runtime keeps the program's defects from Cluster, and does not count on what Cluster does with one.

## What it rests on

- The policy concatenated with an endless default, and its end ignored: **seen**, by a run not kept, at 4.1.1; the
  code of `main` **read in the source**, `cluster/internal/entityManager.ts`.
- The backoff shared and never reset: **seen**, by a run not kept, at 4.1.1, and its control with the first entity
  never dying; the run is the issue's reproduction.
- The concatenation intended, with `disableFatalDefects` as the way out: **reasoned**, from Effect's history, the commit
  that added both options (Effect-TS/effect, `dca92fd8c`, June 2025). Neither option is documented.

## Consequences

- [`docs/cluster.md`](../cluster.md) says that the backoff is shared by the entities of a type.
- An answer to the issue that changes Cluster is read against 0095 and this note when the runtime moves to Cluster.
