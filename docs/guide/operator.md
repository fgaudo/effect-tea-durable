# The operator's calls

This page is for whoever runs a program in production: what to do with an entity a defect suspended, and the
calls that keep the database from growing. Its code is the test `a ride the first version suspends is inspected,
and resumed by the fix` of [`examples/rental/runtime.test.ts`](../../examples/rental/runtime.test.ts), and the
operator's routes of [`examples/server`](../../examples/server/server.ts). `bun test` runs both. Read the guide's
[first page](README.md) before it: this page uses its words for a step, an operation and a delivery. The words in
bold are defined in [`glossary.md`](../glossary.md), and [`design.md`](../design.md#defects) is the specification
behind each rule.

## Contents

- [A defect suspends the entity](#a-defect-suspends-the-entity)
- [What a caller is told](#what-a-caller-is-told)
- [Finding the suspended entities](#finding-the-suspended-entities)
- [Reading one before deciding](#reading-one-before-deciding)
- [Checking a fix before its deploy](#checking-a-fix-before-its-deploy)
- [Resuming with a fix](#resuming-with-a-fix)
- [Discarding the message](#discarding-the-message)
- [What a resume or a discard answers](#what-a-resume-or-a-discard-answers)
- [The calls over HTTP](#the-calls-over-http)
- [The calls that keep the database small](#the-calls-that-keep-the-database-small)
- [The rules, in one list](#the-rules-in-one-list)

## A defect suspends the entity

The first page warns that a ride whose end drops its email is a defect. Here that version is deployed:

```ts
// The ride as one would write it at first: the end holds no email, so a ride that ends while its email is sent
// drops an operation under way, which is a defect, and suspends the ride.
const forgetful: typeof ride = {
  ...ride,
  work: (state) =>
    state._tag === 'Docking' || state._tag === 'Ended' ? ride.work({ ...state, email: 'Sent' }) : ride.work(state),
}
```

The pieces of a program, as values, are the ones the runtime calls, not those of the declaration. A program's
`update` is `(message, meta) => (state) =>`, a parent's with its children's messages wrapped in `message`. The
library gives the declaration's third argument, `children`, so a variant that changes a parent's `update` wraps
this one.

A customer ends a ride while its email is under way, and the step dies. On a phone a defect ends the app. On a
server it must not end the process, and an entity that received its message again would die again, for ever. So
**a defect suspends the entity**:

- its state stays as it was before the message, and the message stays unhandled, first in the mailbox;
- its timers are disarmed, and nothing else is handled until an operator resumes it or discards the message;
- its operations under way run to their end. Each completion is recorded behind the message the entity died on,
  and is handled once the entity is resumed.

So a charge under way when an unrelated message dies is neither run again nor left unknown. A defect is what the
program does: what one of its functions or schemas throws, or a rule of the design it breaks, such as an operation
dropped while it runs. An operation that dies suspends the entity too, and so does a new version of the program
that dies on the stored state. What the runtime itself throws, such as a write that fails, is no defect: it
crashes the entity alone, and the next call loads it again from what is stored.

## What a caller is told

```ts
expect(yield* rides.send(id, end, { requestId: 'end-1', sender: ann, keep: 'forever' })).toEqual({ _tag: 'Suspended' })
```

**`Suspended` says only that the request has no reply yet.** Every caller whose message waits in the mailbox is
answered `Suspended`, and so is every message that arrives while the entity is suspended, which is not queued.
Nothing of it is stored. The caller retries later under the same request id, and once the entity is resumed it
gets the stored reply: the message is applied once, whichever retry finds it. A boundary answers `Suspended` with a
status its clients do not retry at once, since the entity waits for a person.

## Finding the suspended entities

```ts
const [suspension] = yield* rides.suspended
expect(suspension).toMatchObject({ id, on: { _tag: 'Message', kind: 'Inbound' } })
expect(suspension?.cause).toContain("the step dropped the operation under 'email' before its completion")
```

`suspended` lists the program's suspended entities, the longest suspended first. Each gives what it died `on`: a
message with its kind, an operation with its key, or its activation. It gives the cause, as rendered when the
entity suspended, `since` when, and the senders `waiting` for its resumption in this process. It reads what is
stored, so it lists an entity this process does not hold too.

**Nobody is told on a clock.** A sender waits as long as it takes. A deployment that wants an alarm reads
`suspended` at an interval of its own, and alerts on what it finds.

## Reading one before deciding

```ts
const inspected = yield* rides.inspect(id)
expect(inspected?.state).toMatchObject({ _tag: 'Riding', email: 'Sending' })
expect(inspected?.mailbox).toMatchObject([{ _tag: 'Inbound', message: end }])
expect(inspected?.work.map(({ key }) => key.name)).toEqual(['cancellation', 'email'])
```

`inspect(id)` gives what is stored of one entity: its state, its mailbox with the next message first, the work
the state holds with the oldest first, and its suspension as `suspended` lists it. Here the ride is still
`Riding`, the end is next, and the email and the cancellation's timer are its work. `inspect` activates nothing,
so it reads an entity of any process, and an entity that is not suspended too. It reads from one snapshot, through
the migrations, so a step that commits meanwhile is read whole or not at all.

## Checking a fix before its deploy

```ts
expect(yield* check(ride, { limit: 10 })).toEqual({
  active: { checked: 0, failing: 0, failed: [] },
  suspended: { checked: 1, failing: 0, failed: [] },
})
```

**A new program is checked against the stored entities before it is deployed.** `check(program, { limit })`, from
the main entry, reads every stored entity of the program as an activation of the deploy would, and steps that
activation in memory. It launches, holds and writes nothing, so it runs while the old version still holds the
database. Here the fix is checked against the stored rides, and the suspended ride passes.

It gives the entities that are not suspended and the suspended ones apart. For each kind it gives how many it
`checked`, how many are `failing`, and the first `limit` of them in `failed`, each with its `id`, where it fails
and the `cause`. A failure `on: 'Load'` is a migration or a schema that does not read a stored row, so every call
that loads the entity would die. A failure `on: 'Activation'` is a program that dies on the stored state, or that
changes an operation under way, so the deploy would suspend the entity. A suspended entity is checked as a `resume`
by the new program would activate it. The message it died on is not handled, so a fix that dies on that message
still passes the check. The check is a reading of a moment: an operation under way at the check may have ended by
the deploy. A check before a launch that renames the program is given the launch's `renames`.

## Resuming with a fix

The cause names the rule the program broke, so the fix is the ride whose end carries its email. **A fix is a
deploy**, by a new process on the same database, and the entity stays suspended through it. The test stands for
the two processes by two runtimes, each launched in a scope of its own, one after the other, on one client of
SQLite that outlives both. A test whose client does not outlive the first runtime uses a file, since a database in
memory goes with its client:

```ts
const runtime = yield* launch()
const bikes = yield* runtime.deploy(bike)
const rides = yield* Effect.provide(runtime.deploy(ride), mailer)
expect((yield* rides.suspended).map((suspension) => suspension.id)).toEqual([id])
expect(yield* rides.resume(id)).toEqual({ _tag: 'Resumed' })
yield* runtime.settled
// The end is applied by the fix. The email was under way when the first process stopped, and is sent at most
// once, so the ride records that it is not known.
expect(yield* rides.inspect(id)).toMatchObject({ state: { _tag: 'Ended', email: 'Unsure' }, suspension: null })
expect(yield* bikes.read('bike-7')).toMatchObject({ status: 'Docked', rides: 1 })
// The customer's retry is answered from the reply the fix stored, and ends nothing twice.
expect(yield* rides.send(id, end, { requestId: 'end-1', sender: ann, keep: 'forever' })).toEqual({ _tag: 'Accepted' })
```

`resume(id)` activates the entity as after a crash, with the program deployed, and its message is handled next.
The fixed ride takes the end, and the bike is docked. The email was under way when the first process stopped. It
is sent at most once, so the fix's activation delivers its message for the case not known, and the ride records
`Unsure`. An operation still running at the resumption is kept, and one that died meanwhile runs again as its
delivery says.

A resume with no fix deployed handles the message with the same program, which dies on it again. The activation
itself succeeds, so `resume` answers `Resumed`, and the entity suspends again once its message is handled, after
the call: a test waits with `runtime.settled` and reads `suspended`. It is right only where the cause was outside
the program, such as a service an operation called that was down and is up again.

## Discarding the message

`discard(id)` drops the message the entity died on, and activates the entity without it. **Only an inbound message
is discarded.** A discarded message stores no reply, so its caller's retry is a new message, applied by the
program deployed.

An internal message is never discarded. The state before it still holds its work, so an operation's completion
dropped would run the operation again under another idempotency key, and a timer's firing dropped would fire again
at once. Only a program that handles the internal message gets the entity past it. The same holds for an entity
that died in an operation, or on its activation.

So the choice is the request's. A message a fix would handle, such as the customer's end, is resumed after the
fix. A message the business does not want applied at all is discarded. Its caller is not told: a retry under the
same request id is applied as a new message, by the program deployed.

## What a resume or a discard answers

Each answer says what the operator's own call did, even when two operators act on one entity at once:

| Answer | What happened |
| --- | --- |
| `Resumed` | The entity was activated again, and its message is handled next. |
| `Discarded` | The inbound message was dropped, and the entity activated again. |
| `NotDiscarded` | The entity died on an internal message, in an operation or on its activation, and stays suspended. |
| `StillSuspended` | The program deployed dies on the stored state too, with the new `cause`. A discard then keeps its message. |
| `NotSuspended` | The entity is not suspended. |
| `NotFound` | There is no such entity. |

## The calls over HTTP

The server of the orders exposes `resume` and `discard` beside its routes, for a caller it authenticates as an
operator:

```ts
HttpRouter.add(
  'POST',
  '/orders/:id/resume',
  Effect.gen(function*() {
    yield* operator
    const orders = yield* Orders
    return yield* answer(yield* orders.resume(yield* id))
  }),
),
```

Its map of answers gives each tag a status, so that a tag the library adds fails to compile in the boundary. A
suspended order is answered `409` and not `503`, since an HTTP client retries a `503` as transient, and a suspended
order waits for an operator.

## The calls that keep the database small

The runtime sweeps each program at an interval, every five minutes by default: it runs `expire`, then `prune`.
An operator runs these calls too, each from the handle of one program:

| Call | What it does | Where it is explained |
| --- | --- | --- |
| `expire` | Deletes the callers' replies past the `keep` their boundary gave. A reply sent with `keep: 'forever'` is kept for ever. | [Cluster](cluster.md#what-changes-for-a-caller) |
| `prune` | Drops, in each topic of the log, what every consumer of the topic has read. | [The outbox](outbox.md#pruning-and-a-consumer-that-holds-the-log) |
| `consumers` | Shows each consumer of the log, how many rows it has not read yet, and the time of the oldest it reads next. | [The outbox](outbox.md#pruning-and-a-consumer-that-holds-the-log) |
| `forget` | Drops a consumer the deploy no longer declares, so that the next prune passes it. | [The outbox](outbox.md#pruning-and-a-consumer-that-holds-the-log) |
| `reindex` | Writes the read model again, after a deploy that added or changed an index. | [Schemas that change](schemas.md#how-a-stored-row-is-read) |

A step that stores a reply deletes its own entity's replies past their time, so `expire` frees the rows of the
entities that answer no message. The sweep is an option of `launch`. `sweep: { millis: 60_000 }` sweeps every minute, and
`sweep: { millis: 300_000, prune: false }` expires and leaves the log to an operator's `prune`. `sweep: 'none'` runs
no sweep. A sweep that fails logs a warning, and the next one runs at the next interval. On Cluster one runner
sweeps each program. A sweep frees rows in the database, and SQLite gives no room back to the volume, so the file
stops growing and does not shrink. `forget` stays the operator's, since only the operator knows a consumer is gone.

## The rules, in one list

1. **A defect suspends the entity**, with its state and message as they were. Its operations run to their end, and
   nothing else is handled.
2. **`Suspended` says only that the request has no reply yet**, and the caller retries under the same request id.
3. **Nobody is told on a clock.** A deployment that wants an alarm reads `suspended`.
4. **An operator reads `inspect` before deciding**, and it activates nothing.
5. **A new program is checked before its deploy**, and the check writes nothing.
6. **A fix is a deploy, and a resume follows it.**
7. **Only an inbound message is discarded**, and its caller's retry is a new message.
8. **The runtime sweeps, and an operator forgets.** The sweep runs `expire` and `prune` at an interval, and an
   operator forgets a consumer that is gone.
