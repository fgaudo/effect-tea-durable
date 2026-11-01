# 0107. What Effect documents of the premises

**Status:** accepted, 2026-11-01. Says which premises of the notes about Effect its documentation promises at 4.1.1,
and which only a spike or its source holds: of [decision 0002](0002-store-the-state-not-the-messages.md),
[0013](0013-the-runtime-is-a-pure-machine.md), [0029](0029-an-idle-entity-is-unloaded.md),
[0058](0058-work-is-compared-by-what-is-stored.md), [0059](0059-a-request-is-a-value.md),
[0066](0066-the-runtimes-tests-move-time.md), [0067](0067-each-entity-is-held-by-its-own-lock.md),
[0068](0068-what-another-fiber-reads-changes-in-one-step.md), [0078](0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md),
[0079](0079-what-a-caller-sets-going-is-finished-without-it.md), [0080](0080-a-database-is-held-by-one-runtime.md),
[0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md),
[0101](0101-a-moved-clock-gives-a-fiber-it-did-not-wake-one-turn.md),
[0103](0103-a-test-moves-the-wall-clock-ahead-of-the-sleeps.md) and
[0104](0104-the-runtimes-tests-choose-where-fibers-yield.md).

## Context

The premises about Effect were **seen** in spikes or **read in the source**, and a few found **documented** by the
reviews. Behaviour seen or read is what one release does; what the documentation promises is what the next keeps,
or breaks on purpose. No one had read, for each behaviour the library and its tests rely on, whether Effect
promises it.

The documentation read is the JSDoc of `effect` 4.1.1 in `node_modules/effect/src`, from which effect.website is
built, and of `@effect/sql-sqlite-bun` 4.1.1. The behaviours are those of the functions `src/` calls, of the spikes,
and of the premises of the notes.

## Decision

- **Documented**, so a premise that rests on it is **documented** from here:
  - `Semaphore.withPermits` releases its permits when the effect it wraps exits, whichever way (0067's lock);
  - `Effect.acquireUseRelease` acquires uninterruptibly, and runs the release uninterruptibly once acquired
    (`holding`);
  - `Effect.ensuring` and `Effect.onExit` run when the effect succeeds, fails or is interrupted;
  - `Effect.timeoutOption` interrupts its effect when the time runs out, and `Effect.raceFirst` the loser (0029's wait,
    the tests);
  - `Scope.close` runs its finalizers uninterruptibly, so a fiber that closes it waits for them, and `Scope.fork`
    closes the child with its parent;
  - `MixedScheduler`, the default, keeps the order of the tasks of one priority (0101);
  - `TestClock.adjust` runs what is scheduled on or before the new time, in order, under `TestClock.layer`; a clock
    made by `make` and provided by hand waits only one turn after each sleep it wakes (0066);
  - `DateTime.now` reads the `Clock` service (0103);
  - `@effect/sql-sqlite-bun` serializes access to the database, opens it in WAL mode, and begins an explicit
    transaction on a writable connection with `BEGIN IMMEDIATE`, which holds the write lock for its duration
    (0080, 0092).
- **Not documented**, so a premise that rests on it stays as its note says, **seen** or **read in the source**:
  - a `Queue.take` that a timeout interrupts takes nothing, so an item offered as it runs out stays in the queue
    (0029, `spikes/effect-queue-take-timeout.test.ts`). The docs say what `take` waits for, not what an interrupted
    one leaves. An entity's event would be lost in silence if this changed: an [open question](../open-questions.md#running);
  - a fiber forked inside `uninterruptible` is interruptible, and a joiner interrupted leaves the fiber it joined
    running (0078, 0079, `spikes/effect-uninterruptible-fork.test.ts`). `uninterruptible` says only that it disables
    interruption for its effect, and `Fiber.join` that it waits for the fiber;
  - when, and on which stack, a waiter of a `Deferred` or of `Effect.callback` resumes: 0104's two models rest on
    there being no promise, which holds;
  - that `adjust` gives a fiber forked before it one turn (0101, `spikes/effect-testclock-adjust.test.ts`);
  - that `withTransaction` rolls back when its effect fails or is interrupted (0002, 0013). Its docs speak of a
    transaction that "rolls back", of callbacks discarded then, and of retries, without saying when it does;
    `spikes/sqlite-transaction.test.ts` sees it, a killed process included;
  - what Cluster and Workflow do (0092, 0095, 0096, 0007). Their modules are `@stability unstable`, and options such
    as `defectRetryPolicy` have no documentation: **read in the source** is the most a premise of theirs gets, as
    [decision 0099](0099-a-library-on-unstable-modules-is-released-as-experimental.md) allows for.
- **Documented the other way**: Schema guarantees no order of the keys it encodes or decodes (`SchemaAST.ts`, the
  parse options; `Schema.ts`, `Record`). `spikes/effect-schema-field-order.test.ts` sees a struct write its fields in
  its schema's order, which 4.1.1 does and does not promise. 0058 and 0059 rely on no order: the machine compares
  JSON with the keys of each object sorted (`canonical` in [`src/machine.ts`](../../src/machine.ts)). The spike stays,
  and says what it sees is not promised.

## What it rests on

- What each item says the documentation holds, or does not: **documented**, read in the JSDoc of `effect` 4.1.1 —
  `Semaphore.ts`, `Effect.ts`, `Scope.ts`, `Scheduler.ts`, `Queue.ts`, `Deferred.ts`, `Fiber.ts`, `DateTime.ts`,
  `testing/TestClock.ts`, `sql/SqlClient.ts`, `Schema.ts`, `SchemaAST.ts`, `cluster/Entity.ts` — and of
  `@effect/sql-sqlite-bun` 4.1.1, `SqliteClient.ts`. An absence is what the docs of the functions named do not say,
  read in each; no other page of effect.website was read.
- That the code relies on no key order: **tested**, by the tests of 0058 and 0059 whose schemas hold a record
  (the review of 0046 to 0060).

## Consequences

- `spikes/effect-schema-field-order.test.ts` says that the order it sees is not promised.
- The take a timeout interrupts is an open question, the one premise here whose change would lose data in silence.
