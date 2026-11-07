/**
 * The server of the orders as a process, killed during a charge and started again on the same file
 * (decision 0178). The world is a server of the test, which charges once per idempotency key, as a payment
 * provider does, and holds the first charge open until the process is killed.
 */
import { BunHttpServer, BunServices } from '@effect/platform-bun'
import { expect, test } from 'bun:test'
import * as Context from 'effect/Context'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as FileSystem from 'effect/FileSystem'
import {
  FetchHttpClient,
  HttpBody,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpRouter,
  HttpServer,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/http'
import * as Layer from 'effect/Layer'
import * as Path from 'effect/Path'
import { ChildProcess, ChildProcessSpawner } from 'effect/process'
import * as Ref from 'effect/Ref'
import * as Schedule from 'effect/Schedule'
import * as Schema from 'effect/Schema'
import * as Scope from 'effect/Scope'

/** The port of a server built by `layer`, which listens until `scope` closes. */
const portOf = <E, R>(layer: Layer.Layer<HttpServer.HttpServer, E, R>, scope: Scope.Scope) =>
  Effect.map(Layer.buildWithScope(layer, scope), (context) => {
    const address = Context.get(context, HttpServer.HttpServer).address
    if (address._tag === 'UnixPathAddress') throw new Error('the server listens on a path')
    return address.port
  })

/** A port no server listens on now: the port of a server that listened on any port, and stopped. */
const freePort = Effect.scoped(Effect.flatMap(Effect.scope, (scope) => portOf(BunHttpServer.layerServer({ port: 0 }), scope)))

/**
 * The world: the charges by idempotency key and how many times a charge was asked. The first charge is held until
 * `release`, and `reached` is done once it arrives. A charge is taken as it arrives, so a charge whose answer the
 * process never got is still taken.
 */
const world = Effect.gen(function*() {
  const charges = yield* Ref.make(new Map<string, string>())
  const asked = yield* Ref.make(0)
  const reached = yield* Deferred.make<void>()
  const released = yield* Deferred.make<void>()
  const Charge = Schema.Struct({ idempotencyKey: Schema.String })
  const routes = Layer.mergeAll(
    HttpRouter.add(
      'POST',
      '/charge',
      Effect.gen(function*() {
        const { idempotencyKey } = yield* HttpServerRequest.schemaBodyJson(Charge)
        const first = (yield* Ref.getAndUpdate(asked, (n) => n + 1)) === 0
        const charge = yield* Ref.modify(charges, (taken) => {
          const charge = taken.get(idempotencyKey) ?? `ch_${taken.size + 1}`
          return [charge, new Map(taken).set(idempotencyKey, charge)]
        })
        if (first) {
          yield* Deferred.succeed(reached, undefined)
          yield* Deferred.await(released)
        }
        return yield* HttpServerResponse.json({ charge })
      }),
    ),
    HttpRouter.add('POST', '/*', HttpServerResponse.empty({ status: 204 })),
  )
  const port = yield* portOf(
    HttpRouter.serve(routes, { disableLogger: true, disableListenLog: true }).pipe(
      Layer.provideMerge(BunHttpServer.layer({ port: 0 })),
    ),
    yield* Effect.scope,
  )
  return {
    url: `http://localhost:${port}`,
    charges: Ref.get(charges),
    asked: Ref.get(asked),
    reached: Deferred.await(reached),
    release: Deferred.succeed(released, undefined),
  }
})

/**
 * The process of the server in the current scope, once its boundary answers. Closing the scope kills it, and the
 * client returned calls its boundary.
 */
const start = Effect.fn('start')(function*(settings: Readonly<{ filename: string; world: string; port: number }>) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const path = yield* Path.Path
  const process = yield* spawner.spawn(ChildProcess.make('bun', [path.join(import.meta.dir, 'main.ts')], {
    env: { DATABASE: settings.filename, WORLD_URL: settings.world, PORT: String(settings.port) },
    extendEnv: true,
    stdout: 'ignore',
    stderr: 'inherit',
  }))
  const client = (yield* HttpClient.HttpClient).pipe(
    HttpClient.mapRequest(HttpClientRequest.prependUrl(`http://localhost:${settings.port}`)),
  )
  yield* client.get('/health').pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.retry({ schedule: Schedule.spaced('100 millis'), times: 200 }),
  )
  return { process, client }
})

const as = (who: string, requestId: string) => ({
  authorization: `Bearer ${who}`,
  'idempotency-key': requestId,
})

const Tagged = Schema.Struct({ _tag: Schema.String })
const Read = Schema.Struct({ status: Schema.String })

test('an order whose process is killed during its charge is paid once by the process started again', async () => {
  await Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'effect-tea-durable-server-' })
    const theWorld = yield* world
    const settings = { filename: path.join(directory, 'orders.db'), world: theWorld.url, port: yield* freePort }

    yield* Effect.scoped(Effect.gen(function*() {
      const { process, client } = yield* start(settings)
      const body = HttpBody.jsonUnsafe({ totalInCents: 1_000 })
      expect((yield* client.put('/orders/o-1', { body })).status).toBe(401)
      expect((yield* client.put('/orders/o-1', { headers: { authorization: 'Bearer customer:ada' }, body })).status)
        .toBe(400)
      const created = yield* client.put('/orders/o-1', {
        headers: as('customer:ada', 'c-o-1'),
        body: HttpBody.jsonUnsafe({ totalInCents: 1_000 }),
      })
      expect(created.status).toBe(201)
      const paid = yield* client.post('/orders/o-1/events', {
        headers: as('customer:ada', 'p-o-1'),
        body: HttpBody.jsonUnsafe({ _tag: 'PayRequested', payment: 'card-1' }),
      }).pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Tagged)))
      expect(paid).toEqual({ _tag: 'Accepted' })

      yield* theWorld.reached
      yield* process.kill({ killSignal: 'SIGKILL' })
    }))
    yield* theWorld.release

    const { client } = yield* start(settings)
    const read = yield* client.get('/orders/o-1').pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(Read)),
      Effect.filterOrFail(({ status }) => status === 'Paid'),
      Effect.retry({ schedule: Schedule.spaced('100 millis'), times: 300 }),
    )
    expect(read.status).toBe('Paid')
    expect(yield* theWorld.asked).toBeGreaterThanOrEqual(2)
    expect([...(yield* theWorld.charges).values()]).toEqual(['ch_1'])
  })).pipe(Effect.provide([BunServices.layer, FetchHttpClient.layer])))
}, 60_000)
