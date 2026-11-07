/**
 * The server of the orders as a process (decision 0178). The world is a server of the test, which charges once per
 * idempotency key, as a payment provider does. It holds the first charge of each key open until the test releases
 * it, and records the runners that asked for each one.
 */
import { BunHttpServer, BunServices } from '@effect/platform-bun'
import { expect, test } from 'bun:test'
import * as Context from 'effect/Context'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
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
 * The world. `charges` holds the charge of each idempotency key, and `asked` the runners that asked for it, in
 * order. A charge is taken as it arrives, so a charge whose answer the process never got is still taken. The first
 * charge of each key waits for `release`.
 */
const world = Effect.gen(function*() {
  const charges = yield* Ref.make(new Map<string, string>())
  const asked = yield* Ref.make(new Map<string, ReadonlyArray<string>>())
  const released = yield* Deferred.make<void>()
  const Charge = Schema.Struct({ idempotencyKey: Schema.String })
  const Runner = Schema.Struct({ 'x-runner': Schema.String })
  const routes = Layer.mergeAll(
    HttpRouter.add(
      'POST',
      '/charge',
      Effect.gen(function*() {
        const { idempotencyKey } = yield* HttpServerRequest.schemaBodyJson(Charge)
        const { 'x-runner': runner } = yield* HttpServerRequest.schemaHeaders(Runner)
        const before = yield* Ref.getAndUpdate(asked, (all) =>
          new Map(all).set(idempotencyKey, [...(all.get(idempotencyKey) ?? []), runner]))
        const charge = yield* Ref.modify(charges, (taken) => {
          const charge = taken.get(idempotencyKey) ?? `ch_${taken.size + 1}`
          return [charge, new Map(taken).set(idempotencyKey, charge)]
        })
        if (!before.has(idempotencyKey)) yield* Deferred.await(released)
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
    /** Waits until the world holds the first charge of `count` keys. */
    holding: (count: number) =>
      Ref.get(asked).pipe(
        Effect.filterOrFail((all) => all.size >= count),
        Effect.retry({ schedule: Schedule.spaced('50 millis'), times: 600 }),
      ),
    release: Deferred.succeed(released, undefined),
  }
})

type Settings = Readonly<{ filename: string; world: string }>

/**
 * The process of a runner at `localhost:<port>` in the current scope, once its boundary answers. Closing the scope
 * kills it, and the client returned calls its boundary. The lease expires after three seconds, so that a runner that
 * dies frees its shards within the test.
 */
const start = Effect.fn('start')(function*(settings: Settings, port: number) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const path = yield* Path.Path
  const process = yield* spawner.spawn(ChildProcess.make('bun', [path.join(import.meta.dir, 'main.ts')], {
    env: {
      DATABASE: settings.filename,
      WORLD_URL: settings.world,
      HOST: 'localhost',
      PORT: String(port),
      SHARD_LOCK_EXPIRATION: '3 seconds',
    },
    extendEnv: true,
    stdout: 'ignore',
    stderr: 'inherit',
  }))
  const client = (yield* HttpClient.HttpClient).pipe(
    HttpClient.mapRequest(HttpClientRequest.prependUrl(`http://localhost:${port}`)),
  )
  yield* client.get('/health').pipe(
    Effect.flatMap(HttpClientResponse.filterStatusOk),
    Effect.retry({ schedule: Schedule.spaced('100 millis'), times: 200 }),
  )
  return { process, client, address: `localhost:${port}` }
})

const as = (who: string, requestId: string) => ({
  authorization: `Bearer ${who}`,
  'idempotency-key': requestId,
})

const Tagged = Schema.Struct({ _tag: Schema.String })
const Read = Schema.Struct({ status: Schema.String })

/** Creates the order `id` of ada through `client`, and asks for its payment. */
const order = (client: HttpClient.HttpClient, id: string) =>
  Effect.gen(function*() {
    const created = yield* client.put(`/orders/${id}`, {
      headers: as('customer:ada', `c-${id}`),
      body: HttpBody.jsonUnsafe({ totalInCents: 1_000 }),
    })
    expect(created.status).toBe(201)
    const paid = yield* client.post(`/orders/${id}/events`, {
      headers: as('customer:ada', `p-${id}`),
      body: HttpBody.jsonUnsafe({ _tag: 'PayRequested', payment: 'card-1' }),
    }).pipe(Effect.flatMap(HttpClientResponse.schemaBodyJson(Tagged)))
    expect(paid).toEqual({ _tag: 'Accepted' })
  })

/** Waits until the order `id` reads `Paid` through `client`. */
const paid = (client: HttpClient.HttpClient, id: string) =>
  client.get(`/orders/${id}`).pipe(
    Effect.flatMap(HttpClientResponse.schemaBodyJson(Read)),
    Effect.filterOrFail(({ status }) => status === 'Paid'),
    Effect.retry({ schedule: Schedule.spaced('100 millis'), times: 400 }),
  )

/** Runs `body` with a world and a file of SQLite in a directory removed afterwards. */
const run = <A, E>(body: (settings: Settings, theWorld: Effect.Success<typeof world>) => Effect.Effect<A, E, any>) =>
  Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'effect-tea-durable-server-' })
    const theWorld = yield* world
    return yield* body({ filename: path.join(directory, 'orders.db'), world: theWorld.url }, theWorld)
  })).pipe(Effect.provide([BunServices.layer, FetchHttpClient.layer])) as Effect.Effect<A, unknown>)

