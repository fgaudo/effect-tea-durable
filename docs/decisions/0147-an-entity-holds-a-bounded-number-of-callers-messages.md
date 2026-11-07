# 0147. An entity holds a bounded number of callers' messages

**Status:** accepted, 2026-11-05. Changes
[decision 0074](archive/0074-a-message-that-finds-the-mailbox-empty-is-handled-as-it-arrives.md), where nothing but
the server in front of the process bounds a burst, and
[decision 0046](archive/0046-a-receiver-that-crashes-is-sent-again.md), whose sender sends again only to a receiver
that crashed. On Effect Cluster a caller is never answered `Full`, and its message waits in Cluster's table, by
[decision 0165](0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md), proposed.

## Context

A caller's message waits in an unbounded queue of the process until the entity's loop takes it, and the caller
waits with a `Deferred` of its own until the message is handled
([decision 0063](archive/0063-the-runtime-waits-for-what-it-waits-for.md)). An entity whose callers send faster than
it steps grows the queue and the callers waiting until the process dies, and nothing names the entity before that.

The loop handles the mailbox before it takes an event, and a suspended entity answers `Suspended` to a message
without queuing it. So a caller's message is taken off the queue when the mailbox is empty, and is handled as it
arrives ([decision 0074](archive/0074-a-message-that-finds-the-mailbox-empty-is-handled-as-it-arrives.md)). An inbound
message is in the stored mailbox only where a crash left it, and no caller of the process waits for it.

Effect Cluster bounds the requests an entity holds. `entityMailboxCapacity` is 4096 by default, and a request past
it fails with `MailboxFull`.

## Decision

- **An entity holds at most `callers.messages` callers' messages, 4096 by default.** The count is the messages of
  `send` offered to the entity and not yet applied, whose callers wait. A completion, a firing, a creation and an
  operator's resume or discard are not counted, and are never refused. The entity's own work is bounded by its keys,
  a creation comes once, and an operator acts by hand. The number is a positive integer, and anything else fails the
  launch. The stored mailbox is not counted, since no caller waits for what it holds.
- **A `send` past the bound is answered `Full` at once.** Nothing of the message is offered or stored, so it is
  applied by none, and a retry under the same request id is a new try. A retry of a message that waits counts as a
  message of its own, since each is an event of the queue. `Full` is an `Answer`, as `Suspended` is. The boundary
  maps it to its protocol's answer for a server that is busy, and its caller retries later.
- **An operation of another entity is never given `Full`.** Its `send` waits for `retry` and sends again under the
  same request, as to a receiver that crashed
  ([decision 0046](archive/0046-a-receiver-that-crashes-is-sent-again.md)). The operation sees one reply, and its
  attempts are not counted by the state
  ([decision 0130](0130-a-runner-retries-and-the-state-counts-the-attempts.md)), since none of them failed.
- **The first refusal of an activation logs a warning.** It names the entity and the bound, through Effect's logger,
  as the warning of a large step does
  ([decision 0135](0135-a-large-state-is-split-by-the-program-and-the-runtime-warns-of-it.md)). One warning per
  activation keeps a burst from logging once per caller.
- **The count is a `Semaphore` of the entity, with a permit per message.** `send` takes a permit with
  `takeIfAvailable`, and is answered `Full` where none is free. The loop gives the permit back as the message's step
  ends, however the step ends. The permit is taken while the entity is held, which serializes its callers
  ([decision 0067](archive/0067-each-entity-is-held-by-its-own-lock.md)).
- **The permit and the offer are one uninterruptible region.** A caller interrupted between the two would keep a
  permit no step gives back. The lock gives its effect back its interruptibility, so the region is the send's own.
- **The permit is given back before the step is told done.** `settled` waits until no event is under way, and a
  process settled holds no permit of a message it applied.

## What it rests on

- That `takeIfAvailable` takes a permit or refuses at once, without waiting: **documented**, in the JSDoc of
  `Semaphore.takeIfAvailable` in `effect` 4.1.2, a stable API.
