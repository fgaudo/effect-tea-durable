# 0246. A transaction can wait for the time, and the bookkeeping still stays in synchronous steps

**Status:** accepted, 2026-11-10. Corrects
[decision 0177](archive/0177-the-runtimes-bookkeeping-stays-in-synchronous-steps.md), which says that a transaction
cannot wait for the time to pass, and keeps its spike until Effect lets one. Keeps 0177's decision as it is.

## Context

Decision 0177 keeps the runtime's bookkeeping in synchronous steps, and not in Effect's `Tx` modules. One of its
reasons is that `settled` decides from the time a timer is due, and that a transaction cannot wait for the time to
pass. Its consequences keep the spike `spikes/effect-tx-under-the-scheduler.test.ts` for the day a release of
Effect lets a transaction wait for the time or hold across I/O.

A new reading of the code, at Effect 4.1.3, found the first of those wrong. A transaction waits for the time as it
waits for any value. A fiber sleeps until a deadline and then writes a `TxRef`. A body that reads that `TxRef` and
calls `Effect.txRetry` until it is set is woken by that commit. Haskell's STM names the same pattern `registerDelay`.
So a transaction could wait for the time already, and no release of Effect needs to add it.

The second condition does not come either. A transaction of Effect is optimistic and runs again after a conflict,
so I/O within one would run again too. A transaction that holds across I/O is no transaction of that kind, and no
release within the model of `Effect.tx` gives one.

## Decision

- **The bookkeeping stays in synchronous steps, as decision 0177 says.** The reason about the time changes, and the
  decision does not.
- **`settled` stays out of a transaction because a wait for the time costs more there than it saves.** A wait for
  the time made of a `TxRef` takes a fiber for each deadline. `settled` would also need every value `quiet` reads in
  a `TxRef`: the counts of the process, the waker's flag and its earliest due, and each loaded entity's flags,
  counts and machine. Each of those reads would become an effect, as decision 0177 says of every read of the
  runtime's state.
- **The spike stays, as what a rewrite of the bookkeeping would find.** It shows that a commit wakes a body that
  waits on `txRetry` through the dispatcher of the tests, that a body runs again after a conflict, and that a
  `TxSemaphore` lets a later waiter in first. It waits for no release of Effect. It runs at each move of Effect's
  version, as every spike does, and a change in one of those behaviours shows there.

## What it rests on

- That a body waiting on `Effect.txRetry` is woken by a commit of another fiber that writes a `TxRef` it read:
  **documented** in the JSDoc of `Effect.tx` at 4.1.3, which retries a body that calls `txRetry` once a value it
  read changes, and **seen in the spike**, in its test `a commit wakes a body waiting on txRetry through the
  scheduler's dispatcher`. That a fiber which sleeps before its commit wakes the body the same way is **only
  reasoned**, since the scheduler of the tests runs no timer.
- That a wait for the time made so needs a fiber for each deadline, and every value `quiet` reads in a `TxRef`:
  **read in the code** of `quiet` in [`src/runtime.ts`](../../src/runtime.ts).
- That I/O within a transaction would run again at each retry: **only reasoned**, as decision 0177 says, since the
  JSDoc of `Effect.tx` does not say what an effect that is no transaction does inside one.

## Consequences

- The comment of the spike cites this note for why the spike stays.
