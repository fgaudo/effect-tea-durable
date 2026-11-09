/**
 * The rental on the runtime, in one database with the application's table of customers. The boundary rents a bike
 * as a request handler would, and a retry of its request creates no second ride.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import type * as Scope from 'effect/Scope'
import { SqlClient } from 'effect/sql'
import { type Handle, launch, type TypesOf } from '@fgaudo/effect-tea-persistent'
import { bike } from './bike.ts'
import { createCustomers, rent, rideOf } from './boundary.ts'
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

// The ride as one would write it at first: the end holds no email, so a ride that ends while its email is sent
// drops an operation under way, which is a defect, and suspends the ride.
const forgetful: typeof ride = {
  ...ride,
  work: (state) =>
    state._tag === 'Docking' || state._tag === 'Ended' ? ride.work({ ...state, email: 'Sent' }) : ride.work(state),
}

test('a ride the first version suspends is inspected, and resumed by the fix', () =>
  database(Effect.gen(function*() {
    const ann = { _tag: 'Customer', id: 'ann' } as const
    const request = { customer: 'ann', bike: 'bike-7', centsPerMinute: 20, requestId: 'r-1' }
    const end = { _tag: 'EndRequested' } as const
    const id = rideOf(request)

    // The first process runs the forgetful ride, and its mail server never answers.
    yield* Effect.scoped(Effect.gen(function*() {
      const mailing = yield* Deferred.make<void>()
      const silent = Layer.succeed(
        Mailer,
        Mailer.of({ send: () => Effect.andThen(Deferred.succeed(mailing, undefined), Effect.never) }),
      )
      const runtime = yield* launch()
      const sql = yield* SqlClient.SqlClient
      yield* createCustomers
      yield* sql`INSERT INTO customers (id, email) VALUES ('ann', 'ann@example.com')`
      const bikes = yield* runtime.deploy(bike)
      const rides = yield* Effect.provide(runtime.deploy(forgetful), silent)
      yield* bikes.create('bike-7', { centsPerMinute: 20 }, { requestId: 'add-bike-7', sender: operator })
      yield* rent(rides)(request)
      yield* Deferred.await(mailing)
      // The customer ends the ride while its email is under way: the step dies, and the caller has no reply yet.
      expect(yield* rides.send(id, end, { requestId: 'end-1', sender: ann })).toEqual({ _tag: 'Suspended' })
      const [suspension] = yield* rides.suspended
      expect(suspension).toMatchObject({ id, on: { _tag: 'Message', kind: 'Inbound' } })
      expect(suspension?.cause).toContain("the step dropped the operation under 'email' before its completion")
      // What the operator reads to decide: the state before the message, the message next, and the work the state
      // holds, the email under way and the cancellation's timer, which waits disarmed until the ride is resumed.
      const inspected = yield* rides.inspect(id)
      expect(inspected?.state).toMatchObject({ _tag: 'Riding', email: 'Sending' })
      expect(inspected?.mailbox).toMatchObject([{ _tag: 'Inbound', message: end }])
      expect(inspected?.work.map(({ key }) => key.name)).toEqual(['cancellation', 'email'])
    }))

    // The fix is a deploy, by a new process on the same database: the ride stays suspended through it.
    yield* Effect.scoped(Effect.gen(function*() {
      const runtime = yield* launch()
      const bikes = yield* runtime.deploy(bike)
      const rides = yield* Effect.provide(runtime.deploy(ride), mailer)
      expect((yield* rides.suspended).map((suspension) => suspension.id)).toEqual([id])
      expect(yield* rides.resume(id)).toEqual({ _tag: 'Resumed' })
      yield* runtime.settled
      // The end is applied by the fix. The email was under way when the first process stopped, and is sent at most
      // once, so the ride records that it is not known.
      expect(yield* rides.inspect(id)).toMatchObject({ state: { _tag: 'Ended', email: 'Unsure' }, suspension: null })
      expect(yield* bikes.read('bike-7')).toMatchObject({ status: 'Docked', rides: 1 })
      // The customer's retry is answered from the reply the fix stored, and ends nothing twice.
      expect(yield* rides.send(id, end, { requestId: 'end-1', sender: ann })).toEqual({ _tag: 'Accepted' })
    }))
  })))

// A rename is the launch's: the rows of the old name move to the new one before any deploy, and the bike keeps its
// state under the name it now carries.
test('a bike renamed by the launch keeps its state under its new name', () =>
  database(Effect.gen(function*() {
    yield* Effect.scoped(Effect.gen(function*() {
      const runtime = yield* launch()
      const bikes = yield* runtime.deploy(bike)
      yield* bikes.create('bike-7', { centsPerMinute: 20 }, { requestId: 'add-bike-7', sender: operator })
    }))
    yield* Effect.scoped(Effect.gen(function*() {
      const runtime = yield* launch({ renames: { Bike: 'Cycle' } })
      const cycles = yield* runtime.deploy({ ...bike, name: 'Cycle' })
      expect(yield* cycles.read('bike-7')).toMatchObject({ status: 'Docked', centsPerMinute: 20 })
    }))
  })))
