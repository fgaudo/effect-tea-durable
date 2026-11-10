/**
 * What the runtime does once the disk under its database is really full, for decision 0223. The database is a file of
 * SQLite in WAL mode, the client's default, on a volume of fixed size that `FULL_VOLUME` names: the CI on Linux
 * mounts one, and the spike is skipped without it. Unlike `spikes/full-database.test.ts`, nothing caps the file: the
 * WAL, the database and the volume fill together.
 *
 * A first process declares two consumers, one that reads once and never acks and one that acks every row, and sends
 * until a step cannot commit. It looks at what still answers. A second process deploys without the consumer that
 * stalled, forgets it and prunes, then sends again. A file of the volume's, dropped once the second process has
 * tried, stands for room an operator frees: the forget and the prune are tried again after it.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Logger from 'effect/Logger'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/sql'
import { existsSync, mkdtempSync, rmSync, statfsSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createTables, launch, noWork, program } from '../src/index.ts'

const volume = Bun.env['FULL_VOLUME']

const notes = program({
  state: Schema.Struct({ count: Schema.Int }),
  flags: Schema.Struct({}),
  inbound: Schema.TaggedUnion({ Add: { text: Schema.String } }),
  internal: Schema.Never,
  operation: Schema.Never,
  rejection: Schema.Never,
  sender: Schema.Struct({ id: Schema.String }),
  projection: Schema.Struct({ count: Schema.Int, last: Schema.String }),
})({
  name: 'Notes',
  keys: [],
  init: () => ({ count: 0 }),
  update: () => (state) => ({ count: state.count + 1 }),
  work: () => noWork,
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
const filling = (filename: string) =>
  Effect.scoped(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const [mode] = yield* sql<{ journal_mode: string }>`PRAGMA journal_mode`
    console.log('journal mode:', mode?.journal_mode)
    const handle = yield* deployed(['stalled', 'current'])
    const sendOnce = sending(handle)
    for (const id of ['n1', 'n2', 'n3']) yield* handle.create(id, { flags: {}, requestId: `c-${id}`, sender })
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
    // What decision 0223 rests on: a step that cannot commit dies, and the readings and acks still answer. On the
    // full volume a forget commits and a prune of the stalled consumer's rows does not. Once room is freed the prune
    // commits, and the steps commit again.
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