test('an order whose process is killed during its charge is paid once by the process started again', async () => {
  await run((settings, theWorld) =>
    Effect.gen(function*() {
      const port = yield* freePort
      yield* Effect.scoped(Effect.gen(function*() {
        const { process, client } = yield* start(settings, port)
        const body = HttpBody.jsonUnsafe({ totalInCents: 1_000 })
        expect((yield* client.put('/orders/o-1', { body })).status).toBe(401)
        expect((yield* client.put('/orders/o-1', { headers: { authorization: 'Bearer customer:ada' }, body })).status)
          .toBe(400)
        yield* order(client, 'o-1')
        yield* theWorld.holding(1)
        yield* process.kill({ killSignal: 'SIGKILL' })
      }))
      yield* theWorld.release

      const { client } = yield* start(settings, port)
      yield* paid(client, 'o-1')
      expect([...(yield* theWorld.asked).values()].map((runners) => runners.length >= 2)).toEqual([true])
      expect([...(yield* theWorld.charges).values()]).toEqual(['ch_1'])
    })
  )
}, 60_000)

test('the orders of a runner killed during their charges are paid once by the other runner', async () => {
  await run((settings, theWorld) =>
    Effect.gen(function*() {
      const ids = Array.from({ length: 16 }, (_, n) => `o-${n}`)
      const doomed = yield* Scope.make()
      const killed = yield* start(settings, yield* freePort).pipe(Scope.provide(doomed))
      const survivor = yield* start(settings, yield* freePort)
      // Both runners are registered and answer a ping before the orders are created, so that their shards are
      // divided between them.
      yield* Effect.sleep('4 seconds')
      for (const id of ids) yield* order(survivor.client, id)
      yield* theWorld.holding(ids.length)

      const askedOfKilled = [...(yield* theWorld.asked)].filter(([, runners]) => runners[0] === killed.address)
      expect(askedOfKilled.length).toBeGreaterThan(0)
      yield* killed.process.kill({ killSignal: 'SIGKILL' })
      yield* Scope.close(doomed, Exit.void)
      yield* theWorld.release

      for (const id of ids) yield* paid(survivor.client, id)
      const asked = yield* theWorld.asked
      for (const [key] of askedOfKilled) expect(asked.get(key)?.at(-1)).toBe(survivor.address)
      expect((yield* theWorld.charges).size).toBe(ids.length)
    })
  )
}, 90_000)
