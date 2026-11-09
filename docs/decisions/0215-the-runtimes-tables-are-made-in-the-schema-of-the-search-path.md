# 0215. The runtime's tables are made in the schema the client's `search_path` names

**Status:** accepted, 2026-11-09. Leaves [decision 0198](0198-every-object-the-runtime-makes-is-named-with-tea.md) as
it is: its alternative of a schema of the runtime's own refused that the runtime name one, and this note lets the
launcher choose one. [Decision 0216](0216-the-tables-are-made-by-effects-migrator.md) locks `tea_migrations` in
place of the advisory lock of `createTables`, so that lock is the schema's.
[Decision 0217](0217-tea-migrations-is-named-in-the-schema-the-tables-are-made-in.md) names `tea_migrations` in the
schema `current_schema()` gives, the one statement of the storage that names a schema.

## Context

No statement of the storage names a schema of PostgreSQL, so every table resolves through the `search_path` of the
connection. A launcher could put the runtime's tables in a schema apart from the application's, and the design
promised nothing of it. Cluster asks for the same of its own tables: the JSDoc of `layerMigrations` of
`SqlMessageStorage`, at Effect 4.1.2, says to select a schema with the role's `search_path`, since a prefix qualified
by a schema makes an invalid index name. The runtime reads Cluster's tables unqualified, so both already resolve
through one `search_path`.

## Decision

- **No statement of the storage names a schema of PostgreSQL.** Every table, index, trigger and function the runtime
  makes is made in the schema that the client's `search_path` names first. A launcher that sets the `search_path` of
  the runtime's role, as Cluster asks for its own tables, puts them in a schema of their own.
- **A database is still held by one runtime, whatever its schemas.** The advisory lock that holds it is the
  database's, and so is the lock of `createTables`
  ([decision 0080](archive/0080-a-database-is-held-by-one-runtime.md)).
- **A statement of the launcher's own on `tea_outbox` runs under the runtime's `search_path`.** The trigger's function
  finds its tables through the `search_path` of the session that deletes the row.

## What it rests on

- That every object the runtime makes is made in the schema the `search_path` names, and that the trigger's function
  finds its tables through it: **tested**, by
  `on PostgreSQL every object the runtime makes is in the schema its client’s search_path names` in
  [`src/storage.test.ts`](../../src/storage.test.ts), on PGlite. A statement that named a schema would fail it.
- That only the runtime deletes from `tea_outbox`: **read in source**, `prune` of
  [`src/storage.ts`](../../src/storage.ts) is the one statement that does.
- That PL/pgSQL resolves a name of a function's body by the `search_path` at the time of the call: **only reasoned**.
  A deletion under another `search_path` would fail loudly, not in silence.
- That an advisory lock is the database's, not a schema's: **only reasoned**. PGlite takes no session lock, so no
  test sees it.
- That Cluster's tables follow the `search_path`: **documented**, by the JSDoc above, in a module marked
  `@stability unstable`.
- That a pool gives every connection the `search_path` of the role: **only reasoned**. It is an
  [open question](../open-questions.md#running), with PostgreSQL on a server.

## Alternatives

- **The design promises no schema, and the prefix `tea_` is the separation.** The test would keep that no statement
  names a schema anyway, and a launcher who reads Cluster's JSDoc would rely on it without a promise.
- **An advisory key that depends on `current_schema()`, for one runtime per schema.** Cluster's own advisory locks
  are the database's too, and the runtime reads Cluster's leases in `cluster_locks`, under the default prefix only
  ([decision 0175](archive/0175-on-cluster-every-step-checks-the-newest-version-and-the-shards-lease.md)). It would
  change decision 0080 for a layout Cluster does not allow.

## Consequences

- The design says, under The tables, that the runtime's tables are made in the schema of the `search_path`.
- A later statement of the storage, a migration included, names no schema.
