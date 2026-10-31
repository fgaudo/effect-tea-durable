/**
 * Takes each rule out of the code, one at a time, and runs the tests against it: what a review of the notes does
 * to find the rules no test holds (decision 0094). A mutation is a set of exact replacements in one file. It is
 * killed when a test fails, or hangs past the timeout, and survives when every test passes.
 *
 * Each mutation runs first the tests of the file it changes, then, if those pass, the whole suite, and stops at
 * the first failure. Workers each hold a copy of the repository, and take the mutations in turn.
 *
 *     bun scripts/mutate.ts <mutations.ts> [--workers 4] [--only id,prefix,...] [--timeout 5000]
 *
 * The mutations module exports `mutations: ReadonlyArray<Mutation>`. It is written for the code a review reads,
 * and kept outside the repository: an edit stops finding its text once the code changes. One line per mutation is
 * printed, tab separated: its id, `killed` or `SURVIVED`, the tests that ran it to the end, the seconds it took,
 * and the first test that failed.
 */
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'

/** A replacement of `find`, which occurs once in the file, by `replace`. */
export type Edit = readonly [find: string, replace: string]

export type Mutation = Readonly<{
  id: string
  /** The file the edits apply to, from the root of the repository. */
  file: string
  edits: ReadonlyArray<Edit>
  /** The tests run first; by default the file's own, `x.test.ts` beside `x.ts`. */
  tests?: ReadonlyArray<string>
}>

export type Result = Readonly<{
  id: string
  killed: boolean
  /** `targeted` when the mutation's own tests killed it, `suite` when the whole suite ran. */
  by: 'targeted' | 'suite'
  seconds: number
  failed: string | null
}>

const root = resolve(import.meta.dir, '..')

/** The tests of a file: its own test file, if it has one. */
const testsOf = (mutation: Mutation): ReadonlyArray<string> =>
  mutation.tests ?? [mutation.file.replace(/\.ts$/, '.test.ts')].filter((test) => {
    try {
      readFileSync(join(root, test))
      return true
    } catch {
      return false
    }
  })

/** Text with `\n` line ends, which the edits are written with, and the line end the file had. */
const normalized = (text: string) => ({ text: text.replaceAll('\r\n', '\n'), crlf: text.includes('\r\n') })

/** Every edit must find its text exactly once: one that finds none, or several, tells nothing. */
export const check = (mutations: ReadonlyArray<Mutation>): ReadonlyArray<string> =>
  mutations.flatMap((mutation) => {
    const { text } = normalized(readFileSync(join(root, mutation.file), 'utf8'))
    return mutation.edits.flatMap(([find]) => {
      const count = text.split(find).length - 1
      return count === 1 ? [] : [`${mutation.id}: found ${count} times: ${JSON.stringify(find.slice(0, 80))}`]
    })
  })

/** A copy of the repository for one worker: its sources copied, `node_modules` linked. */
const copy = (): string => {
  const at = mkdtempSync(join(tmpdir(), 'mutate-'))
  for (const entry of ['src', 'examples', 'spikes', 'package.json', 'tsconfig.json', 'bun.lock']) {
    cpSync(join(root, entry), join(at, entry), { recursive: true })
  }
  // A junction needs no privilege on Windows, and is a plain link elsewhere.
  symlinkSync(join(root, 'node_modules'), join(at, 'node_modules'), 'junction')
  return at
}

const run = async (at: string, tests: ReadonlyArray<string>, timeout: number) => {
  const child = Bun.spawn(['bun', 'test', '--bail', '--timeout', String(timeout), ...tests], {
    cwd: at,
    stdout: 'pipe',
    stderr: 'pipe',
    // A suite that hangs past every test's own timeout is killed, and counts as failed.
    timeout: 600_000,
  })
  const [out, err] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()])
  const code = await child.exited
  return { passed: code === 0, failed: `${err}${out}`.match(/^\(fail\) (.*)$/m)?.[1] ?? null }
}

const mutate = async (at: string, mutation: Mutation, timeout: number): Promise<Result> => {
  const path = join(at, mutation.file)
  const original = readFileSync(path, 'utf8')
  const { text, crlf } = normalized(original)
  let mutated = text
  for (const [find, replace] of mutation.edits) mutated = mutated.replace(find, () => replace)
  writeFileSync(path, crlf ? mutated.replaceAll('\n', '\r\n') : mutated)
  const started = Date.now()
  try {
    const tests = testsOf(mutation)
    let by: Result['by'] = 'targeted'
    let outcome = tests.length === 0 ? { passed: true, failed: null } : await run(at, tests, timeout)
    if (outcome.passed) {
      by = 'suite'
      outcome = await run(at, [], timeout)
    }
    const seconds = Math.round((Date.now() - started) / 100) / 10
    return { id: mutation.id, killed: !outcome.passed, by, seconds, failed: outcome.failed }
  } finally {
    writeFileSync(path, original)
  }
}

/** Runs the mutations on `workers` copies at once, and gives the results in the order of the mutations. */
export const mutateAll = async (
  mutations: ReadonlyArray<Mutation>,
  options: Readonly<{ workers: number; timeout: number; each?: (result: Result) => void }>,
): Promise<ReadonlyArray<Result>> => {
  const results: Array<Result | undefined> = Array.from({ length: mutations.length })
  let next = 0
  const worker = async () => {
    const at = copy()
    try {
      while (next < mutations.length) {
        const index = next++
        const mutation = mutations[index]
        if (mutation === undefined) continue
        const result = await mutate(at, mutation, options.timeout)
        results[index] = result
        options.each?.(result)
      }
    } finally {
      rmSync(at, { recursive: true, force: true })
    }
  }
  await Promise.all(Array.from({ length: Math.min(options.workers, mutations.length) }, worker))
  return results.filter((result) => result !== undefined)
}

if (import.meta.main) {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      workers: { type: 'string', default: String(Math.max(1, Math.floor(availableParallelism() / 2))) },
      only: { type: 'string' },
      timeout: { type: 'string', default: '5000' },
    },
  })
  const [list] = positionals
  if (list === undefined) throw new Error('usage: bun scripts/mutate.ts <mutations.ts> [--workers n] [--only ids]')
  const { mutations } = (await import(resolve(list))) as { mutations: ReadonlyArray<Mutation> }
  const prefixes = values.only?.split(',')
  const chosen = mutations.filter((mutation) => prefixes?.some((prefix) => mutation.id.startsWith(prefix)) ?? true)
  const unclear = check(chosen)
  if (unclear.length > 0) {
    console.error(unclear.join('\n'))
    process.exit(1)
  }
  const started = Date.now()
  const results = await mutateAll(chosen, {
    workers: Number(values.workers),
    timeout: Number(values.timeout),
    each: (result) =>
      console.log([
        result.id,
        result.killed ? 'killed' : 'SURVIVED',
        result.by,
        `${result.seconds}s`,
        result.failed ?? '',
      ].join('\t')),
  })
  const survived = results.filter((result) => !result.killed).map((result) => result.id)
  console.log(`\n${results.length} mutations, ${survived.length} survived, in ${Math.round((Date.now() - started) / 1000)}s`)
  if (survived.length > 0) console.log(`survived: ${survived.join(',')}`)
}
