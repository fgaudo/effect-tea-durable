/**
 * Runs the server of the orders as a process (decision 0178):
 *
 *     DATABASE=orders.db WORLD_URL=http://localhost:4000 HOST=localhost PORT=3000 bun examples/server/main.ts
 *
 * `HOST` and `PORT` are the runner's address, which the other runners reach it at and its boundary listens on.
 * Cluster's `ShardingConfig` reads them, and the rest of its settings, from the environment, such as
 * `SHARD_LOCK_EXPIRATION`. The process stops on a signal, and the runtime stops with the layer's scope.
 */
import { BunClusterHttp, BunRuntime } from '@effect/platform-bun'
import { ShardingConfig } from 'effect/cluster'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { server } from './server.ts'

const settings = Config.all({ filename: Config.String('DATABASE'), world: Config.String('WORLD_URL') })

const main = Layer.unwrap(Effect.map(settings, server)).pipe(
  Layer.provide(BunClusterHttp.layerHttpServer),
  Layer.provide(ShardingConfig.layerFromEnv()),
)

Layer.launch(main).pipe(BunRuntime.runMain)
