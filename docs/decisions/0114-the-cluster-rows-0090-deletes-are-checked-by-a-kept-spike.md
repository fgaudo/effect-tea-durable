# 0114. The Cluster rows 0090 deletes are checked by a spike the repository keeps

**Status:** accepted, 2026-11-02. Changes what [decision 0090](0090-on-cluster-a-reply-is-deleted-as-on-one-process.md)
rests on of Cluster's rows: what its spike saw, and the repository did not keep, is tested by a spike in `spikes/`, as
[decision 0097](0097-a-dependency-is-checked-by-a-spike-the-repository-keeps.md) has it.

## Context

Decision 0090 deletes rows of Cluster's tables with the runtime's own statements, by `request_id`. Those tables are
not Cluster's contract, and 0090 says its spike is what checks them at the version the project pins. That spike was
run and not kept: the repository has none of it. By decision 0097, a premise seen in a spike the repository does not
keep is read as reasoned, so nothing would check 0090's statements when the project moves to another release.

## Decision

- **0090's premises on Cluster's rows are tested by
  [`spikes/cluster-forgets-a-request-deleted-by-its-id.test.ts`](../../spikes/cluster-forgets-a-request-deleted-by-its-id.test.ts)**,
  at `effect` 4.1.1, on `SingleRunner` over a SQLite file. A release that changes those tables, or what Cluster does
  with their rows, fails it, and 0090 is read again.
- **The spike asserts what 0090 saw**:
  - Cluster's tables have the columns the statements name, and no foreign key;
  - a processed request keeps its rows in both tables, and the same primary key sent again is answered from them,
    with no row of its own;
  - a handler under `WithTransaction` deletes in Cluster's transaction, so a failure rolls the deletion back;
  - deleting a request's rows by `request_id` from both tables, in another request's handler, leaves none of them
    and only them, and the same primary key sent again is a new request, which the handler runs;
  - a handler that deletes the rows of its own request leaves its reply in `cluster_replies`, with no request.
- **0090's decision stands.** The spike saw what 0090 says, and nothing more.

## What it rests on

- The columns and the absence of a foreign key: **tested**, by the spike.
- A processed request keeps its rows: **tested**, by the spike.
- A duplicate primary key answered from the stored reply, with no new row: **tested**, by the spike, and **read in the
  source**, `cluster/Runners.ts`, where a `Duplicate` from `saveRequest` with a `WithExit` is the reply.
- A persisted request's reply reaches its client only once Cluster's transaction has committed, so the spike reads
  what was written as soon as the call returns: **documented**, in the JSDoc of `ClusterSchema.WithTransaction`, and
  **read in the source**, `cluster/internal/entityManager.ts`.
- A handler's statements are in Cluster's transaction: **tested**, by the spike, through a handler that fails.
- The deletion by `request_id` takes only that request's rows, and makes its primary key new: **tested**, by the spike.
- A handler's own reply left behind: **tested**, by the spike. That Cluster saves it once the handler returns, the
  update of its request finding no row, is **read in the source**, `saveReply` of `cluster/SqlMessageStorage.ts`.
- That `clearReplies` delivers a request again, which 0090 gives against an alternative and not for its decision,
  stays **reasoned**: the spike does not run it.

## Alternatives

- **Leaving 0090 on a spike not kept.** Its weakest premise, a write to tables that are not Cluster's contract, would
  have no check at the next release.
- **Waiting for an operation of Cluster's** ([Effect-TS/effect#10239](https://github.com/Effect-TS/effect/issues/10239)).
  None exists at the version pinned, and the runtime would still rest on these rows until one does.

## Consequences

- Decision 0090's status line says that this note tests its premises on Cluster's rows.
- When the runtime moves to PostgreSQL or MySQL
  ([decision 0084](0084-a-step-commits-only-where-the-commit-checks-the-shard.md)), the spike does not cover it: it runs on SQLite, where
  transactions come one after the other.
