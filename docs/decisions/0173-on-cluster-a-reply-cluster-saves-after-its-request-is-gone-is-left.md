# 0173. On Cluster, a reply Cluster saves after its request is gone is left

**Status:** proposed, 2026-11-07, for the step Effect Cluster of the roadmap. Decides the open question of a reply
Cluster saves after its request's rows are gone, which
[decision 0170](0170-on-cluster-an-operations-client-keeps-the-request-id-before-it-resets-a-saved-failure.md)
raised.

## Context

On Cluster, the step that ends an operation's work deletes Cluster's rows of the requests that work sent
([decision 0169](0169-on-cluster-an-operations-request-ids-are-kept-under-its-work-and-deleted-with-it.md)). A
request still unprocessed among them may already have been read by Cluster's storage loop on the receiver's runner.
`saveReply` of `SqlMessageStorage` at 4.1.2 then inserts the delivery's reply without checking that the request is
still there. The reply stays in `cluster_replies`, under an id no table of the runtime keeps.

A delivery read before the deletion reaches its end in one of two ways:
- **It reaches the door.** The door's step keeps the request's id in its transaction, before Cluster saves the reply
  in that same transaction. The step finds the work ended, and keeps the id pending, so the next step of any entity
  deletes the reply under it (decision 0169). On SQLite the door's step and the step that ends the work commit one
  after the other, so the door's step reads the work as that step left it.
- **It dies before it reaches the door.** Cluster saves a defect of its own, with no step of the runtime. At 4.1.2
  the storage loop of `cluster/Sharding.ts` does so for a type no runner registered within
  `entityRegistrationTimeout`, and for any other defect of a delivery, such as a payload it does not decode, which
  [decision 0159](0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md) keeps from an older
  runner.

Only the second way leaves a reply no step deletes.

## Decision

- **The runtime leaves a reply Cluster saved of its own after the request's rows were deleted.** It runs no sweep
  of `cluster_replies` for replies with no request, in a step or on a timer.
- The row loses nothing and is never given. The client that sent the request stopped waiting when its work ended,
  and Cluster reads a reply only for a request that waits.
- The row comes only from a deploy in which no runner registers the receiver's type within
  `entityRegistrationTimeout`, and only where the sender's work ends in the short time between Cluster's read and
  its save. That is at most one row for each such request. Every caller without `keep` already leaves its rows in
  Cluster's tables for ever ([decision 0171](0171-on-cluster-a-callers-rows-go-once-its-client-has-the-answer-and-its-time-is-past.md)),
  and those rows are far more.

## What it rests on

- `saveReply` inserts a reply whose request is gone: **seen in a spike**,
  [`spikes/cluster-forgets-a-request-deleted-by-its-id.test.ts`](../../spikes/cluster-forgets-a-request-deleted-by-its-id.test.ts),
  whose handler deletes its own request's rows and leaves its reply behind. **Read in the source** too, `saveReply`
  of `SqlMessageStorage.ts` at 4.1.2. A release that checks the request first would leave no such row, and the
  spike would fail.
- Cluster saves a defect of its own only for a delivery that dies before it reaches the door: **read in the source**,
  the storage loop of `cluster/Sharding.ts` at 4.1.2, whose handler of a failed delivery saves
  `Reply.ReplyWithContext.fromDefect` for a defect alone, and nothing for an interruption.
- The door's step keeps a request's id pending when the asker's work has ended, and the next step deletes the rows
  under it: **tested** by `on Cluster, an id kept under work goes with it, and a pending one with the next step, to its
  last digit` in [`src/storage.test.ts`](../../src/storage.test.ts). That the door's step reads the work after the
  step that ended it committed: **only reasoned**, from one transaction at a time on SQLite, as decision 0169 has it.
- A reply with no request is never given: **read in the source**, `repliesFor` of `SqlMessageStorage.ts` at 4.1.2,
  which a runner calls only for the requests its clients wait for.
- That the time between Cluster's read and its save is short: **only reasoned**. Once the registration window has
  passed, the storage loop fails a delivery as soon as it reads it. A runner paused in that time leaves the same one
  row.

## Alternatives

Effect's modules weighed, in `node_modules/effect/src` at 4.1.2:
- **`MessageStorage.clearReplies` and `MessageStorage.clearAddress`.** The first resets a request it finds, and
  finds none here. The second deletes every row of an address, the requests that still wait among them.
- **The retention of completed requests from the pull request for Effect-TS/effect#10239**, which no release holds
  at 4.1.2. In its diff, it selects the requests to delete from `cluster_messages`, so it would not delete a reply
  whose request is gone either. This is read in an unreleased pull request, and is read again at the release that
  holds it.

Other ways:
- **A sweep of `cluster_replies` for the ids absent from `cluster_messages`, in a step.** It reads every reply of
  the table, which the rows of the callers without `keep` keep growing, in every step, for a row that a wrong deploy
  alone leaves.
- **The same sweep on a timer.** It costs the same scan, less often, and needs a runner that runs it, for the same
  row.
- **A sweep of the replies newer than a cursor.** A reply's id is drawn before Cluster saves it, so a cursor needs a
  margin, and a runner paused past the margin leaves the row all the same.
- **Deleting a request's rows only once it is processed.** Cluster would then deliver a request whose work has ended,
  and a program deployed late would receive a message no one waits for, which decision 0170 keeps from it.
- **The ids of the unprocessed requests kept pending past the work's end.** A delivery Cluster never read leaves no
  reply, so its id would stay in `sent_requests` for ever, one row in place of the other.

## Consequences

- A wrong deploy, with a receiver's type no runner registers in time, may leave one row in `cluster_replies` for each
  request whose sender's work ended while Cluster failed its delivery.
- An operator who wants such rows gone deletes the replies whose `request_id` no row of `cluster_messages` holds,
  which the runtime never reads.
