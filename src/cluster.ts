/**
 * The runtime on Effect Cluster: the `Sharding` a runner of the runtime runs, built once the runner's versions are
 * recorded, with a `RunnerHealth` that keeps the shards off a runner of an older version, and the door, Cluster's
 * entity of a program, whose steps commit only at the newest version (decision 0159). What a step does is the
 * runtime's, and is not code on Cluster yet: the roadmap's step Effect Cluster.
 */
import {
  ClusterSchema,
  Entity,
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
import * as Schema from 'effect/Schema'
import { Rpc } from 'effect/rpc'
import { SqlClient } from 'effect/sql'
import { InvariantDefect, type Program, type Types, versionOf } from './program.ts'
import { createTables, newestVersion, outranked, recordVersions } from './storage.ts'

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

/**
 * What a request to an entity on Cluster carries: the version that wrote it, the request and the message, each as
 * the JSON text the runtime encodes (decision 0085). Cluster's schema decodes text alone, so a payload of any version
 * reaches the runtime, which reads the request and the message through the program's migrations.
 */
const payload = { version: Schema.Int, request: Schema.String, message: Schema.String }

/**
 * Cluster keys a request by the version that keyed it and its request's text, under the receiver's address and the
 * RPC's tag, so that two versions never share a key (decision 0085).
 */
const primaryKey = ({ version, request }: Readonly<{ version: number; request: string }>) => `${version}/${request}`

/**
 * The entity of the program `name` on Cluster, the door to the runtime's entity: one RPC for a creation and one for
 * a message (decision 0085). Each is persisted, and its handler runs in Cluster's transaction, so a step commits
 * with its reply (decision 0081). Its answer is the runtime's encoding of whatever the step answers, as text, and it
 * fails with nothing. A caller that stops waiting leaves its request to be handled (decision 0091).
 */
export const doorOf = <const Name extends string>(name: Name) =>
  Entity.make(name, [
    Rpc.make('Create', { payload, success: Schema.String, primaryKey }),
    Rpc.make('Message', { payload, success: Schema.String, primaryKey }),
  ])
    .annotateRpcs(ClusterSchema.Persisted, true)
    .annotateRpcs(ClusterSchema.WithTransaction, true)
    .annotateRpcs(ClusterSchema.Uninterruptible, 'client')

/** A request that reaches a door: which RPC, and what its payload carries. */
export type Delivered = Readonly<{
  _tag: 'Create' | 'Message'
  id: string
  version: number
  request: string
  message: string
}>

/**
 * Dies where a launch recorded a newer version of `program` than this runner runs, inside the step's transaction,
 * so that the step commits only at the newest version. Cluster restarts the entity after a defect of its handler,
 * without end, and saves no reply, so the message is delivered again until its shard moves to a runner of the
 * newest version (decision 0159).
 */
export const atNewest = (program: Pick<Program<Types>, 'name' | 'migrations'>) =>
  Effect.flatMap(newestVersion(program.name), (newest) => {
    const version = versionOf(program)
    return newest !== undefined && newest > version
      ? Effect.die(new InvariantDefect({
        reason: `the program ${program.name} runs at version ${version} here, and a launch has run it at version ${newest}`,
      }))
      : Effect.void
  })

/**
 * The layer that serves the door of `program` on this runner. Each request is stepped by `step` in Cluster's
 * transaction, once `atNewest` has found this runner's version the newest (decision 0159). The entity type is
 * registered without `disableFatalDefects`, which would save a defect as the request's reply, and lose its message.
 */
export const door = <R>(
  program: Pick<Program<Types>, 'name' | 'migrations'>,
  step: (delivered: Delivered) => Effect.Effect<string, never, R>,
) => {
  const entity = doorOf(program.name)
  const handle = (_tag: Delivered['_tag']) =>
  (
    { address, payload }: Readonly<{
      address: Readonly<{ entityId: string }>
      payload: Readonly<{ version: number; request: string; message: string }>
    }>,
  ) =>
    Effect.andThen(
      atNewest(program),
      step({
        _tag,
        id: address.entityId,
        version: payload.version,
        request: payload.request,
        message: payload.message,
      }),
    )
  return entity.toLayer({ Create: handle('Create'), Message: handle('Message') })
}
