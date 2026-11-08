/**
 * The orders of `examples/order` served over HTTP by a runner of Effect Cluster, on a file of SQLite
 * (decision 0178). The boundary takes the request id from `Idempotency-Key` and the sender from `Authorization`,
 * and calls the door of the orders through the deployment. The world the orders act on is a server of its own,
 * which the runner reaches over HTTP.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import {
  HttpRunner,
  RunnerHealth,
  Runners,
  RunnerServer,
  ShardingConfig,
  SqlMessageStorage,
  SqlRunnerStorage,
} from 'effect/cluster'
import * as Context from 'effect/Context'
import * as Data from 'effect/Data'
import { Digest } from 'effect/crypto'
import * as Effect from 'effect/Effect'
import {
  FetchHttpClient,
  HttpBody,
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  HttpIncomingMessage,
  HttpRouter,
  HttpServerRequest,
  HttpServerRespondable,
  HttpServerResponse,
} from 'effect/http'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schedule from 'effect/Schedule'
import * as Schema from 'effect/Schema'
import { RpcSerialization, RpcServer } from 'effect/rpc'
import { type Handle, launchOnCluster, sharding, type TypesOf } from '../../src/index.ts'
import { Mailer, order, Payments, type Sender, Warehouse } from '../order/order.ts'

/**
 * Where the runner's file and the world are. The runner's address, which its boundary listens on too, and the
 * lease's expiration are Cluster's `ShardingConfig`, read from the environment.
 */
export type Settings = Readonly<{ filename: string; world: string }>

/**
 * The world over HTTP, through a client of the world's address, which tells the world the runner that calls in
 * `x-runner`. A transport's failure is a defect, which suspends the order: the world's `402` is the only failure an
 * operation of the orders declares. A call that carries an idempotency key is retried for a while first, since the
 * world acts on it once whatever the number of tries. The email carries none and runs at most once
 * (decision 0011), so it is sent once: a retry after a lost answer would send the email twice.
 */
const world = (base: string) =>
  Layer.effectContext(Effect.gen(function*() {
    const { runnerAddress } = yield* ShardingConfig.ShardingConfig
    const runner = Option.match(runnerAddress, { onNone: () => '', onSome: ({ host, port }) => `${host}:${port}` })
    const once = (yield* HttpClient.HttpClient).pipe(
      HttpClient.mapRequest(HttpClientRequest.prependUrl(base)),
      HttpClient.mapRequest(HttpClientRequest.setHeader('x-runner', runner)),
    )
    const keyed = once.pipe(HttpClient.retryTransient({ schedule: Schedule.spaced('200 millis'), times: 50 }))
    const post = (client: HttpClient.HttpClient, path: string, body: unknown) =>
      client.post(path, { body: HttpBody.jsonUnsafe(body) })
    const told = (client: HttpClient.HttpClient, path: string, body: unknown) =>
      post(client, path, body).pipe(Effect.flatMap(HttpClientResponse.filterStatusOk), Effect.orDie, Effect.asVoid)
    const Charged = Schema.Struct({ charge: Schema.String })
    const payments = Payments.of({
      charge: (request) =>
        post(keyed, '/charge', request).pipe(
          Effect.orDie,
          Effect.flatMap(HttpClientResponse.matchStatus({
            402: () => Effect.fail('Declined' as const),
            orElse: (response) =>
              HttpClientResponse.filterStatusOk(response).pipe(
                Effect.flatMap(HttpIncomingMessage.schemaBodyJson(Charged)),
                Effect.map(({ charge }) => charge),
                Effect.orDie,
              ),
          })),
        ),
      refund: (request) => told(keyed, '/refund', request),
    })
    return Context.make(Payments, payments).pipe(
      Context.add(Warehouse, Warehouse.of({ prepare: (request) => told(keyed, '/prepare', request) })),
      Context.add(Mailer, Mailer.of({ send: (email) => told(once, '/mail', email) })),
    )
  })).pipe(Layer.provide(FetchHttpClient.layer))

/** The deployment of the orders, which the routes call. */
type OrderTypes = TypesOf<typeof order>

export class Orders extends Context.Service<Orders, Handle<OrderTypes>>()('examples/server/Orders') {}

/**
 * The runner: the layers `HttpRunner.layerHttp` builds, with `sharding` in place of `Sharding.layer`, so that the
 * versions are recorded before Cluster registers the runner (decision 0174). The runners send to each other over
 * HTTP at `/runner`, with the serialization `BunClusterHttp.layer` chooses. A runner that dies stops its heartbeat,
 * and `SqlRunnerStorage` stops reading it once its lease expires, so that its shards move with no check of health.
 * The ping of `RunnerHealth.layerPing`, `BunClusterHttp.layer`'s default, also takes the shards of a runner that
 * still beats but does not answer. `sharding` answers through it whether a runner runs the newest version, so the
 * check of health is also what moves the shards of an older version once a newer one launches (decision 0159). The
 * runtime is launched and the orders deployed in the layer's scope, so that
 * they stop when the server stops.
 */
