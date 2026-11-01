# 0104. The runtime's tests choose where fibers yield

**Status:** proposed, 2026-11-01. For the first step of the [roadmap](../roadmap.md). Would add to
[decision 0066](0066-the-runtimes-tests-move-time.md) and [decision 0068](0068-what-another-fiber-reads-changes-in-one-step.md)
a way to reach interleavings that no budget of steps reaches. Written by the session that reviewed 0076 to 0079, so
that a later one can take the step; everything below marked **to check** is not seen yet. Its first step, the spike,
is taken: [`spikes/effect-scheduler-controlled.test.ts`](../../spikes/effect-scheduler-controlled.test.ts), and what
it saw is in [What the spike saw](#what-the-spike-saw).

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
  tests"; `shouldYield` is asked in the fiber's run loop (`internal/effect.ts`). That no resumption `Deferred`,
  `Queue`, `Semaphore`, `Fiber.join`, a fork and the test clock's `Effect.sleep` make needs a microtask or a timer of
  the platform: **seen**, `driven by hand, every fiber resumes through the scheduler, that of the test clock included`,
  and `the timers of the platform the test clock sets are all cleared by the end of a run`, in the spike, whose runs
  end stepped by hand. That each waits in the queue for a pick: **seen** for a `Deferred` and an interruption, `fibers
  a Deferred resumes inline run in the order the test picks` and `a fiber that yielded and is interrupted waits for its
  turn, as one resumed inline does`; for the rest **read in the source**: a fiber is run only by a call to its
  `evaluate`, whose run loop asks `shouldYield` before its first step, and the spike's scheduler lets through only a
  fiber's first run, the one its own task starts, and the one Effect starts again in the same task as a run ends
  (below), which also lets through one resumed while it is still the one let run last in its task, unpicked (below).
  Not all of them reach it through `scheduleTask`: see below. A fiber under
  `Scheduler.PreventSchedulerYield` is not asked, and runs on uncontrolled; neither Effect nor the library sets it
  (**read in the source**).
- A run is deterministic once its choices are: **seen** for the spike's scenarios, its result included, `a run given
  the same choices takes the same steps, its fibers counted from its first`; for the runtime's, **reasoned**: the
  SQLite client is synchronous, each call an `Effect.try` over `bun:sqlite` (**read in the source**,
  `@effect/sql-sqlite-bun` `SqliteClient.ts`), time is the test clock's, and the library reads no other clock (`the
  library reads the time and sleeps through Effect alone, which a test moves`, in
  [`src/runtime.test.ts`](../../src/runtime.test.ts)). Fiber ids are not the same across two runs: Effect counts them
  for the process (`fiberIdStore` in `internal/effect.ts`), so a schedule names a fiber by its id less the run's first.
- The scheduler composes with the test clock: **read in the source**, `TestClock.layer` builds its scheduler over the
  `Scheduler` it finds, wrapping `scheduleTask` to follow what a wake sets going (`TestClock.ts`, `makeWithScheduler`),
  so the controlled one is provided beneath it. That `adjust` still waits for what it wakes, and for what that sets
  going, when the tasks are picked out of order and every fiber may be preempted, the one that moves the clock
  included: **seen**, `adjust waits for what it wakes, and for what that sets going, whichever task is picked`, in
  8000 runs, given that every fiber it wakes is at its wait when the clock moves — which out of order is less often
  so, and for a sleeper is not seen by the test, below.
- The scheduler gives no end Effect's own cannot give: **seen** for the cases the spike runs — a fiber interrupted
  before it starts, and an interruption that races a resumption — and **reasoned** for the rest: a yield before a
  fiber's first step after a resumption is one Effect's scheduler never makes, and Effect's code is written for yields
  at any later step (the `Semaphore` checks again for its permit when its waiter runs, `takePermits` in
  `Semaphore.ts`, read in the source). The two cases found where that yield changes an end, a fiber's first run and
  the run of one that has ended and interrupts its children, are let through.
- The two interleavings need a fiber to yield where the others do not: **reasoned**, in the review of 0061 to 0075, by
  reading where the steps fall; the step confirms it or finds otherwise.

## What the spike saw

At `effect` 4.1.1, in [`spikes/effect-scheduler-controlled.test.ts`](../../spikes/effect-scheduler-controlled.test.ts),
whose scheduler holds every task and is stepped by hand, synchronously, so that a run that ends needed nothing of the
platform's. Each rule of its scheduler and of its scenario was taken out in turn, and a test failed for each, but for
four: the read of a move after a wrapper, and the same read right after `yield*`, below; the cap on the steps of a
run, a guard that no run of the spike reaches; and the scheduler's forgetting, as each task starts, which fiber it let
run last, below, a guard as well.

- **Two ways back into a fiber.** A fiber forked, one that yields, and one woken by a `Semaphore`, a `Queue` or a
  `Latch` go through `scheduleTask` (the wake is a task, which resumes the waiters inline as it runs); one woken by a
  `Deferred`, a `Fiber.join` or any `Effect.callback` is resumed inline, on the stack of the fiber that completes it
  (`Deferred.doneUnsafe`, `callbackOptions` in `internal/effect.ts`, **read in the source**). Every fiber asks
  `shouldYield` before the first step of each run loop, so a scheduler that answers yes there makes an inline
  resumption wait in its queue, as a fork does: `fibers a Deferred resumes inline run in the order the test picks`,
  which fails without that yield.
- **But not before a fiber's first run.** Made to yield there, a fiber interrupted before it has started is run in
  full: the interruption's run loop yields, and the fork's task, which then finds the fiber not ended, runs its body
  over it. A fiber's first run is a task of the queue already, its fork, so it is let through: `a fiber interrupted
  before it starts does not run, as under the scheduler of Effect`, which fails without it. Effect's scheduler never
  yields at a first step under a budget above 1 (`currentOpCount >= maxOpsBeforeYield`, **read in the source**); under
  1 it yields at every step and no fiber moves (seen, by a check not kept).
- **Nor by an interruption.** An interruption runs the fiber it interrupts inline, on the stack of the fiber that
  interrupts (`interruptUnsafe` in `internal/effect.ts`, **read in the source**); it is the one call that runs a fiber
  which has yielded and waits for its task, since the yield's own task and an awaited callback are the only others
  that resume a fiber, and a fiber that has yielded awaits no callback. A scheduler that lets a fiber through because
  it yielded before runs it there unpicked, ahead of the fiber that interrupts; so a fiber that has yielded is let
  through only as the first fiber its task starts to run: `a fiber that yielded and is interrupted waits for its turn,
  as one resumed inline does`, which fails without it. Either way the interruption runs the fiber through the
  callback of its yield, and the yield's task, left in the queue, does nothing when it is picked.
- **Nor as a run ends.** A fiber whose run ends with children left is run again at once by Effect, in the same task,
  to interrupt them (`evaluate` in `internal/effect.ts`, **read in the source**). Made to yield there, the fiber
  lets its children run on after its last step, which under Effect's scheduler they never do (seen: a child that
  counts went a step further in 28 runs of 200). The scheduler tells that run by its fiber being the one it let run
  last in the task under way: `a fiber whose run ends interrupts its children before they go on, as under the
  scheduler of Effect`, which fails without it. It forgets that fiber as each task starts, a guard no run of the spike
  reaches: `TestClock` resumes the fiber that moves it inline as a task it follows ends, and a task may have run no
  fiber, as the task of a yield an interruption has run through does not (**read in the source**). What the scheduler
  cannot tell from this is a fiber resumed inline, by a callback or an interruption, while it is still the one let run
  last in the task: it is taken for one whose run has ended, and runs on without being picked, to the end Effect's
  scheduler gives it, which resumes it inline too. That takes a resumption before any other fiber is let run: in
  the step of another fiber that ran it inline, as `runForkWith` does (`a fiber resumed in the step of another that
  ran it runs on without a pick, taken for one whose run has ended`, which fails without the rule), or by a fiber
  under `PreventSchedulerYield`, which is not asked and so never takes its place (seen, by a check not kept: resumed
  by such a fiber after another was let run, a fiber waits for its pick). The runtime starts no fiber inline, by
  `startImmediately` or a `runFork`, nor sets `PreventSchedulerYield` (`src/runtime.ts`, **read in the source**).
- **An interruption that races a resumption** ends as under Effect's scheduler: the fiber either goes on to its end or
  is interrupted without going on, never both or neither, and both ends are reached (`an interruption racing a
  resumption ends as under the scheduler of Effect, one way or the other`). Under Effect's scheduler both are reached
  too, under budgets of 3 and 4 steps (seen, by a check not kept).
- **The test clock follows what a fiber schedules once the clock is in its context.** A fiber's dispatcher is made the
  first time it schedules a task, from the scheduler its context has then, and made again when its context gives it
  another (`setContext` in `internal/effect.ts`, **read in the source**); a fiber given the clock, the test's first one
  included, has the clock's (seen, by a check not kept). A `Queue` keeps the dispatcher of the fiber that makes it
  (`Queue.make`, **read in the source**), so a `Queue` made before the clock is provided wakes its takers where the
  clock does not follow them. The runtime makes its queues as it runs (`src/runtime.ts`), and its tests provide the
  clock to all they run (`database`, and `a runtime holds its database file alone`, in `src/runtime.test.ts`).
- **What a test reads of a move must be read in the step `adjust` returns in.** Read in a later step, after a
  preemption of the test's fiber, it shows what the other fibers did after `adjust` returned, as though `adjust` had
  waited for it, and a test that should fail passes. Effect hands a value on to the function given to `map`, and to
  the generator that yielded the effect, in the step the effect ends in (`succeed` and `getCont` in
  `internal/effect.ts`, **read in the source**); a wrapper such as `provideService` puts back what it changed in a
  step of its own. **Seen**: `what a test reads by Effect.map, or right after yield*, stands as the effect ended, and
  after a wrapper may not` — under preemption at even odds, a read after a wrapper saw another fiber move in 56 reads
  of 200, the others in none. A test of step 2 reads right after `yield* TestClock.adjust(...)`, or by `map`, with no
  wrapper between. The spike's scenario keeps this rule, but none of its ends hangs on it at the seeds it runs:
  reading after a wrapper there fails no test, and reading right after `yield*` is the same read as by `map`.
- **Out of order, a fiber forked before `adjust` may reach its wait only once the clock has moved**, and is not waited
  for. Under Effect's scheduler `adjust` gives such a fiber one turn first
  ([decision 0101](0101-a-moved-clock-gives-a-fiber-it-did-not-wake-one-turn.md)), which its queue, first in first
  out, makes enough; picked out of order, it may not be. Each waiter reads the clock in the step before its wait: with
  no preemption, in 1000 runs, every run whose chain was not at its end as `adjust` returned had a waiter that came
  to its wait at the sleeper's time or later, and none had its waiters all there before (`a fiber forked before adjust
  may reach its wait only once the clock has moved, and is not waited for`). A scenario under the controlled scheduler
  waits for its fibers to be at their waits before it moves the clock, with no preemption until then.
- **A sleeper the test cannot see at its latch.** The test clock's sleep puts its entry in the clock's list, takes a
  permit of a semaphore that `adjust` takes too, and only then waits on the entry's latch (`TestClock.ts`, **read in
  the source**). Woken before it is at the latch, a sleeper is not followed: the clock opens the latch with no fiber at
  it and returns, and the sleeper goes on after `adjust` (`a sleeper woken before it is at its latch is not waited
  for`). Two things keep it from the latch, both seen with the waiters at their waits: a preemption of the sleeper
  between the entry and the latch (16 runs of 1000), and, with the sleeper not preempted there, the permit, which an
  `adjust` under way holds long enough only when the fiber that moves the clock is preempted holding it (3 runs of
  3000, and none of 6000 with that fiber kept from preemption). The test waits, with no preemption and no `adjust`
  under way, until the sleeper has called its sleep, which it then follows to its latch in one run. Under Effect's
  scheduler none of 600 runs was late, budgets 3 to 12 with 0 to 59 steps before the sleep, by a check not kept. A
  test of step 2 that moves the clock says how its sleepers get to their latch.
- **A pick that starves.** Picking the newest task every time can run one fiber alone forever: a fiber that yields
  until others have moved is always the newest task. The spike caps a run at 100,000 steps so that such a run fails
  instead of hanging; the strategies of step 2 are of the kind that does not starve, or are capped as well.
- **Determinism and choice.** Given the same choices and the same answers of preemption, a run takes the same steps
  and ends the same; 50 seeds give more than 40 different runs; preempting a fiber at chosen steps lets another run
  between two of them (`a fiber yields where the scheduler says, and another runs between two of its steps`); no task
  is left in the queue when a run of the clock's chain ends, while one that interrupts a fiber which has yielded may
  leave the yield's task, which does nothing; and every timer of the platform the test clock sets for its warning is
  cleared by then.
- **Priorities.** Effect gives every task priority 0 at 4.1.1 but one that `Effect.yieldNowWith(priority)` gives,
  which neither the library nor its tests call (**read in the source**: every other `scheduleTask` in `effect/src`
  passes 0); the scheduler ignores them.

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
   **Done**: [What the spike saw](#what-the-spike-saw).
2. **The scheduler**, in `src/testing.ts`: record and replay a schedule; an exploration that runs a scenario under
   every schedule with at most `k` preemptions, and one under PCT. Keep it apart from what `index.ts` exports, as the
   probe is ([decision 0073](0073-what-the-runtime-did-is-told-to-a-probe.md)). It starts from the spike's
   `controlled`, which keeps the rules [What the spike saw](#what-the-spike-saw) found: a fiber's first run let
   through, every later run made to yield once unless it is the first its own task starts or the one that interrupts
   the children of a run that has ended, a schedule as the picks and the answers of preemption, fibers named by their
   id less the run's first, and a cap on the steps of a run. A scenario under it waits for its fibers to be
   at their waits, with no preemption, before it moves the clock, and reads what a move did right after
   `yield* TestClock.adjust(...)`. To decide here: even with no preemption, which ready task runs is a choice at every
   step, so the schedules within `k` preemptions are far more than `k` bounds; an exploration that is exhaustive
   within its bound bounds the picks too, or holds them to an order, as CHESS runs a fiber on until it blocks.
3. **The two interleavings**: a test for each, which fails or hangs with its rule taken out — registering for the
   resumption after the send in `entities` of [`src/runtime.ts`](../../src/runtime.ts) (`awaitResumption`), and
   dropping the lock while others wait in `holding` — and passes with it.
4. **Move the tests under budgets** that the scheduler covers, by `scripts/mutate.ts` against the rules the budgets
   already kill, so that nothing a budget held is lost; say of each one left why.
5. Rewrite this note with what was seen, and take it with the commit that takes the step out of the roadmap.
