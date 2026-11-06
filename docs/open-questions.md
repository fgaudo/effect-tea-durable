# Open questions

What is not decided yet. A question leaves this file when a note in [`decisions/`](decisions) decides it.

## Programs

- **A message to every child by id.** `children.<child>.update(id, message)` replaces the parent's state once per
  child it is sent to, so a step that tells every child something, a checkout told to each line, copies the record
  of children once per child: 1.7 s for 4 000 lines in `examples/cart`, where the listing of the children by id
  costs 4 ms ([decision 0133](decisions/0133-an-entity-composes-children-as-effect-tea-does.md)). Whether a parent
  gets a form that tells every child at once, and replaces the state once, is not decided. It would be decided by:
  - a program whose children are told something together in numbers where the copies show;
  - what the form returns where some children raise events, in which order, and what it does where one rejects;
  - whether effect-tea's `forEach` is the form, made to replace once, so that the two libraries stay alike.

## Storage and reading

- **A disk that is really full.** A step that cannot commit dies, and a forget and a prune free the room steps need
  ([decision 0152](decisions/0152-the-consumers-of-a-topic-are-declared-at-deploy.md)). The spike `spikes/full-database.test.ts` sees it
  under `PRAGMA max_page_count`, with the rollback journal, which caps the database file and not its journal. On a
  disk that is really full a delete needs room in the journal too, and in WAL mode, the client's default, the rows
  go to the WAL, which `max_page_count` does not cap. Whether a prune can still run there, and what an operator does
  where it cannot, is not decided. It would be decided by:
  - a database on a volume of fixed size, in WAL mode, filled under a consumer that stalled, and the forget and the
    prune run on it;
  - whether the runtime keeps room of its own, a file it drops once the disk is full, so that a prune always has
    the room it needs.
- **Readers of one consumer.** A consumer is a name within a topic, and `feed` gives every reader of the name the
  rows past its cursors: two fibers that read under one name are given the same rows, and act on them twice, with
  only the ack between them ([decision 0039](decisions/archive/0039-a-consumer-of-the-outbox-keeps-its-cursor.md)).
  A pool of workers that reads one topic in parallel takes a name per worker today, and divides the partitions
  among the names by hand: a worker added moves the division, and the cursors stay with the old names. Whether the
  readers of one name are assigned partitions, as the consumers of a group are on Kafka, is not decided. It would
  be decided by:
  - a program whose consumer cannot keep up with one reader, measured for the rows a reader acts on in a second
    against the rows its topic gains;
  - what a reader holds, a lease of its partitions for a time, and what becomes of a lease whose reader died,
    since the runtime holds nothing for a consumer between two calls
    ([decision 0142](decisions/0142-a-consumer-waits-for-a-row-of-its-topic.md));
  - whether the division is the runtime's or the caller's, which would name the partitions it reads, as
    `published` is given its cursors.
- **The projection written once per topic.** A row of a topic stores the projection whole, and the selector runs
  where the row is read, so that a topic needs no migration of its own
  ([decision 0140](decisions/0140-a-row-of-a-topic-gives-its-value.md)). A step that changes what five topics
  select writes the projection six times, once in the read model and once in each topic, where a program that
  declares no topics writes it twice. The topics were added so that a consumer reads less, and they make a step
  write more. Whether the outbox stores the projection once per step, in a row keyed by the partition and the
  `seq`, with a row per topic that names it, is not decided. It would keep what decision 0140 rests on, the reading
  through the projection's migrations, and bring a step back to two writes of the projection whatever the number
  of topics. It would be decided by:
  - a program with several topics whose entities' steps the warning of
    [decision 0135](decisions/0135-a-large-state-is-split-by-the-program-and-the-runtime-warns-of-it.md) names,
    measured in `spikes/large-states.test.ts` with the topics it declares;
  - what `prune` drops of such a row once every topic that names it is read past it, and what `feed` reads where
    a row of a topic and the projection it names are two rows.
- **Renaming a program.** A program's name is the entities' address, and a schema's migration does not move
  what is stored under it: its entities, and the replies stored for them by other entities
  ([decision 0022](decisions/archive/0022-a-new-program-keeps-what-work-started-with.md)). How a rename is run, and
  what reaches the senders that stored a reply under the old name, is not decided. A schema that changes is
  ([decision 0036](decisions/archive/0036-a-migration-is-a-function-on-the-json.md)).
- **Generated cases of a migration.** A case of a migration is recorded by hand, with the JSON a version wrote and
  the JSON the next one reads
  ([decision 0126](decisions/0126-a-program-keeps-every-migration-and-a-test-records-what-each-did.md)). A changed
  migration that keeps every recorded case is not seen. That a row of an older version is still read at the
  program's version needs no recorded reading: a generated value of the older version, migrated and decoded,
  must not die. A case without `read` would check that alone, over values a property test generates. But an
  arbitrary of an older version's JSON is a shape of that version kept in the tests for as long as the
  migration, which decision 0036 keeps out of the code. Whether it is worth it is not decided. It would be decided by:
  - a program with a migration of many branches, whose recorded cases a change could keep while it reads other
    rows otherwise;
  - what an arbitrary of an older version costs to keep, next to the cases recorded of it.

## Running

- **Two versions at once.** During a rolling deploy, a state written by the new version may be read by the
  old one. Is forward compatibility for one version required, or do deploys avoid it? A database is held by one
  runtime ([decision 0080](decisions/archive/0080-a-database-is-held-by-one-runtime.md)), so two versions meet only where
  two processes share a store. On Effect Cluster a runner carries no version, and a shard may go from a new runner
  back to an old one ([Cluster](cluster.md#two-versions-at-once)): the choice is between deploys that replace every
  runner before a new one writes, forward compatibility for one version, or a change to Cluster.
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
