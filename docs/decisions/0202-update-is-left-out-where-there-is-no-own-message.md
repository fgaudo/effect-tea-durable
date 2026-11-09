# 0202. `update` may be left out exactly where there is no own message

**Status:** accepted, 2026-11-09. Changes [decision 0180](0180-a-program-leaves-out-what-it-does-not-have.md),
whose list of the pieces a program may leave out did not hold `update`.

## Context

A parent whose only messages are its children's gave `inbound: Schema.Never` and an `update` that returned the state.
The guide's second reader wrote such a parent, a loan whose books are its children, and left out `update`. The
compiler then refused the whole declaration. A declaration refused as a whole infers no children, so the compiler
typed the parameters of `onEvent` as `any`, and refused them too. The reader saw that cascade of errors and not the
one piece missing.

## Decision

- **`update` may be left out exactly where the program or the part has no own message.** The own messages are the
  inbound, the internal and, for a part, the external ones. Where all three are `never`, `update` is optional. Where
  any has a member, a declaration that leaves out `update` does not compile, as one with keys and no `work` does.
- **An `update` left out leaves the state as it is.** The library never calls it, since a message to a child is routed
  to the child and a program with no own message receives no other. The default is `identity` of `effect/Function`.
- **`inbound` stays required.** A parent with no own message still writes `inbound: Schema.Never`. Leaving it out
  would give the type parameter `Inbound` a default, and move it after `Projection` in the first call, for one line
  that only programs without own messages write. Every example has an own message, and one program of the guide
  has none.
- **A program with no own message and no child compiles.** It is an entity that is created and read, and that no
  message reaches. A check that refuses it would add a long error for a rare case, and would refuse no wrong program.

## What it rests on

- That the types of a parent's children and of its `onEvent` are inferred from `children` and the schemas, and not
  from `update`: **tested** by `a parent with no own message leaves out update, and its children and events keep their
  types (decision 0202)` in [`src/composition.test.ts`](../../src/composition.test.ts). Its `@ts-expect-error` on a
  field of the event that does not exist fails where the event is `any`.
- That a declaration with an own message and no `update` does not compile: **tested** by the same test, for an inbound
  and for an internal message.
- That `identity` returns its argument: **documented** in its JSDoc in `effect/Function` at 4.1.2, a stable API.

## Alternatives

Each structure of Effect that could do the work was weighed.

- **A function written by hand, `(state) => state`, as the default.** `identity` of `effect/Function` is that
  function, and its contract is in its JSDoc.
- **`update` optional always.** A program with messages of its own and no `update` would then compile, and drop every
  message it receives. The schema of the messages says the program handles them, so the compiler asks for the handler.
- **`inbound` left out too, as `Schema.Never`.** Weighed above, under the decision that keeps it.

## Consequences

- The design and the guide say that a parent with no own message leaves out `update`.
- The open question of a program with no inbound message of its own leaves `docs/open-questions.md`.
- An error for an `update` missing where it is required names the whole declaration, not the property, as the error
  for `work` missing does.
