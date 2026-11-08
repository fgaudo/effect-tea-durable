# 0188. `TypesOf` gives a program's types, of the program or of a reference to it

**Status:** accepted, 2026-11-08, with the step The API before the release of the [roadmap](../roadmap.md).

## Context

`Handle`, `Rehearsal` and `Published` take a program's types, the `T` of `Program<T>`. A boundary that names the
handle of a program it launched, or a test that names a rehearsal, wrote `typeof p extends Program<infer T> ? T :
never` by hand, as [`examples/server/server.ts`](../../examples/server/server.ts) and
[`examples/order/report.ts`](../../examples/order/report.ts) did. A module that holds only a reference to the
program could not write it at all, since a reference is no program.

## Decision

- **`TypesOf<P>` gives the types of `P`, a program or a reference to one.** A boundary writes
  `Handle<TypesOf<typeof order>>`, and `TypesOf<typeof order>['inbound']` for the program's inbound messages.
- **A program and a reference to it give the same types.** A module that imports only a reference reads the same
  types as one that imports the program, and a union of the two gives them too.
- **Any other type gives `never`.** A value that is neither a program nor a reference has no types of a program,
  and a slot typed with them takes nothing.

## What it rests on

- That `TypesOf` gives the same types of a program and of its reference, the inbound messages and the reasons
  among them, and `never` of anything else: **tested** by `TypesOf gives the types of a program, and of a reference
  to it, and never of anything else (decision 0188)` in [`src/program.test.ts`](../../src/program.test.ts). A
  `TypesOf` that read no reference fails two of its lines, as a mutation by hand showed.
- That a reference is no program, and a program no reference, so the two branches never overlap: **tested** by the
  same test, and **read** in [`src/program.ts`](../../src/program.ts). A reference has no `init`, and a program has
  no key of the reference's types ([decision 0183](0183-a-receiver-is-named-by-a-reference.md)).
- That TypeScript infers `T` from a conditional type on `Program<infer T, string>`: **documented** by TypeScript's
  handbook of conditional types, and relied on by every example before this note.

## Alternatives

Each structure of Effect that reads a type off a value's type was weighed.

- **A type in a namespace of the interface, as `Effect.Success<T>`, `Schema.Schema.Type<S>` and
  `Types.Invariant.Type<A>` of `effect/Types`.** These are conditional types like `TypesOf`, which is the same
  structure. Effect places them in a namespace merged with the interface. The library exports its types flat from
  [`src/index.ts`](../../src/index.ts), and effect-tea names its own `StateOf<P>`, `MessageOf<P>` and `FlagsOf<P>`,
  so `TypesOf<P>` follows the Guide.
- **One type for each piece, such as `InboundOf<P>` and `HandleOf<P>`.** Each is `TypesOf<P>` indexed, or given to
  `Handle`, and every piece added to `Types` would need one more name.
- **`Handle`, `Rehearsal` and `Published` that take the program's type, as `Handle<typeof order>`.** Every type of
  the library over `T` would change, and the code inside the library, which holds `T`, would read it off a program
  type at each use.

## Consequences

- [`src/index.ts`](../../src/index.ts) exports `TypesOf`, and the examples and tests use it where they inferred the
  types by hand.
