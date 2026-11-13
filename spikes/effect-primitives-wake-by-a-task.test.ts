/**
 * What decision 0292 says of `Latch`, `Queue` and `Semaphore`, at `effect` 4.1.3: each wakes the fiber that waits on
 * it by a task of the scheduler's dispatcher, and never on the stack of the fiber that opens, offers or releases. No
 * JSDoc of the three says it. `Deferred` and `Fiber.join` are run the same way, as a check that the spike sees an
 * inline resumption where one happens: both resume their waiter in the task of the fiber that completes them.
 *
 * The scheduler here holds every task and the test runs them one at a time, in order, and never asks a fiber to
 * yield. So a task number names the synchronous turn a fiber ran in, and the waiter ran inline exactly when it logs in
 * the turn of its resumer's wake. A budget of `MaxOpsBeforeYield` cannot blur it, since no fiber is made to yield.
 */
import { expect, test } from 'bun:test'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as Latch from 'effect/Latch'
import * as Queue from 'effect/Queue'
import type * as Scheduler from 'effect/Scheduler'
import * as Semaphore from 'effect/Semaphore'

/** A primitive's waiter and the step that wakes it. */
type Pair = { readonly wait: Effect.Effect<unknown>; readonly wake: Effect.Effect<unknown> }

/**
 * Whether the waiter ran in the same task as its resumer's wake. The resumer logs its turn right after the wake, and
 * the waiter logs its own right after its wait ends.
 */
const inline = (make: Effect.Effect<Pair>) => {
  const tasks: Array<() => void> = []
  let turn = 0
  const scheduler: Scheduler.Scheduler = {
    executionMode: 'async',
    shouldYield: () => false,
    makeDispatcher: () => ({
      scheduleTask: (task) => void tasks.push(task),
      flush: () => {}
    })
  }
  let waiterTurn: number | undefined
  let resumerTurn: number | undefined
  const fiber = Effect.runFork(
    Effect.gen(function*() {
      const { wait, wake } = yield* make
      const waiter = yield* Effect.forkChild(Effect.andThen(wait, Effect.sync(() => (waiterTurn = turn))))
      // The waiter must be at its wait before the wake, or it finds the primitive open and never waits.
      yield* Effect.yieldNow
      yield* Effect.yieldNow
      yield* wake
      resumerTurn = turn
      yield* Fiber.join(waiter)
    }),
    { scheduler }
  )
  while (fiber.pollUnsafe() === undefined && tasks.length > 0) {
    turn++
    tasks.shift()!()
  }
  expect(fiber.pollUnsafe()?._tag).toBe('Success')
  expect(waiterTurn).toBeDefined()
  expect(resumerTurn).toBeDefined()
  return waiterTurn === resumerTurn
}

const latch = Effect.map(Latch.make(false), (latch): Pair => ({ wait: latch.await, wake: latch.open }))
const queue = Effect.map(Queue.unbounded<number>(), (queue): Pair => ({
  wait: Queue.take(queue),
  wake: Queue.offer(queue, 1)
}))
const semaphore = Effect.gen(function*() {
  const semaphore = yield* Semaphore.make(1)
  yield* Semaphore.take(semaphore, 1)
  return { wait: Semaphore.take(semaphore, 1), wake: Semaphore.release(semaphore, 1) } satisfies Pair
})
const deferred = Effect.map(Deferred.make<number>(), (deferred): Pair => ({
  wait: Deferred.await(deferred),
  wake: Deferred.succeed(deferred, 1)
}))
// The joined fiber waits on a `Deferred` the resumer completes, so that it ends in the resumer's task.
const join = Effect.gen(function*() {
  const done = yield* Deferred.make<void>()
  const joined = yield* Effect.forkChild(Deferred.await(done))
  return { wait: Fiber.join(joined), wake: Deferred.succeed(done, undefined) } satisfies Pair
})

test('a Latch wakes its waiter by a task, after its opener goes on', () => {
  expect(inline(latch)).toBe(false)
})

test('a Queue wakes its taker by a task, after its offerer goes on', () => {
  expect(inline(queue)).toBe(false)
})

test('a Semaphore wakes its waiter by a task, after its releaser goes on', () => {
  expect(inline(semaphore)).toBe(false)
})

test('a Deferred, run the same way, wakes its waiter inline, on the stack of its resolver', () => {
  expect(inline(deferred)).toBe(true)
})

test('a Fiber.join, run the same way, wakes its waiter inline, on the stack of the fiber that ends the joined one', () => {
  expect(inline(join)).toBe(true)
})
