# 0027. A program gives the schema of its senders

**Status:** accepted, 2026-10-30.

## Context

An inbound message waits in the stored mailbox with the origin it came from, which `update` reads as `meta.from`:
a step may be a crash away, and the message must be given to `update` with the same sender after the restart.
A program's `schemas` had the state, the flags, the inbound and internal messages, the operations, the reasons of
rejections and the projection ([decision 0025](0025-operations-and-projections-have-schemas.md)), and nothing for
the sender: the runtime could write the queued message but not who sent it.

An `Origin` is the sender, another entity's address, or the entity itself. The runtime writes the two it owns; the
sender is the program's own type, as the operations are.

## Decision

`schemas.sender` is the codec of `T['sender']`. The runtime stores a queued message's origin with it: `Self` and
an `Entity`'s address are the runtime's, and a `Caller`'s sender goes through this schema.

## Alternatives

- **Storing the origin as it is.** JSON of a value no schema describes: it would read back as whatever the writer
  happened to hold, and a sender's type could change under the stored mailbox with nothing to say so.
- **Keeping the sender out of the mailbox**, and giving `update` the origin only for a message handled in the
  same process. A message handled after a restart would lose its sender, and authorization in `update` with it.

## Consequences

- Every program declares one more schema, as it does for its operations. A program whose callers are not modelled
  uses `Schema.Never`.
- Who may send what is still open, and so is the authorization that is not domain
  ([open questions](../open-questions.md)): this note says only how a sender is written, not who may be one.
