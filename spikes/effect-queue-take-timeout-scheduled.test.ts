/**
 * What decision 0111 rests on, at `effect` 4.1.2, under the scheduler of the tests: a timeout of a take alone can
 * lose the item offered as it fires. `timeoutOption` races the take and a sleep, each in a fiber of its own, and the
 * race interrupts the loser only once the racing fiber runs again (`timeoutOption`, `raceAllFirst` and
 * `onExitUnsafe` in `internal/effect.ts`, read in the source). The sleep's fiber ends first, and decides the race. The
 * take's fiber, woken by the offer, runs before the racing fiber does, and takes the item. Its end is not the race's,
 * and the item is in no place.
 *
 * The orders are those of `inline` resumptions, which Effect's scheduler gives, with the preemptions its budget of
 * steps gives (decision 0104). `spikes/effect-queue-take-timeout.test.ts` runs the race under Effect's own scheduler,
 * where no fiber reaches its budget, and sees no loss.
 */
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Queue from 'effect/Queue'
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

test('a take a timeout interrupts can lose the item offered as the timeout fires', () => {
  const ends = new Set<string>()
  prioritizedSchedules(race, { runs: 5000, depth: 3, resumptions: 'inline' }, (exit) => {
    expect(Exit.isSuccess(exit)).toBe(true)
    if (Exit.isSuccess(exit)) ends.add(exit.value)
  })
  // The two ends decision 0111 allows are reached, and so is the one it rules out.
  expect([...ends].sort()).toEqual(['left', 'lost', 'taken'])
})
