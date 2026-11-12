# Bugs

The bugs the premise review found, numbered in the order found. Each bug is a rule of a note whose premise a later
note took away. The step of the roadmap that fixed them by family was taken on 2026-11-12, and the notes taken before
call this list the step of bugs. A document cites a bug by its number, as `bug 77`.

## How a bug is fixed

- A bug reproduced has a test that fails, and its fix begins where the bug says. A bug only reasoned or noticed is
  verified first, by a test that fails or by a reading that rules it out. The
  [open question](open-questions.md) that holds it says what would decide it.
- A fix is a note that changes the earlier one, taken with its test. The test is renamed without `FAILING:`, taken
  out of `todo`, or made a `test` from a `test.failing`.
- A fix is proposed to the maintainer before any code, with the alternatives, and the code waits for the
  maintainer's choice. The maintainer may ask for the opinion of a subagent first.
- A bug reproduced on `main` keeps its test there as a `test.failing`, so that `bun test` passes while the bug holds
  and fails once a change fixes it.
- A bug's test is taken from the branch its entry names, applied to `main`, and renamed without `FAILING:`. A commit
  of such a branch may hold the test of a bug of another family, which stays on its branch.
- A bug fixed stays in the list as one line, `Fixed by` its note, and a bug verified false says so in its entry.
  Markdown numbers an ordered list by its place, so a bug taken out would shift the number of every bug after it.
- The premise review adds each bug it finds at the end of the list, and to a family where it has the family's form.

## Families

The bugs are grouped by what they have in common. A family gets one rule, kept in one place of the code, instead of
a fix for each bug. Each bug's test passes under the rule, as the proof that the rule holds the case. A bug of no
family gets a fix of its own.

- A, a newer version against what an older one stored or runs: bugs 1, 5, 7, 15, 16, 28 to 30, 56, 62, 68, 76,
  77, 96, 107 and 108, and the door of the step A door that changes between two releases of the library, of the
  [roadmap](roadmap.md). A rename is such a change. Its rule is the step What a deploy may change of a program,
  against what is stored, of the roadmap.
- C, a rule of one process that holds otherwise on Cluster: bugs 2, 10 to 12, 20, 21, 23, 24, 27, 33 to 36, 39, 54,
  55, 57 to 59, 70, 73, 74, 77, 84, 85, 89 to 91 and 97, as decisions 0248 and 0249 were. Its rule is the step The tests
  of a contract on every backend, of the roadmap: the tests of the runtime run alike on one process and on Cluster.
- D, a rule that holds only of one transaction at a time: bugs 3, 13, 25, 49, 78, 80 and 111. Its test is the same step:
  a test of rows of two entities runs on the CI's PostgreSQL with a pool too, with the two steps held at their
  statements. Bugs 13 and 25 are one form, a statement whose condition PostgreSQL reads from its snapshot and does
  not read again on the row it then writes. Its rule is [decision 0284](decisions/0284-a-statement-reads-its-condition-from-a-row-it-has-locked.md): a statement that writes
  or deletes a row on a condition reads the condition from a row it has locked. Bugs 25, 13, 80, 78 and 111 are
  its first cases, fixed. Bug 49 is fixed by the note of bug 13, and bug 3 by decision 0289.
