/**
 * What decision 0066 says of `TestClock`, at `effect` 4.1.1, provided by its `layer` as the runtime's tests provide
 * it: the clock starts at 0, and `DateTime.now`, `Effect.sleep` and `Effect.timeoutOption` read it; `adjust` wakes
 * the sleeps due in the order of their times, and after each one waits until every fiber it woke, and every fiber
 * those set going, waits again, under any budget of steps. What it gives a fiber forked before it is one turn, of as
 * many steps as `Scheduler.MaxOpsBeforeYield` gives: one that has not reached its sleep by then sleeps from the time
 * the clock was moved to, and misses the move (decision 0101).
 */
import { expect, test } from 'bun:test'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Scheduler from 'effect/Scheduler'
import { TestClock } from 'effect/testing'

const yields = (count: number) => Effect.replicateEffect(Effect.yieldNow, count, { discard: true })
const steps = (count: number) => Effect.replicateEffect(Effect.void, count, { discard: true })

const clocked = <A>(body: Effect.Effect<A>) => Effect.runPromise(Effect.provide(body, TestClock.layer()))

/** A fiber forked before `adjust`, which does `work` and then sleeps until 10: whether that `adjust` wakes it. */
const forkedBefore = (work: Effect.Effect<void>, budget = 2048) =>
  clocked(Effect.gen(function*() {
    let rang = false
    yield* Effect.forkChild(Effect.andThen(work, Effect.andThen(Effect.sleep('10 millis'), Effect.sync(() => {
      rang = true
    }))))
    yield* TestClock.adjust('10 millis')
    const woken = rang
    // One that missed it reaches its sleep once it is given turns, from the time the clock was moved to, and is due
    // 10 milliseconds after that.
    yield* yields(100)
    yield* TestClock.adjust('10 millis')
    expect(rang).toBe(true)
    return woken
  }).pipe(Effect.provideService(Scheduler.MaxOpsBeforeYield, budget)))

test('the clock starts at 0, and time moves only when the test moves it', () =>
  clocked(Effect.gen(function*() {
    expect(DateTime.toEpochMillis(yield* DateTime.now)).toBe(0)
    const sleeper = yield* Effect.forkChild(Effect.sleep('10 millis'))
    yield* Effect.yieldNow
    expect(sleeper.pollUnsafe()).toBeUndefined()
    // A timeout runs out only when the clock passes it.
    const timed = yield* Effect.forkChild(Effect.timeoutOption(Effect.never, '5 millis'))
    yield* TestClock.adjust('5 millis')
    expect((yield* Fiber.join(timed))._tag).toBe('None')
    expect(sleeper.pollUnsafe()).toBeUndefined()
    yield* TestClock.adjust('5 millis')
    expect(sleeper.pollUnsafe()?._tag).toBe('Success')
    expect(DateTime.toEpochMillis(yield* DateTime.now)).toBe(10)
  })))

test('adjust wakes the sleeps in order, and runs each woken fiber, and what it forks, until it waits', () =>
  clocked(Effect.gen(function*() {
    const seen: Array<string> = []
    const chain = (name: string) => Effect.andThen(yields(50), Effect.sync(() => seen.push(name)))
    // Registered in the reverse of their times.
    yield* Effect.forkChild(Effect.andThen(Effect.sleep('30 millis'), Effect.sync(() => seen.push('30'))))
    yield* Effect.forkChild(Effect.andThen(
      Effect.sleep('20 millis'),
      // Woken at 20, it forks a fiber that yields many times before it acts: that fiber is done before 30 wakes.
      Effect.andThen(Effect.forkDetach(chain('forked at 20')), Effect.sync(() => seen.push('20'))),
    ))
    yield* Effect.forkChild(Effect.andThen(Effect.sleep('10 millis'), chain('10')))
    yield* TestClock.adjust('30 millis')
    expect(seen).toEqual(['10', '20', 'forked at 20', '30'])
  })))

test('a fiber forked before adjust is given one turn, and woken only if it reaches its sleep in it', async () => {
  expect(await forkedBefore(yields(1))).toBe(true)
  expect(await forkedBefore(yields(2))).toBe(false)
  expect(await forkedBefore(yields(50))).toBe(false)
  expect(await forkedBefore(steps(100))).toBe(true)
})

test('a turn is as many steps as the budget gives: under a budget of 3, any work first misses the move', async () => {
  expect(await forkedBefore(steps(1), 3)).toBe(false)
  expect(await forkedBefore(steps(5), 10)).toBe(true)
  expect(await forkedBefore(steps(20), 10)).toBe(false)
  expect(await forkedBefore(steps(20), 50)).toBe(true)
})

test('under a budget of 3, a woken fiber and what it forks still run until they wait before adjust goes on', () =>
  clocked(Effect.gen(function*() {
    const seen: Array<string> = []
    yield* Effect.forkChild(Effect.andThen(
      Effect.sleep('10 millis'),
      Effect.andThen(Effect.forkDetach(Effect.andThen(yields(50), Effect.sync(() => seen.push('forked')))), yields(50)),
    ))
    yield* Effect.forkChild(Effect.andThen(Effect.sleep('20 millis'), Effect.sync(() => seen.push('20'))))
    yield* TestClock.adjust('20 millis')
    expect(seen).toEqual(['forked', '20'])
  }).pipe(Effect.provideService(Scheduler.MaxOpsBeforeYield, 3))))
