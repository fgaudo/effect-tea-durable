# 0022. A new program keeps how its work is delivered, and its name

**Status:** accepted, 2026-10-30. Replaces the consequence of
[decision 0015](0015-a-request-belongs-to-its-sender.md) on renaming a program. Its rename outside the runtime is replaced by
[decision 0156](../0156-a-program-is-renamed-by-its-launch-and-keeps-its-keys.md), which renames a program at its
launch.

## Context

[Decision 0020](0020-a-new-program-is-checked-against-the-stored-work.md) checks a new program against the
operations it finds under way, by value. A review of the decisions for what a new program may change under work
already started found two more things the operation started with, which the value does not hold.

- **How it is delivered.** The runner, not the operation, says whether a crash runs it again
  ([decision 0011](0011-an-operation-declares-what-a-crash-does.md)), and an activation asked the new program's.
  A deploy that turned an at-most-once email into an at-least-once one sent it again, where it had to deliver
  `unknown`.
- **The program's name.** It is in every idempotency key and in the address other entities store replies under
  ([decision 0015](0015-a-request-belongs-to-its-sender.md)), and an activation took it from the new program. A
  deploy that renamed the program restarted a charge under another key, and a request to another entity was
  applied again. Decision 0015 accepted it, before the machine promised that an operation keeps its key.

## Decision

- The runtime stores, with each operation under way, how the program that started it delivers it. A new program
  that delivers it otherwise before its completion is a defect at activation, as one that changes its value is.
- An entity's name is the name of the program that created it: with its id, its address. A program of another
  name is a defect at activation, even one brought while the entity is suspended, which shows when it is
  resumed.
- Renaming a program is a migration of what is stored under its name, outside the machine: its entities, and
  the replies stored for them by others. It is open with
  [schemas that change](../../open-questions.md#storage-and-reading).

## Alternatives

- **Delivering by the runner that started it.** An at-most-once operation would deliver `unknown` under a
  program whose runner has none to build.
- **Accepting a safer delivery** (an at-least-once operation turned at most once, which may deliver `unknown`
  where it ran before). It needs a ranking of the three kinds that an idempotent one, which passes its key on,
  does not fit, for a deploy that can wait until the operation completes.
- **The name from the program, as before.** Every rename would restart the work under way under new keys, and
  orphan the replies other entities stored for it.

## Consequences

- An operation runs under the idempotency key and the delivery it started with, through crashes, resumptions
  and deploys: what the machine's tests check.
- A deploy that changes a runner's kind waits for the operations of that kind to complete, as one that changes
  their value does.
- A program with no runner for an operation it finds stored delivers it otherwise: it is the same defect.
