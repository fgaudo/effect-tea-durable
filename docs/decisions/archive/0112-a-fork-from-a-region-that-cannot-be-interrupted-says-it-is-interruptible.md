# 0112. A fork from a region that cannot be interrupted says it is interruptible

**Status:** accepted, 2026-11-01. Changes what [decision 0078](0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md)
and [decision 0079](0079-what-a-caller-sets-going-is-finished-without-it.md) rest on: the fibers they fork from a region
that cannot be interrupted are interruptible by the option of the fork, not by Effect's default.

## Context

Three places of the runtime fork a fiber from a region that cannot be interrupted, and need it interruptible, so that
the scope it runs in still stops it: `detached`, whose step is uninterruptible so that its count is taken with its
fork ([decision 0079](0079-what-a-caller-sets-going-is-finished-without-it.md), and
[decision 0110](0110-detached-work-is-counted-until-it-ends-however-it-ends.md)); the deploy, which registers its
deployment and forks its waker in one uninterruptible step
([decision 0078](0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md)); and `crash`,
which a creation's `onError` runs where it cannot be interrupted, and which forks the interruption of the entity's
work.

That such a fiber is interruptible was seen in `spikes/effect-uninterruptible-fork.test.ts`, and is not in Effect's
documentation (decision 0107). The project runs on Effect 4, but the
default has changed before: in Effect 3 a fiber took the interruptibility of the region it was forked from (its
`unsafeMakeChildFiber` gives the child the parent's runtime flags, at 3.22.4). A fiber that could not be interrupted
would hold its scope's closing for as long as it runs, and the waker runs for ever.

Effect 4's forks take an option, `uninterruptible: boolean | "inherit"`. Its default is `false`, an interruptible fiber,
and `"inherit"` takes the region's: **read in the source**, `forkUnsafe` in `internal/effect.ts` at 4.1.1, where the
fiber is interruptible unless the option is `true`, or `"inherit"` in a region that is not.

## Decision

- **A fork from a region that cannot be interrupted passes `{ uninterruptible: false }`**, so the fiber is interruptible
  whatever Effect's default becomes. The four forks of the three places above pass it.
- **Not `Effect.interruptible` around the forked effect**, which says the same in its documentation and adds a step to
  every such fiber: the steps of every run move, and with them what the explorations of
  [decision 0104](0104-the-runtimes-tests-choose-where-fibers-yield.md) count. The option adds none.

## What it rests on

- That `uninterruptible: false` gives an interruptible fiber: **read in the source**, at 4.1.1. The option is typed by
  Effect's API, `boolean | "inherit"`, and has no description; that `false` means interruptible is what its name says.
- That the option adds no step: **seen**, by a check not kept. The runs in order of the three explorations of
  [`src/runtime.test.ts`](../../../src/runtime.test.ts) are asked of preemption 631, 254 and 370 times, and take 17, 18 and
  14 tasks, with the option and without it.
- That no test fails without the option at the version pinned: **reasoned**. The default is the same fiber, so the
  rule of [`AGENTS.md`](../../../AGENTS.md) that a change of a fork has a test failing without it cannot be met. What
  would fail is the spike, which sees the default, if a release changed it while the option stays.

## Consequences

- [`src/runtime.ts`](../../../src/runtime.ts) passes the option at the four forks, and says why at each place.
- A fork added later from a region that cannot be interrupted passes it too.
