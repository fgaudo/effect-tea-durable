# 0014. The rules the pure machine settled

**Status:** accepted, 2026-10-30.

## Context

Writing the runtime's semantics as a machine ([decision 0013](0013-the-runtime-is-a-pure-machine.md)) met cases
the design did not decide. Each is decided here, since the machine must answer them.

## Decision

- **A step's checks.** A step is stored only if `durable` and `project` succeed on its next state. One that dies
  in either is a defect, like one in `update`: a stored state can always be read and run.
- **An internal message `update` rejects is a defect.** Incarnations make a late answer impossible
  ([decision 0004](0004-incarnations-guard-internal-messages.md)), so an internal message that arrives is the
  work's one message, and rejecting it would lose what the world did.
- **A key whose kind changes is new work.** A timer that becomes an operation under the same key is disarmed,
  and the operation starts in a new incarnation. An operation that becomes a timer drops the operation: it is a
  defect ([decision 0005](0005-an-operation-leaves-only-by-completing.md)).
- **Activation skips work whose message is in the mailbox.** It has delivered, and its message will be handled.
- **A completion or a firing of work not under way is dropped at once**, and one already in the mailbox whose
  work has left, or moved to another incarnation, is dropped when its turn comes.
- **A retry of a message still in the mailbox waits** for the first one's reply.
- **A suspended entity still gives its stored replies.** A retry of a request already answered gets its reply,
  read from storage; any other message is answered `Suspended`.
- **Resuming a suspended entity activates it as after a crash**: an at-most-once operation it stopped delivers
  its `unknown` ([decision 0011](0011-an-operation-declares-what-a-crash-does.md)). A fixed program may replace
  the one that died; one whose `durable` or `project` dies on the stored state leaves the entity suspended.
- **Discarding a message.** A discarded internal message ends its work, which starts again, in a new
  incarnation, if the state still returns its key ([decision 0008](0008-delivered-work-is-done.md)): that work
  never ran, so an at-most-once operation starts instead of delivering `unknown`. A discarded inbound message
  stores no reply, and its caller's retry is handled as a new message.
- **A defect at creation.** When `init`, `durable` or `project` dies on the first state, nothing is stored.
- **Time in a rehearsal** stands at the start's time, and moves to a timer's time when it fires later: a message
  is handled at the latest time the scenario reached.

## Alternatives

- **Checking only `update`.** A state that `durable` dies on would be stored, and every activation would die on
  it, with no message to discard.
- **Rejecting an internal message as nothing.** It is effect-tea's rule for an answer that came too late, which
  cannot happen here.
- **A key that keeps its incarnation across kinds.** The timer's firing would be taken as the operation's
  completion.

## Consequences

- An operator who discards an inbound message leaves its caller to retry, which may meet the same defect.
- What a creator is answered for a defect at creation is open, with
  [who may send what](../open-questions.md#programs).
