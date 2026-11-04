# 0122. `reindex` leaves a row it cannot compute, and names its entity

**Status:** accepted, 2026-11-04. Decides the open question on reindexing with a program that dies on the state.
Changes the consequence of [decision 0121](0121-a-read-answers-from-the-row-of-the-read-model.md) that `reindex`
dies on the first such state, and the rule of
[decision 0043](archive/0043-a-row-no-version-reads-fails-what-reads-it.md) for `reindex`: a row no version reads no
longer fails it.

## Context

`reindex` writes the row of every entity of the program again, from its stored state, each row its own write
([decision 0070](archive/0070-reindex-writes-a-row-only-over-its-state.md)). To compute a row it reads the state
through its migrations and schema, and calls `project` and the indexes on it. Since
[decision 0121](0121-a-read-answers-from-the-row-of-the-read-model.md), it is the one place that calls `project`
outside the machine.

Any of these could die on one entity's state: a state written by a version the program does not have
([decision 0043](archive/0043-a-row-no-version-reads-fails-what-reads-it.md)), a migration or a schema that dies
on it, or a new `project` or index that dies on it. The whole `reindex` then died at that entity. The rows of the
entities before it were written, and those after it were not. The operator got one defect, and could not tell
which entities were left. Running `reindex` again died at the same entity, so no row after it could ever be
written by this program.

## Decision

- **`reindex` passes over an entity whose row it cannot compute**, and leaves that entity's row as it was. It
  computes the row of every other entity, and writes it as before.
- It gives a `Reindexed`: `written`, how many rows it wrote, and `failed`, each entity it passed over with the
  cause, rendered as a suspension's cause is. A defect of the program is rendered by what the program threw.
- What it passes over is only what the program computes of the row: the state's reading at the program's version,
  its migrations and schema, and the program's defect in `project`, the indexes or the projection's encoding.
  What the runtime throws fails the whole call, as before
  ([decision 0061](archive/0061-only-what-the-program-does-is-its-defect.md)): a statement that fails, a stored text
  that is no JSON, which only a corrupted row holds, and anything else thrown that is not the program's defect.
- `reindex` suspends nothing, and what becomes of the entity is what becomes of it without `reindex`. Where
  `project`, an index or the encoding dies, the entity suspends at its activation or its next step, as on any
  defect of the program. Where its state cannot be read at the program's version, the call that loads it fails,
  and nothing suspends it ([decision 0043](archive/0043-a-row-no-version-reads-fails-what-reads-it.md)).

## What it rests on

- That everything the program computes of a row is a synchronous call, so that a `try` around it catches what
  dies: **read in the code**, the readings `migrationOf` gives and `json(...).decode` in
  [`src/storage.ts`](../../src/storage.ts), and `shownOf` in [`src/machine.ts`](../../src/machine.ts). The text is
  parsed before the `try`, and `shownOf` throws the program's defect as a `Defect`, which `programCause` tells
  apart from the rest.
- That `reindex` passes over an entity whose `project` dies, names it with the cause, and writes the rest:
  **tested**, `reindex leaves the row of an entity whose state the new project dies on, names it, and writes the
  rest`, in [`src/runtime.test.ts`](../../src/runtime.test.ts). It fails without this note.
- That it does the same for a state no version reads: **tested**, `a row no version reads fails the call that
  meets it, and the process serves the rest`, which fails without this note.
- That it does the same for a migration and for the state's schema that die, and fails on a text that is no JSON:
  **tested**, `reindex passes over a state a migration or the schema dies on, and fails on a text that is no JSON`,
  in [`src/storage.test.ts`](../../src/storage.test.ts). An index or the projection's encoding that dies is only
  **read in the code**: `shownOf` computes both as it computes `project`, each in its own `byProgram`.

## Alternatives

- **Dying at the first entity, as before.** No row after it can be written by the program, and the operator does
  not learn which entities are left.
- **Suspending the entity.** A suspension is the machine's, stored by an event under the entity's lock. `reindex`
  takes no lock, and an entity whose row it cannot compute suspends at its next event all the same.
- **Giving only how many were passed over.** The operator would have to find them, and each needs a fix of the
  program or of its migrations.

## Consequences

- `Handle.reindex` gives a `Reindexed` instead of a count. A deployment that runs `reindex` after a deploy reads
  `failed`. An entity whose state cannot be read is listed there and never in `suspended`, so `failed` is where an
  operator finds it before a caller does.
- An entity in `failed` keeps the row of the version before, which `read` and `query` give, through the
  projection's migrations, until a step or another `reindex` writes it.
- `failed` holds one item per entity passed over, with no limit: a program that dies on every state lists every
  entity of it.
