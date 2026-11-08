/**
 * The subscription's scenarios, rehearsed.
 */
import { describe, expect, test } from 'bun:test'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import { accepted, rehearse, rejected } from '../../src/index.ts'
import { type Sender, subscription } from './subscription.ts'

const startedAt = DateTime.makeUnsafe('2026-01-31T10:00:00Z')
/** A time as the projection gives it: its milliseconds (decision 0139). */
const millis = (iso: string) => DateTime.toEpochMillis(DateTime.makeUnsafe(iso))

const start = {
  flags: { customer: 'ada', payment: 'card-1', plan: { name: 'Basic', priceInCents: 900 } },
  at: startedAt,
}

const ada: Sender = { _tag: 'Customer', id: 'ada' }

const support: Sender = { _tag: 'Support' }

describe('subscription', () => {
  test('each month is charged, and ends on the day the subscription started', () =>
    Effect.runPromise(rehearse(
      subscription,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.answer('charge', { _tag: 'ChargeSucceeded' })
        expect((yield* rehearsal.projection).paidUntil).toBe(millis('2026-02-28T10:00:00Z'))
        yield* rehearsal.fire('renewal')
        yield* rehearsal.answer('charge', { _tag: 'ChargeSucceeded' })
        expect((yield* rehearsal.projection).paidUntil).toBe(millis('2026-03-31T10:00:00Z'))
      }),
    )))

  // Time passes by a duration, and the renewal fires at its time within it, not before (decision 0187).
  test('the renewal comes due when its period has passed', () =>
    Effect.runPromise(rehearse(
      subscription,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.answer('charge', { _tag: 'ChargeSucceeded' })
        yield* rehearsal.advance('27 days')
        expect(yield* rehearsal.underWay('charge')).toBeNull()
        yield* rehearsal.advance('1 day')
        expect(yield* rehearsal.underWay('charge')).not.toBeNull()
      }),
    )))

  test('a period paid from the credit arms the next renewal', () =>
    Effect.runPromise(rehearse(
      subscription,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.answer('charge', { _tag: 'ChargeSucceeded' })
        yield* rehearsal.send({ _tag: 'CreditGranted', amountInCents: 2_000 }, support)
        const first = yield* rehearsal.pending('renewal')
        expect(yield* rehearsal.fire(first)).toBe('Delivered')
        // The state stayed `Active`, with the same key: the timer fired, so the key is new work.
        const second = yield* rehearsal.pending('renewal')
        expect(second.idempotencyKey).not.toBe(first.idempotencyKey)
        expect(yield* rehearsal.fire(first)).toBe('Dropped')
        expect(yield* rehearsal.projection).toMatchObject({ status: 'Active', creditInCents: 1_100 })
      }),
    )))

  test('a plan change applies at the next renewal', () =>
    Effect.runPromise(rehearse(
      subscription,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.answer('charge', { _tag: 'ChargeSucceeded' })
        yield* rehearsal.send({ _tag: 'PlanChangeRequested', plan: { name: 'Pro', priceInCents: 1_900 } }, ada)
        expect((yield* rehearsal.projection).plan.name).toBe('Basic')
        yield* rehearsal.fire('renewal')
        expect(yield* rehearsal.projection).toMatchObject({ plan: { name: 'Pro' }, nextPlan: null })
      }),
    )))

  test('a charge declined three times cancels the subscription', () =>
    Effect.runPromise(rehearse(
      subscription,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.answer('charge', { _tag: 'ChargeDeclined' })
        yield* rehearsal.fire('retry')
        yield* rehearsal.answer('charge', { _tag: 'ChargeDeclined' })
        yield* rehearsal.fire('retry')
        yield* rehearsal.answer('charge', { _tag: 'ChargeDeclined' })
        expect(yield* rehearsal.state).toMatchObject({ _tag: 'Cancelled', reason: 'Unpaid' })
      }),
    )))

  test('a new payment method is charged at once when past due', () =>
    Effect.runPromise(rehearse(
      subscription,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.answer('charge', { _tag: 'ChargeDeclined' })
        const retry = yield* rehearsal.pending('retry')
        expect(yield* rehearsal.send({ _tag: 'PaymentMethodUpdated', payment: 'card-2' }, ada)).toEqual(accepted)
        expect(yield* rehearsal.fire(retry)).toBe('Dropped')
        yield* rehearsal.answer('charge', { _tag: 'ChargeSucceeded' })
        expect((yield* rehearsal.state)._tag).toBe('Active')
      }),
    )))

  // The charge restarted after a crash is the one that started, under the same idempotency key (decision 0018).
  test('a new payment method during a charge is used from the next one, even after a crash', () =>
    Effect.runPromise(rehearse(
      subscription,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        const before = yield* rehearsal.pending('charge')
        expect(before.work).toMatchObject({ _tag: 'Charge', payment: 'card-1', totalInCents: 900 })
        expect(yield* rehearsal.send({ _tag: 'PaymentMethodUpdated', payment: 'card-2' }, ada)).toEqual(accepted)
        yield* rehearsal.restart
        expect(yield* rehearsal.pending('charge')).toEqual(before)
        expect(yield* rehearsal.projection).toMatchObject({ status: 'Charging' })
      }),
    )))

  test('a cancellation during a charge applies when the charge ends', () =>
    Effect.runPromise(rehearse(
      subscription,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        expect(yield* rehearsal.send({ _tag: 'CancelRequested' }, ada)).toEqual(accepted)
        yield* rehearsal.answer('charge', { _tag: 'ChargeSucceeded' })
        // The period is paid: the subscription ends with it.
        expect(yield* rehearsal.projection).toMatchObject({ status: 'Active', canResume: true })
        yield* rehearsal.fire('renewal')
        expect(yield* rehearsal.state).toMatchObject({ _tag: 'Cancelled', reason: 'ByCustomer' })
      }),
    )))

  test('the renewal survives a restart', () =>
    Effect.runPromise(rehearse(
      subscription,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.answer('charge', { _tag: 'ChargeSucceeded' })
        const before = yield* rehearsal.pending('renewal')
        yield* rehearsal.restart
        const after = yield* rehearsal.pending('renewal')
        expect(after.idempotencyKey).toBe(before.idempotencyKey)
        expect(yield* rehearsal.fire(after)).toBe('Delivered')
      }),
    )))

  test('only support grants credit', () =>
    Effect.runPromise(rehearse(
      subscription,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        expect(yield* rehearsal.send({ _tag: 'CreditGranted', amountInCents: 2_000 }, ada)).toMatchObject(rejected)
      }),
    )))
})
