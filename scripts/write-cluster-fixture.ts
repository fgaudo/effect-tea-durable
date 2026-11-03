/**
 * Writes the fixture of Cluster's rows at the version of `effect` installed, for
 * `spikes/cluster-reads-the-rows-an-older-release-wrote.test.ts` (`AGENTS.md`). A move of Effect's version runs it
 * once the spikes pass on the new release, and commits the fixture it writes.
 *
 *     bun scripts/write-cluster-fixture.ts
 *
 * The fixture is `spikes/fixtures/cluster-<version>.db`. A fixture that exists is not written again.
 */
import * as Effect from 'effect/Effect'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { write } from '../spikes/cluster-fixture.ts'

const root = join(import.meta.dir, '..')
const { version } = JSON.parse(readFileSync(join(root, 'node_modules', 'effect', 'package.json'), 'utf8'))
const filename = join(root, 'spikes', 'fixtures', `cluster-${version}.db`)
if (existsSync(filename)) {
  console.error(`${filename} exists`)
  process.exit(1)
}
await Effect.runPromise(write(filename))
for (const left of ['-wal', '-shm', '-journal']) {
  if (existsSync(filename + left)) {
    console.error(`${filename + left} is left: the database was not closed`)
    process.exit(1)
  }
}
console.log(filename)
