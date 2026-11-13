/**
 * The tests of a contract: one set of requests runs alike on each way the library runs, and each answer, whether a
 * value or a refusal, is the same on each. The ways are SQLite and PostgreSQL on one process (decision 0157), and
 * Cluster with two runners on one SQLite file. fast-check generates what callers give: ids, request ids, senders,
 * flags, messages and the criteria of a reading, with text no database holds and numbers no index compares among
 * them.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { afterAll, beforeAll, expect, test } from 'bun:test'
import {
  RunnerAddress,
  RunnerHealth,
  Runners,
  Sharding,
  ShardingConfig,
  ShardId,
  SqlMessageStorage,
  SqlRunnerStorage,
} from 'effect/cluster'
import * as Cause from 'effect/Cause'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import { Digest } from 'effect/crypto'
import * as Deferred from 'effect/Deferred'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schedule from 'effect/Schedule'
import * as Schema from 'effect/Schema'
import * as Scope from 'effect/Scope'
import { SqlClient, Statement } from 'effect/sql'
import fc from 'fast-check'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch as launchOnCluster, sharding } from './cluster.ts'
import { launch } from './index.ts'
import {
  create as createFrom,
  defect,
  type Entities,
  noWork,
  operation,
  program,
  type Receiver,
  send,
  timer,
} from './index.program.ts'
import { idFault, type TypesOf } from './program.ts'
import type { Handle, Inspected, Keep } from './runtime.ts'
import type { Comparison, Dialect } from './storage.ts'
import { client, database, pool, server } from './storage.test_databases.ts'

const fields = {
  label: Schema.String,
  amount: Schema.Number,
  flag: Schema.Boolean,
  note: Schema.NullOr(Schema.String),
}

const flagged = Schema.Struct({ ...fields, run: Schema.String })

/** The work of an item: an `Add` to another item under way, a creation of another item under way, and a timer due. */
const pending = {
  forward: Schema.NullOr(Schema.Struct({ to: Schema.String, n: Schema.Number })),
  spawn: Schema.NullOr(Schema.Struct({ to: Schema.String, flags: flagged })),
  ticking: Schema.Boolean,
}
const Forward = Schema.TaggedStruct('Forward', { to: Schema.String, n: Schema.Number })
const Spawn = Schema.TaggedStruct('Spawn', { to: Schema.String, flags: flagged })

/**
 * An item's operation: an `Add` of `n` sent to the item `to`, whose reply's tag the item keeps in its note. It sends
 * under one name, so that a run again after a crash is answered the stored reply.
 */
const forward = ({ to, n }: typeof Forward.Type): Effect.Effect<Forwarded, never, Entities> =>
  Effect.map(
    send(item as Receiver<Item>, to, { _tag: 'Add', label: 'forwarded', n }, 'forward'),
    (reply) => ({ _tag: 'Forwarded', reply: reply._tag }),
  )
type Forwarded = Readonly<{ _tag: 'Forwarded'; reply: string }>

/**
 * An item's operation: a creation of the item `to` with `flags`, whose answer's tag the item keeps in its note. Flags
 * whose projection holds text no database holds make the program die on the creation, which is the operation's
 * defect, and suspends the item that spawns (decision 0291).
 */
const spawn = ({ to, flags }: typeof Spawn.Type): Effect.Effect<Spawned, never, Entities> =>
  Effect.map(
    createFrom(item as Receiver<Item>, to, 'spawn', flags),
    (created) => ({ _tag: 'Spawned', reply: created._tag }),
  )
type Spawned = Readonly<{ _tag: 'Spawned'; reply: string }>

/**
 * The program every backend runs. Its index `run` holds the run of the property that made the entity, and every
 * reading names it, so that the runs that share one Cluster read only their own entities. `Forward` starts an
 * operation that sends to another item, and `Tick` a timer due at once, which adds 1 when it fires.
 */
const item = program({
  state: Schema.Struct({ ...fields, run: Schema.String, ...pending }),
  flags: flagged,
  sender: Schema.String,
  inbound: Schema.Union([
    Schema.TaggedStruct('Set', fields),
    Schema.TaggedStruct('Boom', { note: Schema.String }),
    Schema.TaggedStruct('Add', { label: Schema.String, n: Schema.Number }),
    Forward,
    Spawn,
    Schema.TaggedStruct('Tick', {}),
  ]),
  internal: Schema.Union([
    Schema.TaggedStruct('Forwarded', { reply: Schema.String }),
    Schema.TaggedStruct('Spawned', { reply: Schema.String }),
    Schema.TaggedStruct('Ticked', {}),
  ]),
  operation: Schema.Union([Forward, Spawn]),
  projection: Schema.Struct({ ...fields, run: Schema.String }),
})({
  name: 'Item',
  keys: ['forward', 'spawn', 'tick'],
  init: (flags) => ({ ...flags, forward: null, spawn: null, ticking: false }),
  update: (message) => (state) => {
    switch (message._tag) {
      case 'Boom':
        return defect(`cannot handle ${message.note}`)
      case 'Add':
        return { ...state, label: message.label, amount: state.amount + message.n }
      // A forward under way is replaced, and its operation's reply then lands on the new one.
      case 'Forward':
        return { ...state, forward: { to: message.to, n: message.n } }
      case 'Forwarded':
        return { ...state, forward: null, note: message.reply }
      case 'Spawn':
        return { ...state, spawn: { to: message.to, flags: message.flags } }
      case 'Spawned':
        return { ...state, spawn: null, note: message.reply }
      case 'Tick':
        return { ...state, ticking: true }
      case 'Ticked':
        return { ...state, ticking: false, amount: state.amount + 1 }
      case 'Set': {
        const { _tag, ...set } = message
        return { ...state, ...set }
      }
    }
  },
  work: (state) => ({
    ...(state.forward === null ? noWork : { forward: Forward.make(state.forward) }),
    ...(state.spawn === null ? noWork : { spawn: Spawn.make(state.spawn) }),
    ...(state.ticking ? { tick: timer(DateTime.makeUnsafe(0), { _tag: 'Ticked' as const }) } : noWork),
  }),
  operations: { Forward: operation.atLeastOnce(forward), Spawn: operation.atLeastOnce(spawn) },
  project: ({ forward: _, spawn: __, ticking: ___, ...projected }) => projected,
  // Two topics, so that a step that changes both writes two rows of one publication, which two prunes may drop at
  // once on a pool (decision 0286).
  topics: {
    label: (p) => p.label,
    amount: (p) => p.amount,
  },
  indexes: {
    label: (p) => p.label,
    amount: (p) => p.amount,
    flag: (p) => p.flag,
    note: (p) => p.note,
    run: (p) => p.run,
  },
})

