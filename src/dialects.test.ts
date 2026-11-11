/**
 * The storage speaks SQLite and PostgreSQL, and a program answers alike on both (decision 0157). Here fast-check
 * generates what callers give: ids, request ids, senders, flags, messages and the criteria of a reading, with text
 * no database holds and numbers no index compares among them. The same calls run on a new database of each dialect,
 * and each answer, whether a value or a refusal, is the same on both.
 */
import { expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Schema from 'effect/Schema'
import fc from 'fast-check'
import { launch } from './index.ts'
import { defect, program } from './index.program.ts'
import type { Comparison, Dialect } from './storage.ts'
import { client } from './storage.test_databases.ts'

const fields = {
  label: Schema.String,
  amount: Schema.Number,
  flag: Schema.Boolean,
  note: Schema.NullOr(Schema.String),
}

const item = program({
  state: Schema.Struct(fields),
  flags: Schema.Struct(fields),
  sender: Schema.String,
  inbound: Schema.Union([
    Schema.TaggedStruct('Set', fields),
    Schema.TaggedStruct('Boom', { note: Schema.String }),
  ]),
  projection: Schema.Struct(fields),
})({
  name: 'Item',
  init: (flags) => flags,
  update: (message) => (state) => {
    if (message._tag === 'Boom') return defect(`cannot handle ${message.note}`)
    const { _tag, ...set } = message
    return { ...state, ...set }
  },
  project: (state) => state,
  indexes: {
    label: (p) => p.label,
    amount: (p) => p.amount,
    flag: (p) => p.flag,
    note: (p) => p.note,
  },
})

type Index = 'label' | 'amount' | 'flag' | 'note'

/**
 * Text that is mostly plain, so that entities are made and found, and else U+0000, a lone surrogate or a character
 * of any plane, which a database may hold otherwise or not at all.
 */
const text = fc.oneof(
  { arbitrary: fc.constantFrom('', 'a', 'b', 'A', 'ab', 'é', '😀', ' ', 'NULL', '10', '9'), weight: 4 },
  { arbitrary: fc.string({ unit: 'binary', maxLength: 6 }), weight: 1 },
  { arbitrary: fc.constantFrom('\u0000', '\ud800', '\udc00', 'a\u0000b', '￿'), weight: 1 },
)
/** Numbers that are mostly small integers, so that they tie, and else any double, the limits of `2^53` among them. */
const number = fc.oneof(
  { arbitrary: fc.integer({ min: -3, max: 3 }), weight: 4 },
  { arbitrary: fc.double(), weight: 1 },
  {
    arbitrary: fc.constantFrom(-0, 0.1, 2 ** 53, 2 ** 53 + 2, -(2 ** 53), Number.MAX_VALUE, Number.MIN_VALUE),
    weight: 1,
  },
)
const scalar = fc.oneof(text, number, fc.boolean(), fc.constant(null))
const values = fc.record({ label: text, amount: number, flag: fc.boolean(), note: fc.option(text, { nil: null }) })
const index = fc.constantFrom<Index>('label', 'amount', 'flag', 'note')
const comparison = fc.constantFrom<Comparison>('=', '<>', '<', '<=', '>', '>=')
const criteria = fc.array(fc.record({ index, is: comparison, value: scalar }), { maxLength: 2 })

/** A few ids and request ids, drawn again and again, so that calls meet the same entity and the same request. */
const pool = fc.uniqueArray(text, { minLength: 1, maxLength: 5 })

const calls = (ids: ReadonlyArray<string>, requests: ReadonlyArray<string>) => {
  const id = fc.constantFrom(...ids)
  const request = fc.record({ requestId: fc.constantFrom(...requests), sender: text })
  const create = fc.record({ _tag: fc.constant('Create' as const), id, flags: values, request })
  const call = fc.oneof(
    create,
    fc.record({ _tag: fc.constant('Set' as const), id, set: values, request }),
    fc.record({ _tag: fc.constant('Boom' as const), id, note: text, request }),
    fc.record({ _tag: fc.constant('Read' as const), id }),
    fc.record({
      _tag: fc.constant('Query' as const),
      where: criteria,
      order: fc.option(fc.record({ index, descending: fc.boolean() }), { nil: undefined }),
      limit: fc.integer({ min: 0, max: 6 }),
    }),
    fc.record({ _tag: fc.constant('Count' as const), where: criteria }),
    fc.record({ _tag: fc.constant('Sum' as const), index, where: criteria }),
    fc.record({ _tag: fc.constant('CountBy' as const), index, where: criteria, limit: fc.integer({ min: 0, max: 6 }) }),
    fc.record({ _tag: fc.constant('Suspended' as const) }),
  )
  // The entities are made first, so that the readings after them have rows to compare.
  return fc.tuple(fc.array(create, { minLength: 1, maxLength: 6 }), fc.array(call, { minLength: 1, maxLength: 16 }))
    .map(([made, rest]) => [...made, ...rest])
}

const scenario = fc.tuple(pool, pool).chain(([ids, requests]) => calls(ids, requests))

type Call = typeof scenario extends fc.Arbitrary<ReadonlyArray<infer C>> ? C : never

/** An answer as both dialects must give it: a value, or how the call was refused, without the words of its defect. */
const outcome = (exit: Exit.Exit<unknown, unknown>): unknown =>
  Exit.isSuccess(exit)
    ? { value: exit.value }
    : { refused: Cause.hasDies(exit.cause) ? 'defect' : Cause.hasFails(exit.cause) ? 'failure' : 'interrupted' }

/**
 * A total as a dialect gives it, with the total of its magnitudes. PostgreSQL adds exactly and SQLite with a
 * compensated sum, so two totals may differ by a rounding of the total of magnitudes (decision 0209).
 */
class Total {
  constructor(readonly value: number, readonly magnitudes: number) {}
}

/** Whether the answers of two dialects are alike: equal, and two totals within a few units of their last place. */
const alike = (left: ReadonlyArray<unknown>, right: ReadonlyArray<unknown>) => {
  const settled = (answers: ReadonlyArray<unknown>, other: ReadonlyArray<unknown>) =>
    answers.map((answer, at) => {
      const theirs = other[at]
      if (!(answer instanceof Total)) return answer
      const bound = 8 * Number.EPSILON * Math.max(answer.magnitudes, theirs instanceof Total ? theirs.magnitudes : 0)
      return theirs instanceof Total && Math.abs(answer.value - theirs.value) <= bound
        ? 'a total within the bound'
        : { total: answer.value, magnitudes: answer.magnitudes }
    })
  expect(settled(left, right)).toEqual(settled(right, left))
}

const run = (dialect: Dialect, calls: ReadonlyArray<Call>) =>
  Effect.runPromise(
    Effect.scoped(Effect.gen(function*() {
      const items = yield* (yield* launch()).deploy(item)
      const answers: Array<unknown> = []
      for (const call of calls) {
        if (call._tag === 'Sum') {
          const exit = yield* Effect.exit(items.sum({ index: call.index, where: call.where }))
          if (Exit.isFailure(exit)) {
            answers.push(outcome(exit))
            continue
          }
          // The rows the sum added, read as a query finds them, give the total of their magnitudes.
          const found = yield* items.query({ where: call.where, limit: 1_000 })
          const magnitudes = found.reduce((total, { indexes }) => {
            const value = indexes[call.index]
            return typeof value === 'number' ? total + Math.abs(value) : total
          }, 0)
          answers.push(new Total(exit.value, magnitudes))
          continue
        }
        const answer = call._tag === 'Create'
          ? items.create(call.id, { flags: call.flags, ...call.request })
          : call._tag === 'Set'
          ? items.send(call.id, { _tag: 'Set', ...call.set }, { ...call.request, keep: 'forever' })
          : call._tag === 'Boom'
          ? items.send(call.id, { _tag: 'Boom', note: call.note }, { ...call.request, keep: 'forever' })
          : call._tag === 'Read'
          ? items.read(call.id)
          : call._tag === 'Query'
          ? items.query({ where: call.where, limit: call.limit, ...(call.order === undefined ? {} : { order: call.order }) })
          : call._tag === 'Count'
          ? items.count({ where: call.where })
          : call._tag === 'CountBy'
          ? items.countBy({ index: call.index, where: call.where, limit: call.limit })
          : Effect.map(items.suspended, (suspended) => suspended.map(({ id }) => id).sort())
        answers.push(outcome(yield* Effect.exit(answer as Effect.Effect<unknown, unknown>)))
      }
      return answers
    })).pipe(Effect.provide(client(dialect)), Effect.orDie),
  )

test('both dialects answer every call alike', () =>
  fc.assert(
    fc.asyncProperty(scenario, async (calls) => {
      alike(await run('pg', calls), await run('sqlite', calls))
    }),
    // `bun test` runs eight within its budget, and a release fifty times as many (decision 0250).
    { numRuns: Bun.env['SCHEDULES'] === 'all' ? 400 : 8 },
  ), 1_200_000)

// Bug 40 of the roadmap: SQLite adds the magnitudes as doubles, and its partial total may round up past the largest
// double where the exact total, which PostgreSQL adds, stays under it. One ulp below the largest double, and two of
// 0.6 of an ulp: the exact total is 0.2 of an ulp over it, which reads back as the largest double.
test.failing('a sum whose exact total of magnitudes reads back as the largest double is answered alike on both dialects', async () => {
  const ulp = 2 ** 971
  const amounts = [Number.MAX_VALUE - ulp, 0.6 * ulp, 0.6 * ulp]
  const summed = (dialect: Dialect) =>
    Effect.runPromise(
      Effect.scoped(Effect.gen(function*() {
        const items = yield* (yield* launch()).deploy(item)
        for (const [at, amount] of amounts.entries()) {
          const flags = { label: `l${at}`, amount, flag: false, note: null }
          yield* items.create(`i${at}`, { flags, requestId: `r${at}`, sender: 's' })
        }
        return outcome(yield* Effect.exit(items.sum({ index: 'amount' })))
      })).pipe(Effect.provide(client(dialect)), Effect.orDie),
    )
  const [pg, sqlite] = [await summed('pg'), await summed('sqlite')]
  expect({ pg, sqlite }).toEqual({ pg, sqlite: pg })
})
