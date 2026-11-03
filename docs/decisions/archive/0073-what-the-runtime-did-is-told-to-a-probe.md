# 0073. What the runtime did is told to a probe, out of its options

**Status:** accepted, 2026-10-31. Replaces the hooks `at`, `observe` and `unloaded` of the runtime's options
([decisions 0028](0028-rules-the-runtime-settled.md) and [0029](0029-an-idle-entity-is-unloaded.md)).

## Context

`Options` held three hooks beside `retry` and `passivate`: `at`, called at each point of the crash table,
`observe`, called with every event applied, and `unloaded`, called with every entity unloaded. What an operator
sets and what a test dies at were one record, and three hooks did one thing: say what the runtime did. `at` and
`observe` took a `Machine.Event`, so the public surface named a type of the machine, which
[decision 0055](0055-the-public-surface-is-what-its-users-use.md) keeps out of it and lets change without a note;
and every call in the runtime cast its event to `Event<never>`.

## Decision

- **One probe, `Probe`, is told what the runtime did**, and waited for before the runtime goes on: a `Said` value,
  a point of the crash table `Reached` with its event, an event `Applied`, or an entity `Unloaded`. A probe that
  never returns, or dies, at a point is a crash there, as a hook was.
- **It is a reference in the context, with a default that does nothing**, as Effect's tracer is. `launch` reads
  it once; a test provides another around it. The runtime casts an event to `Event<never>` in one place, where it
  tells the probe.
- **It is no option, and `index.ts` exports neither it nor `Point`.** The tests of this repository and of the
  examples import it from [`src/runtime.ts`](../../../src/runtime.ts). `Options` keeps what an operator sets:
  `retry` and `passivate`.

## Alternatives

- **The three hooks out of `Options` and into a record of their own**, given to `launch` beside it. The seam would
  still be part of what a user calls, and three functions where one says it all.
- **Effect's tracer itself**, a span per event. A span cannot hold the process at a point, which is what a crash
  test needs, and its attributes would carry the event untyped.

## Consequences

- [`src/runtime.ts`](../../../src/runtime.ts) exports `Probe` and `Said`; [`src/index.ts`](../../../src/index.ts) no
  longer exports `Point`.
- The tests' `process` keeps the three hooks it is given, and turns them into a probe: no test changed what it
  says. [`examples/booking/runtime.test.ts`](../../../examples/booking/runtime.test.ts) provides the probe itself.
- An operator who wants to see what the runtime did has no hook: logs, metrics and traces are a question of their
  own, which Effect's tracer may answer.
