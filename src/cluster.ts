/**
 * The runtime on Effect Cluster: the `Sharding` a runner of the runtime runs, built once the runner's versions are
 * recorded, with a `RunnerHealth` that keeps the shards off a runner of an older version (decision 0159). The rest
 * of the runtime on Cluster is the roadmap's step Effect Cluster, and not code yet.
 */
import {
  type MessageStorage,
  type RunnerAddress,
  RunnerHealth,
  type Runners,
  type RunnerStorage,
  Sharding,
  ShardingConfig,
} from 'effect/cluster'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import { SqlClient } from 'effect/sql'
import { type Program, type Types, versionOf } from './program.ts'
import { createTables, outranked, recordVersions } from './storage.ts'

/** The text a runner's address is recorded under. */
export const addressText = (address: RunnerAddress.RunnerAddress): string => `${address.host}:${address.port}`

/**
 * A `RunnerHealth` that answers a runner alive only where `launched` does, and where the runner runs the newest
 * version of every program it runs (decision 0159). A runner without the runtime is answered by `launched` alone.
 * A failure to read the versions answers as `launched` does: the check by the commit keeps the rows of a newer
 * version from an older runner without it.
 */
export const byVersion = (
  launched: RunnerHealth.RunnerHealth['Service'],
  sql: SqlClient.SqlClient,
): RunnerHealth.RunnerHealth['Service'] =>
  RunnerHealth.RunnerHealth.of({
    isAlive: (address) =>
      Effect.flatMap(launched.isAlive(address), (alive) =>
        alive
          ? outranked(addressText(address)).pipe(
            Effect.provideService(SqlClient.SqlClient, sql),
            Effect.map((older) => older !== true),
            Effect.catch(() => Effect.succeed(true)),
          )
          : Effect.succeed(false)),
  })

/**
 * Cluster's `Sharding` for a runner that runs `programs`. It records the version of each program under the
 * runner's address first, and dies if one is older than the newest a launch recorded, so that a runner of an older
 * version never registers (decision 0159). It gives `Sharding` the `RunnerHealth` of `byVersion` over the one the
 * launcher provides. A process with no `runnerAddress`, a client of the cluster alone, records nothing.
 */
export const sharding = (
  programs: ReadonlyArray<Pick<Program<Types>, 'name' | 'migrations'>>,
): Layer.Layer<
  Sharding.Sharding,
  never,
  | ShardingConfig.ShardingConfig
  | Runners.Runners
  | MessageStorage.MessageStorage
  | RunnerStorage.RunnerStorage
  | RunnerHealth.RunnerHealth
  | SqlClient.SqlClient
> =>
  Layer.unwrap(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const config = yield* ShardingConfig.ShardingConfig
    const launched = yield* RunnerHealth.RunnerHealth
    yield* createTables
    const address = Option.getOrUndefined(config.runnerAddress)
    if (address !== undefined) {
      yield* recordVersions(
        addressText(address),
        programs.map((program) => ({ name: program.name, version: versionOf(program) })),
      )
    }
    return Sharding.layer.pipe(Layer.provide(Layer.succeed(RunnerHealth.RunnerHealth, byVersion(launched, sql))))
  }))
