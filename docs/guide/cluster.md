# Effect Cluster

This page runs a program on several processes at once, with Effect Cluster. Its code is the runner of the orders in
[`examples/order/cluster.test.ts`](../../examples/order/cluster.test.ts), and the server of
[`examples/server`](../../examples/server), which serves the orders over HTTP and is killed during a charge. `bun
test` runs both. Read the guide's [first page](README.md) before it: this page uses its words for a step, an
operation and the boundary. The words in bold are defined in [`glossary.md`](../glossary.md), and
[`design.md`](../design.md#on-effect-cluster) is the specification behind each rule.

## Contents

- [When a program needs Cluster](#when-a-program-needs-cluster)
- [A runner](#a-runner)
- [The program does not change](#the-program-does-not-change)
- [A server of its own process](#a-server-of-its-own-process)
- [Shards, and a runner that dies](#shards-and-a-runner-that-dies)
- [A new version](#a-new-version)
- [What changes for a caller](#what-changes-for-a-caller)
- [The rules, in one list](#the-rules-in-one-list)

## When a program needs Cluster

On one process, a runtime holds its database until it ends, and a second runtime on the same database dies as it
launches. So a process that dies stops serving every entity until it is started again. A deploy of a new version
stops the old process first, and callers wait for the new one.

On Effect Cluster several processes, the **runners**, share the entities. Each entity is served by one runner at a
time, and a runner that dies leaves its entities to the others. A new version is rolled out runner by runner. A
runner on this page is always Cluster's process, and never the function in `operations` that runs an operation.

**On Cluster the runtime runs on one machine, on one file of SQLite that every runner shares.** A step commits only
where its commit checks that its runner still holds the entity, and SQLite is where that check holds until Cluster
has a fence. So Cluster gives a program availability across processes, and not across machines yet. A program that
needs neither runs on one process, on SQLite or PostgreSQL, and this page is not for it.

## A runner

A runner is a layer of Cluster's, with the library's `sharding` in place of Cluster's `Sharding.layer`:

```ts
import { SqliteClient } from '@effect/sql-sqlite-bun'
// …
import {
  RunnerAddress,
  RunnerHealth,
  Runners,
  ShardingConfig,
  SqlMessageStorage,
  SqlRunnerStorage,
} from 'effect/cluster'
import { Digest } from 'effect/crypto'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
// …
import { launch, sharding } from '@fgaudo/effect-tea-persistent/cluster'

// …

const runner = (filename: string) =>
  sharding([order]).pipe(
    Layer.provideMerge(Runners.layerNoop),
    Layer.provideMerge(SqlMessageStorage.layer),
    Layer.provide([Layer.orDie(SqlRunnerStorage.layer), RunnerHealth.layerNoop]),
    Layer.provideMerge(ShardingConfig.layer({ runnerAddress: Option.some(RunnerAddress.make('localhost', 34431)) })),
    Layer.provideMerge(SqliteClient.layer({ filename })),
    Layer.provide(Digest.layerWebCrypto),
  )
```

This is the layer Cluster's `SingleRunner.layer` builds, a cluster of one process. `SingleRunner.layer` cannot be
used as it is, since it builds `Sharding` itself. **`sharding(programs)` names every program the runner serves.** It
records the version of each before Cluster registers the runner, and a runner deploys only the programs it named,
at the versions it named. A process with no `runnerAddress` holds no entity: it is a client of the cluster alone,
and deploys any program.

`sharding` also creates the runtime's tables, before any runner registers, so that two runners started together do
not race to create them.

## The program does not change

The runtime of a runner is the `launch` of `@fgaudo/effect-tea-persistent/cluster`, and its handle is the one a
process gives:

```ts
const runtime = yield* launch()
const orders = yield* Effect.provide(runtime.deploy(order), world)

for (const id of ['o-1', 'o-2']) {
  expect(
    yield* orders.create(id, {
      flags: { order: { customer: 'ada', totalInCents: 1_000 } },
      requestId: `c-${id}`,
      sender: ada,
    }),
  ).toEqual({ _tag: 'Created' })
}
const pay = { _tag: 'PayRequested', payment: 'card-1' } as const
expect(yield* orders.send('o-2', pay, { requestId: 'p-o-2', sender: ada, keep: 'forever' })).toEqual({ _tag: 'Accepted' })
// A retry under the same request id is answered from what Cluster stored, and charges nothing again.
expect(yield* orders.send('o-2', pay, { requestId: 'p-o-2', sender: ada, keep: 'forever' })).toEqual({ _tag: 'Accepted' })
```

The program, its rehearsals and its boundary are the same on one process and on Cluster. A program written for one
process moves to Cluster by its launcher alone. Each program is served through a **door**, an entity of Cluster's
under the program's name. Every request to an entity goes through Cluster's client of its door, from whatever
runner sends it: a caller's, an operator's, and an operation's request to another entity.

## A server of its own process

The server of [`examples/server`](../../examples/server/server.ts) runs as a deployment does. Each runner is a
process, started with the file it shares and its own address:

```bash
DATABASE=orders.db WORLD_URL=http://localhost:4000 HOST=localhost PORT=3000 bun examples/server/main.ts
```

The runners send to each other over HTTP, beside the boundary's routes, and Cluster's `ShardingConfig` reads the
rest of its settings from the environment. The runtime is launched and the orders deployed in the layer's scope,
so they stop when the server stops. Given `DRAIN_MILLIS`, the runtime is launched with `drain`, and a stop waits
that long for the emails under way. The layer is built over the runner's `Sharding`, so the drain ends before the
runner lets its shards go. The completion of each email is committed, and the runner that takes the shard handles
it ([decision 0219](../decisions/0219-a-drain-holds-when-an-interrupted-fiber-closes-its-scope.md)):

```ts
const orders = (settings: Settings) =>
  Layer.effect(
    Orders,
    Effect.flatMap(
      launch(settings.drain === undefined ? {} : { drain: settings.drain }),
      (runtime) => runtime.deploy(order),
    ),
  ).pipe(
    Layer.provide(world(settings.world)),
    Layer.provideMerge(
      sharding([order]).pipe(
        Layer.provide(RunnerHealth.layerPing),
        Layer.provideMerge(Runners.layerRpc),
        Layer.provide(HttpRunner.layerClientProtocolHttp({ path: runnerPath }).pipe(Layer.provide(FetchHttpClient.layer))),
        Layer.provideMerge(SqlMessageStorage.layer),
        Layer.provide(SqlRunnerStorage.layer),
        Layer.provideMerge(RpcSerialization.layerSchemaBinary()),
        Layer.provideMerge(SqliteClient.layer({ filename: settings.filename })),
        Layer.provide(Digest.layerWebCrypto),
        Layer.orDie,
      ),
    ),
  )
```

Its tests start the server as processes and kill them. An order whose process is killed during its charge is paid
once, by the process started again on the same file. With two runners, the one that survives finishes the orders
of the one killed, and charges each once. A runner launched with `DRAIN_MILLIS` and stopped by `SIGTERM` sends the
emails under way once, and the other runner finds them sent.

## Shards, and a runner that dies

Each entity belongs to a **shard**, and each shard is held by one runner. An entity's shard is its partition of the
log, so the log has as many partitions as Cluster has shards, 300 by default. A runner that dies stops its
heartbeat, and once its lease of a shard expires another runner takes the shard. That runner starts again the work
of each of the shard's entities, as a process started again does. An operation that runs at least once runs
again, under the key it was given, and one that runs at most once delivers its message for the case not known.

**Every step commits only while its runner holds the entity's shard.** It reads the shard's lease in its own
transaction, and a step whose runner lost the shard dies and rolls back. So two runners never both write a step of
one entity, even while a lease moves.

Cluster keeps no entity's state of its own. The runtime keeps its entities, its timers and its idle entities as on
one process, and Cluster's limits on resident entities are left unbounded.

## A new version

A new version is rolled out by starting runners of it beside the old ones, and stopping the old ones. Three rules
keep two versions from writing one entity:

- **A launch older than the newest version recorded dies**, so a rollback is refused. A fault is fixed by a newer
  version, as on one process ([no way back](schemas.md#no-way-back)).
- A runner of an older version is no longer healthy for Cluster once a newer one launches, so its shards move to
  the newer runners. `RUNNER_HEALTH_CHECK_INTERVAL`, a minute by default, is how long that takes, and a deployment
  that rolls out often shortens it.
- **Every step commits only while its program's version is the newest recorded.** A step of an older runner that
  still holds a shard dies and rolls back. It is tried again until a runner of the newest version that holds the
  shard steps it.

A rename of a program runs on Cluster too, by the launch's `renames`. A request Cluster saved under the old name is
delivered to the new program.

## What changes for a caller

The handle is the same, and three things differ:

- **A caller is never answered `Full` on Cluster.** A caller's message waits in Cluster's table, and Cluster's own
  `mailboxCapacity` bounds the messages in memory.
- **A caller that stops waiting stops only its wait.** A timeout or an interruption leaves the request in Cluster's
  table. The request is handled when its turn comes, and a retry under the same request id gets its answer.
- **A message sent with `keep: 'forever'` keeps Cluster's rows for ever.** The boundary gives `keep`, the time its
  protocol retries for, with every `send`. Once that time is past, the next step of the entity deletes the rows, or
  the sweep does, which one runner runs for each program. A boundary that runs on Cluster gives a time to every message, since the rows of each
  reply would otherwise add up. The server gives a day, the time its clients retry a request for:
  `orders.send(id, message, { ...caller, keep: { millis: 86_400_000 } })`. On one process a reply kept
  `'forever'` is kept for ever too, and a time frees it. `create` takes no `keep`: a creation is answered from
  the entity's row, which is kept for ever, as every entity is. On Cluster the creation's request and reply go at
  the next sweep once its client has the answer, and a retry after is answered `Created` from the entity's row.

## The rules, in one list

1. **On Cluster the runtime runs on one machine**, on one file of SQLite that every runner shares, until Cluster has
   a fence.
2. **A program does not change for Cluster.** Its launcher builds a runner with `sharding` and launches the runtime
   of `./cluster`.
3. **`sharding` names every program a runner serves**, at its version, and a runner deploys only those.
4. **Every step commits only while its runner holds the shard and runs the newest version.** Anything else dies
   and rolls back, and is tried again on a runner that does.
5. **A new version rolls out runner by runner, and an older one never launches again.**
6. **A caller is never answered `Full`, an interrupted caller leaves its request, and every `send` carries
   `keep`.**
