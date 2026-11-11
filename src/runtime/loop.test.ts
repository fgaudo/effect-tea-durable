/**
 * The tests of an entity's loop ([`loop.ts`](loop.ts)), against the machine: a scenario is driven on the real runtime,
 * with a crash injected at each point of the design's crash table, and what the database holds afterwards is compared
 * with where the pure machine ends on the same events (decision 0013). A transaction per event, the work started after
 * the commit, the wait of an entity, its unloading and the spans of its steps are what the comparison tests.
 */
import { describe, expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as DateTime from 'effect/DateTime'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Layer from 'effect/Layer'
import * as Metric from 'effect/Metric'
import fc from 'fast-check'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/sql'
import { TestClock } from 'effect/testing'
import * as Tracer from 'effect/Tracer'
import * as Machine from '../machine.ts'
import { InvariantDefect, type Program } from '../program.ts'
import * as Library from '../index.ts'
import { type Answer, type Options, type Point } from '../runtime.ts'
import { storage } from '../storage.ts'
import {
  adjusted,
  ahead,
  all,
  database,
  explored,
  gated,
  Hands,
  hands,
  type Hooks,
  id,
  Inbound,
  Key,
  keys,
  log,
  opened,
  persisted,
  process,
  program,
  publishedOf,
  slow,
  ran,
  received,
  replayed,
  running,
  type T,
  tester,
  timed,
  together,
  tracing,
  unloads,
} from '../runtime.test_shared.ts'

describe('passivation', () => {
  // An entity whose operation runs is never unloaded, so its wait ends and the loop waits again. Under a passivation
  // of 0, Effect's sleep was one yield and the loop spun; the least passivation is a millisecond (decision 0251), and
  // the processor time of a real wait shows that it rests. It runs two seconds of a real clock.
  slow('under the least passivation, an entity whose operation runs waits without spinning', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const busy = (passivate: number) =>
        process({ passivate: { millis: passivate } }, (runtime) =>
          Effect.gen(function*() {
            const held = yield* hands({ holds: true })
            const toy = yield* Effect.provide(runtime.deploy(program), held.layer)
            const entity = `spin-${passivate}`
            yield* toy.create(entity, { flags: { at }, requestId: `c-${passivate}`, sender: { _tag: 'Tester' } })
            const want = { _tag: 'Want', key: 'a', on: true, nonce: `w-${passivate}` } as const
            yield* toy.send(entity, want, { requestId: `w-${passivate}`, sender: { _tag: 'Tester' }, keep: 'forever' })
            yield* Effect.promise(() => Bun.sleep(20))
            expect(held.acted.some((act) => act.startsWith('a:'))).toBe(true)
            const before = globalThis.process.cpuUsage()
            yield* Effect.promise(() => Bun.sleep(1000))
            const used = globalThis.process.cpuUsage(before)
            return Math.round((used.user + used.system) / 1000)
          }))
      const resting = yield* busy(5)
      const least = yield* busy(1)
      // A process at rest uses some milliseconds of the 1000, and one that spins uses all of them, or more on its
      // threads.
      const shown = (millis: number) => (millis < 400 ? 'at rest' : `${millis} ms of the processor`)
      expect({ passivate5: shown(resting), passivate1: shown(least) })
        .toEqual({ passivate5: 'at rest', passivate1: 'at rest' })
    })), 10_000)

  test('unloads an idle entity, and its stored timer wakes it', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const { events, observe } = log()
      const { entities, unloaded } = unloads()
      const at = yield* DateTime.now
      yield* process({ observe, unloaded, passivate: { millis: 5 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: { _tag: 'Tester' } })
          yield* runtime.settled
          expect(entities).toEqual([])
          // Only the timer is left, and nothing holds the entity loaded: it is unloaded with the timer stored.
          yield* TestClock.adjust('5 millis')
          expect(entities).toEqual([id])
          // What callers read of an unloaded entity is read from storage.
          expect(yield* toy.read(id)).toBe(1)
          // The timer's time comes while the entity is unloaded: the stored time is what wakes it, and with
          // nothing left to do the entity is unloaded again.
          yield* TestClock.adjust('60 millis')
          yield* runtime.settled
          expect(yield* toy.read(id)).toBe(0)
          expect(entities).toEqual([id, id])
        }))
      const stored = yield* persisted
      expect(stored).toEqual(replayed(stored?.state.since ?? at, events))
    })))

  test('the process settles and a stored timer wakes its entity, under prioritized schedules', () => {
    // Each schedule moves the points where one fiber runs between two steps of another (decisions 0068, 0104).
    explored((window) =>
      Effect.gen(function*() {
        const { layer } = yield* hands()
        const { entities, unloaded } = unloads()
        const at = yield* DateTime.now
        return yield* process({ unloaded, passivate: { millis: 5 } }, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(program), layer)
            yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: { _tag: 'Tester' } })
            // An operation that ended before it was held would be counted as running for ever, and this would
            // never return: the run would not end. An event not counted as it is offered would let it return before
            // the event is applied, and the entity would be read with a key it no longer wants.
            yield* runtime.settled
            const read = [yield* toy.read(id)]
            yield* adjusted(window, '5 millis')
            yield* runtime.settled
            yield* adjusted(window, '60 millis')
            yield* runtime.settled
            read.push(yield* toy.read(id))
            return { read, unloaded: [...entities] }
          }))
      }), { read: [1, 0], unloaded: [id, id] })
  }, 60_000)

  test('a process over its capacity unloads its least recently used idle entity, under prioritized schedules', () => {
    const tester = { _tag: 'Tester' } as const
    // Each schedule moves the points where the entity told to leave runs between two steps of the caller. The entity
    // that leaves is counted from before it leaves (decision 0109): counted after, seed 0, pinned, fails. `bun run
    // test:pins` runs it against that form, the pin `0109` of `src/runtime.test_pins.ts` (decision 0254).
    explored(() =>
      Effect.gen(function*() {
        const { layer } = yield* hands()
        const { entities, unloaded } = unloads()
        const at = yield* DateTime.now
        // A wait that never runs out in the test: only the capacity unloads (decision 0076).
        return yield* process({ unloaded, capacity: { entities: 2 } }, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(program), layer)
            for (const entity of ['e-1', 'e-2']) {
              yield* toy.create(entity, { flags: { at }, requestId: entity, sender: tester })
            }
            yield* runtime.settled
            const left = [[...entities]]
            // `e-1` is used again, so `e-2` is the least recently used when a third enters, and it has left
            // once the process is settled.
            yield* toy.send('e-1', { _tag: 'Refuse', nonce: 'n-1' }, { requestId: 'r-1', sender: tester, keep: 'forever' })
            yield* runtime.settled
            yield* toy.create('e-3', { flags: { at }, requestId: 'e-3', sender: tester })
            yield* runtime.settled
            left.push([...entities])
            // A caller loads it again, and `e-1` leaves in its turn.
            yield* toy.send('e-2', { _tag: 'Refuse', nonce: 'n-2' }, { requestId: 'r-2', sender: tester, keep: 'forever' })
            yield* runtime.settled
            left.push([...entities])
            return left
          }))
      }), [[], ['e-2'], ['e-2', 'e-1']], { pinned: [0] })
  }, 60_000)

  test('entities woken past the capacity each fire their timer and leave once, under prioritized schedules', () => {
    const tester = { _tag: 'Tester' } as const
    // A timer due is no spare entity (decision 0078): none is told to leave before it fires, and woken again.
    explored((window) =>
      Effect.gen(function*() {
        const { layer } = yield* hands()
        const { entities, unloaded } = unloads()
        const fired: Array<string> = []
        const at = yield* DateTime.now
        return yield* process({
          unloaded,
          passivate: { millis: 5 },
          capacity: { entities: 1 },
          observe: (entity, event) =>
            Effect.sync(() => {
              if (event._tag === 'Fire') fired.push(entity.id)
            }),
        }, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(program), layer)
            for (const entity of ['w-1', 'w-2']) {
              yield* toy.create(entity, { flags: { at }, requestId: entity, sender: tester })
              yield* runtime.settled
            }
            yield* adjusted(window, '5 millis')
            entities.length = 0
            // Both timers come at once, and the waker activates one entity after the other, past the capacity.
            yield* adjusted(window, '60 millis')
            yield* runtime.settled
            return { fired: [...fired].sort(), woken: entities.length }
          }))
      }), { fired: ['w-1', 'w-2'], woken: 2 })
  }, 60_000)

  test('a busy entity is never unloaded for the capacity, and a capacity of none is refused', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { entities, unloaded } = unloads()
      // An entity whose operations are under way stays: the process holds more than its capacity.
      const { layer } = yield* hands({ holds: true })
      yield* process({ unloaded, capacity: { entities: 1 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          for (const entity of ['f-1', 'f-2']) {
            yield* ran(toy.create(entity, { flags: { at }, requestId: entity, sender: { _tag: 'Tester' } }))
          }
          expect(entities).toEqual([])
        }))
      // A capacity of no entity at all, or of no whole number of them, is the launcher's defect.
      for (const entities of [0, 1.5, Infinity, NaN]) {
        const exit = yield* Effect.exit(process({ capacity: { entities } }, () => Effect.void))
        const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
        expect(cause instanceof InvariantDefect && cause.reason)
          .toBe(`the capacity is ${entities}, which is no positive integer`)
      }
    })))

  // Effect reads no `Infinity millis` and no `NaN millis`, so the sleep of an entity's wait, or of an operation that
  // sends again, would die (decision 0208). A retry or a passivation of 0 would have the waker, a sender, Cluster's
  // round and an entity's wait try again at once, for ever (decision 0251).
  test('a retry or a passivation that is no positive integer, or a warning that is no non-negative one, is the launcher’s defect', () =>
    database(Effect.gen(function*() {
      const refused = (options: Options, reason: string) =>
        Effect.gen(function*() {
          const exit = yield* Effect.exit(process(options, () => Effect.void))
          const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
          expect(cause instanceof InvariantDefect && cause.reason).toBe(reason)
        })
      for (const value of [-1, 0, 1.5, Infinity, NaN]) {
        yield* refused({ retry: { millis: value } }, `the retry is ${value} millis, which is no positive integer`)
        yield* refused(
          { passivate: { millis: value } },
          `the passivation is ${value} millis, which is no positive integer`,
        )
      }
      for (const value of [-1, 1.5, Infinity, NaN]) {
        yield* refused(
          { warn: { characters: value } },
          `the warning is ${value} characters, which is no non-negative integer`,
        )
      }
      // The least retry and passivation are a millisecond, and a warning at no character warns of every write.
      yield* process({ retry: { millis: 1 }, passivate: { millis: 1 }, warn: { characters: 0 } }, () => Effect.void)
    })))

  slow('a process launched with no capacity holds ten thousand entities', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { entities, unloaded } = unloads()
      // The default is Cluster's `maxResidentEntities` (decision 0151): the first entity leaves as the 10 001st enters.
      yield* process({ unloaded }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
          for (let index = 0; index < 10_000; index++) {
            yield* toy.create(`d-${index}`, { flags: { at }, requestId: `d-${index}`, sender: tester })
          }
          yield* runtime.settled
          expect(entities).toEqual([])
          yield* toy.create('d-last', { flags: { at }, requestId: 'd-last', sender: tester })
          yield* runtime.settled
          expect(entities).toEqual(['d-0'])
        }))
      // The creations take seconds, past which the test clock warns of a test that waits on time.
    }).pipe(Effect.provide(TestClock.layer({ warningDelay: '1 minute' })))), 60_000)

  test('with an unbounded capacity, only time unloads', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { entities, unloaded } = unloads()
      yield* process({ unloaded, capacity: { entities: 'unbounded' } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
          for (const entity of ['s-1', 's-2', 's-3']) {
            yield* toy.create(entity, { flags: { at }, requestId: entity, sender: tester })
            yield* runtime.settled
          }
          expect(entities).toEqual([])
        }))
    })))

  test('an entity that crashed holds no place under the capacity, whatever its operations deliver after', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { entities, unloaded } = unloads()
      // Operations that finish once the test lets them, and that an interruption cannot stop before: they deliver
      // after their entity has crashed and left the process.
      const gate = Deferred.makeUnsafe<void>()
      const late = Layer.succeed(Hands, Hands.of({ act: () => Effect.uninterruptible(Deferred.await(gate)) }))
      let dies = true
      yield* process({
        unloaded,
        capacity: { entities: 2 },
        observe: (entity, event) => {
          if (entity.id !== 'x' || event._tag !== 'Receive' || !dies) return Effect.void
          dies = false
          return Effect.die('the runtime failed')
        },
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), late)
          const timers = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
          yield* ran(toy.create('x', { flags: { at }, requestId: 'x', sender: tester }))
          const failed = yield* Effect.exit(toy.send('x', { _tag: 'Refuse', nonce: 'n' }, { requestId: 'r', sender: tester, keep: 'forever' }))
          expect(Exit.isFailure(failed)).toBe(true)
          yield* Deferred.succeed(gate, undefined)
          yield* runtime.settled
          // Two entities fill the capacity, and neither leaves: the one that crashed is not counted.
          for (const entity of ['s-1', 's-2']) {
            yield* timers.create(entity, { flags: { at }, requestId: entity, sender: tester })
            yield* runtime.settled
          }
          expect(entities).toEqual([])
        }))
    })))

  test('the capacity counts the entities of every program the process deploys', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { entities, unloaded } = unloads()
      yield* process({ unloaded, capacity: { entities: 2 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), (yield* hands()).layer)
          const twin = yield* Effect.provide(runtime.deploy({ ...program, name: 'Twin' }), (yield* hands()).layer)
          yield* toy.create('e-1', { flags: { at }, requestId: 'e-1', sender: tester })
          yield* runtime.settled
          yield* twin.create('e-2', { flags: { at }, requestId: 'e-2', sender: tester })
          yield* runtime.settled
          expect(entities).toEqual([])
          // A third entity, of the first program: the process holds three, and the least recently used leaves.
          yield* toy.create('e-3', { flags: { at }, requestId: 'e-3', sender: tester })
          yield* runtime.settled
          expect(entities).toEqual(['e-1'])
        }))
    })))

  test('a process that comes back over its capacity unloads as many as it holds too many', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { entities, unloaded } = unloads()
      const { open, layer } = yield* gated()
      yield* process({ unloaded, capacity: { entities: 1 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          // Two entities busy at once hold the process over its capacity, and stay once their work is done: only
          // an entity that enters tells the others to leave (decision 0076).
          for (const entity of ['f-1', 'f-2']) yield* ran(toy.create(entity, { flags: { at }, requestId: entity, sender: tester }))
          yield* open
          yield* runtime.settled
          expect(entities).toEqual([])
          yield* toy.create('f-3', { flags: { at }, requestId: 'f-3', sender: tester })
          yield* runtime.settled
          expect([...entities].sort()).toEqual(['f-1', 'f-2'])
        }))
    })))

  test('entities entering at once tell no more to leave than the process holds too many, under prioritized schedules', () => {
    explored(() =>
      Effect.gen(function*() {
        const at = yield* DateTime.now
        const { entities, unloaded } = unloads()
        return yield* process({ unloaded, capacity: { entities: 3 } }, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
            for (const entity of ['s-1', 's-2', 's-3']) {
              yield* toy.create(entity, { flags: { at }, requestId: entity, sender: tester })
              yield* runtime.settled
            }
            // Two enter at once: one told to leave and not gone yet counts against the second one's excess.
            yield* together([
              toy.create('s-4', { flags: { at }, requestId: 's-4', sender: tester }),
              toy.create('s-5', { flags: { at }, requestId: 's-5', sender: tester }),
            ])
            yield* runtime.settled
            return [...entities].sort()
          }))
      }), ['s-1', 's-2'])
  }, 60_000)

  test('the entity entering is never told to leave, even with nothing to do', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { entities, unloaded } = unloads()
      yield* process({ unloaded, capacity: { entities: 1 } }, (runtime) =>
        Effect.gen(function*() {
          const busy = yield* Effect.provide(runtime.deploy(program), (yield* hands({ holds: true })).layer)
          const timers = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
          yield* ran(busy.create('f-1', { flags: { at }, requestId: 'f-1', sender: tester }))
          // The process is over its capacity, and only the entity entering has nothing to do: it stays.
          yield* ran(timers.create('s-1', { flags: { at }, requestId: 's-1', sender: tester }))
          expect(entities).toEqual([])
        }))
    })))

  test('an entity told to leave that is sent a message before it leaves stays, and is answered', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { entities, unloaded } = unloads()
      let toy: Library.Handle<T> | null = null
      let answer: Answer<'Refused'> | null = null
      yield* process({
        unloaded,
        capacity: { entities: 1 },
        // Once `s-2` has entered and told `s-1` to leave, and before `s-1`'s loop takes that, `s-1` is sent a
        // message: its loop finds it with something to do, and keeps it.
        at: (point, entity, event) =>
          point === 'AfterReply' && entity.id === 's-2' && event._tag === 'Create' && toy !== null
            ? Effect.map(
              toy.send('s-1', { _tag: 'Refuse', nonce: 'n-1' }, { requestId: 'r-1', sender: tester, keep: 'forever' }),
              (reply) => {
                answer = reply
              },
            )
            : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          toy = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
          yield* toy.create('s-1', { flags: { at }, requestId: 's-1', sender: tester })
          yield* runtime.settled
          yield* toy.create('s-2', { flags: { at }, requestId: 's-2', sender: tester })
          // A loop that unloaded it would lose the message, and one that kept it told would never settle.
          yield* runtime.settled
          expect(answer).toEqual({ _tag: 'Rejected', reason: 'Refused' })
          expect(entities).toEqual([])
          // The next entity to enter finds the process two over its capacity, and both leave.
          yield* toy.create('s-3', { flags: { at }, requestId: 's-3', sender: tester })
          yield* runtime.settled
          expect([...entities].sort()).toEqual(['s-1', 's-2'])
        }))
    })))

  test('an entity whose timer comes due before it takes the telling to leave stays, and fires', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { entities, unloaded } = unloads()
      const clock = ahead()
      const fired: Array<string> = []
      yield* clock.around(process({
        unloaded,
        capacity: { entities: 1 },
        observe: (entity, event) =>
          Effect.sync(() => {
            if (event._tag === 'Fire') fired.push(entity.id)
          }),
        // Once `s-2` has told `s-1` to leave, the wall clock reaches `s-1`'s timer before its loop takes that, as a
        // real clock may: `s-1` is no longer spare (decision 0078).
        at: (point, entity, event) =>
          point === 'AfterReply' && entity.id === 's-2' && event._tag === 'Create'
            ? Effect.sync(() => {
              clock.by.millis = 40
            })
            : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
          yield* toy.create('s-1', { flags: { at }, requestId: 's-1', sender: tester })
          yield* runtime.settled
          yield* toy.create('s-2', { flags: { at }, requestId: 's-2', sender: tester })
          // The sleeps reach the time too, and each timer fires where it is armed.
          yield* clock.adjust('40 millis')
          yield* runtime.settled
          expect({ fired: [...fired].sort(), entities }).toEqual({ fired: ['s-1', 's-2'], entities: [] })
        })))
    })))

  test('an entity whose timer is due by the clock is not spare, and the next least recently used leaves', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { entities, unloaded } = unloads()
      const clock = ahead()
      yield* clock.around(process({ unloaded, capacity: { entities: 2 } }, (runtime) =>
        Effect.gen(function*() {
          const timers = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
          const toy = yield* Effect.provide(runtime.deploy(program), (yield* hands()).layer)
          // `w` is due at 40, and `s` later: both spare until then.
          yield* timers.create('w', { flags: { at }, requestId: 'w', sender: tester })
          yield* runtime.settled
          yield* clock.adjust('10 millis')
          yield* timers.create('s', { flags: { at: yield* DateTime.now }, requestId: 's', sender: tester })
          yield* runtime.settled
          // The clock reaches `w`'s time, exactly, and its sleep has not fired yet when a third entity enters:
          // `w` is about to fire, and `s` is told to leave in its place (decision 0078).
          clock.by.millis = 30
          yield* toy.create('x', { flags: { at }, requestId: 'x', sender: tester })
          clock.by.millis = 0
          yield* clock.adjust('30 millis')
          yield* runtime.settled
          expect(entities).toEqual(['s'])
        })))
    })))

  test('a suspended entity is spare whatever its timers, and leaves for an entity that enters', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { entities, unloaded } = unloads()
      yield* process({ unloaded, capacity: { entities: 1 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
          yield* toy.create('s-1', { flags: { at }, requestId: 's-1', sender: tester })
          expect(yield* toy.send('s-1', { _tag: 'Break', nonce: 'b' }, { requestId: 'b', sender: tester, keep: 'forever' }))
            .toEqual({ _tag: 'Suspended' })
          // Its timer's time passes, and no sleep of it is armed: nothing of it fires.
          yield* TestClock.adjust('50 millis')
          yield* runtime.settled
          yield* toy.create('s-2', { flags: { at }, requestId: 's-2', sender: tester })
          yield* runtime.settled
          expect(entities).toEqual(['s-1'])
        }))
    })))

  test('callers of two unloaded entities over a capacity of one are both answered, under prioritized schedules', () => {
    const want = (nonce: string): Inbound => ({ _tag: 'Want', key: 't', on: true, nonce })
    explored(() =>
      Effect.gen(function*() {
        const at = yield* DateTime.now
        yield* process({}, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
            for (const entity of ['u-1', 'u-2']) yield* toy.create(entity, { flags: { at }, requestId: entity, sender: tester })
            yield* runtime.settled
          }))
        return yield* process({ capacity: { entities: 1 } }, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
            // Each activation holds its caller's event before the other can tell it to leave (decision 0079). With
            // the caller's event offered after the lock of the activation is let go, seed 91, pinned, fails. `bun
            // run test:pins` runs it against that form, the pin `0079 an activation` of `src/runtime.test_pins.ts`
            // (decision 0254).
            return yield* together([
              toy.send('u-1', want('n-1'), { requestId: 'r-1', sender: tester, keep: 'forever' }),
              toy.send('u-2', want('n-2'), { requestId: 'r-2', sender: tester, keep: 'forever' }),
            ])
          }))
      }), [{ _tag: 'Accepted' }, { _tag: 'Accepted' }], { pinned: [91] })
  }, 60_000)

  test('a caller interrupted anywhere as it activates its entity leaves the process able to settle', () => {
    const want = (nonce: string): Inbound => ({ _tag: 'Want', key: 't', on: true, nonce })
    // Each schedule moves the point where the interruption reaches the caller.
    explored(() =>
      Effect.gen(function*() {
        const at = yield* DateTime.now
        yield* process({}, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
            yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
            yield* runtime.settled
          }))
        return yield* process({}, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
            const caller = yield* Effect.forkChild(toy.send(id, want('n-1'), { requestId: 'r-1', sender: tester, keep: 'forever' }))
            yield* Fiber.interrupt(caller)
            // What runs detached is counted from the step that forks it to its end: a count left behind would
            // keep this from returning, and the run would not end (decision 0079). With the count raised before the
            // uninterruptible step that forks, seed 162, pinned, fails. `bun run test:pins` runs it against that form,
            // the pin `0079 what runs detached` of `src/runtime.test_pins.ts` (decision 0254).
            yield* runtime.settled
            return 'settled'
          }))
      }), 'settled', { pinned: [162] })
  }, 60_000)

  test('a caller interrupted anywhere as it sends leaves its entity’s bound whole, in every schedule within one deviation', () => {
    const want = (nonce: string): Inbound => ({ _tag: 'Want', key: 't', on: true, nonce })
    // Each schedule moves the point where the interruption reaches the caller, the permit taken and the message not
    // offered yet among them (decision 0147). A send that yields between the two, outside an uninterruptible region,
    // keeps the permit in a schedule, and the second send is answered Full: the deviation at decision 373, pinned.
    // `bun run test:pins` runs it against that form, the pin `0147` of `src/runtime.test_pins.ts` (decision 0254).
    explored(() =>
      Effect.gen(function*() {
        const at = yield* DateTime.now
        return yield* process({ callers: { messages: 1 } }, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
            yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
            yield* runtime.settled
            const caller = yield* Effect.forkChild(toy.send(id, want('n-1'), { requestId: 'r-1', sender: tester, keep: 'forever' }))
            yield* Fiber.interrupt(caller)
            yield* runtime.settled
            return yield* toy.send(id, want('n-2'), { requestId: 'r-2', sender: tester, keep: 'forever' })
          }))
      }), { _tag: 'Accepted' }, { bound: 1, pinned: [{ decision: 373, choice: 1 }] })
  }, 60_000)

  test('a caller loads an unloaded entity again, and is answered', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const { entities, unloaded } = unloads()
      const at = yield* DateTime.now
      yield* process({ unloaded, passivate: { millis: 5 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: { _tag: 'Tester' } })
          yield* runtime.settled
          yield* TestClock.adjust('5 millis')
          expect(entities).toEqual([id])
          // The entity is loaded again to handle the message, and the reply is the step's.
          expect(yield* toy.send(id, { _tag: 'Want', key: 't', on: false, nonce: 'w' }, {
            requestId: 'r1',
            sender: { _tag: 'Tester' },
            keep: 'forever',
          })).toEqual({ _tag: 'Accepted' })
          expect(yield* toy.read(id)).toBe(0)
        }))
    })))

  test('a process starts with the entities holding an operation, and the stored timers wake the rest', () =>
    database(Effect.gen(function*() {
      const { events, observe } = log()
      const at = yield* DateTime.now
      const store = storage(program, yield* SqlClient.SqlClient)
      // The first process leaves the entity with its timer alone: every operation ran and was delivered.
      yield* process({ observe }, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: { _tag: 'Tester' } })
          yield* runtime.settled
        }))
      expect((yield* store.load(id))?.state.want).toEqual(['t'])
      const since = (yield* store.load(id))?.state.since ?? at
      // There is nothing for a process to activate: a timer is not an operation a crash interrupted.
      expect(yield* store.interrupted).toEqual([])
      // The timer is the entity's only work: it is due at the time the state holds, a reading that counts the
      // entity among the process's own gives it neither as due nor as the next, and the time is `rings`.
      const rings = DateTime.toEpochMillis(since) + 40
      expect(yield* store.due(rings - 1, [])).toEqual({ ready: [], next: rings })
      expect(yield* store.due(rings, [])).toEqual({ ready: [id], next: null })
      expect(yield* store.due(rings, [id])).toEqual({ ready: [], next: null })
      // However many entities the process holds: they are not parameters of the query, whose number SQLite caps.
      const many = Array.from({ length: 40_000 }, (_, n) => `loaded-${n}`)
      expect(yield* store.due(rings, many)).toEqual({ ready: [id], next: null })
      yield* process({ observe }, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          yield* Effect.provide(runtime.deploy(program), layer)
          // The waker has read the stored timers once the process is settled, and sleeps until the earliest.
          yield* runtime.settled
          yield* TestClock.adjust('10 millis')
          expect(events.filter((event) => event._tag === 'Restart').length).toBe(0)
          // Its time comes, and the entity is activated for it.
          yield* TestClock.adjust('60 millis')
          yield* runtime.settled
          expect(events.filter((event) => event._tag === 'Restart').length).toBe(1)
        }))
      expect((yield* store.load(id))?.state.want).toEqual([])
      expect(yield* persisted).toEqual(replayed(since, events))
    })))

  test('the due timers pass over the loaded entities, page after page', () =>
    database(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const store = storage(program, sql)
      // 600 entities with a timer: the even ones are due at 10, the odd ones at 1_000 + n. The process holds
      // the first 500, more than a page of either reading.
      const ids = Array.from({ length: 600 }, (_, n) => `e-${String(n).padStart(3, '0')}`)
      for (const [n, entity] of ids.entries()) {
        yield* sql`INSERT INTO effecttea_entity_keys ${
          sql.insert({
            name: program.name,
            id: entity,
            key: 't',
            parameter: '',
            incarnation: 1,
            version: 1,
            work: '{}',
            delivery: null,
            due: n % 2 === 0 ? 10 : 1_000 + n,
          })
        }`
      }
      const due = yield* store.due(100, ids.slice(0, 500))
      expect(due.ready).toEqual(ids.slice(500).filter((_, n) => n % 2 === 0))
      expect(due.next).toBe(1_000 + 501)
    })))

  test('a suspended entity is unloaded, no timer of its fires, and an operator loads it again', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const { entities, unloaded } = unloads()
      const at = yield* DateTime.now
      const store = storage(program, yield* SqlClient.SqlClient)
      yield* process({ unloaded, passivate: { millis: 5 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: { _tag: 'Tester' } })
          yield* runtime.settled
          expect(yield* toy.send(id, { _tag: 'Break', nonce: 'b' }, {
            requestId: 'break',
            sender: { _tag: 'Tester' },
            keep: 'forever',
          })).toEqual({ _tag: 'Suspended' })
          // It is unloaded with the message it died on, and its timer's time passes without firing.
          yield* TestClock.adjust('5 millis')
          expect(entities).toEqual([id])
          yield* TestClock.adjust('80 millis')
          expect(entities).toEqual([id])
          const stored = yield* store.load(id)
          expect(stored?.suspension?.on).toEqual({ _tag: 'Message' })
          expect(stored?.mailbox.length).toBe(1)
          // It holds its timer still, and is left out of both readings a process makes of what has to run.
          expect(Object.values(stored?.keys ?? {}).map((held) => held.key)).toEqual([{ name: 't' }])
          expect(yield* store.interrupted).toEqual([])
          expect(yield* store.due(DateTime.toEpochMillis(yield* DateTime.now) + 1_000, [])).toEqual({
            ready: [],
            next: null,
          })
          // An operator's act loads it again, and what it holds runs.
          yield* toy.discard(id)
          yield* runtime.settled
          expect((yield* store.load(id))?.suspension).toBe(null)
        }))
    })))

  test('no caller is lost to a passivation', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const { entities, unloaded } = unloads()
      const at = yield* DateTime.now
      const nonces = Array.from({ length: 24 }, (_, index) => index)
      // An entity unloaded as soon as it has nothing to do, with the callers arriving across the moments it is:
      // each one finds it loaded or loads it again, and none is lost to a passivation in between. The callers
      // are spread far enough apart that the entity has time to be unloaded between them, which the count of
      // unloads below is what checks.
      yield* process({ unloaded, passivate: { millis: 1 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: { _tag: 'Tester' } })
          yield* runtime.settled
          const callers = yield* running(Effect.forEach(
            nonces,
            (nth) =>
              // The timer is the key a step may drop: an operation leaves only by completing (decision 0005).
              Effect.delay(
                toy.send(id, { _tag: 'Want', key: 't', on: nth % 2 === 0, nonce: `n${nth}` }, {
                  requestId: `r${nth}`,
                  sender: { _tag: 'Tester' },
                  keep: 'forever',
                }),
                `${nth * 5} millis`,
              ),
            { concurrency: 'unbounded' },
          ))
          yield* TestClock.adjust(`${nonces.length * 5} millis`)
          // Every caller was answered: a message lost to a passivation would wait for ever.
          expect(yield* Fiber.join(callers)).toEqual(nonces.map(() => ({ _tag: 'Accepted' })))
          yield* runtime.settled
        }))
      // The entity was unloaded and loaded again throughout, which is what the test is about: a run that kept
      // it loaded would pass as well, and say nothing.
      expect(entities.length).toBeGreaterThan(nonces.length / 2)
      const stored = yield* storage(program, yield* SqlClient.SqlClient).load(id)
      // Every message was applied once. The callers are concurrent, so the order is the mailbox's, not theirs.
      expect([...(stored?.state.applied ?? [])].sort()).toEqual(nonces.map((nth) => `n${nth}`).sort())
    })))

  test('an activation holds its own entity alone, and its callers wait for the one machine it builds', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const { events, observe } = log()
      const at = yield* DateTime.now
      const tester = { _tag: 'Tester' } as const
      const want = (nonce: string): Inbound => ({ _tag: 'Want', key: 't', on: true, nonce })
      // Two entities left with their timers alone, which the next process does not hold.
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create('slow', { flags: { at }, requestId: 'c-slow', sender: tester })
          yield* toy.create('other', { flags: { at }, requestId: 'c-other', sender: tester })
          yield* runtime.settled
        }))
      const gate = yield* Deferred.make<void>()
      yield* process({
        // The activation of the first entity holds once its `Restart` is applied, as a slow database would. It
        // writes nothing, so no point of the crash table sees it.
        observe: (entity, event) =>
          Effect.andThen(
            observe(entity, event),
            entity.id === 'slow' && event._tag === 'Restart' ? Deferred.await(gate) : Effect.void,
          ),
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          const first = yield* running(toy.send('slow', want('n-1'), { requestId: 'r-1', sender: tester, keep: 'forever' }))
          const second = yield* running(toy.send('slow', want('n-2'), { requestId: 'r-2', sender: tester, keep: 'forever' }))
          // Another entity is loaded and answered meanwhile (decision 0067). A wait for the activation held would
          // hold this call for ever, which the test's own timeout reports.
          expect(yield* toy.send('other', want('n-3'), { requestId: 'r-3', sender: tester, keep: 'forever' }))
            .toEqual({ _tag: 'Accepted' })
          yield* Deferred.succeed(gate, undefined)
          expect(yield* Fiber.join(first)).toEqual({ _tag: 'Accepted' })
          expect(yield* Fiber.join(second)).toEqual({ _tag: 'Accepted' })
          yield* runtime.settled
        }))
      // One machine was built for the entity held, whichever caller came first.
      expect(events.filter((event) => event._tag === 'Restart').length).toBe(2)
      const stored = yield* storage(program, yield* SqlClient.SqlClient).load('slow')
      expect([...(stored?.state.applied ?? [])].sort()).toEqual(['n-1', 'n-2'])
    })))

  // The load is under the entity's lock: two callers never read it from storage and build a machine each
  // (decisions 0029, 0067). With the lock held by no one, seed 6, pinned, builds two. `bun run test:pins` runs it
  // against that form, the pin `0067 the load` of `src/runtime.test_pins.ts` (decision 0254).
  test('two callers of an entity not loaded build one machine for it, under prioritized schedules', () => {
    const tester = { _tag: 'Tester' } as const
    const want = (nonce: string): Inbound => ({ _tag: 'Want', key: 't', on: true, nonce })
    explored(() =>
      Effect.gen(function*() {
        const { layer } = yield* hands()
        const { events, observe } = log()
        const at = yield* DateTime.now
        yield* process({}, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(program), layer)
            yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
            yield* runtime.settled
          }))
        const both = yield* process({ observe }, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(program), layer)
            return yield* together([
              toy.send(id, want('n-1'), { requestId: 'r-1', sender: tester, keep: 'forever' }),
              toy.send(id, want('n-2'), { requestId: 'r-2', sender: tester, keep: 'forever' }),
            ])
          }))
        return { both, restarts: events.filter((event) => event._tag === 'Restart').length }
      }), { both: [{ _tag: 'Accepted' }, { _tag: 'Accepted' }], restarts: 1 }, { pinned: [6] })
  }, 60_000)

  test('two creations of one entity at once build one machine, and the second is answered AlreadyExists', () => {
    const tester = { _tag: 'Tester' } as const
    explored(() =>
      Effect.gen(function*() {
        const { layer } = yield* hands()
        const at = yield* DateTime.now
        return yield* process({}, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(program), layer)
            const both = yield* together([
              Effect.exit(toy.create(id, { flags: { at }, requestId: 'c-1', sender: tester })),
              Effect.exit(toy.create(id, { flags: { at }, requestId: 'c-2', sender: tester })),
            ])
            return both.map((exit) => Exit.isSuccess(exit) ? exit.value._tag : 'died').sort()
          }))
      }), ['AlreadyExists', 'Created'])
  }, 60_000)

  test('an activation whose caller gives up is finished all the same, and the next caller is answered', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      const tester = { _tag: 'Tester' } as const
      const want = (nonce: string): Inbound => ({ _tag: 'Want', key: 't', on: true, nonce })
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          yield* runtime.settled
        }))
      const reached = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      yield* process({
        // The activation holds once its `Restart` is applied, as a slow database would.
        observe: (_entity, event) =>
          event._tag === 'Restart'
            ? Effect.andThen(Deferred.succeed(reached, undefined), Deferred.await(gate))
            : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          const first = yield* Effect.forkChild(toy.send(id, want('n-1'), { requestId: 'r-1', sender: tester, keep: 'forever' }))
          yield* Deferred.await(reached)
          // Its caller gives up, a timeout of its own or an operation stopped: the activation is the entity's, and
          // goes on (decision 0079). One left half done would hold the next caller for ever.
          yield* Fiber.interrupt(first)
          yield* Deferred.succeed(gate, undefined)
          expect(yield* toy.send(id, want('n-2'), { requestId: 'r-2', sender: tester, keep: 'forever' })).toEqual({ _tag: 'Accepted' })
          yield* runtime.settled
        }))
    })))

  test('a creation whose caller gives up after its commit starts its work all the same', () =>
    database(Effect.gen(function*() {
      const { acted, layer } = yield* hands()
      const at = yield* DateTime.now
      const tester = { _tag: 'Tester' } as const
      const reached = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      yield* process({
        at: (point, _entity, event) =>
          point === 'AfterCommit' && event._tag === 'Create'
            ? Effect.andThen(Deferred.succeed(reached, undefined), Deferred.await(gate))
            : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          const creator = yield* Effect.forkChild(toy.create(id, { flags: { at }, requestId: 'creation', sender: tester }))
          yield* Deferred.await(reached)
          yield* Fiber.interrupt(creator)
          yield* Deferred.succeed(gate, undefined)
          // The entity is stored with its operations, and runs them: one left unloaded would hold them until a
          // caller came, since no timer of its is due (decision 0079).
          yield* runtime.settled
          expect([...acted].map((act) => act.split(':')[0]).sort()).toEqual(['a', 'b', 'c'])
        }))
    })))
})

