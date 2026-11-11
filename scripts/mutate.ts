/**
 * Takes out, one at a time, the rules a review writes as mutations, and runs the tests against each (decision
 * 0094). It checks the mutations it is given and nothing else: a rule no mutation takes out is not checked by it.
 *
 * A mutation is a set of exact replacements in one file of `src/` or `examples/`, made in turn, and must leave code
 * that runs: one that does not is killed by the error, and tells nothing. Before any runs, the suite and
 * the compiler run on the code unchanged, since what fails there would kill each mutation. A failure there whose
 * file passes alone is printed on stderr, and the suite runs once more. Each mutation runs first the tests of the
 * file it changes, then, if those pass, the whole suite, and stops at the first failure; if the suite passes too,
 * the compiler checks the copy, so that a rule of the types is taken out as well. A test that
 * hangs past the timeout fails. A mutation a test killed is run again alone once the others are done, since a test
 * on real time may fail under the load of the workers: one that survives then is `uncertain`. The run alone runs
 * only the file of the test that failed, which `bun test` names before the failure, and the tests and the suite
 * again where no file is named.
 *
 * The mutations run in two passes. The first runs the schedules `bun test` runs, with `SCHEDULES` and `SEED` taken
 * out of the environment, and kills most mutations in seconds. The second runs, under `SCHEDULES=all`, each mutation
 * the first left `SURVIVED` or `uncertain`, after the suite and the compiler on the code unchanged under it. A kill of
 * the first pass is a test of `bun test` that fails on the mutation, so it holds whatever the second would run, as
 * long as every test reads `SCHEDULES` only for how many cases it runs. A kill of the second pass is a rule that only
 * the release's run, `bun run test:release`, holds.
 *
 *     bun scripts/mutate.ts <mutations.ts> [--workers 4] [--only id,prefix,...] [--timeout 5000]
 *
 * The mutations module exports `mutations: ReadonlyArray<Mutation>`. It is written for the code a review reads,
 * and kept outside the repository: an edit stops finding its text once the code changes. One line per mutation is
 * printed, tab separated: its id, `killed`, `SURVIVED` or `uncertain`, the pass that gave it, `some` or `all`, what
 * ran it to the end — its own tests, the suite or the compiler — the seconds it took, and the first test that failed
 * in the run alone that held the kill. A survivor is a rule no test holds, or a mutation that changes nothing,
 * which only reading tells apart. What is running, and how many mutations each run has done, is printed on stderr,
 * which a terminal shows on one line. A kill of a test is printed on stdout only once it holds alone, and a result of
 * the first pass that goes to the second is not printed, so stdout stays quiet through each first run.
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

/** The schedules a pass runs: those `bun test` runs, or every seed, as `SCHEDULES=all` runs them. */
export type Schedules = 'some' | 'all'

export type Result = Readonly<{
  id: string
  status: 'killed' | 'survived' | 'uncertain'
  /** The pass that gave the result. */
  schedules: Schedules
  /** What ran it to the end: its own tests, the whole suite, or the compiler after the suite. */
  by: 'targeted' | 'suite' | 'typecheck'
  seconds: number
  failed: string | null
  /** The file of the test that failed, where `bun test` named it. */
  file: string | null
}>

const root = resolve(import.meta.dir, '..')

/**
 * What a copy holds, and so the only places a mutation or its tests may be. The spikes are not copied, since `bun test`
 * runs none (decision 0250).
 */
const copied = ['src', 'examples'] as const

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
 * would share or not have, or that does not exist, or a test whose name `bun test` does not take as a test's, which
 * it fails on as it would on a test that fails; an edit that does not find its text
 * exactly once in the file as the edits before it left it; or edits that leave the file as it was.
 */
export const check = (mutations: ReadonlyArray<Mutation>): ReadonlyArray<string> =>
  mutations.flatMap((mutation) => {
    const paths = [mutation.file, ...(mutation.tests ?? [])]
    const outside = paths.filter((path) => !inCopy(path))
    if (outside.length > 0) return [`${mutation.id}: outside ${copied.join(', ')}: ${outside.join(', ')}`]
    const missing = paths.filter((path) => !existsSync(join(root, path)))
    if (missing.length > 0) return [`${mutation.id}: not found: ${missing.join(', ')}`]
    const untested = (mutation.tests ?? []).filter((path) => !/(\.|_)(test|spec)(\.|_)[^/\\]*$/.test(path))
    if (untested.length > 0) return [`${mutation.id}: not a test file: ${untested.join(', ')}`]
    const { text } = normalized(readFileSync(join(root, mutation.file), 'utf8'))
    let mutated = text
    for (const [find, replace] of mutation.edits) {
      const count = mutated.split(find).length - 1
      if (count !== 1) return [`${mutation.id}: found ${count} times: ${JSON.stringify(find.slice(0, 80))}`]
      mutated = mutated.replace(find, () => replace)
    }
    return mutated === text ? [`${mutation.id}: changes nothing`] : []
  })

