# 0293. Two entities' timers due at one time fire in no order, and a suspension closes a rehearsal's world

**Status:** proposed, 2026-11-13, for the step Two entities' timers due at one time, in no order, of the
[roadmap](../roadmap.md). Nothing of it is written yet. The maintainer chose its rules in a session of 2026-11-13,
after three opinions of a second model, Fable 5.2, and the tests that checked them. A first form had a rehearsal run
its scenario a second time with every group of entities due at one time reversed. It was dropped once a test showed
that the order changes nothing a test reads of a pure program, and its rules are under Alternatives. What it left is
a rule found on the way: after a defect the scenario catches, a rehearsal read what the order decided, so a
suspension now closes the world.

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
at one time. So a test might pass on the rehearsal by the order of two entities' timers, and fail on the runtime.
Under What it rests on, a test shows that it cannot for a program whose `update` is pure, except after a defect the
scenario catches.

## Decision

- **Of two entities' timers due at one time, no order holds.** `docs/design.md` says so where it says what `advance`
  does, and the glossary's entry of a timer says it too.
- **A rehearsal fires them in the order of creation, and checks no other.** An entity reaches another only through
  an operation, which runs when the test runs it, and a firing reaches only its own entity. So the order changes
  nothing a test reads of a program whose `update` is pure. `docs/design.md` says it under Rehearsing a world, and
  says that a program whose `update` reads outside its state may see the order, which the runtime does not keep.
- **Within one entity, the timers due at one time fire in the order of the stored work.** That order is the order of
  the record `work` gives, as the machine stores it in [`src/machine.ts`](../../src/machine.ts). It is not the order
  of the timers running, which a timer armed again changes while the entity is loaded, and a restart changes back.
  A record keyed by names like `2` and `1` lists them in the order of their numbers, and `docs/design.md` says so.
- **The runtime keeps that order where an entity's loop takes a `Fire`.** The `Fire` of any timer of the entity
  fires, of its timers due by then, the one due earliest, and of those due at one time the first in the stored work.
  The fiber of each timer stays as it is, and only says that a timer of the entity is due. The `Fire` of a timer
  that already fired arrives later with an incarnation the machine no longer holds, and is dropped. So the order
  holds whichever fiber wakes first, under a schedule of `src/testing.ts` and on a clock that is real. The loop finds
  the timer to fire by the function of the machine below.
- **The rehearsal orders one entity's timers by the stored work too,** in `dueBy` of
  [`src/rehearse.ts`](../../src/rehearse.ts), and no longer by the timers running.
- **The choice of an entity's next timer is one function of the machine.** A function of `src/machine.ts` gives, of
  an entity's timers due by a time, the one due earliest, and of those due at one time the first in the stored work.
  The runtime calls it where an entity's loop takes a `Fire`, and the rehearsal calls it in `dueBy` for each entity.
  So the rule is written once, as decision 0292 wants of a rule both run, and its test lies in
  `src/machine.test.ts`. The rehearsal alone then chooses among the entities, by the order of creation.
- **A suspension closes the world.** When an act of the scenario suspends an entity, the world keeps the cause of
  that first suspension. Every act and every read of the world after it dies with that cause: `create`, `send`,
  `answer`, `fire`, `run`, `advance`, `restart`, `deploy`, `state`, `projection`, `pending` and `underWay`. The
  rehearsal, of one entity or of several, fails with that cause when the scenario returns, even where the scenario
  caught the defect. So a scenario reads nothing that an order decided after a defect, and the sentence that a defect
  fails the test holds whatever the scenario does.
- **A rehearsal applies a defect of an operation as the runtime does, by the machine's `Die`.** On the runtime a
  runner that dies is offered to its entity as `Die`, with its key, its incarnation and its cause, and the machine
  suspends the entity (`docs/design.md`, under Defects). In a rehearsal today the run fails alone. So a run whose
  runner dies applies `Die` to the entity, and the suspension closes the world. A runner that dies, a run that sends
  twice under one name, a droppable operation that sends, and an id the runtime refuses in a runner's `send` or
  `create` are each a defect of the operation. The closed world then needs no rule of its own for an operation: it
  closes at a suspension, whatever event made it.
