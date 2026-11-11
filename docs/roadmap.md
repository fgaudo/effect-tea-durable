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
  finds is a bug of the next step, and an open question where it is only reasoned.
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
    with 0119 against 0011, 0128 and 0113. Its finding is the first bug of the next step, a droppable operation a
    new program delivers at most once. Two suspects it noticed and did not check are open questions of running. Read by the code
    and the later note only, so to read whole: 0058 against 0018, and 0067 against 0056. Not reached there: 0064 and
    0114 against 0041 and 0044, and the later notes that cite the section, 0022, 0029, 0035, 0047, 0049, 0060, 0075,
    0077, 0131, 0142, 0156, 0162, 0180, 0183 and 0193.
  - Done, in a fourth session of 2026-11-11, both notes read whole with the code: the sections Creation and
    Defects, with 0064 and 0114 against 0041 and 0044, and 0046 against 0160 and 0182. Its findings are bugs 9 to
    12 of the next step, the last two suspects it noticed and did not check, and each is an open question too. Read by their
    decisions only: 0038, 0053, 0079, 0130, 0206, 0062, 0109, 0175, 0166, 0177 and 0186. Not reached there, the later
    notes that cite the two sections: 0021, 0048, 0071, 0092, 0122 and 0125.
  - Next, the sections of the index not read at all: the queries and their pages, 0141 to 0150, 0207 and 0209; the tables and migrations, 0191 to 0218
    and 0225; the rehearsal and testing, 0131, 0183 to 0189, 0200 and 0211; the scheduler of the tests, 0104, 0115,
    0117 and 0244; and what enters the library. The step begins with the skill's brief, given the first of these
    areas.

- **The bugs the premise review found, to verify and fix.** Each bug below is a rule of a note whose premise a
  later note took away. A bug reproduced has a test that fails, and its fix begins where the bug says. A bug only
  reasoned is verified first, by a test that fails or by a reading that rules it out, and the
  [open question](open-questions.md) that holds it says what would decide it. A fix is a note that changes the
  earlier one, taken with its test, renamed without `FAILING:` or out of `todo`. A bug verified false leaves this
  list, and its open question says why. The review of the step before adds each bug it finds here.
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

- **What a deploy may change of a program, against what is stored.** Four of the bugs the premise review found have
  one form: a deploy of a newer version changes a piece of the program, while what is stored was written by the
  older version. They are the delivery of an operation (bug 1), the way the sender is written (bug 5), a droppable
  operation a resume drops (bug 7), and the door (the step above). The review reads one pair of notes at a time, so
  it finds such a case only where one pair holds it. This step lists every piece a program declares: the sender,
  the flags, the keys and their parameters, each operation and its delivery, the timers, the internal messages, the
  rejections, the projection, the children and the door. For each piece and each way a deploy changes it, it asks
  what happens to an entity stored, loaded, suspended or draining, on one process and on Cluster, with a deploy of
  a newer version and of an older one. Each case gets a test that shows it holds, or a sentence that says why it
  holds and cites the note that decides it. A case that fails is a bug of this step, fixed by a note with its test,
  as the bugs above. The cases the steps above already hold cite them. The table is written in `docs/`, so that a
  piece a later note adds to a program adds its row.

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
