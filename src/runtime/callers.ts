/**
 * The callers of an entity: a caller's `create` and `send`, an operator's `resume` and `discard`, and the `Entities`
 * an operation sends with. A caller is registered before its event is offered, and waits for the reply the entity's
 * step gives (decisions 0023, 0042).
 */
import * as Cause from 'effect/Cause'
import * as Data from 'effect/Data'
import * as DateTime from 'effect/DateTime'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as MutableList from 'effect/MutableList'
import { activate, crash, detached, enter, fresh, loop, offer, perform, warnOfSize, withEntity } from './loop.ts'
import * as Machine from '../machine.ts'
import {
  addressOf,
  at,
  type Callers,
  type Deployment,
  deployment,
  holding,
  linkKey,
  type Loaded,
  observe,
  type Process,
  spanHere,
  told,
  traced,
  untransacted,
} from './process.ts'
import {
  type Address,
  type Creation,
  type Flagged,
  encode,
  Entities,
  idFault,
  InvariantDefect,
  type Key,
  type Receiver,
  type Reply,
  type Request,
  type Reused,
  type Types,
  versionOf,
} from '../program.ts'
import { tell } from './readings.ts'
import { transaction } from '../storage.ts'
import type { Answer, Operated } from '../runtime.ts'

/**
 * A defect that is its caller's, not the receiver's: a message or flags that do not encode, a creation that
 * `init` dies on. Every caller is given it as a defect, and an operation is suspended on it; any other defect of a
 * delivery is the receiver's crash, which an operation sends again after (decision 0046).
 */
export class Faulted extends Data.TaggedError('Faulted')<Readonly<{ defect: unknown }>> {}

export const faulted = <A>(effect: Effect.Effect<A, Faulted>): Effect.Effect<A> =>
  Effect.catchTag(effect, 'Faulted', (fault) => Effect.die(fault.defect))

export const answer = <A>(p: Process, waiting: Callers<A>, entity: Address, request: string, reply: A) =>
  Effect.suspend(() => {
    const requests = waiting.get(addressOf(entity))
    const callers = requests?.get(request)
    if (requests === undefined || callers === undefined) return Effect.void
    requests.delete(request)
    if (requests.size === 0) waiting.delete(addressOf(entity))
    return Effect.forEach(callers, (caller) => Deferred.succeed(caller, reply), { discard: true })
  })

/** A caller registered and waiting: its event is offered, and the reply comes to `caller`. */
export interface Asked<A> {
  readonly caller: Deferred.Deferred<A>
  readonly forget: Effect.Effect<void>
}

/**
 * Registers a caller and offers its event. It is done while the entity is held — its lock — so that an entity
 * is never unloaded between a caller finding it and its event being offered (decisions 0029, 0067).
 */
export const ask = <T extends Types, A>(
  p: Process,
  waiting: Callers<A>,
  loaded: Loaded<T>,
  entity: Address,
  request: string,
  event: Machine.Offered<T>,
): Effect.Effect<Asked<A>> =>
  Effect.gen(function*() {
    const address = addressOf(entity)
    const caller = yield* Deferred.make<A>()
    const requests = waiting.get(address) ?? new Map<string, Set<Deferred.Deferred<A>>>()
    const callers = requests.get(request) ?? new Set<Deferred.Deferred<A>>()
    callers.add(caller)
    requests.set(request, callers)
    waiting.set(address, requests)
    // A caller that gives up leaves nothing behind: its message is applied once, whichever retry finds it.
    const forget = Effect.sync(() => {
      const current = waiting.get(address)
      const held = current?.get(request)
      if (current === undefined || held === undefined) return
      held.delete(caller)
      if (held.size > 0) return
      current.delete(request)
      if (current.size === 0) waiting.delete(address)
    })
    // The caller's span, which the steps of its request link (decision 0220).
    const span = yield* spanHere
    if (span !== undefined) loaded.links.set(linkKey(event._tag === 'Create', request), span)
    yield* offer(p, loaded, event)
    return { caller, forget }
  })

