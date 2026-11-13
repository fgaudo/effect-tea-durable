# 0291. On Cluster, a creation the program dies on is answered `Died`, which its creator's client resets

**Status:** accepted, 2026-11-13, as the fix of bugs 10 and 58 of [`docs/bugs.md`](../bugs.md). It replaces the
second bullet of the decision of
[decision 0160](archive/0160-on-cluster-a-door-answers-as-text-and-a-creation-the-program-dies-on-waits-for-a-fix.md):
a creation the program dies on no longer waits for a fix. It restores
[decision 0124](archive/0124-the-boundary-authenticates-and-update-authorizes.md) on Cluster, whose creator is given
the defect. It says how [decision 0046](archive/0046-a-receiver-that-crashes-is-sent-again.md) holds on Cluster, which
[decision 0167](archive/0167-on-cluster-an-operation-sends-through-the-doors-client-and-is-woken-by-resumed.md) left
unsaid: an operation's sender is suspended. It extends the reset of
[decision 0182](0182-init-may-reject-the-flags.md) to `Died`. The maintainer chose it on 2026-11-13, after an opinion of
a Fable 5.2 agent, and asked that every premise be tested before the note is taken.

## Context

On one process a creation whose `init`, a schema of the flags, `project` or an index dies stores nothing, and its
creator is given the defect, as `Faulted` of [`src/runtime/callers.ts`](../../src/runtime/callers.ts). A caller is
given it as a defect. An operation dies on it, and its entity, the sender, is suspended with the cause (decision 0046).
A retry after a fix runs `init` again (decision 0124).

On Cluster the door's step died on such a creation, and Cluster restarted the door and delivered the creation again
without end, saving no reply (decision 0160). So a creator waited until a deploy fixed the program. Two bugs came of
it. An operation's creation left its sender busy and never suspended, and `suspended` listed nothing, which bug 10
is. Cluster replayed the creation first at each restart, so another creator of the id, and a message to it, waited
behind it for ever, where one process answers `Created`, which bug 58 is.

Decision 0160 refused to give the creator the defect for two reasons. Cluster saves an answer as the request's reply,
and a retry after the fix would be given it. A reset after the answer would deliver the creation again at once, in a
loop with no backoff. Decision 0182 answered both for a `Rejected`: the client resets a saved `Rejected` before it
sends, and not after the answer, so a retry runs `init` again, once for each call.

## Decision

- **A door's step answers a creation the program dies on with `Died` and its cause.** The cause is the text an
  operator reads of a suspension, `Machine.render`, which escapes each U+0000 and each lone surrogate
  ([decision 0205](0205-a-defects-cause-is-written-as-text-every-database-holds.md)). It is a success of the RPC, so
  Cluster saves it, and the request is processed. Only the defect `Machine.start` gives is answered so. A step that
  cannot commit on this runner, by `guard` or `Unheld`, still dies, and Cluster delivers its request again (decisions
  0159, 0162, 0175).
- **The creator's client resets a `Died` Cluster saved before it sends**, as it resets a `Rejected`, by
  `creationNotStored` of [`src/cluster.ts`](../../src/cluster.ts). So a retry under the same request id runs `init`
  again, as on one process. This holds for a caller's creation and for an operation's.
- **The client gives a `Died` as the creator's defect**, as `Faulted`, with the cause's text as the defect. A caller
  is given that defect. An operation dies on it, and its sender is suspended with that text, which is the text one
  process stores, since `render` of the text gives the text again. A resume runs the operation again, whose client
  resets the `Died` and sends the creation again.
- **A `Died` is not kept for an operation's work**, in `effecttea_answers`, as a `Rejected` is
  ([decision 0253](0253-an-answer-no-entity-stores-is-kept-for-the-operation-that-was-given-it.md)). One process
  keeps nothing of a defect, and a resume after a fix must create the entity. The door keeps the operation's request
  id before `init` runs, as for any creation, so that the work's end deletes Cluster's rows of it
  ([decision 0169](archive/0169-on-cluster-an-operations-request-ids-are-kept-under-its-work-and-deleted-with-it.md)).
  A caller's client keeps the id once it has the answer, `Died` among the answers, so that a step or `expire`
  deletes the rows past the least time
  ([decision 0171](archive/0171-on-cluster-a-callers-rows-go-once-its-client-has-the-answer-and-its-time-is-past.md)).

## What it rests on

