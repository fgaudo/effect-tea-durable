# 0061. Only what the program does is its defect

**Status:** accepted, 2026-10-31.

## Context

A step, an activation, a creation and the recording of an operation's message each caught every exception
thrown while they ran, and suspended the entity on it as a defect of the program
([decision 0006](0006-a-defect-suspends-the-entity.md)). A bug of the machine itself — a `TypeError` in
`renew` — or a machine the runtime gave it corrupted suspended the entity too, and an operator was asked to fix a
program that had done nothing wrong, while the runtime's own failures crash the entity
([decision 0042](0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md)).

## Decision

- **Each call of the program is caught on its own**: `init`, `update`, `durable`, `project`, each index, a
  runner's `unknown`, and each schema that encodes what is stored. What one throws is the program's defect, with
  what it threw as the cause.
- **A rule of the design the program breaks is its defect too**: a key it does not declare, an operation with no
  runner, an operation dropped or changed before its completion, an internal message `update` rejects, a program
  of another name. So is a value a cast lets through where work is read that is no work at all.
- **Anything else thrown while an event is applied is the runtime's**: it leaves the machine's step, and the
  runtime crashes the entity on it, as on a write that fails; the rehearsal fails the test.
- **`update` gives a defect by throwing**, as `defect` does, and not as a value beside a rejection: every exception
  of `update` is already its defect, and a value would be a second way to say it, which a program could forget to
  return where it throws.

## Alternatives

- **Catching everything, as before.** One rule, but an entity is suspended for what its program never did.
- **A defect returned by `update` as a value.** A step could tell a defect from a bug of `update` that throws; both
  are bugs of the program, which the operator fixes the same way.

## Consequences

- A suspension always names something the program did, and a fixed program is what resumes it.
- A machine whose stored rows are corrupted crashes its entity at every activation, as a row no version reads does
  ([decision 0043](0043-a-row-no-version-reads-fails-what-reads-it.md)), instead of suspending it.
