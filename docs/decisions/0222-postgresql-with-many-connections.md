# 0222. On a server of PostgreSQL every transaction of the runtime states its level, and a deadlock crashes the entity

**Status:** accepted, 2026-11-09, with the step PostgreSQL on a server with a pool of the roadmap. Decides the
open question of PostgreSQL with many connections, which
[decision 0157](archive/0157-the-storage-speaks-sqlite-and-postgresql.md) and
[decision 0158](archive/0158-an-older-database-of-sqlite-is-given-request-id-and-a-page-keeps-the-level-of-a-callers-transaction.md)
left. Changes decision 0157, whose integers were read as a driver gives them up to 2^53.
[Decision 0225](0225-the-migrations-run-at-the-roles-level-and-lock-before-they-read.md) says that the transaction of
the migrations is `Migrator`'s, and runs at the level the role sets, which holds since `Migrator` locks before it reads.

## Context

The storage's tests ran on PGlite, which runs one statement at a time on one session. What a server with many
connections does was only reasoned: the order of a partition's commits under two writers, the advisory lock that
holds the database, a page read at `REPEATABLE READ`, a deadlock or a failure of serialization in a step, a role
whose `search_path` is set by `ALTER ROLE`, and two runs of `createTables` at once.

The tests now run on a server too. `POSTGRES_URL` names one, `bun run test:postgres` runs the storage's tests and
the runtime's on it, and the CI runs them on Linux against a container of PostgreSQL 17. The client is
`@effect/sql-pg` at the version of Effect pinned, a pool of connections.

The first run on the server found what PGlite hid: `@effect/sql-pg` gives every `BIGINT` as a JS bigint, where PGlite
gives a number up to 2^53. The storage read every integer as a number, so no row of a time, a `seq`, a version or a
count was read.

## Decision

### Integers

- **An integer of a row is a number, or a bigint up to 2^53, read as a number.** A value past 2^53 is still no row
  the runtime writes, and fails the call that meets it, as decision 0157 decides. One schema of
  [`src/storage.ts`](../../src/storage.ts) reads every integer column, so that the rule is written once.

### The level of a transaction

- **On PostgreSQL every transaction the runtime begins states its level.** A step, a creation, an ack, a prune, a
  forget, an expiry, a declaration of consumers, a rename and a reader's page of `consume` begin at
  `READ COMMITTED`, and a reading of one snapshot at `REPEATABLE READ`, whatever default the role or the database
  sets. At `REPEATABLE READ` or `SERIALIZABLE`, PostgreSQL fails the second of two transactions that update one row
  at once. Two steps of one partition both move the partition's head, so the second would fail with
  `SerializationError` and crash its entity. At `READ COMMITTED` the second waits for the head's row, and draws the
  next `seq` once the first commits.
- **A transaction inside one the caller left open keeps the caller's level**, as decision 0158 decides: only the
  outermost transaction reads `BeginTransaction`.

### A deadlock

- **A step whose transaction PostgreSQL ends with `DeadlockError` crashes its entity, as a write that fails does.**
  The runtime does not retry it. Its callers are given the defect, and the entity starts again from what is stored.
  The steps of the runtime take the head of their partition last, so two steps of the runtime meet in a cycle only
  through the replies of two entities that answer each other in the step that ends the work that asked, which is
  rare. A transaction of the application that locks the runtime's rows makes the rest. A retry would hide neither.
- **No transaction of the runtime fails with `SerializationError`**, since none runs above `READ COMMITTED` but a
  reading of one snapshot, which writes nothing.

### Pages

- **A page read in its own transaction gives a row once**, at `REPEATABLE READ`, though a step moves the row between
  two parts of the page.
- **A page read in a transaction the caller left open reads at the caller's level.** At `READ COMMITTED` a step
  committed between two parts gives the row twice. A caller that reads pages in its own transaction and needs each
  row once begins it at `REPEATABLE READ`.

