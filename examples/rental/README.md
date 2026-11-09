# Bikes rented by the minute

The guide's running example, a bike and a ride. A customer rents a bike at the rate they were shown, and the bike
refuses the rate if it has changed since: a value one entity needs of another travels with the request. The ride's
id is derived from the request id, so a rent sent twice creates one ride. The start email is sent at most once, and
carried into the states after the ride's end while it is under way. A timer closes the window in which a
cancellation is free. The customers are a table of the application, in the runtime's database. The bike's second
version reads what the first wrote through a migration. A first version of the ride suspends on a message, and a fix
deployed later resumes it.

- [`bike.ts`](bike.ts): the bike.
- [`ride.ts`](ride.ts): the ride.
- [`boundary.ts`](boundary.ts): the application's code between a request handler and the runtime.
- [`scenarios.test.ts`](scenarios.test.ts): the ride and the bike rehearsed, alone and together.
- [`ride.test.ts`](ride.test.ts): the ride's properties, checked for generated states.
- [`bike.test.ts`](bike.test.ts): the bike's migration, checked against the cases recorded.
- [`runtime.test.ts`](runtime.test.ts): the rental on the runtime, a suspension and its fix, and a rename.

[The guide](../../docs/guide/README.md) writes this example from its requirement, one decision at a time.
