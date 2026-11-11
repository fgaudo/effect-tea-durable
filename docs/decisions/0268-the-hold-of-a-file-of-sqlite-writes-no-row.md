# 0268. The hold of a file of SQLite writes no row, so that a launch on a full volume takes it

**Status:** accepted, 2026-11-11, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md). It changes
[decision 0267](0267-a-file-of-sqlite-is-held-by-a-file-of-its-own-and-refuses-no-reader.md): the hold file is taken by
an exclusive transaction that writes no row, where 0267 wrote a row to it.

## Context

Decision 0267 holds a file of SQLite by a hold file beside it, which the runtime's connection attaches in the
exclusive locking mode and writes a row to. The job of PostgreSQL of the CI runs `spikes/full-volume.test.ts` on a
volume of fixed size, and it failed on the push of `fcd7ce4`, which took 0267. A second process on the full volume
could no longer launch: the write of the row died with `database or disk is full`. A write of a file in SQLite's
rollback journal copies the page it changes to the journal first, and the journal grows on the full volume.
[Decision 0223](0223-a-disk-that-is-really-full.md) rests on a launch that
runs on a full volume, so that an operator forgets a consumer and prunes its rows there.

## Decision

- **The hold file is taken by `BEGIN EXCLUSIVE`, then `COMMIT`, with no statement between.** In the exclusive
  locking mode, the exclusive lock that the transaction takes is kept until the hold file is detached or the
  connection closes, as the row's write kept it under 0267. A second runtime's `BEGIN EXCLUSIVE` on the hold file
  fails, and its launch dies with `the database is held by another runtime`.
- **The first hold of a database writes the hold file once.** SQLite writes the first page of a new file, and a
  journal of a few hundred bytes beside it. A later hold writes no file of the hold's, so that a launch on a full
  volume takes the hold of a database that a runtime held before.
- **The hold file keeps SQLite's default journal**, so that the first page is written whole or not at all if the
  process dies while it writes. A hold file in the WAL mode took no exclusive lock after a holder was killed: a third
  process took the hold beside the second, in a script run by hand on Bun 1.4.4.

## What it rests on

- That a holder's `BEGIN EXCLUSIVE` refuses a second holder, that a holder killed gives the hold back, and that a
  hold taken again changes neither the size nor the time of a file of the hold's: **seen** in the spike
  [`spikes/sqlite-hold-file.test.ts`](../../spikes/sqlite-hold-file.test.ts), at `@effect/sql-sqlite-bun` 4.1.3 on
  Bun 1.4.4. It passed on Windows on the maintainer's machine. It fails on a hold that writes a row, which changes
  the hold file's time. The job of the spikes of the CI runs it on Linux on the push of `main` that takes this note.
- That a second process launches on a full volume, after a first process held its database: **seen** in
  [`spikes/full-volume.test.ts`](../../spikes/full-volume.test.ts), which the job of PostgreSQL of the CI runs on a
  volume of 32 MB, on the push of `main` that takes this note. It failed under 0267's write, on the push of
  `fcd7ce4`.
- That a runtime refuses a second runtime on another client of its file, and that a launch refused gives back what
  it held: **tested** by the tests of `a database held by one runtime` in
  [`src/runtime.test.ts`](../../src/runtime.test.ts), whose other holder begins an exclusive transaction as the
  runtime does.
- That `SqlClient.BeginTransaction` replaces the statement that begins a transaction: **documented** in the JSDoc of
  `BeginTransaction`, in `node_modules/effect/src/sql/SqlClient.ts`. The runtime's `transaction` gives it on SQLite.

## Premises of 0267

Each premise of decision 0267 still holds, with the spike and the tests that read it changed to the transaction
that writes no row. The spike's reader opened `readonly`, the test of `check` and the test of two databases in memory
read nothing of the hold's write.

## Alternatives

- **A hold file in the WAL mode, taken by a reading.** A reading takes no write of a page. After a holder was killed,
  a new holder opened the WAL's shared memory, and a third process took the hold beside it.
- **The journal of the hold file kept in memory.** A later hold writes nothing either way. A first page torn by a
  crash would leave a hold file that SQLite cannot open, and every launch would die on it.

## Consequences

- [`src/storage/tables.ts`](../../src/storage/tables.ts) takes the hold by `BEGIN EXCLUSIVE` and `COMMIT` on the
  attached hold file.
- A database of SQLite has, beside its file, the hold file and the hold file's journal once a runtime has launched on
  it.
