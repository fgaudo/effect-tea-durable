# 0156. A program is renamed by its launch, and its entities keep their keys

**Status:** accepted, 2026-11-06, with the step Renaming a program of the roadmap. Decides the
[open question](../../open-questions.md#storage-and-reading) of renaming a program. Changes
[decision 0022](0022-a-new-program-keeps-what-work-started-with.md), which leaves a rename outside the
runtime. On PostgreSQL a rename writes a request's text again in the process, by
[decision 0157](0157-the-storage-speaks-sqlite-and-postgresql.md). On Cluster a rename
marks the old name and keeps a door under it, and two names may be renamed to one, by
[decision 0176](0176-on-cluster-a-rename-marks-the-old-name-and-keeps-its-door.md).

## Context

A program's name is the address of its entities, with their ids. The runtime stores every row of an entity under
it: the entity, its work, its mailbox, its projection, the heads and the publications of the log, the rows of the
outbox, the consumers and their cursors, and the replies the entity stored. A reply another entity stored for one
of this entity's operations names it twice: in its column `sender_name`, and in the JSON of the request, whose
`entity` is the sender's address ([decision 0059](0059-a-request-is-a-value.md)). The mailbox of
another entity holds such a request too, while the message waits, and so does the row of an entity this entity
created.

The name is also in every idempotency key an operation is given
([decision 0123](0123-an-idempotent-runner-may-be-given-the-digest-of-its-key.md)). A key that changes while its
operation is under way runs the operation again under a new key: a charge made twice.

[Decision 0022](0022-a-new-program-keeps-what-work-started-with.md) makes an entity's name the name of the
program that created it, so a program of another name is a defect at activation. It leaves the rename to a migration
of the stored rows outside the runtime. Such a migration must know every table, every column and every JSON that
holds the name, and must keep the keys of the work under way, which no SQL statement alone can.

A database is held by one runtime ([decision 0080](0080-a-database-is-held-by-one-runtime.md)), so a rename
that runs at launch, before any deploy, meets no entity loaded and no reader.

## Decision

### Where a rename is declared

- **`launch` takes `renames`**, a record from each old name to its new name. A rename is a move of the database,
  so it is the launch's, as the number of partitions is
  ([decision 0137](0137-the-log-is-ordered-within-a-partition.md)), and not the program's.
- **The launch refuses renames that cannot be run as written**, before it holds the database: an empty name, a
  name renamed to itself, a name that is both renamed and the new name of another, and two names renamed to one.
  Each is the launcher's defect, and names the names.
- **A deploy of a program whose name the launch renames is a defect.** Such a program is the old one, and would
  create entities under the name just left.

### What a rename moves

- **The launch runs every rename in one transaction**, after it stores the number of partitions and before any
  deploy. A rename that fails moves nothing, and the launch dies.
- **A rename whose old name holds nothing moves nothing.** The old name holds something when a row of any table is
  stored under it, or a reply names it as its sender. Each of these is found by an index. So a rename stays in the
  launch for as long as a database of the old name may be launched, and costs a few readings once it has run.
- **A rename onto a name that holds an entity, a head of the log or a consumer is a defect**, while the old name
  holds something too. The two names' entities, the order of their partitions and their cursors would mix.
- **Every row stored under the old name is moved to the new one**, in every table, and every reply whose sender is
  the old name names the new one.
- **Every request the old name's entities sent names the new one**: the requests in the mailboxes, in the replies
  and in the rows of the entities they created whose `entity` is the old name. A sender that sends again after the
  rename keys its request with the new name, and so finds the reply stored for it.

### What a rename keeps

- **An entity keeps the idempotency keys of its work.** The entity stores, from its first rename, the name its keys
  are drawn from, and its keys are drawn from that name from then on, for the work under way and for the work that
  starts after. An entity renamed twice keeps the first name. An entity never renamed draws them from its name, as
  before.
- **The rest of an entity does not change**: its state, its versions, its incarnations, its partition and its
  suspension. A state or a message that holds an address of the old name is the program's data, which its own
  migration moves ([decision 0036](0036-a-migration-is-a-function-on-the-json.md)).
- **The consumers keep their names and their cursors**, under the new name.

### What it does not cover

- **On Effect Cluster an entity's type is its program's name**, and Cluster stores its messages under it. A rename
  there moves Cluster's rows too, and is decided with the step Effect Cluster of the roadmap.

## What it rests on

- That no entity is loaded and no reader reads while the rename runs: **tested**, since the launch runs it before
  it returns, and so before any deploy, and the database is held by one runtime
  ([decision 0080](0080-a-database-is-held-by-one-runtime.md)), whose tests check that a second runtime is
  refused.
- That the rename commits whole or not at all: **documented**, by the JSDoc of `SqlClient.withTransaction` in
  `effect/src/sql/SqlClient.ts`, which promises that every statement in it runs in one transaction.
- That SQLite's `json_set` changes the name in a request's text and nothing else of it, so that the text is the one
  the runtime writes for the request under the new name: **tested**, by a test of
  [`src/storage.test.ts`](../../../src/storage.test.ts) on the SQLite 3.53.2 that `bun:sqlite` embeds, with key
  parameters of large numbers, escaped strings and nested objects. SQLite's documentation is no documentation of a
  version the repository pins, so a guard keeps it. Before it moves anything, the rename checks that `json_set`
  gives back each request's text unchanged when it writes the old name again, and that `json_quote` writes the new
  name as `JSON.stringify` does. A request that fails either check makes the rename die.
- That a sender that sends again after the rename finds its reply, and an operation under way keeps its key:
  **tested**, by a test of [`src/runtime.test.ts`](../../../src/runtime.test.ts) that renames a program whose
  operation is under way and has been answered.

## Alternatives

- **A structure of Effect.** Each module of the pinned version that could do part of the work was weighed.
  `sql/Migrator` runs numbered migrations once, and records each in a table. It is marked `@stability unstable`,
  `src/` does not import it, and a rename needs no record, since a rename whose old name holds nothing moves
  nothing. The storage moves no schema of its own yet, so it has no migrations a rename would join.
  `SqlClient.withTransaction` is used, and makes the rename one transaction. `sql/SqlModel` and `sql/SqlResolver`
  build statements of one table by its schema, and a rename is a statement per table. Cluster's `EntityAddress`
  names an entity by its type, and Cluster has no rename.
- **A rename declared by the program**, as a list of its former names. A program is deployed against many
  databases, and a rename runs once in each, so it would stay in the program for as long as any database of the old
  name exists. The number of partitions is the launch's for the same reason.
- **A rename by hand, in SQL**, as decision 0022 left it. It must know every column and JSON that holds the name,
  and changes the keys of the work under way.
- **Keys drawn from the new name, for the work that starts after the rename.** It is the same rule with a second
  name to store per piece of work. One name per entity is simpler, and a key differs from every other by its
  incarnation whichever name it holds.
- **A rename that waits until no work is under way.** An entity with a timer a month ahead holds work for a month,
  so the rename would wait for it.
- **Requests that name their sender by the name it was created under**, so that no request is written again. The
  receiver reads `meta.from` from the request, and would read an address that is no longer its sender's.
- **Rewriting a request's text in the process**, with `JSON.parse` and `JSON.stringify`. It reads every request of
  the tables into the process, where one statement per table does the work in the database.

## Consequences

- [`src/storage.ts`](../../../src/storage.ts) adds the column `keyed_as` to `entities`, reads it with the entity, and
  runs the renames in one transaction. [`src/machine.ts`](../../../src/machine.ts) draws an entity's keys from the name
  it holds there. [`src/runtime.ts`](../../../src/runtime.ts) takes `renames` at launch, checks them, runs them, and
  refuses a deploy of a name renamed.
- [`src/machine.test.ts`](../../../src/machine.test.ts) checks that a renamed entity's keys keep the first name.
  [`src/storage.test.ts`](../../../src/storage.test.ts) checks what a rename moves, what it refuses, and the text of
  the requests it writes again. [`src/runtime.test.ts`](../../../src/runtime.test.ts) checks a rename with work under
  way, a caller's retry and a refused deploy.
- `docs/design.md` says, under Schemas that change, how a program is renamed. The glossary's entry for a name says
  that a launch renames it. The open question of renaming a program leaves `docs/open-questions.md`, and the step
  leaves the roadmap. The roadmap's step Effect Cluster says that a rename there moves Cluster's rows too.
