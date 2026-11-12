# 0274. An entity is not loaded while the stop of its former run is running

**Status:** proposed, 2026-11-12, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the fix of bugs 31 and 65. Once taken, it changes
[decision 0056](archive/0056-nothing-waits-for-an-operation-under-the-permit.md): a crash still forks the stop of its
entity's work, an entity whose stop is running is not loaded again on that process, and `settled` waits for the stop.
It changes [decision 0068](archive/0068-what-another-fiber-reads-changes-in-one-step.md): an entity enters the stops of
the process in the step it leaves the process, and leaves them in the step that pokes the waker. `settled` then no
longer rests on an entity's leave and its poke being one step, and the waker's look for a poke and the clearing of its
flag stay one step. It changes
[decision 0077](archive/0077-the-waker-tries-an-entity-it-cannot-load-again.md) and
[decision 0252](0252-the-waker-activates-an-entity-a-crash-took-out-after-the-retry.md): the waker leaves an entity
whose stop runs out of its readings and its marks, and an activation refused for a stop is no failure. It changes
[decision 0162](archive/0162-on-cluster-an-entitys-shard-is-its-partition-and-each-deployment-serves-its-shards.md):
a shard lost is let go only once every stop of its entities has ended. The maintainer chose it on 2026-11-12, after
an opinion of a Fable 5.2 agent, and chose on 2026-11-12 its rule of `settled` and the waker, after a second opinion of
a Fable 5.2 agent.

## Context

An event the runtime cannot finish crashes its entity
([decision 0042](archive/0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md)). Decision 0056 makes the crash
fork the interruption of the entity's operations and timers, and wait for none of it. At that time every entity shared
one permit, and a wait under it held every `send` and `create` of the process behind the finalizer of one operation.
[Decision 0067](archive/0067-each-entity-is-held-by-its-own-lock.md) gave each entity its own lock, so that premise of
0056 fell.

The stop still runs apart from the next run of the entity. Since decision 0252 the waker activates the entity again
`retry` after the crash, with no caller coming. The activation steps `Restart` from what is stored, while the old fiber
may still run a region it holds uninterruptible, or a finalizer that acts. Two bugs of the roadmap follow:

- **Bug 31.** An at-most-once operation's `unknown` is recorded, and the program's answer to it acts, beside the old
  fiber that still acts.
- **Bug 65.** An at-least-once operation's new run ends its work, and the receiver deletes the reply of the work's
  request ([decision 0021](archive/0021-a-reply-is-kept-while-the-work-that-asked-holds.md)). The old fiber then sends
  that request from its uninterruptible region, and the receiver applies it twice.

On Cluster a shard lost crashes every entity of it that the runner holds, in `losing` of `src/runtime/doors.ts`, from
the finalizer of the shard's singleton (decision 0162). Cluster waits for that finalizer before it lets the shard go.
`losing` returned once each crash had forked its stop, so the runner that gains the shard could run an entity's
operations beside the old runner's fibers.

A first form of this note's code refused the waker's activation of an entity whose stop runs as a failure, which hides
the entity until `retry` (decision 0077). `settled` then returned with a stored timer of that entity due, which
decision 0068 forbids. `bun run test:release` found it at seed 106 of `settled never returns between a crash and the
activation its due timer brings, under prioritized schedules`, of `src/runtime/loop.test.ts`, on 2026-11-12.

## Decision

- **An entity whose stop runs is neither loaded nor the waker's, and its stop is work of the process.** A crash
  registers the entity in the deployment's map `stopping` in the step the entity leaves the process, with a latch the
  stop's end completes. The crash forks the stop in the deployment's scope, and gives the entity's lock back at once
  (decision 0056). The registration and the fork are one uninterruptible region, so that no entry is left without the
  stop that ends it. An observer of the stop's exit leaves `stopping`, completes the latch and pokes the waker, in one
  step. A stop the deployment's scope interrupts before its first step runs no finalizer
  ([decision 0110](archive/0110-detached-work-is-counted-until-it-ends-however-it-ends.md)), and its exit is observed
  all the same. A crash runs only on an entity loaded, which no stop refused, so the map holds one stop of an entity at
  most.
