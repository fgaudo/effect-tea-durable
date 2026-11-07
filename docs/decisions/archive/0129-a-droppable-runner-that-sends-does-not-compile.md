# 0129. A droppable runner whose services hold `Entities` does not compile

**Status:** accepted, 2026-11-04. Decides the open question on a droppable runner that cannot send, by its type. It
adds a check by the compiler to the rule of [decision 0128](0128-an-operation-that-acts-on-nothing-may-be-dropped.md)
that a droppable operation sends to no entity and creates none.

## Context

A droppable operation sends to no entity and creates none, since an interruption between a request and its reply
would leave the receiver acted on and the sender with no answer (decision 0128). Until now the runtime was the only
check: a droppable operation that calls `send` or `create` dies, and suspends its entity. The mistake was found in a
test that runs the operation, or in production.

`send` and `create` need the service `Entities`, and the services an effect needs are in its type. So the type of
`operation.droppable` can refuse a runner whose services hold `Entities`, as effect-tea has a test assert a command
by its type. The question was whether such a bound infers the runner's services, gives a message a reader
understands, and keeps its promise.

## Decision

- **`operation.droppable` refuses a runner whose services hold `Entities`.** Its runner's effect is checked
  against `WithoutEntities<R>`, which is `R` where `R` holds no `Entities`, and `SendsToNoEntity` otherwise.
  `SendsToNoEntity` is an interface whose one property is named `a droppable operation sends to no entity, and
  creates none`. `Entities` has no such property, so the compiler refuses the runner and names the rule in its
  message.
- **The runner's services are still inferred.** TypeScript infers `R` from a runner checked against the conditional,
  and a droppable runner that needs another service gives that service to the program's services, as before.
- **The runtime keeps its check.** A runner can escape the type. It may keep, out of the run of another operation,
  an `Entities` it then sends with. Such a runner sends under the other operation's request, which breaks
  [decision 0060](0060-send-and-create-take-no-key.md) too. The runtime's check is what a runner
  cast past the type meets, and it stays.

## What it rests on

- That a droppable runner that needs `Entities`, directly or through a layer it provides to itself, does not
  compile, and that one needing another service compiles and gives that service to the program: **tested**, `a
  droppable runner whose services hold \`Entities\` does not compile`, in
  [`src/program.test.ts`](../../../src/program.test.ts). Without the bound its `@ts-expect-error` lines are unused,
  and `bun run typecheck` fails. The runtime test `a droppable operation that sends to an entity dies, and suspends
  its entity`, in [`src/runtime.test.ts`](../../../src/runtime.test.ts), fails to typecheck the same way.
- That TypeScript infers `R` through the conditional `[Extract<R, Entities>] extends [never] ? R : SendsToNoEntity`:
  **tested** by the same test, which checks the program's services. The handbook of TypeScript does not promise how
  a type parameter is inferred through a conditional type. A release that stopped inferring it would fail the
  typecheck, and lose no data.
- That a runner reaches `Entities` only through its own services: **only reasoned**. `deploy` takes the services
  of a program without `Entities`, so a layer built from `Entities` cannot be given at deploy, and the runtime
  provides `Entities` only to a run of an operation. A runner can still keep an `Entities` from another run in a
  variable, which no type sees.

## Alternatives

- **The runtime alone.** The mistake is found only when the operation runs, where the compiler can say it at once
  for the cost of a bound.
- **A rest parameter that is empty where `R` holds no `Entities`.** It refuses the same runners, with the message
  `Expected 2 arguments, but got 1`, which does not say the rule.
- **A result type that is a message where `R` holds `Entities`.** The error lands where the runner is used, not
  where it is written, and the compiler widens the message to `string`.
- **A constraint `R extends Exclude<R, Entities>`.** TypeScript refuses it as a circular constraint.

## Consequences

- A droppable runner whose services hold `Entities` among others gets a message that may name another of its
  services first, as `Type 'Clock | Entities' is not assignable`. The last line of the message names the rule.
- A test of the runtime's check marks its runner with `@ts-expect-error`, since that runner no longer compiles.
