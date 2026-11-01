/**
 * What decision 0103 says of a clock provided over the test clock, at `effect` 4.1.1: `DateTime.now` reads the `Clock`
 * the fiber is given, so a clock that adds to the test clock's time moves the wall clock, in one step, without waking
 * a sleep; a sleep it hands to the test clock wakes when the test clock's time comes, and not before. And
 * `TestClock.adjust` finds the test clock through the same `Clock`: under another one it fails, and it is called with
 * the test clock given back.
 */
import { expect, test } from 'bun:test'
import * as Clock from 'effect/Clock'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import { TestClock } from 'effect/testing'

test('a clock ahead of the test clock moves what DateTime reads, and leaves the sleeps to the test clock', () =>
  Effect.runPromise(Effect.gen(function*() {
    const testClock = yield* Effect.service(Clock.Clock)
    const by = { millis: 0 }
    // A clock of its own, as the runtime's tests build it, and no copy of the test clock's fields.
    const ahead: Clock.Clock = {
      currentTimeMillisUnsafe: () => testClock.currentTimeMillisUnsafe() + by.millis,
      currentTimeMillis: Effect.sync(() => testClock.currentTimeMillisUnsafe() + by.millis),
      currentTimeNanosUnsafe: () => testClock.currentTimeNanosUnsafe() + BigInt(by.millis) * 1_000_000n,
      currentTimeNanos: Effect.sync(() => testClock.currentTimeNanosUnsafe() + BigInt(by.millis) * 1_000_000n),
      monotonicTimeNanosUnsafe: () => testClock.monotonicTimeNanosUnsafe(),
      monotonicTimeNanos: testClock.monotonicTimeNanos,
      sleep: (duration) => testClock.sleep(duration),
    }
    yield* Effect.provideService(
      Effect.gen(function*() {
        const sleeper = yield* Effect.forkChild(Effect.sleep('10 millis'))
        yield* Effect.yieldNow
        by.millis = 50
        expect(DateTime.toEpochMillis(yield* DateTime.now)).toBe(50)
        // The wall clock is past the sleep's time, and the sleep has not woken: only the test clock wakes it.
        yield* Effect.replicateEffect(Effect.yieldNow, 20, { discard: true })
        expect(sleeper.pollUnsafe()).toBeUndefined()
        // `adjust` reads the clock it is given, which is not the test clock here.
        expect((yield* Effect.exit(TestClock.adjust('10 millis')))._tag).toBe('Failure')
        yield* Effect.provideService(TestClock.adjust('10 millis'), Clock.Clock, testClock)
        yield* Fiber.join(sleeper)
        expect(DateTime.toEpochMillis(yield* DateTime.now)).toBe(60)
      }),
      Clock.Clock,
      ahead,
    )
  }).pipe(Effect.provide(TestClock.layer()))))
