# 0114. An operator sees the suspended entities, and what a resume or a discard did

**Status:** accepted, 2026-11-03. Adds to [decision 0006](archive/0006-a-defect-suspends-the-entity.md) the list of
suspended entities its consequences asked for, and to [decisions 0041](archive/0041-a-completion-is-not-discarded.md)
and [0044](archive/0044-a-firing-is-not-discarded.md) what a `discard` that drops nothing answers. Decides the second
half of the roadmap's step on suspended entities, with
[decision 0113](0113-a-suspended-entitys-operations-run-to-their-end.md), and closes its
[open question](../open-questions.md#running).

## Context

A handle gives an operator `resume` and `discard`, and nothing to find the entities to use them on: an operator
learns of a suspension from a caller answered `Suspended`, or from a sender's entity that stays `Holding`. Neither
says why, nor since when. `discard` on an entity that died on an internal message, or in an operation, changes
nothing ([decisions 0041](archive/0041-a-completion-is-not-discarded.md), [0044](archive/0044-a-firing-is-not-discarded.md)),
and gives `void`, as a discard that dropped the message does. A `resume` whose program dies on the stored state again
gives `void` too.

An operation that sends to a suspended entity waits for its resumption, and costs nothing meanwhile
([decision 0063](archive/0063-the-runtime-waits-for-what-it-waits-for.md)). The open question asked how long it may
wait before someone is told. A limit would depend on the protocol, and on who the senders are; what the runtime
knows is who waits, since each sender registers its wait before it sends.

What the storage holds of a suspension is what it died on and the cause, rendered when it suspended
([decision 0028](archive/0028-rules-the-runtime-settled.md)). The time is the runtime's: the machine has no clock
but the one a message carries ([decision 0066](archive/0066-the-runtimes-tests-move-time.md)), and a suspension on an
operation or an activation carries none.

## Decision

- **`suspended` lists the program's suspended entities**, the longest suspended first: the entity's id, what it died
  on, the cause as it was rendered, since when, and the operations of other entities waiting for its resumption.
  What it died on is the mailbox's first message, inbound or internal, an operation, by its key and incarnation, or
  the activation of the stored state by the program deployed. Each is read from what is stored, so an entity this
  process does not hold is listed too.
- **Since when is the time the entity suspended**, by the runtime's clock, written by the storage with the step that
  suspended it, and kept through every step while the entity stays suspended: a completion recorded, a resume whose
  program dies on the state. It is cleared by the step that takes the entity out of its suspension.
- **Who waits is read from the senders registered in this process.** A sender registers before it sends, and takes
  its registration back once answered ([decision 0063](archive/0063-the-runtime-waits-for-what-it-waits-for.md)), so
  the registered ones are the operations whose `send` waits now. After a restart, every operation under way sends
  again and registers again, so the list is whole once the process is settled. On Cluster the waiting senders are
  rows [decision 0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md) writes, and `suspended`
  reads them there.
- **Nobody is told on a clock.** A sender waits for its receiver's resumption as long as it takes, and the list says
  who waits. A deployment that wants an alarm reads `suspended`, as it reads `consumers` for a log that grows.
- **`resume` and `discard` say what they did.** `resume` gives `Resumed`, `StillSuspended` with the new cause when
  the program deployed dies on the stored state, `NotSuspended`, or `NotFound`. `discard` gives `Discarded`,
  `NotDiscarded` when the entity died on an internal message, in an operation or on its activation,
  `StillSuspended` when the program deployed dies on the stored state, `NotSuspended`, or `NotFound`. A discard that
  gives `StillSuspended` keeps the message it would have dropped: the entity stays as it was, with the new cause.
  `Resumed` says that the entity was activated: the message it died on is handled next, by the program deployed,
  and may suspend it again.
- **Each operator is told what the operator's own event did.** The runtime answers the operators of an entity in
  the order their events were offered, one operator per event. Two operators who discard at once are answered
  `Discarded` and `NotSuspended`, not `Discarded` both: the second event finds the entity resumed, and may drop the
  next message if the entity died on that one too.

## What it rests on

- That `suspended` lists an entity with what it died on, its cause, since when and who waits, and that `resume` and
  `discard` give each outcome: **tested**, `an operator sees the suspended entities, who waits for each, and what a
  resume or a discard did`, in [`src/runtime.test.ts`](../../src/runtime.test.ts).
- That each operator is answered by the operator's own event: **tested**, `two operators who discard at once are
  each told what their own discard did`, in [`src/runtime.test.ts`](../../src/runtime.test.ts).
- That no operator stands in the line without an event offered: **reasoned**. The runtime registers the operator
  and offers the event in one uninterruptible step, under the entity's lock. No test reaches an interruption
  between the two, since no point of the scheduler of the tests falls there. An operator who gives up after that
  step stays in the line, and the operator's own event takes the operator out of it.
- That the time of a suspension is kept through a step while the entity stays suspended, and cleared with the
  suspension: **tested**, `a suspended entity is listed with what it died on, its cause and since when, kept while it
  stays suspended`, in [`src/storage.test.ts`](../../src/storage.test.ts).
- That the registered senders are the ones waiting: **tested** for a sender that waits and is woken, `a sender
  answered Suspended is woken by the resumption, under prioritized schedules from its arrival`, in
  [`src/runtime.test.ts`](../../src/runtime.test.ts), unchanged by this note.

## Alternatives

- **Storing the waiting senders on one process too**, as decision 0092 does on Cluster. The rows would say the same
  as the registrations once the process is settled, at the cost of a write per `Suspended` answered and a delete per
  resumption. On one process the registrations are whole, so the rows wait for Cluster.
- **A time after which a sender is given up, or someone is told.** Which time depends on the protocol: a booking
  held for a day is one thing, a payment another. The design leaves it to the deployment, which reads `suspended`.
- **A query over the read model.** A projection is the program's, and says nothing of a suspension, which the
  program never sees: a listing of the runtime's is where the suspension is.
- **Leaving `resume` and `discard` at `void`**, and having the operator read `suspended` after. The operator would
  read the list to learn whether the one act it made did anything, and a discard that drops nothing would stay
  silent, which the open question named as the defect.

## Consequences

- [`src/storage.ts`](../../src/storage.ts): the column `suspended_at`, written with the step that suspends the entity
  and kept while it stays suspended, and the reading `suspended`.
- [`src/runtime.ts`](../../src/runtime.ts): `suspended` on the handle, with the waiting senders from the
  registrations; `resume` and `discard` give an `Operated`, computed from the machine before and after the event, to the operators
  of the entity in the order their events were offered.
- The glossary's `Handle`, and the design's sections on defects and on where it runs, name `suspended` and the
  answers of `resume` and `discard`.
- The open question `Suspended entities` leaves `docs/open-questions.md`, and the step leaves the roadmap.
