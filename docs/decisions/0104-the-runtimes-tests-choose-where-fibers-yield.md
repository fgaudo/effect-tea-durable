# 0104. The runtime's tests choose where fibers yield

**Status:** proposed, 2026-11-01. For the first step of the [roadmap](../roadmap.md). Would add to
[decision 0066](0066-the-runtimes-tests-move-time.md) and [decision 0068](0068-what-another-fiber-reads-changes-in-one-step.md)
a way to reach interleavings that no budget of steps reaches. Written by the session that reviewed 0076 to 0079, so
that a later one can take the step; everything below marked **to check** is not seen yet.

## Context

The runtime's tests reach interleavings by running a scenario under every budget of steps,
`Scheduler.MaxOpsBeforeYield` from 3 up ([decision 0068](0068-what-another-fiber-reads-changes-in-one-step.md)), and
some by the yields of the test's own fiber before it acts, as `a deploy interrupted anywhere keeps its name and its
waker, or stops what it started` does. A budget makes every fiber yield at the same rhythm: it samples the
interleavings, and a fiber that would have to yield at one point while another runs on cannot be made to.

What that leaves:

- **Two interleavings no budget reaches**, left reasoned by the [review of 0061 to 0075](README.md#reviews) and named
  by the roadmap's Cluster step, to be read again before it is done: a sender that registers for its receiver's
  resumption only after it is answered `Suspended` ([decision 0063](0063-the-runtime-waits-for-what-it-waits-for.md)),
  and an entity's lock dropped while others still wait for it
  ([decision 0067](0067-each-entity-is-held-by-its-own-lock.md)). Reaching them takes a point in the runtime where a
  test holds a fiber, which [decision 0066](0066-the-runtimes-tests-move-time.md) rejected: a point for the tests alone.
- **Samples, not every interleaving.** The review of 0076 to 0079 found two bugs of a deploy interrupted between two
  steps ([decision 0102](0102-a-deploy-interrupted-before-it-registers-undoes-itself.md)) by yields from 0 to 180 under
  budgets 3 to 6, and that these are every point an interruption is seen is only reasoned there.

## Decision, as proposed

- **A test runs the runtime under a scheduler it controls.** Effect's `Scheduler` service has two hooks:
  `shouldYield(fiber)`, asked as a fiber runs, which says whether it yields now, and `makeDispatcher()`, whose
  `scheduleTask(task, priority)` queues the fibers ready to run. A scheduler of the tests', in
  [`src/testing.ts`](../../src/testing.ts), answers `shouldYield` and picks the next task from a **schedule**: a
  sequence of choices, recorded as the run makes them, so that a run that fails is replayed exactly from it.
- **The runtime is not touched.** The choices are the scheduler's, where any fiber yields or resumes; no point of the
  probe is added, and 0066's rejection stands.
- **Exploration, not every schedule.** A schedule over a scenario of thousands of steps has too many orders to run them
  all. Two strategies, to be compared on the runtime:
  - **preemption bounding** (as CHESS does): every schedule with at most `k` switches forced on a fiber that would have
    run on, `k` of 1 or 2, which is exhaustive within the bound, and most bugs of concurrency need few;
  - **PCT**, probabilistic concurrency testing: fibers given random priorities, changed at `d` random points, which
    finds a bug of depth `d` with a probability the method bounds, in far fewer runs.
- **The step is done when the two interleavings above are reached**, each by a test that fails or hangs once the rule
  that keeps it is taken out, and the tests under every budget that the new scheduler covers are moved onto it. What it
  does not cover stays under budgets, and says why.

## What it rests on

- The scheduler is a service a test provides, read by every fiber the runtime forks: **read in the source**, `Scheduler`
  in `effect/src/Scheduler.ts` at 4.1.1, a `Context.Reference` documented "to replace scheduling behavior globally in
  tests"; `shouldYield` is asked in the fiber's run loop (`internal/effect.ts`). **To check** in a spike: that every
  suspension and resumption the runtime uses goes through `scheduleTask` and `shouldYield` — `Deferred`, `Queue`,
  `Semaphore`, `Fiber.join`, `forkIn`, `Effect.sleep` — and none through a microtask or a timer of the platform.
- A run is deterministic once its choices are: **reasoned**. The SQLite client is synchronous, each call an
  `Effect.try` over `bun:sqlite` (**read in the source**, `@effect/sql-sqlite-bun` `SqliteClient.ts`), time is the test
  clock's, and the library reads no other clock (`the library reads the time and sleeps through Effect alone, which a
  test moves`, in [`src/runtime.test.ts`](../../src/runtime.test.ts)). **To check** in the same spike: that two runs
  given the same choices take the same steps, the ids of their fibers included.
- The scheduler composes with the test clock: **read in the source**, `TestClock.layer` builds its scheduler over the
  `Scheduler` it finds, wrapping `scheduleTask` to follow what a wake sets going (`TestClock.ts`, `makeWithScheduler`),
  so the controlled one is provided beneath it. **To check**: that `adjust` still waits for what it wakes when the tasks
  are picked out of order.
- The two interleavings need a fiber to yield where the others do not: **reasoned**, in the review of 0061 to 0075, by
  reading where the steps fall; the step confirms it or finds otherwise.

## Alternatives

- **Points of the probe where a test holds a fiber.** Rejected by [decision 0066](0066-the-runtimes-tests-move-time.md):
  the runtime would carry points for its tests alone.
- **A model of the runtime checked by TLA+.** It would check every state of the model, not of the code, and the model
  would be kept in step with [`src/runtime.ts`](../../src/runtime.ts) by hand. Worth it later, for what no scheduler of
  one process reaches: the fence between processes on Cluster
  ([decision 0084](0084-a-step-commits-only-where-the-commit-checks-the-shard.md)).
- **More budgets and more yields.** Each run costs the suite seconds, and it stays a sample of the same kind.
- **The real clock under load.** It reaches interleavings by chance, and does not replay them.

## Consequences

- [`src/testing.ts`](../../src/testing.ts) has the scheduler and the explorations; a test names the scenario, the
  strategy and its bound, and a failure prints the schedule that replays it.
- The Cluster step changes the runtime's concurrency: the scheduler goes on with it, and the tests that are moved onto
  it now may be rewritten then. Moving all of them is not part of this step.

## How to take the step

For the session that takes it, in order; each may change the ones after it.

1. **Spike** `spikes/effect-scheduler-controlled.test.ts`: a `Scheduler` whose dispatcher holds the tasks and runs the
   one a test picks, and whose `shouldYield` says yes at chosen steps. Check that `Deferred`, `Queue`, `Semaphore`,
   `Fiber.join`, `forkIn` and `Effect.sleep` under `TestClock.layer` all resume through it, that a schedule replays the
   same steps, and what a fiber id is across two runs. Update the premises above to **seen** or say what fails.
2. **The scheduler**, in `src/testing.ts`: record and replay a schedule; an exploration that runs a scenario under
   every schedule with at most `k` preemptions, and one under PCT. Keep it apart from what `index.ts` exports, as the
   probe is ([decision 0073](0073-what-the-runtime-did-is-told-to-a-probe.md)).
3. **The two interleavings**: a test for each, which fails or hangs with its rule taken out — registering for the
   resumption after the send in `entities` of [`src/runtime.ts`](../../src/runtime.ts) (`awaitResumption`), and
   dropping the lock while others wait in `holding` — and passes with it.
4. **Move the tests under budgets** that the scheduler covers, by `scripts/mutate.ts` against the rules the budgets
   already kill, so that nothing a budget held is lost; say of each one left why.
5. Rewrite this note with what was seen, and take it with the commit that takes the step out of the roadmap.
