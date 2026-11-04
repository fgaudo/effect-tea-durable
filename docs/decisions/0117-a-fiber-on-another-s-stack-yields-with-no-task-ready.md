# 0117. A fiber on another's stack yields with no task ready

**Status:** accepted, 2026-11-04. Adds to the preemptions of the scheduler of the tests, which
[decision 0104](archive/0104-the-runtimes-tests-choose-where-fibers-yield.md) and
[decision 0115](0115-the-scheduler-of-the-tests-preempts-from-a-runs-third-step.md) decide, the orders in which a
fiber started inline gives its parent back. Moves the seeds that
[decision 0116](0116-an-entitys-wait-ends-with-an-item-of-its-queue.md) names. Decides the open question `A fiber
started inline, under the scheduler of the tests`.

## Context

The scheduler of the tests asked a fiber whether it yields only while another task was ready
([decision 0104](archive/0104-the-runtimes-tests-choose-where-fibers-yield.md)). A fiber that runs as a task of its
own and yields with no task ready runs on at once, so nothing was lost there. A fiber that runs on another fiber's
stack is different.

Effect starts a child on its parent's stack under `startImmediately`. `raceFirst`, `timeoutOption` and the concurrent
`forEach` behind `Effect.all` start their children so, and the runtime's waker uses `raceFirst`. When such a child
yields, its part of the parent's step ends, and the parent goes on before the child does. Effect's scheduler makes a
fiber yield at the first step whose count reaches its budget, whether another task is ready or not. So under some
budgets the parent goes on in the middle of the child's run. A child of four steps and its parent ran
`c1 p c2 c3 c4` under Effect with a budget of 3 or 4, and `c1 c2 c3 p c4` with a budget of 6. Under every schedule of
the tests within one deviation, they ran only `c1 c2 c3 c4 p`.

## Decision

- **A fiber that began its run on the stack of another is asked of preemption even with no task ready.** The
  scheduler of the tests knows such a fiber by its run beginning in a task in which another fiber ran already. That
  holds of a fiber started inline and of one resumed inline. Every other fiber is still asked only while another
  task is ready.
- **The fiber it gives back goes on as the strategy decides.** It is asked of preemption as any other fiber, from its
  third step and while a task is ready, which the child's yield now is.
- **A strategy may be asked with no task ready.** `prioritized` yields there only at one of its changes of priority.

So a run reaches every order Effect's budgets give a child and its parent, and some that no budget gives a given
program. That is an over-approximation of the same kind as the picks, which choose any ready task where Effect's
dispatcher runs the oldest. [Decision 0115](0115-the-scheduler-of-the-tests-preempts-from-a-runs-third-step.md)
rejected a preemption at a run's second step, which no budget gives in any program. A parent that goes on while its
child is still running is an order Effect gives under some budgets. Which budgets give it depends on the parent's
count of steps when it started the child, and the scheduler of the tests does not know that count.

## What it rests on

- That Effect starts a child on its parent's stack under `startImmediately`, and that `raceFirst`, `timeoutOption` and
  the concurrent `forEach` do so: **read in the source**, `forkUnsafe` and `raceAllFirst` in `internal/effect.ts`, at
  4.1.2.
- That such a child that yields gives its parent back before its run goes on, under the budgets named above:
  **seen**, in [`spikes/effect-inline-start-yields.test.ts`](../../spikes/effect-inline-start-yields.test.ts), under
  budgets from 3 to 8.
- That Effect makes a fiber yield at the first step whose count reaches its budget, whether another task is ready or
  not: **read in the source**, `MixedScheduler.shouldYield` in `Scheduler.ts` and `runLoop` in `internal/effect.ts`, at
  4.1.2.
- That the scheduler of the tests reaches the orders the spike sees: **tested**, by `a fiber started inline yields
  with no task ready, and gives its parent back as a budget of Effect does`, in
  [`src/testing.test.ts`](../../src/testing.test.ts), which fails without the rule.
- That a fiber's run beginning after another fiber's, in the same task, is a run on that fiber's stack: **reasoned**.
  A task runs one fiber from the dispatcher. Any fiber that begins a run after it in the same task was started or
  resumed inline by a fiber that was running.

## Alternatives

- **Keeping the rule of decision 0104**, so that a child started inline is asked only while another task is ready.
  The runtime's waker races a take against a sleep with `raceFirst`, and the orders of that race would stay
  unexplored.
- **Making the parent yield at the step the child yielded at**, as both would under one budget. A draft of this note
  did so. It missed `c1 p c2 c3 c4`, which Effect gives, and reached `c1 c2 p c3 c4`, which no budget from 3 to 8
  gives. The cause is the parent's count of steps. Under Effect the parent yields with no task ready at every
  budget's worth of steps, and its count starts again from 0. The scheduler of the tests makes no such yield, so the
  count it reads is not Effect's.
- **Counting the parent's steps as Effect would under each budget.** It would need a budget for the whole run, which
  the strategies do not choose: they preempt each fiber at steps of their own.

## Consequences

- A run in order under the scheduler of the tests is asked more decisions in 10 of the 21 explored scenarios of
  [`src/runtime.test.ts`](../../src/runtime.test.ts). The largest change is in `a consumer whose first reading lands
  in a prune skips nothing`, from 77 to 350. So the seeds of the explored tests give other schedules than before.
- The seeds [decision 0116](0116-an-entitys-wait-ends-with-an-item-of-its-queue.md) names no longer fail with its
  rules taken out. A take raced against a timeout loses its event at seed 203 instead of 147, and an earlier wait's
  end taken for the current one unloads the entity at seed 57 instead of 862. Seed 203 is pinned in its test, so that
  every run of the tests runs it. Seed 57 is among the first 100, which every run runs.
- Every explored test passes every seed of the release under the rule, as `bun run test:release` runs them.
- The count of seeds that rules of concurrency need is in the open question
  [`How many seeds a bug needs`](../open-questions.md#running), under this scheduler and the one before.
- The open question `A fiber started inline, under the scheduler of the tests` leaves `docs/open-questions.md`.
