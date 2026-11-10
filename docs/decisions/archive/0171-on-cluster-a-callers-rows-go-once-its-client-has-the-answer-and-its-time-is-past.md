# 0171. On Cluster, a caller's rows go once its client has the answer and its time is past

**Status:** accepted, 2026-11-07, with the step Effect Cluster of the roadmap. Says how
[decision 0165](0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md) is code for
Cluster's rows of a caller's message, and changes what it decided of them: the client keeps the request's id once it
has the answer, and the door's step keeps none. Changed by
[decision 0245](../0245-a-reply-is-kept-as-long-as-send-says-and-the-runtime-sweeps.md): a creation's client keeps its
id too, as a `keep` of 0 does. Changed by
[decision 0248](../0248-on-cluster-a-callers-rows-are-kept-for-every-clients-poll.md): a `keep` shorter than two of
Cluster's polls of replies and a second keeps Cluster's rows for that time. Changed by
[decision 0249](../0249-on-cluster-a-reset-drops-the-id-a-callers-client-kept.md): a reset of an answer that is no
reply deletes the id kept, and the retry's answer keeps it anew.

## Context

Decision 0165 had the door's step keep Cluster's `requestId` with a caller's reply that has an `until`, and had the
statements that delete a reply past its time delete Cluster's rows under those ids too. That rule loses a reply a
client has not read.

A client on a runner that does not hold the entity's shard reads its reply from Cluster's table `cluster_replies`.
Cluster's storage loop reads the replies of the requests that wait every `entityReplyPollInterval`, 200 milliseconds
by default (`Runners.ts` and `ShardingConfig.ts` at 4.1.2). A reply's time is counted from the step that answers, and
a `keep` shorter than the time until the client's next read is past before the client has read it. A `keep` of 0 is
past in the step itself: the step deletes its own reply as it writes it. A deletion of Cluster's rows then would leave
the client waiting for a reply no table holds.

Cluster saves the door's reply in the step's transaction, after the handler returns
([decision 0081](0081-on-cluster-a-step-commits-with-its-reply.md)). A step that deleted Cluster's rows of its own
request would delete the request, and Cluster would insert the reply after, under an id no request holds.

## Decision

- **A caller's client keeps the Cluster id of its message once Cluster has given it the answer, and before it gives
  the answer.** It does so only for a message sent with `keep`. The client reads the id by the request's primary key,
  and keeps it in the table `given_requests` with the entity and a time: the client's clock as it keeps the id, plus
  `keep`. An id already kept is not kept again.
- **The door's step keeps no id of a caller's message.** Its reply holds none either.
- **A step that deletes its entity's replies past their time deletes Cluster's rows under the entity's ids past
  theirs, then those ids**, in its transaction. So does `Handle.expire`, for every entity of the program, in one
  transaction. Every row of `cluster_messages` and `cluster_replies` under an id goes, as
  [decision 0090](0090-on-cluster-a-reply-is-deleted-as-on-one-process.md) deletes an operation's.
- **The client reads and keeps the id without interruption once the answer has come.** A caller that stops waiting
  before the answer comes keeps no id, and its rows stay in Cluster's tables for ever, as every caller's without
  `keep` do.
- **An operation's message keeps its id under its work alone**
  ([decision 0169](0169-on-cluster-an-operations-request-ids-are-kept-under-its-work-and-deleted-with-it.md)), with
  or without `keep`.

## What it rests on

- A client on another runner is given its reply only once Cluster's storage loop has read it from `cluster_replies`:
  **read in the source**, the loop over `waitingStorageRequests` in `cluster/Runners.ts` at 4.1.2, which reads
  `repliesFor` every `entityReplyPollInterval`. The JSDoc of `entityReplyPollInterval` says only that it is the
  interval at which client replies are polled from storage. No test runs a client on another runner.