/**
 * A copy of the repository for one worker: its sources copied, `node_modules` linked. The README and `docs/` are
 * copied too, since the tests of `src/form.test.ts` compare their code with the examples (decisions 0196, 0203), and
 * so is `.github`, whose workflow a test of the same file reads (decision 0242). `bunfig.toml` keeps the spikes out
 * of `bun test` (decision 0250).
 */
const copy = (): string => {
  const at = mkdtempSync(join(tmpdir(), 'mutate-'))
  for (const entry of [...copied, 'README.md', 'docs', '.github', 'bunfig.toml', 'package.json', 'tsconfig.json', 'bun.lock']) {
    cpSync(join(root, entry), join(at, entry), { recursive: true })
  }
  // A junction needs no privilege on Windows, and is a plain link elsewhere.
  symlinkSync(join(root, 'node_modules'), join(at, 'node_modules'), 'junction')
  return at
}

/**
 * The environment of a run under `schedules`. `SCHEDULES` and `SEED` are set by the pass alone: one left in the shell
 * would make the first pass run other schedules than `bun test` does.
 */
export const environment = (schedules: Schedules, from: Readonly<Record<string, string | undefined>> = Bun.env) => {
  const { SCHEDULES: _schedules, SEED: _seed, ...rest } = from
  return schedules === 'all' ? { ...rest, SCHEDULES: 'all' } : rest
}

const spawned = async (at: string, schedules: Schedules, command: ReadonlyArray<string>) => {
  const child = Bun.spawn([...command], {
    cwd: at,
    env: environment(schedules),
    stdout: 'pipe',
    stderr: 'pipe',
    // A run that hangs past every test's own timeout is killed, and counts as failed. The suite under
    // `SCHEDULES=all` runs some sixteen minutes alone, and longer beside other workers, so the bound is an hour.
    timeout: 3_600_000,
  })
  const [out, err] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text()])
  return { passed: (await child.exited) === 0, output: `${err}${out}` }
}

/** The file `bun test` names on a line of its own, before what a test of the file printed and its failure. */
const fileOf = (output: string, failed: string | null): string | null => {
  if (failed === null) return null
  const before = output.slice(0, output.indexOf(`(fail) ${failed}`))
  const named = [...before.matchAll(/^(\S+[._](?:test|spec)[._]\S*):$/gm)].at(-1)?.[1]
  return named === undefined ? null : named.replaceAll('\\', '/')
}

const tested = async (at: string, schedules: Schedules, tests: ReadonlyArray<string>, timeout: number) => {
  const command = ['bun', 'test', '--bail', '--timeout', String(timeout), ...tests]
  const { passed, output } = await spawned(at, schedules, command)
  const failed = output.match(/^\(fail\) (.*)$/m)?.[1] ?? null
  return { passed, failed, file: fileOf(output, failed) }
}

const typechecked = async (at: string) => {
  const { passed, output } = await spawned(at, 'some', ['bun', 'run', 'typecheck'])
  return { passed, failed: output.match(/^.*error TS\d+.*$/m)?.[0] ?? null, file: null }
}

/** Runs `run` on the copy with the mutation made, and gives the file back as it was. */
const mutated = async <A>(at: string, mutation: Mutation, run: () => Promise<A>): Promise<A> => {
  const path = join(at, mutation.file)
  const original = readFileSync(path, 'utf8')
  const { text, crlf } = normalized(original)
  let changed = text
  for (const [find, replace] of mutation.edits) changed = changed.replace(find, () => replace)
  writeFileSync(path, crlf ? changed.replaceAll('\n', '\r\n') : changed)
  try {
    return await run()
  } finally {
    writeFileSync(path, original)
  }
}

const secondsSince = (started: number) => Math.round((Date.now() - started) / 100) / 10

