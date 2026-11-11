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
