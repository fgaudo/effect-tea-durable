# 0292. The process's state is a pure core, and a test holds an order by its events, a seam or a primitive

**Status:** proposed, 2026-11-13, for the step The process's state as a pure core, and the tests of an order of the
[roadmap](../roadmap.md). The maintainer chose the direction in a session of 2026-11-13, after a reading of how Effect
tests its own concurrency and two readings by a second model, Fable 5.2. Nothing of it is written yet.

## Context

The runtime's rules of concurrency are held today by the scheduler of the tests, `controlled` in
[`src/testing.ts`](../../src/testing.ts) ([decision 0104](archive/0104-the-runtimes-tests-choose-where-fibers-yield.md)).
The scheduler models Effect's own: when a fiber is asked to yield, and that a `Deferred`, a `Fiber.join` or a callback
resumes its waiter inline, on the stack of the fiber that completes it. A test under `explored` runs PCT over seeds,
and a seed that found a bug is pinned ([decision 0254](0254-a-check-of-the-project-runs-against-the-case-it-refuses.md)).

The model costs more than it was expected to.

- **Effect promises none of what the model copies.** No JSDoc of `Deferred`, `Fiber.join`, `Effect.callback` or
  `Scheduler` says on which stack a waiter resumes. The move from Effect 4.1.2 to 4.1.3 changed when the run loop asks
  `shouldYield`, and the scheduler had to change with it
  ([decision 0244](0244-the-scheduler-of-the-tests-lets-a-fiber-through-at-the-task-of-its-yield.md)).
- **A pinned seed loses its interleaving when a yield moves, and does not fail.** Bugs 43 and 52 of
  [`docs/bugs.md`](../bugs.md) were pins that held less than their notes said. Decision 0254 answered with the pins of
  `src/runtime.test_pins.ts` and the job `pins` of the CI.
- **The explored tests run only `inline` resumptions.** The orders of `queued` resumptions are orders Effect's
  contract allows, since it promises no inline resumption. No explored test reaches them.
- **Most bugs of the library were not found by the scheduler.** Of the 111 bugs of `docs/bugs.md`, nearly all came
  from a reading of the premises, from Cluster and from PostgreSQL's transactions. The scheduler found about ten bugs of
  the runtime, all orders of the process's state in memory.

Effect tests its own concurrency otherwise. The tests of `Effect-TS/effect`, at its version 4.1.4 on 2026-11-13,
force the order they mean, with a `Latch` or a `Deferred` and `yieldNow`, and move time with `TestClock`. Each
primitive has a file of tests of its contract. Where the order lies inside a primitive, a test provides a scheduler
of its own that holds the tasks and is stepped by hand, as a test of `Semaphore.test.ts` does for a waiter
interrupted after its permit is released. Such a scheduler forces one order a test names, and explores none. Effect
ships no explorer of interleavings.

Effect's `Tx` modules were weighed again for the waits. A wait on `Effect.txRetry` is woken by a task the commit
schedules, and its read and its registration are one synchronous step, so it misses no change. But a body runs again
whole after a conflict, so it holds no I/O. An operation that sends must still read before it sends, since its answer
`Suspended` comes from another entity's step. And most of the runtime's waits are a caller's reply or a `Fiber.join`,
which no transaction holds. So `Tx` modules would take out few pins, and leave the scheduler as it is.

## Decision

- **The state of the process is a pure core.** A module that imports no `Effect` holds the fields of `Process`,
  `Deployment` and `Loaded` that another fiber reads: the locks and their users, the senders waiting for a resumption,
  the counts `settled` and `drained` read, `draining`, the entities stopping and the shards held. A transition is a
  function from a state and an event to a state and the commands to perform. The events name what happened, as
  `Forked`, `Registered`, `Answered` or `DrainBegan`. A fork, a scope, a finalizer, a fiber and a queue stay outside the
  core.
- **The core has two layers, and the rehearsal shares the first.** The first layer is the semantics of the process:
  which program steps an entity, a deploy and a restart that activate an entity from what is stored, the replies
  kept across a restart, and the ids refused. The rehearsal of [`src/rehearse.ts`](../../src/rehearse.ts) and the
  runtime both run it, as both run [`src/machine.ts`](../../src/machine.ts) for an entity. The second layer is what
  only concurrency needs: the locks, the senders waiting, the counts `settled` reads and `draining`. The rehearsal
  runs one step at a time and needs none of it.