- F, B, E and G are fixed. Family F is decided by
  [decision 0251](decisions/0251-a-retry-and-a-passivation-are-a-millisecond-at-least.md), family E by
  [decision 0252](decisions/0252-the-waker-activates-an-entity-a-crash-took-out-after-the-retry.md), family B by
  [decision 0253](decisions/0253-an-answer-no-entity-stores-is-kept-for-the-operation-that-was-given-it.md), and
  family G, a check of the project that holds less than its note says, by
  [decision 0254](decisions/0254-a-check-of-the-project-runs-against-the-case-it-refuses.md). What each left
  unverified is an [open question](open-questions.md#running): A sender and Cluster's round at the least retry, The
  cases of a crash's retry not run yet, An operation's kept answer on Cluster across a crash, and under two runs at
  once, and A timer due, which no test of the capacity reaches. Bugs 99, 106 and 110 have the form of family G, found
  after its fix, and are not fixed yet.
- Of no family: bugs 4, 6, 8, 19, 22, 26, 31, 37, 38, 40 to 42, 44, 50, 51, 60, 64 to 67, 75, 79, 81, 82, 86, 87 and
  92. Each is fixed by a note of its own or verified false, as its entry says. Bug 79, a gap of the guide, is fixed in
  `docs/design.md` with no note, since decisions 0185 and 0222 decide it. Bug 93 is of no family either, and has
  the form of bug 42: a rehearsal that refuses a program the runtime runs. It is fixed by decision 0281. Bug 94 is of no family, and is fixed by decision 0282. Bug 95 is of no family, and not fixed yet. Bugs 98 and 100 are of no family, and not fixed yet. Bugs 101 to 105 are of no family, and not fixed yet. Bugs 102, 103 and 105 share one cause, a text PostgreSQL cannot hold in a key or an index, and a bound in `shownOf` could fix the three. Bug 109 is of no family, and not fixed yet.

## The list

1. **Reproduced: a droppable operation that a new program delivers at most once never runs.** A deploy that
   declares a `Droppable` operation stored under a key as `operation.atMostOnce` keeps its incarnation
   ([decision 0128](decisions/archive/0128-an-operation-that-acts-on-nothing-may-be-dropped.md)), since the
   incarnation stopped acted on nothing. The activation then reads that incarnation as an at-most-once one that
   may have started, and records its `unknown` instead of starting it
   ([decision 0011](decisions/archive/0011-an-operation-declares-what-a-crash-does.md)). A program that answers
   `unknown` by not acting again never acts. Decision 0011 rests on a premise no note wrote: an incarnation stored
   with no completion was run with the delivery stored now. The test `FAILING: a droppable operation a new program
   delivers at most once starts, since it acted on nothing`, in `src/machine.test.ts`, reproduces it on the branch
   `claude/premise-review-operations-d2dda3`, at commit `d612640`, cut from `main` at `40545c5`. The fix begins in
   `activate` of `src/machine.ts`, which gives `unknown` only to an incarnation run at most once. It either reads
   the delivery stored before `reconcile` or `renew`, or decision 0128 draws a new incarnation for a droppable
   operation delivered otherwise.
2. **Reproduced: a rolling deploy to a newer version on Cluster delivers `unknown` to an at-most-once operation
   under way.** The newer runner takes the older runner's shards before the older runner's drain ends
   ([decisions 0119](decisions/archive/0119-a-planned-stop-drains-the-at-most-once-operations.md),
   [0159](decisions/archive/0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md)). The
   todo `a rolling deploy to a newer version drains the at-most-once operation under way on the older runner`, in
   `src/cluster.test.ts`, expects `done` and gets `unknown`. Its fix is a choice of the design, which the
   [open question](open-questions.md#running) A drain across a deploy of a newer version on Cluster lists.
3. **Fixed by [decision 0289](decisions/0289-expire-deletes-what-work-that-ended-was-given.md)**, whose `expire` deletes the replies and the answers kept for work that has ended, which two steps at once on a pool leave.
4. **Fixed by [decision 0269](decisions/0269-a-callers-request-is-its-sender-its-id-and-what-it-carries.md)**, whose caller's request carries its message, and a reused id with another is answered `Reused`.
5. **Reasoned: a rehearsal may apply a retry twice after a deploy that changes how the sender is written.** The
   rehearsal keys a reply by the request's text, and the runtime finds a request by its id
   ([decisions 0065](decisions/archive/0065-the-machine-holds-no-replies.md),
   [0200](decisions/0200-a-rehearsal-sends-under-a-request-id-the-test-names.md)). Verified by a test of
   `src/rehearse.ts`: the [open question](open-questions.md#programs) A retry in a rehearsal after a deploy that
   changes how the sender is written.
6. **Verified false: a step of a drain that changes a droppable operation leaves an incarnation counted as running and
   never started.** ([decisions 0119](decisions/archive/0119-a-planned-stop-drains-the-at-most-once-operations.md),
   [0128](decisions/archive/0128-an-operation-that-acts-on-nothing-may-be-dropped.md)). Verified false by `a droppable
   operation that a step of the drain changes runs at the next activation` of `src/runtime.test.ts`. A caller waits
   for the drain's end, so only an at-most-once completion steps in it, and the next activation starts the incarnation
   it changed. The [open question](open-questions.md#running) A step of a drain that changes a droppable operation.
7. **Reasoned: on Cluster, a newer version may resume an entity suspended with a droppable operation under way,
   which the newer program drops or changes.** In one process a name is deployed once
   ([decision 0075](decisions/archive/0075-a-name-is-deployed-once-in-a-process.md)), and no test runs two
   versions here. Verified by a test of `src/cluster.test.ts` with two runners of two versions: the
   [open question](open-questions.md#running) A resume whose program drops a droppable operation kept while
   suspended.
8. **Fixed by [decision 0270](decisions/0270-a-childs-name-is-never-an-own-tag.md)**, which refuses an own tag that may be a child's, and tries a child's wrapper first.
9. **Fixed by [decision 0253](decisions/0253-an-answer-no-entity-stores-is-kept-for-the-operation-that-was-given-it.md)**, which keeps an operation's `Rejected` of `init` and its `NotFound` for its work.
10. **Reasoned: on Cluster, a creation that `init` dies on, sent by an operation, waits for ever and no operator
    sees it.** On one process the sender is suspended
    ([decision 0046](decisions/archive/0046-a-receiver-that-crashes-is-sent-again.md)). On Cluster the door dies
    and Cluster delivers the creation again without end
    ([decision 0160](decisions/archive/0160-on-cluster-a-door-answers-as-text-and-a-creation-the-program-dies-on-waits-for-a-fix.md)).
    The sender is not suspended and the receiver does not exist, so `suspended` lists nothing. Verified by a test
    of `src/cluster.test.ts`, which would hang today: the [open question](open-questions.md#running) A creation
    that `init` dies on, on Cluster.
11. **Noticed, not checked: on Cluster, the rows of an operator's resume or discard may never be deleted.**
    ([decision 0166](decisions/archive/0166-on-cluster-an-operator-resumes-and-discards-through-the-doors-client.md)).
    Verified by a test that resumes an entity on Cluster and reads Cluster's tables after `expire`: the
    [open question](open-questions.md#running) The rows of operators' events on Cluster.
12. **Noticed, not checked: a defect's cause holding U+0000 may reach Cluster's tables unescaped.**
    ([decision 0205](decisions/0205-a-defects-cause-is-written-as-text-every-database-holds.md)). It matters once
    Cluster runs on PostgreSQL. Verified by reading what Cluster stores of a defect: the
    [open question](open-questions.md#running) A cause holding U+0000 in Cluster's tables.
13. **Fixed by [decision 0285](decisions/0285-a-batch-of-expire-skips-the-replies-a-step-holds.md)**, under which a batch of `expire` locks the replies it selects and skips those a step holds, so that on a pool it never deletes a reply a step wrote again with a new time. Reproduced first by the test of a contract of the pool on the CI's server.
14. **Fixed by [decision 0252](decisions/0252-the-waker-activates-an-entity-a-crash-took-out-after-the-retry.md)**, whose waker activates an entity a crash took out.
15. **Reproduced: an entity created under a name a rename left draws the idempotency keys of the renamed entity
    of the same id.** A renamed entity keeps the keys of its old name
    ([decision 0156](decisions/archive/0156-a-program-is-renamed-by-its-launch-and-keeps-its-keys.md)), and on one
    process a later launch may deploy a program under the old name. Its operation is given a key an operation of
    the renamed entity holds, so a provider answers the second charge with the first one's result. The test
    `FAILING: an entity created under a name left by a rename draws no key a renamed entity holds`, in
    `src/runtime.test.ts`, on `claude/premise-review-versions-36a283` at `cbb1ca7`. The fix begins in `renamed` of
    `src/storage/tables.ts`, or in `givenKey` of `src/machine.ts`. The
    [open question](open-questions.md#running) A name a rename left.
16. **Reproduced: on Cluster, a program renamed back to the name it left can never run under that name again.**
    A rename marks the old name for good
    ([decision 0176](decisions/archive/0176-on-cluster-a-rename-marks-the-old-name-and-keeps-its-door.md)), and a
    rename back clears no mark, so every launch of the name is refused. The test `FAILING: on Cluster, a program
    renamed back to the name it left is launched under it again`, in `src/storage.test.ts`, on
    `claude/premise-review-versions-36a283` at `cbb1ca7`. The fix begins in `mark` of `src/storage/tables.ts`. The
    [open question](open-questions.md#running) A name a rename left.
17. **Fixed by [decision 0251](decisions/0251-a-retry-and-a-passivation-are-a-millisecond-at-least.md)**, which refuses a `retry` and a `passivate` of 0.
18. **Fixed by [decision 0252](decisions/0252-the-waker-activates-an-entity-a-crash-took-out-after-the-retry.md)**, whose waker activates an entity a crash took out.
19. **Fixed by [decision 0260](decisions/0260-a-discard-of-a-message-an-operation-sent-stores-a-rejection.md)**, whose discard of a message an operation sent stores a rejection.
20. **Reproduced: on Cluster, an operator's resume whose waiting sender is of a program the runner does not
    deploy is delivered again without end.** `Resumed` is sent from the step's transaction
    ([decision 0167](decisions/archive/0167-on-cluster-an-operation-sends-through-the-doors-client-and-is-woken-by-resumed.md)),
    and Cluster's local path waits there for the sender's type to be registered, though a transaction of the
    runtime waits on nothing but its statements
    ([decision 0092](decisions/archive/0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md)).
    The test `FAILING: an operator resumes an entity whose waiting sender is of a program the runner does not
    deploy`, in `src/cluster.test.ts`, on `claude/premise-review-cluster-3063df` at `2ca3751`. Inside the
    registration window the wait holds the file's one writer, which is only reasoned. The fix begins at `resume`
    of `src/cluster.ts`. The [open question](open-questions.md#running) A resume to a sender no runner deploys.
21. **Reproduced: on Cluster, a caller's message through the door during a drain is taken, and starts an
    at-most-once operation that the drain then stops.** On one process `admitted` holds the callers during a drain
    ([decision 0119](decisions/archive/0119-a-planned-stop-drains-the-at-most-once-operations.md)), and a door's
    step has no such guard ([decision 0219](decisions/0219-a-drain-holds-when-an-interrupted-fiber-closes-its-scope.md)).
    The next runner delivers `unknown`. The test `FAILING: a caller’s message through the door during a drain is
    not taken, and starts no at-most-once operation`, in `src/cluster.test.ts`, on
    `claude/premise-review-runtime-2-157489` at `9ff6fa9`. A door's step that commits after the drain looked may
    store an operation that never starts, which is only reasoned. The fix begins at `doorStep` of
    `src/runtime/doors.ts`, or at `drained` of `src/runtime.ts`. The [open question](open-questions.md#running) A
    caller's request through the door during a drain.
22. **Fixed by [decision 0271](decisions/0271-every-fork-of-the-runtime-says-it-is-interruptible.md)**, whose every fork of `src/` says it is interruptible, as a test of the form reads.
23. **Reproduced: on Cluster, an ack of an older runner after a newer one forgot its consumer leaves a cursor that
    stops the prune of the partition.** `ack` does not check that its consumer is stored
    ([decisions 0039](decisions/archive/0039-a-consumer-of-the-outbox-keeps-its-cursor.md),
    [0152](decisions/archive/0152-the-consumers-of-a-topic-are-declared-at-deploy.md),
    [0159](decisions/archive/0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md)). Two
    runners of one version with other consumers give it too. The test `FAILING: an ack of an older runner after a
    newer one forgot its consumer leaves the prune of the partition`, in `src/cluster.test.ts`, on
    `claude/premise-review-schemas-1-0ccf33` at `778b0f2`. The fix begins at `ack` or `pruneBatch` of
    `src/storage/log.ts`. The [open question](open-questions.md#storage-and-reading) The consumers of several
    runners on Cluster.
24. **Reproduced: on Cluster, a forget on a runner that does not declare a consumer drops the consumer another
    runner declares, and its rows.** `enlisted` reads only the declaration of the runner called
    ([decision 0152](decisions/archive/0152-the-consumers-of-a-topic-are-declared-at-deploy.md)). Every runner that
    does not declare the consumer also warns of it as of one to forget. The test `FAILING: a forget on a runner
    that does not declare a consumer leaves the consumer another runner declares, and its rows`, in
    `src/cluster.test.ts`, on `claude/premise-review-schemas-2-b06280` at `3e592de`. The fix begins at `forget`
    of `src/storage/log.ts`, or at `enlisted` of `src/runtime.ts`. The
    [open question](open-questions.md#storage-and-reading) The consumers of several runners on Cluster.
25. **Fixed by [decision 0284](decisions/0284-a-statement-reads-its-condition-from-a-row-it-has-locked.md)**, under which `reindex` locks the entity's row it reads the state from, so that on a pool it reads the state a step committed while it waited. Reproduced first by the test of a contract of the pool on the CI's server.
26. **Fixed by [decision 0256](decisions/0256-a-call-that-waits-for-a-step-is-refused-within-a-transaction.md)**, which refuses a call that runs a step or waits for one within a transaction of the client.
27. **Reasoned: on Cluster, the ids a process of the old code keeps under a renamed name stay for ever in
    Cluster's tables.** A process with no runner address deploys any program
    ([decision 0174](decisions/archive/0174-on-cluster-a-runner-deploys-only-the-programs-its-sharding-names.md)),
    and a step and `expire` delete by the new name
    ([decision 0176](decisions/archive/0176-on-cluster-a-rename-marks-the-old-name-and-keeps-its-door.md)). No reply
    is lost. The [open question](open-questions.md#running) A name a rename left.
28. **Noticed, not checked: after a rename, an operation whose code still imports the old program waits for a
    deploy that never comes, and no operator sees it.**
    ([decisions 0045](decisions/archive/0045-an-operation-waits-for-a-program-not-deployed-yet.md),
    [0156](decisions/archive/0156-a-program-is-renamed-by-its-launch-and-keeps-its-keys.md)). The
    [open question](open-questions.md#running) A name a rename left.
29. **Noticed, not checked: during a launch on Cluster that renames, `check` may count an entity twice, under its
    old name in one page and under its new name in a later one.**
    ([decision 0247](decisions/0247-check-reads-the-stored-entities-as-a-deploy-would-activate-them.md)). Only the
    counts would be wrong. The [open question](open-questions.md#running) A name a rename left.
30. **Noticed, not checked: on Cluster, two programs renamed to one read the rows of the program with no entity
    through the migrations of the other.**
    ([decision 0176](decisions/archive/0176-on-cluster-a-rename-marks-the-old-name-and-keeps-its-door.md)). The
    [open question](open-questions.md#running) A name a rename left.
31. **Fixed by [decision 0274](decisions/0274-an-entity-is-not-loaded-while-the-stop-of-its-former-run-is-running.md)**, whose entity is not loaded while the stop of its former run is running.
32. **Fixed by [decision 0251](decisions/0251-a-retry-and-a-passivation-are-a-millisecond-at-least.md)**, which refuses a `retry` and a `passivate` of 0.
33. **Noticed, not checked: on Cluster, the waker's map of entities it failed to activate may outlive a move of
    the shard to another runner.**
    ([decision 0077](decisions/archive/0077-the-waker-tries-an-entity-it-cannot-load-again.md)). The
    [open question](open-questions.md#running) The cases of a crash's retry not run yet.
34. **Noticed, not checked: on Cluster, an application that builds the runtime and `Sharding` in one parallel
    scope lets the shards go during the drain, and a completion then dies on the check of the lease.**
    ([decisions 0120](decisions/archive/0120-the-runtime-closes-a-sequential-scope-of-its-own.md),
    [0219](decisions/0219-a-drain-holds-when-an-interrupted-fiber-closes-its-scope.md)). The
    [open question](open-questions.md#running) A caller's request through the door during a drain.
35. **Noticed, not checked: on Cluster, a door's step that runs after the drain, between the interruption of the
    loops and the close of the door's registration, may commit a step whose `Settle` no loop takes.**
    ([decision 0219](decisions/0219-a-drain-holds-when-an-interrupted-fiber-closes-its-scope.md)). Whether
    Cluster's teardown interrupts the step first is in `entityManager.ts` of Effect, not read. The
    [open question](open-questions.md#running) A caller's request through the door during a drain.
36. **Noticed, not checked: on Cluster, a runner's `reindex` may end with `SQLITE_BUSY` while another runner's
    step holds the write lock, and die.**
    ([decision 0070](decisions/archive/0070-reindex-writes-a-row-only-over-its-state.md)). It loses no row. The
    [open question](open-questions.md#storage-and-reading) A reindex on Cluster.
37. **Verified false by a reading: a step interrupted between its commit and `tell` leaves a reader of `consume` with
    `wait: true` waiting until its topic's next commit.**
    ([decisions 0142](decisions/archive/0142-a-consumer-waits-for-a-row-of-its-topic.md),
    [0184](decisions/0184-consume-runs-a-reader-of-a-consumer.md)). The
    [open question](open-questions.md#storage-and-reading) A reader with no time that misses a commit says why.
    The reading found bug 92, a reader left waiting by a crash instead of an interruption.
38. **Fixed by [decision 0276](decisions/0276-a-projections-allows-is-given-the-projection-as-a-caller-reads-it.md)**, which gives `allows` the projection as a caller reads it; its half of the sender unmigrated is false, as the note says.
39. **Noticed, not checked: on Cluster, a reader of `consume` with `wait: true` may wait for ever for another
    runner's rows, once Cluster runs on PostgreSQL, or where `PRAGMA data_version` cannot be read.**
    ([decisions 0163](decisions/archive/0163-on-cluster-a-reading-that-waits-learns-of-another-runners-commit-from-the-file.md),
    [0184](decisions/0184-consume-runs-a-reader-of-a-consumer.md)). The
    [open question](open-questions.md#storage-and-reading) A reader with no time that misses a commit.
40. **Fixed by [decision 0277](decisions/0277-a-sum-is-refused-by-a-count-of-its-magnitudes-both-dialects-make-alike.md)**, which refuses a sum by a count of its magnitudes in units of 2^980 that both dialects make alike.
41. **Fixed by [decision 0263](decisions/0263-a-launch-dies-where-a-schema-further-on-the-search-path-holds-the-tables.md)**, whose launch dies, and makes nothing, where a schema further on the `search_path` holds the tables.
42. **Fixed by [decision 0266](decisions/0266-a-timer-that-catches-up-fires-with-a-due-time-that-grows.md)**, whose key fires again at one time only with a later due time, so a timer catches up.
43. **Fixed by [decision 0254](decisions/0254-a-check-of-the-project-runs-against-the-case-it-refuses.md)**, which pins seed 661 and runs it against the lock dropped by any user.
44. **Fixed by [decision 0264](decisions/0264-a-launch-that-dies-gives-back-what-it-held.md)**, which checks every option before the hold, and closes the scope of a launch that dies.
45. **Fixed by [decision 0251](decisions/0251-a-retry-and-a-passivation-are-a-millisecond-at-least.md)**, which refuses a `retry` and a `passivate` of 0.
46. **Fixed by [decision 0254](decisions/0254-a-check-of-the-project-runs-against-the-case-it-refuses.md)**, whose check refuses a file only tests import whose name `bun test` runs.
47. **Fixed by [decision 0254](decisions/0254-a-check-of-the-project-runs-against-the-case-it-refuses.md)**, whose check of the workflow reads every key of a job, and refuses one it does not read.
48. **Fixed by [decision 0254](decisions/0254-a-check-of-the-project-runs-against-the-case-it-refuses.md)**, whose check refuses a file of the tests that reaches the databases and that `test:postgres` does not run.
49. **Fixed by [decision 0285](decisions/0285-a-batch-of-expire-skips-the-replies-a-step-holds.md)**, whose batch waits for no reply's row. Its case `bug49` of the test of the pool deadlocked on the CI against a batch that waits, at `10b3ac9` of `claude/bug49-mutated`.
50. **Fixed by [decision 0278](decisions/0278-on-a-full-volume-the-callers-stop-before-room-is-freed.md)**, under which the callers stop before an operator frees room on a full volume.
51. **Fixed by [decision 0279](decisions/0279-createtables-dies-within-a-transaction-of-its-client.md)**, under which `createTables` dies within a transaction of its client.
52. **Fixed by [decision 0254](decisions/0254-a-check-of-the-project-runs-against-the-case-it-refuses.md)**, which pins a seed in each explored test whose comment names an interleaving, and runs it against the rule taken out.
53. **Fixed by [decision 0254](decisions/0254-a-check-of-the-project-runs-against-the-case-it-refuses.md)**, whose property reads its fixtures from `src/fixtures/`.
54. **Reproduced: on Cluster, a runner keeps Cluster's bound of resident entities, and a caller past it waits.**
    [Decision 0151](decisions/archive/0151-a-process-holds-ten-thousand-entities-by-default.md) says that on
    Cluster the runtime's capacity is the only bound, as
    [decision 0092](decisions/archive/0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md)
    leaves Cluster's unbounded. No code makes it so: `sharding` of `src/cluster.ts` builds `Sharding.layer` on the
    launcher's `ShardingConfig`, whose `maxResidentEntities` is 10 000 by default. A door outlives its entity until
    the reaper finds it, so a burst of callers to more entities than the bound within one passivation waits up to a
    minute. Under a passivation of 0 the reaper still checks every 5 s, which was not run. The test `FAILING: a
    runner whose ShardingConfig keeps Cluster's bound of resident entities answers a caller past it`, in
    `src/cluster.test.ts`, on `claude/premise-pairs-first-ee0216` at `dd63071`. The fix begins at `sharding` of
    `src/cluster.ts`. The [open question](open-questions.md#running) Cluster's bound of resident entities.
55. **Reproduced: on Cluster, after an ack of an older runner that follows a forget, the prune drops a row the
    stored consumer has not read.** It is the other half of bug 23: where the stored consumer has no cursor in the
    partition, the cursor with no consumer stands for it, and `pruneBatch` takes it as the floor
    ([decisions 0039](decisions/archive/0039-a-consumer-of-the-outbox-keeps-its-cursor.md),
    [0137](decisions/archive/0137-the-log-is-ordered-within-a-partition.md),
    [0245](decisions/0245-a-reply-is-kept-as-long-as-send-says-and-the-runtime-sweeps.md)). The test `FAILING: an
    ack of an older runner after a forget drops no row the stored consumer has not read`, in `src/cluster.test.ts`,
    on `claude/premise-pairs-first-ee0216` at `dd63071`. The fix begins at `ack` or `pruneBatch` of
    `src/storage/log.ts`, as for bug 23. The [open question](open-questions.md#storage-and-reading) The consumers of
    several runners on Cluster.
56. **Reasoned: on Cluster, a creation's flags written by an older version are read by a newer one with no
    migration.** The flags are checked by their schema and never stored
    ([decision 0049](decisions/archive/0049-flags-are-checked-by-their-schema.md)), so no migration reads them
    ([decision 0036](decisions/archive/0036-a-migration-is-a-function-on-the-json.md)). Cluster keeps a creation's
    JSON until a door handles it, and the door may be of a newer version
    ([decision 0159](decisions/archive/0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md)).
    The door dies on flags its schema cannot read, and Cluster delivers the creation again without end, as in bug
    10; flags read with another meaning reach `init` in silence. The fix begins at `deliveredCreation` of
    `src/storage/entities.ts`. The [open question](open-questions.md#running) What a newer version answers an older
    one on Cluster.
57. **Reasoned: on Cluster, a runner that lost its lease may send a request after the next holder ended the work,
    and the receiver applies it twice.** [Decision 0021](decisions/archive/0021-a-reply-is-kept-while-the-work-that-asked-holds.md)
    deletes a reply once its work ends, since no one asks again
    ([decision 0090](decisions/archive/0090-on-cluster-a-reply-is-deleted-as-on-one-process.md)).
    [Decision 0092](decisions/archive/0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md) lets
    a frozen runner still run the operations the next holder runs, and nothing checks the sender's lease before a
    send. So an operation that talks only to entities acts twice, against
    [decision 0060](decisions/archive/0060-send-and-create-take-no-key.md). No helper can freeze a runner past its
    lease, so no test was written. The fix begins at the receiver, which would not apply a request whose asker's
    work no longer holds. The [open question](open-questions.md#running) A send after the work it belongs to ended.
58. **Reproduced: on Cluster, a creation the program dies on blocks every later request to its id.** The door dies
    on it ([decision 0160](decisions/archive/0160-on-cluster-a-door-answers-as-text-and-a-creation-the-program-dies-on-waits-for-a-fix.md)),
    and Cluster replays it first at each restart, so another creator of the id, whose flags `init` accepts, waits
    for ever, where on one process it is answered `Created`
    ([decision 0124](decisions/archive/0124-the-boundary-authenticates-and-update-authorizes.md)). A message to the id
    waits the same way, which is only reasoned. The test `FAILING: on Cluster a creation the program dies on leaves
    another creator of its id to create the entity`, in `src/cluster.test.ts`, on
    `claude/premise-pairs-messages-2-a90d4b` at `d602b35`. The fix begins at the creation of `doorStep` of
    `src/runtime/doors.ts`, and is a choice of the design: the [open question](open-questions.md#running) A
    creation that `init` dies on, on Cluster.
59. **Reproduced: on Cluster, a caller that stops waiting keeps its rows in Cluster's tables for ever.** A client
    keeps its id only once it is given the answer
    ([decision 0171](decisions/archive/0171-on-cluster-a-callers-rows-go-once-its-client-has-the-answer-and-its-time-is-past.md)),
    and the sweep of [decision 0245](decisions/0245-a-reply-is-kept-as-long-as-send-says-and-the-runtime-sweeps.md)
    deletes only under ids kept, though the guide says the rows go once `keep` is past. A retry of that request id
    is answered from Cluster's saved reply for ever. The test `FAILING: a caller that stops waiting leaves its
    Cluster rows to go once its time is past`, in `src/cluster.test.ts`, on `claude/premise-pairs-messages-2-a90d4b`
    at `d602b35`. The fix begins at `keptGiven` of `src/cluster.ts`. The
    [open question](open-questions.md#running) The rows of operators' events on Cluster.
60. **Fixed by [decision 0272](decisions/0272-a-boundary-acknowledges-an-item-once-its-answer-is-stored.md)**, whose boundary acknowledges an item once `send` answers `Accepted` or `Rejected`.
61. **Fixed by [decision 0252](decisions/0252-the-waker-activates-an-entity-a-crash-took-out-after-the-retry.md)**, whose waker activates an entity a crash took out.
62. **Reproduced: on Cluster, a caller of an older version is given a rejection's reason as the newer version wrote
    it, and reads it through its own schema.** A reason is read through the migrations from the version that wrote
    it ([decisions 0036](decisions/archive/0036-a-migration-is-a-function-on-the-json.md),
    [0069](decisions/archive/0069-a-reply-is-keyed-by-the-version-that-wrote-it.md),
    [0100](decisions/archive/0100-a-reason-is-kept-as-long-as-a-reply-of-its-version.md)). On Cluster the answer is
    a text with no version, written at the door's version and decoded at the caller's
    ([decision 0085](decisions/archive/0085-on-cluster-a-request-is-keyed-and-answered-as-on-one-process.md)). So a
    reason in cents migrated to euros is read as cents, with no error, or the caller is given a defect where
    [decision 0043](decisions/archive/0043-a-row-no-version-reads-fails-what-reads-it.md) would name both versions.
    Two sessions found it. The tests `FAILING: a caller of the older runner is given a reason the newer runner
    wrote, read as its version reads it`, on `claude/premise-pairs-cluster-32dc2e` at `31b01e8`, and `FAILING: on
    Cluster, a caller of an older version is never given a reason as the newer version writes it`, on
    `claude/premise-pairs-versions-1-e03c02` at `d13fa1c`, both in `src/cluster.test.ts`. The fix begins at
    `answerCodec` and `creationCodec` of `src/cluster.ts`. The [open question](open-questions.md#running) What a
    newer version answers an older one on Cluster.
63. **Fixed by [decision 0265](decisions/0265-the-operations-that-wait-for-a-resumption-are-stored-by-the-step-that-answers.md)**, whose waits are stored, and read on every runner.
64. **Fixed by [decision 0273](decisions/0273-the-partition-of-an-entity-is-the-librarys-own-hash.md)**, whose partition is the library's own hash, and whose round and waker log an entity stored under another.
65. **Fixed by [decision 0274](decisions/0274-an-entity-is-not-loaded-while-the-stop-of-its-former-run-is-running.md)**, whose run of a crashed entity sends nothing, and whose shard lost waits for every stop of its entities.
66. **Fixed by [decision 0261](decisions/0261-the-drain-reaches-a-deployment-still-activating.md)**, whose drain reaches a deployment still activating.
67. **Fixed by [decision 0280](decisions/0280-the-undo-of-a-deploy-drains-its-deployment.md)**, whose undo of a deploy drains its deployment before it closes the scope.
68. **Reasoned: on Cluster, a deploy that adds no migration does not outrank the runners it replaces, and an older
    runner steps the rows of the newer code.** A version is the count of a program's migrations plus one
    ([decision 0036](decisions/archive/0036-a-migration-is-a-function-on-the-json.md)), and an older runner is kept
    from every shard by the version recorded
    ([decision 0159](decisions/archive/0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md)).
    A change of `update`, a new index, a new topic or a changed `work` adds no migration, so both codes hold shards
    in a rolling deploy, and a shard that moves to an older runner is stepped by the older code. A step there
    writes the row with the older indexes after `reindex` ran, and a query by the new index misses the entity with
    no error. An operation the newer code started under a new key suspends the entity on the older runner
    ([decision 0043](decisions/archive/0043-a-row-no-version-reads-fails-what-reads-it.md)). Read in
    `recordVersions` and `outranked` of `src/storage/cluster.ts` and `atNewest` of `src/cluster.ts`, and not run. A
    test of `src/cluster.test.ts` with `onFile` and two runners of one version whose programs differ by an index
    would show it. The fix begins at `recordVersions`, which would record a digest of what a program writes beside
    its version, or at the launch, which would refuse a program of the newest version whose digest differs from a
    runner's still registered. The [open question](open-questions.md#running) Two programs of one version on
    Cluster.
69. **Fixed by [decision 0252](decisions/0252-the-waker-activates-an-entity-a-crash-took-out-after-the-retry.md)**, whose waker activates an entity a crash took out.
70. **Reproduced: on Cluster, a deploy that fails after its door is registered leaves every later deploy of its
    name a closed door.** A failed deploy gives its name back
    ([decisions 0075](decisions/archive/0075-a-name-is-deployed-once-in-a-process.md),
    [0078](decisions/archive/0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md)), since
    closing its scope leaves nothing registered
    ([decision 0051](decisions/archive/0051-a-deploy-that-fails-leaves-nothing-running.md)). On Cluster the door is
    registered in that scope
    ([decision 0092](decisions/archive/0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md)),
    and Cluster never unregisters an entity type: the scope's close marks it `closed`, and `registerEntity` returns
    at once for a type it holds (`cluster/Sharding.ts` of Effect 4.1.1, read in the source). So the next deploy of
    the name succeeds with the first door, closed, and every request to the program on the runner is refused. The
    test `FAILING: a deploy that fails after its door is registered leaves the next deploy of its name a door`, in
    `src/cluster.test.ts`, on `claude/premise-pairs-runtime-1-1-eb56fb` at `876ea90`, fails the deploy by a
    singleton that cannot be registered. A deploy interrupted between `cluster.register` and its registration, and
    the doors kept under a rename's old names, are only reasoned. The fix begins at `register` of `src/cluster.ts`,
    or at the deploy, which would keep the name for the life of the runner once its door is registered. The
    [open question](open-questions.md#running) A deploy that fails after its door is registered.
71. **Fixed by [decision 0251](decisions/0251-a-retry-and-a-passivation-are-a-millisecond-at-least.md)**, which refuses a `retry` and a `passivate` of 0.
72. **Fixed by [decision 0265](decisions/0265-the-operations-that-wait-for-a-resumption-are-stored-by-the-step-that-answers.md)**, whose waits are stored, and listed after a restart.
73. **Reproduced: on Cluster, a door's step never warns of a large state.** The runtime warns of a step that writes
    more than `warn.characters`
    ([decision 0135](decisions/archive/0135-a-large-state-is-split-by-the-program-and-the-runtime-warns-of-it.md)),
    on the premise that every step that writes gives its length to `warnOfSize`. On Cluster a caller's creation and
    message are a door's step
    ([decisions 0161](decisions/archive/0161-on-cluster-a-step-settles-the-machine-by-the-count-of-the-steps-that-wrote-it.md),
    [0165](decisions/archive/0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md)),
    and `stepIn` and the creation of `doorStep` in `src/runtime/doors.ts` drop the length. Only `applyOnCluster`,
    which steps the entity's own events, warns. The test `FAILING: on Cluster a door step that writes past the
    threshold warns once per activation, as on one process`, in `src/cluster.test.ts`, on
    `claude/premise-pairs-runtime-2-4e02ac` at `f548288`. The fix begins at `stepIn` and `doorStep`, which would
    keep the length for `finishIn` and `settle` to warn of. Whether a step rolled back warns is a choice of the fix.
    The [open question](open-questions.md#running) The warnings on Cluster.
74. **Noticed, not checked: on Cluster, nothing names the entity a burst of callers waits for.** On one process a
    full entity warns, and its callers are answered `Full`
    ([decision 0147](decisions/archive/0147-an-entity-holds-a-bounded-number-of-callers-messages.md)). On Cluster no
    caller is answered `Full`, and a burst waits in Cluster's table
    ([decision 0165](decisions/archive/0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md)).
    So an operator who sees every entity slow down has nothing that names the one that holds them, against the
    reason of [decision 0135](decisions/archive/0135-a-large-state-is-split-by-the-program-and-the-runtime-warns-of-it.md)
    for a warning. It is a question of the design, which no test decides. The
    [open question](open-questions.md#running) The warnings on Cluster.
75. **Fixed by [decision 0259](decisions/0259-a-reading-of-the-waker-that-fails-is-read-again-after-the-retry.md)**, which reads again after `retry` a reading of the waker that fails, and leaves out the entity whose time it refuses.
76. **Reproduced: a consumer of a topic a newer version no longer publishes can never be forgotten, and holds its
    rows for ever.** A consumer that is gone leaves by `forget`
    ([decision 0039](decisions/archive/0039-a-consumer-of-the-outbox-keeps-its-cursor.md)), and a deploy keeps a stored consumer it
    no longer declares, to be forgotten ([decision 0152](decisions/archive/0152-the-consumers-of-a-topic-are-declared-at-deploy.md)).
    Both take for granted that the consumer's topic is still published. `forget` refuses a topic the program does not
    publish ([decision 0138](decisions/archive/0138-the-log-publishes-topics.md)), and a newer version may drop or rename a topic. So
    `forget` dies by `topical` of `src/runtime.ts`, the rows past the consumer's cursor stay under every prune, and
    every later deploy warns of a consumer no operator can drop. The test `FAILING: a consumer of a topic a newer
    version no longer publishes is let be forgotten, and the prune passes its rows`, in `src/runtime.test.ts`, on
    `claude/dazzling-darwin-f09ea9` at `2f0867e`. A reader of `consume` of the dropped topic on an older runner,
    which acks on, is noticed and not checked. The fix begins at `forget`, which would take any topic a stored
    consumer names, or at the deploy, which would drop with a warning the consumers of a topic it does not publish.
    The [open question](open-questions.md#storage-and-reading) A consumer of a topic a newer version dropped.
77. **Reproduced: on Cluster, a `reindex` of an older runner writes the older projection over the row the newer
    version wrote.** `reindex` writes a row only where the entity's state and version are those it read
    ([decision 0070](decisions/archive/0070-reindex-writes-a-row-only-over-its-state.md)), which keeps a stale projection out only
    while one program computes every row. An older runner runs on beside a newer one in a rolling deploy
    ([decision 0159](decisions/archive/0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md)), and only a
    step checks the newest version. So an entity that took no step since the newer launch passes the guard, and
    `read` and `query` give the older projection until its next step, which may never come
    ([decision 0032](decisions/archive/0032-a-projection-is-a-row.md)). An index the newer version adds is missing from that row,
    which is reasoned from the statement and not run. The test `FAILING: a reindex of an older runner leaves the row
    the newer version wrote`, in `src/cluster.test.ts`, on `claude/dazzling-darwin-f09ea9` at `2f0867e`, which also
    has the helper `start` give the handles it deployed. It is the case the step What a deploy may change of a
    program names. The fix begins at `reindex` of `src/storage/projections.ts`, which would refuse to run while its
    version is outranked, or write only where the stored row's version is not newer than its own. The
    [open question](open-questions.md#storage-and-reading) A reindex on Cluster.
78. **Fixed by [decision 0287](decisions/0287-a-reading-of-the-log-gives-each-partition-up-to-its-first-head.md)**, whose reading of the log gives of each partition only the rows up to the head its first statement read, so that on a pool a step that commits between its statements makes it skip no row. Reproduced first by rows written by hand between the reading's statements.
79. **Fixed by `docs/design.md`**, under Databases, which says of the four readings of one snapshot what decisions
    0185 and 0222 decide: inside a caller's transaction each reads at the caller's level.
80. **Fixed by [decision 0286](decisions/0286-the-trigger-of-the-outbox-locks-the-publications-in-order.md)**, whose trigger of the outbox runs once for each statement and locks the publications of its rows in the order of their keys before it reads whether a row names one. Reproduced first by a test of `src/postgres.test.ts` on the CI's server, which drops the two rows of a publication in two transactions at once.
81. **Fixed by [decision 0256](decisions/0256-a-call-that-waits-for-a-step-is-refused-within-a-transaction.md)**, whose refusal holds on a pool too, as a test on the CI's server checks.
82. **Fixed by [decision 0262](decisions/0262-a-sendfrom-stands-for-a-run-no-entity-draws.md)**, in either order of the two sends.
83. **Verified false by a reading, as [decision 0254](decisions/0254-a-check-of-the-project-runs-against-the-case-it-refuses.md) says**: the runtime and the rehearsal draw their request ids from sets that share no id.
84. **Reproduced: a runtime of one process launches on the database of a runner of the runtime on Cluster, and a
    step is lost.** A database is held by one runtime
    ([decision 0080](decisions/archive/0080-a-database-is-held-by-one-runtime.md)), and on Cluster a shard's lock takes the place of
    the hold ([decision 0084](decisions/archive/0084-a-step-commits-only-where-the-commit-checks-the-shard.md)), so a runner's launch
    skips it. A shard's lock keeps off only another runner. So a runtime of one process on the runner's client is not
    refused, writes its row from the machine it holds ([decision 0028](decisions/archive/0028-rules-the-runtime-settled.md)), and a
    step of the runner is lost with no error. The test `FAILING: a runtime of one process launched on the client of a
    runner of the runtime on Cluster dies, as a second runtime on one database does`, in `src/cluster.test.ts`, on
    `claude/premise-pairs-project-1-5b0c65` at `6bd4222`. A runner launched beside a runtime of one process, and the
    same across processes on PostgreSQL with `shardLockDisableAdvisory`, are only reasoned. The fix begins at
    `launchWith` of `src/runtime.ts`, where a runner would add its client to `held` and take the advisory lock in
    shared mode. The [open question](open-questions.md#running) A second runtime on one database.
85. **Noticed, not checked: on Cluster, a launcher that builds `SqlMessageStorage` on a client of its own commits
    a step and its reply apart.** A step commits with Cluster's reply on one `SqlClient`
    ([decision 0081](decisions/archive/0081-on-cluster-a-step-commits-with-its-reply.md)), and nothing checks that the runtime's
    client is the client of Cluster's `MessageStorage`. A client joins only its own transaction, read in
    `cluster/internal/entityManager.ts` and `sql/SqlClient.ts` of Effect. So a crash between the two commits applies
    the message twice or loses the state ([decision 0007](decisions/archive/0007-one-process-first.md)), and on one file of SQLite
    the step waits for the lock Cluster's transaction holds until the busy timeout. The
    [open question](open-questions.md#running) A second runtime on one database.
86. **Fixed by [decision 0255](decisions/0255-a-data-directory-of-pglite-is-held-while-its-client-is-open.md)**, which holds a data directory of PGlite while the client a runtime launched on is open.
87. **Fixed by [decision 0267](decisions/0267-a-file-of-sqlite-is-held-by-a-file-of-its-own-and-refuses-no-reader.md)**, which holds a file of SQLite by a file of its own beside it, so that `check` reads the file the old version holds.
88. **Fixed by [decision 0254](decisions/0254-a-check-of-the-project-runs-against-the-case-it-refuses.md)**, whose check refuses an `@effect/` package at a version other than `effect`'s.
89. **Reproduced: on Cluster, a second client on a runner that polls replies more slowly than the runner that keeps
    the id waits for ever.** A caller's rows go once its client has the answer and its time is past
    ([decision 0171](decisions/archive/0171-on-cluster-a-callers-rows-go-once-its-client-has-the-answer-and-its-time-is-past.md)),
    and they are kept for `2 × entityReplyPollInterval + 1 000` ms so that every other client reads its reply first
    ([decision 0248](decisions/0248-on-cluster-a-callers-rows-are-kept-for-every-clients-poll.md)). The interval is
    that of the runner whose client keeps the id, at `least` and `keptGiven` of `src/cluster.ts`, and a second client
    reads at the interval of its own runner. So a client on a runner that polls every 5 s, beside a runner that polls
    every 200 ms, finds the rows gone after a later step, `expire` or the sweep, and waits for ever. A process that is
    a client alone has a `ShardingConfig` of its own too. The test `FAILING: a second client on a runner with a
    longer poll of replies is answered after a later step`, in `src/cluster.test.ts`, on
    `claude/quizzical-franklin-e9c4d2` at `e5188e5`, failed in every run, two of them here, each in about 15 s, past
    the budget of `AGENTS.md`. The sample found it, and the step did not hold it. The fix begins at `least`, which
    would take the longest poll of the runners on the file, recorded by `sharding` with each runner's versions. The
    [open question](open-questions.md#running) The margin of a caller's rows on Cluster, once runners have
    clocks of their own.
90. **Reasoned: on Cluster, a door may load an entity of a shard acquired and released before its singleton
    starts, and no finalizer crashes it.** A shard lost crashes the entities its runner holds
    ([decision 0162](decisions/archive/0162-on-cluster-an-entitys-shard-is-its-partition-and-each-deployment-serves-its-shards.md)),
    by the finalizer of the shard's singleton. An entity a door loads before the singleton starts has none, so the
    operations its settled steps start run beside those of the next holder, and their sends after the work ended
    are applied twice by the receiver, as bug 57 says
    ([decision 0090](decisions/archive/0090-on-cluster-a-reply-is-deleted-as-on-one-process.md)). Decision 0162's consequences name
    the case and leave it to the lease check. What else it costs the world of an at-least-once operation was not
    checked. A test would hold a shard's singleton from starting while a door loads the entity, and release the
    shard. The fix begins at `serving` of `src/runtime/doors.ts`, or at the door, which would load no entity of a
    shard whose singleton has not started. The [open question](open-questions.md#running) A send after the work it
    belongs to ended.
91. **Reasoned by a reading: on Cluster, a second client's reset may drop the keep of an id whose answer is a
    reply, and a second client interrupted then leaves Cluster's rows for ever.** An id whose answer is a reply is
    never dropped ([decision 0249](decisions/0249-on-cluster-a-reset-drops-the-id-a-callers-client-kept.md)), and the
    rows of a request are kept for every client's poll
    ([decision 0248](decisions/0248-on-cluster-a-callers-rows-are-kept-for-every-clients-poll.md)). `reset` of
    `src/cluster.ts` reads the request's latest answer, then deletes the kept id. A second client may read
    `Suspended` there while the first client's retry is answered and kept, and its `forgetGiven` then drops that
    keep. Its own send keeps the id again once answered, so only a second client interrupted in that send leaves the
    rows for ever, as bug 59 does. Nothing is lost. The [open question](open-questions.md#running) The rows of
    operators' events on Cluster.
92. Fixed by [decision 0275](decisions/0275-on-cluster-a-doors-commit-tells-the-readings-itself.md).
93. **Fixed by [decision 0281](decisions/0281-a-rehearsals-time-is-a-whole-millisecond.md)**, whose rehearsal refuses a duration and a start time between two milliseconds.
94. **Fixed by [decision 0282](decisions/0282-a-callers-message-offered-before-its-answer-is-answered-by-it.md)**, whose caller's message offered before its request is answered is answered by that answer, and not applied.
95. **Reproduced: `check` dies whole on a migration of the flags that throws, where it should name the entity as a
    `Load`.** [Decision 0247](decisions/0247-check-reads-the-stored-entities-as-a-deploy-would-activate-them.md)
    tells a row the program's readings die on from what the runtime throws, since the storage runs the migrations and
    the schema inside a guard.
    [Decision 0269](decisions/0269-a-callers-request-is-its-sender-its-id-and-what-it-carries.md) added the kind
    `flags` to `Migration`, and `entity` of `src/storage/entities.ts` runs the migrations of the flags outside the
    guard. So a migration of the flags of version 2 that throws on the flags version 1 stored fails the whole `check`,
    which lists no entity, while a migration of the state that throws gives a `Load` of the entity. A deploy dies on
    the entity, as decision 0043 says, so only `check` is wrong. The test `FAILING: a migration of the flags that dies
    on a stored row is a Load of its entity, as one of the state is`, in `src/check.test.ts`, reproduces it on the
    branch `claude/premise-review-2-area-3-a78576`, at `590bcbf`, cut from `main` at `b5dc7a1`, and again on `main` at
    `b5dc7a1`. The fix begins at `entity` of `src/storage/entities.ts`, which would read the flags inside `guard`, as
    it reads the creation's request.
96. **Reproduced: a deploy that changes how a key's parameter encodes suspends every entity with work under way under
    that key, and no migration can carry it.** A deploy may change the shape of an operation under way through the
    migrations of the kinds a program's schemas write
    ([decision 0036](decisions/archive/0036-a-migration-is-a-function-on-the-json.md)). A key's parameter is stored as
    its schema encodes it ([decisions 0132](decisions/archive/0132-a-key-may-take-a-parameter.md),
    [0136](decisions/archive/0136-a-key-is-a-name-and-a-parameter-as-data.md)), in `effecttea_entity_keys`, in the
    mailbox's internal messages, and in the senders of the replies and the answers. `Migration` of `src/program.ts` has
    no kind that reads it. So version 1 starts an operation under `charge` with the parameter `'a'`, version 2
    declares the parameter as `{ line: string }`, and the activation finds the stored key dropped and suspends the
    entity. A timer under such a key is armed again in a new incarnation, and an idempotency key drawn from the
    parameter ([decision 0123](decisions/archive/0123-an-idempotent-runner-may-be-given-the-digest-of-its-key.md))
    would have to be kept by a migration too. The test `FAILING: a deploy whose key parameter encodes otherwise keeps
    the operation under way under its key`, in `src/machine.test.ts`, reproduces it in the machine on the branch
    `claude/premise-review-2-area-3-a78576`, at `590bcbf`, and again on `main` at `b5dc7a1`. It was not run through the
    runtime. The fix is the step What a deploy may change of a program, against what is stored, of the
    [roadmap](roadmap.md): a kind `parameter` of `Migration`, or a rule that a deploy keeps a parameter's encoding
    while work is under way under it, which `check` reports.
97. **Reproduced in the storage: on Cluster, a rename moves no id a caller kept under an old name that holds nothing
    else, so Cluster's rows of the request stay for ever.** A rename whose old name holds nothing moves nothing, and a
    name holds something when a row of any table is stored under it
    ([decision 0156](decisions/archive/0156-a-program-is-renamed-by-its-launch-and-keeps-its-keys.md)). `holds` of
    `src/storage/tables.ts` reads neither `effecttea_given_requests` nor `effecttea_sent_requests`, which decisions
    0169 and 0171 added later. A caller on Cluster that creates `Old/x` with flags `init` rejects leaves no entity and
    no reply ([decision 0182](decisions/0182-init-may-reject-the-flags.md)), and `keptGiven` of `src/cluster.ts` keeps
    the Cluster id under `Old/x`. A launch that renames `Old` before the sweep of `Old` takes the id leaves it under
    `Old`, which no runner deploys again, so Cluster's rows of the request stay for ever
    ([decision 0171](decisions/archive/0171-on-cluster-a-callers-rows-go-once-its-client-has-the-answer-and-its-time-is-past.md)).
    It is the form of bug 27, by another sequence. The test `FAILING: on Cluster, a rename moves the ids a caller kept
    under an old name that holds nothing else`, in `src/storage.test.ts`, reproduces it on the branch
    `claude/premise-review-2-area-3-a78576`, at `590bcbf`, and again on `main` at `b5dc7a1`. It writes the row of
    `effecttea_given_requests` by hand: a test of `src/cluster.test.ts` that creates with flags `init` rejects, then
    launches a runner that renames, would run the whole sequence. The fix begins at `holds` of
    `src/storage/tables.ts`, which would read the two tables of Cluster's ids too.
98. **Reproduced: on SQLite, a sum over an index that holds -2^63 dies with an `SqlError`, where PostgreSQL answers
    it.** [Decision 0146](decisions/archive/0146-an-integer-beyond-2-53-is-written-with-its-exact-digits.md) writes an
    integer beyond 2^53 with the exact digits of its double, so -2^63 is stored as `-9223372036854775808`. SQLite's
    `json_extract` reads those digits as its least integer, where it read the digits `JSON.stringify` writes as a real.
    [Decision 0209](decisions/0209-a-sum-is-refused-past-the-largest-double-alike-on-both-dialects.md) adds the
    magnitudes of a sum with `ABS`, and
    [decision 0277](decisions/0277-a-sum-is-refused-by-a-count-of-its-magnitudes-both-dialects-make-alike.md) keeps
    `ABS` in its count of units, at `src/storage/projections.ts:404`. SQLite's `abs()` throws `integer overflow` on its
    least integer, so the statement fails. On PostgreSQL the same value is a `NUMERIC`, and the sum is answered. The
    premise that fell is decision 0209's, kept by decision 0277: both dialects refuse the same sums. A count, a
    `countBy` and a query over the same row answer, since none applies `ABS`. The test `FAILING: a sum over an index
    that holds -2^63 is answered alike on both dialects`, in `src/storage.test.ts`, reproduces it on SQLite on the
    branch `claude/premise-review-2-area-8-0b997d`, at `8ca9992`, cut from `main` at `ca62547`, and passes on PGlite.
    The fix begins at `sum` of `src/storage/projections.ts`, which would take the magnitude of a real, as
    `ABS(CAST(x AS REAL))` does, or at `indexesText`, which would write -2^63 as digits SQLite reads as a real.
99. **Reproduced: the comparison of a move of Effect does not compare the source of `Migrator`, which decisions 0216,
    0218 and 0225 rest on.** [Decision 0225](decisions/0225-the-migrations-run-at-the-roles-level-and-lock-before-they-read.md)
    lets the migrations run at the level the role sets, since `run` of `sql/Migrator.ts` takes `LOCK TABLE` before it
    reads the history, and says that a move of Effect's version reads that source again.
    [Decision 0216](decisions/0216-the-tables-are-made-by-effects-migrator.md) and decision 0218 rest on the same
    source: `ensureMigrationsTable` runs before the transaction, and a unique violation on the history is read as
    `Locked`. [Decision 0254](decisions/0254-a-check-of-the-project-runs-against-the-case-it-refuses.md) made
    `scripts/compare-docs.ts` compare whole the sources of the drivers that premises of 0157 and 0222 were read in. It
    left out `sql/Migrator.ts`, a module `@stability unstable`, and `defaultEscape` of `sql/Statement.ts`, which
    decision 0217 read. So a release that reads the history before the lock passes every check, and a second launch on
    a database whose default level is `SERIALIZABLE` would die on the first `CREATE TABLE`. The premises hold at
    Effect 4.1.3. It has the form of family G. The test `FAILING: the comparison of a move of Effect compares whole the
    source of Migrator, which decision 0225 reads`, in `src/form.test.ts`, reproduces it on the branch
    `claude/premise-review-2-area-9-f72a79`, at `375a5f3`, cut from `main` at `ca62547`. The fix begins at `drivers`
    of `scripts/compare-docs.ts`, which would name `sql/Migrator.ts` and `sql/Statement.ts` of `effect`, or at a check
    of the form that finds every source a note reads in the source and checks that the comparison names it.
100. **Reproduced: on SQLite, a launch beside a writer that is no runtime dies with the reason `the database is held by
    another runtime`.** [Decision 0267](decisions/0267-a-file-of-sqlite-is-held-by-a-file-of-its-own-and-refuses-no-reader.md)
    holds a database by a file of its own, which refuses a second runtime and no other writer, and
    [decision 0198](decisions/0198-every-object-the-runtime-makes-is-named-with-tea.md) lets an application keep its
    own tables in the runtime's database. The hold runs `BEGIN EXCLUSIVE` on the runtime's connection with the hold
    file attached, and SQLite begins that transaction on every database attached, the main one included. So the hold
    also takes the write lock of the main file. `take` of `hold`, in `src/storage/tables.ts`, reads every
    `LockTimeoutError` as a lock of the hold file, and dies with `the database is held by another runtime`. An
    application whose transaction on its own table holds the write lock past the busy timeout makes the launch die so,
    and an operator looks for a runtime that is not there. Nothing is lost: without the hold, the launch would wait
    for the same lock in `createTables`. The premise that fell is unwritten in
    [decision 0080](decisions/archive/0080-a-database-is-held-by-one-runtime.md): at the hold, only the hold's own lock
    can time out. The test `FAILING: a launch beside a writer that is no runtime is not refused as held by another
    runtime`, in `src/runtime.test.ts`, reproduces it under a busy timeout of 0 on the branch
    `claude/premise-review-2-area-9-f72a79`, at `375a5f3`. The fix begins at `take`, whose transaction would lock the
    hold file alone, or which would tell a lock of the hold file from a lock of the main file before it says `held`.
101. **Reproduced: a planned stop, or the undo of a deploy, misses an operation that runs again or a timer that a step
    starts as the stop begins.** A planned stop stops at once the timers and the operations that run again, and waits
    for the at-most-once operations alone
    ([decision 0119](decisions/archive/0119-a-planned-stop-drains-the-at-most-once-operations.md)). The stop is
    `quiesce` of `src/runtime.ts`, which interrupts each fiber it finds in `loaded.timers`, and each fiber in
    `loaded.operations` under the ids of `loaded.rerun`. `start` of `src/runtime/loop.ts` reads `draining`, adds the
    operation to `rerun`, and registers its fiber only once `forkHeld` has forked it, and `arm` registers a timer's
    fiber the same way. The forking fiber may yield between the fork and the registration
    ([decision 0068](decisions/archive/0068-what-another-fiber-reads-changes-in-one-step.md)). So the rule of decision
    0119 rests on a premise no note wrote: no step is between the look at `draining` and the registration of its fiber
    when the stop runs. [Decision 0261](decisions/0261-the-drain-reaches-a-deployment-still-activating.md) extends the
    stop to every deployment in `made`, and [decision 0280](decisions/0280-the-undo-of-a-deploy-drains-its-deployment.md)
    calls the same `quiesce` from the undo of a deploy. The bug has three forms, each with its test in
    `src/runtime.test.ts` on the branch `claude/premise-review-2-area-5-51cf0e`, cut from `main` at `ca62547`. An
    operation that runs again holds the drain open for its whole `millis`: `FAILING: a step that starts an operation
    that runs again as the drain begins has it stopped at once`, at `e24a0f1`, seed 659. A timer fires in the drain,
    and its step may start an at-most-once operation that then delivers `unknown`: `FAILING: a step that arms a timer
    as the drain begins has it stopped at once`, at `d8a98cf`, seed 60. The undo of a deploy waits for an operation
    that runs again, and the caller of the deploy with it: `FAILING: an undo that begins as an activation starts its
    operations stops those that run again at once`, at `d8a98cf`, seed 13. Each fails at its pinned seed, and passes
    every seed of `SCHEDULES=all` once `start` and `arm` stop the fiber they registered where they then find
    `draining` set. The fix begins at `start` and `arm`, which would read `draining` again once the fiber is
    registered, or at `forkHeld`, which would register the fiber in the step that forks it. Each test pins a seed, so
    each needs a pin in `src/runtime.test_pins.ts` once it moves to `main`.
102. **Reproduced: on PostgreSQL, a step whose index, key parameter, request or id holds a long text cannot be written,
    where SQLite writes it.** Decision 0157 holds the same tables on both dialects, so that a program tested on SQLite
    meets there what PostgreSQL refuses
    ([decision 0157](decisions/archive/0157-the-storage-speaks-sqlite-and-postgresql.md)). A reply is keyed by the text
    of its request ([decision 0065](decisions/archive/0065-the-machine-holds-no-replies.md)), a key by its parameter's
    JSON ([decision 0136](decisions/archive/0136-a-key-is-a-name-and-a-parameter-as-data.md)), an entity by its id, and
    an index of the read model is an expression index of the program's value
    ([decision 0032](decisions/archive/0032-a-projection-is-a-row.md)). Each rests on a premise no note wrote: the
    database holds any text in a key or an index, which SQLite does. An entry of a B-tree index of PostgreSQL holds
    2,704 bytes at most, once compressed, so the step's statement fails for a sender, a request id, a key's parameter,
    an id or a string index of a few kilobytes that compress little. A step that cannot be written crashes its entity
    ([decision 0042](decisions/archive/0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md)).
    [Decision 0206](decisions/0206-an-index-that-is-no-scalar-is-the-programs-defect.md) made a defect of the program
    of an index that is no scalar for that reason. The test `FAILING: a step whose key, index or request holds a long
    text is written alike on both dialects`, in `src/storage.test.ts`, reproduces it on PGlite on the branch
    `claude/premise-review-2-area-7-746042`, at `8518b29`, cut from `main` at `ca62547`, and passes on SQLite. The keys
    of `effecttea_answers` and `effecttea_waiting`, the index `effecttea_replies_by_request_id` and the names of the
    consumers have the same bound, read and not run. The fix begins at `shownOf` of `src/machine.ts` and at the checks
    of a caller's id and sender, which would refuse a text past a bound on both dialects as decision 0206 refuses an
    index that is no scalar, or at the storage, which would key by a digest of the text and keep the text beside it.
103. **Reproduced: on PostgreSQL, `reindex` dies whole at an entity whose new index it cannot write, so no `reindex`
    writes the rows of the entities after it.**
    [Decision 0122](decisions/archive/0122-reindex-leaves-a-row-it-cannot-compute-and-names-its-entity.md) passes over
    an entity whose row the program cannot compute, so that one entity holds back no other. Only what the runtime
    throws fails the whole call, as a statement that fails. That rests on a premise the note did not write: a statement
    fails for the database's reasons, and never for the program's data, which bug 102 takes away. So a deploy whose
    index gives a long text of one entity's state makes every `reindex` die at that entity, with an `SqlError` that
    names an index and no entity, and the entities after it keep the rows of the version before. The test `FAILING:
    reindex passes over an entity whose new index PostgreSQL cannot hold, and writes the rest`, in
    `src/storage.test.ts`, reproduces it on PGlite on the branch `claude/premise-review-2-area-7-746042`, at `8518b29`,
    and passes on SQLite. The fix of bug 102 in `shownOf` would list the entity in `failed`, with no change of
    `reindex` of `src/storage/projections.ts`.
104. **Reproduced: on PostgreSQL, a launch of 2^31 partitions or more dies with an `SqlError` once it has made the
    tables, where SQLite launches.** [Decision 0137](decisions/archive/0137-the-log-is-ordered-within-a-partition.md)
    takes any positive integer of partitions, which `checkedOptions` of `src/runtime.ts` checks as a safe integer.
    Decision 0157 makes a time, a `seq`, a count and a position bigints on PostgreSQL, and
    [decision 0222](decisions/0222-postgresql-with-many-connections.md) reads an integer up to 2^53. Every column
    `partition`, and `effecttea_log.partitions`, stays an `INTEGER` of 32 bits, so `partitioned` of
    `src/storage/tables.ts` dies on `value "2147483648" is out of range for type integer`, which names no option,
    after `createTables` has run. [Decision 0264](decisions/0264-a-launch-that-dies-gives-back-what-it-held.md) has a
    launch refused for an option before it stores anything. No deployment needs so many partitions. The test `FAILING:
    a log of 2^31 partitions launches and creates alike on both dialects`, in `src/runtime.test.ts`, reproduces it on
    PGlite on the branch `claude/premise-review-2-area-7-746042`, at `8518b29`, and passes on SQLite. The fix begins at
    `checkedOptions`, which would refuse more than 2^31 − 1 partitions on both dialects, or at the columns.
105. **Reproduced: on PostgreSQL, an operation's completion whose step writes a long index crashes its entity at every
    activation, and an at-least-once operation acts at each.** A step that cannot be written crashes its entity
    ([decision 0042](decisions/archive/0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md)), and the waker
    activates it again after `retry`
    ([decision 0252](decisions/0252-the-waker-activates-an-entity-a-crash-took-out-after-the-retry.md)). Each rule
    rests on an unwritten premise: a crash is rare, and the activation after it steps on. Under bug 102 the completion
    is stored in the mailbox, so each activation steps it first and fails again. The entity's state never moves past
    its creation, its timer never rings, an at-most-once operation delivers `unknown`, an at-least-once operation acts
    again at each activation, and the entity is not suspended, so `suspended` names nothing. The test `FAILING: a
    completion whose step writes a long index is written alike on both dialects, and acts once`, in
    `src/runtime.test.ts`, reproduces it on PGlite on the branch `claude/premise-review-2-area-7-746042`, at `69a9b9e`,
    where `c` acts 13 times within a second of the test's clock, and passes on SQLite. The fix is bug 102's: a bound in
    `shownOf` makes the case a defect that suspends the entity, as decision 0206 has an index that is no scalar.
106. **Measured by a mutation: no test holds the guard of `reindex` that writes a row only over the state it was
    computed from.** [Decision 0070](decisions/archive/0070-reindex-writes-a-row-only-over-its-state.md) keeps the
    guard, and decision 0122 keeps it beside its own rule.
    [Decision 0254](decisions/0254-a-check-of-the-project-runs-against-the-case-it-refuses.md) pins a seed in each
    explored test whose comment names an interleaving, and lists `reindex leaves no row a step has moved past` among
    the tests whose comments name none. That test's comment names one: the step lands between the reading of the state
    of `t-3` and the writing of its row. With `AND state = ${held.state}` taken out of `reindex` of
    `src/storage/projections.ts`, the test passes under `SCHEDULES=all`, which runs its 200 seeds from seed 0, and so
    does every other test of `reindex` in `src/storage.test.ts` and `src/runtime.test.ts`. The area 7 review measured
    it on the branch `claude/premise-review-2-area-7-746042`, and it was measured again the same way on that branch,
    whose `src/` is `main`'s at `ca62547`. It has the form of family G. No test was written. The fix runs `bun run
    test:explore -t <test>` on the mutation until a seed fails, and pins that seed with its pin in
    `src/runtime.test_pins.ts`. If no seed of 2,000 finds it, a deviation under `bound` 1 holds it, or an open question.
107. **Reproduced: a caller's retry in a rehearsal after a deploy that changes how the message encodes is answered
    `Reused`, where the runtime gives the stored reply.** A rehearsal keeps a named request's reply for the whole
    rehearsal, a deploy included
    ([decision 0200](decisions/0200-a-rehearsal-sends-under-a-request-id-the-test-names.md)).
    [Decision 0269](decisions/0269-a-callers-request-is-its-sender-its-id-and-what-it-carries.md) compares a retry
    with what the request carried, and the runtime reads what was carried through the migrations of `inbound` from
    the version that wrote it. The rehearsal keeps what was carried as the version before encoded it, in `keep` of
    `src/rehearse.ts`, and the machine compares that text with the retry's. So decision 0200's rule rests on a premise
    decision 0269 took away: what the rehearsal keeps of a request reads alike at every version. Version 1 takes
    `Spend { n: 3 }` under the request id `r`, version 2 encodes `n` as text with a migration of `inbound`, and the
    same message comes again under `r`. The runtime gives `Accepted`, and the rehearsal `Reused`. It has the form of
    bug 5, under what the request carried. The test `FAILING: a retry after a deploy that encodes the message
    otherwise is given the stored reply, as the runtime gives it`, in `src/rehearse.test.ts`, reproduces it on the
    branch `claude/premise-review-2-area-10-a27203`, at `84e2446`, cut from `main` at `2e17087`. The fix begins at
    `keep` of `src/rehearse.ts`, which would keep the version that wrote `carried`, and read it through the migrations
    of `inbound` of the program deployed before `receive` compares it.
108. **Reproduced: a reply a rehearsal keeps across a deploy gives the reason as the version before wrote it, where the
    runtime reads it through the migrations of `rejection`.** Decision 0200 keeps a named request's reply across a
    deploy as the runtime keeps one, and
    [decision 0131](decisions/archive/0131-a-rehearsal-runs-the-entities-an-operation-sends-to.md) keeps an
    operation's reply while the work that asked holds, across a deploy of the receiver too. The runtime reads a stored
    reason through the migrations from its version
    ([decisions 0069](decisions/archive/0069-a-reply-is-keyed-by-the-version-that-wrote-it.md),
    [0100](decisions/archive/0100-a-reason-is-kept-as-long-as-a-reply-of-its-version.md)). The rehearsal keeps the
    reply as a value in `Kept` of `src/rehearse.ts`, and gives it back as it is, so
    [decision 0214](decisions/0214-a-rejections-reason-is-given-as-a-caller-reads-it.md) holds within one version and
    fails across a deploy. Two tests of `src/rehearse.test.ts` reproduce it on the branch
    `claude/premise-review-2-area-10-a27203`, at `84e2446`. `FAILING: a retry after a deploy whose migration reads the
    reason is given the reason as the migration writes it` gives `{ limit: 10 }` where the runtime gives
    `{ limit: 1000 }`. `FAILING: a run after a crash and a deploy of the receiver is given the stored reason as the
    migration reads it` gives `SoldOut` where the runtime gives `SalesClosed`. A `Rejected` of `init` that a world
    keeps in `answers` ([decision 0253](decisions/0253-an-answer-no-entity-stores-is-kept-for-the-operation-that-was-given-it.md))
    is kept the same way, read and not run. The fix begins at `Kept` of `src/rehearse.ts`, which would keep the encoded
    reason with its version, and read it through the migrations of the program deployed when a retry or a run is
    given it.
109. **Reproduced: two runtimes launch on one database of SQLite in memory that clients share.**
    [Decision 0267](decisions/0267-a-file-of-sqlite-is-held-by-a-file-of-its-own-and-refuses-no-reader.md) holds a
    database in memory by its client alone, since it names no file and no other connection opens it. A URI of SQLite
    with `mode=memory&cache=shared`, as `file:x?mode=memory&cache=shared`, names one database in memory that every
    client of the process opens. `pragma_database_list` gives the main database of such a client an empty file, so
    `hold` of `src/storage/tables.ts` takes no hold file, and the register `held` holds each client, not the
    database. So a second runtime on a second client of the same URI launches beside the first, which is the loss of
    steps [decision 0080](decisions/archive/0080-a-database-is-held-by-one-runtime.md) was made for. The test `FAILING:
    a second runtime on another client of a database in memory that clients share dies as it launches`, in
    `src/runtime.test.ts`, reproduces it on the branch `claude/premise-review-2-area-12-b78dd1`, at `42f0832`, cut
    from `main` at `2e17087`. The fix begins at `hold`, which would hold such a database by its URI in a register of
    the process, as a data directory of PGlite is held
    ([decision 0255](decisions/0255-a-data-directory-of-pglite-is-held-while-its-client-is-open.md)), or the launch
    would refuse such a database as the launcher's defect.
110. **Reproduced: no job runs on a server of PostgreSQL the cases past the sample of `bun test`.**
    [Decision 0250](decisions/0250-bun-test-holds-its-budget-by-samples-and-runs-of-their-own.md) cut the cases a
    sampled test runs under `bun test`: the property of the fixtures from 30 to 8, the dialects' property from 40 to 8,
    the queries' property from 20 to 8, and the test of the names of the tables to one name in four. It says the
    release runs every case it ran before, which holds on PGlite alone. The job `postgres` of `ci.yml` runs
    `test:postgres` with no `SCHEDULES`, so the server runs the sample, and the job `release` has no server. So the
    rest runs on no server, where decision 0222 and the rule of `AGENTS.md` that a change of the storage passes the
    job of PostgreSQL rely on it. [Decision 0212](decisions/0212-the-property-tests-of-the-fixtures-derive-their-values-from-the-schemas.md)
    still says 30, and the index does not list 0250 among the notes that change it. It has the form of family G. The
    test `FAILING: a job runs on a server of PostgreSQL every case of the files of test:postgres, as the release runs
    them on PGlite`, in `src/form.test.ts`, reproduces it on the branch `claude/premise-review-2-area-12-b78dd1`, at
    `42f0832`. The fix begins at `test:postgres` of `package.json`, run under `SCHEDULES=all` where the job of the
    server has the time, or at the job `release`, which would get the service of PostgreSQL and `POSTGRES_URL`.
111. **Fixed by [decision 0288](decisions/0288-a-batch-of-prune-skips-the-rows-another-batch-holds.md)**, whose batch of `prune` locks the rows it selects and skips those another batch holds. On a pool of PostgreSQL two prunes at once locked rows of the outbox in opposite orders, and PostgreSQL ended one as a deadlock. Found by the test of a contract of the pool on the CI's server, for the pair of two prunes.
