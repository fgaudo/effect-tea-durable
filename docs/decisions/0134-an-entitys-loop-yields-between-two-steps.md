# 0134. An entity's loop yields between two steps

**Status:** accepted, 2026-11-04.

## Context

An entity's loop handles its mailbox, then takes the next event from its queue
([decision 0028](archive/0028-rules-the-runtime-settled.md)). It went from one step to the next without yielding. It
waited only when its queue was empty.

Effect yields a fiber after a count of operations, 2 048 by default, and not after a time. A step whose encoding
and write take long is few operations, since `bun:sqlite` writes synchronously and the schema encodes synchronously.
A caller that sends one message after another keeps the queue full: the reply's `Deferred` resumes the caller on
the loop's own stack, and the caller puts its next message in the queue before the loop takes from it. So a busy
entity kept the thread for as many steps as its budget allowed, and every other entity of the process waited.

The spike `spikes/large-states.test.ts` saw it. Beside an entity whose state is 5 MB, the step of an entity whose
state is a few bytes took 2 to 3 s at worst, where a step of the large one takes about 230 ms. The thread ran 2
`setImmediate` callbacks in 1.8 s. With small states the budget runs out after a few steps: the runtime's test
below saw 9 steps of the busy entity before the other's one.

## Decision

- **The loop yields after a step that leaves it more to do**, with `Effect.yieldNow`: a message in its mailbox
  that it can handle, or an event in its queue. So another entity waits for one step of a busy one at most, and the
  start of the next.
- **A loop with nothing to do starts its wait at once**, with no yield. The wait forks the sleep that unloads an idle
  entity ([decision 0116](0116-an-entitys-wait-ends-with-an-item-of-its-queue.md)). `settled` says nothing is under
  way once no event waits, and a yield there would start the sleep after `settled` has returned, so that a test's
  move of the clock passes it by.
- **What a step holds the thread for is unchanged.** A step's encoding and write are synchronous, and hold the
  thread for as long as they take. What a large state costs the others is the open question on
  [large states](../open-questions.md#storage-and-reading).

## What it rests on

- That Effect yields a fiber after a count of operations, 2 048 by default: **documented**, in the JSDoc of
  `MaxOpsBeforeYield` in `effect/src/Scheduler.ts`.
- That `Effect.yieldNow` lets other fibers run: **documented**, in its JSDoc in `effect/src/Effect.ts`.
- That a `Deferred` resumes its waiters on the stack of the fiber that completes it: **read in the source**,
  `doneUnsafe` in `effect/src/Deferred.ts` and the resume of `callback` in `effect/src/internal/effect.ts`. The rule
  does not rest on it: it explains why the queue stayed full.
- That another entity steps between two steps of a busy one: **tested**, `an entity whose messages keep coming lets
  another step between two of its steps`, in [`src/runtime.test.ts`](../../src/runtime.test.ts). Without the yield,
  9 steps of the busy entity fall between the other's send and its step.
- That the yield shows no other fiber a state it could not see before: **only reasoned**. The yield stands after the
  step's bookkeeping, where the loop already waited whenever its queue was empty, so another fiber that runs there
  reads what it could read at any wait of the loop
  ([decision 0068](archive/0068-what-another-fiber-reads-changes-in-one-step.md)). The tests under `explored` run
  the runtime under prioritized schedules, and `bun run test:release` passes with the yield.
- That an idle entity's wait starts before `settled` returns: **tested**, `unloads an idle entity, and its stored
  timer wakes it` and the other tests of passivation in [`src/runtime.test.ts`](../../src/runtime.test.ts). With a
  yield after every step, the sleep of the wait starts after the test has moved the clock, and the entity is never
  unloaded.

## Alternatives

- **A yield after every step**, whatever is left to do. It is the rule without its exception, and it starts an idle
  entity's wait after `settled` has returned.
- **A smaller `MaxOpsBeforeYield`** for the runtime's fibers. Every fiber of the runtime would yield more often, in
  the middle of a step too, and a large step would still be a few operations.
- **A yield after a time**, measured around each step. A step's time is not the runtime's to measure: a yield after
  each step costs a task of the dispatcher, which the spike does not see beside a step's transaction.
- **Nothing, with a warning in the design.** One busy entity would still hold every other for many steps, whatever
  its state's size.

## Consequences

- [`src/runtime.ts`](../../src/runtime.ts): the loop's `steps` yields before a next step, when it has one.
- [`src/runtime.test.ts`](../../src/runtime.test.ts): a test of a busy entity beside a quiet one. Three tests read
  what the loop did before it had applied it all, which the loop's running on inline hid. Two wait for `settled`
  after the creation, and one before it reads the events. A test of a timer armed at a time already passed checks
  that it fires, and no longer that it waits for the clock's next move: the test clock's sleep of a time passed
  ends at once, so the timer fires as soon as the fiber of its sleep runs.
- `docs/design.md` says, under Fibers and locks, that an entity's loop yields after each step.
- The schedules of the tests under `explored` change, since each yield is a point where the scheduler of the tests
  chooses. The seeds listed under `pinned` draw other schedules too. Seeds 203 and 172 no longer replay the
  interleavings that found the bugs of decisions 0116 and 0117, and their tests hold through their own runs. A seed
  that replays each is found again with `bun run test:explore` against the code without that decision's fix, which
  is work of its own.
