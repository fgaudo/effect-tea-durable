# 0271. Every fork of the runtime says it is interruptible

**Status:** accepted, 2026-11-12, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the fix of bug 22. It changes
[decision 0112](archive/0112-a-fork-from-a-region-that-cannot-be-interrupted-says-it-is-interruptible.md): every
fork of `src/` passes `{ uninterruptible: false }`, and not only a fork from a region that cannot be interrupted. It
adds to [decision 0164](archive/0164-two-rules-of-the-runtime-are-kept-by-the-form-of-the-code-and-a-test-reads-it.md)
a second rule that the test of the form of `src/` reads at every fork. The maintainer chose it on 2026-11-12, after an
opinion of a Fable 5.2 agent.

## Context

Decision 0112 has a fork from a region that cannot be interrupted pass `{ uninterruptible: false }`. Without the
option, the fiber is interruptible only by Effect's default, which Effect's documentation does not promise. In
Effect 3 a fiber took the interruptibility of the region it was forked from. A fiber that cannot be interrupted holds
the closing of its scope for as long as it runs, and a loop or a waker runs for ever.

The rule asked each fork to know its region, and a fork does not. Decision 0162 later made the activation on Cluster
uninterruptible, and three forks inside it passed no option: the fork of the loop in `finishIn` of
`src/runtime/doors.ts`, and the forks of `forkHeld` and `drop` of `src/runtime/loop.ts`. This is bug 22 of the
roadmap. Other forks stand in a region that the caller chooses. The launch's fork in `src/runtime.ts` and the fork of
the sweep run in the region of the user's call, which is uninterruptible inside an `acquireRelease`. The forks of the
loop in `activate` and in a creation are interruptible only because `detached` passes the option to the fiber that
runs them. So no reading of the regions of today holds the rule for the next change.

## Decision

- **Every fork of `src/` passes `{ uninterruptible: false }`**, wherever it stands, so that the scope it is forked in
  stops the fiber whatever Effect's default becomes. No fork of the runtime needs a fiber that cannot be interrupted.
- **The runtime forks through two helpers.** `forkApart(sql, effect, scope)` and `forkChildApart(sql, effect)`, in
  `src/runtime/process.ts`, fork `untransacted(sql, effect)` with the option. Each is a plain function, not a
  generator, so it adds no step to the fiber.
- **The test of the form of `src/` refuses a fork without the option.** `forksAmiss` of `src/form.test.ts` reads every
  name of a fork of Effect, as decision 0164 reads it for `untransacted`. A fork that is not called, as one passed as
  a value, or whose options are not written out as `{ uninterruptible: false }` where it stands, is refused. A name
  or a spread that holds the options is refused too, since the check would have to follow it. The comment
  `Keeps the transaction:` excuses a fork from `untransacted` alone, never from the option.

## What it rests on

- That `{ uninterruptible: false }` gives a fiber that its scope stops, inside a region that cannot be interrupted:
  **tested** by `a fiber forked with uninterruptible false inside an uninterruptible region is stopped by its scope`,
  in [`spikes/effect-uninterruptible-fork.test.ts`](../../spikes/effect-uninterruptible-fork.test.ts), at the version
  pinned. The spike's test of the fork without the option stays, as the alarm for a change of Effect's default.
- That the option adds no step to a fiber, so that the pinned seeds keep their interleavings: **tested** by
  `bun run test:pins`, which passes on the code with the helpers. In `forkUnsafe` of
  `node_modules/effect/src/internal/effect.ts`, at 4.1.3, the option only sets the flag the fiber is made with.
- That the check refuses a fork without the option, in each form the check reads: **tested** by `a fork not given
  { uninterruptible: false } is found, whatever its options say instead`, in [`src/form.test.ts`](../../src/form.test.ts),
  with `"inherit"`, `true`, a name, a spread and a fork excused from `untransacted`. A run of the check on `src/` with
  the option taken out of `forkChildApart` failed, naming its line.
- That the forks Effect makes inside its own combinators need no option: **documented** for `Effect.raceFirst` and
  `Effect.raceAll`, which the runtime uses, in their JSDoc at the version pinned, which says that the losers are
  interrupted. The check does not read those forks. A combinator that forks with `"inherit"`, as a concurrent
  `forEach`, is used by no module of `src/` today, and the decision leaves it out.
- That a fork of `src/` never needs a fiber that cannot be interrupted: **chosen** by the maintainer, on 2026-11-12.
  The bookkeeping of `forkHeld` is in an `ensuring`, which runs on interruption, and the counter of `detached` is
  stopped only when `p.running` closes, once its count no longer matters.

## Alternatives

- **The option at the three forks of bug 22 alone.** The next region made uninterruptible brings the bug back, since
  no fork knows its region.
- **The option at every call of `Effect.forkIn`, without helpers.** It holds the same rule, and repeats
  `untransacted` and the option at a dozen places. The helpers keep both rules of a fork in one place.
- **`Effect.interruptible` around the forked effect.** Decision 0112 refused it: it adds a step to every fiber, and
  so moves the pinned seeds.
- **A check of the forks inside an uninterruptible region alone.** The region of a fork is often its caller's, which
  a reading of the text cannot tell.
