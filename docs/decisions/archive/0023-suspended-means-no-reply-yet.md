# 0023. `Suspended` means no reply yet

**Status:** accepted, 2026-10-30. Replaces what [decision 0010](0010-a-rejection-may-carry-a-reason.md) and
[decision 0014](0014-rules-the-machine-settled.md) said a caller of a suspended entity is answered. An operation's wait for a resumption ends once its entity crashes, by [decision 0274](../0274-an-entity-is-not-loaded-while-the-stop-of-its-former-run-is-running.md).

## Context

[Decision 0010](0010-a-rejection-may-carry-a-reason.md) answers a caller of a suspended entity `Suspended`, not
stored, and has it retry. A review of the machine found the answer meant two things, and a third case with none:

- **The message the entity died on** was answered `Suspended`, and stayed at the head of the mailbox, to be
  applied once the entity was resumed. For its caller, `Suspended` meant "queued".
- **A message that arrives while the entity is suspended** was answered `Suspended`, and not queued. For its
  caller, `Suspended` meant "not applied".
- **A message queued behind the head**, or waiting when an operation died, was answered nothing until the entity
  was resumed, perhaps a week later.

A caller cannot tell the first two apart, and need not: both get the true reply by retrying under the same
request id, since a request is applied once. The third has no answer to act on.

## Decision

- `Suspended` is not a reply: it says that the request has none yet, and nothing of whether its message is
  queued. The caller retries under the same request id, and gets the stored reply once the entity is resumed and
  the message handled.
- When the entity suspends, on a message, an operation or an activation, every caller whose message waits in the
  mailbox is answered `Suspended`. Their messages stay queued.
- A message that arrives while the entity is suspended is answered `Suspended`, and not queued: nothing is
  delivered to a suspended entity ([decision 0006](0006-a-defect-suspends-the-entity.md)). A retry once it is
  resumed is handled as a new message.
- A retry of a message still queued, once the entity is resumed, waits for its reply, as before
  ([decision 0014](0014-rules-the-machine-settled.md)). A retry of a request already answered gets its stored
  reply, suspended or not.

## Alternatives

- **Queueing the messages that arrive while suspended.** `Suspended` would mean "queued" for everyone, but the
  mailbox would grow for as long as the entity is suspended, and a resumed entity would apply messages their
  callers gave up on long before.
- **Leaving the queued callers waiting.** A suspension lasts until an operator acts; a caller cannot hold a
  request open that long, and learns nothing by timing out that `Suspended` would not tell it.
- **Two answers, `Queued` and `Suspended`.** A caller does the same with both: it retries under the same id.

## Consequences

- A caller handles `Suspended` as it handles a lost connection: by retrying under the same request id, at its
  own pace. Exactly-once holds, since the request is applied once whichever retry finds it.
- An operator who discards the message the entity died on leaves its caller's retry to be handled as a new
  message, as [decision 0014](0014-rules-the-machine-settled.md) says.
- `send` still waits instead of returning `Suspended`
  ([decision 0010](0010-a-rejection-may-carry-a-reason.md)): its retries are this rule, done for the operation.
