/**
 * What the open question "Bookkeeping in transactions" asks a spike of `effect` 4.1.2's transactions, under the
 * scheduler of the tests (decision 0104), before the runtime's bookkeeping is written with them.
 *
 * Read in the source (`tx`, `awaitPendingTransaction` and `commitTransaction` in `Effect.ts`): a body that calls
 * `txRetry` checks its reads and registers its wait on every `TxRef` it read in one synchronous step. A commit
 * changes the refs it wrote, and schedules each of their waiters with `scheduleTask` of the committing fiber's
 * dispatcher. So the wake is a task of the dispatcher, and the tests pick when it runs. A body that waits on
 * `txRetry` is woken by any commit that writes a ref it read, even one that leaves its value as it was. A body
 * reruns on a conflict when a ref it read changed before its attempt ends, which is checked once per attempt.
 *
 * `TxSemaphore` is a `TxRef` of the permits: `acquire` retries while none is free, and `release` adds one. Its
 * waiters keep no queue, so a release wakes them all, and the first to rerun takes the permit. `Semaphore` serves
 * its waiters in the order they came: the JSDoc of `take` promises that pending takes are scanned in registration
 * order, and a request of one permit is never overtaken.
 */
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Semaphore from 'effect/Semaphore'
import * as TxRef from 'effect/TxRef'
import * as TxSemaphore from 'effect/TxSemaphore'
import { everySchedule, inOrder, prioritizedSchedules, scheduled } from '../src/testing.ts'

const succeeded = <A, E>(exit: Exit.Exit<A, E>): A => {
  if (!Exit.isSuccess(exit)) throw new Error(`the run failed: ${String(exit.cause)}`)
  return exit.value
}

test("a commit wakes a body waiting on txRetry through the scheduler's dispatcher", () => {
  // `scheduled` runs no timer and no microtask: a wake that went around the dispatcher would leave the run waiting.
  // The body returns the value it read and its attempt: an attempt past the first waited on `txRetry`.
  const waits = Effect.gen(function*() {
    const ref = yield* TxRef.make(0)
    const waiter = yield* Effect.forkChild(Effect.tx(Effect.gen(function*() {
      const value = yield* TxRef.get(ref)
      if (value === 0) return yield* Effect.txRetry
      return { value, attempt: (yield* Effect.Transaction).attempt }
    })))
    yield* Effect.yieldNow
    yield* TxRef.set(ref, 1)
    return yield* Fiber.join(waiter)
  })
  expect(succeeded(scheduled(waits, inOrder).exit!)).toEqual({ value: 1, attempt: 2 })
  const runs = everySchedule(waits, { bound: 2 }, (exit) => expect(succeeded(exit).value).toBe(1))
  expect(runs).toBeGreaterThan(1)
})

/**
 * `awaitResumption` of `src/runtime.ts`, written as a count of resumptions in a `TxRef`. The sender reads the count,
 * sends, and on `Suspended` waits with `txRetry` while the count is the one it read. The resumer lifts the suspension
 * and counts a resumption. `readFirst` reads the count before the send, as the runtime registers its wait before the
 * send (decisions 0023 and 0063); otherwise the sender reads it after the answer. A sender answered `Suspended` says
 * whether it was resumed at once, the count changed already, or after a wait on `txRetry`.
 */
const resumption = (readFirst: boolean) =>
  Effect.gen(function*() {
    let suspended = true
    const resumptions = yield* TxRef.make(0)
    const sender = Effect.gen(function*() {
      let seen = readFirst ? yield* TxRef.get(resumptions) : undefined
      const answer = yield* Effect.sync(() => suspended ? 'Suspended' : 'Answered')
      if (answer === 'Answered') return 'answered'
      seen ??= yield* TxRef.get(resumptions)
      return yield* Effect.tx(Effect.gen(function*() {
        if ((yield* TxRef.get(resumptions)) === seen) return yield* Effect.txRetry
        return (yield* Effect.Transaction).attempt === 1 ? 'resumed at once' : 'resumed after a wait'
      }))
    })
    const resumer = Effect.gen(function*() {
      yield* Effect.sync(() => {
        suspended = false
      })
      yield* TxRef.update(resumptions, (count) => count + 1)
    })
    const sent = yield* Effect.forkChild(sender)
    const resumed = yield* Effect.forkChild(resumer)
    yield* Fiber.join(resumed)
    return yield* Fiber.join(sent)
  })

