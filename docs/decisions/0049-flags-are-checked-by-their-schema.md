# 0049. Flags are checked by their schema

**Status:** accepted, 2026-10-31. Replaces the consequence of
[decision 0012](0012-creation-is-a-request-of-its-own.md) that flags are decoded before anything is stored.

## Context

Decision 0012 counted on the program's schema to check the flags: a check the program needs on them, such as the
booking's seats, goes in their schema, since `init` cannot reject. Nothing applied it. The flags of a `create`
reached `init` as the caller gave them, and a refinement of `schemas.flags` was never run; flags are not stored,
so the check of decision 0040 on what is stored never saw them either. An inbound message that does not encode
is its caller's defect and reaches no entity ([decision 0040](0040-what-is-stored-encodes-to-json-as-it-is.md));
flags are the creation's message, and were the one input of a caller left out.

## Decision

- **The machine encodes the flags before `init`**, through `schemas.flags`, as it encodes what it stores
  ([decision 0040](0040-what-is-stored-encodes-to-json-as-it-is.md)): flags the schema refuses, or that encode to
  what JSON does not hold, are a defect at creation, and nothing is stored
  ([decision 0014](0014-rules-the-machine-settled.md)). `init` sees only flags its schema takes. `rehearse`
  fails the test on such flags, since it creates its entity through the machine.
- **Flags that do not encode are their creator's defect, and reach no entity.** The runtime encodes them, with the
  sender, before the request reaches the entity: a creation of an entity that exists dies with the defect
  instead of being answered `AlreadyExists`. An operation that creates with them is suspended on it, as for a
  message that does not encode ([decision 0046](0046-a-receiver-that-crashes-is-sent-again.md)).
- The flags are encoded, not decoded: the runtime is given values of the program's types, as for a message, and
  encoding is where a schema's checks run on them. Decoding what arrives from outside the process stays the
  boundary's ([who may send what](../open-questions.md#programs)).

## Alternatives

- **Checking the flags only at a creation that stores**, in the machine. A creator that sends flags its schema
  refuses would be told `AlreadyExists` whenever another created the entity first, and its defect would show only
  on the first try.
- **Checking them only in the runtime.** The rule would not be in `rehearse`, and a rehearsal could start from
  flags no deploy would take ([decision 0013](0013-the-runtime-is-a-pure-machine.md)).
- **Storing the flags**, so that decision 0040 checks them. Nothing reads them after `init`
  ([decision 0002](0002-store-the-state-not-the-messages.md)).

## Consequences

- A creation that stores encodes its flags twice in the runtime, once before the entity and once in the machine.
  They are small, and the two checks are one rule.
- [`src/machine.test.ts`](../../src/machine.test.ts) checks that flags a refinement of their schema refuses never
  reach `init`; [`src/runtime.test.ts`](../../src/runtime.test.ts) that they create nothing, and are a defect for
  an entity that exists; the booking's rehearsal that a booking of no seats is never created.
