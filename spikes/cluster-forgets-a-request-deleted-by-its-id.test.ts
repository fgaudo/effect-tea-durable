/**
 * What decision 0090 does to Cluster's rows, at `effect` 4.1.1, on `SingleRunner` over a SQLite file. Cluster's
 * tables have the columns the runtime's statements name, and no foreign key. A processed request keeps its rows in
 * `cluster_messages` and `cluster_replies`, and the same primary key sent again is answered from them. A handler
 * under `WithTransaction` deletes in Cluster's transaction: a failure rolls the deletion back. Deleting a request's
 * rows under its `request_id` from both tables, in a handler that succeeds, leaves none behind, and the same primary
 * key sent again is a new request, which the handler runs. A handler that deletes the rows of its own request leaves
 * its reply in `cluster_replies`, with no request: Cluster saves it once the handler returns.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import { ClusterSchema, Entity, SingleRunner } from 'effect/cluster'
import { Digest } from 'effect/crypto'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/sql'
import { Rpc } from 'effect/rpc'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// A request keyed by `key`; `forget` names a request whose rows its handler deletes, `self` names its own, and
// `fail` fails it after.
const Counter = Entity.make('Counter', [
  Rpc.make('Hit', {
    payload: {
      key: Schema.String,
      forget: Schema.optional(Schema.String),
      self: Schema.optional(Schema.Boolean),
      fail: Schema.optional(Schema.Boolean),
    },
    primaryKey: ({ key }) => key,
    success: Schema.Number,
    error: Schema.String,
  })
    .annotate(ClusterSchema.Persisted, true)
    .annotate(ClusterSchema.WithTransaction, true),
])

test('a request whose rows are deleted by its id, in another request\'s transaction, is new when sent again', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'effect-tea-durable-spike-'))
  const filename = join(directory, 'store.db')
  const runs = new Map<string, number>()
  let own: string | undefined
  const store = SqliteClient.layer({ filename })
  const entity = Counter.toLayer(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    return {
      Hit: ({ payload, requestId }) =>
        Effect.gen(function*() {
          runs.set(payload.key, (runs.get(payload.key) ?? 0) + 1)
          if (payload.self === true) own = String(requestId)
          const forget = payload.self === true ? own : payload.forget
          if (forget !== undefined) {
            yield* Effect.orDie(sql`DELETE FROM cluster_replies WHERE request_id = ${forget}`)
            yield* Effect.orDie(sql`DELETE FROM cluster_messages WHERE request_id = ${forget}`)
          }
          if (payload.fail === true) return yield* Effect.fail('failed')
          return runs.get(payload.key)!
        }),
    }
  }))
  const process = entity.pipe(
    Layer.provideMerge(SingleRunner.layer({ runnerStorage: 'memory' })),
    Layer.provideMerge(store),
    Layer.provide(Digest.layerWebCrypto),
  )
  try {
    await Effect.runPromise(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      // The layout the runtime's statements name.
      const columns = (table: string) =>
        sql<{ name: string }>`SELECT name FROM pragma_table_info(${table})`.pipe(Effect.map((cs) => cs.map((c) => c.name)))
      const foreignKeys = (table: string) => sql`SELECT * FROM pragma_foreign_key_list(${table})`
      expect(yield* columns('cluster_messages')).toEqual(
        expect.arrayContaining(['id', 'request_id', 'kind', 'processed']),
      )
      expect(yield* columns('cluster_replies')).toEqual(expect.arrayContaining(['id', 'request_id', 'kind']))
      expect(yield* foreignKeys('cluster_messages')).toEqual([])
      expect(yield* foreignKeys('cluster_replies')).toEqual([])
      // A request's rows, the id as text: a Snowflake does not fit a JavaScript number. A persisted request's reply
      // reaches its client once Cluster's transaction has committed, so what it wrote is there to read.
      const rowsOf = (request: string) =>
        Effect.all({
          messages: sql<{ kind: number; processed: number }>`
            SELECT kind, processed FROM cluster_messages WHERE request_id = ${request} ORDER BY id`,
          replies: sql<{ kind: number }>`SELECT kind FROM cluster_replies WHERE request_id = ${request} ORDER BY id`,
        })

      const requests = sql<{ request: string }>`
        SELECT CAST(request_id AS TEXT) AS request FROM cluster_messages ORDER BY id`.pipe(
        Effect.map((rs) => rs.map((r) => r.request)),
      )

      const client = (yield* Counter.client)('one')
      // A processed request keeps its rows, and its primary key is answered from them, with no row of its own.
      expect(yield* client.Hit({ key: 'a' })).toBe(1)
      const [a] = yield* requests
      const kept = { messages: [{ kind: 0, processed: 1 }], replies: [{ kind: 0 }] }
      expect(yield* rowsOf(a!)).toEqual(kept)
      expect(yield* client.Hit({ key: 'a' })).toBe(1)
      expect(runs.get('a')).toBe(1)
      expect(yield* requests).toEqual([a!])

      // A handler that deletes them and then fails leaves them: the deletion was in Cluster's transaction.
      expect(yield* Effect.flip(client.Hit({ key: 'b', forget: a, fail: true }))).toBe('failed')
      expect(runs.get('b')).toBe(1)
      expect(yield* rowsOf(a!)).toEqual(kept)
      const [, b] = yield* requests
      expect((yield* rowsOf(b!)).replies).toEqual([{ kind: 0 }])

      // A handler that deletes them and succeeds leaves none behind, and the rows of the other requests.
      expect(yield* client.Hit({ key: 'c', forget: a })).toBe(1)
      expect(yield* rowsOf(a!)).toEqual({ messages: [], replies: [] })
      const [, c] = yield* requests
      expect(yield* requests).toEqual([b!, c!])
      expect(yield* rowsOf(b!)).toEqual(kept)
      expect(yield* rowsOf(c!)).toEqual(kept)

      // The same primary key is then a new request, which the handler runs.
      expect(yield* client.Hit({ key: 'a' })).toBe(2)
      expect(runs.get('a')).toBe(2)

      // A handler that deletes its own request's rows leaves its reply, which Cluster saves once the handler returns.
      expect(yield* client.Hit({ key: 'd', self: true })).toBe(1)
      expect(own).toBeDefined()
      expect(yield* rowsOf(own!)).toEqual({ messages: [], replies: [{ kind: 0 }] })
      const orphans = yield* sql<{ request: string }>`
        SELECT CAST(request_id AS TEXT) AS request FROM cluster_replies
        WHERE request_id NOT IN (SELECT request_id FROM cluster_messages)`
      expect(orphans).toEqual([{ request: own! }])
    }).pipe(Effect.provide(process)))
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}, 30_000)
