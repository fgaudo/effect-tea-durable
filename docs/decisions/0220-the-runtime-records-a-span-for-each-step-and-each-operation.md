# 0220. The runtime records a span for each step and each operation, linked to what each follows, and three metrics of its entities

**Status:** accepted, 2026-11-09, with the step What the runtime tells a tracer of the [roadmap](../roadmap.md).

## Context

The runtime opened no span and recorded no metric of its own: `src/` called neither `Effect.withSpan` nor `Metric`.
A deployment saw only the spans Effect opens beneath the runtime: a statement of `effect/sql`, a transaction, a
request of `effect/rpc`, and a message to an entity of Cluster.

An operator who looks at a stuck entity asks why an order did not move. The answer is one of a few facts. The entity
took a last step, and that step set something going. It is suspended, on a message, an operation or its activation.
An operation it started is still running, or died. Its timer fired, or did not. Messages pile up in its mailbox. A
consumer of the log is behind. Each fact needs a span or a metric of the machine's events, under a name that
`OtlpTracer`, `OtlpMetrics` and `PrometheusMetrics` of `effect/observability` export. Those modules need only the
names, and an application provides them, so the runtime imports none of them.

## Decision

- **Each event the machine steps is a span `tea.step`.** That is a `Create`, `Receive`, `Handle`, `Complete`,
  `Fire`, `Die`, `Restart`, `Resume` or `Discard`, on one process and on Cluster, in an entity's loop and in a
  door's step. A creation that stores a new entity is a `tea.step` whose event is `Create`. A span of a step has
  these attributes:
  - `tea.entity.name` and `tea.entity.id`, the entity's address;
  - `tea.event`, the tag of the event;
  - `tea.key` and `tea.incarnation` for a `Complete`, a `Fire` and a `Die`, with the key written as a defect names
    it, by its name or by the JSON of its name and its parameter;
  - `tea.written`, whether the step wrote, and `tea.outputs`, the tags of what the step set going, such as
    `Replied`, `Started` and `Armed`.

  A timer's firing is the step whose event is `Fire`, and an activation is the step whose event is `Restart`. Neither
  has a span of its own.
- **A suspension is told on the step that makes it.** That step's span has `tea.suspended` set to `true`, and
  `tea.suspension.on` set to what the entity died on: `Message`, `Operation` or `Activation`. A resumption is the
  step whose event is `Resume` or `Discard`. No span lasts as long as a suspension: a span is exported once it ends,
  and a suspension lasts until an operator acts.
- **The run of an operation is a span `tea.operation`.** Its attributes are the entity's address, `tea.key`,
  `tea.incarnation`, `tea.operation`, the operation's tag, and `tea.delivery`, its delivery. The span ends with the
  run. An operation that never returns has a span that is never exported, and `tea.operations.running` counts it.
  The requests an operation sends to other entities run under its span.
- **Every span of the runtime is a root span, and a span follows a request by a link.** The step of a caller's
  request links the caller's span. On one process that is the span of the fiber that called `send` or `create`,
  linked by the `Receive` or the `Create` it offers. On Cluster it is the span the door's step runs under, which
  Cluster opens for the request it delivers, with the transaction's below it. An operation links the step that
  started it: the step that handled the message, or the `Restart` of an activation. A step the runtime sets going
  of itself, such as a completion, a firing or an activation by the waker, links no span.

  A span of the runtime has no parent, since an entity outlives every caller. Its loop is forked by whichever caller
  loaded the entity, so a step under the span of that caller would be a child of a request answered long before. An
  operation starts again after a crash, in another process, from what is stored, where no step of the first process
  is held.
- **Three metrics, each by `tea.entity.name`.** The attribute is the program's name and never the entity's id, which
  would make a series of each entity:
  - `tea.mailbox.length`, a histogram of the length of the mailbox each step that writes leaves, with boundaries
    from 0 to 1000;
  - `tea.suspensions`, a counter of the steps that suspend an entity;
  - `tea.operations.running`, a gauge of the operations running in this process. It is counted from the start of an
    operation's run to its end, in one `Effect.acquireUseRelease`, as decision 0164 has every count another fiber
    reads.
