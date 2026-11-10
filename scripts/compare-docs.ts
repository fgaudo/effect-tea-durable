/**
 * Compares the JSDoc of the declarations the premises rest on, in two releases of Effect, as `AGENTS.md` asks. A spike
 * tells when a behaviour changes; this tells when a promise is added or taken away. The list is the ledger of the
 * premises about Effect: which its documentation promises, and which only a spike or its source holds. A note whose
 * premise rests on another declaration adds it, with why.
 *
 *     bun scripts/compare-docs.ts <old version> <new version>
 *
 * Each declaration says why it is listed. An unstable one may change its promises in any release. A stable one whose
 * documentation does not promise what a premise needs may promise it in any release, which makes the premise
 * documented. A stable one whose documentation promises it is listed so that the ledger is whole, and only its tag is
 * checked: semantic versioning keeps the promise within the major, and a move to a new major reads every premise again
 * (`AGENTS.md`). Effect's release policy, `.agents/skills/changesets/authoring.md` at `1ec9509`, read on 2026-11-10,
 * has a stable or untagged API follow strict semantic versioning, an `unstable` one break only in a minor, and an
 * `experimental` one in a patch; it requires a tag on every module and importable export since Effect-TS/effect#8770.
 *
 * Each release of `effect` and `@effect/sql-sqlite-bun` is packed from npm into a temporary folder. A declaration is
 * found by its name, at the top of its file or as a member, and all its distinct JSDoc comments are compared in order:
 * an overload with a comment of its own, or a member of the same name, is one more comment. One line per declaration
 * is printed, tab separated: the file, the name, and `same`, `changed`, `added` or `removed`; any but `same` is followed
 * by the lines that differ, `-` for the old release and `+` for the new. A declaration found in neither release is
 * `missing`, and fails the run, since the list names it wrong. So does one whose `@stability` in the new release, its
 * own or its module's, is not what its reason says: an `unstable` one that is no longer, which may leave the list or
 * be `undocumented`, or an `undocumented` or `stable` one that is not stable (`AGENTS.md`). A `stable` one is
 * printed as `stable`, with no lines compared.
 *
 * Then the sources of Cluster that say how its rows are written and read are compared whole, code included: a
 * release that changes them may not read what an older one stored (`AGENTS.md`). Each is printed on a line of its
 * own, first `storage`, then the file and its status, followed by the lines that differ. A change does not fail the
 * run: its note says what it changes, and the spike of the fixtures runs it.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type Package = 'effect' | '@effect/sql-sqlite-bun'

/**
 * Why a declaration is listed: `unstable`, marked so by Effect; `undocumented`, stable but not promising what a
 * premise needs; `stable`, promising it, so that a premise which rests on it is documented.
 */
type Why = 'unstable' | 'undocumented' | 'stable'

/** A declaration of the ledger: its package, its file under `src/`, its name, and why it is listed. */
type Declaration = readonly [pkg: Package, file: string, name: string, why: Why]

const declarations: ReadonlyArray<Declaration> = [
  // Releases its permits when the effect it wraps exits, whichever way: the lock of an entity (decision 0067).
  ['effect', 'Semaphore.ts', 'withPermits', 'stable'],
  // Acquires uninterruptibly, and runs the release uninterruptibly once acquired: `holding` in `src/runtime/process.ts`.
  ['effect', 'Effect.ts', 'acquireUseRelease', 'stable'],
  // Run when the effect succeeds, fails or is interrupted: the finalizers of the runtime's forks (decision 0068).
  ['effect', 'Effect.ts', 'ensuring', 'stable'],
  ['effect', 'Effect.ts', 'onExit', 'stable'],
  // Interrupt the effect when the time runs out, and the loser: an idle entity's wait (decision 0029), the tests.
  ['effect', 'Effect.ts', 'timeoutOption', 'stable'],
  ['effect', 'Effect.ts', 'raceFirst', 'stable'],
  // Runs its finalizers uninterruptibly, so a fiber that closes a scope waits for them; and a child closes with its
  // parent: a deployment's scope (decisions 0051 and 0102).
  ['effect', 'Scope.ts', 'close', 'stable'],
  ['effect', 'Scope.ts', 'fork', 'stable'],
  // The default scheduler keeps the order of the tasks of one priority (decision 0101).
  ['effect', 'Scheduler.ts', 'MixedScheduler', 'stable'],
  // Reads the `Clock` service, which a test moves ahead of the sleeps (decision 0103).
  ['effect', 'DateTime.ts', 'now', 'stable'],
  // What an interrupted take leaves in the queue.
  ['effect', 'Queue.ts', 'take', 'undocumented'],
  // That a fiber forked inside `uninterruptible` is interruptible, and that a joiner interrupted leaves it running. The
  // second is said on effect.website, Fibers, Lifetime of Child Fibers, which is not the JSDoc (`AGENTS.md`): a
  // promise added to the JSDoc of `forkIn` is what to look for.
  ['effect', 'Effect.ts', 'uninterruptible', 'undocumented'],
  ['effect', 'Effect.ts', 'forkChild', 'undocumented'],
  ['effect', 'Effect.ts', 'forkIn', 'undocumented'],
  ['effect', 'Effect.ts', 'forkDetach', 'undocumented'],
  ['effect', 'Fiber.ts', 'join', 'undocumented'],
  // When, and on which stack, a waiter resumes.
  ['effect', 'Deferred.ts', 'await', 'undocumented'],
  ['effect', 'Deferred.ts', 'succeed', 'undocumented'],
  ['effect', 'Effect.ts', 'callback', 'undocumented'],
  // That a fiber forked before the clock moves is given one turn.
  ['effect', 'testing/TestClock.ts', 'adjust', 'undocumented'],
  // Rolls back when its effect fails or is interrupted, which its docs do not say when (decisions 0002 and 0013).
  // Fails the statements of a fiber that outlives it (decision 0243).
  ['effect', 'sql/SqlClient.ts', 'withTransaction', 'unstable'],
  ['effect', 'cluster/Entity.ts', 'toLayer', 'unstable'],
  ['effect', 'cluster/Entity.ts', 'defectRetryPolicy', 'unstable'],
  ['effect', 'cluster/Entity.ts', 'disableFatalDefects', 'unstable'],
  ['effect', 'cluster/ClusterSchema.ts', 'Persisted', 'unstable'],
  ['effect', 'cluster/ClusterSchema.ts', 'WithTransaction', 'unstable'],
  ['effect', 'cluster/ClusterSchema.ts', 'Uninterruptible', 'unstable'],
  ['effect', 'cluster/ShardingConfig.ts', 'entityRegistrationTimeout', 'unstable'],
  // Serializes access to the database, opens it in WAL mode, and begins a transaction with `BEGIN IMMEDIATE`, which
  // holds the write lock for its duration (decisions 0080 and 0092).
  ['@effect/sql-sqlite-bun', 'SqliteClient.ts', 'make', 'unstable'],
  ['@effect/sql-sqlite-bun', 'SqliteClient.ts', 'layer', 'unstable'],
]

