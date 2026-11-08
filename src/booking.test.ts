/**
 * The runtime on the booking and its inventory of `examples/booking`, where what a test checks is the library's
 * and no user's: what the runtime did, told to a probe (decision 0073), the rows of its tables, and values frozen
 * through, which a mutation of the runtime's throws on (decision 0052). The example's `runtime.test.ts` runs the
 * same programs through the public surface alone.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import { SqlClient } from 'effect/sql'
import { booking } from '../examples/booking/booking.ts'
import { inventory } from '../examples/booking/inventory.ts'
import { create, defect, operation, send } from './program.ts'
import { launch, Probe } from './runtime.ts'
import { freezing, frozen } from './testing.ts'

/** A limit no reading of this test reaches: a reading says how many rows it takes (decision 0141). */
const all = 100

const organizer = { _tag: 'Organizer' } as const
const ann = { _tag: 'Customer', id: 'ann' } as const

const database = <A, E>(test: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.runPromise(
    Effect.scoped(test).pipe(
      Effect.provide(SqliteClient.layer({ filename: ':memory:' })),
      Effect.orDie,
    ),
  )

// What a program gives and what a caller offers is never mutated, by the runtime either: frozen through, a mutation
// of the runtime's throws, and crashes an entity or suspends it where this story has neither (decision 0052).
test('the runtime mutates nothing the programs give or the callers offer', () =>
  database(Effect.gen(function*() {
    const requested = <Sender>(requestId: string, sender: Sender) => frozen({ requestId, sender })
    yield* Effect.scoped(Effect.gen(function*() {
      const runtime = yield* launch()
      const inventories = yield* runtime.deploy(freezing(inventory))
      const bookings = yield* runtime.deploy(freezing(booking))
      yield* inventories.create('gig', frozen({ capacity: 10 }), requested('c-gig', { ...organizer }))
      const story = [
        ['b1', 3, 'Confirm'],
        ['b2', 9, null],
        ['b3', 2, 'Cancel'],
      ] as const
      for (const [id, seats] of story) {
        const flags = frozen({ customer: 'ann', event: 'gig', seats })
        expect(yield* bookings.create(id, flags, requested(`c-${id}`, { ...ann }))).toEqual({ _tag: 'Created' })
        yield* runtime.settled
      }
      for (const [id, , then] of story) {
        if (then === null) continue
        const message = frozen(
          then === 'Confirm' ? { _tag: 'ConfirmRequested' } as const : { _tag: 'CancelRequested' } as const,
        )
        expect(yield* bookings.send(id, message, requested(`r-${id}`, { ...ann }))).toEqual({ _tag: 'Accepted' })
        // A retry is answered the stored reply.
        expect(yield* bookings.send(id, message, requested(`r-${id}`, { ...ann }))).toEqual({ _tag: 'Accepted' })
        yield* runtime.settled
      }
    }))
    // Another process reads what the first stored, and the same programs, frozen, run on it.
    yield* Effect.scoped(Effect.gen(function*() {
      const runtime = yield* launch()
      const inventories = yield* runtime.deploy(freezing(inventory))
      const bookings = yield* runtime.deploy(freezing(booking))
      yield* runtime.settled
      expect(yield* bookings.read('b1')).toMatchObject({ status: 'Confirmed' })
      expect(yield* bookings.read('b2')).toMatchObject({ status: 'Cancelled' })
      expect(yield* bookings.read('b3')).toMatchObject({ status: 'Cancelled' })
      expect(yield* inventories.read('gig')).toMatchObject({ available: 7 })
      expect((yield* bookings.published('projection', [], all)).map(({ value }) => value.status)).toEqual([
        'Holding',
        'Held',
        'Holding',
        'Cancelled',
        'Holding',
        'Held',
        'Confirming',
        'Confirmed',
        'Releasing',
        'Cancelled',
      ])
    }))
  })))

test('the inventory keeps its reply to a booking while the booking’s hold waits for it, and no longer', () =>
  database(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const repliesToBookings = sql<{ count: number }>`
      SELECT count(*) AS count FROM replies WHERE name = 'Inventory' AND sender_name = 'Booking'
    `.pipe(Effect.orDie)
    const seen: Array<number> = []
    yield* Effect.scoped(Effect.gen(function*() {
      const runtime = yield* launch().pipe(Effect.provideService(Probe, (said) =>
        // Before the booking's step that handles the inventory's answer commits, the hold that asked still holds.
        said._tag === 'Reached' && said.point === 'BeforeCommit' && said.entity.name === 'Booking' &&
          said.event._tag === 'Handle'
          ? Effect.flatMap(repliesToBookings, ([row]) => Effect.sync(() => seen.push(row?.count ?? 0)))
          : Effect.void))
      const inventories = yield* runtime.deploy(inventory)
      const bookings = yield* runtime.deploy(booking)
      yield* inventories.create('gig', { capacity: 10 }, { requestId: 'c-gig', sender: organizer })
      yield* bookings.create('b1', { customer: 'ann', event: 'gig', seats: 3 }, { requestId: 'c-b1', sender: ann })
      yield* runtime.settled
      expect(yield* bookings.read('b1')).toMatchObject({ status: 'Held' })
    }))
    // The reply was there for the hold to read again after a crash, and went with the step that ended the hold
    // (decision 0021).
    expect(seen).toContain(1)
    expect((yield* repliesToBookings)[0]?.count).toBe(0)
  })))