describe('the crash table', () => {
  const points: ReadonlyArray<Point> = ['BeforeCommit', 'AfterCommit', 'AfterReply']

  test('each point of a creation is given the creation', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const reached: Array<string> = []
      yield* process({
        at: (point, _entity, event) =>
          Effect.sync(() => {
            reached.push(`${point} ${event._tag}`)
          }),
      }, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: { _tag: 'Tester' } })
        }))
      expect(reached).toEqual(points.map((point) => `${point} Create`))
    })))

  // A caller's message that finds the mailbox empty is handled in the transaction that receives it, so this runtime
  // never leaves one there (decision 0074); one a store holds from before is handled at the next start
  // (decision 0071).
  test('a message left in the mailbox of an idle entity is handled at the next start, with no retry', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const sender = { _tag: 'Tester' } as const
      const sql = yield* SqlClient.SqlClient
      const store = storage(program, sql)
      // The entity has nothing left under way, so nothing else would have a process start it.
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender })
          yield* runtime.settled
          yield* TestClock.adjust('60 millis')
          yield* runtime.settled
        }))
      const request = { _tag: 'Caller', sender, id: 'left' } as const
      yield* sql.withTransaction(store.write(id, {
        created: false,
        entity: null,
        suspension: null,
        keys: [],
        gone: [],
        incarnations: 0,
        handled: 0,
        queued: [{
          _tag: 'Inbound',
          message: { _tag: 'Want', key: 'a', on: false, nonce: 'left' },
          request: Schema.encodeSync(Machine.requestCodec(program))(request),
          keep: null,
        }],
        replies: [],
        ended: [],
        shown: null,
        published: null,
      }, 0))
      expect((yield* store.load(id))?.mailbox.length).toBe(1)
      // Nobody retries: the process that starts next handles the message on its own.
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          yield* Effect.provide(runtime.deploy(program), layer)
          yield* runtime.settled
        }))
      const stored = yield* store.load(id)
      expect({ mailbox: stored?.mailbox, applied: stored?.state.applied }).toEqual({ mailbox: [], applied: ['left'] })
    })))

  for (const point of points) {
    for (const nth of [1, 2, 3, 5, 8]) {
      test(`a crash at ${point}, the ${nth}th time, leaves the entity where the machine leaves it`, () =>
        database(Effect.gen(function*() {
          const { events, observe } = log()
          const at = yield* DateTime.now
          const sql = yield* SqlClient.SqlClient
          const store = storage(program, sql)

          // The entity is created, and its work under way, before the crash: a creation that never commits
          // stores nothing, and there is no entity to compare.
          yield* process({ observe }, (runtime) =>
            Effect.gen(function*() {
              const { layer } = yield* hands()
              const toy = yield* Effect.provide(runtime.deploy(program), layer)
              yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: { _tag: 'Tester' } })
              yield* runtime.settled
            }))
          const since = (yield* store.load(id))?.state.since ?? at

          // A process that dies at the nth time it reaches `point`: the fiber never returns from it, and the
          // scope closing interrupts everything that was running.
          const crashed = yield* Deferred.make<void>()
          let seen = 0
          const dying = process(
            {
              observe,
              // The fiber that reaches the point never returns from it, and the crash interrupts the process:
              // the activation of a deploy is one of the places it may happen.
              at: (reached) =>
                reached !== point || ++seen !== nth
                  ? Effect.void
                  : Effect.flatMap(Deferred.succeed(crashed, undefined), () => Effect.never),
            },
            (runtime) =>
              Effect.gen(function*() {
                const { layer } = yield* hands()
                const toy = yield* Effect.provide(runtime.deploy(program), layer)
                // Four requests at once: the mailbox holds what the crash finds unhandled, and the callers that
                // die with the process are answered by the replies stored for their retries.
                const sends: ReadonlyArray<Inbound> = [
                  { _tag: 'Want', key: 'a', on: true, nonce: 'w1' },
                  { _tag: 'Want', key: 'b', on: false, nonce: 'w2' },
                  { _tag: 'Refuse', nonce: 'w3' },
                  { _tag: 'Want', key: 't', on: true, nonce: 'w4' },
                ]
                yield* running(Effect.forEach(
                  sends.entries(),
                  ([nonce, message]) => toy.send(id, message, { requestId: `r${nonce}`, sender: { _tag: 'Tester' }, keep: 'forever' }),
                  { concurrency: 'unbounded' },
                ))
                // The timer's time comes in this process too, if the process lives that long.
                yield* TestClock.adjust('80 millis')
              }),
          )
          yield* Effect.raceFirst(dying, Deferred.await(crashed))

          // The process that follows the crash activates what was stored, and finishes it.
          yield* process({ observe }, (runtime) =>
            Effect.gen(function*() {
              const { layer } = yield* hands()
              yield* Effect.provide(runtime.deploy(program), layer)
              yield* runtime.settled
              yield* TestClock.adjust('60 millis')
              yield* runtime.settled
            }))

          // The crash happened where the test asked: a point never reached would make the comparison vacuous.
          expect(yield* Deferred.isDone(crashed)).toBe(true)
          // And the time the test moved through was acted on: a timer it passed would be due still.
          expect((yield* store.due(DateTime.toEpochMillis(yield* DateTime.now), [])).ready).toEqual([])
          expect(yield* persisted).toEqual(replayed(since, events))
          expect(
            (yield* store.published('projection', [], all))
              .map(({ kind, message, value }) => ({ kind, message, value })),
          )
            .toEqual(publishedOf(since, events))
        })))
    }
  }
})

