# 0051. A deploy that fails leaves nothing running

**Status:** accepted, 2026-10-31. Its consequence that an operation sending to its own program retries until the
deploy is done is changed by [decision 0063](0063-the-runtime-waits-for-what-it-waits-for.md): the deploy wakes it. That it holds of a
deploy interrupted anywhere before it registers, which it did not, is
[decision 0102](0102-a-deploy-interrupted-before-it-registers-undoes-itself.md)'s.

## Context

A deploy activates the entities whose state holds an operation, and dies when one of those activations cannot
finish ([decision 0042](0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md),
[decision 0043](0043-a-row-no-version-reads-fails-what-reads-it.md)). It registered the program before those
activations, and started the waker after them. A deploy that died left the program registered with the entities
it had activated running, their operations included, and no handle to reach them. Operations of other programs
found it and sent to it ([decision 0045](0045-an-operation-waits-for-a-program-not-deployed-yet.md)). Its waker
never started, so it was never known to be idle, and `settled` never returned.

## Decision

- **Everything a deployment runs runs in a scope of its own**, a child of the runtime's: its entities' loops,
  their operations and timers, and its waker.
- **A deploy registers its program only once its activations are done.** One that dies closes the deployment's
  scope, which stops everything it started, and leaves nothing registered. An operation that reaches the program
  meanwhile waits for a deploy that finishes, as for one not made yet (decision 0045).
- A deploy activates the interrupted entities in the order of their ids, so that the same store is activated
  the same way.

## Alternatives

- **Tearing down the entities the deploy loaded, one by one.** The runtime would track each loop's fiber, and
  every new kind of fiber would have to be added to the teardown. A scope stops what it holds, whatever it is.
- **Registering first, and withdrawing on failure.** An operation of another program could have found the
  deployment in between, and would load entities into one that is gone.

## Consequences

- An operation of a deploy's own entities that sends to its own program waits until the deploy is done, a few
  milliseconds of retries ([decision 0028](0028-rules-the-runtime-settled.md)).
- The deployment's scope is also what a second deploy of the same program would close, if a deploy is to take
  over in place ([open questions](../open-questions.md#running)).
- [`src/runtime.test.ts`](../../src/runtime.test.ts) checks that a deploy whose second activation cannot finish
  stops the work the first one started, and leaves the process settled.
