# 0213. A projection's `allows` is given the sender

**Status:** accepted, 2026-11-09. Changes `allows` of
[decision 0026](archive/0026-the-test-maps-a-projection-to-its-messages.md), which gave each function the projection
and the message alone. Changed by [decision 0276](0276-a-projections-allows-is-given-the-projection-as-a-caller-reads-it.md): each function is given the projection as a caller
reads it, decoded from its JSON.

## Context

`projectionViolations(program, allows)` checks a projection against `update`. Each function of `allows` was given
the projection and the message, and never the sender. A projection is one row that every caller reads, so it can
show the actions of several senders side by side: a subscription's `canCancel` for its customer, and
`canGrantCredit` for support. A function without the sender could not say that `canCancel` allows nothing to
support. So a test gave each message only from the sender it was meant for, and a message from any other sender
was never checked. A reader of the guide found it awkward, building a bank of lockers that a courier, a recipient
and an operator act on.

## Decision

- **Each function of `allows` is given the candidate's sender as its third argument**,
  `(projection, message, sender) => boolean`. It says whether the projection allows the message to that sender.
- **A function that leaves the sender out is unchanged.** A projection that speaks to one kind of sender is checked
  as before, with candidates from that sender.
- **A projection that shows the actions of several senders says in `allows` whose each action is.** The test then
  sends every message from every sender, and one from a sender who may not send it must be rejected.

## What it rests on

- That `projectionViolations` gives each function the candidate's sender, and names the sender of each violation:
  **tested**, by the tests of `projectionViolations (decision 0213)` in
  [`src/testing.test.ts`](../../src/testing.test.ts).
- That a function of two parameters is accepted where `allows` asks for one of three, so the tests that leave the
  sender out still compile: **documented**, by TypeScript's handbook, "Comparing two functions", and **tested** by
  `bun run typecheck` on [`examples/order/order.test.ts`](../../examples/order/order.test.ts).
- That a projection may show the actions of several senders: **tested**, by
  [`examples/subscription/subscription.test.ts`](../../examples/subscription/subscription.test.ts), where support's
  `canGrantCredit` stands beside the customer's actions.

## Alternatives

- **A projection shows only what applies in the state, and `update` alone checks the sender's right.** A projection
  read by a courier and a recipient would then show `canCollect` to both, and a caller could not tell whose action
  it is without knowing the program's rules.
- **A test filters its candidates by sender.** That is how tests did it before. Every test that has more than one
  kind of sender writes the same filter, and a message from a sender the filter leaves out is never checked.

## Consequences

- The subscription example shows support's action, `canGrantCredit`, and its test sends each message from the
  customer and from support.
- The guide says, under the projection's actions, that `allows` is given the sender.
