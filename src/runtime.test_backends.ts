/**
 * A rule of one process that the design says holds on Cluster too, run on both: on one process, and on Cluster with
 * two runners on one SQLite file (decision 0283). `everywhere` registers the rule as a group of its name, with a test
 * on each backend, so that a note that names the rule names the group. The tests of `src/runtime.test.ts` import it,
 * and no module of the library does (decision 0241).
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { afterAll, beforeAll, describe, test } from 'bun:test'
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
import { launch as launchOnCluster, sharding } from './cluster.ts'
import type { Program, Types } from './program.ts'
import { type Handle, launch } from './runtime.ts'
import type { Dialect } from './storage.ts'
import { client } from './storage.test_databases.ts'
import { hands } from './runtime.test_shared.ts'

/**
 * What a rule's test is given of its backend. `deploy` gives the handles of a program, one for each runner, each
 * call of the test made through one of them. `own` gives a name of the test's own: the runs on Cluster share its
 * runners and their file, so every id and request id a test names goes through it. The clock is real on both
 * backends, since Cluster's runners poll it.
 */
export type Backend = Readonly<{
  name: string
  deploy: <T extends Types>(program: Program<T>) => Effect.Effect<ReadonlyArray<Handle<T>>>
  own: (name: string) => string
}>

const shardsPerGroup = 12
const shards = Array.from({ length: shardsPerGroup }, (_, i) => ShardId.make('default', i + 1))

/** A runner of the runtime on `file`, at `port`, which runs and deploys `programs` with the toy's hands. */
const runner = (file: string, port: number, programs: ReadonlyArray<Program<any>>) =>
  Effect.gen(function*() {
    const context = yield* Layer.build(
      sharding(programs).pipe(
        Layer.provideMerge(Runners.layerNoop),
        Layer.provideMerge(SqlMessageStorage.layer),
        Layer.provide([Layer.orDie(SqlRunnerStorage.layer), RunnerHealth.layerNoop]),
        Layer.provideMerge(ShardingConfig.layer({
          runnerAddress: Option.some(RunnerAddress.make('localhost', port)),
          shardsPerGroup,
          refreshAssignmentsInterval: Duration.millis(50),
          runnerHealthCheckInterval: Duration.millis(50),
          shardLockRefreshInterval: Duration.millis(100),
          // SQLite's `CURRENT_TIMESTAMP` counts whole seconds, and a lease of 1 s drops a runner that has just beaten.
          shardLockExpiration: Duration.seconds(3),
          entityMessagePollInterval: Duration.millis(10),
          entityReplyPollInterval: Duration.millis(10),
        })),
        // Each runner its own connection, as a runner of its own process has.
        Layer.provideMerge(SqliteClient.layer({ filename: file })),
        Layer.provide(Digest.layerWebCrypto),
      ),
    ).pipe(Effect.orDie)
    const runtime = yield* Effect.provide(launchOnCluster({ sweep: 'none' }), context)
    const { layer } = yield* hands()
    const handles = new Map<string, Handle<any>>()
    for (const program of programs) {
      // The toy's programs need its hands alone, which `layer` gives.
      const deployed = Effect.provide(Effect.provide(runtime.deploy(program), layer), context)
      handles.set(program.name, yield* (deployed as Effect.Effect<Handle<any>>))
    }
    const held = context.mapUnsafe.get(Sharding.Sharding.key) as Sharding.Sharding['Service']
    return { handles, held: () => shards.filter((shard) => held.hasShardId(shard)).length }
  })

/**
 * Registers the rules of `programs`, each with a test on one process, on each dialect of `dialects`, and a test on
 * Cluster. Cluster's two runners start once for the rules registered, in a hook, since a start waits for the shards,
 * and the rules share them.
 */
export const everywhere = (programs: ReadonlyArray<Program<any>>) => {
  const cluster = {
    directory: '',
    scope: undefined as Scope.Closeable | undefined,
    runners: [] as ReadonlyArray<ReadonlyMap<string, Handle<any>>>,
  }
  beforeAll(async () => {
    cluster.directory = mkdtempSync(join(tmpdir(), 'effect-tea-persistent-test-'))
    const scope = cluster.scope = Effect.runSync(Scope.make())
    const file = join(cluster.directory, 'store.db')
    cluster.runners = await Effect.runPromise(Scope.provide(
      Effect.gen(function*() {
        const first = yield* runner(file, 1, programs)
        const second = yield* runner(file, 2, programs)
        // Each runner holds some shards, so that a call through either meets entities of the other.
        yield* Effect.repeat(Effect.sync(() => [first.held(), second.held()]), {
          schedule: Schedule.spaced('25 millis'),
          until: ([a, b]) => a! > 0 && b! > 0 && a! + b! === shardsPerGroup,
        }).pipe(Effect.timeout('30 seconds'), Effect.orDie)
        return [first.handles, second.handles]
      }),
      scope,
    ))
  }, 60_000)
  afterAll(async () => {
    if (cluster.scope !== undefined) await Effect.runPromise(Scope.close(cluster.scope, Exit.void))
    rmSync(cluster.directory, { recursive: true, force: true })
  })
  let tests = 0
  return (
    name: string,
    body: (backend: Backend) => Effect.Effect<void, unknown>,
    dialects: ReadonlyArray<Dialect> = ['sqlite'],
  ) =>
    describe(name, () => {
      for (const dialect of dialects) {
        test(`on one process, on ${dialect === 'pg' ? 'PostgreSQL' : 'SQLite'}`, () =>
          Effect.runPromise(
            Effect.scoped(Effect.gen(function*() {
              const runtime = yield* launch({ sweep: 'none' })
              const { layer } = yield* hands()
              return yield* body({
                name: 'one process',
                deploy: <T extends Types>(program: Program<T>) =>
                  Effect.map(
                    Effect.provide(runtime.deploy(program), layer) as Effect.Effect<Handle<T>>,
                    (handle) => [handle],
                  ),
                own: (name) => name,
              })
            })).pipe(Effect.provide(client(dialect)), Effect.orDie),
          ))
      }
      test('on Cluster', () => {
        const prefix = `t${tests++}`
        return Effect.runPromise(body({
          name: 'Cluster',
          deploy: <T extends Types>(program: Program<T>) =>
            Effect.sync(() => cluster.runners.map((handles) => handles.get(program.name) as Handle<T>)),
          own: (name) => `${prefix}/${name}`,
        }).pipe(Effect.orDie))
      })
    })
}
