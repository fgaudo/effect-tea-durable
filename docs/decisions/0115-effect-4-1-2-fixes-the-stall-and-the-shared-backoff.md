# 0115. Effect 4.1.2 fixes the stall and the shared backoff

**Status:** accepted, 2026-11-02. Says what came of the two reports of
[decision 0083](0083-effect-moves-to-4-1-1.md) and [decision 0113](0113-cluster-s-restart-backoff-is-shared-by-the-entities-of-a-type.md):
both are fixed in `effect` 4.1.2, and what [decision 0095](0095-cluster-restarts-an-entity-after-a-defect-whatever-its-policy.md)
read of `defectRetryPolicy` is documented there. The project stays at 4.1.1, and moves to 4.1.2 by
[decision 0116](0116-effect-moves-to-4-1-2.md).

## Context

Two behaviours of Cluster at 4.1.1 were reported to Effect:

- the stall, [Effect-TS/effect#10238](https://github.com/Effect-TS/effect/issues/10238): once the caller of a message
  that dies is interrupted, messages to the runner's other entities are never delivered
  ([decision 0083](0083-effect-moves-to-4-1-1.md));
- the shared backoff, [Effect-TS/effect#10252](https://github.com/Effect-TS/effect/issues/10252): the restart backoff
  after a defect is one for the entity type, and never resets
  ([decision 0113](0113-cluster-s-restart-backoff-is-shared-by-the-entities-of-a-type.md)).

Both were closed on 2026-11-01, and `effect` 4.1.2 came out on 2026-11-02.

## Decision

- **The stall is fixed in 4.1.2**, by [Effect-TS/effect#10249](https://github.com/Effect-TS/effect/pull/10249). An
  `Interrupt` that arrives while the entity has no handlers is kept on the request, instead of waiting for them. The
  next handlers are given the `Interrupt` in place of the request. An interruptible request is then answered
  interrupted, and its entity recovers. An uninterruptible one keeps its entity restarting, but the runner's read of
  storage goes on.
- **The shared backoff is fixed in 4.1.2**, by [Effect-TS/effect#10261](https://github.com/Effect-TS/effect/pull/10261).
  The backoff belongs to one activation of one entity, and resets once the entity completes a request.
- **The endless restart is intended, and documented in 4.1.2.** The JSDoc of `defectRetryPolicy` on `Entity.toLayer`
  says that the default goes on once the policy ends, so restarts never stop, and points to `disableFatalDefects`.
  This is what 0095 read in the source and 0113 reasoned from Effect's history.
- **The design does not change.** The runtime keeps the program's defects from Cluster, and relied on neither
  behaviour ([decision 0082](0082-what-0081-saw-of-a-defect-is-not-cluster-s-contract.md),
  [decision 0095](0095-cluster-restarts-an-entity-after-a-defect-whatever-its-policy.md)).
- **The project stays pinned at 4.1.1.** Moving to 4.1.2 is the roadmap's step for a release past 4.1.1, which
  compares the JSDoc 0107 reads. What 0083 and 0113 say of 4.1.1 still holds of the version pinned.

## What it rests on

- Both fixes in 4.1.2: **read in the source**. Each issue's timeline on GitHub names the merged pull request that
  closed it. The tag `effect@4.1.2` is ahead of both merge commits (`46f48afc8` and `b707ad1bc`), and the package
  published on npm has both changes in `cluster/internal/entityManager.ts`: the request's `interrupted` flag, and the
  restart step made once per activation.
- What each fix does when it runs: **read in the source**, and in each pull request's description, which names a
  regression test in Effect's `packages/effect/test/cluster/Sharding.test.ts`. No spike of this repository runs it,
  since none ran the bugs: 0083's repro and 0113's run were not kept. Nothing the runtime decides rests on it.
- The endless restart documented: **documented**, in the JSDoc of `Entity.toLayer` at 4.1.2.

## Consequences

- [`docs/cluster.md`](../cluster.md) says that both are fixed in 4.1.2.
- Once the project moves to 4.1.2, what 0107 says of `defectRetryPolicy`, that it has no documentation, no longer
  holds, and 0095's premise is **documented**.
