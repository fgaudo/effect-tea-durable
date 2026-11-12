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
 *
 * This module launches the runtime and gives each deployment its handle. The rest of the runtime is divided by what it
 * does, in the folder `runtime/`: an entity's loop in [`loop.ts`](runtime/loop.ts), its callers in
 * [`callers.ts`](runtime/callers.ts), the steps on Cluster in [`doors.ts`](runtime/doors.ts), the waker in
 * [`waker.ts`](runtime/waker.ts), and the readings of the log that wait in [`readings.ts`](runtime/readings.ts). What
 * they share is in [`process.ts`](runtime/process.ts). A module outside the runtime imports this one alone
 * (decision 0241).
 */
import * as Cause from 'effect/Cause'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Latch from 'effect/Latch'
import * as Option from 'effect/Option'
import * as Queue from 'effect/Queue'
import * as Scope from 'effect/Scope'
import { SqlClient, type SqlError } from 'effect/sql'
import { create, faulted, operate, send, wake } from './runtime/callers.ts'
import { current, doorStep, serving, singletonsOf } from './runtime/doors.ts'
import { loads, stop } from './runtime/loop.ts'
import * as Machine from './machine.ts'
import { type Deployment, forgetUse, forkApart, type Process, untransacted } from './runtime/process.ts'
import {
  type Address,
  type Key,
  checkProgram,
  type Creation,
  Entities,
  type FlagsOf,
  idFault,
  requestIdFault,
  InvariantDefect,
  isText,
  type Program,
  type Receiver,
  type Reply,
  type Reused,
  type Request,
  type Piece,
  type SenderOf,
  type Topic,
  topicsOf,
  type Types,
  versionOf,
} from './program.ts'
import {
  type Consumer,
  type Counted,
  type CountedBy,
  createTables,
  type Cursor,
  defaultPartitions,
  type Found,
  type Published,
  hold,
  partitioned,
  renamed,
  type Query,
  type Reindexed,
  storage,
  type Storage,
  type Summed,
  type Suspended,
  type Tally,
  transaction,
} from './storage.ts'
import { type Readings, tellAll, waited } from './runtime/readings.ts'
import { waking } from './runtime/waker.ts'

/**
 * What a caller is answered: the replies stored under its request id, `NotFound` for no entity, `Suspended`,
 * which says that the request has no reply yet (decision 0023), and `Full`, which says that the entity holds as many
 * callers' messages as its bound, and nothing of this one was offered or stored (decision 0147). On Cluster a caller
 * is never answered `Full` (decision 0165).
 */
export type Answer<Reason> = Reply<Reason> | Readonly<{ _tag: 'Suspended' }> | Readonly<{ _tag: 'Full' }> | Reused

export { type Suspended, type Waiting } from './storage.ts'

/**
 * An entity, as `Handle.inspect` gives it: what is stored of it, read through the migrations as an activation reads
 * it, from one snapshot (decision 0185).
 */
export type Inspected<T extends Types> = Readonly<{
  id: string
  state: T['state']
  /**
   * The messages queued for the entity, the next one first: an inbound one with the request it came with, an internal
   * one with the run of the work that sent it.
   */
  mailbox: ReadonlyArray<
    | Readonly<{ _tag: 'Inbound'; request: Request<T['sender']>; message: T['inbound'] }>
    | Readonly<{ _tag: 'Internal'; key: Key; incarnation: number; message: T['internal'] }>
  >
  /**
   * The work under way, the oldest first: each key the state holds work under, its incarnation, and the operation or
   * the timer.
   */
  work: ReadonlyArray<Readonly<{ key: Key; incarnation: number; work: Piece<T['operation'], T['internal']> }>>
  /** The suspension, as `suspended` lists it, or null for an entity that is not suspended. */
  suspension: Suspended | null
}>

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
export const Probe = Context.Reference<(said: Said) => Effect.Effect<void>>('@fgaudo/effect-tea-persistent/Probe', {
  defaultValue: () => () => Effect.void,
})

/**
 * The options of `launch`, each with a default: a launch with none runs on one process with the tables it creates.
 * Only an option left out, or a field of it left out, takes the default. An option or a field given `null` is the
 * launcher's defect, as any value an option does not take is (decision 0208).
 */
export interface Options {
  /**
   * How long a `send` or a `create` from another entity waits before sending again to a receiver that crashed on
   * it (decision 0046). A suspended receiver is waited for until it is resumed, and a program not deployed yet until
   * it is: neither is looked at again on a clock (decision 0063). A positive integer, 10 by default
   * (decision 0251).
   */
  readonly retry?: Readonly<{ millis: number }>
  /**
   * How long an entity stays loaded with no event coming for it. The wait starts again at every event, and when
   * it runs out the entity is unloaded, or waits again if it still has something to do (decision 0029). A
   * positive integer, 30 000 by default (decision 0251).
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
   * of the outbox, before the runtime logs a warning, once per activation of the entity. A non-negative integer,
   * 262 144 by default. Nothing is refused for its size: the program splits a large state (decisions 0135, 0138,
   * 0208).
   */
  readonly warn?: Readonly<{ characters: number }>
  /**
   * How many callers' messages an entity holds before a `send` is answered `Full`: the messages of `send` offered
   * to it and not yet applied, whose callers wait. A positive integer, 4096 by default. The first refusal of an
   * activation logs a warning. An operation of another entity is never answered `Full`: it sends again after `retry`
   * (decision 0147). On Cluster the bound does not hold: a caller's message waits in Cluster's table, and Cluster's
   * `mailboxCapacity` bounds the messages in memory (decision 0165).
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
   * empty name, a name renamed to itself, and a name both renamed and the new name of another, before the database
   * is held. Two names may be renamed to one, as a program renamed twice is: `{ a: 'c', b: 'c' }`. A deploy of a
   * name renamed dies (decisions 0156, 0176). On Cluster the old name is marked renamed, so that no runner of the old
   * code steps it again, and the new program's door is registered under each old name too, so that a request Cluster
   * saved under the old name is delivered to the new program (decision 0176).
   */
  readonly renames?: Readonly<Record<string, string>>
  /**
   * What the launch does with the tables. `'create'`, the default, runs the migrations of the tables not yet
   * recorded, once the database is held (decision 0216). `'existing'` runs none, for a role of PostgreSQL that may
   * only read and write rows. That role's launch dies where a table is missing, and an operator runs `createTables`
   * under the tables' owner before each launch of a new release of the library. On Cluster `sharding` creates the
   * tables whatever this says (decision 0191).
   */
  readonly tables?: 'create' | 'existing'
  /**
   * How often the runtime sweeps each program deployed: every `millis`, it runs `expire`, then `prune` unless `prune`
   * is `false`. `millis` is a positive integer, 300 000 by default. `'none'` sweeps nothing, and leaves `expire` and
   * `prune` to an operator. A sweep that fails logs a warning with its cause, and the next one runs at the next
   * interval. A prune drops whole a topic no consumer is stored for, so a deployment that keeps the history of a topic
   * declares its consumer before the topic's first step, or sweeps with `prune: false`. On Cluster one runner sweeps
   * a program, the one that holds the sweep's singleton, by its own option (decision 0245).
   */
  readonly sweep?: Readonly<{ millis: number; prune?: false }> | 'none'
}

