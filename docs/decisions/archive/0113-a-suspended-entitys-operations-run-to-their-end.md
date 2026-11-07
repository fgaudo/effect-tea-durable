# 0113. A suspended entity's operations run to their end

**Status:** accepted, 2026-11-03. Replaces the part of
[decision 0006](0006-a-defect-suspends-the-entity.md) that stops the operations of an entity that suspends,
and the premise of [decision 0029](0029-an-idle-entity-is-unloaded.md) that nothing of a suspended entity
runs. Decides the first half of the roadmap's step on suspended entities, with
[decision 0114](0114-an-operator-sees-the-suspended-entities-and-what-a-resume-did.md).

## Context

A defect suspends the entity: its state stays as it was, the message it died on stays unhandled, and nothing is
delivered to it until an operator resumes it ([decision 0006](0006-a-defect-suspends-the-entity.md)). Decision
0006 also stops everything under way, and the runtime interrupts the entity's operations and timers. An operation
under way is an effect on the world, a charge or an email, which the entity started because its state said so. The
defect that suspends the entity is another message's, or another operation's: it says nothing of that charge.

What the interruption costs is what the design works to avoid. At the resumption, the entity is activated as after
a crash, by what the stored state holds ([decision 0003](0003-durable-work-derived-from-state.md)): an
idempotent or at-least-once operation runs again, and an at-most-once one is not run, since it may have acted, and its
`unknown` is delivered instead ([decision 0011](0011-an-operation-declares-what-a-crash-does.md)). A charge
interrupted because an unrelated message died runs again, or ends in `unknown`. The open question asked whether a
suspension should stop only the handling of messages, and let the work under way record its completions.

The machine already handles a completion that waits in the mailbox at an activation: a key whose message is already
queued is not started again ([decision 0014](0014-rules-the-machine-settled.md), kept by the machine's test
`what runs is what the stored state says, unless its message is already in the mailbox`). So a completion recorded
while the entity is suspended costs the machine no new rule at the resumption.

## Decision

- **A suspension stops the handling of messages, and disarms the timers.** The operations under way run to their
  end. Their completions are recorded in the mailbox, behind the message the entity died on, and are handled once
  the entity is resumed, in the order they were recorded. The runtime interrupts an operation only when the entity
  leaves the process: a crash, or a passivation once its operations have ended.
- **An operation still running at the resumption is kept, not started again.** The activation of a resumed entity
  starts the work the stored state holds, except the keys whose completion waits in the mailbox and the keys whose
  operation is still running in the stored incarnation. A `Restart` keeps none: the process died, and so did its
  operations.
- **An operation that dies while the entity is suspended leaves the suspension as it is.** The suspension keeps its
  first cause and what it died on; the operation leaves what runs, and is started again at the resumption, as
  after a crash. The same holds of an operation whose completion does not encode.
- **The timers stay disarmed.** A firing is derived from the state and the clock, and costs nothing to arm again:
  the resumption arms every timer the state holds, and one whose time has passed fires at once.
- **A suspended entity is unloaded once its operations have ended**, with the message it died on and the
  completions behind it. While one runs, the entity is busy, as any entity with an operation under way.

## What it rests on

- That the machine keeps an operation running through a suspension, and starts none whose completion is queued or
  whose run goes on, at the resumption: **tested**, `an operation under way when the entity suspends runs to its end,
  and is kept at the resumption`, in [`src/machine.test.ts`](../../../src/machine.test.ts), with the properties `a defect
  suspends the entity, with its state and its mailbox as they were` and `a suspended entity handles nothing, and its
  operations run to their end`.
- That the runtime stops the timers alone, records the completion, unloads the entity only once its operations have
  ended, and runs none of them again once resumed: **tested**, `an operation under way when its entity suspends runs
  to its end, and is not run again once resumed`, in [`src/runtime.test.ts`](../../../src/runtime.test.ts).
- That a restart loses the operations under way, and an at-most-once one delivers `unknown`: **tested**, `a crash
  loses nothing stored, and an at-most-once operation under way delivers its unknown`, in
  [`src/machine.test.ts`](../../../src/machine.test.ts), unchanged by this note.

## Alternatives

- **Stopping everything, as decision 0006 did.** Simple to state: nothing of a suspended entity runs. It costs a
  second run, or an `unknown`, to every operation under way at every suspension, for a defect that is not theirs.
- **Letting the timers fire too, and queueing the firings.** A firing waits in the mailbox as a completion does, so
  the machine would handle it. But a timer is armed again at the resumption at no cost, while a firing kept while
  the entity is unloaded would wake it for nothing: the waker would have to load a suspended entity to record a
  firing it cannot handle, which [decision 0029](0029-an-idle-entity-is-unloaded.md) leaves out of its
  readings. Nothing is gained.
- **Replacing the suspension's cause when an operation dies while the entity is suspended.** The operator would
  see the last defect, not the one to fix first; the first is the one that stopped the handling, and the operation
  that died runs again at the resumption, where its defect suspends the entity anew if it stands.

## Consequences

- [`src/machine.ts`](../../../src/machine.ts): `suspend` keeps the operations in `running`, `activate` keeps one still
  running in the stored incarnation, a `Die` or a completion that does not encode on a suspended entity removes the
  operation from `running` and changes nothing stored, and a `Restart` clears `running` before it activates.
- [`src/runtime.ts`](../../../src/runtime.ts): on `Suspended`, the timers stop and the operations go on.
- The glossary's `Suspended`, and the design's section on defects, say what a suspension stops.
