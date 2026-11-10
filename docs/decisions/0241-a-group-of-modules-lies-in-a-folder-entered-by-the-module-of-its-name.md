# 0241. A group of modules lies in a folder, entered by the module of its name

**Status:** proposed, 2026-11-10, for the step Modules and test files a reviewer reads whole of
[`docs/roadmap.md`](../roadmap.md).

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
  whole, stays beside the entry: `src/storage.test.ts` and `src/runtime.test.ts`. How the tests of the runtime divide
  among the modules is the step's last part, and this note says it once that part is done.
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

## Alternatives

- **No folders.** The boundary stays a sentence of `AGENTS.md` that no test checks, and the modules divided out of
  `storage.ts` stand among the rest by name alone.
- **A folder holding its entry, as `src/runtime/index.ts` or `src/runtime/runtime.ts`.** Every link and mention of
  `src/runtime.ts` and `src/storage.ts` breaks, about a thousand, most of them in notes, which are rewritten only
  for a broken link. The entries would gain nothing a reader sees, since a folder beside its entry shows the same
  boundary.
- **A folder for every module, with its test.** A module of one file gains a folder and no boundary.
