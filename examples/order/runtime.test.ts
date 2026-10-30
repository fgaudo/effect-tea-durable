/**
 * The orders on the runtime, and the question the stored states could not answer: which of them nobody paid.
 * The read model is the projection, written in each step's transaction, and `unpaidUntil` is the index a query
 * reads it by (decision 0032).
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import { SqlClient } from 'effect/sql'
import { createTables, launch } from '../../src/index.ts'
import { Mailer, order, Payments, Warehouse } from './order.ts'

const ada = { _tag: 'Customer', id: 'ada' } as const

/** The world the orders act on, which answers and records nothing: this test only reads states. */
const world = Layer.mergeAll(
  Layer.succeed(Payments, Payments.of({ charge: () => Effect.succeed('ch_1'), refund: () => Effect.void })),
  Layer.succeed(Warehouse, Warehouse.of({ prepare: () => Effect.void })),
  Layer.succeed(Mailer, Mailer.of({ send: () => Effect.void })),
)

const database = <A, E>(test: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.runPromise(
    Effect.scoped(Effect.flatMap(createTables, () => test)).pipe(
      Effect.provide(SqliteClient.layer({ filename: ':memory:' })),
      Effect.orDie,
    ),
  )

test('a query finds the orders nobody paid, and leaves out the one that was', () =>
  database(Effect.scoped(Effect.gen(function*() {
    const runtime = yield* launch()
    const orders = yield* Effect.provide(runtime.deploy(order), world)

    for (const id of ['o-1', 'o-2', 'o-3']) {
      yield* orders.create(id, { order: { customer: 'ada', totalInCents: 1_000 } }, {
        requestId: `c-${id}`,
        sender: ada,
      })
    }
    yield* orders.send('o-2', { _tag: 'PayRequested', payment: 'card-1' }, { requestId: 'p-2', sender: ada })
    yield* runtime.settled
    expect(yield* orders.read('o-2')).toMatchObject({ status: 'Paid', deadline: null })

    // Every order is created with half an hour to pay: the ones still awaiting it are the ones to chase.
    const now = DateTime.toEpochMillis(yield* DateTime.now)
    const unpaid = yield* orders.query({
      where: [{ index: 'unpaidUntil', is: '<=', value: now + 3_600_000 }],
      order: { index: 'unpaidUntil' },
    })
    expect(unpaid.map(({ id }) => id)).toEqual(['o-1', 'o-3'])
    expect(unpaid[0]?.projection).toMatchObject({ status: 'AwaitingPayment', canPay: true })

    // Nobody is late yet, and the order that was paid holds no deadline to be found by.
    expect(yield* orders.query({ where: [{ index: 'unpaidUntil', is: '<=', value: now }] })).toEqual([])
    expect((yield* orders.query({ where: [{ index: 'unpaidUntil', is: '=', value: null }] })).map(({ id }) => id))
      .toEqual(['o-2'])
    expect((yield* orders.query({ where: [{ index: 'unpaidUntil', is: '<>', value: null }] })).map(({ id }) => id))
      .toEqual(['o-1', 'o-3'])
    // An order against no value finds nothing, as in SQL.
    expect(yield* orders.query({ where: [{ index: 'unpaidUntil', is: '<', value: null }] })).toEqual([])
  }))))
