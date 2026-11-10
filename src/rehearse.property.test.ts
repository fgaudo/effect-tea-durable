/**
 * A rehearsal answers as the runtime does (decision 0200): the same messages, from the same senders under the same
 * request ids, are given the same replies and leave the same projection. fast-check generates the messages, and
 * the runtime runs on SQLite.
 */
import { expect, test } from 'bun:test'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import fc from 'fast-check'
import { launch } from './index.ts'
import { program, reject, rejectWith } from './index.program.ts'
import { rehearse } from './index.testing.ts'
import { client } from './storage.test_databases.ts'

const Sender = Schema.Struct({ role: Schema.Literals(['owner', 'clerk']) })

const account = program({
  state: Schema.Struct({ balance: Schema.Int, frozen: Schema.Boolean, moves: Schema.Int }),
  flags: Schema.Struct({ balance: Schema.Int }),
  sender: Sender,
  inbound: Schema.Union([
    Schema.TaggedStruct('Deposit', { amount: Schema.Int }),
    Schema.TaggedStruct('Withdraw', { amount: Schema.Int }),
    Schema.TaggedStruct('Freeze', {}),
    Schema.TaggedStruct('Unfreeze', {}),
  ]),
  rejection: Schema.Literals(['Insufficient', 'Frozen', 'NotAllowed']),
  projection: Schema.Struct({ balance: Schema.Int, frozen: Schema.Boolean, moves: Schema.Int }),
})({
  name: 'Account',
  init: ({ balance }) => ({ balance, frozen: false, moves: 0 }),
  update: (message, { from }) => (state) => {
    const owner = from._tag === 'Caller' && from.sender.role === 'owner'
    switch (message._tag) {
      case 'Freeze':
      case 'Unfreeze':
        return owner ? { ...state, frozen: message._tag === 'Freeze' } : rejectWith('NotAllowed')
      case 'Deposit':
      case 'Withdraw': {
        if (message.amount <= 0) return reject
        if (state.frozen) return rejectWith('Frozen')
        const balance = state.balance + (message._tag === 'Deposit' ? message.amount : -message.amount)
        return balance < 0 ? rejectWith('Insufficient') : { ...state, balance, moves: state.moves + 1 }
      }
    }
  },
  project: (state) => state,
})

type Message = typeof account extends { schemas: { inbound: Schema.Schema<infer M> } } ? M : never
type Role = 'owner' | 'clerk'

const message: fc.Arbitrary<Message> = fc.oneof(
  fc.record({ _tag: fc.constant('Deposit' as const), amount: fc.integer({ min: -2, max: 5 }) }),
  fc.record({ _tag: fc.constant('Withdraw' as const), amount: fc.integer({ min: -2, max: 5 }) }),
  fc.constant({ _tag: 'Freeze' as const }),
  fc.constant({ _tag: 'Unfreeze' as const }),
)
const sent = fc.record({
  message,
  role: fc.constantFrom<Role>('owner', 'clerk'),
  // A few request ids, so that a send is now and then a retry of an earlier one.
  requestId: fc.option(fc.constantFrom('r-1', 'r-2', 'r-3'), { nil: undefined }),
})
const scenario = fc.record({ balance: fc.integer({ min: 0, max: 5 }), sends: fc.array(sent, { maxLength: 14 }) })

type Scenario = typeof scenario extends fc.Arbitrary<infer S> ? S : never

/** A request id for each send that names none, which no other send uses: each is a new request. */
const named = (sends: Scenario['sends']) => sends.map((send, at) => send.requestId ?? `new-${at}`)

const rehearsed = ({ balance, sends }: Scenario) =>
  Effect.runPromise(Effect.gen(function*() {
    const replies: Array<unknown> = []
    let projection: unknown
    yield* rehearse(account, { flags: { balance }, at: DateTime.makeUnsafe(0) }, (entity) =>
      Effect.gen(function*() {
        for (const [at, { message, role, requestId }] of sends.entries()) {
          const request = requestId === undefined ? undefined : { requestId: named(sends)[at]! }
          replies.push(yield* entity.send(message, { sender: { role }, ...request }))
        }
        projection = yield* entity.projection
      }))
    return { replies, projection }
  }))

const ran = ({ balance, sends }: Scenario) =>
  Effect.runPromise(
    Effect.scoped(Effect.gen(function*() {
      const accounts = yield* (yield* launch()).deploy(account)
      yield* accounts.create('a', { flags: { balance }, requestId: 'create', sender: { role: 'owner' } })
      const replies: Array<unknown> = []
      for (const [at, { message, role }] of sends.entries()) {
        replies.push(yield* accounts.send('a', message, { requestId: named(sends)[at]!, sender: { role }, keep: 'forever' }))
      }
      return { replies, projection: yield* accounts.read('a') }
    })).pipe(Effect.provide(client('sqlite')), Effect.orDie),
  )

test('a rehearsal gives the replies and the projection the runtime gives', () =>
  fc.assert(
    fc.asyncProperty(scenario, async (scenario) => {
      expect(await rehearsed(scenario)).toEqual(await ran(scenario))
    }),
    { numRuns: Bun.env['SCHEDULES'] === 'all' ? 500 : 50 },
  ), 600_000)
