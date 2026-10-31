# 0008. Work that has delivered its message is done

**Status:** accepted, 2026-10-30. What it says of discarding an internal message is replaced, for an operation's
completion, by [decision 0041](0041-a-completion-is-not-discarded.md).

## Context

`durable` is compared with the previous state's by key, and a kept key leaves its work as it is. Each piece of
work delivers one message. When the step that handles that message keeps the key, the rule says to leave the
work as it is, but there is no work left: it has delivered.

A subscription renewed from its credit does this. The renewal timer fires, `update` moves the end of the period
a month on and stays `Active`, and `durable` returns the `renewal` key again, with the new time. Kept, it would
never fire again, and the subscription would stay paid forever, silently.

Worse, it would fire again after a restart: activation computes `durable(state)` and arms what it finds, with
no memory of what had fired. The rule "a kept key leaves its work as it is" gave one answer while the process
lived and another after a crash, against the design's own rule that what runs is always what the state says.

## Decision

Work ends when its message is handled. In the step that handles it, the key counts as gone from the previous
state: if the next state returns it, it is new work, in a new incarnation, with a new idempotency key.

It is the rule activation already follows. A program behaves the same whether or not the process died between
two steps.

## Alternatives

- **Keys that name their occurrence** (`renewal-2026-11`). It works with no new rule, but every program that
  repeats must invent such names, and one that forgets hangs until the next restart, without a defect or a
  test failing.
- **Comparing the work's parameters** (the timer's time). It would arm the timer again here, but not an
  operation, which is a function, and not a timer that comes back at the same time.
- **A defect when a key outlives its message.** It would catch the bug, but the renewal is a legitimate
  program: it would have to pass through a state of its own only to drop the key.

## Consequences

- A repeating timer is written as a state that keeps returning its key. Each firing is a new incarnation, so a
  late duplicate of the previous firing is dropped.
- "Kept" means kept by a step that did not handle the key's own message. Incarnations grow when a key comes
  back after leaving, and when it stays after its work delivered.
- An operation whose completion keeps its key runs again at once, as a new attempt with a new idempotency key,
  as [decision 0004](0004-incarnations-guard-internal-messages.md) wants of any new attempt. A retry that must
  reuse the key, because the provider may have acted, belongs inside the operation.
- A mistake now loops instead of hanging: a timer kept at a time already past fires again at once, and an
  operation kept on its completion runs again without pause. Each turn is a committed step, so the loop is
  visible, but nothing stops it. Whether the runtime should notice is open, with
  [failing operations](../open-questions.md).
- A message discarded by an operator ([decision 0006](0006-a-defect-suspends-the-entity.md)) ends its work as
  if it had been handled: if the stored state still returns the key, the work starts again.
- What happens to a kept key whose parameters change while its work runs is still open
  ([open questions](../open-questions.md)).
