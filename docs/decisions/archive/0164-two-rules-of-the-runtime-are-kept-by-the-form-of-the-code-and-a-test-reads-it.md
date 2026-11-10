# 0164. Two rules of the runtime are kept by the form of the code, and a test reads it

**Status:** accepted, 2026-11-07, with the step Rules kept by the form of the code of the roadmap. Changes
[decision 0161](0161-on-cluster-a-step-settles-the-machine-by-the-count-of-the-steps-that-wrote-it.md): every fork of
the runtime runs without the transaction of the fiber that forks it, and not only the forks of an operation, a timer
and a loop. Says how the count of [decision 0163](0163-on-cluster-a-reading-that-waits-learns-of-another-runners-commit-from-the-file.md)
is kept. What Effect 4.1.3 does with a fork the rule misses is added by
[decision 0243](../0243-a-fork-that-keeps-a-transaction-it-outlives-fails-where-it-runs.md).

## Context

Two rules of `src/runtime.ts` were kept by hand, site by site. Decision 0161 has an operation, a timer and the loop
of an entity forked without the step's transaction, since a fork keeps the services of the fiber that forks it. The
other forks of the runtime were given the transaction of whatever fiber forked them: the waker, the watcher of
decision 0163, the sleep of an entity's wait, the interruptions of an operation and of a crashed entity's work, and
the detached work of a creation or an activation.
None of them forked inside a step's transaction then. A later change that moved one inside a step would have
broken the rule in silence, as the operations broke it before decision 0161.

Decision 0163 has the count of the readings that wait raised and lowered by one `Effect.acquireUseRelease`. A count
raised before an `ensuring` stays raised where an interruption lands at a yield between the two. Four other counts
are read by another fiber, and nothing kept a later one from taking the form that fails.

## Decision

### The rules

- **Every fork of the runtime is given, as its effect, a call of `untransacted`**, the one function that takes the
  transaction out of the fiber's services. That is every call of `Effect.forkChild`, `Effect.forkIn`,
  `Effect.forkScoped` and `Effect.forkDetach`. The detached work of a creation and of an activation runs without
  the caller's transaction too. That work outlives the caller, which may end the transaction before it ends, and a
  caller in a transaction waits for nothing a step does (decision 0150).
- **A count is raised in the acquisition and lowered in the release of one `Effect.acquireUseRelease`.** A count is a
  name that a module both raises and lowers, by `+=`, `-=`, `++` or `--`.
- **A fork that must keep the transaction is preceded by a line comment that says `Keeps the transaction:` and why.**
  No fork of the runtime keeps it today.
- **A count that one fiber raises and another lowers is preceded, at its raise and at its lowering, by a line comment
  that says `Raised and lowered by two fibers:` and why.** Two counts are so. An entity's `pending` is raised by the
  fiber that offers an event and lowered by the loop once the event's step is done
  ([decision 0063](0063-the-runtime-waits-for-what-it-waits-for.md)). The `detachments` of detached work are
  raised by its caller and lowered by a fiber of the process's scope that waits for the work
  ([decision 0110](0110-detached-work-is-counted-until-it-ends-however-it-ends.md)).

### The check

- **The check is a test, [`src/form.test.ts`](../../../src/form.test.ts), so `bun test` runs it.** A mutation of
  [`scripts/mutate.ts`](../../../scripts/mutate.ts) that writes the other form of a rule is killed by the suite, since
  the script copies `src/` and runs the suite in the copy.
- **The check reads the text of every module of `src/` that is not a test**, with its comments, strings, regular
  expressions and the text of its templates taken out. It finds a call by its name, and its arguments by the
  parentheses and the commas of the call's own depth.
- **A name of a fork is read wherever it stands**: called, passed as a value to `pipe`, or imported under another
  name. A use that is not a call of `Effect` given `untransacted(` as its first argument fails.
- **What forks with services the check cannot follow fails too**: a use of `FiberMap`, `FiberSet` or `FiberHandle`,
  and the runs of Effect given a context, such as `Effect.runForkWith`.
- **The check tests itself** on short texts, in the same file: each form it refuses is refused, and each form it
  allows, the comments that say why among them, passes.

### What it does not read

- **The fibers Effect forks inside its own combinators**, such as `Effect.raceAll` and an `Effect.forEach` with
  concurrency. Each of them is joined before the combinator ends, so none outlives a step's transaction. A child of
  such a combinator inside a step would still run on the step's connection while the step waits, which no rule of
  the runtime does today.
