# 0248. On Cluster, a caller's rows are kept for every client's poll of replies

**Status:** accepted, 2026-11-10. Changes
[decision 0245](0245-a-reply-is-kept-as-long-as-send-says-and-the-runtime-sweeps.md), whose creation's client kept
its Cluster id until the time it had the answer, and
[decision 0171](archive/0171-on-cluster-a-callers-rows-go-once-its-client-has-the-answer-and-its-time-is-past.md),
whose message's client kept its Cluster id until its `keep` was past, however short.

## Context

On Cluster a caller's client keeps the Cluster id of its request once it has the answer, in
`effecttea_given_requests`, with a time (decision 0171). Past that time, the next step of the entity that stores a
reply deletes Cluster's rows under the id, and so does `expire`. A creation's client kept its id with the time it had
the answer, as a `keep` of 0 does (decision 0245).

Two clients may wait for one request: a caller's retry under the same request id, on another runner, while the
first try is under way. Cluster saves the second as a duplicate of the first. A client on a runner that does not hold
the entity's shard reads the reply from Cluster's table, at once when it joins and then at each poll of replies,
every `entityReplyPollInterval`, 200 ms by default. The first client is answered at once, on the runner that holds
the shard. If a later step deletes Cluster's rows before the second client's next poll, the second client never
reads the reply, and waits for ever. A test reproduced it for a creation followed by a message, with no delay
injected. A `send` whose `keep` is shorter than a poll has the same race.

## Decision

- **Cluster's rows of a caller's request are kept for at least a least time once its client has the answer.** The
  least time is two of Cluster's polls of replies and a second: `2 × entityReplyPollInterval + 1 000` ms, 1.4 s by
  default. A creation's client keeps its id for that time. A message's client keeps its id for its `keep`, or for
  that time where the `keep` is shorter.
- **The least time is read from the runner's `ShardingConfig`.** `src/cluster.ts` gives it to the client's `given`
  with the request's Cluster id, and the client adds it to its clock.
- **The runtime's own reply keeps its `keep`.** A reply in `effecttea_replies` is still deleted past its `keep`, and
  only Cluster's rows wait the longer time. On Cluster a retry after `keep` was already given the reply Cluster saved
  until a step or `expire` deleted the rows (decision 0171), so no promise of `send` changes.
- **The first poll covers the reply's commit, the second a read that failed.** Cluster logs a failed read of
  replies at the level `Debug` and reads again at the next poll. The second covers the read itself and a difference
  between the clocks of two runners.

## What it rests on

- That a client on another runner reads replies from Cluster's table at each `entityReplyPollInterval`:
  **documented**, in the JSDoc of `Runners.make` at 4.1.3, which says pending replies are polled according to
  `ShardingConfig.entityReplyPollInterval`. **Tested** by `a second client of a caller's request on another runner
  is answered after a later step`, by `create` and by `send`, in [`src/cluster.test.ts`](../../src/cluster.test.ts).
  The second runner's storage withholds every answer until a later step of the entity has run. Each test fails
  against the code before the change, its second client never answered.
- That a duplicate joins the first request's rows, and reads at once when it joins: **read** in
  `node_modules/effect/src/cluster/Runners.ts`, `replyFromStorage`. It is no promise of a JSDoc. A change of it
  loses no data: a client that finds no rows is a new request, which the machine answers from the entity's row
  (decision 0017).
- That the clocks of two runners differ by less than a second: **only reasoned**. On Cluster the runtime runs on
  one machine, on one file of SQLite that every runner shares, so the runners share a clock
  ([`docs/guide/cluster.md`](../guide/cluster.md)). Runners on several machines wait for a fence of Cluster.
- That a read of replies that fails twice running is rare: **only reasoned**. A client that misses both polls waits
  for ever, as before this note.
- The margin: the least time outlasts the second client's next read. It depends on `entityReplyPollInterval`, 200 ms
  by default, so 1.4 s, and on a read of `repliesFor` and a difference of the runners' clocks that take less than
  the 1 000 ms added: **only reasoned**. A reply committed just after a poll is read at the next, one interval
  later, and a read that failed at the one after. A runner launched with another poll moves the least time with it.

## The premises of the notes it changes, read again

- Decision 0171's premises that a client on another runner is given its reply only once Cluster's storage loop has
  read it, and that a reply deleted before that read is never given: **still hold**, and this note rests on them.
  The first is now **tested** too, by the tests above, which run a client on another runner.
- Decision 0171's premise that a client given its answer leaves nothing Cluster still reads under the id: **still
  holds** for that client. It does not hold for a second client of the same request, which is why this note keeps
  the rows longer.
- Decision 0171's premise that the client's clock, read after the answer, is no earlier than the step's: **still
  not needed**. The least time is added to the client's clock, and a clock behind by less than the margin still
  keeps the rows past the second client's read.
- Decision 0171's premises on a crash in `expire`, on `Effect.uninterruptibleMask` and on
  `MessageStorage.requestIdForPrimaryKey`: **still hold**, since neither the deletion nor the keep changes, only
  the time kept.
- Decision 0171's test `a caller’s Cluster rows go once its client has the answer and its time is past, by a step
  or by expire`: **still holds**, and now waits past the least time before it reads a deletion.
- Decision 0245's premise that a retry of a creation whose Cluster rows are gone is answered `Created`: **still
  holds**, tested by `a caller’s creation leaves its Cluster rows to expire, and a retry after is answered Created`,
  which now waits past the least time. Its premises on the sweep, on a prune in batches, on a singleton of Cluster
  and on the boundary's window are not touched by this note.

## Alternatives

- **A fixed margin, with no poll in it.** It would be wrong for a runner launched with a long poll.
- **One poll and no more.** It leaves no room for the read, nor for a read that failed.
- **A creation's id kept for ever, or for a day.** Every creation's rows would add up on Cluster, as decision 0245
  freed them from.
- **The second client given up and retried by the caller.** A caller does not know that its client waits on a reply
  that is gone, and a caller that never times out would wait for ever.
- **Cluster's rows deleted only by the sweep.** A step would still delete the rows of a `keep` past, and the sweep
  runs at any time after the answer.

## Consequences

- `OnCluster.create` and `OnCluster.send` call `given` with the request's id and the least time.
- The tests of Cluster's rows wait past the least time before they read a deletion.
- A retry of a message under the same request id, within the least time of a short `keep`, is given the reply
  Cluster saved, and is not applied again.
