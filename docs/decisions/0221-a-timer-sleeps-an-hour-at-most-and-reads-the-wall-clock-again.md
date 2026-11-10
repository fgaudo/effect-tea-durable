# 0221. A timer sleeps an hour at most at a time, and reads the wall clock after each sleep

**Status:** accepted, 2026-11-09, with the step What the runtime tells a tracer of the [roadmap](../roadmap.md).
Changes [decision 0194](0194-a-timer-months-away-sleeps-on-effects-promise-of-a-duration.md), whose timers slept
the whole time left.

## Context

A timer stores its time on the wall clock. [Decision 0194](0194-a-timer-months-away-sleeps-on-effects-promise-of-a-duration.md)
slept it as the milliseconds left when it is armed, in one `Effect.sleep`, which the host measures on its own timers.
A host suspended during the sleep, or a virtual machine paused, ends the sleep late. A wall clock set back ends a
loaded entity's sleep early. A loaded entity's timer fired when its sleep ended, and nothing checked its time
against the clock. So it fired late by the time the host was suspended, or early by the step of the clock back. The
waker activates only the entities whose time has come on the wall clock, so it fired none early. It read the clock
again only when its sleep ended or it was poked, so it fired late by the time the host was suspended.

The examples do not say how long a host is suspended. A laptop sleeps for a night, a virtual machine is paused for a
migration, and a clock is set back by the time a synchronisation finds it off by. A monthly renewal fired a night
late is a renewal a customer sees late. A timer fired before its time breaks what `update` was told: its message
says that its time has passed.

## Decision

- **A loaded entity's timer sleeps an hour at most at a time.** After each sleep it reads the wall clock, and sleeps
  again for the time left, an hour at most, until the time it stores has come. Then `Fire` is offered. So a timer
  never fires before its time on the wall clock, and a host suspended delays it by an hour at most once the host
  runs again.
- **The waker sleeps an hour at most too.** After its sleep, its round reads the wall clock and the stored timers
  again, as after a poke, and activates the entities whose time has come.
- **The bound is `reread`, an hour, in [`src/runtime/process.ts`](../../src/runtime/process.ts)**, the same for the waker and for a
  loaded entity, and no option. A reading of the stored timers each hour for each deployment, and a wake each hour
  for each timer armed, cost nothing beside the steps of a process. An hour late is what a timer of days or months
  bears. A program that cannot bear it asks for a shorter bound, or for an option.
- **The wall clock decides.** A clock set forward fires a timer when its sleep next ends, up to an hour after the
  wall clock has passed its time. The runtime knows no other time than the wall clock's, since a time stored must
  hold across processes and hosts, and a monotonic clock holds within one process alone.
- **The runtime no longer relies on Effect's sleeps past the host's limit.** An hour is shorter than 2^31 − 1
  milliseconds, about 24.8 days, so every sleep of a timer is one timer of the host. What decision 0194 found of
  `Effect.sleep` still holds, and its spike still runs, but no timer of the runtime reaches it now.

## What it rests on

- That a loaded entity's timer fires within an hour of a suspended host's return: **tested** by
  `a loaded entity’s timer fires within an hour of a suspended host’s return` in
  [`src/runtime.test.ts`](../../src/runtime.test.ts). With the bound taken out, the timer sleeps its three hours,
  and the test fails.
- That the waker fires a stored timer within an hour of a suspended host's return: **tested** by
  `the waker fires a stored timer within an hour of a suspended host’s return`. With the bound taken out, the test
  hangs, since the waker sleeps its three hours.
- That a loaded entity's timer fires at its time when the clock is set back, never before: **tested** by
  `a loaded entity’s timer fires at its time when the clock is set back, never before`. With one sleep and no reading
  after it, the timer fires an hour early.
- That a test moves the wall clock apart from the sleeps by a `Clock` whose time is the test clock's with an offset,
  and whose sleeps are the test clock's: **read in a dependency's source** at 4.1.2, where `now` of
  `internal/dateTime.ts` reads `Clock.currentTimeMillis`, and `sleep` of `internal/effect.ts` sleeps on the `Clock`
  service. The JSDoc of `DateTime.now` does not say which service it reads. A release that read the time otherwise
  would fail the three tests, which see no timer fire early or late without the offset.
- That a host's timers do not run while the host is suspended, so that a sleep ends late by the time of the
  suspension: **only reasoned**. Bun's timers run on its event loop, and nothing in the pinned Bun says how they
  count a suspended host. The rule holds either way: a sleep that ends on time finds its time come, and one that ends
  late fires an hour late at most.
- That the added sleeps change the points where fibers yield, after which the explored tests' pinned seeds no longer
  reach their bugs: **seen**. The seeds were found again, with the spans of
  [decision 0220](0220-the-runtime-records-a-span-for-each-step-and-each-operation.md).

## Alternatives

- **One sleep, and a reading after it that sleeps again only if the time has not come.** It fires no timer early,
  but a host suspended still delays a timer of months by the whole suspension.
- **The bound as an option of the launch.** No program asks for another, and an option is checked, documented and
  part of the public surface ([decision 0208](0208-a-launch-checks-every-option.md)).
- **A bound of a minute.** It delays a timer a minute at most, at sixty readings of the stored timers an hour for
  each deployment, and sixty wakes an hour for each timer armed. Every test that moves the clock by days runs sixty
  times the rounds.

## Consequences

- A timer due in more than an hour adds a sleep and a reading of the clock each hour, and the waker a round each
  hour. A test that moves the clock past an hour moves those rounds with it.
- A rehearsal moves time by `advance` and fires a timer at its time, with no sleep of its own
  ([`src/rehearse.ts`](../../src/rehearse.ts)), so nothing changes there.
