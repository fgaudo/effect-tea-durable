# 0109. `settled` waits for an entity unloading

**Status:** accepted, 2026-11-01. Adds to [decision 0076](0076-a-process-over-its-capacity-unloads-the-least-recently-used.md)
what `settled` waits for, and was found by the scheduler of the tests of
[decision 0104](0104-the-runtimes-tests-choose-where-fibers-yield.md).

## Context

An entity unloads in three steps under its lock: it leaves the process, its timers stop, and the probe is told
([decision 0073](0073-what-the-runtime-did-is-told-to-a-probe.md)). Leaving ends something under way, so it wakes
`settled`. Once the entity has left, nothing `settled` looked at held it: it could return while the entity's timers
were still being interrupted, and before the probe was told.

A test of the capacity under prioritized schedules reached it: `settled` returned while the entity told to leave
was stopping its timers, and the test read its list of unloads without it. Under budgets of steps the entity always
took its `Evict` before its caller's reply, so `settled` was not waiting when it left.

## Decision

- **An entity unloading is work under way.** It is counted from before it leaves the process to after the probe
  is told, whether the unload ends or is interrupted, and `settled` waits while the count is above 0.
- What unloads is the same: the entity leaves, and then its timers stop. A timer that fires between the two still
  delivers nothing.

## What it rests on

- That `leave` wakes a `settled` that is waiting, before the timers stop: **tested**, `a process over its capacity
  unloads its least recently used idle entity, under prioritized schedules`, in
  [`src/runtime.test.ts`](../../../src/runtime.test.ts), which fails at seed 0 without the count. The order needs the
  caller's reply before the entity takes its `Evict`, which budgets of steps did not reach.
- That the count is given back however the unload ends, interrupted included: **documented**, `acquireUseRelease` in
  `effect/src/Effect.ts` at 4.1.1.

## Alternatives

- **Leaving after the timers stop.** The entity would still be found while its timers stop. A caller cannot reach
  it then, since the unload holds its lock, but a reading of the waker made meanwhile would leave it out as held.
  The waker is poked when the entity leaves, so nothing would be lost. It moves a step that
  [decision 0068](0068-what-another-fiber-reads-changes-in-one-step.md) keeps in one place, for nothing the count
  does not give.
- **Reading the probe later in the test.** The test would pass, and `settled` would still return with an unload
  under way, which the user of `settled` cannot tell from a settled process.

## Consequences

- [`src/runtime.ts`](../../../src/runtime.ts) counts the entities leaving, and `quiet` reads the count.
- Two rules of [decision 0068](0068-what-another-fiber-reads-changes-in-one-step.md) no test holds since: `leave`
  setting the waker's flag in the step it pokes it, and the waker clearing its flag in the step it finds no poke. A
  mutation of each passed the whole suite with this decision, where it failed without it. Whether the count makes them
  redundant, or only hides what they keep from the tests, is for the next review
  ([decision 0104](0104-the-runtimes-tests-choose-where-fibers-yield.md#the-tests-moved-from-budgets)).
- A crash of an entity stops its work in a fork ([decision 0042](0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md)),
  which `settled` does not wait for. That is not changed here.
