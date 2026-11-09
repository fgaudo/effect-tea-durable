/**
 * The rental's scenarios, rehearsed: the ride alone, with the test answering for the bike; the bike alone, with
 * the test sending as the rides would; and both together.
 */
import { describe, expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import type { Address } from '@fgaudo/effect-tea-persistent'
import { accepted, rehearse, rejected } from '@fgaudo/effect-tea-persistent/testing'
import { bike } from './bike.ts'
import { Mailer, ride, type Sender } from './ride.ts'

const at = DateTime.makeUnsafe('2026-11-08T10:00:00Z')

const flags = { customer: 'ann', email: 'ann@example.com', bike: 'bike-7', centsPerMinute: 20 }

const start = { flags, at }

const ann: Sender = { _tag: 'Customer', id: 'ann' }

describe('ride', () => {
  test('a ride is paid by the minute begun, at the rate the customer was shown', () =>
    Effect.runPromise(rehearse(
      ride,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.answer('unlock', { _tag: 'Unlocked' })
        yield* rehearsal.advance({ minutes: 10, seconds: 30 })
        expect(yield* rehearsal.send({ _tag: 'EndRequested' }, ann)).toEqual(accepted)
        yield* rehearsal.answer('dock', { _tag: 'Docked' })
        expect(yield* rehearsal.projection).toMatchObject({ status: 'Ended', costInCents: 11 * 20 })
      }),
    )))

  test('a ride the bike refuses never starts', () =>
    Effect.runPromise(rehearse(
      ride,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.answer('unlock', { _tag: 'UnlockRefused', reason: 'RateChanged' })
        expect(yield* rehearsal.state).toMatchObject({ _tag: 'Refused', reason: 'RateChanged' })
        expect(yield* rehearsal.send({ _tag: 'EndRequested' }, ann)).toMatchObject(rejected)
      }),
    )))

  // The projection reads no clock: the timer sets the state, and `canCancel` follows it.
  test('a cancellation is free for two minutes, and refused once the timer has fired', () =>
    Effect.runPromise(rehearse(
      ride,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.answer('unlock', { _tag: 'Unlocked' })
        expect(yield* rehearsal.projection).toMatchObject({
          canCancel: true,
          cancellableUntil: DateTime.toEpochMillis(DateTime.add(at, { minutes: 2 })),
        })
        yield* rehearsal.advance({ minutes: 2 })
        expect(yield* rehearsal.projection).toMatchObject({ canCancel: false, cancellableUntil: null })
        expect(yield* rehearsal.send({ _tag: 'CancelRequested' }, ann)).toMatchObject(rejected)
      }),
    )))

  test('a cancellation within two minutes costs nothing', () =>
    Effect.runPromise(rehearse(
      ride,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.answer('unlock', { _tag: 'Unlocked' })
        yield* rehearsal.advance({ minutes: 1 })
        expect(yield* rehearsal.send({ _tag: 'CancelRequested' }, ann)).toEqual(accepted)
        yield* rehearsal.answer('dock', { _tag: 'Docked' })
        expect(yield* rehearsal.projection).toMatchObject({ status: 'Ended', costInCents: 0 })
      }),
    )))

  // The phone never got the first answer: the same request id is a retry, and a new one is a new request.
  test('an end sent again under its request id is answered as the first, and one under a new id is rejected', () =>
    Effect.runPromise(rehearse(
      ride,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.answer('unlock', { _tag: 'Unlocked' })
        const end = { requestId: 'end-1' }
        expect(yield* rehearsal.send({ _tag: 'EndRequested' }, ann, end)).toEqual(accepted)
        // The phone never got the answer, and sends the end again: the ride ended once, and is told so again.
        expect(yield* rehearsal.send({ _tag: 'EndRequested' }, ann, end)).toEqual(accepted)
        expect(yield* rehearsal.send({ _tag: 'EndRequested' }, ann, { requestId: 'end-2' })).toMatchObject(rejected)
        expect((yield* rehearsal.state)._tag).toBe('Docking')
      }),
    )))

  test('only the customer of the ride ends it', () =>
    Effect.runPromise(rehearse(
      ride,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.answer('unlock', { _tag: 'Unlocked' })
        expect(yield* rehearsal.send({ _tag: 'EndRequested' }, { _tag: 'Customer', id: 'bob' }))
          .toMatchObject(rejected)
      }),
    )))

  // The email is an operation under way: only its completion takes it out of the state.
  test('an email under way when the ride ends is carried into the end, under its key', () =>
    Effect.runPromise(rehearse(
      ride,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.answer('unlock', { _tag: 'Unlocked' })
        const email = yield* rehearsal.pending('email')
        yield* rehearsal.send({ _tag: 'EndRequested' }, ann)
        yield* rehearsal.answer('dock', { _tag: 'Docked' })
        expect((yield* rehearsal.pending('email')).idempotencyKey).toBe(email.idempotencyKey)
        expect(yield* rehearsal.answer(email, { _tag: 'StartEmailed' })).toBe('Delivered')
        expect(yield* rehearsal.state).toMatchObject({ _tag: 'Ended', email: 'Sent' })
      }),
    )))

  // The ride as one would write it at first: the end holds no email, so a ride that ends while its email is sent
  // drops an operation under way, which is a defect.
  test('a ride whose end drops the email under way is a defect', async () => {
    const forgetful: typeof ride = {
      ...ride,
      work: (state) =>
        state._tag === 'Docking' || state._tag === 'Ended' ? ride.work({ ...state, email: 'Sent' }) : ride.work(state),
    }
    const exit = await Effect.runPromiseExit(rehearse(
      forgetful,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.answer('unlock', { _tag: 'Unlocked' })
        yield* rehearsal.send({ _tag: 'EndRequested' }, ann)
      }),
    ))
    expect(Exit.isFailure(exit) ? Cause.squash(exit.cause) : null).toMatchObject({
      reason: "the step dropped the operation under 'email' before its completion",
    })
  })

  test('an email under way when the process dies is not sent again', () =>
    Effect.runPromise(rehearse(
      ride,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.answer('unlock', { _tag: 'Unlocked' })
        yield* rehearsal.restart
        expect(yield* rehearsal.underWay('email')).toBeNull()
        expect(yield* rehearsal.state).toMatchObject({ _tag: 'Riding', email: 'Unsure' })
      }),
    )))
})

