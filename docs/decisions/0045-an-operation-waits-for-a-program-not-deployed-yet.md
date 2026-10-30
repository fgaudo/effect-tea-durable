# 0045. An operation waits for a program not deployed yet

**Status:** accepted, 2026-10-31.

## Context

`Entities.send` and `Entities.create` died when the receiver's program was not deployed in the process, and the
operation's defect suspended the sender. `deploy` starts at once the operations a crash interrupted, so a process
that deployed the booking before the inventory suspended every booking whose hold a crash interrupted, and one
that deployed them the other way round did not. What worked depended on the order of the deploys, which nothing
said, and the booking was not at fault.

## Decision

- **An operation that sends to, or creates, an entity of a program not deployed yet waits for it**, looking again
  every `retry` milliseconds, as it waits for a suspended receiver
  ([decision 0010](0010-a-rejection-may-carry-a-reason.md)). Its entity waits with it, and the process is not
  settled meanwhile.
- `deploy` keeps taking one program at a time, and starting its interrupted operations at once.

## Alternatives

- **`launch` taking every program**, and starting the interrupted operations once all of them are deployed. The
  order would no longer matter in one process, but a process would need the services of every program to start,
  and a program could not be deployed on its own. In a cluster the receiver's program may be deployed by another
  process, or later in a rolling deploy, and an operation that reaches it has to wait anyway.
- **Dying, as before**, and leaving the order of the deploys to whoever writes the process. A rule nothing checks
  suspends entities that did nothing wrong, until an operator resumes them.

## Consequences

- A program that is never deployed keeps its senders waiting for ever, and nothing says so: it joins the
  question of how long a sender waits before someone is told ([open questions](../open-questions.md#running)).
- [`examples/booking`](../../examples/booking) checks that a booking whose hold a crash interrupted holds its
  seats when the next process deploys the booking first.
