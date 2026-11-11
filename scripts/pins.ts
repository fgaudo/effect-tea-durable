/**
 * Runs each seed pinned in an explored test against the rule it holds (decision 0254), as `bun run test:pins`. For
 * each pin of `src/runtime.test_pins.ts`, the test runs under `SCHEDULES=pinned`, which runs its pinned seeds or
 * deviations alone: first on a copy of the code as it is, where it must pass, then with the pin's mutation made, where
 * it must fail. A pin whose test passes on the mutation holds its rule no more, since a change moved the schedule its
 * seed draws, and the run fails. So does a pin whose edits no longer find their text, as `check` of
 * `scripts/mutate.ts` says. One line per pin is printed, tab separated: its id, `held` or what went wrong, and the
 * seconds it took.
 *
 *     bun scripts/pins.ts [--only id,prefix,...]
 */
import { readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { type Pin, pins } from '../src/runtime.test_pins.ts'
import { check, copy, environment } from './mutate.ts'

/**
 * A pattern of `bun test -t` that matches the name whole. Bun matches the full name, the names of the enclosing
 * `describe`s and the test's joined by spaces, so the name may follow a space.
 */
const exactly = (name: string) => `(^| )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`

/** Runs the pin's test under its pinned schedules alone, and gives whether it passed, and how many tests ran. */
const tested = async (at: string, pin: Pin) => {
  const child = Bun.spawn(['bun', 'test', pin.test, '-t', exactly(pin.name)], {
    cwd: at,
    env: { ...environment('some'), SCHEDULES: 'pinned' },
    stdout: 'pipe',
    stderr: 'pipe',
    timeout: 600_000,
  })
  const [out, err] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()])
  const output = `${err}${out}`
  const count = (word: string) => Number(output.match(new RegExp(`^\\s*(\\d+) ${word}$`, 'm'))?.[1] ?? 0)
  return { passed: (await child.exited) === 0, ran: count('pass') + count('fail') }
}

/** What the pin gives: `held`, or what went wrong. */
export const held = async (at: string, pin: Pin): Promise<string> => {
  const before = await tested(at, pin)
  if (before.ran !== 1) return `ran ${before.ran} tests, not one`
  if (!before.passed) return 'fails on the code as it is'
  const path = join(at, pin.file)
  const original = readFileSync(path, 'utf8')
  const crlf = original.includes('\r\n')
  let changed = original.replaceAll('\r\n', '\n')
  for (const [find, replace] of pin.edits) changed = changed.replace(find, () => replace)
  writeFileSync(path, crlf ? changed.replaceAll('\n', '\r\n') : changed)
  try {
    const after = await tested(at, pin)
    return after.passed ? 'PASSES on the mutation' : 'held'
  } finally {
    writeFileSync(path, original)
  }
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { only: { type: 'string' } } })
  const prefixes = values.only?.split(',')
  const chosen = pins.filter((pin) => prefixes?.some((prefix) => pin.id.startsWith(prefix)) ?? true)
  const unclear = check(chosen.map((pin) => ({ id: pin.id, file: pin.file, edits: pin.edits, tests: [pin.test] })))
  if (unclear.length > 0) {
    console.error(unclear.join('\n'))
    process.exit(1)
  }
  const at = copy()
  let wrong = 0
  try {
    for (const pin of chosen) {
      const started = Date.now()
      const result = await held(at, pin)
      if (result !== 'held') wrong++
      console.log([pin.id, result, `${Math.round((Date.now() - started) / 100) / 10}s`].join('\t'))
    }
  } finally {
    rmSync(at, { recursive: true, force: true })
  }
  console.log(`\n${chosen.length} pins, ${wrong} not held`)
  process.exit(wrong === 0 ? 0 : 1)
}
