/**
 * What a step costs as the state grows, on the runtime over SQLite, for the open question on large states. Each
 * step that changes the state writes the whole state, the projection's row and, when the projection changed, a row
 * of the outbox holding the whole projection (decisions 0002, 0032, 0038). The spike runs a program whose state is
 * a list of items, created with as many as its flags say, and times the sends that add one item each. It runs it
 * twice: once with a projection that holds the items, once with one that holds their count.
 *
 * It prints what it measured, and checks only what does not depend on the machine: a step writes the state whole,
 * and the outbox keeps one copy of the projection per step.
 *
 * Seen on 2026-11-04, on Windows with Bun 1.4.2, on a file, 20 steps each. With a projection that holds the items,
 * a step took 3 ms at 10 items, 5 ms at 1 000 (48 KB), 21 ms at 10 000 (0.5 MB) and 240 ms at 100 000 (5 MB). The
 * outbox grew by the size of the state at each step. With a projection that holds a count, a step took 3, 3, 7 and
 * 60 to 110 ms. A profile of the 100 000 case puts close to half the time in SQLite's write of the row, and most of
 * the rest in the schema's encoding and `JSON.stringify`. The machine's own work is a few percent of it.
 *
 * The second test times a small entity's steps alone, then while a large entity takes 20 steps in the same runtime.
 * Seen the same day, three runs: alone, a small step took 2 to 3 ms. Beside a large entity of 10 000 items, it took
 * 13 ms on average and 210 ms at worst. Beside one of 100 000 items, it took 115 to 140 ms on average and 2.1 to
 * 3.1 s at worst. The thread gave no timer a turn for up to 2 s at once, which is several of the large entity's
 * steps in a row: `bun:sqlite` writes synchronously, and the encoding is synchronous work too.
 *
 * Before decision 0134, the large entity kept the thread for several steps because its loop (`steps` in
 * `src/runtime.ts`) went from one event to the next without yielding. Effect yields a fiber after a count of
 * operations, 2 048 by default (the JSDoc of `MaxOpsBeforeYield` in `effect/src/Scheduler.ts`), not after a time. A
 * large step is a few operations that each take long, so the loop runs many steps before its budget runs out. The
 * sender is resumed inline by the reply's `Deferred`, and puts the next message in the queue before the loop takes
 * from it, so the loop never waits either. The small entity's message waits in the dispatcher's next task, which a
 * timeline of the steps showed to run only once the large entity's sends were all done: 2 `setImmediate` callbacks
 * ran in 1.8 s. Since decision 0134 the loop yields after a step that leaves it more to do. Beside 100 000 items,
 * the small entity's worst step is then 345 to 355 ms, about one step of the large entity, and the thread is held at
 * most 350 ms at once. The average is 220 to 255 ms, since the small entity now waits for one large step at each of
 * its own.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/sql'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTables, type Json, launch, noWork, program } from '../src/index.ts'

const Item = Schema.Struct({ id: Schema.Int, label: Schema.String })

const State = Schema.Struct({ items: Schema.Array(Item) })
type State = typeof State.Type

const Inbound = Schema.TaggedUnion({ Add: { label: Schema.String } })

const Sender = Schema.Struct({ id: Schema.String })

const room = <P extends Json>(name: string, projection: Schema.Codec<P, Json>, project: (state: State) => P) =>
  program({
    state: State,
    flags: Schema.Struct({ size: Schema.Int }),
    inbound: Inbound,
    internal: Schema.Never,
    operation: Schema.Never,
    rejection: Schema.Never,
    sender: Sender,
    projection,
  })({
    name,
    keys: {},
    init: ({ size }) => ({
      items: Array.from({ length: size }, (_, id) => ({ id, label: `item number ${id} of the room` })),
    }),
    update: (message) => (state) => ({
      items: [...state.items, { id: state.items.length, label: message.label }],
    }),
    durable: () => noWork,
    operations: {},
    project,
    indexes: {},
  })

const whole = room('Whole', State, (state) => state)
const counted = room('Counted', Schema.Struct({ count: Schema.Int }), (state) => ({ count: state.items.length }))

// The sizes stop at 10 000 items, so that `bun test` stays fast; `SIZES=10,1000,10000,100000` adds the largest.
const sizes = process.env['SIZES']?.split(',').map(Number) ?? [10, 1_000, 10_000]
const steps = 20

type Measured = Readonly<{
  projection: string
  size: number
  stateBytes: number
  msPerStep: number
  outboxBytesPerStep: number
}>

const measure = (rooms: typeof whole | typeof counted, label: string, size: number) =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const runtime = yield* launch()
    const entities = yield* runtime.deploy(rooms as typeof whole)
    const sender = { id: 'ada' }
    yield* entities.create('r', { size }, { requestId: 'create', sender })
    yield* runtime.settled
    const before = yield* sql<{ bytes: number }>`SELECT coalesce(sum(length(projection)), 0) AS bytes FROM outbox`
    const started = performance.now()
    for (let step = 0; step < steps; step++) {
      yield* entities.send('r', { _tag: 'Add', label: `added ${step}` }, { requestId: `add-${step}`, sender })
    }
    yield* runtime.settled
    const elapsed = performance.now() - started
    const after = yield* sql<{ bytes: number }>`SELECT coalesce(sum(length(projection)), 0) AS bytes FROM outbox`
    const [state] = yield* sql<{ bytes: number }>`SELECT length(state) AS bytes FROM entities WHERE id = 'r'`
    const [rows] = yield* sql<{ rows: number }>`SELECT count(*) AS rows FROM outbox`
    // One row of the outbox for the creation and one per step, since each step changes what callers read.
    expect(rows?.rows).toBe(steps + 1)
    return {
      projection: label,
      size,
      stateBytes: state?.bytes ?? 0,
      msPerStep: elapsed / steps,
      outboxBytesPerStep: ((after[0]?.bytes ?? 0) - (before[0]?.bytes ?? 0)) / steps,
    } satisfies Measured
  })

const onFile = <A, E>(body: Effect.Effect<A, E, SqlClient.SqlClient>) => {
  const directory = mkdtempSync(join(tmpdir(), 'large-states-'))
  return Effect.runPromise(
    Effect.scoped(Effect.flatMap(createTables, () => body)).pipe(
      Effect.provide(SqliteClient.layer({ filename: join(directory, 'db.sqlite') })),
      Effect.orDie,
    ),
  ).finally(() => rmSync(directory, { recursive: true, force: true }))
}

test('a step writes the whole state, and the outbox a whole projection per step', async () => {
  const measured: Array<Measured> = []
  for (const size of sizes) {
    measured.push(await onFile(Effect.scoped(measure(whole, 'whole', size))))
    measured.push(await onFile(Effect.scoped(measure(counted, 'count', size))))
  }
  console.table(measured.map((m) => ({
    projection: m.projection,
    items: m.size,
    'state KB': Math.round(m.stateBytes / 1024),
    'ms per step': Number(m.msPerStep.toFixed(2)),
    'outbox KB per step': Math.round(m.outboxBytesPerStep / 1024),
  })))
  for (const m of measured) {
    // The state stored is the whole list after every step.
    expect(m.stateBytes).toBeGreaterThan(m.size * 20)
    // A projection that holds the state puts a copy of it in the outbox at every step; a count puts a few bytes.
    // At 10 items the steps add a third of the list, so the last state is larger than an average step's.
    if (m.projection === 'count') expect(m.outboxBytesPerStep).toBeLessThan(64)
    else if (m.size >= 1_000) expect(m.outboxBytesPerStep).toBeGreaterThan(m.stateBytes * 0.9)
  }
}, 600_000)

/**
 * What a large entity costs the others. The runtime writes one transaction at a time, and the storage turns the
 * state and the projections into text inside the transaction, so a small entity's step may wait for a large one's
 * write. The test times the steps of a small entity alone, then while a large one steps.
 */
