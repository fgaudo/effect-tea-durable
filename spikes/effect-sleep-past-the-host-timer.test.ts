/**
 * What decision 0194 says of a sleep longer than a host's timer, at `effect` 4.1.3 on Bun: Bun's `setTimeout` fires
 * a delay past 2^31 − 1 milliseconds at once, and `Effect.sleep` on the default clock sets such a sleep as timers of
 * at most that length, one after the other, so that it ends at its time. An interruption clears the timer pending.
 * The runtime's timers sleep as `Effect.sleep(\`${millis} millis\`)`, and the spike sleeps in that form.
 */
import { afterEach, expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'

const limit = 2 ** 31 - 1

test('a delay past 2^31 − 1 milliseconds is fired at once by the host', async () => {
  const started = performance.now()
  const elapsed = await new Promise<number>((resolve) => {
    setTimeout(() => resolve(performance.now() - started), limit + 1)
  })
  // Bun sets such a delay to one millisecond, with a `TimeoutOverflowWarning`, as Node does.
  expect(elapsed).toBeLessThan(1_000)
})

// The host's timers stand in for the long ones alone: the scheduler of Effect sets short timers of its own, which
// run as they are.
type Pending = { readonly delay: number; readonly fire: () => void; cleared: boolean }
const original = { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout }
const longTimers: Array<Pending> = []
const stub = () => {
  globalThis.setTimeout = ((handler: () => void, delay?: number, ...args: Array<unknown>) => {
    if ((delay ?? 0) < 2 ** 30) return original.setTimeout(handler, delay, ...args)
    const pending: Pending = { delay: delay!, fire: handler, cleared: false }
    longTimers.push(pending)
    return pending
  }) as typeof setTimeout
  globalThis.clearTimeout = ((handle: unknown) => {
    const pending = longTimers.find((timer) => timer === handle)
    if (pending === undefined) original.clearTimeout(handle as ReturnType<typeof setTimeout>)
    else pending.cleared = true
  }) as typeof clearTimeout
}
afterEach(() => {
  globalThis.setTimeout = original.setTimeout
  globalThis.clearTimeout = original.clearTimeout
  longTimers.length = 0
})
const turns = () => new Promise((resolve) => original.setTimeout(resolve, 5))

test('a sleep of two host timers and five milliseconds is set as timers of 2^31 − 1, one after the other', async () => {
  stub()
  const fiber = Effect.runFork(Effect.sleep(`${2 * limit + 5} millis`))
  await turns()
  expect(longTimers.map((timer) => timer.delay)).toEqual([limit])
  longTimers[0]!.fire()
  await turns()
  // The second piece is set once the first has fired, and the sleep has not ended.
  expect(longTimers.map((timer) => timer.delay)).toEqual([limit, limit])
  expect(fiber.pollUnsafe()).toBeUndefined()
  longTimers[1]!.fire()
  // The five milliseconds left are a timer of the host's own, and the sleep ends after it.
  await Fiber.join(fiber).pipe(Effect.runPromise)
  expect(longTimers).toHaveLength(2)
})

test('an interrupted sleep clears the piece pending', async () => {
  stub()
  const fiber = Effect.runFork(Effect.sleep(`${2 * limit} millis`))
  await turns()
  longTimers[0]!.fire()
  await turns()
  await Fiber.interrupt(fiber).pipe(Effect.runPromise)
  // The first piece is cleared too, since the sleep that set it is still running the second: a timer that has
  // fired is cleared to no effect.
  expect(longTimers.map((timer) => timer.cleared)).toEqual([true, true])
})