type Item = TypesOf<typeof item>

type Index = 'label' | 'amount' | 'flag' | 'note'

/**
 * Text that is mostly plain, so that entities are made and found, and else U+0000, a lone surrogate or a character
 * of any plane, which a database may hold otherwise or not at all.
 */
const text = fc.oneof(
  { arbitrary: fc.constantFrom('', 'a', 'b', 'A', 'ab', 'é', '😀', ' ', 'NULL', '10', '9'), weight: 4 },
  { arbitrary: fc.string({ unit: 'binary', maxLength: 6 }), weight: 1 },
  { arbitrary: fc.constantFrom('\u0000', '\ud800', '\udc00', 'a\u0000b', '￿'), weight: 1 },
)
/** Numbers that are mostly small integers, so that they tie, and else any double, the limits of `2^53` among them. */
const number = fc.oneof(
  { arbitrary: fc.integer({ min: -3, max: 3 }), weight: 4 },
  { arbitrary: fc.double(), weight: 1 },
  {
    arbitrary: fc.constantFrom(-0, 0.1, 2 ** 53, 2 ** 53 + 2, -(2 ** 53), Number.MAX_VALUE, Number.MIN_VALUE),
    weight: 1,
  },
)
const scalar = fc.oneof(text, number, fc.boolean(), fc.constant(null))
const values = fc.record({ label: text, amount: number, flag: fc.boolean(), note: fc.option(text, { nil: null }) })
const index = fc.constantFrom<Index>('label', 'amount', 'flag', 'note')
const comparison = fc.constantFrom<Comparison>('=', '<>', '<', '<=', '>', '>=')
const criteria = fc.array(fc.record({ index, is: comparison, value: scalar }), { maxLength: 2 })

/** A few ids and request ids, drawn again and again, so that calls meet the same entity and the same request. */
const names = fc.uniqueArray(text, { minLength: 1, maxLength: 5 })

const calls = (ids: ReadonlyArray<string>, requests: ReadonlyArray<string>) => {
  const id = fc.constantFrom(...ids)
  const request = fc.record({ requestId: fc.constantFrom(...requests), sender: text })
  const create = fc.record({ _tag: fc.constant('Create' as const), id, flags: values, request })
  const call = fc.oneof(
    create,
    fc.record({ _tag: fc.constant('Set' as const), id, set: values, request }),
    fc.record({ _tag: fc.constant('Boom' as const), id, note: text, request }),
    fc.record({ _tag: fc.constant('Forward' as const), id, to: id, n: fc.integer({ min: 1, max: 3 }), request }),
    fc.record({ _tag: fc.constant('Spawn' as const), id, to: id, flags: values, request }),
    fc.record({ _tag: fc.constant('Tick' as const), id, request }),
    fc.record({ _tag: fc.constant('Read' as const), id }),
    fc.record({
      _tag: fc.constant('Query' as const),
      where: criteria,
      order: fc.option(fc.record({ index, descending: fc.boolean() }), { nil: undefined }),
      limit: fc.integer({ min: 0, max: 6 }),
    }),
    fc.record({ _tag: fc.constant('Count' as const), where: criteria }),
    fc.record({ _tag: fc.constant('Sum' as const), index, where: criteria }),
    fc.record({ _tag: fc.constant('CountBy' as const), index, where: criteria, limit: fc.integer({ min: 0, max: 6 }) }),
    fc.record({ _tag: fc.constant('Suspended' as const) }),
    fc.record({ _tag: fc.constantFrom('Inspect' as const, 'Resume' as const, 'Discard' as const), id }),
    fc.record({ _tag: fc.constantFrom('Expire' as const, 'Prune' as const, 'Reindex' as const) }),
  )
  // A message that suspends its entity, then an operator's call on it, so that the operator meets suspensions often.
  const suspending = fc.tuple(id, text, request, fc.constantFrom('Inspect' as const, 'Resume' as const, 'Discard' as const))
    .map(([id, note, request, operator]) => [
      { _tag: 'Boom' as const, id, note, request },
      { _tag: operator, id },
    ])
  // A forward to an entity a message suspends, then an operator's call on the receiver, so that an operation meets a
  // suspended receiver and waits for its resumption.
  const operator = fc.constantFrom('Inspect' as const, 'Resume' as const, 'Discard' as const)
  const waitingFor = fc.tuple(id, id, text, request, request, operator)
    .map(([id, to, note, boom, request, operator]) => [
      { _tag: 'Boom' as const, id: to, note, request: boom },
      { _tag: 'Forward' as const, id, to, n: 1, request },
      { _tag: 'Inspect' as const, id: to },
      { _tag: operator, id: to },
    ])
  // A spawn whose creation the program dies on, its label being text no database holds, then an operator's call on
  // the item that spawns, which the creation's defect suspends (decision 0291).
  const spawning = fc.tuple(id, id, values, fc.constantFrom('\u0000', 'a\u0000b', '\ud800'), request, operator)
    .map(([id, to, flags, label, request, operator]) => [
      { _tag: 'Spawn' as const, id, to, flags: { ...flags, label }, request },
      { _tag: operator, id },
    ])
  const some = fc.oneof(
    { arbitrary: call.map((one) => [one]), weight: 4 },
    { arbitrary: suspending, weight: 1 },
    { arbitrary: waitingFor, weight: 1 },
    { arbitrary: spawning, weight: 1 },
  )
  // The entities are made first, so that the readings after them have rows to compare.
  return fc.tuple(fc.array(create, { minLength: 1, maxLength: 6 }), fc.array(some, { minLength: 1, maxLength: 12 }))
    .map(([made, rest]) => [...made, ...rest.flat()])
}

