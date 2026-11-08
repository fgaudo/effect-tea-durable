# 0180. A program leaves out what it does not have, and each piece left out is empty

**Status:** accepted, 2026-11-08, with the step The API before the release of the [roadmap](../roadmap.md). Changes
[decision 0035](archive/0035-one-place-where-a-program-is-declared.md), whose `program(schemas)(…)` takes every
piece.

## Context

A program without work wrote eight lines that said it had none. [`examples/cart/cart.ts`](../../examples/cart/cart.ts)
declared `internal`, `operation` and `rejection` as `Schema.Never`, `sender` as `Schema.Null`, `keys`, `operations`
and `indexes` as `{}`, and `durable` as `() => noWork`. Each line is the only value that piece can have in a program
that holds no work, rejects with no reason, reads no sender or is asked nothing across its entities. Four of the five
examples wrote at least one such line.

## Decision

- **A schema left out is the schema of nothing of its kind.** `program` and `part` may leave out `internal`,
  `operation` and `rejection`, which are then `Schema.Never`. A program may leave out `sender`, which is then
  `Schema.Null`. A part that leaves out `sender` reads no sender, as before. The program the constructor returns
  holds every schema, since the machine and the storage read them all.
- **A record left out is empty.** `keys`, `operations` and `indexes` left out are `{}`.
- **`durable` may be left out exactly where no key is declared, and holds no work then.** A program that declares a
  key and leaves out `durable` does not compile, since its keys would hold nothing.
- **`operations` may be left out exactly where the program has no kind of operation.** A program whose `operation`
  schema has a member and that leaves out `operations` does not compile, as a runner left out did before.
- **The types follow the defaults.** A schema left out gives its type nothing to infer from, so the type is the type
  parameter's default: `never` for the internal messages, the operations and the reasons, and `null` for the sender.
  A program that leaves out `indexes` has no index a query may name, as one that declares `{}`.
- **The type parameters of `program` change order.** A type parameter with a default comes after those without one,
  so `Projection` comes before `Internal` in the first call, and `Indexes` and `Topics` before `Keys` in the second.
  No code passes them by hand.

## What it rests on

- That TypeScript infers a type parameter that has no inference candidate as its default: **tested** by
  `a program without work leaves out what it does not have, and each piece left out is empty` in
  [`src/program.test.ts`](../../src/program.test.ts), which asserts the types of a program that leaves every such
  piece out.
- That a default on a type parameter inferred from context-sensitive functions fixes the functions' parameters to
  the default's: **seen** when `Indexes` took the default `{}`. Then the indexes of
  [`examples/order/order.ts`](../../examples/order/order.ts) had parameters of type `any`, and the compiler refused
  them. So `Indexes` has no default, as `Topics` has none, and a record left out is inferred as its constraint,
  whose keys are any string, which `IndexNames` reads as no index.
- That the default of `Operations`, `Declared<Operation, Internal>`, leaves the services of the runners inferred:
  **tested** by `a droppable runner whose services hold Entities does not compile (decision 0129)` in
  [`src/program.test.ts`](../../src/program.test.ts), which asserts that the services are `Rates`.
- That `durable` and `operations` are required where the program has keys or operations: **tested** by
  `durable is left out only with no key, and operations only with no kind of operation (decision 0180)` in the same
  file.
- That `Schema.Never` decodes no value: **documented** in its JSDoc at 4.1.2, a stable API. So a program that leaves
  out a schema stores nothing of its kind, and reads nothing of it back.

## Alternatives

Each structure of Effect that could do the work was weighed.

- **`Struct.assign(defaults, schemas)` to fill in the schemas.** It is `{ ...defaults, ...schemas }` with its types.
  A schema given as `undefined` from JavaScript, or through a cast, would replace the default with `undefined`. `??`
  for each piece keeps the default in that case, and says each default where it is used.
- **`Schema.Void` for the sender, as `Rpc.make` of `effect/rpc` gives to a payload left out.** `Rpc.make` gives
  `Schema.Never` to an error left out, as this note does to a reason. A sender is stored with a queued message, and
  `void` encodes to `undefined`, which JSON does not hold ([decision 0030](archive/0030-a-schema-encodes-to-json.md)).
  `Schema.Null` encodes to `null`, which the examples wrote already.
- **`Schema.withConstructorDefault` or `Schema.withDecodingDefault`.** Both give a default to a field of a value that
  a schema decodes or makes. The declaration of a program is a TypeScript object, which no schema decodes.
- **`flags` left out as `Schema.Null` too.** The roadmap's point did not list it. Every caller of `create` passes the
  flags, so a schema left out would still be a `null` written at each creation. It stays for a later point if a
  program without flags turns out common.
- **`durable` left out always, even with keys.** A program that declares a key and holds no work under it would then
  compile. The keys say a program holds work, so the compiler asks for the work.

## Consequences

- The examples leave out every piece that was the empty one. The inventory of
  [`examples/booking`](../../examples/booking) declares only its state, flags, messages, reasons, sender and
  projection, and its `update` and `project`.
- The tests of `src/` still write every piece, since a program written whole is still a program.
- The design says what a program may leave out, under A program and A part.
