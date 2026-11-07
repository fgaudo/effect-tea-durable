/**
 * The runtime's `Sharding` on Cluster: the versions a launch records, the `RunnerHealth` that answers by them, and
 * two runners of the runtime on one SQLite file during a rolling deploy (decision 0159). The runtime on Cluster: its
 * doors (decisions 0160, 0161), and the shards a runner learns from its singletons (decision 0162).
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { describe, expect, test } from 'bun:test'
import {
  EntityId,
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
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addressText, byVersion, doorOf, launch, sharding } from './cluster.ts'
import {
  create as createFrom,
  defect,
  type Entities,
  InvariantDefect,
  noWork,
  operation,
  type Program,
  rejectWith,
  send as sendFrom,
  timer,
  versionOf,
} from './program.ts'
import { type Handle, Probe, type Said } from './runtime.ts'
import { createTables, newestVersion, outranked, recordVersions } from './storage.ts'
import { client, onEach } from './test-databases.ts'

type T = {
  state: Readonly<{ last: string }>
  flags: null
  inbound: string
  internal: string
  operation: Readonly<{ _tag: 'Ask' }>
  key: 'ask'
  parameter: {}
  rejection: never
  sender: null
  projection: string
  index: never
  services: never
}

/** A program named `name` at `version`, which carries `version - 1` migrations that change nothing. */
const at = (name: string, version: number): Program<T> => ({
  name,
  keys: { ask: null },
  schemas: {
    state: Schema.Struct({ last: Schema.String }),
    flags: Schema.Null,
    inbound: Schema.String,
    internal: Schema.String,
    operation: Schema.TaggedStruct('Ask', {}),
    rejection: Schema.Never,
    sender: Schema.Null,
    projection: Schema.String,
  },
  init: () => ({ last: 'start' }),
  update: (message) => () => ({ last: message }),
  durable: () => noWork,
  operations: { Ask: operation(() => Effect.succeed('asked')) },
  project: ({ last }) => last,
  indexes: {},
  migrations: Array.from({ length: version - 1 }, () => ({})),
})

const defectOf = <A, E>(exit: Exit.Exit<A, E>): unknown =>
  Exit.isFailure(exit) ? Cause.squash(exit.cause) : undefined

describe('the versions a launch records', () => {
  test('a launch older than the newest recorded dies, naming the program and both versions, and records nothing', () =>
    onEach(['sqlite', 'pg'], (dialect) =>
      Effect.runPromise(Effect.gen(function*() {
        const sql = yield* SqlClient.SqlClient
        yield* createTables
        yield* recordVersions('a:1', [{ name: 'Toy', version: 2 }, { name: 'Other', version: 1 }])
        const exit = yield* Effect.exit(recordVersions('b:1', [{ name: 'Other', version: 1 }, { name: 'Toy', version: 1 }]))
        const defect = defectOf(exit)
        expect(defect).toBeInstanceOf(InvariantDefect)
        expect((defect as InvariantDefect).reason).toBe(
          'the program Toy is launched at version 1, and a launch has run it at version 2',
        )
        const runners = yield* sql<{ address: string }>`SELECT address FROM runner_versions ORDER BY address`
        expect(runners.map(({ address }) => address)).toEqual(['a:1', 'a:1'])
      }).pipe(Effect.provide(client(dialect))))))

  test('a newer launch raises the newest version, and outranks the runners of the older one', () =>
    onEach(['sqlite', 'pg'], (dialect) =>
      Effect.runPromise(Effect.gen(function*() {
        yield* createTables
        yield* recordVersions('a:1', [{ name: 'Toy', version: 1 }, { name: 'Other', version: 1 }])
        expect(yield* outranked('a:1')).toBe(false)
        expect(yield* newestVersion('Toy')).toBe(1)
        expect(yield* newestVersion('Unknown')).toBeUndefined()
        yield* recordVersions('b:1', [{ name: 'Toy', version: 2 }])
        // A step reads it in its transaction, under `FOR SHARE` on PostgreSQL.
        expect(yield* (yield* SqlClient.SqlClient).withTransaction(newestVersion('Toy'))).toBe(2)
        expect(yield* outranked('a:1')).toBe(true)
        expect(yield* outranked('b:1')).toBe(false)
        expect(yield* outranked('c:1')).toBeUndefined()
        // A runner launched again at its address replaces what it recorded there.
        yield* recordVersions('a:1', [{ name: 'Toy', version: 2 }, { name: 'Other', version: 1 }])
        expect(yield* outranked('a:1')).toBe(false)
      }).pipe(Effect.provide(client(dialect))))))
})

describe('the health of a runner', () => {
  const address = (port: number) => RunnerAddress.make('localhost', port)
  const launched = (alive: boolean) => RunnerHealth.RunnerHealth.of({ isAlive: () => Effect.succeed(alive) })

  test('a runner is alive where the launcher says so and it runs the newest versions', () =>
    Effect.runPromise(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      yield* createTables
      yield* recordVersions(addressText(address(1)), [{ name: 'Toy', version: 1 }])
      yield* recordVersions(addressText(address(2)), [{ name: 'Toy', version: 2 }])
      const health = byVersion(launched(true), sql)
      expect(yield* health.isAlive(address(1))).toBe(false)
      expect(yield* health.isAlive(address(2))).toBe(true)
      // A runner without the runtime is answered by the launcher's health alone.
      expect(yield* health.isAlive(address(3))).toBe(true)
      const dead = byVersion(launched(false), sql)
      expect(yield* dead.isAlive(address(2))).toBe(false)
      expect(yield* dead.isAlive(address(3))).toBe(false)
    }).pipe(Effect.provide(client('sqlite')))))

  test('a failure to read the versions answers as the launcher does', () =>
    Effect.runPromise(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      // No table of versions: every read fails.
      const health = byVersion(launched(true), sql)
      expect(yield* health.isAlive(address(1))).toBe(true)
    }).pipe(Effect.provide(client('sqlite')))))
})

