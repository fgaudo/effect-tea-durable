# 0101. A moved clock gives a fiber it did not wake one turn

**Status:** accepted, 2026-10-31. Corrects a premise of
[decision 0066](0066-the-runtimes-tests-move-time.md): `TestClock.adjust` runs until they wait only the fibers it
wakes and what they set going; its decision stands.

## Context

Decision 0066 has the runtime's tests move a `TestClock`, and rests on what `adjust` waits for. Of the fibers it wakes
it says they, and every fiber they set going, run until they wait before the next sleep is woken. Of the others it
says that "`adjust` lets every fiber already started run before it wakes anything, which is when a timer armed or a
waker that has read the stored timers reaches its sleep", and, among its consequences, that a fiber started outside
a wake that needs more than one turn to reach its sleep would miss the move, which the runtime has none of.

The review of 0061 to 0075 checked it in a spike, `spikes/effect-testclock-adjust.test.ts`. The first holds under any
budget of steps. The second is one turn: `adjust` waits for a fiber of its own that yields once, and a fiber forked
before it runs for that turn, of as many steps as `Scheduler.MaxOpsBeforeYield` gives. Under the default, 2048 steps,
the fibers the runtime starts reach their sleep in it. Under the budgets the tests of decisions
[0068](0068-what-another-fiber-reads-changes-in-one-step.md), [0070](0070-reindex-writes-a-row-only-over-its-state.md),
[0075](0075-a-name-is-deployed-once-in-a-process.md), [0076](0076-a-process-over-its-capacity-unloads-the-least-recently-used.md)
and [0078](0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md) run, from 3 steps, a fiber
that does any work before its sleep may not: it reaches it later, and sleeps from the time the clock was moved to. A
timer armed by a creation the test called itself, or the wait of the loop that passivates the entity, may then end
later than its time.

## Decision

- **Under the default budget, 0066 holds as written**: what `settled` says is under way is done, and every fiber the
  runtime started has reached its sleep, when `adjust` wakes anything.
- **Under a smaller budget, a test says what holds once the clock has passed, not when.** A test run under every
  budget moves the clock past each time it waits for, and then far enough again for a sleep registered one move late,
  and asserts what the runtime did by then. The tests that run under budgets do so today: each that waits for a time
  ends by moving the clock 60 milliseconds or more past every time the toy sets, and none asserts what holds before.
- Work a test wants done before it moves the clock under a budget is started with `running`, whose fiber the clock
  wakes, and which `adjust` follows to its end.

## What it rests on

- `adjust` runs the fibers it wakes, and what they set going, until they wait, under any budget: **seen**, in
  `spikes/effect-testclock-adjust.test.ts`, at `effect` 4.1.1.
- A fiber forked before `adjust` is given one turn of the budget: **seen**, in the same spike; **read in the source**,
  `run` in `TestClock.ts`, which waits for a fiber that yields once before it wakes the first sleep.
- Under the default budget, a timer the runtime arms has reached its sleep when the clock moves: **tested**, by
  `a timer fires at its time, and not before`, in [`src/runtime.test.ts`](../../src/runtime.test.ts).
- The tests under budgets assert what holds once the clock has passed every time they wait for: **reasoned**, read in
  [`src/runtime.test.ts`](../../src/runtime.test.ts); a test added under a budget is read the same way.

## Alternatives

- **Moving the clock in more steps of a millisecond under a budget**, so that a fiber has more turns to reach its
  sleep. How many it needs depends on the budget and on what the runtime does before it sleeps, which changes with
  the runtime.
- **A `settled` that waits for every timer to reach its sleep.** A timer's fiber is not work under way, and the
  runtime would count something for its tests alone, which 0066 rejected in its alternatives.

## Consequences

- 0066's check of what the clock passed, the timers due at the end of the crash table and of the random sequences,
  runs under the default budget, where the premise holds. A timer late by a move is caught by the tests around it:
  `a timer fires at its time, and not before`, in [`src/runtime.test.ts`](../../src/runtime.test.ts), moves the
  clock to a millisecond before the toy's timer and then onto it. Made to yield five times or more before its sleep,
  a timer fails it and seventeen other tests of the runtime; made to yield twice, it reaches its sleep while
  `settled` waits, and fires on its time.
- A test that asserts when, not only what, runs under the default budget.
