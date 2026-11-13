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
- That Effect promises no inline resumption: **read** in the JSDoc of `Deferred`, `Fiber.join`, `Effect.callback` and
  `Scheduler` at 4.1.3, none of which says on which stack a waiter resumes. The example of `Effect.callback` resumes
  from a microtask.
- That a transition run in one `Effect.sync` has no yield and no interruption within it: **documented** in the JSDoc of
  `Effect.sync` at 4.1.3, which evaluates a synchronous function. A function of JavaScript runs to its end before any
  other code.
- That a test can replace the runtime's probe and hold a step at a point: **tested** by `an event it cannot finish
  crashes its entity alone, and the next caller finds it again`, in `src/runtime.test.ts`.
- That `Latch`, `Queue` and `Semaphore` wake a waiter by a task, and not inline: **open**. Fable 5.2 read it in the
  source of 4.1.3, and no JSDoc says it. No rule of this note rests on it.
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
- The new module of `src/runtime/` is named by the first part of the step, which adds it to the modules of the runtime
  in `AGENTS.md` and to the diagram of `CONTRIBUTING.md`.
