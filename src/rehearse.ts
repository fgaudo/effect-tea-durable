import * as DateTime from 'effect/DateTime'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Machine from './machine.ts'
import {
  type Address,
  checkProgram,
  type Creation,
  type Piece,
  encode,
  Entities,
  type IdempotencyKey,
  idFault,
  requestIdFault,
  InvariantDefect,
  type Key,
  isTimer,
  isProgram,
  type Program,
  type Receiver,
  type Reply,
  type Request,
  runnerOf,
  type Types,
} from './program.ts'

/** The reply `Accepted`, to compare with. */
export const accepted: Readonly<{ _tag: 'Accepted' }> = { _tag: 'Accepted' }

/** Matches any rejection, whatever its reason. */
export const rejected: Readonly<{ _tag: 'Rejected' }> = { _tag: 'Rejected' }

/**
 * Work under way under a key, in one incarnation. The key is its name, and the parameter as its schema encodes it
 * for a key that takes one (decision 0136).
 */
export interface Pending<Work = unknown> {
  /** The key the work is under. */
  readonly key: Key
  /** The incarnation of the run under way, which its answer carries. */
  readonly incarnation: number
  /**
   * The idempotency key the operation's runner is given: its digest for a runner declared with
   * `operation.digest` (decision 0123). A timer's is the readable one, which nothing is given.
   */
  readonly idempotencyKey: IdempotencyKey
  /** The operation or the timer, as the stored state holds it: a test asserts it by value. */
  readonly work: Work
}

/** The parameter a key takes after its name, or nothing for a key without one (decision 0132). */
type Parameter<T extends Types, K> = K extends keyof T['parameter'] ? [parameter: T['parameter'][K]] : []

/** The work under way under a key of `T`, as `pending` gives it. */
type PendingOf<T extends Types> = Pending<Piece<T['operation'], T['internal']>>

/** What a rehearsal does to one entity, whether it runs alone or in a world. */
interface Acts<T extends Types> {
  /** The entity's state, as it stands after the last act of the test. */
  readonly state: Effect.Effect<T['state']>
  /** The entity's projection, as a caller reads it after the last act of the test. */
  readonly projection: Effect.Effect<T['projection']>
  /**
   * Delivers an inbound message from a caller. Given a request id, it is a request the test names: a second send
   * under the same sender and request id is a retry, given the reply stored for the first and not applied again,
   * as the runtime answers it. The reply is kept for the whole rehearsal, a restart and a deploy included, as the
   * runtime keeps one sent without `keep`. Without a request id, each send is a new request, whose reply no named
   * request finds (decision 0200).
   */
  readonly send: (
    message: T['inbound'],
    sender: T['sender'],
    request?: Readonly<{ requestId: string }>,
  ) => Effect.Effect<Machine.StoredReply<T['rejection']>>
  /**
   * Delivers an inbound message from another entity's operation, as a new run of it (decision 0059). The entity
   * need not exist: the test answers for it.
   */
  readonly sendFrom: (message: T['inbound'], entity: Address) => Effect.Effect<Machine.StoredReply<T['rejection']>>
  /**
   * The work under way under `key`, one of the program's own (decision 0033), with its parameter for a key that
   * takes one (decision 0132). Fails the test when there is none.
   */
  readonly pending: <K extends T['key']>(key: K, ...parameter: Parameter<T, K>) => Effect.Effect<PendingOf<T>>
  /** The work under way under `key`, as `pending` gives it, or null when there is none (decision 0186). */
  readonly underWay: <K extends T['key']>(key: K, ...parameter: Parameter<T, K>) => Effect.Effect<PendingOf<T> | null>
  /**
   * Completes an operation with `message`. It is dropped when the operation's incarnation has moved on. It fails the
   * test when the step that handles it returns the same operation under its key, which would run again at once.
   * Given a key, it completes the work under way under the key, and fails the test when there is none
   * (decision 0186).
   */
  readonly answer: {
    <K extends T['key']>(
      key: K,
      ...rest: [...parameter: Parameter<T, K>, message: T['internal']]
    ): Effect.Effect<'Delivered' | 'Dropped'>
    (pending: Pending, message: T['internal']): Effect.Effect<'Delivered' | 'Dropped'>
  }
  /** The time of a timer comes. Given a key, it is the timer under way under the key's (decision 0186). */
  readonly fire: {
    <K extends T['key']>(key: K, ...parameter: Parameter<T, K>): Effect.Effect<'Delivered' | 'Dropped'>
    (pending: Pending): Effect.Effect<'Delivered' | 'Dropped'>
  }
}

