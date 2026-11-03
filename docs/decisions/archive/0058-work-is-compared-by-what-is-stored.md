# 0058. Work is compared by what is stored

**Status:** accepted, 2026-10-31.

## Context

Whether a key keeps its work ([decision 0018](0018-operations-are-data.md)) was decided with `Equal.equals` on the
operation, and on a timer's message, while the storage compared projections as text. At an activation one side
of the comparison is decoded from the store, and the two notions can disagree: an operation built with a property
its schema does not declare, which the types let through a spread, is equal to itself in memory, is stored
without it, and after a restart is no longer equal to what `durable` builds. The entity was suspended at every
activation, as by a program that changed the operation.

## Decision

- **Two works are the same when they encode to the same JSON**: an operation by its schema, a timer by its time
  in milliseconds and its message by the internal schema. The JSON is compared with its fields in any order.
- It is the notion a crash sees: what a restart compares is what was stored.

## Alternatives

- **Refusing an operation with a property its schema does not declare.** A schema that ignores what it does not
  declare is the default, and a refusal would be a second rule beside the comparison.
- **Comparing by value, and decoding what is computed before comparing it.** It would compare the same thing,
  at the cost of a decoding, and still with a notion of equality the store does not have.

## Consequences

- A step may change a property of an operation its schema does not declare: it is the same work, and runs on.
- An operation whose schema changed in a deploy is compared by what the new schema writes of both.
