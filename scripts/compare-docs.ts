/**
 * Compares the JSDoc of the declarations the premises rest on, in two releases of Effect (decision 0108). A spike
 * tells when a behaviour changes; this tells when a promise is added or taken away. The declarations are those
 * decision 0107 reads, with the ones later notes rest on.
 *
 *     bun scripts/compare-docs.ts <old version> <new version>
 *
 * Each release of `effect` and `@effect/sql-sqlite-bun` is packed from npm into a temporary folder. A declaration is
 * found by its name, at the top of its file or as a member, and all its distinct JSDoc comments are compared in order:
 * an overload with a comment of its own, or a member of the same name, is one more comment. One line per declaration is printed, tab separated:
 * the file, the name, and `same`, `changed`, `added` or `removed`; any but `same` is followed by the lines that
 * differ, `-` for the old release and `+` for the new. A declaration found in neither release is `missing`, and fails the run, since the list
 * names it wrong.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type Package = 'effect' | '@effect/sql-sqlite-bun'

/** A declaration to compare: its package, its file under `src/`, and its name. */
type Declaration = readonly [pkg: Package, file: string, name: string]

const declarations: ReadonlyArray<Declaration> = [
  ['effect', 'Semaphore.ts', 'withPermits'],
  ['effect', 'Effect.ts', 'acquireUseRelease'],
  ['effect', 'Effect.ts', 'ensuring'],
  ['effect', 'Effect.ts', 'onExit'],
  ['effect', 'Effect.ts', 'timeoutOption'],
  ['effect', 'Effect.ts', 'raceFirst'],
  ['effect', 'Effect.ts', 'uninterruptible'],
  ['effect', 'Effect.ts', 'callback'],
  ['effect', 'Effect.ts', 'forkChild'],
  ['effect', 'Effect.ts', 'forkIn'],
  ['effect', 'Effect.ts', 'forkDetach'],
  ['effect', 'Scope.ts', 'close'],
  ['effect', 'Scope.ts', 'fork'],
  ['effect', 'Scheduler.ts', 'MixedScheduler'],
  ['effect', 'Queue.ts', 'take'],
  ['effect', 'Deferred.ts', 'await'],
  ['effect', 'Deferred.ts', 'succeed'],
  ['effect', 'Fiber.ts', 'join'],
  ['effect', 'DateTime.ts', 'now'],
  ['effect', 'testing/TestClock.ts', 'adjust'],
  ['effect', 'testing/TestClock.ts', 'make'],
  ['effect', 'testing/TestClock.ts', 'layer'],
  ['effect', 'sql/SqlClient.ts', 'withTransaction'],
  ['effect', 'Schema.ts', 'Record'],
  ['effect', 'SchemaAST.ts', 'ParseOptions'],
  ['effect', 'cluster/Entity.ts', 'toLayer'],
  ['effect', 'cluster/Entity.ts', 'defectRetryPolicy'],
  ['effect', 'cluster/Entity.ts', 'disableFatalDefects'],
  ['effect', 'cluster/ClusterSchema.ts', 'Persisted'],
  ['effect', 'cluster/ClusterSchema.ts', 'WithTransaction'],
  ['effect', 'cluster/ClusterSchema.ts', 'Uninterruptible'],
  ['effect', 'cluster/ShardingConfig.ts', 'entityRegistrationTimeout'],
  ['@effect/sql-sqlite-bun', 'SqliteClient.ts', 'make'],
  ['@effect/sql-sqlite-bun', 'SqliteClient.ts', 'layer'],
]

/** Packs a release from npm into `into`, and gives the folder of its sources. */
const unpack = (pkg: Package, version: string, into: string): string => {
  const run = (command: ReadonlyArray<string>) => {
    const result = Bun.spawnSync([...command], { cwd: into, stdout: 'pipe', stderr: 'pipe' })
    if (result.exitCode !== 0) throw new Error(`${command.join(' ')}: ${result.stderr.toString()}`)
    return result.stdout.toString().trim()
  }
  // npm prints the tarball's name last on stdout, and its notices and errors on stderr.
  const tarball = run(['npm', 'pack', `${pkg}@${version}`]).split('\n').at(-1)!.trim()
  run(['tar', '-xzf', tarball])
  return join(into, 'package', 'src')
}

