# Reviews of the notes

Each review of the notes, as [`AGENTS.md`](../../AGENTS.md) has them made: the notes it read, and what it found, one
section per review in the order they were made.

A review takes out the rules its notes decide, one at a time, with [`scripts/mutate.ts`](../../scripts/mutate.ts),
which runs the tests and the compiler against each mutation it is given, and checks nothing else. The mutations are
written for the code the review reads, and are not kept.

## 2026-10-31: 0080 to 0091, and 0092 (proposed)

- 0095: a `defectRetryPolicy` that gives up does not end Cluster's retry; 0096: Cluster stores a defect no step gave
  for a type not registered, and 0090 keeps no id for it.
- Of 0092, for its step: a receiver's defect is not saved, and the id of a request answered with Cluster's defect has
  to be kept.
- Not checked: 0080's hold of a database not in WAL mode, which no test runs.

## 2026-10-31: 0001 to 0015, the first lot of the backlog

- Fixed: the status lines of [0006](archive/0006-a-defect-suspends-the-entity.md),
  [0009](archive/0009-entities-talk-through-operations.md), [0012](archive/0012-creation-is-a-request-of-its-own.md)
  and [0013](archive/0013-the-runtime-is-a-pure-machine.md) did not say that
  [0061](archive/0061-only-what-the-program-does-is-its-defect.md) and
  [0046](archive/0046-a-receiver-that-crashes-is-sent-again.md),
  [0047](archive/0047-a-request-of-an-operation-has-a-name.md) and
  [0060](archive/0060-send-and-create-take-no-key.md), and [0065](archive/0065-the-machine-holds-no-replies.md)
  changed them.
- Seen in spikes: a transaction is stored whole or not at all, when it fails, is interrupted, or its process is
  killed (`spikes/sqlite-transaction.test.ts`, for 0002, 0007, 0013); a workflow replays its body past a signal,
  which takes one value, on the engine in memory (`spikes/workflow-replays-its-body.test.ts`) and on Cluster's over a
  SQLite file, in a second process (`spikes/workflow-replays-its-body-on-cluster.test.ts`), for 0007.
- Seen too, for 0007, what a workflow does without a mailbox: messages through numbered signals, where a sender must
  know the number and each run reads every message before its own, and the modules of `effect/workflow`, none of them
  a mailbox into a workflow (`spikes/workflow-has-no-mailbox.test.ts`); that none exists is read in the source, as an
  absence no run shows.
- Tested: each rule of 0004, 0005 and 0008, and each of 0014 that still holds, fails a test once taken out, by hand,
  one at a time; the time of a rehearsal failed none, and has two tests now in `src/rehearse.test.ts`: that it moves
  to a timer's when it fires, and that it stays when a timer due earlier fires after one due later.
