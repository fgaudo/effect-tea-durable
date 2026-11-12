# 0276. A projection's `allows` is given the projection as a caller reads it

**Status:** accepted, 2026-11-12, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the fix of bug 38. It changes
[decision 0213](0213-a-projections-allows-is-given-the-sender.md): each function of `allows` is given the projection
decoded from its JSON, and no longer the value `project` returns. It holds of `projectionViolations` what
[decision 0211](0211-a-rehearsal-gives-the-projection-as-a-caller-reads-it.md) holds of a rehearsal's projection. The
maintainer chose it on 2026-11-12, after an opinion of a Fable 5.2 agent.

## Context

`projectionViolations(program, allows)` checks that a projection agrees with `update`: a message the projection
allows its sender is accepted, and one it does not allow is rejected. It gave each function of `allows` the value
`program.project(state)` returns. A caller of the runtime reads the projection its storage holds, decoded from the
JSON a step wrote, where `-0` is `0` ([decision 0210](0210-a-sparse-array-is-no-json-and-negative-zero-is-read-as-zero.md)).
So a projection that holds `-0` was checked as no caller reads it, and the check could pass where a caller's reading
breaks the agreement. That is bug 38 of the roadmap.

Bug 38 also said that `projectionViolations` gives `update` the sender unmigrated. That half is false.
`Migration.sender` reads a sender stored by an older version, in a stored reply or a message waiting. A candidate's
sender is of the type `T['sender']`, built by the test at the program's version as a caller sends it, so no version
is there to migrate it from. On one process the runtime gives `update` a caller's sender as the caller sent it,
in `send` of `src/runtime/callers.ts`.

## Decision

- **Each function of `allows` is given the projection as a caller reads it.** `projectionViolations` encodes the
  projection by its schema, writes it as JSON, reads it back and decodes it, as a rehearsal's `projection` does.
- **One function reads a value as a caller reads it.** `readBack` of `src/program.ts` encodes, writes the JSON, reads
  it back and decodes. The rehearsal's projection, a rejection's reason
  ([decision 0214](0214-a-rejections-reason-is-given-as-a-caller-reads-it.md)) and `projectionViolations` call it.
- **A projection that does not encode throws the defect `encode` gives.** The runtime suspends an entity whose
  projection does not encode, so no caller reads that projection, and the check has nothing to compare. No kind of
  violation is added for it. A projection its schema does not decode back throws the schema's error, as decision
  0214 says of a reason.
- **`update` is given `state` and each candidate as the test gives them.** A rehearsal's `state` is the state in
  memory too, as decision 0211 says.

The decision leaves out the indexes and the topics, which the runtime checks on a step's projection and
`projectionViolations` does not check.

## What it rests on

- That `allows` is now given `0` where the projection holds `-0`: **tested**, by
  `gives allows the projection decoded from its JSON, where -0 is 0` in
  [`src/testing.test.ts`](../../src/testing.test.ts), which fails against the code before the change.
- That a projection that does not encode throws: **tested**, by `throws the defect of a projection that does not
  encode` in the same file, which fails against the code before the change.
- That the runtime gives a caller the projection decoded from the JSON its storage holds: **tested**, as decision
  0211 says, by `Inventory answers on the runtime as its rehearsal does, over values of its schemas` in
  [`src/fixtures.property.test.ts`](../../src/fixtures.property.test.ts).
- That `JSON.stringify` writes `-0` as `0`: **documented**, by ECMAScript's `SerializeJSONProperty`, as decision 0210
  says.
- That a candidate's sender needs no migration, since `Migration.sender` reads only a stored sender:
  **read in the source**, in the type `Migration` of [`src/program.ts`](../../src/program.ts) and in `send` of
  [`src/runtime/callers.ts`](../../src/runtime/callers.ts).

## Alternatives

- **`allows` is given both projections, and a violation is told where the two disagree.** It changes the contract
  of `allows`, and tells of every projection that holds `-0`, which decision 0210 makes harmless.
- **The value `project` returns, as before, with the difference documented.** A test would then pass where a caller
  of the runtime is refused, which decision 0211 refused for a rehearsal.

## Consequences

- The design says under Testing that `allows` is given the projection as a caller reads it.
- On Cluster, and for a message reloaded after a crash, `update` is given the message and the sender decoded from
  their JSON, and on one process as the caller sent them. That is an
  [open question](../open-questions.md#running), found while bug 38 was read.