describe('two runners on one file', () => {
  const shardsPerGroup = 12
  const shards = Array.from({ length: shardsPerGroup }, (_, i) => ShardId.make('default', i + 1))

  /**
   * Runs `run` with a function that starts a runner of the runtime on one SQLite file, at a port, whose runtime deploys
   * `programs`, and gives back how many shards it holds. The lease is 3 s, since SQLite's `CURRENT_TIMESTAMP` counts
   * whole seconds, and a lease of 1 s drops a runner that has just beaten.
   */
  const onFile = async (
    run: (
      start: (
        port: number,
        programs: ReadonlyArray<Program<T>>,
      ) => Effect.Effect<(() => number) & { context: Context.Context<Sharding.Sharding> }, never, Scope.Scope>,
    ) => Effect.Effect<void, unknown, Scope.Scope | SqlClient.SqlClient>,
  ) => {
    const directory = mkdtempSync(join(tmpdir(), 'effect-tea-durable-test-'))
    const store = SqliteClient.layer({ filename: join(directory, 'store.db') })
    const start = (port: number, programs: ReadonlyArray<Program<T>>) =>
      Effect.gen(function*() {
        const context = yield* Layer.build(
          sharding(programs).pipe(
            Layer.provideMerge(Runners.layerNoop),
            Layer.provideMerge(SqlMessageStorage.layer),
            Layer.provide([Layer.orDie(SqlRunnerStorage.layer), RunnerHealth.layerNoop]),
            Layer.provideMerge(ShardingConfig.layer({
              runnerAddress: Option.some(RunnerAddress.make('localhost', port)),
              shardsPerGroup,
              refreshAssignmentsInterval: Duration.millis(50),
              runnerHealthCheckInterval: Duration.millis(50),
              shardLockRefreshInterval: Duration.millis(100),
              shardLockExpiration: Duration.seconds(3),
              entityMessagePollInterval: Duration.millis(100),
            })),
            // Each runner its own connection, as a runner of its own process has: a layer built once is shared.
            Layer.provideMerge(SqliteClient.layer({ filename: join(directory, 'store.db') })),
            Layer.provide(Digest.layerWebCrypto),
          ),
        ).pipe(Effect.orDie)
        const runtime = yield* Effect.provide(launch(), context)
        for (const program of programs) yield* Effect.provide(runtime.deploy(program), context)
        const held = context.mapUnsafe.get(Sharding.Sharding.key) as Sharding.Sharding['Service']
        return Object.assign(() => shards.filter((shard) => held.hasShardId(shard)).length, {
          context: context as Context.Context<Sharding.Sharding>,
        })
      })
    try {
      await Effect.runPromise(Effect.scoped(run(start)).pipe(Effect.provide(store)) as Effect.Effect<void, unknown>)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
  const until = (count: () => number, done: (n: number) => boolean) =>
    Effect.repeat(Effect.sync(count), { schedule: Schedule.spaced('25 millis'), until: done }).pipe(
      Effect.timeout('15 seconds'),
    )

  test('a rolling deploy moves every shard to the newer runner, and none back', () =>
    onFile((start) =>
      Effect.gen(function*() {
        const older = yield* start(1, [at('Toy', 1)])
        yield* until(older, (n) => n === shardsPerGroup)
        const newer = yield* start(2, [at('Toy', 2)])
        yield* until(newer, (n) => n === shardsPerGroup)
        expect(older()).toBe(0)
        const seen: Array<number> = []
        yield* Effect.repeat(Effect.sync(() => void seen.push(older())), {
          schedule: Schedule.spaced('50 millis'),
          times: 20,
        })
        expect(Math.max(...seen)).toBe(0)
      })), 30_000)

  test('a runner launched older than the newest dies, and the newer keeps every shard', () =>
    onFile((start) =>
      Effect.gen(function*() {
        const newer = yield* start(2, [at('Toy', 2)])
        yield* until(newer, (n) => n === shardsPerGroup)
        const scope = yield* Scope.make()
        const exit = yield* Effect.exit(Scope.provide(start(1, [at('Toy', 1)]), scope))
        expect(defectOf(exit)).toBeInstanceOf(InvariantDefect)
        yield* Scope.close(scope, Exit.void)
        const sql = yield* SqlClient.SqlClient
        const registered = yield* sql<{ address: string }>`SELECT address FROM cluster_runners`
        expect(registered.map(({ address }) => address)).toEqual(['localhost:2'])
        expect(newer()).toBe(shardsPerGroup)
      })), 30_000)

  test('a step of an older version dies and saves no reply, and a runner of the newest version steps its message', () =>
    onFile((start) =>
      Effect.gen(function*() {
        const sql = yield* SqlClient.SqlClient
        const caller = (id: string) => JSON.stringify({ _tag: 'Caller', sender: null, id })
        const entity = sql<{ state: string; version: number; steps: number }>`
          SELECT state, version, steps FROM entities WHERE id = 'one'
        `.pipe(Effect.map((rows) => rows.map((row) => ({ ...row, version: Number(row.version), steps: Number(row.steps) }))))
        const older = yield* start(1, [at('Toy', 1)])
        yield* until(older, (n) => n === shardsPerGroup)
        const clientOf = yield* Effect.provide(doorOf('Toy').client, older.context)
        expect(yield* clientOf('one').Create({ version: 1, request: caller('c1'), message: 'null' }))
          .toBe('{"_tag":"Created"}')
        expect(yield* entity).toEqual([{ state: '{"last":"start"}', version: 1, steps: 1 }])
        // A launch of the newer version is recorded, and its runner is not up yet. The older runner is the only one,
        // and Cluster never marks its last runner unhealthy, so it keeps its shards.
        yield* recordVersions('localhost:9', [{ name: 'Toy', version: 2 }])
        yield* clientOf('one').Message({ version: 1, request: caller('m1'), message: '"m"' }, { discard: true })

        // The older runner's step dies, again and again, and nothing is stepped, answered or marked processed.
        yield* Effect.sleep('1500 millis')
        expect(older()).toBe(shardsPerGroup)
        const before = yield* sql<{ processed: number }>`SELECT processed FROM cluster_messages WHERE tag = 'Message'`
        expect(before.map(({ processed }) => Number(processed))).toEqual([0])
        const replies = yield* sql<{ id: number }>`SELECT id FROM cluster_replies`
        expect(replies.length).toBe(1)
        expect(yield* entity).toEqual([{ state: '{"last":"start"}', version: 1, steps: 1 }])

        // A runner of the newest version takes the shards, and steps the message once, at its version.
        const newer = yield* start(2, [at('Toy', 2)])
        yield* until(newer, (n) => n === shardsPerGroup)
        const stepped = yield* Effect.repeat(entity, {
          schedule: Schedule.spaced('50 millis'),
          until: (rows) => rows[0]?.state === '{"last":"m"}',
        }).pipe(Effect.timeout('15 seconds'))
        expect(stepped).toEqual([{ state: '{"last":"m"}', version: 2, steps: 2 }])
        const after = yield* sql<{ processed: number }>`SELECT processed FROM cluster_messages WHERE tag = 'Message'`
        expect(after.map(({ processed }) => Number(processed))).toEqual([1])
        expect((yield* sql<{ id: number }>`SELECT id FROM cluster_replies`).length).toBe(2)
      })), 30_000)
})

describe('the runtime on Cluster', () => {
  type Tally = {
    state: Readonly<{ n: number; asking: boolean }>
    flags: Readonly<{ start: number }>
    inbound:
      | Readonly<{ _tag: 'Add'; n: number }>
      | Readonly<{ _tag: 'Refuse' }>
      | Readonly<{ _tag: 'Break' }>
      | Readonly<{ _tag: 'Ask' }>
    internal: Readonly<{ _tag: 'Answered' }>
    operation: Readonly<{ _tag: 'Ask' }>
    key: 'ask'
    parameter: {}
    rejection: Readonly<{ why: string }>
    sender: Readonly<{ user: string }>
    projection: number
    index: never
    services: never
  }
  /** How many times the operation `Ask` ran in the test under way. */
  let asked = 0
  /** The runner's client of the database, which `Ask` registers an `afterCommit` with. */
  let runnerSql: SqlClient.SqlClient | null = null
  /** The handle of `tally` deployed on the runner of the test under way, as a caller holds it. */
  let handle: Handle<Tally> | null = null
  /**
   * What `Ask` saw of its `afterCommit` in the test under way: run at once, where no transaction is open in the
   * operation's context; deferred, where one is; died, where one has ended already.
   */
  let afterCommit: 'at once' | 'deferred' | 'died' | null = null
  const tally: Program<Tally> = {
    name: 'Tally',
    keys: { ask: null },
    schemas: {
      state: Schema.Struct({ n: Schema.Int, asking: Schema.Boolean }),
      flags: Schema.Struct({ start: Schema.Int }),
      inbound: Schema.Union([
        Schema.TaggedStruct('Add', { n: Schema.Int }),
        Schema.TaggedStruct('Refuse', {}),
        Schema.TaggedStruct('Break', {}),
        Schema.TaggedStruct('Ask', {}),
      ]),
      internal: Schema.TaggedStruct('Answered', {}),
      operation: Schema.TaggedStruct('Ask', {}),
      rejection: Schema.Struct({ why: Schema.String }),
      sender: Schema.Struct({ user: Schema.String }),
      projection: Schema.Int,
    },
    init: ({ start }) => start < 0 ? defect('a tally starts at zero or more') : { n: start, asking: false },
    update: (message) => (state) => {
      switch (message._tag) {
        case 'Add':
          return { ...state, n: state.n + message.n }
        case 'Refuse':
          return rejectWith({ why: 'refused' })
        case 'Break':
          return defect('broken')
        case 'Ask':
          return { ...state, asking: true }
        case 'Answered':
          return { n: state.n + 100, asking: false }
      }
    },
    durable: (state) => state.asking ? { ask: { _tag: 'Ask' } } : noWork,
    operations: {
      Ask: operation(() =>
        Effect.gen(function*() {
          asked++
          let ran = false
          const exit = yield* Effect.exit(runnerSql!.afterCommit(Effect.sync(() => {
            ran = true
          })))
          afterCommit = Exit.isFailure(exit) ? 'died' : ran ? 'at once' : 'deferred'
          return { _tag: 'Answered' } as const
        })),
    },
    project: ({ n }) => n,
    indexes: {},
  }
  const caller = (id: string) => JSON.stringify({ _tag: 'Caller', sender: { user: 'u' }, id })
  const send = (inbound: Tally['inbound'], request: string, id = 'one') =>
    Effect.flatMap(doorOf('Tally').client, (clientOf) =>
      clientOf(id).Message({ version: 1, request: caller(request), message: JSON.stringify(inbound) }))
  const create = (start: number, request: string) =>
    Effect.flatMap(doorOf('Tally').client, (clientOf) =>
      clientOf('one').Create({ version: 1, request: caller(request), message: JSON.stringify({ start }) }))
  const stateOf = Effect.flatMap(
    Effect.service(SqlClient.SqlClient),
    (sql) =>
      Effect.map(sql<{ state: string }>`SELECT state FROM entities WHERE id = 'one'`, ([row]) =>
        row === undefined ? undefined : JSON.parse(row.state) as Tally['state']),
  )

  /**
   * Runs `run` on one runner over a SQLite file, whose runtime on Cluster deploys `tally`. `probe`, given the
   * runner's client of the database, is told what the runtime does.
   */
  const onRunner = async (
    run: Effect.Effect<void, unknown, Sharding.Sharding | SqlClient.SqlClient | Scope.Scope>,
    probe?: (sql: SqlClient.SqlClient) => (said: Said) => Effect.Effect<void>,
  ) => {
    const directory = mkdtempSync(join(tmpdir(), 'effect-tea-durable-test-'))
    const store = SqliteClient.layer({ filename: join(directory, 'store.db') })
    const runner = sharding([tally]).pipe(
      Layer.provideMerge(Runners.layerNoop),
      Layer.provideMerge(SqlMessageStorage.layer),
      Layer.provide([Layer.orDie(SqlRunnerStorage.layer), RunnerHealth.layerNoop]),
      Layer.provideMerge(ShardingConfig.layer({
        runnerAddress: Option.some(RunnerAddress.make('localhost', 1)),
        shardsPerGroup: 12,
        entityMessagePollInterval: Duration.millis(100),
      })),
      Layer.provideMerge(store),
      Layer.provide(Digest.layerWebCrypto),
    )
    const launched = Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      // Outside any transaction, where SQLite takes the pragma: a probe may break a deferred foreign key, so that a
      // COMMIT fails.
      yield* sql`PRAGMA foreign_keys = ON`
      yield* sql`CREATE TABLE parent (id INTEGER PRIMARY KEY)`
      yield* sql`CREATE TABLE child (parent INTEGER REFERENCES parent (id) DEFERRABLE INITIALLY DEFERRED)`
      runnerSql = sql
      const runtime = yield* (probe === undefined ? launch() : Effect.provideService(launch(), Probe, probe(sql)))
      handle = yield* runtime.deploy(tally)
      yield* run
    })
    asked = 0
    afterCommit = null
    try {
      await Effect.runPromise(Effect.scoped(launched).pipe(Effect.provide(Layer.orDie(runner))) as Effect.Effect<void>)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
  const eventually = <A>(read: Effect.Effect<A, unknown, SqlClient.SqlClient>, done: (a: A) => boolean) =>
    Effect.repeat(read, { schedule: Schedule.spaced('25 millis'), until: done }).pipe(Effect.timeout('15 seconds'))

  test('a door creates, answers each message as the machine does, and stores the state with the reply', () =>
    onRunner(Effect.gen(function*() {
      expect(yield* create(1, 'c1')).toBe('{"_tag":"Created"}')
      expect(yield* create(1, 'c2')).toBe('{"_tag":"AlreadyExists"}')
      expect(yield* send({ _tag: 'Add', n: 2 }, 'm1')).toBe('{"_tag":"Accepted"}')
      // A retry under the same key is answered as the first time, and adds nothing to the state.
      expect(yield* send({ _tag: 'Add', n: 2 }, 'm1')).toBe('{"_tag":"Accepted"}')
      expect(yield* send({ _tag: 'Refuse' }, 'm2')).toBe('{"_tag":"Rejected","reason":{"why":"refused"}}')
      expect(yield* stateOf).toEqual({ n: 3, asking: false })
      expect(yield* send({ _tag: 'Add', n: 1 }, 'm3', 'none')).toBe('{"_tag":"NotFound"}')
    })), 30_000)

  test('a caller creates and sends through the door, and a retry is answered as the first time', () =>
    onRunner(Effect.gen(function*() {
      const sender = { user: 'u' }
      expect(yield* handle!.create('one', { start: 1 }, { requestId: 'c1', sender })).toEqual({ _tag: 'Created' })
      expect(yield* handle!.create('one', { start: 5 }, { requestId: 'c2', sender })).toEqual({ _tag: 'AlreadyExists' })
      const add = { _tag: 'Add', n: 2 } as const
      expect(yield* handle!.send('one', add, { requestId: 'm1', sender })).toEqual({ _tag: 'Accepted' })
      expect(yield* handle!.send('one', add, { requestId: 'm1', sender })).toEqual({ _tag: 'Accepted' })
      expect(yield* handle!.send('one', { _tag: 'Refuse' }, { requestId: 'm2', sender })).toEqual({
        _tag: 'Rejected',
        reason: { why: 'refused' },
      })
      expect(yield* stateOf).toEqual({ n: 3, asking: false })
      // The door answers what the runtime sent: the request is the caller's, under its sender.
      expect(yield* send(add, 'm1')).toBe('{"_tag":"Accepted"}')
      expect(yield* stateOf).toEqual({ n: 3, asking: false })
    })), 30_000)

  test('a message answered NotFound is handled when it is sent again, once its entity is created', () =>
    onRunner(Effect.gen(function*() {
      const sender = { user: 'u' }
      const add = { _tag: 'Add', n: 2 } as const
      expect(yield* handle!.send('one', add, { requestId: 'm1', sender })).toEqual({ _tag: 'NotFound' })
      yield* handle!.create('one', { start: 1 }, { requestId: 'c1', sender })
      // Cluster saved `NotFound` under the request: the client resets it, and the step applies the message.
      expect(yield* handle!.send('one', add, { requestId: 'm1', sender })).toEqual({ _tag: 'Accepted' })
      expect(yield* stateOf).toEqual({ n: 3, asking: false })
    })), 30_000)

  test('a message answered Suspended is answered Suspended again while its entity is suspended', () =>
    onRunner(Effect.gen(function*() {
      const sender = { user: 'u' }
      yield* handle!.create('one', { start: 0 }, { requestId: 'c1', sender })
      expect(yield* handle!.send('one', { _tag: 'Break' }, { requestId: 'm1', sender })).toEqual({ _tag: 'Suspended' })
      expect(yield* handle!.send('one', { _tag: 'Add', n: 1 }, { requestId: 'm2', sender })).toEqual({
        _tag: 'Suspended',
      })
      expect(yield* handle!.send('one', { _tag: 'Add', n: 1 }, { requestId: 'm2', sender })).toEqual({
        _tag: 'Suspended',
      })
    })), 30_000)

  test('an operator’s resume and discard go through the door, each a request of its own', () =>
    onRunner(Effect.gen(function*() {
      const sender = { user: 'u' }
      expect(yield* handle!.resume('one')).toEqual({ _tag: 'NotFound' })
      yield* handle!.create('one', { start: 0 }, { requestId: 'c1', sender })
      expect(yield* handle!.discard('one')).toEqual({ _tag: 'NotSuspended' })
      expect(yield* handle!.send('one', { _tag: 'Break' }, { requestId: 'm1', sender })).toEqual({ _tag: 'Suspended' })
      expect(yield* handle!.send('one', { _tag: 'Add', n: 1 }, { requestId: 'm2', sender })).toEqual({
        _tag: 'Suspended',
      })
      // The message the entity died on is handled next, by the loop, which dies on it again.
      expect(yield* handle!.resume('one')).toEqual({ _tag: 'Resumed' })
      yield* eventually(handle!.suspended, (listed) => listed.length === 1)
      // A discard is a request of its own, stepped again, and not answered from the reply Cluster saved before.
      expect(yield* handle!.discard('one')).toEqual({ _tag: 'Discarded' })
      // A message answered Suspended was not queued: its retry is reset, and handled once the entity is back.
      expect(yield* handle!.send('one', { _tag: 'Add', n: 1 }, { requestId: 'm2', sender })).toEqual({
        _tag: 'Accepted',
      })
      expect(yield* stateOf).toEqual({ n: 1, asking: false })
      expect(yield* handle!.discard('one')).toEqual({ _tag: 'NotSuspended' })
    })), 30_000)

  test('a caller’s keep reaches the door, and its reply is kept until the time it gives', () =>
    onRunner(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const sender = { user: 'u' }
      yield* handle!.create('one', { start: 0 }, { requestId: 'c1', sender })
      const before = DateTime.toEpochMillis(yield* DateTime.now)
      const keep = { millis: 60_000 }
      yield* handle!.send('one', { _tag: 'Add', n: 1 }, { requestId: 'm1', sender, keep })
      yield* handle!.send('one', { _tag: 'Add', n: 1 }, { requestId: 'm2', sender })
      const rows = yield* sql<{ id: string; until: number | null }>`
        SELECT request_id AS id, until FROM replies WHERE name = 'Tally' ORDER BY request_id
      `
      expect(rows.map((row) => row.id)).toEqual(['m1', 'm2'])
      expect(Number(rows[0]?.until)).toBeGreaterThanOrEqual(before + keep.millis)
      expect(rows[1]?.until).toBeNull()
    })), 30_000)

  test('a caller’s message that does not encode is the caller’s defect, and reaches no door', () =>
    onRunner(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const sender = { user: 'u' }
      yield* handle!.create('one', { start: 0 }, { requestId: 'c1', sender })
      const broken = { _tag: 'Add', n: 0.5 } as const
      const exit = yield* Effect.exit(handle!.send('one', broken, { requestId: 'm1', sender }))
      expect(Exit.isFailure(exit)).toBe(true)
      const [row] = yield* sql<{ held: number }>`SELECT COUNT(*) AS held FROM cluster_messages WHERE tag = 'Message'`
      expect(Number(row?.held)).toBe(0)
    })), 30_000)

  test('a defect of the program suspends the entity, and its messages are answered Suspended', () =>
    onRunner(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      yield* create(0, 'c1')
      expect(yield* send({ _tag: 'Break' }, 'm1')).toBe('{"_tag":"Suspended"}')
      const [row] = yield* sql<{ cause: string | null }>`SELECT suspended_cause AS cause FROM entities WHERE id = 'one'`
      expect(row?.cause).toContain('broken')
      expect(yield* send({ _tag: 'Add', n: 1 }, 'm2')).toBe('{"_tag":"Suspended"}')
    })), 30_000)

  test('a creation the program dies on stores nothing, saves no reply, and is delivered again', () =>
    onRunner(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const clientOf = yield* doorOf('Tally').client
      yield* clientOf('one').Create({ version: 1, request: caller('c1'), message: JSON.stringify({ start: -1 }) }, {
        discard: true,
      })
      yield* Effect.sleep('1500 millis')
      expect(yield* sql`SELECT 1 FROM entities`).toEqual([])
      expect(yield* sql`SELECT 1 FROM cluster_replies`).toEqual([])
      const messages = yield* sql<{ processed: number }>`SELECT processed FROM cluster_messages WHERE tag = 'Create'`
      expect(messages.map(({ processed }) => Number(processed))).toEqual([0])
    })), 30_000)

  test('what a door step sets going starts once it commits, and its completion is stepped by the loop', () =>
    onRunner(Effect.gen(function*() {
      yield* create(0, 'c1')
      expect(yield* send({ _tag: 'Ask' }, 'm1')).toBe('{"_tag":"Accepted"}')
      expect(yield* eventually(stateOf, (state) => state?.n === 100)).toEqual({ n: 100, asking: false })
      expect(asked).toBe(1)
      // A message after the completion is stepped from the machine the loop committed.
      expect(yield* send({ _tag: 'Add', n: 1 }, 'm2')).toBe('{"_tag":"Accepted"}')
      expect(yield* stateOf).toEqual({ n: 101, asking: false })
    })), 30_000)

  test('an operation a door step sets going runs outside the step transaction', () =>
    onRunner(Effect.gen(function*() {
      yield* create(0, 'c1')
      expect(yield* send({ _tag: 'Ask' }, 'm1')).toBe('{"_tag":"Accepted"}')
      yield* eventually(stateOf, (state) => state?.n === 100)
      // The operation is forked by the step that settles the machine, inside that step's transaction. A fork that
      // kept the transaction in the operation's context would make its `afterCommit` die, the step having ended.
      expect(afterCommit).toBe('at once')
    })), 30_000)

  test('a door step whose commit fails is dropped, starts nothing, and is stepped again', () => {
    let failed = false
    let received = 0
    return onRunner(
      Effect.gen(function*() {
        yield* create(0, 'c1')
        expect(yield* send({ _tag: 'Ask' }, 'm1')).toBe('{"_tag":"Accepted"}')
        expect(failed).toBe(true)
        expect(yield* eventually(stateOf, (state) => state?.n === 100)).toEqual({ n: 100, asking: false })
        expect(asked).toBe(1)
        // The message was stepped twice: once in the transaction that failed, once in the one that committed.
        expect(received).toBe(2)
      }),
      // The first step of `Ask` writes a row that breaks a deferred foreign key, so that its COMMIT fails.
      (sql) => (said) =>
        said._tag !== 'Reached' || said.point !== 'BeforeCommit' || said.event._tag !== 'Receive'
          ? Effect.void
          : (received++, failed)
          ? Effect.void
          : Effect.gen(function*() {
            failed = true
            yield* sql`INSERT INTO child (parent) VALUES (1)`
          }).pipe(Effect.orDie),
    )
  }, 30_000)
})

