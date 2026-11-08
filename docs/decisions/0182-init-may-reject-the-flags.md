# 0182. A program's `init` may reject the flags, and the rejection is not stored

**Status:** proposed, 2026-11-08, for the step The API before the release of the [roadmap](../roadmap.md). Changes
[decision 0124](archive/0124-the-boundary-authenticates-and-update-authorizes.md), whose creation is answered only
`Created` and `AlreadyExists`, and [decision 0012](archive/0012-creation-is-a-request-of-its-own.md), which puts a
check of the flags in their schema alone.

## Context

A creation was `Created`, `AlreadyExists` or a defect. So a rule of the domain at creation lived in the schema of the
flags, or at the boundary ([decision 0124](archive/0124-the-boundary-authenticates-and-update-authorizes.md)). A
schema holds a rule of one value, a number of seats above zero. It holds no rule that reads the time of the
creation, such as a start that is not past, and a rule across fields reads as a filter of a struct, apart from the
program. A boundary that checks such a rule writes domain where the program cannot rehearse it. Meanwhile `update`
answers a message that does not apply with `Rejected`, and its reason.

[Decision 0124](archive/0124-the-boundary-authenticates-and-update-authorizes.md) weighed an `init` that rejects, and
left it for two reasons. It departs from the Guide, where `init` always succeeds. And a third reply of a creation
would have to be found stored by a retry.

## Decision

- **A program's `init` may reject the flags, as `update` rejects a message.** It returns the first state, `reject`,
  or `rejectWith(reason)`, with a reason of the program's schema `rejection`. `init` keeps its flags and its time,
  and still sees no sender: who may create an entity stays the boundary's to decide
  ([decision 0124](archive/0124-the-boundary-authenticates-and-update-authorizes.md)).
- **The creator is answered `Rejected`, with the reason or null.** `Creation<Reason>` is `Created`, `AlreadyExists`
  or `Rejected`, as `Reply<Reason>` is for a message. `create` gives it to a caller, and to an operation that
  creates.
- **The runtime stores nothing for a rejection.** The entity does not exist, and the runtime keeps no reply. A
  retry under the same request id runs `init` again, as a message answered `NotFound` is applied once its entity
  exists. `init` is pure, so a retry gets the same answer unless the rule reads the time, or a deploy changed the
  program.
- **On Cluster the creator's client resets a `Rejected` that Cluster saved under the request, before it sends the
  creation.** Cluster saves every answer of a door's step, as it saves `NotFound`, and its client gives a saved answer
  as it gives a new one. The reset is the one `NotFound` takes ([decision 0165](archive/0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md)),
  so a retry is delivered again and runs `init` again, as on one process. The reset comes before the send, and not
  after the answer: a process that dies between the answer and the reset would leave the saved `Rejected` to the
  retry. The client does not send the creation twice, as it does a message answered `NotFound`, so `init` runs once
  for each call. The cost is a reading of Cluster's table at each creation.
- **On Cluster an operation's creation that `init` rejects keeps its request id, as any other request of the
  operation.** The door's step keeps the id before `init` runs, and the work's end deletes Cluster's rows under it
  ([decision 0169](archive/0169-on-cluster-an-operations-request-ids-are-kept-under-its-work-and-deleted-with-it.md)).
- **A reason its schema does not encode is a defect**, as it is for `update`. On Cluster the reason crosses the door
  as text, and on one process the defect keeps the two alike.
- **Flags or a request that do not encode stay a defect, checked before `init` runs**
  ([decision 0049](archive/0049-flags-are-checked-by-their-schema.md)).
- **A part's `init` never rejects.** A parent calls its child's `init` itself, in its own `init` or `update`, and puts
  the result in its state. A part's `init` that could reject would give every parent a union to unwrap, even where
  the child never rejects. The parent checks the flags before it starts the child, and rejects with its own reasons.
- **A rehearsal answers a runner's `create` with the rejection.** A test's own `world.create` fails the test when
  `init` rejects, since a member needs an entity. A test of the rejection itself calls `init`, which is pure.

## What it rests on

- That the machine creates nothing and answers the reason: **tested**, `flags init rejects create nothing, and the
  creator is given the reason (decision 0182)` in [`src/machine.test.ts`](../../src/machine.test.ts).
