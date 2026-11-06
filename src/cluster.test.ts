/**
 * The runtime's `Sharding` on Cluster: the versions a launch records, the `RunnerHealth` that answers by them, and
 * two runners on one SQLite file during a rolling deploy (decision 0159).
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { describe, expect, test } from 'bun:test'
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
import { Digest } from 'effect/crypto'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schedule from 'effect/Schedule'
import * as Schema from 'effect/Schema'
import * as Scope from 'effect/Scope'
import { SqlClient } from 'effect/sql'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { addressText, byVersion, door, doorOf, launch, sharding } from './cluster.ts'
import { defect, InvariantDefect, noWork, operation, type Program, rejectWith, versionOf } from './program.ts'
import { Probe, type Said } from './runtime.ts'
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
   * Runs `run` with a function that starts a runner of the runtime on one SQLite file, at a port and with programs,
   * and gives back how many shards it holds. The lease is 3 s, since SQLite's `CURRENT_TIMESTAMP` counts whole
   * seconds, and a lease of 1 s drops a runner that has just beaten.
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
        // Each program's door steps a request by writing the version that stepped it, in Cluster's transaction.
        const doors = programs.map((program) =>
          door(program, (delivered) =>
            Effect.gen(function*() {
              const sql = yield* SqlClient.SqlClient
              yield* sql`CREATE TABLE IF NOT EXISTS stepped (request TEXT, version INTEGER)`
              yield* sql`INSERT INTO stepped (request, version) VALUES (${delivered.request}, ${versionOf(program)})`
              return `stepped at ${versionOf(program)}`
            }).pipe(Effect.orDie))
        )
        const context = yield* Layer.build(
          Layer.mergeAll(doors[0]!, ...doors.slice(1)).pipe(
            Layer.provideMerge(sharding(programs)),
            Layer.provideMerge(Runners.layerNoop),
            Layer.provideMerge(SqlMessageStorage.layer),
            Layer.provide([Layer.orDie(SqlRunnerStorage.layer), RunnerHealth.layerNoop]),
            Layer.provide(ShardingConfig.layer({
              runnerAddress: Option.some(RunnerAddress.make('localhost', port)),
              shardsPerGroup,
              refreshAssignmentsInterval: Duration.millis(50),
              runnerHealthCheckInterval: Duration.millis(50),
              shardLockRefreshInterval: Duration.millis(100),
              shardLockExpiration: Duration.seconds(3),
              entityMessagePollInterval: Duration.millis(100),
            })),
            Layer.provideMerge(store),
            Layer.provide(Digest.layerWebCrypto),
          ),
        ).pipe(Effect.orDie)
        const held = context.mapUnsafe.get(Sharding.Sharding.key) as Sharding.Sharding['Service']
        return Object.assign(() => shards.filter((shard) => held.hasShardId(shard)).length, { context })
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
        const older = yield* start(1, [at('Toy', 1)])
        yield* until(older, (n) => n === shardsPerGroup)
        // A launch of the newer version is recorded, and its runner is not up yet. The older runner is the only one,
        // and Cluster never marks its last runner unhealthy, so it keeps its shards.
        yield* recordVersions('localhost:9', [{ name: 'Toy', version: 2 }])
        const clientOf = yield* Effect.provide(doorOf('Toy').client, older.context)
        yield* clientOf('one').Message({ version: 1, request: 'r1', message: 'm' }, { discard: true })

        // The older runner's step dies, again and again, and nothing is stepped, answered or marked processed.
        yield* Effect.sleep('1500 millis')
        expect(older()).toBe(shardsPerGroup)
        const before = yield* sql<{ processed: number }>`SELECT processed FROM cluster_messages WHERE tag = 'Message'`
        expect(before.map(({ processed }) => Number(processed))).toEqual([0])
        expect(yield* sql`SELECT 1 FROM cluster_replies`).toEqual([])
        expect(yield* sql`SELECT 1 FROM sqlite_master WHERE name = 'stepped'`).toEqual([])

        // A runner of the newest version takes the shards, and steps the message once.
        const newer = yield* start(2, [at('Toy', 2)])
        yield* until(newer, (n) => n === shardsPerGroup)
        yield* Effect.repeat(sql<{ version: number }>`SELECT version FROM stepped`, {
          schedule: Schedule.spaced('50 millis'),
          until: (rows) => rows.length > 0,
        }).pipe(Effect.timeout('15 seconds'))
        const stepped = yield* sql<{ request: string; version: number }>`SELECT request, version FROM stepped`
        expect(stepped).toEqual([{ request: 'r1', version: 2 }])
        const after = yield* sql<{ processed: number }>`SELECT processed FROM cluster_messages WHERE tag = 'Message'`
        expect(after.map(({ processed }) => Number(processed))).toEqual([1])
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
    operations: { Ask: operation(() => Effect.sync(() => (asked++, { _tag: 'Answered' } as const))) },
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
      Layer.provide(ShardingConfig.layer({
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
      const runtime = yield* (probe === undefined ? launch() : Effect.provideService(launch(), Probe, probe(sql)))
      yield* runtime.deploy(tally)
      yield* run
    })
    asked = 0
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
