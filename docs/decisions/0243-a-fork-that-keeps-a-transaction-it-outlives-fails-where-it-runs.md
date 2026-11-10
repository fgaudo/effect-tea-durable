# 0243. A fork that keeps a transaction it outlives fails where it runs, and the runtime still forks without it

**Status:** accepted, 2026-11-10, with the move of Effect to 4.1.3. Decides the open question of a fiber that
outlives its transaction. Adds to
[decision 0164](archive/0164-two-rules-of-the-runtime-are-kept-by-the-form-of-the-code-and-a-test-reads-it.md) what
Effect now does with a fork its rule missed.

## Context

A fiber forked inside a transaction keeps the transaction's connection in its services. Up to Effect 4.1.2 its
statements and savepoints then ran on that connection after the commit, outside the client's semaphore, and nothing
said so. On SQLite another fiber's transaction later failed to begin. This was reported as
[Effect-TS/effect#10431](https://github.com/Effect-TS/effect/issues/10431).

The runtime forks every fiber without the transaction of the fiber that forks it, through `untransacted` of
[`src/runtime/process.ts`](../../src/runtime/process.ts), and a test of the form of `src/` reads every fork
(decision 0164). A fork that the test did not read, or a fork in code the test does not read, would still have
broken the rule in silence.

Effect 4.1.3 holds [Effect-TS/effect#10433](https://github.com/Effect-TS/effect/pull/10433). The JSDoc of
`SqlClient.withTransaction` now says that statements and nested transactions from a fiber that outlives the
transaction it was forked in fail with a `SqlError`. It recommends `Context.omit(sql.transactionService)` for work
outside the transaction, which is what `untransacted` does.

## Decision

- **The runtime keeps forking every fiber without the transaction, as decision 0164 says.** A fork that keeps a
  transaction it outlives no longer corrupts the connection, but its statements fail. On a handle a `SqlError` is a
  defect, so the operation, the timer or the loop so forked would die.
- **A fork the rule missed now fails where it runs.** Its first statement after the commit fails with a `SqlError`,
  which the runtime turns into a defect. Nothing more is kept for it: the test of the form of
  `src/` stays the check, and Effect's failure is a guard behind it.

## What it rests on

- That a statement of a fiber that outlives its transaction fails with a `SqlError` at 4.1.3. This is
  **documented** in the JSDoc of `withTransaction`, in `effect/sql`, which is `@stability unstable`, so
  `scripts/compare-docs.ts` lists it and a move of Effect reads it again. It is also **tested** by
  [`spikes/sqlite-fork-outlives-its-transaction.test.ts`](../../spikes/sqlite-fork-outlives-its-transaction.test.ts)
  on SQLite. No rule rests on this premise alone: if a release drops it, a missed fork is silent again, as it was at
  4.1.2, and the test of decision 0164 still reads every fork.
- That a fiber forked with the transaction taken out of its services runs its statements after the commit. This is
  **documented** in the same JSDoc, and **tested** by the same spike.
