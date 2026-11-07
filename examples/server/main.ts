/**
 * Runs the server of the orders as a process (decision 0178):
 *
 *     DATABASE=orders.db WORLD_URL=http://localhost:4000 PORT=3000 bun examples/server/main.ts
 *
 * `HOST` is the address other runners reach it at, `localhost` by default. The process stops on a signal, and the
 * runtime stops with the layer's scope.
 */
import { BunHttpServer, BunRuntime } from '@effect/platform-bun'
import * as Config from 'effect/Config'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { server } from './server.ts'

const settings = Config.all({
  filename: Config.String('DATABASE'),
  world: Config.String('WORLD_URL'),
  host: Config.withDefault(Config.String('HOST'), 'localhost'),
  port: Config.Port('PORT'),
})

const main = Layer.unwrap(Effect.map(settings, (settings) =>
  server(settings).pipe(Layer.provide(BunHttpServer.layer({ port: settings.port })))))

Layer.launch(main).pipe(BunRuntime.runMain)
