/**
 * What a runtime writes: a `Stored<T>` in one database of SQLite or PostgreSQL, through `SqlClient` (decisions 0007,
 * 0019, 0157). The machine says what is stored; the storage says in which tables, and encodes it with the program's
 * schemas (decisions 0025, 0027). Every row carries the version of the program that wrote it, and is read by migrating
 * its JSON to the program's version (decision 0036). Nothing here decides anything: the machine encodes what an
 * event writes, and a caller writes it in one transaction (decision 0057).
 *
 * This module declares the storage of one program and makes it of its parts, each in the folder `storage/` and
 * divided by what it stores: the entities, their keys, the mailbox and the replies in
 * [`entities.ts`](storage/entities.ts), the read model in [`projections.ts`](storage/projections.ts), the log in
 * [`log.ts`](storage/log.ts), and the tables of Cluster in [`cluster.ts`](storage/cluster.ts). The tables, the
 * dialects and the transaction are in [`tables.ts`](storage/tables.ts), the rows as the runtime writes them in
 * [`rows.ts`](storage/rows.ts), and what the parts share in [`held.ts`](storage/held.ts). A module outside the
 * storage imports this one alone (decision 0241).
 */
import type * as Effect from 'effect/Effect'
import type { SqlClient } from 'effect/sql'
import type * as Machine from './machine.ts'
import type { Key, Program, Request, Topic, Types } from './program.ts'
import { onClusterOf } from './storage/cluster.ts'
import { type Due, entitiesOf, type Examined, type Inspection, type Suspension } from './storage/entities.ts'
import { heldOf } from './storage/held.ts'
import { type Consumer, type Cursor, logOf, type Published } from './storage/log.ts'
import {
  type Counted,
  type CountedBy,
  type Found,
  projectionsOf,
  type Query,
  type Reindexed,
  type Summed,
  type Tally,
} from './storage/projections.ts'
import { defaultPartitions } from './storage/tables.ts'

export {
  leased,
  newestVersion,
  outranked,
  recordVersions,
  standingOf,
  type Versioned,
} from './storage/cluster.ts'
export { type Due, type Examined, type Inspection, type Suspension } from './storage/entities.ts'
export { type Consumer, type Cursor, type Published } from './storage/log.ts'
export { batch } from './storage/rows.ts'
export {
  type After,
  type Comparison,
  type Counted,
  type CountedBy,
  type Criterion,
  type Found,
  type Query,
  type Reindexed,
  type Summed,
  type Tally,
} from './storage/projections.ts'
export {
  createTables,
  defaultPartitions,
  type Dialect,
  dialectOf,
  hold,
  partitioned,
  partitionOf,
  renamed,
  tablesMade,
  transaction,
} from './storage/tables.ts'

