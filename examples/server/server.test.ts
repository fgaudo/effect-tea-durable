/**
 * The server of the orders as a process (decision 0178). The world is a server of the test, which charges once per
 * idempotency key, as a payment provider does. It holds the first charge of each key open until the test releases
 * it, and records the runners that asked for each one. It records each email too, and holds it open if asked.
 */
import { BunHttpServer, BunServices } from '@effect/platform-bun'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Context from 'effect/Context'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
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
import * as Option from 'effect/Option'
import * as Path from 'effect/Path'
import { ChildProcess, ChildProcessSpawner } from 'effect/process'
import * as Ref from 'effect/Ref'
import * as Schedule from 'effect/Schedule'
import * as Schema from 'effect/Schema'
import * as Scope from 'effect/Scope'
import { SqlClient } from 'effect/sql'

/**
 * A test that waits over two seconds on a clock that is real, for a runner's lease: `bun test` skips it, and
 * `bun run test:release` and `bun run test:slow` run it, under `SCHEDULES=all`.
 */
const slow = Bun.env['SCHEDULES'] === 'all' ? test : test.skip

/** The port of a server built by `layer`, which listens until `scope` closes. */
const portOf = <E, R>(layer: Layer.Layer<HttpServer.HttpServer, E, R>, scope: Scope.Scope) =>
  Effect.map(Layer.buildWithScope(layer, scope), (context) => {
    const address = Context.get(context, HttpServer.HttpServer).address
    if (address._tag === 'UnixPathAddress') throw new Error('the server listens on a path')
    return address.port
  })

/** A port no server listens on now: the port of a server that listened on any port, and stopped. */
const freePort = Effect.scoped(Effect.flatMap(Effect.scope, (scope) => portOf(BunHttpServer.layerServer({ port: 0 }), scope)))

/** What the world does besides charging once per key: fail the first calls, or hold each email open. */
type Behaviour = Readonly<{ failing?: boolean; holdingMails?: boolean }>

/**
 * The world. `charges` holds the charge of each idempotency key, and `asked` the runners that asked for it, in
 * order. A charge is taken as it arrives, so a charge whose answer the process never got is still taken. The first
 * charge of each key waits for `release`. A world `failing` answers `503` to the first charge, before it takes or
 * records it, and to the first email. `mailed` holds each email asked for, with the runner that asked, and `mails`
 * counts them. A world `holdingMails` answers each email only once `releaseMails` runs.
 */
