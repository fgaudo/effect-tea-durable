# 0255. A data directory of PGlite is held while the client a runtime launched on is open

**Status:** accepted, 2026-11-11, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the fix of bug 86, of no family. It changes
[decision 0157](archive/0157-the-storage-speaks-sqlite-and-postgresql.md), which holds a database of PGlite by its
client alone, in the process.

## Context

A database is held by one runtime ([decision 0080](archive/0080-a-database-is-held-by-one-runtime.md)). PGlite runs
every statement on one session, which would take an advisory lock again, so decision 0157 holds a database of PGlite by
its client alone, in the process. That rests on one client per data directory, a premise no note wrote.

A second `PGlite` over the same data directory opens with no error. Each instance holds the database in its own
memory, and the last to close writes its copy over the other's, as the spike
[`spikes/pglite-two-clients-one-directory.test.ts`](../../spikes/pglite-two-clients-one-directory.test.ts) sees. So a second runtime
on another client launches, and the steps of one runtime are lost with nothing said. This is bug 86 of the premise
review.

PGlite is how the tests run PostgreSQL, as the README says. A lock of the directory across processes would need a lock
file, which a crash leaves behind, or a lock of the system, which Node gives no portable way to take. Neither is worth
its mechanism for a backend the tests use.

## Decision

- **A runtime on a client of PGlite also holds the client's data directory, in the process.** The register lies beside
  the register of clients in `hold` of `src/storage/tables.ts`, and keeps each directory with the instance of PGlite a
  runtime launched on.
- **A launch on another client over a directory is refused while the client before it is open.** The refusal is the
  same defect as a second runtime's: the database is held by another runtime, or open to another connection. A file of
  SQLite is refused in the same way while another connection has it open.
- **The directory stays held once the runtime ends, until its client is closed.** A runtime launches again on the same
  client, and a client closed gives the directory to the next. PGlite's `closed` says whether the client is closed.
- **The directory is one name for every spelling of its path.** A path is resolved first. A name with a scheme, as
  `idb://`, is kept as it is, and a database in memory, with no directory or under `memory://`, is held by its client
  alone.
- **The decision leaves out a directory named otherwise than by its spellings.** A symbolic link, or another case of a
  path on a file system that ignores case, gives the same directory a name the register does not know. Two copies of
  the library loaded in one process keep two registers, as they keep two registers of clients. The
  [open question](../open-questions.md#running) A second runtime on one database holds both cases.
- **A data directory of PGlite opened by another process is the launcher's defect.** The runtime does not see it. The
  [open question](../open-questions.md#running) A second runtime on one database keeps it as a rule no test holds.
- **A client opened over a held directory, which launches no runtime, is the launcher's defect too.** Its close
  writes its copy over the runtime's, as the spike sees, and the runtime does not see the client.

## What it rests on

- That a second client over the directory is refused while the first is open, after its runtime ended too, that the
  first launches again, and that a client opened once both are closed launches and reads what the first wrote:
  **tested** by `a runtime on a data directory of PGlite launches on no other client while one it launched on is open`,
  in `src/runtime.test.ts`. It runs under `slow`, since it opens three instances of PGlite. It fails against the code
  before the change, and against a register that does not resolve the path.
- That a second instance of PGlite over the directory opens with no error, steps a copy of its own, and loses a write
  of the first once it closes last: **seen** in the spike
  [`spikes/pglite-two-clients-one-directory.test.ts`](../../spikes/pglite-two-clients-one-directory.test.ts), at
  PGlite 0.5.15.
- That an instance of PGlite names its directory in `dataDir`: **read in the source** of PGlite 0.5.15, in its types,
  where the field is public and has no doc comment, and **tested** by the test above, whose refusal reads it. A client
  without it is held by the client alone, as before, so a release that drops the field loses the guard and no data.
- That `closed` says whether the instance is closed: **documented** in the types of PGlite 0.5.15, as "The closed state
  of the database".
