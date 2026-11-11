# 0254. A check of the project runs against the case it refuses

**Status:** proposed, 2026-11-11, with the step The bugs the premise review found, fixed by family, of the
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

Nothing yet. The parts go in this order: bug 46, bug 47, bug 88, bug 53, bug 48, then the job of the pinned seeds
with bug 43, then bug 52 test by test, then bug 83.

## What it rests on

- That `bun test` runs the files whose names match the patterns of its documentation: **documented** in
  `node_modules/bun-types/docs/test/discovery.mdx`, at Bun 1.4.4.
- That a mutation and a seed pinned stay together across a change: **only reasoned** until the job exists. A change
  that moves a yield draws another schedule from each seed.

## Findings of the reading that chose the rule

The Fable 5.2 agent that advised the rule found these, by reading alone, and none is checked yet:

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
