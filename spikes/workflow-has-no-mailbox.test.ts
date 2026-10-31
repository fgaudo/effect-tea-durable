/**
 * What decision 0007 says of Effect Workflow, at `effect` 4.1.1, past what a run can show: that its signals are
 * named wait points with no mailbox. A mailbox's absence is no behaviour; what is seen here is what a program does
 * without one, and what the modules are, so that a release that adds one fails here and 0007 is read again.
 */
import { expect, test } from 'bun:test'
import * as Effect from 'effect/Effect'
import * as Option from 'effect/Option'
import * as Schema from 'effect/Schema'
import * as Workflows from 'effect/workflow'
import { DurableDeferred, Workflow, WorkflowEngine } from 'effect/workflow'

test('messages through numbered signals: a sender must know the number, and each run reads every one before', () => {
  let runs = 0
  let reads = 0
  const message = (n: number) => DurableDeferred.make(`message-${n}`, { success: Schema.String })
  const flow = Workflow.make('Inbox', {
    payload: { id: Schema.String },
    success: Schema.Array(Schema.String),
    idempotencyKey: ({ id }) => id,
  })
  const layer = flow.toLayer(() =>
    Effect.gen(function*() {
      runs++
      const received: Array<string> = []
      for (const n of [1, 2, 3]) {
        received.push(yield* DurableDeferred.await(message(n)))
        reads++
      }
      return received
    })
  )
  return Effect.runPromise(Effect.gen(function*() {
    const executionId = yield* flow.execute({ id: 'one' }, { discard: true })
    // Parked on a signal, once its run has read `count` of them.
    const parked = (count: number) =>
      Effect.repeat(Effect.zip(Effect.sync(() => reads), flow.poll(executionId)), {
        until: ([read, result]) => read >= count && Option.isSome(result) && result.value._tag === 'Suspended',
      })
    const send = (n: number, value: string) =>
      DurableDeferred.succeed(message(n), {
        token: DurableDeferred.tokenFromExecutionId(message(n), { workflow: flow, executionId }),
        value,
      })
    yield* parked(0)
    // Two senders that each take the next message to be the first: the second one's is lost, and nothing says so.
    yield* send(1, 'a')
    yield* send(1, 'b')
    yield* parked(1)
    yield* send(2, 'c')
    yield* parked(3)
    yield* send(3, 'd')
    expect(yield* flow.execute({ id: 'one' })).toEqual(['a', 'c', 'd'])
  }).pipe(Effect.provide(layer), Effect.provide(WorkflowEngine.layerMemory))).then(() => {
    // A run to the first wait, and one for each message, each from the start.
    expect(runs).toBe(4)
    // Each run read again every message before its own: 1 + 2 + 3, growing with the messages, with no snapshot.
    expect(reads).toBe(6)
  })
})

test('effect/workflow has these modules, none of them a mailbox into a workflow', () => {
  // `DurableQueue` sends from a workflow to workers, and waits for their result on a `DurableDeferred`.
  expect(Object.keys(Workflows).sort()).toEqual([
    'Activity',
    'DurableClock',
    'DurableDeferred',
    'DurableQueue',
    'Workflow',
    'WorkflowEngine',
    'WorkflowProxy',
    'WorkflowProxyServer',
  ])
})
