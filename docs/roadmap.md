# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## Next

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
    9. The tables and migrations, of the same section: 0191, 0198, 0216 to 0218 and 0222 to 0225.
    10. The rehearsal and testing, of the section Messages, requests and replies: 0131, 0183, 0186 to 0190, 0200,
        0201 and 0211.
    11. The scheduler of the tests, of the section The runtime: 0104, 0115, 0117 and 0244.
    12. The project and what enters the library: 0007, 0019, 0052 to 0055, 0080, 0099, 0179, 0193, 0195, 0196,
        0203, 0204, 0208, 0212, 0241 and 0242.
  - Each area also reads, against the notes of the areas already read, every later note of its own that cites
    them. The sessions above did not reach these, and each is read in the area that holds it: 0131, 0183, 0187 and
    0193.
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
  - Each of those sessions read a note of another area in part or not at all where the note changes, cites or is
    changed by a note of its own area. A last session reads each such note whole, with the code, against the notes of
    the report's area it meets, as its table says. A note of areas 9 to 12 is read there instead. The notes, by the
    report's area:
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
  - The lists of the two bullets above are divided, before the first last session starts, into sessions of thirty
    notes at most, each with the notes of the areas it reads them against.
  - The first session's report is not kept, so what it ruled out is not written here. The reports of the second,
    third and fourth sessions are recorded whole in this step, in the step of bugs and in
    [the open questions](open-questions.md).
  - The step begins with the skill's brief, given the first area of the list that does not start with `Done`, which
    `bun scripts/premise-coverage.ts` names. A session that ends an area writes `Done, ` before the area's name in
    the list, keeps its notes there, takes out of the list of notes not reached those it read whole, and adds a
    bullet here of what it read, what it found and what it did not reach. The step leaves this file once the last session is done.
  - The reviewers' branches are local to the maintainer's machine, and pushed nowhere:
    `claude/premise-review-machine-c1a99e`, `claude/premise-review-operations-d2dda3`,
    `claude/premise-review-creation-03f15d`, `claude/premise-review-messages-975dd7`,
    `claude/premise-review-cluster-3063df`, `claude/premise-review-versions-36a283`,
    `claude/premise-review-runtime-1-b0a258`, `claude/premise-review-runtime-2-157489`,
    `claude/premise-review-schemas-1-0ccf33`, `claude/premise-review-schemas-2-b06280` and
    `claude/premise-review-queries-ea6b5a`, each cut from `main` at `fcd2494` from the fourth on. A bug of the step of bugs names the commit of its failing test on one of
    them. A session elsewhere writes that test again from the bug's sequence and the report in
    [`reviews.md`](decisions/reviews.md).

- **The suite within its budget.** `AGENTS.md` asks that `bun test` run within two minutes on one machine, and that
  no test of it run over two seconds. On 2026-11-11 it ran 779 tests in 289 seconds. The 561 tests under a tenth of
  a second took 5 seconds together, and the 20 slowest took 157. The slowest, `a deploy interrupted anywhere keeps
  its name and its waker, or stops what it started` in `src/runtime.test.ts`, took 44 seconds alone. The files
  `src/cluster.test.ts`, `src/runtime.test.ts`, `src/storage.test.ts` and `src/runtime/loop.test.ts` took two thirds
  of the time, and the spikes about 30 seconds. The step measures each test with `bun test --reporter=junit
  --reporter-outfile=<file>`. Each test over two seconds runs a sample of its cases under `bun test`, read from
  `SCHEDULES`, and all of them under `bun run test:release`, so that no rule loses its test. The step also decides
  whether the spikes leave `bun test` for a run of their own, in the CI and at each move of Effect's or Bun's
  version, which changes the rule of `AGENTS.md` that `bun test` runs them, the workflow's shards and the test of
  the workflow's form. It is done once `bun test` holds the budget, and `AGENTS.md` no longer says it does not.

