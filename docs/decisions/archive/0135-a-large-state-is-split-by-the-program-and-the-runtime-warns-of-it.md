# 0135. A large state is split by the program, and the runtime warns of it

**Status:** accepted, 2026-11-05, with the step Children inside an entity of the roadmap. Decided the open question
on large states, which [decision 0028](0028-rules-the-runtime-settled.md) left open when it put aside writing
a difference. Its warning, which counts the projection once in the outbox, is changed by
[decision 0138](0138-the-log-publishes-topics.md): a step writes a row in each topic whose selection changed, and
the warning counts the projection once per row. That count is changed by
[decision 0154](0154-a-steps-projection-is-stored-once-in-the-outbox.md): a step stores its projection once in the
outbox, and the warning counts it once.

## Context

Each step that changes the state writes the whole state
([decision 0002](0002-store-the-state-not-the-messages.md)). When the projection changes too, the step
writes it twice more: in the row of the read model ([decision 0032](0032-a-projection-is-a-row.md)) and in
a row of the outbox ([decision 0038](0038-what-happened-is-published-through-an-outbox.md)). A projection
that shows the whole state triples what a step writes.

The spike `spikes/large-states.test.ts` measured what that costs, on Windows with Bun 1.4.2.

| State | A step, the projection holds the state | A step, the projection holds a count |
| --- | --- | --- |
| 48 KB | 5 ms | 3 ms |
| 0.5 MB | 21 ms | 7 ms |
| 5 MB | 240 ms | 60 to 110 ms |

Most of the time is SQLite's write and the schema's encoding, and the machine's own work is a few percent of it.
Both are synchronous: `bun:sqlite` writes on the thread that calls it. So a step holds every other entity of the
process for as long as it takes. Beside an entity whose state is 5 MB, the step of an entity whose state is a few
bytes took 345 ms at worst, where it takes 2 ms alone. Since
[decision 0134](0134-an-entitys-loop-yields-between-two-steps.md) a busy entity holds the others for one step at a
time, and not more.

[Decision 0133](0133-an-entity-composes-children-as-effect-tea-does.md) keeps the children in the parent's state.
An order with a child for each line grows inside one entity, which is the case that costs the most.

## Decision

- **The runtime refuses no state for its size.** A step past a limit would be a defect, and would suspend an entity
  on a message its program accepts. Where the limit stands depends on the machine and on the load, which the
  library does not know.
- **The runtime warns of a large step.** `launch` takes `warn: { characters }`, 262 144 by default. A step that
  writes more characters than that of the state and of the projection, in the read model and in the outbox, logs a
  warning through Effect's logger. The warning is annotated with the entity's `name` and `id`, the `characters`
  written, and the `threshold`. An entity warns once per activation, so that a large entity does not log at every
  step. The length is that of the JSON text the storage writes, which `write` returns, so nothing is encoded twice.
  At the default, the spike's step takes about 10 ms. A step under the threshold does nothing more than compare two
  numbers, and yields nowhere.
- **The runtime tells the operator through logs, not through the probe.** The probe is for tests, and an operator's
  view of what the runtime did is logs, metrics and traces
  ([decision 0073](0073-what-the-runtime-did-is-told-to-a-probe.md)). This warning is the runtime's first
  log.
- **A row of the outbox keeps the projection whole.** A consumer learns what callers read after that step
  ([decision 0038](0038-what-happened-is-published-through-an-outbox.md)). A row with the message and a
  version would send the consumer to the read model, which may have moved on since. The design advises a projection
  that shows what a caller acts on, not the whole state: a count costs a third of a projection that holds the
  state, at 0.5 MB and up.
- **A state is kept whole, and the program splits it.** A difference would cut the encoding and the write only if
  the state were stored over several rows, and the machine's rules would then live in two places, which decision
  0028 put aside. An item goes into an entity of its own once its parent would hold more than one step should
  write, as decision 0133 says under Where an item goes. The design gives the spike's figures, so that a program
  sees where that starts.

## What it rests on

- That a step's time grows with the length of what it writes, and that the machine's work is a small part of it:
  **seen**, in `spikes/large-states.test.ts`, with a profile of the case of 5 MB.
- That a step holds every other entity of the process for as long as its write and its encoding take: **seen**, in
  the second test of the same spike. That the loop holds them for one step and not more: **tested**, in
  [decision 0134](0134-an-entitys-loop-yields-between-two-steps.md).
- That `Effect.logWarning` reaches the logger the application provides: **documented**, in the JSDoc of
  `logWarning` in `effect/src/Effect.ts`.
- That 262 144 characters is a threshold an operator wants to hear of: **only reasoned**, on the spikes' figures,
  where such a step takes about 10 ms. **Seen**, in `spikes/many-children.test.ts`, for a parent of children by id
  under [decision 0133](0133-an-entity-composes-children-as-effect-tea-does.md): a step took 3.5 ms at 1 000 children
  and 10 ms at 10 000, where it wrote 667 801 characters and warned. A parent's step does work for each child, so a
  parent past the threshold costs about half as much again as a flat state of its size does.
- That a consumer needs the projection of that step, and not the one of now: **documented**, by decision 0038, which
  rejected the message without the projection.

## Alternatives

- **A refusal past a limit**, as a defect. It keeps the others' steps short, and stops an entity whose program did
  nothing wrong, until an operator acts.
- **The design's advice alone**, with no warning. An operator who sees every entity slow down has nothing that
  names the one that holds them.
- **A warning told to the probe.** Decision 0073 keeps the probe out of what a user sees.
- **A row of the outbox with the message and a version**, which halves what a large projection writes and changes
  what a consumer reads.
- **A state over several rows**, one for each child by id, so that a step writes the children it changed. It is
  the one answer that cuts the cost of a large state, and it makes the storage keep a second shape of the state,
  with migrations over many rows. It waits for a program that needs it.

## Consequences

- `docs/design.md` says, under Persistence, what a step writes and what it costs, and that a large state is split
  into entities. Its section on Reading advises a projection that shows what a caller acts on.
- [`src/runtime.ts`](../../../src/runtime.ts) takes `warn` in its options, and logs a large step.
  [`src/storage.ts`](../../../src/storage.ts) gives the length of the text it writes.
- [`src/runtime.test.ts`](../../../src/runtime.test.ts) checks that a step past the threshold warns once per
  activation, through a logger the test provides, and that a step under the default does not.
- `spikes/many-children.test.ts` measures a parent of many children by id, and its figures go to the design.
