/**
 * The runtime as a user launches it, against the machine: what `runtime.ts` does itself, its deploy, its reads, its log
 * and its planned stop, and what several of the runtime's modules keep together. The tests of one module of
 * `src/runtime/` lie beside it, and what they share is in [`runtime.test_shared.ts`](runtime.test_shared.ts) (decision 0241).
 */
import { PgliteClient } from '@effect/sql-pglite'
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { describe, expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as Context from 'effect/Context'
import * as DateTime from 'effect/DateTime'
import * as Deferred from 'effect/Deferred'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Fiber from 'effect/Fiber'
import * as Layer from 'effect/Layer'
import * as Logger from 'effect/Logger'
import * as References from 'effect/References'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import * as Scope from 'effect/Scope'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/sql'
import { TestClock } from 'effect/testing'
import * as Machine from './machine.ts'
import {
  create as createFrom,
  defect,
  type Address,
  type Entities,
  type IdempotencyKey,
  InvariantDefect,
  type Json,
  noWork,
  operation,
  type Program,
  rejectWith,
  send,
  timer,
} from './program.ts'
import * as ClusterEntry from './index.cluster.ts'
import * as Library from './index.ts'
import * as ProgramEntry from './index.program.ts'
import * as TestingEntry from './index.testing.ts'
import { type Answer, type Handle, launch, type Options, type Point, type Runtime } from './runtime.ts'
import { createTables, partitionOf, storage } from './storage.ts'
import { inOrder, prioritized, replayed as replayedSchedule, scheduled } from './testing.ts'
import {
  acts,
  adjusted,
  ahead,
  all,
  database,
  done,
  explored,
  Hands,
  hands,
  type Hooks,
  id,
  Inbound,
  Internal,
  Key,
  keys,
  log,
  onBoth,
  opened,
  persisted,
  process,
  program,
  queue,
  ran,
  received,
  replayed,
  running,
  Sender,
  sending,
  slow,
  type T,
  tester,
  timed,
  together,
  unloads,
  type Window,
} from './runtime.test_shared.ts'

describe('the runtime on SQLite', () => {
  test('creates an entity, runs its work and stores what the machine stores', () =>
    database(Effect.gen(function*() {
      const { acted, layer } = yield* hands()
      const { events, observe } = log()
      const at = yield* DateTime.now
      yield* process({ observe }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          expect(yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: { _tag: 'Tester' } }))
            .toEqual({ _tag: 'Created' })
          yield* runtime.settled
          // The timer is the only work left: everything else ran, was delivered and left the state.
          expect(yield* toy.read(id)).toBe(1)
          yield* TestClock.adjust('60 millis')
          yield* runtime.settled
          expect(yield* toy.read(id)).toBe(0)
        }))
      // Each operation acted once, the idempotent one with its key.
      expect(acted.filter((act) => act.startsWith('a:')).length).toBe(1)
      expect(acted.filter((act) => act === 'b').length).toBe(1)
      expect(acted.filter((act) => act === 'c').length).toBe(1)
      const stored = yield* persisted
      expect(stored).toEqual(replayed(stored?.state.since ?? at, events))
    })))

  test('warns of a step past its threshold once per activation, and refuses nothing for its size (decision 0135)', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const warnings: Array<Readonly<Record<string, unknown>>> = []
      const logger = Logger.make((options) => {
        if (options.logLevel === 'Warn') warnings.push(options.fiber.getRef(References.CurrentLogAnnotations))
      })
      const at = yield* DateTime.now
      const sender = { _tag: 'Tester' } as const
      const want = (nonce: string) => ({ _tag: 'Want', key: 'b', on: true, nonce }) as const
      let requests = 0
      // Each activation is a process of its own, which loads the entity again: its warning is its own.
      const activation = (options: Options, padding = '') =>
        process(options, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(program), layer)
            if (requests === 0) yield* toy.create(id, { flags: { at }, requestId: 'creation', sender })
            for (let step = 0; step < 2; step++) {
              const requestId = `request-${requests++}`
              const sent = want(`${requestId}${padding}`)
              expect(yield* toy.send(id, sent, { requestId, sender, keep: 'forever' })).toEqual({ _tag: 'Accepted' })
            }
            yield* runtime.settled
          })).pipe(Effect.provide(Logger.layer([logger])))
      yield* activation({})
      expect(warnings).toEqual([])
      yield* activation({ warn: { characters: 1 } })
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toMatchObject({ name: program.name, id, threshold: 1 })
      expect(warnings[0]!['characters']).toBeGreaterThan(1)
      yield* activation({ warn: { characters: 1 } })
      expect(warnings).toHaveLength(2)
      // A state past the default threshold of 262 144 characters warns with no option given.
      yield* activation({}, 'x'.repeat(262_144))
      expect(warnings).toHaveLength(3)
      expect(warnings[2]).toMatchObject({ threshold: 262_144 })
    })))

  test('answers a retry from the stored reply, and NotFound for no entity', () =>
    onBoth(Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          expect(yield* toy.send('nobody', { _tag: 'Refuse', nonce: 'n' }, {
            requestId: 'r1',
            sender: { _tag: 'Tester' },
            keep: 'forever',
          })).toEqual({ _tag: 'NotFound' })
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: { _tag: 'Tester' } })
          const request = { requestId: 'r1', sender: { _tag: 'Tester' as const }, keep: 'forever' as const }
          const refused: Answer<'Refused'> = { _tag: 'Rejected', reason: 'Refused' }
          expect(yield* toy.send(id, { _tag: 'Refuse', nonce: 'n' }, request)).toEqual(refused)
          // The retry is answered from storage, and `update` never sees the message again.
          expect(yield* toy.send(id, { _tag: 'Refuse', nonce: 'n' }, request)).toEqual(refused)
          // A creation again is answered `Created` for the request that created it (decision 0017).
          expect(yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: { _tag: 'Tester' } }))
            .toEqual({ _tag: 'Created' })
          expect(yield* toy.create(id, { flags: { at }, requestId: 'another', sender: { _tag: 'Tester' } }))
            .toEqual({ _tag: 'AlreadyExists' })
        }))
    })))

  test('a reason holding -0 is given 0 by the first reply and by a retry alike (decision 0214)', () =>
    onBoth(Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      const numbered: Program<T> = {
        ...program,
        name: 'Numbered',
        schemas: { ...program.schemas, rejection: Schema.Number as never },
        update: (message, meta) =>
          message._tag === 'Refuse' ? () => rejectWith(-0 as never) : program.update(message, meta),
      }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(numbered), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: { _tag: 'Tester' } })
          const request = { requestId: 'r', sender: { _tag: 'Tester' as const }, keep: 'forever' as const }
          for (const _ of [1, 2]) {
            const reply = yield* toy.send(id, { _tag: 'Refuse', nonce: 'n' }, request)
            expect(reply._tag === 'Rejected' && Object.is(reply.reason, 0)).toBe(true)
          }
        }))
    })))

  test('a retry within the keep its boundary gives is answered from storage, and one after it is applied again', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      const sender = { _tag: 'Tester' } as const
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender })
          const want: Inbound = { _tag: 'Want', key: 't', on: false, nonce: 'w' }
          const request = { requestId: 'r', sender, keep: { millis: 100 } }
          yield* toy.send(id, want, request)
          yield* TestClock.adjust('99 millis')
          yield* toy.send(id, want, request)
          const applied = () =>
            Effect.map(
              Effect.flatMap(SqlClient.SqlClient, (sql) => storage(program, sql).load(id)),
              (stored) => stored?.state.applied,
            )
          expect(yield* applied()).toEqual(['w'])
          // The reply is past its time: no operator has deleted it, and the retry is a new request.
          yield* TestClock.adjust('1 millis')
          yield* toy.send(id, want, request)
          expect(yield* applied()).toEqual(['w', 'w'])
          // The step deleted the reply past its time, so only the new reply is left for an operator to expire.
          expect(yield* toy.expire).toBe(0)
          yield* TestClock.adjust('100 millis')
          expect(yield* toy.expire).toBe(1)
          // A reply with no keep is kept for ever.
          yield* toy.send(id, want, { requestId: 'ever', sender, keep: 'forever' })
          yield* TestClock.adjust('1 days')
          expect(yield* toy.expire).toBe(0)
          yield* toy.send(id, want, { requestId: 'ever', sender, keep: 'forever' })
          expect(yield* applied()).toEqual(['w', 'w', 'w'])
        }))
    })))

  // The sweep runs `expire`, then `prune`, at its interval, and a sweep that fails leaves the next (decision 0245).
  test('the sweep expires and prunes at its interval, and one that fails is warned of and leaves the next', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      const sql = yield* SqlClient.SqlClient
      const warnings: Array<Readonly<Record<string, unknown>>> = []
      const logger = Logger.make((options) => {
        if (options.logLevel === 'Warn') warnings.push(options.fiber.getRef(References.CurrentLogAnnotations))
      })
      const counted = (table: string) =>
        Effect.map(sql<{ count: number }>`SELECT count(*) AS count FROM ${sql(table)}`, (rows) => Number(rows[0]?.count))
      const want: Inbound = { _tag: 'Want', key: 't', on: false, nonce: 'w' }
      yield* process({ sweep: { millis: 1_000 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          yield* toy.send(id, want, { requestId: 'r', sender: tester, keep: { millis: 10 } })
          yield* runtime.settled
          expect(yield* counted('effecttea_replies')).toBe(1)
          expect(yield* counted('effecttea_outbox')).toBeGreaterThan(0)
          // No consumer is stored for the program's topic, so a prune drops it whole (decision 0152).
          yield* TestClock.adjust('999 millis')
          expect(yield* counted('effecttea_replies')).toBe(1)
          yield* TestClock.adjust('1 millis')
          expect(yield* counted('effecttea_replies')).toBe(0)
          expect(yield* counted('effecttea_outbox')).toBe(0)
          // A sweep that fails is warned of, and the next one runs at the next interval.
          yield* sql`ALTER TABLE effecttea_replies RENAME TO effecttea_replies_away`
          yield* TestClock.adjust('1000 millis')
          expect(warnings).toHaveLength(1)
          expect(warnings[0]).toMatchObject({ name: program.name })
          yield* sql`ALTER TABLE effecttea_replies_away RENAME TO effecttea_replies`
          yield* toy.send(id, want, { requestId: 's', sender: tester, keep: { millis: 10 } })
          yield* runtime.settled
          expect(yield* counted('effecttea_replies')).toBe(1)
          yield* TestClock.adjust('1000 millis')
          expect(yield* counted('effecttea_replies')).toBe(0)
          expect(warnings).toHaveLength(1)
        })).pipe(Effect.provide(Logger.layer([logger])))
    })))

  test('a sweep with prune false only expires, and a sweep that is neither none nor a positive integer of millis dies', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      const sql = yield* SqlClient.SqlClient
      const counted = (table: string) =>
        Effect.map(sql<{ count: number }>`SELECT count(*) AS count FROM ${sql(table)}`, (rows) => Number(rows[0]?.count))
      yield* process({ sweep: { millis: 1_000, prune: false } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          const want: Inbound = { _tag: 'Want', key: 't', on: false, nonce: 'w' }
          yield* toy.send(id, want, { requestId: 'r', sender: tester, keep: { millis: 10 } })
          yield* runtime.settled
          const rows = yield* counted('effecttea_outbox')
          yield* TestClock.adjust('1000 millis')
          expect(yield* counted('effecttea_replies')).toBe(0)
          expect(yield* counted('effecttea_outbox')).toBe(rows)
        }))
      for (const sweep of [{ millis: 0 }, { millis: 1.5 }, { millis: Infinity }, { millis: 10, prune: true }, 'never', null]) {
        const exit = yield* Effect.exit(process({ sweep: sweep as never }, () => Effect.void))
        const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
        expect(cause instanceof InvariantDefect && cause.reason)
          .toBe(`the sweep is ${JSON.stringify(sweep)}, which is neither 'none' nor a positive integer of millis`)
      }
    })))

  // Only an option left out, or its field left out, is the default: a `null` from JavaScript is refused, before
  // anything is deployed (decision 0208).
  test('an option or a field of it given null is the launcher’s defect, and one left out is the default', () =>
    database(Effect.gen(function*() {
      const reasonOf = (exit: Exit.Exit<unknown>) => {
        const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
        return cause instanceof InvariantDefect ? cause.reason : null
      }
      const fields = [
        ['retry', 'millis', 'the retry is null millis, which is no positive integer'],
        ['passivate', 'millis', 'the passivation is null millis, which is no positive integer'],
        ['capacity', 'entities', 'the capacity is null, which is no positive integer'],
        ['drain', 'millis', 'the drain is null millis, which is no non-negative integer'],
        ['warn', 'characters', 'the warning is null characters, which is no non-negative integer'],
        ['callers', 'messages', "the callers' messages are null, which is no positive integer"],
        ['log', 'partitions', 'the log has null partitions, which is no positive integer'],
      ] as const
      for (const [option, field, reason] of fields) {
        const nulled = { [option]: { [field]: null } } as Options
        expect(reasonOf(yield* Effect.exit(process(nulled, () => Effect.void)))).toBe(reason)
        const none = { [option]: null } as unknown as Options
        expect(reasonOf(yield* Effect.exit(process(none, () => Effect.void))))
          .toBe(`the option ${option} is null, which is no object`)
        // An option given with its field left out launches with the default.
        yield* process({ [option]: {} } as Options, () => Effect.void)
      }
      const renamed = { renames: null } as unknown as Options
      expect(reasonOf(yield* Effect.exit(process(renamed, () => Effect.void))))
        .toBe('the option renames is null, which is no object')
    })))

  // A call from JavaScript may leave out a request or what a reading asks. The call returns its effect, and the effect
  // dies with the caller's defect, as for a limit left out (decisions 0053, 0141).
  test('a request or a reading left out is the caller’s defect, in the effect and not at the call', () =>
    database(Effect.gen(function*() {
      const reasonOf = (exit: Exit.Exit<unknown>) => {
        const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
        return cause instanceof InvariantDefect ? cause.reason : null
      }
      const { layer } = yield* hands()
      const want: Inbound = { _tag: 'Want', key: 't', on: false, nonce: 'w' }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          for (const left of [undefined, null]) {
            const calls = [
              ['request of create', () => toy.create(id, left as never)],
              ['request of send', () => toy.send(id, want, left as never)],
              ['query', () => toy.query(left as never)],
              ['count', () => toy.count(left as never)],
              ['sum', () => toy.sum(left as never)],
              ['count by', () => toy.countBy(left as never)],
            ] as const
            for (const [what, call] of calls) {
              const effect: Effect.Effect<unknown> = call()
              expect(reasonOf(yield* Effect.exit(effect))).toBe(`the ${what} is ${left}, which is no object`)
            }
            // The cursors of `published` are a list, and one left out is refused the same way.
            expect(reasonOf(yield* Effect.exit(toy.published('projection', left as never, 1))))
              .toBe(`the cursors are ${left}, which are no list`)
          }
          expect(yield* toy.read(id)).toBeNull()
        }))
    })))

  test('a keep that is neither a whole number of millis nor forever is the caller’s defect, and reaches no entity', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      const sender = { _tag: 'Tester' } as const
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender })
          const want: Inbound = { _tag: 'Want', key: 't', on: false, nonce: 'w' }
          for (const millis of [-1, 1.5]) {
            const exit = yield* Effect.exit(toy.send(id, want, { requestId: 'r', sender, keep: { millis } }))
            expect(Exit.hasDies(exit)).toBe(true)
          }
          // A call from JavaScript may leave `keep` out, or give what is no keep (decision 0245).
          for (const keep of [undefined, null, 'always', {}]) {
            const exit = yield* Effect.exit(toy.send(id, want, { requestId: 'r', sender, keep: keep as never }))
            expect(Exit.hasDies(exit)).toBe(true)
          }
          const stored = yield* Effect.flatMap(SqlClient.SqlClient, (sql) => storage(program, sql).load(id))
          expect(stored?.state.applied).toEqual([])
          // A keep of 0 millis keeps no reply: a retry is applied again.
          yield* toy.send(id, want, { requestId: 'r', sender, keep: { millis: 0 } })
          expect(yield* toy.send(id, want, { requestId: 'r', sender, keep: { millis: 0 } })).toEqual({ _tag: 'Accepted' })
          const after = yield* Effect.flatMap(SqlClient.SqlClient, (sql) => storage(program, sql).load(id))
          expect(after?.state.applied).toEqual(['w', 'w'])
        }))
    })))

  // Only the boundary knows how long its protocol retries for, so no `send` goes without a `keep`, and only a program
  // whose sender or flags are `null` may leave them out (decision 0245). The compiler holds it, so the test runs
  // nothing.
  test('a request leaves out its sender and flags only where the program has none, and never its keep', () => {
    const typed = (toy: Handle<T>, want: Inbound) => [
      // @ts-expect-error a program with a sender is given one
      toy.send(id, want, { requestId: 'r', keep: 'forever' }),
      // @ts-expect-error a creation of a program with a sender is given one
      toy.create(id, { flags: { at: DateTime.makeUnsafe(0) }, requestId: 'r' }),
      // @ts-expect-error a creation of a program with flags is given them
      toy.create(id, { requestId: 'r', sender: { _tag: 'Tester' } }),
      // @ts-expect-error `keep` is required
      toy.send(id, want, { requestId: 'r', sender: { _tag: 'Tester' } }),
    ]
    expect(typed).toBeFunction()
  })

  // No database gives a lone surrogate back as written, so that two ids would be one entity, and PostgreSQL holds U+0000
  // in no text (decision 0157). The waker pages from the empty id up, so it would never wake that one (decision 0179).
  test('an id that is no text a database holds, or is empty, is the caller’s defect, and reaches no entity', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      const sender = { _tag: 'Tester' } as const
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          const want: Inbound = { _tag: 'Want', key: 't', on: false, nonce: 'w' }
          const unheld = (id: string) => `the id is ${JSON.stringify(id)}, which is no text a database holds`
          const cases = [
            ...['toy\ud800', 'toy\udc00', 'toy\u0000'].map((id) => [id, unheld(id)] as const),
            ['', 'the id is empty, and an id is not'] as const,
          ]
          for (const [broken, reason] of cases) {
            const calls: ReadonlyArray<Effect.Effect<unknown>> = [
              toy.create(broken, { flags: { at }, requestId: 'creation', sender }),
              toy.send(broken, want, { requestId: 'r', sender, keep: 'forever' }),
              toy.read(broken),
              toy.inspect(broken),
              toy.resume(broken),
              toy.discard(broken),
            ]
            for (const call of calls) {
              const exit = yield* Effect.exit(call)
              const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
              expect(cause instanceof InvariantDefect ? cause.reason : null).toBe(reason)
            }
          }
          const sql = yield* SqlClient.SqlClient
          expect(yield* sql`SELECT id FROM effecttea_entities`).toEqual([])
          // A pair of surrogates is one character, and an id.
          yield* toy.create('toy😀', { flags: { at }, requestId: 'creation', sender })
          expect(yield* sql`SELECT id FROM effecttea_entities`).toEqual([{ id: 'toy😀' }])
        }))
    })))

  // The storage writes a request id as it is, and PostgreSQL holds U+0000 in no text: the write of the reply would
  // fail, and the entity would leave the process with its operations (decision 0204).
  test('a request id that is no text a database holds is the caller’s defect, and reaches no entity', () =>
    onBoth(Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      const sender = { _tag: 'Tester' } as const
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          const want: Inbound = { _tag: 'Want', key: 't', on: false, nonce: 'w' }
          yield* toy.create('toy', { flags: { at }, requestId: 'creation', sender })
          for (const broken of ['r\u0000', 'r\ud800']) {
            const calls: ReadonlyArray<Effect.Effect<unknown>> = [
              toy.create('other', { flags: { at }, requestId: broken, sender }),
              toy.send('toy', want, { requestId: broken, sender, keep: 'forever' }),
            ]
            for (const call of calls) {
              const exit = yield* Effect.exit(call)
              const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
              expect(cause instanceof InvariantDefect ? cause.reason : null).toBe(
                `the request id is ${JSON.stringify(broken)}, which is no text a database holds`,
              )
            }
          }
          const sql = yield* SqlClient.SqlClient
          expect(yield* sql`SELECT id FROM effecttea_entities`).toEqual([{ id: 'toy' }])
          // The entity is still in the process, and answers the next caller.
          expect(yield* toy.send('toy', want, { requestId: 'r', sender, keep: 'forever' })).toEqual({ _tag: 'Accepted' })
        }))
    })))

  // A message waits in the mailbox behind another while a creation under its request id is answered: the
  // creation's reply must not reach the message's caller (decision 0050).
  test('a creation and a message under one request id are answered each its own reply', () =>
    onBoth(Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      const gate = yield* Deferred.make<void>()
      const sender = { _tag: 'Tester' } as const
      yield* process({
        // The first message holds the entity until both requests wait for their replies.
        at: (point, _entity, event) =>
          point === 'BeforeCommit' && received(event) === 'first'
            ? Deferred.await(gate)
            : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender })
          const want = (nonce: string): Inbound => ({ _tag: 'Want', key: 'a', on: false, nonce })
          // Each request waits once it is started: the first at the gate, the two after it in the mailbox.
          yield* running(toy.send(id, want('n1'), { requestId: 'first', sender, keep: 'forever' }))
          const created = yield* running(toy.create(id, { flags: { at }, requestId: 'shared', sender }))
          const sent = yield* running(toy.send(id, want('n2'), { requestId: 'shared', sender, keep: 'forever' }))
          yield* Deferred.succeed(gate, undefined)
          expect(yield* Fiber.join(created)).toEqual({ _tag: 'AlreadyExists' })
          expect(yield* Fiber.join(sent)).toEqual({ _tag: 'Accepted' })
        }))
    })))

  // A message is given the reply stored under its request and the time just before its step, not as it is offered:
  // one that waits behind another is handled at the time it reaches the front (decisions 0065, 0074).
  test('a message that waits behind another is given its time and its reply as its step begins', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const { events, observe } = log()
      const at = yield* DateTime.now
      const gate = yield* Deferred.make<void>()
      const sender = { _tag: 'Tester' } as const
      yield* process({
        observe,
        at: (point, _entity, event) =>
          point === 'BeforeCommit' && received(event) === 'first' ? Deferred.await(gate) : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender })
          yield* runtime.settled
          const want = (nonce: string): Inbound => ({ _tag: 'Want', key: 'a', on: false, nonce })
          const first = yield* running(toy.send(id, want('n1'), { requestId: 'first', sender, keep: 'forever' }))
          // Both wait behind the first: a second message, and a retry of the first.
          const second = yield* running(toy.send(id, want('n2'), { requestId: 'second', sender, keep: 'forever' }))
          const retry = yield* running(toy.send(id, want('n1'), { requestId: 'first', sender, keep: 'forever' }))
          yield* TestClock.adjust('5 seconds')
          const released = DateTime.toEpochMillis(yield* DateTime.now)
          yield* Deferred.succeed(gate, undefined)
          for (const fiber of [first, second, retry]) expect(yield* Fiber.join(fiber)).toEqual({ _tag: 'Accepted' })
          // The retry may be answered before its own message is applied, so the events are read once it is.
          yield* runtime.settled
          const times = events.flatMap((event) =>
            event._tag === 'Receive' && event.request._tag === 'Caller'
              ? [[event.request.id, DateTime.toEpochMillis(event.at), event.reply]]
              : []
          )
          // The retry finds the reply the first stored, and `update` saw the message once.
          expect(times).toEqual([
            ['first', DateTime.toEpochMillis(at) + 1, null],
            ['second', released, null],
            ['first', released, { _tag: 'Accepted' }],
          ])
          expect((yield* storage(program, yield* SqlClient.SqlClient).load(id))?.state.applied).toEqual(['n1', 'n2'])
        }))
    })))

  test('a send past the bound of its entity’s callers is answered Full, stores nothing, and is warned of once (decision 0147)', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const warnings: Array<Readonly<Record<string, unknown>>> = []
      const logger = Logger.make((options) => {
        if (options.logLevel === 'Warn') warnings.push(options.fiber.getRef(References.CurrentLogAnnotations))
      })
      const at = yield* DateTime.now
      const gate = yield* Deferred.make<void>()
      const want = (nonce: string): Inbound => ({ _tag: 'Want', key: 'a', on: false, nonce })
      yield* process({
        callers: { messages: 2 },
        at: (point, _entity, event) =>
          point === 'BeforeCommit' && received(event) === 'first' ? Deferred.await(gate) : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          yield* runtime.settled
          // The first is held at its commit, and counts until its step ends: with the second, the entity is full.
          const first = yield* running(toy.send(id, want('n1'), { requestId: 'first', sender: tester, keep: 'forever' }))
          const second = yield* running(toy.send(id, want('n2'), { requestId: 'second', sender: tester, keep: 'forever' }))
          for (const _ of [1, 2]) {
            expect(yield* toy.send(id, want('n3'), { requestId: 'third', sender: tester, keep: 'forever' })).toEqual({ _tag: 'Full' })
          }
          yield* Deferred.succeed(gate, undefined)
          for (const fiber of [first, second]) expect(yield* Fiber.join(fiber)).toEqual({ _tag: 'Accepted' })
          // Nothing of the refused message was stored, so its retry is applied once, when there is room.
          expect(yield* toy.send(id, want('n3'), { requestId: 'third', sender: tester, keep: 'forever' })).toEqual({ _tag: 'Accepted' })
          yield* runtime.settled
          const stored = yield* storage(program, yield* SqlClient.SqlClient).load(id)
          expect(stored?.state.applied).toEqual(['n1', 'n2', 'n3'])
        })).pipe(Effect.provide(Logger.layer([logger])))
      expect(warnings).toHaveLength(1)
      expect(warnings[0]).toMatchObject({ name: program.name, id, messages: 2 })
      // A bound of no message at all, or of no whole number of them, is the launcher's defect.
      for (const messages of [0, 1.5, Infinity, NaN]) {
        const exit = yield* Effect.exit(process({ callers: { messages } }, () => Effect.void))
        const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
        expect(cause instanceof InvariantDefect && cause.reason)
          .toBe(`the callers' messages are ${messages}, which is no positive integer`)
      }
    })))

  test('an operation that sends to a full entity sends again after the retry, and is answered (decision 0147)', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const refused = yield* Deferred.make<void>()
      const logger = Logger.make((options) => {
        if (options.logLevel === 'Warn') Deferred.doneUnsafe(refused, Effect.void)
      })
      const at = yield* DateTime.now
      const gate = yield* Deferred.make<void>()
      yield* process({
        callers: { messages: 1 },
        retry: { millis: 100 },
        at: (point, _entity, event) =>
          point === 'BeforeCommit' && received(event) === 'first' ? Deferred.await(gate) : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          const from = yield* runtime.deploy(sending)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          yield* runtime.settled
          const first = yield* running(
            toy.send(id, { _tag: 'Want', key: 'a', on: false, nonce: 'n1' }, { requestId: 'first', sender: tester, keep: 'forever' }),
          )
          // The sender's operation finds the toy full, and is not given the answer.
          yield* ran(from.create('sender', { flags: { at }, requestId: 'creation', sender: tester }))
          yield* Deferred.await(refused)
          yield* Deferred.succeed(gate, undefined)
          expect(yield* Fiber.join(first)).toEqual({ _tag: 'Accepted' })
          yield* TestClock.adjust('100 millis')
          yield* runtime.settled
          const stored = yield* storage(program, yield* SqlClient.SqlClient).load(id)
          expect(stored?.state.applied).toEqual(['n1', 'sent'])
        })).pipe(Effect.provide(Logger.layer([logger])))
    })))

  test('an entity whose messages keep coming lets another step between two of its steps', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const received: Array<string> = []
      const started = yield* Deferred.make<void>()
      const observe: Hooks['observe'] = (entity, event) =>
        Effect.suspend(() => {
          if (event._tag !== 'Receive') return Effect.void
          received.push(entity.id)
          return entity.id === 'busy' ? Deferred.succeed(started, undefined) : Effect.void
        })
      const at = yield* DateTime.now
      yield* process({ observe }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create('busy', { flags: { at }, requestId: 'c-busy', sender: tester })
          yield* toy.create('quiet', { flags: { at }, requestId: 'c-quiet', sender: tester })
          yield* runtime.settled
          // Each reply resumes the sender at once, and its next message is in the queue before the busy entity's
          // loop takes from it: the loop never waits, and yields only where it yields on its own.
          yield* Effect.forkChild(Effect.forEach(
            Array.from({ length: 100 }, (_, n) => n),
            (n) => toy.send('busy', { _tag: 'Refuse', nonce: `${n}` }, { requestId: `busy-${n}`, sender: tester, keep: 'forever' }),
            { discard: true },
          ))
          yield* Deferred.await(started)
          const before = received.length
          yield* toy.send('quiet', { _tag: 'Refuse', nonce: 'q' }, { requestId: 'quiet', sender: tester, keep: 'forever' })
          // The quiet entity's message waits for one step of the busy entity, and the start of the next, at most.
          const between = received.slice(before, received.indexOf('quiet'))
          expect(between.length).toBeLessThanOrEqual(2)
        }))
    })))

  // Under the default budget a timer armed by work the test started has reached its sleep when the clock moves, and
  // fires at its time, not one move later (decisions 0066, 0101).
  test('a timer fires at its time, and not before', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const fired: Array<number> = []
      const at = yield* DateTime.now
      yield* process({
        observe: (_entity, event) =>
          Effect.map(DateTime.now, (now) => {
            if (event._tag === 'Fire') fired.push(DateTime.toEpochMillis(now))
          }),
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: { _tag: 'Tester' } })
          yield* runtime.settled
          // The toy's timer rings 40 milliseconds after its creation.
          yield* TestClock.adjust('39 millis')
          expect(fired).toEqual([])
          yield* TestClock.adjust('1 millis')
          expect(fired).toEqual([DateTime.toEpochMillis(at) + 40])
        }))
    })))

  test('suspends on a defect, answers Suspended, and resumes', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: { _tag: 'Tester' } })
          yield* runtime.settled
          const breaking = { requestId: 'break', sender: { _tag: 'Tester' as const }, keep: 'forever' as const }
          expect(yield* toy.send(id, { _tag: 'Break', nonce: 'b' }, breaking)).toEqual({ _tag: 'Suspended' })
          // Nothing is delivered to a suspended entity: a message that arrives has no reply yet either.
          expect(yield* toy.send(id, { _tag: 'Want', key: 'a', on: false, nonce: 'w' }, {
            requestId: 'want',
            sender: { _tag: 'Tester' },
            keep: 'forever',
          })).toEqual({ _tag: 'Suspended' })
          // The message it died on is discarded, and the entity runs again.
          yield* toy.discard(id)
          yield* runtime.settled
          const stored = yield* storage(program, yield* SqlClient.SqlClient).load(id)
          expect(stored?.suspension).toBe(null)
          expect(stored?.mailbox.length).toBe(0)
        }))
    })))

  // A cause holds the program's data, and PostgreSQL holds U+0000 in no text: the write of the suspension would
  // fail, and the entity would never be suspended (decision 0205).
  test('a defect whose cause holds U+0000 suspends the entity, and lists it', () =>
    onBoth(Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      const citing: Program<T> = {
        ...program,
        update: (message, meta) =>
          message._tag === 'Break' ? () => defect(`broken ${message.nonce}`) : program.update(message, meta),
      }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(citing), layer)
          const sender = { _tag: 'Tester' } as const
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender })
          yield* runtime.settled
          expect(yield* toy.send(id, { _tag: 'Break', nonce: 'a\u0000b' }, { requestId: 'break', sender, keep: 'forever' }))
            .toEqual({ _tag: 'Suspended' })
          expect((yield* toy.suspended).map(({ cause }) => cause)).toEqual(['InvariantDefect: broken a\\u0000b'])
        }))
    })))

  // An index that reads past what it looks up is `undefined`, though typed a scalar: the storage would write no JSON,
  // and the entity would crash at every step (decision 0206).
  test('an index that is no scalar suspends the entity, and lists it', () =>
    onBoth(Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      const named: Readonly<Record<number, number>> = { [keys.length]: 1 }
      const lookingUp: Program<T> = { ...program, indexes: { wanted: (projection) => named[projection] as number } }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(lookingUp), layer)
          const sender = { _tag: 'Tester' } as const
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender })
          yield* runtime.settled
          const want: Inbound = { _tag: 'Want', key: 'a', on: false, nonce: 'w' }
          expect(yield* toy.send(id, want, { requestId: 'r', sender, keep: 'forever' })).toEqual({ _tag: 'Suspended' })
          expect((yield* toy.suspended).map(({ cause }) => cause)).toEqual([
            "InvariantDefect: the index 'wanted' is no scalar: null, a string, a boolean or a number",
          ])
        }))
    })))

  // A step that drops a droppable operation interrupts it, and does not wait for its finalizers (decision 0128).
  test('a droppable operation the state drops is interrupted, and the entity does not wait for its finalizer', () =>
    database(Effect.gen(function*() {
      // `c` acts and never comes back, and its finalizer ends only once the test opens the gate.
      const gate = yield* Deferred.make<void>()
      const interrupted: Array<string> = []
      const dropping: Program<T> = {
        ...program,
        name: 'Dropping',
        init: (_flags, at) => ({ want: ['c'], applied: [], since: at, rings: at }),
        operations: {
          ...program.operations,
          C: operation.droppable(({ key }) =>
            Effect.andThen(acts(key, null), Effect.never).pipe(
              Effect.onInterrupt(() =>
                Effect.andThen(Effect.sync(() => interrupted.push(key)), Deferred.await(gate))
              ),
            )
          ),
        },
      }
      const { acted, layer } = yield* hands()
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(dropping), layer)
          yield* ran(toy.create(id, { flags: { at }, requestId: 'creation', sender: tester }))
          expect(acted).toEqual(['c'])
          const off = { _tag: 'Want', key: 'c', on: false, nonce: 'off' } as const
          expect(yield* ran(toy.send(id, off, { requestId: 'off', sender: tester, keep: 'forever' }))).toEqual({ _tag: 'Accepted' })
          expect(interrupted).toEqual(['c'])
          // The finalizer still waits on the gate, and the next message is handled meanwhile.
          const on = { _tag: 'Want', key: 'a', on: true, nonce: 'on' } as const
          expect(yield* ran(toy.send(id, on, { requestId: 'on', sender: tester, keep: 'forever' }))).toEqual({ _tag: 'Accepted' })
          yield* Deferred.succeed(gate, undefined)
          yield* runtime.settled
          const handled = (yield* toy.published('projection', [], all))
            .flatMap((row) => (row.message === null ? [] : [row.message]))
          expect(handled).not.toContainEqual({ _tag: 'Done', key: 'c' })
          expect(acted.filter((act) => act === 'c')).toEqual(['c'])
        }))
    })))

  test('a droppable operation that sends to an entity dies, and suspends its entity', () =>
    database(Effect.gen(function*() {
      const sender: Program<Omit<T, 'services'> & { services: Entities }> = {
        ...sending,
        operations: {
          ...sending.operations,
          C: operation.droppable(({ key }) =>
            // The type refuses a droppable runner that sends (decision 0129), and the runtime is what a runner
            // that escapes the type meets.
            // @ts-expect-error a droppable operation sends to no entity
            Effect.as(send(program, id, { _tag: 'Want', key: 'a', on: false, nonce: 'sent' }, 'want'), done(key))
          ),
        },
      }
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          yield* Effect.provide(runtime.deploy(program), layer)
          const from = yield* runtime.deploy(sender)
          yield* ran(from.create('sender', { flags: { at }, requestId: 'creation', sender: tester }))
          yield* runtime.settled
          const stored = yield* storage(sender, yield* SqlClient.SqlClient).load('sender')
          expect(stored?.suspension?.on).toEqual({ _tag: 'Operation', key: { name: 'c' }, incarnation: 1 })
          expect(yield* storage(program, yield* SqlClient.SqlClient).load(id)).toBeNull()
        }))
    })))

  // An id an operation gives is held as a caller's is (decisions 0157, 0179).
  for (
    const [broken, reason] of [
      ['toy\ud800', 'the id is "toy\\ud800", which is no text a database holds'],
      ['', 'the id is empty, and an id is not'],
    ] as const
  ) {
    test(`an operation that sends to the id ${JSON.stringify(broken)} dies, and suspends its entity`, () =>
      database(Effect.gen(function*() {
        const sender: Program<Omit<T, 'services'> & { services: Entities }> = {
          ...sending,
          operations: {
            ...sending.operations,
            C: operation.atLeastOnce(({ key }) =>
              Effect.as(send(program, broken, { _tag: 'Want', key: 'a', on: false, nonce: 'sent' }, 'want'), done(key))
            ),
          },
        }
        const { layer } = yield* hands()
        const at = yield* DateTime.now
        yield* process({}, (runtime) =>
          Effect.gen(function*() {
            yield* Effect.provide(runtime.deploy(program), layer)
            const from = yield* runtime.deploy(sender)
            yield* ran(from.create('sender', { flags: { at }, requestId: 'creation', sender: tester }))
            yield* runtime.settled
            const stored = yield* storage(sender, yield* SqlClient.SqlClient).load('sender')
            expect(stored?.suspension?.on).toEqual({ _tag: 'Operation', key: { name: 'c' }, incarnation: 1 })
            expect(stored?.suspension?.cause).toContain(reason)
          }))
      })))
  }

  // A suspension stops the handling of messages and the timers, not the operations (decision 0113).
  test('an operation under way when its entity suspends runs to its end, and is not run again once resumed', () =>
    database(Effect.gen(function*() {
      // `b` acts, and comes back only once the test lets it: an operation under way while its entity suspends.
      const release = yield* Deferred.make<void>()
      const acted: Array<string> = []
      const layer = Layer.succeed(
        Hands,
        Hands.of({
          act: (key) =>
            Effect.gen(function*() {
              acted.push(key)
              if (key === 'b') yield* Deferred.await(release)
            }),
        }),
      )
      const { entities, unloaded } = unloads()
      const { events, observe } = log()
      const at = yield* DateTime.now
      const store = storage(program, yield* SqlClient.SqlClient)
      yield* process({ unloaded, observe, passivate: { millis: 5 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* ran(toy.create(id, { flags: { at }, requestId: 'creation', sender: tester }))
          expect(yield* ran(toy.send(id, { _tag: 'Break', nonce: 'b' }, { requestId: 'break', sender: tester, keep: 'forever' })))
            .toEqual({ _tag: 'Suspended' })
          // `b` is not interrupted, and keeps the entity loaded; the timer is disarmed, and its time passes.
          expect(acted.filter((key) => key === 'b')).toEqual(['b'])
          yield* TestClock.adjust('50 millis')
          expect(entities).toEqual([])
          // The runtime stopped the timer's sleep: no firing is offered, which the machine would only drop.
          expect(events.filter((event) => event._tag === 'Fire')).toEqual([])
          // Its completion is recorded behind the message the entity died on, and nothing is handled.
          yield* Deferred.succeed(release, undefined)
          yield* runtime.settled
          const stored = yield* store.load(id)
          expect(stored?.mailbox.map((envelope) => envelope._tag)).toEqual(['Inbound', 'Internal'])
          expect(stored?.suspension?.on).toEqual({ _tag: 'Message' })
          // With its operations ended, the entity is unloaded. The discard loads it again: the completion waits in
          // the mailbox, so `b` is not started again, and the timer, due by now, fires.
          yield* TestClock.adjust('5 millis')
          expect(entities).toEqual([id])
          expect(yield* toy.discard(id)).toEqual({ _tag: 'Discarded' })
          yield* runtime.settled
          expect(acted.filter((key) => key === 'b')).toEqual(['b'])
          const handled = (yield* toy.published('projection', [], all))
            .flatMap((row) => (row.message === null ? [] : [row.message._tag]))
          expect(handled.filter((tag) => tag === 'Done').length).toBe(3)
          expect(handled).not.toContain('Unknown')
          // The timer is armed again, at a time that has passed, and fires: at once, or with the clock's next move,
          // as soon as the fiber of its sleep runs.
          yield* TestClock.adjust('1 millis')
          yield* runtime.settled
          expect(events.slice(events.findIndex((event) => event._tag === 'Discard')).map((event) => event._tag))
            .toContain('Fire')
          expect((yield* store.load(id))?.state.want).toEqual([])
        }))
    })))

  test('an operator whose resume the runtime cannot finish is given the defect, as a caller is', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      // The write of the resume fails: the entity crashes, and the operator waiting for its answer is told so.
      const failing = (point: Point, _entity: Address, event: Machine.Event<never>) =>
        point === 'BeforeCommit' && event._tag === 'Resume' ? Effect.die('the write failed') : Effect.void
      yield* process({ at: failing }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* ran(toy.create(id, { flags: { at }, requestId: 'creation', sender: tester }))
          yield* ran(toy.send(id, { _tag: 'Break', nonce: 'b' }, { requestId: 'break', sender: tester, keep: 'forever' }))
          const exit = yield* Effect.exit(ran(toy.resume(id)))
          expect(Exit.hasDies(exit)).toBe(true)
        }))
    })))

  test('an operator sees the suspended entities, who waits for each, and what a resume or a discard did', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      const store = storage(program, yield* SqlClient.SqlClient)
      const listed = (toy: Library.Handle<T>) =>
        Effect.map(toy.suspended, (entities) =>
          entities.map(({ since, ...rest }) => ({ ...rest, since: DateTime.toEpochMillis(since) })))
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          const senders = yield* runtime.deploy(sending)
          expect(yield* toy.suspended).toEqual([])
          expect(yield* toy.resume('nobody')).toEqual({ _tag: 'NotFound' })
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          yield* runtime.settled
          expect(yield* toy.discard(id)).toEqual({ _tag: 'NotSuspended' })
          yield* TestClock.adjust('7 millis')
          expect(yield* toy.send(id, { _tag: 'Break', nonce: 'b' }, { requestId: 'break', sender: tester, keep: 'forever' }))
            .toEqual({ _tag: 'Suspended' })
          // A sender's operation sends to the suspended toy, and waits for its resumption.
          yield* ran(senders.create('s', { flags: { at }, requestId: 's', sender: tester }))
          expect(yield* listed(toy)).toEqual([{
            id,
            on: { _tag: 'Message', kind: 'Inbound' },
            cause: expect.stringContaining('broken'),
            since: DateTime.toEpochMillis(at) + 7,
            waiting: [{ entity: { name: 'Sender', id: 's' }, key: { name: 'c' }, incarnation: 1, name: 'want' }],
          }])
          expect((yield* toy.inspect(id))?.suspension).toEqual((yield* toy.suspended)[0])
          // Resumed by the program that died on the message, it is activated, and dies on it again. `settled` would
          // wait for the sender's operation, which waits for the resumption: the test lets the step run instead.
          expect(yield* toy.resume(id)).toEqual({ _tag: 'Resumed' })
          yield* ran(Effect.void)
          const again = yield* listed(toy)
          expect(again.map(({ id, on }) => [id, on])).toEqual([[id, { _tag: 'Message', kind: 'Inbound' }]])
          expect(again[0]?.since).toBeGreaterThanOrEqual(DateTime.toEpochMillis(at) + 7)
          // The discard drops the message, and the sender is woken, sends again and is answered.
          expect(yield* toy.discard(id)).toEqual({ _tag: 'Discarded' })
          yield* runtime.settled
          expect(yield* toy.suspended).toEqual([])
          expect(yield* senders.read('s')).toBe(0)
          expect((yield* store.load(id))?.state.applied).toContain('sent')
        }))
      // A version whose `update` dies on the completion of `b`: an internal message, which no discard drops.
      const breaking: Program<T> = {
        ...program,
        update: (message, meta) => (state) =>
          message._tag === 'Done' && message.key === 'b' ? defect('broken on b') : program.update(message, meta)(state),
      }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(breaking), layer)
          const now = DateTime.toEpochMillis(yield* DateTime.now)
          yield* toy.create('toy-2', { flags: { at }, requestId: 'c2', sender: tester })
          yield* runtime.settled
          expect(yield* listed(toy)).toEqual([{
            id: 'toy-2',
            on: { _tag: 'Message', kind: 'Internal' },
            cause: expect.stringContaining('broken on b'),
            since: now,
            waiting: [],
          }])
          expect(yield* toy.discard('toy-2')).toEqual({ _tag: 'NotDiscarded' })
        }))
      // A version whose `work` dies on the stored state: the resume leaves the entity suspended, with the new cause.
      const dying: Program<T> = { ...program, work: () => defect('work died') }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(dying), layer)
          expect(yield* toy.resume('toy-2')).toEqual({
            _tag: 'StillSuspended',
            cause: expect.stringContaining('work died'),
          })
          // Suspended since the first time: a resume that fails keeps it.
          expect((yield* listed(toy)).map(({ id, cause, since }) => [id, cause, since])).toEqual([[
            'toy-2',
            expect.stringContaining('work died'),
            DateTime.toEpochMillis(yield* DateTime.now),
          ]])
        }))
    })))

  // An operator discards the message an entity died on to get it past that message (decision 0014). When an
  // operation sent it, the operation's `send` waits for the resumption and sends it again under the same request,
  // and is answered the rejection the discard stored, so the entity does not die on it again (decision 0260).
  test('a discard gets an entity past the message an operation sent, which the operation does not send again', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      const breaking: Program<Omit<T, 'services'> & { services: Entities }> = {
        ...sending,
        name: 'Breaker',
        operations: {
          ...sending.operations,
          C: operation.atLeastOnce(({ key }) =>
            Effect.as(send(program, id, { _tag: 'Break', nonce: 'sent' }, 'break'), done(key))
          ),
        },
      }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          const breaker = yield* runtime.deploy(breaking)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          yield* runtime.settled
          // The breaker's operation sends `Break`, the toy dies on it, and the operation waits for its resumption.
          yield* ran(breaker.create('s', { flags: { at }, requestId: 's', sender: tester }))
          expect((yield* toy.suspended).map(({ waiting }) => waiting.map(({ name }) => name))).toEqual([['break']])
          yield* TestClock.adjust('5 millis')
          expect(yield* toy.discard(id)).toEqual({ _tag: 'Discarded' })
          // The step the woken operation sends runs, as in the test of what a discard did above.
          yield* ran(Effect.void)
          yield* ran(Effect.void)
          // Without the stored rejection the toy is suspended again, on the message the operation sent again.
          expect(yield* toy.suspended).toEqual([])
        }))
    })))

  // Each operator is answered by its own event, not by another operator's event applied first (decision 0114).

  test('two operators who discard at once are each told what their own discard did', () =>
    database(Effect.gen(function*() {
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      const gate = yield* Deferred.make<void>()
      yield* process({
        at: (point, _entity, event) =>
          point === 'BeforeCommit' && event._tag === 'Discard' ? Deferred.await(gate) : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          yield* runtime.settled
          expect(yield* toy.send(id, { _tag: 'Break', nonce: 'b' }, { requestId: 'break', sender: tester, keep: 'forever' }))
            .toEqual({ _tag: 'Suspended' })
          // The first discard waits before its commit, and the second is offered behind it meanwhile.
          const first = yield* running(toy.discard(id))
          const second = yield* running(toy.discard(id))
          yield* Deferred.succeed(gate, undefined)
          expect(yield* Fiber.join(first)).toEqual({ _tag: 'Discarded' })
          expect(yield* Fiber.join(second)).toEqual({ _tag: 'NotSuspended' })
        }))
    })))

  test('an operator inspects an entity: its state, its mailbox, its work and its suspension, as stored', () =>
    onBoth(Effect.gen(function*() {
      const { layer } = yield* hands({ holds: true })
      const at = yield* DateTime.now
      const workOf = (inspected: Library.Inspected<T> | null) =>
        inspected?.work.map(({ key, incarnation }) => [key.name, incarnation])
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          expect(yield* toy.inspect(id)).toBeNull()
          // The hands never come back, so the work stays under way: `settled` would wait for it, and the test lets
          // the operations start instead.
          yield* ran(toy.create(id, { flags: { at }, requestId: 'creation', sender: tester }))
          const created = yield* toy.inspect(id)
          expect(created?.state.want).toEqual(keys)
          expect(created?.state.applied).toEqual([])
          expect(created?.mailbox).toEqual([])
          expect(created?.suspension).toBeNull()
          expect(workOf(created)).toEqual([['a', 1], ['b', 2], ['c', 3], ['t', 4]])
          expect(created?.work.find(({ key }) => key.name === 't')?.work)
            .toEqual(timer<Internal>(created?.state.rings ?? at, { _tag: 'Rang', key: 't' }))
          yield* TestClock.adjust('7 millis')
          const breaks = yield* DateTime.now
          expect(yield* toy.send(id, { _tag: 'Break', nonce: 'b' }, { requestId: 'break', sender: tester, keep: 'forever' }))
            .toEqual({ _tag: 'Suspended' })
          // The suspension is the one `suspended` lists, and the message it died on is first in the mailbox.
          const suspended = yield* toy.inspect(id)
          expect(suspended?.suspension).toEqual((yield* toy.suspended)[0])
          expect(suspended?.suspension?.since).toEqual(breaks)
          expect(suspended?.mailbox).toEqual([{
            _tag: 'Inbound',
            request: { _tag: 'Caller', sender: tester, id: 'break' },
            message: { _tag: 'Break', nonce: 'b' },
          }])
          expect(workOf(suspended)).toEqual(workOf(created))
        }))
      // An entity this process does not hold is inspected from what is stored, and is not activated: activated by
      // a program whose `work` dies, it would be suspended anew, with that cause.
      const dying: Program<T> = { ...program, work: () => defect('work died') }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(dying), layer)
          const inspected = yield* toy.inspect(id)
          expect(inspected?.suspension?.cause).toContain('broken')
          expect(inspected?.suspension?.waiting).toEqual([])
          expect((yield* toy.suspended).map(({ cause }) => cause)).toEqual([expect.stringContaining('broken')])
          // A resume activates it, and the new cause is what an inspection then reads.
          expect(yield* toy.resume(id)).toEqual({ _tag: 'StillSuspended', cause: expect.stringContaining('work died') })
          expect((yield* toy.inspect(id))?.suspension?.cause).toContain('work died')
        }))
    })))

  test('an inspection gives the work in the order it started, not in the order of the names of its keys', () =>
    onBoth(Effect.gen(function*() {
      const { layer } = yield* hands({ holds: true })
      const at = yield* DateTime.now
      // The work starts in the order `work` gives it, here the reverse of the keys' names, while the database
      // may give the rows by the names of their keys (decision 0185).
      const reversed: Program<T> = {
        ...program,
        work: (state) => Object.fromEntries(Object.entries(program.work(state)).reverse()),
      }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(reversed), layer)
          // The hands never come back, so the work stays under way, and the test lets the operations start.
          yield* ran(toy.create(id, { flags: { at }, requestId: 'creation', sender: tester }))
          const work = (yield* toy.inspect(id))?.work.map(({ key, incarnation }) => [key.name, incarnation])
          expect(work).toEqual([['t', 1], ['c', 2], ['b', 3], ['a', 4]])
        }))
    })))

  test('an inspection reads one snapshot, so a step that commits meanwhile is read whole, under prioritized schedules', () => {
    // The stored keys are the work the stored state holds, and the inspection reads the state and the keys in two
    // statements. A step between the two would give a state that holds a key and no work under it (decision 0185).
    // With the two read outside one snapshot, seed 3, pinned, fails. `bun run test:pins` runs it against that form,
    // the pin `0185` of `src/runtime.test_pins.ts` (decision 0254).
    explored(() =>
      Effect.gen(function*() {
        const { layer } = yield* hands()
        const at = yield* DateTime.now
        return yield* process({}, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(program), layer)
            yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
            const inspections = yield* together([0, 1, 2, 3].map(() => toy.inspect(id)))
            yield* runtime.settled
            return inspections.map((inspected) =>
              inspected === null || [...inspected.state.want].sort().join() ===
                inspected.work.map(({ key }) => key.name).sort().join()
            )
          }))
      }), [true, true, true, true], { pinned: [3] })
  }, 60_000)

  test('an at-most-once operation delivers unknown after a crash, and an idempotent one runs again', () =>
    database(Effect.gen(function*() {
      // The first process dies with its operations acted and no completion recorded: the hands never come back.
      const first = yield* hands({ holds: true })
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), first.layer)
          // The creation starts its work, which has acted once everything waits.
          yield* ran(toy.create(id, { flags: { at }, requestId: 'creation', sender: { _tag: 'Tester' } }))
        }))
      expect(first.acted.filter((act) => act === 'b').length).toBe(1)
      // The operations the crash interrupted are what the next process activates the entity for (decision 0029).
      expect(yield* storage(program, yield* SqlClient.SqlClient).interrupted).toEqual([id])
      const second = yield* hands()
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          yield* Effect.provide(runtime.deploy(program), second.layer)
          yield* runtime.settled
        }))
      // `b` is at most once: it may have acted, so it never runs again, and its `unknown` is delivered instead.
      expect(second.acted.filter((act) => act === 'b').length).toBe(0)
      // `a` is idempotent and `c` at least once: both run again.
      expect(second.acted.filter((act) => act.startsWith('a:')).length).toBe(1)
      expect(second.acted.filter((act) => act === 'c').length).toBe(1)
    })))

})

