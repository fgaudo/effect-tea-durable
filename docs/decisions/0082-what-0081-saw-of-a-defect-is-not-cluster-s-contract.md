# 0082. What 0081 saw of a defect is not Cluster's contract

**Status:** accepted, 2026-10-31. Corrects the reasons [decision 0081](0081-on-cluster-a-step-commits-with-its-reply.md)
gives against letting a defect reach Cluster; its decision stands. What it says it did not know of the stall is
corrected by [decision 0083](0083-effect-moves-to-4-1-1.md).

## Context

Decision 0081 rests on what its spike saw of `effect` 4.1.0, and Cluster is `@stability unstable`
([decision 0019](0019-unstable-effect-modules.md)): what it does today may change in a minor release, and may
differ from what it means to do. What the spike saw is of three kinds:

- **Written in Cluster's documentation**: under `ClusterSchema.WithTransaction`, a success reply is saved in the
  handler's transaction, a failure after its rollback, and a commit that fails is retried without a reply; handlers
  must tolerate retries. This is what decision 0081 decides on.
- **Set by an option**: a defect restarts the entity after `defectRetryPolicy`, a parameter of `Entity.toLayer`,
  whose default retries without end, backing off from 500 ms to every 10 s. Handlers run one at a time by default,
  so the entity's later messages wait behind the one that dies.
- **Seen only, and likely a bug**: once the caller of a message that dies is interrupted, messages to the runner's
  other entities wait too. Decision 0081 counts it, and the endless retry, among Cluster's properties.

Read in Cluster's source, the stall has a likely cause. The runner's read of storage delivers the messages of all its
shards one after the other, and waits for each. The interrupted caller stores an `Interrupt` for its request, and
delivering it waits for the entity's handlers with nothing else to end the wait, where a request waits for them or
for the entity's retirement. An entity restarting from a defect has no handlers between its retries, and replays the
message that dies as soon as it has them: the read waits on one entity, and every message behind it on the runner
waits with it. The spike fits: a defect with no interrupt does not stall, nor an interrupt of a request only slow.
Nothing instrumented confirms it, nor whether the wait ends.

## Decision

- **Decision 0081 stands on Cluster's documented contract and on [decision 0006](0006-a-defect-suspends-the-entity.md)**:
  a defect of the program suspends its entity, stored, so the runtime catches it whatever Cluster would do with it.
- **The endless retry is Cluster's default, not Cluster**: a `defectRetryPolicy` that gives up would end it, and the
  runtime still keeps defects from Cluster.
- **The stall is what `effect` 4.1.0 does, and not a reason the design relies on.** A defect of the runtime itself,
  past the program's, would still reach Cluster, so the runtime on Cluster does not count on Cluster's handling of
  defects either way.

## Alternatives

- **Leaving decision 0081's reasons as they are.** A later reader would take a likely bug of one version for a
  property of Cluster, and a fix of it for a change of the contract.
- **Settling the cause by instrumentation first.** The decision does not depend on it, and what it would settle is
  Cluster's to fix.

## Consequences

- The study of Cluster ([`docs/cluster.md`](../cluster.md)) says which of what the spike saw is documented, which is
  an option, and which is seen only.
- When the runtime runs on Cluster, what it relies on of Cluster — the documented contract of `WithTransaction` —
  becomes tests of this repository, run against the pinned `effect` at every move of its version.
