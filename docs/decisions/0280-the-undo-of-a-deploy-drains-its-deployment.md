# 0280. The undo of a deploy drains its deployment

**Status:** accepted, 2026-11-12, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the fix of bug 67. It changes
[decision 0051](archive/0051-a-deploy-that-fails-leaves-nothing-running.md) and
[decision 0102](archive/0102-a-deploy-interrupted-before-it-registers-undoes-itself.md): with a drain, a deploy that
fails before it registers waits for its at-most-once operations before it closes its scope. It changes
[decision 0261](0261-the-drain-reaches-a-deployment-still-activating.md), which left that case out. The maintainer
chose it on 2026-11-12, after an opinion of a Fable 5.2 agent.

## Context

A deploy that fails before its deployment is registered undoes all of it, interruption included (decision 0102). The
undo closes the deployment's scope at once, so every operation the deploy started is interrupted
(decision 0051). An at-most-once operation interrupted so delivers `unknown` at the next activation
([decision 0011](archive/0011-an-operation-declares-what-a-crash-does.md)).

A planned stop drains the at-most-once operations
([decision 0119](archive/0119-a-planned-stop-drains-the-at-most-once-operations.md)). It reaches a deployment still
activating (decision 0261). But a process is usually stopped by an interruption of its main fiber, as `runMain` does
on `SIGTERM`, and the main fiber may still be deploying. The interruption reaches the deploy first, and the launch's
scope closes only once the deploy has unwound. So the undo closed the deployment's scope before the drain began. Each
at-most-once operation that an activation of the deploy had started was interrupted and delivered `unknown`, though
it could have ended within the drain's time. That is bug 67 of the roadmap.

The undo cannot tell the interruption of a planned stop from any other, as a caller's `Effect.timeout`, since it
runs before the launch's scope begins to close.

## Decision

- **With a drain, the undo of a deploy drains its own deployment before it closes the deployment's scope.** It stops
  the deployment's waker, timers and operations that run again at once, as the drain does. It then waits for the
  at-most-once operations of the deployment and for the steps of their completions, up to the drain's `millis`.
  Then it closes the scope, as decision 0102 says.
- **It holds of every undo**, an interruption or a failure alike, and whether the process stops or goes on. A
  launch without a drain undoes a deploy as before, at once.
- **A deployment that the undo drains arms no timer and starts no operation that runs again.** A flag of its own,
  `draining` of the deployment, keeps it in `start` and `arm` of `src/runtime/loop.ts`, beside the process's flag.
  The process's flag stays unset, so a caller of another program is not held while the undo waits.
- **The undo waits for its own deployment alone**, and not for what runs detached in the rest of the process.
- **The activation that the deploy was waiting for ends in the undo's wait.** It runs in the deployment's scope, and
  its step commits. Its at-most-once operations start, and the undo waits for them. Its other operations do not
  start.
- **On Cluster, the round of a shard's activation starts no activation once the undo began.** The round runs in the
  deployment's scope, and would otherwise go on activating entities in the undo's wait.
- **The undo's wait is uninterruptible**, as the drain's is
  ([decision 0219](0219-a-drain-holds-when-an-interrupted-fiber-closes-its-scope.md)). The handler of the undo
  already runs outside the `restore` of `deploy`.
- **The name stays claimed while the undo waits.** A second deploy of the same name at once is refused as deployed
  already, for up to `millis`. A deploy made again after the first fails is not, since its caller waits for the undo.

So a stop that interrupts the main fiber's deploy may wait twice the drain's time: once in the undo, then once in the
drain. Each wait is `millis` at most.

## What it rests on

- That a planned stop which interrupts the main fiber's deploy waits for the at-most-once operations of the deploy,
  and ends as soon as they end: **tested**, by
  `a planned stop that interrupts the deploy of the main fiber waits for its at-most-once operations`, in
  [`src/runtime.test.ts`](../../src/runtime.test.ts). It fails against the undo that closes the scope at once.
- That the activation the deploy waits for ends in the undo's wait, and starts its at-most-once operation and none of
  the others: **tested**, by the same test, which releases the activation of `toy-2` once the undo began.
