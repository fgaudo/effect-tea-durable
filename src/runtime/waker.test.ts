/**
 * The tests of the waker ([`waker.ts`](waker.ts)): the stored timers of the entities this process does not hold fire,
 * and `settled` waits for them, whatever the wall clock does (decisions 0068, 0221).
 */
import { describe, expect, test } from 'bun:test'
import * as Clock from 'effect/Clock'
import * as DateTime from 'effect/DateTime'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Logger from 'effect/Logger'
import * as References from 'effect/References'

import { SqlClient } from 'effect/sql'
import { TestClock } from 'effect/testing'
import {
  adjusted,
  ahead,
  database,
  distant,
  explored,
  hands,
  type Hooks,
  hour,
  id,
  onBoth,
  opened,
  process,
  program,
  received,
  skewing,
  tester,
  timed,
  together,
  unloads,
} from '../runtime.test_shared.ts'

test('settled never returns while the waker rests from a reading an unloaded entity left during, under bounded schedules', () => {
  // Decision 0068: the waker looks whether a poke waits, and clears its flag, in one step. An unload pokes the waker
  // under the count it leaves with (decision 0109), and a crash under its stop (decision 0274), so neither keeps
  // `settled` alone once the poke is made. Here `first` crashes, and its departure wakes the waker, while the wait of
  // `timed` runs out with its timer due. Were the look and the clearing two steps, the unload of `timed` could poke
  // between them. The waker would then rest with a poke nobody took, and `settled` return with the timer of `timed`
  // known to nobody. With the look and the clearing split, the deviation at decision 317, pinned, fails. `bun
  // run test:pins` runs it against that form, the pin `0068 the waker` of `src/runtime.test_pins.ts` (decision 0254).
  explored((window) =>
    Effect.gen(function*() {
      const { layer } = yield* hands()
      const clock = ahead()
      const gate = yield* Deferred.make<void>()
      const left = yield* Deferred.make<void>()
      let crashed = false
      let gone = false
      let armed = false
      let early = false
      let restarted = false
      return yield* clock.around(process({
        passivate: { millis: 5 },
        // `first` crashes at its message's commit, once the gate opens.
        at: (point, entity, event) =>
          point === 'BeforeCommit' && entity.id === 'first' && received(event) === 'r-first' && !crashed
            ? Effect.andThen(Deferred.await(gate), Effect.suspend(() => {
              crashed = true
              return Effect.die('the runtime failed')
            }))
            : Effect.void,
        unloaded: (entity) =>
          entity.id === 'timed' && armed && !gone
            ? Effect.andThen(Effect.sync(() => (gone = true)), Effect.asVoid(Deferred.succeed(left, undefined)))
            : Effect.void,
        observe: (entity, event) =>
          Effect.sync(() => {
            if (entity.id === 'timed' && gone && event._tag === 'Restart') restarted = true
          }),
      }, (runtime) =>
        Effect.gen(function*() {
          const at = yield* DateTime.now
          const toy = yield* Effect.provide(runtime.deploy(timed), layer)
          // `timed` rings at 40 millis and `first` at 50. The wait of `timed` runs out as the clock moves, and a
          // message loads it again.
          yield* toy.create('timed', { flags: { at }, requestId: 'c-timed', sender: tester })
          yield* runtime.settled
          yield* clock.adjust('10 millis')
          yield* toy.create('first', { flags: { at }, requestId: 'c-first', sender: tester })
          yield* toy.send('timed', { _tag: 'Refuse', nonce: 'm' }, { requestId: 'r-timed', sender: tester, keep: 'forever' })
          yield* runtime.settled
          armed = true
          const sent = yield* Effect.forkChild(Effect.exit(
            toy.send('first', { _tag: 'Want', key: 'a', on: false, nonce: 'n' }, {
              requestId: 'r-first',
              sender: tester,
              keep: 'forever',
            }),
          ))
          // The message of `first` reaches the gate, and the loop of `timed` its wait, before the clock moves.
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          yield* Effect.yieldNow
          // The wall clock reaches 40 millis and no sleep fires, as a real clock moves between two steps of a fiber.
          clock.by.millis = 30
          const checked = yield* Effect.forkChild(Effect.andThen(
            Deferred.await(left),
            Effect.andThen(runtime.settled, Effect.sync(() => {
              if (!restarted) early = true
            })),
          ))
          yield* opened(window, true)
          // `first` crashes, and the wait of `timed` runs out: `timed` is unloaded with its timer due.
          yield* together<unknown, never, never>([Deferred.succeed(gate, undefined), clock.adjust('5 millis')])
          yield* Fiber.join(checked)
          yield* opened(window, false)
          yield* Fiber.join(sent)
          yield* runtime.settled
          return { early, restarted }
        })))
    }), { early: false, restarted: true }, { open: false, bound: 1, pinned: [{ decision: 317, choice: 1 }] })
}, 60_000)

