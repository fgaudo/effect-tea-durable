# 0042. An event the runtime cannot finish crashes its entity

**Status:** accepted, 2026-10-30. Its permit is replaced by a lock of the entity's own in
[decision 0067](0067-each-entity-is-held-by-its-own-lock.md).

## Context

Each entity is one loop that applies its events: the machine's step, a transaction, and then the answers and the
work ([decision 0028](0028-rules-the-runtime-settled.md)). Nothing caught a defect in that loop. A write that
failed, a hook that died, or a runner that threw while it built its effect — outside its fiber, while the event
that started it was acted on — ended the loop, and left the entity registered in the process with nobody taking
its events. Every caller after it waited for ever, and its timers never fired again.

## Decision

- **A runner's effect is built in the operation's fiber.** A runner that throws while it builds its effect dies
  as the operation, and suspends the entity on it ([decision 0006](0006-a-defect-suspends-the-entity.md)).
- **An event the runtime cannot finish is a crash of its entity alone.** The entity leaves the process, its
  operations and timers stop, and every caller waiting on it is given the defect. What is stored is what its next
  activation starts from, as after a crash of the process: the next caller loads it, and its stored timers are
  the waker's again. It is done under the registry's permit, so that no caller is between finding the entity and
  offering its event.
- **An activation that cannot finish leaves nothing loaded**, and its caller gets the defect.
- An interruption is the process's crash, not the entity's, and is left to the scope that closes.

## Alternatives

- **Suspending the entity.** A suspension is a defect of the program, stored with the entity
  ([decision 0006](0006-a-defect-suspends-the-entity.md)). A failed write is the runtime's, and cannot itself be
  written; the next activation may well succeed.
- **Dying the process.** One entity's failure would stop the others, which a suspension exists to avoid.
- **Retrying the event in the loop.** A failure that is not transient would loop on it, holding the entity.

## Consequences

- A caller may get a defect for a message whose event committed: it retries under the same request id, and gets
  the stored reply, as after a crash of the process.
- The waker, which loads the entities whose timers are due, still dies with an activation that fails. Whether it
  should skip an entity it cannot load, and how often it tries it again, is not decided.