- **The age of the oldest row a consumer has not read is no metric yet.** The log stores no time: a row of
  `effecttea_outbox` holds its position, its partition and its `seq`, and a publication holds the message and the
  projection. An age needs a time on each row, a column of the log's tables. The step on PostgreSQL in the
  [roadmap](../roadmap.md) changes the migration of those tables, so the column waits for it
  ([open question](../open-questions.md#storage-and-reading)). Until then `consumers` gives an operator how many rows
  each consumer is behind.
- **The names start with `tea.`**, as every object the runtime makes is named with tea
  ([decision 0198](0198-every-object-the-runtime-makes-is-named-with-tea.md)). Their dots are the convention of
  OpenTelemetry's attributes and metrics. `PrometheusMetrics` writes each character a name of Prometheus may not hold
  as an underscore, so a scrape reads `tea_mailbox_length`.
- **Nothing is computed for the tracer alone.** A span's attributes are what the step holds already, and no
  attribute holds a message, a state or a projection, which may hold data an operator may not see.

## What it rests on

- That each step is a root span with the attributes above, and that the steps of a request link its caller's span
  on one process: **tested** by
  `each step is a root span of its entity and its event, and the step of a request links its caller’s span` in
  [`src/runtime.test.ts`](../../src/runtime.test.ts), with a tracer that keeps every span.
- That an operation is a root span linked to the step that started it: **tested** by
  `an operation is a root span of its work, linked to the step that started it`.
- That a door's steps link the span of the request, and that an operation a door's step sets going links that
  step once the loop settles it: **tested** by
  `a door’s steps link the span of the request, and an operation links the step that started it`, on a Cluster the
  test plays.
- That a suspension is told on its step and counted, and that the mailbox and the running operations are recorded:
  **tested** by
  `a step that suspends its entity says where and is counted, and the mailbox and operations are metrics`.
- That a message offered on one process is handled by its own `Receive`, so that no `Handle` serves a caller's
  request there: **only reasoned**, from `receive` in [`src/machine.ts`](../../src/machine.ts) and the loop of
  [`src/loop.ts`](../../src/loop.ts). A message that finds the mailbox empty is handled as it arrives
  ([decision 0074](archive/0074-a-message-that-finds-the-mailbox-empty-is-handled-as-it-arrives.md)). The loop
  handles the mailbox to its end before it takes an event, and a suspended entity answers `Suspended` and queues
  nothing. A `Handle` of a caller's message is left only after a restart, where the caller's span is not held.
- That `Effect.withSpan` with `root: true` opens a span with no parent, whatever the fiber's, and with the links it
  is given: **documented** in the JSDoc of `SpanOptionsNoTrace` in `node_modules/effect/src/Tracer.ts` at 4.1.2, a
  stable module, and **tested** by the tests above.
- That `Metric`'s counter, gauge and histogram, `Metric.withAttributes` and `Metric.update` are stable: **documented**
  in `node_modules/effect/src/Metric.ts` at 4.1.2.
- That `PrometheusMetrics` writes a dot as an underscore: **read in a dependency's source**, `sanitizeMetricName` in
  `node_modules/effect/src/observability/PrometheusMetrics.ts`, a module marked `@stability unstable`, which the
  runtime does not import. A release that wrote names otherwise changes what a scrape reads, and not what the
  runtime records.

## Alternatives

- **A step as a child of the caller's span.** A trace would then show a request and the steps it caused as one tree.
  The loop's fiber inherits the span of the caller that loaded the entity, and a step parented by its own caller
  would need the loop to open each step under a span it is handed. The step of another caller's message, the
  completions and the firings would still have no caller. A link says the same of the caller's step, and leaves the
  rest alone.
- **A span of a suspension**, from the step that suspends to the resumption. It is exported only once it ends, so the
  suspension the operator looks for would be the one span missing.
- **A span of a timer's sleep.** It would last for months, and a timer is seen where it fires, as a `Fire`.
- **Metrics by entity.** A gauge of each entity's mailbox would make a series of every entity a process ever loaded,
  and a backend keeps every series it was given.
- **`Effect.fn` for each function of the runtime.** It records a span and a stack frame of every call, of the
  runtime's internals, under names that change with the code.

## Consequences

- A span opened in the loop adds points where fibers yield. The seeds pinned in the explored tests were found again,
  together with the timers' sleeps of [decision 0221](0221-a-timer-sleeps-an-hour-at-most-and-reads-the-wall-clock-again.md).
- A deployment without a tracer of its own gets Effect's native one, which keeps nothing once a span ends.