const scenario = fc.tuple(names, names).chain(([ids, requests]) => calls(ids, requests))

type Call = typeof scenario extends fc.Arbitrary<ReadonlyArray<infer C>> ? C : never

/** An answer as every backend must give it: a value, or how the call was refused, without the words of its defect. */
const outcome = (exit: Exit.Exit<unknown, unknown>): unknown =>
  Exit.isSuccess(exit)
    ? { value: exit.value }
    : { refused: Cause.hasDies(exit.cause) ? 'defect' : Cause.hasFails(exit.cause) ? 'failure' : 'interrupted' }

/**
 * A total as a dialect gives it, with the total of its magnitudes. PostgreSQL adds exactly and SQLite with a
 * compensated sum, so two totals may differ by a rounding of the total of magnitudes (decision 0209).
 */
class Total {
  constructor(readonly value: number, readonly magnitudes: number) {}
}

/** Whether the answers of two backends are alike: equal, and two totals within a few units of their last place. */
const alike = (left: ReadonlyArray<unknown>, right: ReadonlyArray<unknown>) => {
  const settled = (answers: ReadonlyArray<unknown>, other: ReadonlyArray<unknown>) =>
    answers.map((answer, at) => {
      const theirs = other[at]
      if (!(answer instanceof Total)) return answer
      const bound = 8 * Number.EPSILON * Math.max(answer.magnitudes, theirs instanceof Total ? theirs.magnitudes : 0)
      return theirs instanceof Total && Math.abs(answer.value - theirs.value) <= bound
        ? 'a total within the bound'
        : { total: answer.value, magnitudes: answer.magnitudes }
    })
  expect(settled(left, right)).toEqual(settled(right, left))
}

/**
 * Runs `calls` under the run `run`, each call of a caller through `handles` in turn, and gives each answer. Every id
 * but the empty one and every request id is prefixed with the run, and every reading names it, so that each run
 * reads only its own entities. A creation the program dies on is the caller's defect on every backend, as one process
 * gives it and Cluster's door answers it (decision 0291).
 */
const answer = (
  handles: ReadonlyArray<Handle<Item>>,
  run: string,
  calls: ReadonlyArray<Call>,
) =>
  Effect.gen(function*() {
    const own = (id: string) => id === '' ? id : `${run}/${id}`
    const within = (where: ReadonlyArray<Readonly<{ index: Index; is: Comparison; value: unknown }>>) =>
      [{ index: 'run' as const, is: '=' as const, value: run }, ...where] as never
    const answers: Array<unknown> = []
    const ids = [...new Set(calls.flatMap((call) => [
      ...('id' in call ? [own(call.id)] : []),
      ...('to' in call ? [own(call.to)] : []),
    ]))]
    for (const [at, call] of calls.entries()) {
      const items = handles[at % handles.length]!
      if (call._tag === 'Sum') {
        const exit = yield* Effect.exit(items.sum({ index: call.index, where: within(call.where) }))
        if (Exit.isFailure(exit)) {
          answers.push(outcome(exit))
          continue
        }
        // The rows the sum added, read as a query finds them, give the total of their magnitudes.
        const found = yield* items.query({ where: within(call.where), limit: 1_000 })
        const magnitudes = found.reduce((total, { indexes }) => {
          const value = (indexes as Record<string, unknown>)[call.index]
          return typeof value === 'number' ? total + Math.abs(value) : total
        }, 0)
        answers.push(new Total(exit.value, magnitudes))
        continue
      }
      const request = 'request' in call
        ? { requestId: own(call.request.requestId), sender: call.request.sender }
        : undefined
      const reply = call._tag === 'Create'
        ? items.create(own(call.id), { flags: { ...call.flags, run }, ...request! })
        : call._tag === 'Set'
        ? items.send(own(call.id), { _tag: 'Set', ...call.set }, { ...request!, keep: 'forever' })
        : call._tag === 'Boom'
        ? items.send(own(call.id), { _tag: 'Boom', note: call.note }, { ...request!, keep: 'forever' })
        : call._tag === 'Forward'
        ? items.send(own(call.id), { _tag: 'Forward', to: own(call.to), n: call.n }, { ...request!, keep: 'forever' })
        : call._tag === 'Spawn'
        ? items.send(
          own(call.id),
          { _tag: 'Spawn', to: own(call.to), flags: { ...call.flags, run } },
          { ...request!, keep: 'forever' },
        )
        : call._tag === 'Tick'
        ? items.send(own(call.id), { _tag: 'Tick' }, { ...request!, keep: 'forever' })
        : call._tag === 'Read'
        ? items.read(own(call.id))
        : call._tag === 'Query'
        ? items.query({
          where: within(call.where),
          limit: call.limit,
          ...(call.order === undefined ? {} : { order: call.order }),
        })
        : call._tag === 'Count'
        ? items.count({ where: within(call.where) })
        : call._tag === 'CountBy'
        ? items.countBy({ index: call.index, where: within(call.where), limit: call.limit })
        : call._tag === 'Inspect'
        ? Effect.map(items.inspect(own(call.id)), settledOf)
        : call._tag === 'Resume' || call._tag === 'Discard'
        ? operated(items, call._tag, own(call.id))
        // What an operator's sweep counts covers every run that shares a backend, so only its success is compared.
        : call._tag === 'Expire'
        ? Effect.as(items.expire, 'done')
        : call._tag === 'Prune'
        ? Effect.as(items.prune, 'done')
        : call._tag === 'Reindex'
        ? Effect.as(items.reindex, 'done')
        : Effect.map(
          items.suspended,
          (suspended) => suspended.map(({ id }) => id).filter((id) => id.startsWith(`${run}/`)).sort(),
        )
      // A call that waits for ever fails the test rather than holding it.
      const exit = yield* Effect.exit((reply as Effect.Effect<unknown, unknown>).pipe(
        Effect.timeoutOrElse({ duration: '5 seconds', orElse: () => Effect.succeed(unanswered) }),
      ))
      answers.push(outcome(exit))
      if (writes.has(call._tag)) yield* quiet(items, ids)
    }
    return answers
  })