/**
 * The same comparison under random sequences of events, with a crash at a point the sequence chooses: whatever
 * the interleaving of the messages, the completions, the timers and the crash, the database ends where the
 * machine ends on the events that committed.
 */

describe('random sequences of events', () => {
  type Command =
    | Readonly<{ _tag: 'Send'; kind: Inbound['_tag']; key: Key; on: boolean }>
    | Readonly<{ _tag: 'Retry'; pick: number }>
    | Readonly<{ _tag: 'Create' }>
    | Readonly<{ _tag: 'Wait' }>
    | Readonly<{ _tag: 'Resume' }>
    | Readonly<{ _tag: 'Discard' }>

  const command: fc.Arbitrary<Command> = fc.oneof(
    {
      weight: 6,
      arbitrary: fc.record({
        _tag: fc.constant('Send' as const),
        kind: fc.constantFrom<Inbound['_tag']>('Want', 'Want', 'Want', 'Refuse', 'Break'),
        key: fc.constantFrom(...keys),
        on: fc.boolean(),
      }),
    },
    { weight: 2, arbitrary: fc.record({ _tag: fc.constant('Retry' as const), pick: fc.nat() }) },
    { weight: 1, arbitrary: fc.constant({ _tag: 'Create' as const }) },
    { weight: 3, arbitrary: fc.constant({ _tag: 'Wait' as const }) },
    { weight: 2, arbitrary: fc.constant({ _tag: 'Resume' as const }) },
    { weight: 1, arbitrary: fc.constant({ _tag: 'Discard' as const }) },
  )

  /**
   * How long an entity with nothing to do stays loaded, or null for a run that keeps it loaded throughout: a
   * passivation is a `Restart` the runtime chose, and the comparison holds across it (decision 0029).
   */
  const passivates = fc.option(fc.integer({ min: 1, max: 20 }), { nil: null })

  /** Where the process dies, if it reaches it: a run without a point is a run with no crash. */
  const crash = fc.option(
    fc.record({
      point: fc.constantFrom<Point>('BeforeCommit', 'AfterCommit', 'AfterReply'),
      nth: fc.integer({ min: 1, max: 12 }),
    }),
    { nil: null },
  )

  const message = (command: Extract<Command, { _tag: 'Send' }>, nonce: string): Inbound =>
    command.kind === 'Want'
      ? { _tag: 'Want', key: command.key, on: command.on, nonce }
      : command.kind === 'Refuse'
      ? { _tag: 'Refuse', nonce }
      : { _tag: 'Break', nonce }

  test('the database ends where the machine ends', () =>
    fc.assert(
      fc.asyncProperty(
        fc.array(command, { maxLength: 14 }),
        crash,
        passivates,
        (commands, dies, millis) =>
          database(Effect.gen(function*() {
            const { events, observe } = log()
            const at = yield* DateTime.now
            const store = storage(program, yield* SqlClient.SqlClient)
            const crashed = yield* Deferred.make<void>()
            let seen = 0
            const passivate = millis === null ? {} : { passivate: { millis } }
            const options: Options & Hooks = {
              observe,
              ...passivate,
              at: (reached) =>
                dies === null || reached !== dies.point || ++seen !== dies.nth
                  ? Effect.void
                  : Effect.flatMap(Deferred.succeed(crashed, undefined), () => Effect.never),
            }

            const driven = process(options, (runtime) =>
              Effect.gen(function*() {
                const { layer } = yield* hands()
                const toy = yield* Effect.provide(runtime.deploy(program), layer)
                const creation = { requestId: 'creation', sender: { _tag: 'Tester' as const } }
                yield* toy.create(id, { flags: { at }, ...creation })
                const sent: Array<Readonly<{ requestId: string; message: Inbound }>> = []
                // The callers that arrive together: they are started at once, at the next command that is no
                // caller's, and each of them is answered or waits by then. A suspended entity answers none of
                // them until it is resumed.
                let arriving: Array<Effect.Effect<unknown>> = []
                const arrive = Effect.suspend(() => {
                  const callers = arriving
                  arriving = []
                  return callers.length === 0
                    ? Effect.void
                    : Effect.asVoid(running(Effect.all(callers.map(Effect.exit), { concurrency: 'unbounded' })))
                })
                for (const [nth, command] of commands.entries()) {
                  switch (command._tag) {
                    case 'Send': {
                      const request = { requestId: `r${nth}`, message: message(command, `n${nth}`) }
                      sent.push(request)
                      arriving.push(
                        toy.send(id, request.message, { requestId: request.requestId, sender: { _tag: 'Tester' }, keep: 'forever' }),
                      )
                      break
                    }
                    case 'Retry': {
                      const request = sent[command.pick % Math.max(1, sent.length)]
                      if (request === undefined) break
                      arriving.push(
                        toy.send(id, request.message, { requestId: request.requestId, sender: { _tag: 'Tester' }, keep: 'forever' }),
                      )
                      break
                    }
                    case 'Create':
                      arriving.push(toy.create(id, { flags: { at }, ...creation }))
                      break
                    case 'Wait':
                      yield* arrive
                      yield* TestClock.adjust('8 millis')
                      break
                    case 'Resume':
                      yield* arrive
                      yield* toy.resume(id)
                      break
                    case 'Discard':
                      yield* arrive
                      yield* toy.discard(id)
                      break
                  }
                }
                yield* arrive
                yield* TestClock.adjust('60 millis')
              }))
            yield* Effect.raceFirst(driven, Deferred.await(crashed))
            const since = (yield* store.load(id))?.state.since ?? at

            // The process that follows takes it from what is stored, and finishes what it finds under way.
            yield* process({ observe, ...passivate }, (runtime) =>
              Effect.gen(function*() {
                const { layer } = yield* hands()
                yield* Effect.provide(runtime.deploy(program), layer)
                yield* runtime.settled
                yield* TestClock.adjust('60 millis')
                yield* runtime.settled
              }))

            // The time the test moved through was acted on: a timer it passed would be due still.
            expect((yield* store.due(DateTime.toEpochMillis(yield* DateTime.now), [])).ready).toEqual([])
            expect(yield* persisted).toEqual(replayed(since, events))
            // A read gives the row, which every event that changed the state wrote again (decision 0121).
            const last = yield* store.load(id)
            expect(yield* store.projected(id)).toEqual(last === null ? null : program.project(last.state))
            expect(
              (yield* store.published('projection', [], all))
                .map(({ kind, message, value }) => ({ kind, message, value })),
            ).toEqual(publishedOf(since, events))
          })),
      ),
      { numRuns: Bun.env['SCHEDULES'] === 'all' ? 500 : 200 },
    ), 60_000)
})

