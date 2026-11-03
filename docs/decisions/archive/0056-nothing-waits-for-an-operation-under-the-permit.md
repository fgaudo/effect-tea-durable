# 0056. Nothing waits for an operation under the permit

**Status:** accepted, 2026-10-31. Its permit is replaced by a lock of the entity's own in
[decision 0067](0067-each-entity-is-held-by-its-own-lock.md): a crash still forks the interruption of its work, so
that nothing waits for it under that lock, and an unload stops its timers under it.

## Context

An event the runtime cannot finish crashes its entity: the entity leaves the process, its work stops, and its
callers are given the defect ([decision 0042](0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md)).
The crash is made under the registry's one permit, so that no caller is between finding the entity and offering
its event ([decision 0029](0029-an-idle-entity-is-unloaded.md)). It interrupted the entity's operations there,
and an interruption waits for the operation's finalizers. While a request to a slow service closed, every `send`
and `create` to any entity of any program waited for it, and so did every load and unload; the crashed entity's
own callers were given the defect only once it had closed.

## Decision

- **A crash forks the interruption of its entity's work**, in the deployment's scope, and goes on: the entity
  leaves the process, its callers are given the defect, and the permit is released, while the operations stop.
- An unload still stops its work under the permit, since an entity is unloaded only with nothing but timers
  under way, whose interruption waits for nothing.

## Alternatives

- **Interrupting once the permit is released.** A crash is made from three places — the entity's loop, an
  activation, a creation — two of which hold the permit for more than the crash; each would carry the work to
  stop out of it. A fork is one line, where the crash is.
- **Interrupting without waiting at all, and never knowing when the operations stopped.** The deployment's scope
  would no longer hold them, and a deploy that fails would leave them running
  ([decision 0051](0051-a-deploy-that-fails-leaves-nothing-running.md)). The fork is in that scope, so closing it
  still waits for every operation.

## Consequences

- An operation of a crashed entity may still be stopping when the next caller loads the entity again, and the
  activation starts the operation anew. Its delivery says what that may do, as after a crash of the process: an
  idempotent operation runs again under the same idempotency key, an at-least-once one may act twice, and an
  at-most-once one is not run again but delivers its `unknown`
  ([decision 0011](0011-an-operation-declares-what-a-crash-does.md)). What the one stopping delivers goes to the
  events of an entity nothing reads any more.
- `settled` does not wait for the operations of a crashed entity to stop: they are no longer the process's work.
- [`src/runtime.test.ts`](../../../src/runtime.test.ts) crashes an entity whose operation takes until the end of the
  test to stop, and reaches another entity meanwhile.
