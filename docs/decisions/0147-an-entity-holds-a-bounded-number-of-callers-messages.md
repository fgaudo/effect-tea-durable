# 0147. An entity holds a bounded number of callers' messages

**Status:** proposed, 2026-11-05. Changes
[decision 0074](archive/0074-a-message-that-finds-the-mailbox-empty-is-handled-as-it-arrives.md), where nothing but
the server in front of the process bounds a burst, and
[decision 0046](archive/0046-a-receiver-that-crashes-is-sent-again.md), whose sender sends again only to a receiver
that crashed.

## Context

A caller's message waits in an unbounded queue of the process until the entity's loop takes it, and the caller
waits with a `Deferred` of its own until the message is handled
([decision 0063](archive/0063-the-runtime-waits-for-what-it-waits-for.md)). A message taken while the mailbox holds
something is queued in the mailbox, and its caller waits on
([decision 0074](archive/0074-a-message-that-finds-the-mailbox-empty-is-handled-as-it-arrives.md)). An entity whose
callers send faster than it steps grows the queue, the callers waiting and the mailbox, until the process dies, and
nothing names the entity before that.

Effect Cluster bounds the requests an entity holds. `entityMailboxCapacity` is 4096 by default, and a request past
it fails with `MailboxFull`.

## Decision

- **An entity holds at most `mailbox.messages` callers' messages, 4096 by default.** The count is the messages
  of `send` offered to the entity and not yet applied, and the inbound messages its mailbox holds. Both are messages
  whose callers wait. A completion, a firing, a creation and an operator's resume or discard are not counted, and
  never refused: the entity's own work is bounded by its keys, and the rest come one at a time. The number is a
  positive integer, and anything else fails the launch.
- **A `send` past the bound is answered `Full` at once.** Nothing of it is offered or stored, so the message is
  applied by none, and a retry under the same request id is a new try. A message that waits behind another counts
  until its step, so a full entity is one whose callers already wait for as many steps. `Full` is an `Answer`, as
  `Suspended` is: the boundary maps it to its protocol's answer for a server that is busy, and its caller retries
  later.
- **An operation of another entity is never given `Full`.** Its `send` waits for `retry` and sends again under the
  same request, as to a receiver that crashed
  ([decision 0046](archive/0046-a-receiver-that-crashes-is-sent-again.md)). The operation sees one reply, and its
  attempts are not counted by the state
  ([decision 0130](0130-a-runner-retries-and-the-state-counts-the-attempts.md)), since none of them failed.
- **The first refusal of an activation logs a warning.** It names the entity and the bound, through Effect's logger,
  as the warning of a large step does
  ([decision 0135](0135-a-large-state-is-split-by-the-program-and-the-runtime-warns-of-it.md)). One warning per
  activation keeps a burst from logging once per caller.
- **The count is read and the message offered in one synchronous step, while the entity is held.** The entity's
  lock already serializes its callers ([decision 0067](archive/0067-each-entity-is-held-by-its-own-lock.md)). The loop
  only lowers the count, so a caller that reads it before a step ends refuses at worst a message the bound had room
  for.

## What it rests on

- That a caller's message is offered under the entity's lock, and the loop takes its events without it: **reasoned**,
  from `withEntity` and `steps` in [`src/runtime.ts`](../../src/runtime.ts). The tests of this note check the
  refusal while a step holds the loop.
- That a refused message leaves nothing to undo: **reasoned**. The refusal comes before `ask` registers the caller
  and before `offer`, and the machine never sees the message.
- That Effect Cluster refuses past `entityMailboxCapacity` and replays a persisted request from storage:
  **documented** for the default, by the JSDoc of `ShardingConfig.entityMailboxCapacity`, "the default capacity of
  the mailbox for entities", and **read in the source** for the rest, in `cluster/internal/entityManager.ts` and
  `cluster/Sharding.ts` of `effect` 4.1.2. The default of 4096 rests on nothing else, and an operator changes it.

## Alternatives

Each structure of Effect that holds a bound was weighed against the count the decision needs: callers' messages
alone, in the queue and in the stored mailbox, refused at once, with the entity's own events never refused.

- **A `Queue.bounded` of events.** Its `offer` waits for room. A caller waiting for room holds its fiber and its
  connection, which is the memory the bound is for. The offer is made under the entity's lock, so a wait there
  would hold every other caller of the entity too. The queue also carries completions, firings and the loop's own
  items (decisions [0076](archive/0076-a-process-over-its-capacity-unloads-the-least-recently-used.md),
  [0116](0116-an-entitys-wait-ends-with-an-item-of-its-queue.md)), which must never wait.
- **A `Queue.dropping` of events.** `offerUnsafe` gives `false` when it is full, which is the refusal. But its
  capacity counts every item of the queue, a completion's included, which would be dropped. Two queues, one for the
  callers, would need a take raced between them, which decision 0116 rules out.
- **A `Queue.sliding` of events.** It drops the oldest item. A caller whose message is dropped waits for ever.
- **A `Semaphore` per entity, taken with `takeIfAvailable`.** It refuses at once, and is released after a step.
  It would count the queue alone: the inbound messages of the stored mailbox are read off the machine's state, and
  one loaded with more than a smaller bound would hold more than its permits. A counter beside the queue and the
  machine's mailbox give the whole count in one synchronous step.
- **A `PartitionedSemaphore` across the entities.** It shares one pool of permits among partitions, so that no
  partition takes them all. The bound here is per entity, and a pool would let a busy entity refuse the callers of
  a quiet one. The module is marked `@stability unstable` too.
- **`PubSub`**, bounded, dropping or sliding: it gives each item to every subscriber, and an entity has one loop.
- **`TxQueue` and `TxSemaphore`.** They make the count a transaction. The count is already read in one synchronous
  step, and the move to Effect's `Tx` modules is an open question of its own, Bookkeeping in transactions.
- **`Pool`, `RateLimiter` and `Request` with its resolvers.** A pool bounds resources a caller borrows, a rate
  limiter bounds the rate and not the length, and a resolver batches requests. None bounds what waits.
- **A `Metric` gauge of each mailbox's length,** as Cluster's `entityMailboxMetrics` reports. A gauge per entity
  has one series per entity, and the runtime warns through the logger alone today. It would be added with metrics.
- **No default.** A process would still die under a burst unless its operator knew to set the option, where Cluster
  bounds by default.

## Consequences

- `Options.mailbox` and the `Full` answer are added to [`src/runtime.ts`](../../src/runtime.ts). `Loaded` counts
  the callers' messages offered and not applied, and `send` refuses past the bound, under the entity's lock.
  `Entities.send` waits for `retry` on `Full`, and sends again.
- The test `a send past the mailbox's bound is answered Full, and warned of once per activation` in
  [`src/runtime.test.ts`](../../src/runtime.test.ts) holds a step at its commit while callers send, and the test
  `an operation that sends to a full entity sends again after the retry, and is answered` checks the operation's
  wait.
- `docs/design.md` says under Execution what bounds a burst, and the open question A mailbox with no bound leaves
  `docs/open-questions.md`.
