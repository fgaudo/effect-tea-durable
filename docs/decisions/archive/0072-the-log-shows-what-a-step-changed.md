# 0072. The log shows what a step changed, as the program deployed computes it

**Status:** accepted, 2026-10-31. Corrects a consequence of
[decision 0038](0038-what-happened-is-published-through-an-outbox.md): "the entity's next step publishes the new
projection" holds only for a step that changes it.

## Context

A step publishes when the projection of the state before it differs from the one after, both computed by the
program deployed ([decision 0038](0038-what-happened-is-published-through-an-outbox.md)). A deploy that changes
what `project` gives for a state, with no schema to migrate — a field derived another way — leaves the log's last
row of each entity holding what the version before showed. A step after it whose projection is the same under the
new program publishes nothing, so that row stays the last, though callers read another projection. The design and
decision 0038 said a new `project` reaches the log at each entity's next step, which holds only for a step that
changes what it shows.

## Decision

- **A step publishes when what callers read changed in that step**, as the program deployed computes it before and
  after. It is what the log records: what an entity did, and what callers read once it had. A deploy is not
  something an entity did, and the log does not record what a new `project` gives for a state no step changed.
- **A projection whose schema changes is migrated in the log**, as every row is read through the migrations
  ([decision 0036](0036-a-migration-is-a-function-on-the-json.md)): a consumer reads every row in the deployed
  shape. Only a change of what `project` computes, with no migration of its JSON, leaves rows a consumer reads as
  the version before computed them.
- **A consumer that needs every entity as the new program shows it reads them**, through `query` once `reindex`
  has run, as it would on its first reading.

## Alternatives

- **Comparing a step with what was last published**, stored with the entity. The first step of each entity after
  such a deploy would publish, but an entity that takes no step would keep the old row all the same, and every
  entity would store and load one projection more, to cover a deploy.
- **`reindex` publishing the rows it changes.** A deploy would write a row of the log for every entity of the
  program, each one with no message, which a consumer would have to tell apart from what entities did.

## Consequences

- [`docs/design.md`](../../design.md) says that a new `project` reaches the log at a step that changes what it
  shows. Nothing in [`src/`](../../../src) changes.
- A program whose consumers rely on a derived field changes it with a migration of the projection, where it can:
  the rows already published are then read in the new shape.
