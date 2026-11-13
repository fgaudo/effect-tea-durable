# 0293. Two entities' timers due at one time fire in no order, and a rehearsal runs its scenario under both

**Status:** proposed, 2026-11-13, for the step Two entities' timers due at one time, in no order, of the
[roadmap](../roadmap.md). The maintainer chose it in a session of 2026-11-13, after an opinion of a second model, Fable
5.2. Nothing of it is written yet. Two of its premises failed on 2026-11-13, before the step began: the order of one
loaded entity's timers, and hands as new in a second call of the scenario. The maintainer chooses what the two
bullets of the decision that rest on them become. A second model, Fable 5.2, recommended that the runtime keep one
entity's order where its loop takes a `Fire`, and that a hand that keeps a value be made in the scenario. The four
risks it raised were tested the same day, under What it rests on.

## Context

[Decision 0292](0292-the-processs-state-is-a-pure-core-and-a-test-holds-an-order-by-its-events.md) rested on the
rehearsal and the runtime firing first the same of two timers due at one time. The premise failed, as the tests `two
timers due at one time` of [`src/runtime/loop.test.ts`](../../src/runtime/loop.test.ts) show.

- **The rehearsal fires first the timer of the entity created first.** Within one entity it fires first the timer its
  machine holds first (`dueBy` of [`src/rehearse.ts`](../../src/rehearse.ts)).
- **The runtime has no one place that orders the timers of two entities.** A loaded entity fires each of its timers
  from a fiber of its own, and two fibers woken at one time run in the order the scheduler gives them. Under the
  default scheduler they run in the order they were armed, and a schedule of `src/testing.ts` runs either first.
  The waker activates the entities it does not hold in the order of their ids (`due` of
  [`src/storage/entities.ts`](../../src/storage/entities.ts)). After a crash every entity is unloaded, so the order of
  the same two timers changes with what the process held.
- **On Cluster each runner has a waker of its own,** which reads only the shards the runner holds. The log promises an
  order only within a partition (`docs/design.md`, under The order of the log).

`docs/design.md` says that `advance` fires each timer due "in the order of the times", and nothing of two timers due
at one time. So a test that passes on the rehearsal by the order of two entities' timers may fail on the runtime, and
nothing tells the test's writer.

## Decision

- **Of two entities' timers due at one time, no order holds.** `docs/design.md` says so where it says what `advance`
  does, and the glossary's entry of a timer says it too.
- **Within one entity, the timers due at one time fire in the order its machine holds them.** That order is the
  machine's, in [`src/machine.ts`](../../src/machine.ts). The premise that the runtime keeps it failed for a loaded
  entity, under What it rests on. So this bullet holds only once the runtime offers one entity's firings due at one
  time in the machine's order, or it becomes the rule that no order holds within one entity either, and a rehearsal
  reverses those too. The order the machine holds is not one order across a restart either: a timer armed again
  goes last while the entity is loaded, and takes its place in the stored work after a restart. So an order the
  runtime keeps is defined by the stored work, as `work` gives it, and not by the timers running. The maintainer
  chooses.
- **A rehearsal of several entities runs its scenario twice where two entities' timers are due at one time.** The
  first run fires the timers of the entities due at one time in the order of creation, as today. The second run
  fires every such group in the reverse order. A test whose assertion depends on the order of two entities' timers
  fails in one of the two runs, every time, and its failure names the time and the entities.
- **Two runs hold every pair of entities in both orders, and no more.** Of any two entities due at one time, one
  fires first in the first run and the other in the second. A test that depends on the order of three entities at
  once, as one that passes only when `a` fires between `b` and `c`, may pass both runs.
- **An option of `rehearse.together` runs every order, up to a bound.** Under it a group of up to four entities runs
  in each of its orders, 24 at most. A larger group runs in the order of creation, its reverse and a sample a seed
  draws, and a failure names the seed. The step names the option.
- **A rehearsal warns of a group of three entities or more due at one time, under two runs.** The warning says that
  an order of three entities is not checked, and names the option.
- **The scenario is a function the rehearsal may call more than once.** A scenario that keeps a value outside the
  world, as a list of what fired, makes it again in each call. `docs/design.md` says it under Rehearsing a world.
  The services the scenario runs with are provided outside the rehearsal, and are built once for both calls, as a
  premise below found. So a hand that keeps a value keeps it across the two runs, unless the rehearsal builds the
  services itself, from a layer it is given, or a hand that keeps a value is made in the scenario. The maintainer
  chooses.

## What it rests on

- That `docs/design.md` promises no order of two entities' timers due at one time: **read** in its section on
  Rehearsing, where `advance` fires the timers due "in the order of the times", and nowhere else.
