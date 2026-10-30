import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Machine from './machine.ts'
import {
  type Address,
  type Durable,
  type IdempotencyKey,
  isTimer,
  type Origin,
  type Program,
  type Types,
} from './program.ts'

/** The reply `Accepted`, to compare with. */
export const accepted: Readonly<{ _tag: 'Accepted' }> = { _tag: 'Accepted' }

/** Matches any rejection, whatever its reason. */
export const rejected: Readonly<{ _tag: 'Rejected' }> = { _tag: 'Rejected' }

/** Work under way under a key, in one incarnation. */
export interface Pending<Work = unknown> {
  readonly key: string
  readonly incarnation: number
  readonly idempotencyKey: IdempotencyKey
  /** The operation or the timer, as the stored state holds it: a test asserts it by value. */
  readonly work: Work
}

export interface Rehearsal<T extends Types> {
  readonly state: Effect.Effect<T['state']>
  readonly projection: Effect.Effect<T['projection']>
  /** Delivers an inbound message, with a new request id. */
  readonly send: (message: T['inbound'], sender: T['sender']) => Effect.Effect<Machine.StoredReply<T['rejection']>>
  /** Delivers an inbound message from another entity's operation, with a new request id. */
  readonly sendFrom: (message: T['inbound'], entity: Address) => Effect.Effect<Machine.StoredReply<T['rejection']>>
  /** The work under way under `key`, one of the program's own (decision 0033). Fails the test when there is none. */
  readonly pending: (key: T['key']) => Effect.Effect<Pending<Durable<T['operation'], T['internal']>>>
  /** Completes an operation with `message`. It is dropped when the operation's incarnation has moved on. */
  readonly answer: (pending: Pending, message: T['internal']) => Effect.Effect<'Delivered' | 'Dropped'>
  /** The time of a timer comes. */
  readonly fire: (pending: Pending) => Effect.Effect<'Delivered' | 'Dropped'>
  /**
   * The process dies after the last commit, and the entity is activated again from what was stored. At-most-once
   * operations under way deliver their `unknown` message instead of running again.
   */
  readonly restart: Effect.Effect<void>
  /**
   * A deploy: the process dies, and `program`, a new version, activates the entity from what was stored. It keeps
   * the work under way that it returns the same, and starts the rest as new work. It fails the test when the new
   * program is a defect: one that changes, drops or delivers otherwise an operation under way, or bears another name.
   */
  readonly deploy: (program: Program<T>) => Effect.Effect<void>
}

/** The entity's id in a rehearsal, part of its idempotency keys. */
const id = 'rehearsal'

/**
 * Runs a scenario without storage, cluster or clock. Nothing happens by itself: the test answers operations,
 * fires timers and restarts the process. After each of them, the mailbox is handled to its end. It fails when a
 * defect suspends the entity.
 *
 * Time stands still at `start.at`, and moves to a timer's time when it fires later: a message is handled at the
 * latest time the scenario reached.
 */
export const rehearse = <T extends Types, E>(
  program: Program<T>,
  start: Readonly<{ flags: T['flags']; at: DateTime.Utc }>,
  scenario: (rehearsal: Rehearsal<T>) => Effect.Effect<void, E>,
): Effect.Effect<void, E> =>
  Effect.suspend(() => {
    const created = Machine.start(program, id, start.flags, start.at, {
      requestId: 'creation',
      from: { _tag: 'Caller', sender: null },
    })
    if (created._tag === 'Defect') return Effect.die(created.cause)
    let machine = created.machine
    let now = start.at
    let requests = 0

    const apply = (event: Machine.Event<T>): Effect.Effect<ReadonlyArray<Machine.Output<T>>> =>
      Effect.suspend(() => {
        let transition = Machine.step(machine, event)
        const outputs = [...transition.outputs]
        while (transition.machine.stored.suspension === null && transition.machine.stored.mailbox.length > 0) {
          transition = Machine.step(transition.machine, { _tag: 'Handle', at: now })
          outputs.push(...transition.outputs)
        }
        machine = transition.machine
        const { suspension } = machine.stored
        return suspension === null ? Effect.succeed(outputs) : Effect.die(suspension.cause)
      })

    const deliver = (message: T['inbound'], from: Origin<T['sender']>) =>
      Effect.flatMap(Effect.sync(() => `request-${++requests}`), (requestId) =>
        Effect.flatMap(apply({ _tag: 'Receive', requestId, message, from }), (outputs) => {
          for (const output of outputs) {
            if (output._tag !== 'Replied' || output.requestId !== requestId) continue
            const { reply } = output
            if (reply._tag === 'Accepted' || reply._tag === 'Rejected') {
              return Effect.succeed<Machine.StoredReply<T['rejection']>>(reply)
            }
          }
          return Effect.die(`the request ${requestId} was not answered`)
        }))

    const outcome = ({ key, incarnation }: Pending) => (outputs: ReadonlyArray<Machine.Output<T>>) =>
      outputs.some((output) => output._tag === 'Delivered' && output.key === key && output.incarnation === incarnation)
        ? 'Delivered' as const
        : 'Dropped' as const

    const kindOf = ({ key, incarnation }: Pending) => {
      const running = machine.running[key]
      return running?.incarnation === incarnation ? running.kind : undefined
    }

    return scenario({
      state: Effect.sync(() => machine.stored.state),
      projection: Effect.sync(() => machine.program.project(machine.stored.state)),
      send: (message, sender) => deliver(message, { _tag: 'Caller', sender }),
      sendFrom: (message, entity) => deliver(message, { _tag: 'Entity', entity }),
      pending: (key) =>
        Effect.suspend(() => {
          const running = machine.running[key]
          const work = machine.stored.keys[key]?.work
          return running === undefined || work === undefined
            ? Effect.die(`no work is under way under '${key}'`)
            : Effect.succeed({
              key,
              incarnation: running.incarnation,
              idempotencyKey: Machine.idempotencyKeyOf(machine, key, running.incarnation),
              work,
            })
        }),
      answer: (pending, message) =>
        Effect.suspend(() =>
          kindOf(pending) === 'Timer'
            ? Effect.die(`the work under '${pending.key}' is a timer: it fires`)
            : Effect.map(
              apply({ _tag: 'Complete', key: pending.key, incarnation: pending.incarnation, message }),
              outcome(pending),
            )
        ),
      fire: (pending) =>
        Effect.suspend(() => {
          const kind = kindOf(pending)
          if (kind === 'Operation') return Effect.die(`the work under '${pending.key}' is an operation: it is answered`)
          const work = machine.stored.keys[pending.key]?.work
          if (kind === 'Timer' && isTimer(work)) now = DateTime.max(now, work.at)
          const { key, incarnation } = pending
          return Effect.map(apply({ _tag: 'Fire', key, incarnation }), outcome(pending))
        }),
      restart: Effect.asVoid(apply({ _tag: 'Restart' })),
      deploy: (program) => Effect.asVoid(apply({ _tag: 'Restart', program })),
    })
  })
