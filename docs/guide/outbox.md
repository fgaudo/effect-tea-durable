# The outbox

This page tells other systems what an entity did. Its code is [`examples/order`](../../examples/order), an order
that is paid, charged and shipped, with a billing service and a dashboard that learn of it. `bun test` runs it.
Read the guide's [first page](README.md) before it: this page uses its words for a step, a projection and the
boundary. The words in bold are defined in [`glossary.md`](../glossary.md), and
[`design.md`](../design.md#publishing-what-happened) is the specification behind each rule.

## Contents

- [The requirement](#the-requirement)
- [What a step publishes](#what-a-step-publishes)
- [A topic for each reader](#a-topic-for-each-reader)
- [Consumers are declared at deploy](#consumers-are-declared-at-deploy)
- [Reading, then acking](#reading-then-acking)
- [A store that commits with its cursors](#a-store-that-commits-with-its-cursors)
- [Waiting for the next row](#waiting-for-the-next-row)
- [The order of the log](#the-order-of-the-log)
- [Several readers of one consumer](#several-readers-of-one-consumer)
- [Pruning, and a consumer that holds the log](#pruning-and-a-consumer-that-holds-the-log)
- [The rules, in one list](#the-rules-in-one-list)

## The requirement

The order of the shop has two readers outside it:

- A billing service issues an invoice for each charge an order takes, and a credit note for each refund.
- A dashboard shows how many orders are in each status.

Neither may miss an order, and a crash of either may not lose what it was told.

## What a step publishes

The order declares nothing to send. Each step that changes what callers read writes a row in the log, the
**outbox**, in the step's own transaction. So a row is written exactly when the step commits, and no row tells of a
step that did not. After an order is created and paid, its log reads:

```ts
const statuses = yield* orders.published('status', [], all)
expect(statuses.map(({ id, kind, message, value }) => [id, kind, message?._tag ?? null, value]))
  .toEqual([
    ['o-1', 'Creation', null, 'AwaitingPayment'],
    ['o-1', 'Inbound', 'PayRequested', 'Charging'],
    ['o-1', 'Internal', 'ChargeSucceeded', 'Paid'],
  ])
```

A row holds the entity's id, the message the step handled with its `kind`, and a `value` taken of the projection
the step left. The message names the fact, and the projection is already the public contract. An entity's creation
writes a row of `kind` `Creation`, with no message. A step of a child is the parent's step, and its row holds the
message as the parent received it, wrapped with the child's name: `{ _tag: 'Line', id: 'mug', message }`. A row
holds no time: a reader that needs one, a time of occupancy to bill, finds it in the value, so the projection shows
it.

A step that changes nothing callers read publishes nothing. Nor does a rejected message, an internal message
dropped, or a step that suspends the entity. The order's step that tells the warehouse changes only `canCancel`,
which neither reader reads, so neither is told. **A fact that must reach another system is shown in the
projection**, where a topic selects it. The booking's inventory shows what happens otherwise: confirming seats
moves them from held to sold and leaves `available` where it was, so the sale is not published.

## A topic for each reader

Billing acts on the charge, and the dashboard on the status. Each is given a **topic** of its own:

```ts
topics: {
  status: ({ status }) => status,
  billing: ({ charge, refunded }) => ({ charge, refunded }),
},
```

A topic is a pure function of the projection that selects, as JSON, what one reader acts on. A step writes a row in
a topic only when what the topic selects changed, compared as canonical JSON. So the status changed in all three
steps above, and billing's selection changed only at the creation and at the charge:

```ts
const billing = yield* orders.published('billing', [], all)
expect(billing.map(({ kind, message, value }) => [kind, message?._tag ?? null, value.charge])).toEqual([
  ['Creation', null, null],
  ['Internal', 'ChargeSucceeded', 'ch_1'],
])
```

A row's `value` is typed by the selector, so each reader has a contract of its own. **A topic selects, and does not
decide.** It returns a part of the projection, the whole of it, a value nested in it, or a comparison with a
threshold, which changes when the threshold is crossed. A topic has no schema and no migration of its own: the
stored projection is read through the projection's migrations, and the selector of the program deployed is applied
to it where the row is read. A program that declares no topics publishes the one topic `projection`, whose value is
the projection whole.

A selector that throws in a step, or selects what JSON does not hold, suspends the entity, as `project` does. A
selector deployed later that throws on a row already stored gives the defect to whoever reads the row.

## Consumers are declared at deploy

A reader that keeps its place in a topic is a **consumer**: a name within one topic. Who reads the log belongs to
the deployment, so the consumers are declared where the program is deployed:

```ts
const consumers = { consumers: { billing: ['invoices'], status: ['dashboard'] } } as const

// …
const orders = yield* Effect.provide(runtime.deploy(order, consumers), world)
```

The handle is typed by the names declared, so `orders.fetch('status', 'dashbord', …)` does not compile. A handle
whose type is written names them too, as `Handle<TypesOf<typeof order>, typeof consumers.consumers>`. Written
`Handle<TypesOf<typeof order>>`, it knows no consumer, and every `fetch` refuses its topic. A test
deploys the same program with other consumers, or none. A consumer holds its topic from the deploy that first
declares it, so no row written after that deploy is dropped before the consumer has read it.

## Reading, then acking

A consumer reads with `fetch`, acts on the rows, and then acks them. Here `all` is a limit of 100, which no reading
of the test reaches, and the dashboard acks the first two rows of its topic:

```ts
expect(yield* orders.fetch('billing', 'invoices', all)).toEqual(billing)
expect(yield* orders.fetch('status', 'dashboard', all)).toEqual(statuses)
yield* orders.ack('status', 'dashboard', statuses.slice(0, 2))
expect(yield* orders.fetch('status', 'dashboard', all)).toEqual(statuses.slice(2))
```

`fetch(topic, consumer, limit)` gives at most `limit` rows past the consumer's cursors, the oldest first. The limit
is required, so that no reading holds a whole topic in one array. `ack(topic, consumer, rows)` moves the cursors
past the rows given, and a cursor never moves back. A crash between the action and the ack delivers the rows
again. **A consumer is told at least once**, and a row is the same row when its topic, its `partition` and its
`seq` are.

A consumer whose action must happen once keeps cursors of its own, written in the same transaction as its action,
and drops a row delivered again behind them. A consumer whose store is a table of the runtime's database needs no
cursors of its own, as the next section shows.

`published(topic, after, limit)` reads the log from cursors the caller holds, and stores nothing. A test or an
operator looks with it. `[]` as `after` reads the topic from its start.

## A store that commits with its cursors

The dashboard asks how many orders are in each status. The read model answers it with `countBy`, but a question it
does not answer needs a store made for it. The report of [`report.ts`](../../examples/order/report.ts) keeps the last
status of each order in a table of the runtime's database:

```ts
export const statusReport = Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  // …
  yield* sql`CREATE TABLE order_status (id TEXT PRIMARY KEY, status TEXT NOT NULL)`

  return {
    // …
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
    // …, and the counts by status
  }
})
```

`Order` is `TypesOf<typeof order>`, the order's types as one record, which `Published` reads the topic's value from.
The store holds the last status, and not a count per status. A row gives the status the step left and not the one
before, so a count could not be moved from one status to another on a row alone. The count is a grouping over the
store. The table's name does not start with `effecttea_`, which is the runtime's.

`consume` runs the consumer's loop:

```ts
yield* orders.consume('status', 'dashboard', report.record, { limit: 3 })
```

It reads a page with `fetch`, runs the handler on it, and acks it in one transaction of the client the runtime was
launched with. So the store and the cursors commit together. A handler that fails rolls back its writes and the
ack, the reader fails, and the next reader reads the page again. A page is therefore written to the store exactly
once. `orders.ack` joins such a transaction too, when a caller writes the loop by hand.

**Within that transaction the handler waits for nothing a step does.** The transaction may hold the database's one
connection, as on SQLite, and a step's commit waits for that connection. A handler that sent a message to an entity
and waited for its answer would wait for ever. A reader run inside a transaction of its own is the caller's defect,
for the same reason.

## Waiting for the next row

Without `wait`, `consume` ends at the first empty page, and the rows it did not read stay for the next reader. A
dashboard's reader runs as long as the runtime, in a fiber of its own. Here `record` is the report's handler, which
also tells the test that a page was written:

```ts
yield* Effect.forkChild(orders.consume('status', 'dashboard', record, { limit: 3, wait: true }))
```

A reading that finds no row waits until a step commits a row in its topic, and polls nothing. A commit in another
topic wakes no reader of this one. The reader ends when the runtime stops. `fetch` waits the same way, for at most a
time: `fetch('status', 'dashboard', 100, { wait: { millis: 10_000 } })` gives the first page with a row, or none
once ten seconds have passed.

## The order of the log

The log is ordered within a **partition**, and promises no order across partitions. Each entity belongs to one
partition, drawn from its id when it is created, so **the rows of one entity come in the order its steps
committed**. A row of one entity written before a row of another may come after it, as on Kafka. The report relies
on the first and not on the second: each order's last row is its last status, whatever came of other orders in
between.

A consumer that needs an effect after its cause in another entity waits for the cause, or reads the cause's
projection, which a row holds whole.

Each row carries its `partition` and a `seq`, which rises with every step that publishes in the partition. The rows
of one step share its `seq`, one per topic, so a topic's `seq`s have gaps where a step published only in others.
`launch({ log: { partitions } })` sets the number of partitions, 300 by default. The first launch stores it, and a
launch given another number fails, since a change would move entities between partitions. On Effect Cluster a
partition is a shard.

## Several readers of one consumer

A consumer whose action on a row is slow is read by several readers, each naming the partitions it reads. A fixed
pool of `n` readers divides them with a line, the reader `i` reading the partitions `p` where `p % n === i`:

```ts
const n = 2
for (let i = 0; i < n; i++) {
  const mine = Array.from({ length: orders.partitions }, (_, at) => at + 1).filter((p) => p % n === i)
  yield* orders.consume('status', 'dashboard', report.record, { limit: 3, partitions: mine })
}
```

The test runs the two readers one after the other, without `wait`, and the store then counts every order once. A
pool runs each reader in a fiber or a process of its own, with `wait: true`.

The cursors stay the consumer's, whichever reader acked them, and the runtime holds no reader. A slow row holds only
its reader's partitions. Two readers that name one partition are given the same rows, and their actions on them
interleave. So a division that changes stops the old readers, after their acks, before the new readers start. A
partition that no reader names is read by nobody, and its rows stay in the log.

## Pruning, and a consumer that holds the log

The log is kept for its consumers, and is not an archive. `prune` drops, in each topic and partition, what every
consumer of the topic has read. A topic no consumer is stored for is dropped whole. So a program whose past must
stay readable keeps it where callers read it, in the state or in entities of its own.

```ts
yield* orders.ack('status', 'dashboard', statuses.slice(0, 2))
expect(yield* orders.fetch('status', 'dashboard', all)).toEqual(statuses.slice(2))
expect(yield* orders.prune).toBe(2)
```

The runtime caps nothing of the log, and drops nothing by time. A consumer that stops reading holds its topic, and
the log grows. `orders.consumers` shows each consumer, its topic, whether the deploy declares it, and how many rows
are past its cursors, ordered by topic and then by consumer:

```ts
expect(yield* orders.consumers).toEqual([
  { topic: 'billing', consumer: 'invoices', declared: true, behind: 2, cursors: [{ partition, seq: 0 }] },
  // …, and the dashboard's
])
```

A consumer no longer declared is kept, and the deploy logs a warning for it. An operator lets it go by deploying
without it, calling `forget(topic, consumer)`, and pruning. A consumer the deploy still declares cannot be
forgotten.

## The rules, in one list

1. **A step publishes what it changed of the projection**, in its own transaction, so a row is written exactly when
   its step commits.
2. **A fact that must reach another system is shown in the projection**, where a topic selects it.
3. **A topic for each reader selects what that reader acts on, and decides nothing.**
4. **Consumers are declared where the program is deployed**, and each holds its topic from that deploy on.
5. **A consumer is told at least once.** A store in the runtime's database is written by `consume` with the
   cursors in one transaction, and any other store keeps cursors of its own.
6. **A handler waits for nothing a step does** within its transaction.
7. **The rows of one entity come in the order its steps committed**, and the log promises no order across
   entities.
8. **The log is not an archive.** A consumer that stops reading holds it, and an operator forgets it.
