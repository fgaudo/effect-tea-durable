# 0103. A test moves the wall clock ahead of the sleeps

**Status:** accepted, 2026-11-01. Adds to [decision 0066](0066-the-runtimes-tests-move-time.md) a second way for a
test to move time, and corrects [decision 0078](0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md),
which said no test reaches its readings of a timer due. Found by the review of 0076 to 0079.

## Context

The runtime's tests move a `TestClock` with `adjust`, which wakes each sleep it passes and waits for what it wakes
([decision 0066](0066-the-runtimes-tests-move-time.md)). On it, time never passes between two steps of a fiber, nor
between a sleep's time and its waking. A real clock does both, and several rules are about what the runtime reads
then:

- An entity is spare only while none of its timers is due, read when it is told to leave and again when its loop
  takes that ([decision 0078](0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md)). 0078
  said no test reaches either reading, since on the test clock a timer due fires as it is armed.
- `settled` counts a stored timer, or a retry of the waker, whose time has come and that has not run
  ([decisions 0029](0029-an-idle-entity-is-unloaded.md), [0077](0077-the-waker-tries-an-entity-it-cannot-load-again.md)).
  On the test clock the waker runs inside the `adjust` that brings that time, so `settled` never looks between them.

The review took these rules out one at a time, and no test failed.

## Decision

- **A test may run the wall clock ahead of the sleeps**: `ahead` in [`src/runtime.test.ts`](../../../src/runtime.test.ts)
  is a `Clock` that gives the test clock's time plus `by.millis`, set in one step, and hands its sleeps to the test
  clock. What the runtime reads of the time moves with it, and no sleep wakes until `adjust` moves the test clock.
- It stands for a real clock that has moved between two steps, and is set where the test wants that step: in a
  probe's point, or between two calls of the test's own. `adjust` is called through `ahead`, which gives it the test
  clock.

## What it rests on

- `DateTime.now` reads the `Clock` the fiber is given; a sleep handed to the test clock wakes when its time comes
  there and not before; `TestClock.adjust` finds the test clock through the `Clock`, and fails under another: **seen**,
  in `spikes/effect-clock-ahead.test.ts`, at `effect` 4.1.1.
- The runtime reads the time only through `DateTime.now` and sleeps only through `Effect.sleep`: **reasoned**, read in
  [`src/runtime.ts`](../../../src/runtime.ts); a reading of `Date.now` there would not move with the test.
- Each rule above fails a test once taken out: **tested**, in [`src/runtime.test.ts`](../../../src/runtime.test.ts):
  `an entity whose timer comes due before it takes the telling to leave stays, and fires`,
  `an entity whose timer is due by the clock is not spare, and the next least recently used leaves`, and
  `the process is not settled while a stored timer or a retry has come by the clock and not run`.

## Alternatives

- **A test on the real clock.** It reaches the same readings by chance, as the run of twenty entities 0078 tells of
  did, and fails or passes with the load of the machine.
- **A point of the probe where the loop takes the telling to leave.** It would hold the loop, not move the time, and
  the runtime would have a point for its tests alone, which 0066 rejected.

## Consequences

- A test that sets `by.millis` keeps it while the step it stands for runs: a reset as soon as the test's own call
  returns can come before the fibers that call woke have read the time.
