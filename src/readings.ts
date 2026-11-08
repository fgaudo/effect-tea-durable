/**
 * The readings of the log that wait: a `fetch` or a `consume` given a wait waits for a commit in its topic, which the
 * step that commits tells it of (decision 0142). On Cluster the watcher tells them of another runner's commit
 * (decision 0163).
 */
import * as Clock from 'effect/Clock'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import type * as Latch from 'effect/Latch'
import type * as Machine from './machine.ts'
import type { Process } from './process.ts'

/** The readings of `fetch` that wait, of every program of the runtime (decision 0142). */
export interface Readings {
  /**
   * What a `fetch` that waits waits for, by program and topic: completed and dropped by the first commit of a row in
   * the topic. Only a reading that waits makes one, and one stays until that commit though its wait is over, so the
   * map holds at most one per topic declared, and a step in a topic no reading has waited for finds none. Completing
   * one adds no yield. A `PubSub` per topic would tell the same, at a subscription per reading (decision 0142).
   */
  readonly commits: Map<string, Deferred.Deferred<void>>
  /** How many readings wait now: while one does, `waiting` is open, and the watcher of other runners reads. */
  count: number
  readonly waiting: Latch.Latch
}

export const commitOf = (readings: Readings, name: string, topic: string) => {
  const address = JSON.stringify([name, topic])
  const commit = readings.commits.get(address) ?? Deferred.makeUnsafe<void>()
  readings.commits.set(address, commit)
  return commit
}

/** Tells every reading that waits, whatever its topic: another runner has committed (decision 0163). */
export const tellAll = (readings: Readings) => {
  const told = [...readings.commits.values()]
  readings.commits.clear()
  for (const commit of told) Deferred.doneUnsafe(commit, Effect.void)
}

/** Tells the readings that wait for a topic `written` publishes in, once its transaction has committed. */
export const tell = (readings: Readings, name: string, written: Machine.Written) => {
  for (const topic of written.published?.topics ?? []) {
    const address = JSON.stringify([name, topic])
    const commit = readings.commits.get(address)
    if (commit === undefined) continue
    readings.commits.delete(address)
    Deferred.doneUnsafe(commit, Effect.void)
  }
}

/**
 * Runs `read` until it gives a row, each wait ended by a commit in `topic`, for `millis` from the call at most,
 * and gives the last page read: none once the time is over, or the runtime stops (decision 0142). Given no
 * `millis`, the time is never over, as a reader of `consume` waits (decision 0184).
 */
export const waited = <A>(
  p: Process,
  name: string,
  topic: string,
  millis: number | undefined,
  read: Effect.Effect<ReadonlyArray<A>>,
): Effect.Effect<ReadonlyArray<A>> =>
  Effect.gen(function*() {
    const until = millis === undefined ? Infinity : (yield* Clock.currentTimeMillis) + millis
    while (!Deferred.isDoneUnsafe(p.closing)) {
      // Taken before the reading: a commit after it completes it, and the wait below ends at once. Taken after,
      // a commit between the reading and the wait would be missed, and the wait would run to its end.
      const commit = commitOf(p.readings, name, topic)
      const page = yield* read
      const now = yield* Clock.currentTimeMillis
      if (page.length > 0 || now >= until) return page
      // Counted as one uninterruptible acquisition with its release. A count raised before an `ensuring` was
      // left raised by an interruption at a yield between the two, and the watcher read for ever (decision 0163).
      yield* Effect.acquireUseRelease(
        Effect.sync(() => {
          if (++p.readings.count === 1) p.readings.waiting.openUnsafe()
        }),
        () =>
          Effect.raceAll([
            Deferred.await(commit),
            Deferred.await(p.closing),
            ...(until === Infinity ? [] : [Effect.sleep(`${until - now} millis`)]),
          ]),
        () =>
          Effect.sync(() => {
            if (--p.readings.count === 0) p.readings.waiting.closeUnsafe()
          }),
      )
    }
    return []
  })
