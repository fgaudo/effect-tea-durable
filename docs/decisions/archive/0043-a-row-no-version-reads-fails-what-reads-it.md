# 0043. A row no version reads fails what reads it, not the process

**Status:** accepted, 2026-10-31. Replaces the bullet of
[decision 0036](0036-a-migration-is-a-function-on-the-json.md) that says the runtime dies on such a row. Its
consequence that the waker dies on such an entity is changed by
[decision 0077](0077-the-waker-tries-an-entity-it-cannot-load-again.md): the waker goes on, and tries it again.
For `reindex`, changed by [decision 0122](../0122-reindex-leaves-a-row-it-cannot-compute-and-names-its-entity.md):
`reindex` passes over such an entity, names it, and writes the rest.

## Context

[Decision 0036](0036-a-migration-is-a-function-on-the-json.md) says that a row written by a version the program
does not have is not read, and that the process dies on it: a process that cannot read what is stored must not
serve it. The runtime never did that. A row is read where it is needed — an entity when it is loaded, the read
model by a query, the outbox by a consumer — and what fails to read it is that call alone. Only a deploy died,
and only when it activated an entity holding an operation that version wrote.

Making the process die would mean checking the whole store at each deploy, or tearing the runtime's scope down
from whichever call met the row first, which every caller of every program then sees as the process going away.

## Decision

- **A row written by a version the program does not have is still never read, and the call that meets it fails
  with a defect** that names the program, its version and the version of the row. The process goes on serving
  every entity it can read.
- A deploy is such a call: it dies when an entity it activates holds such a row, as any caller of an activation
  that cannot finish gets the defect ([decision 0042](0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md)).
  Nothing else of the store is read at a deploy.

## Alternatives

- **Dying the process at the first such row.** It is what decision 0036 said. A rollback would then stop every
  entity of every program for the ones the newer version touched, where a failed call stops only those, and says
  why to whoever asked. One entity's failure stopping the others is what a suspension, and decision 0042, avoid.
- **Checking the store at a deploy**, refusing a program older than any row. The deploy would read every row of
  the program, and a store as large as it is; the version of each row is what the read already checks.

## Consequences

- A rollback is not refused: it serves the entities the newer version never wrote, and fails, loudly and every
  time, on the ones it did. Deploying the newer version again, or one that reads it, is how they come back.
- The waker dies with an activation that fails, which a stored timer of such an entity is
  ([open questions](../../open-questions.md#running)).
- Two versions at once stays open ([open questions](../../open-questions.md#running)).
