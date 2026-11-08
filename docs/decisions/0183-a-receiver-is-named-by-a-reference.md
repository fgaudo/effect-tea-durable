# 0183. A receiver is named by a reference, which carries its program's name and types and none of its code

**Status:** proposed, 2026-11-08, for the step The API before the release of the [roadmap](../roadmap.md). Changes
[decision 0131](archive/0131-a-rehearsal-runs-the-entities-an-operation-sends-to.md), whose world runs any program
a runner's `create` names.

## Context

`send(inventory, id, …)` and `create(inventory, id, …)` took the receiver's program, so the booking imported the
inventory's code. The inventory wrote `'Booking'` as a string to know which entity sent a message, since the booking
already imported the inventory. So two programs that talk both ways import each other, and the name a program
compares a sender to is checked by nothing.

The runtime reads of the receiver only its name. It finds the program deployed under that name, and encodes the
message and the flags with the schemas of that program. The rest of what `send` and `create` take is types: the
inbound messages, the flags, and the reasons of a rejection.

## Decision

- **A reference is a program's name, with the program's types.** `reference<typeof p>(name)` makes one, where
  `import type { p }` brings `p`'s types and none of its code. At run time a reference is the name alone.
- **The name of a program is a type, and a reference is checked against it.** `program` keeps `name` as a literal
  type, as Cluster's `Entity.make` keeps its `Type`. So `reference<typeof inventory>('Inventory')` compiles, and a
  name that is not the program's does not. A send under a misspelt name would otherwise wait for ever for the deploy
  of a program of that name ([decision 0045](archive/0045-an-operation-waits-for-a-program-not-deployed-yet.md)).
- **`send` and `create` take a receiver, which is the program or a reference to it.** Both type the message, the
  flags and the reply the same way. The runtime reads only the name of either, and reaches the program deployed
  under it, as before.
- **A program compares a sender with a reference's name.** The inventory writes `from.entity.name === Booking.name`,
  where `Booking` is a reference to the booking. Neither program imports the other's code.
- **A world creates through a reference only a program it runs.** A reference brings no code, so a world that runs
  no program under the reference's name has none to run, and fails the test. A world runs a program once the test
  creates one of its entities, or deploys it. A `send` through a reference to a program the world does not run is
  answered `NotFound`, as before, since no entity of it exists.
- **A program does not carry the types a reference carries.** A reference carries its program's types under a key
  that only the types hold. A program has no such key, and stays assignable to a program of wider types, as the
  tests of migrations write.

## What it rests on

- That the name a reference gives is checked against the program's: **tested** by `a reference is the name of its
  program, which the compiler checks, and types send and create as the program does (decision 0183)` in
  [`src/program.test.ts`](../../src/program.test.ts). It also asserts that `send` and `create` type a reference's
  message, flags and reply as the program's, and that the runtime is given the name alone.
- That a world creates through a reference only a program it runs: **tested** by `creates through a reference a
  program the world runs, and fails the run where it runs none` in
  [`src/rehearse.test.ts`](../../src/rehearse.test.ts).
- That the runtime reads only the name of the receiver: **tested** by the tests of
  [`examples/booking/runtime.test.ts`](../../examples/booking/runtime.test.ts), whose booking sends through a
  reference, and **read** in `entities` of [`src/runtime.ts`](../../src/runtime.ts), where the request is keyed by
  the name, and the deployment is found by it.
- That an `import type` brings no code: **documented** by TypeScript, whose `verbatimModuleSyntax`, set in
  [`tsconfig.json`](../../tsconfig.json), erases every `import type`. Two modules that import each other's types
  load in any order.
- That two programs whose types are inferred from each other compile: **seen** in
  [`examples/booking/inventory.ts`](../../examples/booking/inventory.ts). The inventory's function that reads the
  booking's name from a sender writes its return type. Inferred, that type made the inventory's type depend on
  itself, and the tests that run the booking's runners did not compile.

## Alternatives

Each structure of Effect that could name a receiver was weighed.

- **A reference with the receiver's schemas**, as Cluster's `Entity.make(type, rpcs)` and `RpcGroup` of
  `effect/rpc` give a protocol apart from its handlers. A module of schemas would be shared by the sender and the
  receiver. The runtime encodes with the schemas of the program deployed, so the reference's schemas would give only
  types, and nothing would check them against the program's. A reference whose schemas differ from the program's
  would compile, and its sender would be typed with what the receiver does not decode. `typeof p` gives the
  program's own types.
- **A `Context.Service` for each receiver**, provided by the runtime. A runner would then hold each program it sends
  to among its services, which `deploy` would have to provide. The runtime already finds a program by its name.
- **`Brand` of Effect for the name.** A branded string carries one type, and a reference carries the program's
  types together. `EffectTypes.Invariant` from `effect/Types` is how the reference carries them, as Effect's own
  interfaces carry their types.
- **A program that carries the reference's key too**, so that `send` would take a reference alone. The key's
  invariant type made a program of narrow types unassignable to one of wider types, which the tests of migrations
  and of storage write. `send` takes either instead.
- **`isProgram` by a brand that `reference` sets**, and not by the own key `init`. Every program is an object
  `program` returns, or a spread of one, and holds `init`. A brand is one more symbol for a check of one place.
- **A helper that gives the id of the entity that sent, through a reference**, such as `entityOf(Booking, from)`.
  The comparison is one line, and the step does not need the helper.

## Consequences

- `Program<T, Name>` takes the type of its name, which is `string` where nothing gives a literal.
- [`examples/booking`](../../examples/booking): the booking sends through `reference<typeof inventory>('Inventory')`,
  and the inventory reads the booking's name from `reference<typeof booking>('Booking')`. Neither imports the other's
  code.
- A test that changes a program's name for a refusal casts the name, since a program's name is a type.
