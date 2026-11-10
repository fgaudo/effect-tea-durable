/**
 * What decision 0068 says of a fork, at `effect` 4.1.3: a fiber yields to the others once it has run as many steps
 * as `Scheduler.MaxOpsBeforeYield` gives it, 2048 by default (documented in `Scheduler.ts`), wherever that count
 * falls. So a fiber forked by `forkIn` may run to its end, finalizers included, before the step that forked it
 * goes on: under some budgets it has, and under the default it has not.
 */
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import * as Scheduler from 'effect/Scheduler'

/**
 * Whether the fiber forked after `steps` steps had run its finalizer by the time the generator that forked
 * it went on, in the same synchronous step as `forkHeld` reads it.
 */
const endedFirst = (budget: number, steps: number) =>
  Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const scope = yield* Effect.scope
    yield* Effect.replicateEffect(Effect.void, steps, { discard: true })
    let finalized = false
    yield* Effect.forkIn(Effect.ensuring(Effect.void, Effect.sync(() => (finalized = true))), scope)
    return finalized
  })).pipe(Effect.provideService(Scheduler.MaxOpsBeforeYield, budget)))

test('a forked fiber may end before its forker goes on, where the budget falls between the two', async () => {
  const ended: Array<string> = []
  for (let budget = 3; budget <= 20; budget++) {
    for (let steps = 0; steps < 20; steps++) if (await endedFirst(budget, steps)) ended.push(`${budget}/${steps}`)
  }
  // Under 5 steps a turn is too short for the forked fiber to end in it.
  expect(ended).toContain('5/0')
  expect(ended.length).toBeGreaterThan(20)
  for (let steps = 0; steps < 20; steps++) expect(await endedFirst(2048, steps)).toBe(false)
})

test('the default budget is 2048 steps', () =>
  Effect.runPromise(Effect.gen(function*() {
    expect(yield* Scheduler.MaxOpsBeforeYield).toBe(2048)
  })))
