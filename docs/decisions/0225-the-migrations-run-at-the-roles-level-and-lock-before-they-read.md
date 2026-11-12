# 0225. On PostgreSQL the migrations run at the level the role sets, since `Migrator` locks its table before it reads

**Status:** accepted, 2026-11-10, by the review of 0194 to 0224. Changes
[decision 0222](0222-postgresql-with-many-connections.md), whose rule that every transaction of the runtime states
its level did not name the transaction of the migrations. Changed by [decision 0279](0279-createtables-dies-within-a-transaction-of-its-client.md), under which `createTables` dies within a transaction of
its client, so that the migrations' transaction is always their own.

## Context

[Decision 0222](0222-postgresql-with-many-connections.md) begins every transaction of the runtime on PostgreSQL at a
level it states: `READ COMMITTED` for a write, `REPEATABLE READ` for a reading of one snapshot. Its list names a step,
a creation, an ack, a prune, a forget, an expiry, a declaration of consumers, a rename and a reader's page. It does not
name the transaction in which `createTables` runs the migrations
([decision 0216](0216-the-tables-are-made-by-effects-migrator.md)). That transaction is `Migrator`'s, and
`createTables` gives it a level on SQLite alone, `BEGIN IMMEDIATE`. On PostgreSQL it begins with `BEGIN`, at the
level the role or the database sets by default.

At `REPEATABLE READ` or `SERIALIZABLE` a transaction reads one snapshot, taken by its first query. Two launches that
run the migrations at once would then be safe only if the second took the lock of `effecttea_migrations` before it
read the history. Otherwise it would read an empty history, and die on the first table the first launch made, since
the first migration makes each table without `IF NOT EXISTS`
([decision 0218](0218-the-prefix-is-effecttea-and-a-launch-dies-on-a-name-taken.md)). No data would be lost, but a
launch would die where it should wait.

## Decision

- **The transaction of the migrations runs at the level the role sets, on PostgreSQL.** `createTables` states no
  level for it. Each level holds the rule of decision 0216: two launches at once run each migration once.
- **The rule holds because `Migrator` takes its lock first.** `LOCK TABLE effecttea_migrations IN ACCESS EXCLUSIVE
  MODE` is the first statement of its transaction, and reads nothing. So the second launch waits on the lock, and its
  snapshot is taken by the reading of the history after the first launch has committed. It finds every migration
  recorded, and runs none.
- **The rule of decision 0222 is read with this exception.** Every transaction the runtime begins itself states its
  level; the migrations' transaction is `Migrator`'s.

## What it rests on

- That `Migrator` locks its table before any query of its transaction on PostgreSQL: **read in the dependency's
  source**, `run` in `node_modules/effect/src/sql/Migrator.ts` at 4.1.2, where the `LOCK TABLE` comes before
  `latestMigration`. The module is `@stability unstable`, so a move of Effect's version reads it again.
- That a transaction at `REPEATABLE READ` or `SERIALIZABLE` takes its snapshot at its first query or data
  modification, and not at `LOCK TABLE`: **documented** in PostgreSQL's manual, on `LOCK` and under Transaction
  Isolation.
- That two runs of `createTables` at once make the tables once: **tested** at the server's default level,
  `READ COMMITTED`, by the two tests of the migrations in [`src/postgres.test.ts`](../../src/postgres.test.ts). No
  test runs them under a database whose default level is `SERIALIZABLE`.

## Alternatives

- **`createTables` begins the migrations at `READ COMMITTED`, as every other transaction.** It keeps decision 0222's
  rule without an exception. It needs a test on a server, under a database whose default level is `SERIALIZABLE`, and
  the CI's job `postgres` to run it on a branch. It is the change to make if a release of `Migrator` reads before it
  locks.
