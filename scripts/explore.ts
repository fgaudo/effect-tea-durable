/**
 * Runs every seed of the explored tests from a random first seed, again and again, until a run fails or the script is
 * stopped. `bun test` and the release start from seed 0 and replay the same schedules each time; this tries new ones.
 * Each round prints its first seed. A failure names the seed that failed, which `SEED=<seed>` runs after the pinned ones.
 *
 * Usage: `bun run test:explore [arguments of bun test]`, such as `-t <test>`. It runs the tests of the runtime, where the
 * explored tests are: `src/runtime.test.ts` and the test files of `src/runtime/` (decision 0241). Ctrl+C stops the
 * script with the run under way.
 */
const args = ['src/runtime.test.ts', 'src/runtime/', ...Bun.argv.slice(2)]

for (let round = 1;; round++) {
  // Below 2^31, less the 2,000 seeds a run takes, so that every seed of the run is a distinct 32-bit integer.
  const first = Math.floor(Math.random() * (2 ** 31 - 2_000))
  console.log(`test:explore: round ${round}, first seed ${first}`)
  const run = Bun.spawnSync(['bun', 'test', ...args], {
    env: { ...Bun.env, SCHEDULES: 'all', SEED: String(first) },
    stdio: ['inherit', 'inherit', 'inherit'],
  })
  if (!run.success) {
    // bun test also exits with 1 when `-t` matches no test: the output above says which it was.
    console.log(`test:explore: round ${round} ended with ${run.signalCode ?? run.exitCode}, from first seed ${first}`)
    console.log('A failed seed replays with: SEED=<seed> bun test <file of the test> -t "<test>"')
    process.exit(run.exitCode ?? 1)
  }
}
