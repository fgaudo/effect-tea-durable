# 0067. Each entity is held by its own lock

**Status:** accepted, 2026-10-31. Decides the open question of one permit for the process, and replaces the
permit of [decision 0029](0029-an-idle-entity-is-unloaded.md) and
[decision 0042](0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md) with a lock of the entity's own. Which
fiber holds an entity's lock while it is activated or created is changed by
[decision 0079](0079-what-a-caller-sets-going-is-finished-without-it.md).

## Context

The runtime held its entities under one permit for the process
([decision 0029](0029-an-idle-entity-is-unloaded.md)): a caller found an entity and offered its event under it, a
passivation and a crash took it so that no caller was between the two, and a load or a creation took it so that
two callers never built two machines for one entity. Every `send` and `create` took it, to an entity loaded or
not, and an activation held it while it read the database and wrote its `Restart`. The messages of every entity
of every program waited on one another there: one slow activation held them all.

What the permit kept apart was always one entity's: its finding and its unloading, its loading and another
loading of it, its crash and its callers. Nothing under it waited for a second entity, since the permit was not
reentrant and such a wait would have held for ever; an entity's operations, which do reach others, are forked.
So a lock per entity can hold for ever only where the one permit already did.

## Decision

- **Each entity has a lock of its own**, by program and id, and what took the permit takes the entity's lock
  instead: finding it and offering its event, loading and activating it, creating it, unloading it, crashing it.
  The rules of decisions 0029 and 0042 hold as they were written, of one entity: a caller that has found it has
  offered its event before it can be unloaded or crashed, and one machine at most is built for it.
- **Callers of different entities never wait on one another.** A caller of an entity being activated waits for
  that activation, and is then answered by the machine it built.
- **A lock exists while someone holds or waits for it.** It is made by its first taker and dropped by its last,
  so the process keeps no lock for an entity nobody is reaching.

## Alternatives

- **A lease per entity, and the permit only to load**, as the open question put it: the callers between finding
  the entity and offering their event are counted, an unload waits for the count to be zero, and the permit is
  taken to load. Offering an event is synchronous, so holding a lock for it costs what a lease would, and an
  activation under the one permit would still hold every other load. Two mechanisms, and the one cost left.
- **A permit per program.** One slow activation would still hold every entity of its program.

## Consequences

- [`src/runtime.ts`](../../../src/runtime.ts) has no registry: `holding` runs an effect under an entity's lock.
- [`src/runtime.test.ts`](../../../src/runtime.test.ts) holds an activation once its `Restart` is applied, and reaches
  another entity meanwhile; a second caller of the entity held waits for the same activation, and one `Restart` is applied.
- Activations of different entities may now read and write the database at once, as their steps already did.
  On SQLite they meet at the client's one connection, one statement or transaction at a time, which is where
  they belong.