describe('a planned stop', () => {
  /**
   * Hands that record each act, and come back once `open` is run. `interrupted` is done once `interrupts` acts are
   * interrupted: how a test knows that the drain has stopped what runs again.
   */
  const held = (interrupts: number) =>
    Effect.sync(() => {
      const acted: Array<string> = []
      const gate = Deferred.makeUnsafe<void>()
      const interrupted = Deferred.makeUnsafe<void>()
      let seen = 0
      return {
        acted,
        open: Deferred.succeed(gate, undefined),
        interrupted: Deferred.await(interrupted),
        layer: Layer.succeed(
          Hands,
          Hands.of({
            act: (key, idempotencyKey) =>
              Effect.andThen(
                Effect.sync(() => acted.push(idempotencyKey === null ? key : `${key}:${idempotencyKey}`)),
                Effect.onInterrupt(
                  Deferred.await(gate),
                  () => ++seen === interrupts ? Deferred.succeed(interrupted, undefined) : Effect.void,
                ),
              ),
          }),
        ),
      }
    })

  /**
   * A first process, with `drain`, that creates the entity and ends with its work under way, in a fiber of its own.
   * `during` runs once the drain has interrupted the `interrupts` operations that run again, with the handle, while
   * the scope's closing waits. A first process `interrupted` waits instead of ending, and its scope closes as its
   * fiber is interrupted, as `runMain` interrupts the main fiber on a signal. A second process without the option
   * then activates the entity, and gives what it acted and what the entity published.
   */
  const stopped = <A>(
    options: Options & Hooks,
    during: (toy: Library.Handle<T>, open: Effect.Effect<boolean>) => Effect.Effect<A>,
    { program: deployed = program, interrupts = 2, interrupted = false }: Readonly<
      { program?: Program<T>; interrupts?: number; interrupted?: boolean }
    > = {},
  ) =>
    Effect.gen(function*() {
      const first = yield* held(interrupts)
      const at = yield* DateTime.now
      const handle = yield* Deferred.make<Library.Handle<T>>()
      const stopping = yield* Effect.forkChild(process(options, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(deployed), first.layer)
          yield* ran(toy.create(id, { flags: { at }, requestId: 'creation', sender: tester }))
          yield* Deferred.succeed(handle, toy)
          if (interrupted) yield* Effect.never
        })))
      const toy = yield* Deferred.await(handle)
      const ended = interrupted ? yield* Effect.forkChild(Fiber.interrupt(stopping)) : stopping
      yield* first.interrupted
      const during_ = yield* during(toy, first.open)
      yield* Fiber.join(ended)
      const second = yield* hands()
      const after = yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(deployed), second.layer)
          yield* runtime.settled
          return { toy, published: yield* toy.published('projection', [], all) }
        }))
      return { first: first.acted, second: second.acted, published: after.published, during: during_ }
    })

  const unknown = (published: ReadonlyArray<Library.Published<T>>) =>
    published.filter((row) => row.message !== null && row.message._tag === 'Unknown').map((row) => row.message)

  // Bug 6 of the roadmap, ruled out: a step in the drain that gives a droppable operation a new incarnation does not
  // start it, and the next activation starts it, as an operation stored with no completion. Only an at-most-once
  // operation's completion steps in the drain, since a caller waits for its end, so `b`'s completion changes `a`.
  test('a droppable operation that a step of the drain changes runs at the next activation', () =>
    database(Effect.gen(function*() {
      const flipped = (state: { readonly applied: ReadonlyArray<string> }) => state.applied.includes('flip')
      const dropping: Program<T> = {
        ...program,
        name: 'Dropping',
        init: (_flags, at) => ({ want: ['a', 'b', 'c'], applied: [], since: at, rings: at }),
        update: (message, meta) => (state) =>
          message._tag === 'Done' && message.key === 'b'
            ? { ...state, want: state.want.filter((key) => key !== 'b'), applied: [...state.applied, 'flip'] }
            : program.update(message, meta)(state),
        work: (state) =>
          Object.fromEntries(state.want.map((key) => [
            key,
            key === 'a'
              ? (flipped(state) ? { _tag: 'C', key: 'a' } as const : { _tag: 'A' } as const)
              : { _tag: 'B', key } as const,
          ])),
        operations: {
          ...program.operations,
          A: operation.droppable(() => acts('a', null)),
          C: operation.droppable(({ key }) => acts(key, 'changed' as IdempotencyKey)),
        },
      }
      const acted: Array<string> = []
      const gates = { b: Deferred.makeUnsafe<void>(), c: Deferred.makeUnsafe<void>() }
      const layer = (first: boolean) => Layer.succeed(
        Hands,
        Hands.of({
          act: (key, idempotencyKey) =>
            Effect.andThen(
              Effect.sync(() => acted.push(idempotencyKey === null ? key : `${key}:${idempotencyKey}`)),
              key === 'b' || key === 'c' ? Deferred.await(gates[key]) : first ? Effect.never : Effect.void,
            ),
        }),
      )
      const at = yield* DateTime.now
      const created = yield* Deferred.make<void>()
      const stopping = yield* Effect.forkChild(process({ drain: { millis: 100 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(dropping), layer(true))
          yield* ran(toy.create(id, { flags: { at }, requestId: 'creation', sender: tester }))
          yield* Deferred.succeed(created, undefined)
        })))
      yield* Deferred.await(created)
      yield* TestClock.adjust('1 millis')
      yield* Deferred.succeed(gates.b, undefined)
      yield* TestClock.adjust('1 millis')
      yield* TestClock.adjust('1 millis')
      yield* Deferred.succeed(gates.c, undefined)
      yield* Fiber.join(stopping)
      expect(acted.filter((act) => act === 'a:changed')).toEqual([])
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          yield* Effect.provide(runtime.deploy(dropping), layer(false))
          yield* runtime.settled
        }))
      // The changed operation was never started, so the next activation starts it once.
      expect(acted.filter((act) => act === 'a:changed')).toEqual(['a:changed'])
    })))

  test('an at-most-once operation under way ends, and the others run again at the next activation', () =>
    database(Effect.gen(function*() {
      const { first, second, published } = yield* stopped({ drain: { millis: 100 } }, (_toy, open) => open)
      expect(first.filter((act) => act === 'b').length).toBe(1)
      // `b` ended in the drain, and its completion was committed: it is neither run again nor delivered `unknown`.
      expect(second.filter((act) => act === 'b').length).toBe(0)
      expect(unknown(published)).toEqual([])
      // `a` and `c` were interrupted at once, before the gate opened, and run again.
      expect(second.filter((act) => act.startsWith('a:')).length).toBe(1)
      expect(second.filter((act) => act === 'c').length).toBe(1)
    })))

  test('a drain holds in a scope that closes its finalizers in parallel', () =>
    database(Effect.gen(function*() {
      // Decision 0120: the runtime closes a sequential scope of its own, so the drain runs before what it waits for
      // is stopped, whatever the strategy of the caller's scope.
      const { second, published } = yield* stopped({ drain: { millis: 100 }, finalizers: 'parallel' }, (_toy, open) =>
        open)
      expect(second.filter((act) => act === 'b').length).toBe(0)
      expect(unknown(published)).toEqual([])
    })))

  test('a drain holds when the scope closes as the fiber that launched the runtime is interrupted', () =>
    database(Effect.gen(function*() {
      // Decision 0219: the scope closes in the interrupted fiber, whose interruption is still pending in the
      // finalizer. A wait made interruptible there would end at once, and `b` would be delivered `unknown`.
      const { second, published } = yield* stopped({ drain: { millis: 100 } }, (_toy, open) => open, {
        interrupted: true,
      })
      expect(second.filter((act) => act === 'b').length).toBe(0)
      expect(unknown(published)).toEqual([])
    })))

  test('a drain whose launching fiber is interrupted still ends once its millis run out', () =>
    database(Effect.gen(function*() {
      // The wait runs where the finalizer cannot be interrupted, and the timeout alone ends it (decision 0219).
      const { published } = yield* stopped(
        { drain: { millis: 100 } },
        () => Effect.andThen(TestClock.adjust('1 millis'), TestClock.adjust('100 millis')),
        { interrupted: true },
      )
      expect(unknown(published)).toEqual([{ _tag: 'Unknown', key: 'b' }])
    })))

  test('the drain waits for the completion of an at-most-once operation, under prioritized schedules', () => {
    // Decision 0119: the drain looks whether anything is left after it takes the signal of `settled`, so an
    // operation's end or a step's between the look and the wait is not missed, and its completion is committed. With
    // the signal taken in a step after the look, seed 91, pinned, fails. `bun run test:pins` runs it against that
    // form, the pin `0119` of `src/runtime.test_pins.ts` (decision 0254).
    explored((window) =>
      Effect.map(
        stopped({ drain: { millis: 100 } }, (_toy, open) => Effect.andThen(opened(window, true), open)),
        ({ second, published }) => ({ rerun: second.filter((act) => act === 'b').length, unknown: unknown(published) }),
      ), { rerun: 0, unknown: [] }, { open: false, pinned: [91] })
  }, 60_000)

  test('a completion in the drain starts no operation that runs again, and arms no timer', () =>
    database(Effect.gen(function*() {
      // `b`'s completion brings `a`, and `t`, due at once: both wait for the next activation.
      const chained: Program<T> = {
        ...program,
        name: 'Chained',
        init: (_flags, at) => ({ want: ['b', 'c'], applied: [], since: at, rings: at }),
        update: (message, meta) => (state) =>
          message._tag === 'Done' && message.key === 'b'
            ? { ...state, want: ['c', 'a', 't'] }
            : program.update(message, meta)(state),
      }
      const { events, observe } = log()
      // The clock moves once the gate is open, so that a timer armed in the drain would fire there.
      const { first, second } = yield* stopped({ drain: { millis: 100 }, observe }, (_toy, open) =>
        Effect.andThen(open, TestClock.adjust('1 millis')), {
        program: chained,
        interrupts: 1,
      })
      expect(first.filter((act) => act.startsWith('a:')).length).toBe(0)
      expect(events.filter((event) => event._tag === 'Fire').length).toBe(0)
      expect(second.filter((act) => act.startsWith('a:')).length).toBe(1)
    })))

  test('a step the drain handles starts no operation that runs again, and arms no timer', () =>
    database(Effect.gen(function*() {
      // `b` and `c` are at most once. `b`'s completion brings `a` and `t`, due at once, while `c` still holds the
      // drain open, so the step that handles it runs in the drain: `a` and `t` wait for the next activation.
      const heldOpen: Program<T> = {
        ...program,
        name: 'HeldOpen',
        init: (_flags, at) => ({ want: ['b', 'c'], applied: [], since: at, rings: at }),
        update: (message, meta) => (state) =>
          message._tag === 'Done' && message.key === 'b'
            ? { ...state, want: ['c', 'a', 't'] }
            : program.update(message, meta)(state),
        work: (state) =>
          Object.fromEntries(
            Object.entries(program.work(state)).map((
              [key, work],
            ) => [key, key === 'c' ? { _tag: 'B', key: 'c' } as const : work]),
          ),
      }
      const acted: Array<string> = []
      const gates = { b: Deferred.makeUnsafe<void>(), c: Deferred.makeUnsafe<void>() }
      const layer = Layer.succeed(
        Hands,
        Hands.of({
          act: (key, idempotencyKey) =>
            Effect.andThen(
              Effect.sync(() => acted.push(idempotencyKey === null ? key : `${key}:${idempotencyKey}`)),
              key === 'b' || key === 'c' ? Deferred.await(gates[key]) : Effect.void,
            ),
        }),
      )
      const { events, observe } = log()
      const at = yield* DateTime.now
      const created = yield* Deferred.make<void>()
      const stopping = yield* Effect.forkChild(process({ drain: { millis: 100 }, observe }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(heldOpen), layer)
          yield* ran(toy.create(id, { flags: { at }, requestId: 'creation', sender: tester }))
          yield* Deferred.succeed(created, undefined)
        })))
      yield* Deferred.await(created)
      // The closing fiber reaches the drain's wait; then `b` ends, its step runs, and a timer armed would fire.
      yield* TestClock.adjust('1 millis')
      yield* Deferred.succeed(gates.b, undefined)
      yield* TestClock.adjust('1 millis')
      yield* TestClock.adjust('1 millis')
      const handled = events.filter((event) => event._tag === 'Handle').length
      yield* Deferred.succeed(gates.c, undefined)
      yield* Fiber.join(stopping)
      // `b`'s completion was handled in the drain.
      expect(handled).toBeGreaterThan(0)
      expect(acted.filter((act) => act.startsWith('a:')).length).toBe(0)
      expect(events.filter((event) => event._tag === 'Fire').length).toBe(0)
      const next = { acted: [] as Array<string>, ...log() }
      yield* process({ observe: next.observe }, (runtime) =>
        Effect.gen(function*() {
          yield* Effect.provide(runtime.deploy(heldOpen), Layer.succeed(Hands, Hands.of({
            act: (key, idempotencyKey) =>
              Effect.sync(() => next.acted.push(idempotencyKey === null ? key : `${key}:${idempotencyKey}`)),
          })))
          yield* runtime.settled
        }))
      expect(next.acted.filter((act) => act.startsWith('a:')).length).toBe(1)
      expect(next.events.filter((event) => event._tag === 'Fire').length).toBe(1)
    })))

  test('a message an at-most-once operation sends to another entity in the drain is delivered', () =>
    database(Effect.gen(function*() {
      // The sender's `b` is at most once, and sends to the toy once the drain has begun. The guard of a caller's
      // request does not hold it back: the toy handles it in the drain, and `b` ends without its `unknown`.
      const gate = yield* Deferred.make<void>()
      const sender: Program<Omit<T, 'services'> & { services: Entities }> = {
        ...sending,
        init: (_flags, at) => ({ want: ['b'], applied: [], since: at, rings: at }),
        operations: {
          ...sending.operations,
          B: operation.atMostOnce(
            ({ key }) =>
              Effect.andThen(
                Deferred.await(gate),
                Effect.as(send(program, id, { _tag: 'Want', key: 'a', on: false, nonce: 'sent' }, 'want'), done(key)),
              ),
            ({ key }): Internal => ({ _tag: 'Unknown', key }),
          ),
        },
      }
      const { layer } = yield* hands()
      const at = yield* DateTime.now
      const store = storage(program, yield* SqlClient.SqlClient)
      const senders = storage(sender, yield* SqlClient.SqlClient)
      const created = yield* Deferred.make<void>()
      const stopping = yield* Effect.forkChild(process({ drain: { millis: 100 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          const sends = yield* runtime.deploy(sender)
          yield* ran(toy.create(id, { flags: { at }, requestId: 'creation', sender: tester }))
          yield* ran(sends.create('s', { flags: { at }, requestId: 's', sender: tester }))
          yield* Deferred.succeed(created, undefined)
        })))
      yield* Deferred.await(created)
      // The closing fiber reaches the drain's wait, then `b` sends; the drain's time runs out after.
      yield* TestClock.adjust('1 millis')
      yield* Deferred.succeed(gate, undefined)
      yield* TestClock.adjust('1 millis')
      yield* TestClock.adjust('100 millis')
      yield* Fiber.join(stopping)
      expect((yield* store.load(id))?.state.applied).toEqual(['sent'])
      const stored = yield* senders.load('s')
      expect(stored?.mailbox.map((envelope) => envelope.message)).toEqual([{ _tag: 'Done', key: 'b' }])
    })))

  test('an at-most-once operation that outlasts the drain delivers unknown, as after a crash', () =>
    database(Effect.gen(function*() {
      const { events, observe } = log()
      const { second, published } = yield* stopped(
        { drain: { millis: 100 }, observe },
        // The closing fiber reaches its wait, and then the drain's time runs out, past the time of `t`.
        () => Effect.andThen(TestClock.adjust('1 millis'), TestClock.adjust('100 millis')),
      )
      // The drain stopped the timer: its time came in the drain, and it fires in the next process.
      expect(events.filter((event) => event._tag === 'Fire').length).toBe(0)
      expect(second.filter((act) => act === 'b').length).toBe(0)
      expect(unknown(published)).toEqual([{ _tag: 'Unknown', key: 'b' }])
    })))

  test('a creation committed before the drain starts its at-most-once operation, and the drain waits for it', () =>
    database(Effect.gen(function*() {
      // The creation commits and holds before its work starts. Stopped there, `b` would be stored and never started,
      // and deliver `unknown` without having run.
      const first = yield* hands()
      const at = yield* DateTime.now
      const gate = yield* Deferred.make<void>()
      const reached = yield* Deferred.make<void>()
      const stopping = yield* Effect.forkChild(process({
        drain: { millis: 100 },
        at: (point, _entity, event) =>
          point === 'AfterCommit' && event._tag === 'Create'
            ? Effect.andThen(Deferred.succeed(reached, undefined), Deferred.await(gate))
            : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), first.layer)
          yield* Effect.forkChild(toy.create(id, { flags: { at }, requestId: 'creation', sender: tester }))
          yield* Deferred.await(reached)
        })))
      yield* Deferred.await(reached)
      // The closing fiber reaches the drain's wait, and the creation goes on.
      yield* TestClock.adjust('1 millis')
      yield* Deferred.succeed(gate, undefined)
      yield* Fiber.join(stopping)
      expect(first.acted.filter((act) => act === 'b').length).toBe(1)
      const second = yield* hands()
      const published = yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), second.layer)
          yield* runtime.settled
          return yield* toy.published('projection', [], all)
        }))
      expect(second.acted.filter((act) => act === 'b').length).toBe(0)
      expect(unknown(published)).toEqual([])
    })))

  test('the waker activates no entity in the drain', () =>
    database(Effect.gen(function*() {
      const first = yield* held(2)
      const at = yield* DateTime.now
      const restarted: Array<string> = []
      const ending = yield* Deferred.make<void>()
      const stopping = yield* Effect.forkChild(process({
        drain: { millis: 100 },
        passivate: { millis: 5 },
        observe: (entity, event) =>
          Effect.sync(() => {
            if (event._tag === 'Restart') restarted.push(entity.id)
          }),
      }, (runtime) =>
        Effect.gen(function*() {
          // `timed` is unloaded with its timer stored, due at 40 millis: the waker's to activate.
          const timers = yield* Effect.provide(runtime.deploy(timed), first.layer)
          yield* timers.create('timed', { flags: { at }, requestId: 'creation', sender: tester })
          yield* TestClock.adjust('5 millis')
          const toy = yield* Effect.provide(runtime.deploy(program), first.layer)
          yield* ran(toy.create(id, { flags: { at }, requestId: 'creation', sender: tester }))
          yield* Deferred.succeed(ending, undefined)
        })))
      yield* Deferred.await(ending)
      yield* first.interrupted
      // The drain outlasts the time of `timed`.
      yield* TestClock.adjust('1 millis')
      yield* TestClock.adjust('100 millis')
      yield* Fiber.join(stopping)
      expect(restarted).toEqual([])
    })))

  test('a caller that arrives during the drain waits, is interrupted, and a retry is answered after the restart', () =>
    database(Effect.gen(function*() {
      const want = { _tag: 'Want', key: 'a', on: false, nonce: 'late' } as const
      const request = { requestId: 'late', sender: tester, keep: 'forever' as const }
      const { during } = yield* stopped({ drain: { millis: 100 } }, (toy, open) =>
        Effect.gen(function*() {
          const callers: Array<Fiber.Fiber<unknown>> = [
            yield* running(toy.send(id, want, request)),
            yield* running(toy.create('late', { flags: { at: yield* DateTime.now }, ...request })),
            yield* running(toy.discard(id)),
          ]
          // Nothing answers them while the at-most-once operation holds the drain.
          const waiting = callers.map((caller) => caller.pollUnsafe() === undefined)
          yield* open
          return { waiting, exits: yield* Effect.forEach(callers, Fiber.await) }
        }))
      expect(during.waiting).toEqual([true, true, true])
      expect(during.exits.map(Exit.hasInterrupts)).toEqual([true, true, true])
      // The message was never taken, so the retry of the next process is applied.
      const replies = yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), (yield* hands()).layer)
          return { sent: yield* toy.send(id, want, request), late: yield* toy.read('late') }
        }))
      expect(replies).toEqual({ sent: { _tag: 'Accepted' }, late: null })
    })))

  /** The program with no work under `b`, so that a first process leaves `toy-1` to `toy-3` with `a` and `c` under way. */
  const withoutB: Program<T> = {
    ...program,
    work: (state) => {
      const kept = Object.entries(program.work(state) as Record<string, unknown>).filter(([key]) => key !== 'b')
      return Object.fromEntries(kept) as ReturnType<typeof program.work>
    },
  }
  const leftUnderWay = Effect.gen(function*() {
    const at = yield* DateTime.now
    yield* process({}, (runtime) =>
      Effect.gen(function*() {
        const toy = yield* Effect.provide(runtime.deploy(withoutB), (yield* hands({ holds: true })).layer)
        yield* ran(toy.create('toy-1', { flags: { at }, requestId: 'one', sender: tester }))
        yield* ran(toy.create('toy-2', { flags: { at }, requestId: 'two', sender: tester }))
        yield* ran(toy.create('toy-3', { flags: { at }, requestId: 'three', sender: tester }))
      }))
  })

  test('a deploy that registers during the drain has the operations that run again stopped at once', () =>
    database(Effect.gen(function*() {
      // Decision 0261: the drain stops the operations that run again of a deployment still activating, as it stops
      // those of the deployments registered (decision 0119), a registration during the drain forks no waker, and no
      // activation starts once the drain began. The second process deploys a program with work under `b`: the
      // activation of `toy-1` starts `a`, `c` and the at-most-once `b`, and the deploy is held at the activation of
      // `toy-2` while the launch's scope closes, then registers during the drain without activating `toy-3`.
      yield* leftUnderWay
      const gate = yield* Deferred.make<void>()
      const reached = yield* Deferred.make<void>()
      const held = yield* Deferred.make<void>()
      const acted: Array<string> = []
      const stopped: Array<string> = []
      const layer = Layer.succeed(
        Hands,
        Hands.of({
          act: (key) =>
            Effect.andThen(
              Effect.sync(() => acted.push(key)),
              key === 'b'
                ? Deferred.await(gate)
                : Effect.onInterrupt(Effect.never, () => Effect.sync(() => stopped.push(key))),
            ),
        }),
      )
      const stopping = yield* Effect.forkChild(process({
        drain: { millis: 100 },
        at: (point, entity, event) =>
          point === 'AfterCommit' && event._tag === 'Restart' && entity.id === 'toy-2'
            ? Effect.andThen(Deferred.succeed(reached, undefined), Deferred.await(held))
            : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          yield* Effect.forkChild(Effect.provide(runtime.deploy(program), layer))
          yield* Deferred.await(reached)
        })))
      yield* Deferred.await(reached)
      // The closing fiber reaches the drain's wait, which the activation of `toy-2` holds, and the deploy then
      // registers. The timer `t` of `toy-3` is then due, 40 millis after its creation: a waker forked in the drain
      // would activate `toy-3` and start its `b`. `b` ends well within the drain's time.
      yield* TestClock.adjust('1 millis')
      yield* Deferred.succeed(held, undefined)
      yield* TestClock.adjust('1 millis')
      yield* TestClock.adjust('50 millis')
      yield* Deferred.succeed(gate, undefined)
      yield* TestClock.adjust('1 millis')
      // `a` and `c` of `toy-1` started before the drain, and run again at the next activation. So the drain stops
      // them at once, as it stops those of a deployment registered before it (decision 0119), and does not wait its
      // 100 millis for them. Those of `toy-2` are not started, since its activation ends in the drain, and `toy-3` is
      // activated neither by the deploy nor by a waker: `b` starts twice, not three times.
      const early = [...stopped].sort()
      yield* TestClock.adjust('100 millis')
      yield* Fiber.join(stopping)
      expect(acted.filter((key) => key === 'b').length).toBe(2)
      expect([...stopped].sort()).toEqual(['a', 'c'])
      expect(early).toEqual(['a', 'c'])
      const published = yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), (yield* hands()).layer)
          yield* runtime.settled
          return yield* toy.published('projection', [], all)
        }))
      // `b` of `toy-1` ran and ended within the drain, so it is not delivered `unknown`, and `toy-3` was activated
      // by the next process alone, whose `b` starts there.
      expect(unknown(published.filter((row) => row.id !== 'toy-2'))).toEqual([])
    })))

  test('a drain that looks while a deploy activates closes on no at-most-once operation the deploy stores, under every deviation', () => {
    // Decision 0261: the drain counts the entities of a deployment still activating. The deploy runs detached, and
    // the launch's scope closes once `toy-1` is activated, so that the drain looks while the deploy loads `toy-2` or
    // `toy-3`. A drain that found nothing there to wait for would close the scope on an at-most-once `b` the deploy
    // started, and the next process would deliver it `unknown`. A drain that looks before an entity is loaded closes
    // the scope before the entity's activation commits, so that nothing of it is stored: no deviation of the run
    // finds the drain between two activations otherwise. With the drain counting the registered deployments alone, the
    // deviation pinned fails. `bun run test:pins` runs it against that form, the pin `0261` of
    // `src/runtime.test_pins.ts` (decision 0254).
    explored((window) =>
      Effect.gen(function*() {
        yield* leftUnderWay
        const begun = yield* Deferred.make<void>()
        const layer = Layer.succeed(
          Hands,
          Hands.of({ act: (key) => key === 'b' ? Effect.void : Effect.never }),
        )
        yield* process({
          drain: { millis: 100 },
          at: (point, entity, event) =>
            point === 'AfterCommit' && event._tag === 'Restart' && entity.id === 'toy-1'
              ? Deferred.succeed(begun, undefined)
              : Effect.void,
        }, (runtime) =>
          Effect.gen(function*() {
            yield* Effect.forkDetach(Effect.provide(runtime.deploy(program), layer))
            yield* Deferred.await(begun)
            yield* opened(window, true)
          }))
        yield* opened(window, false)
        const published = yield* process({}, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* Effect.provide(runtime.deploy(program), (yield* hands()).layer)
            yield* runtime.settled
            return yield* toy.published('projection', [], all)
          }))
        return unknown(published)
      }), [], { open: false, bound: 1, pinned: [{ decision: 80, choice: 1 }] })
  }, 60_000)

  test('a drain of no whole number of millis is the caller defect, and a drain of 0 millis is not', () =>
    database(Effect.gen(function*() {
      const exit = yield* Effect.exit(process({ drain: { millis: 1.5 } }, () => Effect.void))
      expect(Exit.hasDies(exit)).toBe(true)
      // No millis at all is a drain that waits for nothing, and stops what runs as a crash does.
      expect(Exit.isSuccess(yield* Effect.exit(process({ drain: { millis: 0 } }, () => Effect.void)))).toBe(true)
    })))
})

