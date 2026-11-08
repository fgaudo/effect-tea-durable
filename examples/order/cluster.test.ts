/**
 * The orders on a runner of Effect Cluster: the launcher's side of the runtime on Cluster. The runner names the
 * programs it runs where its `Sharding` is built, by `sharding`, which records their versions before Cluster
 * registers it (decisions 0159, 0174), and its runtime is the `launch` of `index.cluster.ts`. Every request goes
 * through Cluster's client of the program's door (decision 0165). On Cluster the runtime runs on SQLite alone
 * (decision 0084).
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import {
  RunnerAddress,
  RunnerHealth,
  Runners,
  ShardingConfig,
  SqlMessageStorage,
  SqlRunnerStorage,
} from 'effect/cluster'
import { Digest } from 'effect/crypto'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { launch, sharding } from '../../src/index.cluster.ts'
import { Mailer, order, Payments, Warehouse } from './order.ts'

const ada = { _tag: 'Customer', id: 'ada' } as const

/** How many charges the world was asked for in the test. */
let charges = 0

/** The world the orders act on, which counts its charges and records nothing else. */
const world = Layer.mergeAll(
  Layer.succeed(Payments, Payments.of({
    charge: () =>
      Effect.sync(() => {
        charges++
        return 'ch_1'
      }),
    refund: () => Effect.void,
  })),
  Layer.succeed(Warehouse, Warehouse.of({ prepare: () => Effect.void })),
  Layer.succeed(Mailer, Mailer.of({ send: () => Effect.void })),
)

/**
 * A runner of the orders over the SQLite file `filename`. It is the layer `SingleRunner.layer` of Cluster builds,
 * with `sharding` in place of `Sharding.layer`: `SingleRunner.layer` builds `Sharding` itself, so the versions would
 * be recorded after Cluster registered the runner. A runner of its own process sends to the others with
 * `Runners.layerRpc`, and a launcher that pings its runners or asks Kubernetes provides its own `RunnerHealth`.
 */
const runner = (filename: string) =>
  sharding([order]).pipe(
    Layer.provideMerge(Runners.layerNoop),
    Layer.provideMerge(SqlMessageStorage.layer),
    Layer.provide([Layer.orDie(SqlRunnerStorage.layer), RunnerHealth.layerNoop]),
    Layer.provideMerge(ShardingConfig.layer({ runnerAddress: Option.some(RunnerAddress.make('localhost', 34431)) })),
    Layer.provideMerge(SqliteClient.layer({ filename })),
    Layer.provide(Digest.layerWebCrypto),
  )

test('a runner of Cluster creates, pays and reads the orders, each request through the door of the orders', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'effect-tea-durable-example-'))
  try {
    await Effect.runPromise(
      Effect.scoped(Effect.gen(function*() {
        const runtime = yield* launch()
        const orders = yield* Effect.provide(runtime.deploy(order), world)

        for (const id of ['o-1', 'o-2']) {
          expect(
            yield* orders.create(id, { order: { customer: 'ada', totalInCents: 1_000 } }, {
              requestId: `c-${id}`,
              sender: ada,
            }),
          ).toEqual({ _tag: 'Created' })
        }
        const pay = { _tag: 'PayRequested', payment: 'card-1' } as const
        expect(yield* orders.send('o-2', pay, { requestId: 'p-o-2', sender: ada })).toEqual({ _tag: 'Accepted' })
        // A retry under the same request id is answered from what Cluster stored, and charges nothing again.
        expect(yield* orders.send('o-2', pay, { requestId: 'p-o-2', sender: ada })).toEqual({ _tag: 'Accepted' })
        yield* runtime.settled

        expect(yield* orders.read('o-1')).toMatchObject({ status: 'AwaitingPayment' })
        expect(yield* orders.read('o-2')).toMatchObject({ status: 'Paid', charge: 'ch_1' })
        expect(charges).toBe(1)
        expect(yield* orders.count({ where: [{ index: 'unpaidUntil', is: '<>', value: null }] })).toBe(1)
      })).pipe(Effect.provide(Layer.orDie(runner(join(directory, 'orders.db'))))),
    )
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}, 30_000)
