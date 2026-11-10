/**
 * What decision 0116 rests on, at `effect` 4.1.3, under Effect's own scheduler: a race of a take alone loses no item
 * offered as the other side wins, under any budget of steps of the racing fiber. At 4.1.2 it lost the item under a
 * budget of 3 (Effect-TS/effect#10365): the racing fiber interrupted the loser only once it was resumed, and under that
 * budget it yielded first, so the take's fiber, woken by the offer, took the item and its end was not the race's. 4.1.3
 * interrupts the losers as the race settles (`interruptRaceLosers` in `internal/effect.ts`, read in the source, from
 * Effect-TS/effect#10367). The JSDoc of `raceFirst` and `timeoutOption` does not promise it, so an entity's wait still
 * races nothing against its take.
 */
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Latch from 'effect/Latch'
import * as Queue from 'effect/Queue'
import * as Scheduler from 'effect/Scheduler'

/**
 * Where the item is once the race has ended: taken by the race, still in the queue, or nowhere. The other side ends
 * and the item is offered in one synchronous step, the narrowest window there is. `racer` is the budget of the racing
 * fiber, and `sides` the budget of the two sides.
 */
const race = (racer: number, sides: number, before: number) =>
  Effect.gen(function*() {
    const queue = yield* Queue.unbounded<number>()
    const latch = yield* Latch.make()
    const side = <A>(effect: Effect.Effect<A>) => Effect.provideService(effect, Scheduler.MaxOpsBeforeYield, sides)
    const racing = Effect.raceFirst(side(Effect.asSome(Queue.take(queue))), side(Effect.as(latch.await, null)))
    const wait = yield* Effect.forkChild(Effect.provideService(racing, Scheduler.MaxOpsBeforeYield, racer))
    yield* Effect.replicateEffect(Effect.yieldNow, before, { discard: true })
    yield* Effect.sync(() => {
      latch.openUnsafe()
      Queue.offerUnsafe(queue, 1)
    })
    const taken = yield* Fiber.join(wait)
    return taken !== null ? 'taken' : (yield* Queue.size(queue)) === 1 ? 'left' : 'lost'
  })

const ends = async (racers: ReadonlyArray<number>) => {
  const seen = new Set<string>()
  for (const racer of racers) {
    for (const sides of [3, 4, 2048]) {
      for (let before = 0; before < 6; before++) seen.add(await Effect.runPromise(race(racer, sides, before)))
    }
  }
  return [...seen].sort()
}

test('a race of a take loses no item when the racing fiber has a budget above 3', async () => {
  expect(await ends([4, 5, 8, 2048])).toEqual(['left', 'taken'])
})

test('a race of a take loses no item when the racing fiber has a budget of 3', async () => {
  // Failing here means a release loses the item again, as 4.1.2 did: decision 0116 keeps the wait from racing its take.
  expect(await ends([3])).toEqual(['left', 'taken'])
})