test('a booking whose hold a crash interrupted holds its seats, whichever program is deployed first', () =>
  database(Effect.gen(function*() {
    yield* Effect.scoped(Effect.gen(function*() {
      const crashed = yield* Deferred.make<void>()
      const runtime = yield* launch().pipe(Effect.provideService(Probe, (said) =>
        // The booking is stored, and the process dies before its hold starts.
        said._tag === 'Reached' && said.point === 'AfterCommit' && said.entity.name === 'Booking'
          ? Effect.andThen(Deferred.succeed(crashed, undefined), Effect.never)
          : Effect.void))
      const inventories = yield* runtime.deploy(inventory)
      const bookings = yield* runtime.deploy(booking)
      yield* inventories.create('gig', { capacity: 10 }, { requestId: 'c-gig', sender: organizer })
      yield* Effect.raceFirst(
        bookings.create('b1', { customer: 'ann', event: 'gig', seats: 3 }, { requestId: 'c-b1', sender: ann }),
        Deferred.await(crashed),
      )
    }))
    yield* Effect.scoped(Effect.gen(function*() {
      // A retry an hour long: what wakes the hold is the inventory's deploy, not a clock (decisions 0045, 0063).
      const runtime = yield* launch({ retry: { millis: 3_600_000 } })
      // The booking first: its hold starts again at once, and waits for the inventory (decision 0045).
      const bookings = yield* runtime.deploy(booking)
      // The inventory comes later, once the hold has had the time to send.
      yield* Effect.sleep('50 millis')
      const inventories = yield* runtime.deploy(inventory)
      yield* runtime.settled
      expect(yield* bookings.read('b1')).toMatchObject({ status: 'Held', canConfirm: true })
      expect(yield* inventories.read('gig')).toMatchObject({ available: 7 })
    }))
  })))

test('a booking whose hold the inventory crashed on sends it again, and is not suspended', () =>
  database(Effect.scoped(Effect.gen(function*() {
    let crashes = true
    const sent: Array<number> = []
    // The hold waits this long before it sends again to the inventory that crashed on it (decision 0063).
    const retry = { millis: 100 }
    const runtime = yield* launch({ retry }).pipe(Effect.provideService(Probe, (said) => {
      if (said._tag !== 'Applied' || said.entity.name !== 'Inventory' || said.event._tag !== 'Receive') {
        return Effect.void
      }
      sent.push(Date.now())
      if (!crashes) return Effect.void
      // The hold is written, and the runtime fails before it answers: the probe stands for a failed write.
      crashes = false
      return Effect.die('the runtime failed')
    }))
    const inventories = yield* runtime.deploy(inventory)
    const bookings = yield* runtime.deploy(booking)
    yield* inventories.create('gig', { capacity: 10 }, { requestId: 'c-gig', sender: organizer })
    yield* bookings.create('b1', { customer: 'ann', event: 'gig', seats: 3 }, { requestId: 'c-b1', sender: ann })
    // The hold sends again, and gets the reply the inventory stored before it crashed (decision 0046).
    yield* runtime.settled
    expect(crashes).toBe(false)
    expect(sent).toHaveLength(2)
    expect((sent[1] ?? 0) - (sent[0] ?? 0)).toBeGreaterThanOrEqual(retry.millis - 5)
    expect(yield* bookings.read('b1')).toMatchObject({ status: 'Held', canConfirm: true })
    expect(yield* inventories.read('gig')).toMatchObject({ available: 7 })
  }))))

