/**
 * What decision 0274 says of a wait that a crash ends, at `effect` 4.1.3. A race run inside an uninterruptible region,
 * or in the finalizer of a fiber that is interrupted, ends once its first side ends, and interrupts the other side:
 * so an operation's `send` that waits in a region the crash cannot interrupt is ended by a signal of the crash.
 */
import { expect, test } from 'bun:test'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'

test('a race inside an uninterruptible region ends at its first side, and interrupts the other', () =>
  Effect.runPromise(Effect.gen(function*() {
    const signal = yield* Deferred.make<void>()
    const lost: Array<string> = []
    const loser = Effect.never.pipe(Effect.onInterrupt(() => Effect.sync(() => void lost.push('interrupted'))))
    const fiber = yield* Effect.forkChild(
      Effect.uninterruptible(Effect.raceFirst(Effect.as(loser, 'loser'), Effect.as(Deferred.await(signal), 'signal'))),
    )
    yield* Effect.yieldNow
    yield* Deferred.succeed(signal, undefined)
    expect(yield* Fiber.join(fiber)).toBe('signal')
    expect(lost).toEqual(['interrupted'])
  })))

test('a race in the finalizer of an interrupted fiber ends at its first side, and the finalizer goes on', () =>
  Effect.runPromise(Effect.gen(function*() {
    const signal = yield* Deferred.make<void>()
    const inside = yield* Deferred.make<void>()
    const steps: Array<string> = []
    const fiber = yield* Effect.forkChild(Effect.never.pipe(Effect.onInterrupt(() =>
      Effect.gen(function*() {
        yield* Deferred.succeed(inside, undefined)
        const won = yield* Effect.raceFirst(
          Effect.as(Effect.never, 'loser'),
          Effect.as(Deferred.await(signal), 'signal'),
        )
        steps.push(won)
        steps.push('ended')
      })
    )))
    yield* Effect.yieldNow
    const interrupting = yield* Effect.forkChild(Fiber.interrupt(fiber))
    yield* Deferred.await(inside)
    expect(steps).toEqual([])
    yield* Deferred.succeed(signal, undefined)
    yield* Fiber.join(interrupting)
    expect(steps).toEqual(['signal', 'ended'])
    expect(Exit.hasInterrupts(yield* Fiber.await(fiber))).toBe(true)
  })))
