# 0178. A server of the orders on Cluster is run as a process, on one runner and then on two

**Status:** accepted, 2026-11-08, with the step A server on Cluster of the [roadmap](../roadmap.md). Proposed on
2026-11-07, and read by a review in another session before it was taken.

## Context

The runtime runs on Effect Cluster, and a single test shows it:
[`examples/order/cluster.test.ts`](../../examples/order/cluster.test.ts) builds a runner inside the test's process,
with `Runners.layerNoop`, and calls the door of the orders from the same process. No example runs the runtime as a
deployment runs it. No example has a boundary that a caller reaches over the network. No example has a process that
dies and starts again, and no example has a second runner that takes the shards of one that died. The rules of
decisions [0084](0084-a-step-commits-only-where-the-commit-checks-the-shard.md),
[0159](0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md) and
[0162](0162-on-cluster-an-entitys-shard-is-its-partition-and-each-deployment-serves-its-shards.md) are tested under
the scheduler of the tests, inside one process. They are not tested between processes.

## Decision

- **The example is a process.** `examples/server` runs the orders of [`examples/order`](../../examples/order/order.ts)
  as a server, started by `bun examples/server/main.ts`. It imports the program from `examples/order` and copies
  nothing of it. It runs on a file of SQLite, since on Cluster a step commits only where the commit checks the shard
  ([decision 0084](0084-a-step-commits-only-where-the-commit-checks-the-shard.md)).
- **The boundary speaks HTTP.** A caller creates an order, sends it an event and reads it. An operator resumes and
  discards it. The boundary takes the request id from the header `Idempotency-Key`, and refuses a request that has
  none. It takes the sender from the header `Authorization`. The example's authentication only names the customer,
  and its comment says that a real boundary checks it
  ([decision 0124](0124-the-boundary-authenticates-and-update-authorizes.md)).
- **The world is a server of the test.** The payments, the warehouse and the mailer are a small HTTP server that the
  test runs and the runner calls. The test can hold a charge open there, and it counts the charges by idempotency
  key.
- **The first part has one runner.** A test starts the process, creates and pays an order, and kills the process
  while the charge is held open. It starts the process again on the same file. The order then finishes, and the
  world was charged once for the idempotency key of the charge, however many times the charge was asked.
- **The second part has two runners on one file.** Two processes serve the same file of SQLite, each a runner with
  its own address. They send to each other over HTTP, through `RunnerServer.layer` and `Runners.layerRpc`, built
  under the library's `sharding`. `HttpRunner.layerHttp` builds `Sharding.layer` itself, which would record the
  versions after Cluster registers the runner ([decision 0174](0174-on-cluster-a-runner-deploys-only-the-programs-its-sharding-names.md)).
  A test kills the runner that holds an order's shard while its charge is held open. The other runner takes the
  shard once the lease expires, and the order finishes with one charge. The example shortens
  `shardLockExpiration` so that the test runs in seconds.
- **What the example finds is written down.** A gap of the library that the example meets becomes a note, a test or
  an open question before the step is taken. The example does not work around a gap in silence.

## Agreed with the maintainer

- **The boundary uses `effect/http`.** The module is marked `@stability unstable`, and `src/` does not import it, so
  the example uses it because the maintainer agreed on 2026-11-07. The example imports it, and `src/` still does not.
  `effect/http-api` was not asked for, so the routes are written with `HttpRouter`.
- **The server is `@effect/platform-bun`'s.** `BunClusterHttp.layerHttpServer` gives the `HttpServer` layer, at the
  runner's address, and `BunRuntime.runMain` runs the process. The package is a dependency of development, pinned at the version of `effect`, and a move of
  Effect's version pins it with `effect` and `@effect/sql-sqlite-bun`.

## What it rests on

- That a runner built by `sharding` over `Runners.layerNoop` serves the orders: **tested** in
  [`examples/order/cluster.test.ts`](../../examples/order/cluster.test.ts).
- That a charge asked again after a crash carries the same idempotency key: **documented** in
  [`docs/design.md`](../design.md), which says that a crash runs an idempotent operation again
  ([decision 0011](archive/0011-an-operation-declares-what-a-crash-does.md)), and **tested** by both tests of
  [`examples/server/server.test.ts`](../../examples/server/server.test.ts), in which the world takes one charge for
  each order whatever the number of times it was asked.
