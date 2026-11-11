/**
 * An entity's loop: the events offered to a loaded entity, each applied in a step of its own, the work its steps
 * start, and its unloading and crash (decisions 0029, 0042). The step on one process is here, and the step on Cluster
 * is in [`doors.ts`](doors.ts).
 */
import * as Cause from 'effect/Cause'
import * as DateTime from 'effect/DateTime'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Fiber from 'effect/Fiber'
import * as MutableList from 'effect/MutableList'
import * as Queue from 'effect/Queue'
import type * as Scope from 'effect/Scope'
import * as Semaphore from 'effect/Semaphore'
import type * as Tracer from 'effect/Tracer'
import { answer, entities, wake } from './callers.ts'
import { applyOnCluster } from './doors.ts'
import * as Machine from '../machine.ts'
import {
  addressOf,
  at,
  type Callers,
  type Deployment,
  end,
  erased,
  type Evict,
  forgetUse,
  holding,
  linkKey,
  type Loaded,
  mark,
  observe,
  operated,
  type Passivate,
  type Process,
  reread,
  running,
  type Settle,
  spanHere,
  told,
  traced,
  under,
  forkApart,
  forkChildApart,
  untransacted,
} from './process.ts'
import { type Address, Entities, isTimer, runnerOf, type Types } from '../program.ts'
import { tell } from './readings.ts'
import { transaction } from '../storage.ts'

/**
 * Offers an event to a loaded entity, counted until its step is done (decision 0063), and the entity is the most
 * recently used, if it is still held (decision 0076).
 */
export const offer = <T extends Types>(p: Process, loaded: Loaded<T>, event: Machine.Offered<T> | Settle) =>
  Effect.sync(() => {
    // Raised and lowered by two fibers: raised by the fiber that offers the event, lowered by the entity's loop
    // once the event's step is done (decision 0063).
    loaded.pending += 1
    Queue.offerUnsafe(loaded.events, event)
    const address = addressOf(loaded.machine.stored)
    if (p.recent.get(address) !== erased(loaded)) return
    p.recent.delete(address)
    p.recent.set(address, erased(loaded))
  })

/**
 * An entity enters the process. Once the process holds more than its capacity, the least recently used of the
 * spare entities are told to leave, as many as it holds too many, the one entering aside. Their loops unload
 * them, each under its own lock: nothing here waits for another entity's lock while this one's is held
 * (decisions 0067, 0076).
 */
export const enter = <T extends Types>(p: Process, deployed: Deployment<T>, loaded: Loaded<T>) =>
  Effect.map(DateTime.now, (at) => admit(p, deployed, loaded, at))

/**
 * On Cluster, the entity enters the process only where its shard may be loaded here, which gives whether it
 * entered (decision 0162). The check and the entry are one step: a shard let go marks itself in a step that also
 * reads the entities held, so an entity either entered before the mark and is read, or finds the mark.
 */
export const entersHeld = <T extends Types>(p: Process, deployed: Deployment<T>, loaded: Loaded<T>) =>
  Effect.map(DateTime.now, (at) => {
    if (!loadable(p, deployed, loaded.machine.stored.id)) return false
    admit(p, deployed, loaded, at)
    return true
  })

/** The entity enters the process at `at`, as `enter` says. */
export const admit = <T extends Types>(p: Process, deployed: Deployment<T>, loaded: Loaded<T>, at: DateTime.Utc) => {
  const now = DateTime.toEpochMillis(at)
  deployed.loaded.set(loaded.machine.stored.id, loaded)
  p.recent.set(addressOf(loaded.machine.stored), erased(loaded))
  if (p.capacity === 'unbounded') return
  let over = p.recent.size - p.capacity
  for (const other of p.recent.values()) {
    if (over <= 0) return
    if (other === erased(loaded)) continue
    if (other.evicted) {
      over -= 1
    } else if (spare(other, now)) {
      other.evicted = true
      Queue.offerUnsafe(other.events, { _tag: 'Evict' })
      over -= 1
    }
  }
}

/**
 * On Cluster, whether the entity `id` may be loaded on this runner: Cluster routes its shard here, and the runtime
 * has not let the shard go since its singleton last started (decision 0162). Off Cluster, always.
 */
