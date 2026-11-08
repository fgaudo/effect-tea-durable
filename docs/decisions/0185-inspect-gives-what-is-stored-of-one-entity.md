# 0185. `inspect` gives what is stored of one entity, read from one snapshot

**Status:** proposed, 2026-11-08, for the step The API before the release of the [roadmap](../roadmap.md). Adds to
[decision 0114](archive/0114-an-operator-sees-the-suspended-entities-and-what-a-resume-did.md) the reading of one
entity that an operator decides a `resume` or a `discard` by.

## Context

An operator finds a suspended entity with `suspended`, which gives what the entity died on, the cause and since
when. It gives neither the state nor the mailbox. So an operator who must choose between `resume` and `discard`
cannot see the message the discard would drop, or the state the program died on. The storage reads all of it with
`load` when the entity is activated, and no call of the handle gives it.

`load` reads the entity's row, its keys and its mailbox in three statements, outside a transaction. That is safe at
an activation, which holds the entity's lock, so no step of the entity commits between the statements. An operator
holds no lock. On SQLite a statement outside a transaction waits only for a transaction already open, so a whole
step can commit between two statements of `load`. The reading would then give a state from before the step and
keys from after it.

## Decision

- **`inspect(id)` gives what is stored of the entity, or null when there is none.** It gives the state, the mailbox,
  the work under way and the suspension. The mailbox comes in its order, the next message first: an inbound
  message with the request it came with, and an internal one with the key and incarnation of the work that sent it.
  The work comes oldest first, as each key, its incarnation and the operation or the timer. The suspension is the
  one `suspended` lists, the senders waiting in this process included, or null for an entity that is not
  suspended.
- **It reads what is stored, and activates nothing.** An entity this process does not hold is inspected too. No
  program runs, so a program deployed that would die on the stored state does not suspend the entity anew.
- **The rows are read through the migrations, as `load` reads them.** A row that no migration reads is a defect of
  `inspect`, as it is of the entity's activation.
- **The rows are read from one snapshot.** The readings run in one transaction. On PostgreSQL it begins at
  `REPEATABLE READ`, as a query's pages do
  ([decision 0157](archive/0157-the-storage-speaks-sqlite-and-postgresql.md)). Within a transaction the caller left
  open, the readings run at the caller's level, as a query's do
  ([decision 0158](archive/0158-an-older-database-of-sqlite-is-given-request-id-and-a-page-keeps-the-level-of-a-callers-transaction.md)).
  So a step that commits meanwhile is read whole or not at all.
- **An id that is no id is the caller's defect**, as it is of `read`, `resume` and `discard`
  ([decision 0179](0179-an-id-is-not-empty.md)).

## What it rests on

- That `inspect` gives the state, the mailbox, the work and the suspension as stored, and that it activates nothing:
  **tested** by `an operator inspects an entity: its state, its mailbox, its work and its suspension, as stored` in
  [`src/runtime.test.ts`](../../src/runtime.test.ts), on SQLite and PGlite. The test inspects an entity under a
  program whose `durable` dies, and finds the old cause, which a resume then replaces.
- That a step can commit between two statements read outside a transaction, and none can within one: **documented**
  by `makeSqliteAcquirers` in `node_modules/effect/src/sql/SqlClient.ts`, whose statement holds the client's
  semaphore until it finishes, and whose transaction holds it until its scope closes. **Read** in
  `node_modules/@effect/sql-sqlite-bun/src/SqliteClient.ts`: the client of SQLite is built with it. **Tested** on SQLite by `an
  inspection reads one snapshot, so a step that commits meanwhile is read whole, under prioritized schedules` in
  [`src/runtime.test.ts`](../../src/runtime.test.ts), which fails at its first seed when the readings run outside the
  transaction.
- That `REPEATABLE READ` gives every statement of the transaction its first snapshot on PostgreSQL: **documented**,
  as [decision 0157](archive/0157-the-storage-speaks-sqlite-and-postgresql.md) found for a query. No test runs
  `inspect` against a step on a server of PostgreSQL with a pool, which the roadmap's step on PostgreSQL waits for.
- That the waiting senders are the ones `suspended` lists: **reasoned**. Both read the registrations of this process
  with the same function, after the rows are read.

## Alternatives

Each structure of Effect that could give the reading was weighed.

- **The machine the process holds**, in `deployed.loaded`. Only an entity loaded here has one. On Cluster a
  machine a door's step computed may not be committed yet ([decision 0161](archive/0161-on-cluster-a-step-settles-the-machine-by-the-count-of-the-steps-that-wrote-it.md)).
  The stored rows are what every runner and every activation reads.
- **The entity's lock**, as an activation takes it with `withEntity`. That function activates the entity it
  loads, which runs the program deployed on the stored state, and may suspend the entity anew. Holding the lock
  without loading would only block the entity's steps for a reading the transaction already makes consistent.
- **`SqlClient.withTransaction`, with `SqlClient.BeginTransaction` on PostgreSQL**, is the snapshot. `inspect` uses
  it, and a query's pages now share the same helper.
- **`Effect.all` with a concurrency for the three readings.** Within a transaction the statements run on one
  connection, so nothing would run at once.
- **`Option` for an entity that is not there.** `read` gives null for that, and so does `inspect`.
- **The state and the mailbox in `suspended`'s list.** The list would decode the state of every suspended entity,
  and one state that no migration reads would make the whole list die.
- **The stored JSON, not read through the migrations.** An operator would read each version's own shape. A tool
  that wants JSON encodes the values with the program's schemas.

## Consequences

- `Handle` gains `inspect`, and `Inspected` is exported, with `Key` and `Request`, which it names.
- [`src/storage.ts`](../../src/storage.ts) reads one entity's rows in one function, which `load` and `inspect` share.
  The reading of a suspension is shared with `suspended`, and the snapshot with `query`.
