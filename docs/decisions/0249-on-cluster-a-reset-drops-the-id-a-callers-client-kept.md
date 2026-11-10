# 0249. On Cluster, a reset drops the id a caller's client kept

**Status:** accepted, 2026-11-11. Changes
[decision 0171](archive/0171-on-cluster-a-callers-rows-go-once-its-client-has-the-answer-and-its-time-is-past.md),
whose client kept a request's Cluster id once, with the time of its first answer, whatever that answer was.

## Context

On Cluster a caller's client keeps the Cluster id of its request once it has the answer, in
`effecttea_given_requests`, with a time (decisions 0171, 0248). Past that time, a step of the entity that answers a
caller deletes Cluster's rows under the id, and so does `expire`. An id already kept is not kept again.

Three answers are no reply, and a retry resets them under the same id: `Suspended` and `NotFound` of a message
([decision 0165](archive/0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md)), and
`Rejected` of a creation ([decision 0182](0182-init-may-reject-the-flags.md)). Cluster then delivers the request
again. The id kept by the first answer stays, with its first time. A review of the notes that change another found
two faults, and three tests in `src/cluster.test.ts` reproduced them once the first time was past:

- An `expire` or a step between the retry's reset and Cluster's delivery deletes the request. The retry waits for
  ever.
- The step that answers the retry deletes its own request, as its id is past its time. Cluster saves the reply
  after, under an id no request holds, a row of `cluster_replies` left for ever. Decision 0171 rested on the step's
  own request having no kept id yet.

## Decision

- **A reset of a request's answer deletes the id a caller's client kept for the request, before `Sharding.reset`.**
  It deletes the id alone, in `effecttea_given_requests`, and none of Cluster's rows. Every reset does so: of a
  `Rejected` before a creation is sent, of `Suspended` or `NotFound` after a message's first answer, and of a failure
  Cluster saved of its own ([decision 0168](archive/0168-on-cluster-a-failure-cluster-saved-is-reset-before-it-is-given.md)). The
  reset runs only where the latest answer is one to reset, so an id whose answer is a reply is never dropped.
- **The retry's answer keeps the id anew**, with the time its client reads then. Nothing deletes the request between
  the reset and that keep, and the step that answers the retry finds no kept id of its own request.
- **An id is still kept once per answer, and not again.** A second client given the same answer keeps nothing new.

## What it rests on

- That a step and `expire` delete Cluster's rows only under the ids `effecttea_given_requests` holds: **read** in
  [`src/storage/entities.ts`](../../src/storage/entities.ts), the code of decision 0171.
- That the deletion of the id commits before `Sharding.reset` runs, so that no step reads it after the reset:
  **reasoned**, as the deletion is a statement of its own on the runner's client, awaited before the reset. **Tested**
  by `a retry of a rejected creation is answered though an expire runs before Cluster delivers it again`, by `a retry
  of a message answered Suspended is answered though an expire runs before Cluster delivers it again`, and by `the
  step that answers a retry of a message answered Suspended leaves no reply without its request`, in
  [`src/cluster.test.ts`](../../src/cluster.test.ts). Each fails against the code before the change once its wait is
  past the least time of decision 0248.
- That a step which deletes the request's rows between the reset's read of the latest answer and the deletion of the
  id loses nothing: **read** in `node_modules/effect/src/cluster/Runners.ts` at 4.1.3, as decision 0248 reads it. The
  send that follows finds no rows, and is a new request, which the machine answers from the entity's row
  ([decision 0017](archive/0017-creation-in-the-machine.md)). It is no promise of a JSDoc, and a change of
  it loses no data.

## The premises of the note it changes, read again

- Decision 0171's premise that a client given its answer leaves nothing Cluster still reads under the id: **no
  longer holds** where a retry resets an answer that is no reply. This note restores it: the reset takes the id away,
  and the retry's answer gives it back.
- Decision 0171's premise that the step's own request has no kept id: **holds again**, by the reset's deletion.
- Decision 0171's premises that a client on another runner is given its reply only once Cluster's storage loop has
  read it, and on `Effect.uninterruptibleMask` and `MessageStorage.requestIdForPrimaryKey`: **still hold**, since the
  keep does not change.
- Decision 0171's consequence that a caller interrupted before its answer keeps its rows in Cluster's tables for ever:
  **still holds**, and now covers a retry interrupted after its reset too. Its first answer's id is gone, and its
  rows stay until a later retry under the same request id is answered.
- Decision 0248's least time: **still holds**, counted from the retry's answer.

## Alternatives

- **An id kept only for an answer that is a reply.** A caller answered `Suspended`, `NotFound` or `Rejected` that
  never retries would leave its rows in Cluster's tables for ever.
- **A keep that renews the time of an id already kept.** The time of the first answer would still be past between
  the reset and the delivery, and the step that answers the retry would still delete its own request.
- **A step and `expire` that skip a request Cluster has not marked processed.** They would read Cluster's columns,
  which no promise of Cluster's names.

## Consequences

- `src/cluster.ts` deletes the kept id in `reset`, by `forgetGiven` of
  [`src/storage/cluster.ts`](../../src/storage/cluster.ts).
- The three tests above pass, past the least time.