describe('the shards of a runner on Cluster', () => {
  /** Which runner an operation runs on, by its port. */
  class Where extends Context.Service<Where, { readonly port: number }>()('test/Where') {}
  type Bell = {
    state: Readonly<{
      who: string
      asking: boolean
      ring: number | null
      rung: boolean
      n: number
      relay: string | null
      relayed: string | null
    }>
    flags: Readonly<{ who: string }>
    inbound:
      | Readonly<{ _tag: 'Ask' }>
      | Readonly<{ _tag: 'Ring'; at: number }>
      | Readonly<{ _tag: 'Relay'; to: string }>
      | Readonly<{ _tag: 'Poke' }>
      | Readonly<{ _tag: 'Break' }>
    internal: Readonly<{ _tag: 'Answered' }> | Readonly<{ _tag: 'Rang' }> | Readonly<{ _tag: 'Relayed'; what: string }>
    operation: Readonly<{ _tag: 'Ask'; who: string }> | Readonly<{ _tag: 'Relay'; to: string }>
    key: 'ask' | 'ring' | 'relay'
    parameter: {}
    rejection: never
    sender: Readonly<{ user: string }>
    projection: number
    index: never
    services: Where | Entities
  }
  /** What each operation did in the test under way, as a line such as `e1 started on 2`. */
  let seen: Array<string> = []
  /** Whether `Ask` answers: while it does not, it waits until it is interrupted. */
  let answers = false
  const bell: Program<Bell> = {
    name: 'Bell',
    keys: { ask: null, ring: null, relay: null },
    schemas: {
      state: Schema.Struct({
        who: Schema.String,
        asking: Schema.Boolean,
        ring: Schema.NullOr(Schema.Int),
        rung: Schema.Boolean,
        n: Schema.Int,
        relay: Schema.NullOr(Schema.String),
        relayed: Schema.NullOr(Schema.String),
      }),
      flags: Schema.Struct({ who: Schema.String }),
      inbound: Schema.Union([
        Schema.TaggedStruct('Ask', {}),
        Schema.TaggedStruct('Ring', { at: Schema.Int }),
        Schema.TaggedStruct('Relay', { to: Schema.String }),
        Schema.TaggedStruct('Poke', {}),
        Schema.TaggedStruct('Break', {}),
      ]),
      internal: Schema.Union([
        Schema.TaggedStruct('Answered', {}),
        Schema.TaggedStruct('Rang', {}),
        Schema.TaggedStruct('Relayed', { what: Schema.String }),
      ]),
      operation: Schema.Union([
        Schema.TaggedStruct('Ask', { who: Schema.String }),
        Schema.TaggedStruct('Relay', { to: Schema.String }),
      ]),
      rejection: Schema.Never,
      sender: Schema.Struct({ user: Schema.String }),
      projection: Schema.Int,
    },
    init: ({ who }) => ({ who, asking: false, ring: null, rung: false, n: 0, relay: null, relayed: null }),
    update: (message) => (state) => {
      switch (message._tag) {
        case 'Ask':
          return { ...state, asking: true }
        case 'Ring':
          return { ...state, ring: message.at }
        case 'Relay':
          return { ...state, relay: message.to }
        case 'Poke':
          return { ...state, n: state.n + 1 }
        case 'Break':
          return defect('broken')
        case 'Answered':
          return { ...state, asking: false, n: state.n + 100 }
        case 'Rang':
          return { ...state, ring: null, rung: true }
        case 'Relayed':
          return { ...state, relay: null, relayed: message.what }
      }
    },
    durable: (state) => ({
      ...(state.asking ? { ask: { _tag: 'Ask', who: state.who } as const } : {}),
      ...(state.ring !== null ? { ring: timer(DateTime.makeUnsafe(state.ring), { _tag: 'Rang' } as const) } : {}),
      ...(state.relay !== null ? { relay: { _tag: 'Relay', to: state.relay } as const } : {}),
    }),
    operations: {
      // Creates the entity `to`, which is there already, and pokes it: what each answered is the entity's state.
      Relay: operation(({ to }) =>
        Effect.gen(function*() {
          const created = yield* createFrom(bell, to, { who: to }, 'make')
          const poked = yield* sendFrom(bell, to, { _tag: 'Poke' }, 'poke')
          return { _tag: 'Relayed', what: `${created._tag}/${poked._tag}` } as const
        })),
      Ask: operation(({ who }) =>
        Effect.gen(function*() {
          const { port } = yield* Where
          seen.push(`${who} started on ${port}`)
          if (!answers) {
            yield* Effect.never.pipe(
              Effect.onInterrupt(() => Effect.sync(() => void seen.push(`${who} interrupted on ${port}`))),
            )
          }
          return { _tag: 'Answered' } as const
        })),
    },
    project: ({ n }) => n,
    indexes: {},
  }
  const shardsPerGroup = 4
  const shards = Array.from({ length: shardsPerGroup }, (_, i) => ShardId.make('default', i + 1))
  const caller = (id: string) => JSON.stringify({ _tag: 'Caller', sender: { user: 'u' }, id })

  /** The consumer of `bell`'s projection the runners declare. */
  const queue = { consumers: { projection: ['queue'] } } as const
  /** A runner of the runtime: how many shards it holds, whether it holds an entity's, its context, and `bell`. */
  type Runner = Readonly<{
    count: () => number
    holds: (id: string) => boolean
    context: Context.Context<Sharding.Sharding>
    bell: Handle<Bell, (typeof queue)['consumers']>
  }>

  /**
   * Runs `run` with a function that starts a runner of the runtime on one SQLite file, at a port, whose runtime deploys
   * `bell` until the scope the runner is started in closes. `said` is told what the runtime does. The lease is 3 s, as
   * in the tests of two runners above.
   */
  const onFile = async (
    run: (
      start: (port: number, said?: (said: Said) => void) => Effect.Effect<Runner, never, Scope.Scope>,
    ) => Effect.Effect<void, unknown, Scope.Scope | SqlClient.SqlClient>,
    options: Parameters<typeof launch>[0] = {},
  ) => {
    const directory = mkdtempSync(join(tmpdir(), 'effect-tea-durable-test-'))
    const store = SqliteClient.layer({ filename: join(directory, 'store.db') })
    const start = (port: number, said?: (said: Said) => void) =>
      Effect.gen(function*() {
        const context = yield* Layer.build(
          sharding([bell]).pipe(
            Layer.provideMerge(Runners.layerNoop),
            Layer.provideMerge(SqlMessageStorage.layer),
            Layer.provide([Layer.orDie(SqlRunnerStorage.layer), RunnerHealth.layerNoop]),
            Layer.provideMerge(ShardingConfig.layer({
              runnerAddress: Option.some(RunnerAddress.make('localhost', port)),
              shardsPerGroup,
              refreshAssignmentsInterval: Duration.millis(50),
              runnerHealthCheckInterval: Duration.millis(50),
              shardLockRefreshInterval: Duration.millis(100),
              shardLockExpiration: Duration.seconds(3),
              entityMessagePollInterval: Duration.millis(100),
            })),
            // Each runner its own connection, as a runner of its own process has: a layer built once is shared.
            Layer.provideMerge(SqliteClient.layer({ filename: join(directory, 'store.db') })),
            Layer.provide(Digest.layerWebCrypto),
          ),
        ).pipe(Effect.orDie)
        const probe = (told: Said) => Effect.sync(() => said?.(told))
        const runtime = yield* Effect.provide(Effect.provideService(launch(options), Probe, probe), context)
        const deployed = yield* Effect.provide(Effect.provideService(runtime.deploy(bell, queue), Where, { port }), context)
        const held = context.mapUnsafe.get(Sharding.Sharding.key) as Sharding.Sharding['Service']
        return {
          count: () => shards.filter((shard) => held.hasShardId(shard)).length,
          holds: (id: string) => held.hasShardId(held.getShardId(EntityId.make(id), 'default')),
          context: context as Context.Context<Sharding.Sharding>,
          bell: deployed,
        }
      })
    seen = []
    answers = false
    try {
      await Effect.runPromise(Effect.scoped(run(start)).pipe(Effect.provide(store)) as Effect.Effect<void, unknown>)
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }
  const until = <A>(read: Effect.Effect<A, unknown, SqlClient.SqlClient>, done: (a: A) => boolean) =>
    Effect.repeat(read, { schedule: Schedule.spaced('25 millis'), until: done }).pipe(Effect.timeout('15 seconds'))
  const create = (runner: Runner, who: string) =>
    Effect.provide(
      Effect.flatMap(doorOf('Bell').client, (clientOf) =>
        clientOf(who).Create({ version: 1, request: caller(`c-${who}`), message: JSON.stringify({ who }) })),
      runner.context,
    )
  const send = (runner: Runner, who: string, inbound: Bell['inbound'], request: string) =>
    Effect.provide(
      Effect.flatMap(doorOf('Bell').client, (clientOf) =>
        clientOf(who).Message({ version: 1, request: caller(request), message: JSON.stringify(inbound) })),
      runner.context,
    )
  const stateOf = (who: string) =>
    Effect.flatMap(
      Effect.service(SqlClient.SqlClient),
      (sql) =>
        Effect.map(sql<{ state: string }>`SELECT state FROM entities WHERE id = ${who}`, ([row]) =>
          row === undefined ? undefined : JSON.parse(row.state) as Bell['state']),
    )

  test('a timer of an entity no runner holds is woken by the runner that holds its shard', () => {
    const unloaded: Array<string> = []
    return onFile((start) =>
      Effect.gen(function*() {
        const runner = yield* start(1, (said) => {
          if (said._tag === 'Unloaded') unloaded.push(said.entity.id)
        })
        yield* until(Effect.sync(runner.count), (n) => n === shardsPerGroup)
        yield* create(runner, 'one')
        const at = DateTime.toEpochMillis(yield* DateTime.now) + 1_500
        yield* send(runner, 'one', { _tag: 'Ring', at }, 'm1')
        // The entity is unloaded long before its timer is due, so that only the waker can wake it.
        yield* until(Effect.sync(() => unloaded.length), (n) => n > 0)
        expect((yield* stateOf('one'))?.rung).toBe(false)
        expect(yield* until(stateOf('one'), (state) => state?.rung === true)).toMatchObject({ ring: null, rung: true })
        expect(DateTime.toEpochMillis(yield* DateTime.now)).toBeGreaterThanOrEqual(at)
      }), { passivate: { millis: 200 } })
  }, 30_000)

  test('an entity left with work is activated by the runner that gains its shard', () =>
    onFile((start) =>
      Effect.gen(function*() {
        const scope = yield* Scope.make()
        const first = yield* Scope.provide(start(1), scope)
        yield* until(Effect.sync(first.count), (n) => n === shardsPerGroup)
        yield* create(first, 'one')
        yield* send(first, 'one', { _tag: 'Ask' }, 'm1')
        yield* until(Effect.sync(() => seen), (lines) => lines.includes('one started on 1'))
        // The runner stops with the operation under way, and nothing sends to the entity again.
        yield* Scope.close(scope, Exit.void)
        answers = true
        const second = yield* start(2)
        yield* until(Effect.sync(second.count), (n) => n === shardsPerGroup)
        expect(yield* until(stateOf('one'), (state) => state?.n === 100)).toMatchObject({ asking: false, n: 100 })
        expect(seen).toContain('one started on 2')
      })), 30_000)

  test('a shard that moves to a second runner crashes its entities on the first, and the second activates them', () =>
    onFile((start) =>
      Effect.gen(function*() {
        const first = yield* start(1)
        yield* until(Effect.sync(first.count), (n) => n === shardsPerGroup)
        const ids = Array.from({ length: 8 }, (_, i) => `e${i}`)
        for (const id of ids) {
          yield* create(first, id)
          yield* send(first, id, { _tag: 'Ask' }, `m-${id}`)
        }
        yield* until(Effect.sync(() => seen.length), (n) => n === ids.length)
        const second = yield* start(2)
        yield* until(
          Effect.sync(() => [first.count(), second.count()] as const),
          ([one, two]) => one > 0 && two > 0 && one + two === shardsPerGroup,
        )
        const moved = ids.filter((id) => second.holds(id))
        const kept = ids.filter((id) => first.holds(id))
        expect(moved.length).toBeGreaterThan(0)
        expect(kept.length).toBeGreaterThan(0)
        const expected = moved.flatMap((id) => [`${id} interrupted on 1`, `${id} started on 2`])
        yield* until(Effect.sync(() => seen), (lines) => expected.every((line) => lines.includes(line)))
        for (const id of kept) {
          expect(seen).not.toContain(`${id} interrupted on 1`)
          expect(seen).not.toContain(`${id} started on 2`)
        }
      })), 30_000)

  test('an operation creates and sends through the door, and a resumption on another runner wakes it', () =>
    onFile((start) =>
      Effect.gen(function*() {
        const first = yield* start(1)
        const second = yield* start(2)
        yield* until(
          Effect.sync(() => [first.count(), second.count()] as const),
          ([one, two]) => one > 0 && two > 0 && one + two === shardsPerGroup,
        )
        const ids = Array.from({ length: 64 }, (_, i) => `r${i}`)
        const sender = ids.find((id) => first.holds(id))!
        const receiver = ids.find((id) => second.holds(id))!
        yield* create(first, sender)
        yield* create(first, receiver)
        expect(yield* send(first, receiver, { _tag: 'Break' }, 'm-break')).toBe('{"_tag":"Suspended"}')
        yield* send(first, sender, { _tag: 'Relay', to: receiver }, 'm-relay')
        // The operation on the first runner is answered `Suspended`, and waits: nothing on its runner resumes the
        // receiver, so only `Resumed`, from the step on the second runner, wakes it.
        yield* until(Effect.flatMap(Effect.service(SqlClient.SqlClient), (sql) =>
          sql<{ held: number }>`SELECT COUNT(*) AS held FROM waiting`), ([row]) => row?.held === 1)
        expect((yield* stateOf(sender))?.relayed).toBe(null)
        expect(yield* first.bell.discard(receiver)).toEqual({ _tag: 'Discarded' })
        expect(yield* until(stateOf(sender), (state) => state?.relayed !== null)).toMatchObject({
          relay: null,
          relayed: 'AlreadyExists/Accepted',
        })
        expect((yield* stateOf(receiver))?.n).toBe(1)
        const [left] = yield* Effect.flatMap(Effect.service(SqlClient.SqlClient), (sql) =>
          sql<{ held: number }>`SELECT COUNT(*) AS held FROM waiting`)
        expect(left?.held).toBe(0)
      })), 30_000)

  test('a consumer that waits is woken by a commit of another runner, within its poll', () =>
    onFile((start) =>
      Effect.gen(function*() {
        const first = yield* start(1)
        const second = yield* start(2)
        yield* until(
          Effect.sync(() => [first.count(), second.count()] as const),
          ([one, two]) => one > 0 && two > 0 && one + two === shardsPerGroup,
        )
        const who = Array.from({ length: 64 }, (_, i) => `w${i}`).find((id) => second.holds(id))!
        yield* first.bell.ack('projection', 'queue', yield* first.bell.feed('projection', 'queue', 100))
        const started = Date.now()
        const waiting = yield* Effect.forkChild(
          first.bell.feed('projection', 'queue', 100, { wait: { millis: 10_000 } }),
        )
        yield* Effect.sleep('100 millis')
        // The second runner commits the creation, and tells its own readings only.
        yield* create(second, who)
        const rows = yield* Fiber.join(waiting)
        expect(rows.map(({ id }) => id)).toEqual([who])
        // Woken within Cluster's poll of replies, 200 ms, and not at the wait's 10 s.
        expect(Date.now() - started).toBeLessThan(5_000)
      })), 30_000)
})
