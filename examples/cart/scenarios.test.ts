/**
 * The cart's scenarios, rehearsed: each line is a child by id, addressed as `{ _tag: 'Line', id, message }`.
 */
import { describe, expect, test } from 'bun:test'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import { accepted, rehearse, rejected } from '../../src/index.testing.ts'
import { cart } from './cart.ts'

const start = { flags: null, at: DateTime.makeUnsafe('2026-11-05T10:00:00Z') }

describe('cart', () => {
  test('a line reserves its stock, and is sold at checkout', () =>
    Effect.runPromise(rehearse(
      cart,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'ItemAdded', sku: 'mug', quantity: 2 }, null)
        const reserve = yield* rehearsal.pending('Line.reserve', 'mug')
        expect(reserve.work).toEqual({
          _tag: 'Line.Reserve',
          id: 'mug',
          operation: { _tag: 'Reserve', sku: 'mug', quantity: 2 },
        })
        yield* rehearsal.answer(reserve, {
          _tag: 'Line',
          id: 'mug',
          message: { _tag: 'StockReserved', reservation: 'r-1' },
        })
        expect(yield* rehearsal.send({ _tag: 'CheckoutRequested' }, null)).toEqual(accepted)
        expect(yield* rehearsal.projection).toEqual({
          phase: 'CheckedOut',
          lines: [{ sku: 'mug', status: 'Sold', quantity: 2, canRemove: false }],
          canCheckout: false,
        })
      }),
    )))

  test('a line checked out while it reserves is sold when its reservation is made', () =>
    Effect.runPromise(rehearse(
      cart,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'ItemAdded', sku: 'mug', quantity: 1 }, null)
        const reserve = yield* rehearsal.pending('Line.reserve', 'mug')
        yield* rehearsal.send({ _tag: 'CheckoutRequested' }, null)
        // The reservation under way is the same work: the checkout did not start it anew.
        expect((yield* rehearsal.pending('Line.reserve', 'mug')).idempotencyKey).toBe(reserve.idempotencyKey)
        yield* rehearsal.answer(reserve, {
          _tag: 'Line',
          id: 'mug',
          message: { _tag: 'StockReserved', reservation: 'r-1' },
        })
        expect((yield* rehearsal.state).lines['mug']).toMatchObject({ _tag: 'Sold', reservation: 'r-1' })
      }),
    )))

  test('a reserved line releases its stock before it leaves the cart', () =>
    Effect.runPromise(rehearse(
      cart,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'ItemAdded', sku: 'mug', quantity: 1 }, null)
        // A line reserving its stock cannot be removed: only the reservation's answer leaves that state.
        expect(yield* rehearsal.send({ _tag: 'Line', id: 'mug', message: { _tag: 'RemoveRequested' } }, null))
          .toMatchObject(rejected)
        yield* rehearsal.answer('Line.reserve', 'mug', {
          _tag: 'Line',
          id: 'mug',
          message: { _tag: 'StockReserved', reservation: 'r-1' },
        })
        yield* rehearsal.send({ _tag: 'Line', id: 'mug', message: { _tag: 'RemoveRequested' } }, null)
        expect((yield* rehearsal.state).lines['mug']?._tag).toBe('Releasing')
        yield* rehearsal.answer('Line.release', 'mug', {
          _tag: 'Line',
          id: 'mug',
          message: { _tag: 'StockReleased' },
        })
        expect((yield* rehearsal.state).lines).toEqual({})
      }),
    )))

  test('a line that is not in the cart rejects what it is sent, and nothing is added after checkout', () =>
    Effect.runPromise(rehearse(
      cart,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        expect(yield* rehearsal.send({ _tag: 'Line', id: 'mug', message: { _tag: 'RemoveRequested' } }, null))
          .toMatchObject(rejected)
        yield* rehearsal.send({ _tag: 'CheckoutRequested' }, null)
        expect(yield* rehearsal.send({ _tag: 'ItemAdded', sku: 'mug', quantity: 1 }, null)).toMatchObject(rejected)
      }),
    )))
})
