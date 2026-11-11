/**
 * The runtime's steps on Effect Cluster: the step of a request that reaches a program's door, in Cluster's
 * transaction, the settling of a machine a door's step left uncommitted, and the singleton of each shard, which
 * activates the entities of a shard held and crashes those of a shard lost (decisions 0092, 0161, 0162).
 */
import * as Cause from 'effect/Cause'
import * as Data from 'effect/Data'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Queue from 'effect/Queue'
import * as Schedule from 'effect/Schedule'
import { wake } from './callers.ts'
import { crash, entersHeld, fresh, loadable, loop, offer, perform, warnOfSize } from './loop.ts'
import * as Machine from '../machine.ts'
import {
  at,
  type Deployment,
  end,
  holding,
  type Loaded,
  observe,
  operated,
  type Process,
  type Settle,
  spanHere,
  type Stepped,
  told,
  traced,
  forkApart,
  untransacted,
} from './process.ts'
import { type Address, InvariantDefect, type Request, type Types } from '../program.ts'
import { tell } from './readings.ts'
import type { Delivered, DoorAnswer, OnCluster, Operating } from '../runtime.ts'
import { partitionOf, transaction } from '../storage.ts'
import { poke } from './waker.ts'

/**
 * On Cluster: what the steps of one entity in one transaction have made so far, a door's or an activation's. The
 * entity loaded or created, if any, the machine its last step gave, the count of steps its row will hold once the
 * transaction commits, and the events stepped (decision 0161).
 */
export interface Stepping<T extends Types> {
  loaded: Loaded<T> | null
  machine: Machine.Machine<T> | null
  steps: number
  readonly transitions: Array<Stepped<T>>
}

/**
 * On Cluster: an entity of a shard this runner may not load, since Cluster does not route the shard here, or the
 * runtime has let the shard go (decision 0162). Nothing of the transaction that finds it is kept.
 */
export class Unheld extends Data.TaggedError('Unheld')<Readonly<{ id: string }>> {}

/**
 * On Cluster, inside a step's transaction: makes the entity's machine the stored one, before the step computes
 * from it (decision 0161). The runner's one connection runs one transaction at a time, so no other step of the
 * entity runs meanwhile. A count that is the uncommitted machine's means its door's step committed: the machine
 * is the entity's, and what its events set going is performed now, before any later step ends that work. A count
 * that is the held machine's means the door's step rolled back, and its machine is dropped. A step that loaded the
 * entity and rolled back gives false. Any other count is a row this runner did not write, and gives false too.
 */
export const settle = <T extends Types>(p: Process, deployed: Deployment<T>, loaded: Loaded<T>) =>
  Effect.gen(function*() {
    const { name, id } = loaded.machine.stored
    const stored = yield* deployed.storage.stepsOf(id)
    const uncommitted = loaded.uncommitted
    loaded.uncommitted = null
    if (uncommitted !== null && stored === uncommitted.steps) {
      const before = loaded.machine
      loaded.machine = uncommitted.machine
      loaded.steps = uncommitted.steps
      if (before.stored.suspension !== null && uncommitted.machine.stored.suspension === null) wake(p, { name, id })
      for (const { event, written, outputs, span, counted } of uncommitted.transitions) {
        if (written !== null) tell(p.readings, name, written)
        yield* counted
        yield* observe(p, { name, id }, event)
        yield* perform(p, deployed, loaded, { name, id }, event, outputs, span)
      }
      return true
    }
    // A step that loaded the entity and did not commit leaves the machine held without its `Restart`, so nothing it
    // stored would run: the entity is not settled, and crashes, and is loaded again (decision 0252).
    if (uncommitted !== null && uncommitted.loads) return false
    return stored === loaded.steps
  })

/** The defect of an entity whose row this runner did not write (decision 0161). */
export const unsettled = (name: string, id: string) =>
  new InvariantDefect({ reason: `the entity ${id} of ${name} was written by a step this runner did not make` })

