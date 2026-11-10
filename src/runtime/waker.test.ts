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
import {
  adjusted,
  database,
  distant,
  explored,
  hands,
  type Hooks,
  hour,
  id,
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

test('settled never returns while the waker rests from a reading another entity left during, under bounded schedules', () => {
  // Decision 0068: the waker looks whether a poke waits, and clears its flag, in one step. Two entities crash one after
  // the other. The first, `later`, has a timer in the future, and its departure wakes the waker, whose reading leaves
  // out `timed`, still held, with its timer due. Were the look and the clearing two steps, `timed` could leave between
  // them. The waker would then sleep toward the timer of `later`, and `settled` return with the timer of `timed` known
  // to nobody. A preemption of the waker between the two steps reaches it.
  explored((window) =>
    Effect.gen(function*() {
      const { layer } = yield* hands()
      const gate = yield* Deferred.make<void>()
      const crashed = new Set<string>()
      let early = false
      let restarted = false
      return yield* process({
        // `timed` yields twice after the gate, so that in the run in order the waker reads between the two
        // departures, and one preemption is enough to put the second inside the waker's step.
        at: (point, entity, event) =>
          point === 'BeforeCommit' && received(event) === `r-${entity.id}` && !crashed.has(entity.id)
            ? Effect.andThen(
              Deferred.await(gate),
              Effect.andThen(
                entity.id === 'timed' ? Effect.andThen(Effect.yieldNow, Effect.yieldNow) : Effect.void,
                Effect.suspend(() => {
                  crashed.add(entity.id)
                  return Effect.die('the runtime failed')
                }),
              ),
            )
            : Effect.void,
        observe: (entity, event) =>
          Effect.sync(() => {
            if (entity.id === 'timed' && crashed.has('timed') && event._tag === 'Restart') restarted = true
          }),
      }, (runtime) =>
        Effect.gen(function*() {
          const at = yield* DateTime.now
          const toy = yield* Effect.provide(runtime.deploy(timed), layer)
          // `timed` rings at 40 millis, and `later` at 50.
          yield* toy.create('timed', { flags: { at }, requestId: 'c-timed', sender: tester })
          yield* adjusted(window, '10 millis')
          yield* toy.create('later', { flags: { at }, requestId: 'c-later', sender: tester })
          yield* runtime.settled
          // Once the caller of `timed` is answered, `timed` has left, and the rest runs in order.
          const want = (entity: string) =>
            Effect.forkChild(
              Effect.exit(toy.send(entity, { _tag: 'Want', key: 'a', on: false, nonce: `r-${entity}` }, {
                requestId: `r-${entity}`,
                sender: tester,
                keep: 'forever',
              })).pipe(Effect.ensuring(Effect.sync(() => {
                if (entity === 'timed') window.open = false
              }))),
            )
          const sent = [yield* want('later'), yield* want('timed')]
          // The clock reaches 40 millis while both messages wait at the gate.
          yield* adjusted(window, '30 millis')
          yield* opened(window, true)
          yield* together<void, never, never>([
            Deferred.succeed(gate, undefined).pipe(Effect.asVoid),
            Effect.andThen(runtime.settled, Effect.sync(() => {
              if (crashed.has('timed') && !restarted) early = true
            })),
          ])
          yield* opened(window, false)
          yield* Effect.forEach(sent, Fiber.join)
          yield* runtime.settled
          return { early, restarted }
        }))
    }), { early: false, restarted: true }, { open: false, bound: 1 })
}, 60_000)

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
