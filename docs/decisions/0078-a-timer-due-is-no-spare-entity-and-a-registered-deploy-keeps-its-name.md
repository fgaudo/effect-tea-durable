# 0078. A timer due is no spare entity, and a registered deploy keeps its name

**Status:** accepted, 2026-10-31. Corrects [decision 0076](0076-a-process-over-its-capacity-unloads-the-least-recently-used.md)
on what a process over its capacity may unload, and [decision 0075](0075-a-name-is-deployed-once-in-a-process.md) on
when a deploy gives its name back. What a deploy interrupted before it registers leaves is corrected by
[decision 0102](0102-a-deploy-interrupted-before-it-registers-undoes-itself.md), which tests an interruption between
the registration and the end too; the readings of a timer due that this note says no test reaches are tested, by
[decision 0103](0103-a-test-moves-the-wall-clock-ahead-of-the-sleeps.md). The waker is interruptible by the option of
its fork, not by Effect's default, by [decision 0112](0112-a-fork-from-a-region-that-cannot-be-interrupted-says-it-is-interruptible.md).

## Context

A process over its capacity told the least recently used entities with nothing to do to leave, nothing to do being
what passivation reads: only timers left ([decision 0029](0029-an-idle-entity-is-unloaded.md)). But a timer already
due is no wait: it is a firing its sleep is about to offer. When the waker activates many entities whose time has
come, past the capacity, each one entering can tell an earlier one to leave before that one's timer has fired. The
entity is unloaded with its timer stored, and the waker activates it again: run on the real clock, twenty entities
of a capacity of two were unloaded up to fifty-eight times instead of forty. Nothing was lost, since the stored
time stands, but every extra activation costs a transaction and can push out another entity.

A deploy gave its name back when it failed, interruption included. A deploy interrupted after it registered its
deployment still had steps to run — waking the operations waiting for it, starting its waker — so it could give
the name back while its deployment stayed reachable, and a second deploy of that name would pass. And a deployment
registered without its waker would never fire a timer of an unloaded entity.

## Decision

- **An entity is spare when it has nothing to do and none of its timers is due**, at the time it is told to leave
  and again when its loop unloads it. A suspended entity arms no timer, and is spare as before. Passivation keeps
  reading only that the entity has nothing to do: it waits long enough that a timer due has fired.
- **A deploy gives its name back only when its deployment is not registered.** Registering it, waking what waits
  for it and starting its waker are one step that an interruption does not split; the waker stays interruptible, as
  the deployment's scope that stops it needs.

## Alternatives

- **Excluding the entity just woken by the waker.** The waker activates entities one after another, and each is
  only "just woken" until the next one enters; a timer due says what the entity is about to do, whoever woke it.
- **Giving the name back from the deployment's scope when it closes.** A deployment's scope closes only with the
  process once it is registered, so the name would be held exactly as long, through a second mechanism.

## Consequences

- [`src/runtime.ts`](../../src/runtime.ts) reads the clock when an entity enters, and when a loop takes the telling
  to leave.
- No test of [`src/runtime.test.ts`](../../src/runtime.test.ts) reaches either case: on the test clock a timer due
  fires as it is armed, before any entity can enter, under every budget of steps; and an interruption reaches a
  deploy between its registration and its end only if it arrives in steps that do not wait, which no probe marks.
  The first holds because a timer due is read from the stored work, which the entity's arming made, in the same
  step as the rest of what is spare; the second holds by construction, since the region that registers is
  uninterruptible and the release checks the registration in the step that gives the name back. A test runs the
  waker past a capacity under every budget, and checks that every timer fires and each entity is unloaded once.
- A deploy that fails also takes what it loaded out of the order of use, so that it holds no place under the
  capacity: a fix of the code of decision 0076, which its rule already said.
