/**
 * The subscription's scenarios, as tests would be written. The file is not named `*.test.ts`, since `rehearse`
 * is only declared: `bun test` would run it and fail.
 */
import { describe, expect, test } from 'bun:test'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import { accepted, rehearse, rejected } from '../api.ts'
import { type Sender, subscription } from './subscription.ts'

const startedAt = DateTime.makeUnsafe('2026-01-31T10:00:00Z')

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
        yield* rehearsal.answer(yield* rehearsal.pending('charge'), { _tag: 'ChargeSucceeded' })
        expect(DateTime.formatIso((yield* rehearsal.projection).paidUntil)).toBe('2026-02-28T10:00:00.000Z')
        yield* rehearsal.fire(yield* rehearsal.pending('renewal'))
        yield* rehearsal.answer(yield* rehearsal.pending('charge'), { _tag: 'ChargeSucceeded' })
        expect(DateTime.formatIso((yield* rehearsal.projection).paidUntil)).toBe('2026-03-31T10:00:00.000Z')
      }),
    )))

  test('a period paid from the credit arms the next renewal', () =>
    Effect.runPromise(rehearse(
      subscription,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.answer(yield* rehearsal.pending('charge'), { _tag: 'ChargeSucceeded' })
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
        yield* rehearsal.answer(yield* rehearsal.pending('charge'), { _tag: 'ChargeSucceeded' })
        yield* rehearsal.send({ _tag: 'PlanChangeRequested', plan: { name: 'Pro', priceInCents: 1_900 } }, ada)
        expect((yield* rehearsal.projection).plan.name).toBe('Basic')
        yield* rehearsal.fire(yield* rehearsal.pending('renewal'))
        expect(yield* rehearsal.projection).toMatchObject({ plan: { name: 'Pro' }, nextPlan: null })
      }),
    )))

  test('a charge declined three times cancels the subscription', () =>
    Effect.runPromise(rehearse(
      subscription,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.answer(yield* rehearsal.pending('charge'), { _tag: 'ChargeDeclined' })
        yield* rehearsal.fire(yield* rehearsal.pending('retry'))
        yield* rehearsal.answer(yield* rehearsal.pending('charge'), { _tag: 'ChargeDeclined' })
        yield* rehearsal.fire(yield* rehearsal.pending('retry'))
        yield* rehearsal.answer(yield* rehearsal.pending('charge'), { _tag: 'ChargeDeclined' })
        expect(yield* rehearsal.state).toMatchObject({ _tag: 'Cancelled', reason: 'Unpaid' })
      }),
    )))

  test('a new payment method is charged at once when past due', () =>
    Effect.runPromise(rehearse(
      subscription,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.answer(yield* rehearsal.pending('charge'), { _tag: 'ChargeDeclined' })
        const retry = yield* rehearsal.pending('retry')
        expect(yield* rehearsal.send({ _tag: 'PaymentMethodUpdated', payment: 'card-2' }, ada)).toEqual(accepted)
        expect(yield* rehearsal.fire(retry)).toBe('Dropped')
        yield* rehearsal.answer(yield* rehearsal.pending('charge'), { _tag: 'ChargeSucceeded' })
        expect((yield* rehearsal.state)._tag).toBe('Active')
      }),
    )))

  test('a cancellation during a charge applies when the charge ends', () =>
    Effect.runPromise(rehearse(
      subscription,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        expect(yield* rehearsal.send({ _tag: 'CancelRequested' }, ada)).toEqual(accepted)
        yield* rehearsal.answer(yield* rehearsal.pending('charge'), { _tag: 'ChargeSucceeded' })
        // The period is paid: the subscription ends with it.
        expect(yield* rehearsal.projection).toMatchObject({ status: 'Active', canResume: true })
        yield* rehearsal.fire(yield* rehearsal.pending('renewal'))
        expect(yield* rehearsal.state).toMatchObject({ _tag: 'Cancelled', reason: 'ByCustomer' })
      }),
    )))

  test('the renewal survives a restart', () =>
    Effect.runPromise(rehearse(
      subscription,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.answer(yield* rehearsal.pending('charge'), { _tag: 'ChargeSucceeded' })
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
