# 0263. A launch dies where a schema further on the `search_path` holds the tables

**Status:** accepted, 2026-11-11, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the fix of bug 41. It changes
[decision 0217](0217-tea-migrations-is-named-in-the-schema-the-tables-are-made-in.md): where a schema further on the
`search_path` holds `effecttea_migrations`, a launch no longer makes a set of tables in the first schema, and dies.

## Context

On PostgreSQL the runtime makes its tables in the first schema of the `search_path` that exists
([decision 0215](0215-the-runtimes-tables-are-made-in-the-schema-of-the-search-path.md)). Decision 0217 names
`effecttea_migrations` in that schema, which `current_schema()` gives. So where a schema further on held the tables, a
launch made a second set of tables, empty, in the first schema, and ran on them.

The default `search_path` is `"$user", public`. A database whose tables a launch made in `public` has them read
through `public` while no schema of the role's name exists. Once an operator or the application makes a schema of the
role's name, `current_schema()` names it, in every session, those already open included. The next launch made new
tables there, and every entity, reply and cursor stayed in `public`, with no error. That is bug 41.

The database cannot tell this case from the case of decision 0217, where a launcher puts a schema in front of `public`
on purpose. In both, a schema further on the `search_path` holds the history, and the first holds none. The maintainer
chose on 2026-11-11, after the opinion of a Fable 5.2 agent, that the runtime refuses the case rather than guesses.

## Decision

- **At most one schema of the `search_path` holds the runtime's tables, and it is the first that exists.**
  `createTables`, and with it a launch, dies where `effecttea_migrations`, looked up without a schema, is found in a
  schema other than `current_schema()`. It dies before `Migrator` makes its table, so it makes nothing in either
  schema.
- **The defect names both schemas and the two ways out.** The operator sets the role's `search_path` to the schema
  that holds the tables, or moves the tables into the first schema.
- **`check` dies alike**, since `tablesMade` reads the tables a launch would read
  ([decision 0247](0247-check-reads-the-stored-entities-as-a-deploy-would-activate-them.md)).
- **No statement of the storage names a schema but `effecttea_migrations`**, as decisions 0215 and 0217 have it.
- **On SQLite nothing changes.**

## What it rests on

- That a launch dies, and makes nothing in either schema, where a schema further on the `search_path` holds the
  tables: **tested** by `on PostgreSQL a launch dies where a schema further on the search_path holds the tables, and
  makes nothing`, in [`src/storage.test.ts`](../../src/storage.test.ts), on PGlite. It fails against the code before
  the change, which made the tables in `runtime`.
- That under the default `search_path` a schema of the role's name made after the tables makes the launch die, and
  leaves the entities where they are: **tested** by `on PostgreSQL a schema of the role’s name made after the tables
  makes the launch die, with the entities kept`, in `src/storage.test.ts`, on PGlite. It fails against the code
  before the change.
- That the schema of the role's name moves `current_schema()` of every connection of a pool, those already open
  included, and that the launch dies on each: **tested** by `a schema of the role’s name made after the tables makes
  the launch die on every connection of the pool`, in [`src/postgres.test.ts`](../../src/postgres.test.ts), on the
  CI's server.
- That `tablesMade` and `check` die alike: **tested** by `on PostgreSQL tablesMade dies where a schema further on the
  search_path holds the tables`, in `src/storage.test.ts`, and by `dies on PostgreSQL where a schema further on the
  search_path holds the tables`, in [`src/check.test.ts`](../../src/check.test.ts), on PGlite.
- That `to_regclass` searches every schema of the `search_path`, and `current_schema()` gives the first that exists:
  **documented** in PostgreSQL's manual, under the schema search path and the functions of the session, as
  decision 0217 has it.
- That an operator would rather have a launch die than have it guess which set of tables holds the data:
  **chosen**, by the maintainer.

Of the premises of decision 0217, the one that a schema further on no longer keeps the tables from the first falls,
since such a launch dies. The premise of `to_regclass` and `CREATE TABLE` still holds. The premise of `Migrator`'s
names with a dot still holds, since the history is still named with its schema.

The decision leaves out three cases, each an [open question](../open-questions.md#storage-and-reading): a set of
tables in a schema the `search_path` no longer names, a connection of a pool whose `search_path` differs from the one
the check read, and Cluster's tables where a schema is put in front of them.

## Alternatives

- **A launch is given its schema by name**, as an option of the storage, and every statement names it. It is how
  most tools of migrations take a schema. But the launcher gives the client, and the library holds no option of
  PostgreSQL. Cluster's tables cannot be named with a schema, since the JSDoc of `layerMigrations` of
  `SqlMessageStorage`, at Effect 4.1.2, says a prefix with a schema makes an invalid name of an index. The runtime
  writes its tables and Cluster's in one transaction, and the two would then follow two rules. It would also change
  decision 0215.
- **A launch runs on the tables wherever `to_regclass` finds them**, as before decision 0217. Bug 41 would then cost
  no failed deploy. But it breaks the promise of decision 0215 in silence, and a later migration that makes a table
  would make it in the first schema, apart from the others.
- **A launch dies where any schema of the database holds `effecttea_migrations` but the first**, on or off the
  `search_path`. It also refuses a set of tables a changed `search_path` left behind. But it also refuses a database
  where an operator keeps a copy of the tables in another schema on purpose, as before a move. It is left as an open
  question.