- Open: [a planned stop](../open-questions.md#running), which 0011 asks of the runtime and nothing does.
- Reasoned, and left so: what 0002, 0007 and 0011 say of systems they rejected (Akka Persistence, services with no
  idempotency keys).

## 2026-10-31: 0016 to 0030, the second lot of the backlog; 0016, which [0018](archive/0018-operations-are-data.md) superseded, and 0024, which decides nothing, are skipped

- [0098](archive/0098-json-is-effect-s.md): Effect has a `Json` type, which
  [0030](archive/0030-a-schema-encodes-to-json.md) said it had not; the library uses it, and `src/program.test.ts`
  has the compiler refuse a schema that encodes to a `DateTime.Utc`.
- Fixed: the status lines of [0017](archive/0017-creation-in-the-machine.md),
  [0018](archive/0018-operations-are-data.md),
  [0020](archive/0020-a-new-program-is-checked-against-the-stored-work.md),
  [0021](archive/0021-a-reply-is-kept-while-the-work-that-asked-holds.md),
  [0025](archive/0025-operations-and-projections-have-schemas.md), [0028](archive/0028-rules-the-runtime-settled.md)
  and [0029](archive/0029-an-idle-entity-is-unloaded.md) did not say that
  [0047](archive/0047-a-request-of-an-operation-has-a-name.md) and
  [0060](archive/0060-send-and-create-take-no-key.md), [0058](archive/0058-work-is-compared-by-what-is-stored.md),
  [0064](archive/0064-the-program-is-not-the-machines-state.md),
  [0057](archive/0057-the-machine-gives-what-is-written.md), 0058 again, 0029, and
  [0068](archive/0068-what-another-fiber-reads-changes-in-one-step.md),
  [0076](archive/0076-a-process-over-its-capacity-unloads-the-least-recently-used.md) and
  [0077](archive/0077-the-waker-tries-an-entity-it-cannot-load-again.md) changed them; nor did
  [0014](archive/0014-rules-the-machine-settled.md)'s, of the first lot, say that 0064 did.
- Seen in a spike: a take that a timeout interrupts loses no item offered as it runs out
  (`spikes/effect-queue-take-timeout.test.ts`, for 0029's wait).
- Documented at 4.1.1: `effect/sql`, `effect/cluster` and `effect/workflow` are `@stability unstable` (0019);
  `Schema.DateTimeUtc` declares a `DateTime.Utc` (0028, 0030).
- Tested: each rule of 0017, 0018, 0020, 0021, 0022 and 0023 that the machine keeps fails a test of
  `src/machine.test.ts` once taken out; the deletions of 0021 are `src/storage.test.ts`'s; 0029's readings of the
  timers due in batches are a test of `src/runtime.test.ts` over 600 entities.
- Not checked, being replaced: what 0018 and 0025 say of `Equal.equals`.
- Decided with the author: whether a published library may depend on unstable modules, which 0019 asked again at its
  naming and no open question held, by
  [0099](archive/0099-a-library-on-unstable-modules-is-released-as-experimental.md).
- Reasoned, and left so: what 0026 takes from effect-tea's `dispatchViolations`, and 0019's that an API that changes
  costs an update of the runtime alone.

## 2026-10-31: 0031 to 0045, the third lot of the backlog

- Fixed: the status lines of [0036](archive/0036-a-migration-is-a-function-on-the-json.md),
  [0038](archive/0038-what-happened-is-published-through-an-outbox.md),
  [0040](archive/0040-what-is-stored-encodes-to-json-as-it-is.md),
  [0041](archive/0041-a-completion-is-not-discarded.md) and [0044](archive/0044-a-firing-is-not-discarded.md),
  [0042](archive/0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md) and
  [0043](archive/0043-a-row-no-version-reads-fails-what-reads-it.md) did not say that
  [0058](archive/0058-work-is-compared-by-what-is-stored.md),
  [0057](archive/0057-the-machine-gives-what-is-written.md), 0057 again,
  [0064](archive/0064-the-program-is-not-the-machines-state.md),
  [0056](archive/0056-nothing-waits-for-an-operation-under-the-permit.md) and
  [0077](archive/0077-the-waker-tries-an-entity-it-cannot-load-again.md), and 0077 again changed them.
- Tested: each rule of 0037, 0040, 0041 and 0044 that the machine keeps, and 0032's that an index that dies suspends
  the entity, fails a test of `src/machine.test.ts` once taken out; the check that an index is a number JSON holds,
  and 0040's that a rejection's reason encodes, failed none, and each has a test now.
- The compiler checks, in `src/program.test.ts`, that a state is an object (0031), that work under a key not declared
  does not compile where the state holds it alone and does beside a declared one, which 0037's check is for (0033),
  and that a runner, or its `unknown`, answering a message the program does not have does not compile (0034).
- Tested in `src/runtime.test.ts`, of SQLite at the pinned version: a `seq` is never given again after a prune
  (0038's `AUTOINCREMENT`), a statement waits for the transaction that holds the connection (0038's writes one at a
  time, read too in `makeSqliteAcquirers`, a semaphore of one), and a query uses the index of the expression it
  writes (0032).
- Each rule of the runtime of 0036, 0039, 0042, 0043 and 0045 fails a test of `src/runtime.test.ts`, or of
  `examples/booking` for 0045, once taken out, but one: 0039's prune that reads the cursors and drops the rows in one
  transaction, which `a consumer whose first reading lands in a prune skips nothing, however fibers yield` now tests.
- Then every bullet of these notes that the code keeps was taken out, one at a time, against the whole suite: of 67,
  25 failed no test, and 24 of them have one now.
- In the machine: a state its own schema refuses, what JSON holds (a plain object, an array, a value of no JSON
  type), an `unknown` that does not encode, and a deploy whose program dies on the stored state (0040, 0032).
- In the storage: a query by an index not declared (0032); the migrations of a timer's message, of the mailbox, and
  of the log's messages and projections, and the version written with the state, the keys, the mailbox, the log and
  the read model (0036).
- In the runtime: a sender that does not encode, named as such (0040), a creation it cannot finish, and a creator
  waiting on an entity that crashes (0042).
- In the types: `pending` takes a declared key (0033), and a query and an index name what the program declares, and
  an index is a scalar (0032).
- The one left: that an interruption is not the entity's crash (0042) changes nothing a test can see, since only the
  closing of a deployment's scope interrupts an entity's loop, and everything of it stops then.
- Read in effect-tea's source: its `Types` holds `state: object` (0031).
- Tested too, in `src/program.test.ts`: 0035's that the schemas applied first type the pieces, a wrong tag naming
  itself, where one call infers a state any object with a string tag is.
- [0100](archive/0100-a-reason-is-kept-as-long-as-a-reply-of-its-version.md): 0036 says a rejection's reason is kept
  for ever, which holds of a caller's reply alone, an entity's being deleted with its work
  ([0021](archive/0021-a-reply-is-kept-while-the-work-that-asked-holds.md)); its decision stands.
- Reasoned, and left so: 0042's that the next activation may succeed, a premise about the failures of the world,
  which no test reaches; that the runtime loads the entity again is tested.

## 2026-10-31: 0046 to 0060, the fourth lot of the backlog

- Fixed: the status lines of [0046](archive/0046-a-receiver-that-crashes-is-sent-again.md),
  [0047](archive/0047-a-request-of-an-operation-has-a-name.md),
  [0048](archive/0048-a-callers-request-belongs-to-its-sender.md),
  [0051](archive/0051-a-deploy-that-fails-leaves-nothing-running.md),
  [0054](archive/0054-a-program-is-checked-where-it-enters.md),
  [0056](archive/0056-nothing-waits-for-an-operation-under-the-permit.md) and
  [0059](archive/0059-a-request-is-a-value.md) did not say that
  [0063](archive/0063-the-runtime-waits-for-what-it-waits-for.md), [0059](archive/0059-a-request-is-a-value.md) and
  [0060](archive/0060-send-and-create-take-no-key.md), 0059, [0065](archive/0065-the-machine-holds-no-replies.md) and
  [0069](archive/0069-a-reply-is-keyed-by-the-version-that-wrote-it.md), 0063,
  [0064](archive/0064-the-program-is-not-the-machines-state.md),
  [0067](archive/0067-each-entity-is-held-by-its-own-lock.md), and 0065 and 0069 changed them.
- Tested: each rule of 0046 to 0051, 0053, 0054 and 0056 to 0060 that the machine or the runtime keeps fails a test
  of `src/machine.test.ts`, `src/runtime.test.ts`, `src/rehearse.test.ts` or `examples/booking` once taken out, but
  one: that the JSON of a work (0058) and of a request (0059) is compared with its fields in any order failed none,
  and has two tests now, an operation and a caller's sender whose schemas hold a record.
- Seen in a spike: a struct encodes its fields in its schema's order, and drops what it does not declare, a record in
  the order they were set, so only a record reaches that rule (`spikes/effect-schema-field-order.test.ts`, for 0058
  and 0059).
- Documented at 4.1.1: a schema drops what it does not declare unless told otherwise (`SchemaAST.ts`, for 0058);
  `Fiber.interrupt` completes once the fiber has (0056), and `forkIn` interrupts the fiber when its scope closes
  (0051).
- Tested too, at the pinned version: a refinement of the flags' schema runs when they are encoded (0049).
- Seen in a spike: SQLite reads a negative limit as none, which the storage gives a query left without one as `-1`,
  and fails on a fractional one (`spikes/sqlite-limit.test.ts`, for 0053).
- Tested, of 0052: the library mutates nothing the program gives or a caller offers. In `src/machine.test.ts` its
  random sequences run again on those values frozen through, and must do the same; in `examples/booking`, a story of
  two processes runs the booking and the inventory frozen through, runners' messages included, and comes to the end
  it should. `freezing` and `frozen`, in `src/testing.ts` and not exported from `index.ts`, leave Effect's values,
  such as a `DateTime` or a schema, unfrozen, since Effect may keep on them what it computes. A booking whose runner
  creates and sends with frozen values checks what an operation gives the runtime too.
- Tested now, which no test was before: a cursor past `2 ** 53` is refused (0053's safe integers); a step that
  changes the state projects it once, and encodes it and its projection once (0057); a rehearsal creates its entity
  under the entity itself, whatever senders the program takes (0048). Each fails once its rule is taken out.
- So does a test, once its rule is taken out, of: the runtime's callers of a creation kept apart from a message's
  (0050); a deploy's activations in the order of the ids (0051); `settled` not waiting for a crashed entity's
  operations (0056), which `src/runtime.test.ts` sees through a deploy that fails; a reply whose asker's work no
  longer holds deleted as it is stored (0057).
- That a deploy compares work by what the new schema writes of both (0058) holds by construction, a deploy stepping
  by the program deployed alone (0064), and `src/runtime.test.ts` keeps an operation whose schema version 2 changes
  under the key it started with.
- Reasoned, and left so: 0052's that a program and its tests mutate nothing, a contract the library checks by design
  no more than purity, and what it says a freeze would cost; 0055's line between what a program uses and what the
  runtime alone does; 0047's that a name is the operation's to keep stable, which no run can tell from a retry.

## 2026-10-31: 0061 to 0075, the fifth lot of the backlog

- [0101](archive/0101-a-moved-clock-gives-a-fiber-it-did-not-wake-one-turn.md): `TestClock.adjust` gives a fiber it
  did not wake one turn of the budget of steps, where [0066](archive/0066-the-runtimes-tests-move-time.md) said it
  let every fiber already started reach its sleep; that holds under the default budget alone, and the tests run under
  smaller ones assert what holds at their end, not when. A timer made to yield twice before its sleep failed no test,
  since it reaches its sleep while `settled` waits, and fires on its time; `a timer fires at its time, and not
  before` now fails, with seventeen other tests, once it yields five times.
- Fixed: the status lines of [0062](archive/0062-a-row-is-read-through-a-schema.md),
  [0064](archive/0064-the-program-is-not-the-machines-state.md) and
  [0071](archive/0071-a-process-starts-the-entities-with-a-message.md) did not say that
  [0077](archive/0077-the-waker-tries-an-entity-it-cannot-load-again.md),
  [0075](archive/0075-a-name-is-deployed-once-in-a-process.md) and
  [0074](archive/0074-a-message-that-finds-the-mailbox-empty-is-handled-as-it-arrives.md) changed them.
- Seen in spikes, at the pinned versions: what `adjust` wakes and what it gives the others
  (`spikes/effect-testclock-adjust.test.ts`, for 0066 and 0101); a fiber forked by `forkIn` may run its finalizer
  before its forker goes on, as the budget falls, and never under the default of 2048, which `Scheduler.ts` documents
  (`spikes/effect-fork-yields.test.ts`, for 0068); an `INSERT OR REPLACE … SELECT … RETURNING` writes only where its
  `WHERE` holds, and gives a row for each it wrote (`spikes/sqlite-insert-select-returning.test.ts`, for 0070); a
  column gives back what was written into it whatever its declared type, and a `UNION` gives each id once
  (`spikes/sqlite-column-values.test.ts`, for 0062 and 0071).
- Documented: `Context.Reference` and its default, which the probe of 0073 is.
- Tested of SQLite: a reply is read by the key of its table, and a caller's again by the index of its request id
  (0065).
- Then every rule of these notes that the code keeps was taken out, one at a time, against the whole suite: of 76, 37
  failed no test, and 30 of them have one now.
- In the machine: what `init` throws, a record of work or a timer's time a cast lets through (0061).
- In the storage: each row its table's schema refuses that no test broke, the columns that go together, a version
  from 1 and a count from 0, wherever they are read, the waker's and the log's readings included (0062); `reindex`
  skips a state of the same text written at another version, and counts what it wrote, through a trigger that steps
  an entity in the middle of its walk (0070); a suspended entity holding an operation is not started (0071).
- In the runtime: a message waiting behind another is given its time and its reply as its step begins (0065, 0074);
  two callers of an entity not loaded, and two creations of one, build one machine under every budget (0067); a probe
  and its points are no part of what `index.ts` exports (0073).
- In `examples/booking`: a hold answered `Suspended` before its inventory is resumed is woken by the resumption, and
  one the inventory crashed on sends again only after the `retry` (0063).
- The seven left: the two yields of a timer, which change nothing; the runtime's own check of an operation with no
  runner (0061), which the machine never lets through; three signals of `settled` that another always follows — an
  event counted until its step rather than its take, an operation's end after the step of its message, an entity's
  departure before the waker's reading (0063); a sender that registers for the resumption only after it is answered
  `Suspended` (0063), and a lock dropped while others still wait for it (0067), whose interleavings no budget
  reaches, and no point of the probe either: reaching them takes a point the runtime would have for its tests alone,
  which 0066 rejected.
- A departure split across a yield, which [0068](archive/0068-what-another-fiber-reads-changes-in-one-step.md) says
  no test catches, fails `the process settles and a stored timer wakes its entity, however often the fibers yield`.
- Taken out with one lock for the whole process, only the test that reaches another entity during an activation
  failed, as 0067 argues: nothing under an entity's lock waits for another's.
- Reasoned, and left so: 0063's that nothing signals a crash will not happen again, and 0075's costs of a deploy that
  takes over in place.

## 2026-11-01: 0076 to 0079, the last lot of the backlog, which is done

- [0102](archive/0102-a-deploy-interrupted-before-it-registers-undoes-itself.md): a deploy interrupted between the
  claim of its name and the handler that gives it back kept the name with no deployment, and one interrupted after
  its activations and before its registration gave the name back and left its scope open, so that a second deploy ran
  the entities' interrupted operations twice in one process; both are fixed, the claim, the scope and what undoes
  them being made in one step, and `a deploy interrupted anywhere keeps its name and its waker, or stops what it
  started` fails at six points without the fix.
- [0103](archive/0103-a-test-moves-the-wall-clock-ahead-of-the-sleeps.md): a test runs the wall clock ahead of the
  sleeps, which reaches the readings of a timer due that
  [0078](archive/0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md) said no test reaches,
  and `settled` before the waker has run a timer or a retry whose time has come
  ([0077](archive/0077-the-waker-tries-an-entity-it-cannot-load-again.md)).
- Seen in spikes, at `effect` 4.1.1: an interruption inside an `uninterruptible` region lets it end, a fiber forked
  inside one is interruptible, and a joiner interrupted leaves the fiber it joined running
  (`spikes/effect-uninterruptible-fork.test.ts`, for 0078, 0079 and 0102); a clock provided over the test clock moves
  what `DateTime.now` reads and leaves the sleeps to the test clock (`spikes/effect-clock-ahead.test.ts`, for 0103).
- Documented: `uninterruptibleMask` (0102); a `Map` iterates in the order its keys were set, a key set again after a
  delete last, which the order of use is (0076).
- Then every rule of these notes that the code keeps was taken out, one at a time, with `scripts/mutate.ts`: of 36,
  21 failed no test, and 19 of them have one now.
- Of 0076: a capacity of no whole number of entities; the capacity counted over every program; as many told to leave
  as the process holds too many, one told and not gone yet counting, which entities entering at once under every
  budget reach; the entity entering never told; one told that has something to do by the time its loop takes that
  stays, is answered and is told again, a loop that unloaded it losing the message and one that kept it told never
  settling; and the `settled` that waits for an entity told, which 0076 said no test reaches and the test of entities
  entering at once does.
- Of 0077: the retry at its time exactly, and `settled` while a timer or a retry has come by the clock.
- Of 0078: the two readings of a timer due, a timer due at the time of the reading, a suspended entity spare whatever
  its timers, and the name and the waker of a deploy interrupted after it registers.
- Of 0079: the caller's event offered in the hold that activates its entity, two callers of two entities over a
  capacity of one being both answered under every budget, and the count of what runs detached taken in the step that
  forks it, a caller interrupted at every point leaving the process able to settle.
- That a held entity is found in its caller's fiber, a rule of cost, fails the test of an entity told to leave that
  is sent a message: a fork lets its loop take the telling first, and it is unloaded and loaded again.
- The fix of 0102 adds three rules, and each fails a test.
- A second set took out eight rules the first had left, of which five failed no test, and three have one now: with no
  capacity only time unloads (0076); an entity that crashed holds no place under the capacity, whatever its
  operations deliver after it left (0076); a deploy interrupted as it activates an entity stops the activation, which
  runs in the deployment's scope (0079).
- The four left change nothing a test can see: the waker's activation and an activation taken for the entity's crash
  when interrupted (0077, 0079), since only the closing of the deployment's scope interrupts them, and everything of
  it stops then; a waker that stops its round at the first entity it cannot load (0077), since the next round begins
  at once and activates the rest at the same time; and the signal to `settled` of an entity told to leave that stays
  (0076), which another always follows, since it stays only for an event or an operation whose end signals.
- Tested since 0103 was taken: its premise that the library reads the time and sleeps through Effect alone, which it
  gives as reasoned, by `the library reads the time and sleeps through Effect alone, which a test moves`, in
  `src/runtime.test.ts`, which a reading of `Date.now` planted in the waker, changing nothing it does, and a
  `setTimeout` planted in the storage each fail.
- Seen, by writing the alternatives the notes rejected and running the tests their reasons name: an entering entity
  that unloads the others under their locks holds for ever, an entity entering while another that holds its own lock
  waits on it (0076); a waker that tries again at once never lets a process settle around an entity it can never
  activate, which `an entity the waker can never activate leaves the process settled between its retries` now tests
  (0077); an uninterruptible activation holds the crash table's test at `AfterReply` for ever, and an interrupted
  activation torn down leaves a creation's work unstarted (0079).
- Finding the entity again in the caller is `79-found-in-another-hold`, killed above, and leaving a failed entity out
  for the life of the process is `77-failed-for-ever`.
- Reasoned, and left so, since each would be a mechanism to invent rather than a rule to take out, or its reason is
  no behaviour: 0076's telling raced with the take, its refusal to load past the capacity and its bound per program;
  0077's suspension of an entity the waker cannot load; 0078's exclusion of the entity just woken, and its name given
  back by the deployment's scope, which it says holds the name exactly as long.

## 2026-11-04: 0098 to 0104, 0109 to 0117, and 0119

- [0120](archive/0120-the-runtime-closes-a-sequential-scope-of-its-own.md): the order of the finalizers that
  [0119](archive/0119-a-planned-stop-drains-the-at-most-once-operations.md)'s drain and
  [0080](archive/0080-a-database-is-held-by-one-runtime.md)'s hold rest on holds only in a sequential scope, and a
  caller may launch the runtime in a parallel one. The runtime forks a sequential scope of its own, and
  `a drain holds in a scope that closes its finalizers in parallel` does not end without it. Found too: at 4.1.2,
  `Scope.close` documents that a finalizer runs uninterruptibly, which 0119 said it did not.
- Fixed: the status lines of [0101](archive/0101-a-moved-clock-gives-a-fiber-it-did-not-wake-one-turn.md) and
  [0117](archive/0117-a-fiber-on-another-s-stack-yields-with-no-task-ready.md) did not say that
  [0104](archive/0104-the-runtimes-tests-choose-where-fibers-yield.md) moved every test off budgets, nor that the open
  question 0117 left its count of seeds in was answered by a rule of work.
- Documented at 4.1.2, as the notes say: `Schema.Json` (0098); `acquireUseRelease`, `ensuring` and `Fiber.await`
  (0109, 0110); the option `uninterruptible` of a fork, read in `forkUnsafe` (0112); `MaxOpsBeforeYield` as a
  `Context.Reference` and the count of steps in `runLoop` (0115, 0117); `forkChild` (0116); `timeoutOption` (0119).
- Then every rule of these notes that the code keeps was taken out, one at a time, with `scripts/mutate.ts` under
  `SCHEDULES=all`: of 76, 19 survived, and none was uncertain.
- Tested now, which no test was: a suspended entity offers no firing, since the runtime stops its timers (0113,
  where it was said tested); an operator whose resume the runtime cannot finish is given the defect, as a caller is
  (0114); a fiber on another's stack yields at a change of priority with no task ready, under prioritized schedules
  (0117); a step the drain handles starts no operation that runs again and arms no timer (0119, which said the first
  tested and the second reasoned: the test it named ends its drain before that step); a drain of 0 millis is no
  defect (0119).
- Tested too, of 0119's reasoned premises: a message an at-most-once operation sends to another entity in the drain
  is delivered. The test fails once the guard of a caller's request is put around that send.
- The two rules of [0068](archive/0068-what-another-fiber-reads-changes-in-one-step.md) that 0104 and 0109 left to
  this review each fail a test now: `leave` setting the waker's flag with its poke, and the waker clearing its flag in
  the step it finds no poke.
- One mutation told nothing: 0109's count given back and taken again in one step, which nothing can look between.
  Written with a yield between, it fails `a process over its capacity unloads its least recently used idle entity`.
- Ten change nothing a test can see: 0109's count taken right after `leave`, which sets the waker busy in its own
  step; the crash's fork made uninterruptible or inheriting (0112), since it only interrupts and ends at once; a kept
  operation of any incarnation (0113), since `reconcile` refuses a change to a running one; the wait's sleep not
  interrupted, or forked in the deployment's scope (0116), whose stray end is passed over, as 0116 says; an
  operation left among those that run again after its end, which a stop then finds ended; the drain not reading
  `applying`, since an operation's end is offered and counted before it ends; the drain's wait not made
  `interruptible` (0119), the guard 0119 keeps against a release; and PCT yielding at every step with no task ready
  (0117), which reaches the same orders with more schedules.
- Two are left, as rules no test reaches. A deploy interrupted after it registers, undone whole (0102): this test
  sees it as a second deploy that runs the entities once, and only a sender that found the first deployment in the
  step between could tell. A `leave` that pokes the waker a step after it sets the flag (0068): the waker would have
  to be reading as the entity leaves and reach its rest in that gap, two deviations, past the bound of the test that
  reaches a reading left during.
- Reasoned, and left so: 0099's that a library promises no more stability than what it is built on; 0110's that the
  fiber which gives the count back runs, in the process's scope; 0114's that no operator stands in the line without
  an event, an uninterruptible step no point of the scheduler falls in; 0117's that a run beginning after another's
  in one task is on that fiber's stack.

## 2026-11-04: 0120 to 0132, 0134 and 0136; 0133 and 0135, proposed for their step, are left to it

- Fixed: the status lines of [0054](archive/0054-a-program-is-checked-where-it-enters.md),
  [0116](archive/0116-an-entitys-wait-ends-with-an-item-of-its-queue.md) and
  [0117](archive/0117-a-fiber-on-another-s-stack-yields-with-no-task-ready.md) did not say that
  [0136](archive/0136-a-key-is-a-name-and-a-parameter-as-data.md) took out the check of a name that starts with `[`, which
  [0132](archive/0132-a-key-may-take-a-parameter.md) had put there, nor that
  [0134](archive/0134-an-entitys-loop-yields-between-two-steps.md) moved the seeds the two notes name. The index lists
  those changes too.
- Documented at 4.1.2, as the notes say: `Scope.fork`'s strategy that defaults to sequential, and `Scope.close`'s
  finalizers run uninterruptibly (0120); `Base64Url.encode`, unpadded and `@stability stable` (0123); `Fiber.interrupt`
  completing once the fiber has (0128); `Effect.retry` giving the last failure once its policy ends (0130);
  `MaxOpsBeforeYield` of 2048 (0134). `Equal.equals` compares plain objects by their keys recursively (0126), and a
  run at the pinned version finds two objects equal whatever the order of their keys.
- Then every rule of these notes that the code keeps was taken out, one at a time, with `scripts/mutate.ts` under
  `SCHEDULES=all`: of 62, 10 survived, and none was uncertain. One, that a crash runs a droppable operation again
  (0128), was killed by a type error of its own, which tells nothing. Written again so that it compiles, it
  survived too.
- Tested now, which no test was: `read` gives the row through the projection's migrations (0121); a case is compared
  by its content, whatever the order of its keys, and a case from version 0 is `Unknown` (0126); a world fails a run
  of a droppable operation that sends (0128), as the runtime does; an entry of three items under a key with a
  parameter is no pair (0132); a crash runs a droppable operation again, in the same incarnation (0128). Each of
  the six mutations those tests are for now fails a test.
- Three change nothing a test can see: a cause of `reindex` that is not the program's, since `shownOf` throws only
  the program's defect (0122); and the parameter in the deletion of the replies of work that ended and in the check
  of an asker (0136), since an entity draws each incarnation once, so the key's name and the incarnation already name
  one run (0132).
- Two are left, as rules no test reaches. A world that deletes a reply once the work that asked ends (0131), which
  0131 says no run can ask for. And the loop's yield after a step that leaves a message in its mailbox and nothing in
  its queue (0134): a mailbox holds more than one message the entity can handle only after an activation or a
  resumption, and no test sets another entity waiting there.
- Reasoned, and left so: 0123's that 43 characters fit the services a program calls, and that two keys never share
  a digest; 0124's that every deployment has a boundary that authenticates; 0125's that a boundary knows how long its
  protocol retries for, and that its clock agrees with the runtime's; 0126's that a migration is pure, and that its
  cases stand for every row; 0127's that a source gives each item an id that stays, and that the boundary
  acknowledges after `send`; 0128's that a runner declared droppable acts on nothing; 0129's that a runner reaches
  `Entities` only through its services; 0130's that an operation returned the same on its completion is a mistake;
  0136's that the order of a parameter's fields survives storage.
- Read again, and left so: 0128 says that an operation a new program delivers otherwise keeps its idempotency key.
  It keeps its incarnation, and a runner given the digest is given another form of the same key. No harm follows,
  since the incarnation stopped has acted on nothing.

## 2026-11-06: 0133, 0135, and 0137 to 0149

- Fixed: the status line of [0135](archive/0135-a-large-state-is-split-by-the-program-and-the-runtime-warns-of-it.md) did
  not say that [0138](archive/0138-the-log-publishes-topics.md) changed its warning, which counts the projection once per
  topic a step is written in. The index lists that change too.
- Documented at 4.1.2, as the notes say: `Optional.replace` gives the whole unchanged where it does not focus
  (0133); `Effect.logWarning` reaching the logger provided (0135); `Hash.string`, `@stability stable`, with the
  values of three texts, and `entityMailboxCapacity` of 4096 (0137, 0147); `Semaphore.takeIfAvailable` taking
  only permits available at once (0147); `SqliteClient.make`, whose explicit transaction takes the write lock
  though it only reads (0145).
- Seen since: [`examples/order/report.ts`](../../examples/order/report.ts) feeds a store of reports from the log,
  which 0149 took as only reasoned.
- Then every rule of these notes that the code keeps was taken out, one at a time, with `scripts/mutate.ts` under
  `SCHEDULES=all`: of 74, 17 survived, and none was uncertain.
- Tested now, which no test was: a launch with a number of partitions that is not an integer fails (0137); a step
  counts the projection once per topic it is written in (0138); a page gives at most its limit across its
  statements (0145), and a row found carries null for an index it lacks (0143); `reindex` writes an integer beyond
  2^53 with its exact digits (0146); a step past the default threshold warns with no option given (0135); a child's
  events are handled in the order it raised them, a child left as it was leaves its parent's state as it was, a
  child that rejects an external message is a defect, the projection of a child that is not there is a defect, and
  an operation of a parent named with a `.` is refused (0133). Each of the eleven mutations those tests are for now
  fails a test.
- Three change nothing a test can see. A cursor's boolean bound as `true` and not as 1 (0143), since bun:sqlite
  1.4.2 binds a boolean as the integer 1: the conversion guards a driver that would not. A topic's signal kept after
  the commit that completed it (0142), since a later reading then reads again at once until its time, which costs
  statements and loses no row. The first of two entries with one id (0133), which a record by id cannot hold.
- Three are left, as rules no test reaches. The uninterruptible region of the permit and the offer (0147), which
  its comment in `src/runtime.ts` says no test reaches. A step that writes exactly the threshold (0135), which a
  test would have to size to the character. Ids compared by their encoding and not by `JSON.stringify` of their
  value (0133), which tells two apart only for an id whose value and encoding differ, and every test declares
  string ids.
- Reasoned, and left so: 0133's that the Guide's rules on splitting a program hold of a state stored in one row,
  and that a state is a value nothing changes in place; 0135's that 262 144 characters is a threshold an operator
  wants told; 0137's that a consumer acts on the order of one entity's rows, and that `position` rises with `seq`
  on a store of two writers; 0138's and 0140's that a consumer acts on a part of the projection; 0139's that a
  caller in the process is served by JSON; 0145's that a statement read as a range with a limit stops after the
  rows it gives; 0147's that a caller's message is never in the stored mailbox while its caller waits; 0148's that
  no caller sums an index of strings on purpose; 0149's that every question beyond the three forms is a report's.

## 2026-11-07: 0150 to 0174

- Fixed: the status lines of
  [0161](archive/0161-on-cluster-a-step-settles-the-machine-by-the-count-of-the-steps-that-wrote-it.md),
  [0165](archive/0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md) and
  [0166](archive/0166-on-cluster-an-operator-resumes-and-discards-through-the-doors-client.md) did not say that 0165, 0166 and
  0167 made code of the requests each said still die on Cluster. The index lists those changes too.
- Fixed in [`docs/design.md`](../design.md): it said that every step on Cluster reads the newest version, which only
  a door's step does, and that a rename moves Cluster's rows, which nothing does. Both are open questions now, and
  steps of the roadmap.
- Documented at 4.1.2, as the notes say: `maxResidentEntities` of 10 000 (0151); `entityRegistrationTimeout`, which
  fails the message (0168); `defectRetryPolicy`, whose restarts never stop (0159); `Effect.acquireUseRelease`,
  `@stability stable` (0163).
- Then every rule of these notes that the code keeps was taken out, one at a time, with `scripts/mutate.ts` under
  `SCHEDULES=all`: of 111, 23 survived, and none was uncertain.
- Tested now, which no test was: a database made before is given `steps` at 0 (0161); every text column the storage
  makes on PostgreSQL is collated `C` (0157), which 0157 took as tested by the order of ids, though PGlite's
  database is `C` itself and orders them so without it; two long names of indexes that share their first bytes
  name two indexes (0157); an operator's `Discard` at an older version dies as a message does (0159). Each of the
  four mutations those tests are for now fails a test.
- Five change nothing a test can see. Either deletion of the pending ids alone (0169), since every step deletes
  every pending id, and a test fails without both. A door's step that writes nothing left uncommitted (0161), whose
  machine then waits for the next step. A reset tried on an interruption (0168), which finds no failure saved and
  gives the interruption. A `data_version` kept as `NaN` (0163), which SQLite always gives as a number.
- Fourteen are left, as rules no test reaches. The transaction of a prune (0154) and of the renames of one launch
  (0156), which hold only where a statement fails halfway. The tag of an operation's text in a rename on PostgreSQL
  (0157). The check of Cluster's hash against `Hash.string` (0162), which holds only where Effect changes it. The
  checks of the shard held and lost, at an entry, a load and a step of the loop, and the retry of a round of
  activation (0162), which 0162 takes as only reasoned. A count of `steps` another runner wrote (0161), which only a
  runner whose finalizer did not run reaches. A reset of a reply that is no longer `Suspended` or `NotFound` (0165).
  The keep and the wait of an operation's client whose work ended (0170).
- Open: a step of the loop or of an activation on Cluster reads no version, and no step reads the shard's lease; a
  rename on Cluster leaves Cluster's rows under the old name. Each is an open question under
  [Running](../open-questions.md#running), and a step of the [roadmap](../roadmap.md).
- Reasoned, and left so: 0151's that 10 000 is a capacity an operator wants by default; 0152's that a topic no
  consumer holds has no reader that needs its rows; 0158's that a consumer reads a page in the transaction it acks
  in; 0161's that no fiber holds an entity's lock while it waits for the connection; 0163's that `data_version`
  costs little beside the steps; 0165's that a caller who waits for a busy entity is served better than one answered
  `Full`; 0166's that an operator's events are rare enough for their rows to be kept; 0167's that one `Resumed` per
  sender's entity wakes every request of it that waits; 0171's that the client's clock is no earlier than the
  step's; 0173's that the time between Cluster's read and its save is short; 0174's that a program deployed without
  its record escapes both checks of 0159.

## 2026-11-07: 0175 to 0177

- Documented at 4.1.2, as the notes say: `RunnerAddress`'s primary key is `host:port` and `ShardId` formats as
  `group:id` (0175); `Effect.tx` is optimistic with retry (0177). `Semaphore.take` serves its waiters in the order
  they came where each takes one permit, as an entity's lock does, and a smaller later request may overtake a larger
  one otherwise (0177).
- Read in the source at 4.1.2, as the notes say: `SqlRunnerStorage` rounds `shardLockExpiration` up to whole
  seconds, and takes a lease on SQLite past that age by `strftime('%s', …)` (0175); `getShardId` hashes the entity
  id alone (0176); `cluster/Sharding.ts` imports no `Tx` module (0177).
- Then every rule of these notes that the code keeps was taken out, one at a time, with `scripts/mutate.ts` under
  `SCHEDULES=all`: of 38, 3 survived and 8 were uncertain. 0177 keeps the code as it was, and has no mutation.
- Tested now, which no test was: the guard rounds a lease's expiration up as Cluster does (0175), which the test of
  the lease's boundary checked only for an expiration of whole seconds, passed to `leased` and not drawn from
  `ShardingConfig`; `leased` now takes the expiration as Cluster's config gives it, and the test runs at 34.5 s. A
  database made before is given `renamed_to` (0176). A launch that renames two names to one is not refused (0176),
  which only the storage's tests ran. Each of the five mutations those tests are for now fails a test.
- Fixed: `scripts/mutate.ts` named a kill by the test that failed in the first run, under the load of the workers,
  where that test may only have run out of time. It names the test that failed in the run alone now.
- Two change nothing a test can see. A launch of one process that marks its renames (0176), since nothing of one
  process reads `versions`. The `BEGIN IMMEDIATE` of a rename on SQLite (0176), which the client begins with by
  default.
- Six are left, as rules no test reaches. A process with no runner address that passes the guard (0175), since it
  registers no door and holds no shard, so that no step of it reaches the guard. The `FOR SHARE` of `leased` and of
  `standingOf`, and the lock of `versions` by a rename (0175, 0176), which hold only between two sessions of
  PostgreSQL, and PGlite runs one; the [open question](../open-questions.md#running) of many connections asks for
  that server. A `Resumed` saved under the old name and delivered after the rename (0176), which a test would reach
  with an operation waiting on a suspended entity across a rename on two runners.
- Not exact, and left: 0175 says every step runs the check first in its transaction. A step of the loop deletes
  Cluster's rows under the pending ids, and drops an event of an entity gone, before it, and the step's rollback
  undoes both where the check dies.
- Reasoned, and left so: 0177's that I/O in a `Tx` transaction would run again at each retry, which the JSDoc does
  not say.