- **The bugs the premise review found, fixed by family.** Each bug below is a rule of a note whose premise a
  later note took away. A bug reproduced has a test that fails, and its fix begins where the bug says. A bug only
  reasoned is verified first, by a test that fails or by a reading that rules it out, and the
  [open question](open-questions.md) that holds it says what would decide it. A fix is a note that changes the
  earlier one, taken with its test, renamed without `FAILING:` or out of `todo`. A bug verified false leaves this
  list, and its open question says why. The review of the step before adds each bug it finds here.
  The step starts once the review is done, so that the bugs are counted whole. It groups them by what they have in
  common, and a family gets one rule, kept in one place of the code, instead of a fix for each bug. Each bug's test
  passes under the rule, as the proof that the rule holds the case. A bug of no family gets a fix of its own. The
  families of 2026-11-11, which the rest of the review may change:
  - A, a newer version against what an older one stored or runs: bugs 1, 5, 7, 15, 16 and 28 to 30, and the door
    of the next step. A rename is such a change. Its rule is the step What a deploy may change of a program, against
    what is stored, below.
  - B, an answer an operation acts on and that a run after a crash is not given again: bug 9, and its half of
    `NotFound`. Its rule would be that every answer an operation acts on is kept while its work holds, in
    `src/runtime/callers.ts`, where every answer passes.
  - C, a rule of one process that holds otherwise on Cluster: bugs 2, 10 to 12, 20, 21, 23, 24, 27, 33 to 36 and
    39, as decisions 0248 and 0249 were. Its rule is the step The tests of a contract on every backend, below: the
    tests of the runtime run alike on one process and on Cluster.
  - D, a rule that holds only of one transaction at a time: bugs 3, 13 and 25. Its rule is the same step: a test of
    rows of two entities runs on the CI's PostgreSQL with a pool too, with the two steps held at their statements.
    Bugs 13 and 25 are one form, a statement whose condition PostgreSQL reads from its snapshot and does not read
    again on the row it then writes.
  - E, an entity a crash leaves with work stored, which nothing loads again: bugs 14 and 18, one on Cluster and one
    on one process. Its rule would be that a crash which leaves work stored gives the entity to the waker's retry
    of [decision 0077](decisions/archive/0077-the-waker-tries-an-entity-it-cannot-load-again.md), in `crash` of
    `src/runtime/loop.ts`, on one process and on Cluster.
  - F, a value that [decision 0208](decisions/0208-a-launch-checks-every-option.md) allows, taken to its end: bugs
    17 and 32, under a `retry` of 0. Its rule is a least time of a retry, or a launch that refuses 0.
  - Of no family yet: bugs 4, 6, 8, 19, 22, 26, 31, 37, 38 and 40.
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
  17. **Reproduced: under a `retry` of 0, the waker tries an entity it cannot activate at once, for ever, and the
      process never settles.** [Decision 0077](decisions/archive/0077-the-waker-tries-an-entity-it-cannot-load-again.md)
      rests on a `retry` above 0, and [decision 0208](decisions/0208-a-launch-checks-every-option.md) allows 0. The
      test `FAILING: under a retry of no time, an entity the waker can never activate leaves the process settled`,
      in `src/runtime/waker.test.ts`, on `claude/premise-review-runtime-1-b0a258` at `ac905d8`. The fix begins at
      `waking` of `src/runtime/waker.ts`, or at the launch's check. The [open question](open-questions.md#running) A
      retry of no time.
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
  32. **Noticed, not checked: under a `retry` of 0, a sender whose receiver crashes at every attempt, or answers
      `Full`, sends again with no wait, for as long as the receiver fails.**
      ([decision 0208](decisions/0208-a-launch-checks-every-option.md)). The
      [open question](open-questions.md#running) A retry of no time.
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
  as the bugs above. The cases the steps above already hold cite them. One case the premise review noticed and no bug holds: a `reindex` an operator runs on the
  older runner of a rolling deploy writes the older projection over the row the newer runner wrote, since the
  entity's state and version did not change ([`reviews.md`](decisions/reviews.md), the review of Schemas and
  projections, a first part). The table is written in `docs/`, so that a
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
