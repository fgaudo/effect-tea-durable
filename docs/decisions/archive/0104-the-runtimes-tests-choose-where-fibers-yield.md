# 0104. The runtime's tests choose where fibers yield

**Status:** accepted, 2026-11-01. Adds to [decision 0066](0066-the-runtimes-tests-move-time.md) and
[decision 0068](0068-what-another-fiber-reads-changes-in-one-step.md) a way to reach interleavings that no budget of
steps reaches, and moves the runtime's tests under budgets onto it. The spike is
[`spikes/effect-scheduler-controlled.test.ts`](../../../spikes/effect-scheduler-controlled.test.ts), the scheduler is in
[`src/testing.ts`](../../../src/testing.ts), and the tests are in [`src/runtime.test.ts`](../../../src/runtime.test.ts).
Moving them found [decision 0109](0109-settled-waits-for-an-entity-unloading.md) and
[decision 0110](0110-detached-work-is-counted-until-it-ends-however-it-ends.md).

## Context

The runtime's tests reach interleavings by running a scenario under every budget of steps,
`Scheduler.MaxOpsBeforeYield` from 3 up ([decision 0068](0068-what-another-fiber-reads-changes-in-one-step.md)), and
some by the yields of the test's own fiber before it acts, as `a deploy interrupted anywhere keeps its name and its
waker, or stops what it started` does. A budget makes every fiber yield at the same rhythm: it samples the
interleavings, and a fiber that would have to yield at one point while another runs on cannot be made to.

What that leaves:

- **Two interleavings no budget reaches**, left reasoned by the [review of 0061 to 0075](../README.md#reviews) and named
  by the roadmap's Cluster step, to be read again before it is done: a sender that registers for its receiver's
  resumption only after it is answered `Suspended` ([decision 0063](0063-the-runtime-waits-for-what-it-waits-for.md)),
  and an entity's lock dropped while others still wait for it
  ([decision 0067](0067-each-entity-is-held-by-its-own-lock.md)). Reaching them takes a point in the runtime where a
  test holds a fiber, which [decision 0066](0066-the-runtimes-tests-move-time.md) rejected: a point for the tests alone.
- **Samples, not every interleaving.** The review of 0076 to 0079 found two bugs of a deploy interrupted between two
  steps ([decision 0102](0102-a-deploy-interrupted-before-it-registers-undoes-itself.md)) by yields from 0 to 180 under
  budgets 3 to 6, and that these are every point an interruption is seen is only reasoned there.

## Decision

- **A test runs the runtime under a scheduler it controls.** Effect's `Scheduler` service has two hooks:
  `shouldYield(fiber)`, asked as a fiber runs, which says whether it yields now, and `makeDispatcher()`, whose
  `scheduleTask(task, priority)` queues the fibers ready to run. A scheduler of the tests', in
  [`src/testing.ts`](../../../src/testing.ts), answers `shouldYield` and picks the next task from a **schedule**: a
  sequence of choices, recorded as the run makes them, so that a run that fails is replayed exactly from it.
- **The runtime is not touched.** The choices are the scheduler's, where any fiber yields or resumes; no point of the
  probe is added, and 0066's rejection stands.
- **Exploration, not every schedule.** A schedule over a scenario of thousands of steps has too many orders to run them
  all. Two strategies, compared on the runtime:
  - **delay bounding**: every schedule that deviates at most `k` times from the run in order, `k` of 1 or 2, which is
    exhaustive within the bound, and most bugs of concurrency need few. A deviation is a preemption, as in CHESS's
    preemption bounding, or a pick of any task but the oldest. The picks are counted too, since a pick is a choice at
    every step here, and the schedules would be unbounded otherwise ([The scheduler](#the-scheduler));
  - **PCT**, probabilistic concurrency testing: fibers given random priorities, changed at `d - 1` random points,
    which finds a bug of depth `d` with a probability the method bounds, in far fewer runs.
- **The two interleavings above are reached**, each by a test that fails or hangs once the rule that keeps it is taken
  out ([The two interleavings](#the-two-interleavings)).
- **The runtime's tests run under PCT**, at depth 4 over 2,000 seeds, exploring only where they do not move the clock.
  Delay bounding over a whole process takes about 1,450 runs at one deviation and a million at two, so it is kept for
  a point between two steps of one fiber, within a window, as the deploy interrupted needs.
- **No test of the runtime runs under budgets any more.** Each of the thirteen is run under the scheduler instead,
  over a database of its own, and kills every mutation the budgets killed, but two that decision 0109 made no test
  kill ([The tests moved from budgets](#the-tests-moved-from-budgets)).

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
  the same choices takes the same steps, its fibers counted from its first`; for a process of the runtime, **seen**
  since the scheduler, in order and under PCT, the first run of the process included (`a process runs to its end under the
  scheduler of the tests, which needs nothing of the platform`); for every scenario of it, **reasoned**: the
  SQLite client is synchronous, each call an `Effect.try` over `bun:sqlite` (**read in the source**,
  `@effect/sql-sqlite-bun` `SqliteClient.ts`), time is the test clock's, and the library reads no other clock (`the
  library reads the time and sleeps through Effect alone, which a test moves`, in
  [`src/runtime.test.ts`](../../../src/runtime.test.ts)). Fiber ids are not the same across two runs: Effect counts them
  for the process (`fiberIdStore` in `internal/effect.ts`), so a schedule names a fiber by its id less the run's first.
- The scheduler composes with the test clock: **read in the source**, `TestClock.layer` builds its scheduler over the
  `Scheduler` it finds, wrapping `scheduleTask` to follow what a wake sets going (`TestClock.ts`, `makeWithScheduler`),
  so the controlled one is provided beneath it. That `adjust` still waits for what it wakes, and for what that sets
  going, when the tasks are picked out of order and every fiber may be preempted, the one that moves the clock
  included: **seen**, `adjust waits for what it wakes, and for what that sets going, whichever task is picked`, in
  8000 runs, given that every fiber it wakes is at its wait when the clock moves — which out of order is less often
  so, and for a sleeper is not seen by the test, below.
- What the scheduler reaches, Effect can give. Under `inline` resumptions ([Two models](#two-models)) a run makes
  only the yields Effect's scheduler makes, at steps a strategy picks instead of a budget, so each order is one Effect
  gives: **seen** for a `Deferred`, `under inline resumptions a fiber a Deferred resumes runs before its resumer goes
  on, as under Effect`, and for the rest **read in the source**, since Effect never yields at a fiber's first step
  under a budget above 1. Under `queued` resumptions a fiber also yields before its first step after a resumption,
  which Effect's scheduler never does at 4.1.1: those orders are not ones it gives, and that is what `queued` is for.
  What makes them sound is that Effect promises no inline resumption: **documented**, by its absence, since neither
  `Deferred`, nor `Effect.callback`, nor `Scheduler` says when a waiter resumes or on which stack, and
  `Effect.callback`'s own example resumes from a microtask (`effect/src`, 4.1.1). The cases found where that yield
  changes an end Effect's semantics fixes, a fiber's first run and the run of one that has ended and interrupts its
  children, are let through.
- The two interleavings need a fiber to yield where the others do not: **seen**, both under `inline` resumptions,
  which PCT at depth 4 reaches and no budget does ([The two interleavings](#the-two-interleavings)).
- A test explores the schedules only where it does not move the clock: **seen**, explored across its moves, the
  first of the moved tests fails at seed 1, a passivation's sleeper not at its latch, and still fails with the fiber
  that moves the clock kept from preemption ([The tests moved from budgets](#the-tests-moved-from-budgets)).
- What the moved tests hold, the budgets held: **seen**, by two runs of 56 mutations, below. That they hold every rule
  a budget held is only as true as the mutations are many: a rule none of them takes out is not checked.

## What the spike saw

At `effect` 4.1.1, in [`spikes/effect-scheduler-controlled.test.ts`](../../../spikes/effect-scheduler-controlled.test.ts),
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
  by such a fiber after another was let run, a fiber waits for its pick). The runtime calls neither
  `startImmediately` nor `runFork`, and sets no `PreventSchedulerYield` (`src/runtime.ts`, **read in the source**).
  It starts children inline all the same, through `timeoutOption` and `raceFirst`, which this spike did not see
  ([The tests moved from budgets](#the-tests-moved-from-budgets)).
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
  of 200, the others in none. A test under the scheduler reads right after `yield* TestClock.adjust(...)`, or by `map`, with no
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
  test under the scheduler moves the clock with its window closed, in order
  ([The tests moved from budgets](#the-tests-moved-from-budgets)).
- **A pick that starves.** Picking the newest task every time can run one fiber alone forever: a fiber that yields
  until others have moved is always the newest task. The spike caps a run at 100,000 steps so that such a run fails
  instead of hanging; the strategies of the scheduler are of the kind that does not starve, or are capped as well.
- **Determinism and choice.** Given the same choices and the same answers of preemption, a run takes the same steps
  and ends the same; 50 seeds give more than 40 different runs; preempting a fiber at chosen steps lets another run
  between two of them (`a fiber yields where the scheduler says, and another runs between two of its steps`); no task
  is left in the queue when a run of the clock's chain ends, while one that interrupts a fiber which has yielded may
  leave the yield's task, which does nothing; and every timer of the platform the test clock sets for its warning is
  cleared by then.
- **Priorities.** Effect gives every task priority 0 at 4.1.1 but one that `Effect.yieldNowWith(priority)` gives,
  which neither the library nor its tests call (**read in the source**: every other `scheduleTask` in `effect/src`
  passes 0); the scheduler ignores them.

## The scheduler

In [`src/testing.ts`](../../../src/testing.ts), tested in
[`src/testing.test.ts`](../../../src/testing.test.ts). It is apart from what `index.ts` exports.

- **`scheduled(effect, strategy)`** runs an effect under the spike's `controlled`, with its rules as they were
  found, stepped by hand and synchronously until it ends, nothing is ready, a million tasks have run, or it stops. A
  **strategy** answers two questions: which ready task runs, and whether the fiber running yields at a step. It is
  asked the first only when more than one task is ready, and the second only when another is ready: elsewhere the
  answer changes nothing, and asking would only make the schedules more. The answers, in order, are the run's
  **schedule**, and `replayed` runs it again from them. A replay that asks more or fewer decisions than its schedule
  holds did not take the same steps, and throws, as a pick of no task does. Fibers are counted from the root, which
  asks the scheduler first, since Effect runs it inline as it forks it (`runForkWith`, **read in the source**). A run
  ends with its root, and counts the tasks still ready then, which it does not run: a fiber the root did not wait
  for stops where it was. A dispatcher of the scheduler refuses a `flush`: Effect flushes only those of its own
  `runSync` and of a schema's standard validation, each with a scheduler of its own (**read in the source**), and a
  flush inside a task would run other tasks within it, where the rules above read the task under way.
- **A run stops on what it cannot step past.** Two cases stop it, and once stopped, each fiber that asks the
  scheduler yields, which ends the task under way, and no other task runs.
  - **What a strategy or a flush throws is thrown by `scheduled`.** Effect asks `shouldYield` inside the `try` of
    its `runLoop`, takes what it throws for a defect of the fiber, and asks again (**read in the source**,
    `internal/effect.ts`). So a strategy that throws once would end a run that catches defects as if nothing
    failed, and one that always throws would spin there forever (`a strategy that throws stops its run, which
    throws it, even where the effect catches it`, and `a dispatcher of the scheduler refuses a flush inside a run,
    even one the effect catches`).
  - **A task that asks a million times to yield spun**, as a fiber that never waits does, `Effect.forever` with
    `disableYield` among them. Effect's own scheduler preempts it, and the strategy in order never does, so it
    runs within one task forever, which the count of tasks never stops. The run says it spun, and an exploration
    fails it (`a fiber that never waits stops its run, rather than running it forever`, which hangs without it).
- **The fiber of a task.** A strategy is told, for each ready task, the fiber it resumes, where the scheduler made
  that fiber yield, by a preemption or by the yield before a resumption. Effect schedules the task of such a yield in
  the same step as `shouldYield` answers (`runLoop` and `yieldNowWith` in `internal/effect.ts`, **read in the
  source**), so the next task scheduled is its. Any other task names no fiber: a fork, the wake of a `Queue` or a
  `Semaphore`, or a fiber's own `yieldNow`. Effect gives the dispatcher no fiber for those.
- **`everySchedule(effect, { bound }, check)`** is delay bounding. It runs the schedule in order, the oldest task
  first and no preemption. A fiber runs on until it waits there, as under Effect's scheduler with an unbounded
  budget, but for the yield before each resumption, which queues a fiber Effect would resume inline. Then, for each decision after the
  last deviation, it runs each other way that decision can go, up to `bound` deviations. The decisions before the
  last deviation go the same way as in the run that found it, since a run is deterministic given its decisions.
  Within the bound it is exhaustive, each schedule run once, which a count of its own checks (`every schedule within
  two deviations is every one, each run once`). A failure names the deviations that replay it, which `deviated`
  takes to run that schedule alone, and the exploration throws past
  a cap on its runs, so that a bound too large for a scenario says so.
- **`prioritizedSchedules(effect, { runs, depth }, check)`** is PCT. A fiber's priority is drawn as it is first
  seen. The ready task of the highest fiber runs, and a fiber yields once a higher one is ready. At `depth - 1`
  steps, drawn among those a run in order is asked of preemption, the fiber running is lowered beneath every first
  priority. Two rules are added to the method, each held by a test:
  - **A task that names no fiber has a priority between the lowered and the first.** Beneath the lowered, a fork
    never runs while the fiber that forked it is ready, and a lost update needing one preemption is not reached at
    depth 2 (`prioritized schedules reach the lost update at depth 2, and name the seed that replays it`).
  - **After ten times the steps a run in order takes, the strategy runs in order.** A fiber lowered beneath one that
    spins on `yieldNow` waiting for it never runs again under strict priorities. In order every ready task runs in
    turn, so a run that ends under a fair scheduler ends here too, as Coyote's PCT turns fair after its unfair steps
    (`a fiber that spins on its own yield starves no other under prioritized schedules`, which hangs to the cap
    without the rule).
- **The spike's rules hold under every schedule within 1 or 2 deviations**: fibers a `Deferred` resumes run in
  either order, within 1; within 2, a fiber interrupted before it starts either ran to its end or did not run, a
  fiber that yielded and is interrupted runs its finalizer only once picked, and a fiber whose run ends interrupts its
  children before they go on. One guard is reached here and not in the spike: forgetting, as each task starts, the
  fiber let run last. Kept from one task to the next, it has a fiber resumed in a later task taken for one whose run
  has ended, which runs on without its pick, and `a fiber whose run ends interrupts its children before they go on,
  under every schedule` fails.
- **PCT's changes fall at distinct steps.** Two drawn at one step would be one change, and the run of a lower depth
  than asked (`prioritized schedules change the priority at as many steps as their depth asks`).
- **Each rule fails a test once taken out, but one.** Twenty-four rules of the scheduler and of its two strategies
  were taken out one at a time with [`scripts/mutate.ts`](../../../scripts/mutate.ts). Five failed no test at first: a
  pick asked with one task ready, a task naming no fiber, a fiber not yielding to a higher one, a change of priority
  without a yield, and a run that did not end passing its check. Each has a test now. The one left counts the fibers
  from the first the scheduler names rather than from the root: the root is asked of preemption before any other
  fiber in every run, as it forks before the others run, so the two count from the same fiber, and no test can
  tell them apart.
- **A process of the runtime runs to its end under it**, with nothing of the platform's: **seen**, `a process runs
  to its end under the scheduler of the tests, which needs nothing of the platform`, in
  [`src/runtime.test.ts`](../../../src/runtime.test.ts), a creation, a passivation and a timer that wakes the entity.
  So the premise that the SQLite client and the test clock need no microtask holds of a whole process, which it
  was only reasoned of.
- **What exploring that process costs**, seen by a check not kept: a run in order asks 14 picks and 1,434
  preemptions, and takes about 5 milliseconds. Every schedule within one deviation is about 1,450 runs, some
  seconds; within two, about a million, which no suite runs. PCT at depth 2 ran 50 seeds in a quarter of a second,
  and each ended. So the runtime's tests run PCT, whose cost the number of runs bounds.

## Two models

`scheduled` and its explorations take how a resumed fiber runs, `Resumptions` in
[`src/testing.ts`](../../../src/testing.ts):

- **`queued`**, the default, is the spike's: a fiber a `Deferred`, a `Fiber.join` or a callback resumes yields first,
  and waits for its pick. It reaches orders Effect gives only when resumptions are not inline, as with an asynchronous
  driver.
- **`inline`** lets it run on where Effect resumes it, so that a run gives only orders Effect's scheduler gives, but
  for where the strategy preempts and what it picks.
- **Neither holds the other.** Queued, a waiter never runs before the step in which its resumer completed the
  `Deferred`, which inline it always does (`under inline resumptions a fiber a Deferred resumes runs before its resumer
  goes on, as under Effect`). So a bug found under `inline` is one of Effect as it runs today, and one found only under
  `queued` is one of a runtime whose resumptions are not inline, which Effect does not promise.

## The two interleavings

In [`src/runtime.test.ts`](../../../src/runtime.test.ts). Both are reached under `inline` resumptions, so each is a bug
of the runtime on Effect as it runs today. Each test runs under `explored`, below, with its window closed until its
callers arrive, and PCT at depth 4 from there, over 2,000 seeds, with the steps counted from there too. PCT over the
whole run spends its changes of priority among the steps of the creation and the passivation, and finds them far
less often. Running in order before the callers also follows the passivation, which preempted it may not be
([What the spike saw](#what-the-spike-saw)).

- **A sender that registers for the resumption only after it is answered `Suspended`**: `a sender answered Suspended is
  woken by the resumption, under prioritized schedules from its arrival`. An operation of a second program sends to a
  toy suspended on a message, while the test discards that message. With the registration moved after the answer, 25
  seeds of 2,000 do not end: the sender waits for ever (**seen**, by a mutation not kept). Under `queued` the run in
  order does not end either: the toy applies the discard in the task that answers the sender, which waits for its
  pick. Under Effect's own scheduler the mutation passes under budgets 3, 4, 5, 8 and 2048, and under `inline` within
  one deviation (**seen**, by checks not kept): it takes a sender preempted between the answer and the registration,
  while the toy runs on to the discard.
- **An entity's lock dropped while others wait for it**: `callers of an unloaded entity build one machine for it, under
  prioritized schedules from their arrival`. Two callers send at once to an entity just passivated. With the lock
  dropped by any user, a caller that waits for the lock gets it while a new taker holds a lock of its own, and both
  activate the entity: two `Restart`s for one passivation, in 96 seeds of 2,000 (**seen**, by a mutation not kept,
  traced to the two activations). Under `queued` 10 seeds of 2,000 found it, with the callers started by `Effect.all`.
  Neither delay bounding at 1 nor Effect's own scheduler under budgets 3 to 60 does (**seen**, by checks not kept).
- **What a test of 2,000 runs misses.** A run finds the first with a probability near 1 in 80, and the second near 1
  in 20. If the steps move, so that other seeds are drawn, 2,000 runs miss either with a probability below e^-25.

## The tests moved from budgets

Thirteen tests of [`src/runtime.test.ts`](../../../src/runtime.test.ts) ran a scenario under every budget of steps, from
3 up, and two of them under counts of the test's own yields as well. Each runs under `explored` now, and no test of
the runtime sets `Scheduler.MaxOpsBeforeYield`.

- **`explored(test, ended, { runs, depth, open })`** runs a test over a database of its own, under `runs` prioritized
  schedules at `depth`, 2,000 at 4 by default, with `inline` resumptions. Each run must give `ended`, and one that
  does not end fails, with the seed that replays it. It is the tests' own, beside the scheduler, since it builds the
  database and the test clock of the runtime's tests.
- **A window says where a run is explored.** While it is open, PCT preempts and picks; while it is closed, the run goes
  in order. PCT draws its changes among the steps a run in order is asked of preemption with the window open. A test
  opens it where its concurrency starts, and the reindex, the prune, the deploy interrupted and the two interleavings
  do so.
- **The clock moves with the window closed** (`adjusted`). Explored across a move, the first test failed at seed 1: the
  passivation's sleeper was not at its latch, as the spike found it may not be. Keeping only the fiber that moves the
  clock from preemption still failed. A drain in order before the move passed, but hid a bug the budgets found: it
  applied the events `settled` had returned before, so a mutation that counts an event only once it is taken survived.
  So what a move sets going runs in order, and the test reads the entity right after each `settled` instead, where an
  early return shows.
- **What runs at once is forked** (`together`). Effect starts the children of a concurrent `Effect.all`, and of
  `raceFirst` and `timeoutOption`, inline, on their parent's stack (`forkUnsafe` with `startImmediately`, in
  `internal/effect.ts`, **read in the source**). The scheduler asks a fiber to yield only while another task is ready,
  so under `Effect.all` the first child ran to its first wait before the second was forked. In the prune's test no
  step was asked of preemption at all, and the consumer's reading always came before the prune. Forked as tasks of
  their own, both orders come. That a child started inline is not asked with nothing ready is an
  [open question](../../open-questions.md#running).
- **`ran` is not used under it.** It moves the clock to wait for what it starts, which would run it all in order.
- **The deploy interrupted anywhere keeps the test's own yields**, one count a run, from 0 to 199, before it
  interrupts. Under PCT alone the forked deploy seldom ran as far as its registration before the interruption, and a
  mutation that gives the name back to a registered deploy survived 2,000 seeds; with the counts it fails.
- **Nothing a budget held is lost to the move.** 56 mutations of the rules of decisions 0039, 0063, 0067, 0068, 0070,
  0075 to 0080 and 0102 were run against the whole suite before and after, each recording every test it failed, and
  six more for decisions 0109 and 0110 after. Before, 17 were killed by a test under budgets alone. After, every
  mutation killed before is killed still, but two, and every mutation of 0109 and 0110 is killed but one. The two are
  rules of 0068: `leave` sets the waker's flag in the step it pokes it, and the waker clears its flag in the step it
  finds no poke. No test kills either since decision 0109, the tests under budgets included, run against the runtime
  with it: they are lost to 0109, not to the move, and are left to the next review. The one of 0109 counts the unload
  only once the entity has left, which no test can tell from the count taken before.
- **Two decisions were found here**, each an order no budget reached. `a process over its capacity unloads its least
  recently used idle entity, under prioritized schedules` failed at seed 0: `settled` returned while the entity told
  to leave was stopping its timers ([decision 0109](0109-settled-waits-for-an-entity-unloading.md)). `a deploy
  interrupted anywhere keeps its name and its waker, or stops what it started` did not end at seed 1000: the deploy's
  scope stopped a detached activation before its first step, and the count of what runs detached was never given back
  ([decision 0110](0110-detached-work-is-counted-until-it-ends-however-it-ends.md)).
- **What it costs.** The runtime's tests ran in 34 seconds under budgets, and run in 113 under the scheduler, on the
  same machine; most of it is the 2,000 runs of each test.

## Alternatives

- **Points of the probe where a test holds a fiber.** Rejected by [decision 0066](0066-the-runtimes-tests-move-time.md):
  the runtime would carry points for its tests alone.
- **A model of the runtime checked by TLA+.** It would check every state of the model, not of the code, and the model
  would be kept in step with [`src/runtime.ts`](../../../src/runtime.ts) by hand. Worth it later, for what no scheduler of
  one process reaches: the fence between processes on Cluster
  ([decision 0084](../0084-a-step-commits-only-where-the-commit-checks-the-shard.md)).
- **More budgets and more yields.** Each run costs the suite seconds, and it stays a sample of the same kind.
- **The real clock under load.** It reaches interleavings by chance, and does not replay them.

## Consequences

- [`src/testing.ts`](../../../src/testing.ts) has the scheduler and the explorations, and
  [`src/runtime.test.ts`](../../../src/runtime.test.ts) runs its tests of interleavings under `explored`. A failure names
  the seed that replays it.
- A test of an interleaving forks what it runs at once, moves the clock with its window closed, and reads what
  `settled` waited for right after it.
- The Cluster step changes the runtime's concurrency: the scheduler goes on with it, and the moved tests may be
  rewritten then.