/**
 * What an operator reads of an entity, as every backend must give it. `since` is a time of the runtime's clock, and
 * `cause` a defect as it was rendered, whose words the contract does not compare: a cause is kept as whether it is
 * the defect of a message `Boom`.
 */
const settledOf = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(settledOf)
    : value !== null && typeof value === 'object' && !DateTime.isDateTime(value)
    ? Object.fromEntries(
      Object.entries(value).map(([key, field]) =>
        key === 'since'
          ? [key, 'a time']
          : key === 'cause' && typeof field === 'string'
          ? [key, field.includes('cannot handle') ? 'a Boom' : 'another cause']
          : [key, settledOf(field)]
      ),
    )
    : value

/**
 * The calls after which an entity may go on stepping: those that send it a message, create it or take it out of a
 * suspension.
 */
const writes = new Set<string>(['Create', 'Set', 'Boom', 'Forward', 'Spawn', 'Tick', 'Resume', 'Discard'])

/**
 * Waits until every entity of `ids` is quiet. A missing entity is quiet. An entity that is not suspended is quiet
 * with no message in its mailbox, and a suspended one whatever its mailbox holds. Its work is quiet where each forward
 * waits for the resumption of its receiver, which lists the wait, or has its completion queued, or is the operation
 * the entity died in. A timer is quiet only in a suspended entity, whose timers are disarmed. The operations of a
 * suspended entity go on, so a forward of it sent its `Add` once its receiver was discarded. A call answers before its entity handles
 * what follows from it: the message an operator's `resume` or `discard` takes the entity past, an operation's
 * completion, a timer's firing. So a call after it would meet the entities at a point each backend reaches in its
 * own time. On Cluster a message sent after a `resume` was queued behind the step and answered `Suspended` when the
 * entity suspended again, where SQLite had suspended it before the message came. A wait past its time is left to
 * the next call, which then differs.
 */
const quiet = (items: Handle<Item>, ids: ReadonlyArray<string>) => {
  // A forward to an id the library refuses dies, and suspends its entity: it is waited for until it does. A forward
  // to a suspended receiver stores its wait after the step that started it, so it is waited for until it is listed.
  const waits = (to: string, of: string) =>
    idFault(to) !== undefined
      ? Effect.succeed(false)
      : Effect.map(
        items.inspect(to),
        (inspected) => inspected?.suspension?.waiting.some(({ entity }) => entity.id === of) === true,
      )
  const still = (id: string) =>
    Effect.gen(function*() {
      const inspected = yield* items.inspect(id)
      if (inspected === null) return true
      const { suspension, mailbox } = inspected
      if (suspension === null && mailbox.length > 0) return false
      for (const { key, work } of inspected.work) {
        if (!('_tag' in work)) {
          if (suspension === null) return false
          continue
        }
        const completed = mailbox.some((queued) => queued._tag === 'Internal' && queued.key.name === key.name)
        const died = suspension?.on._tag === 'Operation' && suspension.on.key.name === key.name
        if (!completed && !died && !(yield* waits(work.to, id))) return false
      }
      return true
    })
  // An id the library refuses holds no entity, and `inspect` dies on it.
  const held = ids.filter((id) => idFault(id) === undefined)
  return Effect.repeat(Effect.orDie(Effect.forEach(held, still)), {
    schedule: Schedule.spaced('10 millis'),
    until: (all) => all.every(Boolean),
  }).pipe(Effect.timeoutOrElse({ duration: '5 seconds', orElse: () => Effect.void }), Effect.ignore)
}

/**
 * Whether an operator's `resume` or `discard` of the entity `inspected` races the senders that wait for it. The step
 * that takes the entity out of its suspension wakes them, and the entity may die again on the message it is resumed
 * past, or on the next one a discard leaves in its mailbox. A woken sender's message then lands in the mailbox before
 * the entity dies, or is answered `Suspended` after, and the sender waits again. Both are answers the design allows,
 * and the order is the backend's own, so the test does not send such a call, on any backend. It reads the
 * suspension before, at a point `quiet` made every backend reach.
 */
const races = (operator: 'Resume' | 'Discard', inspected: Inspected<Item> | null) =>
  inspected?.suspension != null && inspected.suspension.waiting.length > 0 &&
  (operator === 'Resume' || inspected.mailbox.length > 1)

/** An operator's `resume` or `discard` of `id`, unless it `races`. */
const operated = (items: Handle<Item>, operator: 'Resume' | 'Discard', id: string) =>
  Effect.flatMap(items.inspect(id), (inspected) =>
    races(operator, inspected)
      ? Effect.succeed(racing)
      : Effect.map(operator === 'Resume' ? items.resume(id) : items.discard(id), settledOf))

/** What a call `races` holds back is answered. */
const racing = "an operator's call that races the senders waiting for its entity"

/** What a call is answered that has no answer within its time. */
const unanswered = 'no answer within 5 s'

/** Runs `calls` on a new database of `dialect`, on one process. */
const onDialect = (dialect: Dialect, run: string, calls: ReadonlyArray<Call>) =>
  Effect.runPromise(
    Effect.scoped(Effect.gen(function*() {
      const items = yield* (yield* launch()).deploy(item)
      return yield* answer([items], run, calls)
    })).pipe(Effect.provide(client(dialect)), Effect.orDie),
  )

const shardsPerGroup = 12
const shards = Array.from({ length: shardsPerGroup }, (_, i) => ShardId.make('default', i + 1))

/**
 * Two runners of the runtime on one SQLite file, each with a connection of its own, as runners of two processes
 * have. They are started once for the file, since a start waits for the shards, and the runs share them.
 */
const cluster = { directory: '', scope: undefined as Scope.Closeable | undefined, handles: [] as Array<Handle<Item>> }

