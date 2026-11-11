# 0261. The drain reaches a deployment still activating

**Status:** accepted, 2026-11-11, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the fix of bug 66. It changes
[decision 0119](archive/0119-a-planned-stop-drains-the-at-most-once-operations.md): the drain stops and counts every
deployment from the claim of its name, and not only the deployments registered.

## Context

A planned stop stops at once the timers, the waker and the operations that run again of the deployments registered,
and waits for their at-most-once operations (decision 0119). A deploy registers only once its activations are done
([decision 0051](archive/0051-a-deploy-that-fails-leaves-nothing-running.md)). So a deploy still activating when the
drain begins was out of the drain's reach. The operations that run again of the entities it had activated ran for
the drain's whole time. Its registration during the drain forked a waker, which activated entities whose timers came
due. And the drain did not count its entities, so it could close the scope on an at-most-once operation the deploy
had started, which the next process then delivered `unknown`. The maintainer chose this fix on 2026-11-11, after the
opinion of a Fable 5.2 agent.

## Decision

- **The process holds every deployment from the claim of its name to its undo**, in `made` of
  `src/runtime/process.ts`, registered or still activating. `deployments` stays the deployments registered, which a
  caller, an operation and the waker reach.
- **The drain stops the timers and the operations that run again of every deployment in `made`, and waits for the
  entities of each**, as decision 0119 says of a deployment registered.
- **No activation of a deploy starts once the drain began.** The deploy registers without activating the entities
  left, and the next process activates them. So the drain waits for no at-most-once operation of an entity it found
  unloaded.
- **A deployment registered during the drain wakes no timer.** Its waker is interrupted as it is forked, so that a
  drain that began before the fork finds no waker running, and a drain that begins after finds the waker in `made`.
- **A drain that looks while a deploy loads an entity closes the scope before the entity's activation commits**, so
  nothing of that entity is stored. So the drain needs no count of the activations under way.

The decision leaves out three cases, which go in [`docs/open-questions.md`](../open-questions.md):

- A deploy that fails during the drain closes its scope at once (decision 0051), and its at-most-once operations
  are interrupted, as bug 67 says of a deploy interrupted by the planned stop.
- On Cluster, the singleton of a shard activates entities before the deployment registers. The drain reaches them
  through `made` as on one process, but no test runs a drain on Cluster with a deploy under way.
- On Cluster, the round of a shard's activation goes on in the drain, and may start an at-most-once operation
  there.

## Alternatives

- **A deploy refuses to register once the drain began, and undoes itself.** Its at-most-once operations would be
  interrupted and deliver `unknown`, which decision 0119 is made to avoid, and the deploy would fail for its caller.
- **The drain waits, within its time, for the deploys under way to register, then stops them as the others.** The
  operations that run again would run until the registration, and an activation that outlasts the drain's time
  would leave the bug as it was.
- **The activations of a deploy are counted while they run, as the rounds of a shard are on Cluster**, so that a drain
  between two activations waits for the deploy. The Fable 5.2 agent proposed it. No schedule within one deviation
  finds the drain between two activations, and a count no test needs is not added.

## What it rests on

- That the drain stops at once the operations that run again of a deployment still activating, that a registration
  during the drain wakes no timer, and that no activation starts once the drain began: **tested** by `a deploy that
  registers during the drain has the operations that run again stopped at once`, in `src/runtime.test.ts`. It fails
  against the code before the change, without the check of `p.draining` in the loop of activations, and without the
  interruption of the waker as it is forked.
- That the drain waits for the entities of a deployment still activating: **tested** by `a drain that looks while a
  deploy activates closes on no at-most-once operation the deploy stores, under every deviation`, in
  `src/runtime.test.ts`, which pins the deviation `{ decision: 80, choice: 1 }`. It fails with `drained` reading the
  registered deployments alone, the pin `0261` of `src/runtime.test_pins.ts`.
- That a drain that looks while a deploy loads an entity finds the scope closed before the entity's activation
  commits: **tested** by the same test, under every deviation of `bun run test:release`. Run with the drain counting
  no activation, a probe of the drain logged 21 deviations in which it looked during a load, and none between two
  loads, and every one ended with no `unknown`.
- That the explored tests keep their pinned interleavings: **tested** by `bun run test:pins`. The change adds a
  check of `p.draining` and an interruption at the registration.
</content>
</invoke>