/** Wakes every sender waiting for the entity's resumption: it sends again, and is answered (decision 0063). */
export const wake = (p: Process, entity: Address) => {
  const address = addressOf(entity)
  const senders = p.resumptions.get(address)
  if (senders === undefined) return
  p.resumptions.delete(address)
  for (const sender of senders) Deferred.doneUnsafe(sender, Effect.void)
}

/**
 * Registers a sender's wait for the entity's resumption, before it sends. `resumed` is what it waits on if it
 * is answered `Suspended`, and `forget` takes it back whatever it is answered. A registration made after the
 * answer would miss a resumption between the two, and wait for ever. `a sender answered Suspended is woken by
 * the resumption`, in the tests, reaches that under the scheduler of the tests (decision 0104), and a test on two
 * runners of Cluster reaches it with `Resumed` (decision 0172). What `suspended` lists is stored by the step that
 * answers, not read from here (decision 0265).
 */
export const awaitResumption = (p: Process, entity: Address) =>
  Effect.sync(() => {
    const address = addressOf(entity)
    const sender = Deferred.makeUnsafe<void>()
    const senders = p.resumptions.get(address) ?? new Set<Deferred.Deferred<void>>()
    senders.add(sender)
    p.resumptions.set(address, senders)
    const forget = Effect.sync(() => {
      senders.delete(sender)
      if (senders.size === 0 && p.resumptions.get(address) === senders) p.resumptions.delete(address)
    })
    return { resumed: Deferred.await(sender), forget }
  })

/** Waits for the reply the entity stores or gives, and leaves nothing registered. */
export const answered = <A>({ caller, forget }: Asked<A>) => Effect.onExit(Deferred.await(caller), () => forget)

/** Logs a warning at the first refusal of an activation, so that a burst does not log once per caller. */
export const warnOfFull = <T extends Types>(p: Process, loaded: Loaded<T>, entity: Address): Effect.Effect<void> => {
  if (loaded.refused) return Effect.void
  loaded.refused = true
  return Effect.logWarning("an entity holds as many callers' messages as its bound; its callers are answered Full")
    .pipe(Effect.annotateLogs({ name: entity.name, id: entity.id, messages: p.bound }))
}

/**
 * An operator's `Resume` or `Discard`: offered while the entity is held, as a caller's message is, and answered
 * with what it did once applied (decision 0114). On Cluster it is sent through the door's client, and stepped in
 * the door's transaction (decision 0166).
 */
export const operate = <T extends Types>(
  p: Process,
  deployed: Deployment<T>,
  id: string,
  event: Extract<Machine.Offered<T>, { _tag: 'Resume' | 'Discard' }>,
): Effect.Effect<Operated> =>
  p.cluster !== null ? p.cluster.operate(deployed.program, { _tag: event._tag, id }) : Effect.flatMap(
    withEntity(p, deployed, id, (loaded): Effect.Effect<Deferred.Deferred<Operated> | null> =>
      loaded === null ? Effect.succeed(null) : Effect.uninterruptible(Effect.gen(function*() {
        // Registered and offered under the entity's lock, and in one step: the line keeps the order of the
        // events, and an interruption cannot leave in it an operator whose event was never offered.
        const operator = yield* Deferred.make<Operated>()
        const address = addressOf({ name: deployed.program.name, id })
        const line = p.operators.get(address) ?? MutableList.make<Deferred.Deferred<Operated>>()
        MutableList.append(line, operator)
        p.operators.set(address, line)
        yield* offer(p, loaded, event)
        return operator
      }))),
    (operator) => operator === null ? Effect.succeed<Operated>({ _tag: 'NotFound' }) : Deferred.await(operator),
  )

/**
 * On Cluster: what keeps the Cluster id of an operation's request before its client resets a failure Cluster
 * saved, in a transaction of its own (decision 0170). The transaction checks no lease, since it writes an id and no
 * state. A caller's message keeps its id once given its answer, by `given` (decision 0171).
 */
