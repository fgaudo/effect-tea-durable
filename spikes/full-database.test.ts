/**
 * What the runtime does once its database is full, for decision 0152. `PRAGMA max_page_count` caps the database
 * file, as a full disk would. A first process declares two consumers: one reads once and never acks, the other
 * acks every row. It sends to entities until a step cannot commit, and looks at what still answers. A second
 * process deploys without the consumer that stalled, forgets it, prunes, and sends again.
 *
 * It prints what each call gave, and checks what decision 0152 rests on: a step that cannot commit dies, the
 * readings and the acks still answer, and a forget and a prune free the room steps need. The cap holds only
 * without WAL, since in WAL mode the rows go to the WAL file, which `max_page_count` does not cap.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/sql'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createTables, launch, noWork, program } from '../src/index.ts'

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
  // Each step changes the projection, so each writes a row of about 2 KB in the topic `projection`.
  project: (state) => ({ count: state.count, last: 'x'.repeat(2_000) }),
  indexes: {},
})

const sender = { id: 'ada' }
const shown = (exit: Exit.Exit<unknown, unknown>) => Exit.isSuccess(exit) ? exit.value : String(exit.cause)

/** The first process: it fills the database under a consumer that stalled. */
const filling = Effect.scoped(Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const runtime = yield* launch({ log: { partitions: 4 } })
  const handle = yield* runtime.deploy(notes, { consumers: { projection: ['stalled', 'current'] } })
  const sendOnce = (id: string, index: number) =>
    handle.send(id, { _tag: 'Add', text: 'note' }, { requestId: `s-${id}-${index}`, sender }).pipe(
      Effect.timeout('2 seconds'),
      Effect.exit,
    )
  for (const id of ['n1', 'n2', 'n3']) yield* handle.create(id, {}, { requestId: `c-${id}`, sender })
  // `stalled` reads once and never acks, so it holds every row of its topic.
  yield* handle.fetch('projection', 'stalled', 1)
  const [counted] = yield* sql<{ page_count: number }>`PRAGMA page_count`
  const pages = counted?.page_count ?? 0
  expect(pages).toBeGreaterThan(0)
  // About 2 KB a row, so 64 more pages of 4 KB hold a few dozen steps more.
  yield* sql.unsafe(`PRAGMA max_page_count = ${pages + 64}`)

  let sent = 0
  let failed: Exit.Exit<unknown, unknown> | undefined
  for (let index = 0; index < 10_000 && failed === undefined; index++) {
    const exit = yield* sendOnce(`n${(index % 3) + 1}`, index)
    if (Exit.isSuccess(exit)) sent++
    else failed = exit
  }
  console.log('sends that committed before the database was full:', sent)
  console.log('the send that could not commit:', failed === undefined ? 'none' : shown(failed))

  const read = yield* Effect.exit(handle.read('n1'))
  const consumers = yield* Effect.exit(handle.consumers)
  const otherEntity = yield* sendOnce('n2', 100_000)
  console.log('a read once full:', Exit.isSuccess(read) ? 'given' : shown(read))
  console.log('consumers once full:', shown(consumers))
  console.log('a send to another entity once full:', shown(otherEntity))
  // `current` reads every row and acks it: its cursors are rows written in a full database.
  const current = yield* Effect.exit(Effect.gen(function*() {
    for (;;) {
      const rows = yield* handle.fetch('projection', 'current', 1_000)
      if (rows.length === 0) return
      yield* handle.ack('projection', 'current', rows)
    }
  }))
  const held = yield* Effect.exit(handle.prune)
  console.log('a consumer that reads and acks once full:', Exit.isSuccess(current) ? 'done' : shown(current))
  console.log('a prune behind the consumer that stalled:', shown(held))
  return { sent, failed, read, consumers, current, held }
}))

/** The second process: it deploys without the consumer that stalled, forgets it, and prunes. */
const freeing = Effect.scoped(Effect.gen(function*() {
  const runtime = yield* launch({ log: { partitions: 4 } })
  const handle = yield* runtime.deploy(notes, { consumers: { projection: ['current'] } })
  const sendOnce = (id: string, index: number) =>
    handle.send(id, { _tag: 'Add', text: 'note' }, { requestId: `s-${id}-${index}`, sender }).pipe(
      Effect.timeout('2 seconds'),
      Effect.exit,
    )
  const forgotten = yield* Effect.exit(handle.forget('projection', 'stalled'))
  const pruned = yield* Effect.exit(handle.prune)
  console.log('forget once full:', Exit.isSuccess(forgotten) ? 'done' : shown(forgotten))
  console.log('a prune behind the consumer that acks:', shown(pruned))
  const again = yield* sendOnce('n3', 200_000)
  const failedEntityAgain = yield* sendOnce('n1', 300_000)
  console.log('a send after the prune:', shown(again))
  console.log('a send to an entity whose step had failed:', shown(failedEntityAgain))
  return { forgotten, pruned, again, failedEntityAgain }
}))

test('a full database stops the steps, and a forget and a prune free the room they need', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'full-database-'))
  try {
    const [full, freed] = await Effect.runPromise(
      Effect.flatMap(createTables, () => Effect.all([filling, freeing])).pipe(
        Effect.provide(SqliteClient.layer({ filename: join(directory, 'full.db'), disableWAL: true })),
        Effect.orDie,
      ),
    )
    expect(full.sent).toBeGreaterThan(0)
    expect(full.failed !== undefined && Exit.isFailure(full.failed)).toBe(true)
    expect(Exit.isSuccess(full.read) && Exit.isSuccess(full.consumers) && Exit.isSuccess(full.current)).toBe(true)
    expect(Exit.isSuccess(full.held) && full.held.value === 0).toBe(true)
    expect(Exit.isSuccess(freed.forgotten)).toBe(true)
    expect(Exit.isSuccess(freed.pruned) && freed.pruned.value > 0).toBe(true)
    expect(Exit.isSuccess(freed.again) && Exit.isSuccess(freed.failedEntityAgain)).toBe(true)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}, 120_000)