/**
 * Passivation: an entity with nothing to do is unloaded, and what is stored wakes it (decision 0029). To the
 * machine it is a `Restart`, so the comparison with the replay is what says the passivation lost nothing.
 */

describe('the read model', () => {
  const tester = { _tag: 'Tester' } as const
  const ids = ['t-1', 't-2', 't-3']
  const held = ['t-1', 't-3']
  /** A later version of the program that counts the other way: its index is not the one the rows hold. */
  const negated: Program<T> = { ...program, indexes: { wanted: (projection) => -projection } }

  /** Three toys with nothing left under way: everything they were created with ran, and each reads 0. */
  const settled = (runtime: Runtime, at: DateTime.Utc) =>
    Effect.gen(function*() {
      const { layer } = yield* hands()
      const toy = yield* Effect.provide(runtime.deploy(program), layer)
      for (const id of ids) yield* toy.create(id, { flags: { at }, requestId: `c-${id}`, sender: tester })
      yield* runtime.settled
      yield* TestClock.adjust('60 millis')
      yield* runtime.settled
      return toy
    })

  /** Two of them given work that never comes back, so that the three do not all read the same. */
  const working = (runtime: Runtime, of: Program<T>) =>
    Effect.gen(function*() {
      const { layer } = yield* hands({ holds: true })
      const toy = yield* Effect.provide(runtime.deploy(of), layer)
      for (const id of held) {
        yield* toy.send(id, { _tag: 'Want', key: 'a', on: true, nonce: `on-${id}` }, {
          requestId: `on-${id}`,
          sender: tester,
          keep: 'forever',
        })
      }
      return toy
    })

  test('a query finds the entities by an index, in order, and gives what callers read', () =>
    onBoth(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* settled(runtime, at)
          expect(yield* toy.query({ limit: all })).toEqual(ids.map((id) => ({ id, projection: 0, indexes: { wanted: 0 } })))
        }))
      // The rows outlive the process that wrote them, and each step writes its own.
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* working(runtime, program)
          expect(yield* toy.read('t-1')).toBe(1)
          expect(yield* toy.query({ limit: all, where: [{ index: 'wanted', is: '=', value: 0 }] }))
            .toEqual([{ id: 't-2', projection: 0, indexes: { wanted: 0 } }])
          expect((yield* toy.query({ limit: all, order: { index: 'wanted', descending: true } })).map(({ id }) => id))
            .toEqual(['t-3', 't-1', 't-2'])
          // A descending order reverses the ids of the rows that tie too (decision 0145).
          expect((yield* toy.query({ order: { index: 'wanted', descending: true }, limit: 2 })).map(({ id }) => id))
            .toEqual(['t-3', 't-1'])
          expect(yield* toy.query({ limit: all, where: [{ index: 'wanted', is: '>', value: 9 }] })).toEqual([])
        }))
    })))

  test('a read answers from the row, with a new program whose project dies on the state', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) => Effect.asVoid(settled(runtime, at)))
      yield* process({}, (runtime) => Effect.asVoid(working(runtime, program)))
      const dies: Program<T> = {
        ...program,
        project: () => {
          throw new Error('project dies')
        },
      }
      // 't-1' and 't-3' hold an operation, so the deploy activates them, and the new program suspends them on their
      // activation. 't-2' is not loaded. A read calls no program, and each reads the row its last step wrote
      // (decision 0121).
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(dies), layer)
          expect((yield* toy.suspended).map(({ id }) => id)).toEqual(held)
          expect(yield* Effect.forEach(ids, toy.read)).toEqual([1, 0, 1])
          expect(yield* toy.read('t-4')).toBeNull()
        }))
    })))

  test('reindex leaves the row of an entity whose state the new project dies on, names it, and writes the rest', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) => Effect.asVoid(settled(runtime, at)))
      yield* process({}, (runtime) => Effect.asVoid(working(runtime, program)))
      // A new version that counts the other way, and dies on the state of 't-2', which wants nothing. 't-1' and
      // 't-3' are activated by the deploy, and their projection is computed there; 't-2' is not loaded.
      const dies: Program<T> = {
        ...negated,
        project: (state) => {
          const shown = program.project(state)
          if (shown === 0) throw new Error('project dies on nothing wanted')
          return shown
        },
      }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(dies), layer)
          expect(yield* toy.reindex).toEqual({
            written: 2,
            failed: [{ id: 't-2', cause: 'Error: project dies on nothing wanted' }],
          })
          // The rows of 't-1' and 't-3' are the new version's, and the row of 't-2' is the one before (decision 0122).
          expect((yield* toy.query({ limit: all, where: [{ index: 'wanted', is: '=', value: -1 }] })).map(({ id }) => id))
            .toEqual(held)
          expect(yield* toy.read('t-2')).toBe(0)
        }))
    })))

  test('a deploy leaves SQLite an index of the expression the query reads', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) => Effect.asVoid(settled(runtime, at)))
      const sql = yield* SqlClient.SqlClient
      const plan = yield* sql.unsafe<{ detail: string }>(
        `EXPLAIN QUERY PLAN SELECT id FROM effecttea_projections
         WHERE name = 'Toy' AND json_extract(indexes, '$.wanted') <= 0`,
      )
      // The index is on the expression, so it is used only where a query writes the expression the same way.
      expect(plan.map(({ detail }) => detail).join(' ')).toContain('INDEX effecttea_projections Toy wanted by id (name=? AND <expr>')
    })))

  test('reindex writes the rows again for an index a new version changed', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) => Effect.asVoid(settled(runtime, at)))
      yield* process({}, (runtime) => Effect.asVoid(working(runtime, program)))
      // The entities take no step in this process — their operations are started again, and hold — so nothing
      // writes their rows, which hold what the version before counted.
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* working(runtime, negated)
          expect(yield* toy.query({ limit: all, where: [{ index: 'wanted', is: '<', value: 0 }] })).toEqual([])
          expect(yield* toy.reindex).toEqual({ written: 3, failed: [] })
          expect((yield* toy.query({ limit: all, where: [{ index: 'wanted', is: '=', value: -1 }] })).map(({ id }) => id))
            .toEqual(held)
        }))
    })))

  // A row is written only if the state it was computed from is still the one stored (decision 0070).
  test('reindex leaves no row a step has moved past, under prioritized schedules', () => {
    // The schedules are explored from the reindex on: what comes before only makes the entities it walks.
    explored((window) =>
      Effect.gen(function*() {
        const at = yield* DateTime.now
        // Forty toys more, walked before the one that steps, so that the walk is long enough to be stepped into.
        const walked = [...Array.from({ length: 40 }, (_, n) => `s-${String(n).padStart(2, '0')}`), ...ids]
        yield* process({}, (runtime) =>
          Effect.gen(function*() {
            const toy = yield* settled(runtime, at)
            for (const id of walked.slice(0, 40)) {
              yield* toy.create(id, { flags: { at }, requestId: `c-${id}`, sender: tester })
            }
            yield* runtime.settled
            yield* TestClock.adjust('60 millis')
            yield* runtime.settled
          }))
        return yield* process({}, (runtime) =>
          Effect.gen(function*() {
            const { layer } = yield* hands({ holds: true })
            const toy = yield* Effect.provide(runtime.deploy(negated), layer)
            // The step lands in the walk, between the reading of the state of 't-3' and the writing of its row.
            yield* opened(window, true)
            const reindexing = yield* Effect.forkChild(toy.reindex)
            yield* toy.send('t-3', { _tag: 'Want', key: 'a', on: true, nonce: 'on' }, {
              requestId: 'on',
              sender: tester,
              keep: 'forever',
            })
            yield* Fiber.join(reindexing)
            const read = yield* Effect.forEach(walked, (id) =>
              Effect.map(toy.read(id), (projection) => ({ id, projection })))
            const rows = (yield* toy.query({ limit: all })).map(({ id, projection }) => ({ id, projection }))
            return { stale: rows.filter((row) => !read.some((one) => JSON.stringify(one) === JSON.stringify(row))) }
          }))
      }), { stale: [] }, { runs: 200, open: false })
  }, 60_000)
})