const mutate = (at: string, mutation: Mutation, schedules: Schedules, timeout: number): Promise<Result> =>
  mutated(at, mutation, async () => {
    const started = Date.now()
    const tests = testsOf(mutation)
    let by: Result['by'] = 'targeted'
    let outcome = tests.length === 0
      ? { passed: true, failed: null, file: null }
      : await tested(at, schedules, tests, timeout)
    if (outcome.passed) {
      by = 'suite'
      outcome = await tested(at, schedules, [], timeout)
    }
    if (outcome.passed) {
      by = 'typecheck'
      outcome = await typechecked(at)
    }
    const status = outcome.passed ? 'survived' : 'killed'
    const { failed, file } = outcome
    return { id: mutation.id, status, schedules, by, seconds: secondsSince(started), failed, file }
  })

/**
 * Runs again, alone, a mutation a test killed: only the file of the test that failed, where it is named, since every
 * test before it passed. A run that passes gives the first result `uncertain`.
 */
const confirmed = async (at: string, mutation: Mutation, first: Result, timeout: number): Promise<Result> => {
  const file = first.file
  const again = file === null
    ? await mutate(at, mutation, first.schedules, timeout)
    : await mutated(at, mutation, async () => {
      const started = Date.now()
      const outcome = await tested(at, first.schedules, [file], timeout)
      const status = outcome.passed ? 'survived' as const : 'killed' as const
      return { ...first, status, seconds: secondsSince(started), failed: outcome.failed, file: outcome.file }
    })
  // A kill is named by the test that failed alone: under the load of the workers, the first run may name a test that
  // ran out of time.
  return again.status === 'killed' ? { ...again, seconds: first.seconds } : { ...again, status: 'uncertain' }
}

/**
 * What fails in a copy no mutation changed, and so would kill each one: `null` if nothing does. A test on real time
 * may fail once under load, as a kill may: a failure whose file passes alone is told to `warn`, and the suite runs
 * once more, so that only a failure that holds stops the run.
 */
const unmutated = async (
  at: string,
  schedules: Schedules,
  timeout: number,
  warn?: (text: string) => void,
): Promise<string | null> => {
  let suite = await tested(at, schedules, [], timeout)
  if (!suite.passed && suite.file !== null && (await tested(at, schedules, [suite.file], timeout)).passed) {
    warn?.(`unmutated, under ${schedules} schedules, failed in the suite and passed alone: ${suite.failed}`)
    suite = await tested(at, schedules, [], timeout)
  }
  if (!suite.passed) return `the suite fails unmutated under ${schedules} schedules: ${suite.failed ?? 'no test named'}`
  const types = await typechecked(at)
  return types.passed ? null : `the compiler fails unmutated: ${types.failed}`
}

/** Whether a test killed the mutation, which a test on real time may do under load; the compiler is not one. */
const byTest = (result: Result) => result.status === 'killed' && result.by !== 'typecheck'

/**
 * Runs one pass under `schedules`: the suite and the compiler on the code unchanged, then the mutations on `workers`
 * copies at once, then again, alone, each one a test killed, and gives the results in the order of the mutations.
 */
export const mutateAll = async (
  mutations: ReadonlyArray<Mutation>,
  options: Readonly<{
    schedules: Schedules
    workers: number
    timeout: number
    each?: (result: Result) => void
    /** What is running, and how many of its mutations are done. */
    progress?: (text: string) => void
    /** A failure of the code unchanged that did not hold alone. */
    warn?: (text: string) => void
  }>,
): Promise<ReadonlyArray<Result>> => {
  const results: Array<Result | undefined> = Array.from({ length: mutations.length })
  let next = 0
  let done = 0
  const worker = async () => {
    const at = copy()
    try {
      while (next < mutations.length) {
        const index = next++
        const mutation = mutations[index]
        if (mutation === undefined) continue
        const result = await mutate(at, mutation, options.schedules, options.timeout)
        results[index] = result
        options.progress?.(`${options.schedules} schedules, first run: ${++done}/${mutations.length} done, ${mutations.length - next} waiting`)
        // A kill of a test is told once it holds alone.
        if (!byTest(result)) options.each?.(result)
      }
    } finally {
      rmSync(at, { recursive: true, force: true })
    }
  }
  if (mutations.length === 0) return []
  const alone = copy()
  try {
    options.progress?.(`${options.schedules} schedules: the suite and the compiler on the code unchanged`)
    const failing = await unmutated(alone, options.schedules, options.timeout, options.warn)
    if (failing !== null) throw new Error(failing)
    await Promise.all(Array.from({ length: Math.min(options.workers, mutations.length) }, worker))
    const killed = results.filter((result) => result !== undefined && byTest(result)).length
    let rerun = 0
    for (const [index, mutation] of mutations.entries()) {
      const first = results[index]
      if (first === undefined || !byTest(first)) continue
      options.progress?.(`${options.schedules} schedules, again alone: ${++rerun}/${killed}, ${mutation.id}`)
      const result = await confirmed(alone, mutation, first, options.timeout)
      results[index] = result
      options.each?.(result)
    }
  } finally {
    rmSync(alone, { recursive: true, force: true })
  }
  return results.filter((result) => result !== undefined)
}

