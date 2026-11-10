# 0247. `check` reads the stored entities as a deploy of a new program would activate them

**Status:** accepted, 2026-11-10, with the step A check of a program against the stored entities, before it is
deployed, of the [roadmap](../roadmap.md). Adds to
[decision 0064](archive/0064-the-program-is-not-the-machines-state.md) a way to learn before a deploy what it
would suspend.

## Context

A new program that dies on a stored state suspends each such entity at its activation
([decision 0064](archive/0064-the-program-is-not-the-machines-state.md)). An operator learns it from `suspended`,
once the deploy has happened. So does a program that changes, drops or delivers otherwise an operation under way
([decisions 0020](archive/0020-a-new-program-is-checked-against-the-stored-work.md),
[0022](archive/0022-a-new-program-keeps-what-work-started-with.md)). A program whose migrations or schemas do not
read a stored row does worse. The row fails every call that loads its entity
([decision 0043](archive/0043-a-row-no-version-reads-fails-what-reads-it.md)). A deploy that activates such an
entity with work under way dies.

The new program is deployed by a new process ([decision 0075](archive/0075-a-name-is-deployed-once-in-a-process.md)).
While it is checked, the old version still runs. On one process the old version holds the database alone
([decision 0080](archive/0080-a-database-is-held-by-one-runtime.md)). On Cluster a launch of a newer version stops
the older runners from serving a shard
([decision 0159](archive/0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md)). So the
check cannot launch the new version.

## Decision

- **`check(program, options)` is a function of the main entry, over `SqlClient`.** It launches nothing, takes no
  lock and writes nothing, so it runs on a database another version holds.
- **Each entity is read as an activation reads it, then its activation is stepped by the machine, in memory.** The
  rows are read through the new program's migrations and schemas, from one snapshot, as `inspect` reads them
  ([decision 0185](0185-inspect-gives-what-is-stored-of-one-entity.md)). The machine then steps a `Restart` with
  the new program, the rows the step would write included. So the check runs whatever an activation runs: `work`,
  `project`, the indexes and the topics on the stored state, and the encoding of the state and of its work. It
  compares the operations under way with the new `work`. It calls the `unknown` of an at-most-once operation that
  may have run.
- **A suspended entity is stepped by a `Resume`.** A `Restart` leaves a suspended entity as it is, and would check
  nothing. A `Resume` activates it as an operator's `resume` by the new program would. The check handles no
  message, so the message a suspended entity died on is not handled.
- **A failure says where it happens.** `Load` is a migration or a schema of the program that dies on a stored row,
  so that every activation of the entity dies. `Activation` is an activation that suspends the entity. Each gives
  the cause as a suspension renders it.
- **What the runtime throws fails the whole call**, as it does `reindex`'s
  ([decision 0122](archive/0122-reindex-leaves-a-row-it-cannot-compute-and-names-its-entity.md)): a statement, a row
  that is no JSON, and a row that is no row the runtime writes. The storage reads a row's text as JSON first, and
  runs only the migrations and the schema inside a guard, which tells their throws apart.
- **The result gives counts, and at most `limit` failures of each kind.** The entities not suspended and the
  suspended ones are given apart, each with how many were checked, how many fail, and the first `limit` failures
  in the order they were read. One broken program may fail every entity, mostly with one cause, so the whole list
  would be the whole table in one array ([decision 0141](archive/0141-a-query-and-a-reading-of-the-log-take-a-limit.md)). `limit` is a
  non-negative integer, required. A `limit` of 0 gives the counts alone.
- **The entities are read by pages of their ids, and each entity in a snapshot of its own.** No transaction is held
  across pages. So the check is a reading of a moment. An entity created while it runs is read or not by its id.
  An operation under way at the check may have ended by the deploy.
- **`renames` are the launch's.** The entities of each name renamed to the program's are read as the program's,
  with the name and the `keyedAs` the rename would give them
  ([decision 0156](archive/0156-a-program-is-renamed-by-its-launch-and-keeps-its-keys.md)). The renames are refused as the launch
  refuses them. So is a program that the renames rename away, as a deploy refuses it.
- **The program is refused as a deploy refuses it, before any row is read**
  ([decision 0054](archive/0054-a-program-is-checked-where-it-enters.md)).
- **The tables must be the ones this release reads.** The check makes no table and runs no migration. It dies unless
  `effecttea_migrations` records the migrations of this release's `createTables`, every one and no other.

## What it rests on

- That the check finds what a deploy does: **tested** by `finds the entities whose activation the new program
  suspends, as a deploy then suspends them` in [`src/check.test.ts`](../../src/check.test.ts), on SQLite and PGlite.
  The test checks while the old version holds the database, finds the rows unchanged, then deploys the program
  checked and finds the same entity suspended on its activation, with the same cause. `checks a suspended entity as
  a resume would activate it` does the same for a `resume`.
- That a `Load` is told apart from an `Activation` and from what the runtime throws: **tested** by `tells a row the
  migrations do not read from an activation that suspends` and `dies on what the runtime throws: a row that is no
  JSON, and tables another release made`, in the same file.
- That a version no migration reads throws where its reading runs, inside the guard: **reasoned**. `up` in
  [`src/storage/held.ts`](../../src/storage/held.ts) keeps the throw of `migrationOf` for the reading. A load outside
  `check` throws the same error, a step later, so its message is unchanged, as the tests of the runtime read it.
- That `Migrator` records `0001_tables` as the id 1 and the name `tables`: **read** in
  `node_modules/effect/src/sql/Migrator.ts`, whose loader parses a migration's key into its id and name. **Tested**
  by the test of the tables above, which reads the guard's message.
- That a reading in a snapshot sees a step whole or not at all: **tested** for `inspect`, which shares the reading,
  by decision 0185's test.

## Alternatives

- **A call of `Runtime` or of `Handle`.** A runtime needs a launch, which the old version's hold refuses. A handle
  is the deployed program's, and the program checked is not deployed.
- **Every failure, as `reindex` gives them.** One array would hold a failure per entity.
- **A page of failures given by the caller's `after`.** The counts would need a reading of their own, and the
  failures come in an order, so an `after` can be added later without changing what a page gives.
- **A suspended entity passed over, and counted.** An operator who deploys a fix for it would learn nothing of it.
- **A check of the work against the new `work` written apart.** The machine's `Restart` compares them already, and a
  second path could drift from the activation.
- **The table of `Migrator` read through the `search_path`.** It would find another schema's history
  ([decision 0217](0217-tea-migrations-is-named-in-the-schema-the-tables-are-made-in.md)). The check names it as
  `createTables` does.

## Consequences

- The main entry gains `check`, with `Checked`, `CheckedEntities` and `CheckFailure`, in
  [`src/check.ts`](../../src/check.ts).
- The storage gains `examine` and `entities`, and `storage` the name its rows are stored under. A reading of a row
  takes a guard, which runs the migrations and the schema.
- `bun run test:postgres` runs `src/check.test.ts` too.
- Not checked: the handling of the mailbox's first message by `update`, the messages Cluster saved and has not
  delivered, the rows of the read model, which `reindex` writes, and whether the launch's rename itself would run.
