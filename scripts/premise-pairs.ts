// Lists the pairs of notes that the code couples and that no note links, for the premise review of
// `.claude/skills/premise-review/SKILL.md`. A pair the notes link is found by the index and the notes' citations, and
// the review reads it already. A pair the code alone couples is found two ways.
// - By function: two notes cited in the comments of one top-level declaration of `src/`, tests excluded.
// A declaration with many notes couples many pairs, so the pairs are ranked by the number of notes of their
// declaration, the fewest first, and `--max=<n>` keeps those of declarations of at most n notes.
// - By table: every declaration that writes, deletes from or reads a table of the storage or of Cluster, with the
//   notes it cites. A row of 0248's bug was deleted by one note's rule and read by another's. A table is read whole
//   by one session, so its notes are listed and not paired.
// Which pairs and tables a session reads is the coordinator's choice: this script only measures.
// Run: `bun scripts/premise-pairs.ts`, with `--list` or `--list=<n>` for the pairs kept, `--note=0029,0078` for the
// pairs of those notes alone, and `--tables` for each table.

import { Glob } from 'bun'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const read = (path: string) => Bun.file(`${root}${path}`).text()

// The notes of the index, with what each decides, and the pairs its column `Changed by` links.
const index = await read('docs/decisions/README.md')
const decides = new Map<number, string>()
const linked = new Set<string>()
const key = (a: number, b: number) => (a < b ? `${a}-${b}` : `${b}-${a}`)
for (const line of index.split('\n')) {
  const row = /^\| \[(\d{4})\][^|]*\| ([^|]*) \|(.*)\|$/.exec(line)
  if (!row) continue
  const note = Number(row[1])
  decides.set(note, row[2]!.trim())
  for (const [, other] of row[3]!.matchAll(/\[(\d{4})\]/g)) linked.add(key(note, Number(other)))
}
const text = (note: number) => String(note).padStart(4, '0')

// A note links every note its text names by number.
for await (const path of new Glob('docs/decisions/{,archive/}[0-9][0-9][0-9][0-9]-*.md').scan(root)) {
  const note = Number(/(\d{4})-[^/\\]*\.md$/.exec(path)![1])
  for (const [, other] of (await read(path)).matchAll(/\b(\d{4})\b/g)) {
    const cited = Number(other)
    if (cited !== note && decides.has(cited)) linked.add(key(note, cited))
  }
}

// The notes a comment cites, as `decision 0029` or `decisions 0159, 0175 and 0176`, once its lines are joined.
const citedIn = (code: string): Set<number> => {
  const notes = new Set<number>()
  const joined = code.replace(/\n\s*(\/\/|\*)\s?/g, ' ')
  for (const [list] of joined.matchAll(/\bdecisions? \d{4}(?:(?:,? and |, | or | to )\d{4})*/g)) {
    for (const [number] of list.matchAll(/\d{4}/g)) if (decides.has(Number(number))) notes.add(Number(number))
  }
  return notes
}

// A declaration starts at column 0, or at column 2 inside one, as a function a factory such as `entitiesOf` holds:
// a factory of the storage cites twenty notes and more, which a pair by the factory would couple all together. A
// declaration holds the comment lines right above it, and runs to the next declaration.
type Declaration = { file: string; line: number; name: string; code: string; notes: Set<number> }
const start = /^(export |const |let |function |async function |class |type |interface |declare )/
const inner = /^ {2}(const |let |function |async function )/
const declarations: Declaration[] = []
for await (const file of new Glob('src/**/*.ts').scan(root)) {
  const path = file.replaceAll('\\', '/')
  if (/\.test(_\w+)?\.ts$/.test(path)) continue
  const lines = (await read(path)).split('\n')
  let current: Declaration | undefined
  let outer = ''
  let comment: string[] = []
  const close = () => {
    if (current) declarations.push({ ...current, notes: citedIn(current.code) })
  }
  lines.forEach((line, at) => {
    if (/^\s*(\/\/|\/\*\*|\*)/.test(line)) {
      comment.push(line)
      return
    }
    const top = start.test(line)
    if (top || (outer !== '' && inner.test(line))) {
      close()
      const name = /^[\w ]*?(?:const|let|function|class|type|interface)\s+(\w+)/.exec(line.trim())?.[1] ?? line.slice(0, 40)
      if (top) outer = name
      const full = top ? name : `${outer}.${name}`
      current = { file: path, line: at + 1, name: full, code: [...comment, line].join('\n'), notes: new Set() }
    } else if (current) current.code += '\n' + [...comment, line].join('\n')
    comment = []
  })
  close()
}

