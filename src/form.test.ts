/**
 * The check of three rules that the form of the code keeps (decisions 0164, 0192). It reads the text of every module of `src/`
 * that is not a test, with its comments, strings, regular expressions and the text of its templates taken out:
 * - every fork of Effect is given, as its effect, a call of `untransacted`, which takes out the transaction of the
 *   fiber that forks it (decision 0161);
 * - `src/program.ts`, which a browser imports for a program's schemas, reaches no module of Node or of Bun, through
 *   the modules of `src/` and of Effect that it imports (decision 0192);
 * - a count, a name the module both raises and lowers, is raised in the acquisition and lowered in the release of one
 *   `Effect.acquireUseRelease`, whose raise no interruption splits from its lowering (decision 0163).
 *
 * A fork that must keep the transaction is preceded by a line comment that says `Keeps the transaction:` and why. A
 * count that one fiber raises and another lowers is preceded, at each raise and lowering, by a line comment that says
 * `Raised and lowered by two fibers:` and why. It is a test, so that `bun test` runs it, and a mutation that writes
 * the other form of a rule is killed by the suite in `scripts/mutate.ts`, which copies `src/`.
 */
import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { isAbsolute, join, relative } from 'node:path'

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

const modules = readdirSync(import.meta.dir).filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'))
const each = (check: (text: string) => ReadonlyArray<string>) =>
  modules.flatMap((file) => check(readFileSync(join(import.meta.dir, file), 'utf8')).map((line) => `${file}:${line}`))

describe('the form of src', () => {
  test('every fork of src runs without the transaction of the fiber that forks it', () => {
    expect(modules).toContain('runtime.ts')
    expect(each(forksKeepingTheTransaction)).toEqual([])
  })

  test('every count of src is raised and lowered by one Effect.acquireUseRelease', () => {
    expect(each(countsSplit)).toEqual([])
  })

  test('src/program.ts reaches no module of Node or of Bun, through src and Effect', () => {
    const entry = join(import.meta.dir, 'program.ts')
    const reached: Array<string> = []
    const found = platformModulesReached(entry, (file) => {
      reached.push(file)
      return readFileSync(file, 'utf8')
    }, (specifier, from) => Bun.resolveSync(specifier, join(from, '..')))
    // The walk reads the modules of Effect as they are published, which is what a browser loads.
    expect(reached.some((file) => file.includes(join('node_modules', 'effect', 'dist')))).toBe(true)
    expect(found.map((line) => relative(import.meta.dir, line))).toEqual([])
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