- That one process stores nothing, and a retry under the same request id runs `init` again: **tested**, `a creation
  init rejects stores nothing, and a retry under its request id runs init again` in
  [`src/runtime.test.ts`](../../src/runtime.test.ts).
- That on Cluster the client's reset makes a retry run `init` again: **tested**, by the test of the same name in
  [`src/cluster.test.ts`](../../src/cluster.test.ts). The test fails when the client gives the saved `Rejected`
  without the reset. `a creation init rejected, whose saved answer was never reset, runs init again at the retry`, in
  the same file, fails when the reset comes after the answer instead of before the send.
- That an operation's creation `init` rejects leaves no row of Cluster's once the work ends: **tested**, `an
  operation's creation init rejects is answered Rejected, and its work takes Cluster's rows as it ends` in
  [`src/cluster.test.ts`](../../src/cluster.test.ts).
- That `Sharding.reset` lets a request saved with a reply be delivered again: **tested** by the tests of
  [decision 0085](archive/0085-on-cluster-a-request-is-keyed-and-answered-as-on-one-process.md), on which `NotFound` already rests.
- That a rehearsal answers a runner's `create` with the rejection: **tested**, `answers a run's creation init
  rejects, creates nothing, and fails the test's own` in [`src/rehearse.test.ts`](../../src/rehearse.test.ts).
- That a part's `init` that rejects does not compile, and a program's reasons are its schema's: **tested**, `a
  program's init may reject with the program's reasons, and a part's may not (decision 0182)` in
  [`src/program.test.ts`](../../src/program.test.ts).
- That a caller retries a creation with the flags it first sent: **only reasoned**. On Cluster a retry after the reset
  is delivered as Cluster stored it, with the first flags. On one process a retry with other flags runs
  `init` on those. A retry with other flags under one request id is the caller's mistake, as it is for a creation
  answered `Created`, whose flags do not matter ([decision 0012](archive/0012-creation-is-a-request-of-its-own.md)).

## Alternatives

Each structure of Effect that could carry the rejection was weighed.

- **`Result` of Effect**, `Result.fail(reason)` or `Result.succeed(state)`, as `init`'s return. It is Effect's sum of
  a success and a failure. `update` already rejects with `reject` and `rejectWith`, so a program would learn two
  forms of one idea, and a bare `reject` has no form in `Result`.
- **`Exit` or `Effect.fail`.** `init` is pure and returns a value. An effect would make it run, and an `Exit` carries a
  `Cause`, which is a defect's and an interruption's too.
- **`Option`**, none for a rejection. It carries no reason.
- **`Schema.TaggedError` or `Data.TaggedError` for the reasons.** A reason is data the program declares in its schema
  `rejection`, stored and sent as JSON, as `update`'s is. A class of error adds nothing a schema does not say.
- **A rejection stored as a reply**, under the sender and the request id, without an entity. A retry would get it
  again. It needs a table of replies with no entity, or a row of an entity that does not exist, which `load` and a
  query would have to skip. A rule that reads the time would keep its first answer for ever.
- **A `Rejected` reset and the creation sent once more**, as the client does for `NotFound`. It runs `init` twice
  for each call where the answer is not a saved one, and the second `Rejected` stays saved until the next retry.
- **A `Rejected` reset after the answer is given.** It reads Cluster's table only when `init` rejects. A process
  that dies between the answer and the reset leaves the saved `Rejected`, and the retry is given it without `init`
  running.
- **`init` that sees the sender.** It would let the program decide who may create, which
  [decision 0124](archive/0124-the-boundary-authenticates-and-update-authorizes.md) gives the boundary. The step does
  not need it.
- **A part's `init` that may reject**, its rejection wrapped by the library as a child's `update`'s is. A parent calls
  the child's `init` itself, so the library never sees the call to wrap it.

## Consequences

- `Program['init']` returns `State | Rejected<Rejection>`. `Creation` takes the type of the reasons, and `Handle.create`
  and `create` give `Creation<T['rejection']>`.
- `Machine.start` gives `Created`, `Rejected` or `Defect`.
- The door's text of a creation, `creationCodec`, is made of the program, since it holds the reasons.
- A boundary maps `Rejected` of a creation as it maps a message's.
  [`examples/server/server.ts`](../../examples/server/server.ts) already answers it `409`.
- No example has a rule at creation its schema cannot hold, and none changes.
