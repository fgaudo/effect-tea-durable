# 0260. A discard of a message an operation sent stores a rejection

**Status:** accepted, 2026-11-11, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the fix of bug 19. It changes
[decision 0014](archive/0014-rules-the-machine-settled.md) for a message an operation sent: its discard stores a
rejection with no reason under the message's request. A caller's message is discarded as decision 0014 says.

## Context

An operator discards the message an entity died on to get the entity past that message. Decision 0014 stores no
reply for a discarded inbound message, and the caller's retry is a new message. When an operation of another entity
sent the message, the operation's `send` waits for the receiver's resumption and sends the same request again
([decision 0023](archive/0023-suspended-means-no-reply-yet.md)). The discard resumes the receiver, the request
finds no reply, and the receiver applies the message again and dies on it again. The discard does nothing, and the
operator cannot get the entity past the message without a deploy. A caller's retry is the caller's choice, and an
operation's retry is the runtime's, so only an operation's message loops this way. The maintainer chose this fix on
2026-11-11, after the opinion of a Fable 5.2 agent.

## Decision

- **A discard of a message an operation sent stores `Rejected` with a reason of `null` under the message's
  request.** `discard` of `src/machine.ts` gives the reply as the step gives a rejection of `update`: an output
  `Replied`, and the reply in what the event writes. The operation's `send` sends the request again at the
  resumption, and is given the stored rejection, so the receiver does not apply the message again.
- **The rejection is kept while the work that sent the message holds**, as every reply to an operation is
  ([decision 0021](archive/0021-a-reply-is-kept-while-the-work-that-asked-holds.md)). A rejection stored for work
  that already ended is deleted as it is written.
- **A discard that leaves the entity suspended stores nothing.** The program deployed died on the stored state, the
  discard keeps its message, and the operator is told `StillSuspended`, as before.
- **A caller's message stores no reply when it is discarded**, as decision 0014 says. The caller's retry under the
  same request id is a new message.

## Alternatives

- **The same rejection for a caller's message.** One rule with no branch on the sender. A caller that retries
  under the same request id after a fix would be given the old rejection for as long as its boundary keeps replies
  ([decision 0125](archive/0125-a-callers-reply-is-kept-as-long-as-its-boundary-says.md)).
- **A new answer `Discarded` for `send`.** It tells the sender what happened, but it changes the type of `send` for
  every program, the guide and the examples, and nearly every program would handle it as a rejection.
- **`NotDiscarded` for a message an operation sent**, as for an internal message
  ([decision 0041](archive/0041-a-completion-is-not-discarded.md)). Only a deploy of a receiver that rejects the
  message would get the entity past it, and the sender's operation waits until then.
- **A reason the operator gives**, as `discard(id, { reason })`, typed by the receiver's schema of rejections. It
  would tell a discard from a bare `reject`, at the cost of a schema on the operator's path and in Cluster's request
  `Discard`. It can be added later without changing this rule.

## What it rests on

- That the operation's `send` returns the stored rejection and does not send again: **tested** by `a discard gets
  an entity past the message an operation sent, which the operation does not send again`, in `src/runtime.test.ts`.
  It fails against `discard` before the change, since the receiver is suspended again.
- That the discard stores the rejection only for a message an operation sent, and only when the entity is resumed:
  **tested** by `a message an operation sent is discarded with a rejection stored, which its next send is answered`
  and `a discard that leaves the entity suspended keeps the message an operation sent, and stores no reply`, in
  `src/machine.test.ts`, beside `an inbound message the entity died on is discarded, with no reply stored`. The first
  fails against `discard` before the change.
- That a rejection stored for work that already ended is deleted as it is written: **tested** by `a reply asked by
  work that no longer holds goes as it is stored, and one whose work holds is kept`, in `src/storage.test.ts`. The
  discard's reply is written by the same statement as every reply.
- That on Cluster the door's step answers the request sent again from the stored rejection, once `Resumed` wakes
  the operation on another runner: **tested** by `a discard on another runner of the message an operation sent is
  answered to the operation as a rejection`, in `src/cluster.test.ts`, run by `bun run test:slow`. It fails against
  `discard` before the change.
- That the explored tests keep their pinned interleavings: **tested** by `bun run test:pins`. The change adds an
  output to a discard, and no yield.
- That a sender handles a rejection with a reason of `null`: **documented** by the type of the reply of `send`,
  whose rejection's reason is `null` for a bare `reject` of every program.
- That a sender need not tell a discard from a bare `reject`: **chosen** by the maintainer, on 2026-11-11.

A rehearsal of `src/rehearse.ts` has no operator, and discards nothing, so the decision leaves it out.
