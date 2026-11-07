/**
 * The runtime on one process, over `SqlClient`: it drives the machine ([`machine.ts`](machine.ts)) and acts on its
 * outputs (decision 0013). An event is one transaction (decision 0007). What the machine says it writes is
 * written (decision 0057), and only then are the callers answered and the work started. So a crash before the
 * commit leaves nothing of the event, and one after it is an activation away from the work the state holds.
 *
 * What is stored lives in the database ([`storage.ts`](storage.ts)). What is running lives in this process's
 * scope: the operations' fibers, the timers' sleeps, the entities loaded. A crash is that scope closing. An
 * entity with nothing to do is unloaded, a crash this process chooses, and the stored time of its earliest timer
 * is what wakes it (decision 0029).
 */
import * as Cause from 'effect/Cause'
import * as Clock from 'effect/Clock'
import * as Context from 'effect/Context'
import * as Data from 'effect/Data'
import * as DateTime from 'effect/DateTime'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Latch from 'effect/Latch'
import * as MutableList from 'effect/MutableList'
import * as Queue from 'effect/Queue'
import * as Schedule from 'effect/Schedule'
import * as Scope from 'effect/Scope'
import * as Semaphore from 'effect/Semaphore'
import { SqlClient } from 'effect/sql'
import * as Machine from './machine.ts'
import {
  type Address,
  type Key,
  checkProgram,
  type Creation,
  encode,
  Entities,
  InvariantDefect,
  isText,
  isTimer,
  type Program,
  type Reply,
  type Request,
  runnerOf,
  type Topic,
  topicsOf,
  type Types,
} from './program.ts'
import {
  type Consumer,
  type Counted,
  type CountedBy,
  type Cursor,
  defaultPartitions,
  type Found,
  type Published,
  hold,
  partitionOf,
  partitioned,
  renamed,
  type Query,
  type Reindexed,
  storage,
  type Storage,
  type Summed,
  type Suspension,
  type Tally,
} from './storage.ts'

/**
 * What a caller is answered: the replies stored under its request id, `NotFound` for no entity, `Suspended`,
 * which says that the request has no reply yet (decision 0023), and `Full`, which says that the entity holds as many
 * callers' messages as its bound, and nothing of this one was offered or stored (decision 0147).
 */
export type Answer<Reason> = Reply<Reason> | Readonly<{ _tag: 'Suspended' }> | Readonly<{ _tag: 'Full' }>

/**
 * An operation of another entity whose `send` waits for the entity's resumption: its run, and the name it sent
 * under (decision 0114).
 */
export type Waiting = Readonly<{ entity: Address; key: Key; incarnation: number; name: string }>

/**
 * A suspended entity, as `Handle.suspended` lists it: what the storage holds of the suspension, and the senders
 * waiting for its resumption in this process (decision 0114).
 */
export type Suspended = Suspension & Readonly<{ waiting: ReadonlyArray<Waiting> }>

/** What an operator's `resume` or `discard` did (decision 0114). */
export type Operated =
  /** The entity was activated again: the message it died on is handled next, by the program deployed. */
  | Readonly<{ _tag: 'Resumed' }>
  /** The inbound message the entity died on was dropped, and the entity activated again. */
  | Readonly<{ _tag: 'Discarded' }>
  /**
   * The entity died on an internal message, in an operation or on its activation: none is discarded (decisions 0041,
   * 0044).
   */
  | Readonly<{ _tag: 'NotDiscarded' }>
  /** The program deployed dies on the stored state too, with this cause. A discard then keeps its message. */
  | Readonly<{ _tag: 'StillSuspended'; cause: string }>
  | Readonly<{ _tag: 'NotSuspended' }>
  | Readonly<{ _tag: 'NotFound' }>

/** What a `Resume` or a `Discard` did, read off the machine before and after it (decision 0114). */
const operated = <T extends Types>(
  event: 'Resume' | 'Discard',
  before: Machine.Machine<T>,
  after: Machine.Machine<T>,
): Operated => {
  if (before.stored.suspension === null) return { _tag: 'NotSuspended' }
  if (after.stored.suspension === null) return { _tag: event === 'Resume' ? 'Resumed' : 'Discarded' }
  if (after === before) return { _tag: 'NotDiscarded' }
  return { _tag: 'StillSuspended', cause: Machine.render(after.stored.suspension.cause) }
}

/** The callers waiting for a reply of one kind, by entity and then by request. */
type Callers<A> = Map<string, Map<string, Set<Deferred.Deferred<A>>>>

/** A point of the design's crash table, where a test dies to see what survives. */
export type Point =
  /** The event's `Stored` is computed, and not yet written. */
  | 'BeforeCommit'
  /** Written, and nothing acted on yet: no caller answered, no work started, no message handled. */
  | 'AfterCommit'
  /** The callers of the event are answered, and its work is not started. */
  | 'AfterReply'

/**
 * What the runtime says it did: a point of the crash table it reached with an event, an event it applied, and an
 * entity it unloaded. An event is said once written, in the order the events were applied. An entity is said
 * unloaded once its timers have stopped.
 */
export type Said =
  | Readonly<{ _tag: 'Reached'; point: Point; entity: Address; event: Machine.Event<never> }>
  | Readonly<{ _tag: 'Applied'; entity: Address; event: Machine.Event<never> }>
  | Readonly<{ _tag: 'Unloaded'; entity: Address }>

/**
 * Told what the runtime did, and waited for before it goes on. A test replays the events in the machine, counts
 * the passivations, or never returns at a point of the crash table, to crash the process there. The default does
 * nothing, as Effect's tracer does. A test provides another around `launch`, which reads it once. It is no
 * option, and no part of what a user imports (decisions 0055, 0073).
 */
export const Probe = Context.Reference<(said: Said) => Effect.Effect<void>>('effect-tea-durable/Probe', {
  defaultValue: () => () => Effect.void,
})

export interface Options {
  /**
   * How long a `send` or a `create` from another entity waits before sending again to a receiver that crashed on
   * it (decision 0046). A suspended receiver is waited for until it is resumed, and a program not deployed yet until
   * it is: neither is looked at again on a clock (decision 0063).
   */
  readonly retry?: Readonly<{ millis: number }>
  /**
   * How long an entity stays loaded with no event coming for it. The wait starts again at every event, and when
   * it runs out the entity is unloaded, or waits again if it still has something to do (decision 0029).
   */
  readonly passivate?: Readonly<{ millis: number }>
  /**
   * How many entities the process holds, of every program, before it unloads the least recently used of those
   * with nothing to do and no timer due, without waiting for their passivation. Another is never unloaded for it,
   * so the process holds more only while what it holds is busy. A positive integer, 10 000 by default, which is
   * Effect Cluster's `maxResidentEntities`; `'unbounded'` leaves time alone to unload (decisions 0076, 0078, 0151).
   */
  readonly capacity?: Readonly<{ entities: number | 'unbounded' }>
  /**
   * How long a planned stop waits for the at-most-once operations under way, once the scope the runtime was launched
   * in closes. Meanwhile no caller's message, creation, resume or discard is taken, the timers stop, and so do the
   * operations that run again at the next activation. The at-most-once operations and the steps of their
   * completions run on, and an at-most-once operation such a step starts runs too. Whatever is under way after
   * `millis` stops as in a crash. None by default: the scope's closing is a crash (decision 0119).
   */
  readonly drain?: Readonly<{ millis: number }>
  /**
   * How many characters a step may write of the state and of the projection, in the read model and in each topic
   * of the outbox, before the runtime logs a warning, once per activation of the entity. 262 144 by default.
   * Nothing is refused for its size: the program splits a large state (decisions 0135, 0138).
   */
  readonly warn?: Readonly<{ characters: number }>
  /**
   * How many callers' messages an entity holds before a `send` is answered `Full`: the messages of `send` offered
   * to it and not yet applied, whose callers wait. A positive integer, 4096 by default. The first refusal of an
   * activation logs a warning. An operation of another entity is never answered `Full`: it sends again after `retry`
   * (decision 0147).
   */
  readonly callers?: Readonly<{ messages: number }>
  /**
   * How many partitions the log has: a positive integer, 300 by default. The first launch stores it in the
   * database, and a launch given another number fails, since a change would move entities between partitions,
   * and every consumer's cursors with them (decision 0137).
   */
  readonly log?: Readonly<{ partitions: number }>
  /**
   * The programs renamed, from each old name to its new one. The launch moves what is stored under each old name to
   * the new one in one transaction, before any deploy, and an entity keeps the idempotency keys of its work. A
   * rename whose old name holds nothing moves nothing, so it may stay here for as long as a database of the old
   * name may be launched. One onto a name that holds an entity, a head of the log or a consumer dies. So do an
   * empty name, a name renamed to itself, a name both renamed and the new name of another, and two names renamed
   * to one, before the database is held. A deploy of a name renamed dies (decision 0156).
   */
  readonly renames?: Readonly<Record<string, string>>
}

/** The renames of a launch as pairs, or the launcher's defect where they cannot run as written (decision 0156). */
const renamesOf = (renames: Readonly<Record<string, string>>): ReadonlyArray<readonly [string, string]> => {
  const pairs = Object.entries(renames)
  const targets = new Map<string, string>()
  for (const [from, to] of pairs) {
    const reason = typeof to !== 'string' || from === '' || to === ''
      ? `the launch renames '${from}' to '${String(to)}', and a name is a string that is not empty`
      : !isText(from) || !isText(to)
      ? `the launch renames ${JSON.stringify(from)} to ${JSON.stringify(to)}, and a name is text a database holds`
      : from === to
      ? `the launch renames '${from}' to itself`
      : Object.hasOwn(renames, to)
      ? `the launch renames '${from}' to '${to}', which it renames too`
      : targets.has(to)
      ? `the launch renames both '${targets.get(to)}' and '${from}' to '${to}'`
      : null
    if (reason !== null) throw new InvariantDefect({ reason })
    targets.set(to, from)
  }
  return pairs
}

/**
 * The consumers a deployment reads the log with, by topic: each a name within its topic. Who reads the log is the
 * deployment's, so the same program is deployed with other consumers, or none, in a test (decision 0152).
 */
export type Consumers<T extends Types> = { readonly [Name in Topic<T>]?: ReadonlyArray<string> }

/** The names `C` declares for the topic `Name`, or `never` where it declares none. */
export type ConsumerOf<C, Name extends string> = Name extends keyof C
  ? NonNullable<C[Name]> extends ReadonlyArray<infer Consumer extends string> ? Consumer : never
  : never