- That two processes on one file of SQLite share Cluster's shards through the lease of `cluster_locks`: **read in
  the source** of `cluster/SqlRunnerStorage.ts` at 4.1.2, as [`docs/cluster.md`](../cluster.md#who-holds-an-entity)
  says. That two processes of Bun commit to one file in WAL mode without a failure the runtime does not expect is
  **tested** by the second test of [`examples/server/server.test.ts`](../../examples/server/server.test.ts).
- That a runner whose heartbeat stopped leaves the assignment once its lease expires, whatever `RunnerHealth`
  answers: **read in the source** of `cluster/SqlRunnerStorage.ts` at 4.1.2, whose `getRunners` reads only the
  runners whose `last_heartbeat` is younger than the lease's expiration. A run of the second test with
  `RunnerHealth.layerNoop` in place of `RunnerHealth.layerPing` passed too, which the repository does not keep.
- That `sharding` answers through the `RunnerHealth` it is given whether a runner runs the newest version, so that
  the check of health moves the shards of an older version every `runnerHealthCheckInterval`, a minute by default:
  **read in the code** of [`src/cluster.ts`](../../src/cluster.ts), in `byVersion`, and **documented** in the
  default of `ShardingConfig.ts` at 4.1.2. What the minute costs a deploy is in
  [decision 0159](0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md).
- That `ShardingConfig.layerFromEnv` reads the runner's address from `HOST` and `PORT`, and the lease's expiration
  from `SHARD_LOCK_EXPIRATION`: **read in the source** of `cluster/ShardingConfig.ts` at 4.1.2, whose `config`
  names `host`, `port` and `shardLockExpiration` and whose `configFromEnv` reads them in constant case.
- That a client of SQLite of `@effect/sql-sqlite-bun` writes in WAL mode, so that two processes and the test read
  and write one file: **documented** in the JSDoc of its `SqliteClient` at 4.1.2.
- That `HttpRunner.layerClientProtocolHttp` sends to the path that `RpcServer.layerProtocolHttp` serves on the
  boundary's router: **tested** by the second test, whose orders are created through one runner and stepped by both.
- That `HttpRunner.layerHttp` and `RunnerServer.layerWithClients` build `Sharding.layer`, and that
  `RunnerServer.layer` does not: **read in the source** of `cluster/HttpRunner.ts` and `cluster/RunnerServer.ts` at
  4.1.2.

## Alternatives

- **The structures of Effect.** The modules of the pinned version that a server on Cluster could use were weighed.
  - `SingleRunner.layer` builds `Sharding` itself, as the test's comment says, so the example builds the same layers
    under `sharding`.
  - `HttpRunner.layerHttp` and `HttpRunner.layerHttpOptions` build `Sharding` too. `RunnerServer.layer` with
    `HttpRunner.layerClientProtocolHttpDefault` gives the same transport under `sharding`.
  - `SocketRunner.layer` needs a socket server, which the pinned packages give only on Node.
  - `HttpApi` would give the boundary a schema and an OpenAPI description, at the cost of a second unstable module.
  - `HttpRouter.toWebHandler` with `Bun.serve` would serve the routes with no new dependency, and the process would
    handle its own signals. `@effect/platform-bun` does both, which is what a deployment on Bun uses.
  - `TestRunner.layer` keeps everything in memory, and no process could die and start again on it.
  - `HttpRunner.toHttpEffect` serves the runner's RPCs as one handler, given a `Sharding`. `RunnerServer.layer` over
    `RpcServer.layerProtocolHttp` does the same on the boundary's router, beside its routes.
  - `BunClusterHttp.layer` builds `HttpRunner.layerHttp`, and so `Sharding` too. Its parts are used one by one:
    `BunClusterHttp.layerHttpServer` listens at the runner's address, `ShardingConfig.layerFromEnv` reads the
    runner's address and its lease from the environment, and `RpcSerialization.layerSchemaBinary` and
    `RunnerHealth.layerPing` are its defaults.
- **An example inside a test alone.** It is what `examples/order/cluster.test.ts` is already, and it never kills a
  process.
- **Two runners on PostgreSQL.** On Cluster a step commits only on SQLite until Cluster has a fence
  ([decision 0084](0084-a-step-commits-only-where-the-commit-checks-the-shard.md)).

## What the first part found

- **The first part holds.** [`examples/server/server.test.ts`](../../examples/server/server.test.ts) kills the
  process while the world holds the charge, and starts it again on the same file. The order is `Paid`, the world was
  asked for the charge at least twice, and it took one charge.
- **The example is built of Effect's structures.** The maintainer asked on 2026-11-07 that the example use the
  structures of `effect/http` and of `@effect/platform-bun` wherever they fit. The boundary decodes its headers
  with `HttpServerRequest.schemaHeaders`, its path with `HttpRouter.schemaPathParams` and its bodies with
  `HttpServerRequest.schemaBodyJson`. A request it refuses fails with an error that is
  `HttpServerRespondable.Respondable`, so the router answers it with no handler of its own. The world is called
  through one `HttpClient` with `prependUrl` and `retryTransient`. The test runs the world with `HttpRouter.serve`
  on `BunHttpServer`, starts the process with `ChildProcessSpawner`, waits with `Effect.retry` and a `Schedule`,
  and keeps the world's charges in a `Ref` and its held charge in a `Deferred`.
- **No gap of the library was met.** A restarted runner activates the order that was charging, and the charge runs
  again with its idempotency key, as the design says.

## What the second part found

- **The second part holds.** The second test of
  [`examples/server/server.test.ts`](../../examples/server/server.test.ts) starts two runners on one file, and
  creates and pays sixteen orders through one of them. The world holds the first charge of each order, and records
  in `x-runner` which runner asked. The test checks that the other runner asked for some of them, kills it, and
  releases the charges. Every order is then `Paid`, each charge the killed runner asked for was asked again by the
  runner that is left, and the world took sixteen charges.
- **A runner's boundary and its transport share one server.** The boundary's routes and `RunnerServer.layer`, served
  by `RpcServer.layerProtocolHttp` at `/runner`, are one `HttpRouter`, at the runner's address. A caller of either
  runner reaches every order, since the door's client sends through Cluster to the runner that holds the shard.
- **A runner that dies frees its shards once its heartbeat stops.** `SqlRunnerStorage` stops reading a runner whose heartbeat
  is older than the lease's expiration, so the runner that is left takes the shards with no check of health. The
  ping of `RunnerHealth.layerPing` adds a check of a runner that still beats but does not answer, which no test of
  the example reaches. The same check moves the shards of an older version once a newer one launches, since
  `sharding` answers through it, and it runs every `runnerHealthCheckInterval`, a minute by default. The comment of
  `examples/server/main.ts` says that a deployment that rolls out often shortens it
  ([decision 0159](0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md)).
- **The test waits until both runners hold a lock before it creates the orders.** It reads `cluster_locks` in the
  file until each runner's address holds one. A wait of a fixed time would not do: a runner takes its shards at its
  next reading of the runners, every `refreshAssignmentsInterval`, and a shard another runner lets go may stay free
  for two of them, as the JSDoc of `runnerJoinDebounce` says. The test also checks that the killed runner held some
  of the orders, and fails where it held none.
- **The email is sent once.** The world's client retries a call that carries an idempotency key, since the world
  acts on it once. The email carries none and runs at most once
  ([decision 0011](archive/0011-an-operation-declares-what-a-crash-does.md)), so its client does not retry, and a
  lost answer cannot send it twice.
- **A suspended order is answered `409`.** An HTTP client retries a `503` as transient, as
  `HttpClient.isTransientResponse` does, and a suspended order waits for an operator, not for a retry.
- **A stop on a signal is not tested.** The tests kill each runner with `SIGKILL`. A runner that stops on `SIGTERM`
  unregisters and lets its shards go before its lease expires, which is what a rolling deploy relies on. The
  question is in [`docs/open-questions.md`](../open-questions.md#running).
- **No gap of the library was met.** The runner that is left activates the orders it takes, and their charges run
  again with their idempotency keys.

## Consequences

- The tests of `examples/server` start four processes and run in about ten seconds, so `bun test` runs them every
  time.
- The README's diagram of the modules gains no module, since the example adds none to `src/`.
