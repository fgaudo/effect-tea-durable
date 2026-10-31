# 0090. On Cluster, a reply is deleted as on one process, and Cluster's rows with it

**Status:** proposed, 2026-10-31. Proposes the [roadmap](../roadmap.md)'s finding on requests and replies from
[Effect Cluster](../cluster.md#the-decisions-it-bears-on): what deletes a reply there. Corrects what
[decision 0021](0021-a-reply-is-kept-while-the-work-that-asked-holds.md) says of Cluster in its consequences.

## Context

A reply to an entity is kept while the work that asked holds (decision 0021). On one process it is deleted in two
places: a step whose work ended deletes the replies to the requests it sent, and a reply stored for work that
already ended goes as it is stored, since only the storage sees the asker's keys
([decision 0057](0057-the-machine-gives-what-is-written.md)). Decision 0021 and the [study](../cluster.md) say that on
Cluster the sender's work and the receiver's replies are on different shards, so that one statement no longer reads
both, and a deletion has to be a message, which may arrive before the request it ends.

That is not so where the runtime on Cluster runs. A shard says which runner handles an entity; it does not move
its rows. The runtime's tables sit beside Cluster's, on one `SqlClient`
([decision 0081](0081-on-cluster-a-step-commits-with-its-reply.md)), and the runtime on Cluster runs on SQLite
([decision 0084](0084-a-step-commits-only-where-the-commit-checks-the-shard.md)), where `@effect/sql-sqlite-bun`
opens every transaction with `BEGIN IMMEDIATE`, so that transactions come one after the other. The two deletions
then hold as they hold on one process:

- **A read of another shard's rows is safe.** Once the work under a key no longer holds in an incarnation, it never
  holds there again (`holds`), so a step that reads, from the asker's committed rows, that its work ended is right
  for ever.
- **The two deletions see each other.** Either the step that stores the reply commits after the asker's step that
  ended its work, and finds the work ended, or before it, and the asker's step deletes the reply.
- **Nothing sends under a key once its work ended.** An operation leaves only through its completion
  ([decision 0005](0005-an-operation-leaves-only-by-completing.md)), so its fiber is done before the step that
  delivers the completion ends the work, or died with its process when the completion is an at-most-once
  operation's `unknown`; a suspension or an unload stops the fiber, but the work still holds, and the request the
  fiber waited for is still handled ([decision 0091](0091-on-cluster-an-interrupted-caller-leaves-its-request-alone.md)).

Cluster's own rows are another matter. A spike against `effect` 4.1.1, with `SingleRunner` on
`@effect/sql-sqlite-bun`, and an entity whose persisted RPC runs under `WithTransaction` and counts its runs, found:

- nothing deletes a processed request's rows in `cluster_messages` and `cluster_replies`: they grow with every
  request handled;
- `clearReplies` deletes a reply and marks its request unprocessed, and the handler runs again without anyone
  sending it; `clearAddress` deletes all of an entity's rows, and entities are never deleted;
- deleting a request's rows by its `request_id`, from both tables, makes the same primary key sent again a new
  request, and nothing in memory keeps the runner from handling it;
- such a deletion made in the transaction of a step that handles another request leaves no row behind;
- a handler that deletes the rows of its own request, in its own transaction, leaves its reply in
  `cluster_replies`: Cluster saves it after the handler returns. Deleted in `SqlClient.afterCommit`, they go, but a
  crash between the commit and the deletion keeps them.

Cluster has no operation that forgets a processed request without delivering it again. It is asked as
[Effect-TS/effect#10239](https://github.com/Effect-TS/effect/issues/10239); on 2026-10-31 it is open, with no answer.

## Decision

- **On Cluster, the runtime's replies are deleted as on one process**: by the asker's step whose work ended, and as
  they are stored when the asker's work already ended. The statements read the asker's keys in the runtime's
  table, whatever shard they are on.
- **The runtime keeps the Cluster request id of every request an entity's operation sends, under the work that
  sent it.** Every step that answers such a request — a creation or a message, with a reply, `Suspended` or
  `NotFound` — stores its Cluster `request_id` with the asker's program, id, key and incarnation, once. A request
  answered `Suspended` or `NotFound` is reset and delivered again under the same id
  ([decision 0087](0087-on-cluster-what-is-not-a-reply-is-handled-again.md)), and a retry across versions is a new
  request to Cluster, under an id of its own ([decision 0086](0086-on-cluster-a-request-is-keyed-by-its-version-too.md)):
  each id is kept. Every answer Cluster stores for an entity is a step's, since a caller that stops waiting stores
  none (decision 0091), so every id that has rows to delete is kept.
- **The asker's step whose work ended deletes Cluster's rows with the runtime's replies**: every row in
  `cluster_messages` and `cluster_replies` under the ids kept for that work — the request, and any envelope stored
  under its id — and the ids, in its transaction. An id is kept by the step that answers its request, in Cluster's
  transaction, so its request is processed, but for one case: a request answered `Suspended` or `NotFound` and reset
  by its asker's client (decision 0087), whose process died before it sent the request again. The asker's work then
  ends with an at-most-once operation's `unknown`, and its step deletes the rows of a request Cluster will deliver
  again. If Cluster has not read it yet, the message is lost, as `unknown` allows. If Cluster holds it in memory, a
  step handles it, finds the asker's work ended, and leaves its id pending, as below; Cluster's tables have no
  foreign key on SQLite, so the reply Cluster then saves is a row of its own, deleted with the pending id.
- **A request answered after its asker's work ended leaves its Cluster request id pending**, in a row written in
  the step's transaction instead of the one above. Every step first deletes, in its transaction, Cluster's rows under
  the pending ids and the pending rows, all written by steps that have committed, and only then writes its own: the
  rows of its own request are saved by Cluster after the step, and would be left behind. A step answers one request,
  so the database holds at most one pending id, which the next step of any entity deletes.
- **A caller's request keeps its rows in both tables**, as a caller's reply is kept
  ([open questions](../open-questions.md#running)).
- **The deletions are SQL statements of the runtime on Cluster's tables**, by `request_id`, until Cluster has an
  operation for it (#10239); the runtime then uses that operation, and nothing else of this note changes.

## Alternatives

- **The receiver asking the asker whether its work holds.** Right for ever once the answer is no, but nothing
  says when to ask: when the reply is stored, the asker still waits for it. Asking again later is polling, which
  the runtime does not do ([decision 0063](0063-the-runtime-waits-for-what-it-waits-for.md)).
- **A message from the asker that its work ended.** It may arrive before the request it ends, so the receiver
  would keep a tombstone for it, and then need to know when the tombstone may go: the same question again.
- **Cluster's rows deleted in `afterCommit` by the step that answers a request for ended work.** Cleaner while
  nothing crashes, and a crash between the commit and the deletion keeps the rows for ever. The pending row needs no
  window, and keeps one request at most.
- **The pending id deleted by the receiver's next step alone.** A receiver that is never stepped again, or one that
  does not exist (`NotFound`), would keep it; any step deleting it costs one statement on a table of one row at
  most.
- **The Cluster ids kept beside the runtime's replies.** A request answered `Suspended` or `NotFound` has no reply,
  and its rows would stay once its asker's work ended: an at-most-once operation whose `unknown` is delivered after
  a crash, while its request waits for a resumption.
- **Keeping Cluster's rows.** They would grow with every message an entity handles, where the runtime's replies
  grow with the work under way (decision 0021).
- **`clearReplies`.** It delivers the request again.

## Consequences

- Decision 0021's consequence for Cluster does not hold: one statement reads both shards, and no message between
  entities is needed. Its status line says so, and so does [`docs/cluster.md`](../cluster.md).
- The deletions rely on transactions that come one after the other. On PostgreSQL or MySQL, under `READ COMMITTED`,
  a reply stored while the asker's step ends its work could be missed by both deletions, and kept for ever: never a
  reply deleted while its work holds. The same holds of a Cluster id kept while the asker's step ends its work. The
  runtime does not run there until the fence (decision 0084); when it does, the step that stores a reply or keeps an
  id locks the asker's key row, and the asker's step writes its key row before it deletes, as it does on SQLite, so
  that one of the two sees the other.
- Deleting a request's rows from Cluster's tables writes to tables that are Cluster's, which
  [decision 0085](0085-on-cluster-a-request-is-keyed-as-the-machine-keys-it.md) avoided, by a column whose meaning a
  release of Cluster may change; the spike is what checks it, at the version the project pins.
- A caller waiting for a reply from storage would never get one whose rows are gone. Nothing waits for a request
  whose asker's work ended: its operation is done.
- Nothing of this is code yet: the runtime on Cluster is a later step of the [roadmap](../roadmap.md).