describe('publishing what happened', () => {
  const tester = { _tag: 'Tester' } as const

  test('a creation, and every step that changes what callers read, publishes a row', () =>
    onBoth(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          // The operations hold, so nothing but the messages sent here changes the state.
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          // The key is wanted already: the state changes, since the nonce is applied, and the projection does not.
          yield* toy.send(id, { _tag: 'Want', key: 't', on: true, nonce: 'on' }, { requestId: 'on', sender: tester, keep: 'forever' })
          // A timer may be dropped in any state: what callers read falls, and the step publishes what it handled.
          yield* toy.send(id, { _tag: 'Want', key: 't', on: false, nonce: 'off' }, { requestId: 'off', sender: tester, keep: 'forever' })
          expect(yield* toy.send(id, { _tag: 'Refuse', nonce: 'no' }, { requestId: 'no', sender: tester, keep: 'forever' }))
            .toEqual({ _tag: 'Rejected', reason: 'Refused' })
          const rows = yield* toy.published('projection', [], all)
          expect(rows.map(({ partition: _partition, seq: _seq, ...row }) => row)).toEqual([
            { id, topic: 'projection', kind: 'Creation', message: null, value: 4 },
            {
              id,
              topic: 'projection',
              kind: 'Inbound',
              message: { _tag: 'Want', key: 't', on: false, nonce: 'off' },
              value: 3,
            },
          ])
        }))
    })))

  test('a cursor reads what was published after it, and prune drops what every consumer has read', () =>
    onBoth(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program, queue), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          yield* runtime.settled
          yield* TestClock.adjust('60 millis')
          yield* runtime.settled
          const rows = yield* toy.published('projection', [], all)
          // The creation, then the completion of each operation and the firing of the timer: what callers read
          // falls by one at each, whatever order the work came back in.
          expect(rows.map(({ kind }) => kind)).toEqual(['Creation', 'Internal', 'Internal', 'Internal', 'Internal'])
          expect(rows.map(({ value }) => value)).toEqual([4, 3, 2, 1, 0])
          // One entity's rows are in its partition, numbered from 1 in the order its steps committed (decision 0137).
          expect(rows.map(({ partition, seq }) => ({ partition, seq }))).toEqual(
            [1, 2, 3, 4, 5].map((seq) => ({ partition: partitionOf(id, 300), seq })),
          )
          const read = rows.slice(0, 2)
          expect(yield* toy.published('projection', read, all)).toEqual(rows.slice(2))
          expect(yield* toy.published('projection', [], 2)).toEqual(read)
          // A consumer reads from cursors of its own, which the readings above neither moved nor stored: it
          // starts at the beginning, and goes on from where it acked (decision 0039).
          expect(yield* toy.fetch('projection', 'queue', 2)).toEqual(read)
          yield* toy.ack('projection', 'queue', read)
          expect(yield* toy.fetch('projection', 'queue', all)).toEqual(rows.slice(2))
          expect(yield* toy.prune).toBe(2)
          expect(yield* toy.published('projection', [], all)).toEqual(rows.slice(2))
        }))
    })))

  test('a seq is never given again, so a cursor holds across a prune', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(program, queue), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          // The timer is the key a step may drop and bring back: each way changes what callers read.
          yield* toy.send(id, { _tag: 'Want', key: 't', on: false, nonce: 'off' }, { requestId: 'off', sender: tester, keep: 'forever' })
          const read = yield* toy.published('projection', [], all)
          expect(read.map(({ value }) => value)).toEqual([4, 3])
          // The consumer acted on both rows and acked them: the prune takes what it has read, and its cursor
          // stands.
          yield* toy.ack('projection', 'queue', read)
          expect(yield* toy.prune).toBe(2)
          expect(yield* toy.published('projection', [], all)).toEqual([])
          yield* toy.send(id, { _tag: 'Want', key: 't', on: true, nonce: 'on' }, { requestId: 'on', sender: tester, keep: 'forever' })
          // What is published next is past the cursor: a seq the prune freed is never given again, or the
          // consumer would read from beyond a row it never saw.
          const next = yield* toy.published('projection', read, all)
          expect(next.map(({ value }) => value)).toEqual([4])
          expect(next[0]?.seq ?? 0).toBeGreaterThan(read[1]?.seq ?? 0)
          expect(yield* toy.published('projection', [], all)).toEqual(next)
          expect(yield* toy.fetch('projection', 'queue', all)).toEqual(next)
        }))
    })))

  test('the prune waits for the consumer behind it, which a deploy without it warns of and lets be forgotten', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const warnings: Array<Readonly<Record<string, unknown>>> = []
      const logger = Logger.make((options) => {
        if (options.logLevel === 'Warn') warnings.push(options.fiber.getRef(References.CurrentLogAnnotations))
      })
      const both = { consumers: { projection: ['queue', 'audit'] } } as const
      const rows = yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program, both), layer)
          // The deploy stored both consumers, which hold the log before either has read it (decision 0152).
          expect((yield* toy.consumers).map(({ consumer, declared }) => ({ consumer, declared }))).toEqual([
            { consumer: 'audit', declared: true },
            { consumer: 'queue', declared: true },
          ])
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          yield* runtime.settled
          yield* TestClock.adjust('60 millis')
          yield* runtime.settled
          const rows = yield* toy.published('projection', [], all)
          expect(yield* toy.prune).toBe(0)
          // Both read it, and only one acts on what it read.
          expect(yield* toy.fetch('projection', 'queue', all)).toEqual(rows)
          expect(yield* toy.fetch('projection', 'audit', all)).toEqual(rows)
          yield* toy.ack('projection', 'queue', rows)
          // An ack never moves a cursor back: what is behind it may be gone.
          yield* toy.ack('projection', 'queue', rows.slice(0, 1))
          expect(yield* toy.consumers).toEqual([
            {
              topic: 'projection',
              consumer: 'audit',
              declared: true,
              behind: rows.length,
              since: DateTime.makeUnsafe(0),
              cursors: [{ partition: partitionOf(id, 300), seq: 0 }],
            },
            { topic: 'projection', consumer: 'queue', declared: true, behind: 0, since: null, cursors: [] },
          ])
          // The one that is behind holds every row, however far the other has read.
          expect(yield* toy.prune).toBe(0)
          expect(yield* toy.published('projection', [], all)).toEqual(rows)
          expect(warnings).toEqual([])
          return rows
        })).pipe(Effect.provide(Logger.layer([logger])))
      // The next process no longer declares `audit`: it is kept, and still holds the log, and the deploy warns of it.
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program, queue), layer)
          expect(warnings).toEqual([
            expect.objectContaining({ name: program.name, topic: 'projection', consumer: 'audit', behind: rows.length }),
          ])
          expect((yield* toy.consumers).map(({ consumer, declared }) => ({ consumer, declared }))).toEqual([
            { consumer: 'audit', declared: false },
            { consumer: 'queue', declared: true },
          ])
          expect(yield* toy.prune).toBe(0)
          // A consumer the deploy declares is not forgotten, and nothing of it is dropped.
          const refused = yield* Effect.exit(toy.forget('projection', 'queue'))
          expect(Exit.isFailure(refused) ? Cause.squash(refused.cause) : null).toBeInstanceOf(InvariantDefect)
          // An operator forgets the one no longer declared: the next prune passes what it never read.
          yield* toy.forget('projection', 'audit')
          expect(yield* toy.prune).toBe(rows.length)
          expect(yield* toy.published('projection', [], all)).toEqual([])
          expect((yield* toy.consumers).map(({ consumer }) => consumer)).toEqual(['queue'])
        })).pipe(Effect.provide(Logger.layer([logger])))
      expect(warnings).toHaveLength(1)
    })))

  test('a deploy whose consumers cannot be read as written dies, and stores nothing', () =>
    database(Effect.gen(function*() {
      const reasonOf = (exit: Exit.Exit<unknown>) => {
        const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
        return cause instanceof InvariantDefect ? cause.reason : null
      }
      // A cast lets each through the types (decisions 0054, 0152).
      const refused: ReadonlyArray<readonly [unknown, string]> = [
        [{ billing: ['queue'] }, "declares consumers of 'billing', which is no topic of the program"],
        [{ projection: 'queue' }, "declares the consumers of 'projection' as no list"],
        [{ projection: [''] }, "declares a consumer of 'projection' with no name"],
        [{ projection: ['queue', 'queue'] }, "declares the consumer 'queue' of 'projection' twice"],
        // A consumer's name is stored as text, which a database holds as it is (decision 0157).
        [
          { projection: ['a\u0000'] },
          `declares a consumer "a\\u0000" of 'projection', whose name is no text a database holds`,
        ],
      ]
      for (const [consumers, reason] of refused) {
        const exit = yield* Effect.exit(process({}, (runtime) =>
          Effect.gen(function*() {
            const { layer } = yield* hands()
            yield* Effect.provide(runtime.deploy(program, { consumers: consumers as never }), layer)
          })))
        expect(reasonOf(exit)).toBe(`the deploy of the program 'Toy' ${reason}`)
      }
      // Nothing was stored by the deploys refused.
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          expect(yield* toy.consumers).toEqual([])
        }))
    })))

  test('a consumer declared at deploy holds the rows published before its first reading', () =>
    onBoth(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program, queue), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          yield* runtime.settled
          yield* TestClock.adjust('60 millis')
          yield* runtime.settled
          const rows = yield* toy.published('projection', [], all)
          // The consumer has not read yet, and a prune drops nothing of what it will read (decision 0152).
          expect(yield* toy.prune).toBe(0)
          expect(yield* toy.fetch('projection', 'queue', all)).toEqual(rows)
        }))
    })))

  test('a topic no consumer holds is pruned whole, and a reading by hand has no say in it', () =>
    onBoth(Effect.gen(function*() {
      const at = yield* DateTime.now
      const topical: Program<T & Readonly<{ topics: { count: number; high: boolean } }>> = {
        ...program,
        name: 'Topical',
        topics: { count: (projection) => projection, high: (projection) => projection > 100 },
      }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(topical, { consumers: { count: ['queue'] } }), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          yield* toy.send(id, { _tag: 'Want', key: 't', on: false, nonce: 'off' }, { requestId: 'off', sender: tester, keep: 'forever' })
          expect((yield* toy.published('count', [], all)).length).toBe(2)
          expect((yield* toy.published('high', [], all)).length).toBe(1)
          // `high` has no consumer, so its row goes; `count` is held by a consumer that has read nothing yet
          // (decision 0152).
          expect(yield* toy.prune).toBe(1)
          expect(yield* toy.published('high', [], all)).toEqual([])
          expect((yield* toy.published('count', [], all)).length).toBe(2)
        }))
    })))

  test('a consumer that waits is given the row a step commits while it reads, under prioritized schedules', () => {
    // Decision 0142: the reading takes its topic's signal before it reads, so that a commit between its reading and
    // its wait ends the wait at once. The clock never moves here, so a wait that missed the commit never ends. With
    // the signal taken after the reading, seed 27, pinned, fails. `bun run test:pins` runs it against that form, the
    // pin `0142` of `src/runtime.test_pins.ts` (decision 0254).
    explored((window) =>
      Effect.gen(function*() {
        const at = yield* DateTime.now
        return yield* process({}, (runtime) =>
          Effect.gen(function*() {
            const { layer } = yield* hands({ holds: true })
            const toy = yield* Effect.provide(runtime.deploy(program, queue), layer)
            yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
            yield* toy.ack('projection', 'queue', yield* toy.fetch('projection', 'queue', all))
            yield* opened(window, true)
            const [read] = yield* together<unknown, never, never>([
              toy.fetch('projection', 'queue', all, { wait: { millis: 60_000 } }),
              toy.send(id, { _tag: 'Want', key: 't', on: false, nonce: 'off' }, { requestId: 'off', sender: tester, keep: 'forever' }),
            ])
            yield* opened(window, false)
            return (read as ReadonlyArray<Readonly<{ value: number }>>).map(({ value }) => value)
          }))
      }), [3], { open: false, pinned: [27] })
  }, 60_000)

  test('a row of another topic does not end a consumer’s wait, which gives nothing once it is over', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      // `high` selects a value no step of the toy changes: only the creation is written there.
      const topical: Program<T & Readonly<{ topics: { count: number; high: boolean } }>> = {
        ...program,
        name: 'Topical',
        topics: { count: (projection) => projection, high: (projection) => projection > 100 },
      }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(topical, { consumers: { high: ['queue'] } }), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          yield* toy.ack('high', 'queue', yield* toy.fetch('high', 'queue', all))
          // A limit of 0 is given nothing at once, since no row could be given.
          expect(yield* toy.fetch('high', 'queue', 0, { wait: { millis: 50 } })).toEqual([])
          const waiting = yield* running(toy.fetch('high', 'queue', all, { wait: { millis: 50 } }))
          yield* toy.send(id, { _tag: 'Want', key: 't', on: false, nonce: 'off' }, { requestId: 'off', sender: tester, keep: 'forever' })
          expect((yield* toy.published('count', [], all)).map(({ value }) => value)).toEqual([4, 3])
          yield* TestClock.adjust('49 millis')
          expect(waiting.pollUnsafe()).toBeUndefined()
          yield* TestClock.adjust('1 millis')
          expect(yield* Fiber.join(waiting)).toEqual([])
        }))
    })))

  test('a consumer that waits is given nothing once the runtime stops', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const outside = yield* Scope.make()
      // The reading outlives the runtime's scope: without its end at the stop, it would wait out its minute.
      const waiting = yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(program, queue), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          yield* toy.ack('projection', 'queue', yield* toy.fetch('projection', 'queue', all))
          const waiting = yield* Effect.forkIn(
            Effect.delay(toy.fetch('projection', 'queue', all, { wait: { millis: 60_000 } }), '1 millis'),
            outside,
          )
          yield* TestClock.adjust('1 millis')
          expect(waiting.pollUnsafe()).toBeUndefined()
          return waiting
        }))
      expect(yield* Fiber.join(waiting)).toEqual([])
      yield* Scope.close(outside, Exit.void)
    })))

  test('an ack past the last seq of its partition moves the cursor to it, and the rows written after are kept', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(program, queue), layer)
          const partition = partitionOf(id, 300)
          // Nothing was written yet: no cursor is stored, and the consumer is, by the deploy (decision 0152).
          yield* toy.ack('projection', 'queue', [{ partition, seq: 1_000 }])
          expect(yield* toy.consumers).toEqual([
            { topic: 'projection', consumer: 'queue', declared: true, behind: 0, since: null, cursors: [] },
          ])
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          // A cursor past the head of its partition never stood: the creation is past it.
          expect(yield* toy.fetch('projection', 'queue', all)).toHaveLength(1)
          // A consumer that acks beyond what it read stops at the last row: the next one is past its cursor.
          yield* toy.ack('projection', 'queue', [{ partition, seq: 1_000 }])
          expect(yield* toy.consumers).toEqual([
            { topic: 'projection', consumer: 'queue', declared: true, behind: 0, since: null, cursors: [] },
          ])
          yield* toy.send(id, { _tag: 'Want', key: 't', on: false, nonce: 'off' }, { requestId: 'off', sender: tester, keep: 'forever' })
          expect(yield* toy.prune).toBe(1)
          expect((yield* toy.fetch('projection', 'queue', all)).map(({ value }) => value)).toEqual([3])
        }))
    })))

  test('a cursor, a partition or a limit out of its range is its caller’s defect, and stores nothing', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const reasonOf = (exit: Exit.Exit<unknown>) => {
        const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
        return cause instanceof InvariantDefect ? cause.reason : null
      }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(program, queue), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          const partition = partitionOf(id, 300)
          // Each of them is refused before anything is read or stored (decisions 0053, 0137).
          const refused = [
            toy.ack('projection', 'queue', [{ partition, seq: 2.5 }]),
            toy.ack('projection', 'queue', [{ partition, seq: -5 }]),
            toy.ack('projection', 'queue', [{ partition, seq: Number.NaN }]),
            // An integer past what a double holds exactly is no cursor either.
            toy.ack('projection', 'queue', [{ partition, seq: 2 ** 53 }]),
            toy.ack('projection', 'queue', [{ partition: 0, seq: 1 }]),
            toy.ack('projection', 'queue', [{ partition: 301, seq: 1 }]),
            toy.ack('projection', 'queue', [{ partition: 1.5, seq: 1 }]),
            toy.published('projection', [{ partition, seq: -1 }], 1),
            toy.published('projection', [{ partition: -1, seq: 0 }], 1),
            toy.published('projection', [], -1),
            toy.published('projection', [], 1.5),
            toy.fetch('projection', 'queue', -1),
            toy.fetch('projection', 'queue', Number.POSITIVE_INFINITY),
            // A wait is counted as a limit is (decision 0142).
            toy.fetch('projection', 'queue', all, { wait: { millis: -1 } }),
            toy.fetch('projection', 'queue', all, { wait: { millis: 0.5 } }),
            toy.fetch('projection', 'queue', all, { wait: {} } as never),
            // A partition a reader names is checked as a cursor's is (decision 0153).
            toy.fetch('projection', 'queue', all, { partitions: [0] }),
            toy.fetch('projection', 'queue', all, { partitions: [partition, 301] }),
            toy.fetch('projection', 'queue', all, { partitions: [1.5] }),
            toy.query({ limit: -1 }),
            toy.query({ limit: 0.5 }),
            // A limit left out is refused too, since the types do not hold a cast (decision 0141).
            toy.published('projection', [], undefined as never),
            toy.fetch('projection', 'queue', undefined as never),
            toy.query({} as never),
          ]
          for (const call of refused) {
            expect(reasonOf(yield* Effect.exit(call)))
              .toMatch(/^the (cursor|limit|wait) is .+, which is no non-negative|^the partition is .+, which is no integer/)
          }
          // A reader of no partition reads nothing, and is refused too (decision 0153).
          for (const partitions of [[], 3 as never]) {
            expect(reasonOf(yield* Effect.exit(toy.fetch('projection', 'queue', all, { partitions }))))
              .toBe('the partitions a reader names are no list of at least one')
          }
          // A topic the program does not publish is refused too, before anything is read or stored (decision 0138):
          // a cast lets it through the types.
          const elsewhere = 'billing' as 'projection'
          for (
            const call of [
              toy.published(elsewhere, [], all),
              toy.fetch(elsewhere, 'queue', all),
              toy.ack(elsewhere, 'queue', [{ partition, seq: 1 }]),
              toy.forget(elsewhere, 'queue'),
            ]
          ) {
            expect(reasonOf(yield* Effect.exit(call))).toBe("'billing' is no topic of the program 'Toy'")
          }
          // A name the deploy does not declare is refused too, before anything is read or stored (decision 0152):
          // a cast lets it through the types.
          const stranger = 'qeueu' as 'queue'
          for (
            const call of [
              toy.fetch('projection', stranger, all),
              toy.fetch('projection', stranger, all, { wait: { millis: 10 } }),
              toy.ack('projection', stranger, [{ partition, seq: 1 }]),
            ]
          ) {
            expect(reasonOf(yield* Effect.exit(call))).toBe("'qeueu' is no consumer the deploy of 'Toy' declares for 'projection'")
          }
          // No consumer and no cursor was stored by a call refused, and a limit of 0 is a limit.
          expect(yield* toy.consumers).toEqual([
            {
              topic: 'projection',
              consumer: 'queue',
              declared: true,
              behind: 1,
              since: DateTime.makeUnsafe(0),
              cursors: [{ partition, seq: 0 }],
            },
          ])
          expect(yield* toy.published('projection', [], 0)).toEqual([])
          expect((yield* toy.published('projection', [], all)).length).toBe(1)
          expect((yield* toy.query({ limit: 0 })).length).toBe(0)
        }))
    })))

  test('entities stepping at once each publish in their partition, and nothing of theirs is lost', () =>
    onBoth(Effect.gen(function*() {
      const at = yield* DateTime.now
      const ids = ['p-1', 'p-2', 'p-3']
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* Effect.forEach(
            ids,
            (id) => toy.create(id, { flags: { at }, requestId: `c-${id}`, sender: tester }),
            { concurrency: 'unbounded' },
          )
          yield* runtime.settled
          yield* TestClock.adjust('60 millis')
          yield* runtime.settled
          const rows = yield* toy.published('projection', [], all)
          // The creation of each, and the four pieces of work each was created with: the three entities step at
          // once, and a row of one is never written in the middle of another's step.
          expect(rows.length).toBe(ids.length * 5)
          // Each entity's rows are in its own partition, numbered from 1 in the order of its steps.
          for (const id of ids) {
            const own = rows.filter((row) => row.id === id)
            expect(own.map(({ value }) => value)).toEqual([4, 3, 2, 1, 0])
            expect(own.map(({ partition, seq }) => ({ partition, seq }))).toEqual(
              [1, 2, 3, 4, 5].map((seq) => ({ partition: partitionOf(id, 300), seq })),
            )
          }
          // A reader that read to the end is given nothing again.
          expect(yield* toy.published('projection', rows, all)).toEqual([])
        }))
    })))

  test('the entities of one partition share its sequence, in the order their steps committed', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const ids = ['p-1', 'p-2', 'p-3']
      yield* process({ log: { partitions: 1 } }, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* Effect.forEach(
            ids,
            (id) => toy.create(id, { flags: { at }, requestId: `c-${id}`, sender: tester }),
            { concurrency: 'unbounded' },
          )
          yield* runtime.settled
          yield* TestClock.adjust('60 millis')
          yield* runtime.settled
          const rows = yield* toy.published('projection', [], all)
          expect(rows.map(({ partition, seq }) => ({ partition, seq }))).toEqual(
            rows.map((_, at) => ({ partition: 1, seq: at + 1 })),
          )
          for (const id of ids) {
            expect(rows.filter((row) => row.id === id).map(({ value }) => value)).toEqual([4, 3, 2, 1, 0])
          }
        }))
    })))

  test('a consumer reads every partition, and an ack and a prune move only the partitions acked', () =>
    onBoth(Effect.gen(function*() {
      const at = yield* DateTime.now
      // Two entities of two partitions.
      const [one, other] = ['a', 'b']
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(program, queue), layer)
          expect(partitionOf(one, 300)).not.toBe(partitionOf(other, 300))
          yield* toy.create(one, { flags: { at }, requestId: 'c-one', sender: tester })
          yield* toy.create(other, { flags: { at }, requestId: 'c-other', sender: tester })
          yield* toy.send(one, { _tag: 'Want', key: 't', on: false, nonce: 'off' }, { requestId: 'off', sender: tester, keep: 'forever' })
          // The rows come in the order they were written, each with its partition and its `seq` there.
          const rows = yield* toy.fetch('projection', 'queue', all)
          expect(rows.map(({ id, partition, seq }) => ({ id, partition, seq }))).toEqual([
            { id: one, partition: partitionOf(one, 300), seq: 1 },
            { id: other, partition: partitionOf(other, 300), seq: 1 },
            { id: one, partition: partitionOf(one, 300), seq: 2 },
          ])
          // The consumer acts on the rows of one entity only: the other's partition stays where it was.
          yield* toy.ack('projection', 'queue', rows.filter((row) => row.id === one))
          expect((yield* toy.fetch('projection', 'queue', all)).map(({ id }) => id)).toEqual([other])
          expect(yield* toy.consumers).toEqual([
            {
              topic: 'projection',
              consumer: 'queue',
              declared: true,
              behind: 1,
              since: DateTime.makeUnsafe(0),
              cursors: [{ partition: partitionOf(other, 300), seq: 0 }],
            },
          ])
          // The prune drops what the consumer read in each partition, and keeps the partition it acked nothing of.
          expect(yield* toy.prune).toBe(2)
          expect((yield* toy.published('projection', [], all)).map(({ id }) => id)).toEqual([other])
        }))
    })))

  test('two readers of one consumer read their own partitions, and a slow one holds no other', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const [one, other] = ['a', 'b']
      const [mine, theirs] = [partitionOf(one, 300), partitionOf(other, 300)]
      // The two ids fall in two partitions, and a third partition holds no entity of the test.
      expect(mine).not.toBe(theirs)
      const empty = [1, 2, 3].find((partition) => partition !== mine && partition !== theirs) as number
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(program, queue), layer)
          expect(toy.partitions).toBe(300)
          yield* toy.create(one, { flags: { at }, requestId: 'c-one', sender: tester })
          yield* toy.create(other, { flags: { at }, requestId: 'c-other', sender: tester })
          yield* toy.send(one, { _tag: 'Want', key: 't', on: false, nonce: 'off' }, { requestId: 'off', sender: tester, keep: 'forever' })
          // Each reader is given the rows of its partitions only, the oldest first. A partition named twice is
          // read once, and a partition with no row past its cursor gives nothing.
          const slow = yield* toy.fetch('projection', 'queue', all, { partitions: [mine, mine] })
          expect(slow.map(({ id, seq }) => ({ id, seq }))).toEqual([{ id: one, seq: 1 }, { id: one, seq: 2 }])
          const fast = yield* toy.fetch('projection', 'queue', all, { partitions: [theirs] })
          expect(fast.map(({ id, seq }) => ({ id, seq }))).toEqual([{ id: other, seq: 1 }])
          expect(yield* toy.fetch('projection', 'queue', all, { partitions: [empty] })).toEqual([])
          // The fast reader acks and goes on while the slow one has acked nothing: what it is given next is its
          // own partition's alone, and the slow reader is given its rows again.
          yield* toy.ack('projection', 'queue', fast)
          yield* toy.send(other, { _tag: 'Want', key: 't', on: false, nonce: 'o' }, { requestId: 'o', sender: tester, keep: 'forever' })
          expect((yield* toy.fetch('projection', 'queue', all, { partitions: [theirs] })).map(({ id, seq }) => ({ id, seq })))
            .toEqual([{ id: other, seq: 2 }])
          expect(yield* toy.fetch('projection', 'queue', all, { partitions: [mine] })).toEqual(slow)
          // A reading of every partition is given what both readers have not acked.
          expect((yield* toy.fetch('projection', 'queue', all)).map(({ id, seq }) => ({ id, seq }))).toEqual([
            { id: one, seq: 1 },
            { id: one, seq: 2 },
            { id: other, seq: 2 },
          ])
          // The cursors the two readers moved are one consumer's: the prune drops what the fast reader acked, and
          // keeps the partition of the slow one until it acks too.
          expect(yield* toy.prune).toBe(1)
          yield* toy.ack('projection', 'queue', slow)
          expect(yield* toy.prune).toBe(2)
          expect((yield* toy.published('projection', [], all)).map(({ id, seq }) => ({ id, seq })))
            .toEqual([{ id: other, seq: 2 }])
        }))
    })))

  test('a reader of some partitions waits through the commits of the others, and is given its own', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const [one, other] = ['a', 'b']
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(program, queue), layer)
          yield* toy.create(one, { flags: { at }, requestId: 'c-one', sender: tester })
          yield* toy.create(other, { flags: { at }, requestId: 'c-other', sender: tester })
          const partitions = [partitionOf(one, 300)]
          yield* toy.ack('projection', 'queue', yield* toy.fetch('projection', 'queue', all, { partitions }))
          const waiting = yield* running(toy.fetch('projection', 'queue', all, { partitions, wait: { millis: 50 } }))
          // A commit in another partition wakes the reader, which finds nothing of its own and waits again.
          yield* toy.send(other, { _tag: 'Want', key: 't', on: false, nonce: 'o' }, { requestId: 'o', sender: tester, keep: 'forever' })
          yield* TestClock.adjust('10 millis')
          expect(waiting.pollUnsafe()).toBeUndefined()
          yield* toy.send(one, { _tag: 'Want', key: 't', on: false, nonce: 'm' }, { requestId: 'm', sender: tester, keep: 'forever' })
          expect((yield* Fiber.join(waiting)).map(({ id, seq }) => ({ id, seq }))).toEqual([{ id: one, seq: 2 }])
        }))
    })))

  test('a launch with another number of partitions than the database’s fails, and names both', () =>
    database(Effect.gen(function*() {
      const reasonOf = (exit: Exit.Exit<unknown>) => {
        const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
        return cause instanceof InvariantDefect ? cause.reason : null
      }
      // The first launch stores its number, and the next one with the same number runs.
      yield* process({ log: { partitions: 12 } }, () => Effect.void)
      yield* process({ log: { partitions: 12 } }, () => Effect.void)
      expect(reasonOf(yield* Effect.exit(process({}, () => Effect.void))))
        .toBe('the log has 12 partitions, and the runtime is launched with 300')
      expect(reasonOf(yield* Effect.exit(process({ log: { partitions: 0 } }, () => Effect.void))))
        .toBe('the log has 0 partitions, which is no positive integer')
      expect(reasonOf(yield* Effect.exit(process({ log: { partitions: 1.5 } }, () => Effect.void))))
        .toBe('the log has 1.5 partitions, which is no positive integer')
    })))

  test('a consumer reads from its cursors through indexes, and never scans the log', () =>
    database(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const plan = (query: string) =>
        Effect.map(sql.unsafe<{ detail: string }>(`EXPLAIN QUERY PLAN ${query}`), (rows) =>
          rows.map(({ detail }) => detail).join(' '))
      // The first row past a cursor is a seek into its topic and partition, by `seq`.
      expect(
        yield* plan(`SELECT position FROM effecttea_outbox
          WHERE name = 'Toy' AND topic = 'projection' AND partition = 3 AND seq > 7 ORDER BY seq LIMIT 1`),
      ).toContain('USING COVERING INDEX effecttea_outbox_partition (name=? AND topic=? AND partition=? AND seq>?)')
      // A page is a range over (name, topic, position), which is also the order read: the log grows until a
      // consumer prunes it, and a poll must not read again what it has read, nor the rows of other topics. Each row
      // finds its publication by the key of `effecttea_publications`, with no sort (decision 0154).
      const page = yield* plan(`SELECT effecttea_outbox.position, effecttea_publications.projection FROM effecttea_outbox
          JOIN effecttea_publications ON effecttea_publications.name = effecttea_outbox.name AND effecttea_publications.partition = effecttea_outbox.partition
            AND effecttea_publications.seq = effecttea_outbox.seq
          WHERE effecttea_outbox.name = 'Toy' AND effecttea_outbox.topic = 'projection' AND effecttea_outbox.position >= 7
          ORDER BY effecttea_outbox.position LIMIT 256`)
      expect(page).toMatch(/SEARCH effecttea_outbox USING INDEX effecttea_outbox_topic \(name=\? AND topic=\? AND (position|rowid)>\?\)/)
      expect(page).toMatch(/SEARCH effecttea_publications USING INDEX sqlite_autoindex_effecttea_publications_1 \(name=\? AND partition=\? AND seq=\?\)/)
      expect(page).not.toContain('TEMP B-TREE')
      // A row dropped by a prune finds whether another row names its publication by the index of the publication.
      expect(
        yield* plan(`SELECT 1 FROM effecttea_outbox WHERE name = 'Toy' AND partition = 3 AND seq = 7`),
      ).toContain('USING COVERING INDEX effecttea_outbox_publication (name=? AND partition=? AND seq=?)')
    })))

  test('a step whose transaction never commits publishes nothing', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const store = storage(program, yield* SqlClient.SqlClient)
      const crashed = yield* Deferred.make<void>()
      let seen = 0
      const dying = process(
        {
          // The creation's commit is the first the process reaches; the step that handles the message is the
          // second, and the process dies before it.
          at: (point) =>
            point !== 'BeforeCommit' || ++seen !== 2
              ? Effect.void
              : Effect.flatMap(Deferred.succeed(crashed, undefined), () => Effect.never),
        },
        (runtime) =>
          Effect.gen(function*() {
            const { layer } = yield* hands({ holds: true })
            const toy = yield* Effect.provide(runtime.deploy(program), layer)
            yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
            yield* running(
              toy.send(id, { _tag: 'Want', key: 't', on: false, nonce: 'off' }, { requestId: 'off', sender: tester, keep: 'forever' }),
            )
          }),
      )
      yield* Effect.raceFirst(dying, Deferred.await(crashed))
      expect(yield* Deferred.isDone(crashed)).toBe(true)
      expect((yield* store.published('projection', [], all)).map(({ kind, value }) => ({ kind, value })))
        .toEqual([{ kind: 'Creation', value: 4 }])
    })))

  test('a cursor is a consumer of one program, and holds no other program log', () =>
    onBoth(Effect.gen(function*() {
      const at = yield* DateTime.now
      // The same program under another name: two programs' entities publish into one log, read apart by name.
      const twin: Program<T> = { ...program, name: 'Twin' }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toys = yield* Effect.provide(runtime.deploy(program, queue), layer)
          const twins = yield* Effect.provide(runtime.deploy(twin, queue), layer)
          yield* toys.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          yield* twins.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          // Each reads the rows of its own program, under a name a consumer of each may hold.
          const mine = yield* toys.fetch('projection', 'queue', all)
          const theirs = yield* twins.fetch('projection', 'queue', all)
          expect(mine.length).toBe(1)
          expect(theirs.length).toBe(1)
          // Each program's partitions have heads of their own, so the same entity id starts at the same place in
          // both logs (decision 0137).
          expect(theirs.map(({ partition, seq }) => ({ partition, seq })))
            .toEqual(mine.map(({ partition, seq }) => ({ partition, seq })))
          // Each acks its own, and the rows of the one go while the other's consumer holds its log.
          yield* twins.ack('projection', 'queue', theirs)
          expect(yield* twins.prune).toBe(1)
          expect(yield* toys.prune).toBe(0)
          expect(yield* toys.published('projection', [], all)).toEqual(mine)
          expect(yield* toys.consumers).toEqual([
            {
              topic: 'projection',
              consumer: 'queue',
              declared: true,
              behind: 1,
              since: DateTime.makeUnsafe(0),
              cursors: [{ partition: partitionOf(id, 300), seq: 0 }],
            },
          ])
          expect(yield* twins.consumers).toEqual([
            { topic: 'projection', consumer: 'queue', declared: true, behind: 0, since: null, cursors: [] },
          ])
        }))
    })))

  // The premise a transaction of the runtime rests on: the client leases its one connection under a semaphore of
  // one, and a transaction holds it for its duration (decisions 0007, 0039). Two statements apart let a consumer
  // register in between.
  test('a transaction keeps a consumer from registering between its statements, two statements apart do not', () =>
    database(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      const lowest = sql<{ through: number | null }>`SELECT min(seq) AS through FROM effecttea_cursors WHERE name = 'Toy'`
      const registers = sql`INSERT INTO effecttea_cursors ${
        sql.insert({ name: 'Toy', topic: 'projection', consumer: 'late', partition: 1, seq: 0 })
      }`
      // The readings wait for the clock between them, so the insert is offered where the race would be, and
      // lands there unless something holds it out.
      const reads = Effect.gen(function*() {
        const before = yield* lowest
        yield* Effect.sleep('30 millis')
        return [before[0]?.through ?? null, (yield* lowest)[0]?.through ?? null] as const
      })
      const between = (readings: typeof reads) =>
        Effect.gen(function*() {
          const read = yield* running(readings)
          const inserted = yield* running(registers)
          yield* TestClock.adjust('30 millis')
          yield* Fiber.join(inserted)
          return yield* Fiber.join(read)
        })

      // Two statements apart: the second sees a cursor the first did not, which is where rows would be dropped
      // behind a consumer that has read them.
      expect(yield* between(reads)).toEqual([null, 0])
      yield* sql`DELETE FROM effecttea_cursors WHERE name = 'Toy'`

      // The insert waits for the permit the transaction holds, so the two readings agree and it lands after.
      expect(yield* between(sql.withTransaction(reads))).toEqual([null, null])
    })))

  test('a reader of consume writes each page and its ack in one transaction, and reads a failed page again', () =>
    onBoth(Effect.gen(function*() {
      const at = yield* DateTime.now
      const sql = yield* SqlClient.SqlClient
      yield* sql`CREATE TABLE consumed (seq INTEGER NOT NULL, value INTEGER NOT NULL)`
      const stored = Effect.map(
        sql<{ seq: number; value: number }>`SELECT seq, value FROM consumed ORDER BY seq`,
        (rows) => rows.map(({ seq, value }) => [Number(seq), Number(value)]),
      )
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(program, queue), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          for (const [nonce, on] of [['off', false], ['on', true], ['off-again', false]] as const) {
            yield* toy.send(id, { _tag: 'Want', key: 't', on, nonce }, { requestId: nonce, sender: tester, keep: 'forever' })
          }
          const rows = yield* toy.published('projection', [], all)
          expect(rows.map(({ value }) => value)).toEqual([4, 3, 4, 3])
          const pages: Array<number> = []
          const record = (page: ReadonlyArray<Readonly<{ seq: number; value: number }>>) =>
            Effect.gen(function*() {
              pages.push(page.length)
              for (const { seq, value } of page) yield* sql`INSERT INTO consumed (seq, value) VALUES (${seq}, ${value})`
            }).pipe(Effect.orDie)

          // The ack fails after the handler's writes, since the handler takes the table of the cursors away in the
          // page's transaction. The writes and the table's rename roll back with the ack (decision 0184).
          const unacked = yield* Effect.exit(
            toy.consume('projection', 'queue', (page) =>
              Effect.andThen(record(page), sql`ALTER TABLE effecttea_cursors RENAME TO away`.pipe(Effect.orDie)), { limit: 3 }),
          )
          expect(Exit.isFailure(unacked)).toBe(true)
          expect(yield* stored).toEqual([])
          expect(yield* toy.fetch('projection', 'queue', all)).toEqual(rows)
          pages.length = 0

          // The handler fails after its writes: the page's transaction rolls back, the store and the cursors stay
          // as they were, and the reader fails with the handler's error (decision 0184).
          const failed = yield* Effect.exit(
            toy.consume('projection', 'queue', (page) => Effect.andThen(record(page), Effect.fail('crash')), {
              limit: 3,
            }),
          )
          expect(failed).toEqual(Exit.fail('crash'))
          expect(yield* stored).toEqual([])
          expect(yield* toy.fetch('projection', 'queue', all)).toEqual(rows)

          // A reader of a partition that holds no row of the entity reads nothing, and ends (decision 0153).
          const partition = partitionOf(id, 300)
          const other = partition === 1 ? 2 : 1
          yield* toy.consume('projection', 'queue', record, { limit: 3, partitions: [other] })
          expect(pages).toEqual([3])

          // Without a wait, the reader takes page after page until one is empty, and the handler is given no empty
          // page. Each page commits with its ack, so the store holds every row once, and the cursor is past them.
          yield* toy.consume('projection', 'queue', record, { limit: 3 })
          expect(pages).toEqual([3, 3, 1])
          expect(yield* stored).toEqual(rows.map(({ seq, value }) => [seq, value]))
          expect(yield* toy.fetch('projection', 'queue', all)).toEqual([])
          expect(yield* toy.consumers).toEqual([
            { topic: 'projection', consumer: 'queue', declared: true, behind: 0, since: null, cursors: [] },
          ])
        }))
    })))

  test('a reader of consume that waits is given the rows steps commit, and ends when the runtime stops', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const outside = yield* Scope.make()
      const handled: Array<number> = []
      // The reader outlives the runtime's scope: without its end at the stop, it would wait for ever, and the join
      // below would never return (decision 0184).
      const reader = yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(program, queue), layer)
          const reader = yield* Effect.forkIn(
            Effect.delay(
              toy.consume(
                'projection',
                'queue',
                (page) => Effect.sync(() => handled.push(...page.map(({ value }) => value))),
                { limit: all, wait: true },
              ),
              '1 millis',
            ),
            outside,
          )
          yield* TestClock.adjust('1 millis')
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          yield* TestClock.adjust('1 millis')
          expect(handled).toEqual([4])
          yield* toy.send(id, { _tag: 'Want', key: 't', on: false, nonce: 'off' }, { requestId: 'off', sender: tester, keep: 'forever' })
          yield* TestClock.adjust('1 millis')
          expect(handled).toEqual([4, 3])
          // An hour without a row ends no reader that waits.
          yield* TestClock.adjust('1 hour')
          expect(reader.pollUnsafe()).toBeUndefined()
          expect(yield* toy.fetch('projection', 'queue', all)).toEqual([])
          return reader
        }))
      expect(yield* Fiber.join(reader)).toBeUndefined()
      yield* Scope.close(outside, Exit.void)
    })))

  test('a reader of consume within a transaction, of a limit of 0, or of a wait that is not true is refused', () =>
    database(Effect.gen(function*() {
      const reasonOf = (exit: Exit.Exit<unknown, unknown>) => {
        const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
        return cause instanceof InvariantDefect ? cause.reason : null
      }
      const at = yield* DateTime.now
      const sql = yield* SqlClient.SqlClient
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(program, queue), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          const handled: Array<number> = []
          const handler = (page: ReadonlyArray<unknown>) => Effect.sync(() => handled.push(page.length))
          // Within a transaction the reader would wait for a commit on the connection the commit waits for
          // (decision 0184). It is refused before it reads.
          expect(
            reasonOf(yield* Effect.exit(sql.withTransaction(toy.consume('projection', 'queue', handler, { limit: all })))),
          ).toBe('a reader of consume runs within a transaction of the client of the runtime')
          // A limit of 0 would give empty pages for ever to a reader that waits.
          expect(
            reasonOf(yield* Effect.exit(toy.consume('projection', 'queue', handler, { limit: 0, wait: true }))),
          ).toBe('the limit of consume is 0, which is no positive integer')
          for (const wait of [false, { millis: 10 }]) {
            expect(
              reasonOf(yield* Effect.exit(toy.consume('projection', 'queue', handler, { limit: all, wait } as never))),
            ).toBe('the wait of consume is neither true nor left out')
          }
          // What `fetch` refuses, `consume` refuses too (decisions 0141, 0152, 0153).
          expect(reasonOf(yield* Effect.exit(toy.consume('projection', 'queue', handler, { limit: -1 }))))
            .toBe('the limit is -1, which is no non-negative integer')
          expect(reasonOf(yield* Effect.exit(toy.consume('projection', 'queue', handler, undefined as never))))
            .toBe('the limit is undefined, which is no non-negative integer')
          expect(
            reasonOf(yield* Effect.exit(toy.consume('projection', 'qeueu' as 'queue', handler, { limit: all }))),
          ).toBe("'qeueu' is no consumer the deploy of 'Toy' declares for 'projection'")
          expect(
            reasonOf(yield* Effect.exit(toy.consume('projection', 'queue', handler, { limit: all, partitions: [] }))),
          ).toBe('the partitions a reader names are no list of at least one')
          expect(handled).toEqual([])
          expect((yield* toy.fetch('projection', 'queue', all)).length).toBe(1)
        }))
    })))

  // A call that runs a step or waits for one would wait, within a transaction, for the connection the transaction
  // holds (decision 0256). Each is refused before it runs, and the transaction is the caller's own.
  test('a deploy, a create, a send, a resume, a discard and a fetch that waits are refused within a transaction', () =>
    onBoth(Effect.gen(function*() {
      const reasonOf = (exit: Exit.Exit<unknown, unknown>) => {
        const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
        return cause instanceof InvariantDefect ? cause.reason : null
      }
      const at = yield* DateTime.now
      const sql = yield* SqlClient.SqlClient
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const within = (effect: Effect.Effect<unknown, unknown>) =>
            Effect.map(Effect.exit(sql.withTransaction(effect)), reasonOf)
          const refused = (what: string) => `${what} runs within a transaction of the client of the runtime`
          expect(yield* within(Effect.provide(runtime.deploy(program, queue), layer))).toBe(refused('deploy'))
          const toy = yield* Effect.provide(runtime.deploy(program, queue), layer)
          expect(yield* within(toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })))
            .toBe(refused('create'))
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          const message = { _tag: 'Want', key: 't', on: false, nonce: 'off' } as const
          expect(yield* within(toy.send(id, message, { requestId: 'off', sender: tester, keep: 'forever' })))
            .toBe(refused('send'))
          expect(yield* within(toy.resume(id))).toBe(refused('resume'))
          expect(yield* within(toy.discard(id))).toBe(refused('discard'))
          expect(yield* within(toy.fetch('projection', 'queue', all, { wait: { millis: 10 } })))
            .toBe(refused('a fetch that waits'))
          // A fetch that does not wait reads within the transaction, as a store of the caller's does.
          expect(yield* within(toy.fetch('projection', 'queue', all))).toBeNull()
          // Nothing refused was stored, and the runtime goes on.
          expect(yield* toy.send(id, message, { requestId: 'off', sender: tester, keep: 'forever' }))
            .toEqual({ _tag: 'Accepted' })
        }))
    })))

  // A transaction of another client holds a connection the runtime's steps do not use, so a call within it is not
  // refused, and its step commits apart from that transaction (decision 0256).
  test('a create and a send within a transaction of another client are answered', () =>
    onBoth(Effect.scoped(Effect.gen(function*() {
      const at = yield* DateTime.now
      const other = Context.get(
        yield* Layer.build(Layer.orDie(SqliteClient.layer({ filename: ':memory:' }))),
        SqlClient.SqlClient,
      )
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(program, queue), layer)
          const message = { _tag: 'Want', key: 't', on: false, nonce: 'off' } as const
          const answers = yield* other.withTransaction(Effect.all([
            toy.create(id, { flags: { at }, requestId: 'creation', sender: tester }),
            toy.send(id, message, { requestId: 'off', sender: tester, keep: 'forever' }),
          ]))
          expect(answers).toEqual([{ _tag: 'Created' }, { _tag: 'Accepted' }])
        }))
    }))))

  // The handler of `consume` runs in the page's transaction, which holds SQLite's one connection (decision 0184). A
  // creation there would commit on a connection of its own, which the handler holds while it waits for the creation
  // (decision 0150), so it is refused (decision 0256). The page rolls back, and the runtime holds no step.
  test('a handler of consume that creates an entity is refused, and holds no step of the runtime', () =>
    database(Effect.gen(function*() {
      const reasonOf = (exit: Exit.Exit<unknown, unknown>) => {
        const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
        return cause instanceof InvariantDefect ? cause.reason : null
      }
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(program, queue), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          const page = yield* toy.fetch('projection', 'queue', all)
          const reader = yield* Effect.forkChild(toy.consume('projection', 'queue', () =>
            Effect.asVoid(toy.create('other', { flags: { at }, requestId: 'other', sender: tester })), { limit: all }))
          yield* TestClock.adjust('1 minute')
          const done = reader.pollUnsafe()
          yield* Fiber.interrupt(reader)
          expect(done === undefined ? undefined : reasonOf(done)).toBe(
            'create runs within a transaction of the client of the runtime',
          )
          // The page is read again by the next reader, and the creation the handler asked for runs outside.
          expect((yield* toy.fetch('projection', 'queue', all)).slice(0, page.length)).toEqual([...page])
          expect(yield* toy.create('other', { flags: { at }, requestId: 'other', sender: tester }))
            .toEqual({ _tag: 'Created' })
        }))
    })))

  test('a reader of consume without a wait ends once the runtime stops, and leaves the rows it did not read', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const toy = yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(program, queue), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          return toy
        }))
      // The runtime has stopped with a row unread: the reader reads no page, and the row stays for the next
      // runtime's reader (decision 0184).
      const handled: Array<number> = []
      yield* toy.consume('projection', 'queue', (page) => Effect.sync(() => handled.push(page.length)), { limit: all })
      expect(handled).toEqual([])
      expect((yield* toy.fetch('projection', 'queue', all)).length).toBe(1)
    })))
})