- That the runtime fires two entities' timers due at one time in an order of its own: **tested** by `the runtime fires
  first the timer of the smaller id, for entities unloaded, unlike a rehearsal`, in `src/runtime/loop.test.ts`.
- That the runtime keeps no order of two loaded entities' timers due at one time: **tested** by `the runtime may fire
  first either timer, for entities loaded, under prioritized schedules`, in `src/runtime/loop.test.ts`. Seed 47 fires
  first the timer of the entity created second.
- That one entity's timers due at one time fire in the machine's order on the rehearsal, after a restart too:
  **tested** by `a rehearsal fires them in the order the machine holds them, after a restart too`, in
  `src/runtime/loop.test.ts`.
- That one entity's timers due at one time fire in the machine's order on the runtime, for an entity unloaded and
  after a restart: **tested** by `the runtime fires them in the order the machine holds them, unloaded, under
  prioritized schedules` and `the runtime fires them in the order the machine holds them, restarted, under prioritized
  schedules`, in `src/runtime/loop.test.ts`, under every seed of `SCHEDULES=all`.
- That one entity's timers due at one time fire in the machine's order on the runtime, for an entity loaded:
  **failed**, **tested** by `the runtime may fire them out of the order the machine holds them, loaded, under
  prioritized schedules`, in `src/runtime/loop.test.ts`. Each timer sleeps in a fiber of its own, and both wake at one
  move of the clock. Seed 11 fires the second timer first, and so do 65 seeds of 2,000. The test `the runtime fires
  them in the order the machine holds them, loaded` passes, since the default scheduler runs the two fibers in the
  order they were armed.
- That one entity's timers armed in two steps for one time fire in the machine's order on a clock that is real:
  **failed**, **tested** by `fire out of the order the machine holds them, in some entities`, in
  `src/runtime/loop.test.ts`, which `bun run test:release` runs. Each timer sleeps the time left from the wall
  clock's millisecond, and the platform wakes it by a clock of its own. From one entity in twenty-five to one in
  eight fired the second timer first. So the order fails in production too, and not only under a schedule of
  `src/testing.ts`.
- That the order the machine holds one entity's timers in stays the same across a restart: **failed**, **tested** by
  `a rehearsal fires the timer armed again last, and first after a restart` and `the runtime fires the timer armed
  again last, and first after a restart`, in `src/runtime/loop.test.ts`. A timer armed again leaves `running` and
  enters it at its end, and an activation rebuilds `running` in the order of the stored work.
- That the machine keeps the order of the record `work` gives: **tested** by `a key's text is never a text JavaScript
  orders as a number`, in `src/machine.test.ts`. A key's text is the JSON of an array.
- That a program may write its keys in any order: **failed**, **tested** by `keys named by numbers are held in the
  order of the numbers, not the order the program writes`, in `src/machine.test.ts`. A record keyed by names like `2`
  and `1` lists them in the order of the numbers, so an order of one entity's timers by `work` holds such keys in
  that order.
- That two runs fail a test that depends on the order of a pair, among three entities due at one time: **open**. A
  test of [`src/rehearse.test.ts`](../../src/rehearse.test.ts) checks it.
- That the option of every order fails a test that depends on the order of three entities, which two runs pass:
  **open**. A test of `src/rehearse.test.ts` checks it.
- That a second call of the scenario finds a world as new: **tested** by `called twice under one provide, finds a world
  as new and the hands built once`, in `src/rehearse.test.ts`. Each call of `together` makes a world of its own.
- That a second call of the scenario finds the hands as new: **failed**, **tested** by `called twice under one
  provide, finds a world as new and the hands built once`, in `src/rehearse.test.ts`. A layer provided outside the
  rehearsal is built once for the two calls, so what a hand keeps carries into the second.
- That a layer the scenario provides itself is built again in each call, with another layer provided outside the
  rehearsal: **tested** by `called twice, builds a layer the scenario provides once in each call, with another
  provided outside`, in `src/rehearse.test.ts`. So a hand that keeps a value, made in the scenario, is new in each
  run.
- That a second run of a scenario costs less than a test that passes on the rehearsal and fails on the runtime:
  **chosen** by the maintainer.

## Alternatives

- **The order of creation, promised.** After a crash every entity is unloaded and fires in the order of its id, so
  the waker would need a sequence of creation stored with an index, and Cluster has no sequence across its shards.
- **The order of the ids, promised.** Two runners of Cluster each run a waker of their own, and no one orders the
  timers of two shards.
- **One fixed order in the rehearsal, the reverse of today's.** It is a second order a test may depend on, and finds
  nothing the first does not.
- **An order a seed draws, in one run.** It runs the scenario once, and one run holds one order of each pair, so a test
  that depends on the order passes half the time.
- **Every order, always.** A group of n entities runs n! times, which a scenario that creates many entities at once
  cannot pay.

## Consequences

- [Decision 0292](0292-the-processs-state-is-a-pure-core-and-a-test-holds-an-order-by-its-events.md) keeps no order
  of the timers due in its shared layer. The waker's policy stays among the policies of the runtime alone.
- The tests `two timers due at one time` of `src/runtime/loop.test.ts` assert that neither order is promised, once the
  step is done.
- The [open question](../open-questions.md#running) The order of two timers due at one time leaves when this note is
  taken.
