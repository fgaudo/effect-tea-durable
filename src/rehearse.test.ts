/**
 * Deploys, rehearsed on the order: what a new version keeps of the work under way, and what it may not change.
 */
import { describe, expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Schema from 'effect/Schema'
import { order, type Sender } from '../examples/order/order.ts'
import { InvariantDefect, isTimer, timer } from './program.ts'
import { rehearse } from './rehearse.ts'

const placedAt = DateTime.makeUnsafe('2026-10-30T10:00:00Z')

const start = { flags: { order: { customer: 'ada', totalInCents: 4_200 } }, at: placedAt }

const ada: Sender = { _tag: 'Customer', id: 'ada' }

// A new version that gives an hour more to pay.
const patient: typeof order = {
  ...order,
  durable: (state) => {
    const work = order.durable(state)
    const deadline = work['payment-deadline']
    return deadline === undefined || !isTimer(deadline)
      ? work
      : { ...work, 'payment-deadline': timer(DateTime.add(deadline.at, { hours: 1 }), deadline.message) }
  },
}

// A new version that charges a cent more.
const greedy: typeof order = {
  ...order,
  durable: (state) => {
    const work = order.durable(state)
    const charge = work['charge']
    return charge === undefined || isTimer(charge) || charge._tag !== 'Charge'
      ? work
      : { ...work, charge: { ...charge, totalInCents: charge.totalInCents + 1 } }
  },
}

describe('a deploy', () => {
  test('keeps a charge under way it returns the same, under the same idempotency key', () =>
    Effect.runPromise(rehearse(
      order,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, ada)
        const before = yield* rehearsal.pending('charge')
        yield* rehearsal.deploy(patient)
        const after = yield* rehearsal.pending('charge')
        expect(after.idempotencyKey).toBe(before.idempotencyKey)
        expect(yield* rehearsal.answer(before, { _tag: 'ChargeSucceeded', charge: 'ch-1' })).toBe('Delivered')
      }),
    )))

  test('arms a deadline it moves again, as new work: the old one\'s firing is dropped', () =>
    Effect.runPromise(rehearse(
      order,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        const before = yield* rehearsal.pending('payment-deadline')
        yield* rehearsal.deploy(patient)
        const after = yield* rehearsal.pending('payment-deadline')
        expect(after.incarnation).toBe(before.incarnation + 1)
        expect(isTimer(after.work) && isTimer(before.work) && DateTime.Equivalence(
          after.work.at,
          DateTime.add(before.work.at, { hours: 1 }),
        )).toBe(true)
        expect(yield* rehearsal.fire(before)).toBe('Dropped')
        expect(yield* rehearsal.fire(after)).toBe('Delivered')
        expect(yield* rehearsal.state).toMatchObject({ _tag: 'Cancelled', reason: 'Unpaid' })
      }),
    )))

  test('that changes a charge under way is a defect, which fails the scenario', async () => {
    const exit = await Effect.runPromiseExit(rehearse(
      order,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, ada)
        yield* rehearsal.deploy(greedy)
      }),
    ))
    const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
    expect(cause instanceof InvariantDefect && cause.reason)
      .toBe("the program changed the operation under 'charge' before its completion")
  })

  // The program is not the machine's: what follows a deploy is the deployed program's, its schemas too (decision 0064).
  test('runs what follows it by the program deployed, whose schemas a message is checked by', async () => {
    const strict: typeof order = {
      ...order,
      schemas: { ...order.schemas, inbound: order.schemas.inbound.check(Schema.makeFilter(() => 'nothing is taken')) },
    }
    const exit = await Effect.runPromiseExit(rehearse(
      order,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.deploy(strict)
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, ada)
      }),
    ))
    const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
    expect(cause instanceof InvariantDefect && cause.reason).toStartWith('the inbound message does not encode')
  })

  test('that changes a charge is taken once the charge has completed', () =>
    Effect.runPromise(rehearse(
      order,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, ada)
        yield* rehearsal.answer(yield* rehearsal.pending('charge'), { _tag: 'ChargeSucceeded', charge: 'ch-1' })
        yield* rehearsal.deploy(greedy)
        expect((yield* rehearsal.projection).status).toBe('Paid')
      }),
    )))
})

describe('a program that cannot run as written', () => {
  const reasonOf = (exit: Exit.Exit<unknown>) => {
    const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
    return cause instanceof InvariantDefect ? cause.reason : null
  }
  const acted: Array<string> = []
  const rehearsed = (program: typeof order) =>
    rehearse(
      program,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        acted.push('ran')
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, ada)
      }),
    )

  test('is refused before its scenario runs, as the runtime refuses it (decision 0054)', async () => {
    const refused: ReadonlyArray<readonly [typeof order, string]> = [
      [{ ...order, name: '' }, "the program '' has an empty name"],
      [{ ...order, keys: [...order.keys, 'charge'] }, "the program 'Order' declares the key 'charge' twice"],
      [
        { ...order, indexes: { ...order.indexes, 'not a word': () => null } as typeof order.indexes },
        "the program 'Order' has an index 'not a word' whose name is not a word",
      ],
    ]
    for (const [program, reason] of refused) {
      expect(reasonOf(await Effect.runPromiseExit(rehearsed(program)))).toBe(reason)
    }
    expect(acted).toEqual([])
  })

  test('is refused where a rehearsal deploys it', async () => {
    const exit = await Effect.runPromiseExit(rehearse(
      order,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.deploy({ ...order, keys: [...order.keys, 'refund'] })
      }),
    ))
    expect(reasonOf(exit)).toBe("the program 'Order' declares the key 'refund' twice")
  })
})

describe('a rehearsal', () => {
  // No one retries a rehearsal's creation, so its request is the entity's own: a program need not have a sender for
  // it, nor take any (decision 0048).
  test('creates its entity under the entity itself, whatever senders the program takes', () =>
    Effect.runPromise(rehearse(
      { ...order, schemas: { ...order.schemas, sender: order.schemas.sender.check(Schema.makeFilter(() => 'none')) } },
      start,
      Effect.fnUntraced(function*(rehearsal) {
        expect((yield* rehearsal.pending('payment-deadline')).work).toBeDefined()
      }),
    )))

  // Time stands at the start's time, and moves to a timer's when it fires: a message after it is handled at the
  // latest time the scenario reached, never at the start's again (decision 0014).
  test('handles each message at the latest time it reached', () => {
    const seen: Array<DateTime.Utc> = []
    const clocked: typeof order = {
      ...order,
      update: (message, meta) => {
        seen.push(meta.at)
        return order.update(message, meta)
      },
    }
    return Effect.runPromise(rehearse(
      clocked,
      start,
      Effect.fnUntraced(function*(rehearsal) {
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-1' }, ada)
        const charge = yield* rehearsal.pending('charge')
        yield* rehearsal.answer(charge, { _tag: 'ChargeDeclined' })
        const deadline = yield* rehearsal.pending('payment-deadline')
        expect(isTimer(deadline.work)).toBe(true)
        yield* rehearsal.fire(deadline)
        yield* rehearsal.send({ _tag: 'PayRequested', payment: 'card-2' }, ada)
        const due = isTimer(deadline.work) ? deadline.work.at : placedAt
        expect(DateTime.isGreaterThan(due, placedAt)).toBe(true)
        expect(seen.map(DateTime.formatIso)).toEqual([placedAt, placedAt, due, due].map(DateTime.formatIso))
      }),
    ))
  })
})
