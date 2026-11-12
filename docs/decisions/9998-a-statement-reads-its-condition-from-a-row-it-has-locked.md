# 9998. A statement that writes on a condition reads it from a row it has locked, and `reindex` locks its entity

**Status:** accepted, 2026-11-12, as the fix of bug 25 of [`docs/bugs.md`](../bugs.md), and the rule of family D.
Its number is given when it is merged into `main`, as
[decision 9999](9999-a-contract-runs-one-set-of-calls-on-every-backend.md)'s is. It changes
[decision 0070](archive/0070-reindex-writes-a-row-only-over-its-state.md), whose guard on the state did not hold on a
pool of PostgreSQL. The maintainer chose the rule on 2026-11-12, after an opinion of a Fable 5.2 agent.

## Context

`reindex` writes an entity's projection only if the state it computed it from is still the one stored, in one
statement (decision 0070). The statement is an `INSERT … SELECT … FROM effecttea_entities WHERE state = … ON
CONFLICT DO UPDATE`. On SQLite one transaction writes at a time, so no step commits inside the statement. On a pool
of PostgreSQL at `READ COMMITTED` ([decision 0222](0222-postgresql-with-many-connections.md)), the `SELECT` reads the
state from the statement's snapshot. A step that commits while the statement waits has written its own projection,
and `ON CONFLICT DO UPDATE` writes the older one over it, reading no condition again. A message answered `Accepted`
then reads back the projection from before the message. The test of a contract of the pool reproduced it on the
CI's server, which is bug 25.

Bugs 13, 78 and 80 of `docs/bugs.md` have the same form: a condition read from a snapshot that a concurrent commit
has moved past. Four fixes of their own would be four rules. A step already holds the rows it writes on: `write` of
[`src/storage/entities.ts`](../../src/storage/entities.ts) begins with the update of its entity's row.

## Decision

- **A statement of the storage that writes or deletes a row on a condition reads the condition from a row it has
  locked.** On a pool the statement then waits for the transaction that holds the row, and reads the condition again
  on the row committed. On SQLite one transaction writes at a time, so the rule holds already, and its clause is
  empty.
- **The clause is `lockingTheCondition` of [`src/storage/held.ts`](../../src/storage/held.ts)**, beside `snapshot`:
  `FOR UPDATE` on PostgreSQL, nothing on SQLite. A statement that keeps the rule uses it, so that the rule is in one
  place.
- **`reindex` locks the entity's row it reads the state from.** Its `SELECT` of the `INSERT` ends with the clause.
  A step that holds the entity makes the statement wait. The statement then reads the state committed, and writes
  nothing where it changed. The order of the locks is the step's own, the entity's row and then its projection, so
  no new cycle of locks comes of it.
- **A `reindex` that locks first makes the step wait**, for one statement of one row.
- **The other bugs of the family are later cases of the rule**, each with a note of its own: `expire` (bug 13), the
  trigger of the publications (bug 80), and the reading of the log (bug 78), whose half of the rule is that a reading
  of several statements gives of a partition only what its first statement saw committed. Bug 3 has the same form,
  and a lock there may close a cycle between two entities, so it needs a note of its own too.

## What it rests on

- That `reindex` beside a message on a pool leaves the projection the message's step wrote: **tested**, by the
  examples of bug 25 in `two calls held at a statement on a pool answer as one order of them`, of
  [`src/contract.test.ts`](../../src/contract.test.ts), in the job `postgres` of the CI. The examples lock the table
  of projections, where the step waits holding its entity's row and the `reindex` waits after reading the state.
  They fail against the code before this note.
- That PostgreSQL accepts `FOR UPDATE` in the `SELECT` of an `INSERT … ON CONFLICT`, and reads the `WHERE` again on the
  row committed: **tested**, by the same test, which passes with the clause.
- That the clause changes nothing on SQLite and on PGlite: **tested**, by `bun test`, whose tests of `reindex` in
  [`src/storage.test.ts`](../../src/storage.test.ts) run on both.
- That a step takes its entity's row before it writes the projection: **read in the source**, of `write` in
  `src/storage/entities.ts`, whose first statement updates the entity's row.
- That the rule, and not a guard in the outer `WHERE`, `REPEATABLE READ` or an advisory lock, is the one to keep:
  **chosen** by the maintainer.

## Alternatives

- **The guard in the outer `WHERE` alone.** `INSERT … ON CONFLICT DO UPDATE` reads no `WHERE` again, so it cannot fix
  bug 25, nor bug 80.
- **`reindex` at `REPEATABLE READ`.** The statement then fails on a serialization error where a step committed, and
  `reindex` dies, as bug 25 says.
- **An advisory lock of the program.** It is a second way of locking beside the rows', and orders a `reindex` against
  every step of the program, not against the one entity whose row it writes.
- **The entity's row for every statement of the family.** A reply is not always its entity's own, since a step
  deletes replies stored under the entities it asked, so the row locked is the row the condition is about.

## Consequences

- `lockingTheCondition` of [`src/storage/held.ts`](../../src/storage/held.ts) is the rule's clause, and `reindex` of
  [`src/storage/projections.ts`](../../src/storage/projections.ts) its first user.
- The test of a contract of the pool runs `reindex` among its pairs again.
