# 0254. A check of the project runs against the case it refuses

**Status:** accepted, 2026-11-11, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the rule of its family G. The maintainer chose this rule on 2026-11-11, from three
proposed, in the form a Fable 5.2 agent advised. It changes
[decision 0241](0241-a-group-of-modules-lies-in-a-folder-entered-by-the-module-of-its-name.md), whose check now refuses
a role that `bun test` runs, [decision 0242](0242-the-ci-deals-the-files-of-the-tests-among-four-jobs.md), whose check
now reads every key of a job, [decision 0212](0212-the-property-tests-of-the-fixtures-derive-their-values-from-the-schemas.md),
whose property now reads its fixtures from the disk, and
[decision 0104](archive/0104-the-runtimes-tests-choose-where-fibers-yield.md), whose explored tests now keep a pinned
seed that a job runs against the rule taken out.

## Context

A check of the project says what it keeps, and passes a case it does not read. The premise review found eight such
checks, family G of the roadmap:

- `bun test` runs a file named `<module>.test_<role>.ts` whose role ends in `_test` or `_spec`, and the check of
  decision 0241 reads such a file as one only tests import. This is bug 46.
- The test of the workflow's form reads the matrix's `shard` and the steps' `run` alone, so a job of the tests given
  `if: false`, `continue-on-error: true` or an `exclude` passes it. This is bug 47.
- `bun run test:postgres` lists its files by name, and leaves out several files that run on the CI's server. This is
  bug 48.
- The interleaving of [decision 0067](archive/0067-each-entity-is-held-by-its-own-lock.md) is found by no seed of the
  100 that `bun test` runs, and no seed is pinned for it. This is bug 43. The other interleavings that no pinned seed
  finds may have lost their seeds in the same way. This is bug 52.
- The property of the fixtures imports its fixtures by name, so a fixture added gets no property. This is bug 53.
- The property of the fixtures may give the runtime and the rehearsal two request ids that one takes for a retry and
  the other does not. This is bug 83, only reasoned.
- A move of Effect's version by the rule of `AGENTS.md` leaves the drivers of PostgreSQL at the version it leaves.
  This is bug 88.

## Decision

The rule has two parts that `bun test` runs, and one part that a job of the CI runs.

- **A check is a function of what it reads, and a test gives it a sample of each case it refuses.** The test of the
  check finds the sample refused. A check that reads a file of the repository reads it through that function. This
  holds bugs 46, 47 and 88.
  - For bug 46, the check of decision 0241 refuses a file only tests import whose name `bun test` runs. Bun's
    patterns are those of its documentation at the version pinned, in `node_modules/bun-types/docs/test/discovery.mdx`.
  - For bug 47, the check of the workflow's form reads each job through a list of the keys it allows, for the job,
    its strategy, its matrix and its steps. A key not in the list fails the check. A list of keys refused would pass
    the next key no one thought of. The checks of the jobs of the spikes, of the slow tests and of PostgreSQL read
    their jobs the same way.
  - For bug 88, a check of `package.json` refuses an `@effect/` package at a version other than `effect`'s.
    `AGENTS.md` names the drivers of PostgreSQL among the packages a move pins, and `scripts/compare-docs.ts`
    compares them.
- **A list of files that a check or a script holds is read from the disk, or checked against it.** This holds bugs 53
  and 48.
  - For bug 53, the property of the fixtures reads `src/fixtures/`. A fixture with no entry in the property fails it.
  - For bug 48, a check refuses a file of the tests that imports `src/storage.test_databases.ts` and that
    `bun run test:postgres` does not run.
- **An explored test whose comment names an interleaving keeps a pinned seed that finds it, and a job of the CI runs
  that seed against the rule taken out.** The mutation that takes the rule out is committed beside the test. The job
  applies each mutation to a copy, runs its test under its pinned seed alone, and fails if the test passes. A
  mutation whose text the code no longer holds fails the job too. So a change that moves a yield and loses a pinned
  seed's interleaving fails the job, and the seed is found again by the procedure of `AGENTS.md`. This holds bugs 43
  and 52. It is [`scripts/mutate.ts`](../../scripts/mutate.ts) run on the pinned seeds alone, on every push.