type Pair = { a: number; b: number; how: string; size: number }
const pairs = new Map<string, Pair>()
const add = (a: number, b: number, how: string, size: number) => {
  if (a === b || linked.has(key(a, b))) return
  const known = pairs.get(key(a, b))
  if (known === undefined || size < known.size) pairs.set(key(a, b), { a: Math.min(a, b), b: Math.max(a, b), how, size })
}

for (const declaration of declarations) {
  const notes = [...declaration.notes]
  for (const a of notes) {
    for (const b of notes) if (a < b) add(a, b, `${declaration.file}:${declaration.line} ${declaration.name}`, notes.length)
  }
}

// The tables: those the storage creates, and Cluster's, which `src/storage/cluster.ts` names by a constant. Each is
// listed with the declarations that write it and those that read it, and the notes each cites: the entry of a session
// of the review that reads one shared state.
const tables = [...(await read('src/storage/tables.ts')).matchAll(/CREATE TABLE (\w+)/g)].map(([, name]) => [name!, name!])
tables.push(['cluster_messages', 'clusterMessages'], ['cluster_replies', 'clusterReplies'])
const touches = tables.map(([table, constant]) => {
  const name = String.raw`(?:\$\{sql\()?(?:${table}|${constant})\b`
  const writes = new RegExp(String.raw`(INSERT INTO|UPDATE|DELETE FROM)\s+` + name)
  const reads = new RegExp(String.raw`(?<!DELETE )(FROM|JOIN)\s+` + name)
  const of = (test: RegExp) => declarations.filter((declaration) => test.test(declaration.code))
  return { table: table!, writers: of(writes), readers: of(reads) }
})

const ranked = [...pairs.values()].sort((x, y) => x.size - y.size || x.a - y.a || x.b - y.b)
const cited = new Set(declarations.flatMap((declaration) => [...declaration.notes]))
const bySize = new Map<number, number>()
for (const pair of ranked) bySize.set(pair.size, (bySize.get(pair.size) ?? 0) + 1)
const option = (name: string) => process.argv.find((argument) => argument.startsWith(`--${name}`))
const max = Number(option('max')?.split('=')[1] ?? Infinity)
const of = option('note')?.split('=')[1]?.split(',').map(Number)
const kept = ranked.filter((pair) => pair.size <= max && (of === undefined || of.includes(pair.a) || of.includes(pair.b)))

console.log(`${decides.size} notes in the index, ${cited.size} cited by the code, ${linked.size} pairs the notes link`)
console.log(`${ranked.length} pairs one declaration couples and no note links, ${kept.length} of declarations of at most ${max} notes`)
console.log(`by the notes of their declaration: ${[...bySize].map(([size, count]) => `${size}: ${count}`).join(', ')}`)
const list = option('list')
if (list !== undefined) {
  const count = list.includes('=') ? Number(list.split('=')[1]) : kept.length
  for (const pair of kept.slice(0, count)) {
    console.log(`${text(pair.a)} ${decides.get(pair.a)}\n  ${text(pair.b)} ${decides.get(pair.b)}\n  ${pair.how}`)
  }
}
const at = (declaration: Declaration) =>
  `${declaration.file}:${declaration.line} ${declaration.name} (${[...declaration.notes].map(text).join(', ') || 'no note'})`
if (option('tables') !== undefined) {
  for (const { table, writers, readers } of touches) {
    console.log(`${table}\n  written by:\n${writers.map((w) => `    ${at(w)}`).join('\n')}`)
    console.log(`  read by:\n${readers.map((r) => `    ${at(r)}`).join('\n')}`)
  }
} else {
  const notes = touches.map(({ table, writers, readers }) => {
    const all = new Set([...writers, ...readers].flatMap((declaration) => [...declaration.notes]))
    return `${table} ${writers.length}w/${readers.length}r/${all.size} notes`
  })
  console.log(`the tables, by their writers, readers and notes: ${notes.join('; ')}`)
}