export const keptFor = <T extends Types>(p: Process, deployed: Deployment<T>, request: Request<T['sender']>) =>
  request._tag === 'Operation'
    ? (requestId: string) => transaction(p.sql, deployed.storage.keepSent(requestId, request)).pipe(Effect.orDie)
    : undefined

export const create = <T extends Types>(
  p: Process,
  deployed: Deployment<T>,
  id: string,
  flags: T['flags'],
  request: Request<T['sender']>,
): Effect.Effect<Creation<T['rejection']> | Reused, Faulted> =>
  Effect.gen(function*() {
    const entity: Address = { name: deployed.program.name, id }
    // A caller's creation is stored under its sender, which a sender that does not encode cannot be: the
    // caller's defect, as for a message (decisions 0040, 0048). So are flags that do not encode, whether the
    // entity exists or not (decision 0049).
    const { requested, written } = yield* Effect.try({
      try: () => {
        const written = encode(deployed.program.schemas.flags, flags, 'value of the flags')
        if (request._tag === 'Caller') encode(deployed.program.schemas.sender, request.sender, 'sender')
        return { requested: Machine.requestKey(deployed.program, request), written }
      },
      catch: (defect) => new Faulted({ defect }),
    })
    // On Cluster a creation, a caller's or an operation's, goes through the door's client (decisions 0165, 0167).
    if (p.cluster !== null) {
      const version = versionOf(deployed.program)
      const sent = { id, version, request: requested, message: JSON.stringify(written) }
      // A caller's creation keeps its Cluster id for the least time Cluster's client gives, as a `keep` of 0 does, so
      // that a step or `expire` deletes Cluster's rows of it once every client of the request has read the answer. A
      // retry after reaches the door again, and the machine answers it from the entity's row (decisions 0017, 0245,
      // 0248). An operation's go with its work.
      const given = request._tag === 'Caller'
        ? (requestId: string, least: number) =>
          Effect.flatMap(
            DateTime.now,
            (now) => deployed.storage.keepGiven(requestId, id, DateTime.toEpochMillis(now) + least),
          )
        : undefined
      return yield* p.cluster.create(deployed.program, sent, keptFor(p, deployed, request), given)
    }
    // Detached from the caller: a creation committed is always started, and its entity loaded (decision 0079).
    const asked = yield* detached(p, deployed, holding(p, entity)(Effect.gen(function*() {
      // An operation is given again the rejection a run before it was given, which no entity stores, so that a run
      // after a crash acts on the same answer (decision 0253).
      if (request._tag === 'Operation') {
        const kept = yield* deployed.storage.answer(id, 'Create', request)
        if (kept?._tag === 'Rejected') return kept
      }
      const held = deployed.loaded.get(id) ?? null
      const creating: Machine.Offered<T> = { _tag: 'Create', request, flags }
      // A caller waits for the answer of its request with the flags it carried (decision 0269).
      const waited = Machine.creationKey(deployed.program, request, flags)
      // The entity was already there: the machine answers the request from what is stored (decision 0017).
      if (held !== null) {
        return { _tag: 'Asked', asked: yield* ask(p, p.creations, held, entity, waited, creating) } as const
      }
      const stored = yield* deployed.storage.load(id)
      if (stored !== null) {
        const loaded = yield* activate(p, deployed, stored)
        return { _tag: 'Asked', asked: yield* ask(p, p.creations, loaded, entity, waited, creating) } as const
      }
      // The creation is a step of its own, linked to its caller's span (decision 0220). The entity's loop is forked
      // past the step's span, which would otherwise parent what the loop runs outside its steps.
      const made = yield* traced(entity, { _tag: 'Create' }, yield* spanHere)(Effect.gen(function*() {
        const now = yield* DateTime.now
        const started = Machine.start(deployed.program, id, flags, now, request)
        // A defect at creation stores nothing (decision 0014): its creator is given the defect itself, and a
        // retry after a fix creates the entity (decision 0124).
        if (started._tag === 'Defect') return yield* Effect.fail(new Faulted({ defect: started.cause }))
        // A creation `init` rejects stores nothing, and its reply is not stored either: a caller's retry runs `init`
        // again (decision 0182). An operation's is kept for its work before it is given (decision 0253).
        if (started._tag === 'Rejected') {
          if (request._tag === 'Operation') {
            yield* transaction(p.sql, deployed.storage.keepAnswer(id, 'Create', request, started.reply))
              .pipe(Effect.orDie)
          }
          return { _tag: 'Rejected', reply: started.reply } as const
        }
        const loaded = yield* fresh<T>(p, started.machine, 0)
        const creation: Machine.Event<T> = { _tag: 'Create', request, flags }
        yield* at(p, 'BeforeCommit', entity, creation)
        const characters = yield* transaction(
          p.sql,
          deployed.storage.write(id, started.written, DateTime.toEpochMillis(now)),
        ).pipe(Effect.orDie)
        yield* Effect.flatten(told(entity, started.machine, started.machine, started.outputs, true))
        tell(p.readings, entity.name, started.written)
        yield* warnOfSize(p, loaded, entity, characters)
        // The entity exists from here: its creation is the first event committed for it.
        yield* observe(p, entity, creation)
        yield* at(p, 'AfterCommit', entity, creation)
        yield* enter(p, deployed, loaded)
        // Each point of the crash table is given the creation, its event: `AfterReply` too.
        yield* perform(p, deployed, loaded, entity, creation, started.outputs, yield* spanHere).pipe(
          Effect.onError((cause) => Cause.hasInterruptsOnly(cause) ? Effect.void : crash(p, deployed, loaded, cause)),
        )
        return { _tag: 'Made', loaded } as const
      }))
      if (made._tag === 'Rejected') return made.reply
      yield* Effect.forkIn(untransacted(p.sql, loop(p, deployed, made.loaded)), deployed.scope)
      return { _tag: 'Created' } as const
    })))
    // An entity already there answers through the machine, and its caller waits for that answer.
    return asked._tag === 'Asked' ? yield* answered(asked.asked) : asked
  })

