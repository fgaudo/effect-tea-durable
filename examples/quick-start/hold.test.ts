import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import { launch } from '@fgaudo/effect-tea-persistent'
import { rehearse, rejected } from '@fgaudo/effect-tea-persistent/testing'
import { hold } from './hold.ts'

// Rehearsed, without a database or a clock: the timer fires because the test fires it.
test('a seat nobody confirms in time is released', () =>
  Effect.runPromise(rehearse(
    hold,
    { at: DateTime.makeUnsafe('2026-11-08T10:00:00Z') },
    Effect.fnUntraced(function*(rehearsal) {
      yield* rehearsal.fire('expiry')
      expect(yield* rehearsal.send({ _tag: 'Confirm' })).toMatchObject(rejected)
      expect(yield* rehearsal.projection).toEqual({ status: 'Released' })
    }),
  )))

// Launched on SQLite: the state is stored, and a retry of a request is answered as the first time.
test('a seat confirmed in time is confirmed once', () =>
  Effect.runPromise(Effect.scoped(Effect.gen(function*() {
    const runtime = yield* launch()
    const holds = yield* runtime.deploy(hold)
    yield* holds.create('seat-12', { requestId: 'hold-1' })
    // The reply is kept a day, so a retry within it is answered as the first time.
    const confirm = { requestId: 'confirm-1', keep: { millis: 86_400_000 } }
    expect(yield* holds.send('seat-12', { _tag: 'Confirm' }, confirm)).toEqual({ _tag: 'Accepted' })
    expect(yield* holds.send('seat-12', { _tag: 'Confirm' }, confirm)).toEqual({ _tag: 'Accepted' })
    expect(yield* holds.read('seat-12')).toEqual({ status: 'Confirmed' })
  })).pipe(Effect.provide(SqliteClient.layer({ filename: ':memory:' })))))
