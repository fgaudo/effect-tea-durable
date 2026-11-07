# 0170. On Cluster, an operation's client keeps the request's id before it resets a failure Cluster saved

**Status:** proposed, 2026-11-07, for the step Effect Cluster of the roadmap. Says how
[decision 0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md) is code for the keep of a
request's Cluster id by the client given Cluster's failure. Adds to it what a keep that fails does, and that a client
which finds the work ended waits until it is interrupted.

## Context

Cluster saves a failure of its own as a request's reply when no runner registers the request's entity type in time.
The client given that failure resets the request before it gives the failure, so that a retry is delivered again
([decision 0168](0168-on-cluster-a-failure-cluster-saved-is-reset-before-it-is-given.md)).

An operation's request ids are kept under its work by the step that answers each request, and the step that ends
the work deletes Cluster's rows under them
([decision 0169](0169-on-cluster-an-operations-request-ids-are-kept-under-its-work-and-deleted-with-it.md)). A
request Cluster failed and reset has been answered by no step, so no step has kept its id. An operation that stops
waiting for it, by a timeout of its own, completes, and its work ends with the request still in Cluster's tables.
Cluster then delivers the request once a runner registers its type, and the receiver applies it after the work that
sent it ended.

Decision 0092 has the client keep the request's id under the asker's work before the reset, in a transaction of its
own, and keep it pending if the work has ended, neither resetting nor sending.

## Decision

- **An operation's client that finds a failure Cluster saved keeps the request's id before it resets the request.**
  It reads the id by the request's primary key and the latest reply by that id, as for the reset alone
  (decision 0168). Then it keeps the id as the step that answers a request keeps it (decision 0169), in a
  transaction of its own, and resets the request only where the asker's work still holds. This holds for a creation
  and a message of an operation. A caller's request keeps no id, since its rows stay in Cluster's tables
  ([decision 0090](0090-on-cluster-a-reply-is-deleted-as-on-one-process.md)).
- **The transaction checks no lease.** It writes an id and no state, and the step that ends the work reads the id on
  whichever runner holds the shard then (decision 0092).
- **A keep that fails resets nothing, and gives the request's own failure.** The operation sends again after `retry`,
  and the next failure keeps and resets again. A reset without the keep before it would leave a request no step
  deletes.
- **The keep and the reset are not interrupted halfway.** An operation that stops waiting between the two would
  leave a reset request whose id no row keeps.
- **A client that finds the asker's work ended keeps the id pending, and waits until it is interrupted.** It neither
  resets the request nor gives the failure: the operation would send again after `retry`, and once a step deleted
  the pending id's rows, Cluster would take the retry as a new request and apply it. Nothing waits for the answer,
  since the work has ended.
- **The step that answers the request once it is reset keeps the same id**, which writes nothing (decision 0169).

## What it rests on

- The step that ends the work deletes the rows of a request Cluster failed and reset, before a runner that registers
  the type delivers it: **tested** by `an operation's request Cluster failed is kept under its work, and goes with it
  before it is delivered`, once `by create` and once `by send`, in [`src/cluster.test.ts`](../../src/cluster.test.ts).
  Each fails without its keep: the request's row is still in `cluster_messages` once the work has ended. The test is
  in `src/cluster.test.ts` and not in `src/runtime.test.ts`, since only Cluster saves such a failure.
- That no delivery Cluster read before the step that ends the work saves its failure after that step: **only
  reasoned**, and not promised. `saveReply` of `SqlMessageStorage` at 4.1.2 inserts the reply without checking that
  the request's row is still there: **read in the source**. Once the registration window has passed, Cluster fails a
  delivery as soon as it reads it, so the time between the read and the save is short, and the test above does not
  reach it. A delivery that falls in it leaves one row in `cluster_replies` under an id no table keeps, for ever. The
  row loses nothing and is never delivered, since its request is gone; the question is in
  [open questions](../open-questions.md#storage-and-reading).
- That the keep gives whether the work holds, kept and pending: **tested** by `on Cluster, an id kept under work goes
  with it, and a pending one with the next step, to its last digit` in [`src/storage.test.ts`](../../src/storage.test.ts).
- That a client finds the asker's work ended only on a runner that no longer holds the asker's shard: **only
  reasoned**. An operation leaves only through its completion, so its fiber is done before its work ends (decision
  0090). A runner interrupts its entities' fibers before it lets their shard go, in the finalizer of the shard's
  singleton ([decision 0162](0162-on-cluster-an-entitys-shard-is-its-partition-and-each-deployment-serves-its-shards.md)).
  So no test reaches the wait, and the wait guards a runner whose finalizer did not run before another one gained the
  shard.
- That an interruption ends an effect that waits for ever: **documented**, in the JSDoc of `Effect.never` at 4.1.2,
  `@stability stable`, whose example ends it by `Effect.timeoutOption`.
- That `Effect.uninterruptible` keeps the keep and the reset whole: **documented** in its JSDoc, `@stability stable`.
  That `Effect.onError` cannot wait for an interruption: **documented** in its JSDoc, which says its handler is not
  interrupted.
- That a handler of `Effect.catchCause` can be interrupted: **read in the source**, since its JSDoc says nothing of
  interruption. At 4.1.2 `catchCause` is the primitive `OnFailure` of `internal/effect.ts`, whose handler runs as a
  continuation of the fiber, with the fiber's interruptibility, and is wrapped in no region that cannot be
  interrupted. Were it not, the wait above would last for ever, on a runner no test reaches, and lose no row.

## Alternatives

Effect's modules weighed, in `node_modules/effect/src` at 4.1.2:
- **`Effect.onError`, as the reset alone used.** Its handler runs where the effect cannot be interrupted, so a client
  that waits in it would never be interrupted. `Effect.catchCause` with the keep and the reset under
  `Effect.uninterruptible` keeps them whole and leaves the wait interruptible.
- **`Effect.interrupt` where the work ended.** The operation's fiber would end interrupted, which the runtime reads as
  a suspension or an unload and not as the end of its work.
- **`Effect.die` where the work ended.** The operation takes a defect as a receiver's crash, and sends again after
  `retry` ([decision 0167](0167-on-cluster-an-operation-sends-through-the-doors-client-and-is-woken-by-resumed.md)),
  which is the retry the wait keeps from happening.
- **`MessageStorage.requestIdForPrimaryKey` and `repliesForUnfiltered`**, read as decision 0092 says, and not a
  `SELECT` of the runtime's own, which loses digits of an id.
- **`SqlClient.withTransaction`** for the keep's transaction, as every step's transaction is made.

Other ways:
- **The keep in the step that answers alone, as before this note.** A request answered by no step before its work
  ends is delivered after it.
- **The keep without the reset, the operation waiting for Cluster to deliver the request again.** Cluster delivers a
  request with a reply saved never again, so the operation would be given the failure for ever.

## Consequences

- An operation that times out a request to a program no runner deploys yet leaves nothing in Cluster's tables once
  its work ends, and the receiver never sees the request. The one exception is a delivery Cluster read before the
  step that ends the work and failed after it, which leaves one reply in `cluster_replies` with no request.
- A caller's request Cluster failed is still reset without a keep, and its rows stay in Cluster's tables, as every
  caller's do until their deletion past their time (decision 0165).