/** What a caller does with one program's entities, deployed with the consumers `C`. */
export interface Handle<T extends Types, C = {}> {
  /**
   * How many partitions the log has, as the first launch of its database stored it: what the readers of one consumer
   * divide among them (decisions 0137, 0153).
   */
  readonly partitions: number
  /** Creates the entity `id`. A retry of the request that created it is answered `Created` (decision 0017). */
  readonly create: (
    id: string,
    flags: T['flags'],
    request: Readonly<{ requestId: string; sender: T['sender'] }>,
  ) => Effect.Effect<Creation>
  /**
   * Sends an inbound message, and waits for the reply. A retry under the same request id gets the reply stored for
   * it. The boundary gives `keep`, the time its protocol retries for. The reply is then kept for `keep.millis` from
   * the step that answers, and a retry after that is a new request, applied again. Without `keep` the reply is kept
   * for ever. `keep.millis` is a non-negative integer, and anything else is the caller's defect (decision 0125). An
   * entity that holds as many callers' messages as `callers.messages` answers `Full` at once, and nothing of the
   * message is offered or stored: the caller retries later, under the same request id or another (decision 0147).
   */
  readonly send: (
    id: string,
    message: T['inbound'],
    request: Readonly<{ requestId: string; sender: T['sender']; keep?: Readonly<{ millis: number }> }>,
  ) => Effect.Effect<Answer<T['rejection']>>
  /**
   * What callers read of the entity, or null when there is none: the row written by its last event that changed
   * its state, which a query reads too. `project` is not called, so a new `project` that dies on the stored state
   * is no reader's defect. A new `project` reaches the row at the entity's next step that changes it, or at
   * `reindex`. The row is read through the projection's migrations and schema, as a query reads it, and a reader
   * is given the defect where they die (decision 0121).
   */
  readonly read: (id: string) => Effect.Effect<T['projection'] | null>
  /**
   * What callers read of the entities whose indexes match, across the program, at most `query.limit` of them: the
   * read model is written in each entity's own transaction, so nothing found here is a projection its entity has
   * moved past (decision 0032). The limit is required, so that no reading holds the whole read model in one array
   * (decision 0141). Given `after`, the last row of a page, the query gives the rows past it in its order, by the
   * index ordered by and then by the id; each row carries the indexes it stores for that. Nothing is held between
   * two pages, so a row no step changes is given once, and a row whose index changes between them is given where
   * it stands when the next page is read (decision 0143). A descending order is the ascending one reversed, the ids
   * of the rows that tie included, and a page reads only the rows it gives (decision 0145).
   */
  readonly query: (query: Query<T>) => Effect.Effect<ReadonlyArray<Found<T>>>
  /**
   * How many entities of the program have indexes that match `where`, compared as a query compares them, and every
   * entity where there is no criterion. It is one statement, which reads the rows as one transaction sees them and
   * reads no projection. A row an older version wrote is counted by the indexes it holds, until a step or `reindex`
   * writes it again (decision 0148).
   */
  readonly count: (counted: Counted<T>) => Effect.Effect<number>
  /**
   * The total of `index` over the entities whose indexes match `where`, as `count` finds them: a double, `0` over no
   * entity. A row whose index holds null, or no value at all, adds nothing. A row whose index holds a string or a
   * boolean is the caller's defect: the call dies, naming the index and the least id of such a row, and gives no
   * total (decision 0148).
   */
  readonly sum: (summed: Summed<T>) => Effect.Effect<number>
  /**
   * For each value `index` holds among the entities whose indexes match `where`, as `count` finds them, the value
   * and how many entities hold it, in one statement that reads no projection. A value no entity holds has no entry.
   * The values come in the order a query orders the index by, null first, at most `limit` of them: a caller that
   * must know whether they ended asks for one more. `true` and `1` are two values, and an index a row lacks is null,
   * as a query reads it. A limit that is no non-negative integer is the caller's defect (decision 0150).
   */
  readonly countBy: (counted: CountedBy<T>) => Effect.Effect<ReadonlyArray<Tally>>
  /**
   * Writes the read model of every entity of the program again, from its stored state, and gives how many rows it
   * wrote and which entities it passed over. An index a new version of the program added or changed needs it, since a row is written only when its entity
   * takes a step. An operator runs it after such a deploy (decision 0032). An entity that takes a step while it
   * runs keeps the row its step wrote (decision 0070). An entity whose row the program cannot compute, since its
   * state is one no version reads, or a migration, a schema, `project` or an index dies on it, keeps the row it
   * had, and is listed in `failed` with the cause. The rest are written all the same. What the runtime throws, a
   * corrupted row's included, fails the whole call (decision 0122).
   */
  readonly reindex: Effect.Effect<Reindexed>
  /**
   * What the entities of the program published in `topic`, past the cursors of `after`, at most `limit` rows, the
   * oldest first. Each row is the message an entity handled and the value its topic selects of what callers read
   * of it afterwards, written in that step's transaction. A topic selects a part of the projection, and a step is
   * written in the topics whose selection it changed (decisions 0038, 0138, 0140). A program that declares no
   * topics publishes its projection as the topic `projection`, at each step that changes it. The rows of one entity
   * come in the order its steps committed, and each carries its partition and its `seq` within it. The rows of one step
   * share its `seq`, so a topic's `seq`s have gaps. The log promises no order across entities: a row of one entity
   * written before a row of another may come after it (decision 0137). A partition with no cursor in `after` is
   * read from `0`, so `[]` is the whole topic. The cursors are the caller's, and nothing of them is stored: a
   * reading here, by a test or an operator looking, has no say in a prune. A consumer that keeps its cursors reads
   * with `feed` instead (decision 0039).
   */
  readonly published: <Name extends Topic<T>>(
    topic: Name,
    after: ReadonlyArray<Cursor>,
    limit: number,
  ) => Effect.Effect<ReadonlyArray<Published<T, Name>>>
  /**
   * The same from the stored cursors of the consumer `consumer` of `topic`: a consumer is a name within its topic,
   * declared where the program is deployed, and `ack` moves its cursors once the rows are acted on. From the deploy
   * that first declares it, its topic of the log is kept for it, so a consumer holds no state of its own, and a
   * reading writes nothing. A name the deploy does not declare for the topic is the caller's defect
   * (decisions 0039, 0138, 0152).
   * Given `wait`, a reading that finds no row waits until a step commits a row in `topic`, and reads again, for at
   * most `wait.millis` from the call: it gives the first page with a row, or none once the time is over or the
   * runtime stops. A limit of 0 gives none at once. `wait.millis` is a non-negative integer, and anything else is
   * the caller's defect (decision 0142).
   * Given `partitions`, a reading reads those partitions only, so that the readers of one name divide its
   * partitions among them. The division is the caller's: the runtime holds no reader, and two readers that name one
   * partition are given the same rows. A list that is empty, or holds what is no partition of the log, is the
   * caller's defect (decision 0153).
   */
  readonly feed: <Name extends Topic<T>>(
    topic: Name,
    consumer: ConsumerOf<C, Name>,
    limit: number,
    options?: Readonly<{ wait?: Readonly<{ millis: number }>; partitions?: ReadonlyArray<number> }>,
  ) => Effect.Effect<ReadonlyArray<Published<T, Name>>>
  /**
   * Moves a consumer's cursor in each partition `through` names, and no other. The rows `feed` gave are such a
   * list. A cursor never moves back, since what is behind it may be gone, and never past the last `seq` written in
   * its partition, so that no row written later is behind it (decisions 0039, 0137). The consumer is one the deploy
   * declares for the topic (decision 0152). A topic is one the program publishes, and a partition is an integer from 1
   * to the number of partitions of the log. A `seq` and a limit are non-negative integers, here and in `query`,
   * `published` and `feed`, and a limit left out is no limit at all but the caller's defect, as is anything else
   * (decisions 0053, 0138, 0141). An ack joins a transaction the caller left open on the client the runtime was
   * launched with, so a store the caller writes in it commits with the cursors. Within it the caller waits for
   * nothing a step does, since a step's commit waits for the transaction's connection (decision 0150).
   */
  readonly ack: <Name extends Topic<T>>(
    topic: Name,
    consumer: ConsumerOf<C, Name>,
    through: ReadonlyArray<Cursor>,
  ) => Effect.Effect<void>
  /**
   * Drops what every consumer of a topic has read, in each partition through the lowest cursor there, and gives how
   * many rows went. A consumer that has acked nothing of a partition holds the whole partition of its topic. A
   * topic no consumer is stored for is dropped whole, since no reader that keeps cursors needs its rows: a reading
   * with `published` has no say in a prune (decisions 0039, 0137, 0152).
   */
  readonly prune: Effect.Effect<number>
  /**
   * Each consumer stored, with its topic, whether the deploy declares it, how many rows are past its cursors, and its
   * cursors in the partitions it has rows to read in: what keeping it costs the log (decision 0152).
   */
  readonly consumers: Effect.Effect<ReadonlyArray<Consumer>>
  /**
   * Drops a consumer of `topic` and its cursors, so that the next prune passes what it never read: how a consumer
   * the deploy no longer declares stops holding the log. A consumer the deploy declares is not forgotten, which is
   * the caller's defect: a deploy without it lets it go (decisions 0039, 0152).
   */
  readonly forget: (topic: Topic<T>, consumer: string) => Effect.Effect<void>
  /**
   * Deletes the callers' replies of the program past their time, and gives how many went. A reply past its time is
   * never read, so this frees only their rows: those of an entity that takes no step, since a step deletes its own
   * entity's (decision 0125).
   */
  readonly expire: Effect.Effect<number>
  /**
   * The suspended entities of the program, the longest suspended first: each with what it died on, the cause, since
   * when, and the senders waiting for its resumption in this process. Read from what is stored, so an entity this
   * process does not hold is listed too (decision 0114).
   */
  readonly suspended: Effect.Effect<ReadonlyArray<Suspended>>
  /**
   * An operator resumes a suspended entity (decision 0006), with the program deployed: a fixed program is a deploy
   * of it, which the resume follows (decision 0064). It gives `Resumed`, `StillSuspended`, `NotSuspended` or
   * `NotFound` (decision 0114).
   */
  readonly resume: (id: string) => Effect.Effect<Operated>
  /**
   * An operator discards the inbound message a suspended entity died on (decision 0014). An internal one is not
   * discarded, and the entity stays suspended (decisions 0041, 0044). It gives `Discarded`, `NotDiscarded`,
   * `StillSuspended`, `NotSuspended` or `NotFound` (decision 0114).
   */
  readonly discard: (id: string) => Effect.Effect<Operated>
}

export interface Runtime {
  /**
   * Runs a program's entities in this process. The operations' services are taken from here, and their fibers run
   * in the runtime's scope: a program is deployed where its services are. `Entities` is the runtime's own, filled
   * in with the entity each operation runs for, so a program that only talks to other entities needs nothing.
   * A program that cannot run as written dies here, before anything is stored or run (decision 0054). So does
   * one whose name this process has deployed already: a new version is deployed by a new process (decision 0075).
   * `consumers` are the names the log is read with, by topic, none by default. The deploy stores each that is not
   * stored yet, so that it holds its topic from then on. A consumer stored and not declared is kept, and the deploy
   * logs a warning for it. A topic the program does not publish, consumers of a topic that are no list, an empty
   * name or a name declared twice in a topic are refused, before anything is stored (decision 0152).
   */
  readonly deploy: <T extends Types, const C extends Consumers<T> = {}>(
    program: Program<T>,
    options?: Readonly<{ consumers?: C }>,
  ) => Effect.Effect<Handle<T, C>, never, Exclude<T['services'], Entities>>
  /**
   * Waits until nothing is under way. Nothing is under way when no event waits, no mailbox holds a message and no
   * operation runs; when no entity told to leave is still held (decision 0076), and none is still unloading
   * (decision 0109); and when no stored timer of an entity this process has unloaded is due (decision 0029).
   */
  readonly settled: Effect.Effect<void>
}

/**
 * What tells an entity's loop to unload it now, as if its wait had run out: put in its queue of events, so that
 * the loop takes it or an event, and loses neither (decision 0076). It is no event, and is not counted as one.
 */
type Evict = Readonly<{ _tag: 'Evict' }>

/**
 * What tells an entity's loop that its wait has run out: put in its queue of events by a sleep the loop forks for
 * the wait, so that the take is never raced against a timeout, and loses no event (decision 0116). `wait` is the
 * wait it ends, since one put there just before an event is taken after it. It is no event, and is not counted as
 * one.
 */
type Passivate = Readonly<{ _tag: 'Passivate'; wait: number }>

/**
 * On Cluster: what tells an entity's loop that a door's step may have committed, so that the loop settles which
 * machine is the stored one, and starts what that machine sets going (decision 0161). Counted as an event.
 */
type Settle = Readonly<{ _tag: 'Settle' }>

/**
 * On Cluster: the machine a door's step computed, in Cluster's transaction, and not known to be committed yet. `steps`
 * is the count of the entity's row once that transaction commits, and `transitions` are the events it stepped, with
 * what each set going, which are performed once a later step finds the count (decision 0161).
 */
type Uncommitted<T extends Types> = Readonly<{
  machine: Machine.Machine<T>
  steps: number
  transitions: ReadonlyArray<Stepped<T>>
}>

/** An event a door's step stepped, what it wrote, and what it set going. */
type Stepped<T extends Types> = Readonly<{
  event: Machine.Event<T>
  written: Machine.Written | null
  outputs: ReadonlyArray<Machine.Output<T>>
}>

/**
 * On Cluster: what the steps of one entity in one transaction have made so far, a door's or an activation's. The
 * entity loaded or created, if any, the machine its last step gave, the count of steps its row will hold once the
 * transaction commits, and the events stepped (decision 0161).
 */
interface Stepping<T extends Types> {
  loaded: Loaded<T> | null
  machine: Machine.Machine<T> | null
  steps: number
  readonly transitions: Array<Stepped<T>>
}

/**
 * On Cluster: an entity of a shard this runner may not load, since Cluster does not route the shard here, or the
 * runtime has let the shard go (decision 0162). Nothing of the transaction that finds it is kept.
 */
class Unheld extends Data.TaggedError('Unheld')<Readonly<{ id: string }>> {}

/** A request that reaches a program's door on Cluster: which RPC, the entity, and what its payload carries. */
export type Delivered = Readonly<{
  _tag: 'Create' | 'Message'
  id: string
  version: number
  request: string
  message: string
}>

/** What a door's step answers: a message's answer, or a creation's. */
export type DoorAnswer<Reason> =
  | Readonly<{ _tag: 'Message'; answer: Reply<Reason> | Readonly<{ _tag: 'Suspended' }> }>
  | Readonly<{ _tag: 'Create'; answer: Creation }>

/**
 * What the runtime is given to run on Effect Cluster (decisions 0081, 0092, 0161): how a deploy registers its
 * program's door, whose requests the runtime steps in Cluster's transaction. `src/cluster.ts` gives it.
 */
export interface OnCluster {
  readonly register: <T extends Types>(
    program: Program<T>,
    step: (delivered: Delivered) => Effect.Effect<DoorAnswer<T['rejection']>>,
    idle: number,
  ) => Effect.Effect<void, never, Scope.Scope>
  /** How many shards the doors' group has: Cluster's `shardsPerGroup`. */
  readonly shards: number
  /** The number of the shard Cluster routes the id or the singleton's name `id` to, in the doors' group. */
  readonly shardOf: (id: string) => number
  /** Whether this runner holds the shard of that number now, as Cluster says. */
  readonly holds: (shard: number) => boolean
  /**
   * Registers `run` as the singleton `name`, in the doors' group, for as long as the scope lasts. Cluster starts it
   * where this runner holds the name's shard, and interrupts it before the runner lets the shard go, waiting for its
   * finalizers to end (decision 0092).
   */
  readonly singleton: (
    name: string,
    run: Effect.Effect<void, never, Scope.Scope>,
  ) => Effect.Effect<void, never, Scope.Scope>
  /**
   * What tells this runner that another runner committed: `version`, a number that moves once another connection
   * commits to the database and not at this runner's own commits, read every `millis` while a reading waits
   * (decision 0163).
   */
  readonly others: Readonly<{ version: Effect.Effect<number, unknown>; millis: number }>
}

/** An entity loaded in this process: its machine, the events waiting, and what is running for it. */
interface Loaded<T extends Types> {
  machine: Machine.Machine<T>
  applying: boolean
  readonly events: Queue.Queue<Machine.Offered<T> | Evict | Passivate | Settle>
  /**
   * On Cluster: how many steps had written the stored row when `machine` was stepped, and the machine of a door's
   * step not known to be committed yet (decision 0161). Off Cluster, `uncommitted` stays null.
   */
  steps: number
  uncommitted: Uncommitted<T> | null
  /** Told to leave the process, and not taken that yet: until its loop does, the process is not settled. */
  evicted: boolean
  /** How many times the loop has waited for an event: the number of the wait under way. */
  waits: number
  /**
   * The events offered and not yet applied: counted as each is offered, and until its step is done, so that an
   * event taken off the queue and not yet applied is still under way (decision 0063).
   */
  pending: number
  /** By `under`: a timer's sleep is not work the runtime waits for. */
  readonly operations: Map<string, Fiber.Fiber<void>>
  /**
   * The operations among `operations` that run again at the next activation, idempotent and at least once: a
   * planned stop interrupts them at once (decision 0119).
   */
  readonly rerun: Set<string>
  readonly timers: Map<string, Fiber.Fiber<void>>
  /** Whether this activation has warned of a large step: an entity warns once per activation (decision 0135). */
  warned: boolean
  /**
   * A permit for each message of `send` offered and not yet applied: one is taken with the offer, or the caller is
   * answered `Full`, and given back as the message's step ends (decision 0147).
   */
  readonly callers: Semaphore.Semaphore
  /** Whether this activation has warned that it is full, once per activation as of a large step (decision 0147). */
  refused: boolean
}