test('a poke that lands as the waker’s sleep ends is read, under prioritized schedules from the sleep’s end', () => {
  // The waker rests on a race of a take of its poke against a sleep toward its next timer. Here the poke lands in the
  // moment the sleep ends: `p` is unloaded at 40, as the sleep toward `w`'s timer at 40 runs out. A poke the race
  // drops is harmless: `leave` offers it in the step `p` leaves `loaded` (decision 0068), and the round after the
  // race reads the storage, so it finds `p`'s timer at 45. A waker that clears its poke after the race passes every
  // seed. Without the poke of `leave`, the waker reads before `p` leaves, waits for a poke, and the run fails at seed 0.
  explored((window) =>
    Effect.gen(function*() {
      const { layer } = yield* hands()
      const fired: Array<readonly [string, number]> = []
      const at = DateTime.toEpochMillis(yield* DateTime.now)
      return yield* process({
        passivate: { millis: 35 },
        observe: (entity, event) =>
          Effect.map(DateTime.now, (now) => {
            if (event._tag === 'Fire') fired.push([entity.id, DateTime.toEpochMillis(now) - at])
          }),
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(timed), layer)
          // `w` rings at 40 and is unloaded at 35. `p` rings at 45 and is unloaded at 40.
          yield* toy.create('w', { flags: { at: DateTime.makeUnsafe(at) }, requestId: 'c-w', sender: tester })
          yield* adjusted(window, '5 millis')
          yield* toy.create('p', { flags: { at: DateTime.makeUnsafe(at) }, requestId: 'c-p', sender: tester })
          yield* adjusted(window, '30 millis')
          yield* runtime.settled
          yield* opened(window, true)
          yield* TestClock.adjust('5 millis')
          yield* runtime.settled
          yield* opened(window, false)
          yield* adjusted(window, '5 millis')
          yield* runtime.settled
          return fired
        }))
    }), [['w', 40], ['p', 45]], { open: false, runs: 1_000, pinned: [0] })
}, 60_000)

test('a clock moved past a timer while the waker reads fires the timer, and settled returns', () =>
  // Decision 0258: the waker reads the clock again in the step that lets it rest, and sleeps toward its next timer
  // from there. On a server the clock moves while the waker reads the storage. A waker that slept from the time it
  // read before the reading would sleep past the timer: on the test's clock that sleep never ends, and `settled`
  // waits for the timer for ever. The clock here moves on by 50 millis right after the first time a fiber of the
  // runtime reads it, which is the waker's first round, before its reading.
  database(Effect.gen(function*() {
    const { layer } = yield* hands()
    const at = yield* DateTime.now
    // `timed` rings at 40 millis, stored by a process that ends before the next launches.
    yield* process({}, (runtime) =>
      Effect.gen(function*() {
        const toy = yield* Effect.provide(runtime.deploy(timed), layer)
        yield* toy.create('timed', { flags: { at }, requestId: 'c-timed', sender: tester })
      }))
    const host = yield* skewing
    const main = Fiber.getCurrent()
    const armed = { now: false }
    const clock: Clock.Clock = {
      ...host.clock,
      currentTimeMillisUnsafe: () => {
        const time = host.clock.currentTimeMillisUnsafe()
        if (armed.now && Fiber.getCurrent() !== main) {
          armed.now = false
          host.wall.skew += 50
        }
        return time
      },
      currentTimeMillis: Effect.sync(() => clock.currentTimeMillisUnsafe()),
    }
    let fired = false
    yield* process({
      observe: (entity, event) =>
        Effect.sync(() => {
          if (entity.id === 'timed' && event._tag === 'Fire') fired = true
        }),
    }, (runtime) =>
      Effect.gen(function*() {
        armed.now = true
        yield* Effect.provide(runtime.deploy(timed), layer)
        yield* runtime.settled
        expect(armed.now).toBe(false)
        expect(fired).toBe(true)
      })).pipe(Effect.provideService(Clock.Clock, clock))
  })), 10_000)

