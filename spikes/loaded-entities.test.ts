/**
 * What a loaded entity holds in memory, for the open question on entities loaded without a capacity. The spike
 * creates many entities of one program, in a process whose passivation outlasts the test, and reads the heap
 * after a full collection, before and after. It runs a state of a few bytes and a state of about 1 KB.
 *
 * It prints what it measured, and checks only what does not depend on the machine: a loaded entity holds more than
 * its state's text.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/sql'
import { createTables, launch, noWork, program } from '../src/index.ts'

const State = Schema.Struct({ items: Schema.Array(Schema.String) })

const Inbound = Schema.TaggedUnion({ Add: { label: Schema.String } })

const rooms = program({
  state: State,
  flags: Schema.Struct({ size: Schema.Int }),
  inbound: Inbound,
  internal: Schema.Never,
  operation: Schema.Never,
  rejection: Schema.Never,
  sender: Schema.Struct({ id: Schema.String }),
  projection: Schema.Struct({ count: Schema.Int }),
})({
  name: 'Rooms',
  keys: [],
  init: ({ size }) => ({ items: Array.from({ length: size }, (_, id) => `item number ${id} of the room`) }),
  update: (message) => (state) => ({ items: [...state.items, message.label] }),
  work: () => noWork,
  operations: {},
  project: (state) => ({ count: state.items.length }),
  indexes: {},
})

const heap = () => {
  Bun.gc(true)
  return process.memoryUsage().heapUsed
}

// `COUNT=10000 bun test spikes/loaded-entities.test.ts` measures more entities.
const count = Number(process.env['COUNT'] ?? 2_000)

const measure = (size: number, capacity?: number) =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const runtime = yield* launch({
      passivate: { millis: 3_600_000 },
      ...(capacity === undefined ? {} : { capacity: { entities: capacity } }),
    })
    const entities = yield* runtime.deploy(rooms)
    const sender = { id: 'ada' }
    yield* entities.create('warm', { size }, { requestId: 'warm', sender })
    yield* runtime.settled
    const before = heap()
    const started = performance.now()
    for (let index = 0; index < count; index++) {
      yield* entities.create(`r${index}`, { size }, { requestId: `create-${index}`, sender })
    }
    yield* runtime.settled
    const elapsed = performance.now() - started
    const after = heap()
    const [state] = yield* sql<{ bytes: number }>`SELECT length(state) AS bytes FROM effecttea_entities WHERE id = 'warm'`
    const stateBytes = state?.bytes ?? 0
    return { size, capacity, stateBytes, bytesPerEntity: (after - before) / count, ms: elapsed / count }
  })

test('a loaded entity holds its state and the runtime’s bookkeeping', async () => {
  const measured = []
  for (const [size, capacity] of [[0], [30], [30, 100]] as const) {
    measured.push(
      await Effect.runPromise(
        Effect.scoped(Effect.flatMap(createTables, () => measure(size, capacity))).pipe(
          Effect.provide(SqliteClient.layer({ filename: ':memory:' })),
          Effect.orDie,
        ),
      ),
    )
  }
  console.table(measured.map((m) => ({
    items: m.size,
    capacity: m.capacity ?? 'none',
    'state bytes': m.stateBytes,
    'KB per loaded entity': Number((m.bytesPerEntity / 1024).toFixed(1)),
    'ms per creation': Number(m.ms.toFixed(2)),
  })))
  const [small, large, bounded] = measured
  // Each loaded entity holds more than its state's text, and a capacity of 100 holds next to nothing of 10 000.
  expect(small!.bytesPerEntity).toBeGreaterThan(small!.stateBytes)
  expect(large!.bytesPerEntity).toBeGreaterThan(large!.stateBytes)
  expect(bounded!.bytesPerEntity).toBeLessThan(small!.bytesPerEntity / 4)
}, 600_000)