- That a deploy that fails while the process goes on drains its deployment, holds no caller of another program, and
  gives its name back: **tested**, by
  `a deploy that dies as it activates drains its deployment, while the process goes on`.
- That the undo waits `millis` at most, and that its caller is answered then and not before, with `millis` of 0 and
  of 100: **tested**, by
  `a deploy whose at-most-once operation outlasts the undo's 0 millis fails after them, and delivers unknown` and the
  same test at 100 millis. Both hang without the timeout.
- That a step in the undo's wait starts no operation that runs again and arms no timer: **tested**, by
  `a completion in the undo's wait starts no operation that runs again, and arms no timer`. It fails without the
  deployment's flag in `start`, and without it in `arm`.
- That a drain under way ends once the undo of a deploy that died in it ends: **tested**, by
  `a drain under way ends once the undo of a deploy that died in it ends`. The closing of the scope ends what the
  drain waits for, and that end tells the drain to look again. A signal of the undo's own was tried, and the test
  passes without it, so the code has none.
- That the undo's wait holds while the interruption of the main fiber is pending: **tested**, by the first test
  above, whose stop is still waiting once the interruption is sent and until `b` ends.
- That `Effect.timeoutOption` ends a wait in an uninterruptible region with the fiber's interruption pending:
  **tested**, at the drain's finalizer, by the tests of decision 0219. The undo's handler is a region of the same
  kind, and its tests of the timeout run with no interruption pending.
- That the round of a shard's activation on Cluster starts no activation once the undo began: **open**. On Cluster
  the deploy registers its door and its singletons and goes on to its registration without waiting for a round, so
  an undo while a round runs falls between the singletons and the registration. No test reaches it yet. A test of
  `src/cluster.test.ts` that fails a deploy there, while a round activates an entity with an at-most-once operation,
  would check it. The check of the round is a guard, and the case stays in the
  [open question](../open-questions.md#running) A drain on Cluster with a deploy under way.
- That a deploy that fails holds its caller up to `millis`, and that a stop may take twice `millis`: **chosen**, by
  the maintainer, with the option of the Fable 5.2 agent.

The premises of decision 0102 read again. That an interruption in an `uninterruptible` region lets the region end
still holds, seen in its spike. That a deploy interrupted at any point keeps its name with a deployment or leaves
nothing running still holds: its test runs with no drain, where the undo is as before. With a drain the undo ends by
the same closing of the scope, after its wait, and the second test above deploys the program again once it ends. The premises of decision 0119 read again: the drain's stop and wait are the same
code, which the undo now calls too, and its tests pass. The premises of decision 0261 read again: the drain still
counts every deployment in `made`, and a deployment the undo drains stays in `made` until its scope is closed. The
drain's stop is now a function of its own, which adds yields to the drain, so the deviation that the test of decision
0261 pins moved from `{ decision: 80, choice: 1 }` to `{ decision: 82, choice: 1 }`. Under every
deviation the test fails against the pin's mutation at the new deviation, and `bun run test:pins` holds it.

## Alternatives

- **The undo leaves the scope to the drain.** The undo cannot tell a planned stop from another interruption, so a
  deploy given up by its caller would leave its entities running, unreachable, which decision 0102 forbids.
- **No fix: a deploy interrupted is a crash of its deployment.** Decisions 0119 and 0261 are made so that a planned
  stop delivers no `unknown` to an operation that could have ended, and a signal during the start of a process is a
  common case.
- **One deadline shared by the undo and the drain.** A deploy that fails while the process goes on would spend a
  time that no stop asked for, and the two waits would have to agree on when it began.

## Consequences

- [`src/runtime.ts`](../../src/runtime.ts): the undo of `deploy` drains the deployment, the drain's stop is `quiesce`,
  and `emptied` takes the deployments it waits for.
- [`src/runtime/process.ts`](../../src/runtime/process.ts): a deployment has `draining`.
- [`src/runtime/loop.ts`](../../src/runtime/loop.ts): `start` and `arm` read it.
- [`src/runtime/doors.ts`](../../src/runtime/doors.ts): the round of a shard's activation reads it.
- `docs/design.md` says what a planned stop does to a deploy under way.
