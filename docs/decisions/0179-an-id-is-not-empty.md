# 0179. An id is not empty, and an empty id is the defect of whoever gave it

**Status:** accepted, 2026-11-08, with the step An empty id is refused of the [roadmap](../roadmap.md). Changes
[decision 0053](archive/0053-what-a-handle-is-given-is-checked.md), whose handle checks what it is given, and
[decision 0157](archive/0157-the-storage-speaks-sqlite-and-postgresql.md), whose id is text a database holds.

## Context

An entity whose id is `''` was created, and its timer stored. The waker never woke it, and `reindex` never wrote
its row. Both page the entities of a program by `id > cursor`, and both start the cursor at `''`
([`src/storage.ts`](../../src/storage.ts), `due` and `reindex`). So once such an entity was unloaded, its deadline
never fired. The check of an id asked only for text a database holds
([decision 0157](archive/0157-the-storage-speaks-sqlite-and-postgresql.md)), and `''` is such text. A program whose
name is empty is refused already ([decision 0054](archive/0054-a-program-is-checked-where-it-enters.md)), and so are
an empty name in a launch's renames and a consumer with no name.

## Decision

- **An id is text a database holds, and not empty.** `idFault` in [`src/program.ts`](../../src/program.ts) says why a
  string is no id, and every place where an id enters asks it.
- **An empty id is the defect of whoever gave it, and nothing is read or stored for it.** A handle's `create`,
  `send`, `read`, `resume` and `discard` die with an `InvariantDefect` whose reason is
  `the id is empty, and an id is not`. An operation's `send` and `create` die with it too, and the operation's
  entity is suspended, as for an id that is no text a database holds.
- **A rehearsal refuses the ids the runtime refuses.** A world's `create`, and an operation's `send` and `create`
  in a world, fail the test with the same defect. The rehearsal checked no id before, of text or of length. A test
  that passes then passes only with ids a deployment runs.
- **The storage is not changed.** It pages from `''` as before, since no entity it holds has that id.

## What it rests on

- That the waker and `reindex` page from `''` with `id > cursor`: **read in the code** of
  [`src/storage.ts`](../../src/storage.ts), in `due` and `reindex`.
- That every id a caller or an operation gives enters by a handle, by `Entities` or by a world: **read in the
  code** of [`src/runtime.ts`](../../src/runtime.ts) (`texted` and the operations' `named`) and of
  [`src/rehearse.ts`](../../src/rehearse.ts). On Cluster, a caller goes through the same handle. The tests
  `an id that is no text a database holds, or is empty, is the caller’s defect, and reaches no entity`,
  `an operation that sends to the id "" dies, and suspends its entity` in
  [`src/runtime.test.ts`](../../src/runtime.test.ts), and `fails a creation and a send under an id that is empty` in
  [`src/rehearse.test.ts`](../../src/rehearse.test.ts) **test** it, and each fails against the code before the change.
- That `String.isEmpty` of Effect is true of `''` only: **documented** in its JSDoc at 4.1.2, a stable API.

## Alternatives

- **The storage pages from no cursor, so that `''` is an id like another.** The first page of `due` and `reindex`
  would read with no bound on the id, as a query's first page does. It fixes the two pages that are known. It leaves
  any later code that starts a cursor at `''` with the same hole, and an empty id is most likely a caller's mistake,
  as an empty name is.
- **An id checked through a schema, `Schema.NonEmptyString` or `Schema.isMinLength(1)`.** A schema gives a
  `SchemaError` with an issue, where every other refusal of a handle dies with an `InvariantDefect` and a reason. A
  predicate says the rule in one line.
- **An id branded in its type, with `Brand.refined` or `Schema.brand`.** The caller would build an `Id` before each
  call, and a call from JavaScript or a cast would still reach the check. It changes the type of every handle and
  every example, which is a point of the API, and not this step's.

## Consequences

- The glossary's *text a database holds* says that an id is such text and not empty. The design says it where it
  lists what every database holds.
- A database written before this change may hold an entity under `''`. No release was made, so none is migrated.