- That a caller's message is never in the stored mailbox while its caller waits: **reasoned**, from `steps` in
  [`src/runtime.ts`](../../src/runtime.ts), which handles the mailbox before it takes an event, and from `receive` in
  [`src/machine.ts`](../../src/machine.ts), which answers `Suspended` to a suspended entity. A change that queues a
  caller's message in the mailbox while its caller waits would need the stored mailbox counted too.
- That a refused message leaves nothing to undo: **reasoned**. The refusal comes before `ask` registers the caller
  and before the event is offered, and the machine never sees the message.
- That Effect Cluster refuses past `entityMailboxCapacity` and replays a persisted request from storage:
  **documented** for the default, by the JSDoc of `ShardingConfig.entityMailboxCapacity`, "the default capacity of
  the mailbox for entities", and **read in the source** for the rest, in `cluster/internal/entityManager.ts` and
  `cluster/Sharding.ts` of `effect` 4.1.2. The default of 4096 rests on nothing else, and an operator changes it.

## Alternatives

Each structure of Effect that holds a bound was weighed against what the decision needs: callers' messages alone,
refused at once, with the entity's own events never refused.

- **A counter written by hand.** It does what the semaphore does, and `Semaphore` is the primitive of Effect for it.
- **A `Queue.bounded` of events.** Its `offer` waits for room. A caller waiting for room holds its fiber and its
  connection, which is the memory the bound is for. The offer is made under the entity's lock, so a wait there
  would hold every other caller of the entity too. The queue also carries completions, firings and the loop's own
  items (decisions [0076](archive/0076-a-process-over-its-capacity-unloads-the-least-recently-used.md),
  [0116](0116-an-entitys-wait-ends-with-an-item-of-its-queue.md)), which must never wait.
- **A `Queue.dropping` of events.** `offerUnsafe` gives `false` when it is full, which is the refusal. But its
  capacity counts every item of the queue, a completion's included, which would be dropped. Two queues, one for the
  callers, would need a take raced between them, which decision 0116 rules out.
- **A `Queue.sliding` of events.** It drops the oldest item. A caller whose message is dropped waits for ever.
- **A `PartitionedSemaphore` across the entities.** It shares one pool of permits among partitions, so that no
  partition takes them all. The bound here is per entity, and a pool would let a busy entity refuse the callers of
  a quiet one. The module is marked `@stability unstable` too.
- **`PubSub`**, bounded, dropping or sliding. It gives each item to every subscriber, and an entity has one loop.
- **`TxQueue` and `TxSemaphore`.** They make the count a transaction. The count is already one synchronous step, and
  the move to Effect's `Tx` modules is an open question of its own, Bookkeeping in transactions.
- **`Pool`, `RateLimiter` and `Request` with its resolvers.** A pool bounds resources a caller borrows, a rate
  limiter bounds the rate and not the length, and a resolver batches requests. None bounds what waits.
- **A `Metric` gauge of each entity's messages,** as Cluster's `entityMailboxMetrics` reports. A gauge per entity
  has one series per entity, and the runtime warns through the logger alone today. It would be added with metrics.
- **No default.** A process would still die under a burst unless its operator knew to set the option, where Cluster
  bounds by default.

## Consequences

- `Options.callers` and the answer `Full` are added to [`src/runtime.ts`](../../src/runtime.ts). `Loaded` holds the
  semaphore, `send` takes a permit before it offers, and `Entities.send` waits for `retry` on `Full`, and sends again.
- The test `a send past the bound of its entity’s callers is answered Full, stores nothing, and is warned of once
  (decision 0147)` in [`src/runtime.test.ts`](../../src/runtime.test.ts) holds a step at its commit while callers
  send. The test `an operation that sends to a full entity sends again after the retry, and is answered (decision
  0147)` checks the operation's wait.
- The test `a caller interrupted anywhere as it sends leaves its entity’s bound whole, in every schedule within one
  deviation` interrupts a caller at each point of its send. It found the permit given back after `settled` was told,
  which the decision now orders. A send that yields between the permit and the offer, outside the uninterruptible
  region, fails it too.
- `docs/design.md` says under Execution what bounds a burst, and under Entities that talk what an operation does
  with a full receiver. The glossary defines `Full`, and the open question A mailbox with no bound leaves
  `docs/open-questions.md`.
