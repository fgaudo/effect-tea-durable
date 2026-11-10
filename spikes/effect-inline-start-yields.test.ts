/**
 * What decision 0117 asks of `effect` 4.1.3: that a fiber started inline, on its parent's stack, can yield there and
 * give its parent back before its own run goes on. Effect starts a child inline under `startImmediately`, which
 * `raceFirst`, `timeoutOption` and the concurrent `forEach` use (`forkUnsafe` in `internal/effect.ts`, read in the
 * source). Its scheduler yields a fiber at the first step its count of steps reaches the budget,
 * `Scheduler.MaxOpsBeforeYield`, whether or not another task is ready (`MixedScheduler.shouldYield` in
 * `Scheduler.ts`). The child's yield ends its part of the parent's step, and the parent goes on unless its own count
 * has reached the budget too.
 */
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Scheduler from 'effect/Scheduler'

/** A child started inline that logs four steps, and its parent that logs one once the child gives it back. */
const body = Effect.gen(function*() {
  const log: Array<string> = []
  const step = (name: string) => Effect.sync(() => log.push(name))
  const child = yield* Effect.forkChild(
    Effect.gen(function*() {
      yield* step('c1')
      yield* step('c2')
      yield* step('c3')
      yield* step('c4')
    }),
    { startImmediately: true },
  )
  log.push('p')
  yield* Fiber.join(child)
  return log.join(' ')
})

test('a child started inline that yields gives its parent back, under the budget of Effect', async () => {
  const under = (budget: number) => Effect.runPromise(Effect.provideService(body, Scheduler.MaxOpsBeforeYield, budget))
  // The default budget runs the child to its end first.
  expect(await Effect.runPromise(body)).toBe('c1 c2 c3 c4 p')
  // A budget the child reaches while its parent's count is still below it lets the parent go on before the child ends.
  // Under the others the child runs to its end before its parent goes on.
  const ends = []
  for (const budget of [3, 4, 5, 6, 7, 8]) ends.push(await under(budget))
  expect(ends).toEqual([
    'c1 p c2 c3 c4',
    'c1 p c2 c3 c4',
    'c1 c2 c3 c4 p',
    'c1 c2 c3 p c4',
    'c1 c2 c3 c4 p',
    'c1 c2 c3 c4 p',
  ])
})