/** A rehearsal of one entity, as `rehearse` gives it to the scenario: what the test does to the entity, and reads of it. */
export interface Rehearsal<T extends Types> extends Acts<T> {
  /**
   * The process dies after the last commit, and the entity is activated again from what was stored. At-most-once
   * operations under way deliver their `unknown` message instead of running again.
   */
  readonly restart: Effect.Effect<void>
  /**
   * A deploy: the process dies, and `program`, a new version, activates the entity from what was stored. It keeps
   * the work under way that it returns the same, and starts the rest as new work. It fails the test when the new
   * program is a defect: one that changes, drops or delivers otherwise an operation under way, or bears another name.
   * A program that cannot run as written fails it before the process dies (decision 0054).
   */
  readonly deploy: (program: Program<T>) => Effect.Effect<void>
  /**
   * Time passes by `duration`. Each timer due within it fires at its time, in the order of the times, and its
   * message is handled before the next one fires (decision 0187).
   */
  readonly advance: (duration: Duration.Input) => Effect.Effect<void>
}

/**
 * The services a run of `T` needs from the scenario: those of all its runners but `Entities`, which the world
 * provides. A key may hold any operation of `T`, so no type tells which runner a run reaches (decision 0189).
 */
export type Outside<T extends Types> = Exclude<T['services'], Entities>

/** An entity of a world: what a rehearsal does to one entity, and the runs of its operations (decision 0131). */
export interface Member<T extends Types> extends Acts<T> {
  /**
   * Runs the operation's runner, and completes the operation with its message, as `answer` does. What the runner
   * sends reaches the entities of the world, and each receiver handles its mailbox to its end before `send` returns.
   * It fails the test when the work under `pending` is not an operation running in that incarnation.
   */
  readonly run: {
    (pending: Pending): Effect.Effect<'Delivered' | 'Dropped', never, Outside<T>>
    /**
     * Runs the runner to its end, drops its message, and restarts the world: the process died between the replies
     * the runner was given and the completion. The next run of the operation is given the stored replies.
     */
    (pending: Pending, options: Readonly<{ crash: true }>): Effect.Effect<void, never, Outside<T>>
    /** Runs the operation under way under `key`, and fails the test when there is none (decision 0186). */
    <K extends T['key']>(
      key: K,
      ...parameter: Parameter<T, K>
    ): Effect.Effect<'Delivered' | 'Dropped', never, Outside<T>>
    <K extends T['key']>(
      key: K,
      ...rest: [...parameter: Parameter<T, K>, options: Readonly<{ crash: true }>]
    ): Effect.Effect<void, never, Outside<T>>
  }
}

/** Entities on the machine together, with one time and one process for all of them (decision 0131). */
export interface World {
  /**
   * Creates an entity of `program`, which the world runs under its name from then on. It fails the test when the
   * world runs another program under that name, as a second deploy of a name fails in the runtime (decision 0075).
   * It fails the test too when the program's `init` rejects the flags: a test of a rejection calls `init` itself,
   * which is pure, or creates from a runner, whose `create` is answered `Rejected` (decision 0182).
   */
  readonly create: <T extends Types>(program: Program<T>, id: string, flags: T['flags']) => Effect.Effect<Member<T>>
  /** The process dies after the last commit, and every entity is activated again from what was stored. */
  readonly restart: Effect.Effect<void>
  /**
   * A deploy of a new version of a program: the process dies, and the program's entities are activated by it. A
   * program that cannot run as written fails the test before the process dies (decision 0054).
   */
  readonly deploy: <T extends Types>(program: Program<T>) => Effect.Effect<void>
  /**
   * Time passes by `duration` for every entity of the world. Each timer due within it fires at its time, in the
   * order of the times, and every mailbox it reaches is handled before the next one fires (decision 0187).
   */
  readonly advance: (duration: Duration.Input) => Effect.Effect<void>
}

