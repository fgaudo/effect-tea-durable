/**
 * The check of the rules that the form of the code keeps (decisions 0164, 0192, 0241). It reads the text of every module
 * of `src/` and of its folders that is not a test, with its comments, strings, regular expressions and the text of its
 * templates taken out:
 * - every fork of Effect is given, as its effect, a call of `untransacted`, which takes out the transaction of the
 *   fiber that forks it (decision 0161);
 * - `src/program.ts`, which a browser imports for a program's schemas, reaches no module of Node or of Bun, through
 *   the modules of `src/` and of Effect that it imports (decision 0192), nor does `src/index.program.ts`, the entry
 *   a browser imports it through (decision 0193);
 * - `src/index.ts`, the main entry, reaches through `src/` neither Effect's Cluster nor the modules of a test, which
 *   the entries `index.cluster.ts` and `index.testing.ts` give (decision 0193);
 * - a count, a name the module both raises and lowers, is raised in the acquisition and lowered in the release of one
 *   `Effect.acquireUseRelease`, whose raise no interruption splits from its lowering (decision 0163);
 * - a module of a group, a folder of `src/` beside a module of its name, is imported only by that module and by the
 *   files of the folder (decision 0241);
 * - a module imports no file of the tests: a test, named `.test.ts`, or a file only tests import, named
 *   `<module>.test_<role>.ts`, which the other rules do not read (decision 0241).
 *
 * A fork that must keep the transaction is preceded by a line comment that says `Keeps the transaction:` and why. A
 * count that one fiber raises and another lowers is preceded, at each raise and lowering, by a line comment that says
 * `Raised and lowered by two fibers:` and why. It is a test, so that `bun test` runs it, and a mutation that writes
 * the other form of a rule is killed by the suite in `scripts/mutate.ts`, which copies `src/`.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { isAbsolute, join, posix, relative, sep } from 'node:path'
import type { Returned } from './index.program.ts'

/** `text` with what is not code as spaces: comments, strings, regular expressions, and the text of templates. */
export const codeOf = (text: string): string => {
  const out = text.split('')
  const blank = (from: number, to: number) => {
    for (let i = from; i < to && i < out.length; i++) if (out[i] !== '\n' && out[i] !== '\r') out[i] = ' '
  }
  // The depth of braces at each `${` of a template open, so that its `}` resumes the template's text.
  const templates: Array<number> = []
  let depth = 0
  // The last character of code, which tells a regular expression from a division.
  let last = ''
  let word = ''
  let i = 0
  // Blanks the text of a template from `from`, and gives where code resumes: after its end, or after a `${`.
  const template = (from: number): number => {
    let j = from
    while (j < text.length) {
      if (text[j] === '\\') j += 2
      else if (text[j] === '`') {
        blank(from, j)
        return j + 1
      } else if (text[j] === '$' && text[j + 1] === '{') {
        blank(from, j)
        templates.push(depth)
        depth += 1
        last = '{'
        return j + 2
      } else j += 1
    }
    blank(from, j)
    return j
  }
  while (i < text.length) {
    const c = text[i]!
    if (c === '/' && text[i + 1] === '/') {
      const end = text.indexOf('\n', i)
      const to = end === -1 ? text.length : end
      blank(i, to)
      i = to
    } else if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      const to = end === -1 ? text.length : end + 2
      blank(i, to)
      i = to
    } else if (c === '\'' || c === '"') {
      let j = i + 1
      while (j < text.length && text[j] !== c && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1
      blank(i + 1, j)
      i = j + 1
      last = 'x'
    } else if (c === '`') {
      i = template(i + 1)
      last = 'x'
    } else if (c === '}' && templates.length > 0 && templates.at(-1) === depth - 1) {
      depth -= 1
      templates.pop()
      i = template(i + 1)
      last = 'x'
    } else if (
      c === '/' && (last === '' || '(,=:[!&|?{};+-*%<>~^'.includes(last) || ['return', 'typeof', 'case'].includes(word))
    ) {
      let j = i + 1
      let inClass = false
      while (j < text.length && text[j] !== '\n') {
        if (text[j] === '\\') j += 1
        else if (text[j] === '[') inClass = true
        else if (text[j] === ']') inClass = false
        else if (text[j] === '/' && !inClass) break
        j += 1
      }
      blank(i + 1, j)
      i = j + 1
      last = 'x'
      word = ''
    } else {
      if (c === '{') depth += 1
      if (c === '}') depth -= 1
      if (/[\w$]/.test(c)) {
        word = /[\w$]/.test(last) ? word + c : c
        last = c
      } else if (!/\s/.test(c)) {
        last = c
        word = ''
      }
      i += 1
    }
  }
  return out.join('')
}

