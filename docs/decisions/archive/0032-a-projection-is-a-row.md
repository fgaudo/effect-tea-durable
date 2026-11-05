# 0032. A projection is a row, and a program declares the indexes a query uses

**Status:** accepted, 2026-10-30. Its consequence that lets `reindex` write a row back over a step is replaced by
[decision 0070](0070-reindex-writes-a-row-only-over-its-state.md). Its query giving the projections decoded, and
its index converting a time to its milliseconds, are changed by [decision 0139](../0139-the-projection-is-json.md):
the projection is JSON, and `project` converts.

## Context

"Orders unpaid for a day" cannot be asked of stored states, which are read one id at a time: the first step of
the [roadmap](../../roadmap.md) is a query across the entities of a program, and how its tables are declared and
migrated was an [open question](../../open-questions.md).

The pieces to build it on are already there. `project(state)` is the entity's public contract, it has a schema
that encodes to JSON ([decision 0025](0025-operations-and-projections-have-schemas.md),
[decision 0030](0030-a-schema-encodes-to-json.md)), and the machine already computes it at every step and
suspends the entity when it dies ([decision 0014](0014-rules-the-machine-settled.md)). Nothing of a read model
had to be invented; what was missing was where it is written and what a query may filter by.

## Decision

- The runtime keeps one row per entity, in the step's transaction, holding the **encoded projection**. Nothing
  else is stored for reading: a query across entities answers with the same values a caller reads of a single
  entity, and the two cannot drift.
- A program declares `indexes`: for each name, a **pure function from the projection to a scalar** — a string, a
  number, a boolean or `null`. They are the columns a query filters and orders by. A time is a number of
  milliseconds, as `Schema.DateTimeUtcFromMillis` holds one in the stored work
  ([decision 0030](0030-a-schema-encodes-to-json.md)).
- `Types` gains an `index` slot, the names of those columns, as `operation` carries the tags its runners are
  indexed by ([decision 0018](0018-operations-are-data.md)). A query names an index the program declared, and
  nothing else: the type says so, and the runtime dies on a name it was not deployed with.
- The machine calls the indexes wherever it calls `project` — a step's next state, a creation's first state, an
  activation's stored state. One that dies suspends the entity, with the same cause as a `project` that dies.
  So a runtime may call them while it writes, knowing no defect escapes its transaction.
- A query is `where` (criteria that all hold), `order` and `limit`, and gives the ids found with their
  projections, decoded.
- An index whose function changed, or one a new version of the program adds, is rebuilt from what is stored:
  `reindex` walks the entities of the program and writes their rows again. The input of the rebuild is the
  stored state, and nothing has to be activated for it.

## Alternatives

- **Tables declared by the program**, each with typed columns and a pure function from the state to rows, so
  that one entity writes many of them. It buys queries over a collection inside a state, and costs a second
  read contract beside the projection — with its own evolution, and the drift between the two — and a migration
  that is generated DDL replayed over every stored state. When a query wants to index a collection inside a
  state, that collection usually wants to be entities of its own: the entity is the unit of storage and of
  concurrency, and [large states](../../open-questions.md#storage-and-reading) already points the same way. It
  stays addable later, in the one place where a program is declared ([roadmap](../../roadmap.md)), if a real case
  asks for it.
- **An index as a path into the projection** (`$.status`). It would need no function, and would force every
  queried value to be a field callers read, in the shape they read it. A function keeps the derivation — a
  deadline that only counts while the order awaits payment — out of the public shape.
- **A table per program**, with a real column per index. Real columns, and DDL to generate, version and
  migrate for each deploy. One table with the projection and the index values as JSON, and an expression index
  per declared index, gives SQLite the same index with no schema of its own.
- **An index over the state instead of the projection.** It would let a query filter by what callers cannot
  read, and would make the read model a second contract, which is what the first alternative was refused for.

## Consequences

- A value a query needs is a value callers read. The order's projection gained the deadline of its payment,
  which a customer has every reason to see.
- A program that asks nothing across its entities declares `index: never` and `indexes: {}`, as one with no
  work returns `noWork`.
- The row is written when the state changed, which is when the projection can have changed: a projection is a
  function of the state alone.
- A query reads what is committed. An entity loaded in this process has its row written in the same transaction
  as its state, so a query never sees a projection the entity has moved past.
- `reindex` reads each state and writes its row, one by one and outside the step's transaction: an entity that
  takes a step in between has its row written back as it was, and writes it again at its next step. An operator
  runs it on a deploy, and nothing of the runtime depends on it.
- How a projection's schema changes under its callers is still open
  ([schemas that change](../../open-questions.md#storage-and-reading)); the row holds the projection in the schema
  of the version that wrote it, and `reindex` is what rewrites it.
- Publishing what happened to other systems would write the same row to an outbox
  ([open questions](../../open-questions.md#storage-and-reading)): this decision keeps the projection as the one
  thing a program shows the outside.