- **An interleaving that no seed of 2,000 finds is held otherwise.** Its test runs under `bound` 1, which pins a
  deviation, or its depth is raised, or it goes in `docs/open-questions.md` as a rule no test holds.
- **Bug 83 is verified first.** It gets a fix of its own if a test reproduces it, and leaves the roadmap if a reading
  rules it out.

## What is done

The parts go in this order: bug 46, bug 47, bug 88, bug 53, bug 48, then the job of the pinned seeds with bug 43,
then bug 52 test by test, then bug 83.

- Bug 46 is done. `sharedFilesRun` of `src/form.test.ts` refuses a file only tests import whose name `bun test` runs,
  and `bun test runs no file of src or of the examples that only tests import` runs it on the repository. The test
  `a file only tests import whose role ends in _test or _spec is found, and one of another role passes` gives it its
  samples. The test `bun test runs the files that runByBunTest names, and no other` runs Bun on a folder of samples,
  and fails if Bun's patterns change. Both fail on a pattern without `_test` and `_spec`. The test of the branch
  `claude/premise-review-project-17a123` asked of `ofTheTests` what no pattern can give, and is replaced by these.

- Bug 47 is done, wider than the roadmap says. `workflowRefused` of `src/form.test.ts` reads the whole of `ci.yml`
  through `keysRead`, the keys it allows for the workflow, a job, a strategy, a matrix and a step. It refuses any
  other key, a job's `if` other than the release's, a trigger missing or filtered, a division that leaves a shard
  out, and a job of the spikes, of the slow tests or of PostgreSQL that does not run its script. The test
  `a job of the workflow that may run nothing, ignore its failure or leave a shard out is found` gives it a sample of
  each case, made from the workflow of the repository.

- Bug 88 is done. `effectPackagesApart` of `src/form.test.ts` refuses an `@effect/` package at a version other than
  `effect`'s, and `effect` at a range. The test `every package of Effect is pinned at the version of effect` runs it
  on `package.json`, and `a package of Effect at a version other than effect’s is found, and effect at a range` gives
  it its samples. `AGENTS.md` says a move pins every `@effect/` package. `scripts/compare-docs.ts` compares the JSDoc
  of `make` and `layer` of both drivers, and compares whole the sources a premise of decisions 0157 and 0222 was read
  in: `PgTypes.ts` and `internal/sqlError.ts` of `@effect/sql-pg`, and `PgliteClient.ts`. Its run from 4.1.3 to
  4.1.3 printed every line `same`, on 2026-11-11.

