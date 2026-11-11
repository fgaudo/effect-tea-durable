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