- **`settled` does not return while a stop runs.** The entity's next run waits for the stop, so the stop is work of
  the process, as an entity unloading is
  ([decision 0109](archive/0109-settled-waits-for-an-entity-unloading.md)). A stop that never ends keeps
  `settled` from returning, as the same region kept it from returning before the crash, through the operation it held.
- **An entity whose stop is running is refused at its entry into the process.** The check is one function of
  `src/runtime/loop.ts`, `stopped`, read by `enter` and `entersHeld`, which every load goes through, and by the creation
  before its step, since a creation refused after its commit would leave a stored entity unloaded. It dies with a
  defect of its own class, `Stopping`, which says the stop of the former run of the entity is still running.
  - **A caller's load dies** with the defect. The caller retries as after any crash of the entity. No caller waits for
    a stop, so a stop that never ends holds no caller.
  - **The waker leaves an entity whose stop runs out of its readings and of its marks**, as it leaves out the entities
    the process holds. The stop's end pokes it, and the waker reads the entity's timers and takes its crash's mark
    then. An activation the waker made just before a crash took the entity out again is refused with `Stopping`. That
    refusal is no failure, and hides nothing: the waker gives back the crash's mark it took, due, and marks nothing
    else. The waker reads the refusal from the defect's class, and not from `stopping`, since the stop may have ended
    since the refusal.
  - **A door's step on Cluster dies** inside its transaction, since `entersHeld` dies with the same defect, and
    Cluster delivers the request again. The transaction rolls back the `Restart` the step made. An activation on
    Cluster dies alike, and the waker reads it as above. No step waits for a stop inside a transaction.
- **A stop that outlives `retry` is logged once**, as a warning naming the entity, so that an operator sees an entity
  that a region which never ends keeps from loading.
- **A shard lost waits for every stop of its entities.** `losing` crashes each entity of the shard under its own lock,
  as before. Then, holding no lock, it waits for the latch of every entity of the shard in `stopping`, the ones a crash
  before the shard was lost forked too. The finalizer of the shard's singleton ends only then, and Cluster lets the
  shard go after it.

The rule holds that an incarnation's operations never run beside the next run of their entity on the same runner, and
on Cluster across an orderly move of the shard. It does not hold across a runner that loses its lease without giving
the shard up, since no runner can wait for the fibers of another. Fencing is the answer there: a write or a send of the
library refused once its run no longer holds. It is the fix of bug 57 of the roadmap, which begins at the receiver, and
is not decided here.

