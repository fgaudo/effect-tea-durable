# 0131. A rehearsal runs the entities an operation sends to

**Status:** proposed, for the step Rehearsing entities together of the [roadmap](../roadmap.md); rewritten in place
while the step is under way. Decides the open question on [rehearsing entities together](../open-questions.md#programs),
which [decision 0009](archive/0009-entities-talk-through-operations.md) left open.

## Context

`rehearse` runs one entity, and never runs an operation's runner: the test answers each operation with the internal
message the runner would give. So two things a test of the booking means to check are never run.

- **The protocol.** The booking's test answers `SeatsConfirmed`. Nothing asks whether the inventory, in the state the
  booking's earlier requests left it in, accepts that confirmation. A booking written so that its `release` comes
  before its `confirm` passes its rehearsal, and is suspended in production, where the inventory rejects the
  confirmation of a hold it no longer has. The booking of the example cannot send in that order, which is what its
  rehearsal should show.
- **The runner.** The code that turns the inventory's reply into `SeatsHeld` or `SeatsUnavailable`, and the name each
  request is sent under, is run only by the runtime's tests of the example, on SQLite
  ([`examples/booking/runtime.test.ts`](../../examples/booking/runtime.test.ts)). Those tests die where the runtime's
  probe lets them, at a point of the crash table, which a test of a program should not know of, and they need a
  database.

The messages themselves already agree: `send(program, id, message, name)` takes `T['inbound']` of the receiver's
program, so a message the receiver does not declare does not compile. What can disagree is what each state accepts.

## Decision

The terms below are a draft, rewritten while the step is under way.

- **A rehearsal of several entities.** `rehearse.together(at, scenario)` runs a world of entities on the machine,
  without storage, cluster or clock, with one time for all of them. The scenario creates each entity with
  `world.create(program, id, flags)`, and gets a rehearsal of it, with the surface of `rehearse` without `restart`
  and `deploy`, which act on the world: `world.restart` and `world.deploy(program)`. A process holds every entity, so
  a crash restarts every entity.
- **`run(pending)` runs the operation's runner.** The rehearsal provides `Entities` to the run, and the scenario the
  other services its runner needs, so that a runner that calls a service outside is still answered by the test, with
  `answer`. The runner's message is delivered as `answer` delivers it, with the same check on an operation that comes
  back the same ([decision 0130](0130-a-runner-retries-and-the-state-counts-the-attempts.md)).
- **`send` from a run reaches the receiver's machine.** The request is the run's, as the runtime makes it
  ([decision 0047](archive/0047-a-request-of-an-operation-has-a-name.md)), and the receiver handles its mailbox to its
  end before `send` returns. The world stores the reply under the request, and keeps it while the sender's work that
  asked is stored, as the runtime does ([decision 0021](archive/0021-a-reply-is-kept-while-the-work-that-asked-holds.md)).
  A run after `world.restart` sends the same request, and is given the stored reply. A receiver that does not exist
  answers `NotFound`. `create` from a run creates an entity in the world.
- **What the runtime makes a defect fails the test.** A run that sends twice under one name to one entity, a
  receiver's defect, and a sender's defect fail the test, as `rehearse` fails on a defect. A suspended receiver, which
  `send` waits for in the runtime ([decision 0063](archive/0063-the-runtime-waits-for-what-it-waits-for.md)), is not
  rehearsed: the receiver's defect has failed the test first.
- **A crash between the reply and the completion.** `run(pending, { crash: true })` runs the runner to its end, drops
  its message, and restarts the world. Nothing runs by itself after it, as nothing does in `rehearse`: an
  at-least-once or idempotent operation is pending again, and the `run` the test gives it is given its stored
  replies, while an at-most-once one delivers its `unknown` message.
- **`rehearse` of one entity stays.** The test answers for the others, as now, and `sendFrom` stands for them.

## What it rests on

- That a runner's services are a type the rehearsal can take `Entities` out of, so that the scenario provides the
  rest: **only reasoned**, on the type of `Runner` in [`src/program.ts`](../../src/program.ts). The compiler will test
  it once `run` is written.
- That the world keeps the rules the runtime's `Entities` keeps: one request per name and entity, `NotFound` for no
  entity, a stored reply given to a restarted run. **Only reasoned** for the rehearsal; the runtime's rules are
  **tested**: one request per name, `an operation that sends twice under one name to one inventory is suspended`, and
  the stored reply after a crash, `a booking whose hold the inventory crashed on sends it again, and is not
  suspended`, in [`examples/booking/runtime.test.ts`](../../examples/booking/runtime.test.ts); `NotFound` for no
  entity, `answers a retry from the stored reply, and NotFound for no entity`, in
  [`src/runtime.test.ts`](../../src/runtime.test.ts). The step writes a test of the rehearsal for each.
- That a receiver handled to the end of its mailbox inside `send` gives the reply the runtime would give, so that the
  order of steps in a world is one the runtime can take: **only reasoned**. On one process a receiver handles a
  message as it arrives when its mailbox is empty
  ([decision 0074](archive/0074-a-message-that-finds-the-mailbox-empty-is-handled-as-it-arrives.md)), and the world's
  mailboxes are empty between two acts of the test.
- That the machine is given a stored reply on a receive and answers with it
  ([decision 0065](archive/0065-the-machine-holds-no-replies.md)): **tested**, in
  [`src/machine.test.ts`](../../src/machine.test.ts).

## Alternatives

- **A check that two programs agree on their messages.** The compiler already checks it, through the type of `send`.
  What disagrees is what a state accepts, which only running both programs shows.
- **Generated runs of several entities, as the machine's properties.** It would find orders no scenario writes, but a
  property needs a model of what the world should end in, which a scenario says by hand. It may come later, on the
  same world.
- **The runtime's tests of the example.** They run both entities already, on SQLite, and die at any point of the
  crash table through the runtime's probe. A test of a program should not need a database, nor know the points where
  the runtime commits.
- **`run` on the rehearsal of one entity, with a `send` the test answers.** The test would still answer for the
  receiver, and the protocol would still go unchecked.

## Consequences

- [`examples/booking/scenarios.test.ts`](../../examples/booking/scenarios.test.ts) rehearses the booking and the
  inventory together: a confirmation the inventory rejects fails the test.
- `docs/design.md` says, under Rehearsing, what a world runs and what it does not.
- `docs/glossary.md` defines a world, and its entry on a rehearsal says that the test answers or runs the
  operations, since the step changes what a rehearsal is.