export const send = <T extends Types>(
  p: Process,
  deployed: Deployment<T>,
  id: string,
  message: T['inbound'],
  request: Request<T['sender']>,
  keep?: number,
): Effect.Effect<Answer<T['rejection']>, Faulted> =>
  Effect.gen(function*() {
    const entity: Address = { name: deployed.program.name, id }
    // A message is stored as its schema writes it: one that does not encode is its caller's defect, and
    // reaches no entity (decision 0040).
    const { requested, written } = yield* Effect.try({
      try: () => {
        const { schemas } = deployed.program
        const written = encode(schemas.inbound, message, 'inbound message')
        if (request._tag === 'Caller') encode(schemas.sender, request.sender, 'sender')
        return { requested: Machine.requestKey(deployed.program, request), written }
      },
      catch: (defect) => new Faulted({ defect }),
    })
    // On Cluster a message, a caller's or an operation's, goes through the door's client. It waits in Cluster's
    // table while the entity is busy, and is never answered `Full` (decisions 0165, 0167).
    if (p.cluster !== null) {
      const version = versionOf(deployed.program)
      const sent = { id, version, request: requested, message: JSON.stringify(written) }
      const kept = keptFor(p, deployed, request)
      if (keep === undefined) return yield* p.cluster.send(deployed.program, sent, kept)
      // A caller's Cluster rows go once its client has the answer and the reply's time is past, counted from
      // the client's clock, which reads after the step's (decision 0171). A `keep` below the least time Cluster's
      // client gives is raised to it, so that every client of the request reads the answer first (decision 0248).
      // An operation's go with its work.
      const given = request._tag === 'Caller'
        ? (requestId: string, least: number) =>
          Effect.flatMap(
            DateTime.now,
            (now) => deployed.storage.keepGiven(requestId, id, DateTime.toEpochMillis(now) + Math.max(keep, least)),
          )
        : undefined
      return yield* p.cluster.send(deployed.program, { ...sent, keep }, kept, given)
    }
    // An operation is given again the `NotFound` a run before it was given, though the entity may exist since, so
    // that a run after a crash acts on the same answer (decision 0253).
    if (request._tag === 'Operation') {
      const kept = yield* deployed.storage.answer(id, 'Message', request)
      if (kept?._tag === 'NotFound') return kept
    }
    const event: Machine.Offered<T> = keep === undefined
      ? { _tag: 'Receive', request, message }
      : { _tag: 'Receive', request, message, keep }
    type Offered = Asked<Answer<unknown>> | 'Full' | null
    const asked = yield* withEntity(p, deployed, id, (loaded): Effect.Effect<Offered> => {
      if (loaded === null) return Effect.succeed(null)
      // The permit and the offer in one uninterruptible region: a caller interrupted between the two would keep
      // a permit that no step gives back (decision 0147). Nothing yields between the two today, so no test reaches
      // that interruption: the region guards the yield Effect inserts after a count of operations. A send that
      // yields between them fails `a caller interrupted anywhere as it sends leaves its entity’s bound whole`
      // outside the region, and passes inside it.
      const offered = (taken: boolean): Effect.Effect<Offered> =>
        taken
          ? ask(p, p.messages, loaded, entity, Machine.messageKey(deployed.program, request, message), event)
          : Effect.as(warnOfFull(p, loaded, entity), 'Full')
      return Effect.uninterruptible(Effect.flatMap(loaded.callers.takeIfAvailable(1), offered))
    })
    if (asked === null) {
      if (request._tag === 'Operation') {
        yield* transaction(p.sql, deployed.storage.keepAnswer(id, 'Message', request, { _tag: 'NotFound' }))
          .pipe(Effect.orDie)
      }
      return { _tag: 'NotFound' }
    }
    if (asked === 'Full') return { _tag: 'Full' }
    return (yield* answered(asked)) as Answer<T['rejection']>
  })