/**
 * Sweeps `deployed` every `millis`, for ever: `expire`, then `prune` unless `prune` is `false`. A sweep that fails is
 * logged with its cause, and the deployment goes on (decision 0245).
 */
const sweepOf = <T extends Types>(deployed: Deployment<T>, sweep: Readonly<{ millis: number; prune?: false }>) => {
  const once = Effect.gen(function*() {
    yield* deployed.storage.expire(DateTime.toEpochMillis(yield* DateTime.now))
    if (sweep.prune !== false) yield* deployed.storage.prune
  })
  return Effect.forever(Effect.andThen(
    Effect.sleep(`${sweep.millis} millis`),
    Effect.catchCause(once, (cause) =>
      Cause.hasInterruptsOnly(cause)
        ? Effect.failCause(cause)
        : Effect.logWarning('a sweep failed; the next one runs at the next interval', cause).pipe(
          Effect.annotateLogs({ name: deployed.program.name }),
        )),
  ))
}

/**
 * The renames of a launch as pairs, none where they are left out, or the launcher's defect where they cannot run as
 * written (decision 0156). Renames given `null` from JavaScript are no renames left out, and are refused
 * (decision 0208). Two names renamed to one are not refused here: the storage refuses a move onto a name that holds
 * an entity already (decision 0176).
 */
