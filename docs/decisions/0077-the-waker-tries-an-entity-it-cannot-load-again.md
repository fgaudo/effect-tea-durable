# 0077. The waker tries an entity it cannot load again, after the retry

**Status:** accepted, 2026-10-31. Decides [an entity the waker cannot load](../open-questions.md#running).

## Context

An event the runtime cannot finish crashes its entity alone
([decision 0042](0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md)): a caller is given the defect,
and the next one loads the entity again. The waker, the fiber that activates the unloaded entities whose stored
timer is due ([decision 0029](0029-an-idle-entity-is-unloaded.md)), had no such caller behind it: an activation
that failed — a write that failed, a row no version reads
([decision 0043](0043-a-row-no-version-reads-fails-what-reads-it.md)) — killed the fiber, and every timer of the
program stopped with it, for the life of the process. Skipping the entity alone is not enough: the next reading
gives it as due again, at once, and the fiber would spin on it.

## Decision

- **An activation the waker cannot finish crashes its entity alone, and the waker goes on** with the other
  entities whose time has come. An interruption is still the process's crash, and stops it.
- **The entity is tried again after `retry`**, the option a sender waits before sending again to a receiver that
  crashed ([decision 0046](0046-a-receiver-that-crashes-is-sent-again.md)). Until then the waker's readings leave
  it out, as they leave out the entities the process holds, and the waker sleeps until the earlier of the next
  timer and the next retry.
- **`settled` counts a retry whose time has come as a timer due**: work the process has not activated yet.

## Alternatives

- **Leaving the entity out for the life of the process**, until a caller loads it. A write that failed once
  would stop an entity no caller reaches, a subscription billed every month, until the process is restarted.
- **Retrying at once, or on the next reading.** One row no version reads would keep the waker busy for ever, and
  the process never settled, for an entity that only a deploy can fix.
- **Suspending the entity.** A suspension is the program's defect, stored with the message it died on
  ([decision 0006](0006-a-defect-suspends-the-entity.md)); a failed activation is the runtime's, and stores
  nothing ([decision 0061](0061-only-what-the-program-does-is-its-defect.md)).

## Consequences

- An entity that can never be loaded, such as one a later version wrote, is tried once each `retry` by a process
  of an older version, and fails each time, until a deploy that reads it. How an operator sees it is part of
  [suspended entities](../open-questions.md#running): nothing tells one yet.
- A deploy whose activation of an interrupted entity fails still fails as a whole
  ([decision 0051](0051-a-deploy-that-fails-leaves-nothing-running.md)).
- [`src/runtime.test.ts`](../../src/runtime.test.ts) unloads two entities, fails the waker's first activation of
  one, and sees the other's timer fire, and the first's only once the retry has passed.
