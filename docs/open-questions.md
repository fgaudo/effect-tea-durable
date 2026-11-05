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
- **The order of what is published.** A cursor over the outbox skips nothing while one transaction writes at a
  time, which is what the runtime on SQLite does
  ([decision 0038](decisions/archive/0038-what-happened-is-published-through-an-outbox.md)). Where two write at once —
  a cluster, or a store that allows it — a row with a lower `seq` may commit after one a consumer has read, and
  be stepped over. What orders the log then, and what a consumer reads from, is not decided.
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
- **One projection for every reader.** A program has one `project`, and a step that changes it writes it whole in
  the row of the read model and in a row of the outbox
  ([decision 0032](decisions/archive/0032-a-projection-is-a-row.md),
  [decision 0038](decisions/archive/0038-what-happened-is-published-through-an-outbox.md)). The design advises a
  projection that shows what a caller acts on
  ([decision 0135](decisions/0135-a-large-state-is-split-by-the-program-and-the-runtime-warns-of-it.md)), but
  different readers act on different things: a shipping service reads an order's address, a dashboard its
  status. One projection is then the union of what every reader needs, and each consumer of the outbox receives
  the whole of it at every step that changes any part of it, which it cannot tell from a change of the part it
  reads. A boundary that picks fields before it answers `read` spares the reader, and not the step's writes or
  the log. Whether a program declares several projections by name, each a pure function of the state, written
  only when it changes, with the outbox's row and the indexes naming the one they hold, is not decided. It would
  be decided by:
  - a program with two consumers of its outbox that read different parts of what it shows, where the rows one
    receives for the other's changes show in `consumers`;
  - what `read`, `query` and `reindex` take once a projection has a name, and what the row of the read model and
    the row of the outbox hold;
  - whether an index reads one named projection or the state, since an index over the state would query what no
    caller reads, which decision 0032 keeps out.
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
