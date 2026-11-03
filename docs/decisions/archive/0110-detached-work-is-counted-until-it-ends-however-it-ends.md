# 0110. Detached work is counted until it ends, however it ends

**Status:** accepted, 2026-11-01. Corrects how [decision 0079](0079-what-a-caller-sets-going-is-finished-without-it.md)
gives back the count of what runs detached, and was found by the scheduler of the tests of
[decision 0104](0104-the-runtimes-tests-choose-where-fibers-yield.md).

## Context

What a caller sets going runs detached, in the deployment's scope, and `settled` waits for it
([decision 0079](0079-what-a-caller-sets-going-is-finished-without-it.md)). The count was taken in the step that forks
it, and given back by an `ensuring` around the effect, in the forked fiber.

A deploy that fails closes its deployment's scope, and an interruption fails it
([decision 0102](0102-a-deploy-interrupted-before-it-registers-undoes-itself.md)). A deploy activates the entities a
crash left with operations under way, each detached. Interrupted after it forked an activation and before that fiber
ran, the deploy closed the scope, which stopped the fiber before its first step. The `ensuring` never ran, the count
stayed at 1, and `settled` never returned. `a deploy interrupted anywhere keeps its name and its waker, or stops what
it started` reached it at seed 1000, with the test's fiber yielding once before it interrupts.

## Decision

- **The count is given back by a fiber that waits for the detached one**, forked in the process's scope in the same
  step as the detached fiber, which gives it back once that fiber has ended, however it ended.
- What runs detached is the same: in the deployment's scope, stopped when that scope closes.

## What it rests on

- That a fiber stopped before its first step runs no finalizer of its own: **documented**, `ensuring` in
  `effect/src/Effect.ts` at 4.1.1 runs its finalizer "if this effect _starts_ execution"; and **tested**, by the test
  above, which does not end at seed 1000 without this decision.
- That `Fiber.await` gives the end of a fiber however it ended, interrupted before it started included:
  **documented**, `await` in `effect/src/Fiber.ts`, and **tested**, by the same test, which ends with it.
- That the waiting fiber runs: it is forked in the process's scope, which closes only as the process ends, and then
  no `settled` is waited for. **Reasoned.**

## Alternatives

- **Starting the detached fiber at once** (`startImmediately`), so that its `ensuring` is entered before the scope can
  stop it. Effect does not document what the option promises.
- **An observer of the fiber** (`addObserver`). It is a field of the fiber that Effect documents as low-level, and
  says nothing of when it runs.
- **Giving the count back where the deploy closes its scope.** The deploy does not know how many of its detached
  fibers had started, and it would be one more place that keeps the count.

## Consequences

- What runs detached costs a second fork, in the process's scope.
- [`src/runtime.ts`](../../../src/runtime.ts) has the change in `detached`.