describe('a timer and the wall clock (decision 0221)', () => {
  const firings = () => {
    const fired: Array<number> = []
    const observe: Hooks['observe'] = (_entity, event) =>
      Effect.map(DateTime.now, (now) => {
        if (event._tag === 'Fire') fired.push(DateTime.toEpochMillis(now))
      })
    return { fired, observe }
  }

  test('a loaded entity’s timer fires within an hour of a suspended host’s return', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const host = yield* skewing
      const { fired, observe } = firings()
      const at = DateTime.toEpochMillis(yield* DateTime.now)
      yield* process({ observe, passivate: { millis: 24 * hour } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(distant), layer)
          const rings = DateTime.makeUnsafe(at + 3 * hour)
          yield* toy.create(id, { flags: { at: rings }, requestId: 'creation', sender: tester })
          yield* runtime.settled
          // The host sleeps for three hours: the wall clock moves on, and the timer's sleep does not.
          host.wall.skew += 3 * hour
          yield* host.adjust(`${hour - 1} millis`)
          expect(fired).toEqual([])
          // The timer's sleep ends after an hour, reads the wall clock, and finds its time past.
          yield* host.adjust('1 millis')
          expect(fired).toEqual([at + 4 * hour])
        })).pipe(Effect.provideService(Clock.Clock, host.clock))
    })))

  test('the waker fires a stored timer within an hour of a suspended host’s return', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const host = yield* skewing
      const { fired, observe } = firings()
      const { entities, unloaded } = unloads()
      const at = DateTime.toEpochMillis(yield* DateTime.now)
      yield* process({ observe, unloaded, passivate: { millis: 5 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(distant), layer)
          const rings = DateTime.makeUnsafe(at + 3 * hour)
          yield* toy.create(id, { flags: { at: rings }, requestId: 'creation', sender: tester })
          yield* runtime.settled
          yield* host.adjust('5 millis')
          yield* runtime.settled
          expect(entities).toEqual([id])
          // The host sleeps for three hours: the wall clock moves on, and the waker's sleep does not.
          host.wall.skew += 3 * hour
          // Not settled: by the wall clock a stored timer is due, and the waker has not read it yet.
          yield* host.adjust(`${hour - 1} millis`)
          expect(fired).toEqual([])
          // The waker's sleep ends an hour after it began, and its reading finds the timer due.
          yield* host.adjust('1 millis')
          yield* runtime.settled
          expect(fired).toEqual([at + 4 * hour + 5])
        })).pipe(Effect.provideService(Clock.Clock, host.clock))
    })))

  test('a loaded entity’s timer fires at its time when the clock is set back, never before', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const host = yield* skewing
      const { fired, observe } = firings()
      const at = DateTime.toEpochMillis(yield* DateTime.now)
      yield* process({ observe, passivate: { millis: 24 * hour } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at: DateTime.makeUnsafe(at) }, requestId: 'creation', sender: tester })
          yield* runtime.settled
          // The toy's timer rings 40 milliseconds after its creation, and the clock is set back an hour before.
          host.wall.skew -= hour
          yield* host.adjust('40 millis')
          expect(fired).toEqual([])
          // The sleep that ended early reads the wall clock, and sleeps the hour left.
          yield* host.adjust(`${hour - 1} millis`)
          expect(fired).toEqual([])
          yield* host.adjust('1 millis')
          expect(fired).toEqual([at + 40])
        })).pipe(Effect.provideService(Clock.Clock, host.clock))
    })))
})

// Decision 0077 has the waker try an entity it cannot activate again after `retry`. Under a retry of 0, decision 0208
// let it try again at once, for ever, and `settled` never returned. The least retry is a millisecond (decision 0251):
// the tries come a millisecond apart at least, and the process settles between them.
test('under the least retry, an entity the waker can never activate leaves the process settled', () =>
  database(Effect.gen(function*() {
    const at = yield* DateTime.now
    const tried: Array<number> = []
    yield* process({
      passivate: { millis: 5 },
      retry: { millis: 1 },
      // Every activation of `w` cannot finish, as a row no version reads (decision 0043).
      observe: (entity, event) =>
        entity.id !== 'w' || event._tag !== 'Restart'
          ? Effect.void
          : Effect.andThen(
            Effect.map(DateTime.now, (now) => tried.push(DateTime.toEpochMillis(now))),
            Effect.die('the runtime failed'),
          ),
    }, (runtime) =>
      Effect.gen(function*() {
        const toy = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
        yield* toy.create('w', { flags: { at }, requestId: 'w', sender: tester })
        yield* runtime.settled
        // The timer of `w` comes at 40, and every activation fails.
        const settling = yield* Effect.forkChild(TestClock.adjust('100 millis').pipe(Effect.andThen(runtime.settled)))
        yield* Effect.replicateEffect(Effect.yieldNow, 2000, { discard: true })
        const settled = settling.pollUnsafe() !== undefined
        yield* Fiber.interrupt(settling)
        const apart = tried.slice(1).every((time, index) => time - tried[index]! >= 1)
        expect({ settled, tried: tried.length > 1, apart }).toEqual({ settled: true, tried: true, apart: true })
      }))
  })))