const runner = (file: string, port: number) =>
  Effect.gen(function*() {
    const context = yield* Layer.build(
      sharding([item]).pipe(
        Layer.provideMerge(Runners.layerNoop),
        Layer.provideMerge(SqlMessageStorage.layer),
        Layer.provide([Layer.orDie(SqlRunnerStorage.layer), RunnerHealth.layerNoop]),
        Layer.provideMerge(ShardingConfig.layer({
          runnerAddress: Option.some(RunnerAddress.make('localhost', port)),
          shardsPerGroup,
          refreshAssignmentsInterval: Duration.millis(50),
          runnerHealthCheckInterval: Duration.millis(50),
          shardLockRefreshInterval: Duration.millis(100),
          // SQLite's `CURRENT_TIMESTAMP` counts whole seconds, and a lease of 1 s drops a runner that has just beaten.
          shardLockExpiration: Duration.seconds(3),
          entityMessagePollInterval: Duration.millis(10),
          entityReplyPollInterval: Duration.millis(10),
        })),
        Layer.provideMerge(SqliteClient.layer({ filename: file })),
        Layer.provide(Digest.layerWebCrypto),
      ),
    ).pipe(Effect.orDie)
    const runtime = yield* Effect.provide(launchOnCluster({ sweep: 'none' }), context)
    const handle = yield* Effect.provide(runtime.deploy(item), context)
    const held = context.mapUnsafe.get(Sharding.Sharding.key) as Sharding.Sharding['Service']
    return { handle, held: () => shards.filter((shard) => held.hasShardId(shard)).length }
  })

beforeAll(async () => {
  cluster.directory = mkdtempSync(join(tmpdir(), 'effect-tea-persistent-test-'))
  const scope = cluster.scope = Effect.runSync(Scope.make())
  const file = join(cluster.directory, 'store.db')
  const runners = await Effect.runPromise(Scope.provide(
    Effect.gen(function*() {
      const first = yield* runner(file, 1)
      const second = yield* runner(file, 2)
      // Each runner holds some shards, so that a call through either meets entities of the other.
      yield* Effect.repeat(Effect.sync(() => [first.held(), second.held()]), {
        schedule: Schedule.spaced('25 millis'),
        until: ([a, b]) => a! > 0 && b! > 0 && a! + b! === shardsPerGroup,
      }).pipe(Effect.timeout('30 seconds'), Effect.orDie)
      return [first, second]
    }),
    scope,
  ))
  cluster.handles = runners.map(({ handle }) => handle)
}, 60_000)

afterAll(async () => {
  if (cluster.scope !== undefined) await Effect.runPromise(Scope.close(cluster.scope, Exit.void))
  rmSync(cluster.directory, { recursive: true, force: true })
})

let runs = 0

test('every backend answers every call alike', () =>
  fc.assert(
    fc.asyncProperty(scenario, async (generated) => {
      const run = `r${runs++}`
      const sqlite = await onDialect('sqlite', run, generated)
      alike(await onDialect('pg', run, generated), sqlite)
      alike(await Effect.runPromise(answer(cluster.handles, run, generated)), sqlite)
    }),
    // `bun test` runs three within its budget of two seconds, and a release 300 (decision 0250).
    { numRuns: Bun.env['SCHEDULES'] === 'all' ? 300 : 3 },
  ), 1_200_000)

// SQLite adds doubles, and its partial total may round up past the largest double where the exact total, which
// PostgreSQL adds, stays under it. One ulp below the largest double, and two of 0.6 of an ulp: the exact total is 0.2
// of an ulp over it, which reads back as the largest double. Both dialects refuse it (decision 0277).
test('a sum whose exact total of magnitudes reads back as the largest double is answered alike on both dialects', async () => {
  const ulp = 2 ** 971
  const amounts = [Number.MAX_VALUE - ulp, 0.6 * ulp, 0.6 * ulp]
  const summed = (dialect: Dialect) =>
    Effect.runPromise(
      Effect.scoped(Effect.gen(function*() {
        const items = yield* (yield* launch()).deploy(item)
        for (const [at, amount] of amounts.entries()) {
          const flags = { label: `l${at}`, amount, flag: false, note: null, run: 'r' }
          yield* items.create(`i${at}`, { flags, requestId: `r${at}`, sender: 's' })
        }
        return outcome(yield* Effect.exit(items.sum({ index: 'amount' })))
      })).pipe(Effect.provide(client(dialect)), Effect.orDie),
    )
  const [pg, sqlite] = [await summed('pg'), await summed('sqlite')]
  expect({ pg, sqlite }).toEqual({ pg, sqlite: pg })
})

/**
 * Two calls at once on a pool of PostgreSQL, held at their statements: family D of `docs/bugs.md`, rules that hold
 * only of one transaction at a time. On SQLite one transaction writes at a time, and on a pool two run at once, each
 * reading its own snapshot (decision 0222). A connection of its own holds a lock of one of the library's tables, so
 * that each call that reaches a statement of that table waits there, and both go on at once when the lock is let go.
 * The answers, and the readings after, must be those of one of the two orders the calls run in one at a time, as
 * SQLite runs them. It runs only on a server, which the job `postgres` of the CI gives.
 */
const keep = fc.constantFrom<Keep>('forever', { millis: 0 }, { millis: 60_000 })
/**
 * How long a reply of `before` drawn `brief` is kept, and how long a history whose `before` holds one waits before its
 * pair, so that the reply is past its time when the pair runs and a retry of the pair applies its message again. The
 * calls of `before` run within the time on the pool and on SQLite, so that no reply of theirs passes its time
 * between two of them on one database alone: the margin is the time kept over the time `before` takes.
 */
const brief = { millis: 500 } as const
const briefly = 600
const label = fc.constantFrom('x', 'y', 'z')
const own = fc.constantFrom('a', 'b', 'c')
const setFields = {
  _tag: fc.constant('Set' as const),
  id: own,
  label,
  keep,
  requestId: fc.constantFrom('s1', 's2', 's3'),
}
const set = fc.record(setFields)
const create = fc.record({ _tag: fc.constant('Create' as const), id: own, requestId: fc.constantFrom('c1', 'c2') })
/**
 * The consumers of the pool's deploys: one of each topic of `item`, stored from the first deploy. An ack moves the
 * cursors of one consumer through the rows of the run's entities, so that two prunes see the log otherwise.
 */
