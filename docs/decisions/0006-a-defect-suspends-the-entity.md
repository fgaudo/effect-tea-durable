# 0006. A defect suspends the entity

**Status:** accepted, 2026-10-30.

## Context

effect-tea ends the run on a defect, which suits one app on one phone. A server runs many entities, and an
entity whose message died is given that message again after a restart, and dies again.

## Decision

A defect in `update`, `durable`, `project` or an operation suspends the entity. Its state stays as stored
before the message, the message stays unhandled, nothing more is delivered, and its operations stop. An
operator resumes it, once the code is fixed, or discards the message. The suspension is reported with the
entity's id, the message and the cause.

## Alternatives

- **Ending the process.** One entity's bug stops all of them, and the restart meets the same message.
- **Skipping the message.** The bug is silenced, and the state goes on as if the message never came.
- **Retrying.** A defect is broken code: it fails the same way each time.

## Consequences

- The runtime needs a list of suspended entities, and a way to resume them or discard their message.
- Callers of a suspended entity wait, or get an answer saying it is suspended; which one is open.
