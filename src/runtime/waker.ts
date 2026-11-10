/**
 * The waker: the fiber of a deployment that reads the stored timers due of the entities this process does not hold,
 * and activates their entities (decision 0029).
 */
import * as Cause from 'effect/Cause'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Queue from 'effect/Queue'
import { activateOnCluster } from './doors.ts'
import { loads } from './loop.ts'
import { type Deployment, end, type Process, reread } from './process.ts'
import type { Types } from '../program.ts'

/**
 * The timers of the entities this process does not hold (decision 0029). It reads the earliest time one is
 * due, and activates the entities whose time has come: arming a timer already due fires it. Then it sleeps
 * until the next, an hour at most (decision 0221), or until an entity is unloaded and brings an earlier one. An
 * activation that fails crashes its entity alone, which is tried again after `retry`, as a receiver that crashed is
 * sent to again (decisions 0046, 0077).
 */
export const waking = <T extends Types>(p: Process, deployed: Deployment<T>) => {
  const { waker } = deployed
  // One reading per round, and `forever` begins the next: a round that waited for itself would leave a frame
  // behind at every timer the process ever wakes for.
  return Effect.forever(Effect.gen(function*() {
    const now = DateTime.toEpochMillis(yield* DateTime.now)
    let next = Infinity
    for (const [id, at] of waker.failed) {
      if (at <= now) waker.failed.delete(id)
      else next = Math.min(next, at)
    }
    const due = yield* deployed.storage.due(
      now,
      [...deployed.loaded.keys(), ...waker.failed.keys()],
      p.cluster === null ? undefined : held(deployed),
    )
    next = Math.min(next, due.next ?? Infinity)
    waker.next = next === Infinity ? null : next
    // The entities just activated are this process's, and the reading of the next round leaves them out, as
    // it leaves out the ones that failed until their time.
    if (due.ready.length > 0) {
      for (const id of due.ready) {
        const activation = p.cluster === null ? loads(p, deployed, id) : activateOnCluster(p, deployed, id)
        yield* activation.pipe(Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause) ? Effect.failCause(cause) : Effect.sync(() => {
            waker.failed.set(id, now + p.retry)
          })
        ))
      }
      return
    }
    // Whether the reading stands: an entity unloaded while it was made has poked, and it is made again.
    // Taking the poke and clearing the flag are each one step, so no reading is lost and none is stale.
    const rests = yield* Effect.sync(() => {
      if (Queue.sizeUnsafe(waker.poke) > 0) return false
      waker.busy = false
      end(p)
      return true
    })
    if (!rests) return yield* Queue.take(waker.poke)
    // A sleep of `reread` at most, after which the round reads the wall clock and the storage again: a host
    // suspended during the sleep delays a timer by that much at most (decision 0221).
    yield* next === Infinity
      ? Queue.take(waker.poke)
      : Effect.raceFirst(Queue.take(waker.poke), Effect.sleep(`${Math.min(Math.max(0, next - now), reread)} millis`))
    waker.busy = true
  }))
}

/** The shards whose singleton runs on this runner: the partitions the waker reads on Cluster (decision 0162). */
export const held = <T extends Types>(deployed: Deployment<T>) =>
  [...deployed.shards].flatMap(([shard, state]) => state === 'held' ? [shard] : [])

/** The waker reads again: the shards it reads have changed, or an entity left the process (decision 0068). */
export const poke = <T extends Types>(p: Process, deployed: Deployment<T>) => {
  deployed.waker.busy = true
  Queue.offerUnsafe(deployed.waker.poke, undefined)
  end(p)
}
