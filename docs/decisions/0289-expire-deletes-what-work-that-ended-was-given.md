# 0289. `expire` deletes the replies and the answers kept for work that has ended

**Status:** accepted, 2026-11-12, as the fix of bug 3 of [`docs/bugs.md`](../bugs.md), a case of the rule of
[decision 0284](0284-a-statement-reads-its-condition-from-a-row-it-has-locked.md). It changes
[decision 0245](0245-a-reply-is-kept-as-long-as-send-says-and-the-runtime-sweeps.md): `expire` also deletes the
replies and the answers whose asker's work has ended. It completes
[decision 0021](archive/0021-a-reply-is-kept-while-the-work-that-asked-holds.md) and
[decision 0253](0253-an-answer-no-entity-stores-is-kept-for-the-operation-that-was-given-it.md) on a pool of
PostgreSQL, where their two statements leave a row. The maintainer chose the sweep on 2026-11-12, after an opinion of
a Fable 5.2 agent.

## Context

A reply to another entity's operation is kept while the work that asked holds (decision 0021), and so is an answer
no entity stores, in `effecttea_answers` (decision 0253). Two statements keep the rule. The receiver's step stores the
row, then deletes it where the asker's key in that incarnation is gone. The asker's step that ends the work deletes
the rows kept for it. On a pool of PostgreSQL at `READ COMMITTED`
([decision 0222](0222-postgresql-with-many-connections.md)), the two steps run at once. Each statement reads the
other's row only once it is committed. The receiver still reads the key, and the asker does not read the row. Both
commit, and the row stays for ever, since it has no time for `expire`. It is a row left, and no wrong answer.

## Decision

- **`expire` deletes the replies and the answers of its program whose asker's key, in the incarnation the row
  names, is not stored.** It runs after the batches of the replies past their time, in batches of its own. The count
  `expire` gives counts these rows too. The two statements of the steps stay, so that a row goes with its work where
  the steps run one after the other.
- **A batch is two statements in one transaction.** The first selects the rows whose key is gone, and locks them with
  `lockingTheConditionSkipping` of [`src/storage/held.ts`](../../src/storage/held.ts), skipping those a step holds. The
  second deletes the rows locked on the same condition, read from a snapshot taken once the rows are locked. A row
  whose sender a step or a rename wrote after the first statement's snapshot is then read as committed.
- **The condition is an absence, which no lock can hold.** A work that ended never holds again: its incarnation is
  never drawn again (`holds` of [`src/machine.ts`](../../src/machine.ts)). So a key absent from what is committed
  stays absent, and the rule of decision 0284 holds without a lock of the key.
- **The sweep ends at a batch that deletes nothing**, as under
  [decision 0285](0285-a-batch-of-expire-skips-the-replies-a-step-holds.md). The condition stands in the selection of
  the batch, so a batch never fills with rows whose work holds.

## What it rests on

- That the two steps at once on a pool leave the row, and that the sweep after them deletes it: **tested**, by the
  four tests of `a reply to work that ends while its receiver stores it`, of
  [`src/postgres.test.ts`](../../src/postgres.test.ts), in the job `postgres` of the CI. They leave the row against
  the code before this note, for a reply and an answer, whichever step opens first.
- That a sweep beside the two steps waits for neither, and deletes nothing whose work holds: **tested**, by the same
  tests, whose sweep runs while the first step is open.
- That `expire` deletes what a work that ended was given, past a batch, and keeps what a work that holds was given,
  in an incarnation renewed too: **tested**, by `expire deletes the replies and the answers kept for work that has
  ended, and keeps those of work that holds`, of [`src/storage.test.ts`](../../src/storage.test.ts), on SQLite and
  PGlite.
- That an incarnation is never drawn again for one key of one entity: **tested**, by `a key that leaves loses its
  row, and comes back in an incarnation no run of it had`, of [`src/machine.test.ts`](../../src/machine.test.ts).
- That an entity's row, which holds the count of its incarnations, is never deleted, so the count never starts
  again: **tested**, by `no statement of src deletes the row of an entity`, of
  [`src/form.test.ts`](../../src/form.test.ts), whose check is run against the statements it refuses.
- That an asker's key is committed before its request reaches the receiver: **tested**, by `an operation’s request
  reaches its receiver only once the step that started the operation is committed`, of
  [`src/runtime/callers.test.ts`](../../src/runtime/callers.test.ts). It fails against a loop that runs the outputs
  before the commit. Where this premise fell, the sweep would delete a reply the work still waits for, and so would
  the receiver's own statement as it stores the reply.
- That PostgreSQL skips a row another transaction locks under `SKIP LOCKED`, and that a statement at `READ
  COMMITTED` reads a snapshot taken as it starts: **documented**, in the locking clause of `SELECT` and in the section
  Transaction Isolation of PostgreSQL 17, the version of the CI's server.
- That a row left until the next sweep costs no wrong answer: **chosen** by the maintainer. No reader looks for a
  reply or an answer of work that has ended.

## Alternatives

- **The receiver locks the asker's key `FOR SHARE` before it stores the row.** Each step's later statement would then
  read the other's commit, and the row would go at once. It makes a receiver's step wait for an asker's, and two
  entities that answer each other in one step close a cycle. A step that writes any key of its own conflicts with
  the lock, so every step would lock every key it writes and every asker's key first, in one order. It leaves the
  rows a database already holds.
- **A trigger or a check deferred to the commit.** Each reads the same snapshot, and splits the dialects.

## Consequences

- Bug 3 is fixed. The rows a database holds from before this note go at the first sweep.
- A sweep reads every reply and answer of the program kept for another entity's work, once in each batch, and looks
  up each asker's key by the key's primary key.
