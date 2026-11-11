# 0250. `bun test` holds its budget by samples, and the spikes and the tests on a clock that is real run on their own

**Status:** accepted, 2026-11-11, with the step The suite within its budget, which it was made for. It changes
[decision 0242](0242-the-ci-deals-the-files-of-the-tests-among-four-jobs.md), whose spike of the shards now counts
the files of `bun test` without the spikes.

## Context

`AGENTS.md` asks that `bun test` run within two minutes on one machine, and that no test of it run over two
seconds. On 2026-11-11, on the maintainer's machine, it ran 779 tests in 283 s, and 37 of them took over two
seconds. Bun's JUnit reporter gave each test's time:

| Part of the suite | Time |
| --- | --- |
| `src/cluster.test.ts`, 18 of its tests over two seconds | 97 s |
| `src/runtime.test.ts`, 40 s of it one test | 49 s |
| `src/storage.test.ts` | 31 s |
| The spikes | 30 s |
| `src/runtime/loop.test.ts` | 17 s |
| `src/fixtures.property.test.ts` | 17 s |
| `examples/server/server.test.ts`, 10 s of it one test | 12 s |
| `src/dialects.test.ts`, one property test | 7 s |

The slowest test, `a deploy interrupted anywhere keeps its name and its waker, or stops what it started`, spent
1.3 s on its 100 seeds of PCT and 33 s on four schedules under `bound` 1. Those four ran 860 to 1 303 deviations each,
7 to 11 s each. Three more schedules under `bound` 1 ran 1.1 s, 2.6 s and 3.3 s. `AGENTS.md` said that a schedule
under `bound` 1 runs whole in every run, so a sample of the seeds of PCT could not hold the budget alone.

The tests of Cluster run on a clock that is real: their runners beat, poll and hold leases of seconds on it
([decision 0242](0242-the-ci-deals-the-files-of-the-tests-among-four-jobs.md)). Each has one case, so `SCHEDULES`
cannot sample them. So does the test of the server example that kills a runner and waits for its lease. One test of
Cluster timed out once in the whole run, and passed alone. The [open question](../open-questions.md) of that test
holds it.

The maintainer chose the three rules below on 2026-11-11, after a second opinion from another model.

## Decision

- **A schedule under `bound` 1 runs one deviation in twenty under `bun test`, and every deviation under the release.**
  The deviations are listed in the order of the run, a pick or a preemption at each decision of the window, and a run
  other than the release runs the first and each twentieth after it. The sample is taken over the deviations, not
  over the decisions, so that a decision of many choices is not left out whole. A deviation a run once failed on is
  pinned as `{ decision, choice }`, under `pinned`, and runs in every run, as a seed of PCT is pinned. The slowest test
  is divided into a test of its seeds of PCT and one for each count of yields, in a `describe` that keeps its name,
  since notes cite it.
- **A test that samples its cases reads how many from `SCHEDULES`, and runs fewer under `bun test`.** The property
  tests of the fixtures, of the dialects and of the storage's queries run 8 cases, where they ran 20 to 40. The test of
  the database that ends where the machine ends runs 200 of its 500. The test of a launch on a table under the name
  of the runtime's tries one name in four. The release runs every case it ran before.
- **A test of one case that runs over two seconds is declared with `slow`.** `slow`, in
  [`src/runtime.test_shared.ts`](../../src/runtime.test_shared.ts), is `test` under `SCHEDULES=all` and `test.skip`
  otherwise, so a test reads `SCHEDULES` for how many cases it runs, none included. `bun test` skips such a test, and
  `bun run test:release` runs it. They are fifteen tests of Cluster, the test of a process that holds ten thousand
  entities, and the two tests of the server example that wait for a runner's lease. The example declares a `slow` of
  its own, since an example imports nothing of `src/`.
- **`bun run test:slow` runs, under `SCHEDULES=all`, the files whose tests wait on a clock that is real.** They are
  `src/cluster.test.ts` and `examples/server/server.test.ts`. A job of the CI runs it on every push, so that no test of
  Cluster waits for a release to run. The test of a process that holds ten thousand entities runs under the release
  alone, since its file is the loop's, whose explored tests run every seed under `SCHEDULES=all`.
- **A sleep before a positive assertion is a wait for the outcome.** Two tests of Cluster slept 5 s and then read the
  answer of a retry. Each now joins the retry under a timeout of 5 s, and ends once the answer comes. A sleep before a
  negative assertion stays as it was, since what it checks is that nothing comes within its time.
- **The spikes leave `bun test`.** `bunfig.toml` ignores `spikes/**`, which also drops a spike named by its path.
  `bun run test:spikes` runs them, with `--path-ignore-patterns` set to `node_modules/**`, which replaces the pattern of
  `bunfig.toml`. A job of the CI runs it on every push, as at each move of Effect's or Bun's version. `test:postgres`
  and the step of the full volume name their spikes with the same flag. `scripts/mutate.ts` copies `bunfig.toml`,
  and no longer copies the spikes, since `bun test` runs none, so a mutation of a spike would tell nothing.
- **The test of the workflow's form checks the two jobs.** `a job runs every spike, and one every test on a clock
  that is real, which bun test leaves out`, in [`src/form.test.ts`](../../src/form.test.ts), reads `ci.yml`,
  `package.json` and `bunfig.toml`.

With these rules, `bun test` ran 682 tests in 82 s on the maintainer's machine, 29 of them skipped. One test of
Cluster took 2.7 s in that run and 1.8 s in a run of its file alone, and is declared `slow` too. The slowest test
left took 1.8 s. `src/cluster.test.ts` took 23 s and `src/storage.test.ts` 19 s.

## What it rests on

- A pattern of `pathIgnorePatterns` under `[test]` in `bunfig.toml` keeps the files it matches out of `bun test`,
  even a file named by its path, and `--path-ignore-patterns` on the command line replaces it. `bun test --help` at
  Bun 1.4.4 documents the flag, and says nothing of how it meets `bunfig.toml`. Both were seen by runs at 1.4.4, and
  the test of the workflow's form checks the configuration, not Bun's behaviour. If Bun merged the two patterns,
  `bun run test:spikes` would run no spike, and its job would fail on finding no test.
- A test over two seconds on the maintainer's machine stays over it on GitHub's runners, and one under it may not.
  The runners are slower ([decision 0242](0242-the-ci-deals-the-files-of-the-tests-among-four-jobs.md)), so the
  budget is measured on the maintainer's machine alone. Its margin is the time each test takes there. Some tests of
  Cluster left in `bun test` take 1.8 to 1.9 s, so a slower machine may put them over the limit. This is measured, and
  a test that crosses it is declared `slow`.
- A deviation of a schedule under `bound` 1 that only the release runs is still run before a release, and a bug it
  finds is pinned. This is a rule of work: `bun run test:release` passes before a step that changes the runtime is
  taken. `scripts/mutate.ts` kills a mutation that only such a deviation holds in its second pass, under
  `SCHEDULES=all`.
- A sample of one deviation in twenty finds most bugs a whole sweep finds. This is only reasoned. A bug that a single
  deviation holds is found by `bun test` with a chance of one in twenty, and by the release always.
- Joining a retry under a timeout of 5 s checks what a sleep of 5 s and a reading of its exit checked. This is
  reasoned: the test fails in both forms when no answer comes within 5 s, and the join fails, as the reading did, on
  an answer other than the one expected.