const alongside = (size: number) =>
  Effect.gen(function*() {
    const runtime = yield* launch()
    const large = yield* runtime.deploy(whole)
    const small = yield* runtime.deploy(counted)
    const sender = { id: 'ada' }
    yield* large.create('large', { size }, { requestId: 'create-large', sender })
    yield* small.create('small', { size: 10 }, { requestId: 'create-small', sender })
    yield* runtime.settled
    // The small entity steps for as long as the large one takes for its steps, so that its steps meet every
    // moment of the large one's: its encoding, outside the transaction, and its write, inside.
    const time = (prefix: string, until: Effect.Effect<boolean>) =>
      Effect.gen(function*() {
        const taken: Array<number> = []
        while (taken.length < steps || !(yield* until)) {
          const started = performance.now()
          // The answer comes once the step committed, and `settled` would wait for the large entity too.
          yield* small.send('small', { _tag: 'Add', label: 'x' }, {
            requestId: `${prefix}-${taken.length}`,
            sender,
          })
          taken.push(performance.now() - started)
        }
        taken.sort((a, b) => a - b)
        return {
          mean: taken.reduce((a, b) => a + b, 0) / taken.length,
          worst: taken[taken.length - 1] ?? 0,
        }
      })
    const alone = yield* time('alone', Effect.succeed(true))
    let done = false
    yield* Effect.forkChild(Effect.forEach(
      Array.from({ length: steps }, (_, step) => step),
      (step) => large.send('large', { _tag: 'Add', label: 'y' }, { requestId: `large-${step}`, sender }),
      { discard: true },
    ).pipe(Effect.ensuring(Effect.sync(() => {
      done = true
    }))))
    // The longest time the thread gave no timer a turn: how long one piece of synchronous work held it.
    let last = performance.now()
    let stall = 0
    const timer = setInterval(() => {
      const now = performance.now()
      stall = Math.max(stall, now - last)
      last = now
    }, 1)
    const beside = yield* time('beside', Effect.sync(() => done))
    clearInterval(timer)
    console.log(`large ${size}: the thread was held at most ${stall.toFixed(0)} ms at once`)
    return { size, alone, beside }
  })

test('a small entity waits for the writes of a large one', async () => {
  type Times = Readonly<{ mean: number; worst: number }>
  const measured: Array<{ size: number; alone: Times; beside: Times }> = []
  for (const size of sizes) measured.push(await onFile(Effect.scoped(alongside(size))))
  console.table(measured.map((m) => ({
    'large items': m.size,
    'small ms alone': Number(m.alone.mean.toFixed(2)),
    'worst alone': Number(m.alone.worst.toFixed(2)),
    'small ms beside the large': Number(m.beside.mean.toFixed(2)),
    'worst beside': Number(m.beside.worst.toFixed(2)),
  })))
  for (const m of measured) expect(m.beside.worst).toBeGreaterThan(0)
}, 600_000)
