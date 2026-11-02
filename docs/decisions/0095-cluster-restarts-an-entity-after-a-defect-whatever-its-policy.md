# 0095. Cluster restarts an entity after a defect, whatever its policy

**Status:** accepted, 2026-10-31. Corrects what [decision 0082](0082-what-0081-saw-of-a-defect-is-not-cluster-s-contract.md)
says of `defectRetryPolicy`; its decision stands. Found by the first review
([decision 0094](0094-the-notes-are-reviewed-every-fifteen-by-a-reader-that-did-not-write-them.md)). What it read is
seen on a run, and the backoff found shared by the entities of a type, which never resets, by
[decision 0113](0113-cluster-s-restart-backoff-is-shared-by-the-entities-of-a-type.md), reported as Effect-TS/effect#10252.
The endless restart is documented in `effect` 4.1.2, and the shared backoff fixed there, by
[decision 0115](0115-effect-4-1-2-fixes-the-stall-and-the-shared-backoff.md). Its premise on the policy is
**documented** since the project moved to 4.1.2, by [decision 0116](0116-effect-moves-to-4-1-2.md).

## Context

Decision 0082 says that the endless retry of a message an entity dies on is Cluster's default, not Cluster: a
`defectRetryPolicy` that gives up would end it. It is set by an option, and [`docs/cluster.md`](../cluster.md) says so.

Cluster's source at `effect` 4.1.1, `cluster/internal/entityManager.ts`, says otherwise:

- the policy given to `Entity.toLayer` is concatenated with Cluster's default, an exponential backoff from 500 ms
  capped at every 10 s, which never ends (`Schedule.concat(options.defectRetryPolicy, defaultRetryPolicy)`);
- the restart after a defect waits on one step of that schedule, ignores its end (`Effect.ignore(retryDriver(…))`),
  and rebuilds the entity's handlers all the same;
- a defect of a handler is no reply: with fatal defects, the default, the server answers it with a `Defect`, and the
  manager restarts the entity and replays its delivered requests. Only `disableFatalDefects` makes it an exit that is
  saved.

The schedule's driver is made once per entity type, so its backoff is shared by every entity of the type.

## Decision

- **On a runner of `effect` 4.1.1, an entity that dies in a handler is restarted and given its messages again
  without end, whatever its `defectRetryPolicy`.** The policy shapes the first waits only.
- Decision 0082's decision stands: the runtime keeps the program's defects from Cluster, and does not count on what
  Cluster does with one.

## What it rests on

- The policy is concatenated with an endless default, and its end is ignored: **read in the source**, at 4.1.1,
  `entityManager.ts`, where `defectRetryPolicy` is built and in `restart`. No spike ran a policy that gives up.
- A handler's defect is saved only under `disableFatalDefects`: **read in the source**, at 4.1.1, the `Defect` case
  of the server's responses.

## Alternatives

- **Leaving decision 0082's reason as it is.** A reader would count on a policy to end a stall it does not end.
- **A spike before the note.** What it would show is how long the retry lasts with a policy that gives up; the
  decision does not depend on it, and the runtime on Cluster will test what it relies on of Cluster (decision 0082).

## Consequences

- [`docs/cluster.md`](../cluster.md) says that the retry is without end whatever the policy.
- A defect of a receiver that escapes the runtime is never a reply Cluster saves, under fatal defects: it holds the
  entity's messages until a deploy fixes it.
