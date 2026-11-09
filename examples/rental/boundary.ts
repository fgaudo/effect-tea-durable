/**
 * The rental's boundary: what the application runs for a customer's request, between its HTTP handler and the
 * runtime. The handler authenticates the customer, and gives the identity it authenticated as the sender
 * (decision 0124).
 */
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { SqlClient, SqlSchema } from 'effect/sql'
import type { Handle, TypesOf } from '@fgaudo/effect-tea-persistent'
import type { ride } from './ride.ts'

// A customer has no life of its own, so it is a row of the application's table, and no entity. The table lives in
// the runtime's database, under a name that does not start with `tea_`, which the runtime keeps for its own
// (decision 0198).
export const createCustomers = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  yield* sql`CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, email TEXT NOT NULL)`
})

// A customer's row, read through a schema: a row the schema refuses fails the request, and is never cast.
const customerOf = Effect.fnUntraced(function*(id: string) {
  const sql = yield* SqlClient.SqlClient
  return yield* SqlSchema.findOneOption({
    Request: Schema.String,
    Result: Schema.Struct({ email: Schema.String }),
    execute: (id) => sql`SELECT email FROM customers WHERE id = ${id}`,
  })(id)
})

/**
 * A customer's request to rent a bike, with the rate the bike's page showed them: the boundary read it off the
 * bike's projection when it served the page.
 */
export type RentRequested = Readonly<{
  customer: string
  bike: string
  centsPerMinute: number
  requestId: string
}>

/**
 * What a rent is answered: the ride the customer then reads, to learn whether the bike unlocked. A ride refused,
 * because the rate changed or the bike is in use, is a ride too, whose projection says why.
 */
export type Rented =
  | Readonly<{ _tag: 'Rented'; ride: string }>
  | Readonly<{ _tag: 'NoSuchCustomer' }>

/**
 * The id of a ride is derived from the request that creates it, so a retry of the request creates no second
 * ride: it is answered `Created` again, from the stored reply. A request id is its sender's, so the id holds the
 * customer too. It is their JSON, since a separator could be in either: `a/b` with `c` and `a` with `b/c` would
 * be one ride.
 */
export const rideOf = (request: Pick<RentRequested, 'customer' | 'requestId'>) =>
  JSON.stringify([request.customer, request.requestId])

export const rent = (rides: Handle<TypesOf<typeof ride>>) => (request: RentRequested) =>
  Effect.gen(function*() {
    const found = yield* customerOf(request.customer)
    if (Option.isNone(found)) return { _tag: 'NoSuchCustomer' } as const
    const customer = found.value
    const id = rideOf(request)
    // The ride needs the customer's email and the bike's rate, and a reply carries no data: both travel with the
    // creation. The bike refuses the rate if it has changed since the customer was shown it.
    yield* rides.create(id, {
      customer: request.customer,
      email: customer.email,
      bike: request.bike,
      centsPerMinute: request.centsPerMinute,
    }, { requestId: request.requestId, sender: { _tag: 'Customer', id: request.customer } })
    return { _tag: 'Rented', ride: id } as const
  })
