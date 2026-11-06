/**
 * What the runtime does once its database is full, for the open question of a log that nobody prunes. A consumer
 * that has read once and never acks holds its topic, and `PRAGMA max_page_count` caps the database file, as a
 * full disk would. The spike sends to entities until a step cannot commit, then reads what is still readable,
 * forgets the consumer, prunes, and sends again.
 *
 * It prints what each call gave, and checks what decision 0152 rests on: a step that cannot commit dies, the
 * readings and the forget still answer, and a prune behind a consumer that acks frees the room steps need. The
 * cap holds only without WAL, since in WAL mode the rows go to the WAL file, which `max_page_count` does not cap.
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
  keys: {},
  init: () => ({ count: 0 }),
  update: () => (state) => ({ count: state.count + 1 }),
  durable: () => noWork,
  operations: {},
  // Each step changes the projection, so each writes a row of about 2 KB in the topic `projection`.
  project: (state) => ({ count: state.count, last: 'x'.repeat(2_000) }),
  indexes: {},
})

const sender = { id: 'ada' }

const run = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const runtime = yield* launch({ log: { partitions: 4 } })
  const handle = yield* runtime.deploy(notes)
  for (const id of ['n1', 'n2', 'n3']) yield* handle.create(id, {}, { requestId: `c-${id}`, sender })
  // The consumer reads once and never acks, so it holds every row of its topic.
  yield* handle.feed('projection', 'stalled', 1)
  const [counted] = yield* sql<{ page_count: number }>`PRAGMA page_count`
  const pages = counted?.page_count ?? 0
  expect(pages).toBeGreaterThan(0)
  // About 2 KB a row, so 64 more pages of 4 KB hold about a hundred steps more.
  yield* sql.unsafe(`PRAGMA max_page_count = ${pages + 64}`)

  const sendOnce = (id: string, index: number) =>
    handle.send(id, { _tag: 'Add', text: 'note' }, { requestId: `s-${id}-${index}`, sender }).pipe(
      Effect.timeout('2 seconds'),
      Effect.exit,
    )

  let sent = 0
  let failed: Exit.Exit<unknown, unknown> | undefined
  for (let index = 0; index < 10_000 && failed === undefined; index++) {
    const exit = yield* sendOnce(`n${(index % 3) + 1}`, index)
    if (Exit.isSuccess(exit)) sent++
    else failed = exit
  }
  console.log('sends that committed before the database was full:', sent)
  console.log('the send that could not commit:', failed === undefined ? 'none' : String(Exit.isFailure(failed) ? failed.cause : ''))

  const read = yield* Effect.exit(handle.read('n1'))
  const consumers = yield* Effect.exit(handle.consumers)
  const otherEntity = yield* sendOnce('n2', 100_000)
  console.log('a read once full:', Exit.isSuccess(read) ? 'given' : String(read.cause))
  console.log('consumers once full:', Exit.isSuccess(consumers) ? consumers.value : String(consumers.cause))
  console.log('a send to another entity once full:', Exit.isSuccess(otherEntity) ? otherEntity.value : String(otherEntity.cause))

  const forgotten = yield* Effect.exit(handle.forget('projection', 'stalled'))
  const alone = yield* Effect.exit(handle.prune)
  console.log('forget once full:', Exit.isSuccess(forgotten) ? 'done' : String(forgotten.cause))
  console.log('a prune with no consumer left:', Exit.isSuccess(alone) ? alone.value : String(alone.cause))
  // A consumer that reads every row and acks it: the cursors it stores are rows written in a full database.
  const current = yield* Effect.exit(Effect.gen(function*() {
    for (;;) {
      const rows = yield* handle.feed('projection', 'current', 1_000)
      if (rows.length === 0) return
      yield* handle.ack('projection', 'current', rows)
    }
  }))
  const pruned = yield* Effect.exit(handle.prune)
  console.log('a consumer that reads and acks once full:', Exit.isSuccess(current) ? 'done' : String(current.cause))
  console.log('a prune behind it:', Exit.isSuccess(pruned) ? pruned.value : String(pruned.cause))

  const again = yield* sendOnce('n3', 200_000)
  const failedEntityAgain = yield* sendOnce('n1', 300_000)
  console.log('a send after the prune:', Exit.isSuccess(again) ? again.value : String(again.cause))
  console.log('a send to an entity whose step had failed:', Exit.isSuccess(failedEntityAgain) ? failedEntityAgain.value : String(failedEntityAgain.cause))
  return { sent, failed, read, consumers, forgotten, alone, current, pruned, again, failedEntityAgain }
})

test('a full database stops the steps, and a forget and a prune free the room they need', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'full-database-'))
  try {
    const outcome = await Effect.runPromise(
      Effect.scoped(Effect.flatMap(createTables, () => run)).pipe(
        Effect.provide(SqliteClient.layer({ filename: join(directory, 'full.db'), disableWAL: true })),
        Effect.orDie,
      ),
    )
    expect(outcome.sent).toBeGreaterThan(0)
    expect(outcome.failed !== undefined && Exit.isFailure(outcome.failed)).toBe(true)
    expect(Exit.isSuccess(outcome.read) && Exit.isSuccess(outcome.consumers)).toBe(true)
    expect(Exit.isSuccess(outcome.forgotten) && Exit.isSuccess(outcome.current)).toBe(true)
    expect(Exit.isSuccess(outcome.pruned) && outcome.pruned.value > 0).toBe(true)
    expect(Exit.isSuccess(outcome.again) && Exit.isSuccess(outcome.failedEntityAgain)).toBe(true)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}, 120_000)
