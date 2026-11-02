/**
 * What decisions 0078 and 0079 say of interruption, at `effect` 4.1.2. A region made `uninterruptible` runs to its
 * end when its fiber is interrupted inside it, and the fiber stops at the region's end, before the next step: a
 * deploy registers its deployment and starts its waker whole, and `detached` counts a fork with the fork. A fiber
 * forked inside such a region is interruptible, so the scope it is forked in still stops it: the waker, and what
 * runs detached. And a fiber that joins another and is interrupted stops waiting, and leaves the other running:
 * a caller that gives up leaves its activation or its creation to finish.
 */
import { expect, test } from 'bun:test'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Scope from 'effect/Scope'

test('an interruption inside an uninterruptible region lets it end, and stops the fiber before its next step', () =>
  Effect.runPromise(Effect.gen(function*() {
    const steps: Array<string> = []
    const inside = yield* Deferred.make<void>()
    const gate = yield* Deferred.make<void>()
    const fiber = yield* Effect.forkChild(Effect.gen(function*() {
      yield* Effect.uninterruptible(Effect.gen(function*() {
        steps.push('entered')
        yield* Deferred.succeed(inside, undefined)
        // The region waits here, as a yield of the budget would, while the interruption arrives.
        yield* Deferred.await(gate)
        steps.push('ended')
      }))
      steps.push('after')
    }))
    yield* Deferred.await(inside)
    const interrupting = yield* Effect.forkChild(Fiber.interrupt(fiber))
    yield* Effect.yieldNow
    yield* Deferred.succeed(gate, undefined)
    yield* Fiber.join(interrupting)
    const exit = yield* Fiber.await(fiber)
    expect(steps).toEqual(['entered', 'ended'])
    expect(Exit.hasInterrupts(exit)).toBe(true)
  })))

test('a fiber forked inside an uninterruptible region is interruptible, and its scope stops it', () =>
  Effect.runPromise(Effect.gen(function*() {
    const scope = yield* Scope.make()
    const started = yield* Deferred.make<void>()
    const child = yield* Effect.uninterruptible(
      Effect.forkIn(Effect.andThen(Deferred.succeed(started, undefined), Effect.never), scope),
    )
    yield* Deferred.await(started)
    // A child that inherited the region would never stop, and the close would wait for it for ever.
    yield* Scope.close(scope, Exit.void)
    expect(Exit.hasInterrupts(yield* Fiber.await(child))).toBe(true)
  })))

test('a joiner that is interrupted stops waiting, and the fiber it joined runs to its end', () =>
  Effect.runPromise(Effect.gen(function*() {
    const scope = yield* Scope.make()
    const gate = yield* Deferred.make<void>()
    const joined = yield* Effect.forkIn(Effect.as(Deferred.await(gate), 'done'), scope)
    const joiner = yield* Effect.forkChild(Fiber.join(joined))
    yield* Effect.yieldNow
    yield* Fiber.interrupt(joiner)
    expect(Exit.hasInterrupts(yield* Fiber.await(joiner))).toBe(true)
    yield* Deferred.succeed(gate, undefined)
    expect(yield* Fiber.join(joined)).toBe('done')
    yield* Scope.close(scope, Exit.void)
  })))
