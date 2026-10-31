/**
 * What decision 0029 says of an entity's wait, at `effect` 4.1.1: a take from a queue that a timeout interrupts
 * takes nothing, so an event offered as the wait runs out is either the take's or still in the queue, never lost.
 * An entity is unloaded when its wait runs out, and the unload finds the event in the queue.
 */
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Queue from 'effect/Queue'

test('a take a timeout interrupts loses no item offered as it runs out', () =>
  Effect.runPromise(Effect.gen(function*() {
    let taken = 0
    let left = 0
    for (let round = 0; round < 2000; round++) {
      const queue = yield* Queue.unbounded<number>()
      // The offer lands after a number of yields that moves it across the instant the timeout fires.
      const yields = Effect.replicateEffect(Effect.yieldNow, round % 40, { discard: true })
      const offer = yield* Effect.forkChild(Effect.andThen(yields, Queue.offer(queue, round)))
      const result = yield* Effect.timeoutOption(Queue.take(queue), `${round % 3} millis`)
      yield* Fiber.join(offer)
      const size = yield* Queue.size(queue)
      // Whichever won the race, the item is in one place and one only.
      expect((result._tag === 'Some' ? 1 : 0) + size).toBe(1)
      if (result._tag === 'Some') taken++
      else left++
    }
    // The race was run both ways: the take won some rounds, the timeout others.
    expect(taken).toBeGreaterThan(0)
    expect(left).toBeGreaterThan(0)
  })))