The decision leaves out four cases, each held by the [open questions](../open-questions.md#running) named:

- A runner that loses its lease without giving the shard up, whose operations act beside the next holder's: A send
  after the work it belongs to ended, with bug 57.
- An act on the outside world, as a call to a service, from an old run that a runner which lost its lease still runs.
  The library cannot refuse it, so an at-most-once operation's `unknown` may then be delivered beside it: An act on the
  outside world beside the next holder's run.
- A region that never ends, which keeps its entity from loading on its process for ever, `settled` from returning, and
  on Cluster its shard from moving: An entity a stop that never ends keeps from loading.
- An entity a door loads on a shard whose singleton has not started, whose crash no finalizer makes: bug 90 of the
  roadmap.

## What it rests on

- That an activation which finds the stop running records no `unknown` beside the old fiber, and that a new run never
  ends the work before the old fiber's send: **tested** by the two tests of bugs 31 and 65 in
  [`src/runtime.test.ts`](../../src/runtime.test.ts), `an at-most-once operation a crash stops delivers its unknown
  once its finalizer has run` and `a send of an operation a crash could not interrupt, after its new run ended the
  work, is applied once`. Each was a `test.failing` on the code before this note, and is a `test`, which checks that
  the caller is refused while the stop runs and served once it has ended.
- That a stop which never ends keeps the waker activating the other entities of its program, and fails each caller of
  its entity with the defect, at once: **tested** by `a stop that never ends refuses its entity at once and holds up
  no other, and the waker loads it once it ends`, in [`src/runtime.test.ts`](../../src/runtime.test.ts). A second
  entity crashed beside the first is activated by the waker while the first's stop holds.
- That an entity whose stop ends is activated by the waker, with no caller coming: **tested** by the same test, whose
  finalizer is let end.
- That `settled` does not return while a stop runs, and returns once it ends: **tested** by `settled does not return
  while the stop of a crashed entity runs, and returns once it ends`, in
  [`src/runtime.test.ts`](../../src/runtime.test.ts), which fails without the check of `stopping` in `quiet`.
- That `settled` does not return while a stored timer of an entity the process does not hold is due, where the
  waker's activation of that entity met its stop (decisions 0029 and 0068): **tested** by `settled never returns
  between a crash and the activation its due timer brings, under prioritized schedules`, in
  [`src/runtime/loop.test.ts`](../../src/runtime/loop.test.ts), under every seed of `bun run test:release`'s
  schedules. Seed 106 failed on the first form of this note's code, which hid the refused entity until `retry`. Seed
  1139 failed on a form that cleared that hiding at the stop's end, before the waker wrote it. Both are pinned. Seed 13,
  pinned, fails where the stop's end leaves `stopping` without poking the waker, as the pin `0274` of
  [`src/runtime.test_pins.ts`](../../src/runtime.test_pins.ts) runs it.
- That an observer added to a fiber is called once the fiber exits, at once if it has exited, and for a fiber
  interrupted before its first step: **documented** for `addObserver` by the stable interface `Fiber` of Effect 4.1.3,
  and **tested** by every test of this note, since each one's stop ends through it and the tests would hang without
  it. A first form of the code told the stop's end from a fiber forked in the process's scope, which Cluster's teardown
  closes before it lets the shards go, and every test of a runner on Cluster then hung at its end.
- That an entity leaves the process only by an unload or a crash, each under a guard that outlasts its poke: **read**
  in the code, where `leave` of `src/runtime/loop.ts` is the only statement that takes an entity out of
  `deployed.loaded`, and its callers are `unload`, under the count `p.leaving`
  ([decision 0109](archive/0109-settled-waits-for-an-entity-unloading.md)), and `crash`, with `stopping`. Every crash,
  `losing`'s and a door's included, goes through `crash`. **Tested** besides: a leave whose poke is split into a second
  step passes every seed and deviation of the two explored tests below. So the pin of 0068 for that one step, which
  could no longer fail, is dropped, and the code keeps the one step, which costs nothing.
- That the waker's look for a poke and the clearing of its flag must stay one step, since an unload's poke may land
  between them: **tested** by `settled never returns while the waker rests from a reading an unloaded entity left
  during, under bounded schedules`, in [`src/runtime/waker.test.ts`](../../src/runtime/waker.test.ts), whose second
  entity leaves by an unload. With the look and the clearing split, its deviation at decision 317 fails, pinned as the
  pin `0068 the waker` of [`src/runtime.test_pins.ts`](../../src/runtime.test_pins.ts). The test it replaces made its
  entities leave by crashes, whose stops keep `settled` from returning through the gap, so no deviation reached it.
- That the waker reads a refusal for a stop from its cause where the stop ends between the refusal and the catch: a
  rule no test holds yet. No seed of 2,000 of the explored test above reaches a stop that ends there, and the
  [open question](../open-questions.md#running) A stop that ends between the waker's refusal and its catch holds it.
- That a door's step which finds a stop running dies, and that Cluster delivers the request again once the stop ends:
  **tested** by `a door step that finds the stop of its entity running dies, and is answered at a delivery after the
  stop`, in [`src/cluster.test.ts`](../../src/cluster.test.ts). The entity crashes with its operation's finalizer
  held, and the door's step of a message is refused twice while the finalizer waits. The message is answered once the
  finalizer ends. The test fails where `entersHeld` does not read `stopped`.
- That Cluster lets a shard go only after the finalizer of its singleton ends, so that the runner which gains the shard
  loads none of its entities while their stops run: **tested** by `a shard that moves while an operation of the first
  runner still stops starts it on the second only after`, of [`src/cluster.test.ts`](../../src/cluster.test.ts), with
  two runners, whose operations' finalizers are held while the shards move. It was a `test.failing` on the code before
  this note, where the second runner started each moved entity's operation while the first runner's finalizer still
  waited. It is a test under `slow`, since it lasts about 2.4 s. The JSDoc of `registerSingleton` in Effect 4.1.3
  promises no such wait. `runShardRelease` of `cluster/Sharding.ts` joins `awaitStoppingSingletons` before the
  storage's release, which is a behaviour not promised, so the test holds it at every move of Effect.
- That a shard lost waits for the stop of an entity a crash took out before the shard was lost: **tested** by `a shard
  that moves after a crash of its entity, whose stop still runs, starts its work on the second only after`, of
  [`src/cluster.test.ts`](../../src/cluster.test.ts), a test under `slow`. It fails where `losing` waits only for the
  stops of the entities it crashes itself.
- That `losing` waiting for the stops does not hold up a finalizer of an operation that sends through the door's client
  to an entity of the shard being let go: **failed**, on 2026-11-12, as `a stop that sends to an entity of the shard
  being let go is answered, and the shard moves after it`, a `test.failing` under `slow` of
  [`src/cluster.test.ts`](../../src/cluster.test.ts), reproduces. The first runner no longer serves the shard it
  lets go, and the second does not hold the shard until the finalizer ends. So the finalizer's send is never
  answered, and the shard never moves. The test bounds the send at 3 s so that it ends. The premise falls, and the
  rule of `losing` waits for a fix the maintainer chooses: the section Premise failed below.
- That a caller given a defect during a stop of a few milliseconds loses nothing a retry does not give back: **chosen**
  by the maintainer, on 2026-11-12. A crash has already given every waiting caller the defect, so a caller in the
  window is retrying already.
- That an entity a region which never ends keeps from loading, and a `settled` that never returns, are better than a
  run beside the old fiber: **chosen** by the maintainer, on 2026-11-12. Cluster makes the same choice for the
  finalizer of a singleton, and closing the deployment's scope already waits for the stop.

## Premise failed

A stop that waits for Cluster closes a cycle. `losing` holds the shard until every stop of its entities ends, and a
stop whose finalizer sends to an entity of that shard waits for the runner that gains it. Before this note the shard
went at once, and the send was answered by the second runner. The fix is not chosen yet. The ones considered:

- **A run whose entity crashed sends nothing.** A `send` or a `create` of an operation whose entity is in `stopping`
  fails at once with a defect, so that no stop waits for Cluster. Every cycle through a stop's send breaks, on one
  runner and across two, and the old fiber's send of bug 65 is refused at its sender too. A finalizer's compensating
  send is lost, and the next run of the entity runs the operation again, or delivers `unknown` to the program.
- **`losing` waits for the stops for a bounded time.** The shard goes once the bound passes, so the overlap of the
  two runs comes back past it, and the bound is a margin the decision rests on.
- **A send from a stop to a shard being let go fails at once.** It breaks this cycle alone, and leaves a cycle of
  two shards let go by two runners at once, each stop sending to the other's.

## Alternatives

- **A caller's load waits for the stop under the entity's lock.** It spares a caller a defect during a short stop. A
  stop that never ends then holds every caller of its entity with no signal, and the waker and the door still need a
  refusal, so the runtime would keep three behaviours instead of one.
- **A caller waits for the stop outside the entity's lock, then loads again.** It spares the defect without a wait
  under the lock, and adds a second behaviour to the scheduler's tests, with seeds to pin.
- **The crash waits for the stop itself, under the lock.** A crash runs in a creation's `onError`, and in a door's
  step inside a transaction on Cluster. A wait there, for an operation whose statements go through the client's one
  session on PGlite, cannot end.
- **A wait bounded by a time, after which the entity loads.** It leaves the overlap past the bound, and makes the
  bound a margin the decision rests on.
- **Fencing alone, by an epoch of the run.** It cannot refuse an act on the outside world, so bug 31 stays. A run
  after a crash keeps its incarnation today, so two runs of one entity cannot be told apart without an epoch stored.
- **`settled` waits only for the stops of entities with work due.** Every crash retried leaves a mark due at `retry`,
  so the rule differs from this one only until `retry`. It needs the waker to read the entities whose stop runs and to
  hold them apart, which is more state for no rule gained.
- **The waker waits for the stop in its own fiber.** The waker activates its entities one after another, so a stop
  that never ends would hold every timer of the program.
- **The waker clears the hiding of a refused entity at the stop's end.** The stop may end before the waker writes the
  mark, as seed 1139 shows, and the entity is then hidden until `retry`.

## Consequences

- Decision 0056's consequences that an operation of a crashed entity may still be stopping when the entity is loaded
  again, and that `settled` does not wait for the stop, hold no more on one runner.
- A crash's callers who retry at once may be given the defect of the stop again, until the stop ends.
- A test that holds a stop and calls `settled` waits for the stop.