export interface Storage<T extends Types> {
  /** What is stored for the entity `id`, its replies left out, or null when there is none (decision 0065). */
  readonly load: (id: string) => Effect.Effect<Machine.Stored<T> | null>
  /**
   * A request and a message that reached a door on Cluster as the JSON text of the version that wrote them, read
   * at the program's version through its migrations, as a message of the mailbox is read (decision 0085). Text no
   * version reads is no request the runtime sent, and dies, naming the program (decision 0043).
   */
  readonly delivered: (
    version: number,
    request: string,
    message: string,
  ) => Effect.Effect<Readonly<{ request: Request<T['sender']>; message: T['inbound'] }>>
  /**
   * How many steps wrote the entity `id`, or null where it is not stored: what a step on Cluster reads first, in its
   * transaction, to know which machine in memory is the one stored (decision 0161).
   */
  readonly stepsOf: (id: string) => Effect.Effect<number | null>
  /** The flags of a creation that reached a door on Cluster, and its request, read as `delivered` reads them. */
  readonly deliveredCreation: (
    version: number,
    request: string,
    flags: string,
  ) => Effect.Effect<Readonly<{ request: Request<T['sender']>; flags: T['flags'] }>>
  /**
   * The reply stored for the entity `id` under `request`, or null for none: what a `Receive` is given
   * (decision 0065). A caller's reply past its time at `at`, in milliseconds, is none (decision 0125).
   */
  readonly reply: (
    id: string,
    request: Request<T['sender']>,
    at: number,
  ) => Effect.Effect<Machine.StoredReply<T['rejection']> | null>
  /**
   * Writes what an event wrote, as the machine encoded it (decision 0057). The caller wraps it in the transaction
   * of the event (decision 0007). `at` is the time of the event, in milliseconds: the time the entity suspended,
   * where the event suspends it (decision 0114). It gives how many characters it wrote of the state and of the
   * projection, in the read model and in the step's publication, which the runtime warns of past a threshold
   * (decisions 0135, 0154).
   */
  readonly write: (id: string, written: Machine.Written, at: number) => Effect.Effect<number>
  /**
   * The entities whose state holds an operation, or whose mailbox holds a message: what a process activates when
   * it starts, without waiting for a caller. So an operation a crash interrupted runs again, and a message a
   * crash left before its step is handled. A timer needs no activation of its own, since its time is stored and
   * `due` gives it. A suspended entity handles nothing until an operator resumes it, and is left out (decisions 0006,
   * 0029, 0071).
   */
  readonly interrupted: Effect.Effect<ReadonlyArray<string>>
  /**
   * The entities of `interrupted` whose stored partition is `partition`: on Cluster, the ones a runner activates when
   * it gains the shard of that number (decision 0162).
   */
  readonly interruptedIn: (partition: number) => Effect.Effect<ReadonlyArray<string>>
  /**
   * The stored timers of the entities this process does not hold: `loaded` are the ones it does, whose timers are
   * armed in it, and a suspended entity is left out, since no timer of its fires (decision 0029). Given
   * `partitions`, only the entities whose stored partition is among them are read: on Cluster, the shards the
   * runner holds (decision 0162).
   */
  readonly due: (
    now: number,
    loaded: ReadonlyArray<string>,
    partitions?: ReadonlyArray<number>,
  ) => Effect.Effect<Due>
  /**
   * Creates one expression index per index the program declares, so that a query over it is a lookup. Run once,
   * where the program is deployed: an index the program no longer declares is left behind, and costs nothing.
   */
  readonly indexed: Effect.Effect<void>
  /** The entities of the program whose indexes match, with what callers read of them (decision 0032). */
  readonly query: (query: Query<T>) => Effect.Effect<ReadonlyArray<Found<T>>>
  /** `Handle.count`, as the storage keeps it: one statement, which reads no projection (decision 0148). */
  readonly count: (counted: Counted<T>) => Effect.Effect<number>
  /** `Handle.sum`, as the storage keeps it: one statement, which reads no projection (decision 0148). */
  readonly sum: (summed: Summed<T>) => Effect.Effect<number>
  /** `Handle.countBy`, as the storage keeps it: one statement, which reads no projection (decision 0150). */
  readonly countBy: (counted: CountedBy<T>) => Effect.Effect<ReadonlyArray<Tally>>
  /** `Handle.read`, as the storage keeps it: the projection of the entity's row, or null for none (decision 0121). */
  readonly projected: (id: string) => Effect.Effect<T['projection'] | null>
  /**
   * `Handle.reindex`, as the storage keeps it. Each row is its own write, so a crash leaves the rest to the next
   * run. It gives how many were written, and the entities whose row the program could not compute, which keep
   * theirs (decision 0122). A row is written only if the state it was computed from is still the one stored: an
   * entity that took a step since wrote its own (decision 0070).
   */
  readonly reindex: Effect.Effect<Reindexed>
  /**
   * `Handle.published`, as the storage keeps it: the rows of `topic` past the cursors of `after`, in the order they
   * were written. The topic and the partitions are the caller's to check.
   */
  readonly published: <Name extends Topic<T>>(
    topic: Name,
    after: ReadonlyArray<Cursor>,
    limit: number,
  ) => Effect.Effect<ReadonlyArray<Published<T, Name>>>
  /**
   * Stores each consumer the deploy declares that is not stored yet, with no cursor: from then on it holds its
   * topic of the log, acked or not, until it is forgotten (decision 0152).
   */
  readonly declare: (consumers: ReadonlyArray<Readonly<{ topic: string; consumer: string }>>) => Effect.Effect<void>
  /**
   * `Handle.fetch`, as the storage keeps it: it reads the consumer's cursors, and writes nothing (decision 0152).
   * Given `partitions`, it reads those partitions only (decision 0153). The partitions are the caller's to check.
   */
  readonly fetch: <Name extends Topic<T>>(
    topic: Name,
    consumer: string,
    limit: number,
    partitions?: ReadonlyArray<number>,
  ) => Effect.Effect<ReadonlyArray<Published<T, Name>>>
  /**
   * `Handle.ack`, as the storage keeps it, in one transaction: the head of each partition is read first, and caps
   * the cursor stored there.
   */
  readonly ack: (topic: Topic<T>, consumer: string, through: ReadonlyArray<Cursor>) => Effect.Effect<void>
  /**
   * `Handle.prune`, as the storage keeps it: in batches, each of which reads the cursors and drops its rows in one
   * transaction (decision 0245).
   */
  readonly prune: Effect.Effect<number>
  /**
   * Every consumer stored, with how many rows are past its cursors, by topic and name. Whether the deploy declares
   * it is the runtime's to say.
   */
  readonly consumers: Effect.Effect<ReadonlyArray<Omit<Consumer, 'declared'>>>
  /** Drops a consumer and its cursors, so that the next prune passes what it never read (decision 0039). */
  readonly forget: (topic: Topic<T>, consumer: string) => Effect.Effect<void>
  /**
   * `Handle.expire`: deletes the callers' replies past their time at `at`, in milliseconds, in batches, and counts
   * them (decision 0245).
   */
  readonly expire: (at: number) => Effect.Effect<number>
  /** The suspended entities of the program, the longest suspended first (decision 0114). */
  readonly suspended: Effect.Effect<ReadonlyArray<Suspension>>
  /**
   * What is stored for the entity `id`, read as `load` reads it, with its suspension as `suspended` lists it, or null
   * when there is none. Every row is read from one snapshot, so a step that commits meanwhile is read whole or not
   * at all (decision 0185).
   */
  readonly inspect: (id: string) => Effect.Effect<Inspection<T> | null>
  /**
   * For `check`: what is stored for the entity `id`, read as `inspect` reads it, from one snapshot, or the cause of
   * what the program read of a row and died on, or null when there is none. What the runtime throws, a row that is
   * no JSON included, fails the call (decision 0247).
   */
  readonly examine: (id: string) => Effect.Effect<Examined<T> | null>
  /**
   * For `check`: a page of the program's entities past the id `after`, by id, each with whether it is suspended
   * (decision 0247).
   */
  readonly entities: (after: string) => Effect.Effect<ReadonlyArray<Readonly<{ id: string; suspended: boolean }>>>
  /**
   * On Cluster: records that an operation of the entity `sender` was answered `Suspended` by the entity `id`, once
   * for each sender however often it is answered so (decision 0167).
   */
  readonly wait: (id: string, sender: Readonly<{ name: string; id: string }>) => Effect.Effect<void>
  /** On Cluster: the senders recorded for the entity `id`, deleted as they are read (decision 0167). */
  readonly waiters: (id: string) => Effect.Effect<ReadonlyArray<Readonly<{ name: string; id: string }>>>
  /**
   * On Cluster: keeps the Cluster request id `requestId` of a request the operation `asked` sent, under its work if
   * the asker's work still holds, and pending otherwise. An id already kept is not kept again (decision 0169). It
   * gives whether the work still holds (decision 0170).
   */
  readonly keepSent: (
    requestId: string,
    asked: Readonly<{ entity: Readonly<{ name: string; id: string }>; key: Key; incarnation: number }>,
  ) => Effect.Effect<boolean>
  /** On Cluster: keeps the Cluster request id `requestId` pending, as a request nothing waits for (decision 0169). */
  readonly pendSent: (requestId: string) => Effect.Effect<void>
  /**
   * On Cluster: deletes Cluster's rows under every pending id, and the pending ids. A step runs it first, before
   * Cluster saves the rows of the step's own request (decision 0169).
   */
  readonly forgetPending: Effect.Effect<void>
  /**
   * On Cluster: keeps the Cluster request id `requestId` of a caller's creation or message to the entity `id`, once
   * its client was given the answer, until the time `until`, in milliseconds. Past it, a step of the entity that
   * answers a caller and `expire` delete Cluster's rows under the id. An id already kept is not kept again
   * (decision 0171).
   */
  readonly keepGiven: (requestId: string, id: string, until: number) => Effect.Effect<void>
}

/**
 * The storage of one program's entities, on one client, with its schemas read once. `partitions` is the number of
 * partitions of the log, which `partitioned` checks against the database. `onCluster` says whether Cluster's tables
 * are beside the runtime's, whose rows a step deletes with the work that sent them (decision 0169). `stored` is the
 * name the rows are stored under: the program's, but for `check` of a program a launch is to rename them to
 * (decision 0247).
 */
export const storage = <T extends Types>(
  program: Program<T>,
  sql: SqlClient.SqlClient,
  partitions: number = defaultPartitions,
  onCluster: boolean = false,
  stored: string = program.name,
): Storage<T> => {
  const held = heldOf(program, sql, partitions, onCluster, stored)
  return { ...entitiesOf(held), ...projectionsOf(held), ...logOf(held), ...onClusterOf(held) }
}
