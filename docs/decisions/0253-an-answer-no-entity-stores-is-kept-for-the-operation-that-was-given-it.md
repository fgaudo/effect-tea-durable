# 0253. An answer no entity stores is kept for the operation that was given it

**Status:** accepted, 2026-11-11, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the rule of its family B. It changes
[decision 0182](0182-init-may-reject-the-flags.md): an operation's creation that `init` rejects is now kept for the
operation. It changes [decision 0010](archive/0010-a-rejection-may-carry-a-reason.md): an operation's `NotFound` is now
kept too. It extends [decision 0021](archive/0021-a-reply-is-kept-while-the-work-that-asked-holds.md), whose rule now
holds of these answers as well. It restores the premise of
[decision 0009](archive/0009-entities-talk-through-operations.md), that a run after a crash is given every answer the
run before it acted on.

## Context

An operation that talks only to entities may run at least once and act once, since a run after a crash sends the
same requests and is given the stored replies
([decisions 0009](archive/0009-entities-talk-through-operations.md),
[0060](archive/0060-send-and-create-take-no-key.md)). That holds only if every answer the operation acts on is
stored. Two answers were not:

- A creation that `init` rejects stores neither the entity nor the reply
  ([decision 0182](0182-init-may-reject-the-flags.md)).
- A message to an entity that does not exist is answered `NotFound`, which nothing stores
  ([decision 0010](archive/0010-a-rejection-may-carry-a-reason.md)).

So a run told `Rejected` sends one message, and the process dies before the completion. Another creator then creates
the entity, and the run after the crash is told `AlreadyExists` and sends another message. A message answered
`NotFound` is applied on the run after the crash in the same way, once another creator has made the entity. This is
bug 9 of the premise review.

## Decision

- **An answer that no entity stores, given to another entity's operation, is kept while the operation's work holds.**
  The answers are two: a creation `init` rejected, with its reason, and a message's `NotFound`. A caller's request
  keeps neither, so a caller's retry still runs `init` again, and a caller's message answered `NotFound` is still
  applied once its entity exists.
- **The operation's request is answered first with its kept answer, if it has one.** A creation is then answered the
  kept `Rejected` though the entity exists, and a message is answered the kept `NotFound` and is not applied. The
  request is answered this way whatever `init` would say now, and whatever a deploy changed.
- **The answer is kept before the operation is given it.** On one process `create` and `send` of
  `src/runtime/callers.ts` keep it in a transaction of their own. On Cluster the door's step of
  `src/runtime/doors.ts` keeps it in the door's transaction, so that Cluster saves the answer and the runtime keeps it
  in one commit.
- **The answers lie in a table of their own, `effecttea_answers`.** A row holds the receiver's program and id, the
  request's text, whether the request was a creation or a message, and the work that asked. An operation may give a
  creation and a message to the same entity one name, so the text of the request alone does not tell the two answers
  apart, and the table keys its rows by both.
- **The work's end takes its answers with it, as it takes its replies.** The step that ends the work deletes them in
  its transaction. An answer kept for work that has already ended is deleted as it is written, as decision 0021 does
  for a reply.
- **A rename moves the answers with the rest.** A rename of the receiver's program moves the receiver's name, and a
  rename of the sender's program moves the sender's name and rewrites the request's text
  ([decision 0156](archive/0156-a-program-is-renamed-by-its-launch-and-keeps-its-keys.md)).
- **On Cluster the creator's client still resets a saved `Rejected` and a saved `NotFound`, and sends the request
  again.** The door's step then answers the request from the kept answer, so the reset gives the operation the same
  answer. A caller's request has no kept answer, and its retry runs `init` again, as decision 0182 says.
- **A rehearsal keeps the same answers.** The world of `src/rehearse.ts` keeps them for the work that asked, and drops
  them when the work ends, so that a rehearsal and the runtime give a run after a crash the same answers.

## What it rests on

- That one process gives a run after a crash the kept rejection: **tested** by `an at-least-once operation run again
  after a crash acts once, though init rejected its creation`, in `src/runtime.test.ts`. The test fails against the
  code before the change, where the run after the crash is told `AlreadyExists`.
- That one process gives a run after a crash the kept `NotFound`, and that the work's end deletes the answer:
  **tested** by `an at-least-once operation run again after a crash acts once, though its message found no entity`,
  in `src/runtime.test.ts`. The test fails against the code before the change, where the message is applied.
- That the door's step answers a delivery again with the kept answer, after another creator made the entity:
  **tested** by `an operation’s request a door answered Rejected or NotFound is answered so again, though its entity
  exists`, in `src/runtime/doors.test.ts`, with a Cluster the test plays. It fails against the code before the
  change.
- That Cluster's client delivers an operation's request to the door again after a crash, where the door's step reads
  the kept answer: **read in the code** of `create` and `send` in `src/cluster.ts`, which reset a saved `Rejected`
  and a saved `NotFound` and send the request again. No test runs a crash between two runs on Cluster, which
  family C of the roadmap covers.
- That a rehearsal gives the same answers: **tested** by `answers a run after a crash as the first, where init
  rejected its creation or its message found no entity`, in `src/rehearse.test.ts`, which fails against the code
  before the change.
- That the request's text of an operation does not depend on the version of either program: **read in the code** of
  `requestCodec` in `src/machine.ts`. An operation's request holds the sender's address, key, incarnation and name,
  and no sender of the receiver's schema. So a kept answer is found by its text across a deploy of either program,
  and the table needs no version in its key. Its column `version` says only how the reason is read.
- That only the operation's own runs read or write its answers, one run after the other: **only reasoned**. The
  request's text holds the run's incarnation, so no other work reads or writes the answer, and the kept answer is
  read outside the receiver's lock. A crash forks the stop of its entity's operations and does not wait for it
  ([decision 0056](archive/0056-nothing-waits-for-an-operation-under-the-permit.md)), so a run after the crash may
  start before the old run ends, and read no answer before the old run keeps one. Two runs at once may already act
  twice on any answer. The [open question](../open-questions.md#running) An operation's kept answer on Cluster across
  a crash, and under two runs at once, holds it.
- That the yields this change adds move no pinned seed: **read in the code**. The reads and writes run only for an
  operation's request. The one pinned seed, in `settled never returns between a crash and the activation its due
  timer brings, under prioritized schedules` of `src/runtime/loop.test.ts`, runs no operation that sends, and
  `bun test` passes.
- The premises of decision 0182 still hold. A caller's retry still runs `init` again, as the tests that 0182 names
  still show. On Cluster the reset still comes before the send, and the tests of 0182 in `src/cluster.test.ts` pass.
- The premise of decision 0021 still holds. No one but the sender sends under the sender's request, and the work's
  end is where its requests stop being asked.

## Alternatives

- **The design narrows its promise.** It would say that `Rejected` of `init` and `NotFound` may differ on a run after
  a crash, and that a program acts on them only where acting twice does no harm. Nothing changes in the code, but
  every program that creates or sends from an operation carries the rule, and the promise of decision 0009 no longer
  holds as written.
- **A rejected id keeps a row at the receiver.** It would take away the reason of decision 0182: a rejected creation
  leaves nothing, and another creator may create the id.
- **The answers lie in `effecttea_replies`.** That table keys a reply by the request's text alone, so an operation's
  creation and message under one name would share a row, and the second answer would overwrite the first.