const declared = { consumers: { label: ['reader'], amount: ['reader'] } } as const
type Declared = typeof declared.consumers
const ackFields = {
  _tag: fc.constant('Ack' as const),
  topic: fc.constantFrom('label' as const, 'amount' as const),
  of: fc.constantFrom('a', 'b', 'all'),
}
const ack = fc.record({ ...ackFields, prune: fc.boolean() })
const paired: fc.Arbitrary<Paired> = fc.oneof(
  set,
  create,
  fc.constant({ _tag: 'Expire' as const }),
  fc.constant({ _tag: 'Reindex' as const }),
  fc.constant({ _tag: 'Prune' as const }),
  ack,
)
type Paired =
  | Readonly<{ _tag: 'Set'; id: string; label: string; keep: Keep; requestId: string }>
  | Readonly<{ _tag: 'Create'; id: string; requestId: string }>
  | Readonly<{ _tag: 'Expire' }>
  | Readonly<{ _tag: 'Reindex' }>
  | Readonly<{ _tag: 'Prune' }>
  | Ack
/**
 * An ack of the consumer of `topic` through the rows of the run's entity `of`, or of both entities, and then a prune
 * where `prune` holds, so that a prune of the pair may see the log after an ack the other did not see.
 */
type Ack = Readonly<{ _tag: 'Ack'; topic: 'label' | 'amount'; of: string; prune: boolean }>
/** A call of `before`: a message whose reply may be kept `brief`ly, an ack, or a prune. */
type Before =
  | Readonly<{ _tag: 'Set'; id: string; label: string; keep: Keep; requestId: string }>
  | Ack
  | Readonly<{ _tag: 'Prune' }>
const before: fc.Arbitrary<Before> = fc.oneof(
  { arbitrary: fc.record({ ...setFields, keep: fc.oneof(keep, fc.constant<Keep>(brief)) }), weight: 4 },
  { arbitrary: fc.record({ ...ackFields, prune: fc.constant(false) }), weight: 1 },
  { arbitrary: fc.constant({ _tag: 'Prune' as const }), weight: 1 },
)
/** Histories of `pairs`, after up to four calls one at a time: messages, acks and prunes. */
const heldOf = (pairs: fc.Arbitrary<readonly [Paired, Paired]>) =>
  fc.record({
    before: fc.array(before, { maxLength: 4 }),
    pair: pairs,
    // Which of the library's tables is locked, by its place among them in the order of their names. A case pinned
    // names the table, or the reply whose row alone is locked, by its entity and its request.
    gate: fc.nat() as fc.Arbitrary<Gate>,
  })
type Gate = number | string | Readonly<{ reply: string; of: string }>
const held = heldOf(fc.tuple(paired, paired))
type Held = typeof held extends fc.Arbitrary<infer H> ? H : never

/**
 * Runs `call` of the run `run` on `items`, and gives its answer: `done` for an operator's call that succeeds. A `Set`
 * of the pair sends `Add`, which adds to `amount`, so that a message applied twice shows in the readings.
 */
const pairedOn = (items: Handle<Item, Declared>, run: string, call: Paired | Before): Effect.Effect<unknown> => {
  const id = (name: string) => `${run}/${name}`
  const answered = (effect: Effect.Effect<unknown, unknown>, done = false) =>
    Effect.map(
      Effect.exit(effect.pipe(Effect.timeoutOrElse({ duration: '5 seconds', orElse: () => Effect.succeed(unanswered) }))),
      (exit) => done && Exit.isSuccess(exit) && exit.value !== unanswered ? 'done' : outcome(exit),
    )
  switch (call._tag) {
    case 'Set':
      return answered(items.send(
        id(call.id),
        { _tag: 'Add', label: call.label, n: 1 },
        { requestId: id(call.requestId), sender: 's', keep: call.keep },
      ))
    case 'Create':
      return answered(items.create(id(call.id), {
        flags: { label: 'start', amount: 0, flag: false, note: null, run },
        requestId: id(call.requestId),
        sender: 's',
      }))
    case 'Expire':
      return answered(items.expire, true)
    case 'Reindex':
      return answered(items.reindex, true)
    case 'Prune':
      return answered(items.prune, true)
    case 'Ack': {
      const of = call.of === 'all' ? [id('a'), id('b')] : [id(call.of)]
      const acking = Effect.gen(function*() {
        const rows = yield* items.published(call.topic, [], 100_000)
        yield* items.ack(call.topic, 'reader', rows.filter((row) => of.includes(row.id)))
        if (call.prune) yield* items.prune
      })
      return answered(acking, true)
    }
  }
}

/**
 * Runs a held history of the run `run` on `items`: the entities `a` and `b` are made, the calls `before` run one at a
 * time, then `pair` runs through `together`, then each request of the pair is sent again and every entity is read.
 * Gives the answers of the pair, of the requests sent again, and of the readings.
 */
const history = (
  items: Handle<Item, Declared>,
  sql: SqlClient.SqlClient,
  run: string,
  { before, pair }: Held,
  together: (calls: readonly [Effect.Effect<unknown>, Effect.Effect<unknown>]) => Effect.Effect<ReadonlyArray<unknown>>,
) =>
  Effect.gen(function*() {
    for (const name of ['a', 'b']) yield* pairedOn(items, run, { _tag: 'Create', id: name, requestId: `made-${name}` })
    for (const call of before) yield* pairedOn(items, run, call)
    if (before.some((call) => call._tag === 'Set' && call.keep !== 'forever' && call.keep.millis === brief.millis)) {
      yield* Effect.sleep(briefly)
    }
    const answers = yield* together([pairedOn(items, run, pair[0]), pairedOn(items, run, pair[1])])
    const again = yield* Effect.forEach(
      pair.filter((call) => call._tag === 'Set' || call._tag === 'Create'),
      (call) => pairedOn(items, run, call),
    )
    const read = yield* Effect.forEach(['a', 'b', 'c'], (name) => Effect.exit(items.read(`${run}/${name}`)))
    const counted = yield* items.count({ where: [{ index: 'run', is: '=', value: run }] })
    // No call reads a publication no row of the outbox names, so the table is read: such a publication stays for ever
    // (decision 0286).
    const [published] = yield* sql<{ count: number }>`
      SELECT CAST(count(*) AS INTEGER) AS count FROM effecttea_publications WHERE id LIKE ${`${run}/%`}
    `.pipe(Effect.orDie)
    return { answers, again, read: read.map(outcome), counted, published: published?.count }
  })