/**
 * What wakes the entities this process does not hold: a fiber reads the earliest time a stored timer is due,
 * sleeps until then, and activates what the time has come for (decision 0029).
 */
interface Waker {
  /**
   * The fiber has something to do: it is reading the earliest due, activating what the time has come for, or has
   * been poked. While it is set, nothing is known of the stored timers, and the process is not settled.
   */
  busy: boolean
  /**
   * The earliest time a stored timer of an unloaded entity is due, or an entity that failed is tried again, as last
   * read: to be read while `busy` is not.
   */
  next: number | null
  /** An entity was unloaded, and its timers may be due before the one the fiber sleeps for. */
  readonly poke: Queue.Queue<void>
  /**
   * The entities whose activation failed, by the time each is tried again: left out of the readings until then, so
   * that an entity the fiber cannot load neither stops it nor keeps it from sleeping (decision 0077).
   */
  readonly failed: Map<string, number>
}

interface Deployment<T extends Types> {
  readonly program: Program<T>
  /** The consumers the deploy declares, by topic (decision 0152). */
  readonly consumers: ReadonlyMap<string, ReadonlySet<string>>
  readonly storage: Storage<T>
  /**
   * Where everything that runs for the deployment runs: the entities' loops, their operations and timers, and the
   * waker. A deploy that fails closes it, and leaves nothing running (decision 0051).
   */
  readonly scope: Scope.Closeable
  readonly loaded: Map<string, Loaded<T>>
  readonly waker: Waker
  /** The waker's fiber, once it is forked: a planned stop interrupts it (decision 0119). */
  waking: Fiber.Fiber<void, never> | null
  /**
   * On Cluster, by shard: `held` while the shard's singleton runs, and `lost` once it is interrupted, until it starts
   * again (decision 0162). Off Cluster, empty.
   */
  readonly shards: Map<number, 'held' | 'lost'>
  /** The services the program was deployed with, which its operations run in. */
  readonly run: (operation: Effect.Effect<void, never, T['services'] | Entities>) => Effect.Effect<void>
}

/** The run of the work under `key` in `incarnation`, as the fibers of a loaded entity are kept by it. */
const under = (key: Key, incarnation: number) => `${Machine.keyText(key)}@${incarnation}`

/**
 * A defect that is its caller's, not the receiver's: a message or flags that do not encode, a creation that
 * `init` dies on. Every caller is given it as a defect, and an operation is suspended on it; any other defect of a
 * delivery is the receiver's crash, which an operation sends again after (decision 0046).
 */
class Faulted extends Data.TaggedError('Faulted')<Readonly<{ defect: unknown }>> {}

const faulted = <A>(effect: Effect.Effect<A, Faulted>): Effect.Effect<A> =>
  Effect.catchTag(effect, 'Faulted', (fault) => Effect.die(fault.defect))

/**
 * Runs `effect` once each count a caller gave — a cursor, a limit — is a non-negative integer: anything else is
 * the caller's defect, and nothing is read or stored for it. A count left out is refused with the rest, since the
 * types do not hold a cast or a call from JavaScript: a `keep` that is none is not passed (decisions 0053, 0141).
 */
const counted = <A>(
  counts: Readonly<Record<string, number>>,
  effect: Effect.Effect<A>,
): Effect.Effect<A> =>
  Effect.suspend(() => {
    for (const [what, count] of Object.entries(counts)) {
      if (Number.isSafeInteger(count) && count >= 0) continue
      return Effect.die(new InvariantDefect({ reason: `the ${what} is ${count}, which is no non-negative integer` }))
    }
    return effect
  })

/**
 * Runs `effect` once the id a caller gave is text a database holds as it is: anything else is the caller's defect,
 * and nothing is read or stored for it. No database gives a lone surrogate back as written, so that two ids would be one
 * entity, and PostgreSQL holds U+0000 in no text (decisions 0053, 0157).
 */
const texted = <A>(id: string, effect: Effect.Effect<A>): Effect.Effect<A> =>
  Effect.suspend(() =>
    typeof id === 'string' && isText(id)
      ? effect
      : Effect.die(new InvariantDefect({ reason: `the id is ${JSON.stringify(id)}, which is no text a database holds` }))
  )

/**
 * Runs `effect` once each cursor a caller gave names a partition of the log, from 1 to `partitions`, and a `seq`
 * that is a non-negative integer: anything else is the caller's defect, and nothing is read or stored for it
 * (decisions 0053, 0137).
 */
const cursored = <A>(
  cursors: ReadonlyArray<Cursor>,
  partitions: number,
  effect: Effect.Effect<A>,
): Effect.Effect<A> =>
  Effect.suspend(() => {
    for (const { partition, seq } of cursors) {
      if (!(Number.isSafeInteger(partition) && partition >= 1 && partition <= partitions)) {
        const reason = `the partition is ${partition}, which is no integer from 1 to ${partitions}`
        return Effect.die(new InvariantDefect({ reason }))
      }
      if (!(Number.isSafeInteger(seq) && seq >= 0)) {
        return Effect.die(new InvariantDefect({ reason: `the cursor is ${seq}, which is no non-negative integer` }))
      }
    }
    return effect
  })

/**
 * Runs `effect` once the partitions a reader names, if any, are a list of at least one partition of the log, each
 * an integer from 1 to `partitions`: anything else is the caller's defect, and nothing is read for it
 * (decisions 0053, 0153).
 */
const named = <A>(
  given: ReadonlyArray<number> | undefined,
  partitions: number,
  effect: Effect.Effect<A>,
): Effect.Effect<A> =>
  Effect.suspend(() => {
    if (given === undefined) return effect
    if (!Array.isArray(given) || given.length === 0) {
      return Effect.die(new InvariantDefect({ reason: 'the partitions a reader names are no list of at least one' }))
    }
    for (const partition of given) {
      if (!(Number.isSafeInteger(partition) && partition >= 1 && partition <= partitions)) {
        const reason = `the partition is ${partition}, which is no integer from 1 to ${partitions}`
        return Effect.die(new InvariantDefect({ reason }))
      }
    }
    return effect
  })

/**
 * Runs `effect` once the topic a caller gave is one `program` publishes: anything else is the caller's defect, and
 * nothing is read or stored for it (decisions 0053, 0138).
 */
const topical = <T extends Types, A>(program: Program<T>, topic: string, effect: Effect.Effect<A>): Effect.Effect<A> =>
  Effect.suspend(() =>
    topicsOf(program).some((held) => held.topic === topic)
      ? effect
      : Effect.die(new InvariantDefect({ reason: `'${topic}' is no topic of the program '${program.name}'` }))
  )

/**
 * The consumers a deploy declares, by topic, once each topic is one `program` publishes and each name is a name,
 * declared once in its topic: anything else is the deployer's defect, refused before anything is stored
 * (decisions 0054, 0152).
 */
const consumersOf = <T extends Types>(
  program: Program<T>,
  consumers: Readonly<Record<string, ReadonlyArray<string> | undefined>>,
): ReadonlyMap<string, ReadonlySet<string>> => {
  const refuse = (reason: string): never => {
    throw new InvariantDefect({ reason: `the deploy of the program '${program.name}' ${reason}` })
  }
  const published = new Set(topicsOf(program).map(({ topic }) => topic))
  const declared = new Map<string, ReadonlySet<string>>()
  for (const [topic, names] of Object.entries(consumers)) {
    if (names === undefined) continue
    if (!published.has(topic)) refuse(`declares consumers of '${topic}', which is no topic of the program`)
    // A string is iterable too, and would declare a consumer per letter: only a list is read (decision 0053).
    if (!Array.isArray(names)) refuse(`declares the consumers of '${topic}' as no list`)
    const held = new Set<string>()
    for (const consumer of names) {
      if (typeof consumer !== 'string' || consumer.length === 0) refuse(`declares a consumer of '${topic}' with no name`)
      if (!isText(consumer)) {
        refuse(`declares a consumer ${JSON.stringify(consumer)} of '${topic}', whose name is no text a database holds`)
      }
      if (held.has(consumer)) refuse(`declares the consumer '${consumer}' of '${topic}' twice`)
      held.add(consumer)
    }
    declared.set(topic, held)
  }
  return declared
}

/**
 * Runs `effect` once `consumer` is one the deploy declares for `topic`, or, given `declared` false, once it is not:
 * anything else is the caller's defect, and nothing is read or stored for it (decisions 0053, 0152).
 */
const enlisted = <T extends Types, A>(
  deployed: Deployment<T>,
  topic: string,
  consumer: string,
  declared: boolean,
  effect: Effect.Effect<A>,
): Effect.Effect<A> =>
  Effect.suspend(() => {
    if ((deployed.consumers.get(topic)?.has(consumer) === true) === declared) return effect
    const program = deployed.program.name
    const reason = declared
      ? `'${consumer}' is no consumer the deploy of '${program}' declares for '${topic}'`
      : `'${consumer}' is a consumer the deploy of '${program}' declares for '${topic}', and is not forgotten`
    return Effect.die(new InvariantDefect({ reason }))
  })

export const launch = (options: Options = {}): Effect.Effect<Runtime, never, SqlClient.SqlClient | Scope.Scope> =>
  launchWith(options, null)

/**
 * The runtime of one process, where `cluster` is null, or of a runner of Effect Cluster, whose programs are served by
 * their doors (decisions 0081, 0092, 0161). On Cluster the runners share the database, which no runtime holds alone:
 * a shard's lock takes the place of the database's (decision 0084).
 */
