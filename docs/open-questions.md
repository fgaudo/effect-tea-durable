# Open questions

What is not decided yet. A question leaves this file when a note in [`decisions/`](decisions) decides it.

## Programs

- **Work under many keys.** A program declares its keys, so an entity holds as many pieces of work as it has
  keys, and no more ([decision 0033](decisions/archive/0033-a-program-declares-its-keys.md)). A state that would hold one
  operation per line of an order has nowhere to put them. Do such items want to be entities of their own, as a
  large state does, or is there a kind of work held under keys a state computes?
- **Work that may be abandoned.** An operation leaves only through its completion. Is there a kind of work with
  no effect on the world (a computation, a read) that a state may drop, as effect-tea drops a subscription?
- **Live streams.** A timer and an operation survive passivation. A stream from a socket or a feed does not.
  Are they allowed, keeping the entity loaded while their key is present, or left out? A process over its
  capacity unloads only entities with nothing to do
  ([decision 0076](decisions/archive/0076-a-process-over-its-capacity-unloads-the-least-recently-used.md)), so a stream
  that keeps its entity loaded would count as something to do, and hold a place under the capacity.
- **Children inside an entity.** effect-tea composes programs into a tree. Does an entity's program compose
  children the same way, stored as one state? The decider pattern (Jérémie Chassaing's `Decider`) has an algebra
  for it — two state machines compose into one, with laws a test can check — and is worth reading before this is
  designed, although it stores the events where this design stores the state
  ([decision 0002](decisions/archive/0002-store-the-state-not-the-messages.md)).
- **Rehearsing entities together.** `rehearse` runs one entity, and the test answers for the others. A booking
  that sends a confirmation the inventory would reject passes both rehearsals
  ([decision 0009](decisions/archive/0009-entities-talk-through-operations.md)). Is a rehearsal of several entities
  needed, where `send` reaches the other program, or a check that two programs agree on their messages?
- **Who may send what.** `update` reads `meta.from` and rejects what a sender may not do. Should authorization
  that is not domain (a valid token) happen before the mailbox, and what does the caller get then? Flags and
  messages that do not encode are the caller's defect, not a reply
  ([decision 0049](decisions/archive/0049-flags-are-checked-by-their-schema.md)). And who may create an entity, since
  `init` sees no sender ([decision 0012](decisions/archive/0012-creation-is-a-request-of-its-own.md))? A defect at
  creation stores nothing ([decision 0014](decisions/archive/0014-rules-the-machine-settled.md)): what is its creator
  answered? A caller's requests are its sender's
  ([decision 0048](decisions/archive/0048-a-callers-request-belongs-to-its-sender.md)), so how fine a sender is says
  whose request ids are whose.

## Storage and reading

- **A log that nobody prunes.** A consumer is a name holding a stored cursor, and the runtime never drops a row
  a consumer has not read: one that stops acking holds the log, where `consumers` shows it
  ([decision 0039](decisions/archive/0039-a-consumer-of-the-outbox-keeps-its-cursor.md)). Nothing caps what that grows
  to. A step that cannot publish cannot commit, so a cap would stop the entities: what a deployment does when
  the disk is the limit — a warning, a refusal, a drop that says which consumer lost rows — is not decided.
- **The order of what is published.** A cursor over the outbox skips nothing while one transaction writes at a
  time, which is what the runtime on SQLite does
  ([decision 0038](decisions/archive/0038-what-happened-is-published-through-an-outbox.md)). Where two write at once —
  a cluster, or a store that allows it — a row with a lower `seq` may commit after one a consumer has read, and
  be stepped over. What orders the log then, and what a consumer reads from, is not decided.
- **Large states.** Each message stores the whole state. Where is the limit, and what does a program with a
  large state do: split into entities, or store a difference?
- **Renaming a program.** A program's name is the entities' address, and a schema's migration does not move
  what is stored under it: its entities, and the replies stored for them by other entities
  ([decision 0022](decisions/archive/0022-a-new-program-keeps-what-work-started-with.md)). How a rename is run, and
  what reaches the senders that stored a reply under the old name, is not decided. A schema that changes is
  ([decision 0036](decisions/archive/0036-a-migration-is-a-function-on-the-json.md)).
- **Migrations that never leave.** A program's version is how many migrations it carries, plus one
  ([decision 0036](decisions/archive/0036-a-migration-is-a-function-on-the-json.md)): nothing is declared, and no bump is
  forgotten. But a migration can never be dropped, since dropping the first renumbers every version after it, and
  a row is migrated only when it is written again, while a caller's reply is kept for ever
  ([callers' stored replies](#running)). So a program carries every migration it ever had. Dropping them would
  need every row written again at the program's version — what `reindex` does for the read model alone — and a
  version that starts past 1, which a program then declares: one that forgets to raise it reads its own rows as
  newer and fails loudly ([decision 0043](decisions/archive/0043-a-row-no-version-reads-fails-what-reads-it.md)). Nothing
  either checks that a migration once deployed is never changed, which a function cannot be compared for. Is it
  worth it, and once replies are no longer kept for ever?

## Running

- **Two versions at once.** During a rolling deploy, a state written by the new version may be read by the
  old one. Is forward compatibility for one version required, or do deploys avoid it? A database is held by one
  runtime ([decision 0080](decisions/archive/0080-a-database-is-held-by-one-runtime.md)), so two versions meet only where
  two processes share a store. On Effect Cluster a runner carries no version, and a shard may go from a new runner
  back to an old one ([Cluster](cluster.md#two-versions-at-once)): the choice is between deploys that replace every
  runner before a new one writes, forward compatibility for one version, or a change to Cluster.
- **Callers' stored replies.** A caller's reply is stored so that a retry gets it, and is kept for ever: a time
  after which a retry is applied again would depend on the protocol, and on who callers are
  ([who may send what](#programs)). Replies to entities are kept while the work that asked is stored
  ([decision 0021](decisions/archive/0021-a-reply-is-kept-while-the-work-that-asked-holds.md)).
- **Failing operations.** A transient failure (a timeout) is retried inside the operation, or becomes a
  message. After how many retries does it become a defect, if ever? And
  should the runtime notice work that comes back at once, turn after turn: a timer kept at a time already past,
  an operation kept on its own completion ([decision 0008](decisions/archive/0008-delivered-work-is-done.md))?
- **Bookkeeping in transactions.** What another fiber reads changes in one synchronous step
  ([decision 0068](decisions/archive/0068-what-another-fiber-reads-changes-in-one-step.md)): a rule kept by hand, which
  a step that waits cannot keep. The waker reads the entities held and then waits for a poke, and only the steps
  between the two keep a timer from being slept past. Effect's `Tx` modules (`TxRef`, `TxHashMap`, `Effect.tx`,
  `Effect.txRetry`) would make the reading and the wait one transaction, and `settled` a wait on a condition. A
  transaction does no I/O, so an entity's lock stays
  ([decision 0067](decisions/archive/0067-each-entity-is-held-by-its-own-lock.md)), and holds in one process only. Is it
  worth it once the runtime is whole, and once Effect Cluster says what bookkeeping a node keeps? The tests that
  run the runtime under prioritized schedules are what such a rewrite is checked against, and the two interleavings
  [decision 0104](decisions/archive/0104-the-runtimes-tests-choose-where-fibers-yield.md) reached are of the same kind:
  either way they stay to be reached by a test, and what changes is the rule each test takes out. What a rewrite
  would be, and what the spike `spikes/effect-tx-under-the-scheduler.test.ts` saw of it under the scheduler of 0104:
  - an operation that sends a message to a suspended entity waits for that entity's resumption (`awaitResumption` in
    `src/runtime.ts`). The operation would read a count of resumptions in a `TxRef`, and wait with `txRetry` while
    the count is unchanged. The `Deferred` each waiting operation registers today would go. A list of the waiting
    operations would stay, since `suspended` shows them to an operator
    ([decision 0114](decisions/0114-an-operator-sees-the-suspended-entities-and-what-a-resume-did.md)).
    `txRetry` checks what it read and registers its wait in one synchronous step (`awaitPendingTransaction` in
    `effect/src/Effect.ts`, read in the source). A rule stays: the count is read before the send, or a resumption
    between the answer and the read is missed, and the operation waits for one that may never come. The spike runs
    both orders. With the count read first, no resumption is missed in any schedule within 3 deviations or among
    500 prioritized ones, and the schedules reach a resumption before the send, one between the answer and the wait,
    and one during the wait. With the count read after the answer, the operation waits for ever in a schedule within
    1 deviation;
  - a commit's wake is a task of the committing fiber's dispatcher, so the tests pick when it runs. `commitTransaction`
    calls `scheduleTask`, read in the source. The spike sees it: a run under `scheduled` ends, with no timer and no
    microtask, after its body waited on `txRetry`;
  - a conflict reruns an attempt at most once, however many commits fall in it, and only after a commit of a value
    it read. So the k-th body to commit reruns k - 1 times at most. In the spike, three bodies that yield between
    their read and their write rerun from 0 to 3 times in all, and lose no update;
  - an entity's lock (`holding`) would be a `TxHashSet` of the entities held, taken by one transaction that retries
    while the entity is in it and given back by another, held between the two across the I/O, with no count of users
    to keep. Such a lock does not serve its waiters in order. A commit wakes every waiter, and the first to run again
    takes the lock, so a waiter that came later can take it first, as the spike shows of a `TxSemaphore`. The
    `Semaphore` the runtime uses now serves its waiters in the order they came. The JSDoc of `Semaphore.take`
    promises it, and the spike sees it. With many waiters, each commit also runs every waiter's body again. Whether
    the runtime needs its callers served in order is not decided.

## Naming

- The name of the library, once there is code to publish.