export const loadable = <T extends Types>(p: Process, deployed: Deployment<T>, id: string) => {
  if (p.cluster === null) return true
  const shard = p.cluster.shardOf(id)
  return p.cluster.holds(shard) && deployed.shards.get(shard) !== 'lost'
}

/** The work under a key stops: its fiber is interrupted, and nothing it would deliver is recorded. */
export const stop = (held: Map<string, Fiber.Fiber<void>>, id: string) =>
  Effect.suspend(() => {
    const fiber = held.get(id)
    if (fiber === undefined) return Effect.void
    held.delete(id)
    return Fiber.interrupt(fiber)
  })

/**
 * Stops the operation under `id` without waiting for it: a droppable one's finalizers are the runner's, and the
 * entity's next event does not wait behind them. A completion it offers before the interruption lands is dropped,
 * since the step that stopped it moved its incarnation on or dropped its key (decision 0128).
 */
export const drop = (p: Process, held: Map<string, Fiber.Fiber<void>>, id: string, scope: Scope.Scope) =>
  Effect.suspend(() => {
    const fiber = held.get(id)
    if (fiber === undefined) return Effect.void
    held.delete(id)
    return Effect.asVoid(forkApart(p.sql, Fiber.interrupt(fiber), scope))
  })

export const stopAll = <T extends Types>(loaded: Loaded<T>) =>
  Effect.gen(function*() {
    for (const id of [...loaded.operations.keys()]) yield* stop(loaded.operations, id)
    for (const id of [...loaded.timers.keys()]) yield* stop(loaded.timers, id)
  })

/**
 * Forks `effect` in `scope`, held under `id` while it runs. Nothing ended is counted as running (decision 0068):
 * the forking fiber may yield between the fork and the registration, and the fiber end meanwhile. So one that
 * has ended is never held, and its end is told after it has left `held`, in one step. The fork runs
 * `untransacted`, so that the statements of an operation go through the client's connection.
 */
export const forkHeld = (
  p: Process,
  held: Map<string, Fiber.Fiber<void>>,
  id: string,
  scope: Scope.Scope,
  effect: Effect.Effect<void>,
) =>
  Effect.gen(function*() {
    let done = false
    const fiber = yield* forkApart(
      p.sql,
      Effect.ensuring(
        effect,
        Effect.sync(() => {
          done = true
          held.delete(id)
          end(p)
        }),
      ),
      scope,
    )
    if (!done) held.set(id, fiber)
  })

/**
 * Starts an operation: its message is offered as a `Complete`, a defect of it as a `Die`. Its run is the span
 * `tea.operation`, a root span linked to `step`, the span of the step that started it, and is counted as running
 * (decision 0220).
 */
