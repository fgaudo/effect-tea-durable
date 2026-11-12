/**
 * What the runtime does once the disk under its database is really full, for decisions 0223 and 0278. The database
 * is a file of SQLite in WAL mode, the client's default, on a volume of fixed size that `FULL_VOLUME` names: the CI
 * on Linux mounts one, and the spike is skipped without it. Unlike `spikes/full-database.test.ts`, nothing caps the
 * file: the WAL, the database and the volume fill together.
 *
 * A first process declares two consumers, one that reads once and never acks and one that acks every row, and sends
 * until a step cannot commit. It looks at what still answers. A second process deploys without the consumer that
 * stalled, forgets it and prunes, then sends again. A file of the volume's, dropped once the second process has
 * tried, stands for room an operator frees: the forget and the prune are tried again after it.
 *
 * The prune deletes in batches, each a transaction of its own (decision 0245). Its first batch fails on the full
 * volume as one prune did, and once room is freed the batches together take about as much of it as one prune took.
 *
 * A second test, for bug 50 of the roadmap and decision 0278, fills the volume again, and frees the room while
 * callers retry their steps. The operator forgets and prunes a second after the room is freed, and the callers go on
 * beside the prune.
 * The callers' steps take the room freed before the forget, so the prune fails as on the full volume. The callers
 * then stop, more room is freed, and the forget and the prune commit.
 *
 * A third test arms entities with a timer due an hour after their creation, and launches the second process with a
 * clock two hours ahead, with no callers. The timers fire on the full volume, and their steps are retried once room
 * is freed: the steps the runtime takes of its own, which a procedure that stops the callers does not stop. They are
 * as many as the work stored as due, so they take part of the room freed, and the forget and the prune commit.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Clock from 'effect/Clock'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Logger from 'effect/Logger'
import * as Schema from 'effect/Schema'
import * as Fiber from 'effect/Fiber'
import * as Ref from 'effect/Ref'
import { SqlClient } from 'effect/sql'
import { existsSync, mkdtempSync, rmSync, statfsSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTables, launch, noWork, program, timer } from '../src/index.ts'

// An empty value names no volume: taken as a path, it would fill the folder the run starts in.
const volume = Bun.env['FULL_VOLUME'] || undefined

const notes = program({
  // `at` is the time of an armed entity's timer, in millis.
  state: Schema.Struct({ count: Schema.Int, at: Schema.NullOr(Schema.Int) }),
  flags: Schema.Struct({ armed: Schema.Boolean }),
  inbound: Schema.TaggedUnion({ Add: { text: Schema.String } }),
  internal: Schema.TaggedUnion({ Tick: {} }),
  operation: Schema.Never,
  rejection: Schema.Never,
  sender: Schema.Struct({ id: Schema.String }),
  projection: Schema.Struct({ count: Schema.Int, last: Schema.String }),
})({
  name: 'Notes',
  keys: ['tick'],
  // An armed entity's timer is due an hour after its creation, which only a clock ahead reaches.
  init: ({ armed }, at) => ({ count: 0, at: armed ? DateTime.toEpochMillis(at) + 3_600_000 : null }),
  update: (message) => (state) => ({ count: state.count + 1, at: message._tag === 'Tick' ? null : state.at }),
  work: (state) =>
    state.at === null ? noWork : { tick: timer(DateTime.makeUnsafe(state.at), { _tag: 'Tick' as const }) },
  operations: {},
  // Each step changes the projection, so each writes a row of about 16 KB in the topic `projection`.
  project: (state) => ({ count: state.count, last: 'x'.repeat(16_000) }),
  indexes: {},
})

const sender = { id: 'ada' }

const shown = (exit: Exit.Exit<unknown, unknown>) =>
  Exit.isSuccess(exit) ? `success ${JSON.stringify(exit.value) ?? ''}` : String(exit.cause).split('\n')[0]

/** The sizes of the database's files and the room left on the volume, in KB. */
const sizes = (filename: string) => {
  const size = (path: string) => existsSync(path) ? Math.round(statSync(path).size / 1024) : null
  const { bavail, bsize } = statfsSync(filename)
  return { database: size(filename), wal: size(`${filename}-wal`), free: Math.round((bavail * bsize) / 1024) }
}

const sending = (handle: Effect.Success<ReturnType<typeof deployed>>) => (id: string, index: number) =>
  handle.send(id, { _tag: 'Add', text: 'note' }, { requestId: `s-${id}-${index}`, sender, keep: 'forever' }).pipe(
    Effect.timeout('5 seconds'),
    Effect.exit,
  )

