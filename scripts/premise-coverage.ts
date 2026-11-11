// Checks that the roadmap's step of the premise review covers every note of the index, as
// `.claude/skills/premise-review/SKILL.md` asks after each review. It reads the step's text, not a format of its own:
// a section of the index named in a bullet that starts `Done` is read; the numbered areas after `The areas left` are
// still to read, unless one starts `Done`; the bullet that starts `Each area also reads` lists the later notes not reached.
// Run: `bun scripts/premise-coverage.ts`. It exits 1 with each gap it finds.

const index = await Bun.file(new URL('../docs/decisions/README.md', import.meta.url)).text()
const roadmap = await Bun.file(new URL('../docs/roadmap.md', import.meta.url)).text()

const sections = new Map<string, Set<number>>()
let section = ''
for (const line of index.split('\n')) {
  if (line.startsWith('## ')) section = line.slice(3).trim()
  const note = /^\| \[(\d{4})\]/.exec(line)
  if (note) {
    const notes = sections.get(section) ?? new Set<number>()
    notes.add(Number(note[1]))
    sections.set(section, notes)
  }
}
const all = new Set([...sections.values()].flatMap((notes) => [...notes]))

const start = roadmap.indexOf('- **A review of every note that changes another')
if (start === -1) {
  console.log('the roadmap holds no step of the premise review')
  process.exit(0)
}
const end = roadmap.indexOf('\n- **', start + 1)
const step = roadmap.slice(start, end === -1 ? undefined : end)

// The step's bullets, each with its lines joined, so that a range cut by a line break reads as one.
const bullets = step.split(/\n  - /).slice(1).map((bullet) => bullet.split(/\s+/).join(' '))

// Four-digit numbers and `a to b` ranges of a text.
const notesOf = (text: string): Set<number> => {
  const notes = new Set<number>()
  for (const [, from, to] of text.matchAll(/\b(\d{4})\b(?: to (\d{4})\b)?/g)) {
    for (let note = Number(from); note <= Number(to ?? from); note++) if (all.has(note)) notes.add(note)
  }
  return notes
}

// A section is read where a `Done` bullet names it after `section`, `sections` or `and`, as `the sections Creation
// and Defects`.
const read = new Set<number>()
for (const bullet of bullets.filter((bullet) => bullet.startsWith('Done'))) {
  for (const [name, notes] of sections) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    if (new RegExp(`\\b(sections?|and) ${escaped}\\b`).test(bullet)) for (const note of notes) read.add(note)
  }
}
const text = (note: number) => String(note).padStart(4, '0')

const errors: string[] = []
const areasBullet = bullets.find((bullet) => bullet.includes('The areas left'))
if (areasBullet === undefined) errors.push('no bullet lists `The areas left`')

// An area of the list that a session has read starts with `Done`, and stays in the list, so that an area that is part
// of a section counts its own notes as read and not the section's.
const areaTexts = (areasBullet ?? '').split(/ \d{1,2}\. /).slice(1)
const areas = areaTexts.map(notesOf)
const toRead = new Map<number, number>()
areas.forEach((notes, area) => {
  if (areaTexts[area]!.startsWith('Done')) {
    for (const note of notes) {
      if (read.has(note)) errors.push(`${text(note)} is in area ${area + 1}, but its section is read`)
      read.add(note)
    }
    return
  }
  for (const note of notes) {
    if (read.has(note)) errors.push(`${text(note)} is in area ${area + 1}, but its section is read`)
    if (toRead.has(note)) errors.push(`${text(note)} is in areas ${toRead.get(note)! + 1} and ${area + 1}`)
    toRead.set(note, area)
  }
})
for (const note of all) {
  if (!read.has(note) && !toRead.has(note)) errors.push(`${text(note)} is in no section read and no area left`)
}

const reached = bullets.find((bullet) => bullet.startsWith('Each area also reads'))
for (const note of notesOf(reached ?? '')) {
  if (!toRead.has(note)) errors.push(`${text(note)} is a later note not reached whose area is read: give it to the last session`)
}

const spread = [...sections].map(([name, notes]) => `${name}: ${[...notes].filter((note) => read.has(note)).length}/${notes.size}`)
console.log(`read, by section: ${spread.join('; ')}`)
const left = areaTexts.filter((area) => !area.startsWith('Done'))
console.log(`${read.size} notes read, ${toRead.size} in ${left.length} areas left, of ${all.size}`)
if (left.length > 0) console.log(`next area: ${left[0]!.split(':')[0]}`)
if (errors.length > 0) {
  for (const error of errors) console.error(error)
  process.exit(1)
}
console.log('every note of the index is read or in one area left')
