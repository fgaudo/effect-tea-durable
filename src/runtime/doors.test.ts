/**
 * The tests of the runtime's steps on Cluster ([`doors.ts`](doors.ts)), with a Cluster the test plays: the step of a
 * request that reaches a door, in Cluster's transaction, and the shards a runner holds and lets go.
 */
import { describe, expect, test } from 'bun:test'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Metric from 'effect/Metric'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/sql'
import * as Tracer from 'effect/Tracer'
import { InvariantDefect, operation, type Program, rejectWith, versionOf } from '../program.ts'
import { type Delivered, launchWith, type OnCluster, Probe, type Said } from '../runtime.ts'
import { createTables, partitionOf, storage } from '../storage.ts'
import { singletonsOf } from './doors.ts'
import { client } from '../storage.test_databases.ts'
import { clusterTables, tracing } from '../runtime.test_shared.ts'

describe('the runtime on Cluster, with a Cluster the test plays', () => {
  type Relay = {
    state: Readonly<{ stage: 'idle' | 'first' | 'asking' }>
    flags: Readonly<{}>
    inbound: Readonly<{ _tag: 'Go' }>
    internal: Readonly<{ _tag: 'Firsted' }>
    operation: Readonly<{ _tag: 'First' }> | Readonly<{ _tag: 'Ask' }>
    key: 'first' | 'ask'
    parameter: {}
    rejection: never
    sender: Readonly<{ user: string }>
    projection: string
    index: never
    services: never
  }
  /** What `Ask` did in the test under way: `started`, then `interrupted` once its fiber is interrupted. */
  let asked: Array<string> = []
  const relay: Program<Relay> = {
    name: 'Relay',
    keys: { first: null, ask: null },
    schemas: {
      state: Schema.Struct({ stage: Schema.Literals(['idle', 'first', 'asking']) }),
      flags: Schema.Struct({}),
      inbound: Schema.TaggedStruct('Go', {}),
      internal: Schema.TaggedStruct('Firsted', {}),
      operation: Schema.Union([Schema.TaggedStruct('First', {}), Schema.TaggedStruct('Ask', {})]),
      rejection: Schema.Never,
      sender: Schema.Struct({ user: Schema.String }),
      projection: Schema.String,
    },
    init: () => ({ stage: 'idle' }),
    update: (message) => () => ({ stage: message._tag === 'Go' ? 'first' : 'asking' }),
    work: ({ stage }) =>
      stage === 'first'
        ? { first: { _tag: 'First' } as const }
        : stage === 'asking'
        ? { ask: { _tag: 'Ask' } as const }
        : {},
    operations: {
      First: operation(() => Effect.succeed({ _tag: 'Firsted' } as const)),
      Ask: operation(() =>
        Effect.andThen(
          Effect.sync(() => void asked.push('started')),
          Effect.never.pipe(Effect.onInterrupt(() => Effect.sync(() => void asked.push('interrupted')))),
        )
      ),
    },
    project: ({ stage }) => stage,
    indexes: {},
  }
  const caller = (id: string) => JSON.stringify({ _tag: 'Caller', sender: { user: 'u' }, id })

  /**
   * The step of the loop that handles the completion of `First`, and starts `Ask`, waits where `gated` says, and the
   * shard is let go meanwhile. Its finalizer crashes the entity under the entity's lock. Where `finalizer` is `waits`,
   * the step holds the lock where it waits, and the finalizer must not end before the step goes on. Where it is
   * `ends`, the step holds no lock there, and the finalizer ends first.
   */
  const letGo = (gated: (said: Said) => boolean, finalizer: 'waits' | 'ends') =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      asked = []
      const sql = yield* SqlClient.SqlClient
      // On Cluster the tables are created where `sharding` is built, before the runtime launches.
      yield* createTables
      yield* clusterTables
      // One shard, held until the test interrupts its singleton, which runs what the runtime runs as the shard goes.
      let step: ((delivered: Delivered) => Effect.Effect<unknown>) | null = null
      const singletons: Array<Fiber.Fiber<never>> = []
      const cluster: OnCluster = {
        shards: 1,
        versions: null,
        shardOf: () => 1,
        guard: () => Effect.void,
        holds: () => true,
        singleton: (_name, run) =>
          Effect.flatMap(
            Effect.forkScoped(Effect.scoped(Effect.andThen(run, Effect.never))),
            (fiber) => Effect.sync(() => void singletons.push(fiber)),
          ),
        register: (_program, given) =>
          Effect.sync(() => {
            step = given as (delivered: Delivered) => Effect.Effect<unknown>
          }),
        others: { version: Effect.succeed(0), millis: 1_000 },
        // These tests step the door directly, and send nothing through Cluster's client.
        create: () => Effect.die('no creation is sent through the client here'),
        send: () => Effect.die('no message is sent through the client here'),
        operate: () => Effect.die('no operator’s event is sent through the client here'),
        resume: () => Effect.die('no sender is told of a resumption here'),
      }
      const reached = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      const probe = (said: Said) =>
        gated(said) ? Effect.andThen(Deferred.succeed(reached, undefined), Deferred.await(gate)) : Effect.void
      const runtime = yield* Effect.provideService(launchWith({}, cluster), Probe, probe)
      yield* runtime.deploy(relay)
      const door = (delivered: Omit<Delivered, 'id' | 'version'>) =>
        sql.withTransaction(step!({ ...delivered, id: 'one', version: versionOf(relay) }))
      yield* door({ _tag: 'Create', request: caller('c1'), message: '{}' })
      yield* door({ _tag: 'Message', request: caller('m1'), message: JSON.stringify({ _tag: 'Go' }) })
      yield* Deferred.await(reached)
      const losing = yield* Effect.forkChild(Fiber.interrupt(singletons[0]!))
      if (finalizer === 'ends') {
        yield* Fiber.join(losing)
        // The crash forks the interruption of the entity's work. It ends before the step goes on, so that nothing
        // the step starts afterwards is stopped by it.
        yield* Effect.sleep('50 millis')
      } else {
        yield* Effect.sleep('50 millis')
        expect(losing.pollUnsafe()).toBeUndefined()
      }
      yield* Deferred.succeed(gate, undefined)
      yield* Fiber.join(losing)
      // The step committed `Ask`, which the runner that holds the shard next starts from what is stored. Here it is
      // either not started, or started and interrupted by the crash. Started after the crash, it would run beside
      // that runner, and nothing here would stop it.
      expect((yield* storage(relay, sql).load('one'))?.state).toEqual({ stage: 'asking' })
      yield* Effect.sleep('200 millis')
      expect(asked.filter((line) => line === 'started').length).toBe(asked.filter((line) => line === 'interrupted').length)
    })).pipe(Effect.provide(client('sqlite'))))

  test('a step of the loop of an entity a door loaded runs in a transaction of its own', () =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      asked = []
      const sql = yield* SqlClient.SqlClient
      yield* createTables
      yield* clusterTables
      let step: ((delivered: Delivered) => Effect.Effect<unknown>) | null = null
      const cluster: OnCluster = {
        shards: 1,
        versions: null,
        shardOf: () => 1,
        guard: () => Effect.void,
        holds: () => true,
        singleton: (_name, run) => Effect.asVoid(Effect.forkScoped(Effect.scoped(Effect.andThen(run, Effect.never)))),
        register: (_program, given) =>
          Effect.sync(() => {
            step = given as (delivered: Delivered) => Effect.Effect<unknown>
          }),
        others: { version: Effect.succeed(0), millis: 1_000 },
        // These tests step the door directly, and send nothing through Cluster's client.
        create: () => Effect.die('no creation is sent through the client here'),
        send: () => Effect.die('no message is sent through the client here'),
        operate: () => Effect.die('no operator’s event is sent through the client here'),
        resume: () => Effect.die('no sender is told of a resumption here'),
      }
      const reached = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      // The loop's step of the completion of `First` waits before its commit, inside its transaction.
      const probe = (said: Said) =>
        said._tag === 'Reached' && said.point === 'BeforeCommit' && said.event._tag === 'Handle'
          ? Effect.andThen(Deferred.succeed(reached, undefined), Deferred.await(gate))
          : Effect.void
      const runtime = yield* Effect.provideService(launchWith({}, cluster), Probe, probe)
      yield* runtime.deploy(relay)
      const door = (delivered: Omit<Delivered, 'id' | 'version'>) =>
        sql.withTransaction(step!({ ...delivered, id: 'one', version: versionOf(relay) }))
      // The door loads the entity, and forks its loop, inside the door's transaction.
      yield* door({ _tag: 'Create', request: caller('c1'), message: '{}' })
      yield* door({ _tag: 'Message', request: caller('m1'), message: JSON.stringify({ _tag: 'Go' }) })
      yield* Deferred.await(reached)
      // A transaction of another fiber waits for the loop's to end. A loop that kept the door's transaction would
      // run its step on the connection without the client's lock, and this one would begin inside it, and fail.
      const other = yield* Effect.forkChild(Effect.exit(sql.withTransaction(sql`SELECT 1`)))
      yield* Effect.sleep('50 millis')
      expect(other.pollUnsafe()).toBeUndefined()
      yield* Deferred.succeed(gate, undefined)
      expect(Exit.isSuccess(yield* Fiber.join(other))).toBe(true)
    })).pipe(Effect.provide(client('sqlite')))), 10_000)

  test('a shard let go while a step of the loop is inside its transaction waits for the step', () =>
    letGo(
      (said) => said._tag === 'Reached' && said.point === 'BeforeCommit' && said.event._tag === 'Handle',
      'waits',
    ), 10_000)

  test('an entity a shard let go took out between a step of the loop and its start starts nothing', () =>
    letGo((said) => said._tag === 'Applied' && said.event._tag === 'Handle', 'ends'), 10_000)

  test('a shard let go while a step of the loop starts what it set going waits for the start', () =>
    letGo(
      (said) => said._tag === 'Reached' && said.point === 'AfterReply' && said.event._tag === 'Handle',
      'waits',
    ), 10_000)

  test('a door’s steps link the span of the request, and an operation links the step that started it', () => {
    const { spans, tracer } = tracing()
    return Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      asked = []
      const sql = yield* SqlClient.SqlClient
      yield* createTables
      yield* clusterTables
      let step: ((delivered: Delivered) => Effect.Effect<unknown>) | null = null
      const cluster: OnCluster = {
        shards: 1,
        versions: null,
        shardOf: () => 1,
        guard: () => Effect.void,
        holds: () => true,
        singleton: (_name, run) => Effect.asVoid(Effect.forkScoped(Effect.scoped(Effect.andThen(run, Effect.never)))),
        register: (_program, given) =>
          Effect.sync(() => {
            step = given as (delivered: Delivered) => Effect.Effect<unknown>
          }),
        others: { version: Effect.succeed(0), millis: 1_000 },
        // These tests step the door directly, and send nothing through Cluster's client.
        create: () => Effect.die('no creation is sent through the client here'),
        send: () => Effect.die('no message is sent through the client here'),
        operate: () => Effect.die('no operator’s event is sent through the client here'),
        resume: () => Effect.die('no sender is told of a resumption here'),
      }
      const runtime = yield* launchWith({}, cluster)
      yield* runtime.deploy(relay)
      // Cluster runs a door's step under the span of the request it delivers: here, the span `request`.
      const door = (delivered: Omit<Delivered, 'id' | 'version'>) =>
        Effect.withSpan(sql.withTransaction(step!({ ...delivered, id: 'one', version: versionOf(relay) })), 'request')
      yield* door({ _tag: 'Create', request: caller('c1'), message: '{}' })
      yield* door({ _tag: 'Message', request: caller('m1'), message: JSON.stringify({ _tag: 'Go' }) })
      // `First` completes, and its completion is handled by the loop, which starts `Ask`.
      yield* Effect.sleep('200 millis')
      const requests = spans.filter((span) => span.name === 'request')
      const steps = spans.filter((span) => span.name === 'tea.step')
      const event = (span: Tracer.NativeSpan) => span.attributes.get('tea.event')
      const linked = (span: Tracer.NativeSpan) => span.links.map((link) => link.span)
      // The span a step links, or the span it runs under, such as the transaction's, below `outer`.
      const under = (span: Tracer.AnySpan, outer: Tracer.AnySpan): boolean =>
        span === outer || (span._tag === 'Span' && span.parent._tag === 'Some' && under(span.parent.value, outer))
      expect(steps.every((span) => span.parent._tag === 'None')).toBe(true)
      // A message that arrives with an empty mailbox is handled by its `Receive`, in the door's step.
      expect(steps.slice(0, 2).map(event)).toEqual(['Create', 'Receive'])
      expect(steps.slice(0, 2).map((span, at) => span.links.length === 1 && under(span.links[0]!.span, requests[at]!)))
        .toEqual([true, true])
      // The door's step leaves its machine uncommitted, and the loop performs what it set going once it settles it.
      const first = spans.find((span) =>
        span.name === 'tea.operation' && span.attributes.get('tea.operation') === 'First'
      )
      expect(first?.parent._tag).toBe('None')
      expect(first === undefined ? [] : linked(first)).toEqual([steps[1]!])
      expect(steps.some((span) => event(span) === 'Complete' && span.links.length === 0)).toBe(true)
    })).pipe(Effect.provide(client('sqlite')), Effect.provideService(Tracer.Tracer, tracer)))
  }, 10_000)

  test('a door’s step that rolls back counts nothing, and its request delivered again counts once', () => {
    const registry = new Map()
    return Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      asked = []
      const sql = yield* SqlClient.SqlClient
      yield* createTables
      yield* clusterTables
      let step: ((delivered: Delivered) => Effect.Effect<unknown>) | null = null
      const cluster: OnCluster = {
        shards: 1,
        versions: null,
        shardOf: () => 1,
        guard: () => Effect.void,
        holds: () => true,
        singleton: (_name, run) => Effect.asVoid(Effect.forkScoped(Effect.scoped(Effect.andThen(run, Effect.never)))),
        register: (_program, given) =>
          Effect.sync(() => {
            step = given as (delivered: Delivered) => Effect.Effect<unknown>
          }),
        others: { version: Effect.succeed(0), millis: 1_000 },
        // These tests step the door directly, and send nothing through Cluster's client.
        create: () => Effect.die('no creation is sent through the client here'),
        send: () => Effect.die('no message is sent through the client here'),
        operate: () => Effect.die('no operator’s event is sent through the client here'),
        resume: () => Effect.die('no sender is told of a resumption here'),
      }
      const runtime = yield* launchWith({}, cluster)
      yield* runtime.deploy(relay)
      const door = (delivered: Omit<Delivered, 'id' | 'version'>) =>
        step!({ ...delivered, id: 'one', version: versionOf(relay) })
      const counted = Effect.map(
        Effect.provideService(Metric.snapshot, Metric.MetricRegistry, registry),
        (snapshots) =>
          snapshots.find((snapshot) =>
            snapshot.id === 'tea.mailbox.length' && snapshot.attributes?.['tea.entity.name'] === 'Relay'
          )?.state,
      )
      const go = { _tag: 'Message', request: caller('m1'), message: JSON.stringify({ _tag: 'Go' }) } as const
      yield* sql.withTransaction(door({ _tag: 'Create', request: caller('c1'), message: '{}' }))
      // Cluster's transaction fails after the door's step, and rolls the step back: only the creation is counted.
      // The step of the next delivery settles the creation first.
      const rolled = yield* Effect.exit(sql.withTransaction(Effect.andThen(door(go), Effect.fail('rolled back'))))
      expect(Exit.isFailure(rolled)).toBe(true)
      expect(yield* counted).toMatchObject({ count: 1 })
      // Cluster delivers the request again, and it commits. The creation, the message, the completion of `First`
      // and its handling are counted once each, and only the completion's mailbox holds a message.
      yield* sql.withTransaction(door(go))
      yield* Effect.sleep('200 millis')
      expect(asked).toEqual(['started'])
      expect(yield* counted).toMatchObject({ count: 4, sum: 1 })
    })).pipe(Effect.provide(client('sqlite')), Effect.provideService(Metric.MetricRegistry, registry)))
  }, 10_000)

  // An operation's creation `init` rejects, and its message to no entity, store no entity: the door's step keeps the
  // answer for the operation's work, and answers a delivery of the same request with it, as one process does. Cluster
  // delivers the request again for a run after a crash, by then after another creator made the entity
  // (decision 0253).
  test('an operation’s request a door answered Rejected or NotFound is answered so again, though its entity exists', () =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      asked = []
      const sql = yield* SqlClient.SqlClient
      yield* createTables
      yield* clusterTables
      type Gate = {
        state: Readonly<{ told: number }>
        flags: Readonly<{ open: boolean }>
        inbound: Readonly<{ _tag: 'Tell' }>
        internal: never
        operation: never
        key: never
        parameter: {}
        rejection: 'Closed'
        sender: Readonly<{ user: string }>
        projection: number
        index: never
        services: never
      }
      const gate: Program<Gate> = {
        name: 'Gate',
        keys: {},
        schemas: {
          state: Schema.Struct({ told: Schema.Number }),
          flags: Schema.Struct({ open: Schema.Boolean }),
          inbound: Schema.TaggedStruct('Tell', {}),
          internal: Schema.Never,
          operation: Schema.Never,
          rejection: Schema.Literal('Closed'),
          sender: Schema.Struct({ user: Schema.String }),
          projection: Schema.Number,
        },
        init: ({ open }) => open ? { told: 0 } : rejectWith('Closed'),
        update: () => ({ told }) => ({ told: told + 1 }),
        work: () => ({}),
        operations: {},
        project: ({ told }) => told,
        indexes: {},
      }
      const steps = new Map<string, (delivered: Delivered) => Effect.Effect<unknown>>()
      const cluster: OnCluster = {
        shards: 1,
        versions: null,
        shardOf: () => 1,
        guard: () => Effect.void,
        holds: () => true,
        singleton: (_name, run) => Effect.asVoid(Effect.forkScoped(Effect.scoped(Effect.andThen(run, Effect.never)))),
        register: (program, given) =>
          Effect.sync(() => void steps.set(program.name, given as (delivered: Delivered) => Effect.Effect<unknown>)),
        others: { version: Effect.succeed(0), millis: 1_000 },
        // These tests step the door directly, and send nothing through Cluster's client.
        create: () => Effect.die('no creation is sent through the client here'),
        send: () => Effect.die('no message is sent through the client here'),
        operate: () => Effect.die('no operator’s event is sent through the client here'),
        resume: () => Effect.die('no sender is told of a resumption here'),
      }
      const runtime = yield* launchWith({}, cluster)
      yield* runtime.deploy(relay)
      yield* runtime.deploy(gate)
      const door = (program: Program<any>, id: string, delivered: Pick<Delivered, '_tag' | 'request' | 'message'>) =>
        sql.withTransaction(steps.get(program.name)!({ ...delivered, id, version: versionOf(program) }))
      // `one` runs `Ask`, which never ends: the work whose requests the door is delivered.
      yield* door(relay, 'one', { _tag: 'Create', request: caller('c1'), message: '{}' })
      yield* door(relay, 'one', { _tag: 'Message', request: caller('m1'), message: JSON.stringify({ _tag: 'Go' }) })
      let running: number | undefined
      while (running === undefined) {
        yield* Effect.sleep('10 millis')
        const loaded = yield* storage(relay, sql).load('one')
        running = Object.values(loaded?.keys ?? {}).find((run) => run.key.name === 'ask')?.incarnation
      }
      const fromAsk = (name: string) =>
        JSON.stringify({
          _tag: 'Operation',
          entity: { name: 'Relay', id: 'one' },
          key: { name: 'ask' },
          incarnation: running,
          name,
        })
      const closed = JSON.stringify({ open: false })
      const open = JSON.stringify({ open: true })
      const tell = JSON.stringify({ _tag: 'Tell' })
      expect(yield* door(gate, 'g', { _tag: 'Create', request: fromAsk('make'), message: closed }))
        .toEqual({ _tag: 'Create', answer: { _tag: 'Rejected', reason: 'Closed' } })
      expect(yield* door(gate, 'h', { _tag: 'Message', request: fromAsk('tell'), message: tell }))
        .toEqual({ _tag: 'Message', answer: { _tag: 'NotFound' } })
      // Another creator makes both entities.
      yield* door(gate, 'g', { _tag: 'Create', request: caller('c2'), message: open })
      yield* door(gate, 'h', { _tag: 'Create', request: caller('c3'), message: open })
      expect(yield* door(gate, 'g', { _tag: 'Create', request: fromAsk('make'), message: open }))
        .toEqual({ _tag: 'Create', answer: { _tag: 'Rejected', reason: 'Closed' } })
      expect(yield* door(gate, 'h', { _tag: 'Message', request: fromAsk('tell'), message: tell }))
        .toEqual({ _tag: 'Message', answer: { _tag: 'NotFound' } })
      expect((yield* storage(gate, sql).load('h'))?.state).toEqual({ told: 0 })
    })).pipe(Effect.provide(client('sqlite')))), 10_000)
})

// A release of Effect whose hash of Cluster differs from the storage's partition makes every deploy on Cluster die
// (decision 0273).
describe('the singletons of a program on Cluster', () => {
  const on = (shardOf: (id: string) => number) => ({ shards: 300, shardOf }) as unknown as OnCluster

  test("a singleton is found for each shard where Cluster's shard is the storage's partition", () => {
    const found = singletonsOf(on((id) => partitionOf(id, 300)), 'Toy')
    expect([...found.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: 300 }, (_, i) => i + 1))
  })

  test("a hash of Cluster that differs from the storage's dies at the first name it moves", () => {
    for (const shardOf of [(id: string) => partitionOf(`${id}!`, 300), (id: string) => partitionOf(id, 299)]) {
      expect(() => singletonsOf(on(shardOf), 'Toy')).toThrow(InvariantDefect)
    }
  })
})
