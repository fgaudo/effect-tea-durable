/**
 * The feed on the runtime: a source that gives its readings again until each is acknowledged, and meters that store
 * each reading once. A reading is acknowledged only once its meter stored its answer (decision 0272).
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import * as Ref from 'effect/Ref'
import * as Schedule from 'effect/Schedule'
import type * as Scope from 'effect/Scope'
import type { SqlClient } from 'effect/sql'
import { launch } from '@fgaudo/effect-tea-persistent'
import { defect } from '@fgaudo/effect-tea-persistent/program'
import { type Options, type Reading, run, type Source } from './feed.ts'
import { meter } from './meter.ts'

const database = <A, E>(test: Effect.Effect<A, E, SqlClient.SqlClient | Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(test).pipe(
      Effect.provide(SqliteClient.layer({ filename: ':memory:' })),
      Effect.orDie,
    ),
  )

/** A log of readings, which gives every reading after the last one acknowledged, as a partition of Kafka does. */
const log = (readings: ReadonlyArray<Reading>) =>
  Effect.map(Ref.make(-1), (acknowledged) => {
    const source: Source = {
      unacknowledged: Effect.map(Ref.get(acknowledged), (last) => readings.filter(({ offset }) => offset > last)),
      acknowledge: ({ offset }) => Ref.set(acknowledged, offset),
    }
    return { source, acknowledged: Ref.get(acknowledged), lost: Ref.set(acknowledged, -1) }
  })

const options: Options = { retry: Schedule.recurs(2), keep: { millis: 60_000 } }

// The meter as one would write it at first: a meter's index never goes back, so a lower index is a defect. A meter
// replaced counts again from 0, and suspends this version.
const first: typeof meter = {
  ...meter,
  update: (message, meta) => (state) =>
    message.index < state.index ? defect('a meter never goes back') : meter.update(message, meta)(state),
}

test('readings the source gives again are counted once, after the keep too', () =>
  database(Effect.gen(function*() {
    const runtime = yield* launch()
    const meters = yield* runtime.deploy(meter)
    const { source, acknowledged, lost } = yield* log([
      { offset: 0, meter: 'm-1', index: 10 },
      { offset: 1, meter: 'm-2', index: 4 },
      { offset: 2, meter: 'm-1', index: 25 },
    ])
    // A keep of no time at all: a reading given again is a new request, which the meter rejects as stale.
    const forgetful = { ...options, keep: { millis: 0 } }
    yield* run(meters, source, forgetful)
    expect(yield* acknowledged).toBe(2)
    // The feed created each meter at its first reading.
    expect(yield* meters.count({})).toBe(2)
    // The acknowledgements were lost, as by a crash before the source stored them: the source gives every reading again.
    yield* lost
    yield* run(meters, source, forgetful)
    yield* runtime.settled
    expect(yield* acknowledged).toBe(2)
    expect(yield* meters.read('m-1')).toEqual({ last: 2, kwh: 25 })
    expect(yield* meters.read('m-2')).toEqual({ last: 1, kwh: 4 })
  })))

const replaced: ReadonlyArray<Reading> = [
  { offset: 0, meter: 'm-1', index: 10 },
  { offset: 1, meter: 'm-1', index: 25 },
  // The meter was replaced: its index starts again from 0.
  { offset: 2, meter: 'm-1', index: 3 },
  { offset: 3, meter: 'm-1', index: 8 },
]

test('a reading its meter dies on is not acknowledged, and the fix applies it once', () =>
  database(Effect.gen(function*() {
    const { source, acknowledged } = yield* log(replaced)

    // The first process runs the first version, which dies on the replaced meter's reading.
    yield* Effect.scoped(Effect.gen(function*() {
      const runtime = yield* launch()
      const meters = yield* runtime.deploy(first)
      // The meter is answered `Suspended` at each try: it stored nothing of the reading yet.
      expect(yield* Effect.flip(run(meters, source, options))).toMatchObject({
        _tag: 'Unanswered',
        answer: 'Suspended',
        reading: { offset: 2 },
      })
      expect(yield* acknowledged).toBe(1)
      expect((yield* meters.suspended).map(({ id }) => id)).toEqual(['m-1'])
    }))

    // The fix is a deploy, by a new process on the same database. The resume applies the reading the meter died on,
    // and the feed, given it again, is answered from the stored reply.
    yield* Effect.scoped(Effect.gen(function*() {
      const runtime = yield* launch()
      const meters = yield* runtime.deploy(meter)
      expect(yield* meters.resume('m-1')).toEqual({ _tag: 'Resumed' })
      yield* run(meters, source, options)
      yield* runtime.settled
      expect(yield* acknowledged).toBe(3)
      expect(yield* meters.read('m-1')).toEqual({ last: 3, kwh: 10 + 15 + 3 + 5 })
    }))
  })))

// A discard stores no reply for a caller's message, so the feed's next try is a new request, and the meter dies on it
// again. To get past the reading, the feed skips it, or a fix rejects it (decision 0272).
test('a discard alone does not get the feed past a reading its meter dies on', () =>
  database(Effect.gen(function*() {
    const { source, acknowledged } = yield* log(replaced)
    const runtime = yield* launch()
    const meters = yield* runtime.deploy(first)
    yield* Effect.flip(run(meters, source, options))
    expect(yield* meters.discard('m-1')).toEqual({ _tag: 'Discarded' })
    yield* runtime.settled
    expect(yield* Effect.flip(run(meters, source, options))).toMatchObject({
      _tag: 'Unanswered',
      answer: 'Suspended',
      reading: { offset: 2 },
    })
    expect(yield* acknowledged).toBe(1)
  })))

// The source gave another reading under an offset it gave before. The feed stops there, and an operator decides
// which reading is right.
test('a reading under an offset given before to another reading stops the feed, unacknowledged', () =>
  database(Effect.gen(function*() {
    const runtime = yield* launch()
    const meters = yield* runtime.deploy(meter)
    const before = yield* log([{ offset: 0, meter: 'm-1', index: 10 }])
    yield* run(meters, before.source, options)
    const after = yield* log([{ offset: 0, meter: 'm-1', index: 12 }])
    expect(yield* Effect.flip(run(meters, after.source, options))).toMatchObject({
      _tag: 'ReusedOffset',
      reading: { offset: 0 },
    })
    expect(yield* after.acknowledged).toBe(-1)
    expect(yield* meters.read('m-1')).toEqual({ last: 0, kwh: 10 })
  })))