- **A mistake of the test leaves the world open.** A message its schema refuses, an answer to a timer or a run of
  work that is no operation, a creation of an entity that exists, and an id the runtime refuses in the test's own
  `create` fail the act alone. A scenario that catches such a failure goes on, and reads the world as before.
  `docs/design.md` says the three rules under Rehearsing a world.

## What it rests on

- That the order in which a rehearsal fires two entities' timers due at one time changes what a test reads of the
  entities: **failed**, **tested** by `changes nothing a test reads of the entities`, in `src/rehearse.test.ts`. It
  runs histories that fast-check generates, of two to four orders created in two orders, of payments, cancellations,
  declined charges and times passing, and compares each entity's state, projection and work under way. An entity
  reaches another only through an operation, which runs when the test runs it, and a firing reaches only its own
  entity. So only a program whose `update` reads something outside its state sees the order. The rule that a
  rehearsal checks no other order rests on this premise.
- That the histories of that test reach timers of two entities due at one time fired in two orders: **tested** by
  `changes what a program reads of the order, which the histories reach`, in `src/rehearse.test.ts`, whose program
  counts the deadlines passed outside its state, and ends otherwise in the two worlds.
- That a defect among timers of two entities due at one time leaves nothing that depends on their order: **failed**,
  **tested** by `with a defect among them, shows a scenario that catches it which fired first`, in
  `src/rehearse.test.ts`. A defect ends `advance` where it falls, and the timers due at that time that have not fired
  yet do not fire. A scenario that catches the defect with `Effect.exit` reads the other entity fired when it came
  first, and not fired when it came second, and the rehearsal ends in success. The runtime suspends the broken entity
  alone, as `docs/design.md` says of a defect, so the other fires in both orders. A closed world takes this case
  out.
- That a restart after a defect leaves nothing that depends on the order of the entities' creation: **failed**,
  **tested** by `a restart after a caught defect shows a scenario which entity was created first`, in
  `src/rehearse.test.ts`. `restart` activates the entities one after another, and a suspended entity's activation
  dies again, so the entities created after it are not activated. An email under way of the other entity is told
  unsure only where that entity was created first, and the rehearsal ends in success.
- That a run whose receiver's defect the scenario catches leaves nothing that depends on an order: **tested** by `a
  run whose receiver defects, caught, leaves its operation under way`, in `src/rehearse.test.ts`. The sender's
  operation stays under way, as the runtime keeps an operation answered `Suspended` waiting for the receiver's
  resumption (`docs/design.md`, under Defects).
- That a defect fails the rehearsal whether or not the scenario catches it: **failed**, **tested** by the three tests
  above, each of which ends in success after the scenario caught the defect. `src/rehearse.ts` says that a defect that
  suspends an entity fails the test, which holds only where the scenario lets the defect through.
- That a suspension closes the world, rather than a rule that only `docs/design.md` states: **chosen** by the
  maintainer, after Fable 5.2's opinion. A rule only stated leaves the three tests above ending in success.
- That a closed world fails a rehearsal with the cause of its first suspension, in both orders of creation: **open**.
  The tests `with a defect among them, shows a scenario that catches it which fired first` and `a restart after a
  caught defect shows a scenario which entity was created first` then assert it, and are renamed with it.
- That each act and read of a closed world dies with the first cause: **open**. A test of `src/rehearse.test.ts` for
  each of `state`, `send`, `advance` and `restart` after a caught suspension checks it.
- That a run whose receiver's defect is caught fails the rehearsal: **open**. The test `a run whose receiver defects,
  caught, leaves its operation under way` then asserts it, and is renamed with it.
- That a mistake of the test suspends no entity in a rehearsal, and a defect of `update` suspends its entity:
  **tested** by `of a mistake of the test suspends no entity, and one of update suspends its entity`, in
  `src/rehearse.test.ts`. After each mistake the entity handles the next message, and after the defect it does not.
- That a defect of an operation suspends its entity in a rehearsal, as on the runtime: **failed**, **tested** by `of
  an operation's defect suspends no entity in a rehearsal, unlike the runtime`, in `src/rehearse.test.ts`. A run
  that sends twice under one name and a runner that dies each fail the run alone, and the entity handles the next
  message. So the step makes the defect of an operation close the world, and that test then asserts it.
