# 0194. A timer months away sleeps on Effect's promise of a duration, which Effect keeps by timers of the host in turn

**Status:** accepted, 2026-11-08, with the step A timer months away of the [roadmap](../roadmap.md). Adds to what the
timers of [decision 0029](archive/0029-an-idle-entity-is-unloaded.md) rest on.

## Context

A timer is slept by the runtime in two places. A loaded entity arms its timer as a sleep until the timer's time
([`src/runtime.ts`](../../src/runtime.ts), `arm`). The waker sleeps until the earliest time a timer of an unloaded
entity is due (`waking`, [decision 0029](archive/0029-an-idle-entity-is-unloaded.md)). Both sleep by
`Effect.sleep`, for the milliseconds left until the time.

A subscription renews each month ([`examples/subscription`](../../examples/subscription)), and a month is longer than
2^31 − 1 milliseconds, about 24.8 days. A host's `setTimeout` holds no longer delay. Bun, as Node, sets a longer
delay to one millisecond, with a `TimeoutOverflowWarning`. A sleep handed to the host whole would end at once. A
loaded entity's renewal would then fire a month early, and a waker with a month to wait would read the storage
every millisecond.

## Decision

- **A timer's sleep stays `Effect.sleep`, for the whole time left, and the runtime splits nothing.** The JSDoc of
  `Effect.sleep`, a stable API, promises that it suspends the fiber for the duration given, with no bound on it.
  At 4.1.2 the default clock keeps that promise past the host's limit. It sets a timer of at most 2^31 − 1
  milliseconds, and once that one fires, a timer for the rest, until the duration has passed.
- **A spike sees the pieces at the version pinned.**
  [`spikes/effect-sleep-past-the-host-timer.test.ts`](../../spikes/effect-sleep-past-the-host-timer.test.ts) stubs
  the host's long timers. It checks that a sleep of two host timers and five milliseconds is set as two timers of
  2^31 − 1 in turn, and then a short one. It checks that an interrupted sleep clears the piece pending, since an
  unloaded entity's sleeps are interrupted. A move of Effect's version runs it.

## What it rests on

- That `Effect.sleep` suspends a fiber for the duration given, however long: **documented** in the JSDoc of
  `Effect.sleep` in `node_modules/effect/src/Effect.ts` at 4.1.2, a stable module.
- That the default clock sets a duration past 2^31 − 1 milliseconds as timers of that length in turn: **seen in a
  spike**, by `a sleep of two host timers and five milliseconds is set as timers of 2^31 − 1, one after the other`,
  and **read in a dependency's source**, `ClockImpl.sleepMillis` in `node_modules/effect/src/internal/effect.ts`.
  The JSDoc does not say how the promise is kept. A move of Effect's version that broke it would fail the spike.
- That the host fires a longer delay at once: **seen in a spike**, by `a delay past 2^31 − 1 milliseconds is fired
  at once by the host`, on Bun 1.4.2. It is why the pieces matter, and no rule rests on it.
- That an interrupted sleep leaves no timer of the host behind: **seen in a spike**, by `an interrupted sleep clears
  the piece pending`.
- That the runtime sleeps by `Effect.sleep` alone, and sets no timer of the host itself: **only reasoned**, from a
  reading of `src/`, where no module calls `setTimeout`.
- That a timer fires at the time it stores: **only reasoned**, and not wholly held. A sleep measures the time left
  on the host's timers from the moment it is set. The time a timer stores is read on the wall clock. A host
  suspended during the sleep ends it late. A wall clock set back ends a loaded entity's sleep early, and its timer
  fires before its time. The waker activates only the entities whose time has come on the wall clock, so it fires
  none early. The
  [open question](../open-questions.md#running) says what would decide it.

## Alternatives

- **The runtime sleeps in pieces of its own**, of at most 2^31 − 1 milliseconds, reading the clock between two.
  It guards against a release of Effect that stops splitting, which a promise of a stable API excludes within the
  major, and which the spike would catch. It adds a yield to every timer past the limit, and the
  pinned seeds of the explored tests would be found again for a guard that changes nothing at 4.1.2.
- **A rule that a timer lies within 2^31 − 1 milliseconds**, checked by the machine. A monthly renewal is the case
  the timers are for, and the rule would forbid it.

## Consequences

- No test of the runtime or of a rehearsal sees the pieces. Both run on `TestClock`, whose sleeps set no timer of the
  host, as the JSDoc of `effect/testing`'s `TestClock` says. The spike alone sees them.
- [`src/runtime.ts`](../../src/runtime.ts) and [`src/machine.ts`](../../src/machine.ts) are untouched.
