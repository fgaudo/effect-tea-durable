# 0293. Two entities' timers due at one time fire in no order, and a rehearsal runs its scenario under both

**Status:** proposed, 2026-11-13, for the step Two entities' timers due at one time, in no order, of the
[roadmap](../roadmap.md). The maintainer chose it in a session of 2026-11-13, after an opinion of a second model, Fable
5.2. Nothing of it is written yet. Two of its premises failed on 2026-11-13, before the step began: the order of one
loaded entity's timers, and hands as new in a second call of the scenario. A second model, Fable 5.2, recommended
that the runtime keep one entity's order where its loop takes a `Fire`, and that a hand that keeps a value be made in
the scenario. The four risks it raised were tested the same day, under What it rests on. The maintainer chose, in the
same session, that the runtime keep one entity's order, by the stored work. After a second opinion of Fable 5.2, the
maintainer chose too that whatever keeps a value is made in the scenario, and that a failed second run is told apart
by a third. Later the same day, the premise that the second run checks something a test reads failed: in a world,
the order of two entities' timers due at one time changes nothing a test reads of a program whose `update` is pure.
The bullets of the second run rest on it, and the maintainer chooses what they become. One case of it failed too: a
defect ends `advance` before the other timers due at that time fire, so a scenario that catches the defect reads
which entity fired first. Fable 5.2 then recommended that a suspension close the world: every act and read after it
dies with its cause, and the rehearsal fails even where the scenario caught it. Of the two other holes it raised, the
one of `restart` was found and the one of `run` was ruled out, the same day. The maintainer chose that a suspension
closes the world. Whether the second run stays is still the maintainer's to choose.

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
- **Within one entity, the timers due at one time fire in the order of the stored work.** That order is the order of
  the record `work` gives, as the machine stores it in [`src/machine.ts`](../../src/machine.ts). It is not the order
  of the timers running, which a timer armed again changes while the entity is loaded, and a restart changes back.
  A record keyed by names like `2` and `1` lists them in the order of their numbers, and `docs/design.md` says so.
- **The runtime keeps that order where an entity's loop takes a `Fire`.** The `Fire` of any timer of the entity
  fires, of its timers due by then, the one due earliest, and of those due at one time the first in the stored work.
  The fiber of each timer stays as it is, and only says that a timer of the entity is due. The `Fire` of a timer
  that already fired arrives later with an incarnation the machine no longer holds, and is dropped. So the order
  holds whichever fiber wakes first, under a schedule of `src/testing.ts` and on a clock that is real. The step
  decides whether the rule lies in the machine, with its test in `src/machine.test.ts`, or in the loop.
- **The rehearsal orders one entity's timers by the stored work too,** in `dueBy` of
  [`src/rehearse.ts`](../../src/rehearse.ts), and no longer by the timers running.
- **A suspension closes the world.** When an act of the scenario suspends an entity, the world keeps the cause of
  that first suspension. Every act and every read of the world after it dies with that cause: `create`, `send`,
  `answer`, `fire`, `run`, `advance`, `restart`, `deploy`, `state`, `projection`, `pending` and `underWay`. The
  rehearsal, of one entity or of several, fails with that cause when the scenario returns, even where the scenario
  caught the defect. So a scenario reads nothing that an order decided after a defect, and the sentence that a defect
  fails the test holds whatever the scenario does.
- **A failure of the rehearsal that suspends no entity leaves the world open.** A message its schema refuses, a run
  that sends twice under one name, work of the wrong kind, a creation of an entity that exists, or an id the runtime
  refuses fails the act alone. A
  scenario that catches such a failure goes on, and reads the world as before. `docs/design.md` says both rules under
  Rehearsing a world.
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
- **The scenario is a function the rehearsal may call more than once.** Whatever keeps a value is made in the
  scenario: a hand that keeps a value is provided by the scenario itself, and a list the test asserts on is made and
  asserted in the scenario. A hand that keeps nothing, as one of `Layer.mock`, may stay provided outside the
  rehearsal. A layer provided outside is built once for every call, and a layer the scenario provides is built again
  in each. `docs/design.md` says it under Rehearsing a world.
- **The scenario runs a second time only where the first run met a group of two entities or more due at one time.**
  A scenario with no such group is called once, as today.
- **A second run that fails is told apart by a third, in the first run's order.** A third run that fails too finds a
  scenario that is not the same in each call: the failure says that a value was likely carried from one call to the
  next, and names the rule above. A third run that passes finds a test that depends on the order: the failure names
  the second run, the reversed order, the time and the entities. "Likely" is said since a value that alternates from
  call to call fools the third run.
