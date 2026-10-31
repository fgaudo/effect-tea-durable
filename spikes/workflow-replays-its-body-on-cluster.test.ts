/**
 * What decision 0007 says of Effect Workflow, at `effect` 4.1.1, on the engine whose history is stored: Cluster's,
 * on `SingleRunner` over a SQLite file. A workflow parked on a signal by one process, and signalled once the next
 * has started on the same file, runs its body again from the start there, its activity answered from what the
 * first stored; and the signal takes one value, which a second completion does not change.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import { ClusterWorkflowEngine, SingleRunner } from 'effect/cluster'
import { Digest } from 'effect/crypto'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/sql'
import { Activity, DurableDeferred, Workflow } from 'effect/workflow'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

test('a workflow stored by one process replays its body in the next, past a signal that takes one value', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'effect-tea-durable-spike-'))
  const filename = join(directory, 'store.db')
  let runs = 0
  let acts = 0
  const signal = DurableDeferred.make('signal', { success: Schema.String })
  const flow = Workflow.make('Flow', {
    payload: { id: Schema.String },
    success: Schema.String,
    idempotencyKey: ({ id }) => id,
  })
  // One process: the engine, its runner and the workflow, over the file. Nothing of it outlives its scope.
  const processOn = (waiting: Deferred.Deferred<DurableDeferred.Token>) =>
    flow.toLayer(() =>
      Effect.gen(function*() {
        runs++
        yield* Activity.make({ name: 'act', execute: Effect.sync(() => void acts++) })
        yield* Deferred.succeed(waiting, yield* DurableDeferred.token(signal))
        return yield* DurableDeferred.await(signal)
      })
    ).pipe(
      Layer.provideMerge(ClusterWorkflowEngine.layer),
      Layer.provideMerge(SingleRunner.layer({ runnerStorage: 'memory' })),
      Layer.provide(SqliteClient.layer({ filename })),
      Layer.provide(Digest.layerWebCrypto),
    )
  try {
    // The first process starts the workflow, and ends once it is parked on the signal.
    const token = await Effect.runPromise(Effect.gen(function*() {
      const waiting = yield* Deferred.make<DurableDeferred.Token>()
      return yield* Effect.gen(function*() {
        const executionId = yield* flow.execute({ id: 'one' }, { discard: true })
        const token = yield* Deferred.await(waiting)
        yield* Effect.repeat(flow.poll(executionId), {
          until: (result) => Option.isSome(result) && result.value._tag === 'Suspended',
        })
        return token
      }).pipe(Effect.provide(processOn(waiting)))
    }))
    expect([runs, acts]).toEqual([1, 1])
    // What the next process finds is in the file: the workflow's run, and its activity's reply.
    const stored = await Effect.runPromise(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const [messages] = yield* sql<{ n: number }>`SELECT count(*) AS n FROM cluster_messages`
      const [replies] = yield* sql<{ n: number }>`SELECT count(*) AS n FROM cluster_replies`
      return [messages?.n ?? 0, replies?.n ?? 0]
    }).pipe(Effect.provide(SqliteClient.layer({ filename }))))
    expect(stored.every((n) => n > 0)).toBe(true)
    // The next process is signalled, twice: the body runs again there, and the activity does not.
    const result = await Effect.runPromise(Effect.gen(function*() {
      const waiting = yield* Deferred.make<DurableDeferred.Token>()
      return yield* Effect.gen(function*() {
        yield* DurableDeferred.succeed(signal, { token, value: 'first' })
        yield* DurableDeferred.succeed(signal, { token, value: 'second' })
        return yield* flow.execute({ id: 'one' })
      }).pipe(Effect.provide(processOn(waiting)))
    }))
    expect(result).toBe('first')
    expect([runs, acts]).toEqual([2, 1])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}, 30_000)
