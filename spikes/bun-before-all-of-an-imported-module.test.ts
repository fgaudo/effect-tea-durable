/**
 * What decision 0242 rests on, at Bun 1.4.2: a `beforeAll` that a module declares at its top level, outside any
 * `describe`, has run before the first test of every file that imports the module. This holds in a run of one
 * process, where Bun evaluates the module once for every file, and in a run of `--parallel`, where each file
 * evaluates it again. The JSDoc of `beforeAll` says that the hook runs once, before all the tests, and says nothing
 * of a hook that a module declares for the files that import it. The spike writes a module and two test files into a
 * folder of its own, and runs `bun test` there in each mode.
 */
import { expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const prepared = `
import { beforeAll } from 'bun:test'
export const state = { ready: false }
beforeAll(async () => {
  await Bun.sleep(200)
  state.ready = true
}, 10_000)
`

/** A test file that imports the module, and fails if the hook has not run before its first test. */
const importing = `
import { expect, test } from 'bun:test'
import { state } from './prepared.ts'
test('the hook has run', () => expect(state.ready).toBe(true))
test('the hook has run, again', () => expect(state.ready).toBe(true))
`

const run = (args: ReadonlyArray<string>) => {
  const directory = mkdtempSync(join(tmpdir(), 'effect-tea-persistent-hook-'))
  try {
    writeFileSync(join(directory, 'prepared.ts'), prepared)
    writeFileSync(join(directory, 'a.test.ts'), importing)
    writeFileSync(join(directory, 'b.test.ts'), importing)
    const ran = Bun.spawnSync(['bun', 'test', ...args], { cwd: directory, stdout: 'pipe', stderr: 'pipe' })
    const output = ran.stderr.toString()
    return { exitCode: ran.exitCode, passed: Number(/(\d+) pass/.exec(output)?.[1] ?? 0) }
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

test("a module's hook has run before the first test of every file that imports it, in one process", () => {
  expect(run([])).toEqual({ exitCode: 0, passed: 4 })
}, 30_000)

test("a module's hook has run before the first test of every file that imports it, under --parallel", () => {
  expect(run(['--parallel=2'])).toEqual({ exitCode: 0, passed: 4 })
}, 30_000)
