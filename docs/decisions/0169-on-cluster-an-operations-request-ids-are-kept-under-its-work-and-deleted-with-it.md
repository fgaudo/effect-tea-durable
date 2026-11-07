# 0169. On Cluster, an operation's request ids are kept under its work, and Cluster's rows deleted with it

**Status:** proposed, 2026-11-07, for the step Effect Cluster of the roadmap. Says how
[decision 0090](0090-on-cluster-a-reply-is-deleted-as-on-one-process.md) is code for an operation's request, and how
[decision 0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md) is code for `Resumed`. The
keep of a request's id by the client given Cluster's failure, which decision 0092 decides, is not code yet.

## Context

Cluster deletes no row of a processed request at 4.1.2. Its `MessageStorage` has `clearReplies` and
`Sharding.reset`, which deliver the request again, and `clearAddress`, which deletes every row of an entity.
Effect-TS/effect#10239 asks for an operation that forgets a processed request. It was closed by a merged pull request,
which no release holds at 4.1.2.

Decision 0090 has the runtime keep the Cluster request id of every request an entity's operation sends, under the
work that sent it, and has the step that ends the work delete Cluster's rows under those ids. A request answered
after its asker's work ended leaves its id pending, and the next step of any entity deletes the rows under it.
Decision 0092 has the handler of `Resumed` leave its own id pending, since nothing waits for its answer.

Until this note, none of it was code. Every operation's request, every `Resumed` and every operator's event left a
request and a reply in Cluster's tables
([decision 0166](0166-on-cluster-an-operator-resumes-and-discards-through-the-doors-client.md),
[decision 0167](0167-on-cluster-an-operation-sends-through-the-doors-client-and-is-woken-by-resumed.md)).

## Decision

- **A door's handler gives the step the Cluster request id of its request**, in its decimal digits. The id is the
  `requestId` of the envelope Cluster gives the handler.
- **The step of an operation's creation or message keeps the id in the table `sent_requests`**, in Cluster's
  transaction, whatever the step answers. The row holds the asker's program, id, key, parameter and incarnation
  where the asker's row in `entity_keys` still holds that work. Otherwise the row holds the id alone, which is
  pending. An id already kept is not kept again, so a request reset and answered again under the same id keeps its
  first row.
- **The step whose work ends deletes Cluster's rows under the ids kept for that work**, then the ids, in its
  transaction, beside the replies it deletes. Every row of `cluster_messages` and `cluster_replies` under an id goes:
  the request, its replies and any envelope stored under it.
- **Every step on Cluster first deletes Cluster's rows under the pending ids, then the pending ids.** A door's step
  and a step of the entity's own loop each do. The step runs it before Cluster saves the rows of the step's own
  request, so that a request whose id this step leaves pending is deleted by a later step, once its reply is saved.
- **The handler of `Resumed` leaves its own id pending**, in its transaction, since its sender sends it with
  `discard` and waits for no answer.
- **The id is an integer in `sent_requests`**, as Cluster's column of it is, so that the two compare as numbers on
  SQLite and on PostgreSQL. SQLite stores an integer of 64 bits, and a Snowflake fits in it.
- **Cluster's tables are named with `SqlMessageStorage`'s default prefix, `cluster`.** A launcher that gives
  another prefix keeps Cluster's rows, and loses nothing.
- **An operator's event and a caller's request keep their rows.** Their client waits for the reply, which a later
  step would delete before the client reads it from storage. A caller's rows go with its reply once past its time
  (decision 0165), which is not code yet.

## What it rests on

- The envelope a handler is given carries the request's id: **documented**, in `Envelope.Request` of
  `cluster/Envelope.ts` at 4.1.2, `@stability unstable`.
- Deleting a processed request's rows by `request_id`, from both tables, in the transaction of a step that handles
  another request, leaves no row and has the runner deliver nothing again: **seen in a spike**,
  [`spikes/cluster-forgets-a-request-deleted-by-its-id.test.ts`](../../spikes/cluster-forgets-a-request-deleted-by-its-id.test.ts),
  as decision 0090 says.
- An operation's work takes Cluster's rows of its creation and its message as it ends, and the step after `Resumed`
  takes `Resumed`'s: **tested** by `an operation's work takes Cluster's rows of its requests as it ends, and the next
  step those of Resumed` in [`src/cluster.test.ts`](../../src/cluster.test.ts), which fails without either deletion.
- An id kept twice keeps its first row, an id whose work ended is pending, and an id past 2^53 is deleted to its
  last digit: **tested** by `on Cluster, an id kept under work goes with it, and a pending one with the next step, to
  its last digit` in [`src/storage.test.ts`](../../src/storage.test.ts), on SQLite alone, since the runtime on Cluster
  runs on SQLite until PostgreSQL has a fence
  ([decision 0084](0084-a-step-commits-only-where-the-commit-checks-the-shard.md)).
- Cluster's tables are named `cluster_messages` and `cluster_replies` by default, with a column `request_id`:
  **read in the source**, `SqlMessageStorage.ts` at 4.1.2. The names are no promise of a stable API.
- That a step reads the asker's work after the asker's step committed, or before it began, so that a request
  answered as the work ends is either kept and deleted or pending: **only reasoned**, from SQLite's transactions,
  which come one after the other (decision 0090).

## Alternatives

Effect's modules weighed, in `node_modules/effect/src` at 4.1.2:
- **`MessageStorage.clearReplies`.** It marks the request unprocessed, and Cluster delivers it again.
- **`MessageStorage.clearAddress`.** It deletes every row of an entity, the caller's requests with the operation's.
- **`Sharding.reset`.** It delivers the request again, as `clearReplies` does.
- **The deletions in `SqlClient.afterCommit`.** A crash between the commit and the deletion keeps the rows for ever
  (decision 0090).
- **Cluster's retention of completed requests**, which the pull request for #10239 adds. No release holds it at
  4.1.2.

Other ways:
- **The ids kept in `replies`.** A request answered `Suspended` or `NotFound` has no reply row (decision 0090).
- **The pending ids deleted by a door's step alone.** An entity that steps only by its loop would leave them for as
  long as no request reaches a door.
- **An operator's event left pending.** The operator's client reads the reply from storage on another runner, and
  the next step could delete it first.

## Consequences

- Cluster's rows grow with the operations under way, and with the requests of callers and operators.
- A rename moves the asker's name in `sent_requests` with the asker's other rows
  ([decision 0156](0156-a-program-is-renamed-by-its-launch-and-keeps-its-keys.md)).
- Once a release of Cluster forgets completed requests, a move of Effect's version weighs its retention against
  these statements.