/**
 * The deployment of `program`, once there is one. An operation that reaches a program not deployed yet waits
 * for it, as for a suspended receiver: what runs does not depend on the order of the deploys (decision 0045).
 */
export const deployedAs = <T extends Types>(p: Process, program: Receiver<T>): Effect.Effect<Deployment<T>> =>
  Effect.suspend(() => {
    const deployed = deployment<T>(p, program.name)
    if (deployed !== undefined) return Effect.succeed(deployed)
    const deploy = p.undeployed.get(program.name) ?? Deferred.makeUnsafe<void>()
    p.undeployed.set(program.name, deploy)
    return Effect.flatMap(Deferred.await(deploy), () => deployedAs(p, program))
  })

/**
 * What a delivery gives, or `none` when the receiver crashed on it: no reply yet, for the sender to send again
 * under the same request id, as after a crash of the process. A defect of the sender's own stays one, and so
 * does an interruption (decision 0046).
 */
export const unlessCrashed = <A, B>(delivery: Effect.Effect<A, Faulted>, none: B): Effect.Effect<A | B, Faulted> =>
  Effect.catchCause(delivery, (cause) =>
    Cause.hasInterruptsOnly(cause) || Cause.hasFails(cause) ? Effect.failCause(cause) : Effect.succeed(none))

/**
 * What one run of an operation sends with. Its request is the run's, its entity, key and incarnation, with the
 * name the operation gives it. So a restarted operation gets the stored replies, and no operation can send
 * under another's (decisions 0009, 0047, 0060). A name the run already used with the same entity would be
 * answered the first one's reply, and is the operation's defect: for a message, and apart for a creation. A
 * suspended receiver has no reply yet, and `send` waits for its resumption instead of giving up (decisions 0023,
 * 0063). A receiver that crashed has none either, and is sent to again after `retry` (decision 0046). So is a
 * full receiver, which stored nothing of the message, and the operation is never given `Full` (decision 0147).
 * `send` and `create` wait for the deploy of a program not deployed yet (decisions 0045, 0063).
 */
