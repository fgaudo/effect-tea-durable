# 0242. The CI deals the files of the tests among four jobs, by Bun's own shards, and `bun test` stays one run

**Status:** proposed, 2026-11-10, for the step A faster run of the checks of [`docs/roadmap.md`](../roadmap.md).

## Context

`bun test` ran in 266 s on the maintainer's machine, measured on 2026-11-10 by a run with Bun's JUnit reporter.
The CI ran it in one job, after the audit and the type check and before the links and the site. The step asked
first what dominates that time, the explored tests or the tests on SQLite files. Neither does:

| Kind of test | Time |
| --- | --- |
| The tests of `src/` that are neither explored nor property tests, 41 s of them one test of a deploy interrupted anywhere | 81 s |
| The tests on Cluster and on SQLite files, nearly all in `src/cluster.test.ts` | 72 s |
| The explored tests | 62 s |
| The spikes | 22 s |
| The property tests | 17 s |
| The tests of the examples | 11 s |

Five files hold 213 s of the 266: `src/cluster.test.ts` 57 s, `src/runtime.test.ts` 52 s, `src/storage.test.ts`
41 s, `src/fixtures.property.test.ts` 24 s and `src/runtime/loop.test.ts` 19 s. `src/cluster.test.ts` mostly
waits. It ran 54 s on the clock for 9 s of the processor, since its runners beat, poll and hold leases of seconds
on a clock that is real. `src/runtime.test.ts` and `src/storage.test.ts` use more processor time than clock time.

Bun 1.4.2 divides the files of a run itself. `bun test --shard=i/n` runs the `i`-th of `n` subsets of the files.
`--timings` balances the subsets by durations measured before. `--parallel` runs the files of one run in worker
processes. On the maintainer's machine of 24 cores, `bun test --parallel` ran the suite in 90 s, and one test
failed. That test is the first of `src/runtime.test.ts` on both dialects, and it creates the first database of
PGlite. Under 24 workers at once it took 6.2 s, past Bun's default timeout of 5 s.

## Decision

- **The CI runs `bun test` in four jobs at once, each `bun test --shard=i/4`, with `i` from 1 to 4.** The job of
  the other checks runs the audit, the type check, the links and the site, and no test. Bun deals the files to the
  shards in turn, in the order of their paths. On the times measured, the four shards take 84 s, 77 s, 61 s and
  44 s, where one job took 266 s. Each job runs its files alone on its runner, as the one job ran them all, so
  that no test runs under a load it did not run under before.
- **The release's run, `bun run test:release`, is dealt among four jobs the same way.** It ran some sixteen minutes
  in one job.
- **A test of the workflow's form keeps every test in some job.** `the jobs of the tests run every shard of their
  division, and the job of the other checks runs no test`, in [`src/form.test.ts`](../../src/form.test.ts), reads
  `ci.yml`. It fails when a job's matrix of shards is not 1 to `n`, or when its command names a count other than
  `n`. The spike [`spikes/bun-test-shards-partition-the-files.test.ts`](../../spikes/bun-test-shards-partition-the-files.test.ts)
  checks what Bun adds: the four shards run between them every file of the whole run, each in one shard.
- **The division takes no timings.** A file of durations would have to be measured again and committed as the
  tests change. `src/cluster.test.ts` alone takes 57 s, so balanced shards would gain at most some 25 s over the
  84 s dealt in turn.
- **`bun test` stays one run, in one process, on one machine.** `--parallel` is not adopted. It made a test fail
  on its timeout, and `scripts/mutate.ts` reads a test that fails only under load as uncertain. A run in one process
  also gives the times this note measured.

## What it rests on

- `bun test --shard=i/n` runs a subset of the files, and the `n` subsets run between them every file of the whole
  run, each once. Bun's help at 1.4.2 documents the flag. It does not say that the subsets partition the files.
  The spike `spikes/bun-test-shards-partition-the-files.test.ts` tests that, at the version pinned.
- Bun deals the files to the shards in turn, over their sorted paths. This was seen by listing the four shards at
  1.4.2, and is documented nowhere. If it changes, only the balance of the jobs changes, since the spike holds the
  partition.
- A job of a matrix runs on its own runner, and the workflow fails when one job fails. This is documented by GitHub
  Actions. `fail-fast: false` lets the other shards finish, so that a run names every test that failed.
- Splitting the tests among jobs changes no test's result, since each job runs its files in one process as before.
  This is only reasoned. The run on the branch checks it.
