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

- **A log that nobody prunes.** A consumer is a name holding a stored cursor, and the runtime never drops a row
  a consumer has not read: one that stops acking holds the log, where `consumers` shows it
  ([decision 0039](decisions/archive/0039-a-consumer-of-the-outbox-keeps-its-cursor.md)). Nothing caps what that grows
  to. A step that cannot publish cannot commit, so a cap would stop the entities: what a deployment does when
  the disk is the limit — a warning, a refusal, a drop that says which consumer lost rows — is not decided.
  Neither is a consumer nobody meant: `feed` stores the name it is given at its first reading, so a name
  mistyped once holds its topic until an operator finds it in `consumers` and calls `forget`, and nothing
  tells the two apart from a consumer that is slow. It would be decided by:
  - a deployment that runs out of disk under a consumer that stopped, measured for what the runtime can still
    do once a step cannot commit;
  - whether the consumers of a topic are declared, with the program or at `deploy`, so that a name not declared
    is the caller's defect as a topic not declared is
    ([decision 0053](decisions/archive/0053-what-a-handle-is-given-is-checked.md)), or whether a consumer that
    has not acked within a time of the operator's is forgotten, and told so at its next reading.
- **A consumer that polls.** The runtime writes the log and does not deliver it: a consumer calls `feed` again
  and again, and nothing tells it that a row was written
  ([decision 0039](decisions/archive/0039-a-consumer-of-the-outbox-keeps-its-cursor.md)). A consumer that polls
  every second learns of a step a second late and reads an empty page the rest of the time, and a hundred consumers
  read a hundred empty pages. Whether the handle wakes a consumer is not decided: a `feed` that waits until a
  row is past the cursors, a signal per topic that a step raises when it commits a row there, or a stream of pages
  over either. It would be decided by:
  - a program whose consumer must act within less than a polling interval, a notification or a payment to confirm,
    measured for the delay and for the empty readings under polling;
  - what a wait in `feed` costs the runtime, which holds no state for a consumer today, and how long a
    consumer waits where no row comes, since a call that never returns is a fiber held for the life of the process;
  - whether the signal is the row's or the step's, since a step writes one row per topic whose selection changed,
    and a consumer of one topic is not woken by a step that published in others.
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
- **Paging a query.** `query` takes a limit, and gives the first rows in its order
  ([decision 0141](decisions/0141-a-query-and-a-reading-of-the-log-take-a-limit.md)). It takes no cursor after the
  last row given, so a caller that needs every row that matches reads them only up to a limit it can hold, and a
  criterion on the index it orders by misses the rows that tie with the last one. Whether a query takes the id of the
  last row, as `published` takes its cursors, is not decided. It would be decided by:
  - a program whose caller walks a read model larger than one page, a report or an export;
  - what the page after a row is where the order is an index with ties, and whether the id breaks them in the
    cursor as it does in the order.
- **A number over many entities.** `query` gives the ids found with their projections, within a limit, so a
  question about a list of entities is answered by SQLite over the indexes
  ([decision 0032](decisions/archive/0032-a-projection-is-a-row.md)). A question whose answer is one number over
  every entity that matches, how many orders await their payment or what the orders paid today add up to, has
  no handle: a caller pages through every row and counts them in the process. A program answers it today with
  an entity that keeps the number, sent a message by each entity that changes it, or with a consumer of the
  outbox that feeds a store made for it. Whether the read model answers a count, and a sum over an index, in
  one statement of SQLite, is not decided. It would be decided by:
  - a program whose dashboard asks the number at every view, where the entity that keeps it costs a message per
    change and the paging costs a read of every row;
  - which aggregates the handle takes, and whether a sum over an index that is not a number is the caller's
    defect, as a cursor that is not an integer is
    ([decision 0053](decisions/archive/0053-what-a-handle-is-given-is-checked.md));
  - what the handle answers while `reindex` runs, since the rows it has not written yet hold the old index.

## Running

- **A mailbox with no bound.** An entity's events wait in an unbounded queue of the process, its messages in the
  table `mailbox`, and each caller waits with a `Deferred` of its own until its message is handled
  ([decision 0063](decisions/archive/0063-the-runtime-waits-for-what-it-waits-for.md)). Nothing bounds any of the
  three: a slow entity, one whose steps are long, sent to faster than it steps grows all of them until the process
  dies, and nothing names the entity before that. The runtime warns of a large step
  ([decision 0135](decisions/0135-a-large-state-is-split-by-the-program-and-the-runtime-warns-of-it.md)), and of
  nothing else. Whether the runtime warns of a mailbox past a length, through the same logger, and whether a
  `send` past a bound waits or is answered at once, is not decided. It would be decided by:
  - a program whose callers send to one entity faster than it steps, where the length a step takes to handle
    shows what a caller waits;
  - what a `send` refused for a full mailbox is to its caller, a rejection the program never wrote or a defect, and
    what an operation of another entity that sends does with it, since a runner retries and the state counts the
    attempts ([decision 0130](decisions/0130-a-runner-retries-and-the-state-counts-the-attempts.md));
  - what Effect Cluster bounds of a mailbox, once the runtime runs on it.
- **Entities loaded without a capacity.** `capacity.entities` is an option, and a process launched without it
  unloads an entity only once it has been idle for `passivate`, 30 seconds by default
  ([decision 0076](decisions/archive/0076-a-process-over-its-capacity-unloads-the-least-recently-used.md),
  [decision 0029](decisions/archive/0029-an-idle-entity-is-unloaded.md)). Each entity loaded holds its decoded
  state and what callers read of it, with the canonical text of each topic's selection. A burst of distinct
  entities within half a minute holds all of them, and only the time bounds the number. Whether the capacity has a
  default, and what number an operator wants told, in entities or in characters held, is not decided. It would be
  decided by:
  - a program whose entities arrive in bursts, measured for what a loaded entity holds against its state's size;
  - whether the warning of decision 0135 is the form, a log once the process holds more than a threshold, or
    whether a default capacity, that unloads the least recently used, is.
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