/**
 * The read model: one row per entity, holding what callers read of it and the values of the program's indexes,
 * written in the step's transaction, and a query across them (decision 0032).
 */

test('an entity whose wait runs out as an event arrives waits again from the event, under prioritized schedules', () => {
  // Decision 0116: the wait's end is put in the entity's queue, and one put there just before the event that ended the
  // wait is passed over. Taken for the next wait's end, it would unload the entity as soon as the event is applied,
  // 2 millis after it: an unload no activation follows. The event applied first waits again, and the wait run out
  // first is followed by the message's activation, so either order pairs each unload with an activation. With no end
  // passed over, seed 140, pinned, fails. `bun run test:pins` runs it against that form, the pin `0116` of
  // `src/runtime.test_pins.ts` (decision 0254).
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
          // The wait runs out at 5 millis. An event applied before, at 3, starts it again until 8.
          yield* TestClock.adjust('3 millis')
          yield* opened(window, true)
          yield* together<unknown, unknown, never>([
            toy.send(id, { _tag: 'Want', key: 't', on: true, nonce: 'w' }, { requestId: 'w', sender: tester, keep: 'forever' }),
            Effect.asVoid(TestClock.adjust('2 millis')),
          ])
          yield* opened(window, false)
          yield* runtime.settled
          return entities.length - events.filter((event) => event._tag === 'Restart').length
        }))
    }), 0, { open: false, pinned: [140] })
}, 60_000)