describe('a schema that changes', () => {
  const tester = { _tag: 'Tester' } as const

  /**
   * Version 2 of the toy: `applied` is renamed, the operation `A` gains a field, and the projection becomes a
   * struct. Nothing of version 1 is left in the code but the migration, which reads the JSON it wrote
   * (decision 0036).
   */
  const State2 = Schema.Struct({
    want: Schema.Array(Key),
    log: Schema.Array(Schema.String),
    since: Schema.DateTimeUtcFromMillis,
    rings: Schema.DateTimeUtcFromMillis,
  })
  type State2 = typeof State2.Type

  const Operation2 = Schema.Union([
    Schema.TaggedStruct('A', { why: Schema.String }),
    Schema.TaggedStruct('B', { key: Key }),
    Schema.TaggedStruct('C', { key: Key }),
  ])
  type Operation2 = typeof Operation2.Type

  const Projection2 = Schema.Struct({ wanted: Schema.Int })
  type Projection2 = typeof Projection2.Type

  const Rejection2 = Schema.Struct({ why: Schema.Literal('Refused') })
  type Rejection2 = typeof Rejection2.Type

  const Sender2 = Schema.TaggedStruct('Tester', { team: Schema.String })
  type Sender2 = typeof Sender2.Type
  const tester2: Sender2 = { _tag: 'Tester', team: 'core' }

  type T2 = {
    state: State2
    flags: Readonly<{ at: DateTime.Utc }>
    inbound: Inbound
    internal: Internal
    operation: Operation2
    key: Key
    parameter: {}
    rejection: Rejection2
    sender: Sender2
    projection: Projection2
    index: 'wanted'
    services: Hands
  }

  const next: Program<T2> = {
    name: 'Toy',
    keys: { a: null, b: null, c: null, t: null },
    schemas: {
      ...program.schemas,
      state: State2,
      operation: Operation2,
      projection: Projection2,
      rejection: Rejection2,
      sender: Sender2,
    },
    init: (_flags, at) => ({ want: keys, log: [], since: at, rings: DateTime.addDuration(at, '40 millis') }),
    update: (message) => (state) => {
      switch (message._tag) {
        case 'Want': {
          const others = state.want.filter((key) => key !== message.key)
          const want = message.on ? keys.filter((key) => key === message.key || others.includes(key)) : others
          return { ...state, want, log: [...state.log, message.nonce] }
        }
        case 'Refuse':
          return rejectWith({ why: 'Refused' } as const)
        case 'Break':
          return defect('broken')
        default:
          return !state.want.includes(message.key)
            ? defect('an internal message for a key the state does not hold')
            : { ...state, want: state.want.filter((key) => key !== message.key) }
      }
    },
    work: (state) =>
      state.want.length === 0 ? noWork : Object.fromEntries(state.want.map((key) => [
        key,
        key === 'a'
          ? { _tag: 'A', why: 'kept' } as const
          : key === 'b'
          ? { _tag: 'B', key } as const
          : key === 'c'
          ? { _tag: 'C', key } as const
          : timer<Internal>(state.rings, { _tag: 'Rang', key: 't' }),
      ])),
    operations: {
      A: operation((_operation, idempotencyKey) => acts('a', idempotencyKey)),
      B: operation.atMostOnce(({ key }) => acts(key, null), ({ key }): Internal => ({ _tag: 'Unknown', key })),
      C: operation.atLeastOnce(({ key }) => acts(key, null)),
    },
    project: (state) => ({ wanted: state.want.length }),
    indexes: { wanted: (projection) => projection.wanted },
    migrations: [{
      state: (json) => {
        const { applied, ...rest } = json as Readonly<Record<string, Json>>
        return { ...rest, log: applied ?? [] }
      },
      // What the migration gives must be what `work` computes, or the activation suspends the entity.
      operation: (json) => {
        const held = json as Readonly<Record<string, Json>>
        return held._tag === 'A' ? { ...held, why: 'kept' } : held
      },
      projection: (json) => ({ wanted: json }),
      // A reason is kept as long as its reply, here for ever, since the caller gives no keep: a retry reads it through this.
      rejection: (json) => ({ why: json }),
      // A caller's requests are stored under its sender, so a retry finds its reply through this (decision 0048).
      sender: (json) => ({ ...json as Readonly<Record<string, Json>>, team: 'core' }),
    }],
  }

  /** The idempotency key the operation under `a` ran with: it is the same one through the migration. */
  const charged = (acted: ReadonlyArray<string>) => acted.filter((act) => act.startsWith('a:'))

  test('a deploy reads the state, the work under way and the rows through the migrations', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      // One toy with nothing left under way, whose row version 1 wrote and nothing rewrites.
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create('m-1', { flags: { at }, requestId: 'c-1', sender: tester })
          yield* runtime.settled
          yield* TestClock.adjust('60 millis')
          yield* runtime.settled
          expect(yield* toy.read('m-1')).toBe(0)
        }))
      // And one whose operations hold, so that version 2 finds work under way stored by version 1.
      const before: Array<string> = []
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { acted, layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* ran(toy.create('m-2', { flags: { at }, requestId: 'c-2', sender: tester }))
          expect(yield* toy.send('m-2', { _tag: 'Refuse', nonce: 'no' }, { requestId: 'r-2', sender: tester, keep: 'forever' }))
            .toEqual({ _tag: 'Rejected', reason: 'Refused' })
          // `a` is wanted already: the message is logged, and changes no work.
          expect(yield* toy.send('m-2', { _tag: 'Want', key: 'a', on: true, nonce: 'w' }, {
            requestId: 'w-2',
            sender: tester,
            keep: 'forever',
          })).toEqual({ _tag: 'Accepted' })
          before.push(...acted)
        }))
      expect(charged(before)).toHaveLength(1)
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { acted, layer } = yield* hands({ holds: true })
          const toy = yield* ran(Effect.provide(runtime.deploy(next), layer))
          // The row of 'm-1' is the one version 1 wrote, read through the migration of the projection.
          expect(yield* toy.query({ limit: all, where: [{ index: 'wanted', is: '=', value: 0 }] }))
            .toEqual([{ id: 'm-1', projection: { wanted: 0 }, indexes: { wanted: 0 } }])
          // 'm-2' was activated with the state and the operations of version 1, migrated: its at-most-once
          // operation delivered `unknown` and its timer fired, and the two that hold run under the keys they
          // started with.
          yield* TestClock.adjust('60 millis')
          expect(yield* toy.read('m-2')).toEqual({ wanted: 2 })
          expect(charged(acted)).toEqual(charged(before))
          // The retry is answered from the reply version 1 stored, with its reason read through the migration.
          expect(yield* toy.send('m-2', { _tag: 'Refuse', nonce: 'no' }, { requestId: 'r-2', sender: tester2, keep: 'forever' }))
            .toEqual({ _tag: 'Rejected', reason: { why: 'Refused' } })
          // The caller's requests are found under its sender as version 1 stored it, read through the migration:
          // its creation is answered `Created`, and its message is not applied again.
          expect(yield* toy.create('m-2', { flags: { at }, requestId: 'c-2', sender: tester2 })).toEqual({ _tag: 'Created' })
          expect(yield* toy.send('m-2', { _tag: 'Want', key: 'a', on: true, nonce: 'w' }, {
            requestId: 'w-2',
            sender: tester2,
            keep: 'forever',
          })).toEqual({ _tag: 'Accepted' })
          const stored = yield* storage(next, yield* SqlClient.SqlClient).load('m-2')
          expect(stored?.state.log).toEqual(['w'])
          // The rows are version 2's once they are written again, and the index reads the struct.
          expect(yield* toy.reindex).toEqual({ written: 2, failed: [] })
          expect(yield* toy.query({ limit: all, where: [{ index: 'wanted', is: '=', value: 0 }] }))
            .toEqual([{ id: 'm-1', projection: { wanted: 0 }, indexes: { wanted: 0 } }])
        }))
    })))

  test('a deploy that has no reading of the version stored dies', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const toy = yield* Effect.provide(runtime.deploy(next), layer)
          yield* toy.create('m-3', { flags: { at }, requestId: 'c-3', sender: tester2 })
        }))
      // The entity holds an operation, which an activation starts again: the deploy reads what version 2 wrote.
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands({ holds: true })
          const exit = yield* Effect.exit(Effect.provide(runtime.deploy(program), layer))
          const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
          expect(cause instanceof Error && cause.message)
            .toBe("'Toy' is version 1, and has no reading of version 2")
        }))
    })))

  test('a row no version reads fails the call that meets it, and the process serves the rest', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      // Each version leaves an entity with nothing under way, so that a deploy activates neither.
      for (const [version, entity, sender] of [[program, 'm-4', tester], [next, 'm-5', tester2]] as const) {
        yield* process({}, (runtime) =>
          Effect.gen(function*() {
            const { layer } = yield* hands()
            const toy = yield* Effect.provide(runtime.deploy(version as Program<T>), layer)
            yield* toy.create(entity, { flags: { at }, requestId: `c-${entity}`, sender: sender as Sender })
            yield* runtime.settled
            yield* TestClock.adjust('60 millis')
            yield* runtime.settled
          }))
      }
      // Version 1 is deployed again, as a rollback: the entity version 2 wrote fails each call that loads it.
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          const want = { _tag: 'Want', key: 't', on: true, nonce: 'n' } as const
          const exit = yield* Effect.exit(toy.send('m-5', want, { requestId: 'r-5', sender: tester, keep: 'forever' }))
          const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
          expect(cause instanceof Error && cause.message)
            .toBe("'Toy' is version 1, and has no reading of version 2")
          expect(yield* toy.send('m-4', want, { requestId: 'r-4', sender: tester, keep: 'forever' })).toEqual({ _tag: 'Accepted' })
          expect(yield* toy.read('m-4')).toBe(1)
          // A reindex passes over the entity version 2 wrote, names it, and writes the one it reads (decision 0122).
          expect(yield* toy.reindex).toEqual({
            written: 1,
            failed: [{ id: 'm-5', cause: "Error: 'Toy' is version 1, and has no reading of version 2" }],
          })
        }))
    })))
})

