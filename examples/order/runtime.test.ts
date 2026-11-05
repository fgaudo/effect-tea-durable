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

test('what an order published is what another system learns of it, each consumer in its topic', () =>
  database(Effect.scoped(Effect.gen(function*() {
    const runtime = yield* launch()
    const orders = yield* Effect.provide(runtime.deploy(order), world)

    yield* orders.create('o-1', { order: { customer: 'ada', totalInCents: 1_000 } }, {
      requestId: 'c-o-1',
      sender: ada,
    })
    yield* orders.send('o-1', { _tag: 'PayRequested', payment: 'card-1' }, { requestId: 'p-1', sender: ada })
    yield* runtime.settled

    // The steps were the creation, the request to pay, the charge coming back, and the warehouse told. A topic has a
    // row for each step that changed what it selects, holding the message the step handled and the value selected
    // (decisions 0038, 0138, 0140): the status changed at the first three, the charge at the creation and at the
    // charge alone, and the warehouse told changed only `canCancel`, which no topic selects.
    const statuses = yield* orders.published('status', [])
    expect(statuses.map(({ id, kind, message, value }) => [id, kind, message?._tag ?? null, value]))
      .toEqual([
        ['o-1', 'Creation', null, 'AwaitingPayment'],
        ['o-1', 'Inbound', 'PayRequested', 'Charging'],
        ['o-1', 'Internal', 'ChargeSucceeded', 'Paid'],
      ])
    const billing = yield* orders.published('billing', [])
    expect(billing.map(({ kind, message, value }) => [kind, message?._tag ?? null, value.charge])).toEqual([
      ['Creation', null, null],
      ['Internal', 'ChargeSucceeded', 'ch_1'],
    ])
    // The rows of one step share its `seq`, so a topic's `seq`s have gaps where a step published only others.
    expect(billing.map(({ seq }) => seq)).toEqual([0, 2].map((at) => statuses[at]?.seq ?? 0))

    // A consumer is a name within its topic, and its cursors are stored: it reads from where it acked, and a prune
    // drops, in each topic, what every consumer of the topic has read (decisions 0039, 0138). The rows of one order
    // are in its partition, in the order of their `seq`, and an ack is given the rows acted on (decision 0137).
    expect(yield* orders.feed('billing', 'invoices')).toEqual(billing)
    expect(yield* orders.feed('status', 'dashboard')).toEqual(statuses)
    yield* orders.ack('status', 'dashboard', statuses.slice(0, 2))
    expect(yield* orders.feed('status', 'dashboard')).toEqual(statuses.slice(2))
    expect(yield* orders.prune).toBe(2)
    expect(yield* orders.published('status', [])).toEqual(statuses.slice(2))
    expect(yield* orders.published('billing', [])).toEqual(billing)
    // What each consumer still has to act on, as an operator sees it.
    const partition = statuses[0]?.partition ?? 0
    expect(yield* orders.consumers).toEqual([
      { topic: 'billing', consumer: 'invoices', behind: 2, cursors: [{ partition, seq: 0 }] },
      { topic: 'status', consumer: 'dashboard', behind: 1, cursors: [{ partition, seq: statuses[1]?.seq ?? 0 }] },
    ])
  }))))
