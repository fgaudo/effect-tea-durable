# 0068. What another fiber reads changes in one step

**Status:** accepted, 2026-10-31. Its tests under budgets of steps run under the scheduler of the tests of
[decision 0104](0104-the-runtimes-tests-choose-where-fibers-yield.md) instead.

## Context

A fiber yields to the others every so many steps of its own, wherever that count falls. The runtime kept some of
its bookkeeping in two steps that another fiber reads between:

- **An operation or a timer was held after its fork.** `start` forked the operation's fiber, and then held it in
  the entity's `operations`, which the fiber left as it ended. A fork that yielded before the second step let the
  fiber end in between: it left nothing, and was then held for ever. `settled` never returned, and the entity was
  never unloaded, since it seemed to run an operation ([decision 0029](0029-an-idle-entity-is-unloaded.md)). A
  timer was held the same way, and a stale one cost nothing but a fiber interrupted after its end. It dates from
  the first runtime.
- **An entity left the process apart from telling the waker.** An unload poked the waker and then deleted the
  entity from the ones the process holds, so that its timers were always either armed here or counted among the
  stored ones. A waker the poke woke could read in between, leave the entity out as held, find no poke left, and sleep
  past its timer. A crash deleted the entity first and poked last, with the callers failed in between.

The tests ran every fiber with the budget Effect gives it, 2048 steps, and never saw either.

## Decision

- **A fiber is held only if it has not ended.** One helper, `forkHeld`, forks the fiber with a finalizer that marks
  it ended, takes it out of what holds it and tells `settled` that something ended, in one step; the fork holds the
  fiber only if the mark is not set. Operations and timers are both forked through it.
- **An entity leaves the process in one step.** `leave` deletes the entity from the ones the process holds, sets
  the waker's flag, pokes it and tells `settled`, together: a reading that left the entity out is made again, and
  one made after counts its timers. An unload and a crash both leave through it.
- The rule behind both: bookkeeping another fiber reads is changed in one synchronous step, never across a yield.

## Alternatives

- **Effect's `FiberMap`**, which holds fibers by key and drops them as they end. It needs a scope per entity, and
  the map's own bookkeeping would have to be read by `settled` and `nothingToDo` in place of the runtime's.
- **Waiting in the fiber until it is held**, behind a latch the fork opens. A step more for every operation, to
  keep two steps that one can replace.

## Consequences

- [`src/runtime.ts`](../../src/runtime.ts) forks operations and timers through `forkHeld`, and an entity leaves
  through `leave`.
- [`src/runtime.test.ts`](../../src/runtime.test.ts) runs a creation, an unload and a timer's wake under every
  budget from 3 to 400 steps (`Scheduler.MaxOpsBeforeYield`), which moves every point where a fiber yields. Run
  before this decision, the process failed to settle under sixteen of them, and under fourteen before
  [decision 0067](0067-each-entity-is-held-by-its-own-lock.md), whose lock moved where the fibers yield. Below 3
  a fiber does nothing but yield.
- No budget made a waker read between an unload's two steps: the waker needs more steps to reach its reading than
  the one between them. That half of the decision has no test that fails without it; it holds because a
  synchronous step cannot be split.
