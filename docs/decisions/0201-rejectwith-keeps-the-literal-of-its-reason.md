# 0201. `rejectWith` keeps the literal of its reason

**Status:** accepted, 2026-11-08. Changes how `rejectWith` types the reason of
[decision 0010](archive/0010-a-rejection-may-carry-a-reason.md).

## Context

`update` is typed by its program, so a case that returns `rejectWith('InUse')` is checked against the program's
reasons. A case of `Match.valueTags` is typed by its own argument alone, since nothing around it gives the return
type. `rejectWith` was declared `<Reason>(reason: Reason)`, so there `rejectWith('InUse')` widened to
`RejectedWith<string>`, and the program refused a correct `update`. The reader who checked the guide met that error,
whose text names `string` and none of the reasons.

An object literal returned by such a case widens its tag to `string` too. The library cannot change that, since it is
how TypeScript widens a literal with no type around it. `Match.withReturnType` is Effect's structure for it, and the
guide shows it.

## Decision

- **`rejectWith` is declared `<const Reason>(reason: Reason)`.** A reason keeps its literal type wherever the call
  stands, so a case of `Match.valueTags` that rejects compiles as one typed by `Match.withReturnType` does.
- **A reason of the wrong literal still does not compile.** The program's reasons are checked as before.

## What it rests on

- That a `const` type parameter infers a literal type where no type is around the call: **documented** in
  TypeScript's handbook for `const` type parameters, since 5.0. It is **tested** by
  `rejectWith keeps the literal of its reason where nothing around the call types it` in
  [`src/program.test.ts`](../../src/program.test.ts), which does not compile without `const`.

## Alternatives

- **An `update` written as a record of handlers by the message's tag**, typed by the program, so that no case
  widens. It departs from effect-tea's `update`, which the design follows, for what `Match.withReturnType` already
  gives.
- **Only the guide's advice to write `Match.withReturnType`.** It leaves a correct case refused for a reason the
  library fixes with one word.

## Consequences

- A program that already compiled is unchanged: a reason checked against the program's type is inferred as before.