- **A count lowered by an amount other than one, or kept in a structure**, such as the users of a `Semaphore`. The
  check finds the operators alone.

## What it rests on

- That `Effect.forkChild`, `Effect.forkIn`, `Effect.forkScoped` and `Effect.forkDetach` are the forks of `Effect` at
  4.1.2, beside the `run` functions, `FiberMap.run`, `FiberSet.run` and `FiberHandle.run`: **read in the source** of
  `Effect.ts`, `FiberMap.ts`, `FiberSet.ts` and `FiberHandle.ts` at 4.1.2. A fork a later release adds is not read
  by the check until its list is changed. The move of Effect's version reads the list again, since
  `bun scripts/compare-docs.ts` names every export added.
- That a fork keeps the services of the fiber that forks it: **read in the source** of `internal/effect.ts` at 4.1.2,
  and **tested**, as decision 0161 says.
- That `Effect.acquireUseRelease` does not interrupt its acquisition, and runs its release once the acquisition
  ends: **documented** by its JSDoc at 4.1.2, `@stability stable`.
- That the check finds each form it refuses, and passes each form it allows: **tested** by `the check of the form`
  in [`src/form.test.ts`](../../../src/form.test.ts). That it finds them in the runtime: **seen** by mutations of
  `src/runtime.ts` that take `untransacted` out of the fork of the waker and of the wait's sleep, and that lower a
  count in an `ensuring` of an acquisition. The check refused each.
- That taking the transaction out of the forks that did not run in a step changes no behaviour of the runtime:
  **tested** by `bun run test:release`, which runs every seed and passes. It does change the schedules of the tests.
  `Effect.updateContext` adds operations without yielding, and a seed draws its schedule from the operations of the
  code it runs. **Seen**: seed 394 no longer reached the leave split in two steps of decision 0068, and seed 169,
  found by running every seed against that form, reaches it. Seed 818138843 still reaches the wait of decision 0116
  written as `Effect.timeoutOption` of the take.

## Alternatives

- **The structures of Effect.** Each module of the pinned version that could keep one of the rules, or the check,
  was weighed.
  - `RcRef` counts the users of one resource, and its acquisition could open the latch of decision 0163. It forks the
    acquisition in a fiber of its own, with the services of the fiber that first gets it, and keeps it for an idle
    time. `RcMap` forks the same way, as the comment of the entities' locks says.
  - `Effect.acquireRelease` with a `Scope` keeps the same rule as `Effect.acquireUseRelease`, with a scope to open
    and close around each use. The check allows one form, the one decision 0163 took.
  - `FiberMap.run` keeps a fiber under a key while it runs, as `forkHeld` does by hand. It forks with the services of
    the fiber that calls it. The check would then read the effect given to it, and `forkHeld` registers the fiber
    in one step with its end, which decision 0068 keeps.
  - `Effect.forkIn` has no option that drops a service. `Effect.updateContext` with `Context.omit` drops it, and is
    what `untransacted` calls.
  - `Effect.runForkWith` starts a fiber with the context it is given, which would hold no transaction. It starts a
    fiber outside every scope of the runtime, which the drain and `settled` do not see.
- **A rule of the linter**, such as ESLint's `no-restricted-syntax`. The repository has no linter, and a rule of the
  syntax tree reads the same forms at the cost of a dependency.
- **The compiler's API.** TypeScript 7 gives its API to JavaScript as `typescript/unstable/sync`, which changes
  within the major. A text with the comments and strings taken out is enough for the calls the check reads.
- **A helper that forks, called in place of every fork of `Effect`.** The check would then read that each fork stands
  inside the helper. The rule is that the fork drops the transaction, and `untransacted(` as its effect says it at
  the site.
- **A script of `bun run`, outside the suite.** A mutation would then survive the suite, and `scripts/mutate.ts`
  would need to run the script as well.

## Consequences

- Every fork of [`src/runtime.ts`](../../../src/runtime.ts) is given `untransacted`, which is bound right after the
  client, before the watcher forks. `forkHeld` gives it the effect with its finalizer.
- The comments of `pending` and of `detachments` in `detached` say why each count is raised and lowered by two fibers.
- [`docs/design.md`](../../design.md) says both rules under Fibers and locks.
- The test of decision 0068 that a `settled` never returns between a crash and its activation pins seed 169, in
  place of seed 394.
