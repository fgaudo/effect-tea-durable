/**
 * What a step of a parent costs as its children by id grow, on the runtime over SQLite, for decisions 0133 and 0135.
 * A composed step lists the children by id of a state once, encoding each id, and lists the work of every child
 * that is there, so a step does work for each child on top of writing the state whole. The spike creates a parent with as many children
 * as its flags say, and times the sends that each change one child. A child here holds no work, so what the spike
 * sees is the routing and the listing, beside the write the spike on large states measured.
 *
 * It prints what it measured, and checks only that the step changes the one child it was sent to.
 *
 * Seen on 2026-11-05, on Windows with Bun 1.4.2, on a file, 20 steps each, three runs. A step took 2.9 ms at 10
 * children (1 KB), 3.5 ms at 1 000 (63 KB) and 10 ms at 10 000 (652 KB). The parent projects a count. The spike on
 * large states, run the same day, saw 2.9 ms for a flat state of 48 KB and 6.7 ms for one of 497 KB with a count as
 * projection. So at 10 000 children the listing takes about half as long as the write: the step encodes each id
 * once, and `durable` asks each child for its work. The default threshold of decision 0135 warned at 10 000
 * children, where the step wrote 667 801 characters.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import * as Optic from 'effect/Optic'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/sql'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTables, each, launch, noWork, part, program } from '../src/index.ts'

const Line = Schema.Struct({ label: Schema.String, touched: Schema.Int })

const line = part({
  state: Line,
  flags: Schema.String,
  inbound: Schema.TaggedStruct('Touch', {}),
  internal: Schema.Never,
  operation: Schema.Never,
  rejection: Schema.Never,
  projection: Schema.Int,
})({
  keys: {},
  init: (label) => ({ label, touched: 0 }),
  update: () => (state) => ({ ...state, touched: state.touched + 1 }),
  durable: () => noWork,
  operations: {},
  project: (state) => state.touched,
})

const State = Schema.Struct({ lines: Schema.Record(Schema.String, Line) })
type State = typeof State.Type

const parent = program({
  state: State,
  flags: Schema.Struct({ size: Schema.Int }),
  inbound: Schema.Never,
  internal: Schema.Never,
  operation: Schema.Never,
  rejection: Schema.Never,
  sender: Schema.Null,
  projection: Schema.Int,
})({
  name: 'Parent',
  keys: {},
  children: { Line: each(line, { id: Schema.String, at: Optic.id<State>().key('lines').compose(Optic.entries()) }) },
  init: ({ size }, at) => ({
    lines: Object.fromEntries(
      Array.from({ length: size }, (_, id) => [`line-${id}`, line.init(`line number ${id} of the parent`, at)]),
    ),
  }),
  update: (message) => () => message,
  durable: () => noWork,
  operations: {},
  project: (state) => Object.keys(state.lines).length,
  indexes: {},
})

// The sizes stop at 10 000 children, so that `bun test` stays fast.
const sizes = process.env['SIZES']?.split(',').map(Number) ?? [10, 1_000, 10_000]
const steps = 20

const measure = (size: number) =>
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const runtime = yield* launch()
    const entities = yield* runtime.deploy(parent)
    yield* entities.create('p', { size }, { requestId: 'create', sender: null })
    yield* runtime.settled
    const started = performance.now()
    for (let step = 0; step < steps; step++) {
      // The last child, so that a search from the first passes every other.
      const message = { _tag: 'Line', id: `line-${size - 1}`, message: { _tag: 'Touch' } } as const
      yield* entities.send('p', message, { requestId: `touch-${step}`, sender: null })
    }
    yield* runtime.settled
    const elapsed = performance.now() - started
    const [row] = yield* sql<{ state: string }>`SELECT state FROM entities WHERE id = 'p'`
    const state = JSON.parse(row?.state ?? '{}') as State
    expect(state.lines[`line-${size - 1}`]?.touched).toBe(steps)
    expect(state.lines['line-0']?.touched).toBe(size === 1 ? steps : 0)
    return { children: size, 'state KB': Math.round((row?.state.length ?? 0) / 1024), msPerStep: elapsed / steps }
  })

const onFile = <A, E>(body: Effect.Effect<A, E, SqlClient.SqlClient>) => {
  const directory = mkdtempSync(join(tmpdir(), 'many-children-'))
  return Effect.runPromise(
    Effect.scoped(Effect.flatMap(createTables, () => body)).pipe(
      Effect.provide(SqliteClient.layer({ filename: join(directory, 'db.sqlite') })),
      Effect.orDie,
    ),
  ).finally(() => rmSync(directory, { recursive: true, force: true }))
}

test('a step of a parent does work for each of its children', async () => {
  const measured = []
  for (const size of sizes) measured.push(await onFile(Effect.scoped(measure(size))))
  console.table(measured.map((m) => ({ ...m, msPerStep: Number(m.msPerStep.toFixed(2)) })))
}, 600_000)
