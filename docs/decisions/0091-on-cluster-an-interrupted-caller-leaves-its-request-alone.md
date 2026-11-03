# 0091. On Cluster, an interrupted caller leaves its request alone

**Status:** accepted, 2026-10-31. Corrects [decision 0081](0081-on-cluster-a-step-commits-with-its-reply.md): a caller
interrupted while it waits has Cluster store an answer no step gave. Found by the review of
[decision 0090](0090-on-cluster-a-reply-is-deleted-as-on-one-process.md). That every answer Cluster stores for an
entity is a step's does not hold of a type its runner did not register
([`cluster.md`](../cluster.md#the-decisions-it-bears-on)).

## Context

On Cluster, everything a step answers is a success of the RPC, and its failure schema is empty (decision 0081). But
Cluster stores an answer of its own when a caller stops waiting. A fiber interrupted while it waits for a persisted
RPC has Cluster's client store an `Interrupt` envelope under the request's id and send it to the runner that holds the
entity. The client skips it only at shutdown, during Cluster's own teardown of the calling entity, its shard or its
type, where the fiber carries the caller's address, and for an RPC annotated `ClusterSchema.Uninterruptible` for the
client. The receiver interrupts the request if it was delivered and not answered yet, queued behind the entity's
other messages or running, and saves the interruption as its reply, unless Cluster itself is shutting down,
terminating the entity or abandoning the shard, which leave the request to be delivered again.

The runtime stops the fiber of an operation when its entity suspends or is unloaded, by its passivation or its
capacity, and a caller of the runtime may stop waiting at a timeout: none of them is a teardown of Cluster's.

A spike checked this against `effect` 4.1.1, with `SingleRunner` on `@effect/sql-sqlite-bun`, an entity with a
persisted RPC whose handler sleeps, and a persisted RPC under `WithTransaction`, keyed by its payload, queued behind
it; the caller of the second was interrupted while its request waited:

- without the annotation, the request's reply is a failure whose cause is an interruption, and an `Interrupt` row
  sits in `cluster_messages` under its id; the same key sent again is answered with the interruption, and the
  handler never runs;
- with `ClusterSchema.Uninterruptible` set to `"client"`, no `Interrupt` is stored, the handler runs once when the
  request's turn comes, and the same key sent again is answered with its success.

A caller interrupted while the step runs was not tried: Cluster's source interrupts the handler, its transaction
rolls back, and the interruption is saved after, the same answer.

## Decision

- **Both RPCs of a program on Cluster, for a creation and for messages, are annotated
  `ClusterSchema.Uninterruptible` with `"client"`.** A caller that stops waiting — an operation's fiber stopped, a
  caller's timeout — stops only its wait: the request is handled when its turn comes, its answer is stored as any
  other, and a retry under the same key gets it.
- **Every answer Cluster stores for an entity is a step's.** What decision 0081 says of the RPC's failure schema holds
  of what Cluster stores too.

## Alternatives

- **`true`, for the server too.** The handler would ignore an interruption and run again; but every interruption
  Cluster sends itself already leaves the request to be delivered again, and the caller's is the one the client
  annotation stops. It adds nothing the runtime needs.
- **Leaving the default, and resetting an interruption as a `Suspended` is reset**
  ([decision 0085](0085-on-cluster-a-request-is-keyed-and-answered-as-on-one-process.md)). Only a caller that sends again resets
  it; one whose work ended never does, and the answer stays for ever, deleted by nothing, since no step answered it
  ([decision 0090](0090-on-cluster-a-reply-is-deleted-as-on-one-process.md)). And the client would read a failure the
  RPC's schema says cannot happen.
- **The runtime never stopping its operations' fibers.** A suspension and an unload stop them, and a caller's
  timeout is the caller's to choose.

## Consequences

- An at-least-once operation stopped by an unload sends its request again once it is restarted, and gets the answer
  the request was given meanwhile, from Cluster's stored reply.
- The stall Cluster's bug caused at 4.1.1 once the caller of a message that dies was interrupted
  ([Effect-TS/effect#10238](https://github.com/Effect-TS/effect/issues/10238), fixed in 4.1.2:
  [`cluster.md`](../cluster.md#one-transaction-or-two)) needs that caller's `Interrupt`, which the runtime's RPCs no
  longer send. The runtime still does not rely on it either way (decision 0082, deleted; git keeps it); no spike
  checked it.
- When the runtime runs on Cluster, the spike becomes a test of this repository, as [`AGENTS.md`](../../AGENTS.md)
  asks of a premise about a dependency.
- Nothing of this is code yet: the runtime on Cluster is a later step of the [roadmap](../roadmap.md).
