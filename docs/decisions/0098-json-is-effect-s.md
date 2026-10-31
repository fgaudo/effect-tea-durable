# 0098. `Json` is Effect's

**Status:** accepted, 2026-10-31. Replaces the type [decision 0030](0030-a-schema-encodes-to-json.md) declares.

## Context

[Decision 0030](0030-a-schema-encodes-to-json.md) has every codec of a program's `schemas` encode to `Json`, and
declares `Json` in [`src/program.ts`](../../src/program.ts), since "Effect 4.1 has no type for a JSON value". The
review of 0016 to 0030 found that it has one: `Schema.Json`, with `Schema.JsonArray` and `Schema.JsonObject`, stable
since 4.0.0, the type of the schema of the same name. It is the type 0030 wrote, read-only alike: `null`, a number, a
boolean, a string, a read-only array of `Json`, a read-only record of `Json`.

## Decision

- **`Json` is `Schema.Json`.** [`src/program.ts`](../../src/program.ts) keeps the name, as an alias, so the library's
  code and its users read it where they did.
- What 0030 decides of the codecs, and the runtime's check that a value is JSON as it is
  ([decision 0040](0040-what-is-stored-encodes-to-json-as-it-is.md)), are unchanged.
- A test has the compiler refuse a schema that encodes to a `DateTime.Utc`
  ([`src/program.test.ts`](../../src/program.test.ts)): the rule 0030 says is checked by the compiler is checked
  when the types change.

## What it rests on

- Effect 4.1.1 exports `Json` from `effect/Schema`, as a stable type: **documented**, in its declaration and its
  `@stability stable` tag.
- It is the type 0030 declared: **tested**, by `bun run typecheck` over the library, its examples and
  [`src/program.test.ts`](../../src/program.test.ts), which compile with it in place of the old one.

## Alternatives

- **Keeping the type of our own.** It says the same, and is one more thing to keep in step with what Effect calls
  JSON.
- **Importing `Schema.Json` everywhere** in place of the alias. Every module that names `Json` would change, and a
  user would read `Program`'s types through a name the library does not export.

## Consequences

- A schema built with `Schema.Json`, or a field of it, is a codec of `schemas` as it is.
- The premise 0030's context gave is wrong; the decision it took stands.
