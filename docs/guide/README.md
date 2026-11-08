# From requirements to a program

This guide writes a program from a requirement, one decision at a time. Each section shows the code first, and
then the rule it follows. The code is [`examples/rental`](../../examples/rental), which `bun test` runs. The words
in bold are defined in [`glossary.md`](../glossary.md), and [`design.md`](../design.md) is the specification
behind each rule.

Read the [README](../../README.md) first: its sections The problem and How a program is made say what a state,
`work`, an operation, an incarnation and a projection are.

## Contents

- [The requirement](#the-requirement)
- [What is an entity, and what is a row](#what-is-an-entity-and-what-is-a-row)
- [The states of a ride](#the-states-of-a-ride)
- [The program in one place](#the-program-in-one-place)
- [Messages, and who sends them](#messages-and-who-sends-them)
- [The work a state holds](#the-work-a-state-holds)
- [An operation leaves the state only by its completion](#an-operation-leaves-the-state-only-by-its-completion)
- [A projection reads no clock](#a-projection-reads-no-clock)
- [A reply carries no data](#a-reply-carries-no-data)
- [The boundary](#the-boundary)
- [Rehearsing, then running](#rehearsing-then-running)
- [The rules, in one list](#the-rules-in-one-list)

## The requirement

A city rents bikes by the minute. The requirement, as the business writes it:

- An operator sets each bike's rate per minute.
- A customer opens a bike's page, sees its rate, and rents it. The customer pays the rate they were shown, and
  never another one.
- A bike is ridden by one ride at a time.
- A customer who finds the bike unfit cancels within two minutes, and pays nothing. After two minutes the ride
  is paid by the minute begun.
- The customer gets an email when the ride starts. A second copy of it is worse than none.
- The application already has its customers, each with an email address.

## What is an entity, and what is a row

The rental has two **entities**, a bike and a ride, and one table, the customers.

A bike lives in time: it is docked, then ridden, then docked again, and two rides must never hold it at once. So a
bike is an entity, with its own state and one message at a time. A ride lives in time too: it waits for its bike to
unlock, runs a timer of two minutes, and sends an email. So a ride is an entity of its own, and not a field of the
bike, since a bike has many rides over its life.

A customer has no life of its own. Nothing about a customer waits, expires or retries. So a customer is a row of a
table of the application, read and written by request handlers, as in any backend.

```ts
// A customer has no life of its own, so it is a row of the application's table, and no entity.
export const createCustomers = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  yield* sql`CREATE TABLE IF NOT EXISTS customers (id TEXT PRIMARY KEY, email TEXT NOT NULL)`
})
```

**A row with no life of its own is a table of the application.** The table may live in the runtime's database,
written on the same `SqlClient` the runtime was launched with. Every table, index, trigger and function whose name
starts with `tea_` is the runtime's, so an application names nothing of its own with `tea_`.

An item is an entity when others address it, or when it has a life of its own: a timer, an operation, a rule
that holds across its messages. Otherwise it is a row, or a field of an entity's state. The guide's page on
[children](children.md#where-an-item-goes) says when an item is a **child** inside an entity instead.

## The states of a ride

A ride is one **state** at a time, a value of a `Schema.Union` of tagged structs. Each case holds what the ride
needs in that case, and nothing it does not:

```ts
const State = Schema.Union([
  // Only the bike's reply leaves it.
  Schema.TaggedStruct('Unlocking', { ride: Ride }),
  Schema.TaggedStruct('Refused', { ride: Ride, reason: Schema.Literals(['RateChanged', 'InUse', 'NoSuchBike']) }),
  Schema.TaggedStruct('Riding', {
    ride: Ride,
    startedAt: Schema.DateTimeUtcFromMillis,
    cancellableUntil: Schema.NullOr(Schema.DateTimeUtcFromMillis),
    email: Email,
  }),
  Schema.TaggedStruct('Docking', { ride: Ride, costInCents: Schema.Int, email: Email }),
  Schema.TaggedStruct('Ended', { ride: Ride, costInCents: Schema.Int, email: Email }),
])
```

`Ride` holds what the ride was created with: the customer, their email, the bike and the rate. These are the
ride's **flags**, which `init` turns into the first state. A time is stored as `Schema.DateTimeUtcFromMillis`, since
everything stored encodes to JSON.

Each case is named for what is under way, as effect-tea names the states of a screen. `Unlocking` says that the
ride is asking the bike to unlock, and `Docking` that it is asking the bike to dock. A reader of the states knows
what the ride does without reading `update`.

## The program in one place

A program is declared in one call, `program(schemas)(pieces)`. The schemas come first, and give every type the
pieces are written in:

```ts
import * as Schema from 'effect/Schema'
import { noWork, operation, program, reject, timer } from '@fgaudo/effect-tea-persistent/program'

export const ride = program({
  state: State,
  flags: Ride,
  inbound: Inbound,
  internal: Internal,
  operation: Operation,
  sender: Sender,
  projection: Projection,
})({
  name: 'Ride',
  keys: ['unlock', 'cancellation', 'email', 'dock'],
  init: (ride) => ({ _tag: 'Unlocking', ride }),
  update: (message, { from, at }) => (state) => …,
  work: (state) => …,
  operations: { … },
  project: (state) => ({ … }),
})
```

The keys of the schemas are `state`, `flags`, `inbound`, `internal`, `operation`, `rejection`, `sender` and
`projection`. A program leaves out what it does not have: the bike declares no `internal` and no `operation`, and
the ride no `rejection`. The operations are one schema, usually a `Schema.TaggedUnion`, whose cases make the values
`work` returns:

```ts
const Operation = Schema.TaggedUnion({
  Unlock: { bike: Schema.String, centsPerMinute: Rate },
  Dock: { bike: Schema.String },
  EmailStart: { to: Schema.String, bike: Schema.String },
})
```

A module that declares a program imports from `@fgaudo/effect-tea-persistent/program`, which a browser can load
too. The boundary imports `launch`, `Handle` and `TypesOf` from `@fgaudo/effect-tea-persistent`, and a test
imports `rehearse`, `accepted`, `rejected` and `projectionViolations` from `@fgaudo/effect-tea-persistent/testing`.
Effect's SQL client and its schemas are `import { SqlClient, SqlSchema } from 'effect/sql'`.

## Messages, and who sends them

A ride receives two kinds of **message**:

```ts
const Inbound = Schema.Union([
  Schema.TaggedStruct('EndRequested', {}),
  Schema.TaggedStruct('CancelRequested', {}),
])

const Internal = Schema.Union([
  Schema.TaggedStruct('Unlocked', {}),
  Schema.TaggedStruct('UnlockRefused', { reason: Schema.Literals(['RateChanged', 'InUse', 'NoSuchBike']) }),
  Schema.TaggedStruct('CancellationClosed', {}),
  Schema.TaggedStruct('Docked', {}),
  Schema.TaggedStruct('StartEmailed', {}),
  Schema.TaggedStruct('StartEmailUnsure', {}),
])
```

**Inbound** messages come from callers, the customer here. One may arrive in any state: a slow phone, a retry, a
second device. So `update` **rejects** an inbound message that does not apply, and never fails on it:

```ts
EndRequested: () =>
  state._tag === 'Riding' && isCustomer(from, state.ride)
    ? { _tag: 'Docking', ride: state.ride, costInCents: costOf(state.ride, state.startedAt, at), email: state.email }
    : reject,
```

**Internal** messages come from the ride's own work: the answer of an operation, the firing of a timer. The
runtime delivers one only while the state still holds the work that sends it. So an internal message in a state
that holds no such work cannot arrive, and `update` answers it with a **defect**:

```ts
Docked: () =>
  state._tag === 'Docking'
    ? { _tag: 'Ended', ride: state.ride, costInCents: state.costInCents, email: state.email }
    : defect('a bike was docked while nothing was docking it'),
```

A defect **suspends** the entity until an operator resumes it. It says the program is wrong, not the caller.

`update` matches the message with `Match`, and writes its return type once, so that each case's object keeps its
literal `_tag`:

```ts
update: (message, { from, at }) => (state) =>
  Match.value(message).pipe(
    Match.withReturnType<State | Rejected>(),
    Match.tagsExhaustive({
      EndRequested: () => …,
      CancelRequested: () => …,
      Unlocked: () => …,
      // one case for each inbound and internal message
    }),
  ),
```

A program with reasons writes `Rejected<Reason>`, as the bike writes `Rejected<Rejection>`. Without the return
type, a case's `{ _tag: 'Docking', … }` widens to a `string` tag, and the compiler refuses the union with an error
that names `string`. A `switch` that returns from each case types as well. `rejectWith('InUse')` keeps its literal
reason either way.

`meta.from` says who sent an inbound message. It is an `Origin`: `{ _tag: 'Caller', sender }` for a caller, where
`sender` is a value of the program's `sender` schema, and `{ _tag: 'Entity', entity: { name, id } }` for another
entity's operation. The ride accepts an end only from its own customer, so `update` decides who may do what:

```ts
const isCustomer = (from: Origin<Sender>, ride: Ride) => from._tag === 'Caller' && from.sender.id === ride.customer
```

`Origin` has a third case, `Self`, for the entity's own internal messages, which `update` never needs to check. `meta.at` is the time the runtime handles the
message, and is how `update` reads time while it stays a pure function. The cost of a ride is computed from it.

## The work a state holds

There are no commands. A ride does not "start a timer" in `update`. Instead, `work` says what each state holds,
under the **keys** the program declares:

```ts
keys: ['unlock', 'cancellation', 'email', 'dock'],

work: (state) =>
  Match.valueTags(state, {
    Unlocking: ({ ride }) => ({
      unlock: Operation.cases.Unlock.make({ bike: ride.bike, centsPerMinute: ride.centsPerMinute }),
    }),
    Refused: () => noWork,
    Riding: ({ ride, cancellableUntil, email }) => ({
      ...(cancellableUntil === null
        ? noWork
        : { cancellation: timer(cancellableUntil, { _tag: 'CancellationClosed' }) }),
      ...emailing(ride, email),
    }),
    // …
  }),
```

The runtime compares the work of each new state with the work of the state before. A key that appears starts its
work, a key that stays keeps it running, and a key that goes ends it. A ride that leaves `Riding` holds no
`cancellation` key, so its timer is gone, and nothing had to cancel it.

There are two kinds of work. A **timer** delivers one message at a time. An **operation** is data, here a case of
`Operation`, which a **runner** in `operations` turns into an effect:

```ts
operations: {
  Unlock: operation.atLeastOnce(unlock),
  Dock: operation.atLeastOnce(dock),
  // Sent at most once: a second email is worse than none, and the state says when it is not known.
  EmailStart: operation.atMostOnce(emailStart, (): Internal => ({ _tag: 'StartEmailUnsure' })),
},
```

A runner is a function from the operation to an effect that ends with one of the program's internal messages. It
asks for the services it needs, here a `Mailer`, declared by the application with `Context.Service`.

The runner's declaration says what a crash does to it, its **delivery**. An operation the process died during
runs again if it is declared `atLeastOnce`, or with `operation`, which gives the runner an **idempotency key** to
pass to a service such as a payment provider. Such a runner takes the key after the operation:

```ts
const charge = Effect.fn('Charge')(
  function*({ payment, totalInCents }: Extract<Operation, { _tag: 'Charge' }>, idempotencyKey: IdempotencyKey) {
    const payments = yield* Payments
    return yield* payments.charge({ payment, totalInCents, idempotencyKey })
  },
  Effect.match({
    onSuccess: (charge): Internal => ({ _tag: 'ChargeSucceeded', charge }),
    onFailure: (): Internal => ({ _tag: 'ChargeDeclined' }),
  }),
)
// operations: { Charge: operation(charge) }, or operation.digest(charge) for a provider that caps a key's length
```

This one is the order's, of [`examples/order`](../../examples/order/order.ts). A failure the provider may recover
from is retried inside the runner, with `Effect.retry` and a schedule that ends, under the same key. An expected
failure, such as a declined card, becomes an internal message, and the state decides what follows. One declared `atMostOnce` is not run again, and delivers the message
given beside it instead. The requirement says that a second email is worse than none, so the email is at most
once, and the state records `Unsure` when a crash leaves it unknown.

## An operation leaves the state only by its completion

The ride's email is under way from the moment the ride starts. The customer may end the ride before the mail
server answers. So the states after `Riding` carry the email, and `work` keeps it under its key:

```ts
// The email under way, in every state that holds it. The same value under the same key keeps the email running:
// a state that dropped it while it runs would be a defect (decision 0005).
const emailing = (ride: Ride, email: Email) =>
  email === 'Sending' ? { email: Operation.cases.EmailStart.make({ to: ride.email, bike: ride.bike }) } : noWork

// …
Docking: ({ ride, email }) => ({
  dock: Operation.cases.Dock.make({ bike: ride.bike }),
  ...emailing(ride, email),
}),
Ended: ({ ride, email }) => emailing(ride, email),
```

**An operation under way leaves the state only by its completion.** A step whose next state drops the key of an
operation still running is a defect, and so is a step that changes the operation under the key. The operation may
have acted on the world already, and the runtime cannot take that back. So a state that follows an operation
carries it as a field, here `email`, and `work` returns the same operation under the same key until its answer
arrives. Only `StartEmailed` or `StartEmailUnsure` moves `email` past `Sending`.

The first version of a program usually forgets this. A ride whose `Ended` holds no email passes every rehearsal
that answers the email before the end. In production it suspends the first time a customer ends a ride before the
mail server has answered. The rehearsal `a ride whose end drops the email under way is a defect` of
[`scenarios.test.ts`](../../examples/rental/scenarios.test.ts) shows the defect.

A timer is the exception: it has done nothing yet, so a state may drop it at any time.

## A projection reads no clock

A customer may cancel for two minutes. The obvious projection compares the start with the current time. That
projection would be wrong, and the library gives it no clock to read. Instead the state holds the end of the
window, and a timer sets it to null when the window closes:

```ts
// Until when a cancellation is free, and null once that time has passed: a timer sets it, so that `project`
// reads it and no clock.
cancellableUntil: Schema.NullOr(Schema.DateTimeUtcFromMillis),

// in update:
CancellationClosed: () =>
  state._tag === 'Riding' && state.cancellableUntil !== null
    ? { ...state, cancellableUntil: null }
    : defect('the cancellation closed while it was not open'),

// in project:
canCancel: state._tag === 'Riding' && state.cancellableUntil !== null,
```

**A projection reads no clock.** The runtime stores the **projection** in the step that computes it, and a caller
reads the stored row. A projection that read the clock would be true when it was written and false later, and
every query over it would be stale. So an action that becomes allowed, or stops being allowed, at a time is a field
of the state, which a timer changes at that time.

The projection shows the actions it allows, as `canEnd` and `canCancel`. It shows only actions `update` accepts,
and every one it accepts. `projectionViolations` checks it for generated states, in
[`ride.test.ts`](../../examples/rental/ride.test.ts). The projection is JSON, so a time is its milliseconds.

`update` trusts the timer in the same way. `CancellationClosed` is the fact that the time has passed, and
`CancelRequested` checks only `cancellableUntil !== null`. It never compares `meta.at` with the window's end.

## A reply carries no data

A ride must unlock its bike at the rate its customer was shown. The rate is the bike's, and the bike may change it
at any time. The ride cannot ask the bike for its rate: a **reply** says only whether a message applied, or why
not, and never carries data. So the rate travels with the request, and the bike refuses it if it has changed:

```ts
// bike.ts
UnlockRequested: ({ centsPerMinute }) =>
  ride === null
    ? reject
    : state._tag === 'Ridden'
    ? rejectWith('InUse')
    : centsPerMinute !== state.centsPerMinute
    ? rejectWith('RateChanged')
    : { ...state, _tag: 'Ridden', ride },
```

**A value one entity needs of another travels with the request, and the receiver refuses a value that changed
since.** The boundary read the rate off the bike's projection when it served the bike's page. The customer's rent
carries it, the ride's flags store it, and the ride's operation sends it to the bike:

```ts
const unlock = Effect.fn('Unlock')(
  function*({ bike, centsPerMinute }: Extract<Operation, { _tag: 'Unlock' }>) {
    const reply = yield* send(Bike, bike, { _tag: 'UnlockRequested', centsPerMinute }, 'unlock')
    return reply._tag === 'Accepted'
      ? { _tag: 'Unlocked' } satisfies Internal
      : reply._tag === 'NotFound'
      ? { _tag: 'UnlockRefused', reason: 'NoSuchBike' } satisfies Internal
      : reply.reason !== null
      ? { _tag: 'UnlockRefused', reason: reply.reason } satisfies Internal
      : yield* Effect.die('the bike rejected an unlock for no reason')
  },
)
```

A **reason** of a rejection, `RateChanged` or `InUse`, is the one thing a reply may carry. The bike declares its
reasons with a `rejection` schema, and `rejectWith` gives one. `send` is called only from an operation, never from
`update`: a step never waits for another entity. An entity knows who sent a message from `meta.from`, which reads
`Entity` with the sender's name and id when another entity sent it. The bike records the ride that holds it from
there, and docks only that ride.

The operation runs at least once. Run again after a crash, it sends the same request under the same name,
`'unlock'`, and gets the reply the bike stored the first time. So the bike is unlocked once, however many times the
operation runs.

The two programs talk both ways, so each imports only the other's types, through a **reference**:
`reference<typeof bike>('Bike')`. Design.md's [entities that talk](../design.md#entities-that-talk) says the rest.

## The boundary

The **boundary** is the application's code between a request handler and the runtime. It authenticates the
customer, reads what it needs, and calls `create` and `send`:

```ts
export const rent = (rides: Handle<TypesOf<typeof ride>>) => (request: RentRequested) =>
  Effect.gen(function*() {
    const found = yield* customerOf(request.customer)
    if (Option.isNone(found)) return { _tag: 'NoSuchCustomer' } as const
    const customer = found.value
    const id = rideOf(request)
    yield* rides.create(id, {
      customer: request.customer,
      email: customer.email,
      bike: request.bike,
      centsPerMinute: request.centsPerMinute,
    }, { requestId: request.requestId, sender: { _tag: 'Customer', id: request.customer } })
    return { _tag: 'Rented', ride: id } as const
  })
```

`customerOf` reads the customer's row with Effect's `SqlSchema.findOneOption`, which decodes the row through a
schema and gives `Option.none()` when there is none:

```ts
const customerOf = Effect.fnUntraced(function*(id: string) {
  const sql = yield* SqlClient.SqlClient
  return yield* SqlSchema.findOneOption({
    Request: Schema.String,
    Result: Schema.Struct({ email: Schema.String }),
    execute: (id) => sql`SELECT email FROM customers WHERE id = ${id}`,
  })(id)
})
```

Every `create` and `send` carries a **request id**, chosen by the caller, here the customer's app. A retry under the
same request id is given the stored reply, and the message is applied once.

The ride's id is derived from the request id:

```ts
export const rideOf = (request: Pick<RentRequested, 'customer' | 'requestId'>) =>
  JSON.stringify([request.customer, request.requestId])
```

**The id of an entity a caller creates is derived from the caller's request id.** The customer's app sends its rent
again when it never received the answer. A boundary that drew a fresh id, such as a UUID, at each try would create a
second ride on the retry, and that ride would find the bike in use. With the id derived from the request, the retry
is answered `Created` again from the stored reply, and creates nothing. A request id is its sender's, so the id
holds the customer too, as JSON, since a separator could appear in either part. An operation that creates an entity
follows the same rule: the id comes from the operation's own data, never from a random draw. The test
`a ride id drawn anew at each try creates a second ride, which the bike refuses` of
[`runtime.test.ts`](../../examples/rental/runtime.test.ts) shows what goes wrong otherwise.

The answer of `create` says only that the ride exists. The customer's app then reads the ride's projection with
`read`, to learn whether the bike unlocked, or why it refused.

## Rehearsing, then running

A program is tested first without a database or a clock. `rehearse` runs one entity, and the test answers each
operation and fires each timer:

```ts
test('a cancellation is free for two minutes, and refused once the timer has fired', () =>
  Effect.runPromise(rehearse(
    ride,
    start,
    Effect.fnUntraced(function*(rehearsal) {
      yield* rehearsal.answer('unlock', { _tag: 'Unlocked' })
      expect(yield* rehearsal.projection).toMatchObject({
        canCancel: true,
        cancellableUntil: DateTime.toEpochMillis(DateTime.add(at, { minutes: 2 })),
      })
      yield* rehearsal.advance({ minutes: 2 })
      expect(yield* rehearsal.projection).toMatchObject({ canCancel: false, cancellableUntil: null })
      expect(yield* rehearsal.send({ _tag: 'CancelRequested' }, ann)).toMatchObject(rejected)
    }),
  )))
```

`answer('unlock', …)` completes the operation under the key `unlock`, and gives `'Delivered'`, or `'Dropped'` when
the operation's incarnation has moved on. `advance` moves the rehearsal's time, and fires each timer due.
`pending('email')` gives the work under way under a key, with its `idempotencyKey`, and fails the test when there
is none; `underWay('email')` gives null instead. `state` and `projection` are effects that read the entity, and
`restart` is an effect that stands for the process dying: the email under way then delivers its
`StartEmailUnsure`.

A rehearsal's `send` gives each message a new request id, unless the test names one. A second send under the same
sender and request id is a retry, answered from the stored reply and not applied again:

```ts
yield* rehearsal.answer('unlock', { _tag: 'Unlocked' })
const end = { requestId: 'end-1' }
expect(yield* rehearsal.send({ _tag: 'EndRequested' }, ann, end)).toEqual(accepted)
// The phone never got the answer, and sends the end again: the ride ended once, and is told so again.
expect(yield* rehearsal.send({ _tag: 'EndRequested' }, ann, end)).toEqual(accepted)
```

Sent under a new request id, the same end is a new request, and the ride, docking already, rejects it. So a caller
that retries sends the same request id, and a boundary derives an entity's id from it. The test
`a rent sent twice creates one ride, which unlocks the bike` of
[`runtime.test.ts`](../../examples/rental/runtime.test.ts) checks the boundary's id on the runtime. A test that answers for the bike cannot tell whether the bike agrees, so
`rehearse.together` runs the ride and the bike in one world, where `run('unlock')` runs the ride's runner against
the bike's real `update`. A service a test never runs, the mailer here, is provided with `Layer.mock(Mailer, {})`,
whose members die if they are called. [`scenarios.test.ts`](../../examples/rental/scenarios.test.ts) holds the
rehearsals of each rule of this guide.

Then the program runs on the runtime, with a database:

```ts
const runtime = yield* launch()
yield* createCustomers
const bikes = yield* runtime.deploy(bike)
const rides = yield* Effect.provide(runtime.deploy(ride), mailer)
```

`launch` creates the runtime's tables on the `SqlClient` it is given. `deploy` gives a **handle** to one program's
entities, with `create`, `send`, `read` and the queries. A program's runners ask for services, the mailer here, and
the deploy is where they are provided. `create` answers a `Creation`, `Created`, `AlreadyExists` or `Rejected`, and
`read` gives the projection, or null for no such entity.

The work a step starts runs on its own, after `create` or `send` has answered. A test waits for it with
`runtime.settled`, which ends once nothing is under way:

```ts
yield* rent(rides)(request)
yield* runtime.settled
expect(yield* rides.read(rideOf(request))).toMatchObject({ status: 'Riding' })
```

## The rules, in one list

1. **A row with no life of its own is a table of the application**, in the runtime's database if it likes, under a
   name that does not start with `tea_`.
2. **Each state is named for what is under way**, and holds what that case needs.
3. **An inbound message that does not apply is rejected; an internal message that cannot arrive is a defect.**
4. **Work is derived from the state.** A state that holds no timer has no timer, and nothing cancels anything.
5. **An operation under way leaves the state only by its completion.** A state that follows it carries it as a
   field, with its key.
6. **A projection reads no clock.** An action allowed until or from a time is a field of the state, which a timer
   changes.
7. **A reply carries no data.** A value one entity needs of another travels with the request, and the receiver
   refuses a value that changed since.
8. **The id of an entity a caller creates is derived from the caller's request id**, never drawn anew at each try.
9. **A delivery is chosen by what a second run would do**: an idempotency key for a service that takes one, at
   least once for a request to another entity, at most once for what must not happen twice, with the state saying
   when it is not known.

The pages of this guide by topic are read when a program needs them. [Children](children.md) holds items inside
an entity, each with a life of its own. [The outbox](outbox.md) tells other systems what an entity did.
[Schemas that change](schemas.md) changes a program whose entities are stored. [Effect Cluster](cluster.md) runs a
program on several processes at once. The page on the operator's calls is not written yet. Until then, it is the
section [defects](../design.md#defects) of [`design.md`](../design.md), for `suspended`, `resume`, `discard` and
`inspect`.