/** The sources of Cluster, under `effect`'s `src/`, that say how its rows are written and read. */
const storage: ReadonlyArray<string> = [
  // The tables, their migrations, and the statements that write and read them.
  'cluster/SqlMessageStorage.ts',
  'cluster/SqlRunnerStorage.ts',
  // What a row encodes: a message, its envelope, its reply.
  'cluster/MessageStorage.ts',
  'cluster/Envelope.ts',
  'cluster/Reply.ts',
  'cluster/Message.ts',
  // The ids and the shards a row is keyed by.
  'cluster/Snowflake.ts',
  'cluster/ShardId.ts',
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

const stabilityTag = /^@stability\s+(\w+)/

/** The `@stability` of a declaration: the tag of its own comments, else the one of its module's first comment. */
const stabilityOf = (source: string, docs: ReadonlyArray<string>): string | undefined => {
  for (const line of docs) {
    const found = stabilityTag.exec(line)
    if (found !== null) return found[1]
  }
  const header = /\/\*\*([\s\S]*?)\*\//.exec(source.replaceAll('\r\n', '\n'))?.[1] ?? ''
  for (const line of header.split('\n')) {
    const found = stabilityTag.exec(line.replace(/^\s*\* ?/, ''))
    if (found !== null) return found[1]
  }
  return undefined
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

const folder = mkdtempSync(join(tmpdir(), 'effect-tea-persistent-docs-'))
/** The declarations and the files the lists name wrong. */
let wrong = 0
try {
  const sources = new Map<string, string>()
  for (const pkg of new Set(declarations.map(([pkg]) => pkg))) {
    for (const version of [oldVersion, newVersion]) {
      const into = mkdtempSync(join(folder, 'release-'))
      sources.set(`${pkg}@${version}`, unpack(pkg, version, into))
    }
  }
  for (const [pkg, file, name, why] of declarations) {
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
      : why === 'stable'
      ? 'stable'
      : before.length === 0
      ? 'added'
      : after.length === 0
      ? 'removed'
      : before.join('\n') === after.join('\n')
      ? 'same'
      : 'changed'
    if (status === 'missing') wrong++
    console.log([where, name, status].join('\t'))
    if (status === 'changed' || status === 'added' || status === 'removed') {
      for (const line of diff(before, after)) if (!line.startsWith('  ')) console.log(`\t${line}`)
    }
    if (after.length > 0) {
      const stability = stabilityOf(read(join(sources.get(`${pkg}@${newVersion}`)!, file)) ?? '', after)
      if ((why === 'unstable') === (stability === 'stable')) {
        wrong++
        console.log(`\tstability: ${stability ?? 'none'}, listed as ${why}`)
      }
    }
  }
  for (const file of storage) {
    const lines = (version: string) => read(join(sources.get(`effect@${version}`)!, file))?.replaceAll('\r\n', '\n')
    const before = lines(oldVersion)
    const after = lines(newVersion)
    const status = before === undefined && after === undefined
      ? 'missing'
      : before === undefined
      ? 'added'
      : after === undefined
      ? 'removed'
      : before === after
      ? 'same'
      : 'changed'
    if (status === 'missing') wrong++
    console.log(['storage', file, status].join('\t'))
    if (status !== 'same' && status !== 'missing') {
      const split = (text: string | undefined) => text === undefined ? [] : text.split('\n')
      for (const line of diff(split(before), split(after))) if (!line.startsWith('  ')) console.log(`\t${line}`)
    }
  }
} finally {
  rmSync(folder, { recursive: true, force: true })
}
process.exit(wrong === 0 ? 0 : 1)