const deployed = (consumers: ReadonlyArray<'stalled' | 'current'>) =>
  Effect.flatMap(launch({ log: { partitions: 4 } }), (runtime) =>
    runtime.deploy(notes, { consumers: { projection: consumers } }))

/** The first process: it fills the volume under a consumer that stalled. */
const filling = (filename: string, armed: ReadonlyArray<string> = []) =>
  Effect.scoped(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const [mode] = yield* sql<{ journal_mode: string }>`PRAGMA journal_mode`
    console.log('journal mode:', mode?.journal_mode)
    const handle = yield* deployed(['stalled', 'current'])
    const sendOnce = sending(handle)
    for (const id of ['n1', 'n2', 'n3']) {
      yield* handle.create(id, { flags: { armed: false }, requestId: `c-${id}`, sender })
    }
    for (const id of armed) yield* handle.create(id, { flags: { armed: true }, requestId: `c-${id}`, sender })
    // `stalled` reads once and never acks, so it holds every row of its topic.
    yield* handle.fetch('projection', 'stalled', 1)
    let sent = 0
    let failed: Exit.Exit<unknown, unknown> | undefined
    for (let index = 0; index < 100_000 && failed === undefined; index++) {
      const exit = yield* sendOnce(`n${(index % 3) + 1}`, index)
      if (Exit.isSuccess(exit)) sent++
      else failed = exit
    }
    console.log('sends that committed before the volume was full:', sent, sizes(filename))
    console.log('the send that could not commit:', failed === undefined ? 'none' : shown(failed))
    const read = yield* Effect.exit(handle.read('n1'))
    const consumers = yield* Effect.exit(handle.consumers)
    const otherEntity = yield* sendOnce('n2', 1_000_000)
    console.log('a read once full:', Exit.isSuccess(read) ? 'given' : shown(read))
    console.log('consumers once full:', shown(consumers))
    console.log('a send to another entity once full:', shown(otherEntity))
    // `current` reads every row and acks it: its cursors are rows written on a full volume.
    const current = yield* Effect.exit(Effect.gen(function*() {
      for (;;) {
        const rows = yield* handle.fetch('projection', 'current', 1_000)
        if (rows.length === 0) return
        yield* handle.ack('projection', 'current', rows)
      }
    }))
    const held = yield* Effect.exit(handle.prune)
    console.log('a consumer that reads and acks once full:', Exit.isSuccess(current) ? 'done' : shown(current))
    console.log('a prune behind the consumer that stalled:', shown(held), sizes(filename))
    return { sent, failed, read, consumers, current, held }
  }))

/** The second process: it deploys without the consumer that stalled, forgets it, and prunes. */
const freeing = (filename: string) =>
  Effect.scoped(Effect.gen(function*() {
    console.log('the second process launches:', sizes(filename))
    const handle = yield* deployed(['current'])
    const forgotten = yield* Effect.exit(handle.forget('projection', 'stalled'))
    const pruned = yield* Effect.exit(handle.prune)
    console.log('forget on the full volume:', shown(forgotten))
    console.log('a prune on the full volume:', shown(pruned), sizes(filename))
    return { forgotten, pruned }
  }))

/** The same process once room is freed on the volume: the forget and the prune again, then steps. */
const freed = (filename: string, ballast: string) =>
  Effect.scoped(Effect.gen(function*() {
    rmSync(ballast)
    console.log('room freed on the volume:', sizes(filename))
    const handle = yield* deployed(['current'])
    const sendOnce = sending(handle)
    const forgotten = yield* Effect.exit(handle.forget('projection', 'stalled'))
    const pruned = yield* Effect.exit(handle.prune)
    console.log('forget once room is freed:', shown(forgotten))
    console.log('a prune once room is freed:', shown(pruned), sizes(filename))
    let again = 0
    for (let index = 0; index < 50; index++) {
      if (Exit.isSuccess(yield* sendOnce(`n${(index % 3) + 1}`, 2_000_000 + index))) again++
    }
    console.log('sends after the prune, of 50:', again, sizes(filename))
    return { forgotten, pruned, again }
  }))

/**
 * The second process once room is freed while callers retry: one caller for each entity sends for ever, the room is
 * freed, and a second later the operator forgets and prunes. The callers stop once the prune ends.
 */
