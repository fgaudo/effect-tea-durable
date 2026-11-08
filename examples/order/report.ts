/**
 * The first report fed from the log: how many orders are in each status, which a dashboard shows at every view.
 * The read model answers it too, with `countBy` (decision 0150). A report answers it from a store made for the
 * question, which a consumer of the topic `status` feeds, page by page (decision 0149): a store of its own is what
 * a question the read model does not answer needs. The store is a plain table of the test's database, beside the
 * library's.
 */
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/sql'
import type { Program, Published } from '../../src/index.ts'
import type { order } from './order.ts'

type Order = typeof order extends Program<infer T> ? T : never

const Counts = Schema.Array(Schema.Struct({ status: Schema.String, count: Schema.Number }))

export const statusReport = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  // The store holds the last status of each order, and not a count per status: a row of the topic gives the
  // status the step left and not the one before, so a count cannot be moved from one status to the other on a row
  // alone. The count per status is a grouping over the store.
  yield* sql`CREATE TABLE order_status (id TEXT PRIMARY KEY, status TEXT NOT NULL)`

  return {
    /**
     * Writes a page of the topic `status` to the store, as the handler of `consume`. A reader of `consume` writes it
     * and acks it in one transaction of the database the runtime was launched with (decisions 0150, 0184): the store
     * and the cursors commit together, and a page read again after a crash was never written.
     */
    record: (page: ReadonlyArray<Published<Order, 'status'>>) =>
      Effect.forEach(
        page,
        ({ id, value }) =>
          sql`
            INSERT INTO order_status (id, status) VALUES (${id}, ${value})
            ON CONFLICT (id) DO UPDATE SET status = excluded.status
          `,
        { discard: true },
      ).pipe(Effect.orDie),

    /** How many orders are in each status, by status, with no entry for a status no order is in. */
    counts: sql`SELECT status, count(*) AS count FROM order_status GROUP BY status`.pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(Counts)),
      Effect.map((rows) => Object.fromEntries(rows.map(({ status, count }) => [status, count]))),
      Effect.orDie,
    ),
  }
})
