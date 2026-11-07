/**
 * The orders of `examples/order` served over HTTP by a runner of Effect Cluster, on a file of SQLite
 * (decision 0178). The boundary takes the request id from `Idempotency-Key` and the sender from `Authorization`,
 * and calls the door of the orders through the deployment. The world the orders act on is a server of its own,
 * which the runner reaches over HTTP.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import {
  RunnerAddress,
  RunnerHealth,
  Runners,
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
import { type Handle, launchOnCluster, type Program, sharding } from '../../src/index.ts'
import { Mailer, order, Payments, type Sender, Warehouse } from '../order/order.ts'

/** Where the runner's file and the world are, and the port its boundary listens on. */
export type Settings = Readonly<{ filename: string; world: string; host: string; port: number }>

/**
 * The world over HTTP, through one client of the world's address. A transport's failure is retried for a while and
 * is then a defect, which suspends the order: the world's `402` is the only failure an operation of the orders
 * declares.
 */
const world = (base: string) =>
  Layer.effectContext(Effect.gen(function*() {
    const client = (yield* HttpClient.HttpClient).pipe(
      HttpClient.mapRequest(HttpClientRequest.prependUrl(base)),
      HttpClient.retryTransient({ schedule: Schedule.spaced('200 millis'), times: 50 }),
    )
    const post = (path: string, body: unknown) => client.post(path, { body: HttpBody.jsonUnsafe(body) })
    const told = (path: string, body: unknown) =>
      post(path, body).pipe(Effect.flatMap(HttpClientResponse.filterStatusOk), Effect.orDie, Effect.asVoid)
    const Charged = Schema.Struct({ charge: Schema.String })
    const payments = Payments.of({
      charge: (request) =>
        post('/charge', request).pipe(
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
      refund: (request) => told('/refund', request),
    })
    return Context.make(Payments, payments).pipe(
      Context.add(Warehouse, Warehouse.of({ prepare: (request) => told('/prepare', request) })),
      Context.add(Mailer, Mailer.of({ send: (email) => told('/mail', email) })),
    )
  })).pipe(Layer.provide(FetchHttpClient.layer))

/** The deployment of the orders, which the routes call. */
type OrderTypes = typeof order extends Program<infer T> ? T : never

export class Orders extends Context.Service<Orders, Handle<OrderTypes>>()('examples/server/Orders') {}

/**
 * The runner: the layers `SingleRunner.layer` builds, with `sharding` in place of `Sharding.layer`, so that the
 * versions are recorded before Cluster registers the runner (decision 0174). The runtime is launched and the
 * orders deployed in the layer's scope, so that they stop when the server stops.
 */
const orders = (settings: Settings) =>
  Layer.effect(
    Orders,
    Effect.flatMap(launchOnCluster(), (runtime) => runtime.deploy(order)),
  ).pipe(
    Layer.provide(world(settings.world)),
    Layer.provide(
      sharding([order]).pipe(
        Layer.provideMerge(Runners.layerNoop),
        Layer.provideMerge(SqlMessageStorage.layer),
        Layer.provide([Layer.orDie(SqlRunnerStorage.layer), RunnerHealth.layerNoop]),
        Layer.provideMerge(ShardingConfig.layer({
          runnerAddress: Option.some(RunnerAddress.make(settings.host, settings.port)),
        })),
        Layer.provideMerge(SqliteClient.layer({ filename: settings.filename })),
        Layer.provide(Digest.layerWebCrypto),
        Layer.orDie,
      ),
    ),
  )

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

const status: Readonly<Record<string, number>> = {
  Created: 201,
  Rejected: 409,
  NotFound: 404,
  Suspended: 503,
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

/** The server: the routes, given the orders from outside `serve`, so that the routes share one deployment. */
export const server = (settings: Settings) =>
  HttpRouter.serve(routes, { disableListenLog: true }).pipe(Layer.provide(orders(settings)))