- **Each second run writes a line to Effect's log,** with the time and the entities. An assertion the test makes on
  a list of its own after the rehearsal returns fails where the rehearsal cannot reach it, and the line is what the
  rehearsal puts beside that failure.

## What it rests on

- That the order in which a rehearsal fires two entities' timers due at one time changes what a test reads of the
  entities: **failed**, **tested** by `changes nothing a test reads of the entities`, in `src/rehearse.test.ts`. It
  runs histories that fast-check generates, of two to four orders created in two orders, of payments, cancellations,
  declined charges and times passing, and compares each entity's state, projection and work under way. An entity
  reaches another only through an operation, which runs when the test runs it, and a firing reaches only its own
  entity. So only a program whose `update` reads something outside its state sees the order. The bullets of the second
  run, of the third, of the option of every order and of the warning rest on this premise.
- That the histories of that test reach timers of two entities due at one time fired in two orders: **tested** by
  `changes what a program reads of the order, which the histories reach`, in `src/rehearse.test.ts`, whose program
  counts the deadlines passed outside its state, and ends otherwise in the two worlds.
- That a defect among timers of two entities due at one time leaves nothing that depends on their order: **failed**,
  **tested** by `with a defect among them, shows a scenario that catches it which fired first`, in
  `src/rehearse.test.ts`. A defect ends `advance` where it falls, and the timers due at that time that have not fired
  yet do not fire. A scenario that catches the defect with `Effect.exit` reads the other entity fired when it came
  first, and not fired when it came second, and the rehearsal ends in success. The runtime suspends the broken entity
  alone, as `docs/design.md` says of a defect, so the other fires in both orders. The rehearsal
  would end alike if `advance` fired every timer due at the time of a defect before it ended, or if `docs/design.md`
  said that a scenario reads nothing of the world after a defect it catches. The maintainer chooses.
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
- That a failure that suspends no entity leaves the world open, alone and in a world: **open**. The tests of
  `src/rehearse.test.ts` that catch such a failure, and the scenarios of `examples/cart`, which read the state after
  one, pass as they are. A test of `rehearse.together` that catches a run sent twice, and reads the world after it,
  checks the world.
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
- That whatever keeps a value is made in the scenario, rather than given to `rehearse.together` as a layer:
  **chosen** by the maintainer, after Fable 5.2's opinion. A layer given to the rehearsal would build the services
  again, and would leave a list the test keeps outside as it is, which is the same defect.
- That a scenario with no group of two entities due at one time is called once: **open**. A test of
  `src/rehearse.test.ts` that counts the calls checks it.
- That a hand provided outside that keeps a value fails the second run, and the failure says a value was likely
  carried: **open**. A test of `src/rehearse.test.ts` with such a hand, and a scenario that asserts what it kept,
  checks it.
- That a scenario that depends on the order fails with the message of the reversed order, its third run passing:
  **open**. A test of `src/rehearse.test.ts` whose hands the scenario makes checks it.
- That a second run writes its line to the log: **open**. A test of `src/rehearse.test.ts` under a logger that keeps
  what it is given checks it.
- That the runtime keeps one entity's order, rather than promising none within one entity: **chosen** by the
  maintainer, after Fable 5.2's opinion. One entity has one loop and one runner on Cluster, so one place orders its
  timers, and a rehearsal needs no reversal within an entity.
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
- **One fixed order in the rehearsal, the reverse of today's.** It is a second order a test may depend on, and finds
  nothing the first does not.
- **An order a seed draws, in one run.** It runs the scenario once, and one run holds one order of each pair, so a test
  that depends on the order passes half the time.
- **Every order, always.** A group of n entities runs n! times, which a scenario that creates many entities at once
  cannot pay.
- **No order within one entity either, and a rehearsal that reverses those too.** One entity has one loop and one
  runner, so one place can order its timers. The reversal would reach `rehearse` of one entity too, and the orders
  of a second run would multiply.
- **A layer given to `rehearse.together`, which it builds again for each run.** It changes the signature of every
  rehearsal, and leaves a list the test keeps outside the scenario as it was.
- **A warning wherever a hand is provided outside the rehearsal.** The rehearsal sees only what the scenario
  requires, and a hand that keeps nothing is rightly provided outside, so the warning would fire on most tests that
  are right.

## Consequences

- [Decision 0292](0292-the-processs-state-is-a-pure-core-and-a-test-holds-an-order-by-its-events.md) keeps no order
  of the timers due in its shared layer. The waker's policy stays among the policies of the runtime alone.
- The tests `two timers due at one time` of `src/runtime/loop.test.ts` assert that neither order is promised, once the
  step is done.
- The [open question](../open-questions.md#running) The order of two timers due at one time leaves when this note is
  taken.