- **The first layer holds four more pieces that are written twice today.**
  - What a transition keeps and deletes. A function of a transition gives the replies to keep and the rows to delete
    once the work that asked ends ([decision 0021](archive/0021-a-reply-is-kept-while-the-work-that-asked-holds.md),
    decision 0200). The storage performs the plan in SQL, and the rehearsal on its maps. Today the rehearsal decides
    it in `keep` of `src/rehearse.ts`, and the storage in the statements of `src/storage/entities.ts`.
  - How the outputs of a step are read. The step that handles the mailbox to its end or to a suspension, the reply a
    request is answered with, `Reused` among them (decision 0269), and whether a completion was delivered or dropped.
    The rehearsal's rule that an operation must not come back the same on its completion (decision 0130) stays the
    rehearsal's own.
  - How a request is answered, alike on one process and on Cluster. A function of what is stored and of a request
    gives the answer and the rows, and both the callers of one process and the door of Cluster run it. What Cluster's
    tables, its poll of replies and its lease do stays outside the core.
  - The policies of the process, which only the runtime runs: which entity is unloaded past the capacity (decisions
    0076 and 0078), and the waker's round, which gives from what it reads and the time the entities to activate, the
    marks of a crash and of a refusal, and how long it rests (decisions 0221, 0252, 0258, 0259 and 0274). They are in
    the core to be tested by fast-check with no scheduler, and not to be shared. The order of two entities' timers due
    at one time is no policy of the core:
    [decision 0293](0293-two-entities-timers-due-at-one-time-fire-in-no-order.md) promises none.
- **The shell performs a transition in one synchronous step, and its commands after it.** No `yield*` falls within a
  transition, so no fiber reads the state halfway. A test of [`src/form.test.ts`](../../src/form.test.ts) refuses a
  write of the core's fields outside the core.
- **A rule of order of the process is tested on the core, by the orders of its events.** fast-check generates lists
  of events in every order the shell may give them, and checks the rules as invariants after each list. A bug the
  scheduler found is a case of that test, the list of its events, which fails with the bug's rule taken out of the
  core. The cases are the two interleavings of decision 0104, decision 0109, the form of decision 0274 that
  `settled` reads, and bug 101.
- **An order at a boundary of the runtime is tested by a gate.** A gate is a service a test provides that holds at a
  point until the test lets it go, as Effect's own tests hold an order with a `Latch`. The runtime's `Probe` is such a
  service, at `BeforeCommit`, `AfterCommit` and `AfterReply`, and so are `SqlClient` and an operation's effect. A new
  point of the probe is decided by a note of its own.
- **A rule that is the contract of a primitive of Effect is kept by that primitive.** `ensuring`, `Semaphore`,
  `FiberMap`, `Latch` and `Queue` are such primitives. The rule rests on the primitive's state, never on when its
  waiter wakes, since the time of a wake is not in their JSDoc. Each rule still has a test of its own, as
  [`AGENTS.md`](../../AGENTS.md) says.
- **The scheduler of the tests is a tool of search.** `bun run test:explore` runs in a job of the CI on a schedule,
  from a random first seed. An order it finds is fixed by a case of the core, by a gate or by a primitive, and no seed
  of it is pinned.
- **A resumption is a choice of the strategy, and `Resumptions` goes.** As a `Deferred`, a `Fiber.join` or a callback
  resumes a fiber, the scheduler asks the strategy whether the fiber runs on or waits for its pick. So one model holds
  the orders of `inline` and of `queued`, and the orders between them.
- **A pin goes only once a test that replaces it kills the same mutation.** The mutation is the pin's own, in
  `src/runtime.test_pins.ts`. The pins go one test at a time, and `bun run test:pins` goes with the last.
- **The bookkeeping stays out of Effect's `Tx` modules.** [Decision 0177](archive/0177-the-runtimes-bookkeeping-stays-in-synchronous-steps.md)
  stays, and its reason that `suspended` reads the list of who waits fell with
  [decision 0265](0265-the-operations-that-wait-for-a-resumption-are-stored-by-the-step-that-answers.md). This note's
  reason replaces it: the core keeps the rule by its form, with no primitive and no model of Effect's scheduler.

## What it rests on

- That each bug of the cases above is an order of events of the process's state: **open**. The first part of the step
  checks it, by a case of each bug that fails on the core with the bug's rule taken out.
- That the rehearsal and the runtime keep two copies of the semantics of the process, which drift apart: **seen** in
  bugs 5, 107 and 108 of [`docs/bugs.md`](../bugs.md), open, and in bugs 42 and 93, fixed. Each is a rehearsal that
  answers otherwise than the runtime. [`src/rehearse.property.test.ts`](../../src/rehearse.property.test.ts) compares
  the two over generated messages for the same reason.
- That the rehearsal and the storage each decide which replies to keep and delete: **seen** in `keep` of
  `src/rehearse.ts` and in the statements of `src/storage/entities.ts`. Bugs 3 and 13 of `docs/bugs.md` were rules of
  that choice, fixed in the storage alone by decisions 0289 and 0285.
- That one function answers a request alike on one process and on Cluster: **open**. The step The tests of a
  contract on every backend, which comes first, shows which differences of Cluster are of the answer, and which are
  of Cluster's tables, its poll or its lease, which stay outside the core.
