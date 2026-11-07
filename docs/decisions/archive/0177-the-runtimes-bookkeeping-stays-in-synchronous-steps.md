# 0177. The runtime's bookkeeping stays in synchronous steps, and not in Effect's `Tx` modules

**Status:** accepted, 2026-11-07. Decides the [open question](../../open-questions.md#running) of bookkeeping in
transactions, and takes the step of the roadmap that waited on it out. Keeps
[decision 0068](0068-what-another-fiber-reads-changes-in-one-step.md) as it is.

## Context

What another fiber reads changes in one synchronous step
([decision 0068](0068-what-another-fiber-reads-changes-in-one-step.md)). The rule is kept by hand, and the
tests under prioritized schedules check it ([decision 0104](0104-the-runtimes-tests-choose-where-fibers-yield.md)).
Effect's `Tx` modules (`TxRef`, `TxHashMap`, `TxHashSet`, `TxSemaphore`, `Effect.tx`, `Effect.txRetry`) would keep
it in transactions instead. The open question asked whether a rewrite is worth it once the runtime is whole, and
once Effect Cluster says what bookkeeping a node keeps. Both are true now: the runtime runs on one process and on
Cluster, and Cluster's runners hold shards. The spike `spikes/effect-tx-under-the-scheduler.test.ts` saw what a
rewrite would be under the scheduler of the tests.

## Decision

- **The bookkeeping stays in synchronous steps.** The maps, counts and flags of [`src/runtime.ts`](../../../src/runtime.ts)
  stay plain values, changed in one `Effect.sync` where another fiber reads them, as decision 0068 says. No module
  of `src/` imports a `Tx` module.
- **An entity's lock stays a `Semaphore`.** The `Semaphore` serves its waiters in the order they came, and a lock
  made of a `TxHashSet` or a `TxSemaphore` does not.
- **A wait that misses no change still takes its signal before it looks.** `settled`, `emptied`, a `feed` that
  waits and an operation that waits for a resumption each take their `Deferred` before they read, as decision 0063
  says. The waker's reading keeps its flag and its poke.

## Why

- **Each wait the rewrite would make one transaction depends on I/O or on the time.** The waker reads its timers
  from the database, so only the check of its poke could be a transaction, which is what the flag and the
  `Queue.sliding` of one already keep. `settled` decides from the time a timer is due, and a transaction cannot wait
  for the time to pass. A `feed` that waits reads its page from the database.
- **A transaction cannot hold the lock across a step.** A step does I/O, so the lock stays a lock
  ([decision 0067](0067-each-entity-is-held-by-its-own-lock.md)). A lock made of a `TxHashSet` would be
  taken in one transaction and given back in another, and a commit would wake every waiter and run each one's body
  again.
- **The one wait the rewrite simplifies keeps its list.** An operation that waits for a resumption could wait with
  `txRetry` on a count of resumptions, but the list of who waits stays, since `suspended` shows it to an operator
  ([decision 0114](0114-an-operator-sees-the-suspended-entities-and-what-a-resume-did.md)). The rule of the order
  stays too: the count is read before the send, as the registration is made before it today.
- **The rewrite would change every read of the runtime's state.** A read of a `TxRef` is an effect. `quiet`,
  `drained` and every guard that reads a loaded entity would become effects, in a file of near three thousand lines,
  and the seeds the tests pin would be found again for every one of them.
- **Cluster keeps a runner's bookkeeping the same way.** `Sharding.ts` keeps its shards in `MutableHashMap` and
  `MutableHashSet`, changed in synchronous steps, and replaces a `Latch` when its shard locks change, as `ended` is
  replaced in the runtime.

## What it rests on

- That the waker's reading, `settled` and a `feed` that waits depend on I/O or on the time: **read in the code** of
  [`src/runtime.ts`](../../../src/runtime.ts), in `waking`, `quiet` and `waited`.
- That a `Tx` transaction is run again after a commit of a value it read: **documented** in the JSDoc of
  `Effect.tx` at 4.1.2, which calls a transaction optimistic with retry, and **seen in the spike**
  `spikes/effect-tx-under-the-scheduler.test.ts`. That I/O in a transaction would then run again is **only
  reasoned**, since the JSDoc does not say what an effect that is no transaction does inside one.
- That a lock made of `Tx` modules does not serve its waiters in order, and that a `Semaphore` does: **seen in the
  spike**, of a `TxSemaphore`, and **documented** in the JSDoc of `Semaphore.take`.
- That Cluster keeps a runner's bookkeeping in mutable structures changed in synchronous steps: **read in the
  source** of `cluster/Sharding.ts` at 4.1.2, which imports no `Tx` module.
- That the rules of decision 0068 hold as they are kept by hand: **tested** by the tests of
  [`src/runtime.test.ts`](../../../src/runtime.test.ts) under prioritized schedules, and by the rules of
  [decision 0164](0164-two-rules-of-the-runtime-are-kept-by-the-form-of-the-code-and-a-test-reads-it.md), which a
  test reads in the code.

## Alternatives

- **The structures of Effect.** Each module of the pinned version that could keep what another fiber reads was
  weighed.
  - `TxRef` and `Effect.txRetry` would make an operation's wait for a resumption a wait on a count. They save the
    `Deferred` of each sender, and not the list `suspended` shows.
  - `TxHashMap` and `TxHashSet` would keep the loaded entities and the locks held. Every read of them would be an
    effect, and a lock of them is not served in order.
  - `TxSemaphore` would be the entity's lock. It does not serve its waiters in order, as the spike shows.
  - `TxQueue` and `TxPubSub` would be the waker's poke and the commits a `feed` waits for. The poke's `Queue.sliding`
    of one and the `Deferred` per topic keep the same in one step each
    ([decision 0142](0142-a-consumer-waits-for-a-row-of-its-topic.md)).
  - `TxSubscriptionRef` would tell `settled` of each change. `settled` also waits for the time a timer is due,
    which no transaction waits for.
  - `TxReentrantLock`, `TxDeferred`, `TxChunk` and `TxPriorityQueue` keep nothing the runtime keeps.
  - `Semaphore`, `Deferred`, `Queue` and `Latch` are the modules the runtime uses already, and stay.
- **A rewrite of the resumption's wait alone.** It mixes two ways of keeping the rule in one file, for one
  `Deferred` per sender saved.

## Consequences

- The step of the roadmap that would move the bookkeeping into `Tx` modules leaves it.
- The open question of bookkeeping in transactions leaves [`docs/open-questions.md`](../../open-questions.md).
- A new wait of the runtime keeps decision 0068 by hand, and its test under the scheduler of the tests checks it.
- The spike `spikes/effect-tx-under-the-scheduler.test.ts` stays, as what a rewrite would find if a release of
  Effect let a transaction wait for the time or hold across I/O.
