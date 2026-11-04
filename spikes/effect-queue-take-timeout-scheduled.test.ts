/**
 * What decision 0116 rests on, at `effect` 4.1.2, under Effect's own scheduler: a race of a take alone loses the item
 * offered as the other side wins, when the racing fiber's budget of steps is 3. Under the default budget, and under
 * any budget above 3, it loses nothing.
 *
 * `raceFirst` races its sides in fibers of their own, and `timeoutOption` is a `raceFirst` of the effect and a sleep.
 * The racing fiber interrupts the loser once it is resumed, a few steps into its run (`raceAllFirst` and
 * `onExitUnsafe` in `internal/effect.ts`, read in the source). Effect counts a fiber's steps from 0 at every run, and
 * yields once the count reaches the budget (`runLoop` in `internal/effect.ts`). Under a budget of 3 the racing fiber
 * yields before it interrupts the take. The take's fiber, woken by the offer, runs first and takes the item. Its end
 * is not the race's, and the item is in no place. The budget is a `Context.Reference`, so a fiber can have one of its
 * own.
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

test('a race of a take loses the item when the racing fiber has a budget of 3', async () => {
  expect(await ends([3])).toContain('lost')
})