const world = ({ failing = false, holdingMails = false }: Behaviour) => Effect.gen(function*() {
  const charges = yield* Ref.make(new Map<string, string>())
  const asked = yield* Ref.make(new Map<string, ReadonlyArray<string>>())
  const released = yield* Deferred.make<void>()
  const failed = yield* Ref.make(new Set<string>())
  const mailed = yield* Ref.make<ReadonlyArray<Readonly<{ runner: string; subject: string }>>>([])
  const mailsReleased = yield* Deferred.make<void>()
  /** Whether the world answers `503` to the call of `path`: only the first, and only of a world `failing`. */
  const fails = (path: string) => Ref.modify(failed, (paths) => [failing && !paths.has(path), new Set(paths).add(path)])
  const unavailable = HttpServerResponse.empty({ status: 503 })
  const Charge = Schema.Struct({ idempotencyKey: Schema.String })
  const Mail = Schema.Struct({ subject: Schema.String })
  const Runner = Schema.Struct({ 'x-runner': Schema.String })
  const routes = Layer.mergeAll(
    HttpRouter.add(
      'POST',
      '/charge',
      Effect.gen(function*() {
        if (yield* fails('/charge')) return unavailable
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
    HttpRouter.add(
      'POST',
      '/mail',
      Effect.gen(function*() {
        const { subject } = yield* HttpServerRequest.schemaBodyJson(Mail)
        const { 'x-runner': runner } = yield* HttpServerRequest.schemaHeaders(Runner)
        yield* Ref.update(mailed, (all) => [...all, { runner, subject }])
        if (yield* fails('/mail')) return unavailable
        if (holdingMails) yield* Deferred.await(mailsReleased)
        return HttpServerResponse.empty({ status: 204 })
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
    mailed: Ref.get(mailed),
    mails: Effect.map(Ref.get(mailed), (all) => all.length),
    /** Waits until the world holds the first charge of `count` keys. */
    holding: (count: number) =>
      Ref.get(asked).pipe(
        Effect.filterOrFail((all) => all.size >= count),
        Effect.retry({ schedule: Schedule.spaced('50 millis'), times: 600 }),
      ),
    release: Deferred.succeed(released, undefined),
    /** Waits until the world holds `count` emails. */
    holdingMails: (count: number) =>
      Ref.get(mailed).pipe(
        Effect.filterOrFail((all) => all.length >= count),
        Effect.retry({ schedule: Schedule.spaced('50 millis'), times: 600 }),
      ),
    releaseMails: Deferred.succeed(mailsReleased, undefined),
  }
})

type Settings = Readonly<{ filename: string; world: string }>

/**
 * The process of a runner at `localhost:<port>` in the current scope, once its boundary answers. Closing the scope
 * kills it, and the client returned calls its boundary. The lease expires after three seconds, so that a runner that
 * dies frees its shards within the test, unless `env` sets Cluster's settings otherwise.
 */
const start = Effect.fn('start')(function*(settings: Settings, port: number, env: Record<string, string> = {}) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
  const path = yield* Path.Path
  const process = yield* spawner.spawn(ChildProcess.make('bun', [path.join(import.meta.dir, 'main.ts')], {
    env: {
      DATABASE: settings.filename,
      WORLD_URL: settings.world,
      HOST: 'localhost',
      PORT: String(port),
      SHARD_LOCK_EXPIRATION: '3 seconds',
      ...env,
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

/**
 * Sends `message` to the order `id` as `who` until it is answered `tag`, each try under a request id of its own,
 * since a retry under the same request id is answered as the first try.
 */
const answered = <M extends { readonly _tag: string }>(
  client: HttpClient.HttpClient,
  id: string,
  who: string,
  message: M,
  tag: string,
) => {
  let tries = 0
  return Effect.suspend(() =>
    client.post(`/orders/${id}/events`, {
      headers: as(who, `${message._tag}-${id}-${tries++}`),
      body: HttpBody.jsonUnsafe(message),
    })
  ).pipe(
    Effect.flatMap(HttpClientResponse.schemaBodyJson(Tagged)),
    Effect.filterOrFail(({ _tag }) => _tag === tag),
    Effect.retry({ schedule: Schedule.spaced('100 millis'), times: 200 }),
  )
}

/** The email of each order, read from the state the runtime stored in the file of `settings`. */
const emails = (settings: Settings) =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const rows = yield* sql<{ id: string; state: string }>`SELECT id, state FROM effecttea_entities`
    return new Map(rows.map(({ id, state }) => [id, (JSON.parse(state) as { email?: string }).email]))
  }).pipe(Effect.provide(SqliteClient.layer({ filename: settings.filename })))

/**
 * Waits until each runner of `addresses` holds a lock of `cluster_locks`, so that the orders created next are divided
 * between them. A runner takes its shards at its next reading of the runners, which `refreshAssignmentsInterval`
 * spaces, and a shard another runner lets go may stay free for two of them, as the JSDoc of `runnerJoinDebounce`
 * says.
 */
const holdingShards = (settings: Settings, addresses: ReadonlyArray<string>) =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    return yield* sql<{ address: string }>`SELECT DISTINCT address FROM cluster_locks`.pipe(
      Effect.filterOrFail((rows) => addresses.every((address) => rows.some((row) => row.address === address))),
      Effect.retry({ schedule: Schedule.spaced('100 millis'), times: 300 }),
    )
  }).pipe(Effect.provide(SqliteClient.layer({ filename: settings.filename })))

/** Runs `body` with a world of `behaviour`, and a file of SQLite in a directory removed afterwards. */
const run = <A, E>(
  body: (settings: Settings, theWorld: Effect.Success<ReturnType<typeof world>>) => Effect.Effect<A, E, any>,
  behaviour: Behaviour = {},
) =>
  Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const directory = yield* fs.makeTempDirectoryScoped({ prefix: 'effect-tea-persistent-server-' })
    const theWorld = yield* world(behaviour)
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
        const again = yield* client.put('/orders/o-1', { headers: as('customer:ada', 'c-o-1-again'), body })
        expect(again.status).toBe(409)
        expect(yield* HttpClientResponse.schemaBodyJson(Tagged)(again)).toEqual({ _tag: 'AlreadyExists' })
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

slow('the orders of a runner killed during their charges are paid once by the other runner', async () => {
  await run((settings, theWorld) =>
    Effect.gen(function*() {
      const ids = Array.from({ length: 16 }, (_, n) => `o-${n}`)
      const doomed = yield* Scope.make()
      const killed = yield* start(settings, yield* freePort).pipe(Scope.provide(doomed))
      const survivor = yield* start(settings, yield* freePort)
      yield* holdingShards(settings, [killed.address, survivor.address])
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

// The process stops on the signal as its layer's scope closes, and Cluster lets the runner's shards go as the runner
// unregisters. Without `DRAIN_MILLIS` the server launches its runtime without `drain`, so its charges stop as in a
// crash (decision 0119).
// Under a lease and a health check longer than the test, only the unregistration frees the shards. On Windows a
// child process is ended at once by any signal, so the stop cannot be tested there. It waits as `slow` says.
test.skipIf(process.platform === 'win32' || Bun.env['SCHEDULES'] !== 'all')(
  'the orders of a runner stopped by SIGTERM in their charges are paid once by the other runner, within its lease',
  async () => {
    await run((settings, theWorld) =>
      Effect.gen(function*() {
        const lease = { SHARD_LOCK_EXPIRATION: '10 minutes', RUNNER_HEALTH_CHECK_INTERVAL: '10 minutes' }
        const ids = Array.from({ length: 16 }, (_, n) => `o-${n}`)
        const doomed = yield* Scope.make()
        const stopped = yield* start(settings, yield* freePort, lease).pipe(Scope.provide(doomed))
        const survivor = yield* start(settings, yield* freePort, lease)
        yield* holdingShards(settings, [stopped.address, survivor.address])
        for (const id of ids) yield* order(survivor.client, id)
        yield* theWorld.holding(ids.length)

        const askedOfStopped = [...(yield* theWorld.asked)].filter(([, runners]) => runners[0] === stopped.address)
        expect(askedOfStopped.length).toBeGreaterThan(0)
        yield* stopped.process.kill({ killSignal: 'SIGTERM' })
        yield* stopped.process.exitCode
        yield* Scope.close(doomed, Exit.void)
        yield* theWorld.release

        for (const id of ids) yield* paid(survivor.client, id)
        const asked = yield* theWorld.asked
        for (const [key] of askedOfStopped) expect(asked.get(key)?.at(-1)).toBe(survivor.address)
        expect((yield* theWorld.charges).size).toBe(ids.length)
      })
    )
  },
  90_000,
)

// With `DRAIN_MILLIS` the stop waits for the emails under way, and commits their completions before the runner lets
// its shards go. The other runner handles each completion, and finds each email sent and not unsure (decisions 0119,
// 0219). The world holds the emails, so the drain still holds the process two seconds after the signal. The emails are
// released only then, so that each ends in the drain and not before the stop. `kill` returns once the process has
// ended, so it runs in a fiber of its own.
test.skipIf(process.platform === 'win32')(
  'a runner stopped by SIGTERM with a drain sends its emails under way once, and the other runner finishes the orders',
  async () => {
    await run((settings, theWorld) =>
      Effect.gen(function*() {
        const env = {
          SHARD_LOCK_EXPIRATION: '10 minutes',
          RUNNER_HEALTH_CHECK_INTERVAL: '10 minutes',
          DRAIN_MILLIS: '30000',
        }
        const ids = Array.from({ length: 16 }, (_, n) => `o-${n}`)
        yield* theWorld.release
        const doomed = yield* Scope.make()
        const stopped = yield* start(settings, yield* freePort, env).pipe(Scope.provide(doomed))
        const survivor = yield* start(settings, yield* freePort, env)
        yield* holdingShards(settings, [stopped.address, survivor.address])
        for (const id of ids) yield* order(survivor.client, id)
        for (const id of ids) yield* paid(survivor.client, id)
        for (const id of ids) {
          yield* answered(survivor.client, id, 'warehouse', { _tag: 'ShipmentReported', tracking: id }, 'Accepted')
        }
        yield* theWorld.holdingMails(ids.length)

        const mailedByStopped = (yield* theWorld.mailed).filter(({ runner }) => runner === stopped.address)
        expect(mailedByStopped.length).toBeGreaterThan(0)
        const killing = yield* Effect.forkChild(stopped.process.kill({ killSignal: 'SIGTERM' }))
        expect(Option.isNone(yield* Effect.timeoutOption(stopped.process.exitCode, '2 seconds'))).toBe(true)
        yield* theWorld.releaseMails
        yield* Fiber.join(killing)
        yield* Scope.close(doomed, Exit.void)

        for (const id of ids) {
          yield* answered(survivor.client, id, 'customer:ada', { _tag: 'CancelRequested' }, 'Rejected')
        }
        const mailed = yield* theWorld.mailed
        expect(mailed.length).toBe(ids.length)
        expect(new Set(mailed.map(({ subject }) => subject)).size).toBe(ids.length)
        const stored = yield* emails(settings)
        expect(ids.map((id) => stored.get(id))).toEqual(ids.map(() => 'Sent'))
      }), { holdingMails: true })
  },
  90_000,
)

// A charge carries an idempotency key, so its client tries it again. An email carries none and runs at most once,
// so the failure of its call suspends the order, which is then answered `409` and not `503` (decisions 0178, 0190).
test('a charge the world fails is tried again, and an email it fails suspends its order, answered 409', async () => {
  await run((settings, theWorld) =>
    Effect.gen(function*() {
      yield* theWorld.release
      const { client } = yield* start(settings, yield* freePort)
      yield* order(client, 'o-1')
      yield* paid(client, 'o-1')
      expect([...(yield* theWorld.charges).values()]).toEqual(['ch_1'])
      // A retry under the same request id is answered as the first time, so each try is a request of its own. The
      // warehouse reports the shipment once it was told, and an earlier report is rejected and sent again.
      let tries = 0
      yield* Effect.suspend(() => client.post('/orders/o-1/events', {
        headers: as('warehouse', `s-${tries++}`),
        body: HttpBody.jsonUnsafe({ _tag: 'ShipmentReported', tracking: 'tr-1' }),
      })).pipe(
        Effect.flatMap(HttpClientResponse.schemaBodyJson(Tagged)),
        Effect.filterOrFail(({ _tag }) => _tag === 'Accepted'),
        Effect.retry({ schedule: Schedule.spaced('100 millis'), times: 200 }),
      )
      const suspended = yield* Effect.suspend(() => client.post('/orders/o-1/events', {
        headers: as('customer:ada', `x-${tries++}`),
        body: HttpBody.jsonUnsafe({ _tag: 'CancelRequested' }),
      })).pipe(
        Effect.flatMap((response) =>
          Effect.map(HttpClientResponse.schemaBodyJson(Tagged)(response), (body) => ({ status: response.status, body }))
        ),
        Effect.filterOrFail(({ body }) => body._tag === 'Suspended'),
        Effect.retry({ schedule: Schedule.spaced('100 millis'), times: 200 }),
      )
      expect(suspended).toEqual({ status: 409, body: { _tag: 'Suspended' } })
      expect(yield* theWorld.mails).toBe(1)
    }), { failing: true })
}, 60_000)
