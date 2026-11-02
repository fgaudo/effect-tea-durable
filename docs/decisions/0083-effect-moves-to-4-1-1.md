# 0083. Effect moves to 4.1.1

**Status:** accepted, 2026-10-31. Moves the pinned version of [decision 0019](0019-unstable-effect-modules.md), and
corrects what [decision 0082](0082-what-0081-saw-of-a-defect-is-not-cluster-s-contract.md) said it did not know of
the stall. The stall, reported as Effect-TS/effect#10238, is fixed in `effect` 4.1.2, by
[decision 0115](0115-effect-4-1-2-fixes-the-stall-and-the-shared-backoff.md).

## Context

The project pinned `effect` and `@effect/sql-sqlite-bun` at 4.1.0; 4.1.1 came out on 2026-10-30. Its changes to
`effect/cluster` are few, and one is in the contract [decision 0081](0081-on-cluster-a-step-commits-with-its-reply.md)
rests on: in 4.1.0, a success reply whose save failed inside a `WithTransaction` handler's transaction was saved
again, up to four times, and a failed save may abort that transaction, so a retry could store the reply outside it.
In 4.1.1 it is saved once, and a failure replays the request. Nothing else that changed is read by
[`docs/cluster.md`](../cluster.md).

Before the stall was reported to Effect, the spike's repro was reduced to `TestRunner`, in memory, with no SQL, and
Cluster's compiled code was traced with logs, on 4.1.0:

- the runner's read of storage enters the delivery of the interrupted caller's `Interrupt` and never leaves it;
- the `Interrupt` waits for the entity's handlers, and never gets them: each rebuild replays the message that dies,
  and fails before it publishes the handlers, so nothing wakes the wait;
- the message to the other entity is never read.

On 4.1.1 the repro stalls the same: the other entity has no answer in 20 s, and has one in 4 ms when the caller is
not interrupted.

## Decision

- **`effect` and `@effect/sql-sqlite-bun` are pinned at 4.1.1.** The runtime's code does not change with them.
- **The stall is confirmed, not only read in the source, and it does not end on its own**: it lasts while the
  handler dies, without end under the default `defectRetryPolicy`. It is still what `effect` does, not a reason the
  design relies on, as decision 0082 decided.

## Alternatives

- **Staying at 4.1.0** until the runtime runs on Cluster. The study and the spike would describe a version with a
  known flaw in the contract decision 0081 rests on, and a report to Effect would be against an old version.

## Consequences

- The study of Cluster says it was read at 4.1.0, and what 4.1.1 changes of it.
- The stall is reported to Effect against 4.1.1, with the repro and the trace.