- A reply deleted from `cluster_replies` before that read is never given: **read in the source**, `repliesFor` of
  `SqlMessageStorage.ts` at 4.1.2, which reads by `request_id` alone. This premise is why the client keeps the id,
  and no rule loses data if it changes.
- A client given its answer leaves nothing Cluster still reads under the id: **read in the source**. The pump of
  `Runners.ts` removes its entry once given a `WithExit` reply, and a retry within the version is answered from the
  saved reply as `saveRequest` reads it.
- That the client's clock, read after the answer, is no earlier than the step's: **only reasoned**, and not needed.
  A client whose clock is behind keeps a time before the reply's. A retry between the two is then a new request to
  Cluster, and the machine answers it from the reply it still holds, as it answers any retry before `until`.
- That a crash in `expire` leaves no request without its replies: **only reasoned**, from its one transaction, which
  no test interrupts. Cluster does not deliver again a request it marked processed, whether its replies are there or
  not: **read in the source**, `getUnprocessedMessages` of `SqlMessageStorage.ts` at 4.1.2, which reads only rows
  with `processed` false.
- A caller's rows go once its client has the answer and the time is past, by a step of the entity and by `expire`:
  **tested** by `a caller’s Cluster rows go once its client has the answer and its time is past, by a step or by
  expire` in [`src/cluster.test.ts`](../../../src/cluster.test.ts). It fails without the step's deletion, and without
  `expire`'s. It sends with a `keep` of 0, whose reply the step deletes as it writes it, and the client is given the
  answer.
- That `Effect.uninterruptibleMask` keeps the read and the keep whole while the wait for the answer can be
  interrupted: **documented** in its JSDoc, `@stability stable`.
- `MessageStorage.requestIdForPrimaryKey` gives the id of a request saved under a primary key: **documented** in its
  JSDoc at 4.1.2, `@stability unstable`.

## Alternatives

Effect's modules weighed, in `node_modules/effect/src` at 4.1.2:
- **Cluster's retention of completed requests**, which the pull request for Effect-TS/effect#10239 adds. No release
  holds it at 4.1.2.
- **`MessageStorage.clearReplies` and `Sharding.reset`.** They mark the request unprocessed, and Cluster delivers it
  again.
- **`MessageStorage.clearAddress`.** It deletes every row of the entity, the requests still waiting with the others.
- **An ack of Cluster's.** `Envelope.AckChunk` acks a chunk of a stream, and a `WithExit` reply has none, so Cluster
  records no read of a reply the runtime could test.
- **`ShardingConfig.entityReplyPollInterval` as a margin**, Cluster's rows deleted only once `until` and some
  intervals are past. A client whose runner pauses longer than the margin, in a collection of its memory or a
  partition of its network, loses its reply all the same.

Other ways:
- **The door's step keeping the id with the reply, as decision 0165 had it.** It loses the reply of a client that has
  not read it, and of every message with a `keep` of 0.
- **The step's own request left pending, and deleted by the next step.** The next step of any entity can come before
  a client on another runner reads its reply.
- **The client keeping the reply's own `until`.** The client does not know the time of the step, which the door
  answers without, and a door that answered it would change the door's text
  ([decision 0160](0160-on-cluster-a-door-answers-as-text-and-a-creation-the-program-dies-on-waits-for-a-fix.md)).
- **The client deleting Cluster's rows itself once given its answer.** A retry before `keep` is past would be a new
  request to Cluster, and stepped, where Cluster answers it from its saved reply now.

## Consequences

- A caller's message with `keep` costs its client two statements more, a read of the id and its keep.
- A caller interrupted before its answer came keeps its rows in Cluster's tables for ever, until a later release of
  Cluster forgets completed requests.
- Within a version, a retry past `keep` whose rows are gone is a new request to Cluster, stepped as on one process.
  One whose rows are not gone yet is answered from the reply Cluster saved.
- A rename moves the program's name in `given_requests` with its other rows
  ([decision 0156](0156-a-program-is-renamed-by-its-launch-and-keeps-its-keys.md)).
