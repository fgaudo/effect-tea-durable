# 0251. A retry and a passivation are a millisecond at least

**Status:** accepted, 2026-11-11, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the rule of its family F. It changes
[decision 0208](0208-a-launch-checks-every-option.md), which made 0 a value of `retry` and of `passivate`.

## Context

[Decision 0208](0208-a-launch-checks-every-option.md) let a launch give a `retry` or a `passivate` of 0, as a launch
a test may want. Four waits of the runtime sleep on one of the two, and each tries again when its sleep ends. Under
0 none of them waits, and each tries again at once, for as long as what it waits for fails:

- Bug 17: the waker tries an entity it cannot activate again after `retry`
  ([decision 0077](archive/0077-the-waker-tries-an-entity-it-cannot-load-again.md)), in `src/runtime/waker.ts`. Under
  0 it tries for ever, and `settled` never returns. Reproduced.
- Bug 32: a sender whose receiver crashes on its message, or answers `Full`, sends again after `retry`, in
  `src/runtime/callers.ts`. Under 0 it sends again with no wait. Reasoned.
- Bug 71: on Cluster, a shard's round that fails is made again after `retry`
  ([decision 0162](archive/0162-on-cluster-an-entitys-shard-is-its-partition-and-each-deployment-serves-its-shards.md)),
  on `Schedule.spaced` in `src/runtime/doors.ts`. Under 0 a row no version reads keeps the file's one writer busy.
  Reasoned.
- Bug 45: an entity's wait sleeps for `passivate`, and an entity whose operation runs refuses to be unloaded and
  waits again ([decision 0029](archive/0029-an-idle-entity-is-unloaded.md)), in `src/runtime/loop.ts`. Effect's sleep
  of 0 is one yield, so under 0 the loop spins while the operation runs. Reproduced.

## Decision

- **`retry` and `passivate` are positive integers of milliseconds.** A launch given 0, or anything else that is no
  positive integer, dies with an `InvariantDefect` before anything is held or stored, as for the other options. The
  reasons read `the retry is 0 millis, which is no positive integer` and `the passivation is 0 millis, …`.
- **`warn` stays a non-negative integer.** A warning at no character warns of every write, and nothing waits on it.
- **The rule is kept in one place**, the launch's check in `src/runtime.ts`. Every wait that sleeps on `retry` or
  `passivate` reads the value the launch checked, so no wait needs a least time of its own.

## What it rests on

- That every wait of the four reads `retry` or `passivate` from the options the launch checked: **read in the
  code**, at `failed` of `src/runtime/waker.ts`, the sleeps of a sender in `src/runtime/callers.ts`, `activating` of
  `src/runtime/doors.ts` and the wait of `src/runtime/loop.ts`, which all read the process's checked values.
- That a launch with 0 is refused: **tested** by `a retry or a passivation that is no positive integer, or a warning
  that is no non-negative one, is the launcher’s defect`, in `src/runtime/loop.test.ts`, which fails against the code
  before the change.
- That a millisecond is enough for the waker to rest: **tested** by `under the least retry, an entity the waker can
  never activate leaves the process settled`, in `src/runtime/waker.test.ts`. It is bug 17's test, run at 1 ms, and
  it fails at 0 against the check of decision 0208.
- That a millisecond is enough for the loop to rest: **tested** by `under the least passivation, an entity whose
  operation runs waits without spinning`, in `src/runtime/loop.test.ts`. It is bug 45's test, run at 1 ms, under
  `slow`, since it measures two seconds of the processor's time. At 1 ms a busy entity still wakes a thousand times a
  second, which the test finds is rest.
- That a sender and Cluster's round rest at a millisecond as the waker does: **only reasoned**. Each sleeps on the
  checked value before it tries again, as the waker does, and no test runs either at 1 ms. Bug 32's test needs a
  receiver that crashes at every attempt, and bug 71's two runners and a row no version reads.
- The premises of decision 0208 still hold: Effect reads no `Infinity millis` and no `NaN millis`, and every option
  is read only from the options the launch checked.

## Alternatives

- **A least time of every wait the runtime sleeps, with 0 still accepted.** It needs the least time at each of the
  four waits, or once where the options are read, where 0 would then mean a millisecond in silence. A launch that
  refuses 0 says it to the launcher instead.
- **The loop's wait sleeps only while the entity has nothing to do.** It would remove the wakes of a busy entity at
  any passivation, not only at 0, but it moves the sleep that `settled` reads
  ([decision 0134](archive/0134-an-entitys-loop-yields-between-two-steps.md)), and with it the yields that the pinned
  seeds draw from. It holds no retry, so it would not be the family's rule.
- **A passivation of 0 as "unload as soon as idle".** It is lost: a passivation of a millisecond is the nearest
  launch.
