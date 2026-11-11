/**
 * The tests of an entity's callers ([`callers.ts`](callers.ts)): a caller's registration, an entity's lock, and the
 * `Entities` an operation sends with, between two entities that talk.
 */
import { describe, expect, test } from 'bun:test'
import * as Clock from 'effect/Clock'
import * as DateTime from 'effect/DateTime'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import { SqlClient } from 'effect/sql'
import { TestClock } from 'effect/testing'
import { booking } from '../fixtures/booking.ts'
import { inventory } from '../fixtures/inventory.ts'
import { create, defect, type Entities, operation, type Program, send } from '../program.ts'
import { storage } from '../storage.ts'
import { freezing, frozen } from '../testing.ts'
import {
  all,
  database,
  done,
  explored,
  hands,
  type Hooks,
  id,
  Internal,
  log,
  opened,
  process,
  program,
  type T,
  tester,
  timed,
  together,
  unloads,
} from '../runtime.test_shared.ts'

// Two entities that talk through operations, on the booking and its inventory of `src/fixtures/` (decision 0009).
describe('two entities that talk', () => {
  const organizer = { _tag: 'Organizer' } as const
  const ann = { _tag: 'Customer', id: 'ann' } as const

  // What a program gives and what a caller offers is never mutated, by the runtime either: frozen through, a
  // mutation of the runtime's throws, and crashes an entity or suspends it where this story has neither (decision
  // 0052).
  test('the runtime mutates nothing the programs give or the callers offer', () =>
    database(Effect.gen(function*() {
      const requested = <Sender>(requestId: string, sender: Sender) => frozen({ requestId, sender, keep: 'forever' as const })
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const inventories = yield* runtime.deploy(freezing(inventory))
          const bookings = yield* runtime.deploy(freezing(booking))
          yield* inventories.create('gig', { flags: frozen({ capacity: 10 }), ...requested('c-gig', { ...organizer }) })
          const story = [
            ['b1', 3, 'Confirm'],
            ['b2', 9, null],
            ['b3', 2, 'Cancel'],
          ] as const
          for (const [id, seats] of story) {
            const flags = frozen({ customer: 'ann', event: 'gig', seats })
            expect(yield* bookings.create(id, { flags, ...requested(`c-${id}`, { ...ann }) })).toEqual({ _tag: 'Created' })
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
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
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
        SELECT count(*) AS count FROM effecttea_replies WHERE name = 'Inventory' AND sender_name = 'Booking'
      `.pipe(Effect.orDie)
      const seen: Array<number> = []
      yield* process({
        // Before the booking's step that handles the inventory's answer commits, the hold that asked still holds.
        at: (point, entity, event) =>
          point === 'BeforeCommit' && entity.name === 'Booking' && event._tag === 'Handle'
            ? Effect.flatMap(repliesToBookings, ([row]) => Effect.sync(() => seen.push(row?.count ?? 0)))
            : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          const inventories = yield* runtime.deploy(inventory)
          const bookings = yield* runtime.deploy(booking)
          yield* inventories.create('gig', { flags: { capacity: 10 }, requestId: 'c-gig', sender: organizer })
          yield* bookings.create('b1', { flags: { customer: 'ann', event: 'gig', seats: 3 }, requestId: 'c-b1', sender: ann })
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
      const crashed = yield* Deferred.make<void>()
      yield* process({
        // The booking is stored, and the process dies before its hold starts.
        at: (point, entity) =>
          point === 'AfterCommit' && entity.name === 'Booking'
            ? Effect.andThen(Deferred.succeed(crashed, undefined), Effect.never)
            : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          const inventories = yield* runtime.deploy(inventory)
          const bookings = yield* runtime.deploy(booking)
          yield* inventories.create('gig', { flags: { capacity: 10 }, requestId: 'c-gig', sender: organizer })
          yield* Effect.raceFirst(
            bookings.create('b1', { flags: { customer: 'ann', event: 'gig', seats: 3 }, requestId: 'c-b1', sender: ann }),
            Deferred.await(crashed),
          )
        }))
      // A retry an hour long: what wakes the hold is the inventory's deploy, not a clock (decisions 0045, 0063).
      yield* process({ retry: { millis: 3_600_000 } }, (runtime) =>
        Effect.gen(function*() {
          // The booking first: its hold starts again at once, and waits for the inventory (decision 0045).
          const bookings = yield* runtime.deploy(booking)
          // The clock's move waits for the fibers it wakes to wait again, so the hold has sent when the inventory
          // comes (decision 0066).
          yield* TestClock.adjust('1 millis')
          const inventories = yield* runtime.deploy(inventory)
          yield* runtime.settled
          expect(yield* bookings.read('b1')).toMatchObject({ status: 'Held', canConfirm: true })
          expect(yield* inventories.read('gig')).toMatchObject({ available: 7 })
        }))
    })))

  test('a booking whose hold the inventory crashed on sends it again at the retry, and is not suspended', () =>
    database(Effect.gen(function*() {
      let crashes = true
      const sent: Array<number> = []
      // The hold waits this long before it sends again to the inventory that crashed on it (decision 0063).
      const retry = { millis: 100 }
      yield* process({
        retry,
        observe: (entity, event) => {
          if (entity.name !== 'Inventory' || event._tag !== 'Receive') return Effect.void
          return Effect.flatMap(Clock.currentTimeMillis, (now) => {
            sent.push(now)
            if (!crashes) return Effect.void
            // The hold is written, and the runtime fails before it answers: the probe stands for a failed write.
            crashes = false
            return Effect.die('the runtime failed')
          })
        },
      }, (runtime) =>
        Effect.gen(function*() {
          const inventories = yield* runtime.deploy(inventory)
          const bookings = yield* runtime.deploy(booking)
          yield* inventories.create('gig', { flags: { capacity: 10 }, requestId: 'c-gig', sender: organizer })
          yield* bookings.create('b1', { flags: { customer: 'ann', event: 'gig', seats: 3 }, requestId: 'c-b1', sender: ann })
          // `settled` waits for the hold, which sleeps until its retry: a move of the clock waits instead for the
          // fibers it wakes to wait again (decision 0066), and the hold has sent once.
          yield* TestClock.adjust('1 millis')
          expect(sent).toHaveLength(1)
          // Short of the retry, the hold has not sent again.
          yield* TestClock.adjust(`${retry.millis - 2} millis`)
          expect(sent).toHaveLength(1)
          // At the retry, it sends again, and gets the reply the inventory stored before it crashed (decision 0046).
          yield* TestClock.adjust('1 millis')
          yield* runtime.settled
          expect(crashes).toBe(false)
          expect(sent).toHaveLength(2)
          expect((sent[1] ?? 0) - (sent[0] ?? 0)).toBe(retry.millis)
          expect(yield* bookings.read('b1')).toMatchObject({ status: 'Held', canConfirm: true })
          expect(yield* inventories.read('gig')).toMatchObject({ available: 7 })
        }))
    })))

  test('a booking whose hold the inventory is suspended on waits for its resumption, and holds its seats', () =>
    database(Effect.gen(function*() {
      // A retry an hour long: what wakes the hold is the inventory's resumption, not a clock (decision 0063).
      const retry = { millis: 3_600_000 }
      // An inventory that dies on a hold, and the fixed program an operator deploys before resuming it.
      const breaking: typeof inventory = {
        ...inventory,
        update: (message, meta) =>
          message._tag === 'HoldRequested' ? () => defect('broken') : inventory.update(message, meta),
      }
      /** The hold applied by the inventory: its one message, handled as it arrives (decision 0074). */
      const received = (done: Deferred.Deferred<void>): NonNullable<Hooks['observe']> => (entity, event) =>
        entity.name === 'Inventory' && event._tag === 'Receive' ? Deferred.succeed(done, undefined) : Effect.void
      const suspended = yield* Deferred.make<void>()
      yield* process({ retry, observe: received(suspended) }, (runtime) =>
        Effect.gen(function*() {
          const inventories = yield* runtime.deploy(breaking)
          const bookings = yield* runtime.deploy(booking)
          yield* inventories.create('gig', { flags: { capacity: 10 }, requestId: 'c-gig', sender: organizer })
          yield* bookings.create('b1', { flags: { customer: 'ann', event: 'gig', seats: 3 }, requestId: 'c-b1', sender: ann })
          yield* Deferred.await(suspended)
        }))
      // A fix is a deploy (decision 0064): the process that runs the fixed inventory starts the hold again, which is
      // answered `Suspended` and waits, registered before it sent, until the operator resumes the inventory.
      const answered = yield* Deferred.make<void>()
      yield* process({ retry, observe: received(answered) }, (runtime) =>
        Effect.gen(function*() {
          const inventories = yield* runtime.deploy(inventory)
          const bookings = yield* runtime.deploy(booking)
          expect(yield* bookings.read('b1')).toMatchObject({ status: 'Holding' })
          // The hold's message, answered `Suspended`: the resumption comes after it, and is what wakes it.
          yield* Deferred.await(answered)
          yield* inventories.resume('gig')
          yield* runtime.settled
          expect(yield* bookings.read('b1')).toMatchObject({ status: 'Held', canConfirm: true })
          expect(yield* inventories.read('gig')).toMatchObject({ available: 7 })
        }))
    })))

  // What an operation sends crosses the library too: its runner builds it, so the flags and the message are frozen
  // here, where the rest of the programs is frozen through (decision 0052).
  test('the runtime mutates nothing an operation creates with or sends', () =>
    database(process({}, (runtime) =>
      Effect.gen(function*() {
        const sending = {
          ...booking,
          operations: {
            ...booking.operations,
            Hold: operation.atLeastOnce((op: { event: string; seats: number }) =>
              Effect.gen(function*() {
                yield* create(inventory, op.event, 'hold', frozen({ capacity: 10 }))
                yield* send(inventory, op.event, frozen({ _tag: 'HoldRequested', seats: op.seats } as const), 'hold')
                return { _tag: 'SeatsHeld' } as const
              })
            ),
          },
        } as typeof booking
        const inventories = yield* runtime.deploy(freezing(inventory))
        const bookings = yield* runtime.deploy(freezing(sending))
        const flags = frozen({ customer: 'ann', event: 'gig', seats: 3 })
        yield* bookings.create('b1', { flags, ...frozen({ requestId: 'c-b1', sender: ann }) })
        yield* runtime.settled
        expect(yield* bookings.read('b1')).toMatchObject({ status: 'Held' })
        expect(yield* inventories.read('gig')).toMatchObject({ available: 7 })
      }))))
})

/**
 * A planned stop: a process launched with `drain` waits, as its scope closes, for its at-most-once operations under
 * way, and stops the rest at once (decision 0119).
 */

test('a sender answered Suspended is woken by the resumption, under prioritized schedules from its arrival', () => {
  // Decision 0063: a sender registers for the receiver's resumption before it sends. A resumption between its being
  // answered `Suspended` and a registration made after it would wake no one, and the sender would wait for ever.
  // With the registration moved after the send, seed 63, pinned, fails. `bun run test:pins` runs it against that form,
  // the pin `0063` of `src/runtime.test_pins.ts` (decision 0254).
  const sender: Program<Omit<T, 'services'> & { services: Entities }> = {
    ...program,
    name: 'Sender',
    init: (_flags, at) => ({ want: ['c'], applied: [], since: at, rings: at }),
    operations: {
      A: operation(() => Effect.succeed(done('a'))),
      B: operation.atMostOnce(({ key }) => Effect.succeed(done(key)), ({ key }): Internal => ({ _tag: 'Unknown', key })),
      C: operation.atLeastOnce(({ key }) =>
        Effect.as(send(program, id, { _tag: 'Want', key: 'a', on: false, nonce: 'sent' }, 'want'), done(key))
      ),
    },
  }
  // The schedules are explored from the sender's arrival on.
  explored((window) =>
    Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      const store = storage(program, yield* SqlClient.SqlClient)
      return yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          const senders = yield* runtime.deploy(sender)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          yield* runtime.settled
          yield* toy.send(id, { _tag: 'Break', nonce: 'b' }, { requestId: 'break', sender: tester, keep: 'forever' })
          // The sender's operation sends to the suspended toy while an operator discards what it died on.
          yield* opened(window, true)
          yield* senders.create('s', { flags: { at }, requestId: 's', sender: tester })
          yield* toy.discard(id)
          yield* runtime.settled
          return { applied: (yield* store.load(id))?.state.applied, wanted: yield* senders.read('s') }
        }))
    }), { applied: ['sent'], wanted: 0 }, { open: false, pinned: [63] })
}, 60_000)

test('callers of an unloaded entity build one machine for it, under prioritized schedules from their arrival', () => {
  // Decision 0067: an entity's lock is dropped by its last user only. One dropped while a caller waits for it lets a
  // new taker hold a lock of its own beside that caller, and both load the entity: two machines, two `Restart`s.
  // With the lock dropped by any user, seed 146, pinned, builds two. `bun run test:pins` runs it against that form, the
  // pin `0067` of `src/runtime.test_pins.ts` (decision 0254).
  // The schedules are explored from the callers' arrival on.
  explored((window) =>
    Effect.gen(function*() {
      const { layer } = yield* hands()
      const { events, observe } = log()
      const { entities, unloaded } = unloads()
      const at = yield* DateTime.now
      return yield* process({ observe, unloaded, passivate: { millis: 5 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(timed), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          yield* runtime.settled
          yield* TestClock.adjust('5 millis')
          const want = (nonce: string) =>
            toy.send(id, { _tag: 'Want', key: 't', on: true, nonce }, { requestId: nonce, sender: tester, keep: 'forever' })
          yield* opened(window, true)
          yield* together([want('w-1'), want('w-2')])
          yield* runtime.settled
          return { unloaded: [...entities], restarts: events.filter((event) => event._tag === 'Restart').length }
        }))
    }), { unloaded: [id], restarts: 1 }, { open: false, pinned: [146] })
}, 60_000)
