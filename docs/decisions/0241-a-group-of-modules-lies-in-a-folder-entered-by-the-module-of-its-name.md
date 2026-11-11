# 0241. A group of modules lies in a folder, entered by the module of its name

**Status:** accepted, 2026-11-10, with the step Modules and test files a reviewer reads whole, which it was made for. [Decision 0254](0254-a-check-of-the-project-runs-against-the-case-it-refuses.md) makes its check refuse a file only tests import whose name `bun test` runs.

## Context

Every module of `src/` lies in one folder, about twenty modules beside their tests. Two groups of them have one
entry. The runtime is seven modules, `runtime.ts`, `process.ts`, `loop.ts`, `callers.ts`, `doors.ts`, `waker.ts`
and `readings.ts`, which import each other. A module outside the runtime imports `runtime.ts` alone. Only
`AGENTS.md` states that boundary, and nothing checks it. The storage is one module, `storage.ts`, of 2 669 lines,
which the step divides by what it stores. The modules divided out of it form a second group of the same kind:
`cluster.ts`, `index.ts` and the tests import the storage through `storage.ts`.

A move of a file breaks every link to it. The `.md` files hold about 480 mentions of `src/storage.ts` and 530 of
`src/runtime.ts`, most of them in notes that are never rewritten, where only a broken link is fixed. The other five
modules of the runtime are mentioned 27 times in all.

## Decision

- **A group of modules lies in a folder of `src/` named as the group, and is entered by the module of the same name
  beside the folder.** The runtime's modules other than `runtime.ts` move into `src/runtime/`: `process.ts`,
  `loop.ts`, `callers.ts`, `doors.ts`, `waker.ts` and `readings.ts`. The modules divided out of `storage.ts` lie in
  `src/storage/`. `src/runtime.ts` and `src/storage.ts` stay where they are, as the entries. So every link and
  mention of the two entries holds, and only the 27 mentions of the five modules that move change.
- **A module outside a group imports the group through its entry alone.** A module of `src/runtime/` is imported by
  `src/runtime.ts` and by the files of `src/runtime/`, and by no other file. The same holds of `src/storage/`. A
  test of the form of `src/`, in [`src/form.test.ts`](../../src/form.test.ts), reads the imports of every file of
  `src/` and fails on one that crosses the boundary. The entry re-exports what the modules outside use.
- **A module of a group imports a module outside the group by its path, and never through the entry of its own
  group.** A module of `src/runtime/` imports `../storage.ts`, `../machine.ts` and `../program.ts`, and imports
  `../runtime.ts` only for the types the entry declares, as `process.ts` does today.
- **The modules of `src/storage/` are divided by what they store.** Each module holds the statements of its tables,
  and the part of `Storage<T>` that reads and writes them:
  - `tables.ts`: the dialect, the transaction, the hold of a database, the partitions, the migrations that make
    every table, and the rename of a program, which moves its rows in every table.
  - `rows.ts`: the schemas of the rows as the runtime writes them, and the codecs of the JSON they hold. It imports
    no other module of the storage, so that `tables.ts` reads a row through it and no import goes round in a cycle.
  - `held.ts`: what the storage of one program holds once its schemas are read, which the other modules share, as
    `src/runtime/process.ts` is shared by the runtime's: the program, its client, its codecs, the readings of an
    older version, the upsert and the snapshot.
  - `entities.ts`: the entities, their keys, the mailbox and the replies. A step's `write` lies here, since a step
    writes an entity's row first. It writes the row of the read model through `projections.ts` and deletes
    Cluster's rows through `cluster.ts`.
  - `projections.ts`: the read model and its queries, counts, sums and the reindex.
  - `log.ts`: the publications, the log, the heads, the consumers and their cursors.
  - `cluster.ts`: the tables of Cluster, the versions, the runners' versions, the waiters and the request ids kept.
  Each of the last four gives a part of `Storage<T>`, a function of a `Held<T>`. `src/storage.ts` keeps the
  interface `Storage<T>`, makes it of the four parts, and re-exports what the modules outside import. The code of
  each function moved as it was, with the names it reads taken from the `Held<T>` it is given.
- **A test of a module of a group lies beside it, in the group's folder.** A test of the entry, or of the group as a
  whole, stays beside the entry: `src/storage.test.ts` and `src/runtime.test.ts`. The tests of the runtime divide by
  the `describe` they lie under, or by the test where it lies under none:
  - `runtime/callers.test.ts`: `two entities that talk`, the sender a resumption wakes, and the callers of an unloaded
    entity, who build one machine.
  - `runtime/loop.test.ts`: `passivation`, `the crash table`, `random sequences of events`, the spans and metrics of
    a step, and the three tests of an entity's wait and of its crash under prioritized schedules.
  - `runtime/waker.test.ts`: `a timer and the wall clock`, and the waker that rests from a reading.
  - `runtime/doors.test.ts`: the runtime on Cluster, with a Cluster the test plays.
  - `runtime/readings.test.ts`: a consumer on Cluster, woken by another runner's commit.
  - `runtime.test.ts`: the rest, which tests what `runtime.ts` does itself, its deploy, its reads, its log and its
    planned stop, or what several modules keep together, as a caller's retry and an entity that cannot finish.
  A test that moves keeps its name and the name of its `describe`, so that the seeds pinned under it and a `-t` that
  names it still hold.