const freedBesideSteps = (filename: string, ballast: string, second: string) =>
  Effect.scoped(Effect.gen(function*() {
    const handle = yield* deployed(['current'])
    const sendOnce = sending(handle)
    const committed = yield* Ref.make(0)
    const refused = yield* Ref.make(0)
    const caller = (id: string) =>
      Effect.forever(Effect.flatMap(Effect.suspend(() => sendOnce(id, Math.random())), (exit) =>
        Ref.update(Exit.isSuccess(exit) ? committed : refused, (count) => count + 1)))
    const callers = yield* Effect.forkChild(Effect.all(['n1', 'n2', 'n3'].map(caller), { concurrency: 'unbounded' }))
    yield* Effect.sleep('1 second')
    const beforeFree = { committed: yield* Ref.get(committed), refused: yield* Ref.get(refused) }
    rmSync(ballast)
    console.log('beside the callers, room freed:', sizes(filename), beforeFree)
    yield* Effect.sleep('1 second')
    const beforeProcedure = { committed: yield* Ref.get(committed), refused: yield* Ref.get(refused) }
    console.log('a second later, before the forget:', sizes(filename), beforeProcedure)
    const forgotten = yield* Effect.exit(handle.forget('projection', 'stalled'))
    const pruned = yield* Effect.exit(handle.prune)
    yield* Fiber.interrupt(callers)
    const afterProcedure = { committed: yield* Ref.get(committed), refused: yield* Ref.get(refused) }
    console.log('forget beside the callers:', shown(forgotten))
    console.log('a prune beside the callers:', shown(pruned), sizes(filename), afterProcedure)
    // The procedure with the callers stopped: room freed again, then the forget and the prune.
    rmSync(second)
    console.log('the callers stopped, room freed again:', sizes(filename))
    const forgottenStopped = yield* Effect.exit(handle.forget('projection', 'stalled'))
    const prunedStopped = yield* Effect.exit(handle.prune)
    console.log('a prune with the callers stopped:', shown(prunedStopped), sizes(filename))
    return { beforeFree, beforeProcedure, afterProcedure, forgotten, pruned, forgottenStopped, prunedStopped }
  }))

/** A clock `millis` ahead of the real one, whose sleeps are the real clock's. */
const ahead = (real: Clock.Clock, millis: number): Clock.Clock => ({
  currentTimeMillisUnsafe: () => real.currentTimeMillisUnsafe() + millis,
  currentTimeMillis: Effect.sync(() => real.currentTimeMillisUnsafe() + millis),
  currentTimeNanosUnsafe: () => real.currentTimeNanosUnsafe() + BigInt(millis) * 1_000_000n,
  currentTimeNanos: Effect.sync(() => real.currentTimeNanosUnsafe() + BigInt(millis) * 1_000_000n),
  monotonicTimeNanosUnsafe: () => real.monotonicTimeNanosUnsafe(),
  monotonicTimeNanos: real.monotonicTimeNanos,
  sleep: (duration) => real.sleep(duration),
})

/**
 * The second process two hours ahead, with no callers: the armed entities' timers are due at launch. A second after
 * the launch room is freed, and a second later the operator forgets and prunes.
 */
const freedBesideTimers = (filename: string, ballast: string, armed: ReadonlyArray<string>) =>
  Effect.scoped(Effect.gen(function*() {
    const handle = yield* deployed(['current'])
    // How many armed entities have stored their tick: the projection counts it, and nothing else steps them.
    const ticked = Effect.map(
      Effect.forEach(armed, handle.read),
      (projections) => projections.filter((projection) => projection !== null && projection.count > 0).length,
    )
    yield* Effect.sleep('1 second')
    const beforeFree = yield* Effect.exit(ticked)
    rmSync(ballast)
    console.log('the timers due, room freed:', sizes(filename), 'ticked:', shown(beforeFree))
    yield* Effect.sleep('1 second')
    const beforeProcedure = yield* Effect.exit(ticked)
    console.log('a second later, before the forget:', sizes(filename), 'ticked:', shown(beforeProcedure))
    const forgotten = yield* Effect.exit(handle.forget('projection', 'stalled'))
    const pruned = yield* Effect.exit(handle.prune)
    const afterProcedure = yield* Effect.exit(ticked)
    console.log('forget beside the timers:', shown(forgotten))
    console.log('a prune beside the timers:', shown(pruned), sizes(filename), 'ticked:', shown(afterProcedure))
    return { beforeFree, beforeProcedure, afterProcedure, forgotten, pruned }
  }).pipe(Effect.provideServiceEffect(
    Clock.Clock,
    Effect.map(Effect.service(Clock.Clock), (real) => ahead(real, 7_200_000)),
  )))

