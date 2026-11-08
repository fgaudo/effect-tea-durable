# 0131. A rehearsal runs the entities an operation sends to

**Status:** accepted, 2026-11-04. Decides the open question on rehearsing entities together, which
[decision 0009](0009-entities-talk-through-operations.md) left open. [Decision 0183](../0183-a-receiver-is-named-by-a-reference.md)
changes what a world runs. A runner's `create` that names a program by a reference fails the test where the world
runs no program of that name, since a reference brings no code. [Decision 0186](../0186-a-rehearsal-names-the-work-by-its-key.md)
gives `run` a key in place of the pending.

## Context

`rehearse` runs one entity, and never runs an operation's runner: the test answers each operation with the internal
message the runner would give. So two things a test of the booking means to check are never run.

- **The protocol.** The booking's test answers `SeatsConfirmed`. Nothing asks whether the inventory, in the state the
  booking's earlier requests left it in, accepts that confirmation. A booking that confirms seats it could not hold
  passes its rehearsal, and is suspended in production, where the inventory rejects the confirmation of a hold it
  never made.
- **The runner.** The code that turns the inventory's reply into `SeatsHeld` or `SeatsUnavailable`, and the name each
  request is sent under, is run only by the runtime's tests of the example, on SQLite
  ([`examples/booking/runtime.test.ts`](../../../examples/booking/runtime.test.ts)). Those tests die where the runtime's
  probe lets them, at a point of the crash table, which a test of a program should not know of, and they need a
  database.

The messages themselves already agree: `send(program, id, message, name)` takes `T['inbound']` of the receiver's
program, so a message the receiver does not declare does not compile. What can disagree is what each state accepts.

## Decision

- **A world.** `rehearse.together(at, scenario)` runs a world of entities on the machine, without storage, cluster
  or clock, with one time for all of them. The scenario creates each entity with `world.create(program, id, flags)`,
  and gets a member of the world: the surface of `rehearse` without `restart` and `deploy`, and with `run`. A process
  holds every entity, so `world.restart` restarts every entity, and `world.deploy(program)` is a restart in which the
  program's entities are activated by the new version. A world runs one program under each name, as a process does
  ([decision 0075](0075-a-name-is-deployed-once-in-a-process.md)): `world.create` by another program under
  a name the world runs fails the test, while a runner's `create` reaches the program by name, as in the runtime. An
  entity that exists in the world already fails the test.
- **`run(pending)` runs the operation's runner.** The world provides `Entities` to the run, and the scenario provides
  the other services the runner needs: the type of `run` asks for them, as `Outside<T>`. So a runner that calls a
  service outside is answered by the test's service. The runner's message completes the operation as `answer` does,
  with the same check on an operation that comes back the same
  ([decision 0130](0130-a-runner-retries-and-the-state-counts-the-attempts.md)). A run of work that is not an operation
  running in that incarnation fails the test, since the runtime would never start it.
- **`send` from a run reaches the receiver's machine.** The request is the run's, as the runtime makes it
  ([decision 0047](0047-a-request-of-an-operation-has-a-name.md)), and the receiver handles its mailbox to its
  end before `send` returns. The world stores the reply under the request, and deletes it once the sender's work that
  asked is no longer stored, as the runtime does
  ([decision 0021](0021-a-reply-is-kept-while-the-work-that-asked-holds.md)). A run after `world.restart`
  sends the same request, and is given the stored reply. A receiver that does not exist answers `NotFound`. `create`
  from a run creates an entity in the world, and a run after a restart that creates it again is answered `Created`.
  A caller's request in a world is never sent twice, so the world keeps no caller's reply.
- **What the runtime makes a defect fails the test.** A run that sends twice under one name to one entity, a
  droppable operation that sends, a receiver's defect, and a sender's defect fail the test, as `rehearse` fails on a
  defect. A suspended receiver, which `send` waits for in the runtime
  ([decision 0063](0063-the-runtime-waits-for-what-it-waits-for.md)), is never reached: the receiver's
  defect has failed the test first.
- **A crash between the replies and the completion.** `run(pending, { crash: true })` runs the runner to its end,
  drops its message, and restarts the world. Nothing runs by itself after it, as nothing does in `rehearse`: an
  at-least-once or idempotent operation is pending again, and the `run` the test gives it is given its stored
  replies, while an at-most-once one delivers its `unknown` message.
- **`rehearse` of one entity stays.** The test answers for the others, and `sendFrom` stands for them. It is a world
  of one entity, under the id `rehearsal`, whose `deploy` refuses a program of another name, as an activation does.

## What it rests on

- That a runner's services are a type the rehearsal can take `Entities` out of, so that the scenario provides the
  rest: **tested** by the compiler. `Member.run` returns an effect that needs `Outside<T>`, and
  `examples/booking/scenarios.test.ts` runs the booking's runners, which need `Entities` only, with no service
  provided.
- That the world keeps the rules the runtime's `Entities` keeps. **Tested** for the world, in
  [`src/rehearse.test.ts`](../../../src/rehearse.test.ts) and
  [`examples/booking/scenarios.test.ts`](../../../examples/booking/scenarios.test.ts): one request per name and entity,
  `fails a run that sends twice under one name to one entity`; a stored reply given to a run after a crash, `a hold
  the process died on is sent again, and given its stored reply`; a creation answered again, `creates an entity from
  a run, and answers the run sent again after a crash as the first`; `NotFound` for no entity, `a booking of an event
  with no inventory is cancelled`; a deploy that restarts every entity, `deploys a new version of one program, and
  restarts the entities of the others`; one program under a name, `fails a creation by a program the world runs
  another version of`. The runtime's rules are **tested** in
  [`examples/booking/runtime.test.ts`](../../../examples/booking/runtime.test.ts) and
  [`src/runtime.test.ts`](../../../src/runtime.test.ts). That a reply is deleted once the work that asked ends is
  **only reasoned** for the world: no run can ask for a reply once its work has ended, so no test of a program sees
  it.
- That a receiver handled to the end of its mailbox inside `send` gives the reply the runtime would give, so that the
  order of steps in a world is one the runtime can take: **only reasoned**. On one process a receiver handles a
  message as it arrives when its mailbox is empty
  ([decision 0074](0074-a-message-that-finds-the-mailbox-empty-is-handled-as-it-arrives.md)), and the world's
  mailboxes are empty between two acts of the test.
- That the machine is given a stored reply on a receive and answers with it
  ([decision 0065](0065-the-machine-holds-no-replies.md)): **tested**, in
  [`src/machine.test.ts`](../../../src/machine.test.ts).

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

- [`examples/booking/scenarios.test.ts`](../../../examples/booking/scenarios.test.ts) rehearses the booking and the
  inventory together: a booking that confirms seats it could not hold fails the test, where the inventory rejects
  the confirmation.
- `docs/design.md` says, under Rehearsing, what a world runs and what it does not.
- `docs/glossary.md` defines a world, and its entry on a rehearsal says that the test answers or runs the
  operations.