- That the rehearsal and the runtime fire first the same timer of two due at one time: **failed**, **tested** by `two
  timers due at one time`, in `src/runtime/loop.test.ts`. The rehearsal fires first the timer of the entity created
  first. The runtime does the same for entities loaded under the default scheduler, and fires first the timer of the
  smaller id for entities unloaded, since the waker reads them in the order of their ids. So the first layer holds no
  order of the timers of two entities, and [decision 0293](0293-two-entities-timers-due-at-one-time-fire-in-no-order.md) promises none.
- That the first layer runs the rehearsal with no change of what a test of the rehearsal sees: **open**. The part of
  the step that moves it checks it, by `src/rehearse.test.ts` and `src/rehearse.property.test.ts` passing as they are.
- That Effect promises no inline resumption: **read** in the JSDoc of `Deferred`, `Fiber.join`, `Effect.callback` and
  `Scheduler` at 4.1.3, none of which says on which stack a waiter resumes. The example of `Effect.callback` resumes
  from a microtask.
- That a transition run in one `Effect.sync` has no yield and no interruption within it: **documented** in the JSDoc of
  `Effect.sync` at 4.1.3, which evaluates a synchronous function. A function of JavaScript runs to its end before any
  other code.
- That a test can replace the runtime's probe and hold a step at a point: **tested** by `an event it cannot finish
  crashes its entity alone, and the next caller finds it again`, in `src/runtime.test.ts`.
- That `Latch`, `Queue` and `Semaphore` wake a waiter by a task, and not inline: **seen** in the spike
  `spikes/effect-primitives-wake-by-a-task.test.ts` at 4.1.3, under a scheduler that holds every task. No JSDoc says
  it, and no rule of this note rests on it. The same spike sees a `Deferred` and a `Fiber.join` resume their waiter
  inline.
- That a gate holds only an order someone foresaw, while the scheduler found orders no one had written: **seen** in
  decisions 0109, 0110 and 0274 and in bug 101, each of which names the seed that found its bug.
- That the scheduler, asked at each resumption, reaches both orders of a waiter and its resumer: **open**. A test of
  [`src/testing.test.ts`](../../src/testing.test.ts) checks it on the body of `under inline resumptions a fiber a
  Deferred resumes runs before its resumer goes on, as under Effect`.
- That a pin may go once another test kills its mutation: **chosen** by this note, at the advice of Fable 5.2. A
  random search with no pin holds a rare order only by chance.
- That a wait in a `Tx` transaction holds no I/O, since its body runs again whole: **read in the source**, `tx` in
  `internal/effect.ts` at 4.1.3, which reruns the body in a `whileLoop` after a conflict or a `txRetry`.

## Alternatives

- **The bookkeeping in Effect's `Tx` modules.** It holds by contract the waits that read and register in one step. It
  holds no I/O, no lock across a step and no `Fiber.join`, and an operation still reads before it sends. The spike
  `spikes/effect-tx-under-the-scheduler.test.ts` shows both. Fable 5.2 estimated that it would take out a fifth of
  the pins.
- **A core for the runtime alone, with the rehearsal kept apart.** The test of `src/rehearse.property.test.ts` would
  go on looking for the differences between two copies of one semantics, and finding them late.
- **Gates alone, with no core.** Three of the scheduler's bugs fall between two statements of one fiber of the
  runtime, where no service lies: 0104's first, 0109 and bug 101. A gate there is a hook inside the runtime.
- **A scheduler of the test stepped by hand, as Effect's own tests use one.** It forces an order between two
  statements of one fiber, where no gate reaches. It rests on when Effect asks `shouldYield` and on which stack it
  resumes a waiter, as the scheduler of `src/testing.ts` does. Effect may rely on its own run loop in its tests, and
  this library may not.
- **The scheduler as it is.** It stays coupled to what Effect does at each release, and its pins drift.
- **`queued` resumptions alone.** They never let a waiter run before its resumer goes on, which is Effect's own order
  at 4.1.3. A bug of Effect as it runs today would be missed.
- **Effect's own scheduler under budgets of `MaxOpsBeforeYield`.** Decision 0104 saw that no budget from 3 to 60
  found the two interleavings.

## Consequences

- The step The process's state as a pure core, and the tests of an order, of the [roadmap](../roadmap.md), takes the
  place of the spike of the step A test of invariants over generated histories and of the later step The state of a
  process written only by synchronous functions.
- When it is taken, this note changes decisions 0068, 0104, 0177 and 0254, and adds itself to their status lines.
  The rules of [`AGENTS.md`](../../AGENTS.md) on two fields written in one step, on pinned seeds and on
  `bun run test:pins` change in the same commit.
- The open questions The state of a process written only by synchronous functions and One primitive for a look that
  waits leave [`docs/open-questions.md`](../open-questions.md) when it is taken.
- The step What a deploy may change of a program, of the roadmap, comes first. The code of its table, the one place
  where an activation compares each piece stored with the program, moves into the first layer, and the rehearsal
  runs it from then on.
- The new module of `src/runtime/` is named by the first part of the step, which adds it to the modules of the runtime
  in `AGENTS.md` and to the diagram of `CONTRIBUTING.md`.