test('a message that arrives as the wait of its entity runs out is handled, under prioritized schedules', () => {
  // Decision 0116: an entity's wait ends with an item of its queue, and nothing races its take. At Effect 4.1.2 a take
  // raced against a timeout lost the event when the racing fiber was preempted at the third step after its resumption,
  // and its caller waited for ever. Effect 4.1.3 interrupts a race's losers as the race settles, and the wait written
  // as `Effect.timeoutOption` of the take lost nothing on 2026-11-10, over 284 rounds of `bun run test:explore`. So no
  // seed is pinned. A release that loses the item again, as `spikes/effect-queue-take-timeout-scheduled.test.ts`
  // would see, needs a seed found again against that form, which `bun run test:explore` found in a round or two.
  explored((window) =>
    Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      return yield* process({ passivate: { millis: 5 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(timed), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          yield* runtime.settled
          // The message and the move that runs the wait out, at once. The window stays open across the move, where
          // `adjusted` closes it: the race explored is the move's own, between the timeout it fires and the take.
          yield* opened(window, true)
          const [reply] = yield* together<unknown, unknown, never>([
            toy.send(id, { _tag: 'Want', key: 't', on: true, nonce: 'w' }, { requestId: 'w', sender: tester, keep: 'forever' }),
            Effect.asVoid(TestClock.adjust('5 millis')),
          ])
          yield* opened(window, false)
          yield* runtime.settled
          return reply
        }))
    }), { _tag: 'Accepted' }, { open: false })
}, 60_000)

