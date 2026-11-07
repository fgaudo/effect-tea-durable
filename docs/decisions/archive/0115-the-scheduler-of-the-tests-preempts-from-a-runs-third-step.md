# 0115. The scheduler of the tests preempts from a run's third step

**Status:** accepted, 2026-11-04. Changes what
[decision 0104](0104-the-runtimes-tests-choose-where-fibers-yield.md) holds of the preemptions of the scheduler
of the tests: under `inline` resumptions they gave orders Effect's scheduler does not. Found with
[decision 0116](0116-an-entitys-wait-ends-with-an-item-of-its-queue.md), which the corrected scheduler made necessary.
A fiber on another's stack is asked of preemption even with no task ready, by
[decision 0117](0117-a-fiber-on-another-s-stack-yields-with-no-task-ready.md).

## Context

The scheduler of the tests asks its strategy whether a fiber yields at every step but the first of a run
([decision 0104](0104-the-runtimes-tests-choose-where-fibers-yield.md)). Decision 0104 holds that under `inline`
resumptions a run reaches only orders Effect gives, the preemptions standing for the budget of steps after which
Effect makes a fiber yield.

Effect counts a fiber's steps from 0 at every run, and makes the fiber yield once the count reaches the budget,
`MaxOpsBeforeYield` (`runLoop` in `internal/effect.ts`, and `shouldYield` in `Scheduler.ts`). Under a budget of 2 a
fiber resumed after a yield yields again at the step it was resumed for, and never gets on. So the least budget under
which fibers run is 3, and Effect never makes a fiber yield before the third step of a run. The scheduler of the tests
did, at the second.

The difference was found by an attempt to take the entities' locks through `RcMap`. Under the old scheduler, the
runtime's test `a message that arrives as the wait of its entity runs out is handled` lost the event at one seed
of 2,000. Its cause was a preemption at the second step of the fiber that races a take against a timeout.

## Decision

- **No preemption comes before the third step of a run**, under either kind of resumption. The scheduler of the
  tests asks its strategy only from there, as `leastBudget` in [`src/testing.ts`](../../../src/testing.ts) says.
- **A preemption at the third step stays**, since a fiber whose budget is 3 yields there. The budget is a
  `Context.Reference`, so a fiber can be given one of its own.

## What it rests on

- That Effect counts a fiber's steps from 0 at every run, and yields once the count reaches the budget: **read in
  the source**, `runLoop` in `internal/effect.ts` and `shouldYield` in `Scheduler.ts`, at 4.1.2.
- That no fiber gets on under a budget of 2 or less: **seen**, while this note was written, in a run of a
  `TestClock` scenario under budgets 1 and 2 that never ended. The test `a strategy is never asked to preempt a
  fiber before the third step of its run`, in [`src/testing.test.ts`](../../../src/testing.test.ts), does not end
  under a scheduler that preempts at the second step.
- That a budget of 3 can be a fiber's own: **documented**, since `MaxOpsBeforeYield` is a `Context.Reference` in
  `Scheduler.ts`. The race of a take loses its item when the racing fiber has it: **seen**, in
  `spikes/effect-queue-take-timeout-scheduled.test.ts`.
- That the rule holds: **tested**, by the test of `src/testing.test.ts` above, which fails without it.

## Alternatives

- **Leaving a resumed fiber more steps**, as the default budget of 2048 does. A fiber given a budget of 3 yields at
  the third step, so the tests would miss orders Effect gives.
- **Keeping the preemption at the second step as an over-approximation**, as `queued` resumptions are. Under it a test
  fails on an order no budget gives, and the runtime would be written against a scheduler that does not exist.

## Consequences

- [`src/testing.ts`](../../../src/testing.ts) asks no preemption before a run's third step, and
  [`src/testing.test.ts`](../../../src/testing.test.ts) tests it.
- Under the corrected scheduler the runtime's wait lost an event at a preemption at the third step, which
  [decision 0116](0116-an-entitys-wait-ends-with-an-item-of-its-queue.md) removes.
- The open question `A preemption as a fiber is resumed` leaves `docs/open-questions.md`.
