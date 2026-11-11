# 0258. The waker measures its sleep from the clock it reads as it rests

**Status:** accepted, 2026-11-11, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the fix of a hang the CI's server found. It changes
[decision 0221](0221-a-timer-sleeps-an-hour-at-most-and-reads-the-wall-clock-again.md): the waker's sleep toward its
next timer is measured from the time it reads after the storage, not before.

## Context

A round of the waker in `waking` of `src/runtime/waker.ts` read the clock, then read the timers due from the storage,
and then slept toward the next timer for its time less the time read first. The clock moves while the storage is
read. With a real clock, the sleep then ends late by the time of the reading. With the test's clock, a move made during
the reading is lost: `TestClock.sleep` counts from the clock's time when the sleep begins, so the waker sleeps past the
timer on a clock that the test moves no more. `settled` sees a stored timer due, and waits for ever.

On SQLite and PGlite the reading ends before the test moves its clock. On the CI's server of PostgreSQL it does not
always. The test `finds the entities whose activation the new program suspends, as a deploy then suspends them`, in
`src/check.test.ts`, timed out in the job of PostgreSQL in runs 43070135997 and 43071959252, once
[decision 0256](0256-a-call-that-waits-for-a-step-is-refused-within-a-transaction.md) had moved the steps of a deploy.
A delay of 30 milliseconds put after the waker's reading made it hang on the maintainer's machine too. With that
delay, four other tests of the files `bun run test:postgres` runs hung as well, and none hung once the waker read
the clock again. A Fable 5.2 agent read the diagnosis and the code, and advised this fix.

## Decision

- **The waker reads the clock again in the step where it looks for a poke and lets its flag down.** The step is the
  one [decision 0068](archive/0068-what-another-fiber-reads-changes-in-one-step.md) makes one step, and the clock is
  read inside it, so no time is lost between the reading and the decision to rest.
- **A next timer whose time has come by then begins the next round at once, with the flag still raised.** So
  `settled` never sees the waker resting while a timer it knows of is due.
- **Otherwise the sleep is the next timer's time less the time read in that step, an hour at most**, as decision 0221
  bounds it.
- **The time read first still decides which entities are due.** The reading of the storage asks for the timers due by
  then, and a timer that comes due during the reading is found by the next round.

## What it rests on

- That a clock moved past a timer during the waker's reading fires the timer, and `settled` returns: **tested** by
  `a clock moved past a timer while the waker reads fires the timer, and settled returns`, in
  `src/runtime/waker.test.ts`. Its clock moves on by 50 milliseconds right after the waker's first reading of it. The
  test hangs against the code before the change.
- That `TestClock.sleep` counts its duration from the clock's time when the sleep begins: **read in the source** of
  Effect at the version pinned, `sleep` of `node_modules/effect/src/testing/TestClock.ts`, which sets the sleep's end
  to `currentTimestamp` plus the duration.
- That `DateTime.now` and `Effect.clockWith` read the same `Clock` service: **read in the source**, as decision 0221
  read it, where `now` of `internal/dateTime.ts` reads `Clock.currentTimeMillis`. The test above provides a `Clock` of
  its own to both, and fails if the waker read another.
- That the premises of decision 0221 still hold: its three tests pass, and its bound of an hour is kept. A sleep ends
  late now by the time of the step alone, and no longer by the time of the reading.
- That the explored tests keep their pinned interleavings, though the waker's step reads the clock: **tested** by
  `bun run test:pins`. The read moved four schedules, and the tests now pin seed 63 for decision 0068's departure, the
  deviation at decision 183 for decision 0068's step, the one at decision 374 for decision 0147 and the one at
  decision 642 for decision 0163, each found by the pin's mutation over every seed from 0. The mutation of the pin
  `0068 the waker` is written for the step as it now is.
