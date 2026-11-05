/**
 * The orders on the runtime, and the question the stored states could not answer: which of them nobody paid.
 * The read model is the projection, written in each step's transaction, and `unpaidUntil` is the index a query
 * reads it by (decision 0032).
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Layer from 'effect/Layer'
import { SqlClient } from 'effect/sql'
import { createTables, launch } from '../../src/index.ts'
import { Mailer, order, Payments, Warehouse } from './order.ts'
import { statusReport } from './report.ts'

const ada = { _tag: 'Customer', id: 'ada' } as const
/** A limit no reading of this test reaches: a reading says how many rows it takes (decision 0141). */
const all = 100

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
      limit: all,
      where: [{ index: 'unpaidUntil', is: '<=', value: now + 3_600_000 }],
      order: { index: 'unpaidUntil' },
    })
    expect(unpaid.map(({ id }) => id)).toEqual(['o-1', 'o-3'])
    expect(unpaid[0]?.projection).toMatchObject({ status: 'AwaitingPayment', canPay: true })
    // A page reads on from the last row of the page before, by the index it orders by and then by the id.
    const firstPage = yield* orders.query({ limit: 1, order: { index: 'unpaidUntil' } })
    const secondPage = yield* orders.query({ limit: 2, order: { index: 'unpaidUntil' }, after: firstPage.at(-1) })
    expect([...firstPage, ...secondPage].map(({ id }) => id)).toEqual(['o-2', 'o-1', 'o-3'])

    // Nobody is late yet, and the order that was paid holds no deadline to be found by.
    expect(yield* orders.query({ limit: all, where: [{ index: 'unpaidUntil', is: '<=', value: now }] })).toEqual([])
    expect((yield* orders.query({ limit: all, where: [{ index: 'unpaidUntil', is: '=', value: null }] })).map(({ id }) => id))
      .toEqual(['o-2'])
    expect((yield* orders.query({ limit: all, where: [{ index: 'unpaidUntil', is: '<>', value: null }] })).map(({ id }) => id))
      .toEqual(['o-1', 'o-3'])
    // An order against no value finds nothing, as in SQL.
    expect(yield* orders.query({ limit: all, where: [{ index: 'unpaidUntil', is: '<', value: null }] })).toEqual([])

    // A number over the orders is one statement, which reads no projection: how many await their payment, and
    // what they owe, the paid order left out by its null (decision 0148).
    expect(yield* orders.count({ where: [{ index: 'unpaidUntil', is: '<>', value: null }] })).toBe(2)
    expect(yield* orders.count({})).toBe(3)
    expect(yield* orders.sum({ index: 'owedInCents' })).toBe(2_000)
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
    const statuses = yield* orders.published('status', [], all)
    expect(statuses.map(({ id, kind, message, value }) => [id, kind, message?._tag ?? null, value]))
      .toEqual([
        ['o-1', 'Creation', null, 'AwaitingPayment'],
        ['o-1', 'Inbound', 'PayRequested', 'Charging'],
        ['o-1', 'Internal', 'ChargeSucceeded', 'Paid'],
      ])
    const billing = yield* orders.published('billing', [], all)
    expect(billing.map(({ kind, message, value }) => [kind, message?._tag ?? null, value.charge])).toEqual([
      ['Creation', null, null],
      ['Internal', 'ChargeSucceeded', 'ch_1'],
    ])
    // The rows of one step share its `seq`, so a topic's `seq`s have gaps where a step published only others.
    expect(billing.map(({ seq }) => seq)).toEqual([0, 2].map((at) => statuses[at]?.seq ?? 0))

    // A consumer is a name within its topic, and its cursors are stored: it reads from where it acked, and a prune
    // drops, in each topic, what every consumer of the topic has read (decisions 0039, 0138). The rows of one order
    // are in its partition, in the order of their `seq`, and an ack is given the rows acted on (decision 0137).
    expect(yield* orders.feed('billing', 'invoices', all)).toEqual(billing)
    expect(yield* orders.feed('status', 'dashboard', all)).toEqual(statuses)
    yield* orders.ack('status', 'dashboard', statuses.slice(0, 2))
    expect(yield* orders.feed('status', 'dashboard', all)).toEqual(statuses.slice(2))
    expect(yield* orders.prune).toBe(2)
    expect(yield* orders.published('status', [], all)).toEqual(statuses.slice(2))
    expect(yield* orders.published('billing', [], all)).toEqual(billing)
    // What each consumer still has to act on, as an operator sees it.
    const partition = statuses[0]?.partition ?? 0
    expect(yield* orders.consumers).toEqual([
      { topic: 'billing', consumer: 'invoices', behind: 2, cursors: [{ partition, seq: 0 }] },
      { topic: 'status', consumer: 'dashboard', behind: 1, cursors: [{ partition, seq: statuses[1]?.seq ?? 0 }] },
    ])

    // A consumer that has read everything waits for the next row of its topic instead of polling: the creation of
    // another order ends its wait, and a wait with no row would give none after ten seconds (decision 0142).
    yield* orders.ack('status', 'dashboard', statuses)
    const next = yield* Effect.forkChild(orders.feed('status', 'dashboard', all, { millis: 10_000 }))
    yield* orders.create('o-2', { order: { customer: 'ada', totalInCents: 500 } }, { requestId: 'c-o-2', sender: ada })
    expect((yield* Fiber.join(next)).map(({ id, value }) => [id, value])).toEqual([['o-2', 'AwaitingPayment']])
  }))))

test('a report fed from the log counts the orders in each status, as the read model counts them one at a time', () =>
  database(Effect.scoped(Effect.gen(function*() {
    const runtime = yield* launch()
    const orders = yield* Effect.provide(runtime.deploy(order), world)
    const report = yield* statusReport

    for (const id of ['o-1', 'o-2', 'o-3', 'o-4']) {
      yield* orders.create(id, { order: { customer: 'ada', totalInCents: 1_000 } }, {
        requestId: `c-${id}`,
        sender: ada,
      })
    }
    for (const id of ['o-2', 'o-3']) {
      yield* orders.send(id, { _tag: 'PayRequested', payment: 'card-1' }, { requestId: `p-${id}`, sender: ada })
    }
    yield* orders.send('o-4', { _tag: 'CancelRequested' }, { requestId: 'x-o-4', sender: ada })
    yield* runtime.settled

    // The consumer: a page of its topic, written to the store, then acked, until a page is empty. A consumer that
    // serves a dashboard reads with a wait instead, and never stops (decision 0142). The first page is written and
    // not acked, as a crash between the two leaves it, so the consumer reads it again and writes it again.
    yield* report.record(yield* orders.feed('status', 'dashboard', 3))
    while (true) {
      const page = yield* orders.feed('status', 'dashboard', 3)
      if (page.length === 0) break
      yield* report.record(page)
      yield* orders.ack('status', 'dashboard', page)
    }

    // The store answers the question in one statement, and agrees with the read model, which answers it with a
    // count per status, each on a snapshot of its own (decisions 0148, 0149).
    const counts = yield* report.counts
    expect(counts).toEqual({ AwaitingPayment: 1, Paid: 2, Cancelled: 1 })
    for (const status of ['AwaitingPayment', 'Charging', 'Paid', 'Refunding', 'Shipped', 'Cancelled'] as const) {
      expect(yield* orders.count({ where: [{ index: 'status', is: '=', value: status }] })).toBe(counts[status] ?? 0)
    }
  }))))
