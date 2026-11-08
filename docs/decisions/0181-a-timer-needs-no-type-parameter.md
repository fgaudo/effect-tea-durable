# 0181. A timer needs no type parameter, and `update` keeps `Match.withReturnType`

**Status:** accepted, 2026-11-08, with the step The API before the release of the [roadmap](../roadmap.md).

## Context

Every example with a timer wrote `timer<Internal>(at, message)`. A branch of `Match.valueTags` in `durable` gives
the call no type to infer from, so `Message` was inferred from the literal, and its tag widened to `string`. A
`Timer<{ _tag: string }>` is no timer of the program's internal messages, and `durable` did not compile. The type
parameter was the only way to keep the tag.

The roadmap's point also named `Match.withReturnType<State | Rejected>()` in `update`, and asked whether a typed
`timer`, or a `durable` that propagates the type, would remove both.

## Decision

- **`timer` takes its message as a `const` type parameter.** `timer(at, { _tag: 'RenewalDue' })` is a
  `Timer<{ readonly _tag: 'RenewalDue' }>`, which is assignable to a timer of the internal messages that hold it.
  `durable` checks it there, so a misspelt tag is a type error in `durable`, as before.
- **`update` keeps `Match.withReturnType<State | Rejected>()` where it matches with `Match`.** A branch of `Match`
  is typed by the matcher, not by what `update` returns, and `withReturnType` is how `Match` types all its branches.
  A `switch`, as in [`examples/cart/cart.ts`](../../examples/cart/cart.ts), takes the type from `update` and needs no
  annotation. The library changes neither.

## What it rests on

- That a `const` type parameter keeps a literal's tag where nothing gives the call a type: **tested** by
  `a timer needs no type parameter: its message keeps its tag, and durable checks it (decision 0181)` in
  [`src/program.test.ts`](../../src/program.test.ts). The test fails against `timer` without `const`, and so do
  the examples.
- That a message made `const` is assignable to the schema's type: **reasoned**. A `const` type parameter makes an
  array a readonly tuple, and a readonly tuple is assignable to the `ReadonlyArray` a schema's type holds.
- That a schema made with `Schema.mutable` needs the type parameter: **tested**, by the same test. A mutable array
  does not take a readonly tuple, so `timer(…)` does not compile there, and `timer<Internal>(…)` does. No example
  has one. The JSDoc of `timer` says it.
- That the branches of `Match.value(…).pipe(…)` are not typed by the return of `update`: **seen** when
  `withReturnType` was taken out of [`examples/subscription/subscription.ts`](../../examples/subscription/subscription.ts),
  and the compiler refused the widened tags. That `withReturnType` types every branch: **documented** in its JSDoc at
  4.1.2, a stable API.

## Alternatives

Each structure of Effect that could do the work was weighed.

- **`Schema.TaggedUnion`'s `cases.<Tag>.make`**, as the examples make their operations. `Internal.cases.RenewalDue.make({})`
  is typed with no parameter, and it works with `timer` as it is. It holds only where the internal messages are a
  `Schema.TaggedUnion`, and it is longer than the literal. With `const`, both forms compile.
- **`Match.withReturnType` in `durable`.** It types the branches as `update`'s does, and it is one more line in every
  `durable` than the type parameter it replaces.
- **A `timer` given to `durable` by the program**, as `durable: (state, { timer }) => …`. The `timer` would be typed
  by the program's internal messages, and would also check the message where it is written. It changes the shape of
  `durable` for a check the return type already makes.
- **A matcher of the library for `update`**, typed by the program. It would replace `Match` for one use, and a
  reader of an example would learn a second matcher where Effect's does the work with one line.

## Consequences

- The examples write `timer(at, message)`.
- A test of `src/` that writes `timer<…>(…)` still compiles, since a type parameter given by hand is used as it is.
