# 0007. One process with SQL first, Effect Cluster later

**Status:** accepted, 2026-10-30. Its one process is made a rule the runtime keeps by
[decision 0080](0080-a-database-is-held-by-one-runtime.md), and its consequence for Cluster is changed by
[decision 0081](../0081-on-cluster-a-step-commits-with-its-reply.md).

## Context

Effect Cluster already gives entities addressed by id, sharding across nodes, a stored mailbox, replies,
deduplicated requests, messages delivered at a time (`DeliverAt`) and passivation. It does not store an
entity's state, and its message storage commits apart from anything the library would write. A crash between
the two commits applies a message twice or loses a state.

## Decision

The first runtime runs on one process, on `SqlClient` (SQLite first). The mailbox, the states, the
incarnations, the timers and the replies sit in one database, and each step is one transaction. Cluster comes
once this runtime survives a crash at every point of the design's table.

## Alternatives

- **Cluster from the start.** Atomicity across its storage and the library's, rolling deploys and shard moves
  would all be problems before the core works.
- **Effect Workflow.** It replays an imperative body and records its activities. Its signals are named, one-shot
  wait points with no mailbox, and its history has no snapshot: a fit for a process that ends, not for an entity
  that receives messages without end.

## Consequences

- The core is tested without a network, and every crash is easy to provoke.
- On Cluster, the state should record the last message it handled, so that a message delivered again after a
  crash between the two commits is recognised and answered from the stored reply.
- Effect's cluster modules are unstable today. Whether the library may depend on them is decided when it gets
  there.