/**
 * An event of the entity's own on Cluster, in a transaction of its own: the machine is settled first, then the
 * event is stepped from it and written (decisions 0092, 0161). The transaction's commit is known here, so what
 * the event sets going is performed once it returns. A machine that cannot be settled crashes the entity.
 * `Handle` finds the mailbox as the settled machine holds it, which a door's step may have emptied.
 */
export const applyOnCluster = <T extends Types>(
  p: Process,
  deployed: Deployment<T>,
  loaded: Loaded<T>,
  offered: Machine.Offered<T> | Settle,
): Effect.Effect<void> => {
  const step = Effect.gen(function*() {
    loaded.applying = true
    const entity: Address = { name: loaded.machine.stored.name, id: loaded.machine.stored.id }
    const now = yield* DateTime.now
    // The step holds the entity's lock inside its transaction, as a door's step does, so that a crash from a shard
    // let go waits for it, and stops what its settling starts (decision 0162).
    const stepped = yield* transaction(p.sql, holding(p, entity)(Effect.gen(function*() {
      // Every step deletes Cluster's rows under the pending ids, as a door's step does (decision 0169).
      yield* deployed.storage.forgetPending
      // An event taken before its entity left the process is dropped, as the loop's end says (decision 0162).
      if (deployed.loaded.get(entity.id) !== loaded) return null
      // A step that cannot commit here dies, and its entity crashes (decision 0175).
      yield* p.cluster!.guard(deployed.program, entity.id)
      if (!(yield* settle(p, deployed, loaded))) return yield* Effect.die(unsettled(entity.name, entity.id))
      // A message of a caller reaches the entity through its door alone, never its loop.
      if (offered._tag === 'Settle' || offered._tag === 'Receive') return null
      const { stored } = loaded.machine
      if (offered._tag === 'Handle' && (stored.mailbox.length === 0 || stored.suspension !== null)) return null
      const event: Machine.Event<T> = offered
      const before = loaded.machine
      const transition = Machine.step(deployed.program, before, event)
      let characters = 0
      if (transition.written !== null) {
        yield* at(p, 'BeforeCommit', entity, event)
        characters = yield* deployed.storage.write(entity.id, transition.written, DateTime.toEpochMillis(now))
        loaded.steps += 1
      }
      // Both set inside the transaction: a door's step reads them in a transaction of its own, which the
      // connection runs after this one, so it never reads them between this one's commit and the assignments. A
      // commit that fails crashes the entity, and nothing reads them then (decision 0161).
      loaded.machine = transition.machine
      const counted = yield* told(entity, before, transition.machine, transition.outputs, transition.written !== null)
      return { event, before, transition, characters, counted }
    }))).pipe(Effect.orDie)
    if (stepped === null) return
    const { event, before, transition, characters, counted } = stepped
    yield* counted
    if (transition.written !== null) {
      tell(p.readings, entity.name, transition.written)
      yield* warnOfSize(p, loaded, entity, characters)
    }
    if (before.stored.suspension !== null && transition.machine.stored.suspension === null) wake(p, entity)
    yield* observe(p, entity, event)
    // What the step sets going starts under the lock again, which touches no database here. An entity a crash
    // took out between the commit and the lock starts nothing: the runner that holds its shard next starts it
    // from what is stored (decision 0162).
    yield* holding(p, entity)(Effect.suspend(() =>
      deployed.loaded.get(entity.id) !== loaded ? Effect.void : Effect.andThen(
        transition.written !== null ? at(p, 'AfterCommit', entity, event) : Effect.void,
        Effect.flatMap(spanHere, (span) => perform(p, deployed, loaded, entity, event, transition.outputs, span)),
      )
    ))
  }).pipe(Effect.ensuring(Effect.sync(() => {
    loaded.applying = false
    end(p)
  })))
  // A `Settle` steps no event of its own: what it performs links the spans of the door's steps. A `Receive` steps
  // nothing here, since a caller's message reaches the entity through its door (decision 0220).
  return offered._tag === 'Settle' || offered._tag === 'Receive'
    ? step
    : traced(loaded.machine.stored, offered, undefined)(step)
}

