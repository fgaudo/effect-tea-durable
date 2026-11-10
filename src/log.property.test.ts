/**
 * The log over steps that fast-check generates: each consumer that acks what it read is given every row of its
 * topic once, and the rows of one entity in the order its steps wrote them, whatever pages it read, whatever part of
 * a page it acked, and whatever prunes ran between (decisions 0039, 0137, 0152).
 */
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import fc from 'fast-check'
import { launch } from './index.ts'
import { program } from './index.program.ts'
import type { Cursor } from './storage.ts'
import { client } from './storage.test_databases.ts'

const counter = program({
  state: Schema.Struct({ n: Schema.Int }),
  flags: Schema.Struct({ n: Schema.Int }),
  inbound: Schema.Union([Schema.TaggedStruct('Set', { n: Schema.Int }), Schema.TaggedStruct('Touch', {})]),
  projection: Schema.Struct({ n: Schema.Int }),
})({
  name: 'Counter',
  init: ({ n }) => ({ n }),
  // A step that leaves the projection as it was writes no row (decision 0038).
  update: (message) => (state) => message._tag === 'Set' ? { n: message.n } : state,
  project: (state) => state,
})

const ids = ['a', 'b', 'c', 'd']
const consumers = ['left', 'right'] as const
type Consumer = (typeof consumers)[number]

const act = fc.oneof(
  fc.record({ _tag: fc.constant('Set' as const), id: fc.constantFrom(...ids), n: fc.integer({ min: 0, max: 3 }) }),
  fc.record({ _tag: fc.constant('Touch' as const), id: fc.constantFrom(...ids) }),
  fc.record({
    _tag: fc.constant('Read' as const),
    consumer: fc.constantFrom(...consumers),
    limit: fc.integer({ min: 1, max: 4 }),
    // How many rows of the page are acked, from its first.
    acked: fc.integer({ min: 0, max: 4 }),
  }),
  fc.constant({ _tag: 'Prune' as const }),
)
const scenario = fc.record({
  created: fc.subarray(ids, { minLength: 1 }),
  acts: fc.array(act, { maxLength: 30 }),
})

/** The cursors that ack `rows`: in each partition, the highest `seq` among them. */
const through = (rows: ReadonlyArray<Cursor>): ReadonlyArray<Cursor> => {
  const highest = new Map<number, number>()
  for (const { partition, seq } of rows) highest.set(partition, Math.max(seq, highest.get(partition) ?? 0))
  return [...highest].map(([partition, seq]) => ({ partition, seq }))
}

test('each consumer acks every row of its topic once, and the rows of an entity in order', () =>
  fc.assert(
    fc.asyncProperty(scenario, ({ created, acts }) =>
      Effect.runPromise(
        Effect.scoped(Effect.gen(function*() {
          const counters = yield* (yield* launch()).deploy(counter, { consumers: { projection: consumers } })
          // What each entity's steps wrote in the topic, in order: the projection after each change.
          const written = new Map<string, Array<number>>()
          const acked = new Map<Consumer, Map<string, Array<number>>>(consumers.map((name) => [name, new Map()]))
          const read = (consumer: Consumer, limit: number, take: number) =>
            Effect.gen(function*() {
              const page = yield* counters.fetch('projection', consumer, limit)
              expect(page.length).toBeLessThanOrEqual(limit)
              const taken = page.slice(0, take)
              if (taken.length > 0) yield* counters.ack('projection', consumer, through(taken))
              for (const row of taken) {
                const seen = acked.get(consumer)!
                seen.set(row.id, [...(seen.get(row.id) ?? []), row.value.n])
              }
              return page.length
            })
          let at = 0
          for (const id of created) {
            yield* counters.create(id, { n: 0 }, { requestId: `create-${id}`, sender: null })
            written.set(id, [0])
          }
          for (const act of acts) {
            at++
            if (act._tag === 'Prune') yield* counters.prune
            else if (act._tag === 'Read') yield* read(act.consumer, act.limit, act.acked)
            else if (written.has(act.id)) {
              const message = act._tag === 'Set' ? { _tag: 'Set' as const, n: act.n } : { _tag: 'Touch' as const }
              yield* counters.send(act.id, message, { requestId: `step-${at}`, sender: null })
              const changes = written.get(act.id)!
              if (act._tag === 'Set' && changes.at(-1) !== act.n) changes.push(act.n)
            }
          }
          // Each consumer reads and acks to the end of the topic.
          for (const consumer of consumers) {
            while ((yield* read(consumer, 3, 3)) > 0) {}
            expect(Object.fromEntries(acked.get(consumer)!)).toEqual(Object.fromEntries(written))
          }
          // Once every consumer has acked every row, a prune drops them all.
          yield* counters.prune
          expect(yield* counters.published('projection', [], 1_000)).toEqual([])
        })).pipe(Effect.provide(client('sqlite')), Effect.orDie),
      )),
    { numRuns: Bun.env['SCHEDULES'] === 'all' ? 400 : 40 },
  ), 600_000)
