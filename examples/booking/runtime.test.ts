/**
 * The booking and its inventory on the runtime, in one database: two entities that talk through operations
 * (decision 0009), where the scenarios of `scenarios.test.ts` rehearse the booking alone and answer for the
 * inventory. It is also how a program is run: a client, the tables, a runtime, and a handle per program.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import { SqlClient } from 'effect/sql'
import { create, createTables, defect, launch, operation, send } from '../../src/index.ts'
// What the runtime did is told to a probe, which is a test's and no part of the library's surface (decision 0073).
import { Probe } from '../../src/runtime.ts'
// Values frozen through, which only the library's own tests run on (decision 0052).
import { freezing, frozen } from '../../src/testing.ts'
import { booking } from './booking.ts'
import { inventory } from './inventory.ts'

const organizer = { _tag: 'Organizer' } as const
const ann = { _tag: 'Customer', id: 'ann' } as const

const database = <A, E>(test: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.runPromise(
    Effect.scoped(Effect.flatMap(createTables, () => test)).pipe(
      Effect.provide(SqliteClient.layer({ filename: ':memory:' })),
      Effect.orDie,
    ),
  )

test('a booking holds its seats in the inventory, and confirms them', () =>
  database(Effect.scoped(Effect.gen(function*() {
    const runtime = yield* launch()
    // Neither program needs a service of its own: the booking talks to the inventory, which the runtime routes.
    const inventories = yield* runtime.deploy(inventory)
    const bookings = yield* runtime.deploy(booking)

    expect(yield* inventories.create('gig', { capacity: 10 }, { requestId: 'c-gig', sender: organizer }))
      .toEqual({ _tag: 'Created' })
    expect(
      yield* bookings.create('b1', { customer: 'ann', event: 'gig', seats: 3 }, { requestId: 'c-b1', sender: ann }),
    ).toEqual({ _tag: 'Created' })

    // The booking's hold is an operation: it sends to the inventory and waits for its reply.
    yield* runtime.settled
    expect(yield* bookings.read('b1')).toMatchObject({ status: 'Held', canConfirm: true })
    expect(yield* inventories.read('gig')).toMatchObject({ open: true, available: 7 })

    expect(yield* bookings.send('b1', { _tag: 'ConfirmRequested' }, { requestId: 'r1', sender: ann }))
      .toEqual({ _tag: 'Accepted' })
    yield* runtime.settled
    expect(yield* bookings.read('b1')).toMatchObject({ status: 'Confirmed', canConfirm: false })
    // The seats are sold, not held: the booking's confirmation moved them.
    expect(yield* inventories.read('gig')).toMatchObject({ available: 7 })

    // What other systems learn: the booking's whole story, step by step (decision 0038).
    expect(
      (yield* bookings.published([])).map(({ kind, message, projection }) =>
        [kind, message?._tag ?? null, projection.status]
      ),
    ).toEqual([
      ['Creation', null, 'Holding'],
      ['Internal', 'SeatsHeld', 'Held'],
      ['Inbound', 'ConfirmRequested', 'Confirming'],
      ['Internal', 'SeatsConfirmed', 'Confirmed'],
    ])
    // Of the inventory, only the hold. Confirming the seats moves them from held to sold, which leaves
    // `available` where it was: a fact no caller can read is not published, and an inventory whose sales must
    // be is one that shows them.
    expect(
      (yield* inventories.published([])).map(({ kind, message, projection }) =>
        [kind, message?._tag ?? null, projection.available]
      ),
    ).toEqual([['Creation', null, 10], ['Inbound', 'HoldRequested', 7]])
  }))))

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
      expect((yield* bookings.published([])).map(({ projection }) => projection.status)).toEqual([
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

test('a booking of more seats than are left is cancelled with the inventory’s reason', () =>
  database(Effect.scoped(Effect.gen(function*() {
    const runtime = yield* launch()
    const inventories = yield* runtime.deploy(inventory)
    const bookings = yield* runtime.deploy(booking)

    yield* inventories.create('small', { capacity: 2 }, { requestId: 'c-small', sender: organizer })
    yield* bookings.create('b2', { customer: 'ann', event: 'small', seats: 5 }, { requestId: 'c-b2', sender: ann })
    yield* runtime.settled

    expect(yield* bookings.read('b2')).toMatchObject({ status: 'Cancelled', canConfirm: false })
    expect(yield* inventories.read('small')).toMatchObject({ available: 2 })
  }))))

test('a booking for an event that does not exist is cancelled', () =>
  database(Effect.scoped(Effect.gen(function*() {
    const runtime = yield* launch()
    yield* runtime.deploy(inventory)
    const bookings = yield* runtime.deploy(booking)

    yield* bookings.create('b3', { customer: 'ann', event: 'nowhere', seats: 1 }, { requestId: 'c-b3', sender: ann })
    yield* runtime.settled

    expect(yield* bookings.read('b3')).toMatchObject({ status: 'Cancelled' })
  }))))

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

test('a booking whose hold sends a message the inventory cannot encode is suspended, not sent again', () =>
  database(Effect.scoped(Effect.gen(function*() {
    const runtime = yield* launch()
    // Half a seat is no `Int`: the message is the booking's defect, and reaches no inventory (decision 0040).
    const halving = {
      ...booking,
      operations: {
        ...booking.operations,
        Hold: operation.atLeastOnce((op: { event: string }) =>
          Effect.flatMap(
            send(inventory, op.event, { _tag: 'HoldRequested', seats: 0.5 }, 'hold'),
            () => Effect.succeed({ _tag: 'SeatsHeld' } as const),
          )
        ),
      },
    } as typeof booking
    const inventories = yield* runtime.deploy(inventory)
    const bookings = yield* runtime.deploy(halving)
    yield* inventories.create('gig', { capacity: 10 }, { requestId: 'c-gig', sender: organizer })
    yield* bookings.create('b1', { customer: 'ann', event: 'gig', seats: 3 }, { requestId: 'c-b1', sender: ann })
    yield* runtime.settled
    expect(yield* bookings.send('b1', { _tag: 'ConfirmRequested' }, { requestId: 'r1', sender: ann }))
      .toEqual({ _tag: 'Suspended' })
    expect(yield* inventories.read('gig')).toMatchObject({ available: 10 })
  }))))

test('an operation that sends two requests to one inventory has both applied, each under its name', () =>
  database(Effect.scoped(Effect.gen(function*() {
    const runtime = yield* launch()
    // A hold taken back at once: two messages to the same entity from one run, which their names keep apart
    // (decision 0047).
    const undoing = {
      ...booking,
      operations: {
        ...booking.operations,
        Hold: operation.atLeastOnce((op: { event: string; seats: number }) =>
          Effect.flatMap(
            send(inventory, op.event, { _tag: 'HoldRequested', seats: op.seats }, 'hold'),
            () =>
              Effect.as(
                send(inventory, op.event, { _tag: 'ReleaseRequested' }, 'release'),
                { _tag: 'SeatsHeld' } as const,
              ),
          )
        ),
      },
    } as typeof booking
    const inventories = yield* runtime.deploy(inventory)
    const bookings = yield* runtime.deploy(undoing)
    yield* inventories.create('gig', { capacity: 10 }, { requestId: 'c-gig', sender: organizer })
    yield* bookings.create('b1', { customer: 'ann', event: 'gig', seats: 3 }, { requestId: 'c-b1', sender: ann })
    yield* runtime.settled
    expect(yield* inventories.read('gig')).toMatchObject({ available: 10 })
  }))))

test('an operation that sends twice under one name to one inventory is suspended', () =>
  database(Effect.scoped(Effect.gen(function*() {
    const runtime = yield* launch()
    // The second message would be answered the first one's reply, and never applied: it is the booking's defect
    // (decision 0047).
    const twice = {
      ...booking,
      operations: {
        ...booking.operations,
        Hold: operation.atLeastOnce((op: { event: string; seats: number }) =>
          Effect.flatMap(
            send(inventory, op.event, { _tag: 'HoldRequested', seats: op.seats }, 'hold'),
            () =>
              Effect.as(
                send(inventory, op.event, { _tag: 'ReleaseRequested' }, 'hold'),
                { _tag: 'SeatsHeld' } as const,
              ),
          )
        ),
      },
    } as typeof booking
    const inventories = yield* runtime.deploy(inventory)
    const bookings = yield* runtime.deploy(twice)
    yield* inventories.create('gig', { capacity: 10 }, { requestId: 'c-gig', sender: organizer })
    yield* bookings.create('b1', { customer: 'ann', event: 'gig', seats: 3 }, { requestId: 'c-b1', sender: ann })
    yield* runtime.settled
    expect(yield* bookings.send('b1', { _tag: 'ConfirmRequested' }, { requestId: 'r1', sender: ann }))
      .toEqual({ _tag: 'Suspended' })
    // The release reached no inventory.
    expect(yield* inventories.read('gig')).toMatchObject({ available: 7 })
  }))))

// A booking that opens its event's inventory itself: an operation creates an entity under a name, and a creation
// and a message are requests apart, so the same name serves both (decisions 0050, 0060).
const opening = (creations: number) => ({
  ...booking,
  operations: {
    ...booking.operations,
    Hold: operation.atLeastOnce((op: { event: string; seats: number }) =>
      Effect.gen(function*() {
        for (let made = 0; made < creations; made++) yield* create(inventory, op.event, { capacity: 10 }, 'hold')
        yield* send(inventory, op.event, { _tag: 'HoldRequested', seats: op.seats }, 'hold')
        return { _tag: 'SeatsHeld' } as const
      })
    ),
  },
} as typeof booking)

test('an operation creates an entity, and sends it a message under the same name', () =>
  database(Effect.scoped(Effect.gen(function*() {
    const runtime = yield* launch()
    const inventories = yield* runtime.deploy(inventory)
    const bookings = yield* runtime.deploy(opening(1))
    yield* bookings.create('b1', { customer: 'ann', event: 'gig', seats: 3 }, { requestId: 'c-b1', sender: ann })
    yield* runtime.settled
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

test('an operation that creates twice under one name is suspended', () =>
  database(Effect.scoped(Effect.gen(function*() {
    const runtime = yield* launch()
    const inventories = yield* runtime.deploy(inventory)
    const bookings = yield* runtime.deploy(opening(2))
    yield* bookings.create('b1', { customer: 'ann', event: 'gig', seats: 3 }, { requestId: 'c-b1', sender: ann })
    yield* runtime.settled
    expect(yield* bookings.send('b1', { _tag: 'ConfirmRequested' }, { requestId: 'r1', sender: ann }))
      .toEqual({ _tag: 'Suspended' })
    // The first creation reached the inventory, and the hold did not.
    expect(yield* inventories.read('gig')).toMatchObject({ available: 10 })
  }))))
