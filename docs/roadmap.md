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
  finds is a bug of [`docs/bugs.md`](bugs.md), and an open question where it is only reasoned.
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
    with 0119 against 0011, 0128 and 0113. Its finding is bug 1 of `docs/bugs.md`, a droppable operation a
    new program delivers at most once. Two suspects it noticed and did not check are open questions of running. Read by the code
    and the later note only, so to read whole: 0058 against 0018, and 0067 against 0056. Not reached there: 0064 and
    0114 against 0041 and 0044, and the later notes that cite the section, 0022, 0029, 0035, 0047, 0049, 0060, 0075,
    0077, 0131, 0142, 0156, 0162, 0180, 0183 and 0193.
  - Done, in a fourth session of 2026-11-11, both notes read whole with the code: the sections Creation and
    Defects, with 0064 and 0114 against 0041 and 0044, and 0046 against 0160 and 0182. Its findings are bugs 9 to
    12 of `docs/bugs.md`, the last two suspects it noticed and did not check, and each is an open question too. Read by their
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
    13. Done, the notes taken after the first reading, of several sections: 0250, 0251, 0252, 0254, 0255, 0256, 0258,
        0259, 0261, 0262, 0263, 0264, 0266, 0267, 0269, 0271 and 0273 to 0280. They are more than fifteen, so
        `AGENTS.md` asks a review of them before the next step. They are notes of the fixes of the bugs, whose step
        was taken on 2026-11-12, and the area runs first of the second reading below, in a session that did not write
        them. The other notes of those fixes lie in sections already read, and the second
        reading reads them with their areas.
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
    the list below gives the last sessions. Their findings are bugs 13 to 26 of `docs/bugs.md`, 11 reproduced and
    3 only reasoned, two of them on a pool of PostgreSQL. Two sessions found one bug, 25, each with a test. The suspects they
    noticed are bugs 27 to 40, the first reasoned by a reading and the others not checked, and each finding whose fix is a choice and each suspect is an
    [open question](open-questions.md) too. The eight reports are recorded whole in
    [`reviews.md`](decisions/reviews.md).
  - Done, in four sessions of 2026-11-11 run at once, areas 9 to 12 of the list, each of its notes read whole with
    the code, and 0131, 0183, 0187 and 0193 against the notes they cite. Their findings are bugs 41 to 48 of `docs/bugs.md`:
    six reproduced, one of them measured by mutations and checked again on `main`, and two only reasoned.
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
    read them whole when it was sent back. Their findings are bugs 54 to 64 of `docs/bugs.md`, seven reproduced
    and four only reasoned, and bug 65, noticed by two sessions. Two sessions found one bug, 62. The six reports are
    recorded whole in [`reviews.md`](decisions/reviews.md).
  - Done, in five of the last sessions of 2026-11-11 run at once: the notes from 0100 of the list against area 3,
    both parts of the list against area 4, the list against area 5, and the notes before 0100 of the list against
    area 6. Each read every note of its list whole with the code. Their findings are bugs 66 to 75 of `docs/bugs.md`:
    six reproduced, each test run again on its branch and stopped at its assertion, two only reasoned, and
    two noticed and not checked. Two sessions found one bug, 71. The five reports are recorded whole in
    [`reviews.md`](decisions/reviews.md). The app runs five sessions at once, so the notes from 0100 of the list
    against area 6, the twelfth last session, start with the next batch.
  - Done, in the last six of the last sessions of 2026-11-11: the notes from 0100 of the list against area 6, the
    lists against areas 7, 8 and 9, and 10, and both parts of the list against area 12. Each read every note of its
    list whole with the code. Their findings are bugs 76 to 88 of `docs/bugs.md`. Seven are reproduced, each test
    run again on its branch and stopped at its assertion, one of them by rows written by hand where its test of a
    server has not run. Three are only reasoned, one with its test of a server written, and three are noticed and not
    checked. The six reports are recorded whole in [`reviews.md`](decisions/reviews.md). The seventeen last sessions
    are done, so the step goes on with the sample below.
  - Once the last sessions are done, a sample decides whether the whole review is read a second time. The sessions
    sent back to their area on 2026-11-11 found bugs 19 and 20 on a second pass, so a pass does not find all a
    reading of pairs can find. A session that read none of the reports reads two areas again by the skill's brief,
    given none of their findings: area 2, Effect Cluster, which found the most, and an area of the list that found
    nothing, or area 11 where every area found something. The whole review is read again only if the sample finds a
    bug, reproduced or of family C or D, that `docs/bugs.md` does not hold. Otherwise what a reading of pairs
    misses, a rule that three notes or a whole flow keep together, is left to the steps What a deploy may change of
    a program, The tests of a contract on every backend and A test of invariants over generated histories, below.
  - Done, the sample, in a session of 2026-11-11 that read none of the reports, on
    `claude/quizzical-franklin-e9c4d2`, cut at `fcd2494`, whose `src/` is main's. Its first pass read the notes of
    the two areas alone, and it read the 33 notes that change or cite them whole when it was sent back. It found
    bug 89, reproduced, which the step did not hold. It found bug 57 again, with a second way in that is bug 90, and
    bug 27 again. Bug 91 is a reading that loses nothing. Its report is recorded whole in
    [`reviews.md`](decisions/reviews.md). So by the rule above the whole review is read a second time: a pass of a
    reading of pairs missed a reproduced bug in the area that had found the most.
  - The second reading comes after the fixes of the bugs, a step taken on 2026-11-12. The maintainer chose so on
    2026-11-11, for two reasons. The fixes change the code and the notes the second reading would read, so it reads
    them as the fixes leave them. Each fix is also a note that changes another, which the second reading then reads
    too. The second reading reads the areas of the list again, by the skill's section The reviewer's brief, each by a
    session that read none of the reports, then the pairs each of its sessions read in part, as the last sessions
    did. The sample stands for areas 2 and 11, as the maintainer chose. What it finds is a bug of
    [`docs/bugs.md`](bugs.md), from 93 on. The step leaves this file once the second reading is done. Its areas, by the numbers of the list
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
  - The second reading starts from the inventory of the premises only reasoned, the section of 2026-11-11 at the
    end of [`reviews.md`](decisions/reviews.md). It sorts 125 premises of 85 notes against the rule of `AGENTS.md`
    that no premise of what code does is only reasoned. The six cases it finds left out and in no open question
    are in [the open questions](open-questions.md), written on 2026-11-12 before area 1. Each of the 36 premises of what code does that it
    finds checked by nothing gets the test its row names, the seven of risk high first. A test that fails is a bug
    of `docs/bugs.md`, and a test that passes makes the premise tested. A premise that no test reaches yet is an
    open question. Each area then reads, of its notes, the premises the inventory calls chosen, and the four it
    counts as checked by a test of a neighbouring case.
  - The second reading lists its pairs by the code too. `bun scripts/premise-pairs.ts` found, on 2026-11-12, 2,517
    pairs of notes that a comment of one declaration of `src/` cites together and that no note links. Of them, 260
    are of declarations that cite five notes at most, and the rest of declarations that cite up to forty, as the
    machine's. So each session of an area adds only the pairs of its own notes, by `--note`, as the skill's brief
    says. A pair of a declaration of many notes is left to the readings of one shared state below.
  - After the areas of the second reading, the review reads each shared state of the code once, by the skill's
    section A reading of one shared state, in this order. A state of more than thirty notes is divided before its
    session starts, as an area is, and `bun scripts/premise-pairs.ts --tables` gives each table's places and notes.
    1. The tables of Cluster's requests: `effecttea_sent_requests`, `effecttea_given_requests`, `cluster_messages`
       and `cluster_replies`, where the bug of 0248 was.
    2. The tables of replies: `effecttea_replies`, `effecttea_answers` and `effecttea_waiting`.
    3. The tables of an entity: `effecttea_entities`, `effecttea_entity_keys` and `effecttea_mailbox`.
    4. The tables of versions: `effecttea_versions` and `effecttea_runner_versions`.
    5. The tables of projections and of the log: `effecttea_projections`, `effecttea_log` and `effecttea_heads`.
    6. The table `effecttea_publications`.
    7. The tables of the outbox: `effecttea_outbox`, `effecttea_consumers` and `effecttea_cursors`.
    8. The locks of the process, `locks` of `src/runtime/process.ts`.
    9. A deployment's entities and shards: `loaded`, `shards` and `waker`, of `src/runtime.ts` and
       `src/runtime/waker.ts`.
    10. A loaded entity's state, of `src/runtime/loop.ts`: its queue of events, `operations`, `timers`, `callers`
        and `links`.
    11. The process's maps of callers and deploys: `messages`, `creations`, `operators`, `undeployed`,
        `resumptions` and `recent`.
    12. The readings of commits: `commits` and `waiting` of `src/runtime/readings.ts`.
  - The first session's report is not kept, so what it ruled out is not written here. The reports of the second,
    third and fourth sessions are recorded whole in this step, in [`docs/bugs.md`](bugs.md) and in
    [the open questions](open-questions.md).
  - Done, in a session of 2026-11-12 that wrote none of its notes: area 13, each of its notes read whole with the
    code that keeps it, and the notes they change or cite read in part, each of them read whole by the review of its
    own area. Its finding is bug 93 of `docs/bugs.md`, reproduced on `claude/premise-review-area-13-fe5765`, cut from
    `main` at `f7c6076`, and fixed by
    [decision 0281](decisions/0281-a-rehearsals-time-is-a-whole-millisecond.md). Its three suspects not checked are [open questions](open-questions.md#running): an
    operation's send to an entity whose stop runs, a `Reused` reset by two clients on Cluster, and a door's step in
    the undo's wait, under A drain on Cluster with a deploy under way. Not reached: nothing of the area. Its report is
    recorded whole in [`reviews.md`](decisions/reviews.md).
  - Every area of the list, every last session and the sample are `Done`. So the step goes on with area 1 of the
    second reading. A session that records a review writes `Done, ` before what it read, and adds a
    bullet here of what it read, what it found and what it did not reach. `bun scripts/premise-coverage.ts` also
    reads every table of [`reviews.md`](decisions/reviews.md), and fails where a note read in part is in no list of
    a last session and read whole by no other review.
  - The reviewers' branches are local to the maintainer's machine, and pushed nowhere. The branch of the review of
    the machine, which held no commit, was deleted on 2026-11-11:
    `claude/premise-review-operations-d2dda3`,
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
    `claude/quizzical-franklin-e9c4d2`, cut at `fcd2494`. A bug of `docs/bugs.md` names the commit of its failing test on one of
    them. A session elsewhere writes that test again from the bug's sequence and the report in
    [`reviews.md`](decisions/reviews.md).

- **A door that changes between two releases of the library, to verify and fix.** A release of the library that adds
  an RPC to the door of a program on Cluster, or changes a payload, is not caught by the guard of the version
  ([decision 0159](decisions/archive/0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md)).
  A runner of the older release that still holds a shard is given the newer request, and Cluster answers a payload
  it cannot decode with a defect and stores it, so the request is lost in silence. The spike
  [`spikes/cluster-older-runner-answers-a-newer-request.test.ts`](../spikes/cluster-older-runner-answers-a-newer-request.test.ts)
  sees Cluster's answer. No test runs a rolling deploy of two releases of the library. It begins with a test of `src/cluster.test.ts` with two runners whose doors differ, and its fix
  is a choice of the design, which the [open question](open-questions.md#running) A door that changes between two
  releases of the library lists.

- **What a deploy may change of a program, against what is stored.** This step is the rule of family A of
  [`docs/bugs.md`](bugs.md). Four of the bugs the premise review found have
  one form: a deploy of a newer version changes a piece of the program, while what is stored was written by the
  older version. They are the delivery of an operation (bug 1), the way the sender is written (bug 5), a droppable
  operation a resume drops (bug 7), and the door (the step above). The review reads one pair of notes at a time, so
  it finds such a case only where one pair holds it. This step lists every piece a program declares: the sender,
  the flags, the keys and their parameters, each operation and its delivery, the timers, the internal messages, the
  rejections, the projection, the children and the door. For each piece and each way a deploy changes it, it asks
  what happens to an entity stored, loaded, suspended or draining, on one process and on Cluster, with a deploy of
  a newer version and of an older one. Each case gets a test that shows it holds, or a sentence that says why it
  holds and cites the note that decides it. A case that fails is a bug of this step, fixed by a note with its test,
  as the bugs of `docs/bugs.md` are. The cases the steps above already hold cite them. A `reindex` an operator runs on the older runner of a rolling deploy writes the older
  projection over the row the newer runner wrote, since the entity's state and version did not change, which is bug
  77 of `docs/bugs.md`, reproduced. The table is written in `docs/`, so that a
  piece a later note adds to a program adds its row. The code that keeps the table is one place, where an
  activation by a program compares each piece stored with the program: the same, changed in a way the table
  allows, which it converts, or changed otherwise, which suspends the entity with a defect that names the piece.

- **The tests of a contract on every backend.** It is the fourth kind of test of `AGENTS.md`, and the rule of
  families C and D of [`docs/bugs.md`](bugs.md). One set of requests runs alike on each way the library runs, and the
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

- **Code written by hand where a module of Effect does the same**, of low priority. A review of `src/` against
  the rule of [`AGENTS.md`](../AGENTS.md) on Effect's modules found four places, on 2026-11-11:
  - The lock of each entity, `holding` in `src/runtime/process.ts`, keeps a `Map` of a semaphore and a count of its
    users, and deletes the entry when the last user lets go. `RcMap`, which is stable, shares a resource by key and
    releases it when the last scope closes. The comment does not say what `RcMap` does not do. A seed of the
    test `callers of an unloaded entity build one machine for it` is pinned against a bug of this count. A move to
    `RcMap` adds and moves yields, so it finds the pinned seeds again, as `AGENTS.md` says, and passes
    `bun run test:release`.
  - The order of use of the entities, `recent` in `src/runtime/process.ts` and `admit` in `src/runtime/loop.ts`, is
    written by hand for a reason: `Cache` evicts by itself, and the runtime never unloads a busy entity or one whose
    timer is due. `RcMap` refuses a new key at its capacity rather than evicting. The comment says neither.
  - About fifteen guards are written as `typeof value === 'object' && value !== null`, with `!Array.isArray(value)`
    or `TypeId in value`, in `src/machine.ts`, `src/program.ts`, `src/runtime.ts`, `src/storage/held.ts` and
    `src/storage/projections.ts`. `Predicate.isObject` and `Predicate.hasProperty` are those guards.
  - The comparisons of keys, `(a < b ? -1 : a > b ? 1 : 0)` in `src/machine.ts` and `src/program.ts`, are
    `Order.String`, and the sort by incarnation in `src/runtime.ts` is `Order.mapInput(Order.Number, …)`.
