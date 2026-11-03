# 0118. The explored tests run all their seeds at a release

**Status:** accepted, 2026-11-03. Changes how many seeds
[decision 0104](archive/0104-the-runtimes-tests-choose-where-fibers-yield.md) runs in each run of the tests.

## Context

Decision 0104 runs the runtime's tests under PCT, at depth 4 over 2,000 seeds. A run of the whole suite took about
150 seconds, and 139 of them were [`src/runtime.test.ts`](../../src/runtime.test.ts). Seventeen tests under
`explored` took almost all of it: each runs its scenario once per seed, at 1 to 6 milliseconds a run, and one at 67.
Setting up the database and the clock is about half a millisecond of each run, so the scenario itself is the cost.

PCT bounds what one run finds: a bug of depth `d` with a probability of at least `1 / (n k^(d - 1))`, for `n` fibers
and `k` steps. The explored tests have 3 to 48 fibers and 79 to 3,584 steps in their window. At depth 2 that bound
is between one in 240 and one in 170,000 runs, so 2,000 seeds give no guarantee either: the bound is the worst case,
and a bug most schedules reach is found in a few runs.

## Decision

- **A run of the tests runs one seed in twenty**, from seed 0: 100 of the 2,000, and 10 of a test that asks for 200.
  `share`, in [`src/runtime.test.ts`](../../src/runtime.test.ts), cuts them.
- **A release runs them all**, with `bun run test:release`, which sets `SCHEDULES=all`. The release's step of the
  [roadmap](../roadmap.md) runs it.
- **A schedule under `bound` 1 runs whole in every run**: it is exhaustive within its bound, and a share of it would
  leave whole points of the deploy untried.

The suite runs in about 30 seconds, and 13 of them are the deploy interrupted under `bound` 1.

## What it rests on

- The seeds a run of the tests runs are the first of those the release runs, and each gives the same schedule in
  both: **reasoned**, read in [`src/testing.ts`](../../src/testing.ts), where `prioritized` draws from its seed alone.
  A failure in either names a seed that replays it in both.
- A bug that the tests found before at a seed under 2,000 is found by the release: **reasoned**, from the above.
- Most bugs of concurrency the explored tests catch are found within the first 100 seeds: **only reasoned**. Decision
  [0109](archive/0109-settled-waits-for-an-entity-unloading.md) failed at seed 0; for the other rules no count was
  taken. It goes in [`docs/open-questions.md`](../open-questions.md).

## Alternatives

- **Split the file and run `bun test --parallel`.** It keeps every seed, and the run would take as long as its
  slowest file, about 30 seconds on 24 cores. It is left for later: it moves the helpers to a module of their own, and
  `scripts/mutate.ts` runs the test file beside the one it changes first.
- **Reuse one database across runs.** It saves at most a tenth of the time, and a run could leave rows to the next.

## Consequences

- A regression that only rare schedules reach may pass a run of the tests and fail the release. Its seed replays it.
- The deploy interrupted counts its own yields as `runs % 200`, so a run of the tests tries the counts 0 to 99 and the
  release all 200.
- A review that runs `scripts/mutate.ts` sets `SCHEDULES=all`, or a mutation that only rare schedules kill survives.
