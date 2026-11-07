# 0124. The boundary authenticates, and `update` authorizes

**Status:** accepted, 2026-11-04. Decides the open question on who may send what. Settles what
[decision 0012](0012-creation-is-a-request-of-its-own.md) left open of who may create an entity, and what
[decision 0014](0014-rules-the-machine-settled.md) left open of what a creator is answered for a defect at
creation. Says who a sender is, which [decision 0048](0048-a-callers-request-belongs-to-its-sender.md) left to
the boundary.

## Context

`update` reads `meta.from` and rejects what a sender may not do. Four things were not decided: where a check that is
not domain happens (a valid token), and what its caller gets; who may create an entity, since `init` sees no sender;
what a creator gets when `init`, `durable` or `project` dies on the first state; and how fine a sender is, since a
caller's request ids are stored under its sender.

effect-tea's Guide answers the same questions for a program in a browser. A program never sees an input that has not
crossed the boundary: whoever starts it gives its flags, a parent to its child and `run` to the root. `init` always
succeeds and has no `reject`. `update` rejects a message that may arrive and does not apply, and a defect is a bug,
never an answer. A caller here is remote, and may be malicious, so the same split holds with a boundary that matters
more.

## Decision

- **The runtime trusts the sender it is given.** Whoever calls `create`, `send` or `read` on a deployment is the
  boundary: an HTTP handler, a queue's consumer, another service's adapter. The boundary authenticates the caller
  and writes the sender from what it authenticated. The runtime checks only that the sender encodes
  ([decision 0048](0048-a-callers-request-belongs-to-its-sender.md)). `read` takes no sender, so the
  boundary alone decides who may read a projection.
- **A caller the boundary does not authenticate never reaches the runtime.** The boundary answers it in its own
  protocol, a 401 for HTTP. Nothing is stored for it, no request id is taken, and a retry with valid credentials is
  a new request. The runtime has no error for it, as it has no reply for flags that do not encode
  ([decision 0049](0049-flags-are-checked-by-their-schema.md)).
- **What a sender may do is domain, and `update` decides it.** A sender that may not do what its message asks is
  rejected, with a reason, and never a defect: a malicious caller is a message that may arrive in any state, which is
  the Guide's test for a rejection.
- **The program does not decide who may create an entity.** `init` keeps its flags and its time, and sees no
  sender, as in the Guide, where `init` has no `reject`. The boundary decides who may call `create`. A creation that
  domain may refuse is a message to an entity that exists, whose `update` rejects it or keeps work whose operation
  calls `create`: the entity is the parent that starts its child from flags. A program that keeps its creator has
  the boundary write it into the flags.
- **A defect at creation is given to its creator, and stores nothing.** When `init`, `durable` or `project` dies on
  the first state, the creator gets the defect, and no reply is stored under its request id. A retry meets the same
  defect until a fix is deployed, and then creates the entity. A defect is not a reply: the replies of a creation
  stay `Created` and `AlreadyExists`.
- **A sender is the identity the boundary authenticated**, with its tenant where there are tenants: a user, a
  service, an API key's owner. It is the identity `update` authorizes by, and the one a caller's request ids belong
  to. A caller makes its request ids unique among the requests of that identity, and a UUID does. Two devices of one
  user share their request ids, so a retry from the second device gets the first device's reply.

## What it rests on

- That `update`'s rejection reaches the caller with its reason: **tested**, by the tests of
  [decision 0010](0010-a-rejection-may-carry-a-reason.md) in [`src/machine.test.ts`](../../../src/machine.test.ts)
  and `src/runtime.test.ts`.
- That a sender that does not encode reaches no entity: **tested**, `a sender its schema cannot encode is its
  caller’s defect, named as the sender`, in [`src/runtime.test.ts`](../../../src/runtime.test.ts).
- That a defect at creation gives its creator the defect, stores nothing, and lets a retry after a fix create the
  entity: **tested**, `a creation init dies on gives its creator the defect, and a retry after a fix creates the
  entity`, in [`src/runtime.test.ts`](../../../src/runtime.test.ts), and in the machine by `what init throws is its
  defect, and the creation stores nothing`, in [`src/machine.test.ts`](../../../src/machine.test.ts).
- That a boundary exists in every deployment, and authenticates: **only reasoned**. The library cannot check it. A
  deployment that passes a sender it did not authenticate lets any caller act as that sender.
- That a sender as fine as an identity keeps request ids apart: **only reasoned**, from
  [decision 0048](0048-a-callers-request-belongs-to-its-sender.md), which stores a caller's request under its
  sender. A caller whose ids repeat across its own devices gets one reply for two requests.

## Alternatives

- **The runtime authenticates**, given a function of the deployment that checks a token. It would carry a protocol
  the runtime does not speak, and a failure would need an answer of its own beside the replies.
- **`init` sees the sender, and may reject.** It departs from the Guide, where `init` always succeeds, and gives a
  creation a third reply, which a retry would have to find stored.
- **A defect at creation stored as a reply.** A retry after a fix would get the defect for ever, until the reply is
  dropped.
- **A sender as fine as a session.** Authorization would be by session, and a retry from another session of the same
  user would be applied again.

## Consequences

- The runtime's surface does not change: `create` and `send` take the sender they already take.
- The examples' senders stand for what a boundary authenticated. The order example's tests write a customer by
  hand, and its `update` lets a customer act only on an order whose `customer` is that customer.
- A caller's stored replies are kept under an identity, which is what a time to keep them will be counted for
  ([callers' stored replies](../../open-questions.md#running)).