/** Whether a result of the first pass goes to the second: a kill holds under every schedule, as the module says. */
const unsettled = (result: Result) => result.status !== 'killed'

/**
 * Runs the first pass on every mutation, then the second on each one the first left unsettled, and gives the results
 * in the order of the mutations. `each` is told a result once it is final.
 */
export const mutateTwice = async (
  mutations: ReadonlyArray<Mutation>,
  options: Omit<Parameters<typeof mutateAll>[1], 'schedules'>,
): Promise<ReadonlyArray<Result>> => {
  const some = await mutateAll(mutations, {
    ...options,
    schedules: 'some',
    each: (result) => {
      if (!unsettled(result)) options.each?.(result)
    },
  })
  const left = new Set(some.filter(unsettled).map(({ id }) => id))
  const again = mutations.filter(({ id }) => left.has(id))
  const all = new Map((await mutateAll(again, { ...options, schedules: 'all' })).map((result) => [result.id, result]))
  return some.map((result) => all.get(result.id) ?? result)
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
  const usage = 'usage: bun scripts/mutate.ts <mutations.ts> [--workers n] [--only ids] [--timeout ms]'
  const [list] = positionals
  if (list === undefined) throw new Error(usage)
  // A count that is not a positive integer would run no worker, or give `bun test` a timeout it cannot use.
  const positive = (name: string, value: string) => {
    if (!/^[1-9]\d*$/.test(value)) throw new Error(`--${name} is not a positive integer: ${value}\n${usage}`)
    return Number(value)
  }
  const workers = positive('workers', values.workers)
  const timeout = positive('timeout', values.timeout)
  const { mutations } = (await import(resolve(list))) as { mutations: ReadonlyArray<Mutation> }
  const prefixes = values.only?.split(',')
  const chosen = mutations.filter((mutation) => prefixes?.some((prefix) => mutation.id.startsWith(prefix)) ?? true)
  const unclear = check(chosen)
  if (unclear.length > 0) {
    console.error(unclear.join('\n'))
    process.exit(1)
  }
  const started = Date.now()
  const elapsed = () => {
    const seconds = Math.round((Date.now() - started) / 1000)
    return `${Math.floor(seconds / 60)}m${String(seconds % 60).padStart(2, '0')}s`
  }
  // A terminal shows the progress on one line, written over; a file or a pipe is given a line each time.
  const terminal = process.stderr.isTTY === true
  const progress = (text: string) => {
    process.stderr.write(terminal ? `\r\x1b[K[${elapsed()}] ${text}` : `[${elapsed()}] ${text}\n`)
  }
  // A result's line starts at the start of the line, over the progress a terminal shows.
  const clear = () => {
    if (terminal) process.stderr.write('\r\x1b[K')
  }
  const results = await mutateTwice(chosen, {
    workers,
    timeout,
    progress,
    warn: (text) => {
      clear()
      console.error(text)
    },
    each: (result) => {
      clear()
      console.log([
        result.id,
        result.status === 'survived' ? 'SURVIVED' : result.status,
        result.schedules,
        result.by,
        `${result.seconds}s`,
        result.failed ?? '',
      ].join('\t'))
    },
  })
  clear()
  const left = (status: Result['status']) => results.filter((result) => result.status === status).map(({ id }) => id)
  const seconds = Math.round((Date.now() - started) / 1000)
  console.log(
    `\n${results.length} mutations, ${left('survived').length} survived, ${left('uncertain').length} uncertain,`
      + ` in ${seconds}s`,
  )
  if (left('survived').length > 0) console.log(`survived: ${left('survived').join(',')}`)
  if (left('uncertain').length > 0) console.log(`uncertain: ${left('uncertain').join(',')}`)
}
