# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## Next

- **A server on Cluster.** `examples/server` runs the orders of `examples/order` as a process on a file of SQLite,
  behind a boundary of HTTP, as [decision 0178](decisions/0178-a-server-of-the-orders-on-cluster-is-run-as-a-process.md)
  proposes. It has two parts.
  1. One runner. A test kills the process during a charge, starts it again on the same file, and checks that the
     order finishes with one charge.
  2. Two runners on one file, sending to each other over HTTP. A test kills the runner that holds an order's shard,
     and checks that the other one takes the shard and finishes the order with one charge.

  The first part is done, in `examples/server`, and decision 0178 says what it found. The second part is next. It
  begins in `examples/server/server.ts`, where the runner gains `RunnerServer.layer` and `Runners.layerRpc` over
  HTTP in place of `Runners.layerNoop`, with a `shardLockExpiration` the test shortens. A gap of the library that a part meets
  becomes a note, a test or an open question before the step is taken.

## Later

- **The library's name and release**, once there is code to publish. It is released as experimental while it depends
  on Effect's unstable modules ([decision 0099](decisions/archive/0099-a-library-on-unstable-modules-is-released-as-experimental.md)).
  The release archives the notes the design has come to cover since the last archiving, as
  [`AGENTS.md`](../AGENTS.md) says. It passes `bun run test:release`, which runs every seed of the explored tests.

- **The runtime on Cluster across machines, on PostgreSQL**, once Cluster has a fence
  ([Effect-TS/effect#10058](https://github.com/Effect-TS/effect/issues/10058)), or the runtime one of its own. Until
  then a step commits only where the commit checks the shard, which on Cluster is SQLite
  ([decision 0084](decisions/0084-a-step-commits-only-where-the-commit-checks-the-shard.md)). A fence of the runtime's
  own waits for tests on a server of PostgreSQL with a pool, which the open question of many connections asks for.

- **A model of the runtime's protocol on Cluster**, in TLA+ or a model checker like it, if the tests on Cluster
  keep finding interleavings between runners. The model checks every state the protocol reaches within its bounds:
  the shards a runner holds and lets go, a step's commit that checks the shard, and two versions at once
  (decisions 0084, 0159 and 0162). A model proves the protocol and not the code, so the tests stay.
