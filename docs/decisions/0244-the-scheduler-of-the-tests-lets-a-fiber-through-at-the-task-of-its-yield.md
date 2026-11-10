# 0244. The scheduler of the tests lets a fiber through at the task of its yield, and preempts from a run's second step

**Status:** accepted, 2026-11-10, with the move of Effect to 4.1.3. Changes how the scheduler of the tests of
[decision 0104](archive/0104-the-runtimes-tests-choose-where-fibers-yield.md) tells that a fiber is let through. Replaces
the rule of [decision 0115](archive/0115-the-scheduler-of-the-tests-preempts-from-a-runs-third-step.md), whose premise
fell: a preemption comes from a run's second step, and not from its third.

## Context

The scheduler of the tests, `controlled` in [`src/testing.ts`](../../src/testing.ts), makes a fiber yield by
answering `true` to `shouldYield`. Up to Effect 4.1.2 a fiber resumed by the task of that yield asked `shouldYield`
again at the first step of its run. The scheduler let the fiber through there, since it was the first fiber its own
task ran. It cleared `entering`, which says that no fiber has run yet in the task under way.

At 4.1.3 the run loop resumes a fiber from a yield its scheduler asked for at the step it yielded, and does not ask
`shouldYield` at that step. It counts the resumption as one step already, and asks first at the next one. So the
scheduler never saw the fiber enter its task, and `entering` stayed true while the fiber ran. A second fiber that the
first interrupted inline, in the same task, was then taken for the first fiber of its own task, and ran unpicked.

The same change made a premise of decision 0115 fall. Decision 0115 had the scheduler preempt from a run's third step,
since under a budget of 2 or less no fiber got on: a fiber resumed after a yield yielded again at the step it was
resumed for. At 4.1.3 the fiber runs that step before the budget is checked again, so a budget of 1 or 2 lets it on.
Effect asks `shouldYield` at the first and the second step of a run that another task or another fiber wakes, and
from the third step of a run resumed from an automatic yield. So a budget of 2 differs from a budget of 3 at the second
step of a woken run alone, and the scheduler of the tests did not reach that yield. Decision 0115 also gave a reason
of its own: a preemption at the second step made a race of a take lose its item. Effect 4.1.3 interrupts a race's
losers as the race settles, and the spike
[`spikes/effect-queue-take-timeout-scheduled.test.ts`](../../spikes/effect-queue-take-timeout-scheduled.test.ts) sees
no item lost under any budget. The
test `a fiber that yielded and is interrupted runs its finalizer only once picked, under every schedule`, of
[`src/testing.test.ts`](../../src/testing.test.ts), failed on it, and so did the spike
[`spikes/effect-scheduler-controlled.test.ts`](../../spikes/effect-scheduler-controlled.test.ts).

## Decision

- **The task of a yield the scheduler made lets its fiber through as the task starts.** The scheduler records the
  fiber with the task Effect schedules right after the scheduler answered `true`. When that task starts, the
  scheduler clears `entering`, takes the fiber out of the fibers that wait to be let through, and records it as the
  fiber let run last. This is what the first step of the run did up to 4.1.2.
- **A yield that an interruption cancelled leaves a task that runs nothing.** Effect keeps the task in the queue,
  and its fiber ends from another task. What the scheduler sets as that task starts is read by no fiber, since none
  runs in it. The spike counts such a task as nothing left to run.
- **A preemption comes from a run's second step.** The scheduler of the tests asks its strategy from there, as
  `leastBudget` in `src/testing.ts` says. So it reaches every yield a budget of Effect gives, as decision 0104 asks,
  and none that no budget gives. A run resumed from a yield the scheduler made is first asked at its third step, as
  under Effect, since Effect does not ask at the second.
- **No preemption comes at a run's first step.** A budget of 1 yields there. On a run resumed inline that yield is the
  one a `queued` resumption makes already. On a fiber's first run it only puts the fiber behind the tasks ready, which
  a pick reaches already.

## What it rests on

- That Effect 4.1.3 does not ask `shouldYield` at the step a fiber resumes from a yield its scheduler asked for, and
  counts that step as one: **read in the source**, `runLoop` and `yieldNow` of `FiberImpl` in `internal/effect.ts` at
  4.1.3. The scheduler's interface does not document it. It is **tested** by the test of `src/testing.test.ts` above,
  which fails without the rule, and by `spikes/effect-scheduler-controlled.test.ts`.
- That the task Effect schedules right after `shouldYield` answers `true` is the yield's: **read in the source**, in
  the same function, where the yield schedules its task before the run loop returns. The scheduler kept this already,
  to name the fiber of a ready task for a strategy.
- That a budget of 1 or 2 lets a fiber on at 4.1.3: **seen** on 2026-11-10, in a loop of a thousand steps under
  `MaxOpsBeforeYield` of 1, 2 and 3, which ended under each. At 4.1.2 it did not end under 1 or 2, as decision 0115
  saw.
- That Effect asks `shouldYield` at the first and the second step of a woken run, and first at the third of a run
  resumed from an automatic yield: **read in the source**, `runLoop` at 4.1.3, and **seen** on 2026-11-10 by a
  scheduler that recorded the steps it was asked at, under budgets of 1, 2 and 3.
- That the rule holds: **tested**, by the test `a strategy is asked to preempt a fiber from the second step of its run,
  never at its first` of `src/testing.test.ts`, which fails under a `leastBudget` of 3.
- That no race of the runtime loses an item under a preemption at the second step: **tested** by `bun run
  test:release`, which passed on 2026-11-10 with the rule, and by the spike of the race above.