export const start = <T extends Types>(
  p: Process,
  deployed: Deployment<T>,
  loaded: Loaded<T>,
  entity: Address,
  output: Extract<Machine.Output<T>, { _tag: 'Started' }>,
  step: Tracer.AnySpan | undefined,
) =>
  Effect.gen(function*() {
    const { key, incarnation, idempotencyKey, operation } = output
    const runner = runnerOf(deployed.program, operation)
    // The machine admitted the operation with the deployed program's runners, which stepped it (decision
    // 0064): an operation with none is the runtime's, and crashes the entity (decision 0061).
    if (runner === undefined) {
      return yield* Effect.die(
        new Error(`the deployed program '${deployed.program.name}' has no runner for '${operation._tag}'`),
      )
    }
    // Built in the operation's fiber: a runner that throws while it builds its effect dies as the operation,
    // and suspends the entity, instead of the event that started it (decision 0042).
    const run = Effect.withSpan(
      Effect.suspend(() =>
        runner.delivery === 'Idempotent' || runner.delivery === 'IdempotentDigest'
          ? runner.run(operation, idempotencyKey)
          : runner.run(operation)
      ),
      'tea.operation',
      {
        root: true,
        captureStackTrace: false,
        links: step === undefined ? [] : [{ span: step, attributes: {} }],
        attributes: {
          'tea.entity.name': entity.name,
          'tea.entity.id': entity.id,
          'tea.key': Machine.shownKey(key),
          'tea.incarnation': incarnation,
          'tea.operation': operation._tag,
          'tea.delivery': runner.delivery,
        },
      },
    )
    const id = under(key, incarnation)
    // An operation that runs again at the next activation is not started during a planned stop: it is stored,
    // and starts there. An at-most-once one is started, since one stored and never started would deliver its
    // `unknown` without having run (decision 0119).
    if (runner.delivery !== 'AtMostOnce') {
      if (p.draining) return
      loaded.rerun.add(id)
    }
    yield* forkHeld(p, 
      loaded.operations,
      id,
      deployed.scope,
      deployed.run(
        Effect.gen(function*() {
          // Counted by an acquisition, which no interruption parts from its release: a fiber stopped before its
          // first step runs neither (decision 0110).
          const exit = yield* Effect.exit(Effect.acquireUseRelease(
            running(deployed, 1),
            () => Effect.ensuring(run, Effect.sync(() => loaded.rerun.delete(id))),
            () => running(deployed, -1),
          ))
          if (exit._tag === 'Success') {
            yield* offer(p, loaded, { _tag: 'Complete', key, incarnation, message: exit.value })
          } else if (!Cause.hasInterruptsOnly(exit.cause)) {
            yield* offer(p, loaded, { _tag: 'Die', key, incarnation, cause: Cause.squash(exit.cause) })
          }
        }).pipe(
          // The requests it sends are this run's: an entity cannot pass for another, nor an operation for
          // another (decisions 0009, 0060).
          Effect.provideService(Entities, entities(p, entity, key, incarnation, runner.delivery === 'Droppable')),
        ),
      ),
    )
  })

/**
 * Arms a timer: its time comes on the wall clock, and `Fire` is offered. A passivated entity would be woken by `due`
 * instead. The timer sleeps `reread` at most at a time, and reads the wall clock after each sleep: a host suspended
 * fires it late by `reread` at most, and a clock set back fires it at its time, never before (decision 0221).
 */
export const arm = <T extends Types>(
  p: Process,
  deployed: Deployment<T>,
  loaded: Loaded<T>,
  output: Extract<Machine.Output<T>, { _tag: 'Armed' }>,
) =>
  Effect.gen(function*() {
    const { key, incarnation, timer } = output
    // A planned stop arms no timer: the stored time wakes the entity in the next process (decision 0119).
    if (p.draining) return
    const until = DateTime.toEpochMillis(timer.at)
    let left = Math.max(0, until - DateTime.toEpochMillis(yield* DateTime.now))
    yield* forkHeld(p, 
      loaded.timers,
      under(key, incarnation),
      deployed.scope,
      Effect.gen(function*() {
        do {
          yield* Effect.sleep(`${Math.min(left, reread)} millis`)
          left = until - DateTime.toEpochMillis(yield* DateTime.now)
        } while (left > 0)
        yield* offer(p, loaded, { _tag: 'Fire', key, incarnation })
      }),
    )
  })

export const perform = <T extends Types>(
  p: Process,
  deployed: Deployment<T>,
  loaded: Loaded<T>,
  entity: Address,
  event: Machine.Event<T>,
  outputs: ReadonlyArray<Machine.Output<T>>,
  step: Tracer.AnySpan | undefined,
) =>
  Effect.gen(function*() {
    // The callers first: a reply is what the event's commit made true (decision 0023).
    for (const output of outputs) {
      if (output._tag !== 'Replied' && output._tag !== 'CreationReplied') continue
      // A caller waits for the answer of its request with what it carried (decision 0269).
      const request = output._tag === 'Replied'
        ? Machine.messageKey(deployed.program, output.request, output.message)
        : Machine.creationKey(deployed.program, output.request, output.flags)
      loaded.links.delete(linkKey(output._tag === 'CreationReplied', request))
      yield* output._tag === 'Replied'
        ? answer(p, p.messages, entity, request, output.reply)
        : answer(p, p.creations, entity, request, output.reply)
    }
    yield* at(p, 'AfterReply', entity, event)
    for (const output of outputs) {
      switch (output._tag) {
        case 'Started':
          yield* start(p, deployed, loaded, entity, output, step)
          break
        case 'Armed':
          yield* arm(p, deployed, loaded, output)
          break
        case 'Disarmed':
          yield* stop(loaded.timers, under(output.key, output.incarnation))
          yield* drop(p, loaded.operations, under(output.key, output.incarnation), deployed.scope)
          break
        case 'Suspended':
          // The timers stop. The operations run to their end, and their completions are recorded behind the
          // message the entity died on (decision 0113).
          for (const id of [...loaded.timers.keys()]) yield* stop(loaded.timers, id)
          break
        default:
          // The replies, `Recorded`, `Delivered` and `Dropped` are what the commit already said.
          break
      }
    }
  })