describe('what the runtime cannot finish', () => {
  const tester = { _tag: 'Tester' } as const
  const want = (nonce: string): Inbound => ({ _tag: 'Want', key: 't', on: true, nonce })

  test('an event it cannot finish crashes its entity alone, and the next caller finds it again', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      let dies = true
      yield* process({
        // The message is written, and the runtime dies before it acts on it: the probe stands for a failed write.
        observe: (_entity, event) => {
          if (received(event) !== 'r-1' || !dies) return Effect.void
          dies = false
          return Effect.die('the runtime failed')
        },
      }, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          const failed = yield* Effect.exit(toy.send(id, want('n-1'), { requestId: 'r-1', sender: tester, keep: 'forever' }))
          expect(Exit.isFailure(failed)).toBe(true)
          // The entity left the process: the next caller loads it, and the message stored is handled first.
          expect(yield* toy.send(id, want('n-2'), { requestId: 'r-2', sender: tester, keep: 'forever' })).toEqual({ _tag: 'Accepted' })
          expect(yield* toy.send(id, want('n-1'), { requestId: 'r-1', sender: tester, keep: 'forever' }))
            .toEqual({ _tag: 'Accepted' })
          yield* runtime.settled
        }))
    })))

  test('a crash gives its defect to a creator waiting on the entity too', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      let dies = false
      yield* process({
        // A creation of an entity already there is one of its events: the probe stands for a failed write.
        observe: (_entity, event) => {
          if (event._tag !== 'Create' || !dies) return Effect.void
          dies = false
          return Effect.die('the runtime failed')
        },
      }, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          dies = true
          const failed = yield* Effect.exit(toy.create(id, { flags: { at }, requestId: 'again', sender: tester }))
          expect(Exit.isFailure(failed)).toBe(true)
          // The entity left the process, and the next creator loads it again.
          expect(yield* toy.create(id, { flags: { at }, requestId: 'again', sender: tester })).toEqual({ _tag: 'AlreadyExists' })
          yield* runtime.settled
        }))
    })))

  test('a creation it cannot finish crashes its entity, and the next caller loads it', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const activated: Array<string> = []
      yield* process({
        // The creation is written, and the runtime dies as it acts on it: the probe stands for a failure there.
        at: (point, _entity, event) =>
          point === 'AfterReply' && event._tag === 'Create' ? Effect.die('the runtime failed') : Effect.void,
        observe: (entity, event) => event._tag === 'Restart' ? Effect.sync(() => activated.push(entity.id)) : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          const failed = yield* Effect.exit(toy.create(id, { flags: { at }, requestId: 'creation', sender: tester }))
          expect(Exit.isFailure(failed)).toBe(true)
          // The entity left the process: the next caller loads it from what the creation stored.
          expect(yield* toy.send(id, want('n-1'), { requestId: 'r-1', sender: tester, keep: 'forever' })).toEqual({ _tag: 'Accepted' })
          expect(activated).toEqual([id])
          yield* runtime.settled
        }))
    })))

  test('a sender its schema cannot encode is its caller’s defect, named as the sender', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          const nobody = { _tag: 'Nobody' } as unknown as typeof tester
          const exit = yield* Effect.exit(toy.send(id, want('n-1'), { requestId: 'r-1', sender: nobody, keep: 'forever' }))
          const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
          expect(cause instanceof InvariantDefect && cause.reason).toStartWith('the sender does not encode')
          yield* runtime.settled
        }))
    })))

  // A defect is no reply: nothing is stored for it, so the creator's retry after a fix creates the entity (decision 0124).
  test('a creation init dies on gives its creator the defect, and a retry after a fix creates the entity', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { layer } = yield* hands()
      const dying: Program<T> = { ...program, init: () => defect('init died') }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(dying), layer)
          for (let attempt = 0; attempt < 2; attempt++) {
            const exit = yield* Effect.exit(toy.create(id, { flags: { at }, requestId: 'creation', sender: tester }))
            const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
            expect(cause instanceof InvariantDefect && cause.reason).toBe('init died')
          }
          expect(yield* toy.send(id, want('n-1'), { requestId: 'r-1', sender: tester, keep: 'forever' })).toEqual({ _tag: 'NotFound' })
          yield* runtime.settled
        }))
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          expect(yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })).toEqual({ _tag: 'Created' })
          yield* runtime.settled
        }))
    })))

  // A rejection at creation is not stored, as a defect is not: a retry under the same request id runs `init` again
  // (decision 0182).
  test('a creation init rejects stores nothing, and a retry under its request id runs init again', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { layer } = yield* hands()
      const refusing: Program<T> = { ...program, init: () => rejectWith('Refused') }
      const creation = { requestId: 'creation', sender: tester }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(refusing), layer)
          for (let attempt = 0; attempt < 2; attempt++) {
            expect(yield* toy.create(id, { flags: { at }, ...creation })).toEqual({ _tag: 'Rejected', reason: 'Refused' })
          }
          expect(yield* toy.send(id, want('n-1'), { requestId: 'r-1', sender: tester, keep: 'forever' })).toEqual({ _tag: 'NotFound' })
          yield* runtime.settled
        }))
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          expect(yield* toy.create(id, { flags: { at }, ...creation })).toEqual({ _tag: 'Created' })
          yield* runtime.settled
        }))
    })))

  // An operation that talks only to entities acts once, since a run after a crash is given the answers the run before
  // it was given. A creation `init` rejects stores no entity (decision 0182), so the operation's answer is kept for
  // its work (decision 0253). Without it, the run after the crash is answered `AlreadyExists`, and acts on it too.
  test('an at-least-once operation run again after a crash acts once, though init rejected its creation', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { layer } = yield* hands()
      // `init` rejects flags at the time 0, and takes any other.
      const gate: Program<T> = {
        ...program,
        name: 'Gate',
        init: (flags, now) =>
          DateTime.toEpochMillis(flags.at) === 0 ? rejectWith('Refused') : program.init(flags, now),
      }
      let holds = true
      // Creates `g`, tells `toy-1` what the creation answered under a name of that answer, and, in the first
      // process, never ends: its act is done in the world, and not recorded.
      const sender: Program<Omit<T, 'services'> & { services: Entities }> = {
        ...sending,
        operations: {
          ...sending.operations,
          C: operation.atLeastOnce(({ key }) =>
            Effect.gen(function*() {
              const made = yield* createFrom(gate, 'g', 'make', { at: DateTime.makeUnsafe(0) })
              const name = made._tag === 'Rejected' ? 'refund' : 'confirm'
              yield* send(program, id, { _tag: 'Want', key: 'a', on: false, nonce: made._tag }, name)
              if (holds) yield* Effect.never
              return done(key)
            })
          ),
        },
      }
      const creation = { flags: { at }, requestId: 'creation', sender: tester }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          const gates = yield* Effect.provide(runtime.deploy(gate), layer)
          const from = yield* runtime.deploy(sender)
          yield* ran(toy.create(id, creation))
          yield* ran(from.create('sender', creation))
          // Another creator makes `g` while the operation is under way.
          expect(yield* ran(gates.create('g', { ...creation, flags: { at: DateTime.makeUnsafe(1) } })))
            .toEqual({ _tag: 'Created' })
        }))
      holds = false
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          yield* Effect.provide(runtime.deploy(program), layer)
          yield* Effect.provide(runtime.deploy(gate), layer)
          const from = yield* runtime.deploy(sender)
          yield* ran(from.create('sender', creation))
          yield* runtime.settled
        }))
      const sql = yield* SqlClient.SqlClient
      const stored = yield* storage(program, sql).load(id)
      // The first run told `toy-1` `Rejected`, and the run after the crash is given `Rejected` again.
      expect(stored?.state.applied).toEqual(['Rejected'])
      // The work ended, and took its answer with it.
      expect(yield* sql`SELECT * FROM effecttea_answers`).toEqual([])
    })))

  // A message to no entity is answered `NotFound`, which no entity stores, so the operation's answer is kept for its
  // work (decision 0253). Without it, the run after the crash reaches the entity another creator made since, and acts
  // on `Accepted` too.
  test('an at-least-once operation run again after a crash acts once, though its message found no entity', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { layer } = yield* hands()
      const gate: Program<T> = { ...program, name: 'Gate' }
      let holds = true
      // Tells `g` a message, tells `toy-1` what the message was answered, and, in the first process, never ends.
      const sender: Program<Omit<T, 'services'> & { services: Entities }> = {
        ...sending,
        operations: {
          ...sending.operations,
          C: operation.atLeastOnce(({ key }) =>
            Effect.gen(function*() {
              const told = yield* send(gate, 'g', { _tag: 'Want', key: 'b', on: false, nonce: 'n' }, 'tell')
              yield* send(program, id, { _tag: 'Want', key: 'a', on: false, nonce: told._tag }, 'report')
              if (holds) yield* Effect.never
              return done(key)
            })
          ),
        },
      }
      const creation = { flags: { at }, requestId: 'creation', sender: tester }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          const gates = yield* Effect.provide(runtime.deploy(gate), layer)
          const from = yield* runtime.deploy(sender)
          yield* ran(toy.create(id, creation))
          yield* ran(from.create('sender', creation))
          // Another creator makes `g` while the operation is under way.
          expect(yield* ran(gates.create('g', creation))).toEqual({ _tag: 'Created' })
        }))
      holds = false
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          yield* Effect.provide(runtime.deploy(program), layer)
          yield* Effect.provide(runtime.deploy(gate), layer)
          const from = yield* runtime.deploy(sender)
          yield* ran(from.create('sender', creation))
          yield* runtime.settled
        }))
      const sql = yield* SqlClient.SqlClient
      const stored = yield* storage(program, sql).load(id)
      expect(stored?.state.applied).toEqual(['NotFound'])
      // The message reached `g` in neither run.
      expect((yield* storage(gate, sql).load('g'))?.state.applied).toEqual([])
      // The work ended, and took its answer with it.
      expect(yield* sql`SELECT * FROM effecttea_answers`).toEqual([])
    })))

  test('an entity the waker cannot activate is tried again after the retry, and the other timers fire', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const { entities, unloaded } = unloads()
      let dies = false
      yield* process({
        unloaded,
        passivate: { millis: 5 },
        retry: { millis: 100 },
        // The first activation of `w-1` the waker makes cannot finish: the probe stands for a failed write.
        observe: (entity, event) => {
          if (entity.id !== 'w-1' || event._tag !== 'Restart' || !dies) return Effect.void
          dies = false
          return Effect.die('the runtime failed')
        },
      }, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          for (const entity of ['w-1', 'w-2']) yield* toy.create(entity, { flags: { at }, requestId: entity, sender: tester })
          yield* runtime.settled
          yield* TestClock.adjust('5 millis')
          expect(entities).toEqual(['w-1', 'w-2'])
          // Both timers come at once, and the waker activates `w-1` first, in the order of the ids.
          dies = true
          yield* TestClock.adjust('60 millis')
          yield* runtime.settled
          expect([yield* toy.read('w-1'), yield* toy.read('w-2')]).toEqual([1, 0])
          // The waker sleeps until `w-1` is tried again, at 40 and the retry, and its timer fires then, at that
          // time exactly (decision 0077).
          yield* TestClock.adjust('75 millis')
          yield* runtime.settled
          expect([yield* toy.read('w-1'), yield* toy.read('w-2')]).toEqual([0, 0])
        }))
    })))

  test('an entity the waker can never activate leaves the process settled between its retries', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const tried: Array<number> = []
      yield* process({
        passivate: { millis: 5 },
        retry: { millis: 100 },
        // Every activation of `w` cannot finish, as a row no version reads (decision 0043).
        observe: (entity, event) =>
          entity.id !== 'w' || event._tag !== 'Restart'
            ? Effect.void
            : Effect.andThen(
              Effect.map(DateTime.now, (now) => tried.push(DateTime.toEpochMillis(now))),
              Effect.die('the runtime failed'),
            ),
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
          yield* toy.create('w', { flags: { at }, requestId: 'w', sender: tester })
          yield* runtime.settled
          // Its timer comes, and each activation fails: the waker tries it once a retry, and rests in between,
          // where one that tried at once would never settle (decision 0077).
          for (let round = 0; round < 3; round++) {
            yield* TestClock.adjust('100 millis')
            yield* runtime.settled
          }
          expect(tried).toEqual([40, 140, 240])
          expect(yield* toy.read('w')).toBe(1)
        }))
    })))

  test('the process is not settled while a stored timer or a retry has come by the clock and not run', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const clock = ahead()
      let dies = false
      /** Whether `settled` returns while the clock stands ahead of the waker's sleep, which only `adjust` ends. */
      const settles = (runtime: Runtime, millis: number) =>
        Effect.gen(function*() {
          const settling = yield* Effect.forkChild(runtime.settled)
          yield* Effect.replicateEffect(Effect.yieldNow, 50, { discard: true })
          const early = settling.pollUnsafe() !== undefined
          yield* clock.adjust(`${millis} millis`)
          yield* Fiber.join(settling)
          return early
        })
      yield* clock.around(process({
        passivate: { millis: 5 },
        retry: { millis: 100 },
        // The first activation of `w-1` the waker makes cannot finish: the probe stands for a failed write.
        observe: (entity, event) => {
          if (entity.id !== 'w-1' || event._tag !== 'Restart' || !dies) return Effect.void
          dies = false
          return Effect.die('the runtime failed')
        },
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(timed), (yield* hands()).layer)
          for (const entity of ['w-1', 'w-2']) yield* toy.create(entity, { flags: { at }, requestId: entity, sender: tester })
          yield* runtime.settled
          yield* clock.adjust('5 millis')
          // The clock reaches the stored timers before the waker's sleep does: they are work not activated yet.
          dies = true
          clock.by.millis = 35
          expect(yield* settles(runtime, 35)).toBe(false)
          expect([yield* toy.read('w-1'), yield* toy.read('w-2')]).toEqual([1, 0])
          // And so is `w-1`'s retry, once the clock reaches it: the waker read 75, and it is due at 175, which the
          // sleep reaches at 140 (decision 0077).
          clock.by.millis = 135
          expect(yield* settles(runtime, 100)).toBe(false)
          expect([yield* toy.read('w-1'), yield* toy.read('w-2')]).toEqual([0, 0])
        })))
    })))

  // Bug 31 of the roadmap: a crash forks the stop of its operations and gives the lock back (decision 0056), so the
  // next activation records an at-most-once operation's `unknown` while the old fiber still runs its finalizer, which
  // acts. The program's answer to `unknown` may then act beside it.
  test.failing('an at-most-once operation a crash stops delivers its unknown once its finalizer has run', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const released = yield* Deferred.make<void>()
      const stopping = yield* Deferred.make<void>()
      let finalized = false
      // `b`'s hands never come back, and act in a finalizer that ends only once the test lets it.
      const layer = Layer.succeed(
        Hands,
        Hands.of({
          act: (key) =>
            key !== 'b' ? Effect.never : Effect.never.pipe(
              Effect.onInterrupt(() =>
                Deferred.succeed(stopping, undefined).pipe(
                  Effect.andThen(Deferred.await(released)),
                  Effect.andThen(Effect.sync(() => {
                    finalized = true
                  })),
                )
              ),
            ),
        }),
      )
      let dies = true
      const finalizedWhenKnown = yield* process({
        observe: (entity, event) => {
          if (entity.id !== 'slow' || event._tag !== 'Receive' || !dies) return Effect.void
          dies = false
          return Effect.die('the runtime failed')
        },
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create('slow', { flags: { at }, requestId: 'c-slow', sender: tester })
          const failed = yield* Effect.exit(toy.send('slow', want('n-1'), { requestId: 'r-1', sender: tester, keep: 'forever' }))
          expect(Exit.isFailure(failed)).toBe(true)
          yield* Deferred.await(stopping)
          // The next caller loads the entity again, and its activation records `b`'s `unknown`.
          yield* toy.send('slow', want('n-2'), { requestId: 'r-2', sender: tester, keep: 'forever' })
          for (let turn = 0; turn < 1_000; turn++) {
            const inspected = yield* toy.inspect('slow')
            if (inspected !== null && !inspected.state.want.includes('b')) return finalized
            yield* Effect.yieldNow
          }
          return 'unknown never handled'
        }).pipe(Effect.ensuring(Deferred.succeed(released, undefined))))
      expect(finalizedWhenKnown).toBe(true)
    })))

  // Bug 65 of the roadmap: a crash does not wait for the stop of its operations (decision 0056), and the receiver
  // deletes the reply of a request once the work that sent it ends (decision 0021). So an at-least-once operation
  // that sends from a region it holds uninterruptible, after the operation's new run ended the work, has the
  // receiver apply the request twice.
  test.failing('a send of an operation a crash could not interrupt, after its new run ended the work, is applied once', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const gate = yield* Deferred.make<void>()
      const oldSent = yield* Deferred.make<void>()
      const inRegion = yield* Deferred.make<void>()
      let runs = 0
      const sent = send(program, id, { _tag: 'Want', key: 'a', on: false, nonce: 'sent' }, 'want')
      const sender: Program<Omit<T, 'services'> & { services: Entities }> = {
        ...sending,
        operations: {
          ...sending.operations,
          C: operation.atLeastOnce(({ key }) =>
            ++runs === 1
              ? Effect.uninterruptible(
                Deferred.succeed(inRegion, undefined).pipe(
                  Effect.andThen(Deferred.await(gate)),
                  Effect.andThen(sent),
                  Effect.andThen(Deferred.succeed(oldSent, undefined)),
                ),
              ).pipe(Effect.as(done(key)))
              : Effect.as(sent, done(key))
          ),
        },
      }
      const { layer } = yield* hands()
      let dies = true
      yield* process({
        observe: (entity, event) => {
          if (entity.id !== 'sender' || event._tag !== 'Receive' || !dies) return Effect.void
          dies = false
          return Effect.die('the runtime failed')
        },
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* ran(toy.create(id, { flags: { at }, requestId: 'creation', sender: tester }))
          const from = yield* runtime.deploy(sender)
          yield* from.create('sender', { flags: { at }, requestId: 'creation', sender: tester })
          yield* Deferred.await(inRegion)
          const poke = (nonce: string) =>
            from.send('sender', { _tag: 'Want', key: 't', on: false, nonce }, { requestId: nonce, sender: tester, keep: 'forever' })
          // The crash cannot interrupt `c`'s first run, which waits in its region.
          expect(Exit.isFailure(yield* Effect.exit(poke('p-1')))).toBe(true)
          // The next caller loads the sender again, and `c` runs again, sends, and ends the work.
          yield* poke('p-2')
          for (let turn = 0; turn < 1_000; turn++) {
            const inspected = yield* from.inspect('sender')
            if (inspected !== null && !inspected.state.want.includes('c')) break
            yield* Effect.yieldNow
          }
          yield* Deferred.succeed(gate, undefined)
          yield* Deferred.await(oldSent)
          yield* runtime.settled
          const received = yield* toy.inspect(id)
          expect(runs).toBe(2)
          expect(received?.state.applied.filter((nonce) => nonce === 'sent')).toEqual(['sent'])
        }))
    })))

  test('a crash does not wait for its operations to stop: nothing waits for them under its entity’s lock', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const released = yield* Deferred.make<void>()
      const stopping = yield* Deferred.make<void>()
      // Hands that act and never come back, and that take until the end of the test to stop: a request to a slow
      // service, closing.
      const layer = Layer.succeed(
        Hands,
        Hands.of({
          act: () =>
            Effect.never.pipe(
              Effect.onInterrupt(() =>
                Effect.andThen(Deferred.succeed(stopping, undefined), Deferred.await(released))
              ),
            ),
        }),
      )
      let dies = true
      yield* process({
        observe: (entity, event) => {
          if (entity.id !== 'slow' || event._tag !== 'Receive' || !dies) return Effect.void
          dies = false
          return Effect.die('the runtime failed')
        },
      }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create('slow', { flags: { at }, requestId: 'c-slow', sender: tester })
          yield* toy.create('other', { flags: { at }, requestId: 'c-other', sender: tester })
          // The crash of the first entity interrupts its operations, which take their time to stop (decision 0056).
          // A wait under the entity's lock would hold the calls to it below for ever, which the test's own timeout
          // reports.
          const failed = yield* Effect.exit(toy.send('slow', want('n-1'), { requestId: 'r-1', sender: tester, keep: 'forever' }))
          expect(Exit.isFailure(failed)).toBe(true)
          // Meanwhile, the entity is loaded again and answered, and so is every other one (decision 0067).
          expect(yield* toy.send('slow', want('n-2'), { requestId: 'r-2', sender: tester, keep: 'forever' }))
            .toEqual({ _tag: 'Accepted' })
          expect(yield* toy.send('other', want('n-3'), { requestId: 'r-3', sender: tester, keep: 'forever' }))
            .toEqual({ _tag: 'Accepted' })
          // The crash did interrupt it: it is stopping, and stops once the test lets it.
          yield* Deferred.await(stopping)
          // The operations stop once the test lets them, so that the process can end, whatever it found.
        }).pipe(Effect.ensuring(Deferred.succeed(released, undefined))))
    })))

  test('a deploy that cannot finish stops what it started, and leaves the process settled', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const started: Array<string> = []
      const stopped: Array<string> = []
      /** Done once the work of the process under test has acted: a deploy that stopped nothing passes vacuously. */
      let acted = Deferred.makeUnsafe<void>()
      // Hands that act and never come back, so that what a deploy starts runs until something stops it.
      const layer = Layer.succeed(
        Hands,
        Hands.of({
          act: (key) =>
            Effect.sync(() => {
              started.push(key)
              Deferred.doneUnsafe(acted, Effect.void)
            }).pipe(
              Effect.andThen(Effect.never),
              Effect.onInterrupt(() =>
                Effect.sync(() => {
                  stopped.push(key)
                })
              ),
            ),
        }),
      )
      // Two entities holding operations, which the next deploy activates in the order of their ids.
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          for (const entity of ['d-1', 'd-2']) {
            yield* toy.create(entity, { flags: { at }, requestId: `c-${entity}`, sender: tester })
          }
        }))
      started.length = 0
      stopped.length = 0
      acted = Deferred.makeUnsafe<void>()
      let dies = true
      const { entities, unloaded } = unloads()
      yield* process({
        unloaded,
        capacity: { entities: 2 },
        // The second activation cannot finish, once the first has started its work.
        at: (point, entity, event) =>
          dies && point === 'BeforeCommit' && entity.id === 'd-2' && event._tag === 'Restart'
            ? Effect.andThen(Deferred.await(acted), Effect.die('the runtime failed'))
            : Effect.void,
      }, (runtime) =>
        Effect.gen(function*() {
          expect(Exit.isFailure(yield* Effect.exit(Effect.provide(runtime.deploy(program), layer)))).toBe(true)
          // The first entity's work ran, and stopped with the deploy: nothing of a failed deploy runs on.
          expect(started.length).toBeGreaterThan(0)
          expect([...stopped].sort()).toEqual([...started].sort())
          yield* runtime.settled
          // Nor is it held: two entities of another program fill the capacity, and neither leaves (decision 0076).
          const twins = yield* Effect.provide(runtime.deploy({ ...program, name: 'Twin' }), (yield* hands()).layer)
          for (const entity of ['e-1', 'e-2']) {
            yield* twins.create(entity, { flags: { at }, requestId: entity, sender: tester })
            yield* runtime.settled
          }
          expect(entities).toEqual([])
          // A deploy that failed gives its name back, and the program can be deployed again (decision 0075).
          dies = false
          expect(Exit.isSuccess(yield* Effect.exit(Effect.provide(runtime.deploy(program), layer)))).toBe(true)
        }))
    })))

  test('a runner that throws while it builds its effect suspends its entity', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const throwing: Program<T> = {
        ...program,
        operations: {
          ...program.operations,
          C: operation.atLeastOnce((): Effect.Effect<Internal, never, Hands> => {
            throw new Error('thrown while building')
          }),
        },
      }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(throwing), layer)
          expect(yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester }))
            .toEqual({ _tag: 'Created' })
          yield* runtime.settled
          expect(yield* toy.send(id, want('n-1'), { requestId: 'r-1', sender: tester, keep: 'forever' }))
            .toEqual({ _tag: 'Suspended' })
        }))
      const stored = yield* storage(program, yield* SqlClient.SqlClient).load(id)
      expect(stored?.suspension?.on).toEqual({ _tag: 'Operation', key: { name: 'c' }, incarnation: 3 })
    })))

  test('a program that cannot run as written is refused where it enters, before anything is stored', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const sql = yield* SqlClient.SqlClient
      const reasonOf = (exit: Exit.Exit<unknown>) => {
        const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
        return cause instanceof InvariantDefect ? cause.reason : null
      }
      const unworded = { ...program, indexes: { 'wanted;': program.indexes.wanted } } as unknown as Program<T>
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          // A deploy refuses it before it writes an index into SQL, or loads an entity (decision 0054).
          expect(reasonOf(yield* Effect.exit(Effect.provide(runtime.deploy(unworded), layer))))
            .toBe("the program 'Toy' has an index 'wanted;' whose name is not a word")
          const made = yield* sql<{ name: string }>`SELECT name FROM sqlite_master WHERE type = 'index'`
          expect(made.map(({ name }) => name).filter((name) => name.startsWith('effecttea_projections '))).toEqual([])
          expect(reasonOf(yield* Effect.exit(Effect.provide(runtime.deploy({ ...program, name: '' }), layer))))
            .toBe("the program '' has an empty name")
          // A fix is a deploy, checked as any (decision 0064): the entities go on with the program deployed.
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          expect(reasonOf(yield* Effect.exit(Effect.provide(runtime.deploy(unworded), layer))))
            .toBe("the program 'Toy' has an index 'wanted;' whose name is not a word")
          expect(yield* toy.send(id, want('n-1'), { requestId: 'r-1', sender: tester, keep: 'forever' })).toEqual({ _tag: 'Accepted' })
          yield* runtime.settled
        }))
    })))

  test('a name is deployed once in a process, however two deploys of it interleave', () => {
    const reasonOf = (exit: Exit.Exit<unknown>) => {
      const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
      return cause instanceof InvariantDefect ? cause.reason : null
    }
    // Each schedule moves the points where one deploy runs between two steps of the other (decisions 0068, 0104).
    explored(() =>
      process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const deploy = Effect.exit(Effect.provide(runtime.deploy(program), layer))
          // A second deploy is refused, as is one after them both (decision 0075).
          const exits = [...yield* together([deploy, deploy]), yield* deploy]
          return exits.map(reasonOf).sort()
        })), [null, "the program 'Toy' is deployed already", "the program 'Toy' is deployed already"])
  }, 60_000)

  // The notes cite this group by its name, which the test held before it was divided to fit the budget (decision 0250).
  describe('a deploy interrupted anywhere keeps its name and its waker, or stops what it started', () => {
    // An entity left with its operations under way, which a deploy activates, and one with its timer alone, which
    // only a deployment's waker activates.
    const prepared = Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), (yield* hands()).layer)
          yield* toy.create('w', { flags: { at }, requestId: 'c-w', sender: tester })
          yield* runtime.settled
        }))
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), (yield* hands({ holds: true })).layer)
          yield* ran(toy.create('d', { flags: { at }, requestId: 'c-d', sender: tester }))
        }))
    })
    // Hands that act and come back once the test opens the gate, and say which acts an interruption stopped.
    const live = Effect.sync(() => {
      const running = new Map<string, number>()
      const gate = Deferred.makeUnsafe<void>()
      const layer = Layer.succeed(
        Hands,
        Hands.of({
          act: (key) => {
            let acted = false
            return Effect.onInterrupt(
              Effect.andThen(Effect.sync(() => {
                acted = true
                running.set(key, (running.get(key) ?? 0) + 1)
              }), Deferred.await(gate)),
              () =>
                Effect.sync(() => {
                  if (acted) running.set(key, (running.get(key) ?? 0) - 1)
                }),
            )
          },
        }),
      )
      return { running, gate, layer }
    })
    // Each schedule moves the point where the interruption reaches the deploy, and so does each count of the test's
    // own yields before it interrupts. PCT seldom preempts the deploy for the test's yields, which name no fiber, so
    // each count of yields comes once a run; and with a few yields, a run in order with one deviation stops the deploy
    // at each of its steps.
    const interrupted = (yields: () => number) => (window: Window) =>
      Effect.gen(function*() {
        const count = yields()
        yield* prepared
        const { running, gate, layer } = yield* live
        const fired: Array<string> = []
        return yield* process({
          observe: (entity, event) =>
            Effect.sync(() => {
              if (event._tag === 'Fire') fired.push(entity.id)
            }),
        }, (runtime) =>
          Effect.gen(function*() {
            yield* opened(window, true)
            const first = yield* Effect.forkChild(Effect.provide(runtime.deploy(program), layer))
            yield* Effect.replicateEffect(Effect.yieldNow, count, { discard: true })
            yield* Fiber.interrupt(first)
            yield* Effect.exit(Effect.provide(runtime.deploy(program), layer))
            yield* adjusted(window, '1 millis')
            // One deployment runs the entity's operations, whichever deploy it is.
            const seen = { a: running.get('a') ?? 0, c: running.get('c') ?? 0 }
            yield* Deferred.succeed(gate, undefined)
            yield* runtime.settled
            // And its waker fires each timer once: the one of the entity it activated, and the stored one.
            yield* adjusted(window, '100 millis')
            yield* runtime.settled
            return { ...seen, fired: [...fired].sort() }
          }))
      })
    test('under prioritized schedules, after any count of yields', () => {
      let runs = 0
      explored(interrupted(() => runs++ % 200), { a: 1, c: 1, fired: ['d', 'w'] }, { open: false })
    }, 120_000)
    // Two yields let the deploy reach its registration, where one deviation stops it.
    for (const count of [0, 1, 2, 3]) {
      test(`after ${count} yields, under every schedule of one deviation`, () => {
        explored(interrupted(() => count), { a: 1, c: 1, fired: ['d', 'w'] }, { open: false, bound: 1 })
      }, 120_000)
    }
  })

  test('a deploy interrupted as it activates an entity stops the activation', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), (yield* hands({ holds: true })).layer)
          yield* ran(toy.create('d', { flags: { at }, requestId: 'c-d', sender: tester }))
        }))
      const reached = yield* Deferred.make<void>()
      const gate = yield* Deferred.make<void>()
      let held = true
      let restarts = 0
      yield* process({
        // The first activation of `d` holds before its commit, as a slow database would.
        at: (point, entity, event) => {
          if (!held || point !== 'BeforeCommit' || entity.id !== 'd' || event._tag !== 'Restart') return Effect.void
          held = false
          return Effect.andThen(Deferred.succeed(reached, undefined), Deferred.await(gate))
        },
        observe: (entity, event) =>
          Effect.sync(() => {
            if (entity.id === 'd' && event._tag === 'Restart') restarts += 1
          }),
      }, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const first = yield* Effect.forkChild(Effect.provide(runtime.deploy(program), layer))
          yield* Deferred.await(reached)
          // The deploy is given up while its activation runs detached: the activation runs in the deployment's
          // scope, which the failed deploy closes, and stops with it (decisions 0079, 0102).
          yield* Fiber.interrupt(first)
          yield* Deferred.succeed(gate, undefined)
          yield* TestClock.adjust('1 millis')
          expect(restarts).toBe(0)
          yield* Effect.provide(runtime.deploy(program), layer)
          yield* runtime.settled
          expect(restarts).toBe(1)
        }))
    })))

  test('a message its schema cannot encode is its caller’s defect, and reaches no entity', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const observed: Array<string> = []
      yield* process({ observe: (_entity, event) => Effect.sync(() => observed.push(event._tag)) }, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          const wrong = { _tag: 'Want', key: 'z', on: false, nonce: 'n-1' } as unknown as Inbound
          const exit = yield* Effect.exit(toy.send(id, wrong, { requestId: 'r-1', sender: tester, keep: 'forever' }))
          expect(Exit.isFailure(exit)).toBe(true)
          expect(yield* toy.send(id, want('n-2'), { requestId: 'r-2', sender: tester, keep: 'forever' }))
            .toEqual({ _tag: 'Accepted' })
          yield* runtime.settled
        }))
      // Nothing of the entity failed: it never left the process, and no activation brought it back.
      expect(observed.filter((event) => event === 'Restart')).toEqual([])
      const stored = yield* storage(program, yield* SqlClient.SqlClient).load(id)
      expect(stored?.state.applied).toEqual(['n-2'])
    })))

  test('flags their schema cannot encode are their creator’s defect, whether the entity exists or not', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      const wrong = { at: 'now' } as unknown as T['flags']
      const reasonOf = (exit: Exit.Exit<unknown>) => {
        const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
        return cause instanceof InvariantDefect ? cause.reason : null
      }
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          // Nothing is created from them (decision 0049).
          const fresh = yield* Effect.exit(toy.create('toy-2', { flags: wrong, requestId: 'c-2', sender: tester }))
          expect(reasonOf(fresh)).toStartWith('the value of the flags does not encode')
          expect(yield* toy.read('toy-2')).toBeNull()
          // Nor is an existing entity's `AlreadyExists` given for them: they never reach it.
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })
          const again = yield* Effect.exit(toy.create(id, { flags: wrong, requestId: 'c-1', sender: tester }))
          expect(reasonOf(again)).toStartWith('the value of the flags does not encode')
          yield* runtime.settled
        }))
    })))
})

