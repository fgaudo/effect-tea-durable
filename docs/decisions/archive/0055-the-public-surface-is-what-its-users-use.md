# 0055. The public surface is what its users use

**Status:** accepted, 2026-10-31. A launch creates the tables, and an operator runs `createTables` only for a role
that may not, since [decision 0191](../0191-a-launch-creates-the-tables.md). The surface is four entries, and
`isTimer` leaves it, since [decision 0193](../0193-the-public-surface-is-four-entries.md).

## Context

[`src/index.ts`](../../../src/index.ts) exported what only the runtime uses: `indexesOf`, which computes the values
the machine checks and the storage writes, `migrationOf`, which composes the migrations a row is read through, and
`storage`, with its `Storage` and `Due` types, which write and read the tables under the runtime. A program that
called `storage` itself would write rows the runtime's machine never saw, outside its transactions.

`program.ts` exports `Work`, the type of what a program's `durable` returns, typed by its keys, and
`machine.ts` exported another `Work<T>`, the record of any key the machine reads before it checks the keys. Two
types of one name, one public and one not, read as one.

## Decision

- **`index.ts` exports what a program, a test and an operator use**, and nothing the runtime alone uses:
  `indexesOf`, `migrationOf`, `storage`, `Storage` and `Due` leave it. `createTables` stays, since an operator
  creates the tables; `versionOf` stays, since an operator reads which version a program writes.
- **The machine's record of work is `Held<T>`**, the work a state holds, by key; `Work` is the program's.
- **What is not exported may change** without a note: the machine, the storage and their helpers are the
  runtime's, and the tests of this repository import them from their modules.

## Alternatives

- **Exporting everything, under a namespace for the internals.** A user cannot tell a namespace they may rely on
  from one they may not, and the library would answer for both.
- **A second entry point for the runtime's internals.** Nothing outside the runtime needs them yet; one can be
  added when a second runtime does.

## Consequences

- A runtime on another store, which needs the machine and the encodings, imports them from the modules, as the
  tests do, until the library is published and says otherwise ([roadmap](../../roadmap.md)).
