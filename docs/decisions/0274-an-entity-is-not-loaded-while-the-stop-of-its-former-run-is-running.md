# 0274. An entity is not loaded while the stop of its former run is running

**Status:** proposed, 2026-11-12, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the fix of bugs 31 and 65. Once taken, it changes
[decision 0056](archive/0056-nothing-waits-for-an-operation-under-the-permit.md): a crash still forks the stop of its
entity's work, and an entity whose stop is running is not loaded again on that process. It changes
[decision 0162](archive/0162-on-cluster-an-entitys-shard-is-its-partition-and-each-deployment-serves-its-shards.md):
a shard lost is let go only once the stops of the entities it crashed have ended. The maintainer chose it on
2026-11-12, after an opinion of a Fable 5.2 agent.

## Context

An event the runtime cannot finish crashes its entity
([decision 0042](archive/0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md)). Decision 0056 makes the crash
fork the interruption of the entity's operations and timers, and wait for none of it. At that time every entity shared
one permit, and a wait under it held every `send` and `create` of the process behind the finalizer of one operation.
[Decision 0067](archive/0067-each-entity-is-held-by-its-own-lock.md) gave each entity its own lock, so that premise of
0056 fell.

The stop still runs apart from the next run of the entity. Since
[decision 0252](0252-the-waker-activates-an-entity-a-crash-took-out-after-the-retry.md) the waker activates the
entity again `retry` after the crash, with no caller coming. The activation steps `Restart` from what is stored, while
the old fiber may still run a region it holds uninterruptible, or a finalizer that acts. Two bugs of the roadmap
follow:

- **Bug 31.** An at-most-once operation's `unknown` is recorded, and the program's answer to it acts, beside the old
  fiber that still acts.
- **Bug 65.** An at-least-once operation's new run ends its work, and the receiver deletes the reply of the work's
  request ([decision 0021](archive/0021-a-reply-is-kept-while-the-work-that-asked-holds.md)). The old fiber then sends
  that request from its uninterruptible region, and the receiver applies it twice.

On Cluster a shard lost crashes every entity of it that the runner holds, in `losing` of `src/runtime/doors.ts`, from
the finalizer of the shard's singleton (decision 0162). Cluster waits for that finalizer before it lets the shard go.
`losing` returns once each crash has forked its stop, so the runner that gains the shard may run an entity's
operations beside the old runner's fibers.

## Decision

- **A crash keeps the stop of its entity's work in the deployment, under the entity's id.** The crash still forks the
  stop in the deployment's scope, and gives the entity's lock back at once (decision 0056). The fiber of the stop
  leaves the deployment's map when it ends, in one step with the end, and only where the map still holds that fiber.
  Its end pokes the waker.
- **An entity whose stop is running is refused at its entry into the process.** The check is one function of
  `src/runtime/loop.ts`, read by `enter` and `entersHeld`, which every load goes through, and by the creation before
  its step, since a creation refused after its commit would leave a stored entity unloaded.
  - **A caller's load dies** with a defect that says the stop of the former run of `<name>/<id>` is still running.
    The caller is given the defect, and retries as after any crash of the entity. No caller waits for a stop, so a stop
    that never ends holds no caller.
  - **The waker's activation fails** the same way, and the waker marks the entity again at `retry`, as it marks an
    activation that failed (decision 0252). The waker's other entities are activated meanwhile.
  - **A door's step on Cluster dies** inside its transaction, since `entersHeld` gives that the entity did not enter,
    and Cluster delivers the request again. No step waits for a stop inside a transaction.
- **A stop that outlives `retry` is logged once**, as a warning naming the entity, so that an operator sees an entity
  that a region which never ends keeps from loading.
- **A shard lost waits for the stops of the entities it crashed.** `losing` crashes each entity of the shard under its
  own lock, as before, and then, holding no lock, joins the stops those crashes forked. The finalizer of the shard's
  singleton ends only then, and Cluster lets the shard go after it.

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
- A region that never ends, which keeps its entity from loading on its process for ever, and on Cluster its shard from
  moving: An entity a stop that never ends keeps from loading.
- An entity a door loads on a shard whose singleton has not started, whose crash no finalizer makes: bug 90 of the
  roadmap.

## What it rests on

- That an activation which finds the stop running records no `unknown` beside the old fiber, and that a new run never
  ends the work before the old fiber's send: to be **tested** by the two tests of bugs 31 and 65 in
  [`src/runtime.test.ts`](../../src/runtime.test.ts), `an at-most-once operation a crash stops delivers its unknown
  once its finalizer has run` and `a send of an operation a crash could not interrupt, after its new run ended the
  work, is applied once`, each a `test.failing` that fails on the code before this note, and made a `test`.
- That a stop which never ends keeps the waker activating the other entities of its program, and fails each caller of
  its entity with the defect, at once: to be **tested** by a test of `src/runtime.test.ts` at that end value, with an
  operation whose finalizer never ends and a timer of another entity due after the crash.
- That an entity whose stop ends is activated by the waker, with no caller coming: to be **tested** by the same test,
  whose finalizer is let end, and under the scheduler of `src/testing.ts` with a seed pinned that ends the stop
  between the waker's reading and its activation.
- That a door's step which finds a stop running dies, and that Cluster delivers the request again once the stop ends:
  to be **tested** by a test of `src/cluster.test.ts`.
- That Cluster lets a shard go only after the finalizer of its singleton ends, so that the runner which gains the shard
  loads none of its entities while their stops run: to be **tested** by `a shard that moves while an operation of the
  first runner still stops starts it on the second only after`, a `test.failing` of
  [`src/cluster.test.ts`](../../src/cluster.test.ts) with two runners, whose operations' finalizers are held while the
  shards move. On the code before this note it fails: the second runner starts each moved entity's operation while
  the first runner's finalizer still waits, so the case across runners is reproduced. The JSDoc of `registerSingleton` in Effect 4.1.3 promises no such wait.
  `runShardRelease` of `cluster/Sharding.ts` joins `awaitStoppingSingletons` before the storage's release, which is a
  behaviour not promised, so the test holds it at every move of Effect.
- That `losing` joining the stops does not hold up a finalizer of an operation that sends through the door's client to
  an entity of the shard being let go: to be **tested** by the same test with two runners, whose finalizer sends to
  such an entity.
- That a caller given a defect during a stop of a few milliseconds loses nothing a retry does not give back: **chosen**
  by the maintainer, on 2026-11-12. A crash has already given every waiting caller the defect, so a caller in the
  window is retrying already.
- That an entity a region which never ends keeps from loading is better than a run beside the old fiber: **chosen** by
  the maintainer, on 2026-11-12. Cluster makes the same choice for the finalizer of a singleton.

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

## Consequences

- Decision 0056's consequence that an operation of a crashed entity may still be stopping when the entity is loaded
  again holds no more on one runner. `settled` still waits for no stop of a crashed entity: the stops are in the
  deployment's scope, and closing it waits for them.
- A crash's callers who retry at once may be given the defect of the stop again, until the stop ends.