describe('a database held by one runtime', () => {
  const reasonOf = (exit: Exit.Exit<unknown>) => {
    const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
    return cause instanceof InvariantDefect ? cause.reason : null
  }
  const held = 'the database is held by another runtime, or open to another connection'

  test('a runtime holds its database file alone: no other connection opens it, nor launches while one is open', () => {
    const directory = mkdtempSync(join(tmpdir(), 'effect-tea-persistent-'))
    const filename = join(directory, 'store.db')
    // A client of the file, as a process opens one, with no busy wait: one that cannot get the file fails at once.
    const client = (scope: Scope.Scope) =>
      Effect.map(
        Scope.provide(Layer.build(SqliteClient.layer({ filename, busyTimeout: 0 })), scope),
        (context) => Context.get(context, SqlClient.SqlClient),
      )
    const on = (sql: SqlClient.SqlClient) => <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
      Effect.provideService(effect, SqlClient.SqlClient, sql)
    return Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const firstScope = yield* Scope.make()
      const first = yield* client(firstScope)
      yield* on(first)(createTables)
      yield* on(first)(process({}, () =>
        Effect.gen(function*() {
          // A second process would load the entities the first holds in memory, and one's steps would be lost
          // under the other's: while a runtime runs, nothing else opens the file (decision 0080).
          expect(Exit.isFailure(yield* Effect.exit(Effect.scoped(Effect.flatMap(Effect.scope, client)))))
            .toBe(true)
        })))
      // The first runtime has ended and given the file back: another connection opens it, but launches nothing
      // while the first client is still open on it.
      const second = yield* client(yield* Effect.scope)
      expect(reasonOf(yield* Effect.exit(on(second)(process({}, () => Effect.void))))).toBe(held)
      yield* Scope.close(firstScope, Exit.void)
      const at = DateTime.makeUnsafe(0)
      yield* on(second)(process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          expect(yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: { _tag: 'Tester' } }))
            .toEqual({ _tag: 'Created' })
        })))
    })).pipe(Effect.provide(TestClock.layer()))).finally(() => rmSync(directory, { recursive: true, force: true }))
  })

  // A launch creates the tables once it holds the database, so a launch refused leaves a new file as it was
  // (decision 0191). Created before the hold, the tables would be in the file the refused launch left.
  test('a launch creates the tables of a new database, and a launch refused creates none', () => {
    const directory = mkdtempSync(join(tmpdir(), 'effect-tea-persistent-'))
    const filename = join(directory, 'store.db')
    const client = (scope: Scope.Scope) =>
      Effect.map(
        Scope.provide(Layer.build(SqliteClient.layer({ filename, busyTimeout: 0 })), scope),
        (context) => Context.get(context, SqlClient.SqlClient),
      )
    const on = (sql: SqlClient.SqlClient) => <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
      Effect.provideService(effect, SqlClient.SqlClient, sql)
    return Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const first = yield* client(yield* Effect.scope)
      const otherScope = yield* Scope.make()
      const other = yield* client(otherScope)
      expect(reasonOf(yield* Effect.exit(on(first)(process({}, () => Effect.void))))).toBe(held)
      expect(yield* other`SELECT name FROM sqlite_master WHERE type = 'table'`).toEqual([])
      yield* Scope.close(otherScope, Exit.void)
      const at = DateTime.makeUnsafe(0)
      yield* on(first)(process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          expect(yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: { _tag: 'Tester' } }))
            .toEqual({ _tag: 'Created' })
        })))
    })).pipe(Effect.provide(TestClock.layer()))).finally(() => rmSync(directory, { recursive: true, force: true }))
  })

  // Two clients of PGlite over one data directory are two copies of one database, and the last to close writes its
  // copy over the other's, so a runtime launches on a directory only while no other client is open on it, as on a
  // file of SQLite (decision 0255). The test opens two instances of PGlite, which runs past the budget of `bun test`.
  slow('a runtime on a data directory of PGlite launches on no other client while one it launched on is open', () => {
    const directory = mkdtempSync(join(tmpdir(), 'effect-tea-persistent-'))
    const dataDir = join(directory, 'pg')
    const client = (scope: Scope.Scope, path: string) =>
      Effect.map(
        Scope.provide(Layer.build(Layer.orDie(PgliteClient.layer({ dataDir: path }))), scope),
        (context) => Context.get(context, SqlClient.SqlClient),
      )
    const on = (sql: SqlClient.SqlClient) => <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
      Effect.provideService(effect, SqlClient.SqlClient, sql)
    const at = DateTime.makeUnsafe(0)
    return Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const firstScope = yield* Scope.make()
      const first = yield* client(firstScope, dataDir)
      // The second client names the directory by another spelling of its path, which is the same directory.
      const secondScope = yield* Scope.make()
      const second = yield* client(secondScope, `${directory}${sep}.${sep}pg`)
      yield* on(first)(process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: { _tag: 'Tester' } })
          expect(reasonOf(yield* Effect.exit(on(second)(process({}, () => Effect.void))))).toBe(held)
        })))
      // The first runtime has ended, and its client is still open on the directory.
      expect(reasonOf(yield* Effect.exit(on(second)(process({}, () => Effect.void))))).toBe(held)
      // A runtime launches again on the client it launched on before.
      yield* on(first)(process({}, () => Effect.void))
      yield* Scope.close(secondScope, Exit.void)
      yield* Scope.close(firstScope, Exit.void)
      // Both clients are closed, the first last: a client opened now launches, and finds the entity the first created.
      const third = yield* client(yield* Effect.scope, dataDir)
      yield* on(third)(process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          expect(yield* toy.create(id, { flags: { at }, requestId: 'again', sender: { _tag: 'Tester' } }))
            .toEqual({ _tag: 'AlreadyExists' })
        })))
    })).pipe(Effect.provide(TestClock.layer()))).finally(() => rmSync(directory, { recursive: true, force: true }))
  }, 60_000)

  // A launch told the tables exist creates none, for a role of PostgreSQL that may not (decision 0191).
  test('a launch told the tables exist creates none, and dies where one is missing', () =>
    Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      expect(Exit.isFailure(yield* Effect.exit(Effect.scoped(launch({ tables: 'existing' }))))).toBe(true)
      expect(yield* sql`SELECT name FROM sqlite_master WHERE type = 'table'`).toEqual([])
      const wrong = yield* Effect.exit(Effect.scoped(launch({ tables: 'created' as never })))
      expect(reasonOf(wrong)).toBe(`the launch is given the tables "created", which is neither 'create' nor 'existing'`)
    })).pipe(Effect.provide(SqliteClient.layer({ filename: ':memory:' })))))

  test('a second runtime on one client dies as it launches, however the launches interleave', () => {
    // Each schedule moves the points where one launch runs between two steps of the other (decisions 0068, 0104).
    explored(() =>
      Effect.gen(function*() {
        // How many launched runtimes are running at once: never two.
        let running = 0
        let most = 0
        const body = () =>
          Effect.ensuring(
            Effect.andThen(
              Effect.sync(() => {
                running += 1
                most = Math.max(most, running)
              }),
              Effect.yieldNow,
            ),
            Effect.sync(() => {
              running -= 1
            }),
          )
        const launch = Effect.exit(process({}, body))
        const exits = (yield* together([launch, launch])).map(reasonOf)
        // Either both ran one after the other, or the second met the first and died; and whoever held the client
        // has let it go.
        return {
          most,
          made: exits.some((reason) => reason === null),
          died: exits.every((reason) => reason === null || reason === held),
          after: reasonOf(yield* Effect.exit(process({}, () => Effect.void))),
        }
      }), { most: 1, made: true, died: true, after: null })
  }, 60_000)

  test('two runtimes on one client at once: the second dies', () =>
    database(process({}, () =>
      Effect.gen(function*() {
        expect(reasonOf(yield* Effect.exit(process({}, () => Effect.void)))).toBe(held)
      }))))
})

