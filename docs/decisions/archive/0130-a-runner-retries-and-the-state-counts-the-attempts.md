# 0130. A runner retries, the state counts the attempts, and a rehearsal fails on an operation that loops

**Status:** accepted, 2026-11-04. Decides the open question on failing operations. Answers what
[decision 0008](0008-delivered-work-is-done.md) left open of work that comes back at once.

## Context

An operation's runner is an `Effect<Message, never, R>`: an expected failure becomes a message, as in effect-tea's
commands ([decision 0034](0034-an-operation-answers-the-messages-of-its-runner.md)). What becomes of a
transient failure, a timeout or a service that is down for a while, was open. A runtime that counted the retries
could make a defect of the last one, and suspend the entity.

Work ends when its message is handled, so a state that returns the key of that work starts it again, as new work
(decision 0008). A mistake then loops instead of hanging. A timer kept at a time already past fires again at once,
and an operation kept on its own completion runs again at once. Each turn is a committed step, so the loop is
visible, but nothing stops it. Whether the runtime should notice was open too.

## Decision

- **A transient failure is retried inside the runner.** The runner uses `Effect.retry` with a schedule that ends,
  and every attempt uses the operation's idempotency key. These attempts live in the process, and a crash starts
  them over, so they are short.
- **A schedule that ends becomes a message, and the state counts the attempts.** The runner delivers a message
  that says the attempts failed. `update` decides what follows: a new attempt behind a timer, with a count of
  attempts the state holds, or an end. [`examples/subscription`](../../../examples/subscription) does it with
  `PastDue`, `attempt` and `RetryDue`. Such a backoff survives a crash, since it is stored.
- **The runtime counts no retries, and never makes a defect of them.** A defect is what cannot happen
  ([decision 0061](0061-only-what-the-program-does-is-its-defect.md)), and a run of failures is what a
  service does. A runner that dies anyway suspends its entity, as it already does
  ([decision 0006](0006-a-defect-suspends-the-entity.md)).
- **The runtime does not stop work that comes back at once.** A timer at a time already past is how a repeating
  timer catches up after a downtime: a subscription stopped for three months renews three times in a row. A
  threshold of turns would stop that program, and the runtime decides nothing on a count or a clock
  ([decision 0063](0063-the-runtime-waits-for-what-it-waits-for.md)).
- **A rehearsal fails on an operation that its own completion returns the same.** `answer` fails the test when the
  step that handles the completion returns, under the same key, an operation that encodes to the same JSON as the
  one completed. Such an operation runs again at once, under a new idempotency key, with no pause: a poll or a retry
  with no backoff. An operation that comes back changed is a new attempt, and passes.

## What it rests on

- That a runner's type has no error channel, so that the runtime has no failure to count: **tested** by the
  compiler, on the type of `Runner` in [`src/program.ts`](../../../src/program.ts).
- That `Effect.retry` retries a typed failure by a policy that may end, and fails with the last error once it ends:
  **documented**, in the JSDoc of `Effect.retry` in `node_modules/effect/src/Effect.ts`.
- That `answer` fails on an operation its completion returns the same, and takes one returned changed: **tested**,
  `fails when a completion returns the same operation, which would run again at once` and `takes an operation its
  completion returns changed, as a new attempt`, in [`src/rehearse.test.ts`](../../../src/rehearse.test.ts).
- That an operation returned the same on its own completion is almost always a mistake, so that a rehearsal may
  fail on it with no way to allow it: **only reasoned**. The machine admits it, as
  [decision 0008](0008-delivered-work-is-done.md) decided, and the model program of
  [`src/machine.test.ts`](../../../src/machine.test.ts) does it on `Again`. A worker that pulls an outside queue with a
  constant operation fails its rehearsal, and holds a cursor in its state to pass. The cursor also shows its
  progress in the state.

## Alternatives

- **A count of retries in the runtime, and a defect after the last.** The runtime would need an error channel the
  Guide's commands do not have, and would suspend an entity for what the service did, where the state could decide.
- **A threshold of turns at once in the runtime.** It stops the catch-up of a repeating timer, and the number is
  arbitrary.
- **A pause the runtime adds before work that comes back at once.** The program would not see it, and a step's
  timing would depend on something the state does not say.
- **The same check on a timer.** A timer at a time already past is the catch-up above, so a rehearsal cannot tell
  a loop from it.
- **The check in the machine, as a defect.** It would refuse in production a program the machine admits since
  [decision 0008](0008-delivered-work-is-done.md), for a mistake a test finds first. The rehearsal checks it
  as effect-tea's `dispatchViolations` checks the view: in the tests, not in the run.

## Consequences

- A program that retries writes it twice: a short `Effect.retry` in the runner, and a timer with a count in the
  state for what lasts.
- A timer that loops is not caught by any check. Each of its turns is a committed step, which the probe of the
  tests sees.