### The tests

- **`src/test-databases.ts` gives the tests PostgreSQL on the server `POSTGRES_URL` names, or else on PGlite.** Each
  test of the server makes a database of its own and drops it. A test that sets a setting for several statements
  sets it with `SET LOCAL` in one transaction, which holds on a pool as on one session.
- **[`src/postgres.test.ts`](../../src/postgres.test.ts) holds what only a server runs**, and is skipped without one.

## What it rests on

- That `@effect/sql-pg` gives a `BIGINT` as a bigint: **seen** in the CI's first run on the server, where every
  reading of an integer failed, and **read in source**, in the codec of `int8` of `PgTypes.ts` at 4.1.2.
- That two writers of one partition commit in the order of their `seq`, the second waiting for the first: **tested**
  by `two writers of one partition commit in the order of their seq, the second waiting for the first` in
  `src/postgres.test.ts`.
- That at `SERIALIZABLE` the second of two writers fails with `SerializationError`, and at the runtime's level waits
  and commits: **tested** by `two writers of one partition commit under a database whose default level is
  serializable`, and **documented** by PostgreSQL, under Transaction Isolation.
- That a deadlock ends a step's transaction with `DeadlockError`, and that nothing of the step is stored: **tested**
  by `a step whose transaction is ended by a deadlock dies with DeadlockError, and writes nothing`. That a write that
  dies crashes the entity is tested on SQLite by the tests of the crash table in
  [`src/runtime.test.ts`](../../src/runtime.test.ts).
- That `@effect/sql-pg` gives `40P01` as `DeadlockError` and `40001` as `SerializationError`: **read in source**, in
  `internal/sqlError.ts` of `@effect/sql-pg` 4.1.2.
- That a page gives a row once at `REPEATABLE READ`, and twice at the caller's `READ COMMITTED`: **tested** by the
  three tests of pages in `src/postgres.test.ts`, which commit a move between the page's statements.
- That a session advisory lock holds the database across pools and schemas, and is given back with the scope:
  **tested** by the two tests of the hold in `src/postgres.test.ts`.
- That a pool gives every connection the `search_path` of the role, which finds the tables of the runtime and of
  Cluster: **tested** by `every connection of the pool finds the tables of the runtime and of Cluster in the role’s
  schema`, with Cluster's `SqlMessageStorage` and `SqlRunnerStorage`.
- That two runs of `createTables` at once make the tables once, the second waiting on the lock of
  `effecttea_migrations`: **tested** by the two tests of the migrations in `src/postgres.test.ts`.
- That an advisory lock goes with its session: **documented** by PostgreSQL. A runtime whose reserved connection the
  server ends loses its hold without knowing it, which is an
  [open question](../open-questions.md#running).
- That the tests of the storage and of the runtime pass on the server: **tested** by the CI's job `postgres`.

## Alternatives

- **A step retried on `DeadlockError` or `SerializationError`**, as the JSDoc of `SqlClient.withTransaction` shows.
  The write of a step dies, so a retry would read a `SqlError` out of a defect's cause, against the rule that a
  defect is not caught. With every transaction at `READ COMMITTED` the failure of serialization does not arise, and a deadlock is
  rare enough that a crash and a caller's retry cost less than a second path through the step.
- **A launch that refuses a role whose default level is above `READ COMMITTED`.** A launcher would need a role of its
  own for the runtime, for a rule the runtime can keep itself.
- **A registry of codecs given to `PgClient`, which reads a `BIGINT` as a number.** It would be the launcher's to
  give, and a launcher that forgot it would read no row.

## Consequences

- [`src/storage.ts`](../../src/storage.ts) reads every integer through one schema, and gives `transaction`, which
  the runtime's modules begin every transaction with.
- The design says, under Databases, which levels the runtime's transactions run at, and what a page in a caller's
  transaction gives.
- `CONTRIBUTING.md` says how to run the tests on a server, and the CI runs them.
