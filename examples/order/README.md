# An order

An order, from its payment to its shipment or its cancellation. It shows **operations** with idempotency keys: a
charge and a refund that the payment provider performs once however often the runner tries them, the warehouse told
under a key of its own, and an email sent at most once. A cancellation that comes after the payment refunds it, and
one that comes before the shipment wins over it. A query finds the orders nobody paid, by an index of the projection.
Two **topics** of the outbox tell a billing service and a dashboard what changed, and a report counts the orders by
status from the log. A runner of Effect Cluster runs the same program, unchanged.

- [`order.ts`](order.ts): the program.
- [`report.ts`](report.ts): a store that a consumer of the topic `status` fills, page by page.
- [`scenarios.test.ts`](scenarios.test.ts): the order's scenarios, rehearsed.
- [`order.test.ts`](order.test.ts): the order's properties, checked for generated states.
- [`runtime.test.ts`](runtime.test.ts): the orders on the runtime, with their query, their outbox and the report.
- [`cluster.test.ts`](cluster.test.ts): the orders on a runner of Effect Cluster.

The guide's page on [the outbox](../../docs/guide/outbox.md) is written on this example.
