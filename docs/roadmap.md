# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## Next

- **The bugs the premise review found, fixed by family.** Each bug below is a rule of a note whose premise a
  later note took away. A bug reproduced has a test that fails, and its fix begins where the bug says. A bug only
  reasoned is verified first, by a test that fails or by a reading that rules it out, and the
  [open question](open-questions.md) that holds it says what would decide it. A fix is a note that changes the
  earlier one, taken with its test, renamed without `FAILING:` or out of `todo`. A bug verified false leaves this
  list, and its open question says why. The premise review, the step after this one, adds each bug it finds here.
  The step starts before the review's second reading, as the maintainer chose on 2026-11-11, so that the second
  reading reads the code as the fixes leave it. A bug the second reading adds to a family is fixed by the family's
  rule where the rule holds it, and by a fix of its own otherwise. It groups them by what they have in
  common, and a family gets one rule, kept in one place of the code, instead of a fix for each bug. Each bug's test
  passes under the rule, as the proof that the rule holds the case. A bug of no family gets a fix of its own. The
  families of 2026-11-11, which the second reading of the review may change:
  - A, a newer version against what an older one stored or runs: bugs 1, 5, 7, 15, 16, 28 to 30, 56, 62, 68, 76 and 77, and the door
    of the next step. A rename is such a change. Its rule is the step What a deploy may change of a program, against
    what is stored, below.
  - B, an answer an operation acts on and that a run after a crash is not given again: bug 9, and its half of
    `NotFound`. Its rule would be that every answer an operation acts on is kept while its work holds, in
    `src/runtime/callers.ts`, where every answer passes.
  - C, a rule of one process that holds otherwise on Cluster: bugs 2, 10 to 12, 20, 21, 23, 24, 27, 33 to 36, 39,
    54, 55, 57 to 59, 63, 70, 73, 74, 77, 84, 85 and 89 to 91, as decisions 0248 and 0249 were. Its rule is the step The tests of a contract on every backend, below: the
    tests of the runtime run alike on one process and on Cluster.
  - D, a rule that holds only of one transaction at a time: bugs 3, 13, 25, 49, 78 and 80. Its rule is the same step: a test of
    rows of two entities runs on the CI's PostgreSQL with a pool too, with the two steps held at their statements.
    Bugs 13 and 25 are one form, a statement whose condition PostgreSQL reads from its snapshot and does not read
    again on the row it then writes.
  - E, an entity a crash leaves with work stored, which nothing loads again: bugs 14, 18, 61 and 69, three on Cluster
    and one on one process. Bug 61 is no crash: an unload between a door's step and its commit. Bug 69 is a door's
    step whose commit fails, which leaves the entity loaded with its operation never started. Its rule would be that a crash which leaves work stored gives the entity to the waker's retry
    of [decision 0077](decisions/archive/0077-the-waker-tries-an-entity-it-cannot-load-again.md), in `crash` of
    `src/runtime/loop.ts`, on one process and on Cluster.
  - G, a check of the project that holds less than its note says: bugs 43, 46 to 48, 52, 53, 83 and 88. A check passes on
    the case its rule forbids, or a test no longer reaches the case it was written for. Its rule would be that each
    check of the form, of the CI and of the explored tests is run against the case it refuses, as
    [`scripts/mutate.ts`](../scripts/mutate.ts) does for the rules of the runtime.
  - Of no family yet: bugs 4, 6, 8, 19, 22, 26, 31, 37, 38, 40 to 42, 44, 50, 51, 60, 64 to 67, 72, 75, 79, 81, 82, 86 and 87.
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
  3. **Reasoned: a reply to another entity's operation stays for ever on a pool of PostgreSQL.** The two statements
     that delete it see each other's rows only once committed, and two steps on a pool run at once
     ([decisions 0090](decisions/archive/0090-on-cluster-a-reply-is-deleted-as-on-one-process.md),
     [0222](decisions/0222-postgresql-with-many-connections.md)). It is a row left, and no wrong answer. Verified by
     a test of `src/postgres.test.ts` on the CI's server: the [open question](open-questions.md#running) The
     deletions of a reply on a pool of PostgreSQL.
  4. **Reasoned: callers of a program whose sender is `null` share their request ids.** A caller that sends an id
     another caller used gets that caller's reply, and its own message is never applied, with nothing reported
     ([decisions 0048](decisions/archive/0048-a-callers-request-belongs-to-its-sender.md),
     [0180](decisions/0180-a-program-leaves-out-what-it-does-not-have.md)). Verified by a test with two callers and
     one request id: the [open question](open-questions.md#programs) Request ids under a sender of `null`.
  5. **Reasoned: a rehearsal may apply a retry twice after a deploy that changes how the sender is written.** The
     rehearsal keys a reply by the request's text, and the runtime finds a request by its id
     ([decisions 0065](decisions/archive/0065-the-machine-holds-no-replies.md),
     [0200](decisions/0200-a-rehearsal-sends-under-a-request-id-the-test-names.md)). Verified by a test of
     `src/rehearse.ts`: the [open question](open-questions.md#programs) A retry in a rehearsal after a deploy that
     changes how the sender is written.
  6. **Reasoned: a step of a drain that changes a droppable operation leaves an incarnation counted as running and
     never started.** ([decisions 0119](decisions/archive/0119-a-planned-stop-drains-the-at-most-once-operations.md),
     [0128](decisions/archive/0128-an-operation-that-acts-on-nothing-may-be-dropped.md)). Verified by a test of
     `src/runtime/loop.ts`: the [open question](open-questions.md#running) A step of a drain that changes a
     droppable operation.
  7. **Reasoned: on Cluster, a newer version may resume an entity suspended with a droppable operation under way,
     which the newer program drops or changes.** In one process a name is deployed once
     ([decision 0075](decisions/archive/0075-a-name-is-deployed-once-in-a-process.md)), and no test runs two
     versions here. Verified by a test of `src/cluster.test.ts` with two runners of two versions: the
     [open question](open-questions.md#running) A resume whose program drops a droppable operation kept while
     suspended.
  8. **Reasoned: an own message whose `_tag` is typed `string` may take a child's name, and is then routed to the
     child.** Only the compiler refuses an own message named like a child, and a tag that is not a literal passes
     its check ([decisions 0133](decisions/archive/0133-an-entity-composes-children-as-effect-tea-does.md),
     [0199](decisions/0199-a-list-of-keys-names-each-key-by-a-literal-type.md)). Verified by a test of types: the
     [open question](open-questions.md#the-surface) An own message named like a child, with a tag typed `string`.
  9. **Reproduced: an at-least-once operation run again after a crash acts twice, when `init` rejected its
     creation.** An operation that talks only to entities acts once, since a run after a crash is given the stored
     replies ([decisions 0009](decisions/archive/0009-entities-talk-through-operations.md),
     [0060](decisions/archive/0060-send-and-create-take-no-key.md)). That holds only where every answer the
     operation acts on is stored. A rejection of `init` is not stored
     ([decision 0182](decisions/0182-init-may-reject-the-flags.md)). So a run told `Rejected` sends one message, the
     process dies before its completion, another creator creates the entity, and the run after the crash is told
     `AlreadyExists` and sends another. The test `FAILING: an at-least-once operation run again after a crash acts
     once, though init rejected its creation`, in `src/runtime.test.ts`, reproduces it on the branch
     `claude/premise-review-creation-03f15d`, at commit `38fb0a2`, cut from `main` at `f4a28e0`, with no change of
     `src/` since. `NotFound` is not stored either
     ([decision 0010](decisions/archive/0010-a-rejection-may-carry-a-reason.md)), so the gap is older than 0182, and
     no test holds that half. Its fix is a choice of the design: the [open question](open-questions.md#running) An
     answer a run after a crash is not given again.
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
  13. **Reasoned, its test written: on a pool of PostgreSQL, the batched `expire` deletes a reply a step wrote
      again with a new time.** The batch selects its rows by a subquery read from its snapshot, and PostgreSQL reads
      again only the outer `WHERE`, which holds no time
      ([decisions 0125](decisions/archive/0125-a-callers-reply-is-kept-as-long-as-its-boundary-says.md),
      [0245](decisions/0245-a-reply-is-kept-as-long-as-send-says-and-the-runtime-sweeps.md)). A retry within the
      new `keep` is then applied again. The test `FAILING: expire keeps a reply a step wrote again with a new time
      while its batch waited`, in `src/postgres.test.ts`, on `claude/premise-review-messages-975dd7` at `38db98d`,
      runs only on a server, and has not run. The fix begins in `expire` of `src/storage/entities.ts`, which keeps
      the time in the outer `WHERE`. The [open question](open-questions.md#running) A statement whose condition
      PostgreSQL reads from its snapshot.
  14. **Reproduced: on Cluster, an entity a step crashed under an expired lease that its runner renews never runs
      its work again.** A step that `guard` refuses crashes its entity
      ([decision 0175](decisions/archive/0175-on-cluster-every-step-checks-the-newest-version-and-the-shards-lease.md)),
      and only the shard's round loads an entity with work and no timer again
      ([decision 0162](decisions/archive/0162-on-cluster-an-entitys-shard-is-its-partition-and-each-deployment-serves-its-shards.md)).
      Cluster renews a lease that names its runner, so the shard never moves, and the round never runs again
      ([decision 0042](decisions/archive/0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md)). The test
      `FAILING: an entity a step crashed under an expired lease that the runner renews runs its work again`, in
      `src/cluster.test.ts`, on `claude/premise-review-cluster-3063df` at `3b1752e`. A `COMMIT` that fails, and a
      row another runner wrote, may crash an entity the same way, and were not run. The fix begins at `crash` of
      `src/runtime/loop.ts`, or at `activating` of `src/runtime/doors.ts`. The
      [open question](open-questions.md#running) An entity a crash leaves with work stored.
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
  18. **Reproduced: an entity a crash unloads with an operation or a message and no timer is never loaded again in
      its process until a caller comes.** The waker reads timers alone
      ([decision 0029](decisions/archive/0029-an-idle-entity-is-unloaded.md)), and a crash leaves the work stored
      ([decision 0042](decisions/archive/0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md)). The test
      `FAILING: an entity a failed write crashes runs its operation again with no caller coming`, in
      `src/runtime/loop.test.ts`, on `claude/premise-review-runtime-1-b0a258` at `ac905d8`. The case of a message
      left in the mailbox is only reasoned, and so is the case on Cluster. The fix begins at `crash` of
      `src/runtime/loop.ts`. The [open question](open-questions.md#running) An entity a crash leaves with work
      stored.
  19. **Reproduced: a discard does not get an entity past a message an operation sent.** An operator's discard
      stores no reply ([decision 0014](decisions/archive/0014-rules-the-machine-settled.md)), and an operation's
      `send` waits for the resumption and sends the same request again
      ([decision 0023](decisions/archive/0023-suspended-means-no-reply-yet.md)). The entity dies on it again. The test
      `FAILING: a discard gets an entity past the message an operation sent, which the operation does not send
      again`, in `src/runtime.test.ts`, on `claude/premise-review-messages-975dd7` at `f9dc8e4`. Its fix is a choice
      of the design: the [open question](open-questions.md#running) A discard of a message an operation sent.
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
  22. **Reasoned: three forks inside the uninterruptible activation on Cluster do not say they are
      interruptible.** [Decision 0112](decisions/archive/0112-a-fork-from-a-region-that-cannot-be-interrupted-says-it-is-interruptible.md)
      asks it of every such fork, and the forks of `finishIn` of `src/runtime/doors.ts`, and of `forkHeld` and
      `drop` of `src/runtime/loop.ts`, run inside the region that
      [decision 0162](decisions/archive/0162-on-cluster-an-entitys-shard-is-its-partition-and-each-deployment-serves-its-shards.md)
      made. Nothing fails at Effect's pinned version. The fix is the option at the three forks, or a check of
      `src/form.test.ts`. The [open question](open-questions.md#running) The forks of an uninterruptible activation.
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
  25. **Reasoned, its tests written: on a pool of PostgreSQL, `reindex` writes the projection of a state over the
      row a step committed while its statement waited.** Its guard on the state is read from the statement's
      snapshot, and `ON CONFLICT DO UPDATE` writes the row the step committed
      ([decisions 0070](decisions/archive/0070-reindex-writes-a-row-only-over-its-state.md),
      [0222](decisions/0222-postgresql-with-many-connections.md)). Under `REPEATABLE READ` the statement fails
      instead, and `reindex` dies. Two sessions found it. The tests `FAILING: a reindex beside a step on a pool
      leaves the row the step wrote`, on `claude/premise-review-schemas-1-0ccf33` at `778b0f2`, and `FAILING:
      reindex leaves the row a step committed while its statement waited on the row`, on
      `claude/premise-review-schemas-2-b06280` at `3e592de`, both in `src/postgres.test.ts`, run only on a server,
      and have not run. The fix begins at `reindex` of `src/storage/projections.ts`. The
      [open question](open-questions.md#running) A statement whose condition PostgreSQL reads from its snapshot.
  26. **Reproduced: a handler of `consume` that calls `create` or `send` stops the runtime on SQLite and PGlite.**
      `consume` runs its handler in a transaction that holds the one connection
      ([decision 0184](decisions/0184-consume-runs-a-reader-of-a-consumer.md)), and the step the call waits for
      waits for the connection
      ([decisions 0150](decisions/archive/0150-a-count-per-value-of-an-index-is-read-in-one-statement.md),
      [0164](decisions/archive/0164-two-rules-of-the-runtime-are-kept-by-the-form-of-the-code-and-a-test-reads-it.md)).
      A caller that calls them in its own transaction stops it too, and nothing refuses it. The test `FAILING: a
      handler of consume that creates an entity is answered, and holds no step of the runtime`, in
      `src/runtime.test.ts`, on `claude/premise-review-queries-ea6b5a` at `4e32897`. The fix begins at `consume` of
      `src/runtime.ts`. The [open question](open-questions.md#storage-and-reading) A call of the handle inside a
      transaction.
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
  31. **Noticed, not checked: a crash records an at-most-once operation's `unknown` while the operation's fiber may
      still run a region that acts.** The crash forks the stop and does not wait for it
      ([decision 0056](decisions/archive/0056-nothing-waits-for-an-operation-under-the-permit.md)), so the program's
      answer to `unknown` may act beside the old fiber. The [open question](open-questions.md#running) An operation
      still stopping beside its `unknown`.
  32. **Fixed by [decision 0251](decisions/0251-a-retry-and-a-passivation-are-a-millisecond-at-least.md)**, which refuses a `retry` and a `passivate` of 0.
  33. **Noticed, not checked: on Cluster, the waker's map of entities it failed to activate may outlive a move of
      the shard to another runner.**
      ([decision 0077](decisions/archive/0077-the-waker-tries-an-entity-it-cannot-load-again.md)). The
      [open question](open-questions.md#running) An entity a crash leaves with work stored.
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
  37. **Noticed, not checked: a step interrupted between its commit and `tell` leaves a reader of `consume` with
      `wait: true` waiting until its topic's next commit.**
      ([decisions 0142](decisions/archive/0142-a-consumer-waits-for-a-row-of-its-topic.md),
      [0184](decisions/0184-consume-runs-a-reader-of-a-consumer.md)). The
      [open question](open-questions.md#storage-and-reading) A reader with no time that misses a commit.
  38. **Noticed, not checked: `projectionViolations` gives `allows` the projection as `project` returns it, not as a
      caller reads it from its JSON, and gives `update` the sender unmigrated.**
      ([decision 0213](decisions/0213-a-projections-allows-is-given-the-sender.md)). A projection that holds `-0` is
      checked as no caller reads it. The [open question](open-questions.md#programs) What a test of a projection
      gives `allows`.
  39. **Noticed, not checked: on Cluster, a reader of `consume` with `wait: true` may wait for ever for another
      runner's rows, once Cluster runs on PostgreSQL, or where `PRAGMA data_version` cannot be read.**
      ([decisions 0163](decisions/archive/0163-on-cluster-a-reading-that-waits-learns-of-another-runners-commit-from-the-file.md),
      [0184](decisions/0184-consume-runs-a-reader-of-a-consumer.md)). The
      [open question](open-questions.md#storage-and-reading) A reader with no time that misses a commit.
  40. **Noticed, not checked: a sum whose exact total of magnitudes is just under the largest double may be refused
      on SQLite and accepted on PostgreSQL.**
      ([decision 0209](decisions/0209-a-sum-is-refused-past-the-largest-double-alike-on-both-dialects.md)). The
      [open question](open-questions.md#storage-and-reading) A sum at the edge of the largest double.
  41. **Reproduced: under the default `search_path`, a schema of the role's name, made after the tables, moves the
      runtime onto empty tables.** [Decision 0217](decisions/0217-tea-migrations-is-named-in-the-schema-the-tables-are-made-in.md)
      names the history in `current_schema()`, which under `"$user", public` changes once a schema of the role's
      name exists. The next launch makes a new set of tables there, and every stored entity, reply and cursor is left
      behind, with no error ([decision 0215](decisions/0215-the-runtimes-tables-are-made-in-the-schema-of-the-search-path.md)).
      The test `FAILING: on PostgreSQL a schema of the role’s name made after the tables leaves the runtime on the
      tables it made`, in `src/storage.test.ts`, on PGlite, on `claude/premise-review-tables-28f779` at `0a019a9`. The
      fix begins at `schemaOf` and `migrationsTable` of `src/storage/tables.ts`, and is a choice of the design: the
      [open question](open-questions.md#storage-and-reading) The schema a launch finds its tables in.
  42. **Reproduced: a rehearsal refuses a repeating timer that catches up, which the runtime runs.**
      [Decision 0130](decisions/archive/0130-a-runner-retries-and-the-state-counts-the-attempts.md) checks no timer,
      since a timer in the past is how a repeating timer catches up after a downtime.
      [Decision 0187](decisions/0187-a-rehearsal-moves-time-by-a-duration.md) cites it, and fails a key whose timer
      fires twice at one time, which every firing of a catch-up does. The test `FAILING: a renewal created after the
      periods it bills fires once for each, as the runtime does (decisions 0130, 0187)`, in `src/rehearse.test.ts`, on
      `claude/premise-review-rehearsal-cdcc14` at `abd8d29`. The fix begins at `advance` of `src/rehearse.ts`, and is
      a choice of what a rehearsal of a downtime is: the [open question](open-questions.md#programs) A rehearsal of a
      downtime.
  43. **Measured: `bun test` no longer holds the rule that a lock is dropped by its last user only.** The interleaving
      that [decision 0104](decisions/archive/0104-the-runtimes-tests-choose-where-fibers-yield.md) reaches for
      [decision 0067](decisions/archive/0067-each-entity-is-held-by-its-own-lock.md) is found by 6 seeds of 2,000 at
      `a746214`, all past the 100 that `bun test` runs, where 0104 counted 67. So 2,000 runs miss it with a
      probability near e^-6, not e^-25. Measured by taking `if (lock.users === 0)` out of `holding` in
      `src/runtime/process.ts`: `bun test` passes, and `SEED=661` fails `callers of an unloaded entity build one
      machine for it`, checked again on `main`. No test is committed. The fix begins by pinning seed 661 in that test,
      and by correcting the counts of the two tests' comments. The [open question](open-questions.md#running) The
      margin of the explored tests.
  44. **Reproduced: a launch refused for an option still holds the database, and has already moved its renames.**
      [Decision 0208](decisions/0208-a-launch-checks-every-option.md) says a launch refused for an option dies before
      anything is held or stored. The hold ([decision 0080](decisions/archive/0080-a-database-is-held-by-one-runtime.md)),
      the tables ([decision 0191](decisions/0191-a-launch-creates-the-tables.md)) and the renames
      ([decision 0156](decisions/archive/0156-a-program-is-renamed-by-its-launch-and-keeps-its-keys.md)) run before
      the checks of `retry`, `passivate`, `warn`, `drain`, `capacity`, `callers` and `sweep`, in a scope that closes
      only with the launcher's. The test `FAILING: a launch refused for its retry holds nothing and moves no rename,
      in the scope its launcher gave`, in `src/runtime.test.ts`, on `claude/premise-review-project-17a123` at
      `1c8da79`. The other options were read, and not run. The fix begins at `launchWith` of `src/runtime.ts`, which
      checks every option before the hold. The [open question](open-questions.md#running) A launch that dies after
      the hold.
  45. **Fixed by [decision 0251](decisions/0251-a-retry-and-a-passivation-are-a-millisecond-at-least.md)**, which refuses a `retry` and a `passivate` of 0.
  46. **Reproduced: `bun test` runs a file only tests import whose role ends in `_test` or `_spec`.**
      [Decision 0241](decisions/0241-a-group-of-modules-lies-in-a-folder-entered-by-the-module-of-its-name.md) says
      `bun test` runs no file named `<module>.test_<role>.ts`, and tried the role `x` alone. No file of the repository
      has such a role today. The test `FAILING: bun test runs no file that ofTheTests reads as a file only tests
      import`, in `src/form.test.ts`, on `claude/premise-review-project-17a123` at `a18c520`. The fix begins at
      `ofTheTests` of `src/form.test.ts`. The [open question](open-questions.md#running) The checks that hold less
      than their note.
  47. **Reasoned: the test of the workflow's form passes on a job of the tests that runs nothing, or whose failure is
      ignored.** It reads only the matrix's `shard` and the steps' `run`, so `if: false`, `continue-on-error: true` or
      an `exclude` of one shard pass it
      ([decision 0242](decisions/0242-the-ci-deals-the-files-of-the-tests-among-four-jobs.md)). The fix begins at
      `divided` of `src/form.test.ts`. The [open question](open-questions.md#running) The checks that hold less than
      their note.
  48. **Reasoned: the property of the fixtures runs on PGlite alone.** [Decision
      0212](decisions/0212-the-property-tests-of-the-fixtures-derive-their-values-from-the-schemas.md) checks the
      runtime on SQLite and on PostgreSQL, and `bun run test:postgres` lists its files by name, without
      `src/fixtures.property.test.ts` or the cases of `src/cluster.test.ts` on `pg`. Since
      [decision 0222](decisions/0222-postgresql-with-many-connections.md) found what PGlite hides, the property's
      values never reach a server. The fix begins at the script `test:postgres` of `package.json`. The
      [open question](open-questions.md#running) The checks that hold less than their note.
  49. **Noticed, not checked: on a pool of PostgreSQL, the sweep's batch and a step that deletes its entity's replies
      may deadlock.** The two deletes take the same rows in two orders, which
      [decision 0222](decisions/0222-postgresql-with-many-connections.md) did not count among its cycles
      ([decision 0245](decisions/0245-a-reply-is-kept-as-long-as-send-says-and-the-runtime-sweeps.md)). Where
      PostgreSQL ends the step's transaction, the entity crashes. The
      [open question](open-questions.md#running) A statement whose condition PostgreSQL reads from its snapshot.
  50. **Noticed, not checked: on a full volume, the room an operator frees may be taken by the steps the callers
      retry, before the forget and the prune run.** The spike of
      [decision 0223](decisions/0223-a-disk-that-is-really-full.md) ran no step beside the prune. It needs the CI's
      volume. The [open question](open-questions.md#storage-and-reading) A full volume beside the steps.
  51. **Noticed, not checked: `createTables` called by an operator inside a transaction of their own, at `REPEATABLE
      READ` with a query before it, locks after its snapshot.**
      [Decision 0225](decisions/0225-the-migrations-run-at-the-roles-level-and-lock-before-they-read.md) rests on the
      lock coming first, and the JSDoc of `createTables` does not say so. It needs a server. The
      [open question](open-questions.md#storage-and-reading) The migrations inside an operator's transaction.
  52. **Noticed, not checked: the other interleavings found by a seed that is not pinned may have lost their margin,
      as bug 43's did.** ([decision 0104](decisions/archive/0104-the-runtimes-tests-choose-where-fibers-yield.md)).
      The review counted the seeds of 0063, 0067, 0110 and 0116 alone. The
      [open question](open-questions.md#running) The margin of the explored tests.
  53. **Noticed, not checked: a fixture added to `src/fixtures/` gets no property, and nothing says so.**
      `src/fixtures.property.test.ts` imports the three fixtures by name
      ([decision 0212](decisions/0212-the-property-tests-of-the-fixtures-derive-their-values-from-the-schemas.md)). The
      [open question](open-questions.md#running) The checks that hold less than their note.
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
  60. **Reasoned: a boundary that acknowledges an item once `send` is answered may lose it.**
      [Decision 0127](decisions/archive/0127-a-live-stream-feeds-its-entities-from-the-boundary.md) acknowledges an
      item on any answer, and `Suspended` ([decision 0023](decisions/archive/0023-suspended-means-no-reply-yet.md)),
      `Full` ([decision 0147](decisions/archive/0147-an-entity-holds-a-bounded-number-of-callers-messages.md)) and
      `NotFound` store nothing. The source never gives the item again. Nothing of `src/` holds it. The fix is a note
      that changes 0127, and the paragraph on streams of `docs/design.md`. The
      [open question](open-questions.md#programs) What a boundary acknowledges.
  61. **Reproduced: on Cluster, an entity may be unloaded between a door's step and its commit, and the operation the
      step stored never runs.** The door's step lets the lock go before Cluster commits, and `unload` reads neither
      `uncommitted` nor the `Settle` to come
      ([decisions 0029](decisions/archive/0029-an-idle-entity-is-unloaded.md),
      [0092](decisions/archive/0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md),
      [0161](decisions/archive/0161-on-cluster-a-step-settles-the-machine-by-the-count-of-the-steps-that-wrote-it.md)).
      An at-most-once operation is later given `unknown`, though it never ran. The same window drops the `tell` of
      the step's rows and a resumption's work, and an `Evict` meets it too, which were not run. The test `FAILING: an
      entity whose passivation waits on a door step that starts an operation runs the operation`, in
      `src/cluster.test.ts`, on `claude/premise-pairs-cluster-32dc2e` at `7deee20`. The fix begins at `unload` of
      `src/runtime/loop.ts`, or at `finishIn` of `src/runtime/doors.ts`. The
      [open question](open-questions.md#running) An entity a crash leaves with work stored.
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
  63. **Reproduced: on Cluster, an operator is not shown the senders that wait on another runner.**
      [Decision 0114](decisions/archive/0114-an-operator-sees-the-suspended-entities-and-what-a-resume-did.md) says
      `suspended` reads the rows of `effecttea_waiting` on Cluster, and
      [decision 0166](decisions/archive/0166-on-cluster-an-operator-resumes-and-discards-through-the-doors-client.md)
      lets an operator act from any runner. The code reads the registrations of the runner called alone. No reply is
      lost. The test `FAILING: an operator on any runner sees the operation of another runner that waits for a
      resumption`, in `src/cluster.test.ts`, on `claude/premise-pairs-cluster-32dc2e` at `902fce1`. The fix begins at
      `suspended` and `inspect` of `src/runtime.ts`. The [open question](open-questions.md#running) Who an operator
      sees waiting.
  64. **Reasoned: a release of Effect that changes its hash moves the shards away from the stored partitions.**
      [Decision 0137](decisions/archive/0137-the-log-is-ordered-within-a-partition.md) stores a partition so that a
      change of `Hash.string` moves nothing, and
      [decision 0162](decisions/archive/0162-on-cluster-an-entitys-shard-is-its-partition-and-each-deployment-serves-its-shards.md)
      makes the partition the shard, which Cluster computes from the id at every delivery. An entity created before
      the move is read by the round and the waker of its old shard, and dropped with no log. A test of
      `src/storage.test.ts` fails at such a move of Effect's version, and nothing says what a deployment does then.
      The [open question](open-questions.md#running) A hash of Effect that moves the shards.
  65. **Noticed, not checked: an at-least-once operation of a crashed entity that sends from a region it holds
      uninterruptible, after its new run ended the work, has the receiver apply the request twice.** The crash does
      not wait for the stop ([decision 0056](decisions/archive/0056-nothing-waits-for-an-operation-under-the-permit.md)),
      and the reply is deleted once the work ends
      ([decision 0021](decisions/archive/0021-a-reply-is-kept-while-the-work-that-asked-holds.md)). Bug 31 is the
      at-most-once case. Two sessions noticed it. The [open question](open-questions.md#running) A send after the
      work it belongs to ended.
  66. **Reproduced: a deploy that registers during a drain keeps its waker, and the operations that run again,
      through the drain.** The drain stops at once the timers, the waker and the operations that run again of the
      deployments registered as it begins
      ([decision 0119](decisions/archive/0119-a-planned-stop-drains-the-at-most-once-operations.md)). A deploy
      registers only once its activations are done
      ([decision 0051](decisions/archive/0051-a-deploy-that-fails-leaves-nothing-running.md)), and an activation may
      start those operations. So a deploy still activating when the scope closes registers in the drain, forks its
      waker there, and its idempotent and at-least-once operations run until the drain's time runs out. The test
      `FAILING: a deploy that registers during the drain has the operations that run again stopped at once`, in
      `src/runtime.test.ts`, on `claude/premise-pairs-versions-2-b6a869` at `8b65a28`. Two cases are only reasoned.
      The waker forked in the drain activates entities, which is read in the code and not run. A drain that looks
      between a deploy's last activation and its registration finds nothing to wait for, and closes the scope on an
      at-most-once operation the deploy started, which then delivers `unknown`. A test under `explored` with the
      deploy forked and no hold would check that second case. The fix begins at the drain of `src/runtime.ts`,
      which would stop and count the deployments being made, or at `deploy`, which would refuse to start or to
      register once `p.draining` is set. The [open question](open-questions.md#running) A deploy under way when a
      drain begins.
  67. **Noticed, not checked: a planned stop while the main fiber deploys undoes the deploy, and its at-most-once
      operations deliver `unknown`.** The interruption reaches the deploy before the scope's finalizers run, so the
      deploy undoes itself ([decision 0102](decisions/archive/0102-a-deploy-interrupted-before-it-registers-undoes-itself.md))
      and stops its at-most-once operations before the drain of
      [decision 0119](decisions/archive/0119-a-planned-stop-drains-the-at-most-once-operations.md) begins. They
      deliver `unknown`, as after a crash. Whether a planned stop waits for them is a choice no note makes. The
      [open question](open-questions.md#running) A deploy under way when a drain begins.
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
  69. **Reproduced: on Cluster, a door's step that loads an entity and whose commit fails leaves the entity loaded
      without its `Restart`, and its stored operation never runs.** An activation is done or leaves nothing loaded
      ([decision 0079](decisions/archive/0079-what-a-caller-sets-going-is-finished-without-it.md)). On Cluster the
      activation is in the door's transaction
      ([decision 0092](decisions/archive/0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md)),
      and the entity is entered before Cluster commits
      ([decision 0161](decisions/archive/0161-on-cluster-a-step-settles-the-machine-by-the-count-of-the-steps-that-wrote-it.md)).
      Once the `COMMIT` fails, the next step's `settle` drops the uncommitted machine with the `Started` of its
      `Restart`, and steps the message from a machine with nothing running. The operation stays stored and never
      starts, and `nothingToDo` never unloads the entity. The test `FAILING: a door step that loads an entity and
      whose commit fails leaves the entity to run its stored operation`, in `src/cluster.test.ts`, on
      `claude/premise-pairs-runtime-1-1-eb56fb` at `876ea90`. The same through `activateOnCluster`, from the waker
      and a shard's round, is only reasoned. The fix begins at `finishIn` of `src/runtime/doors.ts`, which would
      enter an entity it loaded only once its commit is known, or at `settle`, which would crash an entity whose held
      machine was never restarted. The [open question](open-questions.md#running) An entity a crash leaves with
      work stored.
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
  72. **Reproduced: after a restart, a suspended entity no longer lists the operation of a suspended sender that
      waits for it.** `suspended` reads the senders registered in the process, and is whole once a restarted process
      is settled, since every operation under way sends again
      ([decisions 0063](decisions/archive/0063-the-runtime-waits-for-what-it-waits-for.md),
      [0114](decisions/archive/0114-an-operator-sees-the-suspended-entities-and-what-a-resume-did.md)). The operations
      of a suspended entity run on
      ([decision 0113](decisions/archive/0113-a-suspended-entitys-operations-run-to-their-end.md)), but a process
      starts no suspended entity
      ([decision 0071](decisions/archive/0071-a-process-starts-the-entities-with-a-message.md)). So the operation of a
      suspended sender is listed until the process stops, and not after a restart, though nothing stored changed.
      Nothing is lost: the operation sends again once its sender is resumed. The test `FAILING: after a restart, a
      suspended entity lists the operation of a suspended sender that waits for it`, in `src/runtime.test.ts`, on
      `claude/premise-pairs-runtime-1-2-876ced` at `f812a40`. The fix begins at `waitingFor` of
      `src/runtime/callers.ts`, or is a note that narrows 0114 to the operations that run. Bug 63 is the same list on
      Cluster. The [open question](open-questions.md#running) Who an operator sees waiting.
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
  75. **Reproduced: a row the waker's own reading refuses stops every timer of the program, and the process never
      settles again.** The waker goes on past an activation that fails
      ([decision 0077](decisions/archive/0077-the-waker-tries-an-entity-it-cannot-load-again.md), changing
      [decision 0062](decisions/archive/0062-a-row-is-read-through-a-schema.md)). Its own reading of the next time due
      is a reading of rows too, and nothing catches it. A `due` no integer is, as an operator's fix may leave, makes
      `due` of `src/storage/entities.ts` die by its `Effect.orDie`. The defect leaves `waking` of
      `src/runtime/waker.ts`, the waker's fiber ends with no log, and `waker.busy` stays true, so `settled` never
      returns. The test `FAILING: a row the waker’s own reading refuses stops every timer of the program, as 0077
      says it no longer does`, in `src/runtime/waker.test.ts`, on `claude/premise-pairs-schemas-1-1-f736ec` at
      `12c788e`. The fix begins at `waking`, which would catch a reading that dies and read again after `retry`, as
      the sweep does, or at `due`, which would leave out the entity whose row it refuses. The
      [open question](open-questions.md#running) A row the waker's reading refuses.
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
  78. **Reproduced by rows written by hand: on a pool of PostgreSQL, a reading of the log may skip a row for ever.** A
      cursor skips nothing, since the rows of one partition commit in the order of their `seq`
      ([decisions 0038](decisions/archive/0038-what-happened-is-published-through-an-outbox.md),
      [0137](decisions/archive/0137-the-log-is-ordered-within-a-partition.md)). That rule also needs the reading to see the log as it
      stood at one moment, which holds on SQLite's one writer. On a pool of PostgreSQL
      ([decisions 0157](decisions/archive/0157-the-storage-speaks-sqlite-and-postgresql.md),
      [0222](decisions/0222-postgresql-with-many-connections.md)) each statement of `published` reads a snapshot of its
      own. A step of one partition that commits between the reading's heads and its page, followed by the next step of
      that partition, gives the second row and not the first, and an ack moves the cursor past the row never read. The
      same holds between two pages. The tests `FAILING: a reading of the log gives no row of a partition past a row of
      it that committed between its statements` and `FAILING: a reading of the log gives no row of a partition past a
      row of it that committed between two pages`, in `src/storage.test.ts`, on
      `claude/premise-pairs-schemas-2-5e31db` at `6730434` and `9ace256`, write the rows by hand between the reading's
      statements, as a server would commit them. The test of a server, `FAILING: a reading of the log gives no row of a
      partition past one it skipped` in `src/postgres.test.ts` at `6730434`, is written and has not run. A `fetch`
      inside a caller's transaction at `READ COMMITTED`, under a fix by `snapshot` alone, is noticed and not checked.
      The fix begins at `published` of `src/storage/log.ts`, which would read each partition only up to the head its
      first statement read, or run in `snapshot` of `src/storage/held.ts`. The
      [open question](open-questions.md#running) A statement whose condition PostgreSQL reads from its
      snapshot.
  79. **Noticed, not checked: the design's advice to begin at `REPEATABLE READ` names a page of a query, and not
      `inspect`, which reads at the caller's level too.** `inspect` reads inside a caller's transaction at the caller's
      level ([decision 0185](decisions/0185-inspect-gives-what-is-stored-of-one-entity.md)), as a page does
      ([decision 0158](decisions/archive/0158-an-older-database-of-sqlite-is-given-request-id-and-a-page-keeps-the-level-of-a-callers-transaction.md)),
      and under Databases `docs/design.md` names only the page. It is a gap of the guide, not of the code. The
      [open question](open-questions.md#running) A statement whose condition PostgreSQL reads from its
      snapshot.
  80. **Reasoned, its test written: on a pool of PostgreSQL, two prunes at once may each keep a publication no row
      names.** A publication goes with the last row of the outbox that names it, by a trigger of the statement that
      drops the row ([decisions 0154](decisions/archive/0154-a-steps-projection-is-stored-once-in-the-outbox.md),
      [0157](decisions/archive/0157-the-storage-speaks-sqlite-and-postgresql.md)), which holds while no other transaction drops a row
      of the same publication. On a pool at `READ COMMITTED`
      ([decision 0222](decisions/0222-postgresql-with-many-connections.md)), the sweep and a caller's `prune` run
      batches of 256 rows at once ([decision 0245](decisions/0245-a-reply-is-kept-as-long-as-send-says-and-the-runtime-sweeps.md)).
      Two batches that drop different rows of one publication each see the other's row still there, and both keep the
      publication, which no later statement drops. It costs storage alone, since no reading joins a publication no row
      names. The test `FAILING: a publication goes with the last row that names it, though two transactions drop its
      rows at once`, in `src/postgres.test.ts`, on `claude/premise-pairs-queries-tables-b4f457` at `bc445fb`, is written
      and has not run. The fix begins at the trigger of `src/storage/tables.ts`, which would lock the publication's row
      first, or at `prune` of `src/storage/log.ts`, by an advisory lock of the program. The
      [open question](open-questions.md#running) A statement whose condition PostgreSQL reads from its
      snapshot.
  81. **Noticed, not checked: on a pool of PostgreSQL, bug 26 happens once as many readers of `consume` wait as the
      pool holds connections.** A handler holds one connection in its page's transaction, and a step it waits for takes
      another ([decisions 0150](decisions/archive/0150-a-count-per-value-of-an-index-is-read-in-one-statement.md),
      [0164](decisions/archive/0164-two-rules-of-the-runtime-are-kept-by-the-form-of-the-code-and-a-test-reads-it.md)). Where every
      connection is so held, no step gets one, and every reader waits for ever. It needs a server and a pool of a known
      size. The [open question](open-questions.md#storage-and-reading) A call of the handle inside a transaction.
  82. **Reproduced: a world's `sendFrom` may forge a member's request, and the member's own send is answered from
      it.** A reply is keyed by the sender's address, key, incarnation and name, since no one else sends under that
      address ([decision 0021](decisions/archive/0021-a-reply-is-kept-while-the-work-that-asked-holds.md)). A world gives its members
      the surface of `rehearse` ([decision 0131](decisions/archive/0131-a-rehearsal-runs-the-entities-an-operation-sends-to.md)), and
      `sendFrom` builds a request under any address, the key `rehearsal`, the name `request` and an incarnation of the
      world's counter. So a member's operation of that key and name, at that incarnation, is answered `Accepted` from
      the forged request, and its own message is never applied. A rehearsal then gives an answer no runtime gives, with
      no defect, though only by chance. The test `FAILING: a run of an operation is not answered the reply of a sendFrom
      under its address (decisions 0021, 0131)`, in `src/rehearse.test.ts`, on `claude/premise-pairs-rehearsal-996d6c`
      at `6c7928d`. The fix begins at `sendFrom` of `src/rehearse.ts`, which would refuse the address of an entity the
      world holds, or build its request under a key no program can declare. The
      [open question](open-questions.md#programs) A `sendFrom` under a member's address.
  83. **Reasoned by a reading: the property of the fixtures may fail for no bug of the library, where a derived
      request id is the id the runtime gives a send without one.** The property sends a request with no request id
      under `new-<index>` on the runtime, and under a drawn id in the rehearsal
      ([decision 0212](decisions/0212-the-property-tests-of-the-fixtures-derive-their-values-from-the-schemas.md)).
      Where `Arbitrary.schema(RequestId)` derives `new-<k>` for another send under the same sender, the runtime takes
      it for a retry and the rehearsal applies both. A run almost never meets it. Read in
      `src/fixtures.property.test.ts`, and not run. The [open question](open-questions.md#running) The checks that
      hold less than their note.
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
  86. **Reproduced: a second runtime on another client of PGlite over the same data directory launches, and each
      steps its own copy.** A database of PGlite is held by its client in the process
      ([decisions 0080](decisions/archive/0080-a-database-is-held-by-one-runtime.md),
      [0157](decisions/archive/0157-the-storage-speaks-sqlite-and-postgresql.md)), which rests on one client per data directory, never
      written. A second `PGlite` over the directory opens with no error, each instance holds the database in its own
      memory, and the last to close writes its copy over the other's, seen by a script at PGlite 0.5.15. So the steps
      of one runtime are lost with nothing said, against what `docs/design.md` says under Where it runs. The test
      `FAILING: a second runtime on another client of PGlite over the same data directory dies as it launches`, in
      `src/runtime.test.ts`, on `claude/gallant-almeida-c81283` at `ba56b8e`, runs some two seconds, past the budget
      of `AGENTS.md`. Runners of Cluster on PGlite over one directory are noticed and not checked. The fix begins at
      `hold` of `src/storage/tables.ts`, by a lock of the data directory, or is a note that says a directory of PGlite
      has one client. The [open question](open-questions.md#running) A second runtime on one database.
  87. **Reproduced: `check` cannot run beside the old version on SQLite.** `check` launches nothing and takes no lock,
      so that it runs on a database another version holds
      ([decision 0247](decisions/0247-check-reads-the-stored-entities-as-a-deploy-would-activate-them.md)). A file of
      SQLite is held in the exclusive locking mode
      ([decision 0080](decisions/archive/0080-a-database-is-held-by-one-runtime.md)), and a new version is checked from a process of
      its own. Its client dies with `database is locked` after the busy timeout, which blocks the event loop under
      `bun:sqlite`. Nothing is lost, since the check fails loudly. The test `FAILING: a check from a client of its own
      reads a file of SQLite the old version holds`, in `src/check.test.ts`, on `claude/gallant-almeida-c81283` at
      `e04fcd4`. The same on PostgreSQL under a role of rows alone is noticed and not checked. The fix is a note that
      narrows 0247 and the design to a stopped version or a copy of the file, or the old runtime gives the check
      through its handle. The [open question](open-questions.md#running) A check beside the old version on SQLite.
  88. **Reasoned: a move of Effect's version by the rule of `AGENTS.md` leaves the drivers of PostgreSQL at the version
      it leaves.** Effect is pinned and moved on purpose ([decision 0019](decisions/archive/0019-unstable-effect-modules.md)), and the
      drivers `@effect/sql-pglite` and `@effect/sql-pg` are unstable modules whose sources hold premises of
      [decisions 0157](decisions/archive/0157-the-storage-speaks-sqlite-and-postgresql.md) and
      [0222](decisions/0222-postgresql-with-many-connections.md). `AGENTS.md` names neither among the packages a move
      pins, `scripts/compare-docs.ts` compares neither, and their peer range `^4.1.3` installs with no warning. All five
      packages are at 4.1.3 today, so nothing is wrong yet. The fix begins at `AGENTS.md` and
      `scripts/compare-docs.ts`, with a test of the form of `package.json` that every `@effect/` package is at the
      version of `effect`. The [open question](open-questions.md#running) The checks that hold less than their note.
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

- **A review of every note that changes another, for a premise the later note takes away.** A rule of an earlier
  note is safe under conditions, some never written, and a later note that changes or reuses the rule may take one
  away. Three such cases are found: decision 0248,
  [decision 0249](decisions/0249-on-cluster-a-reset-drops-the-id-a-callers-client-kept.md), and a drain across a
  deploy of a newer version, an [open question](open-questions.md#running). Each was a caller that waits for ever or work run
  otherwise than the design says, which no test of its note met. So the review reads every pair of notes of
  [the index](decisions/README.md) before the release, by the procedure of
  [`.claude/skills/premise-review/SKILL.md`](../.claude/skills/premise-review/SKILL.md), one area at a time. What it
  finds is a bug of the step of bugs, and an open question where it is only reasoned.
  - Done, in a session of 2026-11-11, both notes read whole with the code: 0171, 0125, 0090, 0169, 0170, 0173 and
    0182 against 0245; 0156 against 0176; 0119 against 0219; 0064 against 0247; 0167 against 0092; 0157 against
    0222. Its findings are decision 0249 and two open questions, the drain above and the deletions of a reply on a
    pool of PostgreSQL.
  - Read by the code and the later note only, so to read whole: 0039, 0137, 0152, 0029, 0068, 0076, 0078, 0151,
    0159, 0174, 0175, 0161 to 0163, 0172, 0021 and 0065.
  - Done, in a second session of 2026-11-11, both notes read whole with the code: the section The machine and the
    program, 0002 to 0202 against the notes that change them, 0065 against 0013 among them. It reproduced nothing.
    Its findings, only reasoned, are two open questions: request ids under a sender of `null`, and an own message
    named like a child with a tag typed `string`. A third case it noticed and did not reach, a retry in a rehearsal
    after a deploy that changes how the sender is written, is an open question too.
  - Done, in a third session of 2026-11-11, both notes read whole with the code: the section Operations and timers,
    with 0119 against 0011, 0128 and 0113. Its finding is the first bug of the step of bugs, a droppable operation a
    new program delivers at most once. Two suspects it noticed and did not check are open questions of running. Read by the code
    and the later note only, so to read whole: 0058 against 0018, and 0067 against 0056. Not reached there: 0064 and
    0114 against 0041 and 0044, and the later notes that cite the section, 0022, 0029, 0035, 0047, 0049, 0060, 0075,
    0077, 0131, 0142, 0156, 0162, 0180, 0183 and 0193.
  - Done, in a fourth session of 2026-11-11, both notes read whole with the code: the sections Creation and
    Defects, with 0064 and 0114 against 0041 and 0044, and 0046 against 0160 and 0182. Its findings are bugs 9 to
    12 of the step of bugs, the last two suspects it noticed and did not check, and each is an open question too. Read by their
    decisions only: 0038, 0053, 0079, 0130, 0206, 0062, 0109, 0175, 0166, 0177 and 0186. Not reached there, the later
    notes that cite the two sections: 0021, 0048, 0071, 0092, 0122 and 0125.
  - The first session read pairs, not sections. So every section of the index the sessions above did not name is
    still to read whole, the pairs listed above included. The areas left, one session each, in this order, each
    of thirty notes at most, with every note of [the index](decisions/README.md) in one of them:
    1. Done, Messages, requests and replies, without the rehearsal: 0004, 0009, 0010, 0015, 0021, 0023, 0047, 0048, 0059,
       0060, 0065, 0069, 0124, 0125 and 0245.
    2. Done, Effect Cluster: 0081, 0084, 0085, 0090 to 0092, 0159 to 0163, 0165 to 0176, 0178, 0248 and 0249.
    3. Done, Versions and deploys: 0020, 0022, 0036, 0043, 0051, 0058, 0075, 0100, 0102, 0126, 0156 and 0247.
    4. Done, The runtime, without the scheduler of the tests, a first part: 0028, 0029, 0063, 0066 to 0068,
       0071, 0073, 0074 and 0076 to 0079.
    5. Done, The runtime, without the scheduler of the tests, a second part: 0101, 0103, 0109 to 0112, 0116,
       0119, 0120, 0134, 0147, 0164, 0177, 0194, 0219 to 0221, 0243 and 0246.
    6. Done, Schemas and projections, of the section Schemas, storage and projections, a first part: 0025 to 0027,
       0030, 0032, 0038 to 0040, 0062, 0070, 0072 and 0098.
    7. Done, Schemas and projections, of the same section, a second part: 0121, 0122, 0135, 0137 to 0140, 0151 to
       0155, 0157, 0158, 0184, 0206, 0210, 0213 to 0215 and 0240.
    8. Done, The queries and their pages, of the same section: 0141 to 0146, 0148 to 0150, 0207 and 0209.
    9. Done, The tables and migrations, of the same section: 0191, 0198, 0216 to 0218 and 0222 to 0225.
    10. Done, The rehearsal and testing, of the section Messages, requests and replies: 0131, 0183, 0186 to 0190, 0200,
        0201 and 0211.
    11. Done, The scheduler of the tests, of the section The runtime: 0104, 0115, 0117 and 0244.
    12. Done, The project and what enters the library: 0007, 0019, 0052 to 0055, 0080, 0099, 0179, 0193, 0195, 0196,
        0203, 0204, 0208, 0212, 0241 and 0242.
  - Each area also reads, against the notes of the areas already read, every later note of its own that cites
    them. The sessions below read every such note in the area that holds it, and none is left.
  - The rule above holds of the section The machine and the program too: of the later notes that cite it, the second
    session read only those of the section itself.
  - A last session reads whole the pairs the sessions above read by the code and the later note only, or by a
    note's decision only, where an area of the list has not read them since: 0039, 0137, 0152, 0029, 0068, 0076,
    0078, 0151, 0159, 0174, 0175, 0161 to 0163, 0172 and 0021, of the first session; 0058 against 0018, 0067
    against 0056, 0090 and 0133 at the passages that cite 0005, and 0113, 0147 and 0178 by their decisions, of the
    third; 0038, 0053, 0079, 0130, 0206, 0062, 0109, 0175, 0166, 0177
    and 0186, of the fourth. It also reads the later notes of an area already read that cite an area read before
    it, which no area of the list holds: 0035, 0049 and 0180 against the section Operations and timers.
  - Done, in eight sessions of 2026-11-11 run at once, areas 1 to 8 of the list. Each session read every note of its
    area whole with the code, and the later notes the brief gave it against the sections read before. The session of
    area 1 found the later notes 0021, 0047, 0048, 0060 and 0125 citing 0020, 0027, 0036, 0040 and 0053 too, which
    the list below gives the last sessions. Their findings are bugs 13 to 26 of the step of bugs, 11 reproduced and
    3 only reasoned, two of them on a pool of PostgreSQL. Two sessions found one bug, 25, each with a test. The suspects they
    noticed are bugs 27 to 40, the first reasoned by a reading and the others not checked, and each finding whose fix is a choice and each suspect is an
    [open question](open-questions.md) too. The eight reports are recorded whole in
    [`reviews.md`](decisions/reviews.md).
  - Done, in four sessions of 2026-11-11 run at once, areas 9 to 12 of the list, each of its notes read whole with
    the code, and 0131, 0183, 0187 and 0193 against the notes they cite. Their findings are bugs 41 to 48 of the step
    of bugs: six reproduced, one of them measured by mutations and checked again on `main`, and two only reasoned.
    The suspects they noticed are bugs 49 to 53, not checked. The four reports are recorded whole in
    [`reviews.md`](decisions/reviews.md).
  - Each of the twelve sessions of 2026-11-11 read a note of another area in part or not at all where the note
    changes, cites or is changed by a note of its own area. A last session reads each such note whole, with the
    code, against the notes of the report's area it meets, as the report's table says. The notes, by the report's
    area:
    - against area 1: 0008, 0011, 0013, 0014, 0020, 0022, 0027, 0028, 0036, 0038, 0040, 0045, 0049, 0053, 0075,
      0085, 0090, 0092, 0100, 0123, 0126, 0127, 0129, 0133, 0141, 0152, 0156, 0157, 0160, 0165, 0171, 0178 and 0214.
    - against area 2: 0015, 0021, 0023, 0029, 0036, 0048, 0059, 0063, 0065, 0069, 0071, 0074, 0076, 0078, 0079,
      0100, 0114, 0125, 0137, 0142, 0147, 0151, 0156, 0164, 0182, 0185, 0215, 0219 and 0247.
    - against area 3: 0015, 0018, 0021, 0025, 0033, 0034, 0037, 0038, 0046, 0048, 0056, 0061, 0062, 0063, 0072,
      0077, 0085, 0101, 0110, 0119, 0121, 0122, 0123, 0128, 0132, 0133, 0138, 0139, 0157, 0159, 0167, 0169, 0171 and
      0174.
    - against area 4: 0006, 0011, 0013, 0030, 0040, 0042, 0043, 0045, 0046, 0051, 0056, 0061, 0062, 0075, 0081,
      0085, 0090, 0092, 0101, 0102, 0103, 0109 to 0114, 0116, 0119, 0127, 0128, 0130, 0134, 0135, 0142, 0147, 0151,
      0162 to 0164, 0167, 0172, 0177, 0194, 0205 and 0220.
    - against area 5: 0011, 0028, 0029, 0046, 0066, 0074, 0076, 0078, 0079, 0128, 0135, 0142, 0151, 0161, 0162,
      0184 and 0192.
    - against area 6: 0031, 0033 to 0036, 0046, 0048, 0049, 0077, 0101, 0120 to 0122, 0135, 0138 to 0143, 0146,
      0148 to 0150, 0152, 0159, 0180, 0184, 0197, 0206, 0210, 0213 and 0245.
    - against area 7: 0026, 0032, 0038 to 0040, 0061, 0065, 0072, 0076, 0132, 0133, 0142, 0147 to 0150, 0156, 0162,
      0185, 0205, 0207, 0209 and 0247.
    - against area 8: 0032, 0039, 0157, 0164, 0177 and 0247.
    - against area 9: 0055, 0145, 0152, 0154, 0157, 0158, 0161, 0176, 0220, 0245 and 0247.
    - against area 10: 0010, 0021, 0045, 0047, 0048, 0063, 0065, 0074, 0075, 0125, 0165, 0185, 0210, 0212 and 0245.
    - against area 12: 0003, 0028, 0030, 0038, 0039, 0057, 0064, 0073, 0075, 0081, 0084, 0104, 0125, 0132, 0136,
      0138, 0141, 0143, 0152, 0153, 0156, 0157, 0176, 0185, 0191, 0198, 0211, 0215, 0221, 0245 and 0247.
  - The last sessions are these seventeen, each of thirty notes to read at most, by the section A last session's
    brief of [`.claude/skills/premise-review/SKILL.md`](../.claude/skills/premise-review/SKILL.md). Each is given its
    notes, from the bullet that holds them above, and the notes of the area it reads them against. A list of more
    than thirty notes is two sessions, its notes before 0100 and the rest. A session that ends one writes `Done, `
    before it, and `bun scripts/premise-coverage.ts` names the first that does not start with `Done`.
    1. Done, the first session's pairs, of the bullet that begins `A last session reads whole`.
    2. Done, the third and fourth sessions' pairs, with 0035, 0049 and 0180, of the same bullet.
    3. Done, against area 1, the notes before 0100.
    4. Done, against area 1, the notes from 0100.
    5. Done, against area 2.
    6. Done, against area 3, the notes before 0100.
    7. Done, against area 3, the notes from 0100.
    8. Done, against area 4, the notes before 0100.
    9. Done, against area 4, the notes from 0100.
    10. Done, against area 5.
    11. Done, against area 6, the notes before 0100.
    12. Done, against area 6, the notes from 0100.
    13. Done, against area 7.
    14. Done, against areas 8 and 9, the two lists together.
    15. Done, against area 10.
    16. Done, against area 12, the notes before 0100.
    17. Done, against area 12, the notes from 0100.
  - Done, in six of the last sessions of 2026-11-11 run at once: both parts of the bullet that begins `A last
    session reads whole`, the lists against areas 1 and 2, and the notes before 0100 of the list against area 3.
    Each read every note of its list whole with the code. The session against area 2 read 21 notes in part, and
    read them whole when it was sent back. Their findings are bugs 54 to 64 of the step of bugs, seven reproduced
    and four only reasoned, and bug 65, noticed by two sessions. Two sessions found one bug, 62. The six reports are
    recorded whole in [`reviews.md`](decisions/reviews.md).
  - Done, in five of the last sessions of 2026-11-11 run at once: the notes from 0100 of the list against area 3,
    both parts of the list against area 4, the list against area 5, and the notes before 0100 of the list against
    area 6. Each read every note of its list whole with the code. Their findings are bugs 66 to 75 of the step of
    bugs: six reproduced, each test run again on its branch and stopped at its assertion, two only reasoned, and
    two noticed and not checked. Two sessions found one bug, 71. The five reports are recorded whole in
    [`reviews.md`](decisions/reviews.md). The app runs five sessions at once, so the notes from 0100 of the list
    against area 6, the twelfth last session, start with the next batch.
  - Done, in the last six of the last sessions of 2026-11-11: the notes from 0100 of the list against area 6, the
    lists against areas 7, 8 and 9, and 10, and both parts of the list against area 12. Each read every note of its
    list whole with the code. Their findings are bugs 76 to 88 of the step of bugs. Seven are reproduced, each test
    run again on its branch and stopped at its assertion, one of them by rows written by hand where its test of a
    server has not run. Three are only reasoned, one with its test of a server written, and three are noticed and not
    checked. The six reports are recorded whole in [`reviews.md`](decisions/reviews.md). The seventeen last sessions
    are done, so the step goes on with the sample below.
  - Once the last sessions are done, a sample decides whether the whole review is read a second time. The sessions
    sent back to their area on 2026-11-11 found bugs 19 and 20 on a second pass, so a pass does not find all a
    reading of pairs can find. A session that read none of the reports reads two areas again by the skill's brief,
    given none of their findings: area 2, Effect Cluster, which found the most, and an area of the list that found
    nothing, or area 11 where every area found something. The whole review is read again only if the sample finds a
    bug, reproduced or of family C or D, that the step of bugs does not hold. Otherwise what a reading of pairs
    misses, a rule that three notes or a whole flow keep together, is left to the steps What a deploy may change of
    a program, The tests of a contract on every backend and A test of invariants over generated histories, below.
  - Done, the sample, in a session of 2026-11-11 that read none of the reports, on
    `claude/quizzical-franklin-e9c4d2`, cut at `fcd2494`, whose `src/` is main's. Its first pass read the notes of
    the two areas alone, and it read the 33 notes that change or cite them whole when it was sent back. It found
    bug 89, reproduced, which the step did not hold. It found bug 57 again, with a second way in that is bug 90, and
    bug 27 again. Bug 91 is a reading that loses nothing. Its report is recorded whole in
    [`reviews.md`](decisions/reviews.md). So by the rule above the whole review is read a second time: a pass of a
    reading of pairs missed a reproduced bug in the area that had found the most.
  - The second reading comes after the step of bugs, which this step follows. The maintainer chose so on
    2026-11-11, for two reasons. The fixes change the code and the notes the second reading would read, so it reads
    them as the fixes leave them. Each fix is also a note that changes another, which the second reading then reads
    too. The second reading reads the areas of the list again, by the skill's section The reviewer's brief, each by a
    session that read none of the reports, then the pairs each of its sessions read in part, as the last sessions
    did. The sample stands for areas 2 and 11, as the maintainer chose. What it finds is a bug of the step of bugs,
    from 92 on. The step leaves this file once the second reading is done. Its areas, by the numbers of the list
    above, each marked `Done, ` here once its session is recorded:
    1. Area 1, Messages, requests and replies.
    2. Done, by the sample above: area 2, Effect Cluster.
    3. Area 3, Versions and deploys.
    4. Area 4, The runtime, a first part.
    5. Area 5, The runtime, a second part.
    6. Area 6, Schemas and projections, a first part.
    7. Area 7, Schemas and projections, a second part.
    8. Area 8, The queries and their pages.
    9. Area 9, The tables and migrations.
    10. Area 10, The rehearsal and testing.
    11. Done, by the sample above: area 11, The scheduler of the tests.
    12. Area 12, The project and what enters the library.
  - The first session's report is not kept, so what it ruled out is not written here. The reports of the second,
    third and fourth sessions are recorded whole in this step, in the step of bugs and in
    [the open questions](open-questions.md).
  - Every area of the list, every last session and the sample are `Done`. So the step goes on with area 1 of the
    second reading, once the step of bugs before it is done. A session that records a review writes `Done, ` before what it read, and adds a
    bullet here of what it read, what it found and what it did not reach. `bun scripts/premise-coverage.ts` also
    reads every table of [`reviews.md`](decisions/reviews.md), and fails where a note read in part is in no list of
    a last session and read whole by no other review.
  - The reviewers' branches are local to the maintainer's machine, and pushed nowhere:
    `claude/premise-review-machine-c1a99e`, `claude/premise-review-operations-d2dda3`,
    `claude/premise-review-creation-03f15d`, `claude/premise-review-messages-975dd7`,
    `claude/premise-review-cluster-3063df`, `claude/premise-review-versions-36a283`,
    `claude/premise-review-runtime-1-b0a258`, `claude/premise-review-runtime-2-157489`,
    `claude/premise-review-schemas-1-0ccf33`, `claude/premise-review-schemas-2-b06280` and
    `claude/premise-review-queries-ea6b5a`, cut from `main` at `fcd2494`, and
    `claude/premise-review-tables-28f779`, `claude/premise-review-rehearsal-cdcc14`,
    `claude/premise-review-scheduler-8df79e` and `claude/premise-review-project-17a123`, cut at `a746214`, and `claude/premise-pairs-first-ee0216`,
    `claude/premise-pairs-early-b0bea3`, `claude/premise-pairs-messages-1-dcd7d8`,
    `claude/premise-pairs-messages-2-a90d4b`, `claude/premise-pairs-cluster-32dc2e` and
    `claude/premise-pairs-versions-1-e03c02`, cut at `e6d3808`, and `claude/premise-pairs-versions-2-b6a869`,
    `claude/premise-pairs-runtime-1-1-eb56fb`, `claude/premise-pairs-runtime-1-2-876ced`,
    `claude/premise-pairs-runtime-2-4e02ac`, `claude/premise-pairs-schemas-1-1-f736ec` and
    `claude/dazzling-darwin-f09ea9`, cut at `743881f`, and `claude/premise-pairs-schemas-2-5e31db`,
    `claude/premise-pairs-queries-tables-b4f457`, `claude/premise-pairs-rehearsal-996d6c`,
    `claude/premise-pairs-project-1-5b0c65` and `claude/gallant-almeida-c81283`, cut at `9fd90aa`, and the sample's
    `claude/quizzical-franklin-e9c4d2`, cut at `fcd2494`. A bug of the step of bugs names the commit of its failing test on one of
    them. A session elsewhere writes that test again from the bug's sequence and the report in
    [`reviews.md`](decisions/reviews.md).

- **A door that changes between two releases of the library, to verify and fix.** A release of the library that adds
  an RPC to the door of a program on Cluster, or changes a payload, is not caught by the guard of the version
  ([decision 0159](decisions/archive/0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md)).
  A runner of the older release that still holds a shard is given the newer request, and Cluster answers a payload
  it cannot decode with a defect and stores it, so the request is lost in silence. The spike
  [`spikes/cluster-older-runner-answers-a-newer-request.test.ts`](../spikes/cluster-older-runner-answers-a-newer-request.test.ts)
  sees Cluster's answer. No test runs a rolling deploy of two releases of the library. The step comes after the fixes
  of the bugs above. It begins with a test of `src/cluster.test.ts` with two runners whose doors differ, and its fix
  is a choice of the design, which the [open question](open-questions.md#running) A door that changes between two
  releases of the library lists.

- **What a deploy may change of a program, against what is stored.** This step is the rule of family A of the step
  of bugs above. Four of the bugs the premise review found have
  one form: a deploy of a newer version changes a piece of the program, while what is stored was written by the
  older version. They are the delivery of an operation (bug 1), the way the sender is written (bug 5), a droppable
  operation a resume drops (bug 7), and the door (the step above). The review reads one pair of notes at a time, so
  it finds such a case only where one pair holds it. This step lists every piece a program declares: the sender,
  the flags, the keys and their parameters, each operation and its delivery, the timers, the internal messages, the
  rejections, the projection, the children and the door. For each piece and each way a deploy changes it, it asks
  what happens to an entity stored, loaded, suspended or draining, on one process and on Cluster, with a deploy of
  a newer version and of an older one. Each case gets a test that shows it holds, or a sentence that says why it
  holds and cites the note that decides it. A case that fails is a bug of this step, fixed by a note with its test,
  as the bugs above. The cases the steps above already hold cite them. A `reindex` an operator runs on the older runner of a rolling deploy writes the older
  projection over the row the newer runner wrote, since the entity's state and version did not change, which is bug
  77 of the step of bugs, reproduced. The table is written in `docs/`, so that a
  piece a later note adds to a program adds its row. The code that keeps the table is one place, where an
  activation by a program compares each piece stored with the program: the same, changed in a way the table
  allows, which it converts, or changed otherwise, which suspends the entity with a defect that names the piece.

- **The tests of a contract on every backend.** It is the fourth kind of test of `AGENTS.md`, and the rule of
  families C and D of the step of bugs. One set of requests runs alike on each way the library runs, and the
  answers, the projections and what an operator reads must be the same on each. The ways are SQLite and PostgreSQL
  on one process, PostgreSQL with a pool on the CI's server, and Cluster with two runners on one file.
  [`src/dialects.test.ts`](../src/dialects.test.ts) is where it begins. It runs the calls fast-check generates on
  SQLite and on PostgreSQL, and compares each answer
  ([decision 0157](decisions/archive/0157-the-storage-speaks-sqlite-and-postgresql.md)), but it holds neither Cluster nor a
  pool. The step adds Cluster, with the helpers `onFile`, `start` and `withholding` of
  [`src/cluster.test.ts`](../src/cluster.test.ts), and the pool, with two steps held at their statements, as the
  job `postgres` of the CI runs it. A test of the runtime that holds a rule of one process then runs on Cluster too,
  where the rule is said to hold there, so that a rule of one process that holds otherwise on Cluster fails a test.
  Bugs 2, 3, 10, 11 and 12 are cases of it. The step comes before the test of invariants, which runs on Cluster and
  on a pool through it.

- **A test of invariants over generated histories.** It is the second kind of test of `AGENTS.md`, which the library
  does not have yet. fast-check generates histories of commands: a message under a new request id or a retried one,
  an operation that completes or fails, time that passes, a crash and a restart, a deploy of a variant of the
  program, a resume and a discard. The variants of a deploy change one piece of a program at a time, as the table
  of the step above lists them. A program of the test holds an operation of each delivery, a timer and a child, and
  records outside the machine each operation that starts. After each history the test checks the promises of the
  design as invariants. A message under a request id is applied at most once, and a retry is given the same reply.
  An at-least-once operation that talks only to entities acts once. An at-most-once operation is given `unknown`
  only where it started. No operation counts as running that never started. After a deploy an entity is active
  under the new program, or suspended with a defect. Every request is answered within a number of steps of the
  scheduler, so that a wait for ever fails the test. The histories run in two layers.
  - On the rehearsal, many and quick, for the logic of the machine, of a deploy and of a crash.
  - On the runtime under the scheduler of `src/testing.ts`, fewer, with commands at once: two callers, a completion
    while an entity unloads, a crash during a step, a sweep while a caller waits. Its strategies are those of the
    tests of concurrency, `prioritized` and `explore`, which stay.
  [`src/rehearse.property.test.ts`](../src/rehearse.property.test.ts), which compares the rehearsal and the runtime
  over generated messages, is where it begins. A failing history is shrunk by fast-check, and its shortest form is
  pinned as a case. On Cluster and on PostgreSQL with a pool, the invariants run through the step The tests of a
  contract on every backend, above.

- **The tests pruned by the mutations.** Once the test of invariants exists, `scripts/mutate.ts` takes out each
  rule the notes decide, one at a time. A test of a scenario that fails only where a test of the four kinds of
  `AGENTS.md` fails too, under every mutation, goes, and its rule is said by the test that stays. A test that alone
  fails under a mutation stays. The step keeps the suite within its budget as the tests of the bugs come in.

## Later

- **The release**, once there is code to publish. It is released as experimental while it depends
  on Effect's unstable modules ([decision 0099](decisions/archive/0099-a-library-on-unstable-modules-is-released-as-experimental.md)).
  The release archives the notes the design has come to cover since the last archiving, as
  [`AGENTS.md`](../AGENTS.md) says. It passes `bun run test:release`, which runs every seed of the explored tests.
  The release decides whether `exports` names the sources or JavaScript with declarations, as effect-tea ships, and
  writes the metadata of `package.json`: a `description` in the words of the README, `repository`, `homepage` to the
  site, `sideEffects`, and `keywords` with the words people search this problem by, `saga` and `durable-execution`
  among them, since the README says where the library differs. What it publishes leaves out the files of the tests,
  `*.test.ts` and `*.test_*.ts` ([decision 0241](decisions/0241-a-group-of-modules-lies-in-a-folder-entered-by-the-module-of-its-name.md)).

- **The runtime on Cluster across machines, on PostgreSQL**, once Cluster has a fence
  ([Effect-TS/effect#10058](https://github.com/Effect-TS/effect/issues/10058)), or the runtime one of its own. Until
  then a step commits only where the commit checks the shard, which on Cluster is SQLite
  ([decision 0084](decisions/archive/0084-a-step-commits-only-where-the-commit-checks-the-shard.md)). A fence of the runtime's
  own is tested on the server of PostgreSQL with a pool that the CI runs
  ([decision 0222](decisions/0222-postgresql-with-many-connections.md)). The step also decides whether the runtime
  checks its advisory lock, which a server that ends its session gives back
  ([open question](open-questions.md#running)).
