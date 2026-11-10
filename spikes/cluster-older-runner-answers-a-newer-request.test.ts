/**
 * What a runner of an older version does with a request a newer one persisted, at `effect` 4.1.3, on `SingleRunner`
 * over a SQLite file. The newer version's entity takes the request and is stopped before it answers, so the request is
 * left unprocessed. The older version, whose payload schema the request does not decode, answers it with a defect,
 * which is stored: the newer version, back on the file, never runs it again. The reply stored is a `Die` whose defect
 * is a `MalformedMessage` caused by the `SchemaError` of the payload.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import { ClusterSchema, Entity, SingleRunner } from 'effect/cluster'
import { Digest } from 'effect/crypto'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schedule from 'effect/Schedule'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/sql'
import { Rpc } from 'effect/rpc'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// The same entity type and RPC tag in two versions, whose payloads do not decode each other's.
const version = <P extends Schema.Top>(payload: P) =>
  Entity.make('Counter', [
    Rpc.make('Add', { payload: { n: payload }, success: Schema.String })
      .annotate(ClusterSchema.Persisted, true)
      .annotate(ClusterSchema.InterruptOnTermination, true),
  ])
const newer = version(Schema.String)
const older = version(Schema.Number)

test('an older runner answers with a defect a request a newer one persisted, and the newer never runs it again', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'effect-tea-persistent-spike-'))
  const filename = join(directory, 'store.db')
  const runs = { newer: 0, older: 0 }
  const store = SqliteClient.layer({ filename })
  const processOn = <A, E, R>(entity: Layer.Layer<A, E, R>) =>
    entity.pipe(
      Layer.provideMerge(SingleRunner.layer({ runnerStorage: 'memory' })),
      Layer.provideMerge(store),
      Layer.provide(Digest.layerWebCrypto),
    )
  const newerProcess = (started: Deferred.Deferred<void>) =>
    processOn(newer.toLayer({
      // The first request is held until the process stops; any other is answered.
      Add: ({ payload }) =>
        Effect.andThen(
          Effect.sync(() => void runs.newer++),
          payload.n === 'x' ? Effect.andThen(Deferred.succeed(started, void 0), Effect.never) : Effect.succeed('newer'),
        ),
    }))
  const olderProcess = processOn(older.toLayer({
    Add: () => Effect.sync(() => (runs.older++, 'older')),
  }))
  const rows = Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const messages = yield* sql<{ processed: number }>`SELECT processed FROM cluster_messages WHERE tag = 'Add'`
    const replies = yield* sql<{ payload: string }>`SELECT payload FROM cluster_replies`
    return { messages, replies }
  })
  try {
    // The newer version persists a request, starts it, and is stopped before it answers.
    await Effect.runPromise(Effect.gen(function*() {
      const started = yield* Deferred.make<void>()
      yield* Effect.gen(function*() {
        const client = yield* newer.client
        yield* client('one').Add({ n: 'x' }, { discard: true })
        yield* Deferred.await(started)
      }).pipe(Effect.provide(newerProcess(started)))
    }))
    expect(runs.newer).toBe(1)
    const left = await Effect.runPromise(Effect.provide(rows, store))
    expect(left.messages.map((m) => Number(m.processed))).toEqual([0])
    expect(left.replies).toEqual([])

    // The older version reads it, does not run it, and stores a reply for it.
    const answered = await Effect.runPromise(Effect.gen(function*() {
      return yield* Effect.repeat(rows, {
        schedule: Schedule.spaced('50 millis'),
        until: (found) => found.replies.length > 0,
      }).pipe(Effect.timeout('10 seconds'))
    }).pipe(Effect.provide(olderProcess)))
    expect(runs.older).toBe(0)
    expect(answered.messages.map((m) => Number(m.processed))).toEqual([1])
    expect(answered.replies).toHaveLength(1)
    expect(answered.replies[0]!.payload).toContain('MalformedMessage')

    // The newer version, back on the file, serves the same entity, and does not run the request again.
    const reply = await Effect.runPromise(Effect.gen(function*() {
      const client = yield* newer.client
      return yield* client('one').Add({ n: 'y' })
    }).pipe(Effect.provide(newerProcess(Effect.runSync(Deferred.make<void>())))))
    expect(reply).toBe('newer')
    expect(runs.newer).toBe(2)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}, 30_000)