/**
 * A reply stored under a request: of another entity's operation, kept while that work holds (decision 0021), or of
 * a caller's request the test named, kept for the whole rehearsal, with no asker (decision 0200).
 */
type Kept = Readonly<{ reply: Machine.StoredReply<unknown>; asked: Machine.Asker | null }>

/** An entity of the world: what is stored of it, what its process does, and the replies stored under its requests. */
type Entity<T extends Types> = {
  readonly address: Address
  machine: Machine.Machine<T>
  readonly replies: Map<string, Kept>
}

/** What a creation in the world gives: the entity, or the rejection of its flags by `init` (decision 0182). */
type Born<T extends Types> =
  | Readonly<{ _tag: 'Born'; entity: Entity<T> }>
  | Readonly<{ _tag: 'Rejected'; reason: T['rejection'] | null }>

const addressKey = ({ name, id }: Address) => JSON.stringify([name, id])

/** A program's own deaths, with the reason the runtime gives them. */
const invariant = (reason: string) => Effect.die(new InvariantDefect({ reason }))

/**
 * The world of a rehearsal: the entities, the programs they run by name, and the time, which every entity shares.
 * Nothing happens by itself: after each act of the test, every mailbox it reached is handled to its end.
 */
const makeWorld = (at: DateTime.Utc) => {
  const programs = new Map<string, Program<Types>>()
  const entities = new Map<string, Entity<Types>>()
  let now = at
  let requests = 0
  // The callers' requests the test named, by their request's key: only their replies are kept (decision 0200).
  const named = new Set<string>()

  // A world holds entities of many programs: each is stepped by the one deployed under its name (decision 0064).
  const programOf = <T extends Types>(entity: Entity<T>) => programs.get(entity.address.name) as unknown as Program<T>

  /**
   * The program the world runs under `program`'s name, which `program` becomes when it runs none. A reference
   * brings no code, so a world that runs no program under its name has none to run: in the runtime the send waits
   * for that deploy, which a test never makes, and here it fails the test (decision 0183).
   */
  const deployedAs = <T extends Types>(program: Receiver<T>): Effect.Effect<Program<T>> =>
    Effect.suspend(() => {
      const held = programs.get(program.name)
      if (held !== undefined) return Effect.succeed(held as unknown as Program<T>)
      if (!isProgram(program)) {
        return Effect.die(`the world runs no program '${program.name}', and a reference to it brings no code to run`)
      }
      checkProgram(program)
      programs.set(program.name, program as unknown as Program<Types>)
      return Effect.succeed(program)
    })

  /**
   * What the runtime stores of a step that only the world keeps: the replies to other entities' operations, and
   * their deletion once the work that asked ends (decision 0021), and the replies to the callers' requests the test
   * named, which a retry of the test reads (decision 0200).
   */
  const keep = <T extends Types>(entity: Entity<T>, transition: Machine.Transition<T>) => {
    const program = programOf(entity)
    for (const output of transition.outputs) {
      if (output._tag !== 'Replied' || output.reply._tag === 'Suspended') continue
      if (output.request._tag === 'Caller') {
        const request = Machine.requestKey(program, output.request)
        if (named.has(request)) entity.replies.set(request, { reply: output.reply, asked: null })
        continue
      }
      if (output.request._tag !== 'Operation') continue
      const { entity: asker, key, incarnation } = output.request
      entity.replies.set(Machine.requestKey(program, output.request), {
        reply: output.reply,
        asked: { name: asker.name, id: asker.id, key, incarnation },
      })
    }
    for (const ended of transition.written?.ended ?? []) {
      for (const other of entities.values()) {
        for (const [request, { asked }] of other.replies) {
          if (
            asked !== null && asked.name === entity.address.name && asked.id === entity.address.id &&
            Machine.keyText(asked.key) === Machine.keyText(ended.key) && asked.incarnation === ended.incarnation
          ) other.replies.delete(request)
        }
      }
    }
  }

  /** Applies an event to an entity, then handles its mailbox to its end. A defect that suspends it fails the test. */
  const apply = <T extends Types>(
    entity: Entity<T>,
    event: Machine.Event<T>,
  ): Effect.Effect<ReadonlyArray<Machine.Output<T>>> =>
    Effect.suspend(() => {
      const program = programOf(entity)
      let transition = Machine.step(program, entity.machine, event)
      keep(entity, transition)
      const outputs = [...transition.outputs]
      while (transition.machine.stored.suspension === null && transition.machine.stored.mailbox.length > 0) {
        transition = Machine.step(program, transition.machine, { _tag: 'Handle', at: now })
        keep(entity, transition)
        outputs.push(...transition.outputs)
      }
      entity.machine = transition.machine
      const { suspension } = entity.machine.stored
      return suspension === null ? Effect.succeed(outputs) : Effect.die(suspension.cause)
    })

  /**
   * Delivers an inbound message under `request`, with the reply stored under it, and returns the reply. A message
   * the runtime could not store fails the test, as it is the caller's defect there (decision 0040).
   */
  const receive = <T extends Types>(
    entity: Entity<T>,
    message: T['inbound'],
    request: Request<T['sender']>,
  ): Effect.Effect<Machine.StoredReply<T['rejection']>> =>
    Effect.flatMap(Effect.sync(() => {
      const program = programOf(entity)
      encode(program.schemas.inbound, message, 'inbound message')
      if (request._tag === 'Caller') encode(program.schemas.sender, request.sender, 'sender')
      const key = Machine.requestKey(program, request)
      const stored = entity.replies.get(key)?.reply ?? null
      return { key, stored: stored as Machine.StoredReply<T['rejection']> | null }
    }), ({ key, stored }) =>
      Effect.flatMap(apply(entity, { _tag: 'Receive', request, message, reply: stored, at: now }), (outputs) => {
        const program = programOf(entity)
        for (const output of outputs) {
          if (output._tag !== 'Replied' || Machine.requestKey(program, output.request) !== key) continue
          const { reply } = output
          if (reply._tag === 'Accepted' || reply._tag === 'Rejected') {
            return Effect.succeed<Machine.StoredReply<T['rejection']>>(reply)
          }
        }
        return Effect.die(`the request ${key} was not answered`)
      }))

  /** The kind of the work under way under `pending`'s key, in `pending`'s incarnation. */
  const kindOf = <T extends Types>(entity: Entity<T>, { key, incarnation }: Pending) => {
    const running = entity.machine.running[Machine.keyText(key)]
    return running?.incarnation === incarnation ? running.kind : undefined
  }

  const outcome = ({ key, incarnation }: Pending) => (outputs: ReadonlyArray<Machine.Output<Types>>) =>
    outputs.some((output) =>
      output._tag === 'Delivered' && Machine.keyText(output.key) === Machine.keyText(key) &&
      output.incarnation === incarnation
    )
      ? 'Delivered' as const
      : 'Dropped' as const

  /** Completes an operation with `message`, as `answer` and `run` do. */
  const complete = <T extends Types>(entity: Entity<T>, pending: Pending, message: T['internal']) =>
    Effect.suspend(() => {
      const { key, incarnation } = pending
      const before = entity.machine.stored.keys[Machine.keyText(key)]?.work
      return Effect.flatMap(apply(entity, { _tag: 'Complete', key, incarnation, message }), (outputs) => {
        const delivered = outcome(pending)(outputs)
        // The runtime cannot tell an operation that loops on its completion from a program that wants it, so the
        // rehearsal fails (decision 0130).
        const again = outputs.find((output) =>
          output._tag === 'Started' && Machine.keyText(output.key) === Machine.keyText(key)
        )
        return delivered === 'Delivered' && again?._tag === 'Started' && before !== undefined &&
            Machine.isSame(programOf(entity), key, before, again.operation)
          ? Effect.die(
            `the operation under '${Machine.shownKey(key)}' came back the same on its completion, and runs again at once`,
          )
          : Effect.succeed(delivered)
      })
    })

  /** The time of the timer under `pending` comes, and time moves to it, never back (decision 0187). */
  const fireOf = <T extends Types>(entity: Entity<T>, pending: Pending) =>
    Effect.suspend(() => {
      const kind = kindOf(entity, pending)
      if (kind === 'Operation') {
        return Effect.die(`the work under '${Machine.shownKey(pending.key)}' is an operation: it is answered`)
      }
      const work = entity.machine.stored.keys[Machine.keyText(pending.key)]?.work
      if (kind === 'Timer' && isTimer(work)) now = DateTime.max(now, work.at)
      const { key, incarnation } = pending
      return Effect.map(apply(entity, { _tag: 'Fire', key, incarnation }), outcome(pending))
    })

  /**
   * The timer under way in the world due earliest, and no later than `until`, or undefined. Of two due at one time,
   * the one of the entity created first fires first, and within an entity the one its machine holds first.
   */
  const dueBy = (until: DateTime.Utc) => {
    let next: Readonly<{ entity: Entity<Types>; pending: Pending; at: DateTime.Utc }> | undefined
    for (const entity of entities.values()) {
      for (const [text, running] of Object.entries(entity.machine.running)) {
        const held = entity.machine.stored.keys[text]
        if (running.kind !== 'Timer' || held === undefined || !isTimer(held.work)) continue
        const { at } = held.work
        if (DateTime.isGreaterThan(at, until) || (next !== undefined && !DateTime.isLessThan(at, next.at))) continue
        const pending: Pending = {
          key: held.key,
          incarnation: running.incarnation,
          idempotencyKey: Machine.idempotencyKeyOf(entity.machine, held.key, running.incarnation),
          work: held.work,
        }
        next = { entity, pending, at }
      }
    }
    return next
  }

  const advance = (duration: Duration.Input): Effect.Effect<void> =>
    Effect.suspend(() => {
      const length = Duration.fromInputUnsafe(duration)
      if (Duration.isNegative(length) || !Duration.isFinite(length)) {
        return Effect.die(`time passes by a finite duration of zero or more, not ${Duration.format(length)}`)
      }
      const until = DateTime.addDuration(now, length)
      // A timer that fires twice at one time was armed again at a time already reached, by its own firing or by
      // another timer's at that time. It would fire again at once, turn after turn, and time would never pass, so
      // the rehearsal fails, as it does for an operation that comes back the same on its completion (decision 0187).
      let instant = now
      const fired = new Set<string>()
      const loop: Effect.Effect<void> = Effect.suspend(() => {
        const next = dueBy(until)
        if (next === undefined) {
          now = DateTime.max(now, until)
          return Effect.void
        }
        const { entity, pending, at } = next
        const firesAt = DateTime.max(now, at)
        if (!DateTime.Equivalence(firesAt, instant)) {
          instant = firesAt
          fired.clear()
        }
        const which = JSON.stringify([entity.address.name, entity.address.id, Machine.keyText(pending.key)])
        if (fired.has(which)) {
          return Effect.die(
            `the timer under '${Machine.shownKey(pending.key)}' of ${entity.address.name} '${entity.address.id}' ` +
              `fires twice at ${DateTime.formatIso(firesAt)}, and time would never pass`,
          )
        }
        fired.add(which)
        return Effect.andThen(fireOf(entity, pending), loop)
      })
      return loop
    })

  const restart: Effect.Effect<void> = Effect.suspend(() =>
    Effect.forEach([...entities.values()], (entity) => apply(entity, { _tag: 'Restart' }), { discard: true })
  )

  /**
   * What one run of an operation sends with, as the runtime's: its request is the run's, with the name the operation
   * gives it, so a run after a restart is given the stored replies (decisions 0047, 0060). A name the run already
   * used with an entity, and a droppable operation that sends, are the operation's defects (decision 0128).
   */
  const entitiesOf = (sender: Address, key: Key, incarnation: number, droppable: boolean) => {
    const used = { message: new Set<string>(), creation: new Set<string>() }
    const named = (kind: keyof typeof used, program: Receiver<Types>, id: string, name: string) =>
      Effect.suspend(() => {
        if (droppable) {
          return invariant(`the droppable operation under '${Machine.shownKey(key)}' sent to ${program.name} '${id}'`)
        }
        // A rehearsal refuses the ids the runtime refuses, so that a test passes only what a deployment runs
        // (decision 0179).
        const fault = idFault(id)
        if (fault !== undefined) return invariant(fault)
        const to = JSON.stringify([program.name, id, name])
        if (used[kind].has(to)) {
          return invariant(`the operation ${kind === 'message' ? 'sent' : 'created'} '${name}' to ${program.name} '${id}' twice`)
        }
        used[kind].add(to)
        return Effect.succeed<Request<never>>({ _tag: 'Operation', entity: sender, key, incarnation, name })
      })
    return Entities.of({
      send: <R extends Types>(program: Receiver<R>, id: string, message: R['inbound'], name: string) =>
        Effect.flatMap(named('message', program as unknown as Receiver<Types>, id, name), (request) => {
          const receiver = entities.get(addressKey({ name: program.name, id })) as Entity<R> | undefined
          // A receiver that does not exist answers `NotFound`, and stores nothing.
          return receiver === undefined
            ? Effect.succeed<Reply<R['rejection']>>({ _tag: 'NotFound' })
            : receive(receiver, message, request)
        }),
      create: <R extends Types>(program: Receiver<R>, id: string, flags: R['flags'], name: string) =>
        Effect.flatMap(named('creation', program as unknown as Receiver<Types>, id, name), (request) =>
          Effect.suspend((): Effect.Effect<Creation<R['rejection']>> => {
            const existing = entities.get(addressKey({ name: program.name, id })) as Entity<R> | undefined
            if (existing === undefined) {
              // A creation that cannot be stored is the creator's defect, as in the runtime (decision 0049). One
              // `init` rejects creates nothing, and its reply is not stored (decision 0182).
              return Effect.map(
                Effect.flatMap(deployedAs(program), (deployed) => born(deployed, id, flags, request)),
                (born): Creation<R['rejection']> => born._tag === 'Rejected' ? born : { _tag: 'Created' },
              )
            }
            return Effect.flatMap(apply(existing, { _tag: 'Create', request }), (outputs) => {
              for (const output of outputs) if (output._tag === 'CreationReplied') return Effect.succeed(output.reply)
              return Effect.die(`the creation of ${program.name} '${id}' was not answered`)
            })
          })),
    })
  }

  /**
   * Creates an entity in the world, from what `Machine.start` gives. A defect at creation fails the test. Flags `init`
   * rejects create nothing, and give the rejection (decision 0182).
   */
  const born = <T extends Types>(
    program: Program<T>,
    id: string,
    flags: T['flags'],
    request: Request<T['sender']>,
  ): Effect.Effect<Born<T>> =>
    Effect.suspend((): Effect.Effect<Born<T>> => {
      const created = Machine.start(program, id, flags, now, request)
      if (created._tag === 'Defect') return Effect.die(created.cause)
      if (created._tag === 'Rejected') return Effect.succeed(created.reply)
      const entity: Entity<T> = { address: { name: program.name, id }, machine: created.machine, replies: new Map() }
      entities.set(addressKey(entity.address), entity as unknown as Entity<Types>)
      return Effect.succeed({ _tag: 'Born', entity } as const)
    })

  const memberOf = <T extends Types>(entity: Entity<T>): Member<T> => {
    /** The work under way under the key `name`, with its parameter for a key that takes one, or null. */
    const underWay = (name: T['key'], parameter: unknown) =>
      Effect.sync((): PendingOf<T> | null => {
        const key = Machine.keyOf(programOf(entity), name, parameter)
        const running = entity.machine.running[Machine.keyText(key)]
        const work = entity.machine.stored.keys[Machine.keyText(key)]?.work
        return running === undefined || work === undefined ? null : {
          key,
          incarnation: running.incarnation,
          idempotencyKey: Machine.idempotencyKeyOf(entity.machine, key, running.incarnation),
          work,
        }
      })

    const pending = (name: T['key'], parameter: unknown) =>
      Effect.flatMap(underWay(name, parameter), (found) => {
        if (found !== null) return Effect.succeed(found)
        const key = Machine.keyOf(programOf(entity), name, parameter)
        return Effect.die(`no work is under way under '${Machine.shownKey(key)}'`)
      })

    /**
     * The pending an act is given, and the arguments after it. A key is followed by its parameter only where the
     * program declares one for it, so the schema tells a parameter from the message or the options after it.
     */
    const given = (args: ReadonlyArray<unknown>): Effect.Effect<readonly [Pending, ReadonlyArray<unknown>]> =>
      // The keys are read when the act runs, so an act built before a deploy reads the program deployed.
      Effect.suspend(() => {
        const [first, ...rest] = args
        if (typeof first !== 'string') return Effect.succeed([first as Pending, rest] as const)
        const keys = programOf(entity).keys as unknown as Readonly<Record<string, unknown>>
        const takes = Object.hasOwn(keys, first) && (keys[first] ?? null) !== null
        return Effect.map(
          pending(first as T['key'], takes ? rest[0] : undefined),
          (found) => [found, takes ? rest.slice(1) : rest] as const,
        )
      })

    const run = (pending: Pending, options?: Readonly<{ crash: true }>) =>
      Effect.suspend(() => {
        const { key, incarnation } = pending
        if (kindOf(entity, pending) !== 'Operation') {
          return invariant(`no operation is running under '${Machine.shownKey(key)}' in incarnation ${incarnation}`)
        }
        const program = programOf(entity)
        const operation = entity.machine.stored.keys[Machine.keyText(key)]?.work as T['operation']
        // The work was admitted when it was stored, so the program has a runner for it.
        const runner = runnerOf(program, operation)!
        const idempotencyKey = Machine.idempotencyKeyOf(entity.machine, key, incarnation)
        const running = runner.delivery === 'Idempotent' || runner.delivery === 'IdempotentDigest'
          ? runner.run(operation, idempotencyKey)
          : runner.run(operation)
        const services = entitiesOf(entity.address, key, incarnation, runner.delivery === 'Droppable')
        return Effect.flatMap(
          Effect.provideService(running, Entities, services),
          (message): Effect.Effect<'Delivered' | 'Dropped' | void> =>
            options?.crash === true ? restart : complete(entity, pending, message),
        )
      })
    const answer = (pending: Pending, message: T['internal']) =>
      Effect.suspend(() =>
        kindOf(entity, pending) === 'Timer'
          ? Effect.die(`the work under '${Machine.shownKey(pending.key)}' is a timer: it fires`)
          : complete(entity, pending, message)
      )
    const fire = (pending: Pending) => fireOf(entity, pending)
    return {
      state: Effect.sync(() => entity.machine.stored.state),
      projection: Effect.sync(() => programOf(entity).project(entity.machine.stored.state)),
      send: (message, sender, given) =>
        Effect.suspend(() => {
          const program = programOf(entity)
          // The request's key encodes the sender, as the program's: a sender that does not encode is the caller's
          // defect, so it is checked first (decision 0040).
          encode(program.schemas.sender, sender, 'sender')
          if (given !== undefined) {
            // A rehearsal refuses the request ids the runtime refuses (decision 0204).
            const fault = requestIdFault(given.requestId)
            if (fault !== undefined) return invariant(fault)
            const request: Request<T['sender']> = { _tag: 'Caller', sender, id: given.requestId }
            named.add(Machine.requestKey(program, request))
            return receive(entity, message, request)
          }
          // A drawn id is never one the test named, so a new request finds no reply of a named one.
          let request: Request<T['sender']>
          do request = { _tag: 'Caller', sender, id: `request-${++requests}` }
          while (named.has(Machine.requestKey(program, request)))
          return receive(entity, message, request)
        }),
      // A request of another entity is a run of one of its operations: each one here is a run of its own.
      sendFrom: (message, from) =>
        receive(entity, message, {
          _tag: 'Operation',
          entity: from,
          key: { name: 'rehearsal' },
          incarnation: ++requests,
          name: 'request',
        }),
      pending: (name, ...parameter) => pending(name, parameter[0]),
      underWay: (name, ...parameter) => underWay(name, parameter[0]),
      // Each act takes a pending or a key, and the overloads of its type say which arguments follow.
      answer: ((...args: ReadonlyArray<unknown>) =>
        Effect.flatMap(given(args), ([found, [message]]) =>
          answer(found, message as T['internal']))) as Member<T>['answer'],
      fire: ((...args: ReadonlyArray<unknown>) =>
        Effect.flatMap(given(args), ([found]) => fire(found))) as Member<T>['fire'],
      run: ((...args: ReadonlyArray<unknown>) =>
        Effect.flatMap(given(args), ([found, [options]]) =>
          run(found, options as Readonly<{ crash: true }> | undefined))) as Member<T>['run'],
    }
  }

  const world: World = {
    create: (program, id, flags) =>
      Effect.suspend(() => {
        // A runner's `create` reaches the program by name, as in the runtime. The test names the program itself, so
        // another one under that name is the test's mistake, and is not run in silence.
        return Effect.flatMap(deployedAs(program), (deployed) => {
          if (deployed !== program) return Effect.die(`the world runs another program under the name '${program.name}'`)
          const fault = idFault(id)
          if (fault !== undefined) return invariant(fault)
          if (entities.has(addressKey({ name: program.name, id }))) {
            return Effect.die(`${program.name} '${id}' exists in the world already`)
          }
          // No one retries the test's creation, so it is the entity's own request: no sender is needed.
          return Effect.flatMap(born(deployed, id, flags, { _tag: 'Self', id: 'creation' }), (entity) =>
            entity._tag === 'Rejected'
              ? Effect.die(`the init of ${program.name} rejected the flags of '${id}'`)
              : Effect.succeed(memberOf(entity.entity)))
        })
      }),
    restart,
    advance,
    deploy: (program) =>
      Effect.andThen(
        Effect.sync(() => {
          checkProgram(program)
          programs.set(program.name, program as unknown as Program<Types>)
        }),
        restart,
      ),
  }
  return world
}

