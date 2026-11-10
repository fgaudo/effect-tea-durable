/**
 * The order's scenarios, rehearsed.
 */
import { describe, expect, test } from 'bun:test'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import { accepted, rehearse, rejected } from '@fgaudo/effect-tea-persistent/testing'
import { order, type Sender } from './order.ts'

const placedAt = DateTime.makeUnsafe('2026-10-30T10:00:00Z')

const start = { flags: { order: { customer: 'ada', totalInCents: 4_200 } }, at: placedAt }

const ada: Sender = { _tag: 'Customer', id: 'ada' }

const warehouse: Sender = { _tag: 'Warehouse' }

describe('order', () => {
  test('a paid order is shipped', () =>
    Effect.runPromise(rehearse(
      order,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, { sender: ada })
        yield* rehearsal.answer('charge', { _tag: 'ChargeSucceeded', charge: 'ch-1' })
        yield* rehearsal.answer('tell-warehouse', { _tag: 'WarehouseTold' })
        expect(yield* rehearsal.send({ _tag: 'ShipmentReported', tracking: 'tr-1' }, { sender: warehouse })).toEqual(accepted)
        yield* rehearsal.answer('email-shipment', { _tag: 'ShipmentEmailed' })
        expect(yield* rehearsal.state).toMatchObject({ _tag: 'Shipped', email: 'Sent' })
      }),
    )))

  test('a charge declined after the deadline cancels the order at once', () =>
    Effect.runPromise(rehearse(
      order,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        const deadline = yield* rehearsal.pending('payment-deadline')
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, { sender: ada })
        // The timer left the state with the charge: its firing is dropped.
        expect(yield* rehearsal.fire(deadline)).toBe('Dropped')
        yield* rehearsal.answer('charge', { _tag: 'ChargeDeclined' })
        expect(yield* rehearsal.fire('payment-deadline')).toBe('Delivered')
        expect(yield* rehearsal.state).toMatchObject({ _tag: 'Cancelled', reason: 'Unpaid' })
      }),
    )))

  test('the late answer of a first charge does not complete the second', () =>
    Effect.runPromise(rehearse(
      order,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, { sender: ada })
        const first = yield* rehearsal.pending('charge')
        yield* rehearsal.answer(first, { _tag: 'ChargeDeclined' })
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-2' }, { sender: ada })
        const second = yield* rehearsal.pending('charge')
        expect(second.idempotencyKey).not.toBe(first.idempotencyKey)
        expect(yield* rehearsal.answer(first, { _tag: 'ChargeSucceeded', charge: 'ch-1' })).toBe('Dropped')
        expect((yield* rehearsal.state)._tag).toBe('Charging')
      }),
    )))

  test('a charge under way when the process dies runs again with the same idempotency key', () =>
    Effect.runPromise(rehearse(
      order,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, { sender: ada })
        const before = yield* rehearsal.pending('charge')
        yield* rehearsal.restart
        const after = yield* rehearsal.pending('charge')
        expect(after.idempotencyKey).toBe(before.idempotencyKey)
        // The payment provider is given the key's digest, which fits the length it caps a key at.
        expect(after.idempotencyKey).toMatch(/^[A-Za-z0-9_-]{43}$/)
      }),
    )))

  test('a shipment email under way when the process dies is not sent again', () =>
    Effect.runPromise(rehearse(
      order,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, { sender: ada })
        yield* rehearsal.answer('charge', { _tag: 'ChargeSucceeded', charge: 'ch-1' })
        yield* rehearsal.answer('tell-warehouse', { _tag: 'WarehouseTold' })
        yield* rehearsal.send({ _tag: 'ShipmentReported', tracking: 'tr-1' }, { sender: warehouse })
        yield* rehearsal.restart
        expect(yield* rehearsal.state).toMatchObject({ _tag: 'Shipped', email: 'Unsure' })
      }),
    )))

  test('a cancellation before the shipment refunds, and the warehouse does not ship', () =>
    Effect.runPromise(rehearse(
      order,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, { sender: ada })
        yield* rehearsal.answer('charge', { _tag: 'ChargeSucceeded', charge: 'ch-1' })
        yield* rehearsal.answer('tell-warehouse', { _tag: 'WarehouseTold' })
        expect(yield* rehearsal.send({ _tag: 'CancelRequested' }, { sender: ada })).toEqual(accepted)
        // The warehouse hands the parcel over only on an accepted report.
        expect(yield* rehearsal.send({ _tag: 'ShipmentReported', tracking: 'tr-1' }, { sender: warehouse }))
          .toMatchObject(rejected)
        yield* rehearsal.answer('refund', { _tag: 'RefundCompleted' })
        expect(yield* rehearsal.state).toMatchObject({ _tag: 'Cancelled', reason: 'Refunded' })
      }),
    )))

  test('a cancellation is rejected while a charge is under way', () =>
    Effect.runPromise(rehearse(
      order,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, { sender: ada })
        expect((yield* rehearsal.projection).canCancel).toBe(false)
        expect(yield* rehearsal.send({ _tag: 'CancelRequested' }, { sender: ada })).toMatchObject(rejected)
      }),
    )))

  test('only the customer cancels', () =>
    Effect.runPromise(rehearse(
      order,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        expect(yield* rehearsal.send({ _tag: 'CancelRequested' }, { sender: { _tag: 'Customer', id: 'eve' } }))
          .toMatchObject(rejected)
        expect(yield* rehearsal.send({ _tag: 'CancelRequested' }, { sender: warehouse })).toMatchObject(rejected)
      }),
    )))
})
