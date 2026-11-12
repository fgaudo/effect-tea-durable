/**
 * The waker: the fiber of a deployment that reads the stored timers due of the entities this process does not hold,
 * and activates their entities (decision 0029).
 */
import * as Cause from 'effect/Cause'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Queue from 'effect/Queue'
import { activateOnCluster, misplaced } from './doors.ts'
import { loads } from './loop.ts'
import { type Deployment, end, mark, type Process, reread } from './process.ts'
import type { Types } from '../program.ts'

/**
 * The timers of the entities this process does not hold (decision 0029). It reads the earliest time one is
 * due, and activates the entities whose time has come: arming a timer already due fires it. Then it sleeps
 * until the next, an hour at most (decision 0221), or until an entity is unloaded and brings an earlier one. An
 * activation that fails crashes its entity alone, which is tried again after `retry`, as a receiver that crashed is
 * sent to again (decisions 0046, 0077). An entity a crash took out of the process is activated after `retry` too,
 * since its stored work may hold no timer, and nothing else in this process would load it (decision 0252). A
 * reading that fails, or a stored time it refuses, is logged and read again after `retry` (decision 0259).
 */
export const waking = <T extends Types>(p: Process, deployed: Deployment<T>) => {
  const { waker } = deployed
  let failing = false
  const refused = new Set<string>()
  // One reading per round, and `forever` begins the next: a round that waited for itself would leave a frame
  // behind at every timer the process ever wakes for.
  return Effect.forever(Effect.gen(function*() {
    const now = DateTime.toEpochMillis(yield* DateTime.now)
    let next = Infinity
    // A crash's mark whose time has come is activated whatever its timers, once: the reading leaves it out.
    const worked: Array<string> = []
    for (const [id, { at, works }] of waker.failed) {
      if (at > now) next = Math.min(next, at)
      else {
        waker.failed.delete(id)
        if (works && !deployed.loaded.has(id)) worked.push(id)
      }
    }
    // A crash's mark leaves the entity in the readings: a timer due before the mark activates it then.
    const hidden = [...waker.failed].flatMap(([id, { hides }]) => hides ? [id] : [])
    // A reading that fails is read again after `retry`, as the sweep goes on past a sweep that fails: a reading that
    // died would end the fiber, and every timer of the program with it. Only the first failure of a run of them is
    // logged, since a database out of reach would log one at every retry (decision 0259).
    const partitions = p.cluster === null ? undefined : held(deployed)
    const due = yield* deployed.storage.due(now, [...deployed.loaded.keys(), ...hidden, ...worked], partitions).pipe(
      Effect.tap(() => Effect.sync(() => (failing = false))),
      Effect.catchCause((cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.failCause(cause)
          : Effect.as(
            failing ? Effect.void : Effect.andThen(
              Effect.sync(() => (failing = true)),
              Effect.logWarning('a reading of the waker failed; it reads again at every retry', cause).pipe(
                Effect.annotateLogs({ name: deployed.program.name }),
              ),
            ),
            { ready: [], next: now + p.retry, refused: [] },
          )
      ),
    )
    // An entity whose time the reading refuses is left out until `retry`, as one whose activation failed, and its
    // first refusal in the process is logged.
    for (const { id, reason } of due.refused) {
      mark(waker, id, now + p.retry, { hides: true })
      next = Math.min(next, now + p.retry)
      if (refused.has(id)) continue
      refused.add(id)
      yield* Effect.logWarning(`the stored time of an entity is refused; the waker reads it again at every retry: ${reason}`)
        .pipe(Effect.annotateLogs({ name: deployed.program.name, id }))
    }
    next = Math.min(next, due.next ?? Infinity)
    waker.next = next === Infinity ? null : next
    // The entities just activated are this process's, and the reading of the next round leaves them out, as
    // it leaves out the ones that failed until their time.
    // An entity read under a partition this runner holds, which Cluster routes to a shard it does not, would be
    // refused as unheld at every reading: it is left out until `retry`, and logged once (decision 0273).
    const ready: Array<string> = []
    for (const id of [...worked, ...due.ready]) {
      const shard = partitions === undefined ? null : p.cluster!.shardOf(id)
      if (shard === null || partitions!.includes(shard)) {
        ready.push(id)
        continue
      }
      mark(waker, id, now + p.retry, { hides: true })
      next = Math.min(next, now + p.retry)
      waker.next = next
      if (refused.has(id)) continue
      refused.add(id)
      yield* misplaced(deployed, id, null, shard)
    }
    if (ready.length > 0) {
      for (const id of ready) {
        const activation = p.cluster === null ? loads(p, deployed, id) : activateOnCluster(p, deployed, id)
        yield* activation.pipe(Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause) ? Effect.failCause(cause) : Effect.sync(() => {
            // An activation of a crash's mark that fails is still the crash's: it is activated at its next time.
            mark(waker, id, now + p.retry, { hides: true, works: worked.includes(id) })
          })
        ))
      }
      return
    }
    // Whether the reading stands: an entity unloaded while it was made has poked, and it is made again.
    // Taking the poke and clearing the flag are each one step, so no reading is lost and none is stale. The clock is
    // read again in the same step, since it moved while the storage was read: a time come meanwhile begins the next
    // round with the flag still raised, and the sleep is measured from now (decision 0258).
    const rests = yield* Effect.clockWith((clock) =>
      Effect.sync(() => {
        if (Queue.sizeUnsafe(waker.poke) > 0) return 'poked' as const
        const after = clock.currentTimeMillisUnsafe()
        if (next <= after) return 'due' as const
        waker.busy = false
        end(p)
        return after
      })
    )
    if (rests === 'poked') return yield* Queue.take(waker.poke)
    if (rests === 'due') return
    // A sleep of `reread` at most, after which the round reads the wall clock and the storage again: a host
    // suspended during the sleep delays a timer by that much at most (decision 0221).
    yield* next === Infinity
      ? Queue.take(waker.poke)
      : Effect.raceFirst(Queue.take(waker.poke), Effect.sleep(`${Math.min(next - rests, reread)} millis`))
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