const declared =
  /^(?:export\s+)?(?:declare\s+)?(?:abstract\s+)?(?:const|let|function\*?|class|interface|type|namespace)\s+([A-Za-z_$][\w$]*)/
const member = /^(?:readonly\s+)?([A-Za-z_$][\w$]*)\??\s*[:<(]/
/** An export under another name, `_await as await`, whose comment is the exported name's. */
const renamed = /^[A-Za-z_$][\w$]*\s+as\s+([A-Za-z_$][\w$]*)/

/** Every JSDoc comment of the declarations named `name` in `text`, each as its lines without the comment's marks. */
const docsOf = (source: string, name: string): ReadonlyArray<ReadonlyArray<string>> => {
  const text = source.replaceAll('\r\n', '\n')
  const docs: Array<ReadonlyArray<string>> = []
  for (const match of text.matchAll(/\/\*\*([\s\S]*?)\*\//g)) {
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 200).trimStart()
    const found = declared.exec(after) ?? renamed.exec(after) ?? member.exec(after)
    if (found?.[1] !== name) continue
    docs.push(match[1]!.split('\n').map((line) => line.replace(/^\s*\* ?/, '').trimEnd()).filter((line, i, all) =>
      line !== '' || (i > 0 && i < all.length - 1)
    ))
  }
  return docs
}

const read = (path: string): string | undefined => {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return undefined
  }
}

/** The lines of a change, by a longest common subsequence: `-` for the old, `+` for the new, ` ` for both. */
const diff = (before: ReadonlyArray<string>, after: ReadonlyArray<string>): ReadonlyArray<string> => {
  const lengths = Array.from({ length: before.length + 1 }, () => new Array<number>(after.length + 1).fill(0))
  for (let i = before.length - 1; i >= 0; i--) {
    for (let j = after.length - 1; j >= 0; j--) {
      lengths[i]![j] = before[i] === after[j]
        ? lengths[i + 1]![j + 1]! + 1
        : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!)
    }
  }
  const lines: Array<string> = []
  let i = 0
  let j = 0
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      lines.push(`  ${before[i++]}`)
      j++
    } else if (j < after.length && (i === before.length || lengths[i]![j + 1]! >= lengths[i + 1]![j]!)) {
      lines.push(`+ ${after[j++]}`)
    } else {
      lines.push(`- ${before[i++]}`)
    }
  }
  return lines
}

const [oldVersion, newVersion] = Bun.argv.slice(2)
if (oldVersion === undefined || newVersion === undefined) {
  console.error('usage: bun scripts/compare-docs.ts <old version> <new version>')
  process.exit(2)
}

const folder = mkdtempSync(join(tmpdir(), 'effect-tea-durable-docs-'))
let missing = 0
try {
  const sources = new Map<string, string>()
  for (const pkg of new Set(declarations.map(([pkg]) => pkg))) {
    for (const version of [oldVersion, newVersion]) {
      const into = mkdtempSync(join(folder, 'release-'))
      sources.set(`${pkg}@${version}`, unpack(pkg, version, into))
    }
  }
  for (const [pkg, file, name] of declarations) {
    const docs = (version: string) => {
      const text = read(join(sources.get(`${pkg}@${version}`)!, file))
      // An overload with the same comment as another adds nothing to compare.
      const unique = [...new Map(docsOf(text ?? '', name).map((doc) => [doc.join('\n'), doc])).values()]
      return unique.flatMap((doc, i) => i === 0 ? doc : ['---', ...doc])
    }
    const before = docs(oldVersion)
    const after = docs(newVersion)
    const where = pkg === 'effect' ? file : `${pkg}/${file}`
    const status = before.length === 0 && after.length === 0
      ? 'missing'
      : before.length === 0
      ? 'added'
      : after.length === 0
      ? 'removed'
      : before.join('\n') === after.join('\n')
      ? 'same'
      : 'changed'
    console.log([where, name, status].join('\t'))
    if (status === 'missing') missing++
    if (status === 'changed' || status === 'added' || status === 'removed') {
      for (const line of diff(before, after)) if (!line.startsWith('  ')) console.log(`\t${line}`)
    }
  }
} finally {
  rmSync(folder, { recursive: true, force: true })
}
process.exit(missing === 0 ? 0 : 1)
