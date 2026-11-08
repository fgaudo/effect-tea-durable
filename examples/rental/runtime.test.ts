/**
 * The rental on the runtime, in one database with the application's table of customers. The boundary rents a bike
 * as a request handler would, and a retry of its request creates no second ride.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import type * as Scope from 'effect/Scope'
import { SqlClient } from 'effect/sql'
import { type Handle, launch, type TypesOf } from '@fgaudo/effect-tea-persistent'
import { bike } from './bike.ts'
import { createCustomers, rent } from './boundary.ts'
import { Mailer, ride } from './ride.ts'

const operator = { _tag: 'Operator' } as const

const mailer = Layer.succeed(Mailer, Mailer.of({ send: () => Effect.void }))

const database = <A, E>(test: Effect.Effect<A, E, SqlClient.SqlClient | Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(test).pipe(
      Effect.provide(SqliteClient.layer({ filename: ':memory:' })),
      Effect.orDie,
    ),
  )

/** The runtime, the rental's programs and a customer, Ann, in the application's table. */
const rental = Effect.gen(function*() {
  const runtime = yield* launch()
  const sql = yield* SqlClient.SqlClient
  // The application's table is written on the client the runtime was launched with, in the same database.
  yield* createCustomers
  yield* sql`INSERT INTO customers (id, email) VALUES ('ann', 'ann@example.com')`
  const bikes = yield* runtime.deploy(bike)
  const rides = yield* Effect.provide(runtime.deploy(ride), mailer)
  yield* bikes.create('bike-7', { centsPerMinute: 20 }, { requestId: 'add-bike-7', sender: operator })
  return { runtime, bikes, rides }
})

/** The rate the bike's page shows: the boundary reads it off the bike's projection. */
const rateShown = (bikes: Handle<TypesOf<typeof bike>>) =>
  Effect.flatMap(bikes.read('bike-7'), (shown) =>
    shown === null ? Effect.die('bike-7 was never added') : Effect.succeed(shown.centsPerMinute))

test('a rent sent twice creates one ride, which unlocks the bike', () =>
  database(Effect.gen(function*() {
    const { runtime, bikes, rides } = yield* rental
    const request = { customer: 'ann', bike: 'bike-7', centsPerMinute: yield* rateShown(bikes), requestId: 'r-1' }
    // The customer's app sent the request again, since it never received the first answer.
    const first = yield* rent(rides)(request)
    const again = yield* rent(rides)(request)
    expect(again).toEqual(first)
    yield* runtime.settled
    expect(yield* rides.count({})).toBe(1)
    expect(first._tag === 'Rented' ? yield* rides.read(first.ride) : null).toMatchObject({ status: 'Riding' })
    expect(yield* bikes.read('bike-7')).toMatchObject({ status: 'Ridden' })
  })))

// What the boundary must not do: an id drawn at each try is a second ride on a retry.
test('a ride id drawn anew at each try creates a second ride, which the bike refuses', () =>
  database(Effect.gen(function*() {
    const { runtime, rides } = yield* rental
    const flags = { customer: 'ann', email: 'ann@example.com', bike: 'bike-7', centsPerMinute: 20 }
    const sender = { _tag: 'Customer', id: 'ann' } as const
    for (const id of ['drawn-1', 'drawn-2']) {
      expect(yield* rides.create(id, flags, { requestId: 'r-1', sender })).toEqual({ _tag: 'Created' })
    }
    yield* runtime.settled
    expect(yield* rides.count({})).toBe(2)
    expect(yield* rides.read('drawn-2')).toMatchObject({ status: 'Refused', refusal: 'InUse' })
  })))

test('a rate changed after the customer was shown it refuses the ride', () =>
  database(Effect.gen(function*() {
    const { runtime, bikes, rides } = yield* rental
    const shown = yield* rateShown(bikes)
    yield* bikes.send('bike-7', { _tag: 'RateSet', centsPerMinute: 25 }, { requestId: 'rate-1', sender: operator })
    const rented = yield* rent(rides)({
      customer: 'ann',
      bike: 'bike-7',
      centsPerMinute: shown,
      requestId: 'r-1',
    })
    yield* runtime.settled
    expect(rented._tag === 'Rented' ? yield* rides.read(rented.ride) : null).toMatchObject({
      status: 'Refused',
      refusal: 'RateChanged',
    })
    expect(yield* bikes.read('bike-7')).toMatchObject({ status: 'Docked', centsPerMinute: 25 })
  })))

test('a customer the application does not know rents nothing', () =>
  database(Effect.gen(function*() {
    const { rides } = yield* rental
    expect(yield* rent(rides)({ customer: 'bob', bike: 'bike-7', centsPerMinute: 20, requestId: 'r-1' }))
      .toEqual({ _tag: 'NoSuchCustomer' })
    expect(yield* rides.count({})).toBe(0)
  })))

// The ride's flags check the rate as the bike's schema does, so a rate no bike holds stores nothing.
test('a rent at a rate no bike can hold dies at the boundary, and creates no ride', () =>
  database(Effect.gen(function*() {
    const { rides } = yield* rental
    const exit = yield* Effect.exit(
      rent(rides)({ customer: 'ann', bike: 'bike-7', centsPerMinute: 0, requestId: 'r-1' }),
    )
    expect(exit._tag).toBe('Failure')
    expect(yield* rides.count({})).toBe(0)
  })))
