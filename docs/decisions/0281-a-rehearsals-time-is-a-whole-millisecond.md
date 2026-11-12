# 0281. A rehearsal's time is a whole millisecond

**Status:** accepted, 2026-11-12, as the fix of bug 93 of [`docs/bugs.md`](../bugs.md). It changes
[decision 0187](0187-a-rehearsal-moves-time-by-a-duration.md): `advance` takes a duration of whole milliseconds only.
It changes [decision 0266](0266-a-timer-that-catches-up-fires-with-a-due-time-that-grows.md), which rested on a
premise it did not write: a message is handled at a whole millisecond. The maintainer chose it on 2026-11-12, after
an opinion of a Fable 5.2 agent.

## Context

A timer due between two milliseconds is a defect of the program, since the storage holds a timer's time as an integer
of milliseconds (decision 0266). A rehearsal's `advance` moved its time by any finite duration (decision 0187). After
`advance(Duration.micros(1500n))`, a message was handled at a time between two milliseconds. A program that arms its
next timer from the time a message is handled at then armed a timer between two milliseconds, and the rehearsal
died. The runtime runs the same program, since it reads its time from `Date.now()`, which is whole. That is bug 93,
which the premise review of area 13 found.

A start time can lie between two milliseconds too. `DateTime.addDuration` with `Duration.micros` gives such a time,
and a test may build its start that way.

## Decision

- **`advance` refuses a duration that is no whole number of milliseconds.** The test fails, as it fails on a
  duration below zero, and the failure names the duration.
- **A rehearsal and a world refuse a start time between two milliseconds.** `rehearse` and `rehearse.together`
  fail the test before the scenario runs, and the failure names the time.
- **So a rehearsal's time is always a whole millisecond.** It starts at one and moves by whole milliseconds. It
  also moves to a timer's due time, which decision 0266 keeps whole. So a message is handled at a whole millisecond,
  as the runtime's clock gives it, and decision 0266's rule on due times holds as written.
- **A duration of microseconds that make whole milliseconds passes.** `Duration.micros(2000n)` moves two
  milliseconds.
- **A program that arms a timer at a time it computes between two milliseconds is still a defect**, in a rehearsal
  and in the runtime alike, as decision 0266 says.

## What it rests on

- That `advance` refuses `Duration.micros(1500n)`, that a rehearsal and a world refuse a start between two
  milliseconds, and that a timer armed after `advance(Duration.micros(2000n))` fires: **tested**, by
  `fails on a duration or a start between two milliseconds, and a timer armed after whole microseconds fires`, in
  [`src/rehearse.test.ts`](../../src/rehearse.test.ts). It fails against the code before this note.
- That `Duration.toMillis` gives a fraction for a duration of microseconds that make no whole millisecond, and a
  whole number for one that does: **tested**, by the same test, whose refusal and whose pass both read it.
- That the runtime reads its time from a clock whose milliseconds are whole: **read in the source** of Effect 4.1.2.
  The runtime reads `DateTime.now`, as in `src/runtime/loop.ts`, and the live clock gives `Date.now()`, in
  `node_modules/effect/src/internal/effect.ts`. The JSDoc of `Clock` promises no integer. A runtime under a
  `TestClock` moved by microseconds may give a time between two milliseconds, which the
  [open question](../open-questions.md#running) A runtime under a clock moved by less than a millisecond holds.
- That a scenario never needs a time between two milliseconds: **chosen**, by the maintainer. No timer, time of a
  message or value stored is finer than a millisecond, so a scenario sees nothing of it.

## Alternatives

- **Keep the exact time, and hand each event its time floored to a whole millisecond.** `advance` would still take
  any duration. `DateTime` holds milliseconds in a floating-point number, so small durations do not add up: the
  Fable 5.2 agent saw five advances of `Duration.micros(200n)` move 0.99976 ms at an epoch of 2026. The rehearsal
  would need a second clock of its own, in nanoseconds, for a resolution no scenario can see.
- **Round each duration to a whole millisecond.** Repeated advances of less than a millisecond would then never move
  time, in silence.
- **Round a timer's due time in the storage instead of refusing it.** It changes what the runtime stores of a
  program's timer, and a timer would fire at a time the program did not ask for.

## Consequences

- `advance` and `startsAt` of [`src/rehearse.ts`](../../src/rehearse.ts) refuse a time between two milliseconds.
- The design's section Rehearsing says that time moves by whole milliseconds.
