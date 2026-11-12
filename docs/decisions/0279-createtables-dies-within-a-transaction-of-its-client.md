# 0279. `createTables` dies within a transaction of its client

**Status:** accepted, 2026-11-12, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the fix of bug 51. It changes
[decision 0225](0225-the-migrations-run-at-the-roles-level-and-lock-before-they-read.md): the lock of `Migrator`
comes before the snapshot only when the migrations' transaction is their own, so `createTables` refuses to run in
another. The maintainer chose it on 2026-11-12, after an opinion of a Fable 5.2 agent.

## Context

Decision 0225 lets the migrations run at the level the role sets on PostgreSQL. It holds because `Migrator` takes
`LOCK TABLE effecttea_migrations` as the first statement of its transaction, before the snapshot of `REPEATABLE
READ` or `SERIALIZABLE` is taken.

An operator may call `createTables` within a transaction of their own, by `withTransaction` of the client. Then the
migrations' transaction is a savepoint inside the operator's transaction. The operator's snapshot is taken by the
first query of that transaction. `createTables` itself runs a query before the lock: the reading of `current_schema()`
of [decision 0263](0263-a-launch-dies-where-a-schema-further-on-the-search-path-holds-the-tables.md). So at
`REPEATABLE READ` the snapshot comes before the lock, even with no query of the operator's. A second launch that
commits the migrations meanwhile is not seen by it: this launch reads a history without the second's rows. That is
bug 51 of the roadmap.

What the launch then does was only read, and is no premise of this note. It may die on the first `CREATE TABLE`,
which has no `IF NOT EXISTS` ([decision 0218](0218-the-prefix-is-effecttea-and-a-launch-dies-on-a-name-taken.md)).
It may meet a unique violation as it records the history, which `Migrator` reads as a lock held by another, and
succeed having run nothing. At `SERIALIZABLE` it may die on a serialization failure.

On SQLite the driver begins a transaction with `BEGIN IMMEDIATE` by default, which takes the file's write lock. An
operator's transaction begun so holds the lock before the migrations begin. One begun with a deferred `BEGIN` does
not, and the `BEGIN IMMEDIATE` that `createTables` asks for is a savepoint there, which takes no lock.

## Decision

- **`createTables` dies within a transaction of its client, on both dialects, and makes nothing.** It reads the
  client's transaction as decision 0256 does for a call that waits for a step: a transaction is open where
  `sql.transactionService` is in the context. Its defect says to run it on the client outside any transaction.
- **So the migrations' transaction is always their own,** and the lock of `Migrator` is its first statement on
  PostgreSQL, as decision 0225 says. On SQLite its `BEGIN IMMEDIATE` takes the write lock.
- **A launch that runs the migrations dies so as well,** since it calls `createTables`. A launch given
  `tables: 'existing'` runs no migration, and this note does not refuse it.
- **The migrations without the check are `migrate` of `src/storage/tables.ts`,** which the library does not export.
  Only tests call it within a transaction, where a `SET LOCAL` gives the migrations a `search_path`.

## What it rests on

- That `sql.transactionService` is in the context within `withTransaction` of that client, and not outside it:
  **tested**, by `createTables dies within a transaction of its client and makes nothing, and runs outside one` in
  [`src/storage.test.ts`](../../src/storage.test.ts), on SQLite and on PGlite. Decision 0256 rests on it too.
- That two runs of `createTables` at once, each in a transaction of its own, make the tables once: **open** on the
  server until the job `postgres` of the push of `main` that takes this note runs
  `two runs that wait on the lock of effecttea_migrations make the tables once, and both succeed` in
  [`src/postgres.test.ts`](../../src/postgres.test.ts). The test holds the table's lock in a transaction of its own
  while both runs wait on it. Before this note the test held the first run within a transaction of the test's, which
  `createTables` now refuses.
- That an operator gives up running the migrations within a transaction of their own, with DDL of their own:
  **chosen**, by the maintainer. Neither `README.md` nor `docs/design.md` promised it.

The premises of decision 0225 read again. That `Migrator` locks its table before any query of its transaction still
holds, read in the source at the version pinned. That the snapshot is taken at the first query and not at the lock
still holds, documented. That two runs at once make the tables once at `READ COMMITTED` is tested again by the test
above, whose form changed. What a launch does with a stale snapshot is left as read, since the refusal makes it
unneeded.

## Alternatives

- **The JSDoc of `createTables` names the rule, and nothing refuses it.** The rule of decision 0225 would then rest on
  a sentence that no test holds.
- **`createTables` leaves the caller's transaction, and runs on a connection of its own.** On SQLite and on PGlite the
  client has one connection, which the caller's transaction holds, so the migrations would wait for the caller, which
  waits for them.
- **A refusal on PostgreSQL alone.** On SQLite the savepoint takes no write lock, so safety would rest on the
  operator's own `BEGIN`.
- **A refusal only above `READ COMMITTED`.** It needs a reading of the level, and a test on the server for each level.
- **The migrations begun at `READ COMMITTED`.** A level stated in a savepoint changes nothing.

## Consequences

- The JSDoc of `createTables` says that it dies within a transaction of its client.
- The tests of `src/storage.test.ts` that give the migrations a `search_path` by `SET LOCAL`, and the test of decision
  0263 in `src/postgres.test.ts` that holds each connection of a pool, run `migrate`.