export const launchWith = (
  options: Options,
  cluster: OnCluster | null,
): Effect.Effect<Runtime, never, SqlClient.SqlClient | Scope.Scope> =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    /**
     * `effect` without the transaction of the fiber that forks it, which every fork of the runtime is given
     * (decision 0164). A fork keeps the services of the forking fiber, and on Cluster a step forks inside its
     * transaction (decision 0161). A fiber that kept the transaction would run its statements on the step's connection
     * without the client's lock, and a transaction of its own would be a savepoint there, which SQLite begins as a
     * transaction while another fiber holds the lock.
     */
    const untransacted = <A, E>(effect: Effect.Effect<A, E>) =>
      Effect.updateContext(effect, (services: Context.Context<never>) => Context.omit(sql.transactionService)(services))
    // The runtime's own scope, sequential whatever its caller's: a parallel scope would run the drain, the closing of
    // `running` and the release of the database at once (decision 0120).
    const scope = yield* Scope.fork(yield* Effect.scope, 'sequential')
    // On Cluster a partition of the log is the shard of its entity, so the log has as many partitions as Cluster has
    // shards per group (decision 0162).
    const partitions = options.log?.partitions ?? cluster?.shards ?? defaultPartitions
    if (!(Number.isSafeInteger(partitions) && partitions >= 1)) {
      const reason = `the log has ${partitions} partitions, which is no positive integer`
      return yield* Effect.die(new InvariantDefect({ reason }))
    }
    if (cluster !== null && partitions !== cluster.shards) {
      const reason = `the log has ${partitions} partitions, and Cluster ${cluster.shards} shards per group`
      return yield* Effect.die(new InvariantDefect({ reason }))
    }
    const renames = new Map(yield* Effect.sync(() => renamesOf(options.renames ?? {})))
    // One runtime holds the database, before anything of this one runs, and lets it go after everything of it has
    // stopped: the scope ends what it was given last first (decision 0080).
    if (cluster === null) yield* Scope.provide(hold, scope)
    yield* partitioned(partitions)
    // Nothing is deployed yet, so no entity is loaded while the rows move, and no reader reads (decision 0156).
    yield* renamed([...renames])
    // Everything the runtime runs is forked in `running`, which closes after the drain: a scope runs its finalizers
    // in the reverse order of their adding, so the drain, added after it, runs first (decision 0119).
    const running = yield* Scope.fork(scope)
    /**
     * Completed once the runtime stops, after the drain and before `running` closes: a `feed` that waits is then
     * given no row, and reads nothing from a database about to be let go (decision 0142).
     */
    const closing = Deferred.makeUnsafe<void>()
    yield* Scope.addFinalizer(scope, Effect.sync(() => Deferred.doneUnsafe(closing, Effect.void)))
    const deployments = new Map<string, Deployment<never>>()
    /** The names deployed in this process, or being deployed: each is deployed once (decision 0075). */
    const names = new Set<string>()
    /** The effects running detached from their callers, which `settled` waits for (decision 0079). */
    let detachments = 0
    /**
     * The entities unloading: left the process, and their timers not all stopped yet, nor the probe told. `settled`
     * waits for them too (decision 0109).
     */
    let leaving = 0
    /**
     * The callers waiting for a reply, by entity and then by request: a retry of a queued message waits with the
     * first, and a crash of the entity reaches every caller of it (decision 0042). A creation's callers wait apart
     * from a message's, since the two share request ids (decisions 0017, 0050).
     */
    const messages: Callers<Answer<unknown>> = new Map()
    const creations: Callers<Creation> = new Map()
    /**
     * The operators waiting for what their `Resume` or `Discard` did, by entity, in the order their events were
     * offered. Each event answers the first, so that an operator is told what its own event did, not what another
     * operator's event applied before it did. One who gave up stays in the line, so that the next event still
     * answers the operator who offered it (decision 0114).
     */
    const operators = new Map<string, MutableList.MutableList<Deferred.Deferred<Operated>>>()
    const addressOf = (entity: Address) => JSON.stringify([entity.name, entity.id])
    /**
     * What `settled` waits for. It is completed, and replaced, whenever something under way ends: a step, an
     * operation, a reading of the waker, an entity leaving the process. That is when the process may have become
     * settled. `settled` takes it before it looks, so that no ending between its look and its wait is missed
     * (decision 0063).
     */
    let ended = Deferred.makeUnsafe<void>()
    const end = () => {
      const was = ended
      ended = Deferred.makeUnsafe<void>()
      Deferred.doneUnsafe(was, Effect.void)
    }
    /** The operations waiting for a program not deployed yet, by its name: its deploy wakes them (decision 0045). */
    const undeployed = new Map<string, Deferred.Deferred<void>>()
    /**
     * What a `feed` that waits waits for, by program and topic: completed and dropped by the first commit of a row in
     * the topic. Only a reading that waits makes one, and one stays until that commit though its wait is over, so the
     * map holds at most one per topic declared, and a step in a topic no reading has waited for finds none. Completing
     * one adds no yield. A `PubSub` per topic would tell the same, at a subscription per reading (decision 0142).
     */
    const commits = new Map<string, Deferred.Deferred<void>>()
    const commitOf = (name: string, topic: string) => {
      const address = JSON.stringify([name, topic])
      const commit = commits.get(address) ?? Deferred.makeUnsafe<void>()
      commits.set(address, commit)
      return commit
    }
    /** Tells every reading that waits, whatever its topic: another runner has committed (decision 0163). */
    const tellAll = () => {
      const told = [...commits.values()]
      commits.clear()
      for (const commit of told) Deferred.doneUnsafe(commit, Effect.void)
    }
    /** How many readings wait now: while one does, `waiting` is open, and the watcher of other runners reads. */
    let readings = 0
    const waiting = Latch.makeUnsafe(false)
    /** Tells the readings that wait for a topic `written` publishes in, once its transaction has committed. */
    const tell = (name: string, written: Machine.Written) => {
      for (const topic of written.published?.topics ?? []) {
        const address = JSON.stringify([name, topic])
        const commit = commits.get(address)
        if (commit === undefined) continue
        commits.delete(address)
        Deferred.doneUnsafe(commit, Effect.void)
      }
    }
    /**
     * Runs `read` until it gives a row, each wait ended by a commit in `topic`, for `millis` from the call at most,
     * and gives the last page read: none once the time is over, or the runtime stops (decision 0142).
     */
    const waited = <A>(
      name: string,
      topic: string,
      millis: number,
      read: Effect.Effect<ReadonlyArray<A>>,
    ): Effect.Effect<ReadonlyArray<A>> =>
      Effect.gen(function*() {
        const until = (yield* Clock.currentTimeMillis) + millis
        while (!Deferred.isDoneUnsafe(closing)) {
          // Taken before the reading: a commit after it completes it, and the wait below ends at once. Taken after,
          // a commit between the reading and the wait would be missed, and the wait would run to its end.
          const commit = commitOf(name, topic)
          const page = yield* read
          const now = yield* Clock.currentTimeMillis
          if (page.length > 0 || now >= until) return page
          // Counted as one uninterruptible acquisition with its release. A count raised before an `ensuring` was
          // left raised by an interruption at a yield between the two, and the watcher read for ever (decision 0163).
          yield* Effect.acquireUseRelease(
            Effect.sync(() => {
              if (++readings === 1) waiting.openUnsafe()
            }),
            () => Effect.raceAll([Deferred.await(commit), Deferred.await(closing), Effect.sleep(`${until - now} millis`)]),
            () =>
              Effect.sync(() => {
                if (--readings === 0) waiting.closeUnsafe()
              }),
          )
        }
        return []
      })
    if (cluster !== null) {
      const { version, millis } = cluster.others
      const read = (seen: number) => Effect.catch(version, () => Effect.succeed(seen))
      // The version is read once at launch, and kept while no reading waits. So a commit of another runner after a
      // reading's page and before its wait still moves the version from the one kept, and the reading is woken. A
      // version read anew whenever a wait begins would already count that commit, and the reading would wait out
      // its time. A launch that cannot read it keeps -1, which no version is, so the first reading wakes once.
      let seen = yield* read(-1)
      yield* Effect.forkIn(
        untransacted(Effect.forever(Effect.gen(function*() {
          yield* waiting.await
          const now = yield* read(seen)
          if (now !== seen) {
            seen = now
            tellAll()
          }
          yield* Effect.sleep(`${millis} millis`)
        }))),
        running,
      )
    }
    /**
     * The senders waiting for an entity's resumption, by entity. Each registers before it sends, so that a
     * resumption between its being answered `Suspended` and its waiting is not missed (decisions 0023, 0063).
     */
    const resumptions = new Map<string, Map<Deferred.Deferred<void>, Waiting>>()
    /** The senders waiting for the entity's resumption, as `suspended` lists them (decision 0114). */
    const waitingFor = (entity: Address): ReadonlyArray<Waiting> => [
      ...(resumptions.get(addressOf(entity))?.values() ?? []),
    ]
    /**
     * Each entity's lock, by entity, while someone holds or waits for it (decision 0067). What finds, loads,
     * creates, unloads or crashes an entity holds it. So no caller is between finding the entity and offering its
     * event when it leaves the process, and two callers never build two machines for it (decisions 0029, 0042).
     */
    // Counted by hand: `RcMap` counts its users the same way, but forks a fiber for each lock it makes, so a caller
    // that finds no lock would wait for that fiber before it holds one.
    const locks = new Map<string, { readonly semaphore: Semaphore.Semaphore; users: number }>()
    const holding = (entity: Address) => <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, E, R> => {
      const address = addressOf(entity)
      return Effect.acquireUseRelease(
        Effect.sync(() => {
          const lock = locks.get(address) ?? { semaphore: Semaphore.makeUnsafe(1), users: 0 }
          lock.users += 1
          locks.set(address, lock)
          return lock
        }),
        (lock) => lock.semaphore.withPermits(1)(effect),
        (lock) =>
          Effect.sync(() => {
            lock.users -= 1
            // Dropped by its last user only: one dropped while others wait would let a new taker hold it beside
            // them. `callers of an unloaded entity build one machine for it`, in the tests, reaches it (decision 0104).
            if (lock.users === 0) locks.delete(address)
          }),
      )
    }
    const probe = yield* Probe
    // The one cast of an event: a probe is told of the events of every program, and steps none of them.
    const at = <T extends Types>(point: Point, entity: Address, event: Machine.Event<T>) =>
      probe({ _tag: 'Reached', point, entity, event: event as Machine.Event<never> })
    const observe = <T extends Types>(entity: Address, event: Machine.Event<T>) =>
      probe({ _tag: 'Applied', entity, event: event as Machine.Event<never> })
    const retry = options.retry?.millis ?? 10
    const passivate = options.passivate?.millis ?? 30_000
    const capacity = options.capacity?.entities ?? 10_000
    const drain = options.drain?.millis
    const threshold = options.warn?.characters ?? 262_144
    const bound = options.callers?.messages ?? 4096
    if (!(Number.isSafeInteger(bound) && bound > 0)) {
      const reason = `the callers' messages are ${bound}, which is no positive integer`
      return yield* Effect.die(new InvariantDefect({ reason }))
    }
    if (drain !== undefined && !(Number.isSafeInteger(drain) && drain >= 0)) {
      const reason = `the drain is ${drain} millis, which is no non-negative integer`
      return yield* Effect.die(new InvariantDefect({ reason }))
    }
    /** A planned stop is under way: the scope closes, and the drain waits (decision 0119). */
    let draining = false
    /** What a caller that arrives during the drain waits for: it is interrupted once the drain ends. */
    const stopped = Deferred.makeUnsafe<never>()
    /** A caller's effect, unless a planned stop is under way. */
    const admitted = <A>(effect: Effect.Effect<A>): Effect.Effect<A> =>
      Effect.suspend(() => draining ? Deferred.await(stopped) : effect)
    if (capacity !== 'unbounded' && !(Number.isSafeInteger(capacity) && capacity > 0)) {
      const reason = `the capacity is ${capacity}, which is no positive integer`
      return yield* Effect.die(new InvariantDefect({ reason }))
    }
    /**
     * Every entity this process holds, of every program, from the least recently used: an entity is used when it is
     * loaded and when an event is offered to it. It is what a process over its capacity unloads first (decision 0076).
     * Written by hand: `Cache` and `ScopedCache` evict the oldest entry whatever it is doing, and `ScopedCache` waits
     * for the evicted from the fiber that enters; `RcMap` refuses a new key past its capacity (decision 0151).
     */
    const recent = new Map<string, Loaded<never>>()
    // The one cast of a loaded entity: the process orders the entities of every program, and steps none of them.
    const erased = <T extends Types>(loaded: Loaded<T>) => loaded as unknown as Loaded<never>
    /** The entity leaves the order of use, if it is the one held there. */
    const forgetUse = <T extends Types>(loaded: Loaded<T>) => {
      const address = addressOf(loaded.machine.stored)
      if (recent.get(address) === erased(loaded)) recent.delete(address)
    }

    const deployment = <T extends Types>(name: string): Deployment<T> | undefined =>
      deployments.get(name) as Deployment<T> | undefined

    const answer = <A>(waiting: Callers<A>, entity: Address, request: string, reply: A) =>
      Effect.suspend(() => {
        const requests = waiting.get(addressOf(entity))
        const callers = requests?.get(request)
        if (requests === undefined || callers === undefined) return Effect.void
        requests.delete(request)
        if (requests.size === 0) waiting.delete(addressOf(entity))
        return Effect.forEach(callers, (caller) => Deferred.succeed(caller, reply), { discard: true })
      })

    /** A caller registered and waiting: its event is offered, and the reply comes to `caller`. */
    interface Asked<A> {
      readonly caller: Deferred.Deferred<A>
      readonly forget: Effect.Effect<void>
    }

    /**
     * Registers a caller and offers its event. It is done while the entity is held — its lock — so that an entity
     * is never unloaded between a caller finding it and its event being offered (decisions 0029, 0067).
     */
    const ask = <T extends Types, A>(
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
        yield* offer(loaded, event)
        return { caller, forget }
      })

    /**
     * Offers an event to a loaded entity, counted until its step is done (decision 0063), and the entity is the most
     * recently used, if it is still held (decision 0076).
     */
    const offer = <T extends Types>(loaded: Loaded<T>, event: Machine.Offered<T> | Settle) =>
      Effect.sync(() => {
        // Raised and lowered by two fibers: raised by the fiber that offers the event, lowered by the entity's loop
        // once the event's step is done (decision 0063).
        loaded.pending += 1
        Queue.offerUnsafe(loaded.events, event)
        const address = addressOf(loaded.machine.stored)
        if (recent.get(address) !== erased(loaded)) return
        recent.delete(address)
        recent.set(address, erased(loaded))
      })

    /**
     * An entity enters the process. Once the process holds more than its capacity, the least recently used of the
     * spare entities are told to leave, as many as it holds too many, the one entering aside. Their loops unload
     * them, each under its own lock: nothing here waits for another entity's lock while this one's is held
     * (decisions 0067, 0076).
     */
    const enter = <T extends Types>(deployed: Deployment<T>, loaded: Loaded<T>) =>
      Effect.map(DateTime.now, (at) => admit(deployed, loaded, at))

    /**
     * On Cluster, the entity enters the process only where its shard may be loaded here, which gives whether it
     * entered (decision 0162). The check and the entry are one step: a shard let go marks itself in a step that also
     * reads the entities held, so an entity either entered before the mark and is read, or finds the mark.
     */
    const entersHeld = <T extends Types>(deployed: Deployment<T>, loaded: Loaded<T>) =>
      Effect.map(DateTime.now, (at) => {
        if (!loadable(deployed, loaded.machine.stored.id)) return false
        admit(deployed, loaded, at)
        return true
      })

    /** The entity enters the process at `at`, as `enter` says. */
    const admit = <T extends Types>(deployed: Deployment<T>, loaded: Loaded<T>, at: DateTime.Utc) => {
      const now = DateTime.toEpochMillis(at)
      deployed.loaded.set(loaded.machine.stored.id, loaded)
      recent.set(addressOf(loaded.machine.stored), erased(loaded))
      if (capacity === 'unbounded') return
      let over = recent.size - capacity
      for (const other of recent.values()) {
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
    const loadable = <T extends Types>(deployed: Deployment<T>, id: string) => {
      if (cluster === null) return true
      const shard = cluster.shardOf(id)
      return cluster.holds(shard) && deployed.shards.get(shard) !== 'lost'
    }

    /** Wakes every sender waiting for the entity's resumption: it sends again, and is answered (decision 0063). */
    const wake = (entity: Address) => {
      const address = addressOf(entity)
      const senders = resumptions.get(address)
      if (senders === undefined) return
      resumptions.delete(address)
      for (const sender of senders.keys()) Deferred.doneUnsafe(sender, Effect.void)
    }

    /**
     * Registers a sender's wait for the entity's resumption, before it sends. `resumed` is what it waits on if it
     * is answered `Suspended`, and `forget` takes it back whatever it is answered. A registration made after the
     * answer would miss a resumption between the two, and wait for ever. `a sender answered Suspended is woken by
     * the resumption`, in the tests, reaches that under the scheduler of the tests (decision 0104). `waiting` is
     * who registers, for `suspended` to list (decision 0114).
     */
    const awaitResumption = (entity: Address, waiting: Waiting) =>
      Effect.sync(() => {
        const address = addressOf(entity)
        const sender = Deferred.makeUnsafe<void>()
        const senders = resumptions.get(address) ?? new Map<Deferred.Deferred<void>, Waiting>()
        senders.set(sender, waiting)
        resumptions.set(address, senders)
        const forget = Effect.sync(() => {
          senders.delete(sender)
          if (senders.size === 0 && resumptions.get(address) === senders) resumptions.delete(address)
        })
        return { resumed: Deferred.await(sender), forget }
      })

    /** Waits for the reply the entity stores or gives, and leaves nothing registered. */
    const answered = <A>({ caller, forget }: Asked<A>) => Effect.onExit(Deferred.await(caller), () => forget)

    /** The work under a key stops: its fiber is interrupted, and nothing it would deliver is recorded. */
    const stop = (held: Map<string, Fiber.Fiber<void>>, id: string) =>
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
    const drop = (held: Map<string, Fiber.Fiber<void>>, id: string, scope: Scope.Scope) =>
      Effect.suspend(() => {
        const fiber = held.get(id)
        if (fiber === undefined) return Effect.void
        held.delete(id)
        return Effect.asVoid(Effect.forkIn(untransacted(Fiber.interrupt(fiber)), scope))
      })

    const stopAll = <T extends Types>(loaded: Loaded<T>) =>
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
    const forkHeld = (
      held: Map<string, Fiber.Fiber<void>>,
      id: string,
      scope: Scope.Scope,
      effect: Effect.Effect<void>,
    ) =>
      Effect.gen(function*() {
        let done = false
        const fiber = yield* Effect.forkIn(
          untransacted(Effect.ensuring(
            effect,
            Effect.sync(() => {
              done = true
              held.delete(id)
              end()
            }),
          )),
          scope,
        )
        if (!done) held.set(id, fiber)
      })

    /** Starts an operation: its message is offered as a `Complete`, a defect of it as a `Die`. */
    const start = <T extends Types>(
      deployed: Deployment<T>,
      loaded: Loaded<T>,
      entity: Address,
      output: Extract<Machine.Output<T>, { _tag: 'Started' }>,
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
        const run = Effect.suspend(() =>
          runner.delivery === 'Idempotent' || runner.delivery === 'IdempotentDigest'
            ? runner.run(operation, idempotencyKey)
            : runner.run(operation)
        )
        const id = under(key, incarnation)
        // An operation that runs again at the next activation is not started during a planned stop: it is stored,
        // and starts there. An at-most-once one is started, since one stored and never started would deliver its
        // `unknown` without having run (decision 0119).
        if (runner.delivery !== 'AtMostOnce') {
          if (draining) return
          loaded.rerun.add(id)
        }
        yield* forkHeld(
          loaded.operations,
          id,
          deployed.scope,
          deployed.run(
            Effect.gen(function*() {
              const exit = yield* Effect.exit(Effect.ensuring(run, Effect.sync(() => loaded.rerun.delete(id))))
              if (exit._tag === 'Success') {
                yield* offer(loaded, { _tag: 'Complete', key, incarnation, message: exit.value })
              } else if (!Cause.hasInterruptsOnly(exit.cause)) {
                yield* offer(loaded, { _tag: 'Die', key, incarnation, cause: Cause.squash(exit.cause) })
              }
            }).pipe(
              // The requests it sends are this run's: an entity cannot pass for another, nor an operation for
              // another (decisions 0009, 0060).
              Effect.provideService(Entities, entities(entity, key, incarnation, runner.delivery === 'Droppable')),
            ),
          ),
        )
      })

    /** Arms a timer: its time comes, and `Fire` is offered. A passivated entity would be woken by `due` instead. */
    const arm = <T extends Types>(
      deployed: Deployment<T>,
      loaded: Loaded<T>,
      output: Extract<Machine.Output<T>, { _tag: 'Armed' }>,
    ) =>
      Effect.gen(function*() {
        const { key, incarnation, timer } = output
        // A planned stop arms no timer: the stored time wakes the entity in the next process (decision 0119).
        if (draining) return
        const now = yield* DateTime.now
        const millis = Math.max(0, DateTime.toEpochMillis(timer.at) - DateTime.toEpochMillis(now))
        yield* forkHeld(
          loaded.timers,
          under(key, incarnation),
          deployed.scope,
          Effect.gen(function*() {
            yield* Effect.sleep(`${millis} millis`)
            yield* offer(loaded, { _tag: 'Fire', key, incarnation })
          }),
        )
      })

    const perform = <T extends Types>(
      deployed: Deployment<T>,
      loaded: Loaded<T>,
      entity: Address,
      event: Machine.Event<T>,
      outputs: ReadonlyArray<Machine.Output<T>>,
    ) =>
      Effect.gen(function*() {
        // The callers first: a reply is what the event's commit made true (decision 0023).
        for (const output of outputs) {
          if (output._tag !== 'Replied' && output._tag !== 'CreationReplied') continue
          const request = Machine.requestKey(deployed.program, output.request)
          yield* output._tag === 'Replied'
            ? answer(messages, entity, request, output.reply)
            : answer(creations, entity, request, output.reply)
        }
        yield* at('AfterReply', entity, event)
        for (const output of outputs) {
          switch (output._tag) {
            case 'Started':
              yield* start(deployed, loaded, entity, output)
              break
            case 'Armed':
              yield* arm(deployed, loaded, output)
              break
            case 'Disarmed':
              yield* stop(loaded.timers, under(output.key, output.incarnation))
              yield* drop(loaded.operations, under(output.key, output.incarnation), deployed.scope)
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

    /** Logs a warning at the first refusal of an activation, so that a burst does not log once per caller. */
    const warnOfFull = <T extends Types>(loaded: Loaded<T>, entity: Address): Effect.Effect<void> => {
      if (loaded.refused) return Effect.void
      loaded.refused = true
      return Effect.logWarning("an entity holds as many callers' messages as its bound; its callers are answered Full")
        .pipe(Effect.annotateLogs({ name: entity.name, id: entity.id, messages: bound }))
    }

    /**
     * Logs a warning for a step that wrote more than the threshold, once per activation of the entity, so that a
     * large entity does not log at every step. A step under the threshold does nothing, and yields nowhere
     * (decision 0135).
     */
    const warnOfSize = <T extends Types>(loaded: Loaded<T>, entity: Address, characters: number): Effect.Effect<void> => {
      if (characters <= threshold || loaded.warned) return Effect.void
      loaded.warned = true
      return Effect.logWarning('a step wrote a large state; the program may split it into entities').pipe(
        Effect.annotateLogs({ name: entity.name, id: entity.id, characters, threshold }),
      )
    }

    /**
     * One event: the machine's step, written in one transaction, then acted on. A crash at any of the points
     * leaves the entity as the crash table says. A message is given the reply stored under its request, read here,
     * where no other event of the entity is applied: the machine holds none (decision 0065). It is given the time
     * too, at which it is handled if the mailbox is empty (decision 0074).
     */
    const apply = <T extends Types>(
      deployed: Deployment<T>,
      loaded: Loaded<T>,
      offered: Machine.Offered<T> | Settle,
    ): Effect.Effect<void> =>
      cluster !== null
        ? applyOnCluster(deployed, loaded, offered)
        : offered._tag === 'Settle'
        ? Effect.void
        : applyInProcess(deployed, loaded, offered)

    const applyInProcess = <T extends Types>(
      deployed: Deployment<T>,
      loaded: Loaded<T>,
      offered: Machine.Offered<T>,
    ): Effect.Effect<void> =>
      Effect.gen(function*() {
        loaded.applying = true
        const entity: Address = { name: loaded.machine.stored.name, id: loaded.machine.stored.id }
        const now = yield* DateTime.now
        const event: Machine.Event<T> = offered._tag === 'Receive'
          ? {
            ...offered,
            reply: yield* deployed.storage.reply(entity.id, offered.request, DateTime.toEpochMillis(now)),
            at: now,
          }
          : offered
        const before = loaded.machine
        const transition = Machine.step(deployed.program, before, event)
        const { written } = transition
        if (written !== null) {
          yield* at('BeforeCommit', entity, event)
          // What the event writes is the machine's, encoded: the storage decides nothing (decision 0057).
          const characters = yield* sql.withTransaction(
            deployed.storage.write(entity.id, written, DateTime.toEpochMillis(now)),
          ).pipe(Effect.orDie)
          tell(entity.name, written)
          yield* warnOfSize(loaded, entity, characters)
        }
        loaded.machine = transition.machine
        if (before.stored.suspension !== null && transition.machine.stored.suspension === null) {
          wake(entity)
        }
        if (event._tag === 'Resume' || event._tag === 'Discard') {
          const line = operators.get(addressOf(entity))
          const operator = line === undefined ? MutableList.Empty : MutableList.take(line)
          if (line?.length === 0) operators.delete(addressOf(entity))
          if (operator !== MutableList.Empty) {
            yield* Deferred.succeed(operator, operated(event._tag, before, transition.machine))
          }
        }
        // An event is observed once it is written, and before anything is acted on; one that writes nothing is
        // observed at once. A crash before the commit leaves no event, and one after it an event that happened.
        yield* observe(entity, event)
        if (written !== null) yield* at('AfterCommit', entity, event)
        yield* perform(deployed, loaded, entity, event, transition.outputs)
      }).pipe(Effect.ensuring(Effect.sync(() => {
        loaded.applying = false
        end()
      })))

    /**
     * On Cluster, inside a step's transaction: makes the entity's machine the stored one, before the step computes
     * from it (decision 0161). The runner's one connection runs one transaction at a time, so no other step of the
     * entity runs meanwhile. A count that is the uncommitted machine's means its door's step committed: the machine
     * is the entity's, and what its events set going is performed now, before any later step ends that work. A count
     * that is the held machine's means the door's step rolled back, and its machine is dropped. Any other count is a
     * row this runner did not write, and gives false.
     */
    const settle = <T extends Types>(deployed: Deployment<T>, loaded: Loaded<T>) =>
      Effect.gen(function*() {
        const { name, id } = loaded.machine.stored
        const stored = yield* deployed.storage.stepsOf(id)
        const uncommitted = loaded.uncommitted
        loaded.uncommitted = null
        if (uncommitted !== null && stored === uncommitted.steps) {
          const before = loaded.machine
          loaded.machine = uncommitted.machine
          loaded.steps = uncommitted.steps
          if (before.stored.suspension !== null && uncommitted.machine.stored.suspension === null) wake({ name, id })
          for (const { event, written, outputs } of uncommitted.transitions) {
            if (written !== null) tell(name, written)
            yield* observe({ name, id }, event)
            yield* perform(deployed, loaded, { name, id }, event, outputs)
          }
          return true
        }
        return stored === loaded.steps
      })

    /**
     * On Cluster, a request reaches an entity through its door, sent by Cluster's client, which the runtime does not
     * give yet: one sent in the process would take the entity's lock and read the database outside a transaction,
     * which a door's step waits on (decision 0161).
     */
    const notYetOnCluster = (what: string) =>
      new InvariantDefect({ reason: `${what} on Cluster is sent through the door's client, which is not code yet` })

    /** The defect of an entity whose row this runner did not write (decision 0161). */
    const unsettled = (name: string, id: string) =>
      new InvariantDefect({ reason: `the entity ${id} of ${name} was written by a step this runner did not make` })

    /**
     * An event of the entity's own on Cluster, in a transaction of its own: the machine is settled first, then the
     * event is stepped from it and written (decisions 0092, 0161). The transaction's commit is known here, so what
     * the event sets going is performed once it returns. A machine that cannot be settled crashes the entity.
     * `Handle` finds the mailbox as the settled machine holds it, which a door's step may have emptied.
     */
    const applyOnCluster = <T extends Types>(
      deployed: Deployment<T>,
      loaded: Loaded<T>,
      offered: Machine.Offered<T> | Settle,
    ): Effect.Effect<void> =>
      Effect.gen(function*() {
        loaded.applying = true
        const entity: Address = { name: loaded.machine.stored.name, id: loaded.machine.stored.id }
        const now = yield* DateTime.now
        // The step holds the entity's lock inside its transaction, as a door's step does, so that a crash from a shard
        // let go waits for it, and stops what its settling starts (decision 0162).
        const stepped = yield* sql.withTransaction(holding(entity)(Effect.gen(function*() {
          // An event taken before its entity left the process is dropped, as the loop's end says (decision 0162).
          if (deployed.loaded.get(entity.id) !== loaded) return null
          if (!(yield* settle(deployed, loaded))) return yield* Effect.die(unsettled(entity.name, entity.id))
          // A message of a caller reaches the entity through its door alone, never its loop.
          if (offered._tag === 'Settle' || offered._tag === 'Receive') return null
          const { stored } = loaded.machine
          if (offered._tag === 'Handle' && (stored.mailbox.length === 0 || stored.suspension !== null)) return null
          const event: Machine.Event<T> = offered
          const before = loaded.machine
          const transition = Machine.step(deployed.program, before, event)
          let characters = 0
          if (transition.written !== null) {
            yield* at('BeforeCommit', entity, event)
            characters = yield* deployed.storage.write(entity.id, transition.written, DateTime.toEpochMillis(now))
            loaded.steps += 1
          }
          // Both set inside the transaction: a door's step reads them in a transaction of its own, which the
          // connection runs after this one, so it never reads them between this one's commit and the assignments. A
          // commit that fails crashes the entity, and nothing reads them then (decision 0161).
          loaded.machine = transition.machine
          return { event, before, transition, characters }
        }))).pipe(Effect.orDie)
        if (stepped === null) return
        const { event, before, transition, characters } = stepped
        if (transition.written !== null) {
          tell(entity.name, transition.written)
          yield* warnOfSize(loaded, entity, characters)
        }
        if (before.stored.suspension !== null && transition.machine.stored.suspension === null) wake(entity)
        yield* observe(entity, event)
        // What the step sets going starts under the lock again, which touches no database here. An entity a crash
        // took out between the commit and the lock starts nothing: the runner that holds its shard next starts it
        // from what is stored (decision 0162).
        yield* holding(entity)(Effect.suspend(() =>
          deployed.loaded.get(entity.id) !== loaded ? Effect.void : Effect.andThen(
            transition.written !== null ? at('AfterCommit', entity, event) : Effect.void,
            perform(deployed, loaded, entity, event, transition.outputs),
          )
        ))
      }).pipe(Effect.ensuring(Effect.sync(() => {
        loaded.applying = false
        end()
      })))

    /** On Cluster, the steps of an entity in one transaction, from the entity `loaded`, or from none. */
    const stepping = <T extends Types>(loaded: Loaded<T> | null): Stepping<T> => ({
      loaded,
      machine: loaded?.machine ?? null,
      steps: loaded?.steps ?? 0,
      transitions: [],
    })

    /** One event of the entity `stepped` steps, written in the transaction under way if it writes (decision 0161). */
    const stepIn = <T extends Types>(
      deployed: Deployment<T>,
      stepped: Stepping<T>,
      entity: Address,
      event: Machine.Event<T>,
      now: DateTime.Utc,
    ) =>
      Effect.gen(function*() {
        const transition = Machine.step(deployed.program, stepped.machine!, event)
        if (transition.written !== null) {
          yield* at('BeforeCommit', entity, event)
          yield* deployed.storage.write(entity.id, transition.written, DateTime.toEpochMillis(now))
          stepped.steps += 1
        }
        stepped.transitions.push({ event, written: transition.written, outputs: transition.outputs })
        stepped.machine = transition.machine
        return transition
      })

    /**
     * Loads the entity into `stepped` where `stepped` holds none yet: its stored machine, with its `Restart` stepped
     * first. It fails with `Unheld` where the entity's shard may not be loaded here (decision 0162), and leaves
     * `stepped` without an entity where none is stored.
     */
    const loadIn = <T extends Types>(
      deployed: Deployment<T>,
      stepped: Stepping<T>,
      entity: Address,
      now: DateTime.Utc,
    ): Effect.Effect<void, Unheld> =>
      Effect.gen(function*() {
        if (stepped.loaded !== null) return
        if (!loadable(deployed, entity.id)) return yield* new Unheld({ id: entity.id })
        const held = yield* deployed.storage.load(entity.id)
        if (held === null) return
        const loaded = yield* fresh<T>({ stored: held, running: {} }, (yield* deployed.storage.stepsOf(entity.id)) ?? 0)
        stepped.loaded = loaded
        stepped.steps = loaded.steps
        stepped.machine = loaded.machine
        yield* stepIn(deployed, stepped, entity, { _tag: 'Restart' }, now)
      })

    /**
     * The end of the steps in `stepped`, inside their transaction. An entity created or loaded enters the process with
     * its loop, or fails with `Unheld` where its shard may no longer be loaded here. The machine is the entity's at
     * once if nothing was written. Otherwise it is left uncommitted, and the commit tells the loop to settle it: what
     * it sets going is started then, from a commit the count proves (decision 0161).
     */
    const finishIn = <T extends Types>(
      deployed: Deployment<T>,
      stepped: Stepping<T>,
      entity: Address,
    ): Effect.Effect<void, Unheld> =>
      Effect.gen(function*() {
        const held = stepped.loaded!
        if (deployed.loaded.get(entity.id) !== held) {
          if (!(yield* entersHeld(deployed, held))) return yield* new Unheld({ id: entity.id })
          yield* Effect.forkIn(untransacted(loop(deployed, held)), deployed.scope)
        }
        if (stepped.steps === held.steps) {
          // Nothing was written, so nothing can roll back: the machine is the entity's at once (decision 0092).
          held.machine = stepped.machine!
          for (const { event, outputs } of stepped.transitions) {
            yield* observe(entity, event)
            yield* perform(deployed, held, entity, event, outputs)
          }
        } else {
          held.uncommitted = { machine: stepped.machine!, steps: stepped.steps, transitions: stepped.transitions }
          yield* sql.afterCommit(offer(held, { _tag: 'Settle' }))
        }
      })

    /** The defect of a door's step whose entity this runner may not load (decision 0162). */
    const unheld = (name: string, id: string) =>
      new InvariantDefect({ reason: `the shard of the entity ${id} of ${name} is not held by this runner` })

    /**
     * The step of a request that reaches a program's door on Cluster, in Cluster's transaction (decisions 0081,
     * 0092, 0160, 0161). The entity's lock is taken inside the transaction, so that nothing holds the lock while it
     * waits for the connection the transaction holds. A held entity is settled first, and one not held is loaded
     * from what is stored, its `Restart` stepped first. A step whose entity's shard may not be loaded here dies, and
     * Cluster delivers the request again (decision 0162).
     */
    const doorStep = <T extends Types>(deployed: Deployment<T>) =>
    (delivered: Delivered): Effect.Effect<DoorAnswer<T['rejection']>> => {
      const { program, storage: stored } = deployed
      const { id } = delivered
      const entity: Address = { name: program.name, id }
      return holding(entity)(Effect.gen(function*(): Effect.fn.Return<DoorAnswer<T['rejection']>, Unheld> {
        const now = yield* DateTime.now
        let found = deployed.loaded.get(id) ?? null
        if (found !== null && !(yield* settle(deployed, found))) {
          // The crash takes the entity out of the process. Its loop is woken, finds the entity gone, and ends.
          yield* crash(deployed, found, Cause.die(unsettled(program.name, id)))
          Queue.offerUnsafe(found.events, { _tag: 'Settle' })
          found = null
        }
        const stepped = stepping(found)
        yield* loadIn(deployed, stepped, entity, now)
        let answer: DoorAnswer<T['rejection']>
        if (delivered._tag === 'Create') {
          const { request, flags } = yield* stored.deliveredCreation(delivered.version, delivered.request, delivered.message)
          if (stepped.loaded === null) {
            const started = Machine.start(program, id, flags, now, request)
            // A creation the program dies on stores nothing, and dies: Cluster delivers it again (decision 0160).
            if (started._tag === 'Defect') return yield* Effect.die(started.cause)
            yield* stored.write(id, started.written, DateTime.toEpochMillis(now))
            stepped.loaded = yield* fresh<T>(started.machine, 0)
            stepped.steps = 1
            stepped.machine = started.machine
            stepped.transitions.push({
              event: { _tag: 'Create', request },
              written: started.written,
              outputs: started.outputs,
            })
            answer = { _tag: 'Create', answer: { _tag: 'Created' } }
          } else {
            const transition = yield* stepIn(deployed, stepped, entity, { _tag: 'Create', request }, now)
            const reply = transition.outputs.find((output) => output._tag === 'CreationReplied')
            answer = { _tag: 'Create', answer: reply?._tag === 'CreationReplied' ? reply.reply : { _tag: 'AlreadyExists' } }
          }
        } else {
          const { request, message } = yield* stored.delivered(delivered.version, delivered.request, delivered.message)
          if (stepped.loaded === null) return { _tag: 'Message', answer: { _tag: 'NotFound' } }
          const key = Machine.requestKey(program, request)
          const reply = yield* stored.reply(id, request, DateTime.toEpochMillis(now))
          const arrival: Machine.Event<T> = { _tag: 'Receive', request, message, reply, at: now }
          let transition = yield* stepIn(deployed, stepped, entity, arrival, now)
          // The mailbox is handled up to the message, each `Handle` stepping its head (decision 0160).
          let replied: DoorAnswer<T['rejection']> | null = null
          while (replied === null) {
            for (const output of transition.outputs) {
              if (output._tag === 'Replied' && Machine.requestKey(program, output.request) === key) {
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
              transition = yield* stepIn(deployed, stepped, entity, { _tag: 'Handle', at: now }, now)
            }
          }
          answer = replied
        }
        yield* finishIn(deployed, stepped, entity)
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
    const activateOnCluster = <T extends Types>(deployed: Deployment<T>, id: string): Effect.Effect<void> => {
      const entity: Address = { name: deployed.program.name, id }
      return Effect.uninterruptible(sql.withTransaction(holding(entity)(Effect.gen(function*() {
        if (deployed.loaded.has(id)) return
        const stepped = stepping<T>(null)
        yield* loadIn(deployed, stepped, entity, yield* DateTime.now)
        if (stepped.loaded !== null) yield* finishIn(deployed, stepped, entity)
      })))).pipe(Effect.catchTag('Unheld', () => Effect.void), Effect.orDie)
    }

    /**
     * Whether the entity has nothing to do: no event waiting or being applied, no message to handle, and nothing
     * but timers left of what its state holds (decision 0029).
     */
    const nothingToDo = <T extends Types>(loaded: Loaded<T>) => {
      const { stored } = loaded.machine
      if (loaded.applying || loaded.pending > 0 || loaded.operations.size > 0) return false
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
    const spare = <T extends Types>(loaded: Loaded<T>, now: number) => {
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
    const leave = <T extends Types>(deployed: Deployment<T>, loaded: Loaded<T>) =>
      Effect.sync(() => {
        const { id } = loaded.machine.stored
        if (deployed.loaded.get(id) === loaded) deployed.loaded.delete(id)
        forgetUse(loaded)
        deployed.waker.busy = true
        Queue.offerUnsafe(deployed.waker.poke, undefined)
        end()
      })

    /**
     * Unloads the entity: its timers stop, and what the state holds is what wakes it again — to the machine a
     * `Restart`, a crash this process chose (decision 0029). Under the entity's lock, so that no caller is between
     * finding the entity and offering its event; it gives whether the entity is gone. One told to leave a process
     * over its capacity is unloaded only if it is spare at `evicted`, the time its loop takes that (decision 0078).
     */
    const unload = <T extends Types>(deployed: Deployment<T>, loaded: Loaded<T>, evicted: number | null) =>
      holding(loaded.machine.stored)(Effect.gen(function*() {
        const { id } = loaded.machine.stored
        const leaves = evicted === null ? nothingToDo(loaded) : spare(loaded, evicted)
        if (!leaves || deployed.loaded.get(id) !== loaded) return false
        // Counted from before it leaves: once it has, nothing else keeps the process from being settled. `a process
        // over its capacity unloads its least recently used idle entity`, in the tests, reaches it (decision 0109).
        yield* Effect.acquireUseRelease(
          Effect.sync(() => {
            leaving += 1
          }),
          () =>
            Effect.gen(function*() {
              yield* leave(deployed, loaded)
              // A timer that fires between here and its interruption delivers nothing, and the stored time stands.
              yield* stopAll(loaded)
              yield* probe({ _tag: 'Unloaded', entity: { name: deployed.program.name, id } })
            }),
          () =>
            Effect.sync(() => {
              leaving -= 1
              end()
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
     * and nothing else waits for them under the lock (decision 0056).
     */
    const crash = <T extends Types>(deployed: Deployment<T>, loaded: Loaded<T>, cause: Cause.Cause<never>) =>
      Effect.gen(function*() {
        const { name, id } = loaded.machine.stored
        // Its stored timers are the waker's again. A crash may run where the step that died cannot be interrupted, as
        // a creation's `onError` does: the fork's option keeps it stoppable by the scope (decision 0112).
        yield* leave(deployed, loaded)
        yield* Effect.forkIn(untransacted(stopAll(loaded)), deployed.scope, { uninterruptible: false })
        const address = addressOf({ name, id })
        const fail = <A>(waiting: Callers<A>) =>
          Effect.gen(function*() {
            const requests = waiting.get(address)
            waiting.delete(address)
            for (const callers of requests?.values() ?? []) {
              for (const caller of callers) yield* Deferred.failCause(caller, cause)
            }
          })
        yield* fail(messages)
        yield* fail(creations)
        const line = operators.get(address)
        operators.delete(address)
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
    const loop = <T extends Types>(deployed: Deployment<T>, loaded: Loaded<T>): Effect.Effect<void> =>
      steps(deployed, loaded).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.failCause(cause)
            : holding(loaded.machine.stored)(crash(deployed, loaded, cause))
        ),
      )

    const steps = <T extends Types>(deployed: Deployment<T>, loaded: Loaded<T>): Effect.Effect<void> => {
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
        if (cluster !== null && deployed.loaded.get(loaded.machine.stored.id) !== loaded) return Effect.void
        if (handles()) {
          return DateTime.now.pipe(
            Effect.flatMap((now) => apply(deployed, loaded, { _tag: 'Handle', at: now })),
            Effect.flatMap(() => again),
          )
        }
        // The wait's end is put in the queue by a sleep of its own, and the take is raced against nothing: a take a
        // timeout interrupts can lose the event it took (decision 0116). The sleep is the loop's child, and ends with it.
        const wait = ++loaded.waits
        const runsOut = Effect.andThen(
          Effect.sleep(`${passivate} millis`),
          Effect.sync(() => Queue.offerUnsafe(loaded.events, { _tag: 'Passivate', wait })),
        )
        // An end an earlier wait's sleep put there, just before the event that ended that wait, is passed over.
        const take: Effect.Effect<Machine.Offered<T> | Evict | Passivate | Settle> = Effect.flatMap(
          Queue.take(loaded.events),
          (taken) => taken._tag === 'Passivate' && taken.wait !== wait ? take : Effect.succeed(taken),
        )
        return Effect.flatMap(Effect.forkChild(untransacted(runsOut)), (sleep) =>
          Effect.flatMap(take, (taken) => Effect.as(Fiber.interrupt(sleep), taken))).pipe(
          Effect.flatMap((taken) => {
            // The wait ran out, or the entity was told to leave: it is unloaded if it has nothing to do.
            const event = taken._tag === 'Passivate' ? null : taken
            if (event === null || event._tag === 'Evict') {
              // On Cluster, a machine a door's step left uncommitted keeps the entity from leaving until a step
              // settles it: a lost `afterCommit` callback, or a rollback, leaves no other step to. So the loop settles
              // first, and decides from the settled machine (decision 0161).
              const evicted = event === null ? Effect.succeed(null) : Effect.map(DateTime.now, DateTime.toEpochMillis)
              const unloaded = Effect.flatMap(evicted, (now) => unload(deployed, loaded, now))
              const settled = cluster !== null && loaded.uncommitted !== null
                ? Effect.andThen(apply(deployed, loaded, { _tag: 'Settle' }), unloaded)
                : unloaded
              return Effect.flatMap(settled, (gone) =>
                Effect.suspend(() => {
                  // One told to leave that has something to do by now stays, and may be told again.
                  if (event !== null) {
                    loaded.evicted = false
                    end()
                  }
                  return gone ? Effect.void : next
                }))
            }
            return Effect.flatMap(
              apply(deployed, loaded, event).pipe(Effect.ensuring(Effect.andThen(
                // The permit first: a process settled holds no permit of a message applied (decision 0147).
                event._tag === 'Receive' ? loaded.callers.release(1) : Effect.void,
                Effect.sync(() => {
                  // Raised and lowered by two fibers: raised by the fiber that offered the event, lowered here by the loop.
                  loaded.pending -= 1
                  end()
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
    const fresh = <T extends Types>(machine: Machine.Machine<T>, steps: number) =>
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
        callers: Semaphore.makeUnsafe(bound),
        refused: false,
        steps,
        uncommitted: null,
      }))

    /** Registers an entity in this process, and activates what was stored, as after a crash. */
    const activate = <T extends Types>(deployed: Deployment<T>, stored: Machine.Stored<T>) =>
      Effect.gen(function*() {
        const loaded = yield* fresh<T>({ stored, running: {} }, 0)
        yield* enter(deployed, loaded)
        // Before anything else: the stored state says what runs (decision 0003). An activation that cannot finish
        // leaves nothing loaded, and its caller gets the defect (decision 0042). It runs detached from its caller,
        // so an interruption is the process's crash (decision 0079).
        yield* apply(deployed, loaded, { _tag: 'Restart' }).pipe(
          Effect.onError((cause) => Cause.hasInterruptsOnly(cause) ? Effect.void : crash(deployed, loaded, cause)),
        )
        yield* Effect.forkIn(untransacted(loop(deployed, loaded)), deployed.scope)
        return loaded
      })

    /**
     * Runs `effect` in the deployment's scope, and waits for it. A caller that gives up stops waiting, and what the
     * effect sets going is finished all the same: an activation, a creation and its work. Only the process's crash
     * stops it halfway, as the crash table says (decision 0079). It is counted from the step that forks it to its
     * end, so that the process is not settled while it runs. The step is uninterruptible, and the fibers it forks
     * are not, so the scope still stops them: their option says so, rather than Effect's default (decision 0112).
     * The count is given back by a fiber of the process's scope that waits for it, since one the deployment's
     * scope stops before its first step runs no finalizer of its own (decision 0110).
     */
    const detached = <T extends Types, A, E>(deployed: Deployment<T>, effect: Effect.Effect<A, E>) =>
      Effect.flatMap(
        Effect.uninterruptible(Effect.gen(function*() {
          // Raised and lowered by two fibers: the caller raises it, uninterruptible with the fork, and a fiber of the
          // process's scope lowers it once the effect ends, since a fiber stopped before its first step runs no
          // finalizer (decision 0110).
          detachments += 1
          const fiber = yield* Effect.forkIn(untransacted(effect), deployed.scope, { uninterruptible: false })
          yield* Effect.forkIn(
            untransacted(Effect.andThen(
              Fiber.await(fiber),
              Effect.sync(() => {
                // Raised and lowered by two fibers: raised by the caller of `detached`, lowered here once the effect ends.
                detachments -= 1
                end()
              }),
            )),
            running,
            { uninterruptible: false },
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
    const withEntity = <T extends Types, A>(
      deployed: Deployment<T>,
      id: string,
      found: (loaded: Loaded<T> | null) => Effect.Effect<A>,
    ) => {
      const held = holding({ name: deployed.program.name, id })
      const loading = held(Effect.gen(function*() {
        const loaded = deployed.loaded.get(id)
        if (loaded !== undefined) return yield* found(loaded)
        const stored = yield* deployed.storage.load(id)
        return yield* found(stored === null ? null : yield* activate(deployed, stored))
      }))
      return Effect.flatMap(
        held(Effect.suspend(() => {
          const loaded = deployed.loaded.get(id)
          return loaded === undefined ? Effect.succeed(null) : Effect.map(found(loaded), (value) => ({ value }))
        })),
        (here) => here === null ? detached(deployed, loading) : Effect.succeed(here.value),
      )
    }

    /** Loads the entity `id` into this process, if it is stored and this process does not hold it already. */
    const loads = <T extends Types>(deployed: Deployment<T>, id: string) =>
      withEntity(deployed, id, () => Effect.void)

    /**
     * An operator's `Resume` or `Discard`: offered while the entity is held, as a caller's message is, and answered
     * with what it did once applied (decision 0114).
     */
    const operate = <T extends Types>(
      deployed: Deployment<T>,
      id: string,
      event: Extract<Machine.Offered<T>, { _tag: 'Resume' | 'Discard' }>,
    ): Effect.Effect<Operated> =>
      cluster !== null ? Effect.die(notYetOnCluster(`a ${event._tag}`)) : Effect.flatMap(
        withEntity(deployed, id, (loaded): Effect.Effect<Deferred.Deferred<Operated> | null> =>
          loaded === null ? Effect.succeed(null) : Effect.uninterruptible(Effect.gen(function*() {
            // Registered and offered under the entity's lock, and in one step: the line keeps the order of the
            // events, and an interruption cannot leave in it an operator whose event was never offered.
            const operator = yield* Deferred.make<Operated>()
            const address = addressOf({ name: deployed.program.name, id })
            const line = operators.get(address) ?? MutableList.make<Deferred.Deferred<Operated>>()
            MutableList.append(line, operator)
            operators.set(address, line)
            yield* offer(loaded, event)
            return operator
          }))),
        (operator) => operator === null ? Effect.succeed<Operated>({ _tag: 'NotFound' }) : Deferred.await(operator),
      )

    const create = <T extends Types>(
      deployed: Deployment<T>,
      id: string,
      flags: T['flags'],
      request: Request<T['sender']>,
    ): Effect.Effect<Creation, Faulted> =>
      Effect.gen(function*() {
        if (cluster !== null) return yield* Effect.die(notYetOnCluster('a creation'))
        const entity: Address = { name: deployed.program.name, id }
        // A caller's creation is stored under its sender, which a sender that does not encode cannot be: the
        // caller's defect, as for a message (decisions 0040, 0048). So are flags that do not encode, whether the
        // entity exists or not (decision 0049).
        const requested = yield* Effect.try({
          try: () => {
            encode(deployed.program.schemas.flags, flags, 'value of the flags')
            if (request._tag === 'Caller') encode(deployed.program.schemas.sender, request.sender, 'sender')
            return Machine.requestKey(deployed.program, request)
          },
          catch: (defect) => new Faulted({ defect }),
        })
        // Detached from the caller: a creation committed is always started, and its entity loaded (decision 0079).
        const asked = yield* detached(deployed, holding(entity)(Effect.gen(function*() {
          const held = deployed.loaded.get(id) ?? null
          // The entity was already there: the machine answers the request from what is stored (decision 0017).
          if (held !== null) return yield* ask(creations, held, entity, requested, { _tag: 'Create', request })
          const stored = yield* deployed.storage.load(id)
          if (stored !== null) {
            const loaded = yield* activate(deployed, stored)
            return yield* ask(creations, loaded, entity, requested, { _tag: 'Create', request })
          }
          const now = yield* DateTime.now
          const started = Machine.start(deployed.program, id, flags, now, request)
          // A defect at creation stores nothing (decision 0014): its creator is given the defect itself, and a
          // retry after a fix creates the entity (decision 0124).
          if (started._tag === 'Defect') return yield* Effect.fail(new Faulted({ defect: started.cause }))
          const loaded = yield* fresh<T>(started.machine, 0)
          const creation: Machine.Event<T> = { _tag: 'Create', request }
          yield* at('BeforeCommit', entity, creation)
          const characters = yield* sql.withTransaction(
            deployed.storage.write(id, started.written, DateTime.toEpochMillis(now)),
          ).pipe(Effect.orDie)
          tell(entity.name, started.written)
          yield* warnOfSize(loaded, entity, characters)
          // The entity exists from here: its creation is the first event committed for it.
          yield* observe(entity, creation)
          yield* at('AfterCommit', entity, creation)
          yield* enter(deployed, loaded)
          // Each point of the crash table is given the creation, its event: `AfterReply` too.
          yield* perform(deployed, loaded, entity, creation, started.outputs).pipe(
            Effect.onError((cause) => Cause.hasInterruptsOnly(cause) ? Effect.void : crash(deployed, loaded, cause)),
          )
          yield* Effect.forkIn(untransacted(loop(deployed, loaded)), deployed.scope)
          return null
        })))
        return asked === null ? { _tag: 'Created' } : yield* answered(asked)
      })

    const send = <T extends Types>(
      deployed: Deployment<T>,
      id: string,
      message: T['inbound'],
      request: Request<T['sender']>,
      keep?: number,
    ): Effect.Effect<Answer<T['rejection']>, Faulted> =>
      Effect.gen(function*() {
        if (cluster !== null) return yield* Effect.die(notYetOnCluster('a message'))
        const entity: Address = { name: deployed.program.name, id }
        // A message is stored as its schema writes it: one that does not encode is its caller's defect, and
        // reaches no entity (decision 0040).
        const requested = yield* Effect.try({
          try: () => {
            const { schemas } = deployed.program
            encode(schemas.inbound, message, 'inbound message')
            if (request._tag === 'Caller') encode(schemas.sender, request.sender, 'sender')
            return Machine.requestKey(deployed.program, request)
          },
          catch: (defect) => new Faulted({ defect }),
        })
        const event: Machine.Offered<T> = keep === undefined
          ? { _tag: 'Receive', request, message }
          : { _tag: 'Receive', request, message, keep }
        type Offered = Asked<Answer<unknown>> | 'Full' | null
        const asked = yield* withEntity(deployed, id, (loaded): Effect.Effect<Offered> => {
          if (loaded === null) return Effect.succeed(null)
          // The permit and the offer in one uninterruptible region: a caller interrupted between the two would keep
          // a permit that no step gives back (decision 0147). Nothing yields between the two today, so no test reaches
          // that interruption: the region guards the yield Effect inserts after a count of operations. A send that
          // yields between them fails `a caller interrupted anywhere as it sends leaves its entity’s bound whole`
          // outside the region, and passes inside it.
          const offered = (taken: boolean): Effect.Effect<Offered> =>
            taken ? ask(messages, loaded, entity, requested, event) : Effect.as(warnOfFull(loaded, entity), 'Full')
          return Effect.uninterruptible(Effect.flatMap(loaded.callers.takeIfAvailable(1), offered))
        })
        if (asked === null) return { _tag: 'NotFound' }
        if (asked === 'Full') return { _tag: 'Full' }
        return (yield* answered(asked)) as Answer<T['rejection']>
      })

    /**
     * The deployment of `program`, once there is one. An operation that reaches a program not deployed yet waits
     * for it, as for a suspended receiver: what runs does not depend on the order of the deploys (decision 0045).
     */
    const deployedAs = <T extends Types>(program: Program<T>): Effect.Effect<Deployment<T>> =>
      Effect.suspend(() => {
        const deployed = deployment<T>(program.name)
        if (deployed !== undefined) return Effect.succeed(deployed)
        const deploy = undeployed.get(program.name) ?? Deferred.makeUnsafe<void>()
        undeployed.set(program.name, deploy)
        return Effect.flatMap(Deferred.await(deploy), () => deployedAs(program))
      })

    /**
     * What a delivery gives, or `none` when the receiver crashed on it: no reply yet, for the sender to send again
     * under the same request id, as after a crash of the process. A defect of the sender's own stays one, and so
     * does an interruption (decision 0046).
     */
    const unlessCrashed = <A, B>(delivery: Effect.Effect<A, Faulted>, none: B): Effect.Effect<A | B, Faulted> =>
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
    const entities = (entity: Address, key: Key, incarnation: number, droppable: boolean) => {
      const used = { message: new Set<string>(), creation: new Set<string>() }
      /** The request named `name` to the entity `id` of `program`, or the run's defect if it made it already. */
      const named = <T extends Types>(
        kind: keyof typeof used,
        program: Program<T>,
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
          // An id an operation gives is held as a caller's is (decision 0157).
          if (typeof id !== 'string' || !isText(id)) {
            return Effect.die(
              new InvariantDefect({ reason: `the id is ${JSON.stringify(id)}, which is no text a database holds` }),
            )
          }
          const to = JSON.stringify([program.name, id, name])
          if (used[kind].has(to)) {
            const verb = kind === 'message' ? 'sent' : 'created'
            return Effect.die(
              new InvariantDefect({ reason: `the operation ${verb} '${name}' to ${program.name} '${id}' twice` }),
            )
          }
          used[kind].add(to)
          return Effect.map(deployedAs(program), (deployed) => ({
            deployed,
            request: { _tag: 'Operation', entity, key, incarnation, name } as const,
          }))
        })
      return Entities.of({
        send: <T extends Types>(program: Program<T>, id: string, message: T['inbound'], name: string) =>
          Effect.flatMap(named('message', program, id, name), ({ deployed, request }) => {
            // `null` is no reply yet: the receiver crashed, or is suspended and has been resumed since.
            const waiting: Waiting = { entity, key, incarnation, name }
            const attempt = Effect.flatMap(awaitResumption({ name: program.name, id }, waiting), ({ resumed, forget }) =>
              Effect.flatMap(
                unlessCrashed(send(deployed, id, message, request), null),
                (reply): Effect.Effect<Reply<T['rejection']> | null> =>
                  reply === null || reply._tag === 'Full'
                    ? Effect.as(Effect.sleep(`${retry} millis`), null)
                    : reply._tag === 'Suspended'
                    ? Effect.as(resumed, null)
                    : Effect.succeed(reply),
              ).pipe(Effect.ensuring(forget)))
            return faulted(Effect.repeat(attempt, { until: (reply) => reply !== null }))
          }),
        create: <T extends Types>(program: Program<T>, id: string, flags: T['flags'], name: string) =>
          Effect.flatMap(named('creation', program, id, name), ({ deployed, request }) => {
            const attempt = Effect.tap(
              unlessCrashed(create(deployed, id, flags, request), null),
              (creation) => creation === null ? Effect.sleep(`${retry} millis`) : Effect.void,
            )
            return faulted(Effect.repeat(attempt, { until: (creation) => creation !== null }))
          }),
      })
    }

    /**
     * The timers of the entities this process does not hold (decision 0029). It reads the earliest time one is
     * due, and activates the entities whose time has come: arming a timer already due fires it. Then it sleeps
     * until the next, or until an entity is unloaded and brings an earlier one. An activation that fails crashes
     * its entity alone, which is tried again after `retry`, as a receiver that crashed is sent to again
     * (decisions 0046, 0077).
     */
    const waking = <T extends Types>(deployed: Deployment<T>) => {
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
          cluster === null ? undefined : held(deployed),
        )
        next = Math.min(next, due.next ?? Infinity)
        waker.next = next === Infinity ? null : next
        // The entities just activated are this process's, and the reading of the next round leaves them out, as
        // it leaves out the ones that failed until their time.
        if (due.ready.length > 0) {
          for (const id of due.ready) {
            const activation = cluster === null ? loads(deployed, id) : activateOnCluster(deployed, id)
            yield* activation.pipe(Effect.catchCause((cause) =>
              Cause.hasInterruptsOnly(cause) ? Effect.failCause(cause) : Effect.sync(() => {
                waker.failed.set(id, now + retry)
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
          end()
          return true
        })
        if (!rests) return yield* Queue.take(waker.poke)
        yield* next === Infinity
          ? Queue.take(waker.poke)
          : Effect.raceFirst(Queue.take(waker.poke), Effect.sleep(`${Math.max(0, next - now)} millis`))
        waker.busy = true
      }))
    }

    /** The shards whose singleton runs on this runner: the partitions the waker reads on Cluster (decision 0162). */
    const held = <T extends Types>(deployed: Deployment<T>) =>
      [...deployed.shards].flatMap(([shard, state]) => state === 'held' ? [shard] : [])

    /** The waker reads again: the shards it reads have changed, or an entity left the process (decision 0068). */
    const poke = <T extends Types>(deployed: Deployment<T>) => {
      deployed.waker.busy = true
      Queue.offerUnsafe(deployed.waker.poke, undefined)
      end()
    }

    /**
     * The name of a singleton of the program `name` for each shard: the first of `effect-tea-durable/<name>/<n>`, for
     * `n` from 0, that Cluster routes to the shard (decision 0162). Each name found is checked against the partition
     * the storage gives it, so that a hash of Cluster's that came to differ from the storage's is a defect at deploy,
     * and not an entity whose timers no runner reads.
     */
    const singletonsOf = (on: OnCluster, name: string): ReadonlyMap<number, string> => {
      const found = new Map<number, string>()
      // Every shard is found within a few times `shards` names, by the coupon collector's bound: `shards * 64` names
      // leave one out with a chance of about `shards * e^-64`.
      for (let n = 0; found.size < on.shards; n++) {
        const candidate = `effect-tea-durable/${name}/${n}`
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
    const serving = <T extends Types>(on: OnCluster, deployed: Deployment<T>, shard: number) =>
      Effect.andThen(
        Effect.acquireRelease(
          Effect.sync(() => {
            deployed.shards.set(shard, 'held')
            poke(deployed)
          }),
          () => losing(on, deployed, shard),
        ),
        activating(deployed, shard),
      )

    /**
     * Activates the entities of the shard that hold an operation or a message, as a process does as it starts
     * (decision 0071). A door may have loaded one first, and the activation leaves it as it is. A round that fails, in
     * its reading or in an activation, is made again after `retry`: a defect that ended the singleton would run its
     * finalizer, and the shard would be let go while Cluster still routes it here. A round is counted while it runs,
     * so that the process is not settled meanwhile.
     */
    const activating = <T extends Types>(deployed: Deployment<T>, shard: number): Effect.Effect<void> => {
      const round = Effect.gen(function*() {
        let failed = false
        for (const id of yield* deployed.storage.interruptedIn(shard)) {
          const exit = yield* Effect.exit(activateOnCluster(deployed, id))
          if (Exit.isFailure(exit)) failed = true
        }
        return failed
      })
      const counted = Effect.acquireUseRelease(
        Effect.sync(() => {
          detachments += 1
        }),
        () => Effect.exit(round),
        () =>
          Effect.sync(() => {
            detachments -= 1
            end()
          }),
      )
      return Effect.asVoid(Effect.repeat(counted, {
        schedule: Schedule.spaced(`${retry} millis`),
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
    const losing = <T extends Types>(on: OnCluster, deployed: Deployment<T>, shard: number) =>
      Effect.gen(function*() {
        const leaving = yield* Effect.sync(() => {
          deployed.shards.set(shard, 'lost')
          poke(deployed)
          return [...deployed.loaded.values()].filter((loaded) => on.shardOf(loaded.machine.stored.id) === shard)
        })
        const left = new InvariantDefect({ reason: `the shard ${shard} left this runner` })
        for (const loaded of leaving) {
          const { name, id } = loaded.machine.stored
          yield* holding({ name, id })(Effect.suspend(() =>
            deployed.loaded.get(id) === loaded
              ? Effect.andThen(
                crash(deployed, loaded, Cause.die(left)),
                // The loop is woken, finds the entity gone, and ends.
                Effect.sync(() => Queue.offerUnsafe(loaded.events, { _tag: 'Settle' })),
              )
              : Effect.void
          ))
        }
      })

    const deploy = <T extends Types, const C extends Consumers<T> = {}>(
      program: Program<T>,
      deployOptions?: Readonly<{ consumers?: C }>,
    ) =>
      Effect.gen(function*() {
        // A program that cannot run as written is refused before anything is stored or run, and so are consumers
        // that cannot be read as written (decisions 0054, 0152).
        yield* Effect.sync(() => checkProgram(program))
        const consumers = yield* Effect.sync(() =>
          consumersOf(program, (deployOptions?.consumers ?? {}) as Readonly<Record<string, ReadonlyArray<string>>>)
        )
        const services = yield* Effect.context<Exclude<T['services'], Entities>>()
        // A name is deployed once in a process: a new version is a new process (decision 0075). It is claimed in
        // the step that checks it, so that two deploys at once cannot both pass. A deploy that fails before it is
        // registered, interrupted included, stops what it started and gives the name back; one interrupted after
        // keeps both, with its deployment (decisions 0078, 0102). The claim, the deployment's scope and what undoes
        // them are made in one step, so that no interruption falls between them.
        return yield* Effect.uninterruptibleMask((restore) =>
          Effect.gen(function*() {
            if (names.has(program.name)) {
              return yield* Effect.die(new InvariantDefect({ reason: `the program '${program.name}' is deployed already` }))
            }
            // A program under a name the launch left is the old one, and would create entities under it again
            // (decision 0156).
            const renamedTo = renames.get(program.name)
            if (renamedTo !== undefined) {
              const reason = `the program '${program.name}' is deployed, and the launch renames it to '${renamedTo}'`
              return yield* Effect.die(new InvariantDefect({ reason }))
            }
            names.add(program.name)
            const deployed: Deployment<T> = {
              program,
              consumers,
              storage: storage(program, sql, partitions),
              scope: yield* Scope.fork(running),
              loaded: new Map(),
              // Nothing is known of the stored timers until the waker has read them once.
              waker: { busy: true, next: null, poke: yield* Queue.sliding<void>(1), failed: new Map() },
              waking: null,
              shards: new Map(),
              run: (operation) => Effect.provideContext(operation, services) as Effect.Effect<void>,
            }
            return yield* Effect.onError(restore(deploying<T, C>(deployed)), () =>
              deployments.has(program.name) ? Effect.void : Effect.andThen(
                Scope.close(deployed.scope, Exit.void),
                Effect.sync(() => {
                  deployed.loaded.forEach(forgetUse)
                  names.delete(program.name)
                }),
              ))
          })
        )
      })

    const deploying = <T extends Types, C>(deployed: Deployment<T>) =>
      Effect.gen(function*() {
        const { program } = deployed
        // An operation a crash interrupted starts again here, and a message it left in a mailbox is handled
        // (decision 0071); a timer waits for its time, loaded or not. A deploy that cannot finish stops what it
        // started, and is never seen: an operation that reaches its program waits for one that finishes
        // (decisions 0045, 0051). What it loaded leaves the process with it, and holds no place under the capacity
        // (decision 0076).
        yield* deployed.storage.indexed
        // The consumers are stored before any step of this deploy publishes, so that a consumer declared here holds
        // every row from the deploy on. One stored and not declared keeps its rows, and is told of, since a name
        // left out by mistake would otherwise lose them (decision 0152).
        yield* deployed.storage.declare(
          [...deployed.consumers].flatMap(([topic, names]) => [...names].map((consumer) => ({ topic, consumer }))),
        )
        for (const stored of yield* deployed.storage.consumers) {
          if (deployed.consumers.get(stored.topic)?.has(stored.consumer) === true) continue
          yield* Effect.logWarning('a consumer is stored and not declared; it holds its topic until it is forgotten')
            .pipe(Effect.annotateLogs({
              name: program.name,
              topic: stored.topic,
              consumer: stored.consumer,
              behind: stored.behind,
            }))
        }
        // On Cluster the program's requests reach its door, and a singleton per shard tells the deployment which shards
        // the runner holds: the one of a shard held starts as it is registered, and activates the entities the shard
        // left with work (decisions 0092, 0162).
        if (cluster !== null) {
          yield* Scope.provide(cluster.register(program, doorStep(deployed), passivate), deployed.scope)
          const singletons = yield* Effect.sync(() => singletonsOf(cluster, program.name))
          for (const [shard, name] of singletons) {
            yield* Scope.provide(cluster.singleton(name, serving(cluster, deployed, shard)), deployed.scope)
          }
        } else {
          for (const id of yield* deployed.storage.interrupted) yield* loads(deployed, id)
        }
        // Registered with its waker in one step: a deployment others can reach always has its timers woken. The
        // waker is not forked uninterruptible with the step, so the scope that closes it stops it (decisions 0078,
        // 0112).
        yield* Effect.uninterruptible(Effect.gen(function*() {
          deployments.set(program.name, deployed as unknown as Deployment<never>)
          const awaited = undeployed.get(program.name)
          undeployed.delete(program.name)
          if (awaited !== undefined) Deferred.doneUnsafe(awaited, Effect.void)
          deployed.waking = yield* Effect.forkIn(untransacted(waking(deployed)), deployed.scope, { uninterruptible: false })
        }))
        const handle: Handle<T, C> = {
          partitions,
          create: (id, flags, request) =>
            texted(
              id,
              admitted(faulted(
                create(deployed, id, flags, { _tag: 'Caller', sender: request.sender, id: request.requestId }),
              )),
            ),
          send: (id, message, request) =>
            texted(id, counted(
              request.keep === undefined ? {} : { keep: request.keep.millis },
              admitted(faulted(
                send(
                  deployed,
                  id,
                  message,
                  { _tag: 'Caller', sender: request.sender, id: request.requestId },
                  request.keep?.millis,
                ),
              )),
            )),
          read: (id) => texted(id, deployed.storage.projected(id)),
          query: (query) => counted({ limit: query.limit }, deployed.storage.query(query)),
          count: deployed.storage.count,
          sum: deployed.storage.sum,
          countBy: (asked) => counted({ limit: asked.limit }, deployed.storage.countBy(asked)),
          reindex: deployed.storage.reindex,
          published: (topic, after, limit) =>
            topical(
              program,
              topic,
              cursored(after, partitions, counted({ limit }, deployed.storage.published(topic, after, limit))),
            ),
          feed: (topic, consumer, limit, options) => {
            const wait = options?.wait
            const read = deployed.storage.feed(topic, consumer, limit, options?.partitions)
            return topical(
              program,
              topic,
              enlisted(deployed, topic, consumer, true, counted(
                wait === undefined ? { limit } : { limit, wait: wait.millis },
                named(
                  options?.partitions,
                  partitions,
                  wait === undefined || limit === 0 ? read : waited(program.name, topic, wait.millis, read),
                ),
              )),
            )
          },
          ack: (topic, consumer, through) =>
            topical(
              program,
              topic,
              enlisted(
                deployed,
                topic,
                consumer,
                true,
                cursored(through, partitions, deployed.storage.ack(topic, consumer, through)),
              ),
            ),
          prune: deployed.storage.prune,
          consumers: Effect.map(deployed.storage.consumers, (stored) =>
            stored.map((consumer): Consumer => ({
              ...consumer,
              declared: deployed.consumers.get(consumer.topic)?.has(consumer.consumer) === true,
            }))),
          forget: (topic, consumer) =>
            topical(program, topic, enlisted(deployed, topic, consumer, false, deployed.storage.forget(topic, consumer))),
          expire: Effect.flatMap(DateTime.now, (now) => deployed.storage.expire(DateTime.toEpochMillis(now))),
          suspended: Effect.map(deployed.storage.suspended, (listed) =>
            listed.map((suspension): Suspended => ({
              ...suspension,
              waiting: waitingFor({ name: program.name, id: suspension.id }),
            }))),
          resume: (id) => texted(id, admitted(operate(deployed, id, { _tag: 'Resume' }))),
          discard: (id) => texted(id, admitted(operate(deployed, id, { _tag: 'Discard' }))),
        }
        return handle
      })

    const quiet = (now: number) => {
      if (detachments > 0 || leaving > 0) return false
      for (const deployed of deployments.values()) {
        const { waker } = deployed
        // The waker has a reading to make, so nothing is known of the stored timers.
        if (waker.busy) return false
        // A timer of an unloaded entity whose time has come is work the process has not activated yet.
        if (waker.next !== null && waker.next <= now) return false
        for (const loaded of deployed.loaded.values()) {
          const { stored } = loaded.machine
          if (loaded.applying || loaded.pending > 0 || loaded.operations.size > 0) return false
          if (stored.suspension === null && stored.mailbox.length > 0) return false
          // An entity told to leave has not left yet (decision 0076).
          if (loaded.evicted) return false
        }
      }
      return true
    }

    // The signal is taken before the look: whatever ends after it completes it, and `settled` looks again.
    const settled: Effect.Effect<void> = Effect.suspend(() => {
      const next = ended
      return Effect.flatMap(DateTime.now, (now) =>
        quiet(DateTime.toEpochMillis(now))
          ? Effect.void
          : Effect.flatMap(Deferred.await(next), () => settled))
    })

    /**
     * Whether a planned stop has nothing left to wait for: no operation runs, no event waits or is applied, and
     * nothing runs detached from a caller, such as a creation committed whose work has not started. The operations
     * still running are at most once, since the drain stopped the others. A completion recorded in a mailbox is
     * committed, and is handled at the next activation (decision 0119).
     */
    const drained = () => {
      if (detachments > 0) return false
      for (const deployed of deployments.values()) {
        for (const loaded of deployed.loaded.values()) {
          if (loaded.applying || loaded.pending > 0 || loaded.operations.size > 0) return false
        }
      }
      return true
    }

    // The signal is taken before the look, as `settled` takes it: whatever ends after it completes it.
    const emptied: Effect.Effect<void> = Effect.suspend(() => {
      const next = ended
      return drained() ? Effect.void : Effect.flatMap(Deferred.await(next), () => emptied)
    })

    // A planned stop, added after `running` and so run before it closes (decision 0119). Its wait is made
    // interruptible, so that the timeout ends it even if a finalizer runs uninterruptibly.
    if (drain !== undefined) {
      yield* Scope.addFinalizer(scope, Effect.gen(function*() {
        draining = true
        for (const deployed of [...deployments.values()]) {
          if (deployed.waking !== null) yield* Fiber.interrupt(deployed.waking)
          for (const loaded of [...deployed.loaded.values()]) {
            for (const id of [...loaded.timers.keys()]) yield* stop(loaded.timers, id)
            for (const id of [...loaded.rerun]) yield* stop(loaded.operations, id)
          }
        }
        yield* Effect.interruptible(Effect.timeoutOption(emptied, `${drain} millis`))
        Deferred.doneUnsafe(stopped, Effect.interrupt)
      }))
    }

    return { deploy, settled }
  })
