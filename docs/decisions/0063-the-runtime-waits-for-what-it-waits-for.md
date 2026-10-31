# 0063. The runtime waits for what it waits for, and polls nothing

**Status:** accepted, 2026-10-31. Replaces the bullet of [decision 0028](0028-rules-the-runtime-settled.md) that
has a sender to a suspended receiver send again every few milliseconds, and the wait of
[decision 0045](0045-an-operation-waits-for-a-program-not-deployed-yet.md) every `retry` milliseconds.

## Context

Three waits of the runtime looked at the world on a clock. `settled` looked every millisecond whether anything
was under way. An operation that reached a program not deployed yet looked again every `retry` milliseconds
([decision 0045](0045-an-operation-waits-for-a-program-not-deployed-yet.md)), and a sender to a suspended receiver
sent again as often, taking the registry's one permit at each try, for as long as the receiver stayed suspended
([open questions](../open-questions.md#running)). Each look cost something when nothing had changed, and each
answer came up to a period late. `settled` also read the queue of an entity's events, which an event taken off it
and not yet applied had left: a look in between saw the entity idle.

## Decision

- **`settled` waits for something under way to end.** A step, an operation, a reading of the waker, an entity
  leaving the process each complete one signal, which is replaced as it is completed; `settled` takes the signal
  before it looks, and looks again when it is completed, so that nothing ending between its look and its wait is
  missed. An event is counted under way from the moment it is offered until its step is done, so that one taken
  off the queue is not missed either.
- **A deploy wakes the operations waiting for its program.** Each name not deployed yet has one signal, which the
  deploy completes once the deployment is seen.
- **A resumption wakes the senders waiting for it.** A sender registers its wait for the receiver's resumption
  before it sends, so that a resumption between its being answered `Suspended` and its waiting is not missed; the
  step that takes the receiver out of its suspension wakes every sender registered for it, and each sends again
  under the same request id, and gets the stored reply.
- **`retry` is how long a sender waits after the receiver crashed on it**, and nothing else
  ([decision 0046](0046-a-receiver-that-crashes-is-sent-again.md)): a crash is a failure, not a state with an
  event that ends it, and sending again at once could crash it again at once.

## Alternatives

- **A count of what is under way with a latch for `settled`**, which the roadmap proposed. `settled` also waits
  for a stored timer whose time has come and that the waker has not activated yet, which is a time, not a count:
  a signal on every ending, with the same look as before, keeps one definition of what settled means.
- **Retrying a crashed receiver on a signal too.** Nothing signals that a crash will not happen again: the
  receiver is loaded again from what is stored, and a write that failed may fail again.

## Consequences

- A sender to a suspended receiver takes the registry's permit once per resumption, not once per period.
- An operation waiting for a program that is never deployed, or for a receiver that is never resumped, waits for
  ever, as before, and costs nothing meanwhile.
- The runtime's tests can run on a clock they control: no wait of the runtime needs real time to pass, except a
  sleep a test asks for and a crashed receiver's `retry`.
