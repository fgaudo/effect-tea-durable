# 0217. On PostgreSQL `tea_migrations` is named in the schema the tables are made in

**Status:** accepted, 2026-11-09. Changes [decision 0216](0216-the-tables-are-made-by-effects-migrator.md), whose
`Migrator` was given `tea_migrations` unnamed. Changes
[decision 0215](0215-the-runtimes-tables-are-made-in-the-schema-of-the-search-path.md), in which no statement of the
storage names a schema.

## Context

`Migrator` of `effect/sql` looks for its table on PostgreSQL with `to_regclass`, which searches every schema of the
`search_path`. `CREATE TABLE IF NOT EXISTS` looks only in the schema it creates in, which is the one the
`search_path` names first. Given `tea_migrations` unnamed, a launch whose `search_path` is `runtime, public`, on a
database whose `public` holds the tables, found `public.tea_migrations` and its migration recorded. It ran nothing,
made no table in `runtime`, and the runtime read and wrote the tables of `public`. Decision 0215 promises that the
tables are made in the schema the `search_path` names first.

## Decision

- **On PostgreSQL `createTables` names `tea_migrations` in the schema that `current_schema()` gives.** That schema is
  the first of the `search_path` that exists, the one every table of the first migration is made in. `Migrator` then
  creates, locks and reads the history of that schema alone.
- **The migrations themselves still name no schema.** Every other statement of the storage resolves through the
  `search_path`, as decision 0215 has it.
- **Without a schema to make the tables in, `tea_migrations` is given unnamed.** `current_schema()` is then null, and
  the creation fails as it would unnamed.
- **On SQLite nothing changes.** A file has one schema of its own.

## What it rests on

- That a schema further on the `search_path` that holds `tea_migrations` no longer keeps the tables from the first:
  **tested** by `on PostgreSQL the tables are made in the schema the search_path names first, though one further on
  has them` in [`src/storage.test.ts`](../../src/storage.test.ts), on PGlite. It fails with the table unnamed.
- That `to_regclass` searches the whole `search_path`, and `CREATE TABLE` creates in the first schema that exists:
  **documented** in PostgreSQL's manual, under the schema search path; and seen by the same test.
- That `Migrator` passes a name with a dot to every statement of its table as a schema and a table: **read in
  source**, `defaultEscape` of `node_modules/effect/src/sql/Statement.ts` at 4.1.2 quotes each part apart. A schema
  whose name holds a dot is then three parts, which PostgreSQL refuses, so the launch dies rather than reads another
  schema.

## Alternatives

- **The promise of decision 0215 holds only where no schema further on holds the tables.** It would leave a launcher
  who adds a schema in front of `public` with a runtime on the tables it meant to leave.
- **The runtime refuses a `search_path` of more than one schema.** The default `"$user", public` has two, and the
  runtime has no reason to refuse it.
