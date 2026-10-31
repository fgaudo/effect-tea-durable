/**
 * Takes out, one at a time, the rules a review writes as mutations, and runs the tests against each (decision
 * 0094). It checks the mutations it is given and nothing else: a rule no mutation takes out is not checked by it.
 *
 * A mutation is a set of exact replacements in one file of `src/`, `examples/` or `spikes/`, and must leave code
 * that runs: one that does not is killed by the error, and tells nothing. Each mutation runs first the tests of the
 * file it changes, then, if those pass, the whole suite, and stops at the first failure; if the suite passes too,
 * the compiler checks the copy, so that a rule of the types is taken out as well. A test that hangs past the timeout
 * fails. A mutation the whole suite killed is run again alone once the others are done, since a test on real time
 * may fail under the load of the workers: one that survives then is `uncertain`.
 *
 *     bun scripts/mutate.ts <mutations.ts> [--workers 4] [--only id,prefix,...] [--timeout 5000]
 *
 * The mutations module exports `mutations: ReadonlyArray<Mutation>`. It is written for the code a review reads,
 * and kept outside the repository: an edit stops finding its text once the code changes. One line per mutation is
 * printed, tab separated: its id, `killed`, `SURVIVED` or `uncertain`, what ran it to the end — its own tests, the
 * suite or the compiler — the seconds it took, and the first test that failed. A survivor is a rule no test holds,
 * or a mutation that changes nothing, which only reading tells apart.
 */
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { availableParallelism, tmpdir } from 'node:os'
import { join, normalize, resolve } from 'node:path'
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
  status: 'killed' | 'survived' | 'uncertain'
  /** What ran it to the end: its own tests, the whole suite, or the compiler after the suite. */
  by: 'targeted' | 'suite' | 'typecheck'
  seconds: number
  failed: string | null
}>

const root = resolve(import.meta.dir, '..')

/** What a copy holds, and so the only places a mutation or its tests may be. */
const copied = ['src', 'examples', 'spikes'] as const

/** The tests of a file: its own test file, if it has one. */
const testsOf = (mutation: Mutation): ReadonlyArray<string> =>
  mutation.tests ?? [mutation.file.replace(/\.ts$/, '.test.ts')].filter((test) => existsSync(join(root, test)))

/** Text with `\n` line ends, which the edits are written with, and the line end the file had. */
const normalized = (text: string) => ({ text: text.replaceAll('\r\n', '\n'), crlf: text.includes('\r\n') })

/** Whether `path` is in one of the copied folders: a dependency, linked and shared, never is. */
const inCopy = (path: string) => {
  const parts = normalize(path).replaceAll('\\', '/').split('/')
  return copied.some((folder) => parts[0] === folder) && !parts.includes('..') && !parts.includes('node_modules')
}

/**
 * What makes a mutation tell nothing, before anything runs: a file or a test outside the copy, which the workers
 * would share or not have, or an edit that does not find its text exactly once.
 */
export const check = (mutations: ReadonlyArray<Mutation>): ReadonlyArray<string> =>
  mutations.flatMap((mutation) => {
    const outside = [mutation.file, ...(mutation.tests ?? [])].filter((path) => !inCopy(path))
    if (outside.length > 0) return [`${mutation.id}: outside ${copied.join(', ')}: ${outside.join(', ')}`]
    const { text } = normalized(readFileSync(join(root, mutation.file), 'utf8'))
    return mutation.edits.flatMap(([find]) => {
      const count = text.split(find).length - 1
      return count === 1 ? [] : [`${mutation.id}: found ${count} times: ${JSON.stringify(find.slice(0, 80))}`]
    })
  })

/** A copy of the repository for one worker: its sources copied, `node_modules` linked. */
const copy = (): string => {
  const at = mkdtempSync(join(tmpdir(), 'mutate-'))
  for (const entry of [...copied, 'package.json', 'tsconfig.json', 'bun.lock']) {
    cpSync(join(root, entry), join(at, entry), { recursive: true })
  }
  // A junction needs no privilege on Windows, and is a plain link elsewhere.
  symlinkSync(join(root, 'node_modules'), join(at, 'node_modules'), 'junction')
  return at
}

const spawned = async (at: string, command: ReadonlyArray<string>) => {
  const child = Bun.spawn([...command], {
    cwd: at,
    stdout: 'pipe',
    stderr: 'pipe',
    // A run that hangs past every test's own timeout is killed, and counts as failed.
    timeout: 600_000,
  })
  const [out, err] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()])
  return { passed: (await child.exited) === 0, output: `${err}${out}` }
}

const tested = async (at: string, tests: ReadonlyArray<string>, timeout: number) => {
  const { passed, output } = await spawned(at, ['bun', 'test', '--bail', '--timeout', String(timeout), ...tests])
  return { passed, failed: output.match(/^\(fail\) (.*)$/m)?.[1] ?? null }
}

const typechecked = async (at: string) => {
  const { passed, output } = await spawned(at, ['bun', 'run', 'typecheck'])
  return { passed, failed: output.match(/^.*error TS\d+.*$/m)?.[0] ?? null }
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
    let outcome = tests.length === 0 ? { passed: true, failed: null } : await tested(at, tests, timeout)
    if (outcome.passed) {
      by = 'suite'
      outcome = await tested(at, [], timeout)
    }
    if (outcome.passed) {
      by = 'typecheck'
      outcome = await typechecked(at)
    }
    const seconds = Math.round((Date.now() - started) / 100) / 10
    return { id: mutation.id, status: outcome.passed ? 'survived' : 'killed', by, seconds, failed: outcome.failed }
  } finally {
    writeFileSync(path, original)
  }
}

/**
 * Runs the mutations on `workers` copies at once, then again, alone, each one the whole suite killed, and gives the
 * results in the order of the mutations.
 */
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
        // A kill of the suite is told once it holds alone.
        if (!(result.status === 'killed' && result.by === 'suite')) options.each?.(result)
      }
    } finally {
      rmSync(at, { recursive: true, force: true })
    }
  }
  await Promise.all(Array.from({ length: Math.min(options.workers, mutations.length) }, worker))
  const alone = copy()
  try {
    for (const [index, mutation] of mutations.entries()) {
      const first = results[index]
      if (first === undefined || first.status !== 'killed' || first.by !== 'suite') continue
      const again = await mutate(alone, mutation, options.timeout)
      const result = again.status === 'killed' ? first : { ...again, status: 'uncertain' as const }
      results[index] = result
      options.each?.(result)
    }
  } finally {
    rmSync(alone, { recursive: true, force: true })
  }
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
        result.status === 'survived' ? 'SURVIVED' : result.status,
        result.by,
        `${result.seconds}s`,
        result.failed ?? '',
      ].join('\t')),
  })
  const left = (status: Result['status']) => results.filter((result) => result.status === status).map(({ id }) => id)
  const seconds = Math.round((Date.now() - started) / 1000)
  console.log(
    `\n${results.length} mutations, ${left('survived').length} survived, ${left('uncertain').length} uncertain,`
      + ` in ${seconds}s`,
  )
  if (left('survived').length > 0) console.log(`survived: ${left('survived').join(',')}`)
  if (left('uncertain').length > 0) console.log(`uncertain: ${left('uncertain').join(',')}`)
}
