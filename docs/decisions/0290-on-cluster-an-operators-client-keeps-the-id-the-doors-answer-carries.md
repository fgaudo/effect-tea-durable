# 0290. On Cluster, an operator's client keeps the id its door's answer carries, and its rows go as a caller's

**Status:** accepted, 2026-11-13, as the fix of bug 11 of [`docs/bugs.md`](../bugs.md). It changes
[decision 0166](archive/0166-on-cluster-an-operator-resumes-and-discards-through-the-doors-client.md): Cluster's rows
of an operator's `Resume` and `Discard` are no longer kept for ever. It applies
[decision 0171](archive/0171-on-cluster-a-callers-rows-go-once-its-client-has-the-answer-and-its-time-is-past.md) and
[decision 0248](0248-on-cluster-a-callers-rows-are-kept-for-every-clients-poll.md) to them. The maintainer chose it
on 2026-11-13, after an opinion of a Fable 5.2 agent.

## Context

On Cluster an operator resumes and discards through the door's client, and each event is a request of its own,
with no primary key (decision 0166). A caller's client keeps the Cluster id of its request once it has the answer,
in `effecttea_given_requests`, and a step of the entity or `expire` deletes Cluster's rows under the id once its time
is past (decision 0171). The time is at least two polls of replies and a second from the answer, so that a client on
another runner reads the reply first (decision 0248). An operator's client kept no id, so Cluster's rows of its
requests stayed for ever, which bug 11 is. A caller's client finds the id by the request's primary key, with
`requestIdForPrimaryKey`, and an operator's event has no primary key to find it by.

The `Resumed` a step sends to a sender that waits is no operator's event. Its door keeps its id as pending, and the
next step of any entity deletes its rows
([decision 0169](archive/0169-on-cluster-an-operations-request-ids-are-kept-under-its-work-and-deleted-with-it.md)).

The premises of decision 0166 still hold, but its last, that an operator's event is rare enough for Cluster's rows
of it to be kept, which this note makes unneeded.

## Decision

- **The door answers an operator's event with the Cluster id of its request.** The handler is given the id with the
  request, and the answer's text carries it under the key `request`, beside what the event did. The key is optional
  in `operatedCodec` of [`src/cluster.ts`](../../src/cluster.ts).
- **The operator's client keeps the id once it has the answer, for the least time, as a caller's creation does.** It
  writes the id, the entity's id and the time, now and the least time, to `effecttea_given_requests`. A step of the
  entity or `expire` then deletes Cluster's rows of the request past that time, by the code that deletes a caller's.
- **The answer and the keep are not interrupted halfway**, as a caller's are: an operator that stops waiting once the
  answer came keeps the id all the same.
- **An answer with no id keeps nothing.** It is the answer of a door of a release before this note, during a rolling
  deploy, and its rows stay, as before.

## What it rests on

- That the id the door's handler is given is the id of Cluster's rows of the request, and that a step or `expire`
  deletes them past the least time: **tested**, by `an operator’s resume and discard leave no Cluster rows past the
  least time, by expire` and `by a step`, of [`src/cluster.test.ts`](../../src/cluster.test.ts). Against the code
  before this note, the first found the two requests and their two replies after `expire`.
- That an operator on a runner that does not hold the entity's shard is answered, though a later step deletes rows
  past their time before its poll reads the reply: **tested**, by `an operator's discard on another runner is answered
  after a later step`, of the same file, under `slow`. The id is kept only once the client has the answer, so the
  step finds no id of the request to delete by.
- That an event with no primary key has one client, so that no other client of the request waits for its reply:
  **read in the source** by decision 0166, and tested there. The least time is kept all the same, so that one rule
  holds of every request a client keeps, and this premise holds no rule.
- That a client decodes the answer of a door of a release before this note, and a client of that release decodes
  this answer: **documented**. `Schema.optionalKey` makes the key optional, and a decoding strips a key the schema
  does not name, by the default `onExcessProperty` of `ParseOptions` in `effect/src/SchemaAST.ts` of the pinned
  version.
- That `Effect.uninterruptibleMask` keeps the answer and the keep whole while the wait for the answer can be
  interrupted: **documented** in its JSDoc, `@stability stable`.

## Alternatives

- **The rows deleted by the client as soon as it has the answer.** Safe, since the request has one client, but it is
  a second way to delete Cluster's rows, beside the step's and `expire`'s, for no gain.
- **The id kept by the door's step, with the least time.** The time would count from the step's start, before the
  commit and before the client's poll, so a slow commit could delete a reply a client on another runner has not read.
  It would keep the id of an operator that stops waiting, which this note does not.
- **A primary key drawn for each event, so that the client finds the id as a caller's does.** It changes the
  payload of the door and the rule of decision 0166. It would also find the id of a failure Cluster saved without
  running the handler, which this note leaves.

## Consequences

- Bug 11 is fixed. The rows a database holds from before this note stay.
- An operator that stops waiting before the answer, or a process that dies between the answer and the keep, leaves
  its rows for ever, as a caller's are under bug 59. A failure Cluster saved without running the handler gives no
  id, and its rows stay too. Both are in the [open question](../open-questions.md#running) The rows of operators'
  events on Cluster.
