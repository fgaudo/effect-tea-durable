/**
 * What decision 0111 rests on, at `effect` 4.1.2: a timeout of a take alone loses the item offered as it fires only
 * under a scheduler that makes a fiber yield as it is resumed. Effect's own scheduler never does.
 *
 * `timeoutOption` races the take and a sleep, each in a fiber of its own, and the racing fiber interrupts the loser
 * once it is resumed (`timeoutOption`, `raceAllFirst` and `onExitUnsafe` in `internal/effect.ts`, read in the source).
 * Under the scheduler of the tests, the sleep's fiber ends first and decides the race. The racing fiber is preempted
 * as it is resumed, and the take's fiber, woken by the offer, runs before it and takes the item. Its end is not the
 * race's, and the item is in no place.
 *
 * Effect's scheduler starts the count of a fiber's steps again at every run (`runLoop` in `internal/effect.ts`, read
 * in the source), so a fiber resumed takes at least its budget of steps less one before it yields. Under a budget of
 * 2 or less no fiber gets on: under 3 and above, the racing fiber interrupts the take first, and the item stays in
 * the queue. The preemptions of the scheduler of the tests come at any step, so a test reaches this order where Effect
 * does not.
 */
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Latch from 'effect/Latch'
import * as Queue from 'effect/Queue'
import * as Scheduler from 'effect/Scheduler'
import { TestClock } from 'effect/testing'
import { prioritizedSchedules } from '../src/testing.ts'

/** Where the item offered is once the race has ended: taken by the wait, still in the queue, or nowhere. */
const race = Effect.gen(function*() {
  const queue = yield* Queue.unbounded<number>()
  const wait = yield* Effect.forkChild(Effect.timeoutOption(Queue.take(queue), '5 millis'))
  // The wait's race forks the take and the sleep, which start before the offer and the move.
  yield* Effect.replicateEffect(Effect.yieldNow, 5, { discard: true })
  // The offer and the move that fires the timeout, each in a fiber of its own.
  const offer = yield* Effect.forkChild(Queue.offer(queue, 1))
  const move = yield* Effect.forkChild(TestClock.adjust('5 millis'))
  yield* Fiber.join(offer)
  yield* Fiber.join(move)
  const taken = yield* Fiber.join(wait)
  const left = yield* Queue.size(queue)
  return taken._tag === 'Some' ? 'taken' : left === 1 ? 'left' : 'lost'
}).pipe(Effect.provide(TestClock.layer()))

test('under the scheduler of Effect a race of a take loses no item, at any budget of steps that runs', async () => {
  // The other side of the race ends and the item is offered in one synchronous step: the narrowest window there is.
  const latched = (budget: number, before: number) =>
    Effect.gen(function*() {
      const queue = yield* Queue.unbounded<number>()
      const latch = yield* Latch.make()
      const wait = yield* Effect.forkChild(Effect.raceFirst(Effect.asSome(Queue.take(queue)), Effect.as(latch.await, null)))
      yield* Effect.replicateEffect(Effect.yieldNow, before, { discard: true })
      yield* Effect.sync(() => {
        latch.openUnsafe()
        Queue.offerUnsafe(queue, 1)
      })
      const taken = yield* Fiber.join(wait)
      return taken !== null ? 'taken' : (yield* Queue.size(queue)) === 1 ? 'left' : 'lost'
    }).pipe(Effect.provideService(Scheduler.MaxOpsBeforeYield, budget))
  const ends = new Set<string>()
  for (const budget of [3, 4, 5, 6, 8, 16, 2048]) {
    for (let before = 0; before < 6; before++) ends.add(await Effect.runPromise(latched(budget, before)))
  }
  expect(ends.has('lost')).toBe(false)
  expect(ends.has('left')).toBe(true)
})

test('a scheduler that preempts a fiber as it is resumed makes a take a timeout interrupts lose its item', () => {
  const ends = new Set<string>()
  prioritizedSchedules(race, { runs: 5000, depth: 3, resumptions: 'inline' }, (exit) => {
    expect(Exit.isSuccess(exit)).toBe(true)
    if (Exit.isSuccess(exit)) ends.add(exit.value)
  })
  // The two ends decision 0111 allows are reached, and so is the one it rules out.
  expect([...ends].sort()).toEqual(['left', 'lost', 'taken'])
})