/** On Cluster, the steps of an entity in one transaction, from the entity `loaded`, or from none. */
export const stepping = <T extends Types>(loaded: Loaded<T> | null): Stepping<T> => ({
  loaded,
  machine: loaded?.machine ?? null,
  steps: loaded?.steps ?? 0,
  transitions: [],
})

/** One event of the entity `stepped` steps, written in the transaction under way if it writes (decision 0161). */
export const stepIn = <T extends Types>(
  p: Process,
  deployed: Deployment<T>,
  stepped: Stepping<T>,
  entity: Address,
  event: Machine.Event<T>,
  now: DateTime.Utc,
) =>
  // Each event is a step of its own, linked to the span of the door's request, Cluster's (decision 0220).
  Effect.flatMap(spanHere, (link) =>
    traced(entity, event, link)(Effect.gen(function*() {
      const before = stepped.machine!
      const transition = Machine.step(deployed.program, before, event)
      if (transition.written !== null) {
        yield* at(p, 'BeforeCommit', entity, event)
        yield* deployed.storage.write(entity.id, transition.written, DateTime.toEpochMillis(now))
        stepped.steps += 1
      }
      stepped.transitions.push({
        event,
        written: transition.written,
        outputs: transition.outputs,
        span: yield* spanHere,
        counted: yield* told(entity, before, transition.machine, transition.outputs, transition.written !== null),
      })
      stepped.machine = transition.machine
      return transition
    })))

/**
 * Loads the entity into `stepped` where `stepped` holds none yet: its stored machine, with its `Restart` stepped
 * first. It fails with `Unheld` where the entity's shard may not be loaded here (decision 0162), and leaves
 * `stepped` without an entity where none is stored.
 */
export const loadIn = <T extends Types>(
  p: Process,
  deployed: Deployment<T>,
  stepped: Stepping<T>,
  entity: Address,
  now: DateTime.Utc,
): Effect.Effect<void, Unheld> =>
  Effect.gen(function*() {
    if (stepped.loaded !== null) return
    if (!loadable(p, deployed, entity.id)) return yield* new Unheld({ id: entity.id })
    const held = yield* deployed.storage.load(entity.id)
    if (held === null) return
    const loaded = yield* fresh<T>(p, { stored: held, running: {} }, (yield* deployed.storage.stepsOf(entity.id)) ?? 0)
    stepped.loaded = loaded
    stepped.steps = loaded.steps
    stepped.machine = loaded.machine
    yield* stepIn(p, deployed, stepped, entity, { _tag: 'Restart' }, now)
  })

/**
 * The end of the steps in `stepped`, inside their transaction. An entity created or loaded enters the process with
 * its loop, or fails with `Unheld` where its shard may no longer be loaded here. The machine is the entity's at
 * once if nothing was written. Otherwise it is left uncommitted, and the commit tells the loop to settle it: what
 * it sets going is started then, from a commit the count proves (decision 0161).
 */
export const finishIn = <T extends Types>(
  p: Process,
  deployed: Deployment<T>,
  stepped: Stepping<T>,
  entity: Address,
): Effect.Effect<void, Unheld> =>
  Effect.gen(function*() {
    const held = stepped.loaded!
    const loads = deployed.loaded.get(entity.id) !== held
    if (loads) {
      if (!(yield* entersHeld(p, deployed, held))) return yield* new Unheld({ id: entity.id })
      yield* forkApart(p.sql, loop(p, deployed, held), deployed.scope)
    }
    if (stepped.steps === held.steps) {
      // Nothing was written, so nothing can roll back: the machine is the entity's at once (decision 0092).
      held.machine = stepped.machine!
      for (const { event, outputs, span, counted } of stepped.transitions) {
        yield* counted
        yield* observe(p, entity, event)
        yield* perform(p, deployed, held, entity, event, outputs, span)
      }
    } else {
      held.uncommitted = { machine: stepped.machine!, steps: stepped.steps, transitions: stepped.transitions, loads }
      yield* p.sql.afterCommit(offer(p, held, { _tag: 'Settle' }))
    }
  })

