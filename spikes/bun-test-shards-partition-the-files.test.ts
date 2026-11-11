/**
 * What decision 0242 rests on, at Bun 1.4.4: the shards of `bun test --shard=i/n`, for `i` from 1 to `n`, run between
 * them every file the whole run runs, each file in one shard alone. `bun test --help` says a shard runs "a subset of
 * test files", and says nothing of the subsets together. Each run here names a test no file holds, so that it loads
 * every file of its shard and runs none, and its JUnit report lists the files it loaded. The whole run is that of
 * `bun test`, which runs no spike (decision 0250), so the spike checks it by a file of `src/`.
 */
import { expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = join(import.meta.dir, '..')

/** The files a run of `bun test` with `args` loads, as its JUnit report lists them. */
const filesOf = (args: ReadonlyArray<string>) => {
  const directory = mkdtempSync(join(tmpdir(), 'effect-tea-persistent-shard-'))
  try {
    const report = join(directory, 'report.xml')
    Bun.spawnSync(
      ['bun', 'test', ...args, '-t', 'a name that no test of the repository holds', '--reporter=junit', `--reporter-outfile=${report}`],
      { cwd: root, stdout: 'ignore', stderr: 'ignore' },
    )
    return [...readFileSync(report, 'utf8').matchAll(/<testsuite name="([^"]+\.ts)"/g)].map(([, file]) => file!)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test('the shards of a division run every file of the whole run, each in one shard', () => {
  const whole = filesOf([])
  expect(whole).toContain(join('src', 'machine.test.ts'))
  const shards = [1, 2, 3, 4].map((shard) => filesOf([`--shard=${shard}/4`]))
  for (const files of shards) expect(files.length).toBeGreaterThan(0)
  expect(shards.flat().sort()).toEqual([...whole].sort())
}, 60_000)