test('settled never returns between a crash and the activation its due timer brings, under prioritized schedules', () => {
  // Decisions 0029 and 0068: the process is not settled while a stored timer of an entity it does not hold is due. A
  // crash makes its entity leave without counting it as unloading, so it leaves and pokes the waker in one step. A
  // `settled` that looked between two steps would find the entity neither held nor known to the waker, with its timer
  // due. The message's commit waits at a gate while the timer comes due, then dies once the window is open. A leave
  // split in two steps, the entity taken out of the process in one and the waker poked in the next, returns early at
  // seed 44, pinned. `bun run test:pins` runs it against that form, the pin `0068` of `src/runtime.test_pins.ts`
  // (decision 0254).
  explored((window) =>
    Effect.gen(function*() {
      const { layer } = yield* hands()
      const gate = yield* Deferred.make<void>()
      let crashed = false
      let restarted = false
      return yield* process({
        at: (point, _entity, event) =>
          point === 'BeforeCommit' && received(event) === 'r-1' && !crashed
            ? Effect.andThen(Deferred.await(gate), Effect.suspend(() => {
              crashed = true
              return Effect.die('the runtime failed')
            }))
            : Effect.void,
        observe: (_entity, event) =>
          Effect.sync(() => {
            if (crashed && event._tag === 'Restart') restarted = true
          }),
      }, (runtime) =>
        Effect.gen(function*() {
          const at = yield* DateTime.now
          const toy = yield* Effect.provide(runtime.deploy(timed), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          yield* runtime.settled
          const sent = yield* Effect.forkChild(Effect.exit(toy.send(id, { _tag: 'Want', key: 't', on: true, nonce: 'n-1' }, { requestId: 'r-1', sender: tester, keep: 'forever' })))
          // The timer rings at 40 millis, while the message waits at the gate: its firing waits behind the message.
          yield* adjusted(window, '40 millis')
          yield* opened(window, true)
          const [, early] = yield* together<boolean | void, never, never>([
            Deferred.succeed(gate, undefined),
            Effect.andThen(runtime.settled, Effect.sync(() => crashed && !restarted)),
          ])
          yield* opened(window, false)
          yield* Fiber.join(sent)
          yield* runtime.settled
          return { early, restarted }
        }))
    }), { early: false, restarted: true }, { open: false, pinned: [44] })
}, 60_000)

describe('what the runtime tells a tracer (decision 0220)', () => {
  const event = (span: Tracer.NativeSpan) => span.attributes.get('tea.event')
  const linked = (span: Tracer.NativeSpan) => span.links.map((link) => link.span)

  test('each step is a root span of its entity and its event, and the step of a request links its caller’s span', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const { spans, tracer } = tracing()
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          yield* runtime.settled
          const want = { _tag: 'Want', key: 'a', on: true, nonce: 'w' } as const
          yield* Effect.withSpan(toy.send(id, want, { requestId: 'want', sender: tester, keep: 'forever' }), 'caller')
          yield* runtime.settled
          // A message a suspended entity answers `Suspended` links its caller's span all the same.
          yield* toy.send(id, { _tag: 'Break', nonce: 'b' }, { requestId: 'break', sender: tester, keep: 'forever' })
          const again = { _tag: 'Want', key: 'a', on: false, nonce: 'v' } as const
          const queued = { requestId: 'queued', sender: tester, keep: 'forever' as const }
          expect(yield* Effect.withSpan(toy.send(id, again, queued), 'queued')).toEqual({ _tag: 'Suspended' })
        })).pipe(Effect.provideService(Tracer.Tracer, tracer))
      const caller = spans.find((span) => span.name === 'caller')!
      const queued = spans.find((span) => span.name === 'queued')!
      const steps = spans.filter((span) => span.name === 'tea.step')
      expect(steps.every((span) => span.parent._tag === 'None' && span.status._tag === 'Ended')).toBe(true)
      expect(steps.every((span) => span.attributes.get('tea.entity.name') === 'Toy')).toBe(true)
      expect(steps.every((span) => span.attributes.get('tea.entity.id') === id)).toBe(true)
      expect(event(steps[0]!)).toBe('Create')
      // Each message is received, and handled with an empty mailbox, in a step that links its caller's span. No
      // other step links any.
      const requested = steps.filter((span) => span.links.length > 0)
      expect(requested.map(event)).toEqual(['Receive', 'Receive'])
      expect(requested.map(linked)).toEqual([[caller], [queued]])
      // A completion names the work it completes, by its key and its incarnation, as the operation's span does.
      const completed = steps.find((span) => event(span) === 'Complete' && span.attributes.get('tea.key') === 'b')
      const b = spans.find((span) => span.name === 'tea.operation' && span.attributes.get('tea.key') === 'b')
      expect(completed?.attributes.get('tea.incarnation')).toBeNumber()
      expect(completed?.attributes.get('tea.incarnation')).toBe(b?.attributes.get('tea.incarnation'))
      // The caller's message starts the operation of `a` again, and its step says so.
      expect(requested[0]?.attributes.get('tea.outputs')).toContain('Started')
    })))

  test('an operation is a root span of its work, linked to the step that started it', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const { spans, tracer } = tracing()
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          yield* runtime.settled
        })).pipe(Effect.provideService(Tracer.Tracer, tracer))
      const creation = spans.find((span) => span.name === 'tea.step' && event(span) === 'Create')!
      const operations = spans.filter((span) => span.name === 'tea.operation')
      expect(operations.map((span) => span.attributes.get('tea.operation'))).toEqual(['A', 'B', 'C'])
      expect(operations.map((span) => span.attributes.get('tea.delivery'))).toEqual([
        'Idempotent',
        'AtMostOnce',
        'AtLeastOnce',
      ])
      expect(operations.every((span) => span.parent._tag === 'None' && span.status._tag === 'Ended')).toBe(true)
      expect(operations.map(linked)).toEqual([[creation], [creation], [creation]])
    })))

  test('the loop of an entity a caller created runs outside the span of its creation', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const { spans, tracer } = tracing()
      const at = yield* DateTime.now
      // The loop unloads the entity outside any step: the span it runs under there is the loop's own.
      const under: Array<Tracer.AnySpan | null> = []
      const unloaded = () =>
        Effect.map(Effect.orElseSucceed(Effect.currentParentSpan, () => null), (span) => void under.push(span))
      yield* process({ unloaded, passivate: { millis: 5 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* Effect.withSpan(toy.create(id, { flags: { at }, requestId: 'creation', sender: tester }), 'caller')
          yield* runtime.settled
          yield* TestClock.adjust('5 millis')
        })).pipe(Effect.provideService(Tracer.Tracer, tracer))
      const creation = spans.find((span) => span.name === 'tea.step' && event(span) === 'Create')!
      expect(under).toHaveLength(1)
      expect(under[0]).not.toBe(creation)
    })))

  test('a step that suspends its entity says where and is counted, and the mailbox and operations are metrics', () =>
    database(Effect.gen(function*() {
      // The operations act once the test opens the gate, so that the test sees them running.
      const gate = yield* Deferred.make<void>()
      const acting = yield* Deferred.make<void>()
      let acts = 0
      const layer = Layer.succeed(Hands, Hands.of({
        act: () =>
          Effect.andThen(
            Effect.sync(() => ++acts === 3 && Deferred.doneUnsafe(acting, Effect.void)),
            Deferred.await(gate),
          ),
      }))
      const { spans, tracer } = tracing()
      const registry = new Map()
      const at = yield* DateTime.now
      const metrics = Effect.provideService(Metric.snapshot, Metric.MetricRegistry, registry)
      const value = (snapshots: ReadonlyArray<Metric.Metric.Snapshot>, name: string) =>
        snapshots.find((snapshot) => snapshot.id === name && snapshot.attributes?.['tea.entity.name'] === 'Toy')?.state
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          // A retry of the creation is a step that writes nothing, and records no length of the mailbox.
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          yield* Deferred.await(acting)
          expect(value(yield* metrics, 'tea.operations.running')).toEqual({ value: 3 })
          const breaking = { requestId: 'break', sender: tester, keep: 'forever' as const }
          expect(yield* toy.send(id, { _tag: 'Break', nonce: 'b' }, breaking)).toEqual({ _tag: 'Suspended' })
          yield* Deferred.succeed(gate, undefined)
          yield* runtime.settled
          expect(value(yield* metrics, 'tea.operations.running')).toEqual({ value: 0 })
        })).pipe(Effect.provideService(Tracer.Tracer, tracer), Effect.provideService(Metric.MetricRegistry, registry))
      const suspending = spans.filter((span) => span.attributes.get('tea.suspended') === true)
      expect(suspending.map(event)).toEqual(['Receive'])
      expect(suspending[0]?.attributes.get('tea.suspension.on')).toBe('Message')
      const snapshots = yield* metrics
      expect(value(snapshots, 'tea.suspensions')).toMatchObject({ count: 1 })
      // The creation wrote an empty mailbox, the message the entity died on a mailbox of one, and each of the three
      // completions recorded behind it one more.
      expect(value(snapshots, 'tea.mailbox.length')).toMatchObject({ count: 5, min: 0, max: 4, sum: 10 })
    })))
})