// What the runtime tells a probe is the tests' seam, and no part of the public surface (decisions 0055, 0073).
test('a probe and its points are no part of what a user imports', () => {
  for (const entry of [Library, ProgramEntry, TestingEntry, ClusterEntry]) {
    expect(Object.keys(entry).filter((name) => ['Probe', 'Point', 'Said'].includes(name))).toEqual([])
  }
  // @ts-expect-error `Point` is the runtime's, for its tests
  const point: Library.Point | null = null
  // @ts-expect-error `Said` too
  const said: Library.Said | null = null
  expect([point, said]).toEqual([null, null])
})

// `sharding` alone provides `Recorded`, so that a `Sharding` built without it does not launch (decision 0174): the
// entry on Cluster names it as a type, and gives no value a launcher could build one with (decision 0193).
test('a launcher names `Recorded` as a type, and builds none', () => {
  expect(Object.keys(ClusterEntry)).not.toContain('Recorded')
  const recorded: ClusterEntry.Recorded | null = null
  expect(recorded).toBeNull()
})

test('the library reads the time and sleeps through Effect alone, which a test moves', () => {
  // A clock or a timer of the platform would not move with the test clock, nor with a wall clock run ahead of the
  // sleeps (decisions 0066, 0103): what it read or waited for would be the real time's.
  const platform = new RegExp(
    [/\bDate\.now\b/, /\bnew Date\b/, /\bDate\(/, /\bperformance\.now\b/, /\bprocess\.hrtime\b/, /\bset(Timeout|Interval|Immediate)\b/]
      .map((pattern) => pattern.source)
      .join('|'),
  )
  // Every module of `src/` and of its folders, where the runtime's modules lie, and no file of the tests, which is
  // named `.test.ts` or `.test_<role>.ts` (decision 0241).
  const sources = readdirSync(import.meta.dir, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.ts') && !/\.test(_\w+)?\.ts$/.test(file))
  expect(sources).toContain(join('runtime', 'loop.ts'))
  const found = sources.flatMap((file) =>
    readFileSync(join(import.meta.dir, file), 'utf8')
      .split('\n')
      .flatMap((line, n) => platform.test(line) ? [`${file}:${n + 1}: ${line.trim()}`] : [])
  )
  expect(found).toEqual([])
})

test('a process runs to its end under the scheduler of the tests, which needs nothing of the platform', () => {
  // Decision 0104: the controlled scheduler steps a run by hand and synchronously, so a run that ends there needed
  // no timer and no microtask. The SQLite client is synchronous, and time is the test clock's.
  const scenario = Effect.scoped(Effect.flatMap(createTables, () =>
    Effect.gen(function*() {
      const { layer } = yield* hands()
      const { entities, unloaded } = unloads()
      const at = yield* DateTime.now
      return yield* process({ unloaded, passivate: { millis: 5 } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: { _tag: 'Tester' } })
          yield* runtime.settled
          yield* TestClock.adjust('5 millis')
          yield* TestClock.adjust('60 millis')
          yield* runtime.settled
          return { read: yield* toy.read(id), unloaded: [...entities] }
        }))
    }))).pipe(
      Effect.provide(SqliteClient.layer({ filename: ':memory:' })),
      Effect.provide(TestClock.layer()),
      Effect.orDie,
    )
  const ended = { read: 0, unloaded: [id, id] }
  const run = scheduled(scenario, inOrder)
  expect(run.exit !== undefined && Exit.isSuccess(run.exit) ? run.exit.value : run.exit).toEqual(ended)
  expect(run.left).toBe(0)
  // And a run of the process is the same each time, given the same decisions: nothing Effect or the library
  // computes once for the process, as a cache, changes the steps of a later run.
  for (const recorded of [run, scheduled(scenario, prioritized(1, 3, run.schedule.preemptions.length))]) {
    const again = replayedSchedule(scenario, recorded.schedule)
    expect({ schedule: again.schedule, steps: again.steps }).toEqual({
      schedule: recorded.schedule,
      steps: recorded.steps,
    })
    expect(again.exit !== undefined && Exit.isSuccess(again.exit) ? again.exit.value : again.exit).toEqual(ended)
  }
})

describe('renaming a program (decision 0156)', () => {
  const reasonOf = (exit: Exit.Exit<unknown>) => {
    const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
    return cause instanceof InvariantDefect ? cause.reason : null
  }
  const renamedProgram: Program<T> = { ...program, name: 'Plaything' }
  const want = { _tag: 'Want', key: 'a', on: true, nonce: 'w1' } as const

  test("a launch moves the entities of the old name, which keep their work's keys and their callers' replies", () =>
    onBoth(Effect.gen(function*() {
      const at = yield* DateTime.now
      // The idempotent operation acts and never comes back: it is under way when the process ends.
      const first = yield* hands({ holds: true })
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), first.layer)
          yield* ran(toy.create(id, { flags: { at }, requestId: 'creation', sender: tester }))
          expect(yield* ran(toy.send(id, want, { requestId: 'w1', sender: tester, keep: 'forever' }))).toEqual({ _tag: 'Accepted' })
        }))
      const keyed = first.acted.filter((act) => act.startsWith('a:'))
      expect(keyed).toEqual([`a:${JSON.stringify(['Toy', id, 'a', 1])}`])
      const second = yield* hands()
      yield* process({ renames: { Toy: 'Plaything' } }, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(renamedProgram), second.layer)
          yield* runtime.settled
          // The caller's retry gets the reply stored under the old name, and the message is not applied again.
          expect(yield* toy.send(id, want, { requestId: 'w1', sender: tester, keep: 'forever' })).toEqual({ _tag: 'Accepted' })
          expect(yield* toy.create(id, { flags: { at }, requestId: 'creation', sender: tester })).toEqual({ _tag: 'Created' })
          yield* runtime.settled
          // The old program, deployed beside, would create entities under the name the launch left.
          expect(reasonOf(yield* Effect.exit(Effect.provide(runtime.deploy(program), second.layer)))).toBe(
            "the program 'Toy' is deployed, and the launch renames it to 'Plaything'",
          )
        }))
      // The operation under way runs again under the key it was given before the rename.
      expect(second.acted.filter((act) => act.startsWith('a:'))).toEqual(keyed)
      const sql = yield* SqlClient.SqlClient
      const stored = yield* storage(renamedProgram, sql).load(id)
      expect(stored?.state.applied).toEqual(['w1'])
      expect(yield* storage(program, sql).load(id)).toBeNull()
      // A launch that renames again finds nothing under the old name, and moves nothing.
      yield* process({ renames: { Toy: 'Plaything' } }, () => Effect.void)
      expect((yield* storage(renamedProgram, sql).load(id))?.keyedAs).toBe('Toy')
    })))

  test('renames that cannot run as written are refused before the database is held', () =>
    database(Effect.gen(function*() {
      const refused = [
        [{ Toy: '' }, "the launch renames 'Toy' to '', and a name is a string that is not empty"],
        [{ Toy: 'Toy' }, "the launch renames 'Toy' to itself"],
        [{ Toy: 'Game', Game: 'Plaything' }, "the launch renames 'Toy' to 'Game', which it renames too"],
        // A name is stored as text, which a database holds as it is (decision 0157).
        [{ Toy: 'Toy\ud800' }, 'the launch renames "Toy" to "Toy\\ud800", and a name is text a database holds'],
      ] as const
      for (const [renames, reason] of refused) {
        expect(reasonOf(yield* Effect.exit(process({ renames }, () => Effect.void)))).toBe(reason)
      }
      // None of them held the database: a launch after them holds it.
      yield* process({}, () => Effect.void)
      // Two names renamed to one are not refused: the storage refuses only a move onto a name that holds an entity
      // already (decision 0176).
      yield* process({ renames: { Toy: 'Plaything', Game: 'Plaything' } }, () => Effect.void)
    })))
})

describe('a launch that dies holds nothing in the scope its launcher gave (decision 0264)', () => {
  const reasonOf = (exit: Exit.Exit<unknown>) => {
    const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
    return cause instanceof InvariantDefect ? cause.reason : null
  }
  const renamedProgram: Program<T> = { ...program, name: 'Plaything' }
  /** The launch `given` dies with `reason`, and a launch of `next` in the same scope runs. */
  const diesThenLaunches = (given: Options, reason: string, next: Options = {}) =>
    Effect.scoped(Effect.gen(function*() {
      expect(reasonOf(yield* Effect.exit(launch({ sweep: 'none', ...given })))).toBe(reason)
      const again = yield* Effect.exit(launch({ sweep: 'none', ...next }))
      expect(Exit.isSuccess(again) ? 'launched' : reasonOf(again)).toBe('launched')
    }))

  // Every option is checked before the hold, so a launch refused for one moves no rename either.
  test('a launch refused for an option holds nothing and moves no rename', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const toy = yield* Effect.provide(runtime.deploy(program), (yield* hands()).layer)
          yield* ran(toy.create(id, { flags: { at }, requestId: 'creation', sender: tester }))
        }))
      const sql = yield* SqlClient.SqlClient
      const refused = [
        [{ callers: { messages: 0 } }, "the callers' messages are 0, which is no positive integer"],
        [{ drain: { millis: -1 } }, 'the drain is -1 millis, which is no non-negative integer'],
        [{ retry: { millis: NaN } }, 'the retry is NaN millis, which is no positive integer'],
        [{ passivate: { millis: 0 } }, 'the passivation is 0 millis, which is no positive integer'],
        [{ warn: { characters: -1 } }, 'the warning is -1 characters, which is no non-negative integer'],
        [{ sweep: { millis: 0 } }, `the sweep is {"millis":0}, which is neither 'none' nor a positive integer of millis`],
        [{ capacity: { entities: 0 } }, 'the capacity is 0, which is no positive integer'],
      ] as const
      for (const [option, reason] of refused) {
        yield* diesThenLaunches({ ...option, renames: { Toy: 'Plaything' } } as Options, reason)
        expect(yield* storage(program, sql).load(id)).not.toBeNull()
      }
    })))

  // A file another client has open refuses the hold after this client is claimed, and on PostgreSQL a lock another
  // session holds refuses it after a connection is reserved: both are given back with the launch's scope.
  test('a launch refused by a file another client has open gives the file back', () => {
    const directory = mkdtempSync(join(tmpdir(), 'effect-tea-persistent-'))
    const filename = join(directory, 'store.db')
    const client = (scope: Scope.Scope) =>
      Effect.map(
        Scope.provide(Layer.build(SqliteClient.layer({ filename, busyTimeout: 0 })), scope),
        (context) => Context.get(context, SqlClient.SqlClient),
      )
    const on = (sql: SqlClient.SqlClient) => <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.provideService(effect, SqlClient.SqlClient, sql)
    return Effect.runPromise(Effect.scoped(Effect.gen(function*() {
      const firstScope = yield* Scope.make()
      const first = yield* client(firstScope)
      yield* on(first)(createTables)
      const second = yield* client(yield* Effect.scope)
      yield* Effect.scoped(Effect.gen(function*() {
        expect(reasonOf(yield* Effect.exit(on(second)(launch({ sweep: 'none' })))))
          .toBe('the database is held by another runtime, or open to another connection')
        yield* Scope.close(firstScope, Exit.void)
        const again = yield* Effect.exit(on(second)(launch({ sweep: 'none' })))
        expect(Exit.isSuccess(again) ? 'launched' : reasonOf(again)).toBe('launched')
      }))
    })).pipe(Effect.provide(TestClock.layer()))).finally(() => rmSync(directory, { recursive: true, force: true }))
  })

  test('a launch that dies for the partitions stored gives the database back', () =>
    database(Effect.gen(function*() {
      yield* process({ log: { partitions: 12 } }, () => Effect.void)
      yield* diesThenLaunches({}, 'the log has 12 partitions, and the runtime is launched with 300', {
        log: { partitions: 12 },
      })
    })))

  test('a launch that dies for a rename onto a name that holds an entity gives the database back', () =>
    database(Effect.gen(function*() {
      const at = yield* DateTime.now
      yield* process({}, (runtime) =>
        Effect.gen(function*() {
          const { layer } = yield* hands()
          const toy = yield* Effect.provide(runtime.deploy(program), layer)
          const plaything = yield* Effect.provide(runtime.deploy(renamedProgram), layer)
          yield* ran(toy.create(id, { flags: { at }, requestId: 'creation', sender: tester }))
          yield* ran(plaything.create(id, { flags: { at }, requestId: 'creation', sender: tester }))
        }))
      yield* diesThenLaunches(
        { renames: { Toy: 'Plaything' } },
        "the launch renames 'Toy' to 'Plaything', which holds an entity, a head of the log or a consumer already",
      )
    })))
})
