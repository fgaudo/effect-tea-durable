/**
 * Every program of `src/fixtures/` answers on the runtime as its rehearsal does, over values derived from the
 * program's own schemas by `effect/Arbitrary` (decision 0212): the same flags, the same messages from the same
 * senders under the same request ids are given the same replies, and leave the same projection, on both dialects.
 *
 * No operation of the property ends: each runner never returns, and the clock stands still. So the replies are
 * those of the callers' messages alone, which both handle in the order they are sent.
 */
import { expect, test } from 'bun:test'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as Arbitrary from 'effect/Arbitrary'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import { TestClock } from 'effect/testing'
import { launch } from './index.ts'
import { operation, type Program, type Types } from './index.program.ts'
import { rehearse } from './index.testing.ts'
import type { Dialect } from './storage.ts'
import { client } from './storage.test_databases.ts'

// The runners of `stalled` need no service, so a program of the property needs none from the test.
type Any = Types & Readonly<{ services: never }>

/**
 * A program whose operations never end. A runner that ends would answer while callers send, at a time the
 * runtime's fibers choose and the rehearsal's test does not.
 */
const stalled = <T extends Types>(program: Program<T>): Program<Any> => ({
  ...program as unknown as Program<Any>,
  operations: Object.fromEntries(
    Object.keys(program.operations).map((tag) => [tag, operation.atLeastOnce(() => Effect.never)]),
  ) as Program<Any>['operations'],
})

type Case = Readonly<{
  /**
   * A sender the flags name, which a step compares with the sender of a message. Two strings a schema derives are
   * almost never equal, so without it every message that asks for the entity's customer would be rejected.
   */
  named?: (flags: never) => unknown
}>

/**
 * What the property needs of each program of `src/fixtures/`, by the program's name. The programs are read from the
 * folder, so a fixture added gets the property, and a test fails until it is listed here (decision 0254).
 */
const needs: Readonly<Record<string, Case>> = {
  Inventory: {},
  Booking: { named: (flags: { customer: string }) => ({ _tag: 'Customer', id: flags.customer }) },
  Order: { named: (flags: { order: { customer: string } }) => ({ _tag: 'Customer', id: flags.order.customer }) },
}

/** Every program a module of `src/fixtures/` exports. */
const fixtures: ReadonlyArray<Program<Any>> = await Promise.all(
  readdirSync(join(import.meta.dir, 'fixtures')).filter((file) => file.endsWith('.ts')).map(async (file) =>
    Object.values(await import(`./fixtures/${file}`) as Record<string, unknown>).filter((value): value is Program<Any> =>
      typeof value === 'object' && value !== null && 'operations' in value && 'schemas' in value && 'name' in value
    )
  ),
).then((found) => found.flat())

test('every program of src/fixtures is given what the property needs of it', () => {
  expect(fixtures.length).toBeGreaterThan(0)
  expect(fixtures.map(({ name }) => name).sort()).toEqual(Object.keys(needs).sort())
})

// A few request ids, so that a send is now and then a retry of an earlier one, and null for a new request.
const RequestId = Schema.NullOr(Schema.Literals(['r-1', 'r-2', 'r-3']))

const scenarioOf = (program: Program<Any>, { named }: Case) => {
  const sender = (flags: unknown) =>
    named === undefined
      ? Arbitrary.schema(program.schemas.sender)
      : Arbitrary.flatMap(
        Arbitrary.schema(Schema.Boolean),
        (byName) => byName ? Arbitrary.Constant(named(flags as never)) : Arbitrary.schema(program.schemas.sender),
      )
  return Arbitrary.flatMap(Arbitrary.schema(program.schemas.flags), (flags) =>
    Arbitrary.all({
      flags: Arbitrary.Constant(flags),
      creator: sender(flags),
      sends: Arbitrary.array(
        Arbitrary.all({
          message: Arbitrary.schema(program.schemas.inbound),
          sender: sender(flags),
          requestId: Arbitrary.schema(RequestId),
        }),
        { maxLength: 10 },
      ),
    }))
}

type Scenario = Readonly<{
  flags: unknown
  creator: unknown
  sends: ReadonlyArray<Readonly<{ message: unknown; sender: unknown; requestId: string | null }>>
}>

/** The request id of each send: its own, or one no other send uses, so that it is a new request. */
const named = (sends: Scenario['sends']) => sends.map((send, at) => send.requestId ?? `new-${at}`)

const rehearsed = (program: Program<Any>, { flags, sends }: Scenario) =>
  Effect.gen(function*() {
    const replies: Array<unknown> = []
    let projection: unknown
    yield* rehearse(program, { flags, at: DateTime.makeUnsafe(0) }, (entity) =>
      Effect.gen(function*() {
        for (const [at, { message, sender, requestId }] of sends.entries()) {
          const request = requestId === null ? undefined : { requestId: named(sends)[at]! }
          replies.push(yield* entity.send(message, { sender, ...request }))
        }
        projection = yield* entity.projection
      }))
    return { replies, projection }
  })

const ran = (program: Program<Any>, dialect: Dialect, { flags, creator, sends }: Scenario) =>
  Effect.scoped(Effect.gen(function*() {
    const entities = yield* (yield* launch()).deploy(program)
    yield* entities.create('a', { flags, requestId: 'create', sender: creator })
    const replies: Array<unknown> = []
    for (const [at, { message, sender }] of sends.entries()) {
      replies.push(yield* entities.send('a', message, { requestId: named(sends)[at]!, sender, keep: 'forever' }))
    }
    return { replies, projection: yield* entities.read('a') }
  })).pipe(
    // The clock starts at the rehearsal's time and stays there, so no timer is due.
    Effect.provide(TestClock.layer()),
    Effect.provide(client(dialect)),
    Effect.orDie,
  )

const runs = Bun.env['SCHEDULES'] === 'all' ? 300 : 8

for (const fixture of fixtures.map((program) => ({ program: stalled(program), ...needs[program.name] }))) {
  test(`${fixture.program.name} answers on the runtime as its rehearsal does, over values of its schemas`, async () => {
    // How many sends the runtime accepted: a generator that reaches no branch past a rejection checks little.
    let accepted = 0
    const alike = (scenario: Scenario) =>
      Effect.gen(function*() {
        const expected = yield* rehearsed(fixture.program, scenario)
        for (const dialect of ['sqlite', 'pg'] as const) {
          const actual = yield* ran(fixture.program, dialect, scenario)
          if (!Bun.deepEquals(actual, expected, true)) return false
          if (dialect === 'sqlite') {
            accepted += actual.replies.filter((reply) => (reply as { _tag: string })._tag === 'Accepted').length
          }
        }
        return true
      })
    const result = await Effect.runPromise(
      Arbitrary.checkEffect(scenarioOf(fixture.program, fixture), alike, { runs, seed: 0 }),
    )
    if (result._tag === 'Falsified') {
      // The shrunk input again, on SQLite, so that the test shows how the two differ.
      const scenario = result.shrunkInput as Scenario
      expect(await Effect.runPromise(ran(fixture.program, 'sqlite', scenario)))
        .toEqual(await Effect.runPromise(rehearsed(fixture.program, scenario)))
    }
    expect(Arbitrary.formatCheckFailure(result)).toBeUndefined()
    expect(accepted).toBeGreaterThan(0)
  }, 600_000)
}
