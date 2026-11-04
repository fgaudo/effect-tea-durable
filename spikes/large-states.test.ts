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
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/sql'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTables, launch, noWork, program } from '../src/index.ts'

const Item = Schema.Struct({ id: Schema.Int, label: Schema.String })

const State = Schema.Struct({ items: Schema.Array(Item) })
type State = typeof State.Type

const Inbound = Schema.TaggedUnion({ Add: { label: Schema.String } })

const Sender = Schema.Struct({ id: Schema.String })

const room = <P>(name: string, projection: Schema.Codec<P, any>, project: (state: State) => P) =>
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
    keys: [],
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