/** The address `entity` names now: the new name, where the launch renames the name it holds (decision 0176). */
export const current = (p: Process, entity: Address): Address => {
  const name = p.renames.get(entity.name)
  return name === undefined ? entity : { ...entity, name }
}
/**
 * A request that reached a door, with its sender named as the launch names it. A runner of the old code may send
 * under the old name until its shards move, and its request would then be keyed otherwise than the one the
 * rename wrote again, and applied twice (decision 0176).
 */
export const sentNow = <S>(p: Process, request: Request<S>): Request<S> =>
  request._tag === 'Operation' && p.renames.has(request.entity.name)
    ? { ...request, entity: current(p, request.entity) }
    : request

/** The defect of a door's step whose entity this runner may not load (decision 0162). */
export const unheld = (name: string, id: string) =>
  new InvariantDefect({ reason: `the shard of the entity ${id} of ${name} is not held by this runner` })

/**
 * The step of a request that reaches a program's door on Cluster, in Cluster's transaction (decisions 0081,
 * 0092, 0160, 0161). The entity's lock is taken inside the transaction, so that nothing holds the lock while it
 * waits for the connection the transaction holds. A held entity is settled first, and one not held is loaded
 * from what is stored, its `Restart` stepped first. A step whose entity's shard may not be loaded here dies, and
 * Cluster delivers the request again (decision 0162).
 */
