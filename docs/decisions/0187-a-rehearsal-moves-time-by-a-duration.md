# 0187. A rehearsal moves time by a duration, and fires the timers due within it

**Status:** accepted, 2026-11-08, with the step The API before the release of the [roadmap](../roadmap.md). Changes
what [decision 0014](archive/0014-rules-the-machine-settled.md) says of time in a rehearsal, and adds `advance` to a
world of [decision 0131](archive/0131-a-rehearsal-runs-the-entities-an-operation-sends-to.md).

## Context

The time of a rehearsal stood at the start's time, and moved only to the time of a timer that fired. A rule that
reads `meta.at` between two inbound messages, such as a price by the hours ridden, could not be rehearsed. Its test
called `update` with a `meta` it built, and so tested `update` alone, without the machine's checks.

## Decision

- **`advance(duration)` moves the time of a rehearsal forward by `duration`.** A rehearsal of one entity has it,
  and so does a world, where it moves the one time every entity shares. A member has none, since the time is not
  one entity's. A message after it is handled at the time reached.
- **Each timer due within the duration fires at its time.** The timers fire in the order of their times, across
  every entity of a world. A timer's message is handled, with every mailbox it reaches, before the next timer
  fires, so a timer its firing arms within the duration fires too. Time then stands at the end of the duration.
  This is what `TestClock.adjust` does to the sleeps it passes, and what the runtime does to a timer whose time
  comes.
- **A timer due before the time already reached fires on the next `advance`, even of zero.** A test arms one at a
  past time when its program does.
- **Of two timers due at one time, the one of the entity created first fires first.** Within one entity, the one the
  machine holds first fires first. The order is fixed, so a scenario replays the same steps, and a program does not
  rely on it, since the runtime promises none.
- **A key whose timer fires twice at one time, within one `advance`, fails the test.** The timer was armed again
  at a time already reached, by its own firing or by another timer's at that time. It would fire again at once,
  turn after turn, and time would never pass. Two timers that arm each other at one time loop the same way, and
  one of them fires twice first. The rehearsal fails as it does for an operation that comes back the same on its
  completion ([decision 0130](archive/0130-a-runner-retries-and-the-state-counts-the-attempts.md)). A program that
  fires one key twice at one time and then stops is refused too, as a retry with no pause is.
- **A chain of keys that are all different still loops.** A timer with a parameter that arms the next parameter at
  the time reached never fires one key twice, so `advance` never ends. Only a bound on the firings at one time
  would stop it, and any number chosen would be a rule with no reason.
- **A duration below zero, or infinite, fails the test.** Time in a rehearsal never goes back, as before.
- **Nothing else happens by itself.** An operation under way is still answered or run by the test, however much
  time passes.

## What it rests on

- That `advance` moves the time a message is handled at, and fires each timer due within it in the order of the
  times: **tested** by the tests of `time that passes` in [`src/rehearse.test.ts`](../../src/rehearse.test.ts), the
  world's included, and by `the renewal comes due when its period has passed` in
  [`examples/subscription/scenarios.test.ts`](../../examples/subscription/scenarios.test.ts).
- That a timer armed again at a time reached, and a duration below zero, fail the test: **tested** by `fails on a
  duration below zero, and on a timer armed again at a time already reached`, and by `fails on two timers that
  arm each other again at a time already reached`. A key that fires again at a later time passes, as `fires two
  timers that arm each other later, each at its time` tests.
- That two timers due at one time fire in the order their entities were created: **tested** by `fires the timers
  of two entities due at one time in the order the entities were created`.
- That `Duration.fromInputUnsafe`, `Duration.isNegative`, `Duration.isFinite` and `DateTime.addDuration` do what their
  JSDoc says at 4.1.2: **documented** in `node_modules/effect/src/Duration.ts` and `DateTime.ts`, stable modules.

## Alternatives

Each structure of Effect that could move a rehearsal's time was weighed.

- **`TestClock`, with `TestClock.adjust` in the scenario.** A rehearsal reads no `Clock`: its time is a value the
  machine is given with each event, and a timer of a program is no sleep. So `adjust` would move nothing the
  rehearsal reads, and fire no timer. A rehearsal that read its time from `Clock` would ask every scenario to
  provide `TestClock.layer()`, and `fire` would have to set the clock too.
- **`send` that takes a time.** It moves the time of one message, and `sendFrom`, `create` and every act after it
  would need one too. Time moved by an act is the same for every act that follows.
- **`advance` that fires no timer.** A message would then be handled after a timer's time with the timer still
  under way, which the runtime reaches only when its waker is late. A test that wants that order advances to just
  before the timer's time.
- **A guard on a single key, which fails where a firing arms its own key again at a time reached.** Two timers
  that arm each other pass it, and `advance` never ends. A key that fires twice at one time covers both.
- **An absolute time, `advanceTo(at)`.** A test reads a duration where it reads a rule of hours and days, and the
  start's time gives the absolute one.
- **`Duration.Input` as the argument.** It is what `TestClock.adjust` and `Effect.sleep` take, so `'3 hours'`,
  a number of milliseconds and a `Duration` all serve.

## Consequences

- `Rehearsal` and `World` gain `advance`.
- The design's section Rehearsing says that time moves by `advance`, and that it fires the timers due within it.
