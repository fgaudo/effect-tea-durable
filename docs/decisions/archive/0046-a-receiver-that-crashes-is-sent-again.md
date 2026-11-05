# 0046. A receiver that crashes is sent to again

**Status:** accepted, 2026-10-31. That a sender takes a crash as it takes `Suspended` is changed by
[decision 0063](0063-the-runtime-waits-for-what-it-waits-for.md): a sender to a suspended receiver waits for its
resumption, and `retry` is the wait after a crash alone. A sender to a full receiver sends again after `retry` too,
since [decision 0147](../0147-an-entity-holds-a-bounded-number-of-callers-messages.md), and is never given `Full`.

## Context

An event the runtime cannot finish gives its waiting callers the defect, for them to retry
([decision 0042](0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md)), and so does a row of a version
the program does not have ([decision 0043](0043-a-row-no-version-reads-fails-what-reads-it.md)). An operation
that sends does not retry: the defect was its own, and suspended the sender, which was not at fault, until an
operator resumed it, even when the failure was transient. The same held for an operation that creates an entity.

## Decision

- **A crash of the receiver is no reply yet.** `send` and `create` from an operation take it as `send` takes
  `Suspended` ([decision 0010](0010-a-rejection-may-carry-a-reason.md)): they wait `retry` milliseconds and send
  again, under the same request id, and get the stored reply if the event that crashed had committed.
- **A defect of the sender's own stays its defect**, and suspends it: a message its schema cannot encode
  ([decision 0040](0040-what-is-stored-encodes-to-json-as-it-is.md)), and a creation `init` dies on
  ([decision 0017](0017-creation-in-the-machine.md)). Sending them again would give the same defect for ever.
- A caller outside the runtime is given every defect, as before: it retries at its own pace.

## Alternatives

- **Retrying every defect.** A message that does not encode would be sent again for ever, and the sender's bug
  would never show as its suspension.
- **Retrying a few times, then dying.** How many tries make a failure not transient depends on the store, and a
  receiver that comes back after the last one would find its sender suspended for nothing.
- **Giving the operation the defect, as before.** The sender is suspended for the receiver's failure, which a
  suspension exists to keep apart ([decision 0006](0006-a-defect-suspends-the-entity.md)).

## Consequences

- A receiver that keeps crashing, or a row no deployed version reads, keeps its senders waiting for ever, and
  nothing says so: it joins the question of how long a sender waits before someone is told
  ([open questions](../../open-questions.md#running)).
- [`examples/booking`](../../../examples/booking) checks that a booking whose hold the inventory crashed on holds its
  seats, and is not suspended.
