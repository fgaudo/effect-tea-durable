# 0120. The runtime closes a sequential scope of its own

**Status:** accepted, 2026-11-04. Corrects what [decision 0119](0119-a-planned-stop-drains-the-at-most-once-operations.md)
and [decision 0080](0080-a-database-is-held-by-one-runtime.md) rest on: a scope runs its finalizers in the
reverse order of their adding only when its strategy is sequential. Corrects too what decision 0119 says of
`Scope.close`'s documentation. Found by the review of 0098 to 0119. The drain's wait is no longer made
`interruptible`, since a scope closed by an interrupted fiber ended it at once, by
[decision 0219](../0219-a-drain-holds-when-an-interrupted-fiber-closes-its-scope.md).

## Context

`launch` puts three things in the scope its caller gives it. It holds the database there, and lets it go as the
scope closes ([decision 0080](0080-a-database-is-held-by-one-runtime.md)). It forks `running` there, the scope
that everything of the runtime runs in. And with `drain`, it adds the drain as a finalizer, after `running`
([decision 0119](0119-a-planned-stop-drains-the-at-most-once-operations.md)). Both notes rest on the scope running
its finalizers in the reverse order of their adding. Then the drain runs while everything still runs, and
the database is let go once everything has stopped.

A scope has a strategy, `"sequential"` or `"parallel"`, which its maker chooses (`Scope.make` in `Scope.ts`). The
documentation of `Scope.close` says that "finalizers run in the scope's configured order", and its example and that
of `Scope.addFinalizer` run them in reverse under a sequential scope. A parallel scope runs them all at once
(`scopeCloseFinalizers` in `internal/effect.ts`, read in the source). Launched in a parallel scope, the runtime
closed `running` while the drain began, so every at-most-once operation was interrupted, and would deliver `unknown`
as without the option. And the database was let go while the entities still ran, so a second runtime could hold it.

Decision 0119 also says that the documentation of `Scope.close` does not say whether a finalizer runs
uninterruptibly. At 4.1.2 it does: "By default, finalizers run uninterruptibly, so interrupting the closing fiber
waits for them to finish; a finalizer can explicitly restore interruptibility."

## Decision

- **`launch` forks a scope of its own from its caller's, sequential whatever the caller's strategy is**, and puts
  the hold of the database, `running` and the drain in it, in that order. The caller's scope closes it as one
  finalizer, and it closes the three in reverse.
- What decisions 0080 and 0119 decide is unchanged. The drain's wait stays `interruptible` around its timeout: a
  finalizer runs uninterruptibly by default, which is now documented, and the guard is what lets the timeout
  interrupt the wait.

## What it rests on

- That a parallel scope runs its finalizers at once: **read in the source**, `scopeCloseFinalizers` in
  `internal/effect.ts` at 4.1.2. That the order is the scope's strategy's: **documented**, `Scope.close` in
  `Scope.ts`. **Tested**: `a drain holds in a scope that closes its finalizers in parallel`, in
  [`src/runtime.test.ts`](../../../src/runtime.test.ts), which does not end without this note. That the at-most-once
  operation then delivers `unknown` is **reasoned** from the source: the test hangs before the next process reads it.
- That a scope forked without a strategy, or with `"sequential"`, runs its finalizers in reverse: **documented**,
  `Scope.fork` in `Scope.ts`, whose strategy "defaults to `"sequential"`", and the example of `Scope.addFinalizer`.
- That a finalizer runs uninterruptibly by default, and may restore interruptibility: **documented**, `Scope.close`
  in `Scope.ts` at 4.1.2.

## Alternatives

- **Requiring a sequential scope of the caller.** `launch` cannot read the strategy from its type, and a caller who
  passes a parallel one would lose the drain in silence.
- **Running the drain inside `running`'s closing.** `running` closes the deployments' scopes, which stop everything
  the drain waits for; the drain would have to run before them, which is the order this note keeps.

## Consequences

- [`src/runtime.ts`](../../../src/runtime.ts): `launch` forks its sequential scope, and provides it to the hold.
- [`src/runtime.test.ts`](../../../src/runtime.test.ts): a process can be launched in a parallel scope, and the test above.