test('an entity a failed write crashes runs its operation again with no caller coming', () =>
  database(Effect.gen(function*() {
    // A crash of the entity alone (decision 0042) unloads it with its operation stored and its fiber stopped, and no
    // timer is stored. The waker reads timers alone (decision 0029), so the crash marks the entity, and the waker
    // activates it again after `retry` (decision 0252).
    const { acted, layer } = yield* hands({ holds: true })
    const working: Program<T> = {
      ...program,
      name: 'Working',
      init: (_flags, at) => ({ want: ['c'], applied: [], since: at, rings: at }),
    }
    let dies = true
    yield* process({
      // The message's write fails once, as a database that refused it.
      at: (point, _entity, event) =>
        point === 'BeforeCommit' && received(event) === 'r-1' && dies
          ? Effect.suspend(() => {
            dies = false
            return Effect.die('the runtime failed')
          })
          : Effect.void,
    }, (runtime) =>
      Effect.gen(function*() {
        const at = yield* DateTime.now
        const toy = yield* Effect.provide(runtime.deploy(working), layer)
        yield* ran(toy.create(id, { flags: { at }, requestId: 'creation', sender: tester }))
        // The at-least-once operation under `c` has acted, and holds.
        expect(acted).toEqual(['c'])
        const sent = yield* ran(Effect.exit(
          toy.send(id, { _tag: 'Want', key: 'c', on: true, nonce: 'n-1' }, { requestId: 'r-1', sender: tester, keep: 'forever' }),
        ))
        expect(Exit.isFailure(sent)).toBe(true)
        // The entity crashed and left, and its operation was stopped: the process is settled, with work stored.
        yield* runtime.settled
        // The operation run again holds for ever, so the process is never settled again: the test waits for its act.
        yield* TestClock.adjust('1 hour')
        yield* Effect.repeat(Effect.yieldNow, { until: () => acted.length === 2, times: 10_000 })
        expect(acted).toEqual(['c', 'c'])
      }))
  })))
