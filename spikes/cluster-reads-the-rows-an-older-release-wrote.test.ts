/**
 * What decision 0116 checks at a move of Effect's version: the release installed reads the rows of Cluster that the
 * releases of the fixtures wrote, on `SingleRunner` over a SQLite file. Each fixture in `spikes/fixtures` was written by
 * `scripts/write-cluster-fixture.ts` at the release it names. Its migrations run, a handled request's primary key is
 * answered from its stored reply without the handler, and a request stored and not processed is delivered once.
 */
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Counter, processOn } from './cluster-fixture.ts'

const fixtures = join(import.meta.dir, 'fixtures')
const written = readdirSync(fixtures).filter((name) => /^cluster-.+\.db$/.test(name))

test('a fixture of Cluster\'s rows is kept', () => {
  expect(written).not.toEqual([])
})

for (const name of written) {
  test(`the rows ${name} holds are read by the release installed`, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'effect-tea-durable-spike-'))
    // A copy: the migrations and the handler write into the file.
    const filename = join(directory, 'store.db')
    copyFileSync(join(fixtures, name), filename)
    const runs = new Map<string, number>()
    try {
      await Effect.runPromise(Effect.gen(function*() {
        const client = (yield* Counter.client)('one')
        // `a` was answered 1 by the release that wrote the fixture; its handler does not run here.
        expect(yield* client.Hit({ key: 'a' })).toBe(1)
        expect(runs.get('a')).toBeUndefined()
        // `b` was stored and not processed: the same primary key waits for its delivery, which runs it once.
        expect(yield* client.Hit({ key: 'b' })).toBe(1)
        expect(runs.get('b')).toBe(1)
      }).pipe(Effect.provide(processOn(filename, runs))))
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  }, 30_000)
}