export const doorStep = <T extends Types>(p: Process, deployed: Deployment<T>) =>
(delivered: Delivered | Operating, requestId: string): Effect.Effect<DoorAnswer<T['rejection']>> => {
  const { program, storage: stored } = deployed
  const { id } = delivered
  const entity: Address = { name: program.name, id }
  return holding(p, entity)(Effect.gen(function*(): Effect.fn.Return<DoorAnswer<T['rejection']>, Unheld> {
    // A step that cannot commit here dies, and Cluster delivers the request again (decisions 0159, 0175).
    yield* p.cluster!.guard(program, id)
    // Before Cluster saves this request's own rows after the step, which would be deleted unanswered
    // (decision 0169).
    yield* stored.forgetPending
    const now = yield* DateTime.now
    let found = deployed.loaded.get(id) ?? null
    if (found !== null && !(yield* settle(p, deployed, found))) {
      // The crash takes the entity out of the process. Its loop is woken, finds the entity gone, and ends.
      yield* crash(p, deployed, found, Cause.die(unsettled(program.name, id)))
      Queue.offerUnsafe(found.events, { _tag: 'Settle' })
      found = null
    }
    const stepped = stepping(found)
    yield* loadIn(p, deployed, stepped, entity, now)
    let answer: DoorAnswer<T['rejection']>
    if (delivered._tag === 'Create') {
      const created = yield* stored.deliveredCreation(delivered.version, delivered.request, delivered.message)
      const { flags } = created
      const request = sentNow(p, created.request)
      if (request._tag === 'Operation') yield* stored.keepSent(requestId, request)
      // An operation is given again the rejection a run before it was given, as on one process. The creator's client
      // resets a rejection Cluster saved, and this step answers it again (decision 0253).
      const kept = request._tag === 'Operation' ? yield* stored.answer(id, 'Create', request) : null
      if (kept?._tag === 'Rejected') {
        if (stepped.loaded === null) return { _tag: 'Create', answer: kept }
        answer = { _tag: 'Create', answer: kept }
      } else if (stepped.loaded === null) {
        const started = Machine.start(program, id, flags, now, request)
        // A creation the program dies on stores nothing, and dies: Cluster delivers it again (decision 0160).
        if (started._tag === 'Defect') return yield* Effect.die(started.cause)
        // A creation `init` rejects stores no entity. Cluster saves the answer, and the creator's client resets it,
        // as it resets `NotFound`, so that a caller's retry runs `init` again (decision 0182). An operation's is kept
        // for its work, in this transaction (decision 0253).
        if (started._tag === 'Rejected') {
          if (request._tag === 'Operation') yield* stored.keepAnswer(id, 'Create', request, started.reply)
          return { _tag: 'Create', answer: started.reply }
        }
        // The creation is a step of its own, linked to the span of the door's request (decision 0220).
        const { span, counted } = yield* traced(entity, { _tag: 'Create' }, yield* spanHere)(Effect.gen(function*() {
          yield* stored.write(id, started.written, DateTime.toEpochMillis(now))
          const counted = yield* told(entity, started.machine, started.machine, started.outputs, true)
          return { span: yield* spanHere, counted }
        }))
        stepped.loaded = yield* fresh<T>(p, started.machine, 0)
        stepped.steps = 1
        stepped.machine = started.machine
        stepped.transitions.push({
          event: { _tag: 'Create', request, flags },
          written: started.written,
          outputs: started.outputs,
          span,
          counted,
        })
        answer = { _tag: 'Create', answer: { _tag: 'Created' } }
      } else {
        const transition = yield* stepIn(p, deployed, stepped, entity, { _tag: 'Create', request, flags }, now)
        const reply = transition.outputs.find((output) => output._tag === 'CreationReplied')
        answer = { _tag: 'Create', answer: reply?._tag === 'CreationReplied' ? reply.reply : { _tag: 'AlreadyExists' } }
      }
    } else if (delivered._tag === 'Message') {
      const arrived = yield* stored.delivered(delivered.version, delivered.request, delivered.message)
      const { message } = arrived
      const request = sentNow(p, arrived.request)
      // Kept whatever the step answers: a request answered `Suspended` or `NotFound` is reset and answered again
      // under the same id, which is not kept twice (decision 0169).
      if (request._tag === 'Operation') yield* stored.keepSent(requestId, request)
      // An operation is given again the `NotFound` a run before it was given, though the entity may exist since, and
      // an operation's `NotFound` is kept for its work, in this transaction (decision 0253).
      const kept = request._tag === 'Operation' ? yield* stored.answer(id, 'Message', request) : null
      if (stepped.loaded === null) {
        if (kept === null && request._tag === 'Operation') {
          yield* stored.keepAnswer(id, 'Message', request, { _tag: 'NotFound' })
        }
        return { _tag: 'Message', answer: { _tag: 'NotFound' } }
      }
      if (kept?._tag === 'NotFound') {
        yield* finishIn(p, deployed, stepped, entity)
        return { _tag: 'Message', answer: kept }
      }
      // The door waits for the answer of the request with the message it carried (decision 0269).
      const key = Machine.messageKey(program, request, message)
      const found = yield* stored.reply(id, request, DateTime.toEpochMillis(now))
      const reply = found?.reply ?? null
      const carried = found?.carried ?? null
      const arrival: Machine.Event<T> = delivered.keep === undefined
        ? { _tag: 'Receive', request, message, reply, carried, at: now }
        : { _tag: 'Receive', request, message, reply, carried, at: now, keep: delivered.keep }
      let transition = yield* stepIn(p, deployed, stepped, entity, arrival, now)
      // The mailbox is handled up to the message, each `Handle` stepping its head (decision 0160).
      let replied: DoorAnswer<T['rejection']> | null = null
      while (replied === null) {
        for (const output of transition.outputs) {
          if (output._tag === 'Replied' && Machine.messageKey(program, output.request, output.message) === key) {
            replied = { _tag: 'Message', answer: output.reply }
          }
        }
        if (replied !== null) break
        const { suspension, mailbox } = transition.machine.stored
        if (suspension !== null) {
          replied = { _tag: 'Message', answer: { _tag: 'Suspended' } }
        } else if (mailbox.length === 0) {
          return yield* Effect.die(new InvariantDefect({
            reason: `the entity ${id} of ${program.name} handled its mailbox, and answered no request ${key}`,
          }))
        } else {
          transition = yield* stepIn(p, deployed, stepped, entity, { _tag: 'Handle', at: now }, now)
        }
      }
      // An operation answered `Suspended` waits for the entity's resumption, which another runner may make. The step
      // that answered stored its wait, and the step that takes the entity out of its suspension tells its entity
      // (decisions 0167, 0265).
      answer = replied
    } else {
      // An operator's event is stepped as on one process, in the door's transaction, and answered with what it
      // did (decisions 0114, 0166).
      if (stepped.loaded === null) return { _tag: 'Operated', answer: { _tag: 'NotFound' } }
      const before = stepped.machine!
      // The senders an earlier step answered `Suspended` are read before the step, whose write deletes them if it
      // takes the entity out of its suspension, and told from this transaction, so that a step that rolls back tells
      // nobody (decisions 0167, 0265).
      const waiters = before.stored.suspension === null ? [] : yield* stored.waiters(id)
      const transition = yield* stepIn(p, deployed, stepped, entity, { _tag: delivered._tag }, now)
      answer = { _tag: 'Operated', answer: operated(delivered._tag, before, transition.machine) }
      if (before.stored.suspension !== null && transition.machine.stored.suspension === null) {
        for (const sender of waiters) yield* p.cluster!.resume(sender, entity)
      }
    }
    yield* finishIn(p, deployed, stepped, entity)
    return answer
  })).pipe(Effect.catchTag('Unheld', (refused) => Effect.die(unheld(program.name, refused.id))))
}