/** A call found in code: where its name starts, and the span of each argument, its parentheses aside. */
type Call = Readonly<{ at: number; args: ReadonlyArray<readonly [from: number, to: number]> }>

/** The call whose `(` is at `open`, with its arguments split at the commas of its own depth. */
const callAt = (code: string, at: number, open: number): Call => {
  const args: Array<readonly [number, number]> = []
  let depth = 0
  let from = open + 1
  for (let i = open; i < code.length; i++) {
    const c = code[i]!
    if ('([{'.includes(c)) depth += 1
    else if (')]}'.includes(c)) {
      depth -= 1
      if (depth === 0) {
        if (code.slice(from, i).trim() !== '') args.push([from, i])
        return { at, args }
      }
    } else if (c === ',' && depth === 1) {
      args.push([from, i])
      from = i + 1
    }
  }
  return { at, args }
}

const lineOf = (text: string, at: number) => text.slice(0, at).split('\n').length

/** Whether the line comments right above the line of `at` say `marker`. */
const marked = (text: string, at: number, marker: string) => {
  const lines = text.split('\n')
  const said: Array<string> = []
  for (let n = lineOf(text, at) - 2; n >= 0 && lines[n]!.trim().startsWith('//'); n--) said.unshift(lines[n]!.trim())
  return said.join(' ').includes(marker)
}

const forkMarker = 'Keeps the transaction:'
const countMarker = 'Raised and lowered by two fibers:'