/**
 * Logs a warning for a step that wrote more than the threshold, once per activation of the entity, so that a
 * large entity does not log at every step. A step under the threshold does nothing, and yields nowhere
 * (decision 0135).
 */
export const warnOfSize = <T extends Types>(
  p: Process,
  loaded: Loaded<T>,
  entity: Address,
  characters: number,
): Effect.Effect<void> => {
  if (characters <= p.threshold || loaded.warned) return Effect.void
  loaded.warned = true
  return Effect.logWarning('a step wrote a large state; the program may split it into entities').pipe(
    Effect.annotateLogs({ name: entity.name, id: entity.id, characters, threshold: p.threshold }),
  )
}

/**
 * One event: the machine's step, written in one transaction, then acted on. A crash at any of the points
 * leaves the entity as the crash table says. A message is given the reply stored under its request, read here,
 * where no other event of the entity is applied: the machine holds none (decision 0065). It is given the time
 * too, at which it is handled if the mailbox is empty (decision 0074).
 */
export const apply = <T extends Types>(
  p: Process,
  deployed: Deployment<T>,
  loaded: Loaded<T>,
  offered: Machine.Offered<T> | Settle,
): Effect.Effect<void> =>
  p.cluster !== null
    ? applyOnCluster(p, deployed, loaded, offered)
    : offered._tag === 'Settle'
    ? Effect.void
    : traced(loaded.machine.stored, offered, linkOf(deployed, loaded, offered))(
      applyInProcess(p, deployed, loaded, offered),
    )

/**
 * The span of the caller whose request the event brings, on one process: a `Receive`'s or a `Create`'s. No other
 * step serves a caller's request here. A message that arrives with an empty mailbox is handled by its `Receive`, the
 * loop empties the mailbox before it takes an event, and a suspended entity queues no message (decision 0220).
 */
export const linkOf = <T extends Types>(deployed: Deployment<T>, loaded: Loaded<T>, offered: Machine.Offered<T>) =>
  offered._tag === 'Receive'
    ? loaded.links.get(linkKey(false, Machine.messageKey(deployed.program, offered.request, offered.message)))
    : offered._tag === 'Create'
    ? loaded.links.get(linkKey(true, Machine.creationKey(deployed.program, offered.request, offered.flags)))
    : undefined

export const applyInProcess = <T extends Types>(
  p: Process,
  deployed: Deployment<T>,
  loaded: Loaded<T>,
  offered: Machine.Offered<T>,
): Effect.Effect<void> =>
  Effect.gen(function*() {
    loaded.applying = true
    const entity: Address = { name: loaded.machine.stored.name, id: loaded.machine.stored.id }
    const now = yield* DateTime.now
    const found = offered._tag === 'Receive'
      ? yield* deployed.storage.reply(entity.id, offered.request, DateTime.toEpochMillis(now))
      : null
    const event: Machine.Event<T> = offered._tag === 'Receive'
      ? { ...offered, reply: found?.reply ?? null, carried: found?.carried ?? null, at: now }
      : offered
    const before = loaded.machine
    const transition = Machine.step(deployed.program, before, event)
    const { written } = transition
    if (written !== null) {
      yield* at(p, 'BeforeCommit', entity, event)
      // What the event writes is the machine's, encoded: the storage decides nothing (decision 0057).
      const characters = yield* transaction(
        p.sql,
        deployed.storage.write(entity.id, written, DateTime.toEpochMillis(now)),
      ).pipe(Effect.orDie)
      tell(p.readings, entity.name, written)
      yield* warnOfSize(p, loaded, entity, characters)
    }
    loaded.machine = transition.machine
    // After the commit: the step is told and counted at once.
    yield* Effect.flatten(told(entity, before, transition.machine, transition.outputs, written !== null))
    if (before.stored.suspension !== null && transition.machine.stored.suspension === null) {
      wake(p, entity)
    }
    if (event._tag === 'Resume' || event._tag === 'Discard') {
      const line = p.operators.get(addressOf(entity))
      const operator = line === undefined ? MutableList.Empty : MutableList.take(line)
      if (line?.length === 0) p.operators.delete(addressOf(entity))
      if (operator !== MutableList.Empty) {
        yield* Deferred.succeed(operator, operated(event._tag, before, transition.machine))
      }
    }
    // An event is observed once it is written, and before anything is acted on; one that writes nothing is
    // observed at once. A crash before the commit leaves no event, and one after it an event that happened.
    yield* observe(p, entity, event)
    if (written !== null) yield* at(p, 'AfterCommit', entity, event)
    yield* perform(p, deployed, loaded, entity, event, transition.outputs, yield* spanHere)
  }).pipe(Effect.ensuring(Effect.sync(() => {
    loaded.applying = false
    end(p)
  })))

