/**
 * The process of `spikes/cluster-reads-the-rows-an-older-release-wrote.test.ts`: one entity on `SingleRunner` over a
 * SQLite file, and what a release of Effect writes of it into a fixture. `scripts/write-cluster-fixture.ts` writes
 * one at the version pinned.
 *
 * A fixture holds two persisted requests. `a` was handled, and its reply stored. `b` was being handled when the
 * process ended, so its message is stored and not processed.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { ClusterSchema, Entity, SingleRunner } from 'effect/cluster'
import { Digest } from 'effect/crypto'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'
import { Rpc } from 'effect/rpc'

/** A request keyed by `key`, answered with the number of times its handler ran for the key in this process. */
export const Counter = Entity.make('Counter', [
  Rpc.make('Hit', {
    payload: { key: Schema.String },
    primaryKey: ({ key }) => key,
    success: Schema.Number,
  }).annotate(ClusterSchema.Persisted, true),
])

/**
 * A process over `filename`. Its handler counts its runs of each key in `runs`. The handler of `hang.key`, if given,
 * completes `hang.started` as it begins, and never ends.
 */
export const processOn = (
  filename: string,
  runs: Map<string, number>,
  hang?: { readonly key: string; readonly started: Deferred.Deferred<void> },
) =>
  Counter.toLayer(Effect.succeed({
    Hit: ({ payload }) =>
      Effect.gen(function*() {
        runs.set(payload.key, (runs.get(payload.key) ?? 0) + 1)
        if (payload.key !== hang?.key) return runs.get(payload.key)!
        yield* Deferred.succeed(hang.started, undefined)
        return yield* Effect.never
      }),
  })).pipe(
    Layer.provideMerge(SingleRunner.layer({ runnerStorage: 'memory' })),
    Layer.provide(SqliteClient.layer({ filename })),
    Layer.provide(Digest.layerWebCrypto),
  )

/** Writes a fixture into `filename`, which must not exist: `a` handled, then `b` stored and left unprocessed. */
export const write = (filename: string) =>
  Effect.gen(function*() {
    const started = yield* Deferred.make<void>()
    yield* Effect.gen(function*() {
      const client = (yield* Counter.client)('one')
      yield* client.Hit({ key: 'a' })
      yield* client.Hit({ key: 'b' }, { discard: true })
      yield* Deferred.await(started)
    }).pipe(Effect.provide(processOn(filename, new Map(), { key: 'b', started })))
  })
