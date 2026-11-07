/**
 * What a `RunnerHealth` that answers by version does to two runners, at `effect` 4.1.2, on one SQLite file. Both
 * runners read one record of the version each runs, as a table of the database would hold it. A runner is alive only
 * while no runner of a newer version is registered.
 *
 * The first test sees a rolling deploy. The older runner holds every shard alone. Once the newer one registers, the
 * health check marks the older unhealthy, the older gives up its shards, and the newer takes every one. The older
 * runner still runs and is still registered, and it takes no shard back while the newer runs.
 *
 * The second test sees what the health check leaves open. A runner registers itself as healthy when it starts, and
 * again whenever it misses itself among the runners `getRunners` returns. An older runner started again is healthy
 * until the next health check, and holds shards meanwhile. `runnerHealthCheckInterval` is one minute by default.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import {
  RunnerAddress,
  RunnerHealth,
  Runners,
  Sharding,
  ShardingConfig,
  ShardId,
  SqlMessageStorage,
  SqlRunnerStorage,
} from 'effect/cluster'
import { Digest } from 'effect/crypto'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schedule from 'effect/Schedule'
import * as Scope from 'effect/Scope'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const shardsPerGroup = 12
const shards = Array.from({ length: shardsPerGroup }, (_, i) => ShardId.make('default', i + 1))

type Start = (port: number, version: number) => Effect.Effect<() => number, never, Scope.Scope>

// Two runners on one SQLite file, each a `Sharding` of its own, as two processes would be. The lease is 3 s, since
// SQLite's `CURRENT_TIMESTAMP` counts whole seconds, and a lease of 1 s drops a runner that has just beaten.
const cluster = async (healthCheck: Duration.Input, run: (start: Start) => Effect.Effect<void, unknown, Scope.Scope>) => {
  const directory = mkdtempSync(join(tmpdir(), 'effect-tea-durable-spike-'))
  const store = SqliteClient.layer({ filename: join(directory, 'store.db') })
  // The version each runner runs, by its port, as the runtime would record it at launch.
  const versions = new Map<number, number>()
  const health = Layer.succeed(RunnerHealth.RunnerHealth, {
    isAlive: (address) => Effect.sync(() => (versions.get(address.port) ?? 0) >= Math.max(0, ...versions.values())),
  })
  const runner = (port: number) =>
    Sharding.layer.pipe(
      Layer.provideMerge(Runners.layerNoop),
      Layer.provideMerge(SqlMessageStorage.layer),
      Layer.provide([Layer.orDie(SqlRunnerStorage.layer), health]),
      Layer.provide(ShardingConfig.layer({
        runnerAddress: Option.some(RunnerAddress.make('localhost', port)),
        shardsPerGroup,
        refreshAssignmentsInterval: Duration.millis(50),
        runnerHealthCheckInterval: healthCheck,
        shardLockRefreshInterval: Duration.millis(100),
        shardLockExpiration: Duration.seconds(3),
      })),
    )
  const start: Start = (port, version) =>
    Effect.gen(function*() {
      versions.set(port, version)
      // Each runner its own connection, as a runner of its own process has: a layer built once is shared.
      const own = SqliteClient.layer({ filename: join(directory, 'store.db') })
      const context = yield* Layer.build(runner(port).pipe(Layer.provide(own))).pipe(
        Effect.provide(Digest.layerWebCrypto),
      )
      const sharding = context.mapUnsafe.get(Sharding.Sharding.key) as Sharding.Sharding['Service']
      return () => shards.filter((shard) => sharding.hasShardId(shard)).length
    }).pipe(Effect.orDie)
  try {
    await Effect.runPromise(Effect.scoped(run(start)).pipe(Effect.provide(store)) as Effect.Effect<void, unknown>)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

const until = (count: () => number, done: (n: number) => boolean) =>
  Effect.repeat(Effect.sync(count), { schedule: Schedule.spaced('25 millis'), until: done }).pipe(
    Effect.timeout('15 seconds'),
  )

test('a runner a newer version outranks gives up its shards, and takes none back', () =>
  cluster(Duration.millis(50), (start) =>
    Effect.gen(function*() {
      const older = yield* start(1, 1)
      yield* until(older, (n) => n === shardsPerGroup)

      const newer = yield* start(2, 2)
      yield* until(newer, (n) => n === shardsPerGroup)
      expect(older()).toBe(0)

      // The older runner runs on, and is read forty times more, about as many checks of health.
      const seen: Array<number> = []
      yield* Effect.repeat(Effect.sync(() => void seen.push(older())), {
        schedule: Schedule.spaced('50 millis'),
        times: 40,
      })
      expect(Math.max(...seen)).toBe(0)
      expect(newer()).toBe(shardsPerGroup)
    })), 30_000)

test('an older runner started again holds shards until the next health check', () =>
  cluster(Duration.seconds(4), (start) =>
    Effect.gen(function*() {
      const newer = yield* start(2, 2)
      yield* until(newer, (n) => n === shardsPerGroup)

      // An older runner starts, as an orchestrator might start again a process of the last deploy.
      const scope = yield* Scope.make()
      const older = yield* Scope.provide(start(1, 1), scope)
      yield* until(older, (n) => n > 0)

      // The next health check marks it unhealthy, and it gives its shards back.
      yield* until(older, (n) => n === 0)
      yield* until(newer, (n) => n === shardsPerGroup)
      yield* Scope.close(scope, Exit.void)
    })), 30_000)