/**
 * Whether the entity has nothing to do: no event waiting or being applied, no message to handle, and nothing
 * but timers left of what its state holds (decision 0029).
 */
export const nothingToDo = <T extends Types>(loaded: Loaded<T>) => {
  const { stored } = loaded.machine
  if (loaded.applying || loaded.pending > 0 || loaded.operations.size > 0) return false
  // On Cluster, a door's step not known to be committed may have stored work the machine held does not show yet.
  // An entity unloaded then would leave that work to nothing in this process (decision 0252).
  if (loaded.uncommitted !== null) return false
  // A suspended entity whose operations have ended handles nothing, and comes back suspended, with the message
  // it died on and the completions behind it (decisions 0006, 0113).
  if (stored.suspension !== null) return true
  if (stored.mailbox.length > 0) return false
  // What the state holds is what the next activation starts, so only timers may be left: an operation with
  // nothing running for it would come back as its `unknown`, and an at-most-once one would lose its act.
  return Object.values(stored.keys).every((key) => isTimer(key.work))
}

/**
 * Whether the entity may leave a process over its capacity: it has nothing to do, and no timer of its is due by
 * `now`. A timer due is a firing about to be offered, and an entity woken for it would be unloaded before it
 * fires, and woken again (decision 0078).
 */
export const spare = <T extends Types>(loaded: Loaded<T>, now: number) => {
  const { stored } = loaded.machine
  if (!nothingToDo(loaded)) return false
  // A suspended entity's timers are not armed, and nothing of it fires (decision 0029).
  if (stored.suspension !== null) return true
  return Object.values(stored.keys).every((key) =>
    !isTimer(key.work) || DateTime.toEpochMillis(key.work.at) > now
  )
}

/**
 * The entity leaves this process, and the waker is told in the same step (decision 0068). So there is no
 * moment at which its timers are neither armed here nor counted among the stored ones: a reading of the stored
 * timers that left the entity out as held is made again, and one made after counts them. The waker's flag and
 * its poke are set together, and the waker clears them in one step too, so the process is never settled with a
 * poke nobody has taken.
 */
export const leave = <T extends Types>(p: Process, deployed: Deployment<T>, loaded: Loaded<T>) =>
  Effect.sync(() => {
    const { id } = loaded.machine.stored
    if (deployed.loaded.get(id) === loaded) deployed.loaded.delete(id)
    forgetUse(p, loaded)
    deployed.waker.busy = true
    Queue.offerUnsafe(deployed.waker.poke, undefined)
    end(p)
  })

/**
 * Unloads the entity: its timers stop, and what the state holds is what wakes it again — to the machine a
 * `Restart`, a crash this process chose (decision 0029). Under the entity's lock, so that no caller is between
 * finding the entity and offering its event; it gives whether the entity is gone. One told to leave a process
 * over its capacity is unloaded only if it is spare at `evicted`, the time its loop takes that (decision 0078).
 */