test('a sender that reads the count of resumptions before it sends misses no resumption', () => {
  const answers = new Set<string>()
  everySchedule(resumption(true), { bound: 3 }, (exit) => answers.add(succeeded(exit)))
  prioritizedSchedules(resumption(true), { runs: 500, depth: 3 }, (exit) => answers.add(succeeded(exit)))
  // Every answer is reached: the resumption falls before the send, between the answer and the wait, and during it.
  expect([...answers].sort()).toEqual(['answered', 'resumed after a wait', 'resumed at once'])
})

test('a sender that reads the count of resumptions after its answer waits for ever in some schedule', () => {
  expect(() => everySchedule(resumption(false), { bound: 1 }, (exit) => succeeded(exit))).toThrow(/did not end/)
})

/** `fibers` fibers each add 1 to a counter in a transaction that yields between its read and its write. */
const counting = (fibers: number) =>
  Effect.gen(function*() {
    const counter = yield* TxRef.make(0)
    let attempts = 0
    const add = Effect.tx(Effect.gen(function*() {
      attempts += 1
      const value = yield* TxRef.get(counter)
      yield* Effect.yieldNow
      yield* TxRef.set(counter, value + 1)
    }))
    const added = yield* Effect.forEach(Array.from({ length: fibers }), () => Effect.forkChild(add))
    yield* Fiber.joinAll(added)
    return { count: yield* TxRef.get(counter), attempts }
  })

/**
 * Seen at 4.1.2, over the first 500 seeds: 0 reruns in 68 runs, 1 in 239, 2 in 163, 3 in 30. An attempt reruns at
 * most once, however many commits fall in it, and only after a commit. So the k-th body to commit reruns k - 1 times
 * at most, and three bodies rerun 3 times at most in all.
 */
test('a conflict reruns a body, and the commits lose no update', () => {
  const reruns = new Set<number>()
  prioritizedSchedules(counting(3), { runs: 500, depth: 3 }, (exit) => {
    const { count, attempts } = succeeded(exit)
    expect(count).toBe(3)
    reruns.add(attempts - 3)
  })
  expect([...reruns].sort()).toEqual([0, 1, 2, 3])
})

/**
 * A lock of one permit, held by the root while `first` and then `second` wait for it, and given back. The root forks
 * `second` once `first` waits, and gives the lock back once both do, so a lock that serves its waiters in order lets
 * `first` in first. `waiting` counts the waiters, read off the lock's fields.
 */
type Lock = Readonly<{ take: Effect.Effect<void>; give: Effect.Effect<void>; waiting: () => number }>
const waiters = (made: Effect.Effect<Lock>) =>
  Effect.gen(function*() {
    const { take, give, waiting } = yield* made
    const until = (count: number) =>
      Effect.whileLoop({ while: () => waiting() < count, body: () => Effect.yieldNow, step: () => {} })
    const order: Array<string> = []
    yield* take
    const waiter = (name: string) =>
      Effect.forkChild(take.pipe(Effect.andThen(Effect.sync(() => order.push(name))), Effect.andThen(give)))
    const first = yield* waiter('first')
    yield* until(1)
    const second = yield* waiter('second')
    yield* until(2)
    yield* give
    yield* Fiber.join(first)
    yield* Fiber.join(second)
    return order.join(' ')
  })

// A `TxRef`'s waiters are a field of its interface. A `Semaphore`'s are a field of its class alone, read by a cast.
const txLock = Effect.map(TxSemaphore.make(1), (lock): Lock => ({
  take: TxSemaphore.acquire(lock),
  give: TxSemaphore.release(lock),
  waiting: () => lock.permitsRef.pending.size,
}))
const lock = Effect.map(Semaphore.make(1), (lock): Lock => ({
  take: Effect.asVoid(lock.take(1)),
  give: Effect.asVoid(lock.release(1)),
  waiting: () => (lock as unknown as { readonly waiters: ReadonlySet<unknown> }).waiters.size,
}))

test('a TxSemaphore lets a later waiter in first, and a Semaphore does not', () => {
  const orders = (made: Effect.Effect<Lock>) => {
    const seen = new Set<string>()
    everySchedule(waiters(made), { bound: 2 }, (exit) => seen.add(succeeded(exit)))
    prioritizedSchedules(waiters(made), { runs: 500, depth: 3 }, (exit) => seen.add(succeeded(exit)))
    return [...seen].sort()
  }
  expect(orders(txLock)).toEqual(['first second', 'second first'])
  expect(orders(lock)).toEqual(['first second'])
})