- That a mistake of the test leaves a closed world open, alone and in a world: **open**. The tests of
  `src/rehearse.test.ts` that catch such a mistake, and the scenarios of `examples/cart`, which read the state after
  one, pass as they are once the world closes at a suspension.
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
- That the runtime offers a runner's death to its entity as `Die`, which suspends the entity: **tested** by `a
  droppable operation that sends to an entity dies, and suspends its entity`, in `src/runtime.test.ts`, and by `an
  operation that dies answers Suspended every caller waiting`, in `src/machine.test.ts`.
- That a rehearsal's run whose runner dies applies `Die`, and fails the rehearsal with the runner's cause: **open**.
  The test `of an operation's defect suspends no entity in a rehearsal, unlike the runtime` then asserts that the
  entity is suspended and the world closed, and is renamed with it.
- That the machine's choice of an entity's next timer gives, within one entity, what `dueBy` gives today, but for a
  timer armed again: **open**. The tests of `src/rehearse.test.ts` pass as they are, and a test of
  `src/machine.test.ts` checks the choice for times, for the stored work's order and for a timer armed again.
- That one function of the machine chooses an entity's next timer, rather than a rule written in the runtime and in
  the rehearsal: **chosen** by the maintainer, as decision 0292 chose for the rules both run.
- That the runtime keeps one entity's order, rather than promising none within one entity: **chosen** by the
  maintainer, after Fable 5.2's opinion. One entity has one loop and one runner on Cluster, so one place orders its
  timers.
- That a rehearsal checks no order of two entities but the order of creation, rather than running its scenario under
  others: **chosen** by the maintainer, on the test `changes nothing a test reads of the entities`.
- That the `Fire` of a timer already fired by another timer's `Fire` is dropped, and writes nothing: **open**. A test
  of the runtime with one entity's two timers due at one time checks it, by the events committed.
- That no timer fires twice when another timer's `Fire` fires it first: **open**. The same kind of test checks it,
  under prioritized schedules.
- That one loaded entity's timers due at one time fire in the order of the stored work under every seed and on a
  clock that is real: **open**. The tests `the runtime may fire them out of the order the machine holds them, loaded,
  under prioritized schedules`, `fire out of the order the machine holds them, in some entities` and `the runtime
  fires the timer armed again last, and first after a restart` then assert that order, and are renamed with it.

## Alternatives

- **The order of creation, promised.** After a crash every entity is unloaded and fires in the order of its id, so
  the waker would need a sequence of creation stored with an index, and Cluster has no sequence across its shards.
- **The order of the ids, promised.** Two runners of Cluster each run a waker of their own, and no one orders the
  timers of two shards.
- **A second run of the scenario, with every group of entities due at one time reversed,** where the first run met
  one, and an option that runs every order of a group of up to four. Two runs hold every pair in both orders, and the
  option every order of three or four. The order changes nothing a pure program shows, so the runs would check what
  no test reads. They would cost a scenario that may be called more than once. A layer provided outside a rehearsal
  is built once for two calls, as a test showed that git keeps, so whatever keeps a value would have to be made in the
  scenario, and a third run would have to tell a value carried from an order a test depends on.
- **An order a seed draws, in one run, or every order, always.** The first holds one order of each pair in a run, and
  the second runs a group of n entities n! times. Both check what no test reads.
- **No order within one entity either.** One entity has one loop and one runner, so one place can order its timers.
- **A defect that ends `advance` only once every timer due at its time has fired.** It closes the hole of `advance`
  alone, and leaves the one of `restart`. Two defects at one time would make the cause the rehearsal reports depend
  on the order again.
- **A closed world stated in `docs/design.md` alone.** The tests that catch a defect and read the world would go on
  ending in success.

## Consequences

- [Decision 0292](0292-the-processs-state-is-a-pure-core-and-a-test-holds-an-order-by-its-events.md) keeps no order
  of the timers due in its shared layer. The waker's policy stays among the policies of the runtime alone.
- The tests `two timers due at one time` of `src/runtime/loop.test.ts` assert that neither order is promised, once the
  step is done.
- The [open question](../open-questions.md#running) The order of two timers due at one time leaves when this note is
  taken.
