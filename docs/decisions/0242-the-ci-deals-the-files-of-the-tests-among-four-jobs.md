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
- **Every file that imports [`src/storage.test_databases.ts`](../../src/storage.test_databases.ts) makes the first
  database of PGlite in a `beforeAll`, with a timeout of its own of 60 s.** The tests copy that database, and before
  this note the first test of a run to use PostgreSQL made it, within its own timeout of 5 s. Made with nothing else
  running, it takes 2.6 s. A run of one process makes it once, so one test paid for it. A shard runs in a process
  of its own, and under `--parallel` each file runs in a global of its own, so each makes it again. The test that
  timed out under 24 workers was the first of its file, making that database. The module declares the hook, so that
  a new file of the tests needs no line of its own. A file that never uses PostgreSQL makes the database all the
  same under `--parallel`. Where `POSTGRES_URL` names a server, the hook does nothing.
- **`bun test` stays one run, in one process, on one machine.** `scripts/mutate.ts` runs many runs of `bun test` at
  once, and reads a test that fails only under load as uncertain. Workers inside each of those runs would add load.
  The tests on Cluster run on a clock that is real, with leases of seconds, and load is what they fail under first.
  A run in one process also gives the times this note measured.
- **`bun run test:parallel` runs the suite under `--parallel=8`, for a quicker run while a change is under way.**
  Eight workers stay under the twelve cores of the maintainer's machine, and ran the suite in 97 s with every test
  green. With the hook above, 24 workers still failed four other tests on their timeout, two spikes of Effect's
  scheduler, the spike of a role of PGlite and a test of the runtime, which each keep a core busy. Past the cores, the
  load alone slows a test past 5 s. `src/cluster.test.ts` alone waits 57 s, so more workers would gain little anyway.
  A commit still passes `bun test`.

## What it rests on

- `bun test --shard=i/n` runs a subset of the files, and the `n` subsets run between them every file of the whole
  run, each once. Bun's help at 1.4.2 documents the flag. It does not say that the subsets partition the files.
  The spike `spikes/bun-test-shards-partition-the-files.test.ts` tests that, at the version pinned.
- Bun deals the files to the shards in turn, over their sorted paths. This was seen by listing the four shards at
  1.4.2, and is documented nowhere. If it changes, only the balance of the jobs changes, since the spike holds the
  partition.
- A job of a matrix runs on its own runner, and the workflow fails when one job fails. This is documented by GitHub
  Actions. `fail-fast: false` lets the other shards finish, so that a run names every test that failed.
- A `beforeAll` that a module declares at its top level has run before the first test of every file that imports the
  module, both in a run of one process and under `--parallel`. The JSDoc of `beforeAll` at 1.4.2 says the hook runs
  once before all the tests, and says nothing of a hook a module declares for the files that import it. The spike
  [`spikes/bun-before-all-of-an-imported-module.test.ts`](../../spikes/bun-before-all-of-an-imported-module.test.ts)
  tests it in both modes.
- Splitting the tests among jobs changes no test's result, since each job runs its files in one process as before.
  This is only reasoned. The run on the branch checks it.
