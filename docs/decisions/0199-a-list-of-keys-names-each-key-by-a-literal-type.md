# 0199. A list of keys names each key by a literal type

**Status:** accepted, 2026-11-08. Changes the first premise of
[decision 0197](0197-a-program-lists-its-keys-and-key-gives-one-a-parameter.md): the names of a list are literal
types only where the list is written in the call to `program` or `part`, or with `as const`.

## Context

Decision 0197 made a declaration list its keys, as `keys: ['fee', key('charge', Schema.String)]`. It rests on the
`const` type parameter of `program` and `part`, which infers the names of a list written in the call as literal types.

A declaration written as an object outside the call, and spread into it, is inferred before the call. Without
`as const`, TypeScript types its `keys: ['charge']` as `string[]`. The record of keys made of that list is then
`{ [name: string]: null }`, which declares every key. Work under a misspelt key, as `{ charg: charge }`, compiles,
and the types no longer keep [decision 0033](archive/0033-a-program-declares-its-keys.md). The machine still refuses the
key when it reads the state ([decision 0037](archive/0037-the-machine-checks-the-declared-keys.md)), so nothing is
lost, but the defect is found when the program runs and not where it is written.

Decision 0132 declared keys as a record, `{ charge: null }`. The name of a property of an object stays a literal type
without `as const`, so the record did not have this gap.

## Decision

- **A list of keys whose names are not all literal types does not compile.** `program` and `part` type `keys` as the
  list intersected with `LiteralNames` of it. `LiteralNames` is `unknown` when every name is a literal type, and
  otherwise an object with a property the list lacks, whose name says the rule:
  `each key is named by a literal: write the list in the call, or 'as const'`.
- **A key with a parameter is held to the same rule.** `key(name, schema)` with a `name` typed `string` makes the list
  fail as a widened name does.
- **The empty list compiles.** It names no key, so no name of it is widened.

## What it rests on

- That a list written in the call, and a list written with `as const`, infer literal names: **tested** by every
  program of the examples and of `src/fixtures`, and by
  `a list of keys whose names widened to string does not compile, since it would declare every key` in
  [`src/program.test.ts`](../../src/program.test.ts).
- That a list typed `string[]`, a `key` named by a `string`, and a part's widened list each fail to compile, and
  compile once `LiteralNames` is taken out: **tested** by the same test, whose three `@ts-expect-error` go unused
  without the intersection.

## Alternatives

- **A note in the documentation that a list outside the call needs `as const`.** A reader who misses it loses the
  check in silence, which is the defect this note closes.
- **Keys declared as a record again.** It undoes decision 0197, whose reasons still hold for every declaration
  written in the call.
- **A `const` modifier on a helper, such as `keys('fee', key('charge', …))`.** It infers literal names wherever the
  list is written, but adds a constructor for every declaration, where the error asks only for `as const` in the rare
  declaration written outside the call.

## Consequences

- Two tests of `src/` that pass a list typed `ReadonlyArray<string>`, to check a defect raised at runtime, cast it.
- The design says the rule under Keys with a parameter.