const rideOne: Address = { name: 'Ride', id: 'ride-1' }
const rideTwo: Address = { name: 'Ride', id: 'ride-2' }

describe('bike', () => {
  const docked = { flags: { centsPerMinute: 20 }, at }

  // A reply carries no data, so the ride sends the rate it was given, and the bike compares it with its own.
  test('a bike refuses a rate that changed since the customer was shown it', () =>
    Effect.runPromise(rehearse(
      bike,
      docked,
      Effect.fnUntraced(function*(rehearsal) {
        expect(yield* rehearsal.send({ _tag: 'RateSet', centsPerMinute: 25 }, { _tag: 'Operator' })).toEqual(accepted)
        expect(yield* rehearsal.sendFrom({ _tag: 'UnlockRequested', centsPerMinute: 20 }, rideOne))
          .toEqual({ _tag: 'Rejected', reason: 'RateChanged' })
        expect(yield* rehearsal.sendFrom({ _tag: 'UnlockRequested', centsPerMinute: 25 }, rideOne)).toEqual(accepted)
      }),
    )))

  test('a ridden bike is refused to a second ride, and docked by its own', () =>
    Effect.runPromise(rehearse(
      bike,
      docked,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.sendFrom({ _tag: 'UnlockRequested', centsPerMinute: 20 }, rideOne)
        expect(yield* rehearsal.sendFrom({ _tag: 'UnlockRequested', centsPerMinute: 20 }, rideTwo))
          .toEqual({ _tag: 'Rejected', reason: 'InUse' })
        expect(yield* rehearsal.sendFrom({ _tag: 'DockRequested' }, rideTwo)).toMatchObject(rejected)
        expect(yield* rehearsal.sendFrom({ _tag: 'DockRequested' }, rideOne)).toEqual(accepted)
        expect(yield* rehearsal.projection).toMatchObject({ status: 'Docked', canUnlock: true })
      }),
    )))
})

describe('ride and bike together', () => {
  // The email's runner is never run here: a mailer whose members die fails the test if it is.
  const mailer = Layer.mock(Mailer, {})

  test('a ride unlocks its bike, and docks it at the end', () =>
    Effect.runPromise(rehearse.together(
      at,
      Effect.fnUntraced(function*(world) {
        const bike7 = yield* world.create(bike, 'bike-7', { centsPerMinute: 20 })
        const annRide = yield* world.create(ride, 'ride-1', flags)
        yield* annRide.run('unlock')
        // A ride is counted when it docks, so the ride under way is not counted yet.
        expect(yield* bike7.projection).toMatchObject({ status: 'Ridden', rides: 0, canUnlock: false })
        yield* annRide.send({ _tag: 'EndRequested' }, ann)
        yield* annRide.run('dock')
        expect(yield* bike7.projection).toMatchObject({ status: 'Docked', rides: 1, canUnlock: true })
        expect((yield* annRide.state)._tag).toBe('Ended')
      }),
    ).pipe(Effect.provide(mailer))))

  test('a ride at a rate the bike no longer has is refused, and the bike stays docked', () =>
    Effect.runPromise(rehearse.together(
      at,
      Effect.fnUntraced(function*(world) {
        const bike7 = yield* world.create(bike, 'bike-7', { centsPerMinute: 20 })
        yield* bike7.send({ _tag: 'RateSet', centsPerMinute: 25 }, { _tag: 'Operator' })
        const annRide = yield* world.create(ride, 'ride-1', flags)
        yield* annRide.run('unlock')
        expect(yield* annRide.state).toMatchObject({ _tag: 'Refused', reason: 'RateChanged' })
        expect(yield* bike7.projection).toMatchObject({ status: 'Docked' })
      }),
    ).pipe(Effect.provide(mailer))))

  test('a ride of a bike that does not exist is refused', () =>
    Effect.runPromise(rehearse.together(
      at,
      Effect.fnUntraced(function*(world) {
        const annRide = yield* world.create(ride, 'ride-1', flags)
        yield* annRide.run('unlock')
        expect(yield* annRide.state).toMatchObject({ _tag: 'Refused', reason: 'NoSuchBike' })
      }),
    ).pipe(Effect.provide(mailer))))
})