test.skipIf(volume === undefined)('a volume that is really full stops the steps, and what frees room for them', async () => {
  const directory = mkdtempSync(join(volume ?? '', 'full-volume-'))
  const filename = join(directory, 'full.db')
  // Room an operator can free once the volume is full: 1 MB, a sixteenth of what the spike writes before it fills.
  const ballast = join(directory, 'ballast')
  writeFileSync(ballast, Buffer.alloc(1024 * 1024, 1))
  const client = SqliteClient.layer({ filename })
  const quiet = Logger.layer([])
  try {
    const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
      Effect.runPromise(effect.pipe(Effect.provide([client, quiet]), Effect.orDie))
    await run(createTables)
    const full = await run(filling(filename))
    // A launch on the full volume may fail too, which leaves an operator no call to make.
    const onFull = await run(Effect.exit(freeing(filename)))
    console.log('the second process on the full volume:', Exit.isSuccess(onFull) ? 'launched' : shown(onFull))
    const after = await run(freed(filename, ballast))
    // What decisions 0223 and 0245 rest on: a step that cannot commit dies, and the readings and acks still answer.
    // On the full volume a forget commits and a prune of the stalled consumer's rows does not, even in batches. Once
    // room is freed the prune commits, and the steps commit again.
    expect(full.sent).toBeGreaterThan(0)
    expect(full.failed !== undefined && Exit.isFailure(full.failed)).toBe(true)
    expect(Exit.isSuccess(full.read) && Exit.isSuccess(full.consumers) && Exit.isSuccess(full.current)).toBe(true)
    expect(Exit.isSuccess(onFull)).toBe(true)
    if (Exit.isSuccess(onFull)) {
      expect(Exit.isSuccess(onFull.value.forgotten)).toBe(true)
      expect(Exit.isFailure(onFull.value.pruned)).toBe(true)
    }
    expect(Exit.isSuccess(after.pruned) && after.pruned.value).toBeGreaterThan(0)
    expect(after.again).toBe(50)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}, 300_000)

test.skipIf(volume === undefined)('the room freed on a full volume, beside the steps callers retry', async () => {
  const directory = mkdtempSync(join(volume ?? '', 'full-volume-steps-'))
  const filename = join(directory, 'full.db')
  const ballast = join(directory, 'ballast')
  const second = join(directory, 'second')
  writeFileSync(ballast, Buffer.alloc(1024 * 1024, 1))
  writeFileSync(second, Buffer.alloc(1024 * 1024, 1))
  const client = SqliteClient.layer({ filename })
  const quiet = Logger.layer([])
  try {
    const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
      Effect.runPromise(effect.pipe(Effect.provide([client, quiet]), Effect.orDie))
    await run(createTables)
    const full = await run(filling(filename))
    const beside = await run(freedBesideSteps(filename, ballast, second))
    // Bug 50: no step commits on the full volume, the steps take the room freed within a second, and the prune of
    // the procedure of decision 0223 then fails though the forget commits.
    expect(full.sent).toBeGreaterThan(0)
    expect(beside.beforeFree.committed).toBe(0)
    expect(beside.beforeProcedure.committed).toBeGreaterThan(0)
    expect(Exit.isSuccess(beside.forgotten)).toBe(true)
    expect(Exit.isFailure(beside.pruned)).toBe(true)
    // With the callers stopped, the room freed again holds the forget and the prune.
    expect(Exit.isSuccess(beside.forgottenStopped)).toBe(true)
    expect(Exit.isSuccess(beside.prunedStopped) && beside.prunedStopped.value).toBeGreaterThan(0)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}, 300_000)

test.skipIf(volume === undefined)('the room freed on a full volume, beside the timers the runtime fires', async () => {
  const directory = mkdtempSync(join(volume ?? '', 'full-volume-timers-'))
  const filename = join(directory, 'full.db')
  const ballast = join(directory, 'ballast')
  writeFileSync(ballast, Buffer.alloc(1024 * 1024, 1))
  // Thirty steps of about 16 KB each: about half the room freed, if each commits once.
  const armed = Array.from({ length: 30 }, (_, index) => `t${index}`)
  const client = SqliteClient.layer({ filename })
  const quiet = Logger.layer([])
  try {
    const run = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
      Effect.runPromise(effect.pipe(Effect.provide([client, quiet]), Effect.orDie))
    await run(createTables)
    const full = await run(filling(filename, armed))
    const beside = await run(freedBesideTimers(filename, ballast, armed))
    // The timers fire on the full volume and commit nothing, then their retries take part of the room freed, and
    // the forget and the prune commit beside them.
    expect(full.sent).toBeGreaterThan(0)
    expect(Exit.isSuccess(beside.beforeFree) && beside.beforeFree.value).toBe(0)
    expect(Exit.isSuccess(beside.afterProcedure) && beside.afterProcedure.value).toBeGreaterThan(0)
    expect(Exit.isSuccess(beside.forgotten)).toBe(true)
    expect(Exit.isSuccess(beside.pruned) && beside.pruned.value).toBeGreaterThan(0)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}, 300_000)
