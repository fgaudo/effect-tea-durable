# 0219. A drain holds when an interrupted fiber closes its scope, and on Cluster before the runner lets its shards go

**Status:** accepted, 2026-11-09. Changes
[decision 0119](archive/0119-a-planned-stop-drains-the-at-most-once-operations.md) and
[decision 0120](archive/0120-the-runtime-closes-a-sequential-scope-of-its-own.md), whose drain made its wait
interruptible.

## Context

[Decision 0119](archive/0119-a-planned-stop-drains-the-at-most-once-operations.md) decided that a runtime launched
with `drain: { millis }` waits, when its scope closes, for the at-most-once operations under way and for the steps
of their completions. Its wait was wrapped in `Effect.interruptible`, so that the timeout could end it in a
finalizer that runs uninterruptibly
([decision 0120](archive/0120-the-runtime-closes-a-sequential-scope-of-its-own.md)). Every test of decision 0119
closes the scope from a fiber that was not interrupted.

A process is usually stopped otherwise. `BunRuntime.runMain` interrupts the main fiber on `SIGTERM`, and the scope of
`Layer.launch` then closes in that fiber, with its interruption still pending. The interruptible wait took that
interruption at once. So the drain ended as soon as it began, and every at-most-once operation under way was
stopped as in a crash.

The test of [`examples/server`](../../examples/server/README.md) with a drain found it. The test stops one of two
runners with `SIGTERM` while the world holds the emails, and the process ended within two seconds. Whether the drain
holds on Cluster was the open question "A planned stop on Cluster", which this note decides.

## Decision

- **The drain's wait is as uninterruptible as the finalizer that makes it.** A scope closed by an interrupted
  fiber, as `runMain` closes it on a signal, drains as a scope closed by `Scope.close` does. `Effect.timeoutOption`
  alone ends the wait once `millis` run out.
- **On Cluster, the drain ends before the runner lets its shards go.** An application builds the layer that
  launches the runtime over the runner's `Sharding`, as the server of the orders does. Then the scope the drain is
  a finalizer of closes before the layer of `Sharding` is released. The completion of an at-most-once operation is
  committed in the drain, and recorded in the mailbox as on one process. The runner that takes the shard handles it
  there, and delivers no `unknown` for the operation.
- **The server of the orders launches its runtime with `drain` when `DRAIN_MILLIS` is set**, and without it
  otherwise. The test of a runner stopped during its charges runs without the drain, and the test of a runner
  stopped during its emails runs with it.

## What it rests on

- That a drain holds when the fiber that launched the runtime is interrupted: **tested** by
  `a drain holds when the scope closes as the fiber that launched the runtime is interrupted` in
  [`src/runtime.test.ts`](../../src/runtime.test.ts). With the wait made interruptible again, the test fails, since
  `b` is delivered `unknown`.
- That `Effect.timeoutOption` ends the wait in a finalizer of an interrupted fiber: **tested** by
  `a drain whose launching fiber is interrupted still ends once its millis run out`, and, for a scope closed by
  `Scope.close`, by `an at-most-once operation that outlasts the drain delivers unknown, as after a crash`. It is
  also **read in the dependency's source**, `internal/effect.ts` of the pinned `effect`. There `timeoutOption` is a
  `raceFirst` of the effect and a sleep, and `raceAllFirst` forks each side with `forkUnsafe(parent, effect, true,
  true, false)`, which makes the side interruptible whatever the parent is. The race resumes on the first side to end,
  and interrupts the others when it exits, without waiting for them.
- That a runner launched with `drain` and stopped by `SIGTERM` during its emails sends each email once, and that
  the other runner finishes the orders and finds each email sent: **tested** by
  `a runner stopped by SIGTERM with a drain sends its emails under way once, and the other runner finishes the orders`
  in [`examples/server/server.test.ts`](../../examples/server/server.test.ts). The test checks four things. The
  process still runs two seconds after the signal while the world holds the emails. The world was asked for each
  email once. Every order is answered through the other runner. The state stored for every order reads its email
  `Sent`. The test runs off Windows alone, where the CI runs it, since on Windows a signal ends a child process at
  once. A run on Windows, with the signal sent all the same and the short lease of the other tests, failed on the
  last check, with the orders of the stopped runner reading `Unsure`. So the test tells a drain from a crash. The
  repository does not keep that run.
- That the drain ends before `Sharding` is released: **tested** by the same test, since a completion stepped after
  the runner let its shards go would fail the check of the lease
  ([decision 0175](archive/0175-on-cluster-every-step-checks-the-newest-version-and-the-shards-lease.md)). It follows
  from the layers of [`examples/server/server.ts`](../../examples/server/server.ts), in which `Orders` is built over
  the layer of `sharding`, and from a layer releasing what it built before what it was given.
- That on Cluster a completion committed in the drain is handled by the next activation, from the mailbox: **seen**
  in a run on Windows, not kept, that built the server in the test's process, closed it during an email by
  interrupting its fiber, and built a second server on the same file. The state read `Sending` after the first
  closed, and `Sent` once the second had started, with one email asked for.
- That `BunRuntime.runMain` interrupts the main fiber on `SIGTERM` and waits for it to end: **read in the
  dependency's source**, `NodeRuntime.ts` of `@effect/platform-node-shared`, which `BunRuntime` re-exports.
- That the `kill` of a child process returns only once the process has ended, so that the test sends the signal in
  a fiber of its own and looks at the process meanwhile: **documented** in the module's JSDoc of
  `NodeChildProcessSpawner.ts` of `@effect/platform-node-shared`. A run of the test in CI that waited for `kill`
  waited for the whole drain, since the emails were released only after it.

## Alternatives

- **A wait in a fiber of its own, joined by the finalizer.** It would hold no pending interruption either. It adds a
  fork, which every fork of the runtime must drop the transaction for
  ([decision 0164](archive/0164-two-rules-of-the-runtime-are-kept-by-the-form-of-the-code-and-a-test-reads-it.md)),
  for what the race already does.
- **A drain in the server by default.** The test of a runner stopped during its charges would then no longer show
  what a stop without the drain does, which a process launched without the option still does.

## Consequences

- [`src/runtime.ts`](../../src/runtime.ts): the drain's wait is no longer wrapped in `Effect.interruptible`.
- [`src/runtime.test.ts`](../../src/runtime.test.ts): `stopped` can close the first process by interrupting its
  fiber, and two tests of `a planned stop` do.
- [`examples/server/main.ts`](../../examples/server/main.ts) reads `DRAIN_MILLIS`, and
  [`examples/server/server.ts`](../../examples/server/server.ts) gives it to `launch`. The world of
  [`examples/server/server.test.ts`](../../examples/server/server.test.ts) records the runner of each email and can
  hold the emails open.
- The question of a planned stop on Cluster leaves [`docs/open-questions.md`](../open-questions.md).
