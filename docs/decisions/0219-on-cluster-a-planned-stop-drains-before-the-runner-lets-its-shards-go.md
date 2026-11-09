# 0219. On Cluster, a planned stop drains before the runner lets its shards go

**Status:** accepted, 2026-11-09. Shows how
[decision 0119](archive/0119-a-planned-stop-drains-the-at-most-once-operations.md) holds on a runner of Effect Cluster.

## Context

[Decision 0119](archive/0119-a-planned-stop-drains-the-at-most-once-operations.md) decided that a runtime launched
with `drain: { millis }` waits, when its scope closes, for the at-most-once operations under way and for the steps
of their completions. Its tests run on one process. A rolling deploy stops each runner of Cluster with `SIGTERM`.
The test of [`examples/server`](../../examples/server/README.md) that stops a runner so launched the runtime without
`drain`, so every operation stopped as in a crash. Whether the drain holds on Cluster was only reasoned. On Cluster a
step commits only while its runner holds the shard's lease
([decision 0175](archive/0175-on-cluster-every-step-checks-the-newest-version-and-the-shards-lease.md)), so the drain
helps only if it ends before the runner unregisters and lets its shards go.

## Decision

- **A runner launched with `drain` that is stopped by `SIGTERM` drains as one process does.** Its at-most-once
  operations under way end, and their completions are committed, before the runner lets its shards go. The runner
  that takes the shards finds each such operation ended, and delivers no `unknown` for it.
- **The server of the orders launches its runtime with `drain` when `DRAIN_MILLIS` is set**, and without it
  otherwise, so that both stops are tested: the test of a runner stopped during its charges runs without the drain,
  and the test of a runner stopped during its emails runs with it.
- **The runtime is launched in a layer built over the runner's `Sharding`.** So the scope that the drain is a
  finalizer of closes before the layer of `Sharding` is released, and the drain runs while the runner still holds
  its shards. An application on Cluster keeps that order.

## What it rests on

- That a runner launched with `drain` and stopped by `SIGTERM` during its emails sends each email once, commits its
  completion, and that the other runner then serves the orders: **tested** by
  `a runner stopped by SIGTERM with a drain sends its emails under way once, and the other runner finishes the orders`
  in [`examples/server/server.test.ts`](../../examples/server/server.test.ts). The test checks that the process is
  still running two seconds after the signal while the world holds the emails, that the world was asked for each
  email once, that every order is answered through the other runner, and that the state stored for every order
  reads its email `Sent`. The test runs off Windows alone, where the CI runs it. On Windows a signal ends a child
  process at once, as a crash does. A run there of the same test, with the signal sent all the same and the short
  lease of the other tests, failed on the last check: the orders of the stopped runner read `Unsure`. So the test
  tells a drain from a crash. The repository does not keep that run.
- That the drain runs before `Sharding` is released: **tested** by the same test, since a completion committed after
  the runner let its shards go would fail the check of the lease, and the order would read `Unsure`. It follows from
  the layers of [`examples/server/server.ts`](../../examples/server/server.ts), in which `Orders` is built over the
  layer of `sharding`, and from a layer releasing what it built before what it was given.
- That `BunRuntime.runMain` interrupts the main fiber on `SIGTERM`, so that the scope of `Layer.launch` closes and
  runs the drain: **tested** by the same test, whose process waits for the emails after the signal.

## Alternatives

- **A drain in the server by default.** The test of a runner stopped during its charges would then no longer show
  what a stop without the drain does, which a process launched without the option still does.

## Consequences

- [`examples/server/main.ts`](../../examples/server/main.ts) reads `DRAIN_MILLIS`, and
  [`examples/server/server.ts`](../../examples/server/server.ts) gives it to `launch`.
- The world of [`examples/server/server.test.ts`](../../examples/server/server.test.ts) records the runner of each
  email and can hold the emails open.
- The question of a planned stop on Cluster leaves [`docs/open-questions.md`](../open-questions.md).