/**
 * On Cluster, loads the entity `id` into this process if it is stored, this process does not hold it already, and
 * its shard may be loaded here. It runs in a transaction of its own, and takes the entity's lock inside it, as a
 * door's step does, so that nothing holds the lock while it waits for the connection (decisions 0161, 0162). The
 * entity's `Restart` is stepped in the same transaction. It is not interrupted halfway, so that the entity is
 * either loaded with its loop or not at all.
 */
export const activateOnCluster = <T extends Types>(
  p: Process,
  deployed: Deployment<T>,
  id: string,
): Effect.Effect<void> => {
  const entity: Address = { name: deployed.program.name, id }
  return Effect.uninterruptible(transaction(p.sql, holding(p, entity)(Effect.gen(function*() {
    if (deployed.loaded.has(id)) return
    const stepped = stepping<T>(null)
    yield* loadIn(p, deployed, stepped, entity, yield* DateTime.now)
    if (stepped.loaded === null) return
    // An activation that cannot commit here dies, and the waker or the shard's round tries it again after
    // `retry` (decision 0175).
    yield* p.cluster!.guard(deployed.program, id)
    yield* finishIn(p, deployed, stepped, entity)
  })))).pipe(Effect.catchTag('Unheld', () => Effect.void), Effect.orDie)
}

/**
 * The name of a singleton of the program `name` for each shard: the first of
 * `@fgaudo/effect-tea-persistent/<name>/<n>`, for `n` from 0, that Cluster routes to the shard (decision 0162). The
 * prefix stays as it is from the first release on, since a runner of an older release would otherwise run other
 * singletons for the same shards (decision 0195). Each name found is checked against the partition the storage gives
 * it, so that a hash of Cluster's that came to differ from the storage's is a defect at deploy, and not an entity
 * whose timers no runner reads.
 */
export const singletonsOf = (on: OnCluster, name: string): ReadonlyMap<number, string> => {
  const found = new Map<number, string>()
  // Every shard is found within a few times `shards` names, by the coupon collector's bound: `shards * 64` names
  // leave one out with a chance of about `shards * e^-64`.
  for (let n = 0; found.size < on.shards; n++) {
    const candidate = `@fgaudo/effect-tea-persistent/${name}/${n}`
    if (n >= on.shards * 64) {
      throw new InvariantDefect({ reason: `no singleton of ${name} is found for some of the ${on.shards} shards` })
    }
    const shard = on.shardOf(candidate)
    const partition = partitionOf(candidate, on.shards)
    if (shard !== partition) {
      const reason = `Cluster routes ${candidate} to the shard ${shard}, the storage to the partition ${partition}`
      throw new InvariantDefect({ reason })
    }
    if (!found.has(shard)) found.set(shard, candidate)
  }
  return found
}