export const renamesOf = (
  renames: Readonly<Record<string, string>> | undefined,
): ReadonlyArray<readonly [string, string]> => {
  if (renames === undefined) return []
  if (typeof renames !== 'object' || renames === null) {
    throw new InvariantDefect({ reason: `the option renames is ${String(renames)}, which is no object` })
  }
  const pairs = Object.entries(renames)
  for (const [from, to] of pairs) {
    const reason = typeof to !== 'string' || from === '' || to === ''
      ? `the launch renames '${from}' to '${String(to)}', and a name is a string that is not empty`
      : !isText(from) || !isText(to)
      ? `the launch renames ${JSON.stringify(from)} to ${JSON.stringify(to)}, and a name is text a database holds`
      : from === to
      ? `the launch renames '${from}' to itself`
      : Object.hasOwn(renames, to)
      ? `the launch renames '${from}' to '${to}', which it renames too`
      : null
    if (reason !== null) throw new InvariantDefect({ reason })
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

/**
 * How long a caller's reply is kept from the step that answers: `millis`, a non-negative integer, or `'forever'`
 * (decisions 0125, 0245).
 */
export type Keep = Readonly<{ millis: number }> | 'forever'

/** What a caller does with one program's entities, deployed with the consumers `C`. */
export interface Handle<T extends Types, C = {}> {
  /**
   * How many partitions the log has, as the first launch of its database stored it: what the readers of one consumer
   * divide among them (decisions 0137, 0153).
   */
  readonly partitions: number
  /**
   * Creates the entity `id` with the request's `flags`, left out where the program's flags are `null`
   * (decision 0245). A retry of the request that created it is answered `Created` (decision 0017), and a request under
   * the same sender and request id with other flags is answered `Reused`, and changes nothing (decision 0269). Flags the
   * program's `init` rejects are answered `Rejected`, and nothing is stored: a retry runs `init` again
   * (decision 0182). A request id that is no text a database holds is the caller's defect (decision 0204). A call
   * within a transaction of the client of the runtime is the caller's defect too, since the step it waits for commits
   * on a connection of its own (decision 0256).
   */
  readonly create: (
    id: string,
    request: Readonly<{ requestId: string } & FlagsOf<T> & SenderOf<T>>,
  ) => Effect.Effect<Creation<T['rejection']> | Reused>
  /**
   * Sends an inbound message, and waits for the reply. A retry under the same request id gets the reply stored for
   * it. A request under the same sender and request id that carries another message is answered `Reused`, and nothing
   * of it is applied or stored, since a program whose sender is `null` shares its request ids among every caller
   * (decision 0269). The boundary gives `keep`, the time its protocol retries for. The reply is then kept for `keep.millis` from
   * the step that answers, and a retry after that is a new request, applied again. `'forever'` keeps the reply for
   * ever. `keep` is required, since only the boundary knows the window, and `keep.millis` is a non-negative integer:
   * anything else is the caller's defect (decisions 0125, 0245). A
   * request id that is no text a database holds is the caller's defect too (decision 0204). An
   * entity that holds as many callers' messages as `callers.messages` answers `Full` at once, and nothing of the
   * message is offered or stored: the caller retries later, under the same request id or another (decision 0147).
   * On Cluster a caller is never answered `Full`, and its message waits for the entity. There, until a step of the
   * entity or `expire` deletes Cluster's rows of a reply past its time, a retry after `keep` is given the reply
   * Cluster saved, and a message kept `'forever'` keeps Cluster's rows for ever (decisions 0165, 0171). Cluster's
   * rows are kept for at least two of Cluster's polls of replies and a second, whatever the `keep`, so that another
   * client of the request on another runner reads the answer first (decision 0248). A call within a transaction of
   * the client of the runtime is the caller's defect, as for `create` (decision 0256).
   */
  readonly send: (
    id: string,
    message: T['inbound'],
    request: Readonly<{ requestId: string; keep: Keep } & SenderOf<T>>,
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
   * total (decision 0148). So is a sum whose numbers, taken without their sign, may add up past the largest double:
   * each is counted in units of 2^980, cut to an integer, and the sum is refused once those units and the count of
   * numbers reach 2^44, alike on both dialects (decision 0277). PostgreSQL adds exactly and SQLite with a compensated
   * sum of doubles, so the two may differ in the last digits, by at most a rounding of that total without signs
   * (decision 0209).
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
   * with `fetch` instead (decision 0039).
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
   * the caller's defect (decision 0142). A fetch that waits, within a transaction of the client of the runtime, is the
   * caller's defect, as `create` is, and one that does not wait reads within the transaction (decision 0256).
   * Given `partitions`, a reading reads those partitions only, so that the readers of one name divide its
   * partitions among them. The division is the caller's: the runtime holds no reader, and two readers that name one
   * partition are given the same rows. A list that is empty, or holds what is no partition of the log, is the
   * caller's defect (decision 0153).
   */
  readonly fetch: <Name extends Topic<T>>(
    topic: Name,
    consumer: ConsumerOf<C, Name>,
    limit: number,
    options?: Readonly<{ wait?: Readonly<{ millis: number }>; partitions?: ReadonlyArray<number> }>,
  ) => Effect.Effect<ReadonlyArray<Published<T, Name>>>
  /**
   * Moves a consumer's cursor in each partition `through` names, and no other. The rows `fetch` gave are such a
   * list. A cursor never moves back, since what is behind it may be gone, and never past the last `seq` written in
   * its partition, so that no row written later is behind it (decisions 0039, 0137). The consumer is one the deploy
   * declares for the topic (decision 0152). A topic is one the program publishes, and a partition is an integer from 1
   * to the number of partitions of the log. A `seq` and a limit are non-negative integers, here and in `query`,
   * `published` and `fetch`, and a limit left out is no limit at all but the caller's defect, as is anything else
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
   * Runs a reader of the consumer `consumer` of `topic`: it reads a page of at most `limit` rows with `fetch`, runs
   * `handler` on it and acks it in one transaction of the client the runtime was launched with, and reads the next.
   * So a store that `handler` writes on that client commits with the cursors, and a page whose transaction fails is
   * read again. `handler` is given no empty page. Without `wait`, the reader ends at the first page that is empty,
   * or once the runtime stops, with the rows it did not read left for the next reader: what a test or a batch runs.
   * Given `wait: true`, a reading that finds no row waits for a commit in the topic, and the reader ends only when
   * the runtime stops: what a deployment runs. Given `partitions`, it reads those only, as `fetch` does. A failure
   * of `handler` or of the transaction rolls the page back and fails the reader, whose retries are the caller's. The
   * limit is a positive integer. A reader run within a transaction of the client would hold its connection while it
   * waits, so it is the caller's defect, as is anything `fetch` refuses (decision 0184). `handler` runs within the
   * page's transaction, so a call there of `create`, `send`, `resume`, `discard`, `deploy` or a fetch that waits is
   * the caller's defect, and fails the reader. A handler that must create or send stores the request, and a fiber
   * outside the transaction makes the call (decision 0256).
   */
  readonly consume: <Name extends Topic<T>, E, R>(
    topic: Name,
    consumer: ConsumerOf<C, Name>,
    handler: (page: ReadonlyArray<Published<T, Name>>) => Effect.Effect<void, E, R>,
    options: Readonly<{ limit: number; wait?: true; partitions?: ReadonlyArray<number> }>,
  ) => Effect.Effect<void, E | SqlError.SqlError, R>
  /**
   * Drops what every consumer of a topic has read, in each partition through the lowest cursor there, and gives how
   * many rows went. A consumer that has acked nothing of a partition holds the whole partition of its topic. A
   * topic no consumer is stored for is dropped whole, since no reader that keeps cursors needs its rows: a reading
   * with `published` has no say in a prune (decisions 0039, 0137, 0152). The rows go in batches, each a transaction of
   * its own, so the count is the sum of the batches, and a prune that fails keeps the batches it committed before
   * (decision 0245).
   */
  readonly prune: Effect.Effect<number>
  /**
   * Each consumer stored, with its topic, whether the deploy declares it, how many rows are past its cursors, and its
   * cursors in the partitions it has rows to read in: what keeping it costs the log (decision 0152). `since` is the
   * time of the step that wrote the oldest of the rows it reads next, from which a caller reads its age
   * (decision 0224).
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
   * never read, so this frees only their rows: those of an entity that answers no message, since a step that stores a
   * reply deletes its own entity's (decision 0125). The replies go in batches, each a transaction of its own, so the count is the sum of the
   * batches, and an expire that fails keeps the batches it committed before (decision 0245).
   */
  readonly expire: Effect.Effect<number>
  /**
   * The suspended entities of the program, the longest suspended first: each with what it died on, the cause, since
   * when, and the operations that wait for its resumption. Read from what is stored, so an entity this process does
   * not hold is listed too, with the operations of every process and of a process before a restart. An operation is
   * listed from the step that answered it `Suspended` while its run holds, until the entity is taken out of its
   * suspension (decisions 0114, 0265).
   */
  readonly suspended: Effect.Effect<ReadonlyArray<Suspended>>
  /**
   * What is stored of the entity `id`, or null when there is none: its state, its mailbox, its work under way and its
   * suspension, as `suspended` lists it. An operator reads it to decide between `resume` and `discard`. It is read from
   * what is stored, so an entity this process does not hold is inspected too, and nothing is activated. The rows are
   * read from one snapshot, so a step that commits meanwhile is read whole or not at all. A row that no migration
   * reads is a defect here, as it is at the entity's activation (decision 0185).
   */
  readonly inspect: (id: string) => Effect.Effect<Inspected<T> | null>
  /**
   * An operator resumes a suspended entity (decision 0006), with the program deployed: a fixed program is a deploy
   * of it, which the resume follows (decision 0064). It gives `Resumed`, `StillSuspended`, `NotSuspended` or
   * `NotFound` (decision 0114). A call within a transaction of the client of the runtime is the caller's defect, as
   * for `create` (decision 0256).
   */
  readonly resume: (id: string) => Effect.Effect<Operated>
  /**
   * An operator discards the inbound message a suspended entity died on (decision 0014). An internal one is not
   * discarded, and the entity stays suspended (decisions 0041, 0044). It gives `Discarded`, `NotDiscarded`,
   * `StillSuspended`, `NotSuspended` or `NotFound` (decision 0114). A call within a transaction of the client of the
   * runtime is the caller's defect, as for `create` (decision 0256).
   */
  readonly discard: (id: string) => Effect.Effect<Operated>
}

/**
 * The runtime `launch` gives: it deploys programs on the database it holds, and `settled` waits for the work they
 * have under way.
 */
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
   * name or a name declared twice in a topic are refused, before anything is stored (decision 0152). A deploy within
   * a transaction of the client of the runtime is the caller's defect, since its activations are steps, which commit
   * apart from any transaction of the caller (decision 0256).
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
 * A request that reaches a program's door on Cluster: which RPC, the entity, and what its payload carries. A
 * caller's message carries the time to keep its reply, `keep`, in milliseconds (decision 0165).
 */
export type Delivered = Readonly<{
  _tag: 'Create' | 'Message'
  id: string
  version: number
  request: string
  message: string
  keep?: number
}>

/** An operator's `Resume` or `Discard` that reaches a program's door on Cluster, for the entity `id` (decision 0166). */
export type Operating = Readonly<{ _tag: 'Resume' | 'Discard'; id: string }>

/** What a door's step answers: a message's answer, a creation's, or what an operator's event did. */
export type DoorAnswer<Reason> =
  | Readonly<{ _tag: 'Message'; answer: Reply<Reason> | Readonly<{ _tag: 'Suspended' }> | Reused }>
  | Readonly<{ _tag: 'Create'; answer: Creation<Reason> | Reused }>
  | Readonly<{ _tag: 'Operated'; answer: Operated }>

/**
 * What the runtime is given to run on Effect Cluster (decisions 0081, 0092, 0161): how a deploy registers its
 * program's door, whose requests the runtime steps in Cluster's transaction. `src/cluster.ts` gives it.
 */
export interface OnCluster {
  /**
   * Registers the door of `program`, whose requests `step` steps, and whose `Resumed` from the entity `receiver`
   * calls `resumed` with it (decisions 0092, 0167). Each is given the Cluster request id of the request, in its
   * decimal digits, in Cluster's transaction (decision 0169). The same door is registered under each name of
   * `formerly`, the names the launch renames to the program's, so that what Cluster saved under one is stepped by
   * the program (decision 0176).
   */
  readonly register: <T extends Types>(
    program: Program<T>,
    step: (delivered: Delivered | Operating, requestId: string) => Effect.Effect<DoorAnswer<T['rejection']>>,
    idle: number,
    resumed: (receiver: Address, requestId: string) => Effect.Effect<void>,
    formerly: ReadonlyArray<string>,
  ) => Effect.Effect<void, never, Scope.Scope>
  /**
   * The version of each program this runner's `sharding` recorded, by name, or `null` on a process that holds no
   * shard. A deploy of a program not recorded at its version dies (decision 0174).
   */
  readonly versions: ReadonlyMap<string, number> | null
  /**
   * Dies unless a step of the entity `id` of `program` may commit on this runner: the program's version is the
   * newest a launch recorded, and the lease of the entity's shard names this runner and has not expired. It reads in
   * the transaction under way, and every step on Cluster runs it first, a door's, the loop's and an activation's, so
   * that the commit makes the check (decisions 0159, 0175).
   */
  readonly guard: (program: Pick<Program<Types>, 'name' | 'migrations'>, id: string) => Effect.Effect<void>
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
  /**
   * A creation, sent through the program's door by Cluster's client, from whatever runner the sender is on: what the
   * door's step answered it (decision 0165). An answer `Rejected` is not stored: one Cluster saved under the request is
   * reset before the creation is sent, so that a caller's retry runs `init` again (decision 0182). An operation's
   * rejection is kept by the door's step, which answers the creation sent again with it (decision 0253). A failure
   * Cluster saved as its reply is reset
   * before it is given (decision 0168). `kept` is an operation's: the client calls it with the request's Cluster id
   * before that reset, and it gives whether the asker's work still holds. Where the work has ended, the client neither
   * resets nor gives the failure, and waits until it is interrupted (decisions 0092, 0170). `given` is a caller's:
   * the client calls it with the request's Cluster id once Cluster has given it the answer, before it gives the
   * answer. It is given too `least`, the least time in millis that Cluster's rows of the request are kept from then,
   * so that another client of the request reads the reply first (decision 0248).
   */
  readonly create: <T extends Types>(
    program: Program<T>,
    sent: Omit<Delivered, '_tag' | 'keep'>,
    kept?: (requestId: string) => Effect.Effect<boolean>,
    given?: (requestId: string, least: number) => Effect.Effect<void>,
  ) => Effect.Effect<Creation<T['rejection']> | Reused>
  /**
   * A message, sent through the program's door by Cluster's client. An answer `Suspended` or `NotFound` is no reply:
   * Cluster's row of it is reset, and the message sent again, whose answer is given (decisions 0085, 0165). A failure
   * Cluster saved, and `kept`, are as for `create`. `given` is a caller's message's with `keep`, and is called as for
   * `create` (decisions 0171, 0248).
   */
  readonly send: <T extends Types>(
    program: Program<T>,
    sent: Omit<Delivered, '_tag'>,
    kept?: (requestId: string) => Effect.Effect<boolean>,
    given?: (requestId: string, least: number) => Effect.Effect<void>,
  ) => Effect.Effect<Reply<T['rejection']> | Readonly<{ _tag: 'Suspended' }> | Reused>
  /**
   * An operator's `Resume` or `Discard`, sent through the program's door by Cluster's client, from whatever runner
   * the operator is on: what the door's step answered it (decision 0166).
   */
  readonly operate: <T extends Types>(program: Program<T>, operating: Operating) => Effect.Effect<Operated>
  /**
   * Tells the door of the entity `sender` that the entity `receiver` is out of its suspension, from the transaction
   * of the step that took it out, without waiting for the door: Cluster saves the request in that transaction, and
   * delivers it once the transaction commits (decision 0167).
   */
  readonly resume: (sender: Address, receiver: Address) => Effect.Effect<void>
}

/**
 * Runs `effect` unless it is called within a transaction of the client of the runtime, which is the caller's defect,
 * named by `what` (decision 0256). `effect` runs a step of the runtime or waits for one, and a step commits on a
 * connection of its own. On SQLite and PGlite the caller's transaction holds the one connection, and on a pool of
 * PostgreSQL enough such callers hold every connection: the step waits for the caller, which waits for the step.
 */
const outside = <A, E, R>(
  sql: SqlClient.SqlClient,
  what: string,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.flatMap(Effect.serviceOption(sql.transactionService), (open) => {
    if (Option.isNone(open)) return effect
    const reason = `${what} runs within a transaction of the client of the runtime`
    return Effect.die(new InvariantDefect({ reason }))
  })

/**
 * Runs `effect` once each count a caller gave — a cursor, a limit — is a non-negative integer: anything else is
 * the caller's defect, and nothing is read or stored for it. A count left out is refused with the rest, since the
 * types do not hold a cast or a call from JavaScript (decisions 0053, 0141).
 */
const counted = <A, E = never, R = never>(
  counts: Readonly<Record<string, number>>,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.suspend(() => {
    for (const [what, count] of Object.entries(counts)) {
      if (Number.isSafeInteger(count) && count >= 0) continue
      return Effect.die(new InvariantDefect({ reason: `the ${what} is ${count}, which is no non-negative integer` }))
    }
    return effect
  })

/**
 * Runs `effect` with the argument a caller gave, a request or what a reading asks, once it is an object: an argument
 * left out, or `null`, is the caller's defect, given in the effect, and nothing is read or stored for it. The types
 * do not hold a call from JavaScript, and a read of a field of no object would throw where the call is made, outside
 * the effect (decisions 0053, 0141).
 */
const argued = <O, A>(what: string, argument: O, effect: (argument: O) => Effect.Effect<A>): Effect.Effect<A> =>
  Effect.suspend(() =>
    typeof argument === 'object' && argument !== null
      ? effect(argument)
      : Effect.die(new InvariantDefect({ reason: `the ${what} is ${String(argument)}, which is no object` }))
  )

/**
 * Runs `effect` with the millis of a `keep` the caller gave, or `undefined` for `'forever'`, once it is one of the
 * two: anything else, a `keep` left out included, is the caller's defect, and nothing is read or stored for it. The
 * types do not hold a call from JavaScript (decisions 0053, 0245).
 */
const kept = <A>(keep: Keep, effect: (millis: number | undefined) => Effect.Effect<A>): Effect.Effect<A> =>
  Effect.suspend(() => {
    if (keep === 'forever') return effect(undefined)
    if (typeof keep === 'object' && keep !== null) return counted({ keep: keep.millis }, effect(keep.millis))
    return Effect.die(new InvariantDefect({ reason: `the keep is ${String(keep)}, which is neither millis nor 'forever'` }))
  })

/**
 * The sender of a caller's request: `null` where the request leaves it out, which the types allow only where the
 * program's sender is `null`. A program that has a sender is given `null` from JavaScript, and its schema refuses it
 * (decision 0245).
 */
const senderOf = <T extends Types>(request: Readonly<{ sender?: unknown }>): T['sender'] =>
  request.sender === undefined ? null : request.sender

/**
 * The flags of a creation: `null` where the request leaves them out, which the types allow only where the program's
 * flags are `null`. A program that has flags is given `null` from JavaScript, and its schema or `init` refuses it
 * (decision 0245).
 */
const flagsOf = <T extends Types>(request: Readonly<{ flags?: unknown }>): T['flags'] =>
  request.flags === undefined ? null : request.flags

/**
 * Runs `effect` once the id a caller gave is an id, text a database holds as it is and not empty: anything else is
 * the caller's defect, and nothing is read or stored for it. No database gives a lone surrogate back as written, so
 * that two ids would be one entity, PostgreSQL holds U+0000 in no text, and the waker never wakes the empty id
 * (decisions 0053, 0157, 0179).
 */
const texted = <A>(id: string, effect: Effect.Effect<A>): Effect.Effect<A> =>
  Effect.suspend(() => {
    const reason = idFault(id)
    return reason === undefined ? effect : Effect.die(new InvariantDefect({ reason }))
  })

/**
 * Runs `effect` once the request id a caller gave is text a database holds: anything else is the caller's defect,
 * and nothing is read or stored for it. PostgreSQL holds U+0000 in no text, so the write of the reply would fail,
 * and the entity would leave the process with its operations (decision 0204).
 */
const requested = <A>(requestId: string, effect: Effect.Effect<A>): Effect.Effect<A> =>
  Effect.suspend(() => {
    const reason = requestIdFault(requestId)
    return reason === undefined ? effect : Effect.die(new InvariantDefect({ reason }))
  })

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
    // Cursors left out, which the types do not hold, are refused as a request left out is (decision 0053).
    if (!Array.isArray(cursors)) {
      return Effect.die(new InvariantDefect({ reason: `the cursors are ${String(cursors)}, which are no list` }))
    }
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
const named = <A, E = never, R = never>(
  given: ReadonlyArray<number> | undefined,
  partitions: number,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
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
const topical = <T extends Types, A, E = never, R = never>(
  program: Program<T>,
  topic: string,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
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
const enlisted = <T extends Types, A, E = never, R = never>(
  deployed: Deployment<T>,
  topic: string,
  consumer: string,
  declared: boolean,
  effect: Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> =>
  Effect.suspend(() => {
    if ((deployed.consumers.get(topic)?.has(consumer) === true) === declared) return effect
    const program = deployed.program.name
    const reason = declared
      ? `'${consumer}' is no consumer the deploy of '${program}' declares for '${topic}'`
      : `'${consumer}' is a consumer the deploy of '${program}' declares for '${topic}', and is not forgotten`
    return Effect.die(new InvariantDefect({ reason }))
  })

/**
 * The field `field` of the launch's option `name`, or `fallback` where the option or its field is left out. Only what
 * is left out is the default: a field given `null` from JavaScript is given as it is, for the option's check to
 * refuse, and an option that is no object, `null` included, is the launcher's defect here. The types do not hold a
 * call from JavaScript (decision 0208).
 */
const optionOf = <A>(options: Options, name: keyof Options, field: string, fallback: A): A => {
  const option: unknown = options[name]
  if (option === undefined) return fallback
  if (typeof option !== 'object' || option === null) {
    throw new InvariantDefect({ reason: `the option ${name} is ${String(option)}, which is no object` })
  }
  const value = (option as Readonly<Record<string, unknown>>)[field]
  return value === undefined ? fallback : value as A
}

/**
 * The runtime of one process, on the database of the client it is given, which it holds until the scope closes. The
 * launch creates the tables where they are missing, unless `tables` says they exist (decision 0191).
 */
export const launch = (options: Options = {}): Effect.Effect<Runtime, never, SqlClient.SqlClient | Scope.Scope> =>
  launchWith(options, null)

/** The options of a launch once checked, each read with its default. */
type Checked = Readonly<{
  partitions: number
  renames: Map<string, string>
  retry: number
  passivate: number
  capacity: number | 'unbounded'
  drain: number | undefined
  threshold: number
  bound: number
  sweep: 'none' | Readonly<{ millis: number; prune?: false }>
}>

/**
 * The options of a launch, checked. An option that cannot run as written throws the launcher's defect. The checks
 * read only the options, so that a launch refused for one dies before it holds or stores anything (decision 0264).
 */
const checkedOptions = (options: Options, cluster: OnCluster | null): Checked => {
  const refuse = (reason: string): never => {
    throw new InvariantDefect({ reason })
  }
  // On Cluster a partition of the log is the shard of its entity, so the log has as many partitions as Cluster has
  // shards per group (decision 0162).
  const partitions = optionOf(options, 'log', 'partitions', cluster?.shards ?? defaultPartitions)
  if (!(Number.isSafeInteger(partitions) && partitions >= 1)) {
    refuse(`the log has ${partitions} partitions, which is no positive integer`)
  }
  if (options.tables !== undefined && options.tables !== 'create' && options.tables !== 'existing') {
    refuse(`the launch is given the tables ${JSON.stringify(options.tables)}, which is neither 'create' nor 'existing'`)
  }
  if (cluster !== null && partitions !== cluster.shards) {
    refuse(`the log has ${partitions} partitions, and Cluster ${cluster.shards} shards per group`)
  }
  const renames = new Map(renamesOf(options.renames))
  const retry = optionOf(options, 'retry', 'millis', 10)
  const passivate = optionOf(options, 'passivate', 'millis', 30_000)
  const capacity = optionOf<number | 'unbounded'>(options, 'capacity', 'entities', 10_000)
  const drain = optionOf<number | undefined>(options, 'drain', 'millis', undefined)
  const threshold = optionOf(options, 'warn', 'characters', 262_144)
  const bound = optionOf(options, 'callers', 'messages', 4096)
  if (!(Number.isSafeInteger(bound) && bound > 0)) {
    refuse(`the callers' messages are ${bound}, which is no positive integer`)
  }
  if (drain !== undefined && !(Number.isSafeInteger(drain) && drain >= 0)) {
    refuse(`the drain is ${drain} millis, which is no non-negative integer`)
  }
  // A time becomes the text of a duration, which Effect does not read as `Infinity millis` or `NaN millis`: the
  // sleep of an entity's wait, or of an operation that sends again, would die (decision 0208). A retry or a
  // passivation of 0 is refused too: the waker, a sender, Cluster's round and an entity's wait sleep on it, and
  // each would try again at once, for ever (decision 0251).
  for (
    const [what, value, unit, least] of [
      ['retry', retry, 'millis', 1],
      ['passivation', passivate, 'millis', 1],
      ['warning', threshold, 'characters', 0],
    ] as const
  ) {
    if (Number.isSafeInteger(value) && value >= least) continue
    refuse(`the ${what} is ${value} ${unit}, which is no ${least === 0 ? 'non-negative' : 'positive'} integer`)
  }
  // Only a sweep left out is the default: a `null` from JavaScript is refused, as a `keep` of `null` is.
  const sweep = options.sweep === undefined ? { millis: 300_000 } : options.sweep
  if (
    sweep !== 'none' &&
    !(typeof sweep === 'object' && sweep !== null && Number.isSafeInteger(sweep.millis) && sweep.millis > 0 &&
      (sweep.prune === undefined || sweep.prune === false))
  ) {
    refuse(`the sweep is ${JSON.stringify(sweep)}, which is neither 'none' nor a positive integer of millis`)
  }
  if (capacity !== 'unbounded' && !(Number.isSafeInteger(capacity) && capacity > 0)) {
    refuse(`the capacity is ${capacity}, which is no positive integer`)
  }
  return { partitions, renames, retry, passivate, capacity, drain, threshold, bound, sweep }
}

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
    const checked = yield* Effect.sync(() => checkedOptions(options, cluster))
    // The runtime's own scope, sequential whatever its caller's: a parallel scope would run the drain, the closing of
    // `running` and the release of the database at once (decision 0120).
    const scope = yield* Scope.fork(yield* Effect.scope, 'sequential')
    // A launch that dies or is interrupted after the hold closes its own scope, which gives the database back and
    // stops what the launch forked. Left to the launcher's scope, the database would stay held until that scope
    // closes, and a launch again in it would be refused (decision 0264).
    return yield* Effect.onExit(
      started(options, cluster, checked, scope),
      (exit) => Exit.isSuccess(exit) ? Effect.void : Scope.close(scope, exit),
    )
  })

/** The launch of `launchWith`, once its options are checked, in the runtime's own scope. */
const started = (
  options: Options,
  cluster: OnCluster | null,
  checked: Checked,
  scope: Scope.Closeable,
): Effect.Effect<Runtime, never, SqlClient.SqlClient> =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const { partitions, renames, retry, passivate, capacity, drain, threshold, bound, sweep } = checked
    // One runtime holds the database, before anything of this one runs, and lets it go after everything of it has
    // stopped: the scope ends what it was given last first (decision 0080).
    if (cluster === null) yield* Scope.provide(hold, scope)
    // The tables are created once the database is held, so that a launch refused never writes it (decision 0191).
    if (options.tables !== 'existing') yield* createTables
    yield* partitioned(partitions)
    // Nothing is deployed yet, so no entity is loaded while the rows move, and no reader reads (decision 0156).
    yield* renamed([...renames], cluster !== null)
    // Everything the runtime runs is forked in `running`, which closes after the drain: a scope runs its finalizers
    // in the reverse order of their adding, so the drain, added after it, runs first (decision 0119).
    const running = yield* Scope.fork(scope)
    const closing = Deferred.makeUnsafe<void>()
    yield* Scope.addFinalizer(scope, Effect.sync(() => Deferred.doneUnsafe(closing, Effect.void)))
    /** The names deployed in this process, or being deployed: each is deployed once (decision 0075). */
    const names = new Set<string>()
    const readings: Readings = { commits: new Map(), waiting: Latch.makeUnsafe(false), count: 0 }
    if (cluster !== null) {
      const { version, millis } = cluster.others
      const read = (seen: number) => Effect.catch(version, () => Effect.succeed(seen))
      // The version is read once at launch, and kept while no reading waits. So a commit of another runner after a
      // reading's page and before its wait still moves the version from the one kept, and the reading is woken. A
      // version read anew whenever a wait begins would already count that commit, and the reading would wait out
      // its time. A launch that cannot read it keeps -1, which no version is, so the first reading wakes once.
      let seen = yield* read(-1)
      yield* forkApart(
        sql,
        Effect.forever(Effect.gen(function*() {
          yield* readings.waiting.await
          const now = yield* read(seen)
          if (now !== seen) {
            seen = now
            tellAll(readings)
          }
          yield* Effect.sleep(`${millis} millis`)
        })),
        running,
      )
    }
    const probe = yield* Probe
    const p: Process = {
      sql,
      cluster,
      renames,
      running,
      closing,
      deployments: new Map(),
      made: new Set(),
      detachments: 0,
      leaving: 0,
      messages: new Map(),
      creations: new Map(),
      operators: new Map(),
      ended: Deferred.makeUnsafe<void>(),
      undeployed: new Map(),
      readings,
      resumptions: new Map(),
      locks: new Map(),
      recent: new Map(),
      probe,
      retry,
      passivate,
      capacity,
      threshold,
      bound,
      draining: false,
    }
    /** What a caller that arrives during the drain waits for: it is interrupted once the drain ends. */
    const stopped = Deferred.makeUnsafe<never>()
    /** A caller's effect, unless a planned stop is under way. */
    const admitted = <A>(effect: Effect.Effect<A>): Effect.Effect<A> =>
      Effect.suspend(() => p.draining ? Deferred.await(stopped) : effect)
    const deploy = <T extends Types, const C extends Consumers<T> = {}>(
      program: Program<T>,
      deployOptions?: Readonly<{ consumers?: C }>,
    ) =>
      outside(sql, 'deploy', Effect.gen(function*() {
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
            // The versions a runner's `sharding` recorded are what keeps an older runner from a newer version's rows,
            // and a program deployed without its record escapes both the health check and the check by the commit
            // (decision 0174).
            const recorded = cluster?.versions?.get(program.name)
            if (cluster !== null && cluster.versions !== null && recorded !== versionOf(program)) {
              const named = recorded === undefined ? 'does not name it' : `names it at version ${recorded}`
              const reason =
                `the program '${program.name}' is deployed at version ${versionOf(program)}, and the runner's sharding ${named}`
              return yield* Effect.die(new InvariantDefect({ reason }))
            }
            names.add(program.name)
            const deployed: Deployment<T> = {
              program,
              consumers,
              storage: storage(program, sql, partitions, cluster !== null),
              scope: yield* Scope.fork(running),
              loaded: new Map(),
              stopping: new Map(),
              // Nothing is known of the stored timers until the waker has read them once.
              waker: { busy: true, next: null, poke: yield* Queue.sliding<void>(1), failed: new Map() },
              waking: null,
              draining: false,
              operating: 0,
              shards: new Map(),
              run: (operation) => Effect.provideContext(operation, services) as Effect.Effect<void>,
            }
            p.made.add(deployed as unknown as Deployment<never>)
            // With a drain, the undo first drains its own deployment, as a planned stop does, so that an
            // at-most-once operation an activation started ends before the scope closes: the interruption of a
            // planned stop reaches the deploy of the main fiber before the drain begins (decision 0280). Its wait
            // is uninterruptible, as the drain's is (decision 0219). The name stays claimed until the scope closes.
            return yield* Effect.onError(restore(deploying<T, C>(deployed)), () =>
              p.deployments.has(program.name) ? Effect.void : Effect.gen(function*() {
                if (drain !== undefined) {
                  deployed.draining = true
                  yield* quiesce(deployed as unknown as Deployment<never>)
                  yield* Effect.timeoutOption(emptied([deployed as unknown as Deployment<never>], false), `${drain} millis`)
                }
                yield* Scope.close(deployed.scope, Exit.void)
                deployed.loaded.forEach((loaded) => forgetUse(p, loaded))
                p.made.delete(deployed as unknown as Deployment<never>)
                names.delete(program.name)
              }))
          })
        )
      }))

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
          // Nothing waits for the answer to `Resumed`, so its own Cluster request id is pending (decision 0169).
          // A `Resumed` saved before a rename names the receiver by its old name (decision 0176).
          const resumed = (receiver: Address, requestId: string) =>
            Effect.andThen(deployed.storage.pendSent(requestId), Effect.sync(() => wake(p, current(p, receiver))))
          const formerly = [...renames].flatMap(([from, to]) => to === program.name ? [from] : [])
          yield* Scope.provide(
            cluster.register(program, doorStep(p, deployed), passivate, resumed, formerly),
            deployed.scope,
          )
          const singletons = yield* Effect.sync(() => singletonsOf(cluster, program.name))
          for (const [shard, name] of singletons) {
            yield* Scope.provide(cluster.singleton(name, serving(p, cluster, deployed, shard)), deployed.scope)
          }
        } else {
          // No activation starts once the drain began, so that the drain waits for no at-most-once operation of an
          // entity it found unloaded: the next process activates what is left (decision 0261).
          for (const id of yield* deployed.storage.interrupted) {
            if (p.draining) break
            yield* loads(p, deployed, id)
          }
        }
        // Registered with its waker in one step: a deployment others can reach always has its timers woken. The
        // waker is forked interruptible all the same, so the scope that closes it stops it (decisions 0078, 0271).
        yield* Effect.uninterruptible(Effect.gen(function*() {
          p.deployments.set(program.name, deployed as unknown as Deployment<never>)
          const awaited = p.undeployed.get(program.name)
          p.undeployed.delete(program.name)
          if (awaited !== undefined) Deferred.doneUnsafe(awaited, Effect.void)
          deployed.waking = yield* forkApart(sql, waking(p, deployed), deployed.scope)
          // A deployment registered during the drain wakes no timer, as the drain stops the waker of the others
          // (decision 0261). A drain that began before the fork is found here, and one that begins after finds it.
          if (p.draining) yield* Fiber.interrupt(deployed.waking)
        }))
        // The sweep frees what no reader needs, at its interval, and changes no answer (decision 0245). On Cluster
        // it is a singleton, so that the runners do not contend for the same rows.
        if (sweep !== 'none') {
          if (cluster === null) yield* forkApart(sql, sweepOf(deployed, sweep), deployed.scope)
          else {
            const name = `@fgaudo/effect-tea-persistent/${program.name}/sweep`
            yield* Scope.provide(cluster.singleton(name, untransacted(sql, sweepOf(deployed, sweep))), deployed.scope)
          }
        }
        const handle: Handle<T, C> = {
          partitions,
          create: (id, given) =>
            outside(sql, 'create', argued('request of create', given, (request) =>
              texted(
                id,
                requested(
                  request.requestId,
                  admitted(faulted(
                    create(p, deployed, id, flagsOf<T>(request), {
                      _tag: 'Caller',
                      sender: senderOf<T>(request),
                      id: request.requestId,
                    }),
                  )),
                ),
              ))),
          send: (id, message, given) =>
            outside(sql, 'send', argued('request of send', given, (request) =>
              texted(id, requested(request.requestId, kept(request.keep, (keep) =>
                admitted(faulted(
                  send(p,
                    deployed,
                    id,
                    message,
                    { _tag: 'Caller', sender: senderOf<T>(request), id: request.requestId },
                    keep,
                  ),
                )))
              )))),
          read: (id) => texted(id, deployed.storage.projected(id)),
          query: (given) =>
            argued('query', given, (query) => counted({ limit: query.limit }, deployed.storage.query(query))),
          count: (given) => argued('count', given, deployed.storage.count),
          sum: (given) => argued('sum', given, deployed.storage.sum),
          countBy: (given) =>
            argued('count by', given, (asked) => counted({ limit: asked.limit }, deployed.storage.countBy(asked))),
          reindex: deployed.storage.reindex,
          published: (topic, after, limit) =>
            topical(
              program,
              topic,
              cursored(after, partitions, counted({ limit }, deployed.storage.published(topic, after, limit))),
            ),
          fetch: (topic, consumer, limit, options) => {
            const wait = options?.wait
            const read = deployed.storage.fetch(topic, consumer, limit, options?.partitions)
            return topical(
              program,
              topic,
              enlisted(deployed, topic, consumer, true, counted(
                wait === undefined ? { limit } : { limit, wait: wait.millis },
                named(
                  options?.partitions,
                  partitions,
                  wait === undefined || limit === 0
                    ? read
                    : outside(sql, 'a fetch that waits', waited(p, program.name, topic, wait.millis, read)),
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
          consume: (topic, consumer, handler, options) => {
            // Options left out, which the types do not hold, are refused as a limit left out is (decision 0141).
            const { limit, wait, partitions: given } = (options ?? {}) as typeof options
            const read = deployed.storage.fetch(topic, consumer, limit, given)
            const reading = wait === true ? waited(p, program.name, topic, undefined, read) : read
            // A reader within a transaction of the client would wait for a row on the connection a step's commit
            // waits for, and the commit that ends the wait would never come (decision 0184). Its handler runs within
            // the page's transaction, so a call of the handle there that waits for a step is refused (decision 0256).
            const reader = outside(sql, 'a reader of consume', Effect.gen(function*() {
              // Each page is read after the last one is acked: the next reading starts from the stored cursors, so a
              // page read before the ack would be the same rows again (decision 0184).
              while (!Deferred.isDoneUnsafe(closing)) {
                const page = yield* reading
                if (page.length === 0) return
                yield* transaction(sql, Effect.andThen(handler(page), deployed.storage.ack(topic, consumer, page)))
              }
            }))
            return topical(
              program,
              topic,
              enlisted(
                deployed,
                topic,
                consumer,
                true,
                counted(
                  { limit },
                  named(
                    given,
                    partitions,
                    Effect.suspend(() => {
                      const reason = limit === 0
                        ? 'the limit of consume is 0, which is no positive integer'
                        : wait !== undefined && wait !== true
                        ? 'the wait of consume is neither true nor left out'
                        : undefined
                      return reason === undefined ? reader : Effect.die(new InvariantDefect({ reason }))
                    }),
                  ),
                ),
              ),
            )
          },
          prune: deployed.storage.prune,
          consumers: Effect.map(deployed.storage.consumers, (stored) =>
            stored.map((consumer): Consumer => ({
              ...consumer,
              declared: deployed.consumers.get(consumer.topic)?.has(consumer.consumer) === true,
            }))),
          forget: (topic, consumer) =>
            topical(program, topic, enlisted(deployed, topic, consumer, false, deployed.storage.forget(topic, consumer))),
          expire: Effect.flatMap(DateTime.now, (now) => deployed.storage.expire(DateTime.toEpochMillis(now))),
          suspended: deployed.storage.suspended,
          inspect: (id) =>
            texted(
              id,
              Effect.map(deployed.storage.inspect(id), (found): Inspected<T> | null =>
                found === null ? null : {
                  id,
                  state: found.stored.state,
                  mailbox: found.stored.mailbox.map((envelope) =>
                    envelope._tag === 'Inbound'
                      ? { _tag: 'Inbound', request: envelope.request, message: envelope.message }
                      : envelope
                  ),
                  work: Object.values(found.stored.keys)
                    .map(({ key, incarnation, work }) => ({ key, incarnation, work }))
                    .sort((one, other) => one.incarnation - other.incarnation),
                  suspension: found.suspension,
                }),
            ),
          resume: (id) => outside(sql, 'resume', texted(id, admitted(operate(p, deployed, id, { _tag: 'Resume' })))),
          discard: (id) =>
            outside(sql, 'discard', texted(id, admitted(operate(p, deployed, id, { _tag: 'Discard' })))),
        }
        return handle
      })

    const quiet = (now: number) => {
      if (p.detachments > 0 || p.leaving > 0) return false
      for (const deployed of p.deployments.values()) {
        const { waker } = deployed
        // The waker has a reading to make, so nothing is known of the stored timers.
        if (waker.busy) return false
        // A crashed entity's stop is work of the process: the entity waits for it to be loaded (decision 0274).
        if (deployed.stopping.size > 0) return false
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
      const next = p.ended
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
    const drained = (deployments: Iterable<Deployment<never>>, detached: boolean) => {
      if (detached && p.detachments > 0) return false
      for (const deployed of deployments) {
        for (const loaded of deployed.loaded.values()) {
          if (loaded.applying || loaded.pending > 0 || loaded.operations.size > 0) return false
        }
      }
      return true
    }

    // The signal is taken before the look, as `settled` takes it: whatever ends after it completes it. The undo of a
    // deploy waits for its deployment alone, and not for what runs detached in the rest of the process (decision 0280).
    const emptied = (deployments: Iterable<Deployment<never>>, detached: boolean): Effect.Effect<void> =>
      Effect.suspend(() => {
        const next = p.ended
        return drained(deployments, detached)
          ? Effect.void
          : Effect.flatMap(Deferred.await(next), () => emptied(deployments, detached))
      })

    /** What a planned stop stops at once of a deployment: its waker, its timers and its operations that run again. */
    const quiesce = (deployed: Deployment<never>) =>
      Effect.gen(function*() {
        if (deployed.waking !== null) yield* Fiber.interrupt(deployed.waking)
        for (const loaded of [...deployed.loaded.values()]) {
          for (const id of [...loaded.timers.keys()]) yield* stop(loaded.timers, id)
          for (const id of [...loaded.rerun]) yield* stop(loaded.operations, id)
        }
      })

    // A planned stop, added after `running` and so run before it closes (decision 0119). Its wait stays as
    // uninterruptible as the finalizer: a scope closed by an interrupted fiber, as `runMain` closes it on a signal,
    // keeps the interruption pending, and an interruptible wait would end at once. The timeout ends the wait alone,
    // since a race forks its sides interruptible and resumes on the first to end (decision 0219).
    if (drain !== undefined) {
      yield* Scope.addFinalizer(scope, Effect.gen(function*() {
        p.draining = true
        for (const deployed of [...p.made]) yield* quiesce(deployed)
        yield* Effect.timeoutOption(emptied(p.made, true), `${drain} millis`)
        Deferred.doneUnsafe(stopped, Effect.interrupt)
      }))
    }

    return { deploy, settled }
  })
