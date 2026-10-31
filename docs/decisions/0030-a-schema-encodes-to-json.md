# 0030. A schema encodes to what JSON holds

**Status:** accepted, 2026-10-30. The type it declares is replaced by Effect's, in
[decision 0098](0098-json-is-effect-s.md): Effect has one.

## Context

Everything that leaves the process goes through one of the program's schemas
([decision 0025](0025-operations-and-projections-have-schemas.md)), and the runtime writes them as JSON text in
SQLite ([decision 0007](0007-one-process-first.md), [`src/storage.ts`](../../src/storage.ts)). `schemas` was
typed `Codec<T, unknown>`, so a schema whose encoded side is not JSON — `Schema.DateTimeUtc`, which declares a
`DateTime.Utc` — typechecked and died on the first write.
[Decision 0028](0028-rules-the-runtime-settled.md) recorded the rule and left whether the types should say so as
an [open question](../open-questions.md).

Effect 4.1 has no type for a JSON value: `JsonSchema` and `JsonPatch` are other things.

## Decision

`Json` is declared in [`src/program.ts`](../../src/program.ts) — a string, a number, a boolean, null, an object
of `Json`, an array of `Json` — and every codec in `schemas` is a `Codec<_, Json>`. The storage's own composed
codecs, which wrap a program's schemas to write an origin, a piece of work, a reason or a suspension, say the
same, so the `JSON.stringify` of each write is what the type promised.

## Alternatives

- **The constraint in the runtime, at `deploy`.** It is where it belongs — JSON is what this runtime writes, not
  what the design requires — but a program declared as `Program<T>` has `unknown` on the encoded side of its
  schemas, and the type is gone by the time `deploy` sees it. Carrying it would be a second parameter of
  `Program`, threaded through the machine, the storage and `Entities`, for a generality no runtime of this
  library has asked for yet.
- **Leaving it as it was.** The error arrives as a defect on the first write, found by a test that stores, and
  never by the compiler: `rehearse` never encodes, so a program can be fully rehearsed and still be unstorable.

## Consequences

- A program holds a time as `Schema.DateTimeUtcFromMillis`, and a schema that encodes to a `Date`, a
  `Uint8Array` or a `Map` does not compile. What JSON has no form for is encoded to one that it has, as the
  examples' times are.
- A later runtime that writes something other than JSON text — bytes, a column per field — encodes a `Json`
  value, which costs it nothing. One that wants a program to encode to something else is the second parameter
  this note declined, and a decision of its own.
- It answers the question [decision 0028](0028-rules-the-runtime-settled.md) left open; the rule it recorded is
  unchanged, and is now checked by the compiler.