/**
 * The runtime's defect where an operation's request is answered `Reused`: what an operation's request carries is never
 * compared, so no step gives it one (decision 0269).
 */
const notReused = (name: string, id: string) =>
  new InvariantDefect({ reason: `an operation's request to ${name} '${id}' was answered Reused` })

export const entities = (p: Process, entity: Address, key: Key, incarnation: number, droppable: boolean) => {
  const used = { message: new Set<string>(), creation: new Set<string>() }
  /** The request named `name` to the entity `id` of `program`, or the run's defect if it made it already. */
  const named = <T extends Types>(
    kind: keyof typeof used,
    program: Receiver<T>,
    id: string,
    name: string,
  ): Effect.Effect<Readonly<{ deployed: Deployment<T>; request: Request<T['sender']> }>> =>
    Effect.suspend(() => {
      // A request acts on its receiver, which a droppable operation interrupted halfway would leave acted on
      // (decision 0128).
      if (droppable) {
        return Effect.die(
          new InvariantDefect({
            reason: `the droppable operation under '${Machine.shownKey(key)}' sent to ${program.name} '${id}'`,
          }),
        )
      }
      // An id an operation gives is held as a caller's is (decisions 0157, 0179).
      const fault = idFault(id)
      if (fault !== undefined) return Effect.die(new InvariantDefect({ reason: fault }))
      const to = JSON.stringify([program.name, id, name])
      if (used[kind].has(to)) {
        const verb = kind === 'message' ? 'sent' : 'created'
        return Effect.die(
          new InvariantDefect({ reason: `the operation ${verb} '${name}' to ${program.name} '${id}' twice` }),
        )
      }
      used[kind].add(to)
      return Effect.map(deployedAs(p, program), (deployed) => ({
        deployed,
        request: { _tag: 'Operation', entity, key, incarnation, name } as const,
      }))
    })
  return Entities.of({
    send: <T extends Types>(program: Receiver<T>, id: string, message: T['inbound'], name: string) =>
      Effect.flatMap(named('message', program, id, name), ({ deployed, request }) => {
        // `null` is no reply yet: the receiver crashed, or is suspended and has been resumed since.
        const attempt = Effect.flatMap(awaitResumption(p, { name: program.name, id }), ({ resumed, forget }) =>
          Effect.flatMap(
            unlessCrashed(send(p, deployed, id, message, request), null),
            (reply): Effect.Effect<Reply<T['rejection']> | null> =>
              reply === null || reply._tag === 'Full'
                ? Effect.as(Effect.sleep(`${p.retry} millis`), null)
                : reply._tag === 'Suspended'
                ? Effect.as(resumed, null)
                : reply._tag === 'Reused'
                ? Effect.die(notReused(program.name, id))
                : Effect.succeed(reply),
          ).pipe(Effect.ensuring(forget)))
        return faulted(Effect.repeat(attempt, { until: (reply) => reply !== null }))
      }),
    create: <T extends Types>(program: Receiver<T>, id: string, name: string, ...[flags]: Flagged<T>) =>
      Effect.flatMap(named('creation', program, id, name), ({ deployed, request }) => {
        const attempt = Effect.flatMap(
          unlessCrashed(create(p, deployed, id, flags === undefined ? null : flags, request), null),
          (creation): Effect.Effect<Creation<T['rejection']> | null> =>
            creation === null
              ? Effect.as(Effect.sleep(`${p.retry} millis`), null)
              : creation._tag === 'Reused'
              ? Effect.die(notReused(program.name, id))
              : Effect.succeed(creation),
        )
        return faulted(Effect.repeat(attempt, { until: (creation) => creation !== null }))
      }),
  })
}
