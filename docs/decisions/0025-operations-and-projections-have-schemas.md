# 0025. A program gives the schemas of its operations and of its projection

**Status:** accepted, 2026-10-30. Its consequences that a decoded operation is compared by `Equal.equals`, and
that a schema which does not round-trip it is a defect, are replaced by
[decision 0058](0058-work-is-compared-by-what-is-stored.md): work is compared by the JSON it encodes to.

## Context

[Decision 0020](0020-a-new-program-is-checked-against-the-stored-work.md) stores the work a state holds,
operations included, and compares it with the new program's at the next activation;
[decision 0022](0022-a-new-program-keeps-what-work-started-with.md) stores how each operation is delivered. A
program's `schemas` had the state, the flags, the inbound and internal messages and the reasons of rejections,
and nothing for operations: the runtime could neither write the work under way nor read it back.

The projection leaves the process too, to callers that are remote
([design](../design.md#reading)), and it holds values JSON has no form for: the booking's deadline is a
`DateTime.Utc`. Each caller would decode it its own way.

## Decision

- `Program.schemas` has `operation`, a codec of `T['operation']`, and `projection`, a codec of
  `T['projection']`.
- The runtime writes and reads the work under way with `schemas.operation`, and sends the projection encoded with
  `schemas.projection`. The machine never encodes: the schemas are the runtime's
  ([decision 0013](0013-the-runtime-is-a-pure-machine.md)).
- The examples declare their operations as a `Schema.TaggedUnion`, which gives the type, the schema and a
  constructor for each tag (`Operation.cases.Charge.make`), in place of a `Data.TaggedEnum` beside a schema that
  says the same.

## Alternatives

- **Deriving the operation's schema from the state's.** An operation is built from the state, but by a function:
  its shape is its own, and nothing in the state's schema says which fields go where.
- **A `Data.TaggedEnum` and a schema beside it.** TypeScript checks that the two agree, but every field is
  written twice.
- **Storing operations as JSON with no schema.** A `DateTime` or a branded value would come back as something
  else, and the comparison of [decision 0020](0020-a-new-program-is-checked-against-the-stored-work.md) would
  fail on every activation.
- **No schema for the projection**, left to the transport. The projection is the entity's public contract, and
  the program is where its types are.

## Consequences

- A stored operation, decoded, is compared with the new program's by `Equal.equals`. In Effect 4 it is
  structural for plain objects and `Data` values alike, so a decoded operation equals a fresh one built from the
  same values; an operation that holds a class without `Equal` compares by reference, and is never equal after
  a decode: a defect at every activation, loudly.
- A schema that does not round-trip an operation (a transformation that loses a field) is the same defect. A
  runtime may check, at a step, that an operation decodes to itself.
- A program with no operations gives `Schema.Never`, as one with no reasons of rejections does.
- How a stored operation is read after its schema changes, and how a projection's schema changes under its
  callers, are open with [schemas that change](../open-questions.md#storage-and-reading).
