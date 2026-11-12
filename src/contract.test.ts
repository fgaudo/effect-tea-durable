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
import { SqlClient } from 'effect/sql'
import fc from 'fast-check'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch as launchOnCluster, sharding } from './cluster.ts'
import { start } from './machine.ts'
import { launch } from './index.ts'
import { defect, program } from './index.program.ts'
import { idFault, requestIdFault, type TypesOf } from './program.ts'
import type { Handle, Keep } from './runtime.ts'
import type { Comparison, Dialect } from './storage.ts'
import { client, database, pool, server } from './storage.test_databases.ts'

const fields = {
  label: Schema.String,
  amount: Schema.Number,
  flag: Schema.Boolean,
  note: Schema.NullOr(Schema.String),
}

/**
 * The program every backend runs. Its index `run` holds the run of the property that made the entity, and every
 * reading names it, so that the runs that share one Cluster read only their own entities.
 */
const item = program({
  state: Schema.Struct({ ...fields, run: Schema.String }),
  flags: Schema.Struct({ ...fields, run: Schema.String }),
  sender: Schema.String,
  inbound: Schema.Union([
    Schema.TaggedStruct('Set', fields),
    Schema.TaggedStruct('Boom', { note: Schema.String }),
    Schema.TaggedStruct('Add', { label: Schema.String, n: Schema.Number }),
  ]),
  projection: Schema.Struct({ ...fields, run: Schema.String }),
})({
  name: 'Item',
  init: (flags) => flags,
  update: (message) => (state) => {
    if (message._tag === 'Boom') return defect(`cannot handle ${message.note}`)
    if (message._tag === 'Add') return { ...state, label: message.label, amount: state.amount + message.n }
    const { _tag, ...set } = message
    return { ...state, ...set }
  },
  project: (state) => state,
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
  )
  // The entities are made first, so that the readings after them have rows to compare.
  return fc.tuple(fc.array(create, { minLength: 1, maxLength: 6 }), fc.array(call, { minLength: 1, maxLength: 16 }))
    .map(([made, rest]) => [...made, ...rest])
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
 * The answer of a creation the program dies on. One process gives its creator the defect, and stores nothing. On
 * Cluster the creator waits until a deploy fixes the program, since Cluster would save the defect as the reply that
 * a retry after the fix is given (decision 0160). Neither is a reply the contract compares, so each backend answers
 * this in its place.
 */
const waitsForAFix = 'a creation the program dies on (decision 0160)'

/**
 * Runs `calls` under the run `run`, each call of a caller through `handles` in turn, and gives each answer. Every id
 * but the empty one and every request id is prefixed with the run, and every reading names it, so that each run
 * reads only its own entities. The calls at `waiting` are creations the program dies on: they are answered
 * `waitsForAFix`, and run only where `send` holds, since on Cluster such a creation is delivered again without end.
 */
const answer = (
  handles: ReadonlyArray<Handle<Item>>,
  run: string,
  calls: ReadonlyArray<Call>,
  waiting: ReadonlySet<number>,
  send: boolean,
) =>
  Effect.gen(function*() {
    const own = (id: string) => id === '' ? id : `${run}/${id}`
    const within = (where: ReadonlyArray<Readonly<{ index: Index; is: Comparison; value: unknown }>>) =>
      [{ index: 'run' as const, is: '=' as const, value: run }, ...where] as never
    const answers: Array<unknown> = []
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
      if (waiting.has(at) && !send) {
        answers.push(waitsForAFix)
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
        : Effect.map(
          items.suspended,
          (suspended) => suspended.map(({ id }) => id).filter((id) => id.startsWith(`${run}/`)).sort(),
        )
      // A call that waits for ever fails the test rather than holding it.
      const exit = yield* Effect.exit((reply as Effect.Effect<unknown, unknown>).pipe(
        Effect.timeoutOrElse({ duration: '5 seconds', orElse: () => Effect.succeed(unanswered) }),
      ))
      answers.push(
        waiting.has(at) && Exit.isFailure(exit) && Cause.hasDies(exit.cause) ? waitsForAFix : outcome(exit),
      )
    }
    return answers
  })

/** What a call is answered that has no answer within its time. */
const unanswered = 'no answer within 5 s'

/**
 * The creations of `calls` the program dies on, by their place: a creation that one process refused with a defect,
 * whose id and request id are no defect of the caller's (decisions 0053, 0204), and whose flags the machine's `start`
 * dies on. `start` is what a door runs on Cluster, and its defect is what Cluster delivers again (decision 0160).
 */
const diesOn = (calls: ReadonlyArray<Call>, answers: ReadonlyArray<unknown>, run: string): ReadonlySet<number> =>
  new Set(calls.flatMap((call, at) => {
    if (call._tag !== 'Create') return []
    const answered = answers[at] as { refused?: string }
    const id = call.id === '' ? '' : `${run}/${call.id}`
    const requestId = `${run}/${call.request.requestId}`
    const request = { _tag: 'Caller', sender: call.request.sender, id: requestId } as const
    return answered.refused === 'defect' && idFault(id) === undefined && requestIdFault(requestId) === undefined &&
        start(item, id, { ...call.flags, run }, DateTime.nowUnsafe(), request)._tag === 'Defect'
      ? [at]
      : []
  }))

/**
 * `calls` without the requests to an entity after a creation of it the program dies on. On Cluster that creation
 * waits for a fix, and every later request to its entity waits behind it, while one process goes on (decision 0160).
 */
const pastWaits = (calls: ReadonlyArray<Call>, waiting: ReadonlySet<number>): ReadonlyArray<Call> => {
  const held = new Set<string>()
  return calls.filter((call, at) => {
    if (call._tag !== 'Create' && call._tag !== 'Set' && call._tag !== 'Boom') return true
    if (held.has(call.id)) return false
    if (waiting.has(at)) held.add(call.id)
    return true
  })
}

/** Runs `calls` on a new database of `dialect`, on one process. */
const onDialect = (
  dialect: Dialect,
  run: string,
  calls: ReadonlyArray<Call>,
  waiting: ReadonlySet<number> = new Set(),
) =>
  Effect.runPromise(
    Effect.scoped(Effect.gen(function*() {
      const items = yield* (yield* launch()).deploy(item)
      return yield* answer([items], run, calls, waiting, true)
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
      // One process answers first, to find the creations the program dies on, which Cluster answers otherwise.
      const first = await onDialect('sqlite', run, generated)
      const calls = pastWaits(generated, diesOn(generated, first, run))
      const answered = calls.length === generated.length ? first : await onDialect('sqlite', run, calls)
      const waiting = diesOn(calls, answered, run)
      const sqlite = answered.map((answer, at) => waiting.has(at) ? waitsForAFix : answer)
      alike(await onDialect('pg', run, calls, waiting), sqlite)
      alike(await Effect.runPromise(answer(cluster.handles, run, calls, waiting, false)), sqlite)
    }),
    // `bun test` runs six within its budget, and a release fifty times as many (decision 0250).
    { numRuns: Bun.env['SCHEDULES'] === 'all' ? 300 : 6 },
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
const paired: fc.Arbitrary<Paired> = fc.oneof(
  set,
  create,
  fc.constant({ _tag: 'Expire' as const }),
  fc.constant({ _tag: 'Reindex' as const }),
  fc.constant({ _tag: 'Prune' as const }),
)
type Paired =
  | Readonly<{ _tag: 'Set'; id: string; label: string; keep: Keep; requestId: string }>
  | Readonly<{ _tag: 'Create'; id: string; requestId: string }>
  | Readonly<{ _tag: 'Expire' }>
  | Readonly<{ _tag: 'Reindex' }>
  | Readonly<{ _tag: 'Prune' }>
/** Histories of `pairs`, after up to four messages one at a time, whose replies may be kept `brief`ly. */
const heldOf = (pairs: fc.Arbitrary<readonly [Paired, Paired]>) =>
  fc.record({
    before: fc.array(fc.record({ ...setFields, keep: fc.oneof(keep, fc.constant<Keep>(brief)) }), { maxLength: 4 }),
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
const pairedOn = (items: Handle<Item>, run: string, call: Paired): Effect.Effect<unknown> => {
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
  }
}

/**
 * Runs a held history of the run `run` on `items`: the entities `a` and `b` are made, the calls `before` run one at a
 * time, then `pair` runs through `together`, then each request of the pair is sent again and every entity is read.
 * Gives the answers of the pair, of the requests sent again, and of the readings.
 */
const history = (
  items: Handle<Item>,
  run: string,
  { before, pair }: Held,
  together: (calls: readonly [Effect.Effect<unknown>, Effect.Effect<unknown>]) => Effect.Effect<ReadonlyArray<unknown>>,
) =>
  Effect.gen(function*() {
    for (const name of ['a', 'b']) yield* pairedOn(items, run, { _tag: 'Create', id: name, requestId: `made-${name}` })
    for (const call of before) yield* pairedOn(items, run, call)
    if (before.some(({ keep }) => keep !== 'forever' && keep.millis === brief.millis)) yield* Effect.sleep(briefly)
    const answers = yield* together([pairedOn(items, run, pair[0]), pairedOn(items, run, pair[1])])
    const again = yield* Effect.forEach(
      pair.filter((call) => call._tag === 'Set' || call._tag === 'Create'),
      (call) => pairedOn(items, run, call),
    )
    const read = yield* Effect.forEach(['a', 'b', 'c'], (name) => Effect.exit(items.read(`${run}/${name}`)))
    const counted = yield* items.count({ where: [{ index: 'run', is: '=', value: run }] })
    return { answers, again, read: read.map(outcome), counted }
  })

/** The answers of `held` on a new database of SQLite, with the pair in the order `first`, then the other. */
const serially = (run: string, held: Held, first: 0 | 1) =>
  Effect.runPromise(
    Effect.scoped(Effect.gen(function*() {
      const items = yield* (yield* launch({ sweep: 'none' })).deploy(item)
      return yield* history(items, run, held, ([zero, one]) =>
        first === 0
          ? Effect.all([zero, one])
          : Effect.map(Effect.all([one, zero]), ([b, a]) => [a, b]))
    })).pipe(Effect.provide(client('sqlite')), Effect.orDie),
  )

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
    const items = yield* runtime.deploy(item)
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
          // A reply's row is locked by a reading of it `FOR UPDATE`, which a step that deletes the row waits for.
          const lock = typeof drawn === 'object'
            ? `SELECT 1 FROM effecttea_replies WHERE id = '${run}/${drawn.of}' AND request_id = '${run}/${drawn.reply}'
                FOR UPDATE`
            : `LOCK TABLE ${typeof drawn === 'string' ? drawn : tables[drawn % tables.length]!} IN ACCESS EXCLUSIVE MODE`
          const answered = await Effect.runPromise(history(items, run, held, (calls) =>
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
          const orders = [await serially(run, held, 0), await serially(run, held, 1)]
          expect(orders).toContainEqual(answered)
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
test.skipIf(server === undefined)(
  'two calls held at a statement on a pool answer as one order of them',
  () =>
    onPool(held, Bun.env['SCHEDULES'] === 'all' ? 500 : 100, [
      ...Array.from({ length: 8 }, () => bug25),
      ...Array.from({ length: 8 }, () => bug13),
    ]),
  1_200_000,
)