/** What the statements of one call of a pair name of the library's tables, and which of them they write. */
type Touched = Readonly<{ named: ReadonlySet<string>; written: ReadonlySet<string> }>

/**
 * The answers of `held` on a new database of SQLite, with the pair in the order `first`, then the other, and the
 * tables each call of the pair touched, by its place in the pair. A statement is given to the call that runs while
 * it runs. The transformer is provided around the launch, since an entity's statements run in fibers the runtime
 * forks, which take the context of the launch and not of the caller.
 */
const serially = (run: string, held: Held, first: 0 | 1) => {
  const touched = [0, 1].map(() => ({ named: new Set<string>(), written: new Set<string>() }))
  let current: 0 | 1 | undefined
  const recording: Statement.Transformer = (statement) =>
    Effect.sync(() => {
      const of = current === undefined ? undefined : touched[current]
      if (of !== undefined) {
        const [text] = statement.compile()
        for (const [table] of text.matchAll(/effecttea_\w+/g)) of.named.add(table)
        for (const [, table] of text.matchAll(/(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+"?(effecttea_\w+)/gi)) {
          of.written.add(table!)
        }
        // A statement that drops rows of the outbox drops their publications by a trigger, which no statement names
        // (decision 0286).
        if (/DELETE\s+FROM\s+"?effecttea_outbox\b/i.test(text)) of.written.add('effecttea_publications')
      }
      return statement
    })
  const during = (at: 0 | 1, call: Effect.Effect<unknown>) =>
    Effect.ensuring(
      Effect.andThen(Effect.sync(() => (current = at)), call),
      Effect.sync(() => (current = undefined)),
    )
  return Effect.runPromise(
    Effect.scoped(Effect.gen(function*() {
      const items = yield* (yield* launch({ sweep: 'none' })).deploy(item, declared)
      const answered = yield* history(items, yield* SqlClient.SqlClient, run, held, ([zero, one]) =>
        first === 0
          ? Effect.all([during(0, zero), during(1, one)])
          : Effect.map(Effect.all([during(1, one), during(0, zero)]), ([b, a]) => [a, b]))
      return { answered, touched: touched as ReadonlyArray<Touched> }
    })).pipe(
      Effect.provideService(Statement.CurrentTransformer, recording),
      Effect.provide(client('sqlite')),
      Effect.orDie,
    ),
  )
}

/**
 * The tables a gate drawn as a number is drawn among, for a pair whose calls touched `touched`: those both calls
 * write, else those both name, else every table of the library. A lock of a table both calls write holds both at a
 * statement of their transactions, where a lock of any table holds both at once in few runs.
 */
const gated = (tables: ReadonlyArray<string>, [zero, one]: ReadonlyArray<Touched>) => {
  const both = (of: (touched: Touched) => ReadonlySet<string>) =>
    tables.filter((table) => of(zero!).has(table) && of(one!).has(table))
  const written = both(({ written }) => written)
  if (written.length > 0) return written
  const named = both(({ named }) => named)
  return named.length > 0 ? named : tables
}

/**
 * Runs the histories `histories` on a pool of the server, `runs` of them, with `examples` first, and checks that each
 * answers as one order of its pair. Every run shares one database and one runtime.
 */
const onPool = (histories: fc.Arbitrary<Held>, runs: number, examples: ReadonlyArray<Held> = []) =>
  Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const url = yield* database(server ?? '')
    const connected = (options: Parameters<typeof pool>[1] = {}) =>
      Effect.map(Layer.build(pool(url, options)), (context) => Context.get(context, SqlClient.SqlClient))
    const sql = yield* connected()
    const gate = yield* connected({ maxConnections: 1 })
    const runtime = yield* Effect.provideService(launch({ sweep: 'none' }), SqlClient.SqlClient, sql)
    const items = yield* runtime.deploy(item, declared)
    const tables = (yield* sql<{ tablename: string }>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = current_schema() AND tablename LIKE 'effecttea%'
      ORDER BY tablename
    `).map(({ tablename }) => tablename)
    // Waits until `count` sessions wait for a lock, or a second has passed, since a call that reaches no statement of
    // the table locked does not wait. Gives whether they waited.
    const waiting = (count: number) =>
      Effect.gen(function*() {
        for (;;) {
          const [row] = yield* sql<{ count: number }>`
            SELECT count(*)::int AS count FROM pg_stat_activity
            WHERE datname = current_database() AND wait_event_type = 'Lock'
          `
          if ((row?.count ?? 0) >= count) return true
          yield* Effect.sleep('10 millis')
        }
      }).pipe(Effect.timeoutOrElse({ duration: '1 second', orElse: () => Effect.succeed(false) }), Effect.orDie)
    let ran = 0
    // The runs whose two calls both waited at the lock, so that a pass is known to have held some pair at once.
    let both = 0
    yield* Effect.promise(() =>
      fc.assert(
        fc.asyncProperty(histories, async (held) => {
          const run = `p${ran++}`
          const { gate: drawn } = held
          // The two orders run first, so that the gate is drawn among the tables their calls touched.
          const orders = [await serially(run, held, 0), await serially(run, held, 1)]
          const among = gated(tables, orders[0]!.touched)
          // A reply's row is locked by a reading of it `FOR UPDATE`, which a step that deletes the row waits for.
          const lock = typeof drawn === 'object'
            ? `SELECT 1 FROM effecttea_replies WHERE id = '${run}/${drawn.of}' AND request_id = '${run}/${drawn.reply}'
                FOR UPDATE`
            : `LOCK TABLE ${typeof drawn === 'string' ? drawn : among[drawn % among.length]!} IN ACCESS EXCLUSIVE MODE`
          const answered = await Effect.runPromise(history(items, sql, run, held, (calls) =>
            Effect.scoped(Effect.gen(function*() {
              const locked = yield* Deferred.make<void>()
              const open = yield* Deferred.make<void>()
              const holder = yield* Effect.forkChild(gate.withTransaction(Effect.gen(function*() {
                yield* gate.unsafe(lock)
                yield* Deferred.succeed(locked, undefined)
                yield* Deferred.await(open)
              })))
              yield* Deferred.await(locked)
              const fibers = yield* Effect.forEach(calls, (call) => Effect.forkChild(call))
              if (yield* waiting(2)) both++
              yield* Deferred.succeed(open, undefined)
              yield* Fiber.join(holder)
              return yield* Effect.forEach(fibers, Fiber.join)
            })).pipe(Effect.orDie)))
          expect(orders.map(({ answered }) => answered)).toContainEqual(answered)
        }),
        { numRuns: runs, examples: examples.map((example) => [example]) },
      )
    )
    console.log(`two calls held at once in ${both} of ${ran} runs`)
    if (ran >= 50) expect(both).toBeGreaterThan(0)
  })).pipe(Effect.orDie))

// Only `bun run test:postgres` reaches this test, since `bun test` on one machine has no server, so it holds the
// budget of the job `postgres` rather than of `bun test`: a hundred runs, a minute or two (decision 0250).
// Its examples are the history of bug 25 of `docs/bugs.md`, as fast-check shrank it on the CI's server: a `reindex`
// beside a message wrote the projection of the state before the message (decision 0284). They lock the table of
// projections, where the message's step waits holding its entity's row, and the `reindex` waits after reading the
// state. Whichever of the two then takes the table first, the code before decision 0284 fails when the step does.
const bug25: Held = {
  before: [],
  pair: [{ _tag: 'Reindex' }, { _tag: 'Set', id: 'a', label: 'x', keep: 'forever', requestId: 's1' }],
  gate: 'effecttea_projections',
}
// The examples of bug 13 retry a message whose reply is past its time beside an `expire`, the retry keeping its reply
// a minute. A table locked cannot hold the step at its reply, since a message's step reads its reply before its
// transaction, and stops there. So they lock the row of a second reply of the entity past its time. The step writes
// the retry's reply with its new time, then waits to delete the second reply, as a step deletes its entity's replies
// past their time. The `expire` reads both replies as `before` left them, and waits for the retry's row. Once the lock
// goes and the step commits, the code before the fix deletes the reply with its new time, so that the message is
// applied again when it is sent again.
const bug13: Held = {
  before: [
    { _tag: 'Set', id: 'a', label: 'x', keep: brief, requestId: 's1' },
    { _tag: 'Set', id: 'a', label: 'y', keep: brief, requestId: 's2' },
  ],
  pair: [{ _tag: 'Expire' }, { _tag: 'Set', id: 'a', label: 'x', keep: { millis: 60_000 }, requestId: 's1' }],
  gate: { reply: 's2', of: 'a' },
}
// The examples of bug 111 are two prunes at once, as fast-check found them on the CI's server: their batches locked
// rows of the outbox in opposite orders, and PostgreSQL ended one as a deadlock (decision 0288). The table locked is
// one no prune reads, so the two run at once.
const bug111: Held = {
  before: [
    { _tag: 'Set', id: 'a', label: 'y', keep: brief, requestId: 's1' },
    { _tag: 'Set', id: 'a', label: 'z', keep: brief, requestId: 's1' },
  ],
  pair: [{ _tag: 'Prune' }, { _tag: 'Prune' }],
  gate: 'effecttea_projections',
}
// The examples of bug 49 are an `expire` beside a step that deletes its entity's replies past their time, two of them.
// The batch locks the replies in the order of their times, and the step in an order of its plan, which may be the
// other. The row of one reply is locked, so that each of the two holds the other reply or waits for it when the lock
// goes. A batch that waited for a reply's row, as before decision 0285, closes a cycle with the step where their
// orders differ. The examples write the two replies in both orders, and lock each of them.
const bug49: ReadonlyArray<Held> = ([['s1', 's2'], ['s2', 's1']] as const).flatMap((order) =>
  (['s1', 's2'] as const).map((locked): Held => ({
    before: order.map((requestId, at) => ({
      _tag: 'Set' as const,
      id: 'a',
      label: at === 0 ? 'x' : 'y',
      keep: brief,
      requestId,
    })),
    pair: [{ _tag: 'Expire' }, { _tag: 'Set', id: 'a', label: 'z', keep: 'forever', requestId: 's3' }] as const,
    gate: { reply: locked, of: 'a' },
  }))
)
// The examples of bug 80 are two prunes at once whose views of the log differ by an ack, which the second prune runs
// after it (decision 0286). The consumer of `amount` acks the creation of `b` and a prune drops its row of `amount`.
// Then the consumer of `label` acks both creations. The first prune of the pair drops both rows of `label`. The
// creation of `a` keeps its row of `amount`, and the creation of `b` has none left, so its publication goes, and the
// trigger waits there at the lock of the publications. The second call acks the creation of `a` in `amount` and
// prunes its row, which the first prune has not committed the drop of the row of `label` of. A trigger once for each
// row, as before decision 0286, then saw in each transaction the other's row, and kept the publication of `a` for
// ever. The table locked is the publications.
const bug80: Held = {
  before: [
    { _tag: 'Ack', topic: 'amount', of: 'b', prune: false },
    { _tag: 'Prune' },
    { _tag: 'Ack', topic: 'label', of: 'all', prune: false },
  ],
  pair: [{ _tag: 'Prune' }, { _tag: 'Ack', topic: 'amount', of: 'a', prune: true }],
  gate: 'effecttea_publications',
}
test.skipIf(server === undefined)(
  'two calls held at a statement on a pool answer as one order of them',
  () =>
    onPool(held, Bun.env['SCHEDULES'] === 'all' ? 500 : 100, [
      ...Array.from({ length: 8 }, () => bug25),
      ...Array.from({ length: 8 }, () => bug13),
      ...Array.from({ length: 8 }, () => bug111),
      ...Array.from({ length: 2 }, () => bug49).flat(),
      ...Array.from({ length: 8 }, () => bug80),
    ]),
  1_200_000,
)
