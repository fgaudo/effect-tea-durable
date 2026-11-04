# 0116. An entity's wait ends with an item of its queue

**Status:** accepted, 2026-11-04. Replaces
[decision 0111](archive/0111-an-entity-s-wait-times-out-its-take-alone.md): an entity's wait no longer times out its
take. Changes how the wait of [decision 0029](archive/0029-an-idle-entity-is-unloaded.md) runs out, and not when.

## Context

An entity waited for its next event with `Effect.timeoutOption(Queue.take(events), …)`, and was unloaded when the
time ran out ([decision 0029](archive/0029-an-idle-entity-is-unloaded.md)). Decision 0111 held that a timeout of the
take alone loses no event, on the word of a maintainer of Effect.

It can lose one. `timeoutOption` is a `raceFirst` of the take and a sleep, each in a fiber of its own. Once the
sleep's fiber has ended, the race is decided, and the racing fiber interrupts the take only once it is resumed, a
few steps into its run (`raceAllFirst` and `onExitUnsafe` in `internal/effect.ts`). If the racing fiber yields
there, the take's fiber, woken by an offer, takes the event first. Its end is not the race's, and the event is lost.
The caller then waits for ever. Effect makes the racing fiber yield there when its budget of steps is 3
([decision 0115](0115-the-scheduler-of-the-tests-preempts-from-a-runs-third-step.md)), and not under the default
budget. The runtime's test `a message that arrives as the wait of its entity runs out is handled` loses the event at
seed 147 under the scheduler of the tests that decision 0115 corrected.

## Decision

- **The wait's end is an item of the entity's queue.** As the loop starts a wait, it forks a sleep of `passivate`,
  which puts a `Passivate` in the queue as it ends. The loop takes from the queue with no timeout, and nothing races
  the take. The sleep is the loop's child: the loop interrupts it once it has taken an item, and it ends with the
  loop.
- **A `Passivate` carries the number of its wait**, and one from an earlier wait is passed over. Such a one was put
  in the queue just before the event that ended its wait was taken, and is taken after it. Taken for the end of the
  wait under way, it would unload the entity with no time waited since that event.
- **What the wait does once it has run out is unchanged**: a `Passivate` is taken as the timeout's end was, and the
  entity is unloaded if it has nothing to do. Like `Evict`, a `Passivate` is no event, and is not counted as one.

## What it rests on

- That a take raced against a timeout can lose its item under Effect's scheduler: **seen**, in
  `spikes/effect-queue-take-timeout-scheduled.test.ts`, when the racing fiber's budget is 3. Under a budget above 3
  the spike sees no loss.
- That a take with no race loses no item: **read in the source**, `take` in `Queue.ts`, which takes the item in the
  step that resumes the taker (`suspendTake`), and no fiber but the taker's runs that step.
- That the wait loses no event: **tested**, `a message that arrives as the wait of its entity runs out is handled,
  under prioritized schedules`, in [`src/runtime.test.ts`](../../src/runtime.test.ts). With the timeout of decision
  0111 it does not end at seed 147, under the scheduler of
  [decision 0115](0115-the-scheduler-of-the-tests-preempts-from-a-runs-third-step.md).
- That an end from an earlier wait is passed over: **tested**, `an entity whose wait runs out as an event arrives
  waits again from the event, under prioritized schedules`, in [`src/runtime.test.ts`](../../src/runtime.test.ts).
  Taken for the current wait's end, it unloads the entity with no activation after, at seed 862.
- That a child forked with `forkChild` is interrupted when its parent ends: **documented**, in the JSDoc of
  `forkChild` in `Effect.ts`.
- That the loop interrupts the sleep once it has taken an item: **reasoned**. A sleep left running puts an end
  in the queue that is passed over, so no test tells the two apart: what it saves is a fiber per event until the
  wait would have run out.

## Alternatives

- **The timeout of decision 0111, with the loss reported to Effect.** The loss needs a budget of 3, which no default
  gives, but the runtime would rest on a guarantee its dependency does not keep.
- **A race that keeps the take's item**, as `raceAllFirst` could if it interrupted the loser as the winner ends. It
  is Effect's to change, and the runtime would wait for a release.
- **A guard of the runtime's that reads the queue again before an unload**, which decision 0111 weighed. The event
  is lost to the take's fiber, not left in the queue, so no reading finds it.
- **Starting the sleep inline**, as `timeoutOption` started its sleep, so that the time is counted from the wait's
  start to the step. No test tells the two apart, and the sleep starts within the loop's own task either way.

## Consequences

- [`src/runtime.ts`](../../src/runtime.ts): a `Passivate` item, the number of the wait under way on each loaded entity,
  and an entity's loop that forks the sleep of its wait and takes with no timeout.
- [`src/runtime.test.ts`](../../src/runtime.test.ts): a test of the end passed over.
- `docs/design.md` says that a wait's end is an item of the entity's queue.
- The spike `spikes/effect-queue-take-timeout-scheduled.test.ts` stays, and tells if a release of Effect changes what
  a race of a take does.
