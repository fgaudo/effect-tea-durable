# 0208. A launch checks every option

**Status:** accepted, 2026-11-09, with the step A launch checks every option of the [roadmap](../roadmap.md).
Changed by [decision 0251](0251-a-retry-and-a-passivation-are-a-millisecond-at-least.md), which refuses a `retry` and
a `passivate` of 0.
Changes [decision 0054](archive/0054-a-program-is-checked-where-it-enters.md), whose program and launch are checked
where they enter.

## Context

`launch` of [`src/runtime.ts`](../../src/runtime.ts) checked `drain`, `capacity`, `callers` and `log`, and took
`retry`, `passivate` and `warn` as they were given. Each of those times becomes the text of a duration, and Effect
reads no `Infinity millis` and no `NaN millis`. Under `passivate: { millis: Infinity }` the sleep of an entity's
wait died, and no entity was ever unloaded by time. Under `retry: { millis: NaN }` the sleep of an operation that
sends again died, and so did the operation. A `warn` of `NaN` characters compares false with every size, so no
warning would ever be logged.

## Decision

- **`retry`, `passivate` and `warn` are non-negative integers.** Anything else is the launcher's defect: the launch
  dies with an `InvariantDefect` before anything is held or stored, as for the other options. The reasons name the
  option: `the retry is NaN millis, which is no non-negative integer`, `the passivation is … millis`,
  `the warning is … characters`.
- **Zero is a value of each.** A retry of no time sends again at once, a passivation of no time unloads an entity
  as soon as it has nothing to do, and a warning at no character warns of every write. Each is a launch a test may
  want.
- **A value past `Number.MAX_SAFE_INTEGER` is refused**, as for `drain`. No time of that size is meant, and an
  integer past it is not one a duration reads exactly.

## What it rests on

- That Effect reads no `Infinity millis` and no `NaN millis` as a duration: **seen** in the reproduction of this
  bug, where the sleep died. The JSDoc of `Duration.Input` and `fromInputUnsafe` at 4.1.2 **documents** that a
  string input is a value and a unit, or `"Infinity"` alone, and that an input it does not read throws. It does not
  say that `Infinity millis` is such an input. The rule does not rest on it: a value refused here never reaches
  Effect.
- That every one of the three is read only from the options the launch checks: **read in the code** of
  [`src/runtime.ts`](../../src/runtime.ts), where the process holds the values checked. The test
  `a retry, a passivation or a warning that is no non-negative integer is the launcher’s defect` in
  [`src/runtime.test.ts`](../../src/runtime.test.ts) **tests** it, and fails against the code before the change.

## Alternatives

- **The options are given as `Duration.Input`.** A launcher could pass `Duration.infinity` for a passivation that
  never runs out, which Effect reads. It changes the type of every option and every example, which is a point of the
  API, and not this step's.
- **`Infinity` read as no passivation.** It would give a meaning to one value of a number that means milliseconds,
  where the other options refuse it.
