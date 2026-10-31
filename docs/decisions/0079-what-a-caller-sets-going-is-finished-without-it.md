# 0079. What a caller sets going is finished without it

**Status:** accepted, 2026-10-31. Changes [decision 0067](0067-each-entity-is-held-by-its-own-lock.md) on which fiber
holds an entity's lock while it is activated or created, and keeps the rule of
[decision 0042](0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md) that an interruption is the
process's crash. On Cluster an activation a request needs runs in the request's transaction, not detached, by
[decision 0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md).

## Context

A caller that reached an entity this process did not hold activated it in its own fiber, under the entity's lock:
it registered the entity, applied its `Restart` and forked its loop. A creation did the same after its commit. A
caller may give up halfway — a timeout of its own, or an operation stopped because its entity was suspended or
unloaded while it sent — and an interruption was taken for the process's crash, so the activation was left where
it stood. An entity registered without its loop took the events of the next callers and handled none, and they
waited for ever. A creation interrupted after its commit left the entity stored with operations and not loaded:
nothing ran them until a caller came, since only timers wake an unloaded entity
([decision 0029](0029-an-idle-entity-is-unloaded.md)).

## Decision

- **An activation and a creation run detached from their caller**, in a fiber of the deployment's scope, which the
  caller waits for. A caller that gives up stops waiting, and the activation or the creation is finished all the
  same: only the process's crash, which closes the scope, stops it halfway, as the crash table says.
- **The entity's lock is taken by that fiber**, which finds the entity again, loads and activates it, and offers
  the caller's event, in one hold of the lock: a freshly loaded entity holds its caller's event before it can be
  unloaded, as before. An entity the process holds is found and given its event in the caller's own fiber, with
  no fork.
- **`settled` waits for what runs detached**, counted from the step that forks it to its end: a creation whose
  caller gave up is work under way until its operations are started.

## Alternatives

- **Uninterruptible activations.** A caller would wait for them, and so would a crash of the process: the crash
  table's tests stop a process at a point it never returns from, which an uninterruptible region would wait at
  for ever.
- **Tearing an interrupted activation down**, as a crash of the entity. The entity would be left unloaded, and a
  creation's work unstarted until a caller came: what an interruption must not leave.
- **Activating in a detached fiber and finding the entity again in the caller.** Between the two the entity holds
  no event, and a process over its capacity could unload it before its caller reaches it; two callers to two
  entities could push each other out for ever.

## Consequences

- A caller that gives up while its entity is activated leaves its registration behind, which the entity's reply
  or crash clears, as for any caller registered.
- An activation and a creation cost a fork; a message to an entity held costs none.
- [`src/runtime.test.ts`](../../src/runtime.test.ts) interrupts the caller of an activation held at its `Restart`,
  and answers the next caller; and interrupts a creator after its commit, and sees its operations run. Each fails
  or hangs without this decision, and the second without `settled` counting what runs detached.