- That a saved answer ends Cluster's restarts of the door, and that the creation is not delivered again:
  **documented**, by the JSDoc of `defectRetryPolicy` in `effect/src/cluster/Entity.ts` of the pinned version, whose
  backoff "resets once a request completes", and **tested**, by `a creation the program dies on stores nothing, is
  answered Died, and is not delivered again` of [`src/cluster.test.ts`](../../src/cluster.test.ts). The test reads
  one reply, the request processed, and no restart logged after 1.5 s. Against the code before this note, the
  creation had no answer within 1.5 s.
- That a caller is given the defect, and that a retry after a fix of the same version runs `init` again: **tested**,
  by `a caller’s creation init dies on is given the defect, and a retry after a fix creates the entity`. A fix of a
  newer version is sent under a new primary key, which holds the version, so no saved answer stands in its way. The
  rule holds whether the key changes or not, since a saved `Died` is reset before each send.
- That a `Died` saved and never reset, as by a process that died before its client's next call, is reset before the
  next send: **tested**, by `a creation init died on, whose saved answer was never reset, runs init again at the
  retry`. With `Died` taken out of `creationNotStored`, this test, the test of the caller above, and both tests of an
  operation and of two runners below fail.
- That an operation's sender is suspended with the cause one process stores, and that a resume after a fix creates
  the entity: **tested**, by `an operation’s creation init dies on suspends the sender, and a resume after a fix
  creates the entity`. Against the code before this note, `suspended` listed nothing after 1.5 s, while Cluster
  logged a restart of the door at each delivery. One process suspends the sender with the same text: **tested**, by
  `an operation’s creation init dies on suspends the sender with the defect’s text` of
  [`src/runtime.test.ts`](../../src/runtime.test.ts).
- That another creator of the id is answered `Created`, so that bug 58 is fixed: **tested**, by `a creation the
  program dies on leaves another creator of its id to create the entity`, ported from the branch
  `claude/premise-pairs-messages-2-a90d4b`. Against the code before this note, it had no answer within 1.5 s.
- That two clients of one request, on two runners, both reset the saved `Died` and are both answered `Created`, and
  that the entity is created once: **tested**, by `two callers of one creation init died on, on two runners, are both
  answered Created once it is fixed`, under `slow`, in three rounds. A reset that finds a newer reply leaves it,
  by `expectedReplyId` ([decision 0165](archive/0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md)).
  The rounds run the two calls at once, and do not force the order of the two resets.
- That a cause holding U+0000 reaches the caller as the escaped text, and Cluster's reply holds no U+0000: **tested**,
  by `the cause of a creation the program dies on reaches Cluster with its U+0000 escaped`. With the cause written
  without `render`, the caller's defect differed, and no column of `cluster_replies` held a U+0000 still: Cluster
  writes its reply as JSON, which escapes it. So the reply holds no U+0000 by Cluster's encoding as well as by this
  note's.
- That every backend answers a creation the program dies on alike, as the caller's defect: **tested**, by `every
  backend answers every call alike` of [`src/contract.test.ts`](../../src/contract.test.ts), which no longer marks
  such a creation, nor leaves out the requests after it, on Cluster. It passed 300 runs under `SCHEDULES=all` on
  2026-11-13.

## Alternatives

- **The defect stored by the runtime, as an entity suspended at its creation**, and Cluster's message freed. `suspended`
  would list the receiver, and `resume` would run `init` again. It makes an entity that does not exist, whose rows
  `load`, the queries and `AlreadyExists` must skip, which decisions 0182 and 0253 refused for a `Rejected`, and it
  departs from one process, where the sender is suspended.
- **The wait for a fix kept, and the waiting creation shown to an operator.** It fixes neither bug.
- **`Died` for an operation alone, and the wait for a fix kept for a caller.** It keeps bug 58 for a caller, and a
  mark of Cluster's in the test of a contract.

## Consequences

- Bugs 10 and 58 are fixed. The open question A creation that `init` dies on, on Cluster, leaves the file.
- A deploy that fixes the program no longer makes a waiting creation by itself. A caller retries, and an operator
  resumes the sender, as on one process.
- Cluster no longer logs a restart of the door for such a creation. The suspension's cause tells it for an
  operation, and the caller's defect for a caller.
- A caller that stops waiting before the answer leaves a saved `Died` and its rows, as any caller does under bug 59.
- A client of a release before this note does not decode a `Died`, and dies at each call without resetting it, while
  a door of a release before this note dies on the creation, as decision 0160 said. This note leaves out a rolling
  deploy across releases of the library, which the step A door that changes between two releases of the library of
  the [roadmap](../roadmap.md) holds.
- `docs/design.md` says that a creator on Cluster is given the defect of a creation the program dies on.