export const unload = <T extends Types>(
  p: Process,
  deployed: Deployment<T>,
  loaded: Loaded<T>,
  evicted: number | null,
) =>
  holding(p, loaded.machine.stored)(Effect.gen(function*() {
    const { id } = loaded.machine.stored
    const leaves = evicted === null ? nothingToDo(loaded) : spare(loaded, evicted)
    if (!leaves || deployed.loaded.get(id) !== loaded) return false
    // Counted from before it leaves: once it has, nothing else keeps the process from being settled. `a process
    // over its capacity unloads its least recently used idle entity`, in the tests, reaches it (decision 0109).
    yield* Effect.acquireUseRelease(
      Effect.sync(() => {
        p.leaving += 1
      }),
      () =>
        Effect.gen(function*() {
          yield* leave(p, deployed, loaded)
          // A timer that fires between here and its interruption delivers nothing, and the stored time stands.
          yield* stopAll(loaded)
          yield* p.probe({ _tag: 'Unloaded', entity: { name: deployed.program.name, id } })
        }),
      () =>
        Effect.sync(() => {
          p.leaving -= 1
          end(p)
        }),
    )
    return true
  }))

/**
 * An event the runtime could not finish is a crash of its entity alone: a write that failed, a probe that
 * died. The entity leaves this process, its work stops, and its waiting callers are given the defect, to
 * retry. What is stored is what its next activation starts from, as after a crash of the process. Called
 * where the entity's lock is held, so that no caller is between finding the entity and offering its event
 * (decisions 0042, 0067). The interruption of its work is forked: it waits for the operations' finalizers,
 * and nothing else waits for them under the lock (decision 0056). The waker activates the entity again after
 * `retry`, unless the entity leaves for another runner (decision 0252).
 */
export const crash = <T extends Types>(
  p: Process,
  deployed: Deployment<T>,
  loaded: Loaded<T>,
  cause: Cause.Cause<never>,
  retried: boolean = true,
) =>
  Effect.gen(function*() {
    const { name, id } = loaded.machine.stored
    // Every crash is marked, whatever the machine held shows: on Cluster it may be a step ahead of what is stored,
    // and the activation reads what is (decision 0252). The mark is set before `leave` wakes the waker.
    if (retried) mark(deployed.waker, id, DateTime.toEpochMillis(yield* DateTime.now) + p.retry, { works: true })
    // Its stored timers are the waker's again. A crash may run where the step that died cannot be interrupted, as
    // a creation's `onError` does: `forkApart` keeps it stoppable by the scope (decision 0271).
    yield* leave(p, deployed, loaded)
    yield* forkApart(p.sql, stopAll(loaded), deployed.scope)
    const address = addressOf({ name, id })
    const fail = <A>(waiting: Callers<A>) =>
      Effect.gen(function*() {
        const requests = waiting.get(address)
        waiting.delete(address)
        for (const callers of requests?.values() ?? []) {
          for (const caller of callers) yield* Deferred.failCause(caller, cause)
        }
      })
    yield* fail(p.messages)
    yield* fail(p.creations)
    const line = p.operators.get(address)
    p.operators.delete(address)
    for (const operator of line === undefined ? [] : MutableList.takeAll(line)) {
      yield* Deferred.failCause(operator, cause)
    }
  })

/**
 * The entity's loop. While its mailbox holds a message, it is handled, one transaction each. Otherwise the
 * loop waits for an event. The entity is unloaded if none comes for long enough, or once it is told to leave
 * a process over its capacity (decision 0076). A suspended entity handles nothing, and waits (decisions 0006,
 * 0113). The wait times out, never the take: an event taken is always applied. A loop that dies crashes its
 * entity, and an interruption is the process's crash (decision 0042).
 */
