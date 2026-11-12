# Reviews of the notes

Each review of the notes, as [`AGENTS.md`](../../AGENTS.md) has them made: the notes it read, and what it found, one
section per review in the order they were made.

A review takes out the rules its notes decide, one at a time, with [`scripts/mutate.ts`](../../scripts/mutate.ts),
which runs the tests and the compiler against each mutation it is given, and checks nothing else. The mutations are
written for the code the review reads, and are not kept.

A premise review, as [`.claude/skills/premise-review/SKILL.md`](../../.claude/skills/premise-review/SKILL.md) has it
made, is a section here too, headed `premise review of` its area. It is the reviewer's report, whole, with what it
ruled out. It is not the review of fifteen notes that `AGENTS.md` asks for. The report of the first premise review,
of 2026-11-11 on Cluster and the runtime's callers, was not kept; the roadmap's step of the review says what it
read.

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

## 2026-11-08: 0178 to 0193

- Documented at 4.1.2, as the notes say: `String.isEmpty` is true of `''` alone (0179); `SqlClient.BeginTransaction`
  sets the statement a top-level transaction begins with (0185, 0191); `isTransientResponse` retries a `503` and
  not a `409` (0178, 0190); `Layer.mock` gives a service whose members left out die (0189).
- Read in the source at 4.1.2, as the notes say: `SqlRunnerStorage`'s `getRunners` reads only the runners whose
  heartbeat is younger than the lease's expiration, and `RunnerServer.layer` builds no `Sharding.layer`, which
  `HttpRunner.layerHttp` does (0178). The message of a member a mock leaves out names the service and the member
  (0189).
- Fixed: the status line of
  [0114](archive/0114-an-operator-sees-the-suspended-entities-and-what-a-resume-did.md) did not say that 0185 adds
  `inspect` to it. The modules diagram of the [README](../../README.md) showed neither `testing.ts` nor the four
  entries 0193 added.
- Then every rule of these notes that the code keeps was taken out, one at a time, with `scripts/mutate.ts` under
  `SCHEDULES=all`: of 73, 17 survived and none was uncertain.
- Tested now, which no test was. An `advance` of an infinite duration fails (0187). An inspection gives the work in
  the order it started, where the database gives the rows by the names of their keys, and gives the senders that
  wait for a suspended entity, as `suspended` does (0185). The ack of a page that fails rolls back the handler's
  writes (0184). The server's client tries a charge the world answers `503` again, and sends an email once, whose
  failure suspends its order, which is then answered `409` (0178, 0190). The entry of a program gives `Returned`,
  and not `isTimer` (0193). Each of the nine mutations those tests are for now fails a test.
- Three change nothing a test can see. The `const` of the type parameter of a program's name (0183), since a
  parameter constrained to `string` keeps the literal of `name` without it. The `BEGIN IMMEDIATE` of `createTables`
  on SQLite (0191), which the client begins with by default. The reset of a creation's saved answer only where it is
  `Rejected` (0182): a creation answered `Created` and reset is delivered again, and the runtime answers it from the
  reply it stored with the state, as the first time.
- Five are left, as rules no test reaches. The `503` of `Full` and its `Retry-After` in the server's map (0190),
  since a caller on Cluster is never answered `Full`. The `REPEATABLE READ` of an inspection on PostgreSQL (0185),
  and the advisory lock of `createTables` and its key apart from the hold's (0191), which hold only between two
  sessions of PostgreSQL, and PGlite runs one; the [open question](../open-questions.md#running) of many
  connections asks for that server.

## 2026-11-10: 0194 to 0224

- Tested since, where the note says only reasoned. That an advisory lock is the database's and not a schema's, and
  that a pool gives every connection the role's `search_path` (0215), and that two runs of `createTables` at once on
  PostgreSQL wait for each other (0216), are tested on a server by the tests of
  [0222](0222-postgresql-with-many-connections.md) in `src/postgres.test.ts`. That no module of `src/` calls
  `setTimeout` (0194) still holds, read again.
- A premise no note wrote: on PostgreSQL the migrations run in `Migrator`'s transaction, at the level the role sets,
  where 0222 says every transaction states its level. It holds at every level, since `Migrator` locks its table
  before it reads the history. The note is
  [0225](0225-the-migrations-run-at-the-roles-level-and-lock-before-they-read.md), and the design says it.
- An open question: the spans and the metrics are named with `tea.` (0220), for the reason that every object of the
  runtime was named with `tea_` (0198), which 0218 changed to `effecttea_` the same day, since `tea` is a common
  word. [The prefix of the spans and the metrics](../open-questions.md#the-surface) asks whether they follow.
- Fixed: the index did not list 0207 among the notes that change
  [0143](archive/0143-a-query-pages-after-the-last-row-it-gave.md). `scripts/mutate.ts` copied neither the README
  nor `docs/`, which the tests of 0196 and 0203 read, so the suite failed on the code unchanged. It also killed a
  run after ten minutes, where the suite under `SCHEDULES=all` runs sixteen, so the bound is an hour.
- Then every rule of these notes that the code keeps was taken out, one at a time, with `scripts/mutate.ts`: of 50,
  9 survived the seeds `bun test` runs, and those 9 ran again under `SCHEDULES=all`. The seeds of the first run are
  among those of the second, so a mutation killed in the first is killed under every seed, and the result is the one
  a single run under `SCHEDULES=all` gives. Six survived it, and none was uncertain.
- Tested now, which no test was. A launch dies on a table of the application under the name of any table or index
  the runtime makes, not only `effecttea_consumers` (0218). A rehearsal gives a request named later no reply of a send
  drawn before it under the same id (0200). A step that writes nothing records no length of the mailbox (0220). Each
  of the three mutations those tests are for now fails a test.
- Three change nothing a test can see. The `BEGIN IMMEDIATE` that `createTables` asks of SQLite (0216), which the
  driver begins with by default, as the review of 0191 found. A counter of suspensions updated by 0 for a step that
  suspends nothing (0220). The drain's `emptied` made interruptible inside `timeoutOption` (0219), since the race
  forks its sides interruptible whatever the finalizer is: the wait made interruptible whole fails the test of 0219.
- Three are left to the CI's job `postgres`, as rules only a server of PostgreSQL reaches. The `READ COMMITTED` of a
  step, the `REPEATABLE READ` of a reading of one snapshot, and the reading of a `BIGINT` given as a bigint (0222).
  PGlite runs one session and gives a `BIGINT` as a number, and `src/postgres.test.ts` is skipped without
  `POSTGRES_URL`.

## 2026-11-11: premise review of The machine and the program

The reviewer's report, whole, as its session wrote it. Its branch, `claude/premise-review-machine-c1a99e`, holds no
commit, since it reproduced nothing.

No finding was reproduced, so no test and no commit. Two findings are only reasoned; both are design questions.

### Pairs read
Both notes read whole, with the code:
- 0013 against 0065. Code: src/runtime/loop.ts:376-395 (the reply is read just before the step, in the entity's
  loop) and src/machine.ts.
- 0014 against 0023, 0041, 0044, 0124 and 0187. Code: machine.ts handle (960-1035), resume and discard (1037-1060),
  activate and reconcile (730-800), rehearse.ts advance (360-430).
- 0003 against 0195. 0035 against 0180. 0180 against 0197 and 0202. 0197 against 0199.
- 0033 and 0037 against 0132. 0132 against 0136 and 0197. Code: machine.ts renew (660-690), keyText and keyBy
  (95-110), storage/rows.ts keyRow (88-110), storage/entities.ts (345-395).
- 0133 against 0155. Code: program.ts checkNames (1275-1282), assemble and routing (1440-1475).
- 0064 against 0075, and 0057 and 0031 against the notes that apply them (0133, 0202).
Skipped, as briefed: 0064 against 0247.

### Findings, only reasoned
1. **0180 against 0124 and 0048.** 0180 makes `sender` left out default to `Schema.Null`. 0124 and 0048 keep a
   caller's request ids under its sender, and 0124 rests on "a sender as fine as an identity keeps request ids
   apart". When every sender is `null`, all callers of the program share one space of request ids. The boundary
   cannot separate them, because the type admits no sender. Two callers that reuse an id, or one that guesses
   another's id, get the first caller's stored reply, and the second message is never applied. The design
   (docs/design.md:252) says a null sender takes no sender, and says nothing of the shared space. This is a design
   question: should the docs require ids unique across all callers, such as a UUID, or should the boundary give a
   sender?
2. **0133's rule against an own message named like a child, which 0199 does not cover.** The rule is kept only by
   the types (program.ts:1133, `Extract<TagOf<Own>, Names<C>>`). 0199 found that a widened type empties such a
   check, and closed that gap for keys only. An own message schema whose `_tag` is `string` makes the Extract
   `never`, so the declaration compiles. At run time, routing (program.ts:1453) then sends an own message tagged
   with a child's name to that child. Low severity, because a `_tag` typed `string` is rare. Not tested.

### Suspects ruled out
- 0065 against 0013: the reply is read in the entity's loop just before the step. A sweep that deletes it in
  between still leaves the reply given, and only the entity's own steps write its replies.
- 0065's "rehearse sends each request once" no longer holds. Decision 0200 covers it: a rehearsal keeps the
  replies of named requests for the whole rehearsal.
- 0132: replies to an asker are matched on its key and its incarnation (storage/entities.ts:368-385), so a key
  that comes back keeps no stale reply.
- 0041 and 0044 with reconcile: when a fix changes a timer, the queued firing is dropped and a new timer fires at
  once. A non-droppable operation cannot change at activation.
- A step cannot drop an operation whose completion is still queued: handle checks against all stored work
  (machine.ts:990-1005).
- 0057's cached projection is keyed by program (machine.ts:248-262), so a deploy does not compare across programs.
- 0187: the guard against a timer that fires twice at one time is checked for timers armed in the past and for
  `advance(0)`. Time never goes back (firesAt = max(now, at)).
- 0136: the order of a parameter's fields is the same everywhere, since keyText and keyRow both use
  JSON.stringify of one ordered object.
- 0064 and 0075 on Cluster with two versions: decision 0159 covers it, and so do the open questions on rolling
  deploys.
- 0133's names with a `.`: a leaf part's key with a `.` cannot collide, because child names are unique and have
  no `.`.

### Not reached
- The rehearsal's request key after a `deploy` that changes the sender's encoding. In the runtime a request is
  found by its request id and migrated (0065). The rehearsal keys a reply by the request's text, so a retry after
  such a deploy may not find its reply.

## 2026-11-11: premise review of Operations and timers

The reviewer's report, whole, as its session wrote it.

Branch `claude/premise-review-operations-d2dda3`, commit `d612640`. One finding reproduced.

### Finding 1, reproduced: 0128 against 0011
- Test: `FAILING: a droppable operation a new program delivers at most once starts, since it acted on nothing`,
  in `src/machine.test.ts` (describe `a new program`). Run: `bun test src/machine.test.ts -t FAILING`.
- 0128 lets a new program deliver a droppable operation otherwise, and keeps its incarnation, "since the
  incarnation stopped has acted on nothing". 0011's activation rule records `unknown` for an at-most-once
  operation whose stored incarnation it finds with no completion, since it "may have started". The rule rests on an
  unwritten premise: the stored incarnation was delivered at most once. 0128 takes it away.
- Sequence: entity holds a `Droppable` operation under `charge`, incarnation 1. A deploy declares it
  `operation.atMostOnce`. `reconcile` (src/machine.ts:737-752) skips the droppable key, so no defect. `renew`
  (src/machine.ts:666-689) keeps incarnation 1, delivery now `AtMostOnce`. `activate` (src/machine.ts:784, 791-795)
  sees `started && mayHaveRun && AtMostOnce`, and records `unknown` ('?') instead of starting the operation.
- Effect: the program is told the at-most-once act may have happened when the runtime knows it never ran. A program
  that answers `unknown` by not acting again (an email marked unsure) never acts. No data is written wrong, but the
  operation is lost. `rehearse`'s restart uses the same machine, so a rehearsal shows the same.
- Where a fix begins: `activate` reads the delivery stored before `reconcile` (machine.stored.keys[text].delivery)
  and delivers `unknown` only when that was `AtMostOnce`; or 0128's rule gives a new incarnation in this case.

### Pairs read
Both notes whole, with the code (machine.ts reconcile/activate/handle/renew, runtime/loop.ts start/perform/arm):
0005-0128, 0008-0041, 0008-0130, 0011-0018, 0011-0119, 0011-0123, 0011-0128, 0018-0058 (0058 not reread whole;
code isSame), 0041-0044, 0045-0063, 0046-0063, 0046-0147, 0056-0067 (0067 by its status in 0056 only), 0123-0192,
0128-0129, 0119 against 0128 and 0113. Later notes citing them: 0090 (cites 0005), 0133 (cites 0005), 0092 (0056 on
a shard that leaves), 0113, 0147, 0178 by their decision sections. Not read: 0064, 0114 against 0041/0044 (by
brief, partly reviewed earlier), 0193, 0022, 0029, 0035, 0047, 0049, 0060, 0075, 0077, 0131, 0142, 0156, 0162, 0180,
0183, 0187 (0187 read by the previous review), 0219 (drain on Cluster is already an open question).

### Ruled out
- 0090's "nothing sends under a key once its work ended" (from 0005) against 0128: a droppable operation sends to no
  entity (0128, 0129), so a dropped one still stopping sends nothing.
- 0092's forked interruption on a shard that leaves, against 0090: a send started before the interruption and
  delivered after the work ended takes 0090's pending-id path, which 0090 already describes.
- 0119 against 0128 and 0123: the drain stops every delivery but `AtMostOnce` (loop.ts:222), so droppable and digest
  operations are stopped and run again, as 0128 says.
- 0119 against 0113: a suspended entity's at-most-once operation is drained, and its completion recorded behind the
  message it died on.
- 0119 against 0045, 0063, 0046: an at-most-once operation that waits for a deploy, a resumption or a crashed
  receiver during a drain ends in `unknown` after `millis`, which 0119 allows.
- 0128 against 0005 in a step: the Disarmed output precedes the Started of the new incarnation (machine.ts:998-1022),
  and a late completion is dropped by `record`'s incarnation check.
- 0128 against 0133: a child may leave with a droppable operation under way, as a key may.
- 0056 against 0128 and 0113: an entity with a droppable or a suspended entity's operation is busy, so an unload
  still stops only timers.

### Noticed, not checked
- 0128 with 0113 at a resume where the program could drop a kept droppable: in one process the program cannot
  change (0075), so not reachable; on Cluster the older runner's entities crash first. Not checked further.
- A drain step that changes a droppable (new incarnation) does not start it (draining), and the machine counts it
  running; harmless, since the process ends. Not tested.

## 2026-11-11: premise review of Creation and Defects

The reviewer's report, whole, as its session wrote it.

Branch `claude/premise-review-creation-03f15d`, commit `38fb0a2`. One finding reproduced, one only reasoned.

### Finding 1, reproduced: 0182 (and 0010) against 0009 and 0060
- Test: `FAILING: an at-least-once operation run again after a crash acts once, though init rejected its creation`,
  in `src/runtime.test.ts` (describe `what the runtime cannot finish`). Run: `bun test src/runtime.test.ts -t FAILING`.
  It fails: `toy-1` applied `['Rejected', 'AlreadyExists']`.
- The premise that fell: 0009 and 0060 say an operation that talks only to entities acts exactly once, because a
  run after a crash gets the stored replies (design.md:675 says the same). Nobody wrote down the premise under it:
  every answer an operation acts on is stored. 0182 stores no reply for a creation `init` rejects
  (callers.ts:253-255, machine.ts:840-845). So the run after a crash runs `init` again, and can get another answer.
  0182 says this for a caller's retry ("unless the rule reads the time, or a deploy changed the program"). It does
  not say it for an operation that branches on the answer.
- Sequence: entity `sender`'s at-least-once operation C creates `g` of `Gate`, and `init` rejects its flags. C sends
  `toy-1` `Rejected` under the name `refund`. The process dies before C's completion is recorded. Another creator
  creates `g`. At the next activation C runs again. Its creation gets `AlreadyExists`, and it sends under the name
  `confirm`. Both messages are applied. The same happens with `Created` when `init` reads the time, or after a
  deploy changes `init`.
- The same premise already fell, before 0182, for `NotFound`, which is not stored either (0010). A message to an
  entity that does not exist yet is answered `NotFound`, and the run after a crash, once the entity exists, gets
  `Accepted`. No test covers that case. A fix covers both, or the design states that an operation must not
  branch on an answer that is not stored.
- Where a fix begins: a design choice. Either store the creation's `Rejected` and `NotFound` under the operation's
  request while its work holds (0021), or narrow the promise in design.md and 0009 to operations whose acts do not
  depend on an answer that is not stored.

### Finding 2, only reasoned: 0160 against 0046 and 0114
- 0046 says that a creation `init` dies on is the sending operation's own defect, so it suspends the sender. 0124 says
  the creator is given the defect. On Cluster, 0160 makes a creation the program dies on die in the door
  (doors.ts:315), and Cluster delivers it again without end. An operation's `create` goes through the door's
  client (callers.ts:216-230, 0167), and so waits for ever. The sender is not suspended. The receiver does not exist.
  So `suspended` (0114) lists nothing, and only Cluster's log of restarts shows it. The sender's entity stays busy
  and is never unloaded. Neither 0160 nor 0167 says what holds of 0046 on Cluster.
- Not tested. A test would deploy, in `src/cluster.test.ts`, a program whose `init` throws, have an operation create
  it, and expect the sender suspended. It hangs today. It belongs with the open question on how long a sender waits
  before someone is told.

### Pairs read
Both notes read whole, with the code (machine.ts start/Create/activate/reconcile/handle/resume/discard/record/died;
callers.ts create; loop.ts start/perform/crash/unload/nothingToDo; doors.ts create step; process.ts operated;
rehearse.ts entitiesOf/born):
0012 against 0049, 0060, 0124, 0182. 0017 against 0047, 0060. 0049 against 0182. 0050 against 0060 and 0182.
0124 against 0182 and 0160. 0006 against 0046, 0061, 0113, 0114. 0042 against 0056, 0067, 0077. 0113 against 0042 and
0056. 0114 against 0041, 0044 and 0185. 0064 against 0041 and 0044. 0205 against 0157. 0046 against 0160 and 0182.
0009/0060 against 0182 and 0010.
By their decision sections only: the later notes that cite these: 0038, 0053, 0079, 0130, 0206, 0062, 0109, 0175,
0166, 0177, 0186.

### Suspects ruled out
- 0182 in a rehearsal: a rehearsal stores no reply for a creation `init` rejects either (rehearse.ts:476-486). It
  answers as the runtime does.
- 0017's `Created` on a retry after a rename (0156): the rename rewrites the stored `creation` request
  (storage/tables.ts:528-532).
- 0064 against 0041 and 0044: a fix that changes a timer gives it a new incarnation. The firing the entity died on is
  then dropped, and the timer is armed again, which is what the fix intends. A fix that changes an operation, or its
  delivery, under a completion is refused by `reconcile` and gives `StillSuspended`. A droppable one is dropped, as
  0128 allows.
- 0114 against 0041 and 0044: `discard` answers `NotDiscarded` exactly when the suspension is not on `Message`, or the
  head is internal (machine.ts:1057, process.ts:124).
- Two operators who discard at once can drop the next message: 0114 accepts this in its own words.
- 0042, 0056 and 0113: an operation of a crashed entity offers its completion to the old `Loaded`, which nothing reads
  (loop.ts:240). A suspended entity's operations are not kept across a `Restart`.
- 0185's `load` outside a transaction, on Cluster: the door loads inside Cluster's transaction (doors.ts:218).
- 0205 against the read model on PostgreSQL: an index string that holds U+0000 is already the program's defect
  (0157, the machine's test at machine.test.ts:1333), so `indexes::jsonb` never meets one.
- 0061: `activate` and `handle` catch only the machine's `Defect` (machine.ts:68-71). Anything else leaves the step.
- 0182's reason that does not encode, sent by an operation: it is a defect at creation, so it suspends the sender, as
  0046 says of a creation `init` dies on.

### Noticed, not checked
- 0166: Cluster keeps the rows of every operator's event, and nothing seen deletes them, so they may grow without end.
  Not read against 0245's `expire`.
- 0205 on Cluster: a door's defect, or a failure Cluster saves (0168), may carry program data with U+0000 into
  Cluster's own tables. That only matters once Cluster runs on PostgreSQL.
- The `NotFound` half of finding 1 has no test of its own. The test of finding 1 can be written again with a `send`
  to an entity created between the two runs.

### Not reached
None of the notes the brief named. Of the later notes, 0021, 0048, 0071, 0085, 0092, 0122, 0125, 0245, 0248 and 0249
were not read against these areas. The brief or the roadmap already cover 0085, 0245, 0248 and 0249.

## 2026-11-11: premise review of Messages, requests and replies

The reviewer's report, as its session wrote it. Branch `claude/premise-review-messages-975dd7`, cut from `main` at
`fcd2494`. Two findings. The first is reasoned from PostgreSQL's documented semantics, with a test written for the
CI's server that this machine could not run. The second is reproduced.

### The notes read

| Note | Role | How it was read |
| --- | --- | --- |
| 0004 | of the area | whole, with the code (incarnations in `src/machine.ts`, `keyRow`) |
| 0009 | of the area | whole, with the code (`entities` in `src/runtime/callers.ts`) |
| 0010 | of the area | whole, with the code (`receive`, `handle` in `src/machine.ts`) |
| 0015 | of the area | whole, with the code (`requestKey`, the replies' columns) |
| 0021 | of the area | whole, with the code (`write` in `src/storage/entities.ts`) |
| 0023 | of the area | whole, with the code (`receive`, `suspend`, `discard`, `awaitResumption`) |
| 0047 | of the area | whole, with the code (`named` in `src/runtime/callers.ts`) |
| 0048 | of the area | whole, with the code (`entity`, `replyOf`, `reply` in `src/storage/entities.ts`) |
| 0059 | of the area | whole, with the code (`askerOf`, `callerOf`) |
| 0060 | of the area | whole, with the code (`entities` in `src/runtime/callers.ts`) |
| 0065 | of the area | whole, with the code (`applyInProcess` in `src/runtime/loop.ts`, the door's `Message` step) |
| 0069 | of the area | whole, with the code (the upsert of `effecttea_replies`) |
| 0124 | of the area | whole, with the code (`create` and `send` in `src/runtime/callers.ts`) |
| 0125 | of the area | whole, with the code (`writes`, `reply`, `write`, `expire`) |
| 0245 | of the area | whole, with the code (`expire` and `prune` in batches, `forgetUnder`, `keepGiven`, and the commit `6423c6d` that brought the batches) |
| 0132 | changes 0004 | whole, with the code |
| 0182 | changes 0124 | whole, with the code (`create` in `callers.ts`, the door's creation, `Machine.start`) |
| 0248 | changes 0245 | whole, with the code (`send` on Cluster in `src/runtime/callers.ts`) |
| 0011 | cited by a later note of the area (0060) | in part: its rule of activation, by the code of `activate` and `reconcile`; the pair is bug 9 |
| 0012 | cited by a later note of the area (0060, which changes it) | whole, with the code |
| 0014 | cited by a later note of the area (0023, which changes it) | in part: its rules of resuming and discarding, with the code of `resume` and `discard` |
| 0017 | cited by a later note of the area (0021, 0047, 0048, 0060, 0125) | whole, with the code (the `Create` event, `Machine.start`) |
| 0046 | cited by a later note of the area (0047) | whole, with the code (`unlessCrashed`, `died`) |
| 0050 | cited by a later note of the area (0060) | whole, with the code (the two sets of `named`) |
| 0057 | cited by a later note of the area (0021) | whole, with the code (`writes`, `write`) |
| 0022, 0090, 0123, 0157, 0165 | change a note of the area | in part: by the status lines of the notes they change, and the code that keeps them |
| 0131, 0201 | change 0009 and 0010 | not at all: the rehearsal is out of this area, and 0201 is a type |
| 0156 | cites 0059 | in part: the code only (`renamed` in `src/storage/tables.ts`) |
| 0008, 0133 | cite 0004 | not at all |
| 0020, 0038 | cite 0009 | not at all; 0020 by the passage 0021 quotes |
| 0028, 0045 | cite 0010 | not at all |
| 0085 | cites 0015 | not at all |
| 0100 | cites 0021 | not at all |
| 0092 | cites 0023 | not at all |
| 0129 | cites 0060 | not at all |
| 0013, 0200, 0214 | cite 0065 | not at all |
| 0049, 0160, 0178 | cite 0124 | not at all |
| 0126, 0127, 0141 | cite 0125 | not at all |
| 0171 | cites 0245 | in part: the code of `given`, and the passages 0248 quotes |
| 0223 | cites 0245 | not at all |
| 0222 | outside the list, read for finding 1 | in part: its Context and the levels of a transaction |
| 0075, 0152 | outside the list, read to rule out a suspect | in part: the code of the deploy and the sweep in `src/runtime.ts` |

The later notes 0021, 0047, 0048, 0060 and 0125 also cite 0020, 0027, 0036, 0040 and 0053. Those lie in the areas
Versions and deploys, Schemas, and What enters the library, which no session has read yet, so the brief does not
give them to this one.

### Finding 1, only reasoned: 0245 against 0125, an expiry in batches deletes a reply a step wrote again

- The premise that fell: 0125 says a retry within `keep` is answered from storage, and that a step and `expire`
  delete only the rows past their time. Its `expire` was one statement,
  `DELETE FROM effecttea_replies WHERE name = … AND until IS NOT NULL AND until <= at`. Unwritten, the rule needs the
  condition on the time to be read on the row the statement deletes. 0245 made `expire` delete in batches, and the
  commit `6423c6d` moved the condition into a subquery:
  `DELETE … WHERE name = … AND (id, request, version) IN (SELECT … WHERE until <= at ORDER BY until LIMIT 256)`
  (`src/storage/entities.ts:452-467`). 0245 also made a sweep fiber run it on its own, beside the steps, and 0222
  runs the steps and the sweep at once on a pool of PostgreSQL, at `READ COMMITTED`.
- The sequence, on a pool of PostgreSQL. A caller's reply is stored with `until` 10. At 20 the caller retries, past
  its time. The step reads no reply, since `reply` filters `until > at`, applies the message again, and upserts the
  reply under the same key `(name, id, request, version)` with `until` 1 020 (`src/storage/entities.ts:350-366`, and
  the upsert of `src/storage/held.ts:63`). Before the step commits, the sweep's batch at 20 begins on another
  connection. Its subquery reads the row as it was committed, with `until` 10, and its `DELETE` waits for the row's
  lock. The step commits. PostgreSQL then checks the `WHERE` of the `DELETE` again on the updated row. The
  documentation of PostgreSQL, Read Committed Isolation Level (13.2.1), says the search condition is re-evaluated on
  the updated version of the row, and that the command does not see the effects of concurrent commands on other
  rows. So the subquery's rows stay those of its snapshot. The key matches, and the reply kept until 1 020 is
  deleted. A retry at 30, within the new `keep`, finds nothing and is applied a third time, in silence.
- On SQLite it cannot happen, since one writer holds the database for the whole batch's transaction. Before
  `6423c6d` it could not happen on PostgreSQL either, since the condition on `until` stood in the `WHERE` that
  PostgreSQL checks again.
- The other batched deletes of 0245 do not have this form, since neither deletes a row that a step updates in
  place. `prune` deletes rows of `effecttea_outbox`, which a step only inserts, by floors read from the cursors.
  `ack` only raises a cursor (`src/storage/log.ts:217`), so a floor read from an older snapshot is lower, and spares
  rows. A consumer is declared at its program's deploy, before that program's sweep is forked
  (`src/runtime.ts:1132, 1180`), and a name is deployed once in a process (0075). `expire`'s batch of
  `effecttea_given_requests` selects ids by `until`, and `keepGiven` inserts an id with `ON CONFLICT DO NOTHING`
  (`src/storage/cluster.ts:233-237`), so no row of it changes its time in place. Its `forgetUnder` runs three
  statements, each with a snapshot of its own (`src/storage/cluster.ts:29-41`), which matters only once Cluster runs
  on PostgreSQL.
- The test: `FAILING: expire keeps a reply a step wrote again with a new time while its batch waited`, in
  `src/postgres.test.ts`, describe `an expiry in batches beside a step that answers a retry again (decisions 0125,
  0245)`. It holds the step's transaction open after its upsert, starts `expire(20)` on a second pool, waits until a
  session waits for a lock, releases the step, and expects the reply read at 30. No server of PostgreSQL is
  reachable on this machine, so the test was skipped here and has not run. It runs with `bun run test:postgres`, or
  with `POSTGRES_URL=<url> bun test src/postgres.test.ts -t FAILING`. It belongs to family D of the step of bugs.
- Where a fix could begin: in `expire`, the condition on the time is kept on the outer row too, as
  `… AND until IS NOT NULL AND until <= at AND (id, request, version) IN (…)`, so that PostgreSQL checks it again.
  Or the subquery locks its rows with `FOR UPDATE`.

### Finding 2, reproduced: 0023 against 0014, a discard does not get an entity past a message an operation sent

- The premise that fell: 0014 lets an operator discard the inbound message an entity died on, to get the entity past
  it, and stores no reply for it, so that its caller's retry is handled as a new message. The rule rests on a premise
  no note wrote: the sender of the message retries only if it decides to. A caller outside decides. 0023 makes an
  operation's `send` wait for the receiver's resumption instead of answering `Suspended`, and calls its retries "this
  rule, done for the operation". So the operation sends the discarded message again under the same request, with no
  one deciding, and the discard is undone.
- The sequence: an at-least-once operation sends a message the receiver's `update` dies on. The receiver is
  suspended on it, and the operation waits for its resumption (`awaitResumption`, `src/runtime/callers.ts:133-145`).
  The operator discards the message: `discard` takes the head out, stores no reply, and activates the entity
  (`src/machine.ts:1054-1059`). The resumption wakes the operation, which sends the same request again. `receive`
  finds no reply and no copy in the mailbox, and handles it as a new message (`src/machine.ts:897-914`). The entity
  dies on it again, and is suspended again, with the operation waiting. The operator is told `Discarded` each time.
  Only a fix of the receiver, or of the sender, gets out of it.
- The test: `FAILING: a discard gets an entity past the message an operation sent, which the operation does not send
  again`, in `src/runtime.test.ts`, beside `an operator sees the suspended entities, who waits for each, and what a
  resume or a discard did`. It fails: after the discard the toy is suspended again, 5 ms later than before, on the
  message the operation sent again. Run it with `bun test src/runtime.test.ts -t "a discard gets an entity past"`.
- Where a fix could begin: a choice of the design. Either a discard stores, under the discarded request, an answer
  the sender is given, such as a rejection of the runtime's, so that the operation's `send` returns instead of
  sending again. Or the design says that a message an operation sent cannot be discarded, and `discard` answers
  `NotDiscarded` for it, as it does for an internal message, which is the operation's to change by a fix.

### Suspects ruled out

- 0125's `until` against a step that answers an inbound message without its time: every path of `handle` gives
  `at` (`src/machine.ts:976-983, 1027-1031`), and `writes` computes `until` from it.
- 0245's sweep against 0021: `expire` deletes only rows whose `until` is not null, and the machine gives no `until`
  to another entity's reply (`src/machine.ts:908-911`). So a reply an operation's run needs is never swept.
- 0065's reading outside the step's transaction, against the sweep: the reading filters `until > at` and the sweep
  deletes `until <= at`. A reply the sweep deletes between the reading and the step is past its time, and the answer
  given from the reading is one 0125 allows within the window.
- 0125's application after `keep` against 0069's key: the reply is upserted under the same key, and replaces the
  expired row of its version. The step's own deletion of `until <= at` runs after the upsert and spares the new row,
  except for a `keep` of 0, which means no time.
- 0048's migration of a sender against a message still queued: the mailbox's requests are read through the
  migrations at load (`src/storage/entities.ts:110-116`), so a retry after a deploy finds its message queued and
  waits.
- 0048 against 0017: the request that created the entity is written again with each write of the state, at the
  version of the row, and the third form of the update, which writes no state, keeps both the version and the
  request (`src/storage/entities.ts:252-276`). So the request is always read through the migrations of the version
  that wrote it.
- 0004 and 0132 against an uncommitted step on Cluster that drew incarnations: what a door's step sets going is
  performed only once its commit is proved by the count of steps (0161, `src/runtime/doors.ts:59-80`). So no run
  starts under an incarnation the counter can draw again.
- 0015 and 0059 against a rename (0156): the rename rewrites the `entity` of every stored request, the replies' and
  the mailbox's included, and the sender's columns. So a run restarted under the new name finds its replies.
- 0021 against 0020, 0064 and 0128: no activation brings a key back in the same incarnation with other work. A fix
  that changes an operation is refused, and a droppable operation keeps its incarnation but sends to no entity.
- 0021 against 0057: the storage applies the one condition 0057 leaves it, a reply whose asker's work no longer
  holds, as the reply is stored (`src/storage/entities.ts:367-376`), and the work that ended takes its replies by the
  rows the machine gives as `ended`.
- 0047 against 0046: a name sent under twice dies in `named`, before the delivery, so `unlessCrashed` does not take
  it for a receiver's crash, and it stays the sender's defect. An at-most-once operation suspended so is given
  `unknown` at its resumption (0011), and an at-least-once one sends the same names again, and is given the replies
  stored.
- 0047 and 0060's names against a receiver that crashes: the retry of 0046 is inside the same `send`, and does not
  take the name again.
- 0060 against 0012 and 0050: a creation and a message of one run are named in two sets (`src/runtime/callers.ts`,
  `used`), and stored apart, the creation in the entity's row and the message's reply among the replies. So a
  creation no longer counts as the run's one message, and a name used for both does not take one's answer for the
  other's.
- 0060 against 0011: the case where an answer the operation acts on is not stored is bug 9, and is not reported
  again.
- 0125 and 0021 against 0017: a retry of a creation is answered from the entity's row, which no deletion of 0021,
  0125 or 0245 touches.
- 0182 against 0124's premises. That a rejection reaches its caller with its reason, and that a sender that does not
  encode reaches no entity, still hold. That a defect at creation stores nothing still holds, and a rejection stores
  nothing beside it. That a sender as fine as an identity keeps request ids apart still holds; a rejected creation
  frees its request id, and a later creation under it by another device of the same identity is answered `Created`.
  A retry of the rejected one is then answered `Created` too, which 0182's last premise, a retry with other flags
  under one request id is the caller's mistake, accepts. What 0124 refused, a third reply a retry would have to find
  stored, is what 0182 takes without storing it, and its cost for an operation is bug 9.
- 0125's rule that when the rows go never changes an answer, against Cluster: on Cluster a retry past `keep` is
  answered from Cluster's rows until they go. 0248 says so in its own words, and the answer is the earlier reply,
  not a second application.
- 0245's prune in batches against a consumer declared at once: a program's consumers are declared at its deploy,
  before its sweep is forked (`src/runtime.ts:1132, 1180`), and a name is deployed once in a process (0075). On
  Cluster another runner's deploy may declare one while the singleton sweeps, but Cluster runs on one file of SQLite,
  whose one writer orders the declaration and the batch, and a topic with no consumer stored keeps no rows by 0245's
  own rule.
- 0065 and 0069 against a deploy that changes how a key's parameter is encoded (0132): the key's text changes, so
  the stored operation is under a key the new program does not return, and `reconcile` takes it for an operation
  dropped before its completion, a defect (`src/machine.ts:730-753`). The entity is suspended, and no run sends under
  another text.
- 0125's `until` across runners: a reply's `until` is written by the clock of the runner that steps, and read by the
  clock of the runner that holds the shard at a retry. On Cluster the runners run on one machine and share its clock
  (`docs/guide/cluster.md`), which is 0248's premise too. Runners on several machines are the open question The
  margin of a caller's rows on Cluster, which this case joins.

### Noticed, not checked

- None left. The four of the first report are finding 2 and three suspects ruled out above.

### Notes not read whole, and why

The notes that cite those of the area and lie in other areas of the step, and the changing notes 0022, 0090, 0123,
0157, 0165 and 0156, are left to those areas' sessions: Cluster, Versions and deploys, Schemas, and the runtime. Of
them only the code that keeps what the area's notes rely on was read. 0011 and 0014 were read at the rules the later
notes of this area rest on, since the sessions of their areas read them whole. 0131 and 0201 are the rehearsal's and
a type's.

## 2026-11-11: premise review of Effect Cluster

Branch `claude/premise-review-cluster-3063df`, test commits `3b1752e` and `2ca3751`. Two findings, both reproduced.
The later notes 0085, 0092 and 0162 were read against the notes they cite of the sections The machine and the
program, Operations and timers, Creation and Defects.

### The notes read

The area is 26 notes. "Cites one" means a note whose text names a note of the area, found by `grep -rlwE`. For an
earlier note, that is mostly a status line saying that a note of the area changes it.

| Note | Role | How it was read |
| --- | --- | --- |
| 0081 | of the area | whole; it keeps no code of its own |
| 0084 | of the area | whole |
| 0085 | of the area, and a later note to read against the areas already read | whole, with `reset` of `src/cluster.ts` |
| 0090 | of the area | whole, with `forgetUnder` and `keepSent` of `src/storage/cluster.ts` |
| 0091 | of the area | whole, with `Sharding.ts:1737-1768` of Effect |
| 0092 | of the area, and a later note to read against the areas already read | whole, with `src/runtime/doors.ts` |
| 0159 | of the area | whole |
| 0160 | of the area | whole |
| 0161 | of the area | whole, with `settle`, `applyOnCluster` and `finishIn` of `src/runtime/doors.ts` |
| 0162 | of the area, and a later note to read against the areas already read | whole, with `serving`, `activating`, `losing` and `singletonsOf` |
| 0163 | of the area | whole, with `others` of `src/cluster.ts` |
| 0165 | of the area | whole, with `reset` and `keptGiven` of `src/cluster.ts` |
| 0166 | of the area | whole, with the operator's branch of `doorStep` |
| 0167 | of the area | whole, with `stored.wait` and `waiters` in `doorStep` |
| 0168 | of the area | whole, with `resettingSavedFailure` |
| 0169 | of the area | whole, with `keepSent` and `forgetPending` in `doorStep` |
| 0170 | of the area | whole, with `resettingSavedFailure` |
| 0171 | of the area | whole, with `keptGiven` and the deletions of `src/storage/entities.ts:404` and `:463` |
| 0172 | of the area | whole |
| 0173 | of the area | whole |
| 0174 | of the area | whole |
| 0175 | of the area | whole, with `guard` of `src/cluster.ts` and each call of it |
| 0176 | of the area | whole, with `register` of `src/cluster.ts` and `sentNow` |
| 0178 | of the area | whole; its code is `examples/server`, which was not read |
| 0248 | of the area | whole, with `least` of `src/cluster.ts` |
| 0249 | of the area | whole, with `reset` and `forgetGiven` |
| 0245 | changes 0171 | whole, not its code (`expire` in batches, the sweep) |
| 0182 | cites one (0165) | in part: what 0249 and `reset` say of `Rejected` |
| 0042 | cited by 0092 and 0175; of Defects | whole, with `crash` and `leave` of `src/runtime/loop.ts`, for finding 1 |
| 0006 | cited by 0085; of Defects | whole, against 0085 |
| 0017, 0050 | cited by 0085; of Creation | whole, against 0085 and the creation's branch of `doorStep` |
| 0057 | cited by 0085; of The machine and the program | whole, against 0085, 0090 and 0169 |
| 0046 | cited by 0092; of Operations and timers | whole, against 0092 and 0168 |
| 0056 | cited by 0092 and 0162; of Operations and timers | whole, against both, with `losing` |
| 0015, 0023, 0048, 0059, 0065, 0069 | cited by 0085; of Messages, requests and replies | not paired: not of the four sections |
| 0036 | cited by 0085; of Versions and deploys | not paired: not of the four sections |
| 0029, 0071, 0076, 0078 | cited by 0092 or 0162; of The runtime | not paired: not of the four sections |
| 0137 | cited by and changed by 0162; of Schemas, storage and projections | the status line alone: not of the four sections |
| 0007, 0021, 0063, 0074, 0079, 0080, 0125, 0142, 0147, 0156 | cite one, by a status line that says a note of the area changes it | the status line alone |
| 0100, 0104, 0114, 0151, 0164, 0185, 0190, 0193, 0195, 0198, 0215, 0219, 0247 | cite one | not read |

### Finding 1, reproduced: 0175 against 0042 and 0162

- Test: `FAILING: an entity a step crashed under an expired lease that the runner renews runs its work again`, in
  `src/cluster.test.ts` (describe `the shards of a runner on Cluster`), commit `3b1752e`. Run:
  `bun test src/cluster.test.ts -t "FAILING: an entity a step crashed"`. It fails: `Ask` started once, not twice.
- The premise that fell: 0042 makes a crash safe because "what is stored is what its next activation starts from".
  On one process the next caller, the waker or the next start of the process loads the entity again. On Cluster an
  entity left with work and no timer is loaded again only by the shard's round of 0162, which runs when the shard's
  singleton starts. 0175 adds a crash that no such round follows. A step of the loop that `guard` refuses crashes its
  entity (doors.ts:114), and the crash interrupts the entity's operations (loop.ts:535). 0175 says that such a runner
  keeps trying "until Cluster moves the shard". Its own Context says that Cluster's refresh renews a lease that names
  its runner, expired or not. So in a case 0175 names, a lease that expired and that no runner took, the shard never
  moves and its singleton never starts again. The waker reads timers alone. An entity with an operation under way and
  no timer is never loaded again while the runner runs, unless a message reaches its door.
- Sequence: runner 1 holds every shard. Entity `one` runs `Ask`, which waits, and `Haunt`, which completes after two
  seconds. The lease of the shard of `one` grows older than its expiration, and no runner takes it. In the test this
  is an `UPDATE` of `acquired_at`. In a deployment it is a pause of the process, or a step of the wall clock that
  `CURRENT_TIMESTAMP` reads, longer than the expiration. The loop steps `Haunt`'s completion, `guard` refuses it, and
  `one` crashes, which interrupts `Ask`. The stored state still holds `asking` and `haunt`, as the test checks. The
  lease is renewed, as Cluster's next refresh writes it. Four seconds later `Ask` has not run again, and nothing will
  run it or `Haunt` on this runner.
- The other crashes of a loop's step on Cluster that no move of the shard follows may leave the same: a `COMMIT` that
  fails (0161), and a step that finds the entity's row written by another runner. Those were not run.
- Where a fix could begin: a crash on Cluster of an entity whose shard is still held could have the shard's round run
  again, or the waker read the entities left with work and not the timers alone. The code is `crash` and `leave` of
  `src/runtime/loop.ts:468-535`, and `activating` of `src/runtime/doors.ts:474-500`. Another way is a step of the loop
  that `guard` refuses leaving the entity loaded, and trying again after `retry`, instead of crashing it.

### Finding 2, reproduced: 0167 against 0092

- Test: `FAILING: an operator resumes an entity whose waiting sender is of a program the runner does not deploy`, in
  `src/cluster.test.ts` (describe `the shards of a runner on Cluster`), commit `2ca3751`. Run:
  `bun test src/cluster.test.ts -t "FAILING: an operator resumes"`. It fails: the `Resume` has no answer within five
  seconds, and Cluster logs `Defect in entity, restarting: Entity type 'Ghost' not registered` at each delivery.
- The premise that fell: 0092 says that a transaction of the runtime waits on nothing but its own statements. 0167
  sends `Resumed` from the transaction of the step that resumes, with `discard`, "so that the step never waits for
  another door". It reads only the path to another runner, `notifyAfterCommit` of `Runners.ts`. Where the sender's
  shard is this runner's, `sendOutgoing` takes `notifyLocal` (Sharding.ts:1374-1375). `notifyLocal` first waits for the
  sender's entity type to be registered (Sharding.ts:1279-1281), bounded by the runner's registration window
  (`awaitRegistrationDeadline`, Sharding.ts:2091-2106). That wait runs inside the step's transaction.
- Sequence: the entity `one` of `Bell` is suspended. A row of `effecttea_waiting` names a sender of `Ghost`, which the
  runner's `sharding` names and the runner does not deploy. Past the registration window an operator sends `Resume`.
  The door's step steps it, and calls `resume` for the sender (doors.ts:389), which dies with `Entity type 'Ghost'
  not registered`. The step rolls back, and Cluster delivers the `Resume` again after its backoff, without end. The
  entity is never resumed, and the operator is never answered. A `Discard` goes the same way.
- In real use the row stands for a sender whose program a later launch no longer deploys. The row is written by a
  step that answered that program's operation `Suspended`. Inside the window, a sender's program not deployed yet on
  the runner is enough: a launch deploys its programs one after another. The wait then holds the file's one writer
  until the program is registered or the window ends, a minute by default. That outlasts the refresh's timeout of
  10 s, so every runner on the file gives up its shards (0092). Only reasoned: the in-window case was not run.
- Where a fix could begin: `resume` in `src/cluster.ts:498-502` and its call at `src/runtime/doors.ts:389`. `Resumed`
  could be sent from `afterCommit` from a row the step keeps, or be saved by `MessageStorage` alone and left for the
  storage loop to deliver. 0167 refused `afterCommit` for a process that dies between the commit and the send, so a
  fix keeps the rows of `effecttea_waiting` until the send.

### Suspects ruled out

- An operation's wait on Cluster that cannot be interrupted, under `Uninterruptible` `"client"` (0091), so that a
  crash on a shard lost leaves its fiber waiting for ever: `Sharding.ts:1742` of Effect only skips the `Interrupt`
  envelope, and the wait itself is interrupted.
- A change of `shardsPerGroup` with entities stored, which would move the partitions away from their shards (0092,
  0162): the first launch stores the number of partitions, and a launch given another fails (runtime.ts:221-225, 938).
- The two doors of a renamed entity (0176) stepping it at once, against 0085's "one at a time": the runner's one
  connection runs one transaction at a time, and each door's step settles by the count of `steps`.
- A pending id (0090, 0092, 0169) whose rows the next step deletes while a client still reads them, as 0248 found of
  a caller's: an id is pending only where nothing waits. The asker's work has ended, or the request is `Resumed`, sent
  with `discard`, or it is the request of 0170's client, which waits until it is interrupted.
- What a door's step set going, performed by a step of the loop that `guard` then refuses: `guard` runs before
  `settle` (doors.ts:114-115).
- A round of activations on an older runner (0175) that keeps the process from being settled for ever: the round is
  counted only while it runs, and not during the `retry` between two rounds (doors.ts:487-500).
- The margin of 0175's lease check: a step holds the file's write lock from `BEGIN IMMEDIATE` to its commit, so no
  runner takes the lease between the check and the commit.
- 0249 with two clients of one request, deleting a row too early, as 0248 found: ruled out by reading `send` and
  `reset` (cluster.ts:297-320, 470-494). The sequence is this. Client B reads the latest answer `Suspended`. Client A
  then resets the answer, the retry's reply is saved, and A keeps the id. B's `forgetGiven` then deletes the id A
  kept. A step or `expire` deletes Cluster's rows only under an id that is kept, so the deletion only keeps them
  longer. B's send is answered from the saved reply, and `keptGiven` keeps the id again. What stays is a leak: a
  caller B interrupted after its `forgetGiven` and before its answer keeps nothing, since the keep runs only once
  `restore(call)` has given an answer. Its request's rows then stay in Cluster's tables for ever. 0249's Consequences
  accept the same of one caller interrupted after its reset. No reply is lost.
- 0163 with 0161: a door's commit tells this runner's readings only at `Settle` (doors.ts:76), which `afterCommit`
  offers. A callback that is lost leaves a reading on this runner to wait out its `wait`, since `data_version` does
  not move at the connection's own commits. The wait is bounded by `wait.millis`, and the next step settles, so
  nothing is lost.
- 0245 with 0159: the sweep's singleton may be held by an older runner during a rolling deploy. `expire` and
  `pruneBatch` (log.ts:232-255) are SQL over times, cursors and stored consumers, and decode no row by its version.
  So the older code deletes what the newer one would.
- The six pairs of the later notes with the sections already read:
  - 0085 against 0017 and 0050: a creation and a message are two RPCs, under two primary keys and two Cluster ids.
    A door's message waits for an output `Replied` alone (doors.ts:359-360), so a `CreationReplied` never answers it. A
    retry of a creation whose Cluster rows went is answered from the entity's row (0245's test).
  - 0085 against 0006: the message an entity dies on stays in the runtime's mailbox. A creation the program dies on
    dies, and suspends nothing (0160). Bug 10 of the roadmap already covers it.
  - 0085 against 0057: the storage on Cluster decides one more thing, whether a request's id is kept or pending.
    That turns on whether the asker's work holds, which only the storage can see, as 0057 allows of a reply.
  - 0092 against 0046: a failure Cluster saved is reset, then given as a receiver's crash, and sent again after
    `retry` (0168). The other defects of Cluster's client reach the operation as a receiver's crash and are sent
    again too, as 0046 has it.
  - 0092 and 0162 against 0056: a crash on a shard lost forks the interruption of its operations in the
    deployment's scope, as 0056 does. An operation still stopping may run beside the one the next runner starts,
    which 0056's Consequences and 0092's accept.

### Noticed, not checked

- 0176 with 0174, confirmed by reading, not run: a process with no runner address deploys any program
  (runtime.ts:1088), the old code's included. Its callers keep their ids in `given_requests` under the old name. A
  step and `expire` delete by the program's new name (entities.ts:404, 463). A later launch's rename runs only where
  the old name `holds` a row, and `holds` reads neither `given_requests` nor the mark (tables.ts:519-523, 604-617).
  So those ids and their rows in Cluster's tables stay for ever. No reply is lost.
- Finding 2 inside the registration window, where the wait holds the file's one writer: only reasoned, as finding
  2 says.
- Finding 1 for the other crashes of a loop's step that no move of the shard follows: not run, as finding 1 says.

### Not read whole, and why

- The code of 0178, `examples/server`: the note says what its tests check, and the brief asked for the note.
- The notes cited by 0085, 0092 and 0162 that are not of the four sections, as the table says.
- The citing notes marked "not read" or "the status line alone" in the table. Each names a note of the area in a
  status line or in passing.

## 2026-11-11: premise review of Versions and deploys

Read by a session that wrote none of these notes, on the branch `claude/premise-review-versions-36a283`, cut from
`main` at `fcd2494`. The later notes 0022, 0075 and 0156 were also read against the notes they cite of the sections
The machine and the program, Operations and timers, Creation and Defects.

### The notes read

| Note | Role | How it was read |
| --- | --- | --- |
| 0020 | of the area | whole, with `renew` and `activate` of `src/machine.ts` |
| 0022 | of the area | whole, with `givenKey` of `src/machine.ts` |
| 0036 | of the area | whole |
| 0043 | of the area | whole |
| 0051 | of the area | whole |
| 0058 | of the area | whole |
| 0075 | of the area | whole, with the claim of names in `src/runtime.ts` |
| 0100 | of the area | whole |
| 0102 | of the area | whole |
| 0126 | of the area | whole |
| 0156 | of the area | whole, with `renamed` of `src/storage/tables.ts` and its tests |
| 0247 | of the area | whole, with the renames and the event of `src/check.ts` |
| 0064 | changes 0020 | whole |
| 0078 | changes 0075 | whole |
| 0176 | changes 0156 | whole, with `mark` of `src/storage/tables.ts` and `recordVersions` of `src/storage/cluster.ts` |
| 0063 | changes 0051 | in part: the decision |
| 0077 | changes 0043 | in part: the decision |
| 0122 | changes 0043 | in part: the decision and its premises |
| 0157 | changes 0156 | in part: the passages on a rename, with `inProcess` of `src/storage/tables.ts` |
| 0123 | cites 0022 and 0043 | in part: the passages that cite 0022 |
| 0167, 0169 and 0171 | cite 0156 | in part: the passages that cite 0156 |
| 0131 | cites 0075 | in part: the passage that cites 0075 |
| 0015, 0018, 0021, 0025, 0033, 0034, 0037, 0038, 0046, 0048, 0056, 0061, 0062, 0072, 0080, 0085, 0101, 0104, 0110, 0119, 0121, 0128, 0132, 0133, 0138, 0139, 0159 and 0174 | cite a note of the area | in part: the lines that cite it, read for whether they apply its rule elsewhere |

### Findings

1. **Reproduced: an entity created under a name a rename left draws the idempotency keys of the renamed entity of
   the same id.** The notes are 0156 and 0022, with the promise of 0020 that an idempotency key is never started for
   two operations. Decision 0022 makes the name with the id an entity's address, which is unique. Decision 0156
   keeps a renamed entity's keys drawn from its old name, in `keyed_as`. Its premise is that a key differs from
   every other by its incarnation, whichever name it holds. An incarnation is drawn from a counter of each entity, so
   the premise holds only while no other entity can be addressed by the old name and the same id. On one process
   nothing keeps the old name from being taken again: a launch that no longer declares the rename deploys a program
   of that name. The sequence: `Toy/x` starts an idempotent operation under `["Toy","x","a",1]`, and the process
   ends. A launch renames `Toy` to `Plaything`. A later launch, without the rename, deploys a program named `Toy`
   and creates `Toy/x`. Its operation is given `["Toy","x","a",1]`, the key of the operation `Plaything/x` holds
   under way. A payment provider answers the second charge with the first one's result, and the second charge is
   never made. The files are `givenKey` in `src/machine.ts:629` and the `keyed_as` of `renamed` in
   `src/storage/tables.ts:617`. No check of `src/runtime.ts` refuses the old name at a later launch. On Cluster the
   mark of 0176 refuses the old name for good, which is the second finding. Reproduced by `FAILING: an entity created
   under a name left by a rename draws no key a renamed entity holds`, in `src/runtime.test.ts`, on SQLite and
   PGlite. A fix could begin in `renamed`, which would record the old name on one process as on Cluster, or in
   `givenKey`, which would draw a renamed entity's keys from a name no other entity can take.
2. **Reproduced: on Cluster, a program renamed back to the name it left can never run under that name again.** The
   notes are 0176 and 0156. Decision 0156 lets a launch rename a name that holds something to one that holds no
   entity, so a later launch may rename `Buyer` back to `Asker`. Decision 0176 marks the old name renamed for good.
   Its unwritten premise is that a name left is never wanted again. The rename back marks `Buyer`, and leaves
   `Asker` marked renamed to `Buyer`, since `mark` writes the old name's row and never clears the new name's
   (`src/storage/tables.ts:634` to `652`). So `recordVersions` refuses every launch of `Asker`
   (`src/storage/cluster.ts:81`), and the check of every step dies for it. The program stops loudly, and nothing is
   lost. Reproduced by `FAILING: on Cluster, a program renamed back to the name it left is launched under it again`,
   in `src/storage.test.ts`, on SQLite and PGlite. A fix could begin in `mark`, which would clear the mark of the new
   name, or in `renamesOf`, which would refuse a rename onto a name marked renamed. The fix of the first finding
   decides this one too: a name left that may be taken again is a mark a rename back may clear.

Both tests are in the commit of this report on the branch.

### Suspects ruled out

- 0058 against 0036: a migrated operation is compared by what the new schema writes of both, so the comparison of
  0036 holds whatever order of keys a migration writes.
- 0100 against 0125: a caller's reply kept for a time only shortens how long the migrations of `rejection` are
  needed, and 0126 keeps every migration anyway.
- 0126 against 0156: a rename keeps the version of every row, so a row read after a rename is migrated as before.
- 0156's rewrite of requests on PostgreSQL, by 0157: only a text whose `entity.name` is the old name is written, and
  a text that `JSON.stringify` does not give back makes the rename die before it moves anything.
- 0156 against 0059: a reply to a renamed receiver is found by its `name` column, which moves. An operation names
  its receiver by the program it imports, which the code renames.
- 0156's refusal of a move onto a name that holds something reads only entities, heads and consumers. The other
  tables hold rows of a name only while the name holds an entity, since no entity is deleted.
- 0247 against 0156: `check` gives a renamed entity `keyedAs ?? name`, as the launch's `COALESCE` does. Two names
  renamed to one may hold the same id, which `check` passes and the launch refuses, and 0247's consequences say so.
- 0247 against 0043: a row no version reads is a `Load` failure of its entity, and fails no other.
- 0075 against 0011 and 0119: a new process for a fix delivers `unknown` to an at-most-once operation under way, as
  0075 says. The drain of 0119 is in bugs 2 and 6 of the roadmap.
- 0102 against 0156: a deploy refused for a renamed name dies inside the region of 0102, and gives its name back.

### Noticed, not checked

- 0156 with 0045: after a rename, an operation of another program whose code still imports the old program sends
  or creates under a name no deploy will take, since a deploy of it is refused. It waits for a deploy that never
  comes, and no operator sees it. A test that renames a program and runs such an operation under the old name would
  check it.
- 0247 during a launch on Cluster that renames: an entity read under its old name in one page's snapshot, and under
  its new name in a later page, is counted twice. Only the counts would be wrong.
- 0176, two different programs renamed to one where only one holds entities: the new name takes the newer version,
  and the other name's rows, its replies and its mailbox, are read through the migrations of a chain that is not
  theirs.

### Not read whole

The notes the table marks in part. 0063, 0077, 0122 and 0157 belong to other areas, which read them whole, and this
review read the rule each takes from a note of this area. The notes that only cite a note of the area were read at
the lines that cite it, to find those that apply its rule elsewhere. Of them, 0123, 0131, 0167, 0169 and 0171 do,
and were read at those passages.

## 2026-11-11: premise review of The runtime, without the scheduler of the tests, a first part

The area's notes are 0028, 0029, 0063, 0066 to 0068, 0071, 0073, 0074 and 0076 to 0079. They were read with the notes
that change or cite them, and 0029, 0071 and 0077 were read against the notes they cite of the areas read before. The
two failing tests are on the branch `claude/premise-review-runtime-1-b0a258`, in the commit of this section.

### The notes read

| Note | Role | How it was read |
| --- | --- | --- |
| 0028 | of the area | whole, with `applyInProcess` in `src/runtime/loop.ts` |
| 0029 | of the area | whole, with `nothingToDo`, `spare`, `leave`, `unload` and the loop's wait in `src/runtime/loop.ts`, with `src/runtime/waker.ts`, with `due` and `interrupted` in `src/storage/entities.ts`, and with `quiet` in `src/runtime.ts` |
| 0063 | of the area | whole, with `wake`, `awaitResumption`, `deployedAs` and `entities` in `src/runtime/callers.ts`, and with `settled` |
| 0066 | of the area | whole; the code in part: `running` and `ran` of `src/runtime.test_shared.ts`, and `TestClock.sleep` of Effect |
| 0067 | of the area | whole, with `holding` in `src/runtime/process.ts` |
| 0068 | of the area | whole, with `forkHeld` and `leave` |
| 0071 | of the area | whole, with `interrupted` and `deploying` in `src/runtime.ts` |
| 0073 | of the area | whole, with `at`, `observe` and the tests' `process` |
| 0074 | of the area | whole, with `applyInProcess` and `send` in `src/runtime/callers.ts` |
| 0076 | of the area | whole, with `admit` and `spare` |
| 0077 | of the area | whole, with `waking` in `src/runtime/waker.ts` |
| 0078 | of the area | whole, with `spare` and the registration of `deploying` |
| 0079 | of the area | whole, with `detached`, `withEntity` and `activate` |
| 0006 | cited by 0029 and 0071 | in part: the code only, the suspended entities `interrupted` and `due` leave out |
| 0011 | cited by 0029 | in part: the code only, `activate` of `src/machine.ts` |
| 0013 | cited by 0029 | not at all |
| 0030 | cites 0028 | not at all |
| 0040 | cites 0028 | not at all |
| 0042 | cites 0067 and 0077; changed by 0056, 0067 and 0077 | in part: the decision and the consequences, with `crash` in `src/runtime/loop.ts` |
| 0043 | cited by 0077, which changes it | in part: the status line only |
| 0045 | cites 0063, which changes it | in part: the code only, `deployedAs` |
| 0046 | cites 0063; cited by 0077 | in part: the code only, the retry of `entities` |
| 0051 | cites 0028 and 0063; cited by 0077 | in part: the code only, the `onError` of a deploy |
| 0056 | cites 0029 and 0067, which changes it | in part: the status line and the decision |
| 0061 | cited by 0077 | not at all |
| 0062 | cites 0077, which changes it | not at all |
| 0075 | cites 0078, which changes it | not at all |
| 0080 | cites 0067 and 0068 | not at all |
| 0081 | changes 0074; cites 0071 | not at all |
| 0085 | cites 0063 and 0074 | not at all |
| 0090 | cites 0063 | not at all |
| 0092 | changes 0079; cites 0029, 0063, 0071, 0074, 0076 and 0078 | not at all |
| 0101 | changes 0066; cites 0068, 0076 and 0078 | not at all |
| 0102 | changes 0078; cites 0076 and 0079 | in part: the code only, the registration of `deploying` |
| 0103 | changes 0066 and 0078; cites 0029, 0076, 0077 and 0079 | not at all |
| 0104 | changes 0066 and 0068; cites 0063, 0067, 0076 and 0079 | not at all |
| 0109 | changes 0076; cites 0068 and 0073 | in part: the decision and what it rests on, with `unload` |
| 0110 | changes 0079 | in part: the decision and what it rests on, with `detached` |
| 0111 | changes 0029 | in part: the decision and what it rests on |
| 0112 | changes 0078 and 0079 | in part: the decision and what it rests on |
| 0113 | changes 0029 | in part: the code only, `nothingToDo` and `activate` of `src/machine.ts` |
| 0114 | cites 0028, 0063 and 0066 | not at all |
| 0116 | changes 0029 | in part: the decision and what it rests on, with the loop's wait |
| 0119 | cites 0063, 0076 and 0079 | in part: the code only, the drain in `src/runtime.ts` |
| 0127 | cites 0076 | not at all |
| 0128 | cites 0063 | not at all |
| 0130 | cites 0063 | not at all |
| 0131 | cites 0063 and 0074 | not at all |
| 0134 | changes 0028; cites 0068 | in part: the code only, the loop's yield |
| 0135 | cites 0028 and 0073 | not at all |
| 0142 | cites 0063 | not at all |
| 0147 | changes 0074; cites 0063, 0067 and 0076 | in part: the code only, the permit of `send` |
| 0151 | changes 0076 | in part: the decision and what it rests on |
| 0162 | cites 0063 and 0071 | not at all |
| 0163 | changes 0063 | not at all |
| 0164 | cites 0063 and 0068 | in part: the code only, `untransacted` |
| 0167 | cites 0063 | not at all |
| 0172 | cites 0063 and 0067 | not at all |
| 0177 | cites 0063, 0067 and 0068 | not at all |
| 0193 | cites 0073 | not at all |
| 0194 | changes 0029 | in part: the decision and what it rests on |
| 0205 | changes 0028 | not at all |
| 0208 | found by the code: it takes the `retry` of 0077 and the `passivate` of 0029 to 0 | whole, with the checks of `launch` in `src/runtime.ts` |
| 0220 | cites 0074 | not at all |

### Findings

- **Under a `retry` of 0, the waker tries an entity it can never activate at once, for ever, and the process never
  settles.** Decision [0077](archive/0077-the-waker-tries-an-entity-it-cannot-load-again.md) has the waker try such an
  entity again after `retry`. It rejects trying the entity at once, since one row no version reads would keep the
  waker busy for ever. So it rests on a `retry` above 0, which no note writes. Decision
  [0208](0208-a-launch-checks-every-option.md) makes 0 a value of `retry`, for a sender that sends again at once, and
  does not read the waker. The sequence: the waker's activation of `w` fails, and `waking` marks `w` failed until
  `now + 0` (`src/runtime/waker.ts:46`). The next round finds the mark run out (`waker.ts:29`), reads `w` as due
  again, and activates it again, with no sleep between. `settled` never returns, since the waker stays busy, and the
  storage is read on every round for as long as the entity cannot be loaded. The launch accepts the 0 at
  `src/runtime.ts:1006`. **Reproduced** by `FAILING: under a retry of no time, an entity the waker can never activate
  leaves the process settled`, in `src/runtime/waker.test.ts`. The same test passes under a `retry` of 100. A fix
  could begin at `waker.ts:46`, with a least time for the waker's retry, or at the launch's check. Either is a note
  that changes 0208.
- **An entity that an event the runtime cannot finish crashes is never loaded again in its process until a caller
  comes, when it holds an operation or a message and no timer.** Decision
  [0029](archive/0029-an-idle-entity-is-unloaded.md) wakes the unloaded entities by their stored timers alone, since
  nothing unloaded holds an operation. Decision [0071](archive/0071-a-process-starts-the-entities-with-a-message.md)
  starts the entities whose state holds an operation or whose mailbox holds a message, but only when a process starts.
  Decision [0042](archive/0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md) unloads a crashed entity with
  its work stored, and leaves it to the next caller. So the premise of 0029 falls: an unloaded entity holds an
  operation. Decision [0077](archive/0077-the-waker-tries-an-entity-it-cannot-load-again.md) rejects this very wait
  for an activation of the waker, since a write that failed once would stop an entity no caller reaches until the
  process is restarted. It decides the waker's case alone. The sequence: an entity runs an at-least-once operation. A
  step of the entity, for a caller's message, dies before its commit, as a write that fails does. `crash`
  (`src/runtime/loop.ts:524`) takes the entity out of the process and forks the stop of the operation. The stored keys
  still hold the operation, with no `due`. The waker reads only keys with a `due` (`src/storage/entities.ts:514`), and
  only a deploy reads `interrupted` (`src/runtime.ts:1163`). The process is settled, and an hour later the operation
  has not run again. It runs again only once a caller comes or the process restarts. An entity with a timer stored is
  woken by the timer, so the case of a timer holds. **Reproduced** for an operation by `FAILING: an entity a failed
  write crashes runs its operation again with no caller coming`, in `src/runtime/loop.test.ts`. The case of a message
  left in the mailbox is only reasoned: a completion recorded there, whose `Handle` fails, waits the same way. A fix
  could begin at `crash`, which could give an entity with work stored to the waker's retry of 0077.

### Ruled out

- 0208's `passivate` of 0, against 0078's margin that a passivation waits long enough for a timer due to fire: the
  timer's sleep is forked at the `Restart`, before the wait's sleep. A sleep of 0 is no wait on the test clock and one
  yield on the live one, so the firing is queued first. In another order the entity leaves with its timer stored and
  is woken again, which costs the activation 0078 names, and loses nothing. Reasoned, and not run under the scheduler.
- 0063 and 0045, against 0078 and 0102: the signal of a program not deployed is completed in the uninterruptible step
  that registers the deployment (`src/runtime.ts:1167`). A deploy that fails before that step leaves the signal for
  the next deploy.
- 0063's resumption: `wake` runs in the step that lifts the suspension, right after the commit and before any point
  of the probe (`src/runtime/loop.ts:409`). A `Discard` lifts the suspension too, and wakes the senders.
- 0067 against 0079: a caller gives the entity's lock back before it waits for the detached activation
  (`src/runtime/loop.ts:735`). So nothing holds one entity's lock while it waits for another entity's.
- 0029's reading of the earliest due, which listed the entities held, against the capacity of 0076 and 0151: the
  reading leaves those entities out in memory, a page at a time (`src/storage/entities.ts:502`).
- 0029's rule that an unloaded entity holds no operation, against 0113: `nothingToDo` reads the fibers of a suspended
  entity. Such a fiber ends only by offering its completion, or by a stop that is a crash of the entity or of the
  process, after which `Restart` records an at-most-once operation's `unknown`, as after any crash.
- 0029's rule that no entity is unloaded under a caller, against a `passivate` of 0 and the detached activation of
  0079: the loop's unload waits for the lock the detached activation holds, and then finds the caller's event pending.
- 0071 against 0076: the entities a deploy starts past the capacity have work, so none of them is spare, and the
  capacity bounds the idle entities alone.
- 0073's probe that dies at `Unloaded` fails the callers of a later activation by its address: the probe is a seam of
  the tests, and those callers retry and get the stored reply.

### Noticed, not checked

- 0056 against 0011 and 0042: a crash forks the stop of its operations and gives the lock back. The next caller's
  `Restart` records an at-most-once operation's `unknown` while the old fiber may still run an uninterruptible region
  or a finalizer that acts. The program's answer to the `unknown`, a new operation, may then act beside the old
  fiber. Under the one permit before 0056, the stop was waited for.
- 0208's `retry` of 0 for a `send`: a receiver that crashes at every attempt, or answers `Full` (0147), is sent to
  again with no wait. The sender loads the receiver in a loop for as long as the receiver fails.
- The second finding on Cluster, where an activation a request needs runs in the request's transaction (0092): not
  read.
- 0077's map of failed entities on Cluster, where a shard moves to another runner while an entity waits for its retry:
  not read.

### Not read whole

- 0081, 0085, 0090, 0092, 0162, 0163, 0167 and 0172 are of the area Effect Cluster, reviewed in another session at
  the same time.
- 0101, 0103, 0109 to 0112, 0116, 0119, 0134, 0147, 0164, 0177, 0194 and 0220 are of the area's second part.
- 0104 is of the area of the scheduler of the tests, and 0075 and 0102 of the area Versions and deploys.
- 0006, 0011, 0042, 0043, 0045, 0046, 0051, 0056, 0061 and 0062 are of areas read before. Only the rules this area
  reuses were read, in the code or in the decision.
- 0013, 0030, 0040, 0080, 0113, 0114, 0127, 0128, 0130, 0131, 0135, 0142, 0151, 0193 and 0205 cite the area for a rule
  they do not change. They were not reached for lack of time, beyond the code or the decision the table names.

## 2026-11-11: premise review of The runtime, without the scheduler of the tests, a second part

The notes of the area: 0101, 0103, 0109 to 0112, 0116, 0119, 0120, 0134, 0147, 0164, 0177, 0194, 0219 to 0221, 0243
and 0246. Also 0219 against the notes of the areas already read that it cites. The reviewer did not write these
notes. One finding is reproduced, and one is only reasoned.

### The notes read

| Note | Role | How it was read |
| --- | --- | --- |
| 0101 | of the area | whole, with the tests' use of `TestClock` |
| 0103 | of the area | whole, with every read of a clock in `src/` |
| 0109 | of the area | whole, with `unload` and `quiet` |
| 0110 | of the area | whole, with `detached` |
| 0111 | of the area | whole; replaced by 0116, whose code was read |
| 0112 | of the area | whole, with every fork of `src/` and `forkUnsafe` of Effect 4.1.3 |
| 0116 | of the area | whole, with `steps` of `loop.ts` |
| 0119 | of the area | whole, with the drain, `admitted`, `start` and `arm` |
| 0120 | of the area | whole, with `launchWith` |
| 0134 | of the area | whole, with `steps` |
| 0147 | of the area | whole, with the permits of `loop.ts` and `callers.ts` |
| 0164 | of the area | whole, with the forks and counts of `src/` |
| 0177 | of the area | whole |
| 0194 | of the area | whole, with `arm` and `waking` |
| 0219 | of the area | whole, with the drain, `doors.ts` and `registerEntity` of Effect's `Sharding.ts` |
| 0220 | of the area | whole, with `start` and `traced` |
| 0221 | of the area | whole, with `arm` and `waking` |
| 0243 | of the area | whole |
| 0246 | of the area | whole |
| 0104 | changes 0101; cites 0109, 0110 | in part: the passages that cite the area |
| 0117 | changes 0116; cites 0134 | in part: the passages that cite the area |
| 0165 | changes 0147 | whole, with the client of `cluster.ts` |
| 0224 | changes 0220 | in part: context and decision |
| 0011 | cites 0119 | in part: the status line |
| 0019 | cites 0116 | in part: the passage that cites it |
| 0028 | cites 0134 | in part: the status line |
| 0029 | cites 0111, 0116, 0194 | in part: the status line |
| 0046 | cites 0147 | in part: the status line |
| 0066 | cites 0101, 0103 | in part: the status line |
| 0074 | cites 0147 | in part: the status line |
| 0076 | cites 0109 | in part: the status line |
| 0078 | cites 0103, 0112 | in part: the status line |
| 0079 | cites 0110, 0112 | in part: the status line, and `detached` |
| 0080 | cites 0120 | in part: status, context and decision |
| 0115 | cites 0116 | in part: the passages that cite it |
| 0128 | cites 0119 | in part: the consequences |
| 0135 | cites 0134 | in part: the passages that cite it |
| 0142 | cites 0119, 0120 | in part: decision and premises |
| 0151 | cites 0147 | in part: the decision |
| 0161 | cites 0164 | in part: the status line, and `settle` of `doors.ts` |
| 0162 | not in the list; read for finding 2 | in part: its decision on an activation |
| 0184 | cites 0164 | in part: the passage that cites it, and the reader of `consume` |
| 0192 | cites 0164 | in part: the passage that cites it |
| 0225 | cites 0194 to 0224 as their review | in part: the status line |

### Finding 1, reproduced: 0219 against 0119
- Decision 0119 says that during the drain the runtime takes no caller's message, creation, resume or discard. The
  guard is `admitted`, around the handle's `create`, `send`, `resume` and `discard` (src/runtime.ts:1053-1054). So on
  one process no caller's message starts an at-most-once operation that a drain past `millis` then stops. The caller
  is interrupted, and its retry after the restart is applied there.
- Decision 0219 opened the drain on Cluster. There a second actor reaches the entity: a caller on any runner,
  through Cluster's client of the door. The door's step, `doorStep` (src/runtime/doors.ts:282), runs in Cluster's
  handler. No guard of the drain holds it. `drained` (src/runtime.ts:1378) does not count it until the loop settles
  it. Decisions 0165 and 0166 put a creation, a resume and a discard through the door too, so those are taken alike.
- The sequence: a runner launched with `drain` is stopped while an at-most-once operation of `one` runs. During the
  drain a caller sends `two` a message through the door, and the draining runner steps it. The step starts the
  at-most-once operation of `two`, since `start` starts one in a drain (src/runtime/loop.ts:220-224). The operation
  outlasts `millis`, and the scope closes. The next runner then delivers `unknown` for it. On one process the same
  message would have waited, been interrupted, and been applied after the restart, with no `unknown`.
- Reproduced by `FAILING: a caller’s message through the door during a drain is not taken, and starts no at-most-once
  operation`, in src/cluster.test.ts, in the commit that adds this report. It sees two runs of the operation where
  the drain had one, and the state `unknown` for `two`. It failed in both of two runs.
- It is not bug 2 of the roadmap: both runners here are of one version, and no deploy of a newer one takes the shards.
- A related window is only reasoned. A door's step that commits after the drain looked is not counted until its
  `Settle` is offered. The drain can end then, and the at-most-once operation the step stored is never started.
- Where a fix could begin: the door's step for a request of a caller or an operator during a drain. It could die
  there, so that Cluster delivers the request again to the runner that takes the shard. Or `drained` could count a
  door's step from its start. Either is a choice of the design for decision 0119 on Cluster.

### Finding 2, only reasoned: 0162 against 0112
- Decision 0112 has every fork from a region that cannot be interrupted pass `{ uninterruptible: false }`. Its premise
  is that Effect's default may change, as it did between Effect 3 and Effect 4. It says that a fork added later
  passes the option too. A fiber that cannot be interrupted holds its scope's closing for as long as it runs, and a
  loop runs until its entity leaves.
- Decision 0162 made an activation on Cluster uninterruptible: `activateOnCluster` (src/runtime/doors.ts:410). Inside
  it, `finishIn` forks the entity's loop without the option (src/runtime/doors.ts:243). Where the `Restart` wrote
  nothing, `perform` runs inside the region too. Its forks, `forkHeld` (src/runtime/loop.ts:158) and `drop`
  (src/runtime/loop.ts:134), pass no option either.
- At Effect 4.1.3 a fork is interruptible by default (`forkUnsafe` in `internal/effect.ts`, lines 5619 to 5622), so
  nothing fails at the pinned version. A release that gave a fork the region's interruptibility would make the loop
  and the operations of every entity activated on Cluster uninterruptible. The deployment's scope would then never
  close, and the runner would never stop. No test can fail at the pinned version, as decision 0112 says of its own
  forks.
- Where a fix could begin: the option at those three forks, or a check in `src/form.test.ts` that every fork passes it.

### Suspects ruled out
- The waker races `Queue.take` of its poke against a sleep (src/runtime/waker.ts:65), the race in which decision 0116
  found an item lost. A poke lost there is lost before the round's next reading, which reads the storage anyway.
- Decision 0164 says each fiber that Effect forks inside a combinator is joined before the combinator ends. Decision
  0219 reads that a race does not wait for its loser. No race of `src/` runs inside a step's transaction, and the
  losers of `waited` and of the drain wait only on a `Deferred` or a sleep.
- Decision 0103 says the runtime reads the time only through Effect's `Clock`. Only the check of a shard's lease reads
  the database's clock (src/storage/cluster.ts:144-145), by which Cluster measures its leases.
- Decision 0147 against the drain: a caller held by `admitted` takes no permit, since the guard stands outside
  `send`. An at-most-once operation that meets a full receiver in the drain sends again after `retry`, within
  `millis`.
- Decision 0109 against the drain: `drained` does not read `leaving`. An entity unloads only when it runs no
  operation, so an unload stops no at-most-once operation the drain waits for.
- Decision 0110 against the drain: the fiber that gives the count back is in `running`, which closes after the drain.
- Decision 0221 against the capacity and `settled`: `spare` and `quiet` read the wall clock as the timers do, so a
  clock set back makes no timer due early in either.
- Decision 0134 against 0116: a `Passivate` of an earlier wait left in the queue makes the loop yield once, and is
  passed over.
- Decision 0142 against the drain: a reading that waits ends with `closing`, which is completed after the drain.

### Noticed, not checked
- Decision 0219 on Cluster rests on the caller's scope releasing the runtime before `Sharding`. Decision 0120 made
  the drain hold whatever the caller's strategy is, on one process. An application that builds the runtime and
  `Sharding` in one parallel scope would let the shards go during the drain. A completion would then die on the
  check of the lease (decision 0175). No test builds them so.
- After the drain, `running` closes the deployment's scope. That scope interrupts the loops first, and closes the
  registration of the door last. A door's step that runs between the two can commit a step whose `Settle` no loop
  takes. Whether Cluster's teardown interrupts that step first was not read in `entityManager.ts`.

### Not read whole
- The notes that only cite the area, and 0104, 0117 and 0224, were read in the passages that cite the area. 0104,
  0115 and 0117 are notes of the scheduler of the tests, which this area leaves out. 0162 was read in its decision on
  an activation alone, for finding 2. Every note of the area itself was read whole, with its code.

## 2026-11-11: premise review of Schemas and projections, a first part

The reviewer's report, whole, as its session wrote it.

Branch `claude/premise-review-schemas-1-0ccf33`, failing tests at commit `778b0f2`, cut from `main` at `fcd2494`.
One finding reproduced. One only reasoned, with a test written that runs only on a server of PostgreSQL.

### The notes read

| Note | Role | How it was read |
| --- | --- | --- |
| 0025 | of the area | whole, with the code (`encodeWork` in `src/machine.ts`) |
| 0026 | of the area | whole, with the code (`projectionViolations` in `src/testing.ts`) |
| 0027 | of the area | whole, with the code of the sender as `projectionViolations` and `Meta` give it |
| 0030 | of the area | whole, with the code (`Json` in `src/program.ts`) |
| 0032 | of the area | whole, with the code (`reindex` and `projected` in `src/storage/projections.ts`) |
| 0038 | of the area | whole, with the code (the draw of a `seq` in `src/storage/entities.ts`, and `src/storage/log.ts`) |
| 0039 | of the area | whole, with the code (`declare`, `fetch`, `ack`, `pruneBatch` and `forget` in `src/storage/log.ts`) |
| 0040 | of the area | whole, with the code (`encodeOnce` and `shownOf` in `src/machine.ts`) |
| 0062 | of the area | whole, with the code (the head of `src/storage/rows.ts` and `json`) |
| 0070 | of the area | whole, with the code (`reindex` in `src/storage/projections.ts`) |
| 0072 | of the area | whole, with the code (`shownOf` and its cache by program) |
| 0098 | of the area, and changes 0030 | whole, with the code (`Json` in `src/program.ts`) |
| 0057 | changes 0038 and 0040 | whole, with the caches of `src/machine.ts` |
| 0058 | changes 0025 | whole, with `encodeWork` |
| 0137 | changes 0038 and 0039 | whole, with the code |
| 0138 | changes 0038, 0039 and 0072 | in part: the decision and `What it rests on` |
| 0139 | changes 0032 | in part: the decision and `What it rests on` |
| 0141 | changes 0032 and 0039 | not at all |
| 0142 | changes 0039 | not at all |
| 0143 | changes 0032 | not at all |
| 0148 | changes 0032 | not at all |
| 0150 | changes 0039 | in part: the ack's comment in `src/runtime.ts` |
| 0152 | changes 0039 | in part: the decision and `What it rests on`, with the code of `declare` and `pruneBatch` |
| 0184 | changes 0039 | in part: the decision and `What it rests on` |
| 0195 | changes 0039 | not at all, since it only renames `feed` |
| 0206 | changes 0032 | in part: the decision and `What it rests on` |
| 0210 | changes 0040 | in part: the decision and `What it rests on` |
| 0213 | changes 0026 | in part: the decision and `What it rests on`, with `projectionViolations` |
| 0077 | changes 0062 | not at all, since the area of the runtime holds it and bug 17 is of it |
| 0222 | the later note of finding 2, which cites no note of the area | whole, with `transaction` of `src/storage.ts` |
| 0159 | the later note of finding 1 | in part: what bug 2 and the tests of two runners say of it |
| 0052 | cites 0038 | in part: the decision |
| 0031, 0033, 0034, 0035, 0036, 0046, 0048, 0049, 0053, 0099, 0101, 0104, 0120, 0121, 0122, 0135, 0140, 0146, 0149, 0180, 0197, 0245 | each cites a note of the area | not at all |

### Finding 1, reproduced: 0152 and 0159 against 0039

- The premise that fell: 0039 lets a consumer go by `forget`, and keeps a consumer's cursors only while the consumer
  is stored. The rule holds because one process knows the consumers. 0152 refuses an ack of a name the deploy does
  not declare, and a forget of a name it declares, so no ack follows a forget of the same name. 0152 rests on 0080, a
  database held by one runtime. On Cluster, a rolling deploy runs an older runner beside a newer one (0159), and the
  older runner's deploy still declares the name the newer runner forgot.
- The sequence: the older runner deploys `Toy` with the consumers `queue` and `audit`, and creates `one`. Its reader
  of `queue` fetches the creation's row. A newer version launches with `audit` alone, and its operator forgets
  `queue`. The older reader acks its page. `ack` writes the cursor and does not check that the consumer is stored
  (`src/storage/log.ts:208`). `audit` reads the row and acks it. The prune then counts two cursors in the partition
  for one consumer. So the `HAVING count(*) = …` of `pruneBatch` (`src/storage/log.ts:237`) never holds there, and the
  partition is never pruned again while the topic has a consumer. `consumers` shows `audit` alone, so the operator
  sees no consumer that holds the log. A later deploy that declares `queue` again finds the cursor left, and reads
  from it, not from `0` as 0039 says.
- Reproduced by `FAILING: an ack of an older runner after a newer one forgot its consumer leaves the prune of the
  partition`, in `src/cluster.test.ts`, describe `two runners on one file`, commit `778b0f2`. The prune gives 0 where
  1 is expected. Without the older runner's ack the test passes. Run: `bun test src/cluster.test.ts -t "forgot its
  consumer"`.
- Where a fix could begin: `ack` in `src/storage/log.ts` could write a cursor only where its consumer is stored, as an
  `INSERT … SELECT` from `effecttea_consumers`. Or `pruneBatch` could count only the cursors of stored consumers. It
  is of family C of the step of bugs: a rule of one process that holds otherwise on Cluster.

### Finding 2, only reasoned, with a test: 0222 against 0070

- The premise that fell: 0070 writes a row of `reindex` only over the state the row was computed from. The check and
  the write are one statement, `INSERT … SELECT … FROM effecttea_entities WHERE state = … ON CONFLICT DO UPDATE`
  (`src/storage/projections.ts:500`), so that nothing commits between them. That held on SQLite, where a statement
  runs alone. On a pool of PostgreSQL a step's transaction runs at `READ COMMITTED` (0222), and `reindex` runs outside
  any transaction. There the `SELECT` reads the statement's snapshot. The `ON CONFLICT DO UPDATE` then waits for the
  lock the step holds on the row of the read model, and updates the row the step commits. PostgreSQL documents this
  under Transaction Isolation, Read Committed. The guard on the state is not read again.
- The sequence: a step of `a` writes its state and its row of the read model, and has not committed yet. `reindex`
  reads `a`'s committed state and computes its row. Its statement finds that state still stored, in its snapshot.
  Its update waits on the step's row, and the step commits. The update then writes the projection of the state
  before the step over the step's row. A query and `read` give a projection the entity has moved past, until the
  entity's next step, which 0032 and 0070 say never happens. It is the bug 0070 fixed, back on a pool.
- Not run: the worktree has no server of PostgreSQL, and PGlite runs one session, where the two cannot interleave.
  The test `FAILING: a reindex beside a step on a pool leaves the row the step wrote`, in `src/postgres.test.ts`,
  describe `a reindex beside a step (decision 0070)`, commit `778b0f2`, holds the step's transaction open, waits until
  `reindex` waits on a lock, and expects the step's row. It runs under `POSTGRES_URL`, as the CI's job `postgres`
  does. It races the wait with the end of `reindex`, so it ends without a hang if the reasoning is wrong.
- Where a fix could begin: `reindex` in `src/storage/projections.ts`. A guard in the `WHERE` of the `DO UPDATE` is
  read against the row the step committed. A statement that locks the entity's row first, `SELECT … FOR SHARE` in a
  transaction per row, also holds. It is of family D of the step of bugs.

### Suspects ruled out

- The caches of 0057 against a deploy that changes `project` (0072): `shownOf`, `encodeWork` and `encodeOnce` keep a
  value's encoding by program or by codec (`src/machine.ts:179-263`), so a new program computes both sides of a
  step's comparison again.
- 0057's encoding kept by the value, against a program that mutates its state: 0052 makes it the program's contract,
  as purity is.
- 0210's `-0` against 0058, 0070 and 0072: each compares the encoded JSON or its text, where `-0` and `0` are one value.
- A prune on a pool of PostgreSQL against a consumer declared at the same time (0039, 0152, 0222): a batch drops only
  the rows its snapshot sees. So the consumer loses only rows that a prune just before its declaration would have
  dropped on SQLite.
- `forget` on a pool of PostgreSQL, with a prune between its two deletes: the prune then finds fewer cursors than
  consumers, and drops nothing of the partition.
- An ack in a caller's transaction at `REPEATABLE READ` (0150, 0222): its reading of the heads is older, so it caps
  the cursor lower, never higher.
- 0138's rows of a step that share a `seq`, against 0137's order on a pool: the step draws the `seq` once, under the
  head's lock, so the next step of the partition draws after the first commits.
- 0026 against 0213: `projectionViolations` gives `update` the `Meta` the runtime gives, `at` and `from`, and nothing
  more (`src/testing.ts:44-63`, `Meta` in `src/program.ts:197`).
- The heads of the log under a rename, against 0038's `seq` that is never given again: `renamed` moves
  `effecttea_heads` with the other tables keyed by a name (`src/storage/tables.ts:479-491`).

### Noticed, not checked

- `reindex` on Cluster over SQLite: a runner's `reindex` whose statement reads its snapshot while another runner's
  step holds the write lock may end with `SQLITE_BUSY`, which no busy handler retries, and die. It loses no row.
- `reindex` run by an operator on the older runner of a rolling deploy (0159): it writes the older `project`'s row,
  at the older version, over a row the newer runner's `reindex` wrote, since the entity's state and version did not
  change.
- Finding 1 within one version: two runners of the same version whose deploys declare different consumers would
  give it too.

### Not read whole

- 0138, 0139, 0152, 0184, 0206, 0210 and 0213 were read by their decisions and premises. They are notes of the second
  part of this section, whose session reads them whole.
- 0141, 0142, 0143 and 0148 were not read, and 0150 only by the ack's comment. They are notes of the area of the
  queries and their pages, or of the second part of this section.
- 0077 was not read: the area of the runtime holds it.
- The notes that only cite the area were not read. The pairs of this review are the notes that change the area's
  rules, and the later notes of the two findings.

## 2026-11-11: premise review of Schemas and projections, second part

The area of the section Schemas, storage and projections, second part: 0121, 0122, 0135, 0137 to 0140, 0151 to 0155,
0157, 0158, 0184, 0206, 0210, 0213 to 0215 and 0240, with 0122 also read against the notes of the areas already read
that it cites. The reviewer wrote none of them. It found two bugs. The first is reproduced on SQLite. The second is
only reasoned, and its test is written for the CI's job `postgres`.

### The notes read

| Note | Role | How it was read |
| --- | --- | --- |
| 0121 | of the area | whole, with `projected` of `storage/projections.ts` |
| 0122 | of the area; also against 0043, 0061 and 0070 | whole, with `reindex` of `storage/projections.ts` and `shownOf` of `machine.ts` |
| 0135 | of the area | whole, with `warnOfSize` of `runtime/loop.ts` and the count of `write` in `storage/entities.ts` |
| 0137 | of the area | whole, with `storage/log.ts` and the draw of the head in `storage/entities.ts` |
| 0138 | of the area | whole, with `storage/log.ts` |
| 0139 | of the area | whole; its code is the type `Json` of `program.ts`, read where `shownOf` encodes |
| 0140 | of the area | whole, with `published` of `storage/log.ts` |
| 0151 | of the area | whole, with the default of `capacity` in `runtime.ts` and `spare` of `runtime/loop.ts` |
| 0152 | of the area | whole, with `declare`, `prune` and `forget` of `storage/log.ts`, and `deploy` and `enlisted` of `runtime.ts` |
| 0153 | of the area | whole, with `published` of `storage/log.ts` |
| 0154 | of the area | whole, with `write` of `storage/entities.ts` and the trigger of `storage/tables.ts` |
| 0155 | of the area | whole, with `forEach` of `program.ts` |
| 0157 | of the area | whole, with `storage/projections.ts`, and `transaction` and `hold` of `storage/tables.ts` |
| 0158 | of the area | whole, with `snapshot` of `storage/held.ts` |
| 0184 | of the area | whole, with `consume` of `runtime.ts` and `waited` of `runtime/readings.ts` |
| 0206 | of the area | whole, with `shownOf` of `machine.ts` |
| 0210 | of the area | whole, with `isJson` of `program.ts` |
| 0213 | of the area | whole, with `projectionViolations` of `testing.ts` |
| 0214 | of the area | whole, with `replied` of `machine.ts` |
| 0215 | of the area | whole, with the trigger of `storage/tables.ts` |
| 0240 | of the area | whole, with `forEach` of `program.ts` |
| 0070 | cited by 0122 as its reason | whole |
| 0222 | changes 0157 and 0158 | whole |
| 0162 | changes 0137 | in part: the status, the context, and the decision on the shard and the order of a partition |
| 0179 | changes 0157 | in part: from the status to What it rests on |
| 0191 | changes 0158 | in part: from the status to What it rests on |
| 0198 | changes 0158 | in part: from the status to What it rests on |
| 0216 | changes 0215 | in part: from the status to What it rests on |
| 0217 | changes 0215 | in part: from the status to What it rests on |
| 0223 | changes 0152 | in part: from the status to What it rests on |
| 0224 | changes 0154 | in part: from the status to What it rests on, with `consumers` of `storage/log.ts` |
| 0043 | changed by 0122 | whole |
| 0142 | changed by 0153 and 0184 | in part: the decision and What it rests on |
| 0026 | changed by 0213 | in part: the decision |
| 0007, 0032, 0038, 0039, 0040, 0065, 0072, 0076, 0133, 0156 | changed by notes of the area | not read: only through the passage of the area's note that changes each |
| 0061, 0080 | cited by 0122 and 0152 as premises | not read: only through the passages that cite them |
| 0148, 0150 | cite 0121 | in part: the passage that cites it |
| 0247 | cites 0122 | in part: the decision |
| 0132, 0133, 0147 | cite 0135 | in part: the passage that cites it |
| 0149 | cites 0138 | in part: the passages that cite it |
| 0185, 0204, 0205, 0207, 0209, 0218 | cite 0157 or 0158 | in part: the passages that cite them |
| 0211, 0212 | cite 0210 or 0214 | in part: the passages that cite them |

### Finding 1, reproduced: on Cluster a forget on one runner drops a consumer another runner declares (0152, 0080)

- 0152 keeps a consumer the deploy declares from `forget`, so that no consumer still read loses its rows. Its premise
  is that one process holds the database, so that one deploy declares the consumers (0080, in its What it rests
  on). On Cluster every runner deploys the program with consumers of its own. `enlisted` in
  `src/runtime.ts:868-885` reads only the declaration of the runner that is called.
- The sequence: runner 1 deploys with `billing` declared for the topic `projection`, and an entity is created. Runner
  2 deploys the same version without `billing`, and only warns that the consumer is stored and not declared. An
  operator follows the design's procedure on runner 2. The forget of `billing` succeeds, and the prune runs. The
  topic has no stored consumer, so the prune drops it whole (`pruneBatch` in `src/storage/log.ts`). Runner 1's
  `billing` then reads nothing, though it never acked the creation's row.
- The same holds in a rolling deploy whose newer version drops a consumer that the older runners still read. Once
  the forget is done, the sweep's prune drops the rows with no operator's prune, on whichever runner holds the sweep's
  singleton (0245).
- Reproduced by `FAILING: a forget on a runner that does not declare a consumer leaves the consumer another runner
  declares, and its rows` in `src/cluster.test.ts`, on two runners on one SQLite file. The test first checks that
  runner 1 reads the row, then fails on the reading after the forget and the prune.
- Where a fix could begin: on Cluster `forget` refuses a consumer that a running deployment declares, which the
  runners would record as `recordVersions` records their versions. Or the design says that on Cluster a consumer is
  forgotten only once no runner declares it.

### Finding 2, only reasoned, its test written: on PostgreSQL `reindex` writes a stale row over a step (0070, 0157, 0222)

- 0070 writes a row of `reindex` only over the state it was computed from. One statement does it,
  `INSERT … SELECT … FROM effecttea_entities WHERE state = … ON CONFLICT DO UPDATE`, in
  `src/storage/projections.ts:499-509`. Its premise is that "the check and the write are one, and nothing commits
  between them". That holds on SQLite's one writer and on PGlite's one session. 0157 runs the storage on PostgreSQL,
  and 0222 runs it on a server with a pool.
- The sequence: a step updates the entity's state (`src/storage/entities.ts:259`) and upserts its row of the read
  model (`src/storage/entities.ts:279`). It has not committed yet: it still writes its keys and its log, and may wait
  on its partition's head behind another step. `reindex` runs its statement for that entity in autocommit, at the
  role's level, `READ COMMITTED` by default. Its SELECT reads its snapshot, finds the old state, and gives a row. Its
  insert meets the row of the read model that the step holds locked, and waits. The step commits. PostgreSQL then
  applies `DO UPDATE` to the row the step committed, though no version of that row is in the statement's snapshot.
  PostgreSQL's manual says so of `INSERT … ON CONFLICT DO UPDATE`, under Transaction Isolation. The row then holds
  the projection of the state before the step, until the entity's next step, which may never come. That is the bug
  0070 was taken to fix.
- The same statement fails in a second way. Under a role whose default level is `REPEATABLE READ` or `SERIALIZABLE`,
  the statement fails with `SerializationError` in the same sequence, and `reindex` dies with it. 0222 says that
  every transaction of the runtime states its level, and 0122 lets only the program's failures pass over an entity.
- The test `FAILING: reindex leaves the row a step committed while its statement waited on the row` in
  `src/postgres.test.ts` holds a step's transaction open after its write. It waits until `reindex` waits on a lock,
  then lets the step commit, and reads the row. It typechecks, and was not run, since no server of PostgreSQL runs on
  the reviewer's machine. The CI's job `postgres` runs it. On PGlite the sequence cannot happen, since `reindex`
  waits for the step's whole transaction there.
- Where a fix could begin: the row's statement runs in a transaction of `transaction`, which locks the entity's row
  with `SELECT … FOR UPDATE` before it writes. Or the `DO UPDATE` takes a `WHERE` that reads the entity's state
  again, which PostgreSQL evaluates against the latest version of the row.

### Suspects ruled out

- Two prunes on PostgreSQL that each drop one row of a publication, so that both triggers keep it: the rows of one
  step have neighbouring positions, so a batch that holds the later row holds the earlier one too, and waits for the
  other prune's lock. Only a consumer stored between the two batches would part them, and on one process a consumer
  is stored only at deploy.
- A batch of a prune (0245) that parts the rows of one publication: the later batch's trigger finds no row left, and
  drops the publication.
- The position of the outbox on PostgreSQL, against 0137's premise that it rises with `seq` within a partition: the
  identity is drawn by the insert, after the head's row is locked (`src/storage/entities.ts:411-440`).
- The default capacity of 0151 unloading an entity whose door step is not settled on Cluster: such an entity does not
  leave (`src/runtime/loop.ts:608-613`).
- `consume` with a wait that never ends (0184), against a commit that 0142's timed wait would miss only for its
  time: the steps of the loop, of a creation, of a door and of an operator's `resume` or `discard` each tell their
  topics after the commit (`runtime/loop.ts:403`, `runtime/callers.ts:264`, `runtime/doors.ts:76` and `:140`). On
  Cluster the watcher tells every reading (0163).
- `forEach` over steps made first, with the identity (0240): a handle's step is a function of the parent's state,
  found by `toldOf`, so a run is joined as it is over the ids.
- `-0` in an index, a criterion or a cursor (0210): `JSON.stringify` writes `0`, SQLite compares `-0.0` equal to `0`,
  and PostgreSQL is bound `String(-0)`, which is `0`.
- 0121's read on Cluster: a caller's answer is saved with the step's commit (0081), so a read after the answer finds
  the row.
- A `reindex` of an older runner in a rolling deploy, over rows a newer runner reindexed: the state's version is the
  older one, so the row is written again with the older projection, and read through the newer migrations. Nothing
  is lost, and it is a case of the roadmap's table of what a deploy changes.
- 0215's trigger, under the `search_path` of 0217: the function is made in the schema the tables are made in, and
  resolves its tables by the session's `search_path`, which a pool gives every connection (0222).

### Noticed, not checked

- A step whose fiber is interrupted between its commit and `tell` (`runtime/loop.ts:399-403`) leaves a reader of
  `consume` with `wait: true` waiting until the topic's next commit. Under 0142's timed wait the cost was the time.
  Whether the loop can be interrupted there, other than when the runtime stops, was not read.
- `projectionViolations` (0213) gives `allows` the projection as `project` returns it, not as a caller reads it from
  its JSON (0210, 0211), and gives `update` the sender unmigrated. A projection that holds `-0` is then checked as no
  caller reads it.
- With finding 1, every runner that does not declare another runner's consumer warns of it at each deploy, as of a
  consumer to forget. An operator then sees a consumer in use named as one to forget.

### Not read whole

- 0162, 0179, 0191, 0198, 0216, 0217, 0223 and 0224 change notes of the area. They were read from their status to What
  it rests on, since their alternatives and consequences hold no premise.
- 0007, 0032, 0038, 0039, 0040, 0065, 0072, 0076, 0133 and 0156 are changed by notes of the area. They were read only
  through the passages that change them, since they belong to areas already read.
- 0061 and 0080 were read only through the passages that cite them. 0142 and 0026 were read in part.
- The notes that only cite a note of the area were read at the passage that cites it.

## 2026-11-11: premise review of The queries and their pages

The reviewer's report, on the branch `claude/premise-review-queries-ea6b5a`. One finding is reproduced, by the test
`FAILING: a handler of consume that creates an entity is answered, and holds no step of the runtime` in
`src/runtime.test.ts`, commit `4e32897`.

### The notes read

| Note | Role | How it was read |
| --- | --- | --- |
| 0141 | of the area | whole, with the code (`counted`, `published`, `fetch`, `query`) |
| 0142 | of the area, and a later note against 0039, 0063, 0080, 0119 and 0120 | whole, with the code (`runtime/readings.ts`, every `tell` and `storage.write` of `runtime/`) |
| 0143 | of the area | whole, with the code (`parts`, `cursorOf` and `storedIndexes` of `storage/projections.ts`) |
| 0144 | of the area | whole, with the code |
| 0145 | of the area | whole, with the code (`parts`, `indexed`, and `snapshot` of `storage/held.ts`) |
| 0146 | of the area | whole, with the code (`indexesText`, `bound`) |
| 0148 | of the area | whole, with the code (`count`, `sum`) |
| 0149 | of the area | whole; it holds no code of its own |
| 0150 | of the area | whole, with the code (`countBy`, and `ack` of `storage/log.ts`) |
| 0207 | of the area | whole, with the code (`isCompared`, `criteria`, `cursorOf`, `isText`) |
| 0209 | of the area | whole, with the code (`sum`) |
| 0032 | changed by 0141, 0143 and 0148 | in part: its status line and its decision |
| 0039 | changed by 0141, 0142 and 0150 | in part: its status line and its decision |
| 0053 | changed by 0141 and 0207 | in part: its status line and its decision |
| 0153 | changes 0142 | whole, with the code of `fetch` and `published` |
| 0163 | changes 0142 | whole, with the code of `readings.ts` and the watcher's `others` in `cluster.ts` |
| 0184 | changes 0142 and 0039 | whole, with the code of `consume` |
| 0198 | changes 0145, and cites 0150 | in part: its status line and the passages that cite them |
| 0157 | cites 0145 and 0146 | in part: the passages on pages, levels and integers |
| 0158 | cites 0145 | whole |
| 0164 | cites 0150 | in part: the rule of `untransacted` and of the detached work |
| 0177 | cites 0142 | in part: the passage that cites it |
| 0247 | cites 0141 | in part: the passage that cites it |
| 0222 | read for the premise of 0142 that one runtime holds a database | in part: the advisory lock and the levels |

### Finding 1, reproduced: 0184 against 0150 and 0164

- **The premise that fell.** 0150 lets `ack` join a transaction the caller left open, on one condition. Within that
  transaction, the caller waits for nothing a step does. The reason is that on SQLite and PGlite the transaction
  holds the one connection, and a step's commit waits for that connection. 0164 relies on the same condition for the
  detached work of a creation and of an activation, which runs without the caller's transaction. The condition is
  the caller's to keep, because the caller opened the transaction and knows that it holds one.
- **What 0184 changes.** 0184 opens the transaction itself, around every `handler` of `consume`
  (`src/runtime.ts:1275`). So every handler runs inside a transaction. Neither the JSDoc of `Handle.consume` nor
  `docs/design.md` under Consumers says what the handler must not call. 0184 kept the condition for the reading,
  and refuses a reader within a transaction. It did not keep the condition for the handler.
- **The sequence.** A handler of `consume` calls `create` or `send` of a handle of the same runtime, on SQLite or
  PGlite. Forwarding a row of a topic to an entity as a message is the obvious handler. `create` runs its step
  detached and untransacted (`src/runtime/callers.ts:233`, `src/runtime/loop.ts:688-711`). The step's
  `transaction` waits for the connection, which the page's transaction holds. The page's transaction waits for the
  handler, and the handler waits for the creation. Nothing ends the wait. Every other step of the runtime waits for
  the same connection, so the whole runtime stops, for ever and in silence. A `send` is the same, since its step
  runs in the entity's loop, which is forked untransacted. On Cluster the same holds of a runner's one connection,
  and the runner's leases and Cluster's own reads would wait too. That part is only reasoned.
- **Reproduced** by `FAILING: a handler of consume that creates an entity is answered, and holds no step of the
  runtime` in `src/runtime.test.ts`, commit `4e32897`, on SQLite. The reader is forked, and the clock moves a
  minute. The creation is never answered, and the reader never ends. The same test with the `create` called outside
  `consume` passes. A variant with a `send` to an existing entity fails the same way. That variant was run by hand,
  and is not committed.
- **Where a fix could begin.** One way: `consume` refuses, as an `InvariantDefect`, a call of the handle that waits
  for a step while the page's transaction is open. It can find the transaction through the client's
  `transactionService`, as it does for a reader. A second way: the docs name the rule for the handler. A third way:
  the handler runs outside the transaction, and only the store's writes and the ack run inside it. The third way
  changes what 0184 promises of a store.

### Suspects ruled out

- 0143's cursor against 0207: a row whose string index is no text a database holds would be refused as a cursor.
  But `shownOf` refuses such an index as the program's defect before it is stored (`src/machine.ts:280`).
- 0143's premise that the value stored is the value compared, for reals on SQLite: 200 000 random doubles written
  by `JSON.stringify` and read by `json_extract` all equalled the double bound, at SQLite 3.53.4 under Bun 1.4.4.
  The probe is in the reviewer's scratchpad, and is not committed. On PostgreSQL both sides are the `NUMERIC` of the
  same digits.
- 0145's page in one transaction, against a second runner on one file: `snapshot` begins a transaction, and SQLite
  in WAL mode reads one snapshot for it. On PostgreSQL, 0158 and 0222 already cover a page at the caller's level.
- 0142's premise that one runtime holds a database, against PostgreSQL with a pool: the session advisory lock of
  0222 keeps a second runtime out.
- 0142's tell after the commit, against Cluster's door steps: a door's step tells its topics at `settle`
  (`src/runtime/doors.ts:76`), which `afterCommit` offers once the door's transaction has committed
  (`src/runtime/doors.ts:255`). Every other `storage.write` of `runtime/` is followed by `tell` after its own
  transaction.
- 0209's bound on the partial totals: rounding is monotone, so each naive partial total is no larger in magnitude
  than the naive total of magnitudes. So a finite total of magnitudes keeps every partial total finite.
- 0150's `countBy` against 0146: a row written before 0146 holds other digits, and would be grouped apart. But no
  database was made before 0146, since no release is out.
- 0143's promise that a row no step changes is given once, against `reindex`: `reindex` writes the row as a step
  would, and 0143's rule for a row that moves covers it. Only the wording says "step".
- `fetch` with a `wait` inside a caller's transaction is not refused, as `consume` is. But it ends at its time, and
  the rule of 0150 in the design makes it the caller's.

### Noticed, not checked

- **0184 against 0163, once Cluster runs on PostgreSQL.** There the version of the other runners reads nothing, and
  0163 rests on a wait that ends at its time. A reader of `consume` with `wait: true` has no time. It would wait
  for ever while another runner commits rows of its topic, until a commit of its own runner wakes it. Today Cluster
  does not run on PostgreSQL (`docs/cluster.md`).
- **0184 against 0163 on SQLite.** A version that cannot be read counts as a version that has not moved. A reader
  of `consume` with `wait: true` on such a runner would wait for ever for another runner's rows. It needs a
  `PRAGMA data_version` that fails, which was not provoked.
- **0209 at the edge of the largest double.** SQLite adds the magnitudes as doubles, and PostgreSQL adds them
  exactly and rounds once. A set of rows whose exact total of magnitudes is just under `Number.MAX_VALUE` might
  overflow in SQLite's sum and be refused there, and be accepted on PostgreSQL. No sample was tried.
- **Finding 1 for a caller's own transaction.** A caller that calls `create` or `send` inside its own
  `withTransaction` stops the runtime in the same way. 0150 and 0164 make that the caller's rule, but nothing
  refuses it, and nothing tells the caller.

### Not read whole

0032, 0039 and 0053 were read only for what the area's notes change in them. 0157, 0164, 0177, 0198, 0222 and 0247
were read only in the passages that cite the area's notes. Every note of the area itself was read whole, with its
code.

## 2026-11-11: premise review of The tables and migrations

A session that did not write the notes read the area by the procedure of
[`premise-review`](../../.claude/skills/premise-review/SKILL.md). The branch is
`claude/premise-review-tables-28f779`, cut from `main` at `a746214`.

| Note | Role | How it was read |
| --- | --- | --- |
| 0191 | of the area | whole, with `createTables` of `storage/tables.ts` and `launch` of `runtime.ts` |
| 0198 | of the area | whole, with the statements of `tables` in `storage/tables.ts` |
| 0216 | of the area | whole, with `createTables` and `Migrator.make` of `effect/src/sql/Migrator.ts` at 4.1.3 |
| 0217 | of the area | whole, with `schemaOf`, `migrationsTable` and `tablesMade` of `storage/tables.ts` |
| 0218 | of the area | whole, with `tables`, and `indexed` of `storage/projections.ts` |
| 0222 | of the area | whole, with `transaction` of `storage/tables.ts`, `snapshot` of `storage/held.ts` and the replies of `write` in `storage/entities.ts` |
| 0223 | of the area | whole, with the sweep's passages of 0245 |
| 0224 | of the area | whole, with `consumers` of `storage/log.ts` |
| 0225 | of the area | whole, with `run` of `Migrator.ts` |
| 0055 | changed by 0191 | in part: the status line |
| 0145 | changed by 0198 | in part: the status line |
| 0152 | changed by 0223 | in part: the status line |
| 0154 | changed by 0224 | in part: the status line, with the trigger of `storage/tables.ts` |
| 0157 | changed by 0222 | in part: the status line |
| 0158 | changed by 0191 and 0198 | in part: the status line |
| 0161 | changed by 0198 | in part: the status line |
| 0176 | changed by 0198 | in part: the status line |
| 0215 | changed by 0216 and 0217 | whole, with the tests of the `search_path` in `src/storage.test.ts` |
| 0220 | changed by 0224, cites 0198 | in part: the passages that cite them |
| 0245 | changes 0223 | in part: the passages on the sweep and on 0223, with `expire` of `storage/entities.ts` |
| 0247 | cites 0217 | in part: the passage that cites it |

### Finding 1, reproduced: under the default `search_path`, a schema of the role's name moves the runtime onto empty tables (0215, 0217)

- The two notes. [Decision 0215](0215-the-runtimes-tables-are-made-in-the-schema-of-the-search-path.md) resolves every
  table through the `search_path`. [Decision 0217](0217-tea-migrations-is-named-in-the-schema-the-tables-are-made-in.md)
  names `effecttea_migrations` in the schema `current_schema()` gives, so that the tables are made in the first schema
  even where a schema further on holds them.
- The premise that fell. Under 0215 alone, `Migrator` found the history anywhere on the `search_path`, and every table
  was found where it was made. A database's tables stayed the runtime's whatever schema later came in front of them.
  0217 rests on a premise no note wrote: the first schema of the `search_path` changes only where the launcher means
  the runtime to move. Under the default `"$user", public`, the first schema changes by itself once a schema of the
  role's name is made.
- The sequence. A runtime's role `app` launches with the default `search_path`, and no schema `app` exists. Its tables
  are made in `public`, and entities are stored. An operator or the application then runs `CREATE SCHEMA
  AUTHORIZATION app`, for tables of its own. At the next launch `current_schema()` is `app`. `createTables` finds no
  history in `app`, runs `0001_tables` there, and the runtime reads and writes the new tables, empty, with no error.
  Every stored entity, reply and cursor is left in `public`. A caller's retry finds no reply and is applied again,
  and a `create` of an entity that exists succeeds. The same holds of the tables' owner under `tables: 'existing'`.
  Once a schema of the owner's name exists, the operator's `createTables` makes a new set in that schema, and a later
  migration would go there rather than to the tables the runtime reads.
- Files and lines. `schemaOf` and `migrationsTable` at `src/storage/tables.ts:142-147`, read by `createTables` at
  `src/storage/tables.ts:125`.
- Reproduced by `FAILING: on PostgreSQL a schema of the role’s name made after the tables leaves the runtime on the
  tables it made`, in `src/storage.test.ts`, on PGlite, in the commit of this report on the branch. It fails on the
  code of `main`, and passes with the history given unnamed, as before 0217.
- Where a fix could begin. `createTables` could die where a schema further on the `search_path` holds
  `effecttea_migrations` and the first does not, since a launch cannot tell a move from a mistake there. Or the launch
  could be given its schema by name. Either is a choice of the design, which changes 0217's rejection of the
  alternative "the promise holds only where no schema further on holds the tables".

### Suspects ruled out

- Two launches at once on SQLite, under 0218's first migration without `IF NOT EXISTS`: `Migrator` makes its history
  with `IF NOT EXISTS` outside the transaction, and the second waits on `BEGIN IMMEDIATE`, then finds `0001` recorded.
- Two launches at once on PostgreSQL, under 0218: `ensureMigrationsTable` looks for the table again when its creation
  fails, and the second launch's `LOCK TABLE` waits for the first's commit (`Migrator.ts:172-187` and `:265-269`).
- 0225 under `REPEATABLE READ`: `LOCK TABLE` is the first statement of `run`, and takes no snapshot.
- 0218's launch that dies on a name taken: `Migrator` writes its records in the transaction of the migrations, so the
  rollback takes them, and the history is left empty, as the test of 0218 sees.
- 0198 against 0145, 0158, 0161 and 0176: each check of a column or an index for a database made before went with the
  rename of the tables, and no database holds the tables under `effecttea_` without them.
- 0222's levels: every transaction of `src/` but `Migrator`'s is begun by `transaction` or `snapshot`, which state
  their level on PostgreSQL. `hold` begins empty transactions on SQLite alone.
- 0224 against 0154: `consumers` joins each partition's next row with its publication, which 0154's trigger keeps
  while a row names it, and a step writes both in one transaction.
- 0247's `tablesMade` under finding 1: it reads the history of the new first schema, which holds none, and dies. It is
  loud, not silent.
- 0223 against 0245's sweep: a batch that fails on a full volume rolls back, the sweep warns and runs at its next
  interval, and the operator's procedure stands, as 0245 saw in the spike.
- An index of a read model made with `IF NOT EXISTS` (0218): a later release that changes the expression of an index
  under the same name would keep the old index, so a query reads slowly and not wrongly. No release exists.

### Noticed, not checked

- **0245's sweep against 0222's premise on deadlocks, on a pool.** 0222 says two steps meet in a cycle only through
  the replies of two entities that answer each other. 0245 adds a sweep whose batch deletes replies in the order of
  their times, beside a step that deletes its entity's replies past their time (`src/storage/entities.ts:402`) or a
  reply its asker no longer holds (`:370`). Two deletes of several rows over the same rows, in two orders, may
  deadlock. Where PostgreSQL ends the step's transaction, the entity crashes. The orders are the planner's, and no
  server runs here, so it was not checked. A test of `src/postgres.test.ts` would hold the two statements at their
  rows.
- **0223's procedure against steps that run beside it.** Room an operator frees on a full volume may be taken first by
  the steps the callers retry, before the forget and the prune run. The spike ran no step beside the prune. It needs
  the CI's volume.
- **`createTables` called by an operator inside a transaction of their own**, at `REPEATABLE READ` with a query
  before it. `Migrator`'s transaction is then a savepoint, and its `LOCK TABLE` comes after the snapshot, against
  0225's premise. Nothing of the runtime calls it so, and its JSDoc does not say a caller must not. It needs a server.

### Not read whole

0055, 0145, 0152, 0154, 0157, 0158, 0161, 0176, 0220, 0245 and 0247 were read only in their status lines or in the
passages that cite the area's notes. Each is an earlier note whose rule a note of the area retires or extends, or a
later note that only cites one, and the code that keeps the rule was read where a note of the area changes it. Every
note of the area itself was read whole, with its code.

## 2026-11-11: premise review of The rehearsal and testing

The reviewer's report, on the branch `claude/premise-review-rehearsal-cdcc14`, cut from `main` at `a746214`. One
finding is reproduced, by the test `FAILING: a renewal created after the periods it bills fires once for each, as the
runtime does (decisions 0130, 0187)` in `src/rehearse.test.ts`, commit `abd8d29`.

### The notes read

| Note | Role | How it was read |
| --- | --- | --- |
| 0131 | of the area, and a later note against 0009, 0021, 0047, 0063, 0065, 0074, 0075 and 0130 | whole, with the code (`makeWorld`, `keep`, `apply`, `receive`, `entitiesOf`, `born`, `run` and `world.deploy` of `src/rehearse.ts`) |
| 0183 | of the area, changes 0131, and a later note against 0045 | whole, with the code (`deployedAs` of `src/rehearse.ts`; `reference`, `TypesOf` and `isProgram` of `src/program.ts`) |
| 0186 | of the area, changes 0131 | whole, with the code (`given`, `underWay` and `pending` of `src/rehearse.ts`) |
| 0187 | of the area, changes 0131 and 0014, and a later note against 0014 and 0130 | whole, with the code (`advance`, `dueBy` and `fireOf` of `src/rehearse.ts`; `Fire` and `Restart` of `src/machine.ts`) |
| 0188 | of the area | whole, with the code (`TypesOf` of `src/program.ts`) |
| 0189 | of the area, changes 0131 | whole, with the code (`Outside` of `src/rehearse.ts`) |
| 0190 | of the area | whole, with the code (the map of `examples/server/server.ts`) |
| 0200 | of the area, changes 0131 | whole, with the code (`send`, `named` and `keep` of `src/rehearse.ts`) |
| 0201 | of the area, changes 0010 | whole, with the code (`rejectWith` of `src/program.ts`) |
| 0211 | of the area, changes 0131 | whole, with the code (`projection` of `src/rehearse.ts`) |
| 0009 | changed by 0131, which cites it | whole, with the code of `entitiesOf` |
| 0014 | changed by 0187, which cites it | whole, with the code of `Fire` and `Restart` in `src/machine.ts` |
| 0010 | changed by 0201 | in part: its status line and its decision |
| 0130 | cited by 0131 and 0187 | whole, with the code of `complete` in `src/rehearse.ts` |
| 0021 | cited by 0131 | in part: its status line, context and decision; it has no `What it rests on` |
| 0045 | cited by 0183 | in part: its status line, context and decision; it has no `What it rests on` |
| 0047 | cited by 0131 | in part: its status line, context and decision; it has no `What it rests on` |
| 0063 | cited by 0131 | in part: its status line, context and decision; it has no `What it rests on` |
| 0065 | cited by 0131 and 0200 | in part: its status line, context and decision; it has no `What it rests on` |
| 0074 | cited by 0131 | in part: its status line, context and decision; it has no `What it rests on` |
| 0075 | cited by 0131 | in part: its status line, context and decision; it has no `What it rests on` |
| 0048 | cited by 0200 | in part: its decision |
| 0125 | cited by 0200 | in part: its status line, context, decision and `What it rests on` |
| 0245 | changes the rehearsal's `send` of 0200, though its status line does not say so | in part: its status line, context and decision |
| 0185 | cited by 0186 | in part: its decision and `What it rests on` |
| 0165 | cited by 0190 | in part: its decision and `What it rests on` |
| 0210 | cited by 0211 | in part: everything before its alternatives |
| 0212 | cites 0211, and is cited by it | in part: its decision and `What it rests on` |
| 0214 | cites 0211, and is cited by it | whole, with the code of `src/machine.ts`, lines 78 to 85 |

### Finding 1, reproduced: a repeating timer that catches up fails its rehearsal (0130, 0187)

- **The two notes.** [Decision 0130](archive/0130-a-runner-retries-and-the-state-counts-the-attempts.md) makes a
  rehearsal fail on an operation that its own completion returns the same. It does not check a timer. Its reason is
  that a timer at a time already past is how a repeating timer catches up after a downtime: a subscription stopped
  for three months renews three times in a row, and the runtime runs that catch-up. So a rehearsal cannot tell a
  loop of a timer from a catch-up. [Decision 0187](0187-a-rehearsal-moves-time-by-a-duration.md) cites 0130 as its
  reason, and makes a rehearsal fail on a key whose timer fires twice at one time, within one `advance`.
- **The premise that fell.** 0130's check is safe only because no program the runtime runs as designed fails it. A
  catch-up fires one key at a time already reached, again and again, until the timer comes after the time. Time
  stands still in a rehearsal while timers fire, so every firing of a catch-up is at one time. 0187 refuses "a
  program that fires one key twice at one time and then stops", and a catch-up is such a program. 0130's status
  line does not name 0187.
- **The sequence.** A program arms its renewal at the end of the periods paid, from its own last time, as
  `examples/subscription` arms `renewal` at `paidUntil(account)`. A rehearsal starts after three periods have
  passed, so the first renewal is due already. `advance(0)` fires it at the time reached, and the step arms the next
  renewal, also in the past. The second firing at the same time fails the test with "fires twice ... and time would
  never pass". The runtime renews three times and stops. A temporary test on SQLite ran the same program, created
  with the test's clock three hours on: the projection read `1`, `2` and `3` after three ticks of a millisecond, and
  stayed `3`. That test was deleted, since the brief allows only failing tests.
- **Where.** `advance` of `src/rehearse.ts`, lines 409 to 433, with its set `fired`.
- **Reproduced** by `FAILING: a renewal created after the periods it bills fires once for each, as the runtime does
  (decisions 0130, 0187)` in `src/rehearse.test.ts`, commit `abd8d29`. It fails with the message of the check.
- **Where a fix could begin.** The check could fail only on a key armed again at the time it was due at, or at an
  earlier one, and not at the time reached. A timer whose due time moves forward at each firing would then pass,
  though it is still in the past. A timer armed again at its own time, and two timers that arm each other at one
  time, would still fail. A timer that moves forward by an ever smaller step would loop for ever, as 0187 says of a
  chain of keys. A
  rehearsal reaches a timer in the past only by a start after it, by `fire` of a later timer, or by a deploy that
  arms one there, so the fix is also a choice of what a rehearsal of a downtime is.

### Suspects ruled out

- 0183 against 0045: a world answers `NotFound` to a send through a reference to a program it does not run, where
  the runtime waits for the program's deploy. A world holds no entity of that program, so the runtime gives the same
  `NotFound` once the program is deployed, and 0183 decides that answer explicitly.
- 0183 against 0131: a runner's `create` through a reference to a program the world does not run fails the test,
  where the runtime waits for ever. A test that fails tells what a test that hangs would.
- 0200 against 0245: 0200 says a rehearsal keeps a reply "as the runtime keeps a reply sent without keep", and since
  0245 no `send` is without `keep`. The code's comment now says `keep: 'forever'`, and 0200 already says a retry past
  a reply's time is tested on the runtime. Only 0200's sentence is out of date, and 0200's status line does not name
  0245.
- 0200 against 0048: a named request and a drawn one under the same text are kept apart in both orders, as the
  tests `gives a send without a request id no reply of a named request, whatever id it draws` and `gives a named
  request no reply of a send drawn before it, whatever id that send drew` hold. The set `named` belongs to the
  world, so a named request makes a drawn id of another entity skip its text too, which changes no answer.
- 0131 against 0021: the world deletes a reply to an operation once `written.ended` names the work that asked, as
  the machine gives it to the storage. A run after a crash keeps its incarnation, so its replies stay, as `a hold the
  process died on is sent again, and given its stored reply` tests.
- 0131 against 0063: a suspended receiver is never reached, since `apply` dies on a suspension. A test that catches
  that defect with `Effect.exit` and goes on finds the receiver dying again at the next send, which gives no answer
  the runtime would not give.
- 0131 against 0074: every mailbox is handled to its end inside the act, and a step never sends, so no act reaches
  a receiver whose mailbox holds a message.
- 0131 against 0075: a world runs one program under each name, and `world.deploy` restarts every entity, as a new
  process does. A runner's `create` with a program of another version reaches the one the world runs, by its name.
- 0187 against 0014: a firing of a timer due later moves time to it, and a timer due earlier fired afterwards keeps
  the time, as `keeps its time when a timer due earlier fires after one due later` tests. Time never goes back.
- 0187 against 0186: an act by a key reads the program's keys when it runs, so a key after a deploy is read under the
  program deployed.
- 0211 against 0214: the machine itself gives a rejection's reason as a caller reads it, so the rehearsal's `send`
  and a runner's `create` give it as the runtime does.
- 0211 against 0210, of the state: a rehearsal's `restart` keeps the state in memory (`Restart` of
  `src/machine.ts`), where the runtime reads it back from JSON. So a state holding `-0` is `-0` after a restart in a
  rehearsal and `0` in the runtime. 0210 decides that no program means to tell them apart, and `encode` refuses
  every other value that JSON does not give back as it is.
- 0189, 0190 and 0201 rest on no premise of an earlier note: 0189 on the types of Effect and on `Layer.mock`, 0190
  on the example's own protocol and on 0165, and 0201 on TypeScript's `const` type parameters.

### Noticed, not checked

- None. Each suspect noticed was checked by a test or by a reading.

### Not read whole

0010, 0048, 0125, 0165, 0185, 0210, 0212 and 0245 were read only in the parts the area's notes rest on or change,
as the table says. 0021, 0045, 0047, 0063, 0065, 0074 and 0075 were read in their status lines, contexts and
decisions. None of them has a section `What it rests on`, and their alternatives and consequences were not read.
Every note of the area itself was read whole, with its code, and so were 0131, 0183 and 0187 against the notes they
cite.

## 2026-11-11: premise review of The scheduler of the tests

The notes of the area: 0104, 0115, 0117 and 0244. Read with the code of `controlled`, `prioritized`, `everySchedule`
and `prioritizedSchedules` in `src/testing.ts`, `explored`, `together` and `adjusted` in
`src/runtime.test_shared.ts`, and the source of the pinned Effect 4.1.3: `runLoop`, `evaluate` and `yieldNow` of
`FiberImpl` in `internal/effect.ts`, `MixedScheduler.shouldYield` in `Scheduler.ts`, and `TrackingScheduler`, `run`
and `wake` in `testing/TestClock.ts`.

| Note | Role | How it was read |
| --- | --- | --- |
| 0104 | of the area | whole, with the code |
| 0115 | of the area; changes 0104 | whole, with the code |
| 0117 | of the area; changes 0104 and 0115 | whole, with the code |
| 0244 | of the area; changes 0104 and 0115 | whole, with the code and Effect's run loop |
| 0066 | cites 0104 | whole |
| 0068 | cites 0104 | whole |
| 0101 | cites 0104 | whole, with `run` of `TestClock.ts` |
| 0109 | cites 0104 | whole |
| 0110 | cites 0104 | whole, with `detached` of `src/runtime/loop.ts` |
| 0112 | cites 0104 | whole |
| 0116 | cites 0115 and 0117 | whole, with the wait of `src/runtime/loop.ts` |
| 0134 | cites 0117 | whole |
| 0172 | cites 0104 | whole |
| 0177 | cites 0104 | whole |

No later note outside the area was given to this area. No note but the area's changes one of its notes.

### Findings

- **Measured, by mutations: the rule of 0067 that 0104's second interleaving holds is no longer held by `bun test`,
  and the margin 0104 rests on fell.** 0104 says a run of PCT finds the lock dropped while others wait near 1 in 20,
  and that 2,000 runs miss either interleaving with a probability below e^-25. The test's comment says 67 seeds of
  2,000 build two machines. 0117 asks more decisions of every run, and 0134 and 0244 move every schedule again. None of
  them counted the seeds again, since neither interleaving has a seed pinned. On 2026-11-11 at `a746214`, with
  `if (lock.users === 0)` taken out of `holding` in `src/runtime/process.ts:380`, 6 seeds of 2,000 fail `callers of an
  unloaded entity build one machine for it` in `src/runtime/callers.test.ts:314`: 661, 747, 1350, 1618, 1914 and
  1953. One seed of 2,000 fails `two callers of an entity not loaded build one machine for it` in
  `src/runtime/loop.test.ts:774`. So `bun test`, which runs seeds 0 to 99, passes with the rule taken out. Only
  `bun run test:release` holds the rule, and 2,000 runs now miss it with a probability near e^-6, not e^-25. The
  first interleaving holds still: with the registration of `send` in `src/runtime/callers.ts:417` moved after the
  answer, 17 seeds of 2,000 fail, the first at seed 60, where the test's comment says 27. The premise that fell is
  0104's `What a test of 2,000 runs misses`, a margin no later note listed. It was measured by mutations run by hand,
  with `explored` changed to print each failing seed, and no test is committed: a test cannot hold how many seeds kill
  a mutation. A fix could begin by pinning seed 661 in the test of `src/runtime/callers.test.ts`, as `AGENTS.md`
  asks of a seed that found a bug, and by correcting the counts the two comments give. A fix of the margin itself is
  a choice of the design: a window of the test that holds only the two callers, or a rule that a change of the
  scheduler or of the runtime's yields counts again the seeds of the interleavings that 0104 names.

### Suspects ruled out

- 0244's premise that a cancelled yield's task runs no fiber, against `TrackingScheduler` of the test clock. The
  wrapper of a tracked task runs the task, then calls `onIdle`, which resumes the fiber that moves the clock inline in
  the same task. Since 0244, `step` has set `entering` false and named the cancelled yield's fiber as the one let run
  last. So the clock's fiber is taken for a fiber on another's stack, and is asked of preemption with no task ready.
  Its yield gives back only to the wrapper, which ends the task, so the order of the run does not change. Only a
  decision is added. This review also corrects 0117's reasoned premise: such a run begins on the wrapper's stack and
  not on a fiber's. The order is the same.
- The first-step branch of `yields` in `src/testing.ts:274` that lets a fiber through by `letThrough`. At 4.1.3 a
  fiber is not asked at the step it resumes from its yield, so `step` lets it through, as 0244 says. Another task
  could run such a fiber first only by interrupting it inline before any other fiber asks. Every task of Effect that
  names no fiber starts a fiber first: a fork, the wake of a `Queue`, a `Semaphore` or a `Latch`, or the test clock's
  wrapper. Under `inline` resumptions the branch decides nothing.
- A yield cancelled in its own run by an interruption deferred while the fiber ran. `runLoop` then goes on with its
  local `yielding` true, and asks `shouldYield` no more in that run. Effect's own scheduler is not asked there
  either, so no order Effect gives is lost.
- `fiber.currentOpCount === 1` as the first step of a run. Effect counts each step and each call of `succeedWith`, so
  the count only grows within a run. It is 1 at the first question of a run that is not resumed from an automatic
  yield, and 3 or more in a run that is.
- 0244's rule against 0117's fibers on another's stack. A fiber that the resumed fiber starts inline at the step it
  resumes, unasked, is still taken for a nested one, since `step` names the resumed fiber as the one let run last.
- 0244's preemption at the second step against 0116. The wait of an entity no longer races its take, and
  `an entity whose wait runs out as an event arrives waits again from the event` still fails at seed 9 once the
  `Passivate` of an earlier wait is no longer passed over (`src/runtime/loop.ts:600`). `bun test` runs seed 9.
- 0110's count against the schedules that 0244 moved. With the count given back by an `ensuring` in the detached
  fiber, `a deploy interrupted anywhere keeps its name and its waker, or stops what it started` fails under `bun
  test`.
- The pinned seed 1031955209 of `src/runtime/loop.test.ts`, against 0244. Its comment says it was found at Effect
  4.1.3 under the scheduler of 0244.
- 0101 and 0066 against 0244. `run` of the test clock still waits for a fiber of its own that yields once, at 4.1.3.
  The tests move the clock with the window closed, so a run of `explored` goes in order there.
- 0112, 0172 and 0177 cite 0104 as the way their rules are tested, and rest on no rule of the scheduler that the
  area's notes changed.

### Suspects not checked

- The other interleavings found by a seed that is not pinned, among the explored tests, may have lost their margin as
  the lock did. Each would be checked as above: its rule taken out, and its failing seeds counted under
  `SCHEDULES=all`. This review checked 0063, 0067, 0110 and 0116 alone. `scripts/mutate.ts` gives the first pass of
  each rule, which says which rules `bun test` no longer holds.

### Not read whole

Every note of the table was read whole. 0068, 0109, 0112, 0172 and 0177 were read without all of their code, since
they cite the area's notes only for how their rules are tested.

## 2026-11-11: premise review of The project and what enters the library

The reviewer's report, on the branch `claude/premise-review-project-17a123`, cut from `main` at `a746214`. Three
findings are reproduced, each by a test named `FAILING:` on the branch, at commits `1c8da79`, `3ac56e3` and
`a18c520`. Two findings are gaps of a check, and are only reasoned.

### The notes read

| Note | Role | How it was read |
| --- | --- | --- |
| 0007 | of the area | whole |
| 0019 | of the area | whole, with `package.json` |
| 0052 | of the area | whole; it holds no code of its own |
| 0053 | of the area | whole, with `idFault` and `requestIdFault` of `src/program.ts` |
| 0054 | of the area | whole, with `checkProgram` of `src/program.ts` and each place that calls it |
| 0055 | of the area | whole, with the four entries |
| 0080 | of the area | whole, with `hold` of `src/storage/tables.ts` and `launchWith` of `src/runtime.ts` |
| 0099 | of the area | whole, with `package.json` |
| 0179 | of the area | whole, with `idFault`, and `due` and `entities` of `src/storage/entities.ts` |
| 0193 | of the area, and a later note against 0052, 0055, 0073, 0174 and 0192 | whole, with the four entries and the tests of `src/form.test.ts` |
| 0195 | of the area | whole, with `package.json` and the key of `Recorded` |
| 0196 | of the area | whole, with its test in `src/form.test.ts` |
| 0203 | of the area | whole, with its test, and a count of the guide's parts |
| 0204 | of the area | whole, with `requestIdFault`, `expire`, and `primaryKey` of `src/cluster.ts` |
| 0208 | of the area | whole, with `optionOf` and `launchWith` of `src/runtime.ts`, the loop's wait of `src/runtime/loop.ts`, and `sleepMillis` of Effect |
| 0212 | of the area | whole, with the imports of `src/fixtures.property.test.ts` |
| 0241 | of the area | whole, with `groupsCrossed`, `testsImported` and `ofTheTests` of `src/form.test.ts`, and the imports of `src/runtime/` and `src/storage/` |
| 0242 | of the area | whole, with `ci.yml`, the test of its form and the spike of the shards |
| 0073 | cited by 0193 | in part: its context and its decision |
| 0174 | cited by 0193 | whole, with `sharding` and `Recorded` of `src/cluster.ts` |
| 0192 | cited by 0193 | whole, with the test of `src/form.test.ts` it names |
| 0120 | changes 0080 | whole, with `launchWith` |
| 0191 | changes 0055, and cites 0080 | in part: its context, its decision and its first premise |
| 0084 | changes 0080 | in part: the lines that cite 0080 |
| 0081 | changes 0007 | in part: the lines that cite 0007 |
| 0157 | changes 0007, and cites 0019, 0080 and 0179 | in part: the lines that cite them |
| 0221 | cites 0208 | in part: its decision and the alternative that cites 0208 |
| 0185 | cites 0179 | in part: its decision and its premises |
| 0211 | cites 0212 | in part: its context and its decision |
| 0215 | cites 0080 | in part: the lines on the advisory lock |
| 0064 | changes 0054 | not at all; the status line of 0054 says what it changed, and `checkProgram` was read |
| 0132 | changes 0054 | not at all, for the same reason |
| 0136 | changes 0054 | not at all, for the same reason |
| 0141 | changes 0053 | not at all; the status line of 0053 says what it changed |
| 0207 | changes 0053 | not at all; the review of area 8 read it whole against 0053 |
| 0003 | cites 0195 | not at all |
| 0028 | cites 0007 and 0019 | not at all |
| 0030 | cites 0007 | not at all |
| 0038 | cites 0007 | not at all |
| 0039 | cites 0195 | not at all |
| 0057 | cites 0052 | not at all |
| 0075 | cites 0054 | not at all |
| 0104 | cites 0080 | not at all |
| 0125 | cites 0053 | not at all |
| 0138 | cites 0053 and 0054 | not at all |
| 0142 | cites 0053 and 0080 | not at all; the review of area 8 read it whole against 0080 |
| 0143 | cites 0053 | not at all |
| 0152 | cites 0053, 0054 and 0080 | not at all |
| 0153 | cites 0053 and 0080 | not at all |
| 0156 | cites 0080 | not at all; the rename at the launch was read in `launchWith` |
| 0176 | cites 0080 | not at all |
| 0198 | cites 0080 and 0195 | not at all |
| 0245 | cites 0053 and 0196 | not at all |
| 0247 | cites 0054 and 0080 | not at all |

### Findings

#### 1. A launch refused for an option still holds the database, and has already moved its renames

- **The notes.** [Decision 0208](0208-a-launch-checks-every-option.md) checks `retry`, `passivate` and `warn`. It
  says the launch then dies "before anything is held or stored, as for the other options". The hold of
  [decision 0080](archive/0080-a-database-is-held-by-one-runtime.md), the tables of
  [decision 0191](0191-a-launch-creates-the-tables.md) and the renames of
  [decision 0156](archive/0156-a-program-is-renamed-by-its-launch-and-keeps-its-keys.md) all run before those checks.
- **The premise that fell.** 0208 rests on the checks of the options running first in the launch. They never did
  for `drain`, `capacity`, `callers` and `sweep` either. Only the partitions, `tables` and the form of `renames` are
  checked before the hold.
- **The sequence.** A launcher calls `launch({ retry: { millis: NaN }, renames: { Toy: 'Plaything' } })` in a scope.
  It catches the defect, and launches again in the same scope. `launchWith` forks a scope from the caller's
  (`src/runtime.ts:923`), and holds the database in it (`src/runtime.ts:945`). It then creates the tables, records
  the partitions, and moves the entities of `Toy` to `Plaything` (`src/runtime.ts:946` to `950`). Only then does it check the retry
  (`src/runtime.ts:997` to `1009`), and die. The forked scope closes only with the caller's scope. So the second
  launch dies with "the database is held by another runtime, or open to another connection". The entities are
  already under `Plaything`. An operator who reads that the launch died before anything was stored may drop the
  rename from the next launch, and then finds no entity under `Toy`.
- **Reproduced** by `FAILING: a launch refused for its retry holds nothing and moves no rename, in the scope its
  launcher gave` in `src/runtime.test.ts`, commit `1c8da79`. It gets `moved: true` and the refusal of the second
  launch. The test of 0208 in `src/runtime/loop.test.ts` passes, since its helper `process` closes a scope around
  each launch.
- **Where a fix could begin.** `launchWith` reads and checks every option before `Scope.provide(hold, scope)`, as it
  does for the partitions. A second way: the launch closes its own scope when it dies after the hold.

#### 2. Under a passivation of no time, an entity whose operation runs spins its loop

- **The notes.** 0208 makes zero a value of `passivate`: "a passivation of no time unloads an entity as soon as it
  has nothing to do". The loop's wait of [decision 0116](archive/0116-an-entitys-wait-ends-with-an-item-of-its-queue.md)
  ends with an item of its queue, which the sleep of the passivation offers. The rule of
  [decision 0029](archive/0029-an-idle-entity-is-unloaded.md) keeps an entity with work under way loaded. Both rest
  on a wait that lasts.
- **The premise that fell.** The wait's sleep lasts the passivation. Effect's `sleepMillis` returns `yieldNow` for
  a time of 0 (`node_modules/effect/src/internal/effect.ts:6418`). So under a passivation of 0 the wait ends at once.
- **The sequence.** An entity has an operation under way, so `nothingToDo` is false (`src/runtime/loop.ts:436`).
  The wait's sleep yields and offers `Passivate` (`src/runtime/loop.ts:593` to `597`). The loop takes it and calls
  `unload`, which takes the entity's lock and refuses. The loop then waits again (`src/runtime/loop.ts:623`). This
  repeats for as long as the operation runs. An operation of hours keeps one fiber busy for hours, and a process of
  many such entities keeps the processor busy.
- **Reproduced** by `FAILING: under a passivation of no time, an entity whose operation runs waits without
  spinning` in `src/runtime/loop.test.ts`, commit `3ac56e3`. Over a real wait of one second, the process used some
  1 200 ms of the processor under a passivation of 0, in each of three runs. Under one of 5 ms it used under 400 ms.
  The test runs some 2.5 s, past the budget of `AGENTS.md`, since it measures time that is real.
- **Where a fix could begin.** The loop's wait starts no sleep while `nothingToDo` is false, and waits on the queue
  alone. A second way: the launch refuses a passivation of 0. It belongs to family F of the step of bugs, beside
  bugs 17 and 32.

#### 3. `bun test` runs a file of the tests whose role ends in `_test` or `_spec`

- **The note.** [Decision 0241](0241-a-group-of-modules-lies-in-a-folder-entered-by-the-module-of-its-name.md) says
  that `bun test` runs no file named `<module>.test_<role>.ts`, "since its name does not end in `.test.ts`".
  `ofTheTests` of `src/form.test.ts` reads every such name as a file of the tests, whatever its role.
- **The premise that fell.** Bun runs a file whose name ends in `_test` or `_spec` too. The note's experiment tried
  the role `x` alone.
- **The sequence.** A file only tests import, named `src/loop.test_spec.ts`, is run by `bun test` as a file of tests.
  Its top-level code and its hooks then run in a file of their own, as the `beforeAll` of
  `src/storage.test_databases.ts` would. The checks of the form pass on it.
- **Reproduced** at Bun 1.4.4 by `FAILING: bun test runs no file that ofTheTests reads as a file only tests import`
  in `src/form.test.ts`, commit `a18c520`. Bun ran `a.test_spec.ts` and `a.test_test.ts`. No file of the repository
  has such a role today.
- **Where a fix could begin.** `ofTheTests` refuses a role that ends in `test` or `spec`, or `AGENTS.md` names the
  roles allowed.

#### 4. The test of the workflow's form passes on a job of the tests that runs nothing, or whose failure is ignored

- **The note.** [Decision 0242](0242-the-ci-deals-the-files-of-the-tests-among-four-jobs.md) says that a test of the
  workflow's form keeps every test in some job.
- **The sequence.** The test `the jobs of the tests run every shard of their division, and the job of the other
  checks runs no test` reads only the matrix's `shard` and the steps' `run`, in `divided` of `src/form.test.ts`. A
  job `test` given `if: false`, given `continue-on-error: true`, or given a matrix with an `exclude` of one shard
  passes it. Every file of the shard left out is then run by no job, or fails while the workflow is green.
- **Only reasoned**, by a reading of `divided`. The test reads `ci.yml` itself, so no case can be given to it
  without changing the workflow.
- **Where a fix could begin.** `divided` refuses `if`, `continue-on-error` and `exclude` on a job of the tests. The
  `if` of the release's job on `workflow_dispatch` is the one exception.

#### 5. The property of 0212 runs on PGlite alone, and the job on PostgreSQL does not run it

- **The notes.** [Decision 0212](0212-the-property-tests-of-the-fixtures-derive-their-values-from-the-schemas.md)
  checks that the runtime "on SQLite and on PostgreSQL" answers as the rehearsal does. The later
  [decision 0222](0222-postgresql-with-many-connections.md) found that PGlite hides what a server does: the first run
  on a server found every `BIGINT` given back as a bigint. Its job, `bun run test:postgres`, lists its files by name.
  `src/fixtures.property.test.ts` is not among them, nor are the cases of `src/cluster.test.ts` on `pg`.
- **The premise that fell.** 0212 rests on its PostgreSQL being the one a deployment runs on. Since 0222, the
  property's PostgreSQL is PGlite alone, and the values `Arbitrary.schema` derives never reach a server.
- **Only reasoned**, by a reading of `package.json` and `ci.yml`. No server ran here. No check says that a file of
  tests that runs on `pg` is among the files of `test:postgres`.
- **Where a fix could begin.** `test:postgres` runs every file that imports `src/storage.test_databases.ts`, or a
  test of the form checks its list.

### Suspects ruled out

- 0208 at its upper end, a time past 2^31 ms. Effect's `sleepMillis` chains sleeps of at most 2^31 − 1 ms
  (`node_modules/effect/src/internal/effect.ts:6421`), so a long retry or passivation is slept whole.
- 0208's `warn` of 0. It warns of every write, once per activation, and changes no step.
- 0179's premise that no entity holds the id `''`, against Cluster. Every id enters by a handle, by `Entities` or by
  a world, and Cluster's door is reached only through a handle's client.
- 0179's paging from `''` under a collation of PostgreSQL. A deterministic collation breaks ties by bytes, so every
  id that is not empty is past `''`.
- 0204's empty request id on Cluster. Cluster keys a caller's request by `${version}/${request}`, where `request` is
  the JSON of the whole request (`src/cluster.ts:129`), which is never empty.
- 0204's premise that nothing pages by a request id. `expire` deletes the request ids of `effecttea_given_requests`
  in batches with a `LIMIT`, and keeps no cursor (`src/storage/entities.ts:463`).
- 0054's refusal of a key declared twice, against the list of keys of 0197. `keysOf` refuses a name listed twice
  (`src/program.ts:1634`).
- 0054's check where a program enters, against `sharding` of 0174, which records each program's name and version
  before any check. A name that `checkProgram` refuses leaves one row in `runner_versions`. The deploy then dies on
  the check, and no newer version of that name outranks the runner. So only a row is left.
- 0193's `Recorded`, exported as a type alone. A launcher could still provide the `Recorded` of `sharding` beside a
  `Sharding` of its own, or a service under the same key. Both need a deliberate override or a cast, which the types
  do not hold.
- 0193's `Probe`, kept out of the entries, against 0073. A `Context.Reference` is found by its key, so a user who
  writes the key could provide a probe. It needs the key, which no document gives.
- 0193's test that `src/index.ts` reaches no module of Cluster. It reads only `src/`, but no module of `src/` other
  than `src/cluster.ts` imports a package outside `effect/`.
- 0241's rule that a module of a group imports its entry for types alone. `src/runtime/` imports `../runtime.ts`
  only by `import type`, and `src/storage/` never imports `../storage.ts`.
- 0203's premise that a part found in an example is run by a test. Every file of `examples/` is imported by a test,
  and `examples/server/main.ts` is spawned by `examples/server/server.test.ts`.
- 0203's parts of one line. Six of the 85 parts of the guide are punctuation alone, as `})`, and are found in any
  file. A part of punctuation cannot show a change of the API.
- 0080's hold on PostgreSQL, lost with its session while the runtime runs. It is an open question already, seen by
  `spikes/postgres-session-ended.test.ts`.

### Noticed, not checked

- **0212's list of fixtures.** `src/fixtures.property.test.ts` imports the three fixtures by name. 0212 says that a
  fixture added to `src/fixtures/` is added to the property, and nothing checks it. So a fourth fixture would pass
  with no property. Nothing loses data, so no test was written.
- **0208's other options.** Finding 1 was reproduced with `retry`. A reading of `src/runtime.ts:981` to `1023` shows
  `drain`, `capacity`, `callers` and `sweep` checked after the hold too. No test of them ran in a shared scope.

### Not read whole

The notes that only cite a note of the area were not read, or were read only at the lines that cite it, as the
table says. Each cites the area's note for a rule it applies as written: a database held by one runtime, an id
checked, a program checked where it enters, or the package's name. 0064, 0132, 0136 and 0141 change a note of the
area, and were not read, since the status lines of 0053 and 0054 say what each changed, and the code that keeps it
was read. Every note of the area itself was read whole, with its code, and so was 0193 against the notes it cites.

## 2026-11-11: premise review of the pairs the first session read in part

The notes are 0039, 0137, 0152, 0029, 0068, 0076, 0078, 0151, 0159, 0174, 0175, 0161 to 0163, 0172 and 0021, each
read whole with its code against the later notes 0245, 0176, 0219, 0247, 0092 and 0222 where it meets them. The two
failing tests are on the branch `claude/premise-pairs-first-ee0216`, commit `dd63071`, cut from `main` at `e6d3808`,
in `src/cluster.test.ts`, describe `two runners on one file`. Run: `bun test src/cluster.test.ts -t "FAILING"`.

### The pairs

A pair was found by the index and by `grep -wE` of each note in both directions. Five notes of the list meet none of
the six later notes by a citation: 0137, 0068, 0174, 0163 and 0021. Each was paired by the rule it shares with one
of them, as the table says, and read whole all the same.

| Earlier note | Later note | What binds them | How it was read |
| --- | --- | --- | --- |
| 0039 | 0245 | 0245 cites it as its reason: a batch of `prune` reads the cursors in its transaction | both whole, with `pruneBatch`, `ack`, `forget` and `declare` of `src/storage/log.ts` |
| 0152 | 0245 | 0245 applies its prune of a topic no consumer holds, now at the sweep's interval | both whole, with the same code and `deploy` of `src/runtime.ts` |
| 0137 | 0245, 0222 | no citation: the batches read the outbox by `position` across partitions, and 0222 runs two writers of a partition | 0137 whole; 0245 and 0222 whole; `pruneBatch` and the draw of the head in `src/storage/entities.ts` |
| 0021 | 0245 | no citation: 0245 changes 0125, which changes 0021, and `expire` deletes replies by time | both whole, with `expire` and the deletions of a step in `src/storage/entities.ts`, and `until` in `src/machine.ts:1152` |
| 0029 | 0092 | 0092 changes it on Cluster: a door steps outside the loop's queue | both whole, with `register` of `src/cluster.ts` and the loop's wait in `src/runtime/loop.ts` |
| 0076 | 0092 | 0092 changes it: the capacity stays the runtime's, and Cluster's bound is left unbounded | both whole, with the option `capacity` of `src/runtime.ts` and `sharding` of `src/cluster.ts` |
| 0078 | 0092 | 0092 changes it: what is spare stays the runtime's | both whole, with the same code |
| 0092 | 0151 | 0151 cites 0092 as its reason: on Cluster `maxResidentEntities` is left unbounded | both whole, with `sharding` of `src/cluster.ts`, and `maxResidentEntities` in `Sharding.ts` and `ShardingConfig.ts` of Effect |
| 0068 | 0092 | no citation: 0092 adds a second fiber that steps an entity, the door's | both whole, with `leave` and `forkHeld` |
| 0092 | 0159, 0161, 0162, 0172, 0175 | each cites 0092 and says how one of its rules holds | 0092 and each later note whole; `doorStep`, `serving` and `activating` of `src/runtime/doors.ts`, and the drain and the deployments' scopes of `src/runtime.ts` |
| 0159 | 0176 | 0176 changes it: a renamed name is outranked as an older version is | both whole, with `register` of `src/cluster.ts` and the renames of `launchWith` |
| 0175 | 0176 | 0176 changes it: the check of every step refuses a renamed name | both whole, with the same code |
| 0174 | 0176 | no citation: 0176 registers a door under each former name, which no `sharding` names | both whole, with `sharding` and `register` of `src/cluster.ts` |
| 0159 | 0247 | 0247 cites it as its reason: the check launches nothing, since a launch outranks the older runners | both whole, with `src/check.ts` read for what it writes |
| 0175 | 0219 | 0219 cites it as its reason: a completion committed in the drain passes the lease check | both whole, with the drain of `src/runtime.ts:1398` and the scopes of the deployments |
| 0163 | 0222 | no citation: 0222 runs a pool, where a runner's readings no longer go through one connection | both whole, with `others` of `src/cluster.ts` |

### Finding 1, reproduced: 0151 against 0092, Cluster's bound of resident entities

- The premise that fell: 0092 leaves Cluster's `maxResidentEntities` unbounded. A door outlives the runtime's entity
  by up to `maxIdleTime` and the reaper's period, so a bound of Cluster's would refuse entities the runtime has room
  for. 0151 rests on it, and says that on Cluster the runtime's capacity is the only bound. No code makes it so.
  `sharding` of `src/cluster.ts:85` builds `Sharding.layer` on the launcher's `ShardingConfig` as given. Its default
  is 10 000 (`ShardingConfig.ts:251` of Effect), counted over every entity type of the runner (`Sharding.ts:817-835`).
  `ShardingConfig.layerFromEnv`, which `examples/server/main.ts:33` uses, reads `maxResidentEntities` as an integer
  above 0 (`ShardingConfig.ts:375`), so it cannot give `'unbounded'`. The guide and `docs/cluster.md` say that the
  bound is left unbounded, and do not tell the launcher to set it.
- The sequence: a runner holds as many doors as its bound, each idle and not yet reaped. The runtime holds the same
  entities, far below its own capacity. A caller's creation of another entity reaches its door, and Cluster cannot
  spawn the door: `entityManager.ts:254-257` fails with `MailboxFull`, and a persisted message waits in storage
  until a slot frees. Only the reaper frees one, once a door is idle for `maxIdleTime`, the runtime's passivation, 30
  s by default, checked every 5 to 30 s. So a burst of callers to more than 10 000 entities within one passivation
  waits up to a minute past the bound, on every runner, and so do `Resumed` and an operation's sends.
- Reproduced by `FAILING: a runner whose ShardingConfig keeps Cluster's bound of resident entities answers a caller
  past it`, commit `dd63071`. A bound of 2 stands for the default of 10 000, under a passivation of 20 s. Two
  creations are answered, and the third is not answered within 5 s. With `maxResidentEntities: 'unbounded'` the same
  test passes, and the third is answered at once. No message is lost: the request is answered once a door is reaped.
- Where a fix could begin: `sharding` of `src/cluster.ts`, which could give `Sharding.layer` the launcher's
  `ShardingConfig` with `maxResidentEntities: 'unbounded'`. Or `launch` could die where the config holds a bound. It
  is of family C of the step of bugs: a rule of one process that holds otherwise on Cluster.

### Finding 2, reproduced: a consequence of bug 23, a prune that drops rows a stored consumer has not read

- Bug 23 records that an older runner's ack after a newer runner's forget leaves a cursor with no consumer, and that
  the partition is then never pruned again. That holds where the stored consumer has a cursor in the partition.
  Where it has none, the prune drops rows that the stored consumer has not read. The rule that falls is 0039's: the
  runtime never drops a row a stored consumer has not read. With it falls 0137's: a consumer with no cursor in a
  partition holds the partition from `0`. `pruneBatch` of `src/storage/log.ts:237-241` reads 0137's rule as a count of
  the partition's cursors equal to the count of the topic's consumers, and takes the lowest cursor as the floor. A
  cursor whose consumer is not stored then stands for a stored consumer that has none. 0245's sweep runs the prune
  at its interval, with no operator who could read `consumers` first, and `consumers` shows nothing wrong anyway.
- The sequence: the older runner deploys `Toy` with `queue` and `audit`, and creates `one`. Its reader of `queue`
  fetches the row. A newer version launches with `audit` alone, and its operator forgets `queue`. The older reader
  acks its page, which writes a cursor of `queue` with no consumer (`src/storage/log.ts:208`). `audit` has read
  nothing, and `consumers` says that it is one row behind. The prune counts one cursor and one consumer in the
  partition, and drops the row through the cursor of `queue`. The next fetch of `audit` is empty, and `audit` never
  learns of the row.
- Reproduced by `FAILING: an ack of an older runner after a forget drops no row the stored consumer has not read`,
  commit `dd63071`. The prune gives 1 where 0 is expected. Without the older runner's ack the test passes.
- Where a fix could begin: as for bug 23. `ack` of `src/storage/log.ts` could write a cursor only where its consumer
  is stored, or `pruneBatch` could count the cursors of stored consumers alone. The second fix holds this case
  whatever writes the cursor, and the first only while no other path writes a cursor without its consumer. Bug 23's
  test and this one hold the two halves together.

### Suspects ruled out

- 0039 against 0245's batches: each batch reads the consumers and the cursors again, a cursor only rises, and a
  consumer is stored only by a deploy. So a later batch drops nothing that an earlier batch's reading still held.
- 0152 against 0245's sweep, for a consumer declared by a later deploy: the topic is pruned whole until the deploy
  stores the consumer. 0245 says so, and asks for the consumer before the topic's first step.
- 0137 against 0245, for batches read by `position` across partitions: the `LIMIT` applies to the rows that may go,
  selected first. So a batch that fills is followed by another, and a batch with fewer rows ends only when none is
  left.
- 0137 against 0222, for the order of a partition under two writers: the head's row is locked by its `UPSERT` until
  the commit, so the second writer draws its `seq` and its `position` after the first commits. 0222 tests it.
- 0021 against 0245's `expire`: a reply to an entity is written with `until` null (`src/machine.ts:1152`), since an
  operation's send takes no `keep`. `expire` and a step delete only replies with a time. So a reply to an entity
  still goes only with its sender's work.
- 0029 against 0092, an entity unloaded under a door: a door's step takes the entity's lock inside its transaction,
  and the unload takes the same lock. A door's step that writes nothing offers no `Settle`, so it does not restart
  the passivation's wait. That costs a load at the next request, and loses nothing.
- 0076 and 0078 against 0092: an entity with a door's machine not settled is not spare (0161), and the door's
  `maxIdleTime` is the runtime's passivation (`src/cluster.ts:440`). The capacity unloads only the runtime's entity,
  and its door loads the entity again.
- 0068 against 0092's second fiber: the finalizer of a shard lost marks the shard and reads the entities held in one
  step, and the door checks the mark again as the entity enters (0162).
- 0162's deployments' scopes against 0219's drain: each deployment's scope is forked from `running`, which closes
  after the drain (`src/runtime.ts:951-953` and `:1099`). So no singleton lets its shard go before the drain ends.
- 0175 against 0219: Cluster keeps refreshing the lease while the runtime's scope drains, so a completion stepped in
  the drain passes `guard`. A rolling deploy, a door's step during the drain and a parallel scope are bugs 2, 21, 34
  and 35.
- 0159, 0174 and 0175 against 0176: a door of a former name steps the entity under the new name, whose version and
  mark `guard` reads. A rename and an older runner's step serialize on SQLite's write lock, and the older runner's
  steps after the rename die. The cases left are bugs 16, 27, 29 and 30.
- 0159 against 0247: `check` records no version, so the older runners keep their shards. `check` does not refuse a
  program older than the newest recorded, but a row of a newer version fails its reading as `Load`, so the row is
  not given as checked.
- 0163 against 0222: the runtime on Cluster runs on SQLite alone (0084), and the case of PostgreSQL is bug 39.
  Another runner's sweep moves `data_version` too, which wakes a reading once more and loses nothing.
- 0172 and 0161 against 0092: both rest on one connection per runner, which holds on SQLite. A pool would break it,
  and both notes say that the rule is read again with PostgreSQL.

### Noticed, not checked

- Finding 1 under a passivation of 0: the door's `maxIdleTime` is then 0, and Cluster's reaper still checks at most
  every 5 s. A door may then outlive the runtime's entity by those 5 s, so that a burst meets the bound sooner. It
  was not run, since finding 1 holds without it.

### Not read whole

Every note of the list was read whole with its code, and so were the six later notes. `src/check.ts` was read only
for what it writes, and `examples/server` only at its `ShardingConfig`.

## 2026-11-11: premise review of the pairs the third and fourth sessions read in part

The reviewer's report, whole, as its session wrote it. Branch `claude/premise-pairs-early-b0bea3`, cut from `main`
at `e6d3808`. No test was written: the one finding is only reasoned, by a reading of the code.

### The pairs

Each pair was read with both notes whole, the earlier note's `What it rests on` where it has one, and the code
that keeps the rule. The pairs were found by the index and by `grep -w` of each note in both directions.

| Later note | Earlier note | What binds them | Read |
| --- | --- | --- | --- |
| 0058 | 0018 | changes: work is compared by its JSON, not by `Equal.equals` | both whole, with `isSame`, `renew` and `reconcile` of `src/machine.ts` and `start` of `src/runtime/loop.ts` |
| 0067 | 0056 | changes: the permit becomes a lock per entity | both whole, with `holding` of `src/runtime/process.ts` and `crash` of `src/runtime/loop.ts` |
| 0067 | 0042 | changes: the same | both whole, with the same code |
| 0090 | 0005 | cites as its reason: nothing sends under a key once its work ended | both whole, with `keepSent` and `pendSent` of `src/storage/cluster.ts` and the table `effecttea_sent_requests` |
| 0133 | 0005 | applies as: a child that leaves with an operation under way is a defect | both whole, with `reconcile` and `renew` |
| 0133 | 0041 | cites as its reason: a child that asks to leave leaves its work first | both whole |
| 0113 | 0011 | changes a premise: an at-most-once operation found stored ran in a process that died | both whole, with `activate` of `src/machine.ts` and `perform` of `src/runtime/loop.ts` |
| 0178 | 0011 | cites as its reason: a charge asked again after a crash carries the same key | both whole |
| 0147 | 0046 | changes: a sender to a full receiver sends again after `retry` | both whole, with `entities` and `unlessCrashed` of `src/runtime/callers.ts` |
| 0147 | 0130 | cites: the attempts against a full receiver are not counted by the state | both whole |
| 0035 | 0018 | applies: a runner is built as 0018 says, through the constructor | both whole |
| 0035 | 0034 | applies: the runners say what each operation answers | both whole |
| 0049 | 0046 | applies as: an operation that creates with flags that do not encode is suspended | both whole, with `create` of `src/runtime/callers.ts`, `doorStep` of `src/runtime/doors.ts` and `deliveredCreation` of `src/storage/entities.ts` |
| 0049 | 0012 | changes: flags are encoded through their schema | both whole, with the same code |
| 0180 | 0129 | applies: the default of `Operations` keeps the bound of a droppable runner | both whole |
| 0038 | 0012 | applies: a creation publishes its first projection with no message | both whole |
| 0053 | 0049 | applies as: a value a handle is given is the caller's defect, as flags are | both whole |
| 0079 | 0042 | keeps: an interruption is the process's crash | both whole, with `create` of `src/runtime/callers.ts` |
| 0130 | 0006 | applies: a runner that dies suspends its entity | both whole, with `faulted` and `unlessCrashed` of `src/runtime/callers.ts` |
| 0130 | 0061 | cites as its reason: a run of failures is no defect | both whole |
| 0206 | 0006 | changes a crash into a suspension | both whole |
| 0206 | 0042 | cites: a write that fails crashes its entity | both whole, with `src/storage/tables.ts` on U+0000 |
| 0062 | 0061 | applies: a row a schema refuses is the runtime's failure | both whole |
| 0109 | 0042 | cites: a crash stops its work in a fork that `settled` does not wait for | both whole |
| 0175 | 0042 | applies as: a step that `guard` refuses crashes its entity | both whole |
| 0166 | 0114 | applies on Cluster: what a resume or a discard did, each event a request | both whole |
| 0177 | 0114 | cites as its reason: the list of waiting senders stays | both whole |
| 0186 | 0185 | cites: a reading of nothing gives null | both whole |

### Finding 1, only reasoned: on Cluster, a creation's flags written by an older version are read by a newer one with no migration

- **The notes.** [Decision 0049](archive/0049-flags-are-checked-by-their-schema.md) checks the flags by their schema,
  and does not store them, since nothing reads them after `init`. So no migration of
  [decision 0036](archive/0036-a-migration-is-a-function-on-the-json.md) reads flags. On Cluster a creation goes
  through the door's client, a caller's and an operation's alike
  ([decisions 0165](archive/0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md),
  [0167](archive/0167-on-cluster-an-operation-sends-through-the-doors-client-and-is-woken-by-resumed.md)). Cluster
  keeps the JSON of the flags in its table until a door handles the request. That door may be of a newer version
  ([decision 0159](archive/0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md)).
- **The premise that fell.** The flags are read by the version that wrote them. It holds on one process, where a
  creation is handled in the process that encoded it. It does not hold on Cluster during a rolling deploy.
- **The sequence.** A runner of version 1 encodes flags `{ seats: 2 }` and sends the creation through the door's
  client (`src/runtime/callers.ts:205` to `226`). The shard is held by a runner of version 2, whose schema of the
  flags is `{ count }`. The door reads the creation with `deliveredCreation` (`src/storage/entities.ts:585` to
  `590`). It migrates the request by its version, with `upRequest(version)`, and reads the flags with the newer
  schema alone, with `flags.read(written)`. An inbound message is migrated at the same place, by
  `up('inbound', version)` at line 579. The read of the flags fails, `Effect.orDie` makes the door's step die, and
  Cluster delivers the creation again without end, as in bug 10. A schema of the flags that reads the older JSON
  with another meaning gives `init` that meaning, with no error.
- **Only reasoned**, by the reading above. No test runs on Cluster two versions of a program whose flags differ.
- **Where a fix could begin.** `deliveredCreation` reads the flags through a migration by the request's version,
  which a program would declare for its flags. Otherwise the step What a deploy may change of a program, which lists
  the flags, says that a deploy on Cluster may not change their schema while a creation waits. It belongs to
  family A.

### Suspects ruled out

- 0058 against 0018: an operation's runner is first given the value `durable` built, and after a crash the value
  decoded from the store. The two differ only in what the schema does not encode, which the runner's type does not
  let it read.
- 0058 against 0018, across a deploy: both sides are written by the newer schema. So a migration that keeps the
  operation keeps its incarnation and its idempotency key.
- 0067 against 0056 and 0042: a crash still forks the interruption, under the entity's lock, and an unload still
  stops only timers. The old fiber's completion goes to the old `Loaded` (`src/runtime/loop.ts:240`). That the fiber
  may still act beside `unknown` is bug 31.
- 0090 against 0005: an operation still stopping after a crash of its entity may send after its work ended. Its
  request is then answered after the work ended, and `keepSent` leaves its id pending
  (`src/storage/cluster.ts:197` to `223`), as 0090 decides. An incarnation is never held again, so the check by key
  and incarnation stays right. A droppable operation sends nothing (0129).
- 0133 against 0005: a child removed and added again in one step keeps only work that encodes alike, which is the
  same work. A child that comes back in a later step has keys of new incarnations.
- 0133 against 0041: a child dropped with an operation under way is a defect of `reconcile`'s kind, as 0005 says.
- 0113 against 0011: an at-most-once operation that dies, or whose completion does not encode, while its entity is
  suspended leaves `running`. The resumption then delivers its `unknown`, which is right, since it ran.
- 0113 against 0011, with a crash of the entity while it is suspended: the reload keeps no operation, so the resume
  delivers `unknown` beside a fiber still stopping. It is bug 31. The same on Cluster after a move of the shard is
  of bug 2's family.
- 0178 against 0011: the idempotency key is drawn from what is stored, by `givenKey`, so the runner that takes the
  shard asks for the charge again under the same key. A runner frozen past its lease may run an at-most-once
  operation beside the other runner's `unknown`, which `unknown` allows.
- 0147 against 0046: `Full` stores nothing, so a retry under the same request is a new try, and the operation sees
  one reply. Under a `retry` of 0 it spins, which is bug 32.
- 0147 against 0130: the attempts against a full receiver never reach the program.
- 0035 against 0018 and 0034: the constructor changes the types alone. A `Program<T>` written by hand has runners
  widened to the internal union, as 0034 already says.
- 0049 against 0046: flags that do not encode are refused on the sender's side before the path of Cluster
  (`src/runtime/callers.ts:205` to `212`). So the operation dies and its entity suspends, on one process and on
  Cluster.
- 0180 against 0129: the default of `Operations` keeps the bound, as the test of 0180 on `Rates` shows. The sender of
  `null` is bug 4.
- 0038 against 0012: a creation `init` rejects and a creation answered `AlreadyExists` write no step, so they publish
  nothing.
- 0053 against 0049: it only applies the caller's defect to other values.
- 0079 against 0042: a detached creation whose `perform` dies crashes its entity under the lock it holds. The work it
  leaves stored, with no loop, is of family E, as bug 18.
- 0130 against 0006 and 0061: a `Faulted` reaches a runner only for the sender's own defect, and `unlessCrashed`
  turns a receiver's crash into a retry. So no failure of the runtime suspends a sender.
- 0206 against 0042: the other values a step writes are written as text, and PostgreSQL never parses a string that
  holds U+0000 (`src/storage/tables.ts:365` and `569`, decision 0157). So no other value crashes an entity the way an
  index did.
- 0062 against 0061: a row a schema refuses crashes its entity at every activation, as 0062 says. The waker tries it
  again (decision 0077), and family E holds the rest.
- 0109 against 0042: that `settled` does not wait for a crashed entity's work is the rule of 0056, unchanged.
- 0175 against 0042: an entity a step that `guard` refuses crashes is loaded again only by the shard's round. That a
  renewed lease never runs that round again is bug 14.
- 0166 against 0114: a persisted `Discard` and the runtime's rows commit in one transaction under `WithTransaction`,
  so a delivery again never applies it twice. Two operators at once is a race that 0114 accepts. Its rows are bug 11.
- 0177 against 0114: the list of waiting senders stays as 0114 decides.
- 0186 against 0185: it borrows only the convention of null.

### Noticed, not checked

- Finding 1 for an operation's creation: the operation that waits for the creation is not suspended, and
  `suspended` lists nothing, as bug 10 says of a creation `init` dies on. It was not checked apart, since the
  sequence is bug 10's once the door dies.

### Not read whole

None. Every note of the brief's list was read whole with its code, against the notes of the sections Operations and
timers, Creation and Defects that it meets.

## 2026-11-11: premise review of the pairs against Messages, requests and replies, a first part

The reviewer's report, as its session wrote it. Branch `claude/premise-pairs-messages-1-dcd7d8`, cut from `main` at
`e6d3808`. It read 0008, 0011, 0013, 0014, 0020, 0022, 0027, 0028, 0036, 0038, 0040, 0045, 0049, 0053, 0075, 0085,
0090 and 0092 against the notes of area 1 they meet. It has one finding, only reasoned, by a reading of the runtime
and of Cluster's source at `effect` 4.1.3. No test was written for it, and no file of `src/` changed.

### The pairs read

The pairs were found by the area's report, the index, and `grep -w` of each note in both directions. 0075 cites no
note of the area, and no note of the area cites it. It is paired with 0245 because the area's report ruled out a
suspect of 0245 on it.

| Later note | Earlier note | What binds them | How it was read |
| --- | --- | --- | --- |
| 0008 | 0004 | 0008 cites 0004 as its reason: a new attempt is a new incarnation, so a new idempotency key | both whole, with the code (`renew`, and the step's `previous` without the handled key, in `src/machine.ts`) |
| 0014 | 0004 | 0014 cites 0004 as its reason: an internal message `update` rejects is a defect | both whole, with the code (`renew`) |
| 0020 | 0009 | 0020 cites 0009 as its reason: a key back in its old incarnation is answered from a stored reply | both whole, with the code (`renew`) |
| 0021 | 0020 | 0021 cites 0020 as its reason: an activation never brings a key back in the same incarnation | both whole, with the code (`write` in `src/storage/entities.ts`) |
| 0022 | 0015 | 0022 changes 0015's consequence on a rename | both whole, with the code (the sender's columns of `effecttea_replies`); the rename itself is 0156's |
| 0023 | 0014 | 0023 changes what 0014 answers a caller of a suspended entity | both whole, with the code (the door's `Message` step in `src/runtime/doors.ts`) |
| 0028 | 0010 | 0028 applies 0010's wait of `send` as retries | both whole; the retries are replaced by 0063 |
| 0038 | 0009 | 0038 cites 0009 for what `send` reaches | both whole; 0038 applies no rule of 0009 |
| 0045 | 0010 | 0045 waits for a program not deployed "as it waits for a suspended receiver" | both whole, with the code (`send` and `create` in `src/runtime/callers.ts`) |
| 0048 | 0027 | 0048 stores a caller's request under the sender 0027 writes | both whole, with the code (the encoding of the sender in `callers.ts`) |
| 0048 | 0036 | 0048 reads a stored request through the migration of the sender | both whole, with 0069's key of a reply's row |
| 0048 | 0040 | 0048 makes a sender that does not encode the caller's defect, as 0040 does a message | both whole, with the code (`callers.ts`) |
| 0049 | 0124 | 0124 cites 0049 as the rule it follows, and 0049's status line names 0124 | both whole, with the code (`create` in `callers.ts`) |
| 0060 | 0011 | 0060 cites 0011 as its reason: only an idempotent runner was given its key | both whole, with the code (`create`, `send`, and the deletion of a reply stored for ended work in `write`) |
| 0065 | 0013 | 0065 changes 0013: the machine holds no replies | both whole, with the code (the readings at `src/runtime/loop.ts:389` and `src/runtime/doors.ts:350`) |
| 0124 | 0014 | 0124 decides what 0014 left open of a defect at creation | both whole, with the code (`create` in `callers.ts`) |
| 0125 | 0053 | 0125 checks `keep` as 0053 checks a cursor | both whole, with the code (`kept` in `src/runtime.ts`, `until` at `src/machine.ts:1152`) |
| 0245 | 0053 | 0245 checks `keep` and `sweep` as 0053 does | both whole, with the code (`kept`, the check of `sweep` in `launch`) |
| 0245 | 0075 | the area's report rules out a suspect of 0245's sweep on 0075 | both whole, with the code (`deploying` and `sweepOf` in `src/runtime.ts`) |
| 0085 | 0015, 0021, 0023, 0048, 0059, 0065, 0069 | 0085 applies each on Cluster, "as on one process" | 0085 and each note whole, with the code (the door's steps, and `send` and `create` in `src/cluster.ts`) |
| 0125 | 0085 | 0125 cites 0085 for Cluster's rows of a caller's request | both whole |
| 0090 | 0021 | 0090 changes 0021's consequence on Cluster | both whole, with the code (`written.ended` and `forgetSent` in `write`) |
| 0125 | 0090 | 0125 cites 0090 as the deletion to follow | both whole |
| 0092 | 0023 | 0092 cites 0023 for a suspension met on the way to a message | both whole, with the code (the loop of `Handle` in the door's `Message` step) |
| 0092 | 0021, through 0090 | 0092 changes 0090, whose premise that nothing sends under a key once its work ended keeps 0021's rule | both whole, with the code (`send` in `src/cluster.ts`, and `sendOutgoing` in `node_modules/effect/src/cluster/Sharding.ts`) |

### Finding 1, only reasoned: 0092 against 0021 and 0090, a runner that lost its lease sends under work the next holder ended

- The premise that fell: 0021 deletes a reply to another entity once the work that asked no longer holds, because
  no one asks for the reply again. 0090 writes the premise down for Cluster, in its Context: nothing sends under a
  key once its work ended, since an operation's fiber is done before the step that ends its work, or died with its
  process. 0092 adds a second actor. A runner that loses its lease without giving it up, frozen past its expiration,
  may still run the entity's operations while the next holder runs them again (0092, Consequences). 0092 says that
  their steps commit nothing, and that their effects on the world may run on both, as an at-least-once operation
  allows. It does not say that a send to another entity is such an effect. 0060 promises the opposite: an operation
  that talks only to entities runs at least once and acts exactly once.
- The sequence, on Cluster. Runner A runs an at-least-once operation of entity S under key `k`, incarnation 3. The
  operation will send `Hold` to entity R under the name `hold`. Before it sends, A freezes past the lease's 35 s.
  Runner B takes S's shard, activates S, and runs the operation again under the same key and incarnation. B's run
  sends `Hold`. R applies it and stores the reply. B's run completes. B's step that delivers the completion ends the
  work. It deletes R's reply by the sender's columns (`src/storage/entities.ts:379-386`), and Cluster's rows of the
  request by `forgetSent` (`src/storage/entities.ts:390-395`, decision 0169). A wakes before its next refresh of the
  lease, which comes up to `shardLockRefreshInterval` later. A's operation sends `Hold` under the same request.
- Nothing checks the sender's work or its lease before the send. `send` of the door's client goes straight to
  `sharding.makeClient` (`src/cluster.ts:470-494`). Cluster saves a persisted request from any runner, and routes it
  by the receiver's shard alone (`sendOutgoing`, `node_modules/effect/src/cluster/Sharding.ts:1321-1380`). Cluster's
  rows of the request are gone, so the request is new to Cluster. R's holder steps it in R's door. The door keeps the
  Cluster id, which goes pending because the work ended. The door reads no reply under the request
  (`src/runtime/doors.ts:350`), since B's step deleted it. So the machine applies the message a second time
  (`src/machine.ts:897-914`). R holds the seats twice, and nothing fails. A's own step later fails the lease check,
  but R's step committed on R's holder.
- What it is not: Cluster's issue #10058, which `docs/cluster.md` describes, is about a stale runner's writes for
  its own shard. Here the stale write is a request to another shard, whose holder handles it legitimately. A fence of
  Cluster's on the sender's shard would not stop it, unless the fence covers sends too.
- Reproduced: no. A test needs two runners on one file, and a runner that keeps an operation running after another
  runner took its shard without the shard's finalizer running. The helpers of `src/cluster.test.ts` overwrite a lease
  and slow its refresh. But a second runner then takes the shard by Cluster's assignment, which the first runner sees
  within `refreshAssignmentsInterval`, and gives the shard up properly. So the finding is only reasoned. It belongs to
  family C of the step of bugs.
- Where a fix could begin: in the receiver, a request of an operation whose asker's work no longer holds is not
  applied. The door's step and the loop's `Receive` already read the asker's key row to keep or pend the Cluster id,
  so the check is one more condition on that row. The receiver would answer such a request with no reply, since
  nothing waits for it. Or, in the sender, `send` checks in a transaction that the asker's key row still holds the
  run before it sends. That narrows the window, and does not close it.

### Suspects ruled out

- 0008 against 0004: a key kept by the step that handles its message is counted gone (`previous` without the
  handled key, `src/machine.ts:990-991`). So `renew` draws a new incarnation from the entity's one counter, and a
  late duplicate of the earlier attempt is dropped.
- 0014 and 0020 against 0004 and 0009: no event brings a key back in an incarnation it left. Every new incarnation
  is `++incarnations` of the entity's counter (`src/machine.ts:683`), and entities are never deleted.
- 0021 against 0020: the same holds across a deploy, since an activation compares the stored work by key and draws
  from the same counter.
- 0060 against 0011: an at-most-once operation that sends and then delivers `unknown` may still have its request
  applied by the receiver. `unknown` allows it, and the reply stored for the ended work is deleted as it is stored
  (`src/storage/entities.ts:367-376`).
- 0065 against 0013 on Cluster: the door reads the reply inside the step's transaction, on the runner's one
  connection. So no other step of the entity runs between the reading and the step.
- 0023 against 0014 on Cluster: a message queued behind the entity's own work, and answered `Suspended` on the way,
  stays in the runtime's mailbox and is applied after the resumption. 0085's consequence says that such messages are
  not kept. The code keeps a message the door queued, which is 0023's rule on one process. A caller loses nothing
  either way, since `Suspended` says nothing of whether the message is queued. The sentence of 0085 is inexact on
  this case, and changes no answer.
- 0048 against 0036: a migration that writes two old senders alike makes them one caller. A retry of either may then
  be given the other's reply, under a request id both used. That is 0048's own rule: two senders the schema writes
  the same are one caller. 0124 makes request ids unique within an identity, and such a migration says that the two
  senders are one identity.
- 0048 against 0040 and 0027: the sender is encoded before the request reaches the entity, for a message and a
  creation alike (`src/runtime/callers.ts`).
- 0049 against 0124: flags that do not encode, and a defect at creation, both give the creator the defect and store
  nothing. An operation that creates so dies, and its entity is suspended until a fix. The case on Cluster is bug 10.
- 0045 against 0010: the wait for a program not deployed takes no request id at the receiver. Its senders that wait
  for ever are 0045's own consequence.
- 0028 against 0010: the retries are replaced by 0063, and the discard they undo is bug 19.
- 0038 against 0009: 0038 applies no rule of 0009.
- 0022 against 0015: what a rename leaves is bugs 15, 16 and 27 to 30.
- 0125 and 0245 against 0053: a `keep` of `Number.MAX_SAFE_INTEGER` gives an `until` past 2^53. That `until` is
  still an integer double, which an `INTEGER` of SQLite and a `BIGINT` of PostgreSQL store and compare. A `keep` of
  0 is deleted in its own step, which is a reply kept for no time, as 0125 says.
- 0245 against 0075: a process sweeps a name once, since a name is deployed once and the sweep is forked in that
  deployment's scope. On Cluster the sweep is a singleton. An operator's `expire` beside the sweep deletes the same
  rows past their time, and on SQLite one writer orders the two.
- 0085 against 0125: a retry past `keep` answered from Cluster's rows is given the earlier reply. The area's report
  and decision 0248 already rule it out.
- 0090 against 0021 on a pool of PostgreSQL: bug 3. 0090's window for a Cluster id that a client given a defect keeps
  is 0092's own consequence.
- 0092 against 0023: a discard sends `Resumed`, and the operation sends the discarded message again. That is bug 19.

### Noticed, not checked

- The same sequence as finding 1, on one process. A crash forks the interruption of the entity's operations without
  waiting for them (decision 0056), and the next activation runs them again. An operation that sends from a
  finalizer, or from an uninterruptible region, under a name its new run also uses, may send after the new run ended
  the work. The receiver would then apply the message twice. It was not checked, because it needs a program that
  sends from a finalizer, a form that no note and no example holds. A test would give `sending` of
  `src/runtime.test_shared.ts` an `Effect.onInterrupt` that sends under `want`, crash its entity while the first run
  waits, and count the nonce `sent` in the toy's `applied`.

### Notes not read whole, and why

- None of the brief's notes. Each of its eighteen notes, and each of the fifteen notes of area 1, was read whole.
  The code of 0156's rename, and the code of 0169 beyond `forgetSent`, were not read. Only the suspects ruled out by
  other bugs rest on them.

## 2026-11-11: premise review of the pairs against Messages, requests and replies, a second part

The reviewer's report, as its session wrote it. Branch `claude/premise-pairs-messages-2-a90d4b`, cut from `main` at
`e6d3808`. It reads the notes 0100 to 0214 of the list against area 1, each against the notes of the area it meets.
Three findings. Two are reproduced by tests of `src/cluster.test.ts` at commit `d602b35`. One is only reasoned,
since no code of the library keeps the rule it is about.

### The pairs read

Each pair was found by the table of the area's report, by the index, and by `grep -wE` of each note in both
directions. Every note of the list, and every note of the area it meets, was read whole.

| Later note | Note of the area | What binds them | How it was read |
| --- | --- | --- | --- |
| 0100 | 0021 | cites 0021 as its reason: a reply to an entity goes with the work that asked | both whole, with the code: the deletions of replies in `write` of `src/storage/entities.ts`, `holds` of `src/machine.ts` |
| 0123 | 0015 | changes 0015: a second form of the idempotency key | both whole, with the code: `digestOf`, `givenKey` and `idempotencyKeyOf` of `src/machine.ts`, `named` of `src/runtime/callers.ts` |
| 0126 | 0125 | cites 0125 as its reason: a caller's reply kept for a time left the migrations to be read again | both whole, with the code: `migrationViolations` of `src/testing.ts`, `reply` and `replyOf` of `src/storage/entities.ts` |
| 0127 | 0048, 0125 | applies a caller's retry (0048) within its `keep` (0125) to the items of a stream | the three whole, and 0023 whole for finding 3, with the code: `receive` of `src/machine.ts`, `send` of `src/runtime/callers.ts`. No code keeps 0127 |
| 0129 | 0060 | cites 0060 as a reason the runtime keeps its check | both whole, with the code: `named` of `src/runtime/callers.ts` |
| 0133 | 0004 | applies incarnations to a child by id that comes back | both whole, with the code: the composed keys of `src/program.ts` (`work`, `keys`), `holds` and `givenKey` of `src/machine.ts` |
| 0133 | 0009 | cites 0009 as its reason: entities agree only through messages | both whole, with the same code and `entities` of `src/runtime/callers.ts` |
| 0141 | 0125 | cites 0125 for a `keep` left out | both whole, with the code: `kept` of `src/runtime.ts` |
| 0152 | 0245 | 0245 cites 0152 for the prune of a topic no consumer holds, and runs that prune in a sweep | both whole, with the code: `expire` of `src/storage/entities.ts`, and the sweep's fork in `src/runtime.ts` as the area's report read it |
| 0156 | 0059 | cites 0059: a request names its sender's address in its JSON | both whole, with the code: `givenKey`, and the request's text as `reply` reads it |
| 0157 | 0065 | changes 0065: a caller's request that a version before stored is found by `request_id` | both whole, with the code: `reply`, `replyOf` and the upsert of `write` in `src/storage/entities.ts` |
| 0160 | 0124 | changes how 0124 holds on Cluster: a creator is not given a defect at creation | both whole, with the code: `doorStep` of `src/runtime/doors.ts`, `create` of `src/runtime/callers.ts`, the door's registration in `src/cluster.ts`, and `entityManager.ts` of Effect |
| 0165 | 0125 | changes how 0125 holds on Cluster: a caller's `keep` is in the door's payload | both whole, with the code: `primaryKey` and `keptGiven` of `src/cluster.ts`, `send` of `src/runtime/callers.ts` |
| 0171 | 0245 | 0245 changes 0171, for a creation's rows and for an `expire` in batches | both whole, with 0248 and 0249, and with the code: `keptGiven` of `src/cluster.ts`, `forgetUnder` of `src/storage/cluster.ts`, `expire` and `write` of `src/storage/entities.ts` |
| 0178 | 0124 | applies 0124: the example's boundary takes the sender from `Authorization` | both whole, with the code: `examples/server/server.ts` |
| 0214 | 0065 | cites 0065: a retry is answered from storage | both whole, with the code: `replied` of `src/machine.ts`, `replyOf` of `src/storage/entities.ts` |

### Finding 1, reproduced: 0160 against 0124, a creation the program dies on blocks every later request to its id on Cluster

- The premise that fell: 0124 says that a defect at creation is given to its creator and stores nothing. Unwritten,
  the rule needs the defect to stay with its request. Another creator of the same id, whose flags `init` accepts,
  creates the entity, and a message to the id is answered `NotFound`. On one process this holds: `create` of
  `src/runtime/callers.ts` finds no entity loaded or stored, and starts the machine with the second creator's flags.
  0160 has the door die on such a creation, so that Cluster delivers it again without end. Cluster runs a door's
  requests one at a time, since the runtime registers the door with no `concurrency` (`src/cluster.ts:440`), and the
  default is 1 (`node_modules/effect/src/cluster/internal/entityManager.ts:365`). At each restart Cluster replays every
  request the entity holds, in the order it took them, before it admits new work (`replay`, lines 323-333). The
  creation is first, and dies again. The restart's backoff is reset only when a request completes, so it grows to
  ten seconds (lines 300-305 and 999-1002).
- The sequence: a caller creates the entity `one` with flags `init` dies on. The door dies, and Cluster restarts it.
  A second caller creates `one` under another request id, with flags `init` accepts. Its request is queued behind
  the first creation. Each restart replays the first creation, which dies, so the second creation is never handled.
  Its caller waits for ever, where on one process it is answered `Created`. A caller's message to `one`, answered
  `NotFound` on one process, waits behind the creation the same way. That case is reasoned from the same reading,
  and not run. An operator sees nothing of it, as bug 10 says of an operation's creation.
- The test: `FAILING: on Cluster a creation the program dies on leaves another creator of its id to create the
  entity`, in `src/cluster.test.ts`, describe `the runtime on Cluster`, at commit `d602b35`. It sends the creation
  `init` dies on, then a second creation through the handle, and waits eight seconds, past several restarts. It
  expects `Created`, and gets no answer. Run it with
  `bun test src/cluster.test.ts -t "a creation the program dies on leaves another creator"`.
- It belongs to family C of the step of bugs, beside bug 10, and joins the open question A creation that `init`
  dies on, on Cluster.
- Where a fix could begin: at the creation of `doorStep` in `src/runtime/doors.ts:312-315`, where the door dies. The
  fix is a choice of the design. The door could answer such a creation with an answer Cluster saves and the
  creator's client resets, as it does for `Rejected` (decision 0182), with a backoff of the client's. Or the runtime
  could store the defect in its own tables, so that the door answers the creator and frees the id. 0160 refused to
  give the defect as a reply, since Cluster would save it for ever, and refused a reset, for its loop with no backoff.

### Finding 2, reproduced: 0245 against 0171, a caller that stops waiting keeps its Cluster rows for ever

- The premise that fell: 0245 lets a sweep free what the steps leave, so that the replies of a deployment no longer
  grow without bound. The guide on Cluster says that once a message's `keep` is past, the next step or the sweep
  deletes its rows (`docs/guide/cluster.md:196-199`). The step and `expire` delete Cluster's rows only under the ids
  `effecttea_given_requests` holds (decision 0171, `src/storage/entities.ts:398-405, 462-466`). A caller's client
  keeps the id only once it is given the answer (`keptGiven`, `src/cluster.ts:348-361`). 0171 says, among its
  consequences, that a caller interrupted before its answer keeps its rows in Cluster's tables for ever. 0245 changes
  0171 and says nothing of that case, and `docs/open-questions.md` does not hold it.
- The sequence: a caller sends with a `keep` and a timeout, as an HTTP boundary does. The timeout ends its wait
  before the step answers, and the message is handled all the same (decision 0091). The client keeps no id. The
  runtime's reply goes once its `keep` is past, but no later step, `expire` or sweep deletes the rows of the request
  in `cluster_messages` and `cluster_replies`. Every caller that times out and does not retry under the same request
  id adds rows that stay. A retry of that request id within its version is then answered from the reply Cluster
  saved, for ever, where 0125 says that a retry past `keep` is applied again.
- The test: `FAILING: a caller that stops waiting leaves its Cluster rows to go once its time is past`, in
  `src/cluster.test.ts`, describe `the runtime on Cluster`, at commit `d602b35`. A probe holds each step of a message
  300 ms before its commit, and the caller's send times out at 50 ms. The test then runs a later step and `expire`,
  past the least time of decision 0248. The rows of the later message go. The row of the message whose caller
  stopped waiting stays. Run it with `bun test src/cluster.test.ts -t "a caller that stops waiting"`.
- It belongs to family C of the step of bugs.
- Where a fix could begin: in `keptGiven` of `src/cluster.ts`, which could keep the id when its caller is
  interrupted too. That needs care. A request whose caller stopped waiting may still wait in Cluster's table, and a
  step that deleted its rows past the client's time would delete a message no step has handled. So `forgetUnder`
  would also have to spare a request that Cluster has not marked processed. Otherwise the guide and the design say
  that such rows stay until a later release of Cluster frees them, as 0171 says.

### Finding 3, only reasoned: 0127 against 0023 and 0147, a boundary that acknowledges an item once `send` is answered may lose it

- The premise that fell: 0127 has the boundary acknowledge an item to its source only once `send` is answered, and
  says that an item sent again after a crash gets the stored reply. Its premise is that every answer of `send` stores
  the item. Two answers store nothing. `Suspended` answers a message that arrives at a suspended entity without
  queuing it, and its caller is to retry under the same request id (decision 0023, `src/machine.ts:899-902`).
  `Full`, which decision 0147 added after 0127, offers and stores nothing of the message
  (`docs/design.md:629-631`). `NotFound` stores nothing either.
- The sequence: a boundary reads an item from a feed, and sends it to an entity that is suspended. The item is
  answered `Suspended`, which is an answer, so the boundary acknowledges the item, as 0127 and
  `docs/design.md:358-361` say. The source never gives the item again, and the entity, once resumed, never receives
  it. Nothing reports the loss.
- Not reproduced: 0127 changes nothing in `src/`, and the library cannot check what a boundary acknowledges. No
  example reads a stream.
- Where a fix could begin: a note that changes 0127, and the paragraph on streams of `docs/design.md`. The boundary
  acknowledges an item once it is answered with a reply, `Accepted` or `Rejected`, and sends it again under the same
  request id after `Suspended` or `Full`. What it does after `NotFound` is its protocol's.

### Suspects ruled out

- 0100 against 0021: 0100's premise that a caller's reply is kept for ever fell by 0125 and 0245. Its conclusion
  holds, since 0126 keeps every migration, and a reply of any version is read through them (`upReason` and
  `upRequest` in `replyOf`). 0100's status line names neither 0125 nor 0245.
- 0123 against 0015: the digest is a function of the readable key, which holds the name, the id, the key and the
  incarnation, so two keys 0015 keeps apart stay apart. An operation's request to an entity is its tagged request
  (0059), not its key, so the digest changes no request. A rename keeps `keyedAs`, and bug 15 is the case it misses.
- 0126 against 0125: no migration is ever dropped, so no reply a version before wrote becomes unreadable, whatever
  its `keep`.
- 0127 against 0048 and 0125: a boundary that sends an item again within `keep` gets the stored reply. One that sends
  it again past `keep` has it applied again, which 0125 leaves to the boundary's window.
- 0129 against 0060: an `Entities` kept from another run passes the type and the runtime's check, since that run's
  `Entities` is not droppable. 0129 says so, and promises no check of it.
- 0133 against 0004: a child by id removed and added back in a later step finds its keys without a row. Its keys
  take new incarnations from the entity's one counter (0132), and an answer of the earlier run is dropped. A child
  removed and added back in one step keeps the work that encodes alike, so an answer it gets is for that same work.
- 0133 against 0009: a child's keys are `<child>.<key>`, with the child's id, or with the id and the parameter as a
  pair (`src/program.ts:1520-1528`). So two children's operations send under two requests. A receiver sees the
  parent's address, which it authorizes as any entity's.
- 0141 against 0125: 0141's sentence that a `keep` left out is none is stale since 0245, and `kept` refuses a `keep`
  left out (`src/runtime.ts:718-727`). 0141's status line does not name 0245.
- 0152 against 0245: a consumer is stored by a deploy before that program's sweep is forked, and a batch reads the
  cursors in its own transaction. A consumer declared later holds its topic from its deploy, as 0152 says, and as
  0245 repeats for a topic with no consumer.
- 0156 against 0059: the rename rewrites the `entity` of every request's text, and its guard checks that the text is
  the one the runtime writes for the new name. So a sender that sends again keys its request as it is stored.
- 0157 against 0065: the second reading, by `request_id`, is made for a caller's request only, and `replyOf`
  compares each row once migrated. So a row of another sender under the same request id is not taken
  (`src/storage/entities.ts:192-227`).
- 0165 against 0125: the door's primary key is the version and the request (`src/cluster.ts:129`). So a retry after a
  deploy reaches the door, and the machine answers it from its reply, found by `request_id`. Two clients of one
  request with two `keep`s are given the first one's time, on Cluster as on one process.
- 0171 against 0245, the batches: `forgetUnder` runs three statements, each with the batch's subquery. On SQLite the
  batch's transaction holds the one writer, and no statement before the last deletes from
  `effecttea_given_requests`, so the three statements read the same ids.
- 0178 against 0124: the request id comes from `Idempotency-Key` and the sender from `Authorization`, so the ids are
  kept apart per identity. `Suspended` is answered 409, which an HTTP client does not retry as transient.
- 0214 against 0065: the machine reads the reason back at the program's version (`replied`, `src/machine.ts:81-84`).
  A retry reads it through the migrations of the version that wrote it, which gives the same reason at the same
  version.
- 0160 against 0124, a retry after a fix: the creation is replayed on the newer runner with the version in its
  payload, and read through the migrations of that version (`deliveredCreation`).

### Noticed, not checked

- A caller's message to an id whose creation the door dies on waits for ever on Cluster, where one process answers
  `NotFound`. It follows from the same reading as finding 1, whose test runs only the second creation.

### Notes not read whole, and why

None. Every note of the list, and every note of area 1 it meets, was read whole, with the code that keeps its rule.
0147 was read by the paragraph of `docs/design.md` that states it, for finding 3, since it is no note of the list.

## 2026-11-11: premise review of the pairs against Effect Cluster

Branch `claude/premise-pairs-cluster-32dc2e`, cut from `main` at `e6d3808`. Test commits `7deee20`, `31b01e8` and
`902fce1`, all in `src/cluster.test.ts`. Three findings are reproduced, and one is only reasoned. The notes are the 29
that the review of Effect Cluster read in part or not at all, each read against the notes of that area it meets.

### The pairs read

"Whole" means both notes were read whole, with the code that keeps the rule. Every note of the list was read whole,
and so was every Cluster note a pair of the list meets.

| Earlier note | Cluster note | What binds them | How it was read |
| --- | --- | --- | --- |
| 0015 | 0085 | 0085 says how 0015 holds on Cluster | whole, with `doorOf` and `sentNow` |
| 0021 | 0085, 0090 | 0090 corrects 0021's consequence, and 0085 keeps the replies as 0021 does | whole, with `keepSent` and `forgetPending` |
| 0023 | 0085, 0092 | 0085 says how 0023 holds, and 0092 answers `Suspended` on the way | whole, with the mailbox loop of `doorStep` |
| 0029 | 0092, 0161, 0172 | 0092 keeps 0029's passivation for doors, 0161 decides the pending machine that keeps an entity from leaving, and 0172 names the takers of the lock outside a transaction | whole, with `steps`, `unload`, `nothingToDo`, `holding`, `finishIn` and `settle` |
| 0036 | 0085 | 0085 cites it for messages stored before a deploy | whole |
| 0048 | 0085 | 0085 keys a request by the sender as 0048 writes it | whole |
| 0059 | 0085 | 0085 keys a request by its `requestKey` | whole |
| 0063 | 0085, 0090, 0092, 0162, 0163, 0167, 0172 | 0092 changes its waits on Cluster, 0163 narrows it, 0167 wakes a sender by `Resumed`, and 0172 reads its registration again | whole, with `entities` of `src/runtime/callers.ts` |
| 0065 | 0085 | 0085 cites it as its reason | whole, with the reply read in `doorStep` |
| 0069 | 0085 | 0085 cites it as its reason | whole, with `answerCodec` and the door's encoding in `src/cluster.ts` |
| 0071 | 0081, 0092, 0162 | 0081 says Cluster reads its own mailbox, and 0092 and 0162 apply 0071 to each shard | whole, with `activating` and `interruptedWithin` |
| 0074 | 0081, 0085, 0092 | 0081 changes it | whole |
| 0076, 0078 | 0092 | 0092 keeps them for doors | whole, with `admit`, `spare` and `unload` |
| 0079 | 0092, 0172 | 0092 changes it for an activation | whole, with `activateOnCluster` |
| 0100 | 0090 | 0100 cites 0090 as its reason | whole |
| 0114 | 0092, 0166, 0167 | 0092 writes the rows of the waiting senders, which 0114 says `suspended` reads on Cluster, and 0166 applies 0114 through the door | whole, with `suspended` of `src/runtime.ts` and `waitingFor` of `src/runtime/callers.ts` |
| 0125 | 0085, 0090, 0165, 0171, 0248 | 0165 changes it on Cluster | whole |
| 0137 | 0162 | 0162 decides that its partition is the shard | whole, with `interruptedWithin` and `singletonsOf` |
| 0142 | 0163 | 0163 narrows it | whole, with `tell` in `settle` |
| 0147 | 0165 | 0165 drops its bound on Cluster | whole |
| 0151 | 0092 | 0151 cites 0092 | whole |
| 0156 | 0167, 0169, 0171, 0174, 0176 | 0176 changes it, and 0167, 0169 and 0171 rely on its moves | whole, with `renamed` of `src/storage/tables.ts` |
| 0164 | 0161, 0163 | 0164 extends 0161 | whole, with the readers of `pending` |
| 0182 | 0085, 0165, 0169, 0249 | 0182 cites them as its reason, and 0249 changes its reset | whole, with `creationCodec` |
| 0185 | 0161 | 0185 cites 0161 | whole |
| 0215 | 0175 | 0215 cites 0175 | whole |
| 0219 | 0175 | 0219 cites 0175 | whole |
| 0247 | 0159 | 0247 cites 0159 | whole |

### Finding 1, reproduced: 0029 against 0092 and 0161

- Test: `FAILING: an entity whose passivation waits on a door step that starts an operation runs the operation`, in
  `src/cluster.test.ts` (describe `the runtime on Cluster`), commit `7deee20`. Run:
  `bun test src/cluster.test.ts -t "FAILING: an entity whose passivation"`. It fails: the entity is unloaded while its
  stored state is `asking`, `Ask` never runs, and the state stays `{ n: 0, asking: true }`.
- The premise that fell: 0029 says that an entity is never unloaded under a caller, since finding it and offering its
  event is one hold of its lock. On one process the caller's event is in the queue before the lock is let go, so the
  unload finds it pending. 0079 says the same in the alternative it rejects: between an activation and its caller's
  event, the entity holds no event, and a process could unload it. 0092 and 0161 move a door's step into Cluster's
  transaction. The step takes the lock inside the transaction, and lets it go when the handler returns. Cluster
  commits after that, and only then does `afterCommit` offer the `Settle` that makes the entity busy (doors.ts:255).
  Between the two, `loaded.uncommitted` is set and nothing is pending.
- 0161 says that an entity whose machine is not settled does not leave the process. The loop checks it once, outside
  the lock, when it takes its `Passivate` or `Evict` (loop.ts:613). `unload` then reads `nothingToDo` or `spare` from
  the held machine, under the lock, and neither reads `uncommitted` (loop.ts:434-459, 490-493). 0161's premise says
  that only a lost callback or a rollback leaves an entity spare with an uncommitted machine. It missed this window,
  where the commit succeeds. 0172 says that the takers of the lock outside a transaction "unload the entity or crash
  it, load nothing", and so counts the unload as harmless.
- Sequence: the entity `one` is loaded and idle, and its loop's wait runs out. The loop takes `Passivate`, finds no
  uncommitted machine, and waits for the lock, which a door's step of `Ask` holds. The door's step writes
  `asking: true`, sets `uncommitted`, and returns. The lock goes to the loop. Cluster saves the reply and commits.
  `unload` reads the held machine, which has nothing to do, and the entity leaves. The `Settle` is offered to a loop
  that has ended. The stored state holds `ask`, and nothing runs it on this runner. The waker reads timers alone, and
  the shard's round runs only when the shard's singleton starts. The next message through the door loads the entity,
  and its `Restart` starts `ask` then. An at-most-once operation would be given its `unknown` there, though it never
  ran.
- In the test the window is opened by one `Effect.yieldNow` before Cluster's `saveReply`, which runs in the door's
  transaction after the handler returns. Without it the commit and the callback ran before the loop took the lock,
  and the test passed. In a deployment a fiber yields there whenever it reaches Effect's budget of operations, so the
  window opens for a share of the door's steps that meet a passivation or an eviction. A control run, with the yield
  and a passivation of a minute, passes.
- The `tell` of the step's rows is lost with it, confirmed by reading. `tell` runs only in `settle` for a door's step
  (doors.ts:76), and the test shows that the `Settle` is never applied. A reader of `consume` with `wait` on this
  runner is then woken by nothing, since `PRAGMA data_version` does not move at the runner's own commits (decision
  0163), and waits out its time.
- It is of family E of the step of bugs, an entity left with work stored that nothing loads again, by a third path
  beside bugs 14 and 18.
- Where a fix could begin: `unload` of `src/runtime/loop.ts:484`, which could refuse, under the lock, to unload an
  entity whose `uncommitted` is set, and leave the decision to the `Settle` to come. Or `finishIn` of
  `src/runtime/doors.ts:233`, which could count the `Settle` as pending before the lock is let go, and lower the count
  where the transaction rolls back.

### Finding 2, reproduced: 0069 and 0100 against 0085

- It is one bug with the one another session of this round found, a reason written by the newer runner and read by an
  older caller's schema. This report keeps its own test and its sequence.
- Test: `FAILING: a caller of the older runner is given a reason the newer runner wrote, read as its version reads
  it`, in `src/cluster.test.ts` (describe `two runners on one file`), commit `31b01e8`. Run:
  `bun test src/cluster.test.ts -t "FAILING: a caller of the older runner"`. It fails: the reason's two fields come
  back swapped.
- The premise that fell: 0069 and 0100 read a rejection's reason through the migrations from the version that wrote
  it. 0085 keys a request in Cluster's table by the version of the caller that sent it, and says that two versions
  never share a key. The answer saved under that key is written by the door, at the door's version. The door encodes
  it with its own program's `answerCodec` or `creationCodec` (src/cluster.ts:213-246, 422-423). The caller's client
  decodes it with the caller's program (src/cluster.ts:454, 471). The text carries no version. So the key's version
  and the answer's version differ whenever a runner of one version answers a caller of another. 0159 says the older
  runners "run on, serve no shard, and can be stopped at leisure", so their callers send all the while.
- Sequence: a runner of `Toy` version 1 holds every shard, and creates `one`. A runner of version 2 launches, and
  takes every shard (decision 0159). Version 2's migration of `rejection` swaps the two fields of the reason. A caller
  of the older runner sends a message under version 1, which the newer runner's door rejects. The older client decodes
  version 2's reason with version 1's schema, and reads `{ first: 'closed', second: 'the clerk' }`, where version 1
  means `{ first: 'the clerk', second: 'closed' }`. Nothing fails. A migration that renames a field makes the decode
  fail instead, and the caller is given a defect. A creation's reason crosses the same way (decision 0182).
- A retry within the version is then answered from that saved text, for as long as Cluster keeps the rows.
- It is of family A of the step of bugs, a newer version against what an older one runs. Its fix is a choice of the
  design, since a migration goes only forward. The answer could carry the version that wrote it, and a client of an
  older version could refuse a reason it cannot read. Or Cluster's answer could hold no reason, and the client could
  read the runtime's reply through the migrations.
- Where a fix could begin: `answerCodec` and `creationCodec` of `src/cluster.ts:213`, and their decoding in `create`
  and `send` of `onCluster`.

### Finding 3, reproduced: 0114 against 0092, 0166 and 0167

- Test: `FAILING: an operator on any runner sees the operation of another runner that waits for a resumption`, in
  `src/cluster.test.ts` (describe `the shards of a runner on Cluster`), commit `902fce1`. Run:
  `bun test src/cluster.test.ts -t "FAILING: an operator on any runner"`. It fails: the first runner lists the
  waiting sender, and the second runner lists none.
- The premise that fell: 0114 lists, for each suspended entity, the operations of other entities that wait for its
  resumption. On one process it reads the registrations of the process, which are whole once it is settled. It says
  that on Cluster the waiting senders are the rows 0092 writes, and that `suspended` reads them there. 0167 writes
  those rows, in `effecttea_waiting`. 0166 lets an operator resume or discard an entity from any runner, and has the
  operator read `suspended` before sending another event. The code reads the registrations of the runner called
  alone: `suspended` and `inspect` give `waitingFor(p, …)` (src/runtime.ts:1316, 1335; src/runtime/callers.ts:60), and
  nothing reads `effecttea_waiting` but the step that resumes (src/storage/cluster.ts:187). 0185 says "the senders
  waiting in this process", as the code does, and 0114 says otherwise.
- Sequence: runner 1 holds the sender `r0`, and runner 2 the receiver. The receiver dies on `Break`. `r0` runs `Relay`
  to it, is answered `Suspended`, and waits on runner 1, and its row is written. An operator calls `suspended` on
  runner 2, and is told that nobody waits for the receiver. 0114's rule that "the list says who waits", which is what
  a deployment that wants an alarm reads, does not hold there.
- No reply is lost: a resumption still tells the sender by `Resumed`. What is wrong is what an operator is shown.
- It is of family C of the step of bugs, a rule of one process that holds otherwise on Cluster.
- Where a fix could begin: `suspended` and `inspect` of `src/runtime.ts:1313` on Cluster, which could read the rows of
  `effecttea_waiting`, or 0114's sentence, which a note could narrow to the runner called. The rows hold the sender's
  entity and not its key and incarnation, so a reading of them gives less than a `Waiting`.

### Finding 4, only reasoned: 0137 against 0162

- The premise that fell: 0137 stores an entity's partition and never computes it again, so that a change of
  `Hash.string` in a later release of Effect breaks no order. Its own alternatives reject a partition computed from
  the id at each step, since a change of the hash would then move an entity. 0162 makes the partition the shard, and
  keeps the sentence "a hash that changes in a later release moves no stored partition". On Cluster the shard is
  computed from the id at every delivery, so the stored partition must still be the shard Cluster computes now. The
  waker and the shard's round read entities by the stored partition (`interruptedWithin`,
  src/storage/entities.ts:485). `loadable` and `losing` compute the shard from the id (loop.ts:109-113,
  doors.ts:516).
- Sequence: a release of Effect changes Cluster's hash and `Hash.string` alike. The deploy's check in `singletonsOf`
  compares the two hashes of now, so it passes (doors.ts:430-447). An entity created before the move has a stored
  partition `p`, and is routed to another shard `s`. The round of `s` does not read it. The round and the waker of `p`
  read it, and `activateOnCluster` finds it `Unheld` wherever `s` is not held, and drops it with no log
  (doors.ts:419). Its timers and its work wait until a message reaches it through the door.
- What guards it today: the test `the partition of an id is Cluster's formula on Hash.string, pinned for a few ids`
  in `src/storage.test.ts` fails at such a move of Effect's version. What a deployment does then is decided nowhere.
  0137's reasoning, that a stored partition makes the change harmless, does not hold on Cluster.
- Where a fix could begin: the rule of `AGENTS.md` for a move of Effect's version, or a check at a launch on Cluster
  that the stored partitions of a sample of entities are the shards Cluster gives their ids.

### Suspects ruled out

- 0023 against 0092: a caller's message queued behind the entity's own work, which a suspension on the way stops, is
  answered `Suspended` and stays in the stored mailbox. A retry after the resumption is answered from the reply the
  resumption stored, so the message is applied once, as 0023 has it. 0085's consequence that such messages "are not
  kept" is wider than the code, which loses nothing.
- 0156 against 0167, 0169, 0171 and 0176: a rename moves `effecttea_sent_requests`, `effecttea_given_requests` and
  `effecttea_waiting` with the replies (src/storage/tables.ts:613-618), so no kept id and no waiting sender stays
  under the old name. 0156's premise that nothing runs under the old name while the rows move does not hold on
  Cluster, and 0176's mark, read by the check of every step, replaces it. Bugs 15, 16 and 27 to 30 hold the rest.
- 0063 against 0092 and 0168: an operation whose receiver's program its own runner deploys, and the shard's holder
  does not, is sent again every `retry`, 10 ms by default, with a keep and a reset each time, once the registration
  window is past. It writes on the file's one writer for as long as the holder lacks the program. 0168's premise, that
  such a failure passes with time or is the operator's to fix, accepts it. A program no runner deploys still waits on
  its signal in `deployedAs`, as 0063 has it.
- 0125 against 0165, 0171 and 0248: 0125 says that when the rows go never changes what a caller is answered. On
  Cluster a retry after `keep` is answered from Cluster's saved reply until a step or `expire` deletes the rows, so it
  does. 0248 accepts it: the promise of `send` is a message applied once within `keep`, which still holds.
- 0076 and 0151 against 0092: a door's step that writes nothing offers no event, so it does not make the entity the
  most recently used, and an entity used through its door alone may be evicted first. An eviction writes nothing,
  and loses nothing but by finding 1's window.
- 0147 against 0165: Cluster's mailbox bounds a burst, and a caller is never answered `Full`. Nothing is lost.
- 0065 against 0085 and 0092: a door's step reads the reply inside its transaction, after `settle`, on the runner's
  one connection, so what it reads is what the steps before committed, as 0065 asks of the loop.
- 0069 against 0085, for the swap of senders 0069 closed: Cluster keys by the version and the text, so a second
  caller whose request a migration gave the first one's text is a new request to Cluster, and the step reads the
  runtime's replies as on one process.
- 0071 against 0081 and 0162: the shard's round reads the mailbox with the work, as a process does as it starts. That
  the round runs only when the shard is gained is bug 14's.
- 0079 against 0092: a door's activation runs in the handler's fiber, which Cluster interrupts only when the shard
  leaves. The transaction then rolls back, and the entity enters the process only in `finishIn`, so no half-loaded
  entity stays. Cluster's commit and its callbacks run under `uninterruptibleMask` (`requestWriteOptions` of
  `cluster/internal/entityManager.ts`).
- 0164 against 0161: the `Settle` that finding 1 offers to an ended loop leaves its `pending` raised, and nothing reads
  it, since the readers of `pending` read the entities a deployment holds.
- 0215 against 0175: the lease check reads `cluster_locks` unqualified, by the `search_path` that Cluster's tables
  follow too, and the runtime on Cluster runs on SQLite alone (decision 0084).
- 0219 against 0175: the drain ends before `Sharding` is released, so a completion committed in it passes the lease
  check, and the next runner's round reads it from the mailbox. Bugs 21, 34 and 35 hold the drain's other cases.
- 0247 against 0159: `check` writes nothing and reads the stored rows alone, so an older runner that still runs, or a
  door's machine not committed yet, changes only what a moment's reading finds, as 0247 says.
- 0100 against 0090: a rejection's reason in the runtime's table goes with the asker's work on Cluster as on one
  process. What crosses versions is Cluster's saved text, which is finding 2.

### Noticed, not checked

- Finding 1 for an `Evict`: `admit` marks an entity spare outside its lock, and `unload` reads `spare` under the lock
  without `uncommitted` (loop.ts:97, 492), so the code is the same as for a passivation. It is not reached cheaply.
  `admit` runs in another entity's transaction, which holds the runner's one connection, so the door's step of the
  evicted entity can hold its lock only once that transaction has ended, and before the evicted entity's loop takes
  its `Evict`. A test would need to hold that loop between the offer and the take, which no helper of
  `src/cluster.test.ts` does. The suspected sequence: entity `two` enters past the capacity and tells `one` to leave,
  a door's step of `one` begins before `one`'s loop runs, the loop takes `Evict` and waits for the lock, and the
  window of finding 1 follows.
- Finding 1 for a door's step that resumes or discards: the held machine is suspended, and `nothingToDo` is true for
  a suspended entity whose operations have ended (loop.ts:439). So an unload in the window drops the resumption's
  machine. Something is lost only where the resumption leaves work: the head message, handled by a fixed program,
  starting an operation, or completions recorded behind the head while suspended (decision 0113). Neither program of
  `src/cluster.test.ts` can reach it cheaply: `Tally`'s operation ends at once, and `Bell`'s waits until it is
  interrupted. The sequence suspected: `one` suspended, with a completion behind the message it died on, a `Discard`
  through the door in the window, and the completion left in the mailbox of an entity nothing loads.

### Not read whole, and why

- None of the list. Of 0162, the passages on the shard of an entity and on the order of a partition were read whole,
  with the code of `serving`, `activating`, `losing` and `singletonsOf`, and its passages on the waker were read in
  the code alone.

## 2026-11-11: premise review of the pairs against Versions and deploys, a first part

Read by a session that wrote none of these notes, on the branch `claude/premise-pairs-versions-1-e03c02`, cut from
`main` at `e6d3808`. It reads the notes 0015, 0018, 0021, 0025, 0033, 0034, 0037, 0038, 0046, 0048, 0056, 0061,
0062, 0063, 0072, 0077 and 0085 against the notes of area 3 they meet. The review of Versions and deploys read these
notes only at the lines that cite the area.

### The pairs

Each note of the list was read whole, and so was each note of the area it meets. The pairs were found by the table of
the area's report, by the index, and by `grep -w` of each number in both directions.

| Pair | What binds it | How it was read |
| --- | --- | --- |
| 0015 and 0022 | 0022 changes 0015's consequence on a rename | both whole, with `givenKey` and `reconcile` of `src/machine.ts` |
| 0018 and 0020 | 0020 applies 0018's comparison at an activation | both whole, with `renew`, `reconcile` and `activate` of `src/machine.ts` |
| 0018 and 0058 | 0058 changes 0018's comparison | both whole, with `encodeWork`, `isSame` and `startWork` of `src/machine.ts`, and the test of an annotated operation in `src/machine.test.ts` |
| 0021 and 0020 | 0021 cites 0020 as its reason | both whole, with `holds` and the replies `ended` of `src/machine.ts` |
| 0100 and 0021 | 0100 cites 0021 as its reason | both whole |
| 0025 and 0020, 0022 | 0025 cites both as its reason | all whole, with `encodeWork` |
| 0036 and 0025 | 0036 cites 0025 as its reason | both whole |
| 0058 and 0025 | 0058 changes 0025's consequences | both whole |
| 0033 and 0020, 0022 | 0033 cites both for a renamed key | all whole |
| 0034 and 0020 | 0034 cites 0020 for what a deploy may not change | both whole |
| 0037 and 0022 | 0037 applies 0022's defect as its own | both whole, with `admitted` of `src/machine.ts` |
| 0038 and 0036 | 0038 applies 0036 to the rows of the log | both whole, with the publication of `src/machine.ts` and the reading of `src/storage/log.ts` |
| 0072 and 0036 | 0072 applies 0036 to the projection in the log | both whole, with the same code |
| 0046 and 0043 | 0046 cites 0043 as its reason | both whole, with `unlessCrashed` and `entities` of `src/runtime/callers.ts` |
| 0048 and 0036 | 0048 applies 0036 to the sender | both whole |
| 0056 and 0051 | 0056 cites 0051 as its reason | both whole, with the deploy of `src/runtime.ts` |
| 0061 and 0043 | 0061 applies 0043 to a corrupted row | both whole |
| 0062 and 0043 | 0062 applies 0043 to a row a schema refuses | both whole |
| 0063 and 0051 | 0063 changes 0051's consequence | both whole, with the claim and the signal of `undeployed` in the deploy of `src/runtime.ts` |
| 0077 and 0043, 0051 | 0077 changes 0043's consequence, and cites 0051 | all whole, with `src/runtime/waker.ts` and the tests of a rollback in `src/runtime.test.ts` |
| 0085 and 0036 | 0085 applies 0036 to Cluster's mailbox | both whole, with `doorOf`, `answerCodec` and the client's `send` and `create` of `src/cluster.ts`, and `send` of `src/runtime/callers.ts` |

### Findings

1. **Reproduced: on Cluster, a caller of an older version is given a rejection's reason as the newer version writes
   it, and reads it through its own schema.** The notes are 0085 and 0036, with 0043. Decision 0036 has every value
   read by migrating its JSON from the version that wrote it up to the program's version. So a reader is never older
   than the writer. Decision 0043 keeps that premise where it fails: a row of a version the program does not have is
   not read, and the call fails with a defect that names both versions. Decision 0085 makes the answer of an RPC a
   text with no version. The step encodes the answer at the runner's version, by `answerCodec` at
   `src/cluster.ts:422`. The client decodes it with its own program's schema, by `answered` at `src/cluster.ts:470`,
   and keys the request by its own version, at `src/runtime/callers.ts:308`. A rolling deploy gives a reader older
   than the writer. The runner of version 1 runs on, holding no shard, and its callers still send. The step runs on
   the runner of version 2 (decision 0159), and the reason reaches the caller of version 1 in version 2's shape. The
   sequence: version 1 rejects with a least price `{ minimum: 1250 }`, in cents. Version 2 gives the price in euros,
   with a migration of `rejection` that divides by 100. A caller on the older runner sends `low`, and is given
   `{ minimum: 12.5 }`, which it reads as 12.5 cents. Nothing fails. Where version 2's reason does not decode under
   version 1's schema, the caller is given a defect instead. Every retry under that request id then gets the same
   defect, from the reply Cluster saved under version 1's key. An operation of the older runner, during a drain,
   takes that defect as the receiver's crash, and sends again after `retry` (decision 0046) until the runner stops.
   The same holds of a creation's `Rejected`, through `creationCodec`. Reproduced by `FAILING: on Cluster, a caller
   of an older version is never given a reason as the newer version writes it`, in `src/cluster.test.ts`, in the
   commit of this report. It is a case of family A, and of the row of the rejections in the table of the step What a
   deploy may change of a program. A fix could begin in `answerCodec`, with an answer that carries the version that
   encoded it. The client would then refuse a version its program does not have, with the defect of decision 0043.
   A fix could also begin at the client, which would refuse to send once a newer version of its program is recorded.

### Suspects ruled out

- 0018 against 0058: a step that changes only a property the operation's schema does not declare keeps the work. A
  run after a crash is then given the operation decoded, without that property. 0058 decides it, a test of
  `src/machine.test.ts` holds it, and the runner's type has no such property. An encoding that loses a declared field
  would give a run after a crash another value under the same key. 0025 called that a defect, and 0058 replaced that
  consequence on purpose. None of the schemas the examples use encodes so.
- 0063 against 0051: the signal of a name not deployed yet is completed only once the deployment is registered,
  after its activations, at `src/runtime.ts:1169` to `1172`. So a deploy that dies wakes no operation.
- 0077 against 0043 and 0051: on one process, a rollback dies as a whole when version 2 left an entity with an
  operation under way, and then serves no entity of the program. 0043's consequence says a rollback serves the
  entities the newer version never wrote. But 0043's decision says the deploy dies, and the test `a deploy that has
  no reading of the version stored dies`, in `src/runtime.test.ts`, holds it. The deploy fails loudly, and nothing
  is lost.
- 0072 against 0036: the step compares the projections before and after as the deployed program computes both, in
  `src/machine.ts`. The log migrates a stored projection before a topic selects from it, in `src/storage/log.ts`.
- 0085 against 0036 under a rollback on Cluster: `recordVersions` refuses a launch older than the newest version
  recorded, so no runner reads a payload newer than its program.
- 0021 against 0020: the statement that deletes a reply compares the sender's name, id, key and incarnation with the
  stored keys, and reads no JSON. So a row of another version changes nothing of the deletion.
- 0015, 0033 and 0037 against 0022: a renamed key is new work, and a key dropped while its operation is under way is
  a defect at the activation, in `reconcile` and `admitted`. A rename of the program is bug 15 of the roadmap.
- 0025 against 0020 and 0022, 0036 against 0025, 0034 against 0020, 0048 against 0036, 0061 and 0062 against 0043,
  0100 against 0021, and 0056 against 0051: each later note applies the earlier rule as it is written. No case the
  later note opens takes away a condition of the earlier rule.
- 0046 against 0043: a receiver whose row no deployed version reads keeps its senders waiting for ever, which the
  consequences of 0046 say.

### Noticed, not checked

- 0056 with 0021, out of this area: an idempotent or at-least-once operation of a crashed entity may still be
  stopping while its entity is loaded again and the same incarnation restarts. Once the new run's work ends, the
  receiver's reply to its request is deleted. If the old run sends again from a region it holds uninterruptible, the
  receiver applies the request a second time. Bug 31 is the at-most-once case alone. A test would crash an entity
  whose operation sends from an uninterruptible finalizer, end the restarted run, and count what the receiver
  applied. It is not checked, since it is a pair of areas 1 and 4.
- Finding 1 for an operation of the older runner during the drain of a rolling deploy: whether the drain waits for
  an operation that retries a defect of the client is not run. It waits on the choice of bug 2.

### Not read whole

None. Every note of the list and every note of the area it meets was read whole, with the code that keeps its rule.

## 2026-11-11: premise review of the pairs against Versions and deploys, a second part

Read by a session that wrote none of these notes, on the branch `claude/premise-pairs-versions-2-b6a869`, cut from
`main` at `fcd2494` and moved onto `743881f` before any reading. It reads the notes 0101, 0110, 0119, 0121, 0122,
0123, 0128, 0132, 0133, 0138, 0139, 0157, 0159, 0167, 0169, 0171 and 0174 against the notes of area 3 they meet. The
review of Versions and deploys read these notes only at the lines that cite the area, or in part.

### The pairs

The pairs were found by the table of the area's report, by the index, and by `grep -w` of each number in both
directions. Each note of the list was read whole, and so was each note of the area it meets. Two rows are pairs that
the code joins, where neither note cites the other: the drain reads the deployments that a deploy registers.

| Pair | What binds it | How it was read |
| --- | --- | --- |
| 0101 and 0075 | 0101 cites 0075's test, run under budgets | both whole, with `running` of `src/runtime.test_shared.ts` |
| 0110 and 0102 | 0110 cites 0102 as its reason | both whole, with `detached` and `withEntity` of `src/runtime/loop.ts`, and `deploy` of `src/runtime.ts` |
| 0119 and 0075 | 0119 cites 0075 as its reason | both whole, with the drain, `drained`, `admitted` and `deploy` of `src/runtime.ts`, and `start` and `arm` of `src/runtime/loop.ts` |
| 0119 and 0051 | met by the code: the drain reads the deployments a deploy registers once its activations are done | both whole, with the same code |
| 0119 and 0102 | met by the code: a deploy interrupted before it registers closes its scope | both whole, with the same code |
| 0121 and 0020 | 0121 cites 0020 as its reason | both whole, with `projected` of `src/storage/projections.ts` and `reconcile` of `src/machine.ts` |
| 0122 and 0043 | 0122 changes 0043's rule for `reindex` | both whole, with `reindex` of `src/storage/projections.ts` |
| 0247 and 0122 | 0247 applies 0122's line between the program's failure and the runtime's | both whole |
| 0123 and 0022 | 0123 applies 0022 to the form of the key | both whole, with `givenKey` and `reconcile` of `src/machine.ts` |
| 0123 and 0043 | 0123 cites 0043 for a rollback | both whole |
| 0156 and 0123 | 0156 cites 0123 for the name in a key | both whole, with `givenKey`, and `renamed` of `src/storage/tables.ts` |
| 0128 and 0020 | 0128 makes an exception to 0020's check | both whole, with `renew`, `reconcile` and `activate` of `src/machine.ts` |
| 0132 and 0058 | 0132 applies 0058's comparison to a key's parameter | both whole, with `canonical`, `isSame` and `renew` of `src/machine.ts` |
| 0132 and 0126 | 0132 cites 0126 for the recorded cases | both whole |
| 0133 and 0036 | 0133 applies 0036's migrations to the children | both whole, with `canonical` and `isSame` |
| 0133 and 0058 | 0133 applies 0058 to a child removed and added again | both whole, with the same code |
| 0138 and 0036 | 0138 applies 0036 to the rows of a topic | both whole, with `shownOf` of `src/machine.ts` |
| 0139 and 0036 | 0139 cites 0036 for the projection's JSON | both whole, with `shownOf` |
| 0157 and 0156 | 0157 changes 0156's rewrite of a request on PostgreSQL | both whole, with `inPlace`, `inProcess` and `rename` of `src/storage/tables.ts`, and `canonical` and `requestText` of `src/machine.ts` |
| 0157 and 0043 | 0157 applies 0043 to an integer past 2^53 | both whole |
| 0159 and 0043 | 0159 cites 0043 as its reason | both whole, with `atNewest` of `src/cluster.ts`, `recordVersions`, `standingOf` and `outranked` of `src/storage/cluster.ts`, `versionOf` of `src/program.ts`, and `shownOf` |
| 0247 and 0159 | 0247 cites 0159 for why `check` launches nothing | both whole |
| 0167 and 0156 | 0167 applies 0156's rename to `waiting` | both whole, with `rename` of `src/storage/tables.ts`, and 0176 read whole |
| 0169 and 0156 | 0169 applies 0156's rename to `sent_requests` | both whole, with the same code |
| 0171 and 0156 | 0171 applies 0156's rename to `given_requests` | both whole, with the same code |
| 0174 and 0043, 0156 | 0174 cites 0043 as its reason, and refuses a deploy as 0156 does | all whole, with `deploy` of `src/runtime.ts`, `waking` and `held` of `src/runtime/waker.ts`, `due` of `src/storage/entities.ts`, and `guard` of `src/cluster.ts` |

### Findings

1. **Reproduced: a deploy that registers during a drain keeps its waker, and the operations that run again,
   through the drain.** The notes are 0119 and 0051, with 0075. Decision 0119 stops at once the timers, the waker,
   and the idempotent and at-least-once operations, so that the drain waits only for the at-most-once ones. Its
   unwritten premise is that every deployment is registered when the drain begins. Decision 0051 registers a deploy
   only once its activations are done, and an activation may start those operations. The drain stops what the
   registered deployments hold as it begins, at `src/runtime.ts:1400` to `1405`. A deploy still activating when the
   launch's scope closes is not among them. The drain waits for the deploy's activation, which `detached` counts. The
   deploy then registers at `src/runtime.ts:1169`, and forks its waker at `1173`. The operations its activations
   started before the drain run on, and `drained` at `1378` counts them. So the drain waits its whole `millis` for
   work that runs again at the next activation, and an at-least-once operation may act in the drain. The waker forked
   in the drain activates entities there, against 0119's rule that the waker activates none. That half is read in the
   code, and not run. The sequence: a first process leaves `toy-1` and `toy-2` with work under way. The second
   deploys a program that adds an at-most-once `b`, in a fiber of the process's body. The activation of `toy-1`
   starts `a`, `c` and `b`, and the deploy is held at the activation of `toy-2` while the scope closes. Once `b` ends,
   the drain still waits, and `a` and `c` are stopped only when its time runs out. Reproduced by `FAILING: a deploy
   that registers during the drain has the operations that run again stopped at once`, in `src/runtime.test.ts`, at
   commit `8b65a28`. One case is only reasoned. Suppose a drain looks between the end of a deploy's last activation,
   which gives the count back, and the deploy's registration. It finds nothing to wait for, and closes the runtime's
   scope. That interrupts an at-most-once operation the deploy started, which then delivers `unknown`. The default
   scheduler runs the deploy to its registration without yielding, so the test above does not reach this case. A fix
   could begin at the drain, which would stop and count the deployments being made too. It could also begin at
   `deploy`, which would refuse to start or to register once `p.draining` is set.
2. **Reasoned, by a reading of the code: on Cluster, a deploy that adds no migration does not outrank the runners it
   replaces, and an older runner steps the rows of the newer code.** The notes are 0159 and 0043, with 0036.
   Decision 0043 keeps a program from reading a row of a version it does not have. Decision 0159 keeps an older
   runner from every shard, and from every commit, by the version recorded. Its premise, never written, is that two
   programs that write differently differ in version. A version is the count of a program's migrations plus one
   (decision 0036, `versionOf` at `src/program.ts:666`). A fix of `update`, a new index, a new topic or a changed
   `work` adds no migration. `recordVersions` accepts a launch at the newest version (`src/storage/cluster.ts:86`),
   `outranked` counts only a version below the newest (`src/storage/cluster.ts:162`), and `atNewest` dies only for a
   version below it (`src/cluster.ts:164`). So in a rolling deploy of such a change both codes hold shards. A shard
   that moves from a newer runner to an older one is stepped by the older code. It moves so when a newer runner
   leaves, or when the deploy is rolled back. Two sequences follow.
   - A newer version adds an index and runs `reindex`. A step on an older runner writes the entity's row with the
     older indexes, which `shownOf` computes (`src/machine.ts:258`), at the same version. A query by the new index
     then misses the entity until a step of the newer code, with no error. Decision 0143 has a row that an older
     version wrote hold that version's index until `reindex` writes it, and here `reindex` has already run.
   - A newer version starts an operation under a new key, and the operation is stored under way. An activation on an
     older runner finds an operation under way that its `work` does not return, and suspends the entity
     (decision 0020). It is loud, and lasts until an operator resumes the entity.

   Not reproduced. A test of `src/cluster.test.ts` with `onFile` and two runners of one version, whose programs differ
   by an index, would show the first sequence. It is a case of family A, and of the step What a deploy may change of
   a program. That step's table asks about a deploy of a newer version and of an older one, and not about one of the
   same number. A fix could begin at `recordVersions`, which would record, beside the version, a digest of what a
   program writes. It could also begin at the launch, which would refuse a program of the newest version whose digest
   differs from the digest of a runner still registered.

### Suspects ruled out

- 0157 against 0156, a name that holds `%`, `_` or a backslash: the rename on PostgreSQL finds a request by `strpos`
  and not by `LIKE`, so no character of the name is a pattern (`src/storage/tables.ts:580`). The text it looks for is
  `JSON.stringify` of the name, and `canonical` writes every request by `JSON.stringify` (`src/machine.ts:196`). So no
  request of the old name is missed.
- 0157 against 0156, the order of a request's keys: `canonical` sorts them, and `JSON.parse` keeps that order,
  integer-like keys included. So `JSON.stringify` of the request with its new name is the text the runtime writes.
- 0119 against 0051, a deploy held inside an activation when the drain begins: the activation is detached and
  counted, so the drain waits for it, and for the at-most-once operations its deploy started. The first form of the
  test of finding 1 passed for this reason.
- 0174 against 0043, a process with no runner address that deploys an older version: it holds no shard. So its
  waker reads no partition, since `due` returns at once on none (`src/storage/entities.ts:507`). `guard` refuses any
  step such a process would make (`src/cluster.ts:393`). What its callers read is bug 62.
- 0122 and 0159, a `reindex` on an older runner of a rolling deploy: the step What a deploy may change of a program
  of the roadmap names that case already.
- 0128 against 0020: `renew` keeps a droppable operation's incarnation only where its JSON is the same, and gives the
  operation the new delivery. An operation stored with another delivery and declared droppable is a defect in
  `reconcile`. The case of at most once is bug 1.
- 0132 and 0133 against 0058 and 0036, a deploy that changes how a key's parameter or a child's id encodes: no
  migration has a kind for keys, so the key's text changes. An operation under way under the old text is then a
  dropped operation, which is a defect at the activation. It is loud, and runs nothing under a new key.
- 0123 against 0022 and 0156: `givenKey` draws the digest from the readable key of `keyedAs ?? name`, so a rename
  keeps the digest. A name taken again after a rename is bug 15.
- 0121 against 0020: `projected` reads the row through the projection's migrations and calls no `project`. So a
  program that suspends its entity at the activation still answers a read, as 0121 says.
- 0138 and 0139 against 0036: a topic compares the canonical text of what it selects, which the program deployed
  computes on both projections. The projection's JSON is the one its schema writes, which the migrations read.
- 0167, 0169 and 0171 against 0156: `rename` moves `waiting`, `sent_requests` and `given_requests` with the other
  rows, in its transaction. Decision 0176 names a request's sender and the receiver of a `Resumed` anew at the door.
- 0110 against 0102, 0101 against 0075, 0157 against 0043, 0123 against 0043, 0247 against 0122 and 0159, and 0174
  against 0156: each later note applies the earlier rule as it is written. No case the later note opens takes away
  a condition of the earlier rule.

### Noticed, not checked

- Finding 1 under the scheduler of the tests: whether a schedule that yields between the end of a deploy's last
  activation and its registration makes the drain end while an at-most-once operation runs. A test under `explored`,
  with the deploy forked as in the test of finding 1 and no hold, would check it. It was not written, for the time it
  takes.
- 0119 against 0102, a planned stop while the main fiber deploys: the interruption reaches the deploy before the
  scope's finalizers run. So the deploy undoes itself, and stops its at-most-once operations before the drain begins.
  They then deliver `unknown`, as after a crash. Whether a planned stop should wait for them is a choice of the design,
  which no note makes, so no test can decide it.

### Not read whole

None. Every note of the list and every note of the area it meets was read whole. For 0133, 0138 and 0139 the code
read is the comparison and the encoding that the pairs rest on, not the whole of composition or of the log.

## 2026-11-11: premise review of the pairs against The runtime, a first part, the notes before 0100

Read by a session that wrote none of these notes, on the branch `claude/premise-pairs-runtime-1-1-eb56fb`, cut from
`main` at `fcd2494` and moved to `743881f` before the reading. It reads the notes 0006, 0011, 0013, 0030, 0040, 0042,
0043, 0045, 0046, 0051, 0056, 0061, 0062, 0075, 0081, 0085, 0090 and 0092 against the notes of area 4 they meet:
0028, 0029, 0063, 0066 to 0068, 0071, 0073, 0074 and 0076 to 0079. The review of that area read these notes in part
or not at all. Its two failing tests are in `src/cluster.test.ts`, at commit `876ea90`.

### The pairs

Each note of the list was read whole, and so was each note of the area it meets. The pairs were found by the table of
the area's report, by the index, and by `grep -w` of each number in both directions. No note of the list meets 0066,
0068 or 0073.

| Pair | What binds it | How it was read |
| --- | --- | --- |
| 0006 and 0029 | 0029 applies 0006 to an unloaded suspended entity | both whole, with `nothingToDo` of `src/runtime/loop.ts` and `onHold` and `due` of `src/storage/entities.ts` |
| 0006 and 0071 | 0071 leaves a suspended entity out, as 0006 has it | both whole, with `interruptedWithin` of `src/storage/entities.ts` |
| 0006 and 0077 | 0077 cites 0006 against suspending an entity it cannot load | both whole, with `waking` of `src/runtime/waker.ts` |
| 0011 and 0029 | 0029 cites 0011 as its reason that an unloaded entity holds no operation | both whole, with `nothingToDo` and `spare` |
| 0013 and 0028 | 0028 cites 0013 as its reason | both whole |
| 0013 and 0029 | 0029 applies 0013's comparison to a passivation | both whole, with `unload` |
| 0030 and 0028 | 0030 changes 0028's rule of JSON into a type | both whole |
| 0040 and 0028 | 0040 applies 0028's defect at creation to an inbound message | both whole, with the encoding of `send` in `src/runtime/callers.ts` |
| 0042 and 0028 | 0042 cites 0028 as its reason | both whole, with `crash` and `loop` of `src/runtime/loop.ts` |
| 0042 and 0067 | 0067 changes 0042's permit | both whole, with `holding` of `src/runtime/process.ts` and `crash` |
| 0042 and 0077 | 0077 changes 0042's consequence for the waker | both whole, with `waking` |
| 0042 and 0079 | 0079 keeps 0042's rule that an interruption is the process's crash | both whole, with `activate`, `detached` and `withEntity` |
| 0043 and 0077 | 0077 changes 0043's consequence for the waker | both whole, with `waking` and the deploy's activations in `src/runtime.ts` |
| 0045 and 0063 | 0063 changes 0045's wait | both whole, with `deployedAs` of `src/runtime/callers.ts` and the registration of `deploying` |
| 0046 and 0063 | 0063 changes 0046's wait for a suspended receiver | both whole, with `entities` and `unlessCrashed` |
| 0046 and 0077 | 0077 applies 0046's `retry` to the waker | both whole, with `waking` |
| 0051 and 0028 | 0051 cites 0028 for an operation's retries | both whole |
| 0051 and 0063 | 0063 changes 0051's consequence | both whole, with `deploy` and `deploying` of `src/runtime.ts` |
| 0051 and 0077 | 0077 cites 0051 for a deploy that fails | both whole, with `deploying` |
| 0056 and 0029 | 0056 cites 0029 for the permit of a crash | both whole, with `crash`, `unload` and `stopAll` |
| 0056 and 0067 | 0067 changes 0056's permit | both whole, with the same code |
| 0061 and 0077 | 0077 cites 0061 against suspending | both whole |
| 0062 and 0077 | 0077 changes 0062's consequence for the waker | both whole, with `rows` of `src/storage/entities.ts` |
| 0075 and 0078 | 0078 changes when 0075's deploy gives its name back | both whole, with `deploy` of `src/runtime.ts`, `register` of `src/cluster.ts`, and `registerEntity` and `registerSingleton` of `cluster/Sharding.ts` in Effect |
| 0081 and 0071 | 0081 says 0071 is the one-process runtime's | both whole, with `activating` of `src/runtime/doors.ts` |
| 0081 and 0074 | 0081 says 0074 does not hold on Cluster | both whole, with `doorStep` of `src/runtime/doors.ts` |
| 0085 and 0063 | 0085 leaves the wait on a suspended entity to 0092, by 0063 | both whole, with `doorStep` and `wait` |
| 0085 and 0074 | 0085 applies 0074 to the message an entity dies on | both whole, with `doorStep` |
| 0090 and 0063 | 0090 cites 0063 against polling | both whole |
| 0092 and 0029 | 0092 keeps 0029's passivation and waker on Cluster | both whole, with `waking`, `held` and the loop's wait |
| 0092 and 0063 | 0092 wakes 0063's senders by `Resumed` | both whole, with `doorStep` and `resumed` of `deploying` |
| 0092 and 0071 | 0092 applies 0071 to a shard gained | both whole, with `serving`, `activating` and `activateOnCluster` |
| 0092 and 0074 | 0092 cites 0074 for a burst | both whole |
| 0092 and 0076 | 0092 keeps 0076's capacity on Cluster | both whole, with `admit` and `entersHeld` |
| 0092 and 0078 | 0092 keeps 0078's spare entity on Cluster | both whole, with `spare` and the loop's settle before an unload |
| 0092 and 0079 | 0092 changes 0079 for an activation on Cluster | both whole, with `doorStep`, `loadIn`, `finishIn`, `settle` and `activateOnCluster` of `src/runtime/doors.ts` |

### Findings

- **Reproduced: on Cluster, a door's step that loads an entity and whose commit fails leaves the entity loaded without
  its `Restart`, and its stored operation never runs.** Decision
  [0079](archive/0079-what-a-caller-sets-going-is-finished-without-it.md) keeps the rule of
  [decision 0042](archive/0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md) that an activation is either
  done or leaves nothing loaded. [Decision 0092](archive/0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md)
  moves the activation on Cluster into the door's transaction. Decision
  [0161](archive/0161-on-cluster-a-step-settles-the-machine-by-the-count-of-the-steps-that-wrote-it.md) enters the
  entity at the step's end, before Cluster commits, and reads a rollback by the held count. The premise that fell: a
  loaded entity runs what its state holds. The sequence: an entity holds an operation and is not loaded on this
  runner, as after a crash of the entity or a restart of the runner. A door's step loads it: `loadIn` steps its
  `Restart` (`src/runtime/doors.ts:208-225`), the message's step writes, and `finishIn` enters the entity with its
  loop and leaves the machine uncommitted (`doors.ts:241-255`). The `COMMIT` fails. Cluster delivers the request
  again. The next step's `settle` reads the held count, and drops the uncommitted machine with the `Started` of its
  `Restart` (`doors.ts:70-83`). It steps the message from the held machine, whose `running` is empty. The operation is
  stored and never started. The entity is never unloaded either, since `nothingToDo` sees the operation
  (`src/runtime/loop.ts:443`). A timer of such an entity is not armed, and fires only once a passivation unloads the
  entity. **Reproduced** by `FAILING: a door step that loads an entity and whose commit fails leaves the entity to run
  its stored operation`, in `src/cluster.test.ts`, at `876ea90`: `Ask` runs once, where it runs again when the second
  commit does not fail. The test unloads the entity by a crash of its completion's commit, as bug 18 does. The same
  holds of `activateOnCluster` (`doors.ts:404-420`), the activation of the waker and of a shard's round, which is only
  reasoned: a failed commit of it is caught and tried again, and the next try finds the entity loaded and returns. A
  fix could begin at `finishIn`, which would enter an entity it loaded only once its commit is known, or at `settle`,
  which would crash an entity whose held machine was never restarted.
- **Reproduced: on Cluster, a deploy that fails after its door is registered leaves every later deploy of its name
  with a closed door.** [Decision 0075](archive/0075-a-name-is-deployed-once-in-a-process.md) gives a failed deploy's
  name back, so that the program can be deployed again.
  [Decision 0078](archive/0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md) does so while
  the deployment is not registered. Both rest on a rule of
  [decision 0051](archive/0051-a-deploy-that-fails-leaves-nothing-running.md): closing the deployment's scope leaves
  nothing registered. On Cluster the door is registered in that scope
  ([decision 0092](archive/0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md)), and Cluster
  never unregisters an entity type. The scope's close marks the type `closed`, and `registerEntity` returns at once for
  a type it holds (`cluster/Sharding.ts:2027` and `:1249` of Effect 4.1.1, read in the source). The sequence: a deploy
  registers its door (`src/runtime.ts:1155`), and dies before its registration step, by an interruption, as decision
  0102 undoes it, or by a singleton that cannot be registered. The scope closes, and the name is given back
  (`src/runtime.ts:1108-1115`). The next deploy of the name succeeds, and its door is the first one's, closed. Every
  request to the program on this runner is refused, and a caller's client is interrupted at once. **Reproduced** by
  `FAILING: a deploy that fails after its door is registered leaves the next deploy of its name a door`, in
  `src/cluster.test.ts`, at `876ea90`, with a singleton registered first under the name the deploy registers first.
  The same runner with no failed deploy before answers `Created`. A fix could begin at `register` of `src/cluster.ts`,
  or at the deploy, which would keep the name for the life of the runner once its door is registered.
- **Reasoned by a reading: under a `retry` of 0, a shard's round on Cluster tries an entity it cannot activate again
  at once, for ever.** It is a third place of family F, beside bugs 17 and 45. `activating`
  (`src/runtime/doors.ts:498-501`) repeats a round that failed on `Schedule.spaced` of `retry`, which
  [decision 0077](archive/0077-the-waker-tries-an-entity-it-cannot-load-again.md) chose above 0, and
  [decision 0208](0208-a-launch-checks-every-option.md) allows 0. Each round reads the shard's interrupted entities and
  opens a transaction for each. So a row no version reads keeps the file's one writer busy, and the process is
  settled only between two rounds. A fix of bug 17 at `waker.ts` alone leaves it. The family's rule, a launch that
  refuses 0 or a least time of a wait, holds it.

### Ruled out

- 0006 against 0029, 0071 and 0077: `due` and `interrupted` leave out every suspended entity by `onHold`
  (`src/storage/entities.ts:476-519`), so no timer wakes a suspended entity and no deploy starts one.
- 0011 against 0029: `nothingToDo` reads the stored keys, so a passivation never leaves an operation stored with
  nothing running. The cases where something else does are bugs 1, 14, 18 and 61, and the first finding above.
- 0013 against 0028 and 0029: a passivation commits nothing, and a step that writes nothing is observed at once, so the
  comparison with the machine replays every event that wrote.
- 0030 and 0040 against 0028: a caller's message and sender are encoded before the entity is reached, on one process
  and on Cluster (`src/runtime/callers.ts:300`), so a message that does not encode is the caller's defect and touches
  no entity.
- 0042 against 0067 and 0079: a crash runs under the entity's lock, from the loop, an activation and a door's step,
  and touches no database while it holds the lock, as decision 0161 asks on Cluster.
- 0043 and 0062 against 0077: a deploy whose activation meets a row no version reads still dies as a whole, as 0043
  decides and 0077 keeps. 0071 widens what a deploy activates to the entities with a message, which 0074 narrows to the
  completions and firings recorded. 0043's consequence that a rollback is not refused is wider than its own rule where
  an interrupted entity was written by the newer version, and the rule is the decision.
- 0045 against 0063: the signal of a name is completed in the uninterruptible step that registers the deployment, so a
  deploy that fails leaves the operations waiting for the next one.
- 0046 against 0063 and 0077: `retry` is waited after a crash and after `Full` alone, and a suspended receiver is waited
  for by its resumption. A `retry` of 0 is bug 32.
- 0051 against 0063 and 0077: the activations of a deploy are forked in the deployment's scope, which its close stops.
  On Cluster the door is the exception, which the second finding holds.
- 0056 against 0029 and 0067: an unload runs only where `nothingToDo` finds no operation, so `stopAll` under the lock
  interrupts timers alone, whose sleep waits for nothing.
- 0061 against 0077: a failed activation stores nothing, and the waker's retry suspends nothing.
- 0081 against 0074: the door steps a `Receive` with its time, and the machine handles it at once where the mailbox is
  empty, so 0074 holds of the runtime's mailbox on Cluster too. 0081's consequence that it does not is wider than the
  code, and loses nothing.
- 0081 against 0071: a shard's round reads the runtime's keys and mailbox of the shard, as 0092 decides in place of
  0081's sentence.
- 0085 and 0090 against 0063: a sender answered `Suspended` on Cluster waits for `Resumed`, and nothing polls. A
  `Resumed` to a sender no runner deploys is bug 20.
- 0092 against 0029, 0076 and 0078: the loop settles an uncommitted machine before it unloads, and an entity enters
  on Cluster through `entersHeld`, which runs `admit`. A door's step that writes nothing and counts no use is in the
  review of the pairs against Versions and deploys.

### Noticed, not checked

- The second finding by an interruption of the deploy between `cluster.register` and the step that registers the
  deployment, which decision 0102 undoes on one process. No probe marks that point, so the test makes a singleton's
  registration die instead. The same closed door would be kept under each name a rename leaves, the `formerly` of
  `register`, which was not run.
- The first finding through `activateOnCluster`, from the waker and from a shard's round. The reading above shows the
  sequence. No test was written, since a probe reaches the commit of an activation only where its `Restart` writes.

### Not read whole

None. Every note of the list and every note of the area it meets was read whole, with the code that keeps its rule.

## 2026-11-11: premise review of the pairs against The runtime, a first part, the notes from 0100

The notes read are 0101, 0102, 0103, 0109 to 0114, 0116, 0119, 0127, 0128, 0130, 0134, 0135, 0142, 0147, 0151, 0162
to 0164, 0167, 0172, 0177, 0194, 0205 and 0220. Each was read against the notes it meets of area 4: 0028, 0029, 0063,
0066 to 0068, 0071, 0073, 0074 and 0076 to 0079. Every note of both lists was read whole, with the code that keeps its
rule. The pairs were found by the area's table, the index and a search of each note's number in both directions. The
failing test is on the branch `claude/premise-pairs-runtime-1-2-876ced`, in the commit of this section. One finding is
reproduced, and one is only reasoned.

### The pairs

| Later note | Earlier note | What binds them | How it was read |
| --- | --- | --- | --- |
| 0101 | 0066 | corrects a premise of | both whole, with the tests' use of `TestClock` |
| 0101 | 0068, 0076, 0078 | cites their tests under budgets | both whole |
| 0102 | 0078 | corrects | both whole, with `deploy` and `deploying` in `src/runtime.ts` |
| 0102 | 0076, 0079 | cites as what a failed deploy undoes | both whole, with `forgetUse` and `detached` |
| 0103 | 0066 | adds to | both whole |
| 0103 | 0078 | corrects | both whole, with `admit`, `spare` and the loop's `Evict` |
| 0103 | 0029, 0077 | cites the timers and retries `settled` counts | both whole, with `quiet` and `waking` |
| 0103 | 0076, 0079 | cites | both whole |
| 0109 | 0076 | adds to what `settled` waits for | both whole, with `unload` and `quiet` |
| 0109 | 0068, 0073 | cites as its reason | both whole, with `leave` and the probe's `Unloaded` |
| 0110 | 0079 | corrects | both whole, with `detached` |
| 0111 | 0029 | adds a rule to the wait of | both whole; replaced by 0116 |
| 0112 | 0078, 0079 | changes what they rest on | both whole, with every fork of `src/runtime.ts`, `loop.ts` and `callers.ts` |
| 0113 | 0029 | replaces a premise of | both whole, with `nothingToDo`, `spare`, `perform` and `interruptedWithin` |
| 0114 | 0063 | applies its registration as | both whole, with `awaitResumption` and `waitingFor` |
| 0114 | 0028, 0066 | cites | both whole |
| 0116 | 0029 | changes how its wait runs out | both whole, with `steps` |
| 0119 | 0063 | applies its signal as | both whole, with the drain, `emptied` and `drained` |
| 0119 | 0076, 0079 | cites | both whole, with `start`, `arm` and `admitted` |
| 0127 | 0076 | cites as its reason | both whole; no code changes |
| 0128 | 0063 | cites as its reason | both whole, with `drop` |
| 0130 | 0063 | cites as its reason | both whole |
| 0134 | 0028 | changes | both whole, with `again` in `steps` |
| 0134 | 0068 | cites as its reason | both whole |
| 0135 | 0028, 0073 | cites as its reason | both whole, with `warnOfSize` |
| 0142 | 0063 | cites as its reason | both whole, with `waited` and `tell` |
| 0147 | 0074 | changes | both whole, with the permits of `send` and `steps` |
| 0147 | 0063, 0067, 0076 | cites | both whole, with `entities` of `callers.ts` |
| 0151 | 0076 | changes | both whole, with `admit` and the launch's options |
| 0151 | 0029, 0078 | cites | both whole |
| 0162 | 0071 | applies for one shard | both whole, with `activating`, `serving` and `losing` in `src/runtime/doors.ts` |
| 0162 | 0063 | cites as its reason | both whole |
| 0163 | 0063 | narrows on Cluster | both whole, with the watcher in `launchWith` |
| 0164 | 0063, 0068 | cites the counts it keeps | both whole, with `offer`, `detached` and `forkHeld` |
| 0167 | 0063 | applies as on one process | both whole, with `awaitResumption` |
| 0172 | 0063, 0067 | says how they hold on Cluster | both whole, with `holding` and `activateOnCluster` |
| 0177 | 0063, 0067, 0068 | keeps | both whole |
| 0194 | 0029 | adds a premise to | both whole, with `arm` and `waking` |
| 0205 | 0028 | changes | both whole |
| 0220 | 0074 | cites as a premise | both whole, with `linkOf` and the replies of `src/machine.ts` |

### Finding 1, reproduced: 0114 against 0063, 0071 and 0113

- Decision 0114 lists, for each suspended entity, the operations that wait for its resumption. It reads them from the
  senders registered in the process, since decision 0063 has a sender register before it sends. It says the list is
  whole once a restarted process is settled, since every operation under way sends again and registers again.
- That premise needs every operation under way to run again after a restart. Decision 0113 keeps the operations of a
  suspended entity running. Decision 0071 has a process start no suspended entity, and `interruptedWithin` leaves
  them out (`src/storage/entities.ts:476` and `:488`). So the operation of a suspended sender runs and is listed
  until the process stops. After a restart it neither runs nor registers.
- The sequence: the toy is suspended. A sender's operation sends to it, is answered `Suspended`, and waits. The sender
  then suspends on a message of its own, and the operation keeps waiting. `suspended` of the toy lists it. The process
  stops, another starts on the database, and it is settled. `suspended` of the toy now lists no one waiting, though
  nothing stored changed.
- Nothing is lost: the operation sends again once its sender is resumed. An operator who reads the list to choose what
  to resume first is told one thing before a restart and another after it.
- Reproduced by `FAILING: after a restart, a suspended entity lists the operation of a suspended sender that waits for
  it`, in `src/runtime.test.ts`, in the commit that adds this report. The check of the list before the restart passes,
  and the list after it is empty.
- A fix could begin at `waitingFor` of `src/runtime/callers.ts:60`, or with a note that narrows the promise of 0114 to
  the operations that run. On Cluster the waiting senders are stored as rows (decision 0167), and bug 63 is how
  `suspended` reads them there.

### Finding 2, only reasoned: 0162 against 0071 and 0077, under a `retry` of 0

- Decision 0162 starts, on Cluster, the entities of a shard that hold work, as decision 0071 does for a process. A
  round that fails is made again after `retry`, the choice decision 0077 made for the waker. Decision 0077 rejected
  trying again at once, since one row no version reads would keep the waker busy for ever. Decision 0208 allows a
  `retry` of 0. Bug 17 is the waker under it, and the open question A retry of no time lists the waker, a sender and a
  passivation, and not this round.
- The sequence: on Cluster, under a `retry` of 0, a shard holds an entity whose activation always fails, such as one
  whose row a newer version wrote. `activating` repeats its round with `Schedule.spaced` of 0 millis
  (`src/runtime/doors.ts:499`). Each round reads the shard's interrupted entities and activates each one the
  deployment does not hold. The next round starts with no wait. The rounds take the runner's one connection again and
  again, for as long as the entity cannot be loaded. Between two rounds `p.detachments` is 0, so `settled` may return,
  unlike in bug 17.
- No test was written. A round that fails needs two runners and a row no version reads, and the reading is the same
  as bug 17's. It belongs to family F.
- A fix could begin where the fix of bug 17 does: a least time for a retry the runtime sleeps, or a launch that
  refuses 0.

### Ruled out

- 0128 against 0063, through the drain of 0119: `drained` does not count an operation that `drop` interrupts, though
  0128 says a planned stop waits for it. The inner scope closes after the drain, and a scope's close waits for the
  fibers it interrupts, among them the fiber that `drop` forks.
- 0113 against 0029 and 0076: `nothingToDo` checks the running operations before the suspension. So a suspended
  entity with an operation under way is neither unloaded nor spare. Its completion is offered before `forkHeld`
  takes it out of `operations`.
- 0147 against 0074: a caller's message that finds a message ahead of it in the mailbox is answered `Accepted` at
  once (`src/machine.ts:1024`). So no caller waits for a message of the stored mailbox, as 0147 rests on.
- 0220 against 0074: after a resume, the message the entity died on is handled by a `Handle`. Its caller was answered
  `Suspended`, which deleted the caller's link (`src/runtime/loop.ts:298`), so no caller that waits loses a link.
- 0164 against 0063: an event offered to an entity that left the process keeps `pending` raised on a `Loaded` that
  `quiet` and `drained` no longer read. Both read only the entities the deployment holds.
- 0112 against 0079: the forks of `loop` in `activate` and `create` run in the fiber that `detached` forks
  interruptible. The uninterruptible regions of `send` and `operate` fork nothing.
- 0172 against 0067: every taker of an entity's lock on Cluster that loads takes it inside a transaction: a door's
  step, `activateOnCluster`, and the waker through it. The takers outside a transaction, `losing` and the start after
  a commit, run no statement under the lock.
- 0110 against 0162: the round counts itself in `p.detachments` by one `acquireUseRelease`, so an interruption of the
  singleton gives the count back.
- 0102 against 0079: a detached activation of a deploy that fails is stopped by the deployment's scope, and its count
  is given back by the fiber of 0110. A `Restart` committed before the stop is what the next deploy activates from.
- 0109 against 0068, on the two rules of 0068 that 0109 says no test held: the review of 0098 to 0104 in this file
  gave each a test.
- 0116 against the waker, which races a take of its poke against a sleep: ruled out by the review of area 5, and read
  again here. A poke lost there is lost before a reading that reads the storage anyway.

### Noticed, not checked

- None beyond finding 2, which a reading checked.

### Not read whole

None. Every note of the list and every note of the area it meets was read whole, with the code that keeps its rule.

## 2026-11-11: premise review of the pairs against The runtime, a second part

Read by a session that wrote none of these notes, on the branch `claude/premise-pairs-runtime-2-4e02ac`, cut from
`main` at `fcd2494` and moved forward to `743881f` before the reading. It reads the notes 0011, 0028, 0029, 0046,
0066, 0074, 0076, 0078, 0079, 0128, 0135, 0142, 0151, 0161, 0162, 0184 and 0192 against the notes of area 5 they
meet. The review of The runtime, without the scheduler of the tests, a second part read these notes in part or not at
all. One finding is reproduced.

### The pairs

The pairs were found by the table of the area's report, by the index, and by `grep -w` of each number in both
directions. Every note of the list and every note of the area it meets was read whole, and so were 0220, 0221, 0243
and 0246, which change or extend a note of a pair. The code read whole: `src/runtime/loop.ts`, `process.ts`,
`waker.ts`, `doors.ts`, `callers.ts` and `readings.ts`, and `launchWith` of `src/runtime.ts`, with its drain,
`quiet`, `drained` and the handle.

| Pair | What binds it | How it was read |
| --- | --- | --- |
| 0011 and 0119 | 0119 decides the drain 0011 asks for | both whole, with the drain's finalizer, `admitted` and `drained` of `src/runtime.ts`, and `start` of `loop.ts` |
| 0128 and 0119 | 0128 cites 0119 for a droppable operation in a planned stop | both whole, with `start`, `drop` and the drain's stop of `rerun` |
| 0028 and 0134 | 0134 changes 0028's loop | both whole, with `steps` of `loop.ts` |
| 0135 and 0134 | 0135 cites 0134 as its reason that a busy entity holds the others one step | both whole, with `warnOfSize`, `steps`, and every write of a step in `loop.ts`, `callers.ts` and `doors.ts` |
| 0029 and 0103 | 0103 tests 0029's timers due in `settled` | both whole, with `quiet` and `waking` |
| 0029 and 0111, 0116 | 0111 and then 0116 change 0029's wait | all whole, with `steps`, `nothingToDo` and `unload` |
| 0029 and 0194, 0221 | 0194 adds to 0029's timers, and 0221 changes 0194 | all whole, with `arm`, `waking` and `due` of `src/storage/entities.ts` |
| 0046 and 0147 | 0147 changes 0046's sender | both whole, with `entities`, `send` and `unlessCrashed` of `callers.ts` |
| 0066 and 0101, 0103 | 0101 corrects 0066, and 0103 adds to it | all whole, with every read of a clock in `src/` |
| 0074 and 0147 | 0147 changes 0074's burst | both whole, with `send` and `steps` |
| 0074 and 0220 | 0220 cites 0074 as its reason that a `Receive` serves its caller | both whole, with `linkOf` and `steps` |
| 0076 and 0109 | 0109 adds to 0076's `settled` | both whole, with `admit`, `spare`, `unload` and `quiet` |
| 0076 and 0101, 0103, 0119, 0147 | each cites 0076 | all whole |
| 0078 and 0103, 0101 | 0103 corrects 0078, and 0101 cites it | all whole, with `spare` and `admit` |
| 0078 and 0112 | 0112 changes what 0078 rests on | both whole, with the deploy's registration and the fork of its waker |
| 0079 and 0110, 0112 | 0110 corrects 0079, and 0112 changes what it rests on | all whole, with `detached`, `activate`, `crash` and `withEntity` |
| 0079 and 0103, 0119 | each cites 0079 | all whole, with the drain's count of `detachments` |
| 0142 and 0119, 0120 | 0142 cites both as its reason that a wait ends after the drain | all whole, with `waited` of `readings.ts` and the order of the finalizers of `launchWith` |
| 0177 and 0142 | 0177 cites 0142, and 0246 corrects 0177 | all whole |
| 0151 and 0147 | 0151 cites 0147 for what a busy entity holds | both whole |
| 0161 and 0164 | 0164 changes 0161's forks | both whole, with `untransacted`, `settle`, `finishIn`, `doorStep` and `applyOnCluster` |
| 0161 and 0243 | 0243 adds to 0164 what Effect does with a fork it misses | both whole |
| 0184 and 0164 | 0184 cites 0164 for a reader that tells its transaction | both whole, with `consume` of `src/runtime.ts` and `waited` |
| 0192 and 0164 | 0192 keeps a rule by a check of the code, as 0164 does | both whole; the walk of imports in `src/form.test.ts` not read, since the pair shares only the method of a check |
| 0162 and 0112 | 0112's rule holds of every fork of 0162's uninterruptible activation | both whole, with `activateOnCluster` and `finishIn` |
| 0162 and 0219, 0110, 0109 | 0219 opens the drain on Cluster over 0162's shards, whose rounds are counted as detached work | all whole, with `serving`, `activating` and `losing` |

### Finding 1, reproduced: on Cluster a door's step never warns of a large state (0135, 0161)

- Decision 0135 has the runtime warn of a step that writes more than `warn.characters`, once per activation. The
  warning is how an operator finds the entity that holds the others, since a step holds the thread for as long as
  its write takes. It rests on a premise no note wrote: every step that writes gives the length `write` returns to
  `warnOfSize`. On one process the premise holds. The loop's steps warn at `src/runtime/loop.ts:404`, and a creation
  at `src/runtime/callers.ts:265`.
- Decision 0161 made the steps of a request on Cluster a door's step, written in Cluster's transaction: the
  `Restart` of an entity the door loads, a creation, a message's arrival and each `Handle` up to its answer. Since
  decision 0165 every caller's message and creation on Cluster takes that path. `stepIn` writes at
  `src/runtime/doors.ts:189`, and the creation of `doorStep` writes at `src/runtime/doors.ts:321`. Both drop the
  length, and neither `finishIn` nor `settle` warns. Only `applyOnCluster`, which steps the entity's own events,
  warns, at `src/runtime/doors.ts:141`.
- The sequence: a runner launched with `warn: { characters: 1 }` deploys a program, and a caller creates an entity
  and sends it a message. Both steps write past the threshold, and nothing is logged. So a program whose state grows
  with its callers' messages never warns on Cluster, where on one process it warns at the first such step. The
  completion of an operation of the same entity does warn on Cluster: a check run in the session saw it, and is not
  kept.
- Reproduced by `FAILING: on Cluster a door step that writes past the threshold warns once per activation, as on one
  process`, in `src/cluster.test.ts`, in the commit of this report. It failed in its one run, with no warning logged.
- It is a case of family C of the step of bugs: a rule of one process that holds otherwise on Cluster.
- Where a fix could begin: `stepIn` and the creation of `doorStep` keep the length each write returns, in the
  transitions of `Stepping`. Then `finishIn`, for a step that wrote nothing, and `settle`, once the count proves the
  commit, give it to `warnOfSize` on the entity's `Loaded`. Whether a step that rolls back may warn is a choice of
  the fix, since 0135 warns of what a step writes, and a step rolled back wrote it too.

### Suspects ruled out

- 0119 against 0011: every step of a drain on one process that stores an at-most-once operation starts it, in
  `start` at `src/runtime/loop.ts:222`, and `drained` counts it from `forkHeld`. A step stores one without starting it
  only in a crash of the entity, which is a crash, and in the door's step on Cluster, which is bug 21.
- 0119 against 0128: the drain stops the operations of `rerun`, droppable ones among them, by `stop`. `stop` waits for
  each operation's finalizers, one after the other, before the drain's timeout begins (`src/runtime.ts:1401-1408`).
  So a droppable runner's slow finalizer lengthens the drain past `millis`, though 0128 has the entity wait for no
  such finalizer. The at-most-once operations run on meanwhile and gain the time, and nothing is stored or delivered
  otherwise. A finalizer that never ends would hold the closing of the deployment's scope in any case.
- 0128 against 0119: a droppable operation is not started in the drain, and is stopped at once with the others that
  run again. It runs again at the next activation, as 0128's consequences say. A step of the drain that changes one
  is bug 6.
- 0116 against 0029: an item offered without raising `pending` is an `Evict`, a `Passivate`, or the `Settle` that
  `losing` and a door's crash offer to a loop whose entity has left. `nothingToDo` reads `pending`, so no event
  offered under the lock is lost to an unload. The `Settle` of a crash leaves `pending` at -1 on a `Loaded` that no
  map holds, and neither `quiet` nor `drained` reads it.
- 0194 and 0221 against 0029: the waker reads a timer due by the wall clock, and fires none early. A loaded entity
  whose timer's sleep runs up to an hour past a clock set forward is unloaded by its passivation, and the waker then
  fires the timer at once.
- 0221 against 0078: `spare` reads `at > now` on the wall clock that the timer reads after each sleep, so a clock
  set back or forward leaves the two in agreement.
- 0103 and 0066 against the code: no module of `src/` reads `Date.now` or sets a timer of the host. `waited` reads
  `Clock.currentTimeMillis`, which `ahead` moves as it moves `DateTime.now`.
- 0147 against 0046: a sender given `Full` and a sender whose receiver crashed both send again under the same request
  after `retry`, and `Full` stores nothing of the message. A `retry` of 0 is bug 32.
- 0220 against 0074: a `Receive` on one process always meets an empty mailbox or a suspension. The loop handles the
  mailbox before it takes an event, and `activate` applies the `Restart` before it forks the loop that handles a
  message the crash left.
- 0147 against 0074: a caller whose permit is taken has offered its event in the same uninterruptible region, and a
  crash fails every caller registered, so no caller waits on the semaphore of a `Loaded` that left.
- 0109 and 0076 against 0162: an entity of a shard lost crashes, and `leave` takes it out of `recent`, so it holds no
  place under the capacity. `entersHeld` admits an entity as `enter` does.
- 0110 and 0079 against 0119 on Cluster: the round of a shard gained is counted in `detachments`, which `drained`
  waits for, and an activation in the drain starts its at-most-once operations alone.
- 0119 and 0120 against 0142: `closing` is completed by a finalizer that runs between the drain and the closing of
  `running`, in the runtime's own sequential scope, whatever its caller's strategy is.
- 0164 against 0161: what `settle` performs inside the door's transaction forks through `untransacted`, in `start`,
  `drop` and `arm`. A timer stopped inline there waits only for its sleep.
- 0164 against 0184: a reader of `consume` refuses a transaction in its services, and no fork of the runtime keeps
  one. So a reader the runtime forks is never refused, and a reader a caller runs in its transaction always is.
- 0147 against 0151: what a busy entity holds is bounded per entity on one process. On Cluster a caller's message
  waits in Cluster's table (decision 0165), and the bound of resident entities is bug 54.
- 0134 against 0028 and 0135: the loop's yield stands after `warnOfSize`, and a step under the threshold yields
  nowhere.
- 0112 against 0162 is bug 22, and 0219 against 0162 is bugs 21, 34 and 35.
- 0177 and 0246 against 0142: nothing of 0142's wait changes, since both keep its `Deferred` of a topic.

### Noticed, not checked

- The warning of a full entity, 0147's, has no counterpart on Cluster, where no caller is answered `Full`
  (decision 0165). A burst on Cluster waits in Cluster's table, and nothing names the entity it waits for. That is
  what 0165 decides. It was not weighed against 0135's reason for a warning: an operator who sees every entity slow
  down has nothing that names the one that holds them. It is a question of the design, which no test decides.

### Not read whole

None of the list, and none of the area. `src/form.test.ts` was not read, as the table says of 0192.

## 2026-11-11: premise review of the pairs against Schemas and projections, a first part, the notes before 0100

The reviewer's report, whole, as its session wrote it.

Branch `claude/premise-pairs-schemas-1-1-f736ec`, cut from `main` at `743881f`. One finding, reproduced. The
report of area 6 was read whole, with what it ruled out. The reviews of the areas that hold the notes of the list were
read through the step of bugs of `docs/roadmap.md` and the open questions, and by a search of `reviews.md` for the
waker.

### The pairs read

| Later note | Note of the area | What binds them | How they were read |
| --- | --- | --- | --- |
| 0031 | 0026 | cites 0026 as its reason: `projectionViolations` checks what a tag would prove | both whole, with `Types` of `src/program.ts` and `projectionViolations` of `src/testing.ts` |
| 0033 | 0032 | applies its rule as 0032 does: `key` is a slot of `Types`, as `index` is | both whole, with `keys` and `indexesOf` of `src/program.ts` |
| 0034 | 0025 | cites 0025 as its reason: an operation is a value with a schema, so its answer is no part of it | both whole, with `Runners` of `src/program.ts` |
| 0035 | 0025 | cites 0025 as its reason: the schemas come first, since everything that leaves the process is written with them | both whole, with `program` of `src/program.ts` |
| 0035 | 0032 | applies its rule as 0032 does: `index` is inferred from `indexes` | both whole, with `program` and `indexesOf` |
| 0036 | 0025 | changes it: a stored operation is read through the migrations, then compared | both whole, with `up` of `src/storage/held.ts` and the reading of keys in `src/storage/entities.ts` |
| 0036 | 0030 | cites 0030 as its reason: a migration is a function on the JSON a schema encodes to | both whole, with the migrations' types in `src/program.ts` |
| 0036 | 0032 | changes it: a projection's row is read through the migrations, and `reindex` writes it again | both whole, with `query`, `projected` and `reindex` of `src/storage/projections.ts` and `row` of `src/storage/entities.ts` |
| 0038 | 0036 | applies 0036's rule: a row of the log carries its version, and is read through the migrations | both whole, with `published` of `src/storage/log.ts` |
| 0072 | 0036 | applies 0036's rule: a projection whose schema changes is migrated in the log | both whole, with `published` of `src/storage/log.ts` |
| 0046 | 0040 | cites 0040 as its reason: a message that does not encode is the sender's own defect | both whole, with `Faulted`, `unlessCrashed` and `entities` of `src/runtime/callers.ts`, `doorStep` of `src/runtime/doors.ts` and `delivered` of `src/storage/entities.ts` |
| 0048 | 0027 | changes it: a caller's request is keyed by its sender as `schemas.sender` writes it | both whole, with `reply` of `src/storage/entities.ts` |
| 0048 | 0040 | applies 0040's rule: a sender that does not encode is the caller's defect | both whole, with `Faulted` of `src/runtime/callers.ts` |
| 0049 | 0040 | applies 0040's rule to the flags, encoded before `init` | both whole, with `deliveredCreation` of `src/storage/entities.ts` |
| 0077 | 0062 | changes it: the waker goes on past an activation that fails | both whole, with `waking` of `src/runtime/waker.ts`, `due` of `src/storage/entities.ts`, `Rows.due` of `src/storage/rows.ts`, and `sweepOf` and `settled` of `src/runtime.ts` |

### Finding 1, reproduced: 0077 against 0062

- The premise that fell: 0062 fails the call that meets a row its table's schema refuses, and says the process goes on
  serving what it can read. Its consequence names the waker among the readings that fail. 0077 changes that
  consequence, and 0062's status line now says the waker goes on. But 0077 covers an activation alone. The waker's own
  reading of the timers is a reading of rows too, and nothing catches it. So the rule of 0077 holds only where the
  failure is one entity's, after the waker's reading.
- The sequence: two entities of a program are unloaded with timers due at 40. An operator's fix leaves the `due` of a
  key of `w-1` at `1000.5`, a value no integer is. At 40 the waker reads the entities due, and finds `w-2`. It then reads
  the next time, `MIN(due)` by entity, and meets `w-1`'s row. `Rows.due` refuses its `at` (`src/storage/rows.ts:229`),
  and `due` dies by its `Effect.orDie` (`src/storage/entities.ts:504-540`). The defect leaves `waking` before the loop
  that activates `w-2` (`src/runtime/waker.ts:33-48`). The waker's fiber ends, forked in the deployment's scope with no
  one joining it (`src/runtime.ts:1173`). Every timer of the program then stops for the life of the process, which is
  the case 0077 was written for. `waker.busy` stays true, so `settled` never returns again (`src/runtime.ts:1349`). The
  sweep beside it catches a failure and logs it (`src/runtime.ts:261-275`). The waker logs nothing.
- Reproduced by `FAILING: a row the waker’s own reading refuses stops every timer of the program, as 0077 says it no
  longer does`, in `src/runtime/waker.test.ts`, at the commit of this report. `w-2`'s timer never fires. With a `due`
  of `1000`, an integer, the same test passes. Run: `bun test src/runtime/waker.test.ts -t "FAILING"`.
- Where a fix could begin: `waking` in `src/runtime/waker.ts` could catch a reading that dies, as `sweepOf` does, and
  read again after `retry`, never at once, as 0077's alternatives say. Or `due` could leave out the entity whose row it
  refuses, and put it in `waker.failed`. It is of no family of the step of bugs yet. It is near family E: here every
  entity of a program keeps stored work that nothing loads again.

### Suspects ruled out

- 0031 against 0026: a state with no tag leaves `projectionViolations` the same check, since the check takes states and
  candidates and reads no phase (`src/testing.ts`).
- 0033 against 0032: `keys` is a slot of `Types` the machine does not read, and takes nothing from the rule that a
  query dies on an index the program was not deployed with.
- 0034 against 0025: the answer of a runner is stored nowhere, so a new version that answers an operation otherwise
  reads its stored operation by its schema as before.
- 0035 against 0025 and 0032: the constructor infers the types and casts `indexesOf` once, and stores nothing.
- 0036 against 0032, a query of a row an older version wrote: `query`, `read` and `published` read each row through
  `up('projection', version)` (`src/storage/projections.ts:349-352` and `:461`, `src/storage/log.ts:164`). A query
  still filters by the indexes the older version computed. 0036 and the JSDoc of `reindex` say so, and an operator
  runs `reindex` after such a deploy.
- 0036 against 0032, a row written only when the state changed: a new `project` over the same state leaves the old row
  until a step or `reindex`, which the JSDoc of `read` says (`src/runtime.ts:360-366`).
- 0036 against 0030: a migration's output is decoded by the program's schema. The activation encodes the state and
  its work again and checks that they are JSON (0040), so a migration that gives `NaN` suspends the entity.
- 0038 and 0072 against 0036, after 0138: a row of the log holds the whole projection. The topic's selector runs on it
  once it is migrated (`src/storage/log.ts:164-177`), so the projection's migration is applied to a projection.
- 0048 against 0027, two senders of version 1 that one migration writes alike: `reply` gives the first row whose
  migrated key matches, in no order (`src/storage/entities.ts:209-228`). 0048 says two senders the schema writes the
  same are one caller, so either reply is that caller's.
- 0046 against 0040, on Cluster: an older runner's operation sends a message its schema encodes, and the newer door
  refuses it with a schema that checks more. `delivered` dies (`src/storage/entities.ts:575-583`). The operation reads
  the defect as a crash of the receiver (`unlessCrashed`, `src/runtime/callers.ts:364-366`), and sends again after
  `retry` for ever (`:420-424`). It is a deploy whose schema refuses what the older version wrote. On one process a
  stored message gives the same (0043), and 0046's consequence says such a receiver keeps its senders waiting for ever.
  It is family A. The step What a deploy may change of a program names the internal messages among its pieces, and not
  the inbound ones, which this case is of.
- 0049 against 0040: the flags of a creation on Cluster, read with no migration (`deliveredCreation`,
  `src/storage/entities.ts:585-590`), are bug 56. A creation that dies at the door is bug 58.
- 0077 against 0062, a `retry` of 0, and the waker's map on Cluster: bugs 17 and 33.

### Noticed, not checked

None.

### Not read whole

None. Every note of the list and every note of the area it meets was read whole, with the code that keeps its rule.

## 2026-11-11: premise review of the pairs against Schemas and projections, a first part, the notes from 0100

Read by a session that wrote none of these notes, on the branch `claude/dazzling-darwin-f09ea9`, fast-forwarded to
`main` at `743881f`. The failing tests are at commit `2f0867e`. It reads the notes 0101, 0120 to 0122, 0135, 0138 to
0143, 0146, 0148 to 0150, 0152, 0159, 0180, 0184, 0197, 0206, 0210, 0213 and 0245 against the notes of area 6 they
meet. The review of Schemas and projections, a first part, read these notes in part or not at all. Two findings are
reproduced.

### The pairs

The pairs were found by the table of the area's report, by the index, and by `grep -w` of each number in both
directions. Every note of the list and every note of the area was read whole.

| Pair | What binds it | How it was read |
| --- | --- | --- |
| 0101 and 0070 | 0101 names 0070's test among those a moved clock serves under a budget | both whole, with `reindex leaves no row a step has moved past, under prioritized schedules` in `src/runtime.test.ts` |
| 0120 and 0098 | 0120 cites 0098 only as the name of the review that found it | both whole; nothing of 0098's rule is used |
| 0121 and 0032 | 0121 makes `read` answer from 0032's row | both whole, with `projected` of `src/storage/projections.ts` |
| 0122 and 0070 | 0122 changes `reindex`, whose write 0070 guards | both whole, with `reindex` of `src/storage/projections.ts` |
| 0135 and 0032, 0038 | 0135 counts the rows of 0032 and 0038 in its warning | all whole |
| 0138 and 0032, 0038, 0039, 0040, 0072 | 0138 changes 0038, 0039 and 0072, and applies 0032's index and 0040's check to a topic | all whole, with `shownOf` of `src/machine.ts` and `src/storage/log.ts` |
| 0139 and 0025, 0030, 0032 | 0139 changes 0032, and cites 0025 and 0030 | all whole, with `program` of `src/program.ts` |
| 0140 and 0038, 0072 | 0140 applies 0072's comparison to what a row gives | all whole, with `published` of `src/storage/log.ts` |
| 0141 and 0032, 0039 | 0141 changes both | all whole, with `counted` of `src/runtime.ts` |
| 0142 and 0039 | 0142 changes 0039's `feed` | both whole, with the waits of `src/runtime.ts` |
| 0143 and 0032 | 0143 changes 0032's query | both whole, with `query` and `storedIndexes` of `src/storage/projections.ts` |
| 0146 and 0040 | 0146 cites 0040 for the text it writes | both whole, with `indexesText` and `bound` of `src/storage/projections.ts` |
| 0148 and 0032 | 0148 changes 0032's read model | both whole, with `sum` and `count` of `src/storage/projections.ts` |
| 0149 and 0032, 0039 | 0149 cites both as its reason | all whole |
| 0150 and 0032, 0039 | 0150 changes 0039's ack | all whole, with `ack` of `src/storage/log.ts` and `countBy` |
| 0152 and 0039 | 0152 changes 0039's consumers and prune | both whole, with `declare`, `ack`, `pruneBatch` and `forget` of `src/storage/log.ts`, and `topical`, `consumersOf` and `enlisted` of `src/runtime.ts` |
| 0159 and 0039, 0070, 0032 | 0159 adds an older runner that runs on beside a newer one | all whole, with `reindex` of `src/storage/projections.ts` and the helpers of `two runners on one file` in `src/cluster.test.ts` |
| 0180 and 0030 | 0180 cites 0030 for the sender it gives | both whole |
| 0184 and 0039 | 0184 changes 0039's loop of a consumer | both whole, with `consume` of `src/runtime.ts` |
| 0197 and 0030 | 0197 cites 0030 for a key's parameter | both whole, with `key` of `src/program.ts` |
| 0206 and 0032 | 0206 changes 0032's index | both whole, with `shownOf` |
| 0210 and 0040 | 0210 changes 0040's check | both whole, with `isJson` and `encode` of `src/program.ts` |
| 0213 and 0026 | 0213 changes 0026's `allows` | both whole |
| 0245 and 0039 | 0245 runs 0039's prune at an interval, in batches | both whole, with `prune` and `pruneBatch` of `src/storage/log.ts` |

### Finding 1, reproduced: 0152 and 0138 against 0039

- The premise that fell: 0039 lets every stored consumer go by `forget`, which is how a consumer that is gone stops
  holding the log. 0152 keeps a stored consumer that a deploy no longer declares, and says it leaves by `forget`.
  Both take for granted that the consumer's topic is still one the program publishes. 0138 makes `forget`, like
  `fetch` and `ack`, refuse a topic the program does not publish. A program's topics have no schema, so a newer
  version may drop or rename one.
- The sequence: a version publishes the topic `projection` and declares its consumer `queue`. An entity is created,
  and its row waits past `queue`'s cursor. The next version declares the topic `status` in place of `projection`.
  Its deploy keeps `queue` and warns of it, and `consumers` shows it with `declared: false` and its rows behind.
  `forget('projection', 'queue')` dies with "'projection' is no topic of the program", from `topical` at
  `src/runtime.ts:823`, which wraps `forget` at `src/runtime.ts:1310`. So the rows past its cursor, and the
  publications they name, stay for ever under every prune and sweep (`pruneBatch` at `src/storage/log.ts:232`).
  Every later deploy warns of a consumer no operator can drop. The rows left are bounded by what the older version
  wrote, since no step writes the old topic again.
- Reproduced by `FAILING: a consumer of a topic a newer version no longer publishes is let be forgotten, and the
  prune passes its rows`, in `src/runtime.test.ts`, describe `publishing what happened`, commit `2f0867e`. Run:
  `bun test src/runtime.test.ts -t "no longer publishes"`. The assertions on `consumers` and on the first prune
  pass, and the forget fails.
- Where a fix could begin: `forget` in `src/runtime.ts` could take any topic a stored consumer names, without
  `topical`. Or a deploy could drop, with a warning, the consumers of a topic its program does not publish, which
  0152 refused for a topic still published. It is of family A of the step of bugs: a newer version against what an
  older one stored.

### Finding 2, reproduced: 0159 against 0070 and 0032

- The premise that fell: 0070 writes a row of `reindex` only where the entity's state and version are still the
  ones it read. That guard keeps a projection the entity has moved past out of the read model only while one
  program computes every row. 0159 lets an older runner run on beside a newer one during a rolling deploy, serving
  no shard. Only a step checks the newest version, so the older runner's `reindex` still writes. An entity that took
  no step since the newer launch keeps its state and its version, and passes the guard.
- The sequence: the older runner creates `one` with the projection `start`. The newer version computes another
  projection of the same state, `START`, with no migration. The newer runner's `reindex` writes `START`, at version
  2. An operator's script runs `reindex` on the older runner too. Its statement finds the state and version it read
  (`src/storage/projections.ts:504`), and writes `start` at version 1 over the newer row. `read` and `query` of the
  newer runner then give `start` until the entity's next step, which 0032 and 0070 say may never come. The indexes
  are written by the same statement, so an index the newer version adds is missing from that row, and a query by it
  misses the entity. That last part is reasoned from the statement, and not run.
- Reproduced by `FAILING: a reindex of an older runner leaves the row the newer version wrote`, in
  `src/cluster.test.ts`, describe `two runners on one file`, commit `2f0867e`. Run:
  `bun test src/cluster.test.ts -t "reindex of an older runner"`. The helper `start` of that describe now also
  gives the handles it deployed, and the other tests of the describe pass with it.
- It is the case the review of Schemas and projections, a first part, noticed and did not check. The step What a
  deploy may change of a program, against what is stored, of the roadmap names it as a case no bug holds.
- Where a fix could begin: `reindex` in `src/storage/projections.ts` could refuse to run while its version is
  outranked, as a step is refused, or its statement could write only where the stored row's version is not newer
  than its own. It is of family A, on Cluster, so of family C too.

### Suspects ruled out

- 0146 against 0040 on PostgreSQL: `bound` binds the exact digits of an integer beyond 2^53 as `NUMERIC`
  (`src/storage/projections.ts:218`), as `indexesText` writes them, so the stored and the bound values are equal.
- 0146's digits read back: `storedIndexes` parses the exact digits to the same double, so a cursor holds the value
  the query compared.
- 0197 against 0030: `key` takes `Schema.Codec<Parameter, Json>` (`src/program.ts:429`), so a key's parameter
  encodes to JSON as every schema does.
- 0180 against 0030: a sender left out is `Schema.Null`, and `Schema.Never` encodes nothing, so every default is
  JSON.
- 0206 and 0210 against 0032 and 0143: `JSON.stringify` writes an index of `-0` as `0`, and `bound` binds `-0` equal
  to `0`, so a criterion and a cursor find the row.
- 0101 against 0070: 0070's test now runs under prioritized schedules, and asserts what holds at the end, never when.
- 0122 against 0070: a row passed over keeps what it held, and every other row is written under the same guard.
- 0140 against 0072 and 0038: a selector changed by a deploy may give two rows of one value in a row, which a
  consumer deduplicates by `seq` as it does any row delivered again.
- 0140 and 0121 against 0159: an older runner's `read`, `query` and reader of `consume` fail on a row the newer
  version wrote, by decision 0043, so nothing is lost in silence.
- 0150 and 0184 against 0039: a page's ack in the caller's transaction moves the cursors only if the store commits,
  which is delivery at least once, as 0039 promises.
- 0245 against 0039: each batch of the sweep's prune reads the consumers and the cursors in its own statement, and a
  consumer stored between two batches holds what the next batch would drop.
- 0141, 0143, 0148, 0149 and 0213 against the area: each changes only the shape of a reading or of a test, and keeps
  the conditions the area's rules need. 0213's sender unmigrated is bug 38.
- 0120 against 0098: 0120 uses nothing of 0098's rule.

### Noticed, not checked

- A deploy that drops a topic while a reader of `consume` of that topic runs on another runner of the older version:
  the reader acks on, and its cursors hold the rows. It joins finding 1 and bug 23. It is not checked, since what
  should hold there waits on the fix of finding 1.

### Not read whole

None. Every note of the list, and every note of the area it meets, was read whole, with the code that keeps its rule.

## 2026-11-11: premise review of the pairs against Schemas and projections, a second part

Branch `claude/premise-pairs-schemas-2-5e31db`, fast-forwarded to `main` at `9fd90aa` before the review. One finding,
reproduced on SQLite by rows written by hand in the order a server commits them, with a test for the CI's job
`postgres` that was not run. The report of area 7 was read whole, with what it ruled out. The step of bugs of
`docs/roadmap.md` and the open questions were read before the pairs. Every note of the list was read whole, with its
code.

### The pairs read

| Note of the list | Note of the area | What binds them | How they were read |
| --- | --- | --- | --- |
| 0026 | 0213 | 0213 changes it: `allows` is given the sender | both whole, with `projectionViolations` of `src/testing.ts` |
| 0032 | 0121 | 0121 cites it as its reason: every event that changes the state writes the row | both whole, with `projected` of `src/storage/projections.ts` |
| 0032 | 0135 | 0135 cites it as its reason: a step writes the projection in the read model | both whole, with `write` of `src/storage/entities.ts` |
| 0032 | 0138 | 0138 applies its rule as 0032 does: a topic selects as an index does | both whole, with `published` of `src/storage/log.ts` |
| 0032 | 0139 | 0139 changes it: the projection is JSON, and an index converts nothing | both whole, with `Json` and `program` of `src/program.ts` |
| 0032 | 0206 | 0206 changes it: an index that is no scalar is the program's defect | both whole, with `shownOf` of `src/machine.ts` and `reindex` |
| 0038 | 0135 | 0135 cites it as its reason: a consumer needs the projection of that step | both whole, with `write` of `src/storage/entities.ts` |
| 0038 | 0137 | 0137 changes it: a `seq` is within a partition, under the head's lock | both whole, with `published`, `ack` and `pruneBatch` of `src/storage/log.ts` and the log's writes in `src/storage/entities.ts` |
| 0038 | 0138 | 0138 changes it: a step writes a row in each topic whose selection changed | both whole, with the same code |
| 0038 | 0140 | 0140 cites it as its reason: a row keeps the message and its kind | both whole, with `published` |
| 0039 | 0137 | 0137 changes it: a consumer keeps a cursor per partition | both whole, with `published`, `fetch`, `ack`, `pruneBatch` and `consumers` of `src/storage/log.ts` |
| 0039 | 0138 | 0138 changes it: a consumer reads one topic | both whole, with the same code |
| 0039 | 0152 | 0152 changes it: consumers are declared at deploy, and a topic no consumer holds is pruned whole | both whole, with `declare`, `pruneBatch` and `forget` |
| 0039 | 0184 | 0184 changes it: `consume` runs a reader, a page and its ack in one transaction | both whole, with `consume` of `src/runtime.ts` and `transaction` of `src/storage/tables.ts` |
| 0040 | 0138 | 0138 applies its rule as 0040 does: a topic that selects what JSON does not hold suspends | both whole, with `encode` of `src/program.ts` |
| 0040 | 0210 | 0210 changes it: a sparse array is no JSON, and `-0` is read back as `0` | both whole, with `encode` of `src/program.ts` |
| 0061 | 0122 | 0122 applies its rule: what the runtime throws fails the whole `reindex` | both whole, with `reindex` and `programCause` of `src/machine.ts` |
| 0065 | 0157 | 0157 changes it: a caller's request a version before stored is found by `request_id` | both whole, with `reply` of `src/storage/entities.ts` |
| 0065 | 0214 | 0214 cites it as its reason: a retry is answered by the stored reply | both whole, with `replyOf` of `src/storage/entities.ts` |
| 0072 | 0138 | 0138 changes it: a step is written in each topic whose selection changed | both whole, with `published` |
| 0072 | 0140 | 0140 cites it as its reason: the log records what an entity did | both whole, with `published` |
| 0076 | 0151 | 0151 changes it: the capacity is 10 000 by default | both whole, with `enter`, `spare` and `unload` of `src/runtime/loop.ts` |
| 0132 | 0135 | 0132 cites 0135 as the note that takes up large states | both whole, with `warnOfSize` of `src/runtime/loop.ts` |
| 0133 | 0135 | 0135 cites it as its reason: the children are kept in the parent's state | both whole, with `warnOfSize` |
| 0133 | 0139 | 0139 applies its rule to a part's projection | both whole, with `part` of `src/program.ts` |
| 0133 | 0155 | 0155 changes it: `forEach` puts children back once | both whole, with `forEach`, `andThen` and `toldOf` of `src/program.ts` |
| 0142 | 0153 | 0153 changes it: `wait` moves into the options, beside the partitions | both whole, with `waited` of `src/runtime/readings.ts` and `published` |
| 0142 | 0184 | 0184 changes it: a reader of `consume` waits with no time limit | both whole, with `waited`, `tell` and `consume` |
| 0147 | 0135 | 0147 applies 0135's warning, once per activation | both whole, with `warnOfFull` of `src/runtime/callers.ts` and `warnOfSize` |
| 0147 | 0151 | 0151 cites it as its reason: a busy entity holds at most `callers.messages` callers | both whole, with `spare` |
| 0148 | 0121 | 0148 applies its rule as 0121 does: the rows are read as they stand while `reindex` runs | both whole, with `count` and `sum` of `src/storage/projections.ts` |
| 0149 | 0138 | 0149 cites it as its reason: the projection is the one contract of the log | both whole, with `published` |
| 0150 | 0121 | 0150 applies its rule as 0121 does, for `countBy` | both whole, with `countBy` of `src/storage/projections.ts` |
| 0150 | 0184 | 0184 cites it as its reason: a reader waits outside a transaction | both whole, with `consume` and `ack` |
| 0156 | 0137 | 0156 applies its rule as 0137 does: a rename is the launch's, as the partitions are | both whole, with `renamed` and `namedTables` of `src/storage/tables.ts` |
| 0156 | 0157 | 0157 changes it: on PostgreSQL a rename writes a request again in the process | both whole, with `inProcess` and `inPlace` of `renamed` |
| 0162 | 0137 | 0162 changes it: on Cluster the partition is the shard, and SQLite's write lock orders the commits | both whole, with `published` and the log's writes |
| 0185 | 0157 | 0185 applies its rule as 0157 does: the readings begin at `REPEATABLE READ` | both whole, with `inspect`, `examine` and `snapshot` of `src/storage/held.ts` |
| 0185 | 0158 | 0185 applies its rule as 0158 does: inside a caller's transaction, at the caller's level | both whole, with `snapshot` |
| 0205 | 0157 | 0205 cites it as its reason: PostgreSQL holds U+0000 in no text | both whole, with `render` of `src/machine.ts` |
| 0207 | 0157 | 0207 cites it as its reason: a lone surrogate compares otherwise on each dialect | both whole, with `criteria` and `isCompared` of `src/storage/projections.ts` |
| 0209 | 0157 | 0209 cites it as its reason: `SUM` over doubles on PostgreSQL | both whole, with `sum` |
| 0247 | 0122 | 0247 applies its rule as 0122 does: what the runtime throws fails the whole call | both whole, with `check` and `activated` of `src/check.ts` |

### Finding 1, reproduced: on PostgreSQL a reading of the log skips a row for ever (0038 and 0039, against 0137 and 0157)

- The premise that fell: 0038 promised that a cursor skips nothing, because one transaction commits at a time.
  0137 kept the promise where two transactions commit at once, by the head's lock: the rows of one partition commit
  in the order of their `seq`, and `position` rises with `seq` within a partition. Its rule also needs a condition it
  never wrote: the reading must see the log as it stood at one moment. On SQLite that holds, since every write is
  serialized, on one process and across runners (0162). 0157 and 0222 run the storage on a pool of PostgreSQL, where
  steps of different partitions commit side by side. There each statement of a reading at `READ COMMITTED` reads a
  snapshot of its own, and `published` is not run in `snapshot`.
- The sequence: a step of partition 1 draws its `seq` and its `position`, 100, and has not committed. A step of
  partition 2 takes position 101 and commits. A reading reads the heads (`src/storage/log.ts:115`): partition 1 has
  no head committed past the cursor, so it is not behind. The step of partition 1 commits, and the next step of
  partition 1 takes position 102 and commits. The reading then computes its first position from the partitions
  behind, 101 (`:131`), and its page reads every partition from 101 (`:148-181`). The page gives the second row of
  partition 1, past its cursor, and not the first, whose position is 100. A consumer that acks the page moves the
  cursor of partition 1 past a row it never read, and the prune drops it. The same holds between two pages of one
  reading, with no heads involved: a row whose place falls in the first page commits after that page is read, and
  the next row of its partition commits before the second page.
- What is lost: a row of the log, in silence, for every consumer that reads with `fetch` or `consume`, a report fed
  from the log included (0149). A reader with its own cursors through `published` loses it the same way.
- Reproduced on SQLite by `FAILING: a reading of the log gives no row of a partition past a row of it that committed
  between its statements` and `FAILING: a reading of the log gives no row of a partition past a row of it that
  committed between two pages`, in `src/storage.test.ts`, at `6730434` and `9ace256`. Each writes the rows by hand,
  between the reading's statements, with `Statement.CurrentTransformer`, as a server would commit them, and fails
  on SQLite. Run: `bun test src/storage.test.ts -t "FAILING: a reading of the log"`. On SQLite and PGlite no step can
  commit in that order, so the tests show the reading's rule, not a sequence the runtime reaches there.
- Written for a server and not run, since no server of PostgreSQL runs on the reviewer's machine: `FAILING: a reading
  of the log gives no row of a partition past one it skipped` in `src/postgres.test.ts`, at `6730434`. It holds a
  step's transaction open after its row, commits a step of another partition, and lets the held step and the next
  step of its partition commit between the reading's first two statements.
- Where a fix could begin: `published` in `src/storage/log.ts` could read every partition only up to the head it read
  in its first statement, and only the partitions it counted behind. A head committed holds every row through its
  `seq` committed, so the reading would then be whole at every level, inside a caller's transaction too. Or
  `published` could run in `snapshot` of `src/storage/held.ts`, which holds only where the transaction is the
  reading's own, as a page of a query does (0158). It is of the form of bugs 13 and 25: a rule kept by SQLite's one
  writer that a pool of PostgreSQL takes away. The open question A statement whose condition PostgreSQL reads from
  its snapshot lists such cases by statement, and this one is a reading of several statements.

### Suspects ruled out

- 0039 and 0152 against 0157, a prune of a topic with no consumer while another runner's deploy declares one: the
  prune's statement reads one snapshot, and its `DELETE` touches no row committed after it. The next batch reads the
  consumers again (`src/storage/log.ts:232-255`).
- 0039 and 0150 against 0184, an ack in a caller's transaction at `REPEATABLE READ`: its heads may be stale, which
  only caps the cursor lower (`:208-222`).
- 0156 against 0157, a rename on PostgreSQL that finds the requests by `strpos` of the old name as JSON writes it:
  JSON escapes a string alike wherever it stands, so every request that names the old name as its `entity` holds that
  text (`src/storage/tables.ts:572-603`).
- 0156 against 0137: `namedTables` holds the heads, the publications, the outbox, the consumers and the cursors, and
  an entity keeps its stored partition through a rename.
- 0162 against 0137, the finding on Cluster on SQLite: `BEGIN IMMEDIATE` holds the write lock for a whole step, so no
  row with a lower position commits after one with a higher position.
- 0040 against 0210, a resident state holding `-0` against the same state loaded again as `0`: only `Object.is` and a
  division tell them apart, which 0210 accepts.
- 0072 against 0140, a deploy that changes a selector: older rows give what the new selector selects, so two rows
  in a row may give one value. 0140 decides it.
- 0061 against 0122, and 0247 against 0122: `reindex` and `check` parse the stored text outside the guard, and run
  only the migrations, the schema and `shownOf` inside it (`src/storage/projections.ts:476-492`, `src/check.ts`).
  `check` builds its storage with the default number of partitions, which only a creation reads
  (`src/storage/entities.ts:250`).
- 0133 against 0155, and 0240: a handle's step is a function of the parent's state, kept in `toldOf` by its
  function, so a list of steps made first joins a run as the ids do (`src/program.ts:892-940`).
- 0148, 0150 and 0209 against 0157: each answer is one statement, which reads one snapshot on PostgreSQL too.
- 0185 against 0158, `inspect` inside a caller's transaction at `READ COMMITTED` on a server: it reads at the
  caller's level, as 0185 says, and a step between its statements is read in part. It is the case of a page that
  0158 and 0222 describe.
- 0142 and 0184 against 0153, a reader of some partitions woken by a commit of another: `waited` takes a new signal
  before each reading, so it waits again (`src/runtime/readings.ts:63-90`).
- 0065 against 0157 and 0214: a retry finds its reply by its text, then by `request_id` among the other versions'
  rows, read through the migrations (`src/storage/entities.ts:192-228`).
- 0076 and 0147 against 0151 on Cluster: bugs 54, 61 and 74.

### Noticed, not checked

- `fetch` called inside a caller's transaction at `READ COMMITTED` on a server would keep the finding under a fix by
  `snapshot` alone, as a page of a query does. A fix that caps each partition at its head read first would not. Not
  checked, since it depends on the fix.
- The design's advice to begin at `REPEATABLE READ`, under Databases in `docs/design.md`, names a page of a query and
  not `inspect`, which reads at the caller's level too (0185). It is a gap of the guide, not of the code, and was not
  weighed further.

### Not read whole

- None of the list. The notes of the area that no note of the list meets, 0154 and 0215, were read only through the
  passages that cite them.

## 2026-11-11: premise review of the pairs against The queries and their pages, and The tables and migrations

The fourteenth last session read the list against area 8 and the list against area 9 together. The branch is
`claude/premise-pairs-queries-tables-b4f457`, moved to `main` at `9fd90aa` before the review began. One finding is
only reasoned. Its test is written in `src/postgres.test.ts` and was not run, since no server of PostgreSQL runs
here.

### The pairs read

Each pair was found by the index, the area's report and `grep -wE` of each note in both directions. Every note of the
two lists, and every note of the two areas, was read whole, with the code named.

| Pair | What binds it | How it was read |
| --- | --- | --- |
| 0032, 0141 | 0141 changes 0032's limit | both whole, with `counted` and `query` of `storage/projections.ts` |
| 0032, 0143 | 0143 changes 0032's query, which gives an id and a projection | both whole, with `cursorOf` and the page's statements |
| 0032, 0148 | 0148 changes 0032's read model | both whole, with `count` and `sum` |
| 0032, 0149 | 0149 says where 0032's read model stops | both whole; 0149 holds no code |
| 0032, 0150 | 0150 cites 0032's scalar indexes as its reason | both whole, with `countBy` |
| 0039, 0141 | 0141 changes 0039's limit of `feed` and `published` | both whole, with `fetch` and `published` of `storage/log.ts` |
| 0039, 0142 | 0142 changes 0039's `feed` | both whole, with `runtime/readings.ts` |
| 0039, 0149 | 0149 cites 0039's cursor as its reason | both whole |
| 0039, 0150 | 0150 changes 0039's ack | both whole, with `ack` of `storage/log.ts` and `transaction` of `storage/tables.ts` |
| 0157, 0145 | 0157 applies 0145's page on PostgreSQL, at `REPEATABLE READ` | both whole, with `snapshot` of `storage/held.ts` |
| 0157, 0146 | 0157 binds an integer past 2^53 as 0146 writes it | both whole, with `indexesText` |
| 0157, 0207 | 0207 cites 0157's text a database holds as its reason | both whole, with `isCompared` and `criteria` |
| 0157, 0209 | 0209 changes 0157's sum on PostgreSQL | both whole, with `sum` |
| 0164, 0150 | 0164 cites 0150's rule that a caller in a transaction waits for no step | both whole, with `untransacted` and `detached` of `runtime/` |
| 0177, 0142 | 0177 keeps 0142's signal taken before the reading | both whole, with `readings.ts` |
| 0247, 0141 | 0247 cites 0141 for its required `limit` | both whole, with `check` of `src/check.ts` |
| 0055, 0191 | 0191 changes 0055's operator who creates the tables | both whole, with `createTables` and `launch` |
| 0145, 0198 | 0198 changes 0145's index of a database made before | both whole, with `indexed` |
| 0152, 0223 | 0223 says how 0152's forget and prune hold in WAL mode | both whole, with `prune` and `forget` |
| 0154, 0224 | 0224 changes 0154's publication, which holds the step's time | both whole, with the trigger of `storage/tables.ts` and `consumers` |
| 0157, 0198 | 0198 cites 0157 for a schema no dialect shares | both whole |
| 0157, 0216 | 0216 keeps 0157's collation off `effecttea_migrations` | both whole, with `createTables` and `Migrator.ts` |
| 0157, 0218 | 0218 relies on 0157's cut of a long index name | both whole, with `indexName` |
| 0157, 0222 | 0222 changes 0157's integers, and runs its pages and its trigger on a pool | both whole, with `transaction`, `snapshot`, `pruneBatch` and the trigger |
| 0158, 0191 | 0191 changes 0158's column added and filled apart | both whole |
| 0158, 0198 | 0198 drops 0158's column of a database made before | both whole |
| 0158, 0222 | 0222 sees 0158's page in a caller's transaction give a row twice | both whole, with the page's transaction |
| 0161, 0198 | 0198 drops 0161's `steps` given to a database made before | both whole, with `tables` |
| 0176, 0198 | 0198 drops 0176's `renamed_to` given to a database made before | both whole, with `tables` |
| 0220, 0198 | 0220 names its spans with `tea.`, as 0198 names the objects | both whole |
| 0220, 0224 | 0224 decides 0220's open question of a consumer's age | both whole, with `consumers` |
| 0245, 0223 | 0245 changes 0223 for a prune in batches, and adds the sweep | both whole, with `sweepOf` of `runtime.ts` and `pruneBatch` |
| 0245, 0224 | 0245 cites 0224's `consumers` for a consumer that stalls | both whole |
| 0247, 0217 | 0247 names the history of `Migrator` as 0217 does | both whole, with `tablesMade` |

### Finding 1, reasoned, its test written: on a pool of PostgreSQL, two prunes at once may each keep a publication no row names (0154 and 0157, against 0222 and 0245)

- **The premise that fell.** 0154 drops a publication with the last row of the outbox that names it, by a trigger
  that runs in the statement that drops the row. 0157 rests on the same premise on PostgreSQL: a row trigger after a
  delete sees every row the statement deleted. Both premises hold of one statement. They need one more condition,
  which no note wrote: no other transaction drops a row of the same publication while the statement runs. 0154 wrote
  it only of a step, and said that SQLite has one writer at a time.
- **What the later notes change.** 0222 runs the runtime on a pool, at `READ COMMITTED`, where two transactions run
  at once. 0245 adds a second actor that prunes, the sweep, beside a caller's `Handle.prune`. It also cuts each prune
  into batches of 256 rows in the order of `position`. So two batches of two prunes may run at once, each on a
  connection of its own.
- **The sequence.** A step of one partition publishes in the topics `x` and `y`, at the positions 256 and 257, after
  255 rows of `x` alone. The cursor of `y` is past the step, and the cursor of `x` is not. The sweep's batch takes its
  snapshot, finds only `y`'s row to drop, and drops it. Its trigger finds `x`'s row, and keeps the publication. Before
  the sweep commits, the consumer of `x` acks past the step, and a caller's `prune` begins. Its batch sees both rows,
  and takes the first 256 by `position`, which end at `x`'s row and leave out `y`'s. It drops them, and waits for no
  lock, since the two batches drop different rows. Its trigger still sees `y`'s row, whose delete has not committed,
  and keeps the publication. Both commit. The publication stays, with its message and its projection, and no row of
  the outbox names it. No later statement drops it, since the trigger runs only where a row of the outbox goes.
- **Where it does not happen.** Where the two batches share a row, the second waits for the first's commit. Its
  trigger runs at the end of its statement, and the trigger's query takes a snapshot of its own, which sees the other
  row gone, so it drops the publication. So only two batches that share no row keep it.
- **What it costs.** Storage, for ever: one publication per such meeting, holding a projection, which may be large
  (decision 0135). No reading gives a wrong answer: `fetch` and `consumers` join from the outbox to the publications,
  and never read a publication no row names.
- **Files and lines.** The trigger of PostgreSQL at `src/storage/tables.ts:306-324`. `pruneBatch` and `prune` at
  `src/storage/log.ts:222-264`. The sweep calls `prune` at `src/runtime.ts:261-264`, and the handle gives it at
  `src/runtime.ts:1304`.
- **Its test.** `FAILING: a publication goes with the last row that names it, though two transactions drop its rows
  at once` in `src/postgres.test.ts`, in the commit of this report. It runs the two deletes the two batches run, each
  in a transaction of its own on a pool of its own, both open until both statements have run. Then it expects the
  publication gone. The test is skipped without a server, and was not run, since no server of PostgreSQL runs here.
  So the finding is only reasoned. The reading of the trigger rests on PostgreSQL's manual: at `READ COMMITTED` a
  volatile function takes a new snapshot for each query, and a delete not committed is not seen by another
  transaction. How two batches come to drop disjoint rows at once, by the limit and an ack between two snapshots, is
  reasoned from the statement of `pruneBatch`, and was not run.
- **Where a fix could begin.** The trigger could lock the publication's row, with `SELECT … FOR UPDATE` on
  `effecttea_publications`, before it looks for another row. The second trigger would then wait for the first
  transaction's commit, and its next query would see the other row gone. Or a prune could take an advisory lock of
  its transaction, keyed by the program, so that two prunes of one program never run at once. Or the sweep could drop
  the publications no row names, by a statement of its own, which decision 0154 refused while one writer ran.

### Suspects ruled out

- 0039 against 0150, an ack in a caller's transaction at `REPEATABLE READ`, which 0222 tells a caller of pages to
  begin: the ack's upsert of a cursor fails with `SerializationError` only where another transaction updates the same
  cursor at once. That is a second reader of the same consumer, and 0039 says a consumer that runs in several
  processes is a consumer per process.
- 0039 against 0245, a consumer declared or forgotten between two batches of one prune: each batch reads the
  consumers and drops its rows in one statement. A forget lets the next batch prune the topic whole, which is what a
  forget is for. A consumer declared holds its topic from its deploy, and the rows a batch dropped before were
  prunable then.
- 0154 against 0222, a step's publication and its rows seen half written by a prune: a statement at `READ COMMITTED`
  reads a snapshot of committed transactions, and a step writes its publication and its rows in one.
- 0157 and 0158 against 0222, a page in a caller's transaction at `READ COMMITTED` that gives a row twice: 0222 sees
  it on a server, and the design tells such a caller to begin at `REPEATABLE READ`.
- 0157 against 0218, more names cut by the longer prefix: `indexName` ends each cut name with a hash of the whole
  name, so two indexes of a read model share a name only where their hashes meet.
- 0158 against 0191 and 0198, the column `request_id` added and filled: 0198 makes the tables under names no database
  holds, so no launch adds the column.
- 0161 and 0176 against 0198: `steps` and `renamed_to` are columns of the first migration, and no database holds the
  tables under their new names without them.
- 0164 against 0150: a handler of `consume` that calls a step is bug 26. 0164's own forks keep 0150's rule, since
  each is given `untransacted`.
- 0177 against 0142: `waited` takes the topic's `Deferred` before it reads, as both notes say, in `readings.ts`.
- 0220 against 0198 and 0218: the spans keep `tea.` while the tables moved to `effecttea_`. 0220's reason names
  0198's prefix, and no rule of the runtime reads a span's name.
- 0224 against 0154 and the finding: `consumers` joins a partition's next row with its publication, so a publication
  kept without a row is read by no join from the outbox. `stored` and `behind` are two statements, so a forget
  between them shows a consumer with nothing behind it, which is a reading of a moment.
- 0245 against 0223, a sweep on a full volume: each batch fails and rolls back, the sweep warns, and the next sweep
  runs at its interval. The operator's procedure stands, as 0245 saw in the spike.
- 0247 against 0141: `check` refuses a limit that is no non-negative safe integer before it reads
  (`src/check.ts:71-75`), and a limit of 0 gives the counts alone.
- 0247 against 0217: `tablesMade` names the history as `createTables` does. Where a schema of the role's name moves
  the first schema, `check` dies, as bug 41 says.
- 0032 against 0148, 0150 and 0209: each aggregate is one statement, which reads one snapshot at `READ COMMITTED` on
  a pool as on SQLite.
- 0055 against 0191: `createTables` stays exported for the operator. Its run inside an operator's own transaction is
  bug 51.

### Noticed, not checked

- **Bug 26 on a pool of PostgreSQL, by the pool's size (0164 against 0150).** On a pool, a handler of `consume` holds
  one connection in its page's transaction, and a step it waits for takes another. Where as many readers wait at once
  as the pool holds connections, no step gets a connection, and every reader waits for ever. It needs a server and a
  pool of a known size, so it was not run.

### Not read whole

None. Every note of the two lists, and every note of areas 8 and 9 it meets, was read whole, with the code that keeps
its rule.

## 2026-11-11: premise review of the pairs against The rehearsal and testing

The reviewer's report, on the branch `claude/premise-pairs-rehearsal-996d6c`, cut from `main` at `9fd90aa`. One
finding is reproduced, by the test `FAILING: a run of an operation is not answered the reply of a sendFrom under its
address (decisions 0021, 0131)` in `src/rehearse.test.ts`, commit `6c7928d`.

### The pairs read

Every pair was found by the table of the area's report, the index, and `grep -w` of each number in both notes.

| Later note | Earlier note | What binds them | How it was read |
| --- | --- | --- | --- |
| 0131 | 0021 | cites it as its reason for the world's deletion of a reply | both whole, with `keep`, `entitiesOf` and `sendFrom` of `src/rehearse.ts`, and `writes` and `holds` of `src/machine.ts` |
| 0131 | 0047 | applies its request of a run, and its defect of a name sent twice, as the runtime does | both whole, with `entitiesOf` of `src/rehearse.ts` |
| 0131 | 0063 | cites it for the wait for a suspended receiver, which a world never reaches | both whole, with `apply` of `src/rehearse.ts` |
| 0131 | 0065 | cites it for a receive given its stored reply | both whole, with `receive` of `src/rehearse.ts`, and `requestKey` and `move` of `src/machine.ts` |
| 0131 | 0074 | cites it as its reason for a mailbox handled to its end inside `send` | both whole, with `apply` of `src/rehearse.ts` |
| 0131 | 0075 | applies one program under each name, as a process does | both whole, with `deployedAs`, `world.create` and `world.deploy` of `src/rehearse.ts` |
| 0183 | 0045 | cites it as its reason for a reference checked by its name | both whole, with `deployedAs` and the `send` of `entitiesOf` |
| 0186 | 0185 | cites it for null in place of `Option` | both whole, with `underWay` and `pending` of `src/rehearse.ts` |
| 0190 | 0165 | cites it for a caller never answered `Full` on Cluster | both whole, with the map of `examples/server/server.ts` |
| 0200 | 0048 | cites it as its reason: a retry is the sender's request id | both whole, with `send`, `named` and `keep` of `src/rehearse.ts` |
| 0200 | 0065 | applies the machine's answer from a stored reply | both whole, with `receive` of `src/rehearse.ts` |
| 0200 | 0125 | cites it for a `keep` the rehearsal does not take | both whole, with `writes` of `src/machine.ts`, where `until` is computed |
| 0245 | 0200 | changes the rehearsal's `send` and the `keep` that 0200 compares with, though its status line does not say so | both whole, with `send` of `src/rehearse.ts` and the rehearsal of `src/fixtures.property.test.ts` |
| 0201 | 0010 | changes how `rejectWith` types the reason | both whole, with `rejectWith` of `src/program.ts` |
| 0211 | 0210 | holds of the projection what 0210 decides of `-0` | both whole, with `projection` of `src/rehearse.ts` |
| 0211 | 0212 | cites the property that found it, which cites it back | both whole, with `src/fixtures.property.test.ts` |

### Finding 1, reproduced: a world's `sendFrom` forges a real entity's request (0021, 0131)

- **The two notes.** [Decision 0021](archive/0021-a-reply-is-kept-while-the-work-that-asked-holds.md) keys a reply
  to an entity by the sender's address, key, incarnation and name, and keeps it for a retry of the same work. Its
  context says no one else can send under the sender's address, since the runtime fills it in.
  [Decision 0131](archive/0131-a-rehearsal-runs-the-entities-an-operation-sends-to.md) gives a member of a world the
  surface of `rehearse`, `sendFrom` included, beside real entities of other programs.
- **The premise that fell.** `sendFrom(message, from)` builds an operation's request under the address `from`, the
  key `rehearsal`, an incarnation drawn from the world's counter, and the name `request`. In `rehearse` of one entity
  that address belongs to no other entity. In a world it may be the address of a member. So two senders write under
  one address, which 0021 says never happens.
- **The sequence.** A world holds a tally and a pusher. The pusher's operation under the key `rehearsal` sends `5` to
  the tally under the name `request`. The test makes drawn sends until the world's counter is one below the pusher's
  incarnation, then sends `100` to the tally by `sendFrom` from the pusher's address. The pusher's run then sends a
  request of the same text, and is answered `Accepted` from the forged request's reply. Its `5` is never applied. The
  tally reads `100` where the runtime gives `105`.
- **Where.** `sendFrom` of `src/rehearse.ts`, lines 612 to 619, with the counter `requests` that both the drawn ids
  and `sendFrom` move, and the replies that `keep` stores, lines 262 to 267.
- **Reproduced** by `FAILING: a run of an operation is not answered the reply of a sendFrom under its address
  (decisions 0021, 0131)` in `src/rehearse.test.ts`, commit `6c7928d`. It fails at its assertion, `100` for `105`.
- **How much it matters.** The sequence needs a key named `rehearsal`, a send named `request` and a matching
  incarnation, so a scenario meets it only by chance. When it does, the rehearsal gives an answer no runtime gives,
  with no defect.
- **Where a fix could begin.** `sendFrom` could refuse the address of an entity the world holds, or build its request
  under a key no program can declare. It is of no family of the step of bugs.

### Suspects ruled out

- 0131 against 0021, a reply stored after the work that asked ended: an operation that sends to its own entity may end
  its own work, and a later send of the same run stores a reply that `keep` never deletes. The world deletes at the
  step that ends the work, and not by a statement over what is stored, which 0021's alternatives warn of. Nothing asks
  for that reply again, since an incarnation never comes back, so it costs the rehearsal memory and changes no answer.
- 0131 against 0021, the ending of a `Restart`: every event of the world passes through `apply` and so through `keep`,
  a `Restart` included, so an at-most-once operation's `unknown` deletes its replies. Only `born` steps no event, and a
  creation ends no work.
- 0131 against 0047: the set `used` belongs to one run, so a run after `crash: true` sends every name again and is
  given the stored replies. A run of a pending whose incarnation moved on fails before its runner starts.
- 0131 against 0074: a receiver's mailbox is empty when a send arrives, also when an operation sends to its own
  entity, since every `apply` handles the mailbox to its end and a suspension fails the test first.
- 0131 against 0075: `world.deploy` keeps the state in memory and migrates nothing, where a new process reads it
  through the migrations. The design says under Rehearsing that a rehearsed deploy exercises no migration, and that
  the runtime's tests deploy one.
- 0183 against 0045: as the area's report says, a world answers `NotFound` where the runtime waits for a deploy, and
  the runtime then answers `NotFound` too, since the entity does not exist.
- 0186 against 0185: 0186 takes from 0185 only the choice of null over `Option`, which carries no premise.
- 0190 against 0165: the map of `examples/server/server.ts` holds an entry for every tag, `Full` included, and
  `satisfies` checks it. On Cluster `Full` is never given, as 0190 says.
- 0200 against 0048: a retry is keyed by the sender as its schema writes it, in the world as in the runtime. The case
  of a deploy that writes the sender otherwise is bug 5.
- 0200 against 0065: the machine answers a `Receive` given a reply with that reply, suspended or not, and `keep` stores
  every `Replied` of a named request, one handled from the mailbox included.
- 0200 and 0245 against 0125: a rehearsal's `Receive` carries no `keep`, so the machine gives its reply no `until`,
  which is the runtime's `'forever'` since 0245. A boundary that gives `{ millis }` is answered otherwise past that
  time, and the design says a retry past a reply's time is tested on the runtime. Only 0200's sentence on a send
  without `keep` is out of date, as the area's report found.
- 0245 against 0200, a sender left out: the rehearsal writes it `null`, and a program whose sender is not `null`
  cannot leave it out, by its type. A sender that is `undefined` is refused by `encode` in both.
- 0201 against 0010: a `const` parameter infers a readonly literal, and Effect's schemas type their structs and arrays
  readonly, so a reason the program's type accepted is still accepted.
- 0211 against 0210, and 0211 against 0212: the projection is decoded from its JSON at the version that wrote it, with
  no migration, as a caller reads it. The `-0` of a state across a restart is the area's report's ruling, which still
  holds.

### Noticed, checked by reading, not of this kind

- The property of `src/fixtures.property.test.ts` sends a request with no request id under `new-<index>` on the
  runtime, and under a drawn id in the rehearsal. Suppose `Arbitrary.schema(RequestId)` derives the request id
  `new-<k>` for one send, under the sender of the send at index `k`, which has no request id. The runtime takes the
  second for a retry, and the rehearsal applies both. The property would then fail for no bug of the library. The
  derived string must be that text exactly, so a run of the property almost never meets it. It is a check that holds
  less than its note, of family G, and no premise of a pair.

### Noticed, not checked

None. Each suspect noticed was checked by a test or by a reading.

### Not read whole

None. Every note of the list and every note of the area it meets was read whole, with the code that keeps its rule.

## 2026-11-11: premise review of the pairs against The project and what enters the library, the notes before 0100

The reviewer's report, whole, as its session wrote it.

Branch `claude/premise-pairs-project-1-5b0c65`, fast-forwarded to `main` at `9fd90aa` before any reading, since it
was cut at `fcd2494`, before the report of area 12. One finding, reproduced. The report of area 12 was read whole,
with what it ruled out. The step of bugs of `docs/roadmap.md` and the open questions were searched for each pair's
subject. The reviews of the areas that hold the notes of the list were read through the reports of Effect Cluster
and of the pairs against it, by a search of `reviews.md` for the hold, the advisory lock and a second runtime.

### The pairs read

The pairs were listed by the table of area 12's report, and by `grep -w` of each note of the list in each note of
the area, both ways. Every note of the list and every note of the area named below was read whole.

| Note of the list | Note of the area | What binds them | How they were read |
| --- | --- | --- | --- |
| 0003 | 0195 | 0195 renames 0003's `durable` to `work`, and `Durable` to `Piece` | both whole, with `work` and `Piece` of `src/program.ts` |
| 0039 | 0195 | 0195 renames 0039's `feed` to `fetch` | both whole, with `fetch` of `src/storage/log.ts` |
| 0028 | 0007 | cites 0007 as its reason: one process is the one writer, so a machine held in memory is never read again | both whole, with `write` of `src/storage/entities.ts` and `settle` of `src/runtime/doors.ts` |
| 0028 | 0019 | applies 0019's rule: Effect is pinned where `effect/sql` is | both whole |
| 0030 | 0007 | cites 0007 as its reason: the runtime writes JSON text in SQLite | both whole, with the columns of `src/storage/tables.ts` |
| 0030 | 0099 | none: 0099 names "the review of 0016 to 0030", which `grep` found | 0099 whole |
| 0038 | 0007 | cites 0007 as its reason: a `seq` is given and committed in one order, since the writes are serialized | both whole, with the draw of the head in `src/storage/entities.ts:407-440` and `fetch` of `src/storage/log.ts` |
| 0038 | 0052 | 0052 cites 0038's rule of publication as one that leans on values never mutated | both whole, with `shownOf` of `src/machine.ts` |
| 0057 | 0052 | applies 0052's rule: an encoding and a projection are kept by the value | both whole, with `encodeOnce`, `encodeWork`, `shownOf` and `requestKey` of `src/machine.ts` |
| 0064 | 0054 | changes it: `resume` with a fixed program, one place a program entered, is gone | both whole, with `checkProgram` and its callers in `src/runtime.ts`, `src/rehearse.ts` and `src/check.ts` |
| 0073 | 0055 | cites 0055 as its reason: a type of the machine stays out of the surface | both whole, with `Probe` of `src/runtime.ts` |
| 0073 | 0193 | 0193 applies 0073's rule: no entry gives `Probe`, `Point` or `Said` | both whole, with the four entries |
| 0075 | 0054 | applies 0054's rule: a second deploy of a name dies where a program that cannot run dies | both whole, with `deploy` of `src/runtime.ts:1056-1075` |
| 0075 | 0080 | 0080 applies 0075's rule: a launch on a database held dies as a second deploy does | both whole, with `hold` of `src/storage/tables.ts` and `launchWith` of `src/runtime.ts` |
| 0081 | 0007 | changes 0007's consequence for Cluster: a step commits with Cluster's reply | both whole, with `doorStep`, `stepIn`, `finishIn` and `settle` of `src/runtime/doors.ts`, `register` of `src/cluster.ts`, and `requestWriteOptions` of Effect's `cluster/internal/entityManager.ts` |
| 0084 | 0019 | cites 0019 as its reason against a fence of the runtime's own | both whole, with `leased` of `src/storage/cluster.ts` |
| 0084 | 0080 | corrects 0080's alternative on Cluster's locks, and is the reason a runner's launch holds nothing | both whole, with `hold` of `src/storage/tables.ts`, `launchWith` of `src/runtime.ts` and `write` of `src/storage/entities.ts` |

### Finding 1, reproduced: 0084 against 0080, 0075 and 0028

- **The notes.** [Decision 0080](archive/0080-a-database-is-held-by-one-runtime.md) holds a database for one
  runtime: the client in the process, a file of SQLite by its exclusive mode, a database of PostgreSQL by an
  advisory lock. [Decision 0084](archive/0084-a-step-commits-only-where-the-commit-checks-the-shard.md) lets the
  runners of Cluster share one database under the shards' locks. So `launchWith` skips the hold for a runner
  (`src/runtime.ts:945`, "a shard's lock takes the place of the database's").
- **The premise that fell.** The hold kept off every second runtime, whatever its kind. A shard's lock keeps off
  only another runner of Cluster. A runtime of one process takes no shard's lock, and a runner takes no part of the
  hold. So a runtime of one process and a runner of Cluster are not refused on one database. Decision 0028's "one
  process is the only writer" falls with it: the runtime of one process writes its row blindly
  (`UPDATE effecttea_entities ... WHERE name = ... AND id = ...`, `src/storage/entities.ts:259` and `:269`), from
  the machine it holds. Decision 0075's "two programs of one name never run in one process" falls too, since the
  two runtimes each deploy the name.
- **The sequence.** A runner of the runtime on Cluster runs on a client, and deploys `Tally`. A runtime of one
  process is launched on the same client, with the runner's partitions of the log. Its `hold` finds the client in no
  `held` set, since the runner's launch never added it (`src/storage/tables.ts:49` and `:66`). It takes SQLite's
  exclusive mode on the connection both share, and deploys `Tally` too. The entity `one` is created at 0 through the
  runner. The runtime of one process adds 1, reads the row, and holds the machine. The runner adds 10: its `settle`
  sees the count of steps moved, crashes its own machine, loads the row, and stores 11. The runtime of one process
  adds 100 to the machine it holds, at 1, and stores 101. The step of 10 is lost, and nobody is told.
- **Reproduced** by `FAILING: a runtime of one process launched on the client of a runner of the runtime on Cluster
  dies, as a second runtime on one database does`, in `src/cluster.test.ts`, at commit `6bd4222`. The launch is not
  refused, and the tally stores 101 of 111. Run: `bun test src/cluster.test.ts -t "FAILING: a runtime of one process"`.
- **The other cases, only reasoned.** A runner launched on a client that a runtime of one process already holds is
  not refused either, since a runner's launch reads no `held` set. On SQLite, two processes are kept apart all the
  same, in WAL mode: a runner keeps the file open, so the exclusive mode of the other's launch is refused. On a
  server of PostgreSQL nothing keeps them apart: a runner never takes the advisory lock `7465616`, so a runtime of
  one process takes it beside the runners. Today every step of a runner on PostgreSQL dies under Cluster's advisory
  locks ([decision 0175](archive/0175-on-cluster-every-step-checks-the-newest-version-and-the-shards-lease.md)).
  With `shardLockDisableAdvisory`, Cluster writes rows of `cluster_locks`, a runner's steps pass `leased`, and the
  sequence above runs across processes. No server ran here.
- **Where a fix could begin.** A runner's launch takes the part of the hold that a shard's lock does not replace. It
  adds the client to `held`, and on PostgreSQL takes the advisory lock in shared mode
  (`pg_try_advisory_lock_shared`), where a runtime of one process takes it exclusive. A runtime of one process is
  then refused beside a runner, and the runners still share the database. It is of family C of the step of bugs: a
  rule of one process that holds otherwise on Cluster.

### Suspects ruled out

- 0003 and 0039 against 0195: the renames change no rule. The prefix of the singletons, which 0195 fixes, is no
  word of 0003's or 0039's.
- 0028 against 0007, a runner that holds a machine another runner wrote past: `settle` compares the count of steps
  stored with the one the machine holds, and crashes a machine it cannot settle (`src/runtime/doors.ts:64-84`,
  decision 0161). A runtime of one process does not, which is finding 1.
- 0028 and 0084 against 0019: pinning Effect and the reasons against a fence of the runtime's own add no condition
  that 0019 does not give. The guard that 0175 added reads Cluster's columns, and 0175 says so of itself.
- 0030 against 0007, on PostgreSQL: the state, the projection and the messages are `TEXT` on both databases
  (`src/storage/tables.ts`), and `JSON.stringify` escapes U+0000 and a lone surrogate. Only the indexes are cast to
  `jsonb`, and the machine refuses an index that is no text a database holds (`src/machine.ts:280`).
- 0038 against 0007, on a pool of PostgreSQL: a `seq` is drawn by an upsert of the partition's head, which holds
  the head's row until the commit, and the rows of the log are written after it (`src/storage/entities.ts:407-440`).
  So within a partition the second step waits, draws the next `seq`, and commits after the first.
- 0038 and 0057 against 0052, after a deploy: the encodings, the work and the projections are kept by program or by
  codec, then by value (`src/machine.ts:179-280`). A new program computes the projection of the state before its
  first step again, so a deploy publishes nothing of itself, as 0038 says.
- 0057 against 0052, a request built twice: `requestKey` keeps the text by codec and by request object, and two
  objects that encode alike give one text.
- 0064 against 0054: every place a program now enters checks it: `deploy`, `rehearse`, a rehearsal's `deploy` and
  `check`. `send` and `create` of `Entities` take the program deployed under the receiver's name, by `deployedAs`,
  and not the object an operation gives.
- 0075 against 0054: `deploy` checks the program before it claims the name, so a program refused claims nothing
  (`src/runtime.ts:1062-1075`).
- 0073 against 0055 and 0193: `launchWith` reads `Probe` once, on one process and on Cluster, and no entry gives it.
  A user who writes its key could provide one, which area 12 ruled out.
- 0081 against 0007, a step whose commit fails or whose runner loses the shard: the machine is replaced only once
  `settle` sees the count of the commit, and a step that died is delivered again from the state before it.

### Noticed, not checked

- **0081 against 0007: the runtime's tables and Cluster's on one client.** 0081 says the step's writes and Cluster's
  reply commit together because they sit "on one `SqlClient`". Nothing checks it. Cluster opens the transaction of a
  `WithTransaction` request on the client of its `MessageStorage` (`storage.withTransaction`,
  `cluster/internal/entityManager.ts:878` of Effect). The door's step writes on the client the launcher gave the
  runtime (`register` of `src/cluster.ts`). A client joins only its own transaction, since each client has a
  `TransactionConnection` of its own id (`sql/SqlClient.ts:328` and `:866` of Effect). So a launcher that builds
  `SqlMessageStorage` on a client of its own commits a step and its reply apart. On two databases, a crash between
  the two commits applies the message twice or loses the state, as 0007 says. On one SQLite file, the step waits for
  the file's lock that Cluster's transaction holds, and dies at the busy timeout. It is read in the source and not
  run. A test would build a runner whose `SqlMessageStorage` has a client of its own on another file, and kill the
  process between the two commits.

### Not read whole

None. Every note of the list and every note of the area in the table was read whole, with the code that keeps it.

## 2026-11-11: premise review of the pairs against The project and what enters the library, the notes from 0100

The reviewer's report, on the branch `claude/gallant-almeida-c81283`, cut from `main` at `9fd90aa`. Two findings are
reproduced, each by a test named `FAILING:` on the branch, at commits `ba56b8e` and `e04fcd4`. A third is only
reasoned, by a reading of `AGENTS.md`, `package.json` and `scripts/compare-docs.ts`.

### The pairs read

Every note of the list was read whole, and so was every note of the area it meets, with the code that keeps the rule.

| Later note | Earlier note | What binds them | How it was read |
| --- | --- | --- | --- |
| 0104 | 0080 | 0104 moves the test of two launches on one client from the budgets onto its scheduler, and counts 0080's mutations | both whole, with `hold` of `src/storage/tables.ts` |
| 0125 | 0053 | applies it: `keep.millis` is checked as 0053 checks a count | both whole, with `counted` and `kept` of `src/runtime.ts`, and the readings of `until` in `src/storage/entities.ts` |
| 0132 | 0054 | changes it: a key cannot be declared twice, and a name never starts with `[` | both whole, with `checkProgram` and `keysOf` of `src/program.ts` |
| 0136 | 0054 | changes it: a name may start with `[` | both whole, with `checkProgram` |
| 0138 | 0053 | applies it: a topic the program does not publish is the caller's defect | both whole, with `topical` of `src/runtime.ts` |
| 0138 | 0054 | applies it: an empty `topics` and an empty topic's name are refused where the program enters | both whole, with `checkProgram` |
| 0141 | 0053 | changes it: a limit left out is the caller's defect | both whole, with `counted` |
| 0143 | 0053 | applies it: an `after` that holds no id or no scalar is the caller's defect | both whole, with `cursorOf` and `storedIndexes` of `src/storage/projections.ts` |
| 0152 | 0053 | applies it: a consumer not declared is the caller's defect | both whole, with `enlisted` |
| 0152 | 0054 | applies it: consumers that cannot be read are refused before anything is stored | both whole, with `consumersOf` and `deploy` of `src/runtime.ts` |
| 0152 | 0080 | cites it as its reason: a consumer runs where the program is deployed | both whole |
| 0153 | 0053 | applies it: a list of partitions it cannot read is the caller's defect | both whole, with `named` and `cursored` |
| 0153 | 0080 | cites it as its reason: every reader runs where the program is deployed | both whole |
| 0156 | 0080 | cites it as its reason: a rename at launch meets no entity loaded and no reader | both whole, with `launchWith` and `renamed` |
| 0157 | 0007 | changes it: the database is SQLite or PostgreSQL | both whole |
| 0157 | 0019 | cites it as its reason: the runtime reaches the database through `SqlClient` alone | both whole, with `package.json`, `AGENTS.md` and `scripts/compare-docs.ts` |
| 0157 | 0080 | applies it: a database of PostgreSQL is held by an advisory lock, and one of PGlite by its client | both whole, with `hold` |
| 0157 | 0179 | changed by it: an id is not empty | both whole, with `idFault` and `texted` |
| 0157 | 0204 | changed by it: a request id is text a database holds | both whole, with `requestIdFault` and `requested` |
| 0176 | 0080 | cites it as its reason: on one process nothing runs under the old name while the rows move | both whole, with `renamed` of `src/storage/tables.ts` |
| 0185 | 0179 | applies it: an id that is no id is the caller's defect of `inspect` | both whole, with `inspect` of `src/runtime.ts` |
| 0191 | 0055 | changes it: a launch creates the tables, and the operator runs `createTables` only for a role that may not | both whole, with `launchWith` |
| 0191 | 0080 | applies it: the launch creates the tables once it holds the database | both whole, with `hold` and `launchWith` |
| 0198 | 0080 | cites it as its reason: two runtimes never share one database, so the prefix is no option | both whole |
| 0198 | 0195 | applies it: the prefix is fixed, as the names of the singletons are | both whole |
| 0211 | 0212 | found by it, and changes what it compares: a rehearsal's projection is read back from JSON | both whole, with `src/fixtures.property.test.ts` |
| 0215 | 0080 | applies it: a database is held by one runtime, whatever its schemas | both whole, with `hold` |
| 0221 | 0208 | cites it: the bound of a timer is no option, since an option is checked | both whole, with `arm` of `src/runtime/loop.ts` and `waking` of `src/runtime/waker.ts` |
| 0245 | 0053 | applies it: a `keep` that is neither millis nor `'forever'` is the caller's defect | both whole, with `kept`, `senderOf` and `flagsOf` |
| 0245 | 0196 | cites it: the quick start passes `sender: null`, which 0245 leaves out | both whole, with the test of `src/form.test.ts` |
| 0247 | 0054 | applies it: the program is refused as a deploy refuses it, before any row is read | both whole, with `check` of `src/check.ts` |
| 0247 | 0080 | cites it as its reason: the check launches nothing, so it runs on a database the old version holds | both whole, with `hold` and `src/check.test.ts` |

### Findings

#### 1. A second runtime on another client of PGlite over the same data directory launches, and each steps its own copy

- **The notes.** [Decision 0080](archive/0080-a-database-is-held-by-one-runtime.md) keeps a second runtime off a
  database, in this process or another, since two runtimes lose each other's steps.
  [Decision 0157](archive/0157-the-storage-speaks-sqlite-and-postgresql.md) holds a database of PGlite by its client,
  in the process alone, since PGlite has one session and an advisory lock would be taken again.
- **The premise that fell.** 0157 rests on one client of PGlite per database, which it does not write. PGlite opens a
  data directory of the file system, and a second `PGlite` over that directory opens with no error. Each instance
  holds the database in its own memory, and the last to close writes its copy over the other's. A script of this
  review saw it at PGlite 0.5.15. Two instances on one directory each inserted a row. After both closed, only the rows
  of the instance closed last were in the directory.
- **The sequence.** A process opens `PgliteClient.layer({ dataDir })` and launches a runtime, which creates an entity.
  Another process, or another layer of the same process, opens a client over the same `dataDir` and launches.
  `hold` of `src/storage/tables.ts` adds the second client to `held`, which holds the first client only, and returns
  for PGlite at line 80 before any lock. Both runtimes run. Each steps its own copy, and the steps of one are lost
  when the other closes, with nothing said. It is the bug of 0080's context. `docs/design.md`, under Where it runs,
  says that a second runtime dies as it launches.
- **Reproduced** by `FAILING: a second runtime on another client of PGlite over the same data directory dies as it
  launches` in `src/runtime.test.ts`, commit `ba56b8e`. The second launch succeeds, where the test expects the
  refusal. It runs some two seconds, past the budget of `AGENTS.md`, since it makes two databases of PGlite.
- **Where a fix could begin.** `hold` takes a lock of the data directory for PGlite, such as a file the runtime
  creates exclusively in it. `@effect/sql-pglite` would tell `hold` the directory, or the launch would take it as an
  option. A second way: a note says that a directory of PGlite has one client, and the design stops saying that a
  second runtime on it dies.

#### 2. `check` cannot run beside the old version on SQLite, though 0247 says it runs on a database the old version holds

- **The notes.** [Decision 0247](0247-check-reads-the-stored-entities-as-a-deploy-would-activate-them.md) launches
  nothing and takes no lock, "so it runs on a database another version holds", since on one process the old version
  holds the database alone. `docs/design.md`, under Checking a program before its deploy, says the same.
  [Decision 0080](archive/0080-a-database-is-held-by-one-runtime.md) holds a file of SQLite in the exclusive locking
  mode, so that no other connection opens it. Its consequences say that a tool that inspects the database runs while
  the runtime is stopped, or through the runtime.
- **The premise that fell.** 0247 rests on the hold letting in a reader that does not take it. PostgreSQL lets it in,
  since its hold is an advisory lock, and so does Cluster, whose runners hold nothing. On SQLite no other connection
  opens the file. The new version is deployed by a new process
  ([decision 0075](archive/0075-a-name-is-deployed-once-in-a-process.md)), so its program is checked from a client of
  its own.
- **The sequence.** The old version's runtime holds `store.db`. The new process opens a client of `store.db` to run
  `check(next, { limit })`. The client's configuration dies with `SQLiteError: database is locked`, after the
  client's busy timeout, five seconds by default, which blocks the event loop under `bun:sqlite`. The test of 0247
  passes only since its check runs inside the old runtime's process, on the old runtime's client.
- **Reproduced** by `FAILING: a check from a client of its own reads a file of SQLite the old version holds` in
  `src/check.test.ts`, commit `e04fcd4`, with a busy timeout of 0. Nothing is lost: the check fails loudly, and the
  operator can stop the old version first.
- **Where a fix could begin.** A note narrows 0247 and the design: on SQLite the check runs while the old version is
  stopped, or on a copy of the file. A second way: the old runtime gives the check through its handle, which needs
  the new program's code in the old process.

#### 3. A move of Effect's version by the rule of `AGENTS.md` leaves the drivers of PostgreSQL at the version it leaves

- **The notes.** [Decision 0019](archive/0019-unstable-effect-modules.md) pins Effect to an exact version once the
  runtime uses its unstable modules, and moves it on purpose.
  [Decision 0157](archive/0157-the-storage-speaks-sqlite-and-postgresql.md) adds `@effect/sql-pglite`, and
  [decision 0222](0222-postgresql-with-many-connections.md) adds `@effect/sql-pg` "at the version of Effect pinned".
  Both are unstable, and premises of both notes are read in their sources. PGlite runs one statement at a time, and
  `@effect/sql-pg` gives a `BIGINT` as a bigint and names the errors `40P01` and `40001`.
- **The premise that fell.** `AGENTS.md` says that a move of Effect's version pins `effect`, `@effect/sql-sqlite-bun`
  and `@effect/platform-bun` together. It names neither driver of PostgreSQL. `scripts/compare-docs.ts` compares the
  JSDoc of `effect` and `@effect/sql-sqlite-bun` alone, by its type `Package` at line 36. Each driver's peer range is
  `effect: ^4.1.3`, so a move of `effect` alone installs with no warning.
- **The sequence.** A move to a later release of Effect by the rule pins the three packages it names. `@effect/sql-pg`
  and `@effect/sql-pglite` stay at 4.1.3, and the CI's server and every test on PGlite run the old drivers against
  the new `effect`. A change of a driver's decoding of integers, or of its errors, in the release moved to is read by
  nobody. The spikes run at the drivers left behind, so they pass.
- **Only reasoned**, by a reading of `AGENTS.md`, `package.json`, the drivers' `package.json` and
  `scripts/compare-docs.ts`. All five packages are at 4.1.3 today, so nothing is wrong yet.
- **Where a fix could begin.** `AGENTS.md` names the two drivers among the packages a move pins together, and
  `scripts/compare-docs.ts` compares their JSDoc. A test of the form of `package.json` could check that every
  `@effect/` package is at the version of `effect`. It belongs to family G of the step of bugs.

### Suspects ruled out

- 0125 against 0053 at its upper end. A `keep` of `Number.MAX_SAFE_INTEGER` makes an `until` past 2^53. No reading
  decodes `until`, which only `WHERE` clauses compare (`src/storage/entities.ts:215`, `224`, `402` and `457`), and both
  dialects store it as an integer.
- 0132 and 0136 against 0054. A key's name is checked as text a database holds, since `program.keys` is the record
  `keysOf` builds from the list, and `checkProgram` reads its names. An empty name is a key of its own, `[""]`.
- 0138 against 0053. `topical` compares the topic with the program's own topics, so a name of `Object`'s prototype
  is refused.
- 0143 against 0053. A row a page gave, passed back as `after`, holds every declared index, since `storedIndexes`
  fills an index the row lacks with `null`. So an index named `constructor` never reads the prototype's value.
- 0152 against 0054. Consumers given as a string are refused, and consumers given as `null` are read as none. A
  deploy that fails after it declared its consumers leaves them stored. The next deploy warns of each it does not
  declare, as 0152 decides for a name left out.
- 0153 against 0053. `ack` keeps the higher of two cursors of one partition, in SQL, so a list that names a partition
  twice moves no cursor back.
- 0104 against 0080. The client's claim in `hold` is one `Effect.sync`, so no schedule of the scheduler falls between
  the check and the claim.
- 0156 and 0176 against 0080 on PostgreSQL. A process of the old code holds the advisory lock, so a launch that
  renames dies before it moves anything. A `check` on another connection reads each entity in a snapshot of its own,
  and bug 29 holds what it may count twice.
- 0157 against 0204 on Cluster. A caller's request id reaches Cluster's tables inside the JSON of the whole request
  (`src/cluster.ts:129`), which escapes what no text holds.
- 0185 against 0179. `inspect` checks its id with `texted`, as `read` does.
- 0191 against 0080. `createTables` runs after `hold`, and a launch refused writes nothing, as its test checks. What
  a launch stores before it refuses an option is bug 44.
- 0198 against 0195 and 0080. The prefix is fixed, and no release exists. The runners of Cluster share one set of
  tables by design. Finding 1 is the one case of two runtimes on one database outside Cluster.
- 0211 against 0212. Both sides of the property now read the projection back from JSON, and `read` of the runtime
  reads the stored row of a loaded entity too.
- 0215 against 0080. An advisory lock is the database's, so two runtimes on two schemas of one database refuse each
  other, which loses nothing.
- 0221 against 0208. A timer whose time has come sleeps 0 ms once and fires. The waker's sleep of 0 under a `retry`
  of 0 is bug 17. The bound of 0221 is no option, so 0208 checks nothing of it.
- 0245 against 0053 and 0196. `kept` refuses a `keep` left out and a `keep` of `null`. A request that leaves out its
  sender gives `null`, which the sender's schema refuses for a program that has a sender. The test of the quick
  start keeps the README equal to its files.
- 0247 against 0054. `check` calls `checkProgram`, and refuses a renamed program, before any row is read.

### Noticed, not checked

- **Finding 1 on Cluster.** The runners of Cluster share one file of SQLite. Whether runners on PGlite over one
  directory lose steps the same way was not run, since decision 0084 keeps Cluster on SQLite.
- **Finding 2 on PostgreSQL under a role of rows alone.** `check` reads `effecttea_migrations` by name, which such a
  role may read. It was read in the code, and not run on a server, since none runs here.

### Not read whole

None. Every note of the list, and every note of the area it meets, was read whole with the code that keeps the rule.

## 2026-11-11: premise review of a sample, Effect Cluster and The scheduler of the tests, read again

This is a blind reading of two areas, for the sample that decides whether the whole review is read a second time.
The reviewer read none of the earlier reports, nor the roadmap's step of bugs, nor `docs/open-questions.md`. The
bugs of decisions 0248 and 0249 were already found, and are not reported again. A first version of this report left
33 notes unread or read in part. They were read in a second pass, at the coordinating session's request, with the
code the first table named as not read, and the section was rewritten in place.

### The notes listed

The list holds the notes of the two areas and the notes the index lists as changing one of them. It also holds every
note that `grep -rlwE` finds in `docs/decisions` citing a note of the areas or cited by one, with `reviews.md` left
out.

| Note | Role | How it was read |
| --- | --- | --- |
| 0081 | of area 2 | whole, with the code of the door's step (`src/runtime/doors.ts`) |
| 0084 | of area 2 | whole, with `guard` of `src/cluster.ts` |
| 0085 | of area 2 | whole, with `reset` and `send` of `src/cluster.ts` |
| 0090 | of area 2 | whole, with `forgetUnder` and the deletions of `src/storage/entities.ts` |
| 0091 | of area 2 | whole, with the annotations of `doorOf` in `src/cluster.ts` |
| 0092 | of area 2 | whole, with `losing`, `serving` and `activateOnCluster` of `src/runtime/doors.ts` |
| 0159 | of area 2 | whole, with `recordVersions`, `standingOf` and `outranked` of `src/storage/cluster.ts` |
| 0160 | of area 2 | whole, with the creation in `doorStep` |
| 0161 | of area 2 | whole, with `settle`, `applyOnCluster`, `loadIn`, `finishIn`, and the loop's settling before an unload in `src/runtime/loop.ts` |
| 0162 | of area 2 | whole, with `serving`, `activating`, `losing`, `loadable` and `entersHeld` |
| 0163 | of area 2 | whole, with `waited` of `src/runtime/readings.ts` and the watcher in `launchWith` of `src/runtime.ts` |
| 0165 | of area 2 | whole, with `send` and `reset` of `src/cluster.ts` |
| 0166 | of area 2 | whole, with the operator's branch of `doorStep` |
| 0167 | of area 2 | whole, with `resume` of `src/cluster.ts` and `waiters` of `src/storage/cluster.ts` |
| 0168 | of area 2 | whole, with `resettingSavedFailure` |
| 0169 | of area 2 | whole, with `keepSent`, `pendSent` and `forgetPending` |
| 0170 | of area 2 | whole, with `resettingSavedFailure` and `kept` |
| 0171 | of area 2 | whole, with `keptGiven`, `keepGiven`, the step's deletion and `expire` |
| 0172 | of area 2 | whole, with its test of a `Resumed` delivered before the answer `Suspended`, in `src/cluster.test.ts` |
| 0173 | of area 2 | whole, with the deletion of the work's rows |
| 0174 | of area 2 | whole, with the check of the recorded versions in the deploy of `src/runtime.ts` |
| 0175 | of area 2 | whole, with `guard`, `leased` and the calls of `guard` in `src/runtime/doors.ts` |
| 0176 | of area 2 | whole, with `sentNow`, `current` and `renamed` of `src/storage/tables.ts` |
| 0178 | of area 2 | whole, with the settings of `examples/server/server.test.ts` |
| 0248 | of area 2 | whole, with `least` and `keptGiven` of `src/cluster.ts`, and `cluster/Runners.ts` of Effect |
| 0249 | of area 2 | whole, with `reset` and `forgetGiven` |
| 0104 | of area 11 | whole, with `controlled` of `src/testing.ts` |
| 0115 | of area 11 | whole, with `leastBudget` |
| 0117 | of area 11 | whole, with `nested` in `controlled` |
| 0244 | of area 11 | whole, with `step` of `controlled`, and `runLoop`, `evaluate` and `yieldNow` of Effect 4.1.3 |
| 0164 | changes 0161 | whole, with `untransacted` at the forks of `finishIn` and the watcher |
| 0198 | changes 0161 and 0176 | whole; the names of the tables read in the statements above |
| 0245 | changes 0171 | whole, with `expire` in batches of `src/storage/entities.ts` |
| 0007 | cites 0081 | whole |
| 0021 | cites 0090 | whole, with the deletion of a reply as its asker's work ends |
| 0063 | cites 0163 | whole |
| 0066 | cites 0104 | whole |
| 0068 | cites 0104 | whole |
| 0074 | cites 0081 | whole |
| 0079 | cites 0092 | whole |
| 0080 | cites 0084 | whole |
| 0100 | cites 0090 | whole |
| 0101 | cites 0104 | whole |
| 0109 | cites 0104 | whole |
| 0110 | cites 0104 | whole |
| 0112 | cites 0104 | whole |
| 0114 | cites 0092 | whole |
| 0116 | cites 0115 and 0117 | whole, with the loop's wait in `src/runtime/loop.ts` |
| 0125 | cites 0085, 0090 and 0165 | whole |
| 0134 | cites 0117 | whole |
| 0142 | cites 0163 | whole, with `waited` |
| 0147 | cites 0165 | whole |
| 0151 | cites 0092 | whole |
| 0156 | cites 0176 | whole, with `renamed` |
| 0177 | cites 0104 | whole |
| 0182 | cites 0085, 0165 and 0169 | whole, with `create` of `src/cluster.ts` |
| 0185 | cites 0161 | whole |
| 0190 | cites 0165 | whole |
| 0193 | cites 0174 | whole |
| 0195 | cites 0162 | whole |
| 0215 | cites 0175 | whole |
| 0219 | cites 0175 | whole |
| 0247 | cites 0159 | whole |

### Findings

- **A second client on a runner with a longer poll of replies waits for ever.** The two notes are decisions 0171
  and 0248.
  - The premise. Decision 0171's deletion of a caller's rows is safe only while no client still reads Cluster's rows
    of the request. Decision 0248 restores that premise for a second client of the request by keeping the rows for
    a least time, `2 × entityReplyPollInterval + 1 000` ms. The interval in that least time is the one of the runner
    whose client keeps the id: see `least` in `src/cluster.ts:340`, which `keptGiven` at `src/cluster.ts:348`
    gives. A second client reads replies at the interval of its own runner. So the premise that fell is that every
    runner on the file polls replies at the keeping runner's interval. Decision 0248 says that a runner launched with
    another poll moves the least time with it, which holds of the keeping runner alone.
  - The sequence. Runner 1 holds the entity and polls replies every 200 ms. Runner 2 polls every 5 s. Runner 2's
    client sends a message with a `keep` of 0, and runner 1 steps it. Runner 1's client sends the same request, is
    answered at once from the reply Cluster saved, and keeps the id for 1.4 s. A step of the entity 1.6 s later
    stores a reply, and deletes Cluster's rows under the id (`src/storage/entities.ts:403`). Runner 2 reads at its
    poll of 5 s, finds no reply, and waits for ever. `expire` deletes the rows the same way
    (`src/storage/entities.ts:462`), and so does the sweep of decision 0245, which runs `expire` on whichever runner
    holds its singleton. A process with no runner address, a client of the cluster alone, has a `ShardingConfig` of
    its own too.
  - The test. **Reproduced** by `FAILING: a second client on a runner with a longer poll of replies is answered
    after a later step` in `src/cluster.test.ts`, added by commit `e5188e5`. The test failed in three runs of
    three. With the default poll on both runners, it passed in three runs of four, and the cause of the one failure
    was not looked into. With the poll of 5 s and without the later step, it passed, and the client was answered at
    its poll.
  - Where a fix could begin. The least time could come from the longest poll of the runners on the file. `sharding`
    could record each runner's `entityReplyPollInterval` with its versions, for instance. The guide would then say
    that a process that is a client alone polls no slower than the runners.
- **An operation's message is applied twice when a fiber of a runner that lost its shard sends after the work
  ended.** The two notes are decisions 0090 and 0092.
  - The premise. Decision 0090 deletes an operation's replies and Cluster's rows with the work that sent them. It
    is safe because nothing sends under a key once its work ended: an operation leaves only through its
    completion, so its fiber is done before the work ends. Decision 0092 takes that away. It names a runner frozen
    past its lease, or cut off from the file, whose operations run on while the next holder starts them again. It
    holds that their steps commit nothing and that only their effects on the world may run twice. But an
    operation's `send` is no step of its runner. It is a request through Cluster, and the receiver's runner steps it.
  - The sequence. Entity A's at-least-once operation sends a message to entity B under one request id. Runner 1
    holds A and freezes before the operation sends. Runner 2 takes A's shard once the lease expires, activates A,
    and runs the operation again. Its send is stepped by B, which keeps the request's Cluster id under A's work.
    The operation completes, and A's step ends the work. That step deletes B's reply to the request
    (`src/storage/entities.ts:382`) and Cluster's rows under the kept id (`src/storage/entities.ts:390`). Runner 1
    wakes, and its operation's fiber sends the same request before the runner's next refresh runs the shard's
    finalizer. Cluster finds no row under the primary key, so the request is a new one. B's door step keeps the id
    as pending, since A's work has ended (`keepSent` in `src/storage/cluster.ts:208`, called at
    `src/runtime/doors.ts:347`). It then steps the arrival, finds no reply under the request, and applies the
    message a second time. `send` of `src/cluster.ts:470` reads nothing of the asker's work, and only the reset of a
    saved failure does (decision 0170).
  - A second way in. The door of decision 0162 may load an entity of a shard Cluster acquired and released before
    the shard's singleton started. No finalizer crashes that entity, and the operations its settled steps start run
    beside those of the next holder, with the same sequence after.
  - The check. **Reasoned** from the code and the notes, not reproduced. A test would freeze a runner's operation
    before its send while keeping its finalizer from running: hold the operation's fiber on a gate in an
    uninterruptible region, let a second runner take the shard and complete the work, then open the gate, and count
    the receiver's applications of the message.
  - Where a fix could begin. The door's step could refuse, with no step of the receiver, a request whose asker's
    work has ended, where `keepSent` finds it ended: nothing waits for that answer (decision 0090). It would answer
    as a step of an ended work does today, and keep the id pending.

### Suspects ruled out

- **0244 and 0104, a budget of 1.** At Effect 4.1.3 a budget of 1 lets fibers on. Under it a fiber that a
  `Deferred` resumes inline yields at its first step, which the scheduler never preempts under `inline`. A test of
  a waiter whose continuation runs in its first step found that `everySchedule` under `inline` still reaches the
  order a budget of 1 gives. It reaches the order by a preemption at the waiter's second step. The test passed, so
  it was not kept, and it was tried on that one program only.
- **0244, a cancelled yield's task.** When the task of a cancelled yield starts, `step` sets `running` to the fiber
  that yielded. The test clock's tracker can resume, inline in that task, the fiber that moved the clock. That fiber
  is then counted as one on another's stack, and is asked of preemption with no task ready. This only adds orders
  to explore, and a test moves the clock with its window closed.
- **0244 and 0104, a run resumed from an automatic yield.** Effect first asks such a run at its third step, since
  `runLoop` counts the resumption as one step and skips the check at the next. `step` sets `running` to the fiber as
  its task starts. So the run that `evaluate` makes again to interrupt the fiber's children is still let through.
- **0134 and 0244, the loop's `yieldNow`.** The yield of decision 0134 is no automatic yield, so its run is asked at
  its first step. Under `queued` it then yields once more as a resumption, and under `inline` it runs on. Either
  way it is an order the scheduler already reaches.
- **0175 and 0160, the guard of a creation.** Decision 0175 says the check runs "after it finds the entity stored",
  so a creation might skip it. `doorStep` calls `guard` first, before the creation (`src/runtime/doors.ts:292`).
- **0178 and 0175, the example's lease.** The example's lease of 3 s is shorter than Cluster's default refresh of
  10 s. Effect refreshes the lease at a third of its expiration where that is shorter, by `effectiveInterval` in
  `cluster/internal/shardLock.ts`.
- **0161 and 0081, a commit of the loop that fails.** The loop's step sets the machine and the count in memory
  before its commit. After a commit that fails, a door's step could run before the crash. `settle` then finds that
  the stored count differs from the count held, and loads the entity again.
- **0161 and 0175, the guard before the settling.** `applyOnCluster` and `doorStep` run `guard` before `settle`. So
  a runner whose lease is gone performs nothing a door's step left uncommitted, and the next holder starts it from
  what is stored.
- **0163, the watcher.** The version is read on the runner's one connection, and so waits for the transaction
  under way. A reading takes its topic's signal before its page, and `tellAll` completes every signal taken. So a
  commit of another runner between a page and a wait moves the version from the one kept, and wakes the reading.
- **0248, a retry near the end of the least time.** A retry on another runner of a request already answered needs
  no poll. Cluster answers a duplicate whose last reply is a `WithExit` at once, from what `saveRequest` gives
  (`cluster/Runners.ts` at 4.1.3).
- **0167 and 0169, the rows of `Resumed`.** The rows of a `Resumed` go with its pending id at the next step. A
  `Resumed` is sent with `discard`, so no client reads its reply.
- **0170 and 0169, a work that ends between the keep and the reset.** The step that ends the work deletes the rows
  first. The reset then finds no request, and a client that finds the work ended waits until it is interrupted.
- **0159 and 0174, a runner launched again at its address.** `recordVersions` replaces the versions recorded under
  the runner's address in its own transaction, so `outranked` reads what the runner runs now.
- **0219 and 0175, the drain on Cluster.** The drain ends before `Sharding` is released, so the completions it steps
  pass the lease check.

### Suspects checked by reading, that lose nothing

- **0249 and 0248, a second client's reset drops a keep of a reply.** `reset` reads the request's latest answer,
  then deletes the kept id (`src/cluster.ts:306` to `318`). A second client may read `Suspended` there. The first
  client's retry may then be answered and keep the id, and the second client's `forgetGiven` then deletes that keep.
  Decision 0249 says that an id whose answer is a reply is never dropped. The second client's `sharding.reset` then
  changes nothing, since it expects a reply that is no longer the latest. Its send is answered from the saved reply,
  and `keptGiven` keeps the id again. So only a second client interrupted during that send leaves Cluster's rows for
  ever. Nothing is lost.
- **0176 and 0171, a client of the old code after a rename.** A process with no runner address may deploy any
  program (decision 0174), so a client of the old code runs after a rename. Its client keeps given ids under the old
  name. `renamed` in `src/storage/tables.ts` moves `effecttea_given_requests` only when the old name still holds a
  row of the tables it names, and none of those tables is `effecttea_given_requests`. A step deletes given ids under
  its own name alone, and `expire` under its program's. So the rows of those requests stay in Cluster's tables, and
  nothing is lost.

### Suspects noticed and not checked

- **0162, the cost of an entity no finalizer crashes.** The second way into the second finding above. What it costs
  the world of an at-least-once operation beside the next holder's run, apart from the messages it sends, was not
  checked.

### Notes not read whole

- None. Every note of the table was read whole, and with the code the table names.

## 2026-11-11: inventory of the premises only reasoned, against the rule of `AGENTS.md`

`AGENTS.md`, under Notes, now says that no premise of what code does is only reasoned. This inventory sorts every
premise that a note taken before that rule says is reasoned, so that the second reading of the premise review, a
step of the [roadmap](../roadmap.md), starts from it. A subagent sorted the 125 premises of 85 notes, read from
their sections `What it rests on`. It changed no file. The session that recorded it checked a sample of its rows
against the notes and the tests: 0092, 0161, 0167 and 0172.

- `chosen`, 36: a judgment that no test can make fall. Nothing is to do.
- `left-out`, 9: a case that the decision leaves out. Three are open questions already, of 0248 and 0126. Six are
  not: 0192, 0123 twice, 0125, 0129 and 0172's two loaders on a pool of PostgreSQL. Each goes in
  [`docs/open-questions.md`](../open-questions.md).
- `behaviour`, 80: a claim about what code does. Four are of a rule that a later note replaced: 0191 by 0216, a
  premise of 0194 by 0221, one of 0092 by 0161, and 0101 by 0104. Forty-two are checked since, by a later test or
  an open question. Thirty-six are of a rule still kept and checked by nothing: 7 of risk high, 7 medium and 22 low.
- The seven of risk high are 0092's `Resumed` to every sender that waits, 0161's lock never held across a wait for
  the connection, 0161's door step that reads no machine between its commit and its assignments, 0162's entity
  that enters before the mark or finds it, 0167's two premises on `Resumed`, and 0172's takers outside a
  transaction. Each row says the test that would decide it.
- Four rows count as checked by a test of a neighbouring case: 0221, 0092's count of steps, 0131 and 0171. The
  second reading reads those tests against the premise.
- A premise that is chosen may still be touched by a bug: 0127's acknowledgement of a boundary once `send` is
  answered is chosen, and bug 60 says that even it may lose an item.

### The premises, one row each

`live`, `already` and `risk` hold for `behaviour` alone. The last column is the check for `behaviour`, and the open
question for `left-out`.


| note | premise | group | live | already | risk | check / open question |
|------|---------|-------|------|---------|------|------------------------|
| 0181 | A `const` message is assignable to the schema's ReadonlyArray type | behaviour | live | yes: `a timer needs no type parameter… (decision 0181)` in src/program.test.ts, by `bun run typecheck` | low | — |
| 0182 | A caller retries a creation with the flags it first sent | chosen | — | — | — | a retry with other flags is the caller's mistake |
| 0184 | A commit wakes a wait with no time limit as it wakes a timed one | behaviour | live | yes: open question A reader with no time that misses a commit (bugs 37, 39) | high | — |
| 0185 | The waiting senders are the ones `suspended` lists | behaviour | live | yes: open question Who an operator sees waiting (bugs 63, 72) | low | — |
| 0191 | The transaction's advisory lock orders concurrent `createTables` on PostgreSQL | behaviour | superseded by 0216 | yes: the two tests of the migrations in src/postgres.test.ts (0222) | medium | — |
| 0192 | The machine runs only where `node:crypto` is; no browser rehearsal | left-out | — | — | — | no |
| 0194 | The runtime sleeps by `Effect.sleep` alone, no host timer | behaviour | live | yes: `the library reads the time and sleeps through Effect alone, which a test moves` in src/runtime.test.ts | medium | — |
| 0194 | A timer fires at the time it stores | behaviour | superseded by 0221 | yes: `the waker fires a stored timer within an hour of a suspended host’s return` in src/runtime/waker.test.ts | medium | — |
| 0195 | `effect/persistence` is not read as what the library is built on | chosen | — | — | — | a reading of the name |
| 0198 | An application names no table of its own with `tea_` | chosen | — | — | — | the caller's mistake; the prefix is `effecttea_` since 0218 |
| 0203 | A part found in a file of `examples/` is run by a test | behaviour | live | no | low | a check in src/form.test.ts that every non-test file of an example is imported by a test file of it |
| 0207 | A lone surrogate compares otherwise on each dialect | behaviour | live | no (spikes/sqlite-column-values.test.ts reads it back as U+FFFD; no comparison) | low | a spike comparing a lone surrogate against its U+FFFD form on SQLite and PGlite, in spikes/pglite-dialect.test.ts |
| 0215 | PL/pgSQL resolves a name of a function's body by the call's `search_path` | behaviour | live | no | medium | a test in src/postgres.test.ts that deletes through `effecttea_outbox_drops_its_publication` under another `search_path` |
| 0215 | An advisory lock is the database's, not a schema's | behaviour | live | yes: the two tests of the hold in src/postgres.test.ts (0222) | high | — |
| 0215 | A pool gives every connection the role's `search_path` | behaviour | live | yes: `every connection of the pool finds the tables…` in src/postgres.test.ts (0222) | medium | — |
| 0216 | Two runs at once on PostgreSQL wait on the lock of the migrations table | behaviour | live | yes: the two tests of the migrations in src/postgres.test.ts (0222, 0225) | medium | — |
| 0218 | An application names no table of its own with `effecttea_` | chosen | — | — | — | the caller's mistake, and the launch dies on it |
| 0220 | A message offered on one process is handled by its own `Receive`, not `Handle` | behaviour | live | no | low | a test in src/runtime/loop.test.ts, under the scheduler, that a caller's request gives a `Receive` span and no `Handle` span |
| 0221 | A host's timers do not run while the host is suspended | behaviour | live | yes: `the waker fires a stored timer within an hour of a suspended host’s return` in src/runtime/waker.test.ts (the rule holds either way) | low | — |
| 0223 | The room a prune needs grows with what it deletes | behaviour | live | no (spikes/full-volume.test.ts tries one size) | low | spikes/full-volume.test.ts at two sizes of the log, measuring the room each prune needs |
| 0224 | A step's time may run against its `seq` | behaviour | live | no | low | a test under the scheduler in src/runtime/loop.test.ts where two steps of one partition commit with times against their `seq` |
| 0224 | The reading costs one lookup per consumer and partition | behaviour | live | no | low | a spike of the plan, as spikes/sqlite-partitions-plan.test.ts, for the age reading |
| 0240 | A program keeps and reads the steps it chains | chosen | — | — | — | a reading of what a program may do with a `Step` |
| 0241 | `runtime.ts` and `runtime/` may stand side by side | behaviour | live | yes: `bun run typecheck` and `bun test`, and the form test of groups in src/form.test.ts | low | — |
| 0241 | A test moved to another file runs the schedules it ran before | behaviour | live | yes: seen 2026-11-10, and `bun run test:pins` runs each pin against its mutation | medium | — |
| 0242 | Splitting the tests among jobs changes no test's result | behaviour | live | yes: spikes/bun-test-shards-partition-the-files.test.ts and the runs on the branch | low | — |
| 0245 | Only the boundary knows how long its callers retry for | chosen | — | — | — | the boundary's knowledge, as 0125 says |
| 0246 | A fiber that sleeps before its commit wakes a `txRetry` body | behaviour | live | no | low | a test in spikes/effect-tx-under-the-scheduler.test.ts with a TestClock sleep before the commit |
| 0246 | I/O within a transaction would run again at each retry | behaviour | live | no | low | a test in spikes/effect-tx-under-the-scheduler.test.ts counting an `Effect.sync` inside an `Effect.tx` that conflicts |
| 0247 | A version no migration reads throws inside `check`'s guard | behaviour | live | yes: `tells a row the migrations do not read from an activation that suspends` in src/check.test.ts | low | — |
| 0248 | The clocks of two runners differ by less than a second | left-out | — | — | — | yes: The margin of a caller's rows on Cluster, once runners have clocks of their own |
| 0248 | A read of replies that fails twice running is rare | left-out | — | — | — | yes: The margin of a caller's rows on Cluster… (its bullet on a client that missed its polls) |
| 0248 | The margin: two polls and 1 000 ms outlast the second client's read | behaviour | live | yes: open question The margin of a caller's rows on Cluster…, and roadmap bug 89, reproduced | high | — |
| 0249 | The id's deletion commits before `Sharding.reset` runs | behaviour | live | yes: the three tests named in the note, in src/cluster.test.ts | high | — |
| 0250 | A sample of one deviation in twenty finds most bugs a sweep finds | chosen | — | — | — | a judgment of cost against the budget |
| 0250 | A join under a 5 s timeout checks what a sleep and a reading did | behaviour | live | no | low | a mutation of `scripts/mutate.ts` or a pin that answers otherwise, run against the joined form |
| 0251 | A sender and Cluster's round rest at a millisecond as the waker does | behaviour | live | yes: open question A sender and Cluster's round at the least retry | high | — |
| 0252 | A crash that comes back at every activation is retried while the process runs | behaviour | live | yes: `an entity the waker cannot activate is tried again after the retry…` in src/runtime.test.ts; open question The cases of a crash's retry not run yet | medium | — |
| 0252 | A mark on Cluster of an entity whose shard moved is harmless | behaviour | live | yes: roadmap bug 33, in open question The cases of a crash's retry not run yet | medium | — |
| 0252 | An at-most-once fiber has stopped before the activation records `unknown` | behaviour | live | yes: open question An operation still stopping beside its `unknown` (bug 31) | high | — |
| 0253 | Only the operation's own runs read or write its answers, one after the other | behaviour | live | yes: open question An operation's kept answer on Cluster across a crash, and under two runs at once | high | — |
| 0092 | A door bounded by `maxIdleTime` ≤ passivation follows the entity out | behaviour | live | no | medium | a test in src/cluster.test.ts that a passivated entity leaves Cluster's resident entities within `passivate.millis` |
| 0092 | The count of steps keeps memory equal to what is stored, for the runtime's machine | behaviour | live | yes: `a door step whose commit fails is dropped…` and `a door step that loads an entity and whose commit fails…` in src/cluster.test.ts (0161, 0252) | high | — |
| 0092 | SQLite's one transaction orders two fibers stepping one entity, no lock needed | behaviour | superseded by 0161 | no | high | — (0161 takes the entity's lock inside the transaction) |
| 0092 | The runtime's RPCs leave no interrupts in `cluster_messages` | behaviour | live | no (roadmap bug 59, reproduced, is near it) | low | a test in src/cluster.test.ts that a caller interrupted while it waits leaves no interrupt row |
| 0092 | A resumption reaches every waiting sender by `Resumed`; a defect's id leaves no rows | behaviour | live | no (src/cluster.test.ts wakes one sender only) | high | a test in src/cluster.test.ts with two senders of two entities waiting on one receiver resumed on another runner |
| 0099 | A library cannot promise more stability than what it is built on | chosen | — | — | — | a judgment |
| 0101 | The tests under budgets assert what holds once the clock passed | behaviour | superseded by 0104 | no | low | — (no test runs under a budget since 0104) |
| 0102 | The test reaches every point where an interruption is seen | behaviour | live | yes: `a deploy interrupted anywhere keeps its name and its waker…`, under prioritized schedules and every deviation, in src/runtime.test.ts | high | — |
| 0103 | The runtime reads time only through `DateTime.now` and `Effect.sleep` | behaviour | live | yes: `the library reads the time and sleeps through Effect alone, which a test moves` in src/runtime.test.ts | medium | — |
| 0104 | Every scenario of the runtime is deterministic once its choices are | behaviour | live | yes: `bun run test:pins` replays each pinned seed; spikes/effect-scheduler-controlled.test.ts | medium | — |
| 0110 | The fiber waiting for detached work runs, forked in the process's scope | behaviour | live | yes: `a deploy interrupted anywhere…` in src/runtime.test.ts, which ends only with it | high | — |
| 0112 | No test fails without the interruptible option at the pinned version | behaviour | live | yes: spikes/effect-uninterruptible-fork.test.ts; open question The forks of an uninterruptible activation (bug 22) | low | — |
| 0114 | No operator stands in the line without an event offered | behaviour | live | no | medium | a test in src/runtime/callers.test.ts that interrupts a resume between its registration and its offer, if a yield can be put there |
| 0116 | The loop interrupts the sleep once it has taken an item | behaviour | live | no | low | a test in src/runtime/loop.test.ts counting the fibers left after an event ends a wait |
| 0117 | A run beginning after another's in the same task is on its stack | behaviour | live | yes: spikes/effect-inline-start-yields.test.ts | low | — |
| 0119 | A step during the drain arms no timer | behaviour | live | yes: `a completion in the drain… arms no timer` and `a step the drain handles… arms no timer` in src/runtime.test.ts | medium | — |
| 0119 | A message an at-most-once operation sends is delivered during the drain | behaviour | live | yes: `a message an at-most-once operation sends to another entity in the drain is delivered` in src/runtime.test.ts | high | — |
| 0120 | The at-most-once operation then delivers `unknown` | behaviour | live | yes: `an at-most-once operation that outlasts the drain delivers unknown, as after a crash` in src/runtime.test.ts | high | — |
| 0123 | 43 characters fit the services a program calls | left-out | — | — | — | no |
| 0123 | Two keys never share a SHA-256 digest | left-out | — | — | — | no |
| 0124 | A boundary exists in every deployment, and authenticates | chosen | — | — | — | the deployment's duty |
| 0124 | A sender as fine as an identity keeps request ids apart | chosen | — | — | — | the caller's mistake (near: Request ids under a sender of `null`) |
| 0125 | A boundary knows how long its protocol retries for | chosen | — | — | — | the boundary's knowledge |
| 0125 | The runtime's clock and the boundary's agree well enough | left-out | — | — | — | no |
| 0126 | A migration is a pure function | chosen | — | — | — | the program's duty |
| 0126 | A migration whose cases hold reads every row as when deployed | left-out | — | — | — | yes: Generated cases of a migration |
| 0126 | Carrying every migration costs too little to drop them | chosen | — | — | — | a judgment of cost |
| 0127 | A source gives each item a stable offset or id | chosen | — | — | — | the source's duty |
| 0127 | A boundary acknowledges an item only once `send` is answered | chosen | — | — | — | the boundary's duty (open question What a boundary acknowledges, bug 60) |
| 0128 | A runner declared droppable acts on nothing in the world | chosen | — | — | — | the caller's mistake |
| 0129 | A runner reaches `Entities` only through its own services | left-out | — | — | — | no (an `Entities` kept in a variable) |
| 0130 | An operation returned the same on its completion is a mistake | chosen | — | — | — | a judgment |
| 0131 | A world's reply is deleted once the work that asked ends | behaviour | live | no | low | a test in src/rehearse.test.ts reading the world's replies after a work ends |
| 0131 | A receiver handled inside `send` gives the runtime's reply | behaviour | live | yes: `a rehearsal gives the replies and the projection the runtime gives` in src/rehearse.property.test.ts | medium | — |
| 0132 | The waker's queries select only key rows with a `due` | behaviour | live | no | low | a test in src/storage.test.ts that a key row without a timer is never read by the waker's queries |
| 0133 | effect-tea Guide's rules on splitting hold of a stored state | chosen | — | — | — | a reading of effect-tea's design |
| 0133 | A state is a value nothing changes in place | chosen | — | — | — | the program's duty |
| 0134 | The loop's yield shows no fiber a state it could not see | behaviour | live | yes: the explored tests under `bun run test:release` | medium | — |
| 0135 | 262 144 characters is a threshold an operator wants | chosen | — | — | — | a default |
| 0136 | A parameter's JSON keeps its order of fields through storage | behaviour | live | no (spikes/effect-schema-field-order.test.ts covers writing, not a round trip) | medium | a test in src/storage.test.ts storing a parameter with integer-like and other fields, reloading, and keeping its work |
| 0137 | A consumer can act on one entity's order alone | chosen | — | — | — | a reading of Kafka's promise |
| 0137 | `position` rises with `seq` within a partition with two writers | behaviour | live | yes: `two writers of one partition commit in the order of their seq…` in src/postgres.test.ts (0222) | high | — |
| 0138 | A consumer acts on a part of the projection | chosen | — | — | — | a judgment of use |
| 0138 | A topic is a pure function of the projection | chosen | — | — | — | the program's duty |
| 0139 | A caller in the process is served by JSON as well | chosen | — | — | — | a judgment |
| 0140 | A consumer acts on its topic's value, not the projection | chosen | — | — | — | a judgment of use |
| 0141 | A parameter the types require may still be left out | behaviour | live | yes: `a cursor, a partition or a limit out of its range is its caller’s defect…` in src/runtime.test.ts | low | — |
| 0145 | A range read in order with a limit stops after its rows | behaviour | live | yes: spikes/sqlite-page-statements-plan.test.ts (range, no sort) and SQLite's planner page | low | — |
| 0147 | A caller's message is never in the stored mailbox while its caller waits | behaviour | live | no | medium | a test under the scheduler in src/runtime/callers.test.ts that reads the stored mailbox while callers wait at the bound |
| 0147 | A refused message leaves nothing to undo | behaviour | live | yes: `a send past the bound of its entity’s callers is answered Full, stores nothing…` in src/runtime.test.ts | low | — |
| 0148 | No caller sums an index of strings on purpose | chosen | — | — | — | the caller's mistake |
| 0149 | A report's stores find what they need in the projection | chosen | — | — | — | a judgment of use |
| 0149 | A store made for it answers every question beyond the three forms | chosen | — | — | — | a judgment |
| 0151 | 10 000 is a number an operator wants by default | chosen | — | — | — | a default |
| 0152 | A topic no consumer holds has no reader needing its rows | chosen | — | — | — | a reader by hand is the caller's |
| 0155 | A handle's step is a function of the parent's state alone | chosen | — | — | — | the program's purity |
| 0155 | A hand-written optic keeps nothing of the state it replaces | chosen | — | — | — | the program's mistake |
| 0157 | A session advisory lock is held until its session ends | behaviour | live | yes: the two tests of the hold in src/postgres.test.ts (0222) | high | — |
| 0157 | `REPEATABLE READ` gives every statement the first snapshot | behaviour | live | yes: the three tests of pages in src/postgres.test.ts (0222) | medium | — |
| 0157 | Many connections run steps at once and the head still orders commits | behaviour | live | yes: `two writers of one partition commit in the order of their seq…` in src/postgres.test.ts (0222) | high | — |
| 0158 | A consumer reads a page in the transaction it acks in | chosen | — | — | — | a use the design allows |
| 0161 | No fiber holds an entity's lock while it waits for the connection | behaviour | live | no | high | a test under the scheduler in src/cluster.test.ts (or src/runtime/doors.test.ts) racing a door's step and a loop's step for one entity with the connection held |
| 0161 | No door step reads machine between commit and assignments; a leaving entity settles first | behaviour | live | no | high | a test in src/runtime/doors.test.ts that yields between a door's commit and its assignments, and tells the entity to leave there |
| 0162 | A waker reading every partition would activate refused entities again and again | chosen | — | — | — | what the rejected design costs |
| 0162 | An entity either enters before the mark or finds it | behaviour | live | no | high | a test in src/runtime/doors.test.ts that loads an entity during the shard's finalizer, under the scheduler |
| 0162 | The loop of an entity that left steps nothing more | behaviour | live | no | low | a test in src/cluster.test.ts that counts the loop's wakes after its shard moves |
| 0163 | `PRAGMA data_version` costs little beside the steps | behaviour | live | no | low | a measure in spikes/sqlite-data-version.test.ts of the pragma's time against a step's |
| 0165 | A latest reply no longer `Suspended`/`NotFound` is a step's reply | behaviour | live | no | medium | a test under the scheduler in src/cluster.test.ts of a retry reset while a concurrent retry's step stores its reply |
| 0165 | A caller who waits is served better than one answered `Full` | chosen | — | — | — | a judgment |
| 0166 | An operator's event is rare enough to keep Cluster's rows | chosen | — | — | — | a judgment (open question The rows of operators' events on Cluster) |
| 0167 | One `Resumed` per sender's entity wakes every waiting request of it | behaviour | live | no | high | a test in src/cluster.test.ts with two requests of one sender waiting on one receiver, resumed once |
| 0167 | A `Resumed` lost to a sender whose shard moved costs nothing | behaviour | live | no | high | a test in src/cluster.test.ts that moves the sender's shard before the resume, and waits for the operation's answer |
| 0168 | Every failure Cluster saves passes with time or the operator fixes it | behaviour | live | yes: open question A cause holding U+0000 in Cluster's tables | medium | — |
| 0169 | A step reads the asker's work after its commit or before it began | behaviour | live | no | low | a test in src/cluster.test.ts of a request answered while its asker's work ends |
| 0170 | No delivery read before the work ends saves its failure after | behaviour | live | no | low | a test in src/cluster.test.ts that holds Cluster between its read and `saveReply` across the work's end |
| 0170 | A client finds the asker's work ended only on a runner without its shard | behaviour | live | no | medium | a test in src/cluster.test.ts whose shard's finalizer does not run before another runner gains it |
| 0171 | The client's clock, read after the answer, is no earlier than the step's | behaviour | live | no | low | a test in src/cluster.test.ts with the client's clock behind the step's |
| 0171 | A crash in `expire` leaves no request without its replies | behaviour | live | yes: `a process killed inside a transaction leaves… nothing of the transaction` in spikes/sqlite-transaction.test.ts | medium | — |
| 0172 | No taker outside a transaction loads an entity on Cluster | behaviour | live | no | high | a check in src/form.test.ts that every taker of an entity's lock on Cluster runs inside a transaction, with a case it refuses |
| 0172 | Two loaders of a pool of PostgreSQL wait for one lock | left-out | — | — | — | no (the roadmap's step on Cluster across machines on PostgreSQL) |
| 0173 | The door's step reads the work after the step that ended it committed | behaviour | live | no | low | the same test as 0169's, in src/cluster.test.ts |
| 0173 | The time between Cluster's read and its save is short | behaviour | live | no | low | a measure in src/cluster.test.ts of the time between `getUnprocessedMessages` and `saveReply` |
| 0174 | A program deployed without its record escapes both checks of 0159 | behaviour | live | no | low | a test in src/cluster.test.ts that deploys with no record and steps past `outranked` and `atNewest` |
| 0177 | I/O in a `Tx` transaction would run again after a commit | behaviour | live | no | low | the same spike as 0246's, in spikes/effect-tx-under-the-scheduler.test.ts |

## 2026-11-12: premise review of area 13, the notes taken after the first reading

The reviewer's report, on the branch `claude/premise-review-area-13-fe5765`, cut from `main` at `f7c6076`. One
finding is reproduced, by a test named `FAILING:` on the branch, at commit `2d0fe63`. The reviewer wrote none of
the notes it read. The notes of the area are read whole with the code that keeps them. The earlier notes they change
or cite are read in part: their `What it rests on` as the later note reads it again, and the code both notes cite.

### The notes read

| Note | Role | How it was read |
| --- | --- | --- |
| 0250 | of the area | whole, with `package.json`, `bunfig.toml` and the declarations of `slow` |
| 0251 | of the area | whole, with the sleeps on `retry` of `src/runtime/waker.ts`, `src/runtime/callers.ts` and `src/runtime/loop.ts` |
| 0252 | of the area | whole, with `waking` of `src/runtime/waker.ts`, and `crash`, `nothingToDo` and `spare` of `src/runtime/loop.ts` |
| 0254 | of the area | whole, with the scripts of `package.json` |
| 0255 | of the area | whole, with `hold` of `src/storage/tables.ts` |
| 0256 | of the area | whole, with `outside` of `src/runtime.ts` |
| 0258 | of the area | whole, with the step of the rest in `waking` |
| 0259 | of the area | whole, with `waking` and `due` of `src/storage/entities.ts` |
| 0261 | of the area | whole, with `draining` as `activating` of `src/runtime/doors.ts` reads it |
| 0262 | of the area | whole |
| 0263 | of the area | whole, with `createTables` and `migrate` of `src/storage/tables.ts` |
| 0264 | of the area | whole |
| 0266 | of the area | whole, with `advance` of `src/rehearse.ts` and `checkWork` of `src/machine.ts` |
| 0267 | of the area | whole |
| 0269 | of the area | whole, with `receive`, `discard`, the rows of replies and `carriedText` of `src/machine.ts`, the reading of `carried` in `src/storage/entities.ts`, and `primaryKey` of `src/cluster.ts` |
| 0271 | of the area | whole, with the forks of `crash` |
| 0273 | of the area | whole, with `partitionOf` and `partitioned` of `src/storage/tables.ts`, `singletonsOf` and `activating` of `src/runtime/doors.ts`, and the check of a misplaced entity in `waking` |
| 0274 | of the area | whole, with `crash`, `leave` and `unload` of `src/runtime/loop.ts`, `entities` and `unlessCrashed` of `src/runtime/callers.ts`, and `waking` |
| 0275 | of the area | whole |
| 0276 | of the area | whole |
| 0277 | of the area | whole |
| 0278 | of the area | whole |
| 0279 | of the area | whole, with `createTables` and `sharding` of `src/cluster.ts` |
| 0280 | of the area | whole, with `activating` of `src/runtime/doors.ts` |
| 0187 | changed by 0266 | in part: its rule as 0266 restates it, and `advance` of `src/rehearse.ts` |
| 0056, 0068, 0077, 0162, 0046, 0023, 0045, 0147 | changed by 0274 | in part: their premises as 0274 reads them again, and the code 0274 changes |
| 0029, 0161 | changed by 0252 | in part: their premises as 0252 reads them, and `nothingToDo` |
| 0062 | changed by 0259 | in part: its rule for the waker's reading |
| 0119, 0051, 0102 | changed by 0261 and 0280 | in part: their premises as 0261 and 0280 read them again |
| 0048, 0124, 0180, 0200, 0245 | changed by 0269 | in part: their rules as 0269 restates them |
| 0221 | changed by 0258 | in part: its bound of an hour, in `waking` |
| 0137 | changed by 0273 | in part: its partition, in `partitionOf` |
| 0080, 0157 | changed by 0267 and 0255 | in part: their hold, as 0267 and 0255 read it |
| 0208 | changed by 0251 and 0264 | in part: its checks of the options |
| 0211, 0213, 0214 | changed or cited by 0276 | in part: their rule of a value read as a caller reads it |
| 0209 | changed by 0277 | in part: its refusal, as 0277 restates it |
| 0223 | changed by 0278 | in part: its procedure, as 0278 restates it |
| 0215, 0217, 0225 | changed by 0263 and 0279 | in part: their premises as 0263 and 0279 read them again |
| 0184 | changed by 0256 | in part: its refusal of a reader within a transaction |
| 0112, 0164 | changed by 0271 | in part: their rule of a fork |
| 0131 | changed by 0262 | in part: its `sendFrom` |
| 0104, 0212, 0241, 0242 | changed by 0250 and 0254 | in part: their checks as 0250 and 0254 restate them |

The pairs that `bun scripts/premise-pairs.ts --list --note=<the notes of the area>` gives were read by the
declarations they name, with the note of the area whole and the earlier note in part.

### Findings

#### 1. A rehearsal advanced by less than a millisecond makes a program's timer a defect

- **The notes.** [Decision 0187](0187-a-rehearsal-moves-time-by-a-duration.md) moves a rehearsal's time by any
  finite duration. [Decision 0266](0266-a-timer-that-catches-up-fires-with-a-due-time-that-grows.md) makes a timer
  due between two milliseconds a defect of the program, since the storage holds whole milliseconds.
- **The premise that fell.** Decision 0266 rests on a premise it does not write: a message is handled at a whole
  millisecond, so a timer armed from the message's time is due at one. The runtime's clock gives whole
  milliseconds. A rehearsal's `advance(Duration.micros(1500n))` leaves the rehearsal's time between two
  milliseconds, and so does a rehearsal started at such a time.
- **The sequence.** A test advances a rehearsal by 1.5 ms, then sends a message that arms a repeating timer due in
  the past. The timer fires at the rehearsal's time, and the program arms the next period one second after the time
  the firing was handled at. The machine refuses that timer with `the timer under 'a' is due at 1793354401001.5,
  which is no whole millisecond`, and the rehearsal dies. The runtime runs the same program. So a rehearsal refuses a
  program the runtime runs, which is the form of bug 42.
- **Reproduced** by `FAILING: a timer armed from a time an advance of microseconds reached fires, as the runtime
  would run it`, in `src/rehearse.test.ts`, at `2d0fe63`. It fails in the program's step, at `checkWork` of
  `src/machine.ts`, and not in its setup.
- **Where a fix begins.** At `advance` of `src/rehearse.ts`, which would refuse a duration that is no whole number
  of milliseconds, or round it. The start of `rehearse` would do the same to the time it is given.

### Leads

None beyond the suspects noticed and not checked, below.

### Suspects ruled out

- That the waker's round, under decisions 0258, 0259, 0273 and 0274 together, rests with a timer it knows of due,
  or spins: ruled out by every test of `src/runtime/waker.test.ts` under `SCHEDULES=all`, which runs every seed and
  every deviation of its explored tests. The eight tests passed.
- That an operator's change of the number of shards makes the stored partitions differ from Cluster's shards in
  silence: ruled out by `partitioned` of `src/storage/tables.ts`, which stores the number of partitions at the first
  launch and makes a launch given another number die (decision 0137).
- That a retry after a deploy is answered `Reused` where the migration writes the message's fields in another order:
  ruled out by `a retry after a deploy is compared with what the caller's request carried, read through the
  migrations`, in `src/runtime.test.ts`, and by `carriedText` of `src/machine.ts`, which compares canonical text.

### Suspects noticed and not checked

- On Cluster, the caller's client resets a `Reused` that Cluster saved (decision 0269). Two clients of one request
  id under another message may meet as bug 91 says: one client's reset drops the keep of the other's answer. It is
  the form of bug 91 under `Reused`, only reasoned. A test of `src/cluster.test.ts` with two clients of one request id
  and two messages would check it.
- On Cluster, a door's step during the undo's wait of decision 0280 may take a caller's message and start an
  at-most-once operation, as bug 21 says of a drain. The undo counts the operations of its own deployment, so it may
  wait for that one too. A test of `src/cluster.test.ts` that fails a deploy after its door is registered, and sends a
  message in the undo's wait, would check it.
- Under decision 0274, an operation's send to an entity whose stop runs is sent again after `retry`, since
  `unlessCrashed` of `src/runtime/callers.ts` reads the defect `Stopping` as a crash of the receiver (decision 0046).
  It is a reading only. A test of `src/runtime.test.ts` that crashes a receiver with a finalizer held, while an
  operation of another entity sends to it, would check it.

### Where the code does otherwise than its note

- `waking` of `src/runtime/waker.ts` logs a refused stored time (decision 0259) and an entity under a partition not
  its shard (decision 0273) through one set, `refused`. An entity logged for one case is never logged for the other,
  though each note says that the first case of each entity in the process is logged.
- `test:slow` of `package.json` names its files, as the reading of decision 0254 found. No check reads the files that
  declare `slow` against that list. The list agrees with decision 0250 today.

### Notes not read whole

The earlier notes of the table, read in part as it says. Each lies in an area another review read whole.

## 2026-11-12: premise review, second reading, of Messages, requests and replies

The notes read are 0004, 0009, 0010, 0015, 0021, 0023, 0047, 0048, 0059, 0060, 0065, 0069, 0124, 0125 and 0245, with
the notes that change or cite them. The reviewer read none of the earlier reports of the area. The review found one
bug, reproduced on one process, and two leads of the same form.

### The notes read

The list holds the notes of the area, the notes the index lists as changing one of them, the notes that cite one of
them by `grep -rlwE`, and the notes that `bun scripts/premise-pairs.ts --list` finds beside one of them in a
declaration of `src/`. The last group is long, since `src/machine.ts` and `src/storage/entities.ts` cite many notes in
one declaration, and most of it was not read.

| Note | Role | How it was read |
| --- | --- | --- |
| 0004 | of the area | whole, with the code |
| 0009 | of the area | whole, with the code |
| 0010 | of the area | whole, with the code |
| 0015 | of the area | whole, with the code |
| 0021 | of the area | whole, with the code |
| 0023 | of the area | whole, with the code |
| 0047 | of the area | whole, with the code |
| 0048 | of the area | whole, with the code |
| 0059 | of the area | whole, with the code |
| 0060 | of the area | whole, with the code |
| 0065 | of the area | whole, with the code |
| 0069 | of the area | whole, with the code |
| 0124 | of the area | whole, with the code |
| 0125 | of the area | whole, with the code |
| 0245 | of the area | whole, with the code |
| 0022 | changes a note of the area | not at all |
| 0057 | changes a note of the area | in part: the code only, `writes` of `src/machine.ts` and `src/storage/` |
| 0090 | changes a note of the area | in part: the decision, with `write` of `src/storage/entities.ts` |
| 0123 | changes a note of the area | not at all |
| 0131 | changes a note of the area | not at all |
| 0132 | changes a note of the area | in part: the code only, `writes` of `src/machine.ts` and `src/storage/` |
| 0157 | changes a note of the area | in part: the code only, `writes` of `src/machine.ts` and `src/storage/` |
| 0165 | changes a note of the area | in part: the decision and its premises, with `send` of `src/cluster.ts` |
| 0182 | changes a note of the area | not at all |
| 0201 | changes a note of the area | not at all |
| 0248 | changes a note of the area | whole, with the code |
| 0253 | changes a note of the area | whole, with the code |
| 0269 | changes a note of the area | whole, with the code |
| 0274 | changes a note of the area | in part: the code only, `writes` of `src/machine.ts` and `src/storage/` |
| 0008 | cites a note of the area | not at all |
| 0012 | cites a note of the area | not at all |
| 0013 | cites a note of the area | not at all |
| 0014 | cites a note of the area | not at all |
| 0017 | cites a note of the area | not at all |
| 0020 | cites a note of the area | not at all |
| 0028 | cites a note of the area | not at all |
| 0038 | cites a note of the area | not at all |
| 0045 | cites a note of the area | not at all |
| 0046 | cites a note of the area | not at all |
| 0049 | cites a note of the area | not at all |
| 0085 | cites a note of the area | not at all |
| 0092 | cites a note of the area | not at all |
| 0100 | cites a note of the area | whole, with the code |
| 0126 | cites a note of the area | not at all |
| 0127 | cites a note of the area | not at all |
| 0129 | cites a note of the area | not at all |
| 0133 | cites a note of the area | not at all |
| 0141 | cites a note of the area | not at all |
| 0156 | cites a note of the area | in part: the code only, `renamed` of `src/storage/tables.ts` |
| 0160 | cites a note of the area | not at all |
| 0171 | cites a note of the area | whole, with the code |
| 0178 | cites a note of the area | not at all |
| 0200 | cites a note of the area | not at all |
| 0214 | cites a note of the area | not at all |
| 0223 | cites a note of the area | not at all |
| 0260 | cites a note of the area | not at all |
| 0262 | cites a note of the area | not at all |
| 0272 | cites a note of the area | whole, with the code |
| 0278 | cites a note of the area | not at all |
| 0006 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0007 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0029 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0032 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0033 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0039 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0040 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0041 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0042 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0043 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0044 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0050 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0051 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0053 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0054 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0061 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0062 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0063 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0064 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0067 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0070 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0071 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0073 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0074 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0075 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0076 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0078 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0079 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0080 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0102 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0109 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0110 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0113 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0114 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0119 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0121 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0122 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0128 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0135 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0136 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0137 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0138 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0140 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0142 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0143 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0145 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0147 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0148 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0150 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0151 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0152 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0153 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0154 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0159 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0161 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0162 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0167 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0169 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0170 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0173 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0174 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0176 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0179 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0184 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0185 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0186 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0187 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0191 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0204 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0208 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0209 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0216 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0219 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0220 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0224 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0247 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0249 | cited by `src/` in a declaration beside a note of the area | in part: the decision and its premises, with `reset` of `src/cluster.ts` |
| 0251 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0256 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0261 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0265 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0266 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0271 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0277 | cited by `src/` in a declaration beside a note of the area | not at all |
| 0280 | cited by `src/` in a declaration beside a note of the area | not at all |

### Findings

- **Two callers of one request, sent before it is answered, have its message applied twice on one process under a
  short `keep`.** The notes are [decision 0125](archive/0125-a-callers-reply-is-kept-as-long-as-its-boundary-says.md),
  with [decision 0245](0245-a-reply-is-kept-as-long-as-send-says-and-the-runtime-sweeps.md), against
  [decision 0248](0248-on-cluster-a-callers-rows-are-kept-for-every-clients-poll.md).
  - The premise that fell: decision 0125 counts a reply's time from the step that answers, so that a message that
    waits loses none of its time. It rests, without saying so, on a retry read no later than its caller sent it. A
    retry sent before the answer waits in the runtime too, and its reply is read when its `Receive` is applied, which
    may be past the reply's `until`. Decision 0248 found this race on Cluster, as two clients of one request, and
    kept Cluster's rows for every client's poll. On one process nothing covers it, and a `keep` of 0 is past at the
    step that answers.
  - The sequence: an entity with an empty mailbox. Two callers send the same message under one sender and request id,
    with `keep: { millis: 0 }`, at once. The first `Receive` is handled as it arrives, and its step writes the reply
    with `until` at its own time, then deletes it as past (`src/storage/entities.ts:514`). The second `Receive` reads
    the reply at the same time (`src/runtime/loop.ts:426`), and `until > at` finds none
    (`src/storage/entities.ts:243`). The mailbox holds no message of the request (`src/machine.ts:992`), so the
    message is queued and applied again. Both callers are answered `Accepted`. On Cluster the second client joins the
    first's rows, which `src/runtime/callers.ts:335` keeps for at least two polls and a second, and the message is
    applied once.
  - The test: `FAILING: two callers of one request at once under a keep of 0 have its message applied once`, in
    `src/runtime.test.ts:3496`, on the branch `claude/premise-review-2-area-1-a39f5b`. It fails at its last
    assertion: `applied` is `['w', 'w']`.
  - The chosen premise of decision 0245, that only the boundary knows how long its callers retry for, does not cover
    it. A boundary knows its protocol's window, not how long the runtime holds a retry before it reads the reply.
  - Where a fix could begin: in `receive` of `src/machine.ts` and the loop, a `Receive` could read the reply at the
    time its caller offered it rather than at its step. Or a reply could be kept, for the runtime's reading, for a
    least time beside `keep`, as decision 0248 does for Cluster's rows. Or the design could say that a `keep` covers
    the runtime's wait, with a least `keep` the launch checks.

### Leads

- **The same race under a `keep` above 0.** A retry whose `Receive` waits behind a slow step or a long mailbox past
  the first reply's `until` is applied again in the same way. The test would hold the first step at its commit, by
  the points of the crash table, move `TestClock` past the `keep`, and count `applied`. Not written.
- **A retry in flight when an operator resumes the entity.** The message the entity died on is handled by the step of
  the resume, and a caller's retry answered `Suspended` that is sent again at that moment reads after that step. The
  test would resume an entity whose head message has a `keep` of 0 while its caller sends again. Not written.

### Suspects ruled out

- A retry at the moment of `until` itself is neither read nor kept: the reading takes `until > at` and the deletion
  `until <= at` (`src/storage/entities.ts:243`, `:514`, `:569`). Ruled out by `another message under a caller's
  request id after the reply's keep is a new request, and is applied` and `a retry within the keep its boundary gives
  is answered from storage, and one after it is applied again`, in `src/runtime.test.ts`, which pass. Neither is a
  test of concurrency.
- A message applied again at the version of a reply past its time conflicts with that row: the row is written by an
  upsert on `(name, id, request, version)`. Ruled out by the same second test, whose third send passes.
- A rename leaves the text of the replies' requests under the old name, so a sender's retry after it finds no reply:
  `renamed` of `src/storage/tables.ts` rewrites the request of `effecttea_replies` and `effecttea_answers`. Ruled out
  by `a launch moves the entities of the old name, which keep their work's keys and their callers' replies`, in
  `src/runtime.test.ts`, which passes.

### Suspects noticed and not checked

- On Cluster, a duplicate on the runner that holds the shard, under a `keep` of 0. The test of decision 0248 runs the
  second client on another runner. A duplicate on the same runner is expected to join the first request, as
  `saveRequest` of Cluster does, and is not run.
- A boundary's clock against the runtime's, and two runners' clocks against one `until`, are open questions already,
  and were not checked again.

### The chosen premises, against the code as it is now

- Decision 0245, only the boundary knows how long its callers retry for, and decision 0125, a boundary knows how long
  its protocol retries for: both are made insufficient by the finding above. The runtime adds a wait the boundary
  cannot see, and decision 0248 gives Cluster alone a margin for it.
- Decision 0124, a boundary exists in every deployment and authenticates: no later note makes it false. A program
  whose sender is `null` ([decision 0180](0180-a-program-leaves-out-what-it-does-not-have.md)) has a boundary that
  authenticates nothing the runtime sees, and
  [decision 0269](0269-a-callers-request-is-its-sender-its-id-and-what-it-carries.md) says what holds of it.
- Decision 0124, a sender as fine as an identity keeps request ids apart: false for a program whose sender is `null`,
  since decision 0180. Decision 0269 says so, and answers `Reused` to another message under a used id. Two callers
  that send the same message under one id are still one request.
- Decision 0125, the runtime's clock and the boundary's agree well enough: the open question A boundary's clock
  against the runtime's, for a reply's `keep`, holds it. Nothing changed it.

### Where the code does otherwise than the note it cites

- `src/runtime/callers.ts:327-328` says that the client's clock reads after the step's, citing decision 0171.
  Decision 0171 calls that premise only reasoned and not needed, and the least time of decision 0248 is what the code
  relies on.
- `src/storage/entities.ts:514` deletes the replies past their time after the step writes its own, so a reply under a
  `keep` of 0 is deleted by the step that writes it. Decision 0125 says a step deletes its entity's replies past
  their time, and leaves this order unsaid. Decision 0171 says it.

### Notes of the table not read whole

The notes changed or cited by the area that hold Cluster's rules other than 0171, 0248 and 0249, the rehearsal's notes
(0131, 0200), and every note the code couples alone were not read whole. The area is fifteen notes, and the code
couples over a hundred more to them through a few long declarations of `src/machine.ts` and
`src/storage/entities.ts`. The reading went where the area's rules are kept: the reply's time, its reading, its
deletion, and Cluster's rows of a caller's request.