describe('a reading of the waker that fails (decision 0259)', () => {
  test('a row the waker’s reading refuses stops the timers of its entity alone', () =>
    // The waker's reading of the next time decodes `MIN(due)` of each entity through `Rows.due`. Here `w-1`'s key holds
    // a time no integer is, as a hand-written fix would leave it. The reading gives `w-1` to the waker's failed
    // entities, and `w-2`'s timer, due before, fires.
    database(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      const fired: Array<string> = []
      const { warned, logger } = warnings()
      const { entities, unloaded } = unloads()
      yield* process({
        unloaded,
        passivate: { millis: 5 },
        observe: (entity, event) =>
          Effect.sync(() => {
            if (event._tag === 'Fire') fired.push(entity.id)
          }),
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(timed), layer)
          for (const entity of ['w-1', 'w-2']) yield* toy.create(entity, { flags: { at }, requestId: entity, sender: tester })
          yield* runtime.settled
          yield* TestClock.adjust('5 millis')
          yield* runtime.settled
          expect(entities).toEqual(['w-1', 'w-2'])
          yield* sql`UPDATE effecttea_entity_keys SET due = 1000.5 WHERE id = 'w-1' AND due IS NOT NULL`
          // The waker reads again once `w-2` is unloaded, and meets `w-1`'s time first, then `w-2`'s.
          yield* TestClock.adjust('40 millis')
          yield* runtime.settled
          // The waker reads `w-1`'s time again at every retry, and logs its first refusal alone.
          yield* TestClock.adjust('50 millis')
          yield* runtime.settled
          expect(fired).toEqual(['w-2'])
          expect(warned).toEqual([{ name: timed.name, id: 'w-1' }])
        })).pipe(Effect.provide(Logger.layer([logger])))
    })))

  test('a reading of the waker that fails is logged, and read again after the retry', () =>
    // The table of the timers is out of reach while the waker reads, as a connection lost would leave it. The reading
    // dies, and the waker logs it, rests, and reads again at every retry. Once the table is back, the timer fires.
    // It runs on SQLite and PGlite.
    onBoth(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      const fired: Array<string> = []
      const { warned, logger } = warnings()
      const { entities, unloaded } = unloads()
      yield* process({
        unloaded,
        passivate: { millis: 5 },
        retry: { millis: 10 },
        observe: (entity, event) =>
          Effect.sync(() => {
            if (event._tag === 'Fire') fired.push(entity.id)
          }),
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(timed), layer)
          yield* toy.create('w', { flags: { at }, requestId: 'w', sender: tester })
          yield* runtime.settled
          yield* TestClock.adjust('5 millis')
          yield* runtime.settled
          expect(entities).toEqual(['w'])
          yield* sql`ALTER TABLE effecttea_entity_keys RENAME TO effecttea_entity_keys_away`
          // `w`'s timer is due at 40, and the waker reads then.
          yield* TestClock.adjust('35 millis')
          yield* runtime.settled
          // The waker reads again at every retry, and logs the first failure alone.
          yield* TestClock.adjust('30 millis')
          yield* runtime.settled
          expect({ fired, warned }).toEqual({ fired: [], warned: [{ name: timed.name }] })
          yield* sql`ALTER TABLE effecttea_entity_keys_away RENAME TO effecttea_entity_keys`
          yield* TestClock.adjust('10 millis')
          yield* runtime.settled
          expect(fired).toEqual(['w'])
        })).pipe(Effect.provide(Logger.layer([logger])))
    })))
})

/** The annotations of each warning logged. */
const warnings = () => {
  const warned: Array<Readonly<Record<string, unknown>>> = []
  const logger = Logger.make((options) => {
    if (options.logLevel === 'Warn') warned.push(options.fiber.getRef(References.CurrentLogAnnotations))
  })
  return { warned, logger }
}
