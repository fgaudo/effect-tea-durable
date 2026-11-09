// Builds the documentation site into `site/dist/`. The README is its home page. The guide, the design and the
// glossary are TypeDoc documents, and each example is a page of its README followed by its files. The API reference
// is generated from the four entries of `src/`, and the diagrams are drawn by `mermaid.ts`. A warning of TypeDoc
// fails the build, since it is a doc comment or a link to fix.
import { $ } from 'bun'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, posix, relative, resolve } from 'node:path'

const here = import.meta.dir
const root = resolve(here, '..')
const build = join(here, '.build')
const dist = join(here, 'dist')
const repository = 'https://github.com/fgaudo/effect-tea-durable'
const revision = (await $`git rev-parse HEAD`.cwd(root).text()).trim()

/** A path of the repository, with forward slashes, from its root. */
const repo = (path: string) => relative(root, path).replaceAll('\\', '/')

const guide = ['README.md', 'children.md', 'outbox.md', 'schemas.md', 'cluster.md', 'operator.md'].map((page) =>
  `docs/guide/${page}`
)
const examples = readdirSync(join(root, 'examples')).filter((name) => existsSync(join(root, 'examples', name, 'README.md')))
// The pages of the site, by their path in the repository, with the group each is listed under.
const pages = new Map<string, string>([
  ...guide.map((page) => [page, 'Guide'] as const),
  ['docs/design.md', 'Specification'],
  ['docs/glossary.md', 'Specification'],
  ...examples.map((name) => [`examples/${name}/README.md`, 'Examples'] as const),
])

/**
 * Where a link of a page goes on the site. A link to a page of the site stays relative, and TypeDoc resolves it. A
 * link to an example's folder or to one of its files goes to the example's page. Any other link goes to the file on
 * GitHub, at the revision built, since the site does not hold it.
 */
const target = (from: string, link: string) => {
  if (/^(https?:|mailto:|#)/.test(link)) return link
  const [path = '', anchor] = link.split('#')
  const absolute = resolve(root, dirname(from), decodeURIComponent(path))
  const at = repo(absolute)
  const example = /^examples\/([^/]+)/.exec(at)?.[1]
  const page = pages.has(at) || at === 'README.md'
    ? at
    : example !== undefined && examples.includes(example)
    ? `examples/${example}/README.md`
    : undefined
  if (page !== undefined) {
    const relativeLink = posix.relative(posix.dirname(from), page) || posix.basename(page)
    // A file of an example is a section of the example's page, under a heading that is the file's name, which
    // TypeDoc makes an anchor of without its dots.
    const section = page === at
      ? anchor
      : at.endsWith('.ts')
      ? posix.basename(at).toLowerCase().replace(/[^\w-]/g, '')
      : undefined
    return section === undefined ? relativeLink : `${relativeLink}#${section}`
  }
  const kind = existsSync(absolute) && statSync(absolute).isDirectory() ? 'tree' : 'blob'
  return `${repository}/${kind}/${revision}/${at}${anchor === undefined ? '' : `#${anchor}`}`
}

const links = (from: string, text: string) =>
  text.replace(/\]\(([^)\s]+)\)/g, (_, link: string) => `](${target(from, link)})`)

const read = (path: string) => Bun.file(join(root, path)).text().then((text) => text.replaceAll('\r\n', '\n'))

/** A page as TypeDoc reads it: its title and group in front matter, and its links rewritten. */
const page = async (path: string, group: string) => {
  let text = await read(path)
  const title = /^# (.+)$/m.exec(text)?.[1]
  if (title === undefined) throw new Error(`${path} has no title`)
  const front = [`title: ${JSON.stringify(title.replaceAll('`', ''))}`, `group: ${group}`]
  if (path === 'docs/guide/README.md') {
    front.push('children:', ...guide.slice(1).map((child) => `  - ${posix.basename(child)}`))
  }
  if (path.startsWith('examples/')) {
    const folder = posix.dirname(path)
    const files = readdirSync(join(root, folder)).filter((file) => file.endsWith('.ts'))
      .sort((a, b) => Number(a.endsWith('.test.ts')) - Number(b.endsWith('.test.ts')) || a.localeCompare(b))
    for (const file of files) text += `\n## ${file}\n\n\`\`\`ts\n${await read(`${folder}/${file}`)}\`\`\`\n`
  }
  return `---\n${front.join('\n')}\n---\n\n${links(path, text)}`
}

await $`rm -rf ${build} ${dist}`
for (const [path, group] of pages) await Bun.write(join(build, path), await page(path, group))
await Bun.write(join(build, 'README.md'), links('README.md', await read('README.md')))
await $`bun build custom.ts --outfile .build/custom.js --format iife --target browser --minify`.cwd(here)
const documents = [...pages.keys()].filter((path) => !guide.slice(1).includes(path)).map((path) => `.build/${path}`)
await $`bunx typedoc --readme .build/README.md --gitRevision ${revision} ${documents.flatMap((path) => [
  '--projectDocuments',
  path,
])}`.cwd(here)
// Split, so that a page loads only the kinds of diagram it draws.
await $`bun build mermaid.ts --outdir ${dist}/assets/mermaid --splitting --target browser --minify`.cwd(here)

// A citation of a note, `decision 0193`, links the note on GitHub, in the pages and in the doc comments alike. Only
// text outside a tag and outside a link is read, so that no link is nested in another. A note deleted keeps its
// citation as text.
const notes = new Map<string, string>()
for (const folder of ['docs/decisions', 'docs/decisions/archive']) {
  for (const name of readdirSync(join(root, folder))) {
    const number = /^(\d{4})-/.exec(name)?.[1]
    if (number !== undefined) notes.set(number, `${repository}/blob/${revision}/${folder}/${name}`)
  }
}
const cite = (text: string) =>
  text.replace(/\bdecisions? 0\d{3}(?:,? (?:and |to )?0\d{3})*/g, (citation) =>
    citation.replace(/0\d{3}/g, (number) => {
      const note = notes.get(number)
      return note === undefined ? number : `<a href="${note}">${number}</a>`
    }))
for (const file of readdirSync(dist, { recursive: true, encoding: 'utf8' }).filter((file) => file.endsWith('.html'))) {
  const html = await Bun.file(join(dist, file)).text()
  const cited = html.split(/(<a\b[\s\S]*?<\/a>|<[^>]*>)/).map((piece, at) => at % 2 === 0 ? cite(piece) : piece)
  await Bun.write(join(dist, file), cited.join(''))
}