/**
 * Runs a scenario without storage, cluster or clock. Nothing happens by itself: the test answers operations,
 * fires timers and restarts the process. After each of them, the mailbox is handled to its end. It fails when a
 * defect suspends the entity, and when an operation's completion returns the same operation.
 *
 * Time stands still at `start.at`. It moves to a timer's time when the timer fires later, and by a duration with
 * `advance`, which fires the timers due within it: a message is handled at the latest time the scenario reached.
 */
const rehearseOne = <T extends Types, E>(
  program: Program<T>,
  start: Readonly<{ flags: T['flags']; at: DateTime.Utc }>,
  scenario: (rehearsal: Rehearsal<T>) => Effect.Effect<void, E>,
): Effect.Effect<void, E> =>
  // A program the runtime would refuse is refused here too, before the scenario runs (decision 0054).
  Effect.andThen(Effect.sync(() => checkProgram(program)), () => {
    const world = makeWorld(start.at)
    return Effect.flatMap(world.create(program, 'rehearsal', start.flags), ({ run: _, ...acts }) =>
      scenario({
        ...acts,
        restart: world.restart,
        advance: world.advance,
        deploy: (next) =>
          next.name === program.name
            ? world.deploy(next)
            // A deploy under another name reaches the entity in the runtime as a defect of the activation.
            : invariant(`the program '${next.name}' replaces the entity's program '${program.name}'`),
      }))
  })

/**
 * Runs a scenario on a world of entities, without storage, cluster or clock, with one time and one process for all
 * of them (decision 0131). The scenario creates the entities, and runs the operations' runners with `run`, or
 * answers them as `rehearse` does. What a runner sends reaches the receiver's machine. A defect of any entity fails
 * the test, and so does a run that sends twice under one name to one entity.
 */
const together = <E, R>(at: DateTime.Utc, scenario: (world: World) => Effect.Effect<void, E, R>): Effect.Effect<void, E, R> =>
  Effect.suspend(() => scenario(makeWorld(at)))

/**
 * Runs a scenario of one entity of `program`, created from `start.flags` at `start.at`, without a database or a
 * clock. The scenario is given a `Rehearsal`, and the test answers the entity's operations, fires its timers and
 * restarts the process. `rehearse.together(at, scenario)` runs several entities in one world instead, where a
 * runner's requests reach the other entities.
 */
export const rehearse: typeof rehearseOne & { readonly together: typeof together } = Object.assign(rehearseOne, {
  together,
})
