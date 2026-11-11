# 0267. A file of SQLite is held by a file of its own beside it, and the hold refuses no reader

**Status:** accepted, 2026-11-11, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the fix of bug 87. It changes
[decision 0080](archive/0080-a-database-is-held-by-one-runtime.md): a file of SQLite is no longer held in the exclusive
locking mode, and another connection reads it while a runtime runs. It makes
[decision 0247](0247-check-reads-the-stored-entities-as-a-deploy-would-activate-them.md) hold on SQLite as on
PostgreSQL.

## Context

`check` runs in the new version's process, while the old version's runtime holds the database
([decision 0247](0247-check-reads-the-stored-entities-as-a-deploy-would-activate-them.md)). On PostgreSQL the runtime
holds the database by a session advisory lock, which refuses a second runtime and no reader. On SQLite the runtime
held the file in the exclusive locking mode ([decision 0080](archive/0080-a-database-is-held-by-one-runtime.md)). In
WAL mode that mode keeps every other connection from opening the file, one opened `readonly` included. So the check of
the new process died with `database is locked`, after the busy timeout, which blocks the event loop under
`bun:sqlite`. The hold refused readers on one backend and not on the other.

## Decision

- **The hold refuses a second runtime, and refuses no reader, on SQLite as on a server of PostgreSQL.** A connection
  that reads the database, as `check` or an operator's shell, reads it while a runtime runs. A data directory of
  PGlite opens in one process ([decision 0255](0255-a-data-directory-of-pglite-is-held-while-its-client-is-open.md)),
  so a check of it runs in the process that holds it, or once that process has stopped.
- **A file of SQLite is held by a file of its own beside it.** The hold file is named by the database's path, as
  `pragma_database_list` gives it, and `-effecttea-hold`. The runtime's connection attaches the hold file as
  `effecttea_hold`, sets the exclusive locking mode on it alone, and writes a row to it. That write takes the hold
  file's exclusive lock, and the mode keeps it until the hold file is detached or the connection closes. A second
  runtime's write to the hold file fails, and its launch dies with `the database is held by another runtime`. The
  database itself stays in the normal locking mode.
- **The runtime gives the hold back by detaching the hold file**, once everything of it has stopped, as decision
  0080 lets the hold go. The end of the process gives it back however the process ends, since the operating system
  ends the process's locks. The hold file stays on disk, since a runtime that deleted it could delete it under
  another that has just attached it.
- **A database of SQLite in memory is held by its client alone.** It names no file, and no other connection opens it.
- **A check on SQLite reads through a client opened `readonly`.** A writable client of `@effect/sql-sqlite-bun` begins
  each explicit transaction with `BEGIN IMMEDIATE`, which waits for the old version's steps, even for a transaction
  that only reads. A client opened `readonly` waits for no writer in WAL mode.

## What it rests on

- That a second holder is refused at once under a busy timeout of 0, that a reader opened `readonly` reads beside the
  holder one snapshot per transaction, that the database stays in the normal locking mode, and that a holder killed or
  a hold file detached gives the hold back: **seen** in the spike
  [`spikes/sqlite-hold-file.test.ts`](../../spikes/sqlite-hold-file.test.ts), whose holder is another process, at
  `@effect/sql-sqlite-bun` 4.1.3 on Bun 1.4.4. It passed on Windows on the maintainer's machine, and the job of the
  spikes of the CI runs it on Linux on the push of `main` that takes this note.
- That a runtime refuses a second runtime on another client of its file, that a reader opened `readonly` reads the
  rows it committed, and that the hold is given back when the runtime ends: **tested** by `a runtime holds its
  database file against another runtime, and a reader reads it beside the runtime`, in
  [`src/runtime.test.ts`](../../src/runtime.test.ts). `a launch refused by a file another runtime holds gives the
  file back` tests that a launch refused gives back what it held.
- That a check from a client of its own reads a file the old version holds: **tested** by `a check from a client of
  its own reads a file of SQLite the old version holds`, in [`src/check.test.ts`](../../src/check.test.ts), whose
  client is opened `readonly` with a busy timeout of 0.
- That a database in memory names no file, so that two databases in memory are not held as one: **tested** by `two
  runtimes launch at once on two databases in memory`, in [`src/runtime.test.ts`](../../src/runtime.test.ts).
- That a writable client begins an explicit transaction with `BEGIN IMMEDIATE`, and that one opened `readonly` does
  not: **documented** in the module's comment of `node_modules/@effect/sql-sqlite-bun/src/SqliteClient.ts`, at 4.1.3.
- That a writer which is no runtime, such as an operator's shell, is not refused, as on PostgreSQL: **chosen** by the
  maintainer, who chose this hold over a copy of the file on 2026-11-11.

## Alternatives

- **A copy of the file for the check**, made by the old process with `export` of `SqliteClient`, or the check of a
  stopped version. The copy needs code in the old version's process, holds the whole database in memory, and could be
  deployed onto by mistake. The check's contract would differ between SQLite and PostgreSQL.
- **A copy written by a call of `Runtime`**, by `VACUUM INTO`. It adds an API and a file the size of the database, and
  keeps the difference between backends.
- **A row in a table naming the runtime that holds the database.** Decision 0080 rejects it: a process killed leaves
  the row behind.
- **A lock of the file by the operating system, with no SQLite.** No module of `node_modules/effect/src` locks a file,
  and Bun gives no lock that the end of the process gives back.

## Consequences

- [`src/storage/tables.ts`](../../src/storage/tables.ts) holds a file of SQLite by the hold file, and the defect of a
  launch refused is `the database is held by another runtime`.
- A database of SQLite has a file `<path>-effecttea-hold` beside it once a runtime has launched on it, with SQLite's
  journal of that file at times.
- The design says that the check on SQLite reads through a client opened `readonly`.
- A second name of the database's file, by a symbolic or a hard link, names a second hold file. The decision leaves
  that case out, and it is an [open question](../open-questions.md#running).
- Cluster takes no hold of its own, so nothing of Cluster changes.
- The hold runs other statements at a launch, so six seeds pinned in the explored tests drew other schedules, and
  `bun run test:pins` found that their mutations passed. Each test pins a seed again, found under its mutation: 63
  and 146 in `src/runtime/callers.test.ts`, 79 in `src/runtime.test.ts`, and 33, 134 and 11 in
  `src/runtime/loop.test.ts`.
