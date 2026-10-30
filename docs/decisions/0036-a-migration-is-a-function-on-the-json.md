# 0036. A program carries its migrations, and a migration is a function on the JSON

**Status:** accepted, 2026-10-30.

## Context

States, flags, messages waiting in the mailbox, the work under way and the reasons of replies are stored in the
schema of the version that wrote them, and a projection's row is a contract with callers
([decision 0032](0032-a-projection-is-a-row.md)). Nothing said how a schema changes, and three decisions left it
open with [schemas that change](../open-questions.md#storage-and-reading):
[decision 0020](0020-a-new-program-is-checked-against-the-stored-work.md) and
[decision 0025](0025-operations-and-projections-have-schemas.md) for a stored operation, which is read and then
compared by value with the new program's, and [decision 0032](0032-a-projection-is-a-row.md) for the row a query
reads.

Until now a deploy that changed any of those schemas read what was stored with the new schema, and what the
schema could not decode killed the entity's activation. An operation under way was the worst case: a program
whose operation decodes to another value suspends every entity running one, and only a program that keeps the
old value gets them out.

What makes a migration cheap here is that the state is stored, not the messages
([decision 0002](0002-store-the-state-not-the-messages.md)), and that every schema encodes to what JSON holds
([decision 0030](0030-a-schema-encodes-to-json.md)): there is one value of each kind to read, and its stored
form is JSON.

## Decision

- A program declares `migrations`, in order: the first is how version 1 is read by version 2. **The program's
  version is `migrations.length + 1`** — a migration is the bump, and there is none to declare or to forget.
- A migration is a record of pure functions **from the JSON a version wrote to the JSON the next one reads**, by
  kind of stored value: `state`, `operation`, `inbound`, `internal`, `rejection`, `sender` and `projection`. A
  kind left out is unchanged. It works on the JSON, not on decoded values, so the types and schemas of the
  version before do not live on in the code.
- **Every row the runtime writes carries the version that wrote it**, and is read by migrating its JSON from
  that version to the program's and decoding it with the program's schema. The machine sees values of the
  program's own version only: the migrations are the runtime's, as the schemas are
  ([decision 0013](0013-the-runtime-is-a-pure-machine.md)), and the wrappers around a program's values — a
  timer's, an origin's, a reply's null — are the runtime's own and do not change.
- A row is written at the program's version whenever it is written. A step writes the state, the keys and the
  mailbox whole, so one step after a deploy they are migrated for good; a reply and a projection's row are
  rewritten when they are written again, and are migrated at every read until then. `reindex` writes every row
  of the read model again, and a deploy that changed the projection's schema runs it, as one that changed an
  index does ([decision 0032](0032-a-projection-is-a-row.md)).
- **A row written by a version the program does not have is not read: the runtime dies on it.** It is a
  deployment rolled back, not an entity's bug, and a process that cannot read what is stored must not serve it.
  Two versions at once stays open ([open questions](../open-questions.md#running)).
- A migration that is deployed is never changed, as a decision is never rewritten: it is how a version that
  exists in storage is read.

## Alternatives

- **A version declared beside the migrations.** Two things to keep in step, and forgetting the bump writes new
  values under the old version, which the next deploy then migrates: silent corruption, where deriving it from
  the migrations cannot be wrong.
- **Migrations on decoded values, with the schemas of each version kept.** Every old state, operation and
  projection type would live on in the code for ever, and a chain of three versions would hold three of each.
  The JSON is the stored form, and a function on it needs nothing but itself.
- **Schemas that stay readable, with no migrations at all**: a new version only adds optional fields and keeps
  the old tags. It costs nothing to build and cannot rename a field or move one; and the comparison of
  [decision 0020](0020-a-new-program-is-checked-against-the-stored-work.md) would hold the program to the old
  shape of an operation for as long as any is stored.
- **Migrating everything at the deploy**, over the whole store. The deploy then takes as long as the store is
  large, and the one thing that must be eager — the read model, which a query filters by the index values of the
  version that wrote the row — already has `reindex`.
- **One version per entity, instead of per row.** It holds only while every row of an entity is rewritten
  whenever one is, which would mean rewriting its replies at every step; they are kept for ever.
- **Migrating on write** (the writer upgrades, the reader reads one version). Whatever reads has to know the
  versions before it anyway, which is the whole of this decision, and the writer would read first.

## Consequences

- A deploy may now change the shape of an operation under way: the stored operation, migrated, must be
  `Equal.equals` to what the new `durable` computes from the migrated state, and a migration that does not give
  that suspends the entity at its activation, loudly, exactly as a changed operation does
  ([decision 0020](0020-a-new-program-is-checked-against-the-stored-work.md)). The two migrations, of the state
  and of the operation, are written together.
- A migration is a pure function on JSON, tested as one. `rehearse` never encodes, so `deploy` in a rehearsal
  does not exercise migrations ([decision 0013](0013-the-runtime-is-a-pure-machine.md)); the runtime's tests
  deploy a version whose state, operation and projection schemas changed.
- A program that declares no migration is version 1 and reads nothing older: nothing changes for a program that
  has not changed.
- A rejection's reason is kept as long as its reply, which is for ever, so its migrations are kept as long. How
  long a reply is kept is open ([open questions](../open-questions.md#running)).
- Renaming a program is still not this: it moves the rows stored under one name, and the replies other entities
  stored for them ([decision 0022](0022-a-new-program-keeps-what-work-started-with.md)).