/** The forks of `text` that are not given a call of `untransacted` and do not say why, one line each. */
export const forksKeepingTheTransaction = (text: string): ReadonlyArray<string> => {
  const code = codeOf(text)
  const found: Array<string> = []
  // A name of a fork is read wherever it stands: called, passed as a value, or imported under another name.
  for (const match of code.matchAll(/\b(forkChild|forkIn|forkScoped|forkDetach)\b/g)) {
    const at = match.index
    if (marked(text, at, forkMarker)) continue
    const called = code.slice(Math.max(0, at - 'Effect.'.length), at) === 'Effect.' && code[at + match[0].length] === '('
    const effect = called ? callAt(code, at, at + match[0].length).args[0] : undefined
    if (effect !== undefined && /^untransacted\s*\(/.test(code.slice(effect[0], effect[1]).trim())) continue
    found.push(`${lineOf(text, at)}: ${match[0]} without untransacted`)
  }
  // What forks with services the check does not follow: a set of fibers, or a run given a context.
  for (
    const match of code.matchAll(
      /\b(FiberMap|FiberSet|FiberHandle|runForkWith|runCallbackWith|runPromiseWith|runPromiseExitWith|runSyncWith|runSyncExitWith)\b/g,
    )
  ) {
    if (!marked(text, match.index, forkMarker)) found.push(`${lineOf(text, match.index)}: ${match[0]}, which the check does not read`)
  }
  return found
}

/** The raises and lowerings of a count in `text` that no `Effect.acquireUseRelease` pairs and none says why. */
export const countsSplit = (text: string): ReadonlyArray<string> => {
  const code = codeOf(text)
  const sites: Array<{ at: number; name: string; raise: boolean }> = []
  for (const match of code.matchAll(/([A-Za-z_$][\w$]*)\s*(\+\+|--|\+=|-=)|(\+\+|--)\s*(?:[A-Za-z_$][\w$]*\.)*([A-Za-z_$][\w$]*)/g)) {
    const operator = match[2] ?? match[3]!
    sites.push({ at: match.index, name: (match[1] ?? match[4])!, raise: operator.startsWith('+') })
  }
  const raised = new Set(sites.filter((site) => site.raise).map((site) => site.name))
  const lowered = new Set(sites.filter((site) => !site.raise).map((site) => site.name))
  const pairs = [...code.matchAll(/\bEffect\.acquireUseRelease\(/g)].map((match) =>
    callAt(code, match.index, match.index + match[0].length - 1)
  )
  const within = (at: number, span: readonly [number, number] | undefined) =>
    span !== undefined && at >= span[0] && at < span[1]
  const found: Array<string> = []
  for (const site of sites) {
    if (!(raised.has(site.name) && lowered.has(site.name))) continue
    if (marked(text, site.at, countMarker)) continue
    // The raise in the acquisition of one call, and a lowering of the same name in its release.
    const paired = pairs.some((call) => {
      const [acquire, , release] = call.args
      const raises = sites.some((other) => other.name === site.name && other.raise && within(other.at, acquire))
      const lowers = sites.some((other) => other.name === site.name && !other.raise && within(other.at, release))
      return raises && lowers && within(site.at, site.raise ? acquire : release)
    })
    if (!paired) found.push(`${lineOf(text, site.at)}: ${site.name} ${site.raise ? 'raised' : 'lowered'} outside one acquireUseRelease`)
  }
  return found
}

/**
 * The specifiers `text` imports or exports from, statically or by an `import()` of a string. A `from` or an `import`
 * inside a comment or a string is not code, as `codeOf` reads it, and names no module.
 */
export const importsOf = (text: string): ReadonlyArray<string> => {
  const code = codeOf(text)
  return [...text.matchAll(/\bfrom\s*(['"])([^'"\n]+)\1|\bimport\s*\(?\s*(['"])([^'"\n]+)\3/g)]
    .filter((match) => code[match.index] !== ' ')
    .map((match) => match[2] ?? match[4]!)
}

/**
 * Each module of Node or of Bun that `entry` reaches through what it imports, as `file: specifier`. A specifier
 * that `resolve` does not turn into the path of a file is a module built into the platform, such as `crypto`.
 */
export const platformModulesReached = (
  entry: string,
  read: (file: string) => string,
  resolve: (specifier: string, from: string) => string,
): ReadonlyArray<string> => {
  const found: Array<string> = []
  const seen = new Set<string>()
  const visit = (file: string) => {
    if (seen.has(file)) return
    seen.add(file)
    for (const specifier of importsOf(read(file))) {
      const resolved = /^(node|bun)(:|$)/.test(specifier) ? specifier : resolve(specifier, file)
      if (isAbsolute(resolved)) visit(resolved)
      else found.push(`${file}: ${specifier}`)
    }
  }
  visit(entry)
  return found
}

/**
 * Each import in `files` that reaches a module of a group from outside it, as `file: specifier`. `files` maps each
 * path under `src/`, written with `/`, to its text. A group is a folder of `src/` beside a module of its name, as
 * `runtime/` beside `runtime.ts`, and is entered through that module alone (decision 0241).
 */
export const groupsCrossed = (files: ReadonlyMap<string, string>): ReadonlyArray<string> => {
  const groups = new Set(
    [...files.keys()].flatMap((file) => {
      const [folder, ...rest] = file.split('/')
      return rest.length > 0 && files.has(`${folder}.ts`) ? [folder!] : []
    }),
  )
  const found: Array<string> = []
  for (const [file, text] of files) {
    for (const specifier of importsOf(text)) {
      if (!specifier.startsWith('.')) continue
      const target = posix.normalize(posix.join(posix.dirname(file), specifier))
      const [group, ...rest] = target.split('/')
      if (rest.length === 0 || !groups.has(group!)) continue
      if (file === `${group}.ts` || file.startsWith(`${group}/`)) continue
      found.push(`${file}: ${specifier}`)
    }
  }
  return found
}

/** Whether `file` is one of the tests: a test, or a file only tests import (decision 0241). */
export const ofTheTests = (file: string): boolean => /\.test(_\w+)?\.ts$/.test(file)

/** The imports of a file of the tests by a module, as `file: specifier`, given the text of each file by its path. */
export const testsImported = (texts: ReadonlyMap<string, string>): ReadonlyArray<string> =>
  [...texts].filter(([file]) => !ofTheTests(file)).flatMap(([file, text]) =>
    importsOf(text).filter((specifier) => specifier.startsWith('.') && ofTheTests(specifier))
      .map((specifier) => `${file}: ${specifier}`)
  )

/** Every file of `src/` and of its folders, as a path under `src/` written with `/`. */
const filesOfSrc = readdirSync(import.meta.dir, { recursive: true, encoding: 'utf8' })
  .map((file) => file.replaceAll(sep, '/'))
  .filter((file) => file.endsWith('.ts'))
const modules = filesOfSrc.filter((file) => !ofTheTests(file))
const each = (check: (text: string) => ReadonlyArray<string>) =>
  modules.flatMap((file) => check(readFileSync(join(import.meta.dir, file), 'utf8')).map((line) => `${file}:${line}`))

describe('the form of src', () => {
  test('every fork of src runs without the transaction of the fiber that forks it', () => {
    expect(modules).toContain('runtime.ts')
    expect(modules).toContain('runtime/loop.ts')
    expect(each(forksKeepingTheTransaction)).toEqual([])
  })

  test('every count of src is raised and lowered by one Effect.acquireUseRelease', () => {
    expect(each(countsSplit)).toEqual([])
  })

  // `index.program.ts` is the entry a browser imports a program's module through (decision 0193).
  test.each(['program.ts', 'index.program.ts'])('src/%s reaches no module of Node or of Bun, through src and Effect', (
    module,
  ) => {
    const entry = join(import.meta.dir, module)
    const reached: Array<string> = []
    const found = platformModulesReached(entry, (file) => {
      reached.push(file)
      return readFileSync(file, 'utf8')
    }, (specifier, from) => Bun.resolveSync(specifier, join(from, '..')))
    // The walk reads the modules of Effect as they are published, which is what a browser loads.
    expect(reached.some((file) => file.includes(join('node_modules', 'effect', 'dist')))).toBe(true)
    expect(found.map((line) => relative(import.meta.dir, line))).toEqual([])
  })
  test('src/index.ts reaches neither Cluster nor the modules of a test, through src', () => {
    const apart = ['cluster.ts', 'rehearse.ts', 'testing.ts', 'index.cluster.ts', 'index.testing.ts']
      .map((file) => join(import.meta.dir, file))
    const found = platformModulesReached(
      join(import.meta.dir, 'index.ts'),
      // The walk reads the modules of `src/` alone: a module of Effect is named by its specifier.
      (file) => (file.startsWith(import.meta.dir) ? readFileSync(file, 'utf8') : ''),
      (specifier, from) => {
        if (/^effect\/(cluster|rpc|workflow)\b/.test(specifier)) return specifier
        const resolved = Bun.resolveSync(specifier, join(from, '..'))
        return apart.includes(resolved) ? specifier : resolved
      },
    )
    // `machine.ts` imports `node:crypto`, which a process on one machine has: only the modules set apart fail.
    expect(found.filter((line) => !/: (node|bun)(:|$)/.test(line)).map((line) => relative(import.meta.dir, line)))
      .toEqual([])
  })
  // A program writes its `work` with `Returned`, and only the runtime calls `isTimer` (decision 0193).
  test('the entry of a program gives the type Returned, and not isTimer', async () => {
    const empty: Returned<never, never> = []
    const entry: Readonly<Record<string, unknown>> = await import('./index.program.ts')
    expect(Object.hasOwn(entry, 'timer') && !Object.hasOwn(entry, 'isTimer')).toBe(true)
    expect(empty).toEqual([])
  })
  // The library's tests run on its own programs, in `src/fixtures/`, so that a change of an example breaks none.
  test('a module of a group of src is imported only by the entry of the group and by the files of its folder', () => {
    expect(modules).toContain('runtime/process.ts')
    const texts = new Map(filesOfSrc.map((file) => [file, readFileSync(join(import.meta.dir, file), 'utf8')]))
    expect(groupsCrossed(texts)).toEqual([])
  })
  test('no module of src imports a file of the tests', () => {
    expect(filesOfSrc).toContain('runtime.test_shared.ts')
    expect(modules).not.toContain('runtime.test_shared.ts')
    const texts = new Map(filesOfSrc.map((file) => [file, readFileSync(join(import.meta.dir, file), 'utf8')]))
    expect(testsImported(texts)).toEqual([])
  })
  test('no file of src imports an example', () => {
    expect(filesOfSrc).toContain('fixtures/order.ts')
    const found = filesOfSrc.flatMap((file) =>
      importsOf(readFileSync(join(import.meta.dir, file), 'utf8'))
        .filter((specifier) => specifier.includes('examples/'))
        .map((specifier) => `${file}: ${specifier}`)
    )
    expect(found).toEqual([])
  })
})

describe('the form of the examples', () => {
  // An example is what a user copies, so it imports the library by the package's name, as a user does (AGENTS.md).
  test("an example imports the library by the package's name, and no file of src", () => {
    const examples = join(import.meta.dir, '..', 'examples')
    const files = readdirSync(examples, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.ts'))
    expect(files.length).toBeGreaterThan(0)
    const found = files.flatMap((file) =>
      importsOf(readFileSync(join(examples, file), 'utf8'))
        .filter((specifier) => specifier.includes('/src/') || specifier.startsWith('../src'))
        .map((specifier) => `${file}: ${specifier}`)
    )
    expect(found).toEqual([])
  })
  // The README shows the quick start's files whole, so a change of the API that `bun test` finds in them fails here
  // until the README shows it too (decision 0196).
  test("the README's quick start is the code of examples/quick-start, each file whole", () => {
    const read = (file: string) => readFileSync(join(import.meta.dir, '..', file), 'utf8').replaceAll('\r\n', '\n')
    const readme = read('README.md')
    const start = readme.indexOf('## Quick start\n')
    expect(start).toBeGreaterThan(-1)
    const section = readme.slice(start, readme.indexOf('\n## ', start))
    const blocks = [...section.matchAll(/```ts\n([\s\S]*?)```\n/g)].map(([, code]) => code)
    expect(blocks).toEqual([read('examples/quick-start/hold.ts'), read('examples/quick-start/hold.test.ts')])
  })
  // The guide shows parts of the examples, so a change of the API that `bun test` finds in them fails here until the
  // guide shows it too. A part is cut at an elision, and compared without indentation or blank lines (decision 0203).
  test("the guide's code is found in the examples, part by part", () => {
    const root = join(import.meta.dir, '..')
    const read = (file: string) => readFileSync(join(root, file), 'utf8').replaceAll('\r\n', '\n')
    const lines = (code: string) => code.split('\n').map((line) => line.trim()).filter((line) => line !== '')
    const examples = readdirSync(join(root, 'examples'), { recursive: true, encoding: 'utf8' })
      .filter((file) => file.endsWith('.ts'))
      .map((file) => lines(read(join('examples', file))))
    const elides = (line: string) => line.includes('…') || /^\/\/ (in |[\w-]+\.ts$)/.test(line)
    const holds = (file: ReadonlyArray<string>, part: ReadonlyArray<string>) =>
      file.some((_, at) => part.every((line, offset) => file[at + offset] === line))
    const pages = ['README.md', ...readdirSync(join(root, 'docs', 'guide')).map((page) => `docs/guide/${page}`)]
    expect(pages).toContain('docs/guide/children.md')
    const missing = pages.flatMap((page) => {
      const text = read(page)
      return [...text.matchAll(/^```ts\n([\s\S]*?)^```$/gm)].flatMap((block) => {
        const parts: Array<Array<string>> = [[]]
        for (const line of lines(block[1] ?? '')) {
          if (elides(line)) parts.push([])
          else parts.at(-1)?.push(line)
        }
        const at = text.slice(0, block.index).split('\n').length
        return parts
          .filter((part) => part.length > 0 && !examples.some((file) => holds(file, part)))
          .map((part) => `${page}:${at}: ${part[0]}`)
      })
    })
    expect(missing).toEqual([])
  })
})

describe('the form of the workflow', () => {
  // The CI deals the files of `bun test` among jobs. A job left out of the matrix, or a count of shards that the
  // command and the matrix give apart, leaves files that no job runs (decision 0242).
  test('the jobs of the tests run every shard of their division, and the job of the other checks runs no test', () => {
    type Step = { run?: string }
    type Job = { strategy?: { matrix?: { shard?: ReadonlyArray<number> } }; steps: ReadonlyArray<Step> }
    const workflow = Bun.YAML.parse(
      readFileSync(join(import.meta.dir, '..', '.github', 'workflows', 'ci.yml'), 'utf8'),
    ) as { jobs: Record<string, Job> }
    const divided = (name: string, command: string) => {
      const job = workflow.jobs[name]!
      const shards = job.strategy?.matrix?.shard ?? []
      expect(shards.length).toBeGreaterThan(1)
      expect(shards).toEqual(shards.map((_, at) => at + 1))
      expect(job.steps.flatMap((step) => step.run?.startsWith(command) ? [step.run] : []))
        .toEqual([`${command} --shard=\${{ matrix.shard }}/${shards.length}`])
    }
    divided('test', 'bun test')
    divided('release', 'bun run test:release')
    expect(workflow.jobs['check']!.steps.filter((step) => step.run?.includes('test'))).toEqual([])
  })
})

describe('the check of the form', () => {
  test('a module of the platform is found through a module imported, and one named in a comment is not', () => {
    const files: Record<string, string> = {
      '/a.ts': [
        "import { b } from './b.ts'",
        "// import { createHash } from 'node:crypto'",
        "const text = \"from 'node:fs'\"",
        "export * from './c.ts'",
      ].join('\n'),
      '/b.ts': "import type * as Fs from 'node:fs'\nexport const b = Array.from('b')",
      '/c.ts': "const crypto = await import('crypto')\nimport 'bun:test'\nimport './a.ts'",
    }
    const resolve = (specifier: string) => (specifier.startsWith('./') ? specifier.slice(1) : specifier)
    expect(platformModulesReached('/a.ts', (file) => files[file]!, resolve)).toEqual([
      '/b.ts: node:fs',
      '/c.ts: crypto',
      '/c.ts: bun:test',
    ])
  })

  test('an import of a group from outside it is found, and the entry, the folder and a folder with no entry pass', () => {
    const texts = new Map([
      ['loop.ts', "import { x } from './loop/step.ts'"],
      ['loop/step.ts', ["import { y } from './fiber.ts'", "import { z } from '../storage/tables.ts'"].join('\n')],
      ['loop/fiber.ts', "import { w } from '../loop.ts'"],
      ['storage.ts', "export { t } from './storage/tables.ts'"],
      ['storage/tables.ts', ''],
      ['cluster.ts', [
        "import { t } from './storage/tables.ts'",
        "// from './loop/fiber.ts'",
        "import { s } from './storage.ts'",
      ].join('\n')],
      ['fixtures/order.ts', ''],
      ['runtime.test.ts', "import { order } from './fixtures/order.ts'"],
    ])
    expect(groupsCrossed(texts)).toEqual(['loop/step.ts: ../storage/tables.ts', 'cluster.ts: ./storage/tables.ts'])
  })

  test('an import of a file of the tests by a module is found, and one by a file of the tests passes', () => {
    const texts = new Map([
      ['loop.ts', ["import { x } from './loop.test_shared.ts'", "// from './loop.test.ts'"].join('\n')],
      ['storage/tables.ts', "import { y } from '../storage.test.ts'"],
      ['loop.test.ts', "import { x } from './loop.test_shared.ts'"],
      ['loop.test_shared.ts', "import { z } from './storage.test_databases.ts'\nimport { w } from './loop.ts'"],
      ['testing.ts', "import { v } from './testing/scheduler.ts'"],
    ])
    expect(testsImported(texts)).toEqual(['loop.ts: ./loop.test_shared.ts', 'storage/tables.ts: ../storage.test.ts'])
  })

  test('a fork not given untransacted is found, in each of its forms', () => {
    const text = [
      'const a = Effect.forkIn(loop, scope)',
      'const b = loop.pipe(Effect.forkChild)',
      'const c = Effect.forkDetach(Effect.ensuring(untransacted(loop), done))',
      'import { forkScoped as f } from "effect/Effect"',
      'const d = FiberSet.run(set, loop)',
    ].join('\n')
    expect(forksKeepingTheTransaction(text)).toEqual([
      '1: forkIn without untransacted',
      '2: forkChild without untransacted',
      '3: forkDetach without untransacted',
      '4: forkScoped without untransacted',
      '5: FiberSet, which the check does not read',
    ])
  })

  test('a fork given untransacted, one that says why it keeps the transaction, and one in a comment pass', () => {
    const text = [
      'const a = Effect.forkIn(untransacted(Effect.ensuring(loop, done)), scope, { uninterruptible: false })',
      '// Keeps the transaction: its statements are the step\'s own.',
      'const b = Effect.forkChild(loop)',
      '// Effect.forkIn(loop, scope)',
      'const c = "Effect.forkIn(loop, scope)" + `${Effect.forkIn(untransacted(loop), scope)} Effect.forkIn(x)`',
    ].join('\n')
    expect(forksKeepingTheTransaction(text)).toEqual([])
  })

  test('a count lowered by an ensuring, or raised and lowered by two calls, is found', () => {
    const text = [
      'const a = Effect.andThen(Effect.sync(() => { readings += 1 }), Effect.ensuring(wait, Effect.sync(() => { readings -= 1 })))',
      'const b = Effect.acquireUseRelease(Effect.sync(() => { users++ }), use, () => Effect.void)',
      'const c = Effect.acquireUseRelease(Effect.void, use, () => Effect.sync(() => { users-- }))',
    ].join('\n')
    expect(countsSplit(text)).toEqual([
      '1: readings raised outside one acquireUseRelease',
      '1: readings lowered outside one acquireUseRelease',
      '2: users raised outside one acquireUseRelease',
      '3: users lowered outside one acquireUseRelease',
    ])
  })

  test('a count paired by one acquireUseRelease, one that says why, and a name only raised pass', () => {
    const text = [
      'const a = Effect.acquireUseRelease(Effect.sync(() => { if (++readings === 1) open() }), use, () =>',
      '  Effect.sync(() => { if (--readings === 0) close() }))',
      '// Raised and lowered by two fibers: the offer raises it, the loop lowers it.',
      'loaded.pending += 1',
      '// Raised and lowered by two fibers: the loop lowers what the offer raised.',
      'loaded.pending -= 1',
      'const wait = ++loaded.waits',
      'const ratio = a / b / c; const page = text.replace(/a-- b/u, "x -= 1")',
    ].join('\n')
    expect(countsSplit(text)).toEqual([])
  })
})
