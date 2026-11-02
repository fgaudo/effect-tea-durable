/**
 * What decision 0007 says of Effect Workflow, at `effect` 4.1.2, on its engine in memory: a workflow that waits
 * on a signal is run again from the start of its body when the signal comes, its activities answered from what
 * they recorded, and a signal is one wait point that takes one value, which a second completion does not change.
 */
import { expect, test } from 'bun:test'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import { Activity, DurableDeferred, Workflow, WorkflowEngine } from 'effect/workflow'

test('a workflow replays its body past a signal, which takes one value', () => {
  let runs = 0
  let acts = 0
  const signal = DurableDeferred.make('signal', { success: Schema.String })
  const flow = Workflow.make('Flow', {
    payload: { id: Schema.String },
    success: Schema.String,
    idempotencyKey: ({ id }) => id,
  })
  return Effect.runPromise(Effect.gen(function*() {
    const waiting = yield* Deferred.make<DurableDeferred.Token>()
    const layer = flow.toLayer(() =>
      Effect.gen(function*() {
        runs++
        yield* Activity.make({ name: 'act', execute: Effect.sync(() => void acts++) })
        yield* Deferred.succeed(waiting, yield* DurableDeferred.token(signal))
        return yield* DurableDeferred.await(signal)
      })
    )
    yield* Effect.gen(function*() {
      const executionId = yield* flow.execute({ id: 'one' }, { discard: true })
      const token = yield* Deferred.await(waiting)
      // The run is parked on the signal before the signal comes, as a workflow waits for one from outside.
      yield* Effect.repeat(flow.poll(executionId), {
        until: (result) => Option.isSome(result) && result.value._tag === 'Suspended',
      })
      yield* DurableDeferred.succeed(signal, { token, value: 'first' })
      yield* DurableDeferred.succeed(signal, { token, value: 'second' })
      const result = yield* flow.execute({ id: 'one' })
      expect(result).toBe('first')
      expect(Option.isSome(yield* flow.poll(executionId))).toBe(true)
    }).pipe(Effect.provide(layer))
  }).pipe(Effect.provide(WorkflowEngine.layerMemory))).then(() => {
    // The body ran once to the wait, and again from its start once the signal came: no snapshot of where it was.
    expect(runs).toBe(2)
    // The activity ran once, and its second reading was its recorded result.
    expect(acts).toBe(1)
  })
})
