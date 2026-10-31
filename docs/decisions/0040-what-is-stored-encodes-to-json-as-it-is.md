# 0040. What is stored encodes to JSON as it is

**Status:** accepted, 2026-10-30. Its consequence that each step encodes what it stores twice, and its bullet that
the storage writes through `encode`, are changed by [decision 0057](0057-the-machine-gives-what-is-written.md): the
machine gives what is written, encoded once, and the storage writes it.

## Context

Every schema of a program encodes to `Json` ([decision 0030](0030-a-schema-encodes-to-json.md)), and the
runtime writes what the machine stores through them. An audit found two ways a step the machine accepted could
not be written, which the machine never saw:

- **A schema that refuses the value.** A refinement (`Schema.Number.check(Schema.isGreaterThan(-1))`) is no rule
  of the types, so `update` may return a state its own schema does not encode. The encoding threw inside the
  write, killed the entity's loop, and every caller after it waited for ever.
- **A number JSON does not hold.** `Json` admits `number`, and `Schema.Number` takes `NaN` and `Infinity`, which
  `JSON.stringify` writes as `null`. The step was accepted and stored, and the next activation could not decode
  the state: the entity was lost.

The same held of an operation's completion, of an `unknown` message, of a rejection's reason, and of an inbound
message, which waits in the mailbox as its schema writes it.

## Decision

- **The machine encodes what it would store, and what does not encode is a defect.** At a creation, a step and an
  activation it encodes the state, each piece of work the state holds and the projection, checks that every
  index is a number JSON holds, and checks that the encoded values are JSON as they are: finite numbers, and
  plain objects and arrays of such values. It encodes a rejection's reason before storing the reply, an
  operation's message before recording it, and an `unknown` before it enters the mailbox.
- It falls where the other checks of a state fall ([decision 0014](0014-rules-the-machine-settled.md)): at a
  creation nothing is stored, at a step the entity is suspended with the state and the mailbox as they were, at an
  activation it is suspended on the activation, and an operation whose message does not encode suspends it on the
  operation, as an operation that dies does.
- **An inbound message that does not encode is its caller's defect.** The runtime encodes the message and the
  caller's sender before the message reaches the entity, and the call dies with the defect, as a defect at
  creation is the creator's ([decision 0028](0028-rules-the-runtime-settled.md)). Nothing is stored, and the
  entity is untouched. `rehearse` fails the test on such a message.
- `encode` in [`src/program.ts`](../../src/program.ts) is the one check, and the storage writes through it too.

## Alternatives

- **Letting the runtime find it while it writes.** The rule would not be in `rehearse`, and a rehearsal would
  pass a program whose first deploy loses entities. The machine is where the rules of a step live
  ([decision 0013](0013-the-runtime-is-a-pure-machine.md)).
- **A narrower `Json` type, without `NaN`.** TypeScript has no type for a finite number.
- **Writing non-finite numbers as strings**, as some JSON codecs do. It would change what a schema's encoded side
  means for one runtime, and decode back only through a schema that expects it.
- **Rejecting an inbound message that does not encode** with a reply. A reply is stored, and this one could not
  be: nothing about the request is the entity's to answer.

## Consequences

- Each step encodes what it stores twice: once in the machine, to check it, and once in the storage, to write
  it. It is the price of a check that a rehearsal runs.
- A rehearsal now encodes, so a migration is still the one thing it does not exercise.
- The machine's tests give their toy programs real schemas.
