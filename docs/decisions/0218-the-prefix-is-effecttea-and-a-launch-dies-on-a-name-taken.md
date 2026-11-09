# 0218. The prefix is `effecttea_`, and a launch dies on a name the runtime's objects would take

**Status:** accepted, 2026-11-09. Changes
[decision 0198](0198-every-object-the-runtime-makes-is-named-with-tea.md), whose prefix was `tea_`. Changes
[decision 0216](0216-the-tables-are-made-by-effects-migrator.md), whose first migration kept `IF NOT EXISTS`.

## Context

[Decision 0198](0198-every-object-the-runtime-makes-is-named-with-tea.md) named every object the runtime makes with
`tea_`, so that a table of the application in the same database is never taken for the runtime's own. Two gaps were
left.

- `tea` is a common word. `tea_consumers`, `tea_log` and `tea_versions` are names an application plausibly has, for
  instance an application about tea.
- The first migration made each table and index with `IF NOT EXISTS`, and the trigger's function on PostgreSQL with
  `OR REPLACE`. A table of the application under one of the runtime's names was still taken for the runtime's own,
  without an error. [Decision 0216](0216-the-tables-are-made-by-effects-migrator.md) kept `IF NOT EXISTS` only so
  that a database made by an earlier commit got its record. No such database belongs to a user, since the package
  has no release.

On PostgreSQL an application whose names clash can give the runtime's role a `search_path` with a schema of its own
([decision 0215](0215-the-runtimes-tables-are-made-in-the-schema-of-the-search-path.md)). On SQLite it has no such way
out, and can only rename its own tables.

## Decision

- **The prefix is `effecttea_`**: `effecttea_entities`, `effecttea_migrations`,
  `effecttea_outbox_drops_its_publication`, and an index of a program's read model `"effecttea_projections <program> <index> by id"`. The prefix is the
  package's name written as one word. The prefix stays fixed, as decision 0198 decided.
- **The first migration makes every object without `IF NOT EXISTS` and without `OR REPLACE`.** `Migrator` runs the
  migration once, in one transaction. A launch on a database that already holds an object under one of the
  runtime's names therefore dies on the statement that makes it. The transaction takes with it every object the
  migration made before, and `effecttea_migrations` records nothing.
- **The indexes of a program's read model are still made with `IF NOT EXISTS`.** Every deploy makes the indexes its
  program declares, outside any migration, so an index is made only where it is missing.

## What it rests on

- That every object the runtime makes is named with `effecttea_`: **tested** by
  `every table, index, trigger and function the runtime makes is named with effecttea_` in
  [`src/storage.test.ts`](../../src/storage.test.ts), on SQLite and on PostgreSQL.
- That a launch on a database holding a table under one of the runtime's names dies, and leaves no object of the
  runtime but `effecttea_migrations`, empty: **tested** by
  `a launch on a database that holds a table named as one of the runtime’s dies, and leaves no object of its own` in
  [`src/storage.test.ts`](../../src/storage.test.ts), on both dialects. Run with `IF NOT EXISTS` back on
  `effecttea_consumers`, the test fails.
- That `Migrator` makes its own table before the transaction of the migrations, and runs them in that transaction:
  **read in the dependency's source**, `effect/src/sql/Migrator.ts` of the pinned `effect`, where
  `ensureMigrationsTable` runs before `sql.withTransaction(run)`.
- That a name of an index of a read model longer than PostgreSQL's 63 bytes still names one index of its own: kept
  by `indexName` in [`src/storage.ts`](../../src/storage.ts), which cuts a longer name at 50 bytes and ends it with
  a hash of the whole, as [decision 0157](archive/0157-the-storage-speaks-sqlite-and-postgresql.md) decided. The
  longer prefix makes more names reach the cut, and changes nothing else. The fixed names are 38 bytes at most.
- That no database of a user holds the tables under `tea_`: **documented**, since the package has no release
  ([`README.md`](../../README.md)).
- That an application names no table of its own with `effecttea_`: **only reasoned**. The guide says the prefix is
  the runtime's, and a name that clashes now makes the launch die.

## Alternatives

- **`tea_` kept, with `IF NOT EXISTS` dropped.** A clash dies at the launch, but an application on SQLite whose
  names clash has no way to launch the runtime but to rename its own tables.
- **`effect_tea_`.** Effect names its own tables with `effect_`: `effect_sql_migrations`, `effect_events`,
  `effect_event_journal`, `effect_persistence`, `effect_key_value_store` and `effect_queue`. That namespace is
  Effect's, and the runtime is not part of Effect.
- **A separator that is not a letter, as `effect-tea_`.** A name with such a character must be quoted in every
  statement of the runtime, of its tests and of whoever reads the database by hand. `$` needs no quotes on either
  dialect, but standard SQL does not allow it.
- **A prefix the launch takes.** It stays rejected for the reasons of decision 0198. A launch given a prefix other
  than the one before would also start on empty tables, without an error.
- **`IF NOT EXISTS` kept, with a check of each table's columns.** Decision 0198 already rejected the check: a table
  whose columns happen to be the runtime's passes it.

## Consequences

- Every statement of [`src/storage.ts`](../../src/storage.ts), of the tests and of the spikes names the tables with
  `effecttea_`. The spikes' own tables that stood for the runtime's are named with it too.
- The design says under The tables that a launch dies on a name taken. The README, the guide, the example of the
  rental and the diagram of [`CONTRIBUTING.md`](../../CONTRIBUTING.md) name the prefix.
- A later migration that makes an object makes it without `IF NOT EXISTS`, for the same reason.
