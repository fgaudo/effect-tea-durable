# 0066. The runtime's tests move time, and wait for nothing on a clock

**Status:** accepted, 2026-10-31. Takes the first step of the roadmap that
[decision 0063](0063-the-runtime-waits-for-what-it-waits-for.md) made possible. What it says `TestClock.adjust` does
for a fiber it did not wake holds under the default budget of steps alone, as
[decision 0101](0101-a-moved-clock-gives-a-fiber-it-did-not-wake-one-turn.md) says. A second way to move time, a wall
clock ahead of the sleeps, is added by [decision 0103](0103-a-test-moves-the-wall-clock-ahead-of-the-sleeps.md).
A scheduler of the tests that chooses where fibers yield is added by
[decision 0104](0104-the-runtimes-tests-choose-where-fibers-yield.md), which moves the clock in order.

## Context

The runtime's tests slept for real time, up to 80 milliseconds at once, to let a timer's time come, an entity be
unloaded, or a request reach the point the test wanted it at. A machine under load can outlast any such sleep, and
then a test fails, or passes having seen nothing. Two waits looked every millisecond whether an entity had been
unloaded or an operation had acted. The random sequences ran 25 times, since each run cost the time it slept.

The runtime reads time with `DateTime.now` and waits with `Effect.sleep` and `Effect.timeoutOption`, and none of
its own waits needs real time to pass ([decision 0063](0063-the-runtime-waits-for-what-it-waits-for.md)).
Effect's `TestClock` drives all of them. Its `adjust` wakes the sleeps that are due in the order of their times,
and after each one waits until every fiber it woke, and every fiber those set going, waits again.

## Decision

- **A test's time is the test's own.** Each database of `runtime.test.ts` runs under one `TestClock`, which starts
  at 0 and is shared by every process of the test, as the database is. Time moves only when the test moves it.
- **Waiting for time is moving the clock.** A test that waited for a timer, a passivation or a sleep of its own
  calls `TestClock.adjust` with the same duration, and what that time brings is done when the call returns.
- **A test starts what it waits for with `running`.** `running` forks the effect behind a sleep of a millisecond
  and moves the clock by one, so the effect, and everything it sets going, has run until it waits. That is how a
  request is held at a gate, or queued behind another, before the test goes on. `ran` does the same, and gives what
  the effect gives, for a deploy or a creation whose work must have acted while it holds for ever.
- **Work started any other way is waited for with `settled` before the clock moves.** `settled` says that nothing
  is under way, and `adjust` lets every fiber already started run before it wakes anything, which is when a timer
  armed or a waker that has read the stored timers reaches its sleep.
- **What the clock passed is checked.** The crash table and the random sequences end by asking the storage for
  the timers due at the clock's time: a timer whose sleep the clock never saw would still be due there, where
  the comparison with the machine, which steps only the events that committed, would not see it.
- **Nothing waits on a clock that does not move.** A timeout that only guarded against a hang is dropped, and the
  test runner's timeout reports a hang instead. A condition that was polled is looked at once the clock has moved,
  or waited for on a signal.
- **The random sequences run 500 times.** Callers that arrive between two other commands start together, so they
  still meet in the mailbox. A resume, a discard and a wait follow the callers before them.

## Alternatives

- **Longer sleeps**, which make a failure under load rarer and each run slower, and still let a test pass having
  seen nothing.
- **Real time with hooks for every point a test waits for.** The runtime would grow options that only tests use,
  and a timer's time would still be real time to wait for.
- **A clock of the runtime's own, given in its options.** `Clock` is already the service that Effect gives every
  fiber, and `TestClock` replaces it without the runtime knowing.

## Consequences

- The runtime's tests took 4.8 seconds with 25 random runs. They take 0.7 with as many, and under 3 with 500.
  Five thousand runs found nothing.
- A test cannot see a race that only real time between two fibers would show: a fiber that the clock wakes runs
  until it waits before the next one wakes. The concurrency the tests still exercise is that of fibers started
  together, which interleave wherever they wait.
- A fiber started outside a wake that needs more than one turn to reach its sleep would miss the clock's move.
  The runtime has none today, and the check of what the clock passed is what would show one.
- Every `running` moves the clock a millisecond, which a test that counts time counts with it.
- [`examples/booking/runtime.test.ts`](../../examples/booking/runtime.test.ts) still runs on real time, as an
  example of how a program is run. Its one sleep only makes the inventory's deploy come late, so a slow machine
  makes the test weaker, never wrong.