/**
 * The shard `shard` of `deployed` while its singleton runs (decision 0092). The shard is gained as the singleton
 * starts: the waker reads it, and the entities of it that hold an operation or a message are activated. The
 * shard is lost as the singleton is interrupted, by its finalizer, which Cluster waits for before the shard moves.
 */
export const serving = <T extends Types>(p: Process, on: OnCluster, deployed: Deployment<T>, shard: number) =>
  Effect.andThen(
    Effect.acquireRelease(
      Effect.sync(() => {
        deployed.shards.set(shard, 'held')
        poke(p, deployed)
      }),
      () => losing(p, on, deployed, shard),
    ),
    activating(p, deployed, shard),
  )

/**
 * Activates the entities of the shard that hold an operation or a message, as a process does as it starts
 * (decision 0071). A door may have loaded one first, and the activation leaves it as it is. A round that fails, in
 * its reading or in an activation, is made again after `retry`: a defect that ended the singleton would run its
 * finalizer, and the shard would be let go while Cluster still routes it here. A round is counted while it runs,
 * so that the process is not settled meanwhile.
 */
export const activating = <T extends Types>(
  p: Process,
  deployed: Deployment<T>,
  shard: number,
): Effect.Effect<void> => {
  const round = Effect.gen(function*() {
    let failed = false
    for (const id of yield* deployed.storage.interruptedIn(shard)) {
      const exit = yield* Effect.exit(activateOnCluster(p, deployed, id))
      if (Exit.isFailure(exit)) failed = true
    }
    return failed
  })
  const counted = Effect.acquireUseRelease(
    Effect.sync(() => {
      p.detachments += 1
    }),
    () => Effect.exit(round),
    () =>
      Effect.sync(() => {
        p.detachments -= 1
        end(p)
      }),
  )
  return Effect.asVoid(Effect.repeat(counted, {
    schedule: Schedule.spaced(`${p.retry} millis`),
    until: (exit) => Exit.isSuccess(exit) && !exit.value,
  }))
}

/**
 * The shard is lost: marked so, and read by the waker no more, and then every entity of it this process holds
 * crashes, each under its own lock (decision 0092). The mark and the reading of the entities held are one step,
 * so that an entity a door or an activation loads either is read here or finds the mark. A crash forks the
 * interruption of the entity's operations, and waits for none of them: Cluster waits for this finalizer with no
 * bound, and keeps the shard from every runner while it runs (decision 0056).
 */
export const losing = <T extends Types>(p: Process, on: OnCluster, deployed: Deployment<T>, shard: number) =>
  Effect.gen(function*() {
    const leaving = yield* Effect.sync(() => {
      deployed.shards.set(shard, 'lost')
      poke(p, deployed)
      return [...deployed.loaded.values()].filter((loaded) => on.shardOf(loaded.machine.stored.id) === shard)
    })
    const left = new InvariantDefect({ reason: `the shard ${shard} left this runner` })
    for (const loaded of leaving) {
      const { name, id } = loaded.machine.stored
      yield* holding(p, { name, id })(Effect.suspend(() =>
        deployed.loaded.get(id) === loaded
          ? Effect.andThen(
            // The shard's new runner loads it, so the waker here does not try it again (decision 0252).
            crash(p, deployed, loaded, Cause.die(left), false),
            // The loop is woken, finds the entity gone, and ends.
            Effect.sync(() => Queue.offerUnsafe(loaded.events, { _tag: 'Settle' })),
          )
          : Effect.void
      ))
    }
  })