const orders = (settings: Settings) =>
  Layer.effect(
    Orders,
    Effect.flatMap(launchOnCluster(), (runtime) => runtime.deploy(order)),
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

/** The path the runners send to each other at, beside the boundary's routes. */
const runnerPath = '/runner'

/**
 * A request the boundary refuses, answered with its status. It is `Respondable`, so the router answers it as it
 * answers a `SchemaError`, with no handler of its own.
 */
class Refused extends Data.TaggedError('Refused')<{ readonly status: number; readonly reason: string }>
  implements HttpServerRespondable.Respondable
{
  [HttpServerRespondable.symbol]() {
    return HttpServerResponse.json({ _tag: 'Refused', reason: this.reason }, { status: this.status })
  }
}

/**
 * Who calls, from `Authorization: Bearer <who>`: `customer:<id>`, `warehouse` or `operator`. A real boundary checks
 * a token here, and the example only reads the name the token carries (decision 0124).
 */
const Caller = Schema.Struct({
  authorization: Schema.Union([
    Schema.Literals(['Bearer warehouse', 'Bearer operator']),
    Schema.TemplateLiteralParser(['Bearer customer:', Schema.NonEmptyString]),
  ]),
})

const caller = HttpServerRequest.schemaHeaders(Caller).pipe(
  Effect.mapError(() => new Refused({ status: 401, reason: 'no caller' })),
  Effect.map(({ authorization }): Sender | 'Operator' =>
    authorization === 'Bearer warehouse'
      ? { _tag: 'Warehouse' }
      : authorization === 'Bearer operator'
      ? 'Operator'
      : { _tag: 'Customer', id: authorization[1] }
  ),
)

/** The request id of a create or a send, which a caller gives so that its retry is answered once. */
const RequestId = Schema.Struct({ 'idempotency-key': Schema.NonEmptyString })

/** A request of a caller: its sender and its request id. */
const request = Effect.gen(function*() {
  const sender = yield* caller
  if (sender === 'Operator') return yield* new Refused({ status: 403, reason: 'an operator sends nothing' })
  const headers = yield* HttpServerRequest.schemaHeaders(RequestId).pipe(
    Effect.mapError(() => new Refused({ status: 400, reason: 'no Idempotency-Key' })),
  )
  return { sender, requestId: headers['idempotency-key'] }
})

const operator = Effect.flatMap(
  caller,
  (who) => who === 'Operator' ? Effect.void : Effect.fail(new Refused({ status: 403, reason: 'no operator' })),
)

const id = Effect.map(HttpRouter.schemaPathParams(Schema.Struct({ id: Schema.NonEmptyString })), ({ id }) => id)

/**
 * The status of each answer. A suspended order is answered `409` and not `503`: an HTTP client retries a `503` as
 * transient, and a suspended order waits for an operator.
 */
const status: Readonly<Record<string, number>> = {
  Created: 201,
  Rejected: 409,
  NotFound: 404,
  Suspended: 409,
  StillSuspended: 409,
  NotSuspended: 409,
  NotDiscarded: 409,
}

const answer = (body: Readonly<{ _tag: string }>) => HttpServerResponse.json(body, { status: status[body._tag] ?? 200 })

const Creation = Schema.Struct({ totalInCents: Schema.Int })

const routes = Layer.mergeAll(
  HttpRouter.add('GET', '/health', HttpServerResponse.text('ok')),
  HttpRouter.add(
    'PUT',
    '/orders/:id',
    Effect.gen(function*() {
      const { sender, requestId } = yield* request
      if (sender._tag !== 'Customer') return yield* new Refused({ status: 403, reason: 'only a customer orders' })
      const { totalInCents } = yield* HttpServerRequest.schemaBodyJson(Creation)
      const orders = yield* Orders
      const flags = { order: { customer: sender.id, totalInCents } }
      return yield* answer(yield* orders.create(yield* id, flags, { sender, requestId }))
    }),
  ),
  HttpRouter.add(
    'POST',
    '/orders/:id/events',
    Effect.gen(function*() {
      const caller = yield* request
      const message = yield* HttpServerRequest.schemaBodyJson(order.schemas.inbound)
      const orders = yield* Orders
      return yield* answer(yield* orders.send(yield* id, message, caller))
    }),
  ),
  HttpRouter.add(
    'GET',
    '/orders/:id',
    Effect.gen(function*() {
      const orders = yield* Orders
      const read = yield* orders.read(yield* id)
      return yield* read === null ? answer({ _tag: 'NotFound' }) : HttpServerResponse.json(read)
    }),
  ),
  HttpRouter.add(
    'POST',
    '/orders/:id/resume',
    Effect.gen(function*() {
      yield* operator
      const orders = yield* Orders
      return yield* answer(yield* orders.resume(yield* id))
    }),
  ),
  HttpRouter.add(
    'POST',
    '/orders/:id/discard',
    Effect.gen(function*() {
      yield* operator
      const orders = yield* Orders
      return yield* answer(yield* orders.discard(yield* id))
    }),
  ),
)

/**
 * The server: the boundary's routes and the runner's, given the orders and the runner from outside `serve`, so that
 * both share one deployment and one `Sharding`.
 */
export const server = (settings: Settings) =>
  HttpRouter.serve(
    Layer.mergeAll(routes, RunnerServer.layer.pipe(Layer.provide(RpcServer.layerProtocolHttp({ path: runnerPath })))),
    { disableListenLog: true, disableLogger: true },
  ).pipe(Layer.provide(orders(settings)))
