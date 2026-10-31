# 0080. A database is held by one runtime

**Status:** accepted, 2026-10-31. Makes [decision 0007](0007-one-process-first.md)'s one process a rule the runtime
keeps.

## Context

The runtime runs on one process ([decision 0007](0007-one-process-first.md)), and every rule it keeps assumes that
one machine steps an entity: its lock is a semaphore in memory
([decision 0067](0067-each-entity-is-held-by-its-own-lock.md)), and an entity it holds is never read again from
the database. Nothing kept a second runtime off the same database. Checking
[two versions at once](../open-questions.md#running) found it: two runtimes on one file, each with a client of its
own, both took `Inc` messages for one counter, each from its own copy in memory, and of three messages accepted
the counter stored two. One step was lost under the other's, and nobody was told. Two runtimes on one client lose
steps the same way.

## Decision

- **`launch` holds the database for its runtime until its scope ends**, before anything of it runs, and lets it go
  after everything of it has stopped. A launch on a database another runtime holds dies as the launcher's defect,
  as a second deploy of a name does ([decision 0075](0075-a-name-is-deployed-once-in-a-process.md)).
- **In the process, the client is held**: it is claimed in one synchronous step, so two launches at once cannot
  both pass ([decision 0068](0068-what-another-fiber-reads-changes-in-one-step.md)).
- **Across connections, the file is held by SQLite's exclusive locking mode**, taken by a write. On a database in
  WAL mode, which the client opens by default, that lock is taken only while no other connection has the file open,
  and while it is held no other connection opens it: an operator's shell included. Without WAL, the write lock the
  mode keeps refuses another runtime all the same, and every reader once the runtime has written. The operating
  system gives it back when the process ends, however it ends, and the runtime gives it back when its scope ends.

## Alternatives

- **A row in a table naming the runtime that holds the database**, taken at launch. A process killed leaves it
  behind, so it needs a time after which another may take it, and a heartbeat to keep it; a process paused past that
  time, then resumed, writes beside the one that took over, unless every transaction checks a token. That is what
  Effect Cluster's shard locks are, and where it belongs ([roadmap](../roadmap.md)).
- **Leaving it to the deployer.** It is how steps were lost without a word.
- **Holding the file only while a step writes**, which the client's `BEGIN IMMEDIATE` already does. Each step is
  atomic, but the second runtime steps from a state the first has moved past.

## Consequences

- No other connection reads the database while a runtime holds it. A tool that inspects it runs while the runtime
  is stopped, or through the runtime.
- A launch waits for the client's busy timeout (five seconds by default, which blocks the event loop under
  `bun:sqlite`) before it dies on a database held elsewhere; a client opened while another process holds the file
  fails as it opens.
- A database in memory is one connection's, and the hold on its client is what keeps a second runtime off it.
- [`src/runtime.test.ts`](../../src/runtime.test.ts) launches a runtime on a file and opens it from another client,
  which fails, then launches on that client while the first is open, which dies, and after it is closed, which runs;
  and launches two runtimes on one client, once at once and under every budget of steps: never two run at once.
- Two versions at once needs two processes on one store, which this keeps from happening on one database: it is a
  question of which process holds which entities, and stays open until Effect Cluster says it.