- Bug 53 is done. `src/fixtures.property.test.ts` imports every module of `src/fixtures/` and takes each program it
  exports, and `needs` gives, by the program's name, what the property needs of it. The test `every program of
  src/fixtures is given what the property needs of it` fails on a program with no entry, and on two programs of one
  name. Both were seen on 2026-11-11 with a copy of `inventory.ts` under another name, which also got the property.

- Bug 48 is done in the repository, wider than the roadmap says. `postgresMissed` of `src/form.test.ts` finds the
  files of the tests that reach `src/storage.test_databases.ts` through their imports and that `bun run test:postgres`
  does not run, by the filters of Bun's documentation. The test `the job of PostgreSQL runs every file of the tests
  that reaches the databases` found the four files the agent named. `test:postgres` now runs them, and the test
  `a file of the tests that reaches the databases and that the run does not take is found` gives the check its
  samples. The four files passed on the CI's server in the job `postgres` of the push of `ad78239`, on
  2026-11-11, where the job `pins` passed too.

- The job of the pinned seeds is done, with bug 43. `src/runtime.test_pins.ts` lists a pin for each explored test
  with a seed pinned: the mutation that takes its rule out, the test's file and its name. `bun run test:pins`, which
  `scripts/pins.ts` is, runs each test under `SCHEDULES=pinned`, where `share` of `src/runtime.test_shared.ts` is 0 and
  a test runs its pinned seeds or deviations alone. The test must pass on the code and fail on the mutation. The job
  `pins` of `ci.yml` runs it, and `workflowRefused` asks for that job. The test `every explored test that pins a seed
  has a pin that runs it against its rule, and every pin such a test`, of `src/form.test.ts`, runs `pinsUnmatched`,
  and `an explored test that pins a seed with no pin, and a pin with no such test, are found` gives it its samples.
  - Bug 43: seed 661 is pinned in `callers of an unloaded entity build one machine for it`. With `if (lock.users ===
    0)` taken out of `holding` in `src/runtime/process.ts`, seed 661 alone fails the test, and `bun test` without it
    passed, on 2026-11-11 at `854f5c8`. The test's comment no longer gives a count of seeds.
  - The one seed pinned before, 1031955209 in `settled never returns between a crash and the activation its due timer
    brings`, no longer found its interleaving: with `leave` of `src/runtime/loop.ts` split in two steps, the test
    passed under that seed alone. So bug 52 held of the one pin it could be checked on. Under `SCHEDULES=all`, seed 44
    fails on that form, and is pinned in its place.
  - An explored test's failure did not name its seed, though `AGENTS.md` and `scripts/explore.ts` said it did. The
    seed was a field of the object `expect` compared, and the diff of `expect` leaves out a field equal on both sides.
    `named` of `src/runtime.test_shared.ts` now puts the seed, or the deviation, before the message of the failure.
  - `AGENTS.md` said `SEED=<seed> bun test` runs that seed first. It runs the pinned seeds first, and now says so.

- Bug 83 is ruled out by a reading, on 2026-11-11. `src/fixtures.property.test.ts` draws a send's request id from
  `r-1`, `r-2`, `r-3` and `null`. The runtime is given `new-<at>` for a send drawn `null`, distinct for each send.
  The rehearsal is given no id for such a send, and draws `request-<k>`, distinct for each draw, skipping any id the
  test named (`send` of `src/rehearse.ts`). No id of one of the three sets can be an id of another, so the runtime and
  the rehearsal take the same sends for retries. The bug stays in the roadmap as one line, verified false, since the
  documents cite bugs by their number.

Bug 52 is done, test by test, on 2026-11-11. Each of the explored tests whose comment names an interleaving and that
pinned no seed got a pin: the mutation its comment names, then the seeds run on the mutation until one failed, then
that seed pinned. There are 25 calls of `explored` in `src/runtime.test.ts` and `src/runtime/`, and two
pinned a seed when the part began. A seed is looked for under `SCHEDULES=all` from seed 0, so that the first seed
that fails is pinned. The tests pinned, each with its pin in `src/runtime.test_pins.ts`, and what the part found:

- `a sender answered Suspended is woken by the resumption`, of `src/runtime/callers.test.ts`: seed 29, against the
  registration of decision 0063 moved after the send.
- `settled never returns while the waker rests from a reading another entity left during`, of
  `src/runtime/waker.test.ts`: the deviation `{ decision: 182, choice: 1 }`, against the look for a poke and the
  clearing of the waker's flag of decision 0068 split in two steps.
- `a reading interrupted as it begins its wait leaves the watcher still`, of `src/runtime/readings.test.ts`: the
  deviation `{ decision: 637, choice: 1 }`, against the count of decision 0163 raised before an `ensuring`.
- `a reading is woken by a commit of another runner between its page and its wait`, of the same file: seed 0, against
  the watcher's version read anew as a wait begins.
- `scripts/pins.ts` matched a test's name from its start, and Bun matches the names of the enclosing `describe`s
  before it. So a pin of a test inside a `describe` ran no test. The pattern now lets the name follow a space.
- `pinsUnmatched` of `src/form.test.ts` read a test only at the start of a line, so a test inside a `describe` that
  pinned a seed needed no pin. It now reads a test after its indentation, and an explored test where a line begins
  with `explored(`, so that its own samples, in strings, are no tests. A sample inside a `describe` holds it.
- Of `src/runtime.test.ts`: `an inspection reads one snapshot`, seed 3, against the readings of decision 0185 made
  outside one snapshot; `the drain waits for the completion of an at-most-once operation`, seed 91, against the
  signal of decision 0119 taken in a step after the look; and `a consumer that waits is given the row a step commits
  while it reads`, seed 27, against the signal of decision 0142 taken after the reading.
- Of `src/runtime/loop.test.ts`: `a process over its capacity unloads its least recently used idle entity`, seed 0,
  against the count of decision 0109 raised after the entity leaves; `callers of two unloaded entities over a
  capacity of one are both answered`, seed 91, against the caller's event of decision 0079 offered after the lock
  is let go; `a caller interrupted anywhere as it activates its entity leaves the process able to settle`, seed 5,
  against the count of what runs detached raised outside the uninterruptible step; `a caller interrupted anywhere as
  it sends leaves its entity’s bound whole`, the deviation `{ decision: 370, choice: 1 }`, against a yield between
  the permit and the offer of decision 0147 outside one region; `two callers of an entity not loaded build one
  machine for it`, seed 6, against the lock of decision 0067 held by no one; and `an entity whose wait runs out as an
  event arrives waits again from the event`, seed 9, against the end of decision 0116 an earlier wait put in the
  queue taken for the next wait's.
- `entities woken past the capacity each fire their timer and leave once`, of `src/runtime/loop.test.ts`, passes with
  the timers due taken out of `spare` (decision 0078), under every seed of 2,000, at depth 10, and under every
  deviation of `bound` 1. So no test holds that rule, and it is the [open question](../open-questions.md#running) A
  timer due, which no test of the capacity reaches.
- `a message that arrives as the wait of its entity runs out is handled` pins no seed, as its comment says: the form
  it was written against is a race of Effect 4.1.2, which a spike watches.
- The other explored tests name no interleaving: their comments say only that each schedule moves the points where
  one fiber runs between the steps of another. They are `the process settles and a stored timer wakes its entity`,
  `entities entering at once tell no more to leave than the process holds too many` and `two creations of one entity
  at once build one machine` of `src/runtime/loop.test.ts`, and `reindex leaves no row a step has moved past`, `a name
  is deployed once in a process, however two deploys of it interleave`, the five tests of a deploy interrupted after
  a count of yields, and `a second runtime on one client dies as it launches` of `src/runtime.test.ts`.

Every part of family G is done, and the family is taken with this note. `bun run test:pins` held its 15 pins, and
`bun test` passed, on 2026-11-11 on the maintainer's machine.

## What it rests on

- That `bun test` runs the files whose names match the patterns of its documentation: **documented** in
  `node_modules/bun-types/docs/test/discovery.mdx`, at Bun 1.4.4.
- That a mutation and a seed pinned stay together across a change: **tested** by `bun run test:pins`, which the job
  `pins` of `ci.yml` runs on every push. A change that moves a yield draws another schedule from each seed, and the
  job fails on a pin whose test then passes on its mutation.
- That `bun test -t` matches the names of the enclosing `describe`s and the test's, joined by spaces: **seen** on
  2026-11-11 at Bun 1.4.4, where a pattern anchored at the test's name matched no test inside a `describe`.
  `scripts/pins.ts` lets the name follow a space, and fails a pin that runs no test.

## Findings of the reading that chose the rule

The Fable 5.2 agent that advised the rule found these, by reading alone. Each was checked by the part of What is done
it belongs to:

- Bug 47 is wider than the roadmap says. The checks of the jobs of the spikes and of the slow tests use `toContain`
  on `run`, and have the same hole. The job of PostgreSQL in `ci.yml` has no check of its form.
- Bug 48 is wider than the roadmap says. `test:postgres` leaves out `src/cluster.test.ts`,
  `src/fixtures.property.test.ts`, `src/log.property.test.ts` and `src/rehearse.property.test.ts`.
- `test:slow` is a list of files by name too.
- Bug 83 may not exist on the runtime's side. `RequestId` of `src/fixtures.property.test.ts` is `r-1`, `r-2`, `r-3` or
  `null`, so it cannot derive `new-<k>`, and the property always passes an id to the runtime. A collision may remain
  on the rehearsal's side, for a send with no id, which the agent did not read.
- The comment of `callers of an unloaded entity build one machine for it`, in `src/runtime/callers.test.ts`, still says
  67 seeds. A comment names the mutation its pinned seed is checked against, and not a count of seeds.
- Once seeds are pinned, `SEED=<n> bun test` runs the pinned seeds before `<n>`, though `AGENTS.md` says it runs `<n>`
  first.

## Alternatives

- **`scripts/mutate.ts` takes out every check of the project, the workflow and the scripts of `package.json`
  among them.** It is the most uniform, but runs only in a review, every fifteen notes, which is too late for a check
  that drifts at a push.
- **A fix of its own for each bug.** It fixes the eight, and leaves the next check of this kind unguarded.
- **A list of keys refused for the workflow.** It would pass `include`, an `if` on a step, and every key added later.