export const loop = <T extends Types>(p: Process, deployed: Deployment<T>, loaded: Loaded<T>): Effect.Effect<void> =>
  steps(p, deployed, loaded).pipe(
    Effect.catchCause((cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.failCause(cause)
        : holding(p, loaded.machine.stored)(crash(p, deployed, loaded, cause))
    ),
  )

export const steps = <T extends Types>(p: Process, deployed: Deployment<T>, loaded: Loaded<T>): Effect.Effect<void> => {
  const handles = () => loaded.machine.stored.suspension === null && loaded.machine.stored.mailbox.length > 0
  // The loop yields after a step that leaves it more to do, so that another entity steps between two of this
  // one's. Effect yields a fiber after a count of operations, and a step whose encoding and write take long is
  // few operations. A loop with nothing to do starts its wait at once, so that `settled` finds the wait's sleep
  // started (decision 0134).
  const again: Effect.Effect<void> = Effect.suspend(() =>
    handles() || Queue.sizeUnsafe(loaded.events) > 0 ? Effect.andThen(Effect.yieldNow, next) : next
  )
  const next: Effect.Effect<void> = Effect.suspend(() => {
    // On Cluster an entity leaves the process by a crash its loop does not make: a shard let go, or a door that
    // found its row written by another runner. Its loop then ends, since a step of it would write for an entity
    // another runner may hold (decision 0162).
    if (p.cluster !== null && deployed.loaded.get(loaded.machine.stored.id) !== loaded) return Effect.void
    if (handles()) {
      return DateTime.now.pipe(
        Effect.flatMap((now) => apply(p, deployed, loaded, { _tag: 'Handle', at: now })),
        Effect.flatMap(() => again),
      )
    }
    // The wait's end is put in the queue by a sleep of its own, and the take is raced against nothing: a take a
    // timeout interrupts can lose the event it took (decision 0116). The sleep is the loop's child, and ends with it.
    const wait = ++loaded.waits
    const runsOut = Effect.andThen(
      Effect.sleep(`${p.passivate} millis`),
      Effect.sync(() => Queue.offerUnsafe(loaded.events, { _tag: 'Passivate', wait })),
    )
    // An end an earlier wait's sleep put there, just before the event that ended that wait, is passed over.
    const take: Effect.Effect<Machine.Offered<T> | Evict | Passivate | Settle> = Effect.flatMap(
      Queue.take(loaded.events),
      (taken) => taken._tag === 'Passivate' && taken.wait !== wait ? take : Effect.succeed(taken),
    )
    return Effect.flatMap(forkChildApart(p.sql, runsOut), (sleep) =>
      Effect.flatMap(take, (taken) => Effect.as(Fiber.interrupt(sleep), taken))).pipe(
      Effect.flatMap((taken) => {
        // The wait ran out, or the entity was told to leave: it is unloaded if it has nothing to do.
        const event = taken._tag === 'Passivate' ? null : taken
        if (event === null || event._tag === 'Evict') {
          // On Cluster, a machine a door's step left uncommitted keeps the entity from leaving until a step
          // settles it: a lost `afterCommit` callback, or a rollback, leaves no other step to. So the loop settles
          // first, and decides from the settled machine (decision 0161).
          const evicted = event === null ? Effect.succeed(null) : Effect.map(DateTime.now, DateTime.toEpochMillis)
          const unloaded = Effect.flatMap(evicted, (now) => unload(p, deployed, loaded, now))
          const settled = p.cluster !== null && loaded.uncommitted !== null
            ? Effect.andThen(apply(p, deployed, loaded, { _tag: 'Settle' }), unloaded)
            : unloaded
          return Effect.flatMap(settled, (gone) =>
            Effect.suspend(() => {
              // One told to leave that has something to do by now stays, and may be told again.
              if (event !== null) {
                loaded.evicted = false
                end(p)
              }
              return gone ? Effect.void : next
            }))
        }
        return Effect.flatMap(
          apply(p, deployed, loaded, event).pipe(Effect.ensuring(Effect.andThen(
            // The permit first: a process settled holds no permit of a message applied (decision 0147).
            event._tag === 'Receive' ? loaded.callers.release(1) : Effect.void,
            Effect.sync(() => {
              // Raised and lowered by two fibers: raised by the fiber that offered the event, lowered here by the loop.
              loaded.pending -= 1
              end(p)
            }),
          ))),
          () => again,
        )
      }),
    )
  })
  return next
}

/** A loaded entity at `machine`, which `steps` steps had written when it was stepped, with nothing running. */
export const fresh = <T extends Types>(p: Process, machine: Machine.Machine<T>, steps: number) =>
  Effect.map(Queue.unbounded<Machine.Offered<T> | Evict | Passivate | Settle>(), (events): Loaded<T> => ({
    machine,
    applying: false,
    events,
    evicted: false,
    waits: 0,
    pending: 0,
    operations: new Map(),
    rerun: new Set(),
    timers: new Map(),
    warned: false,
    callers: Semaphore.makeUnsafe(p.bound),
    refused: false,
    links: new Map(),
    steps,
    uncommitted: null,
  }))

/** Registers an entity in this process, and activates what was stored, as after a crash. */
export const activate = <T extends Types>(p: Process, deployed: Deployment<T>, stored: Machine.Stored<T>) =>
  Effect.gen(function*() {
    const loaded = yield* fresh<T>(p, { stored, running: {} }, 0)
    yield* enter(p, deployed, loaded)
    // Before anything else: the stored state says what runs (decision 0003). An activation that cannot finish
    // leaves nothing loaded, and its caller gets the defect (decision 0042). It runs detached from its caller,
    // so an interruption is the process's crash (decision 0079).
    yield* apply(p, deployed, loaded, { _tag: 'Restart' }).pipe(
      Effect.onError((cause) => Cause.hasInterruptsOnly(cause) ? Effect.void : crash(p, deployed, loaded, cause)),
    )
    yield* forkApart(p.sql, loop(p, deployed, loaded), deployed.scope)
    return loaded
  })

/**
 * Runs `effect` in the deployment's scope, and waits for it. A caller that gives up stops waiting, and what the
 * effect sets going is finished all the same: an activation, a creation and its work. Only the process's crash
 * stops it halfway, as the crash table says (decision 0079). It is counted from the step that forks it to its
 * end, so that the process is not settled while it runs. The step is uninterruptible, and the fibers it forks
 * are not, since `forkApart` forks them interruptible, so the scope still stops them (decision 0271).
 * The count is given back by a fiber of the process's scope that waits for it, since one the deployment's
 * scope stops before its first step runs no finalizer of its own (decision 0110).
 */
export const detached = <T extends Types, A, E>(p: Process, deployed: Deployment<T>, effect: Effect.Effect<A, E>) =>
  Effect.flatMap(
    Effect.uninterruptible(Effect.gen(function*() {
      // Raised and lowered by two fibers: the caller raises it, uninterruptible with the fork, and a fiber of the
      // process's scope lowers it once the effect ends, since a fiber stopped before its first step runs no
      // finalizer (decision 0110).
      p.detachments += 1
      const fiber = yield* forkApart(p.sql, effect, deployed.scope)
      yield* forkApart(
        p.sql,
        Effect.andThen(
          Fiber.await(fiber),
          Effect.sync(() => {
            // Raised and lowered by two fibers: raised by the caller of `detached`, lowered here once the effect ends.
            p.detachments -= 1
            end(p)
          }),
        ),
        p.running,
      )
      return fiber
    })),
    Fiber.join,
  )

/**
 * Runs `found` on the entity `id` of `deployed`, while the entity is held. The entity is loaded from storage
 * when this process does not hold it. Its lock is what keeps it from being unloaded meanwhile, and what makes
 * a caller of an entity being activated wait for that activation (decisions 0029, 0067). An entity held is
 * found in the caller's fiber. One to load is loaded detached from it, with `found`, under the same hold of its
 * lock: so the entity is never unloaded between its activation and its caller's event (decision 0079).
 */
export const withEntity = <T extends Types, A>(
  p: Process,
  deployed: Deployment<T>,
  id: string,
  found: (loaded: Loaded<T> | null) => Effect.Effect<A>,
) => {
  const held = holding(p, { name: deployed.program.name, id })
  const loading = held(Effect.gen(function*() {
    const loaded = deployed.loaded.get(id)
    if (loaded !== undefined) return yield* found(loaded)
    const stored = yield* deployed.storage.load(id)
    return yield* found(stored === null ? null : yield* activate(p, deployed, stored))
  }))
  return Effect.flatMap(
    held(Effect.suspend(() => {
      const loaded = deployed.loaded.get(id)
      return loaded === undefined ? Effect.succeed(null) : Effect.map(found(loaded), (value) => ({ value }))
    })),
    (here) => here === null ? detached(p, deployed, loading) : Effect.succeed(here.value),
  )
}

/** Loads the entity `id` into this process, if it is stored and this process does not hold it already. */
export const loads = <T extends Types>(p: Process, deployed: Deployment<T>, id: string) =>
  withEntity(p, deployed, id, () => Effect.void)