test('a booking whose hold the inventory is suspended on waits for its resumption, and holds its seats', () =>
  database(Effect.scoped(Effect.gen(function*() {
    // A retry an hour long: what wakes the hold is the inventory's resumption, not a clock (decision 0063).
    const retry = { millis: 3_600_000 }
    // An inventory that dies on a hold, and the fixed program an operator deploys before resuming it.
    const breaking: typeof inventory = {
      ...inventory,
      update: (message, meta) =>
        message._tag === 'HoldRequested' ? () => defect('broken') : inventory.update(message, meta),
    }
    yield* Effect.scoped(Effect.gen(function*() {
      const suspended = yield* Deferred.make<void>()
      const runtime = yield* launch({ retry }).pipe(Effect.provideService(Probe, (said) =>
        // The inventory's one message is the hold it dies on, handled as it arrives (decision 0074).
        said._tag === 'Applied' && said.entity.name === 'Inventory' && said.event._tag === 'Receive'
          ? Deferred.succeed(suspended, undefined)
          : Effect.void))
      const inventories = yield* runtime.deploy(breaking)
      const bookings = yield* runtime.deploy(booking)
      yield* inventories.create('gig', { capacity: 10 }, { requestId: 'c-gig', sender: organizer })
      yield* bookings.create('b1', { customer: 'ann', event: 'gig', seats: 3 }, { requestId: 'c-b1', sender: ann })
      yield* Deferred.await(suspended)
    }))
    // A fix is a deploy (decision 0064): the process that runs the fixed inventory starts the hold again, which is
    // answered `Suspended` and waits, registered before it sent, until the operator resumes the inventory.
    const answered = yield* Deferred.make<void>()
    const runtime = yield* launch({ retry }).pipe(Effect.provideService(Probe, (said) =>
      // The hold's message, answered `Suspended`: the resumption comes after it, and is what wakes it.
      said._tag === 'Applied' && said.entity.name === 'Inventory' && said.event._tag === 'Receive'
        ? Deferred.succeed(answered, undefined)
        : Effect.void))
    const inventories = yield* runtime.deploy(inventory)
    const bookings = yield* runtime.deploy(booking)
    expect(yield* bookings.read('b1')).toMatchObject({ status: 'Holding' })
    yield* Deferred.await(answered)
    yield* inventories.resume('gig')
    yield* runtime.settled
    expect(yield* bookings.read('b1')).toMatchObject({ status: 'Held', canConfirm: true })
    expect(yield* inventories.read('gig')).toMatchObject({ available: 7 })
  }))))

// What an operation sends crosses the library too: its runner builds it, so the flags and the message are frozen
// here, where the rest of the programs is frozen through (decision 0052).
test('the runtime mutates nothing an operation creates with or sends', () =>
  database(Effect.scoped(Effect.gen(function*() {
    const runtime = yield* launch()
    const sending = {
      ...booking,
      operations: {
        ...booking.operations,
        Hold: operation.atLeastOnce((op: { event: string; seats: number }) =>
          Effect.gen(function*() {
            yield* create(inventory, op.event, frozen({ capacity: 10 }), 'hold')
            yield* send(inventory, op.event, frozen({ _tag: 'HoldRequested', seats: op.seats } as const), 'hold')
            return { _tag: 'SeatsHeld' } as const
          })
        ),
      },
    } as typeof booking
    const inventories = yield* runtime.deploy(freezing(inventory))
    const bookings = yield* runtime.deploy(freezing(sending))
    const flags = frozen({ customer: 'ann', event: 'gig', seats: 3 })
    yield* bookings.create('b1', flags, frozen({ requestId: 'c-b1', sender: ann }))
    yield* runtime.settled
    expect(yield* bookings.read('b1')).toMatchObject({ status: 'Held' })
    expect(yield* inventories.read('gig')).toMatchObject({ available: 7 })
  }))))
