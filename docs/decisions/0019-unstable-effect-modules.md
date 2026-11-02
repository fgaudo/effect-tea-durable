# 0019. The library depends on Effect's unstable modules

**Status:** accepted, 2026-10-30. Its pinned version is moved by [decision 0083](0083-effect-moves-to-4-1-1.md) and
[decision 0116](0116-effect-moves-to-4-1-2.md), and
whether a published library may depend on them is decided by
[decision 0099](0099-a-library-on-unstable-modules-is-released-as-experimental.md).

## Context

The runtime on SQLite needs `SqlClient`, and a later one needs Cluster
([decision 0007](0007-one-process-first.md)). Both are `@stability unstable` in Effect 4.1, as Workflow is: their
API may change in a minor release.

## Decision

The library uses them. It is an experiment, and the design is what it tests: an API that changes under it costs
an update of the runtime, never of the pure core or of a program.

## Alternatives

- **Waiting for them to become stable.** The runtime, and every test of the crash table, would wait on Effect's
  schedule.
- **A storage layer of its own** over a SQLite driver. It would rewrite what `SqlClient` gives, and still need
  Cluster later.

## Consequences

- An Effect release may break the runtime. Once the runtime uses these modules, Effect is pinned to an exact
  version, and moved on purpose.
- Whether a published library may depend on unstable modules is asked again when it gets a name
  ([roadmap](../roadmap.md)).
