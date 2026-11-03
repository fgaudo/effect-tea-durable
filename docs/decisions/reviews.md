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