- **A file that only tests import is named `<module>.test_<role>.ts`, beside the module whose tests it serves.**
  `bun test` runs no such file, since its name does not end in `.test.ts`. One pattern, `.test.ts` or
  `.test_<role>.ts`, then names every file of the tests, and the checks of the form tell them from the library's
  modules by it:
  - The rules of forks and of counts, and the rule that the library reads the time through Effect alone, are the
    library's, and read no file of the tests.
  - A module of the library imports no file of the tests. A test of the form checks it, so the name is a promise
    and not a habit.
  - The boundary of a group holds for a file of the tests as for a module: `runtime.test_shared.ts` imports
    `./runtime.ts`, and no file of `src/runtime/`.
  No test file imports a `.test.ts` file.
- **What the tests of the runtime share lies in `src/runtime.test_shared.ts`, beside the entry.** It holds the toy
  program, the process a test launches with its probe, the database of one test and `explored`. It lies outside
  `src/runtime/`, since the boundary of the group keeps `src/runtime.test.ts` from importing a file of that folder.
  The databases of each dialect, which the tests of the storage and of the runtime share, lie in
  `src/storage.test_databases.ts`, named `src/test-databases.ts` before this note.
- **`bun run test:explore` and `bun run test:postgres` run `src/runtime.test.ts` and the folder `src/runtime/`.** A
  test that moves into the folder is run by both with no change to either.
- **The area a commit's subject names is a module's path under `src/` without its extension.** A module in a folder
  is named with its folder, as `runtime/loop`. A commit across several modules of a group names the group, as
  `runtime`. `AGENTS.md` states it, in the commit that moves the first module into a folder.
- **A check that reads the modules of `src/` reads every folder of it.** The checks of the form of `src/` and the
  test that the library reads the time through Effect alone list the modules of the top folder today. Each lists
  every module under `src/`, so that a module that moves into a folder is still read.

## What it rests on

- That the file `runtime.ts` and the folder `runtime/` may stand side by side. **Reasoned**: every specifier of
  `src/` names a file with its extension, as `./runtime.ts`, and a module of the folder is named
  `./runtime/loop.ts`, so no specifier could name both. **Tested** by `bun run typecheck` and `bun test` once the
  modules move.
- That the modules outside the runtime import `runtime.ts` alone. **Read** in the imports of `src/` on 2026-11-10:
  `cluster.ts` and the tests import `./runtime.ts`, and only the runtime's own modules import `process.ts`,
  `loop.ts`, `callers.ts`, `doors.ts`, `waker.ts` and `readings.ts`.
- That the checks of the form read every module that may fork. **Tested** once the check lists every folder: the
  check fails when it reads no module of `src/runtime/`.
- That a test moved to another file runs the schedules it ran before, so that its pinned seeds still reach what they
  were pinned for. **Reasoned**: a seed draws its schedule from the yields of the code it runs, and a move changes
  which file holds a test and its helpers, and none of the code they run. **Seen** on 2026-11-10: the tests of the
  runtime gave 183 passes and 10 625 checks before the division and after it, and `bun run test:release` passed after
  it.
- That `bun test` runs no file named `<module>.test_<role>.ts`. **Seen** on 2026-11-10 at Bun 1.4.2: in a folder of
  `a.test.ts`, `a.test_x.ts` and `a.test-x.ts`, each holding a test, `bun test` ran the first alone. A Bun that ran
  them would run a file of no tests, and fail none.
- That `bun test` given a folder runs every test file under it. **Seen** on 2026-11-10 at Bun 1.4.2: `bun test
  src/runtime.test.ts src/runtime/` ran six files.

## Alternatives

- **No folders.** The boundary stays a sentence of `AGENTS.md` that no test checks, and the modules divided out of
  `storage.ts` stand among the rest by name alone.
- **A folder holding its entry, as `src/runtime/index.ts` or `src/runtime/runtime.ts`.** Every link and mention of
  `src/runtime.ts` and `src/storage.ts` breaks, about a thousand, most of them in notes, which are rewritten only
  for a broken link. The entries would gain nothing a reader sees, since a folder beside its entry shows the same
  boundary.
- **A folder for every module, with its test.** A module of one file gains a folder and no boundary.
- **A file of the tests named as any module, as `test-databases.ts` was.** Nothing tells it from a module of the
  library but its words: the checks of the form hold it to the library's rules, and nothing keeps the library from
  importing it.
- **A folder of the files of the tests, as `src/fixtures/` is for programs.** A file stands apart from the module it
  serves, and a folder named `testing/` would stand beside `src/testing.ts`, an entry of the package, as a group.
