/**
 * The storage writes what the machine says an event writes, and decides nothing but what only it sees: another
 * entity's keys (decision 0057). Here it is given rows by hand, and what it holds afterwards is read back.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { describe, expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import * as Exit from 'effect/Exit'
import * as Hash from 'effect/Hash'
import * as Schema from 'effect/Schema'
import { SqlClient, Statement } from 'effect/sql'
import * as Machine from './machine.ts'
import { InvariantDefect, isTimer, type Json, type Migration, noWork, operation, type Program, type Scalar } from './program.ts'
import {
  batch,
  type Comparison,
  createTables,
  type Criterion,
  type Dialect,
  dialectOf,
  type Found,
  outranked,
  partitionOf,
  type Query,
  recordVersions,
  renamed,
  standingOf,
  storage,
  tablesMade,
} from './storage.ts'
import { client, onEach } from './storage.test_databases.ts'
import fc from 'fast-check'
import { everySchedule } from './testing.ts'

type T = {
  state: Readonly<{ last: string }>
  flags: null
  inbound: string
  internal: string
  operation: Readonly<{ _tag: 'Ask' }>
  key: 'ask'
  parameter: {}
  rejection: never
  sender: null
  projection: string
  index: never
  services: never
}

const named = (name: string): Program<T> => ({
  name,
  keys: { ask: null },
  schemas: {
    state: Schema.Struct({ last: Schema.String }),
    flags: Schema.Null,
    inbound: Schema.String,
    internal: Schema.String,
    operation: Schema.TaggedStruct('Ask', {}),
    rejection: Schema.Never,
    sender: Schema.Null,
    projection: Schema.String,
  },
  init: () => ({ last: 'start' }),
  update: (message) => () => ({ last: message }),
  work: () => noWork,
  operations: { Ask: operation(() => Effect.succeed('asked')) },
  project: ({ last }) => last,
  indexes: {},
})

const asker = named('Asker')
const receiver = named('Receiver')

/** What an event that writes nothing but `rows` gives the storage. */
const written = (rows: Partial<Machine.Written>): Machine.Written => ({
  created: false,
  entity: null,
  suspension: null,
  keys: [],
  gone: [],
  incarnations: 0,
  handled: 0,
  queued: [],
  replies: [],
  ended: [],
  waits: [],
  woken: false,
  shown: null,
  published: null,
  ...rows,
})

/** The first rows of an entity, as a creation writes them. */
const created = (rows: Partial<Machine.Written> = {}): Machine.Written =>
  written({
    created: true,
    entity: { state: { last: 'start' }, creation, flags: null },
    shown: { projection: 'start', indexes: {} },
    ...rows,
  })

/** A caller's request that created the entity, as the machine encodes it. */
const creation = { _tag: 'Caller', sender: null, id: 'creation' } as const
/** A limit no reading of these tests reaches: a reading says how many rows it takes (decision 0141). */
const all = 1_000

/** The request named `name` of the asker's work in `incarnation`, as the machine keys its reply (decision 0059). */
const asked = (name: string, incarnation: number) =>
  ({ _tag: 'Operation', entity: { name: 'Asker', id: 'a' }, key: { name: 'ask' }, incarnation, name }) as const

const sent = (name: string, incarnation: number) => Machine.requestKey(receiver, asked(name, incarnation))

const reply = (name: string, incarnation: number): Machine.ReplyRow => ({
  request: sent(name, incarnation),
  carried: null,
  tag: 'Accepted',
  reason: null,
  asked: { name: 'Asker', id: 'a', key: { name: 'ask' }, incarnation },
  until: null,
})

const inbound = (message: string): Machine.EnvelopeRow => ({
  _tag: 'Inbound',
  message,
  request: { _tag: 'Caller', sender: null, id: message },
  keep: null,
})

/**
 * Runs `body` on a database of each of `dialects` whose tables are created, one after the other. A failure names the
 * dialect it failed on. The storage speaks both dialects, so a test runs on both unless it reads what only one
 * writes (decision 0157).
 */
const database = <A>(
  body: (sql: SqlClient.SqlClient) => Effect.Effect<A>,
  dialects: ReadonlyArray<Dialect> = ['sqlite', 'pg'],
) =>
  onEach(dialects, (dialect) =>
    Effect.runPromise(
      Effect.flatMap(createTables, () => Effect.flatMap(SqlClient.SqlClient, body)).pipe(
        Effect.provide(client(dialect)),
        Effect.orDie,
      ),
    ))

test('a reply asked by work that no longer holds goes as it is stored, and one whose work holds is kept', () =>
  database((sql) =>
    Effect.gen(function*() {
      // The asker holds its work in its first incarnation: the second one has ended.
      const work = { _tag: 'Operation', operation: { _tag: 'Ask' } }
      yield* storage(asker, sql).write(
        'a',
        created({ keys: [{ key: { name: 'ask' }, incarnation: 1, work, delivery: 'Idempotent', due: null }] }),
        0,
      )
      const store = storage(receiver, sql)
      yield* store.write('r', created({ replies: [reply('held', 1), reply('ended', 2)] }), 0)
      expect((yield* store.reply('r', asked('held', 1), 0))?.reply ?? null).toEqual({ _tag: 'Accepted' })
      expect((yield* store.reply('r', asked('ended', 2), 0))?.reply ?? null).toBeNull()
    })))

// An answer no entity stores is kept by the rule of a reply: it goes as it is kept where the work that asked has
// ended, and a creation's answer and a message's under one name keep a row each (decision 0253).
test('an answer kept for work that no longer holds goes as it is kept, and a creation’s and a message’s are apart', () =>
  database((sql) =>
    Effect.gen(function*() {
      // The asker holds its work in its first incarnation: the second one has ended.
      const work = { _tag: 'Operation', operation: { _tag: 'Ask' } }
      yield* storage(asker, sql).write(
        'a',
        created({ keys: [{ key: { name: 'ask' }, incarnation: 1, work, delivery: 'Idempotent', due: null }] }),
        0,
      )
      const store = storage(receiver, sql)
      yield* store.keepAnswer('r', 'Message', asked('held', 1), { _tag: 'NotFound' })
      yield* store.keepAnswer('r', 'Create', asked('held', 1), { _tag: 'Rejected', reason: null })
      yield* store.keepAnswer('r', 'Message', asked('ended', 2), { _tag: 'NotFound' })
      expect(yield* store.answer('r', 'Message', asked('held', 1))).toEqual({ _tag: 'NotFound' })
      expect(yield* store.answer('r', 'Create', asked('held', 1))).toEqual({ _tag: 'Rejected', reason: null })
      expect(yield* store.answer('r', 'Message', asked('ended', 2))).toBeNull()
    })))

// A key without a parameter has none, which no parameter's JSON is: its row and its parameter's never meet
// (decision 0136).
test('a key is stored as its name and its parameter, apart from a key of the same name without one', () =>
  database((sql) =>
    Effect.gen(function*() {
      const work = { _tag: 'Operation', operation: { _tag: 'Ask' } }
      const row = (key: Machine.KeyRow['key'], incarnation: number): Machine.KeyRow =>
        ({ key, incarnation, work, delivery: 'Idempotent', due: null })
      const plain = { name: 'ask' }
      const empty = { name: 'ask', parameter: '' }
      const nothing = { name: 'ask', parameter: null }
      const record = { name: 'ask', parameter: { a: 1, b: [2] } }
      const suspension = { on: { _tag: 'Operation', key: record, incarnation: 4 }, cause: 'died' } as const
      const store = storage(asker, sql)
      yield* store.write('a', created({
        keys: [row(plain, 1), row(empty, 2), row(nothing, 3), row(record, 4)],
        queued: [{ _tag: 'Internal', message: 'done', key: empty, incarnation: 2 }],
        incarnations: 4,
        suspension,
      }), 0)
      const loaded = yield* store.load('a')
      expect(Object.values(loaded?.keys ?? {}).map(({ key, incarnation }) => ({ key, incarnation }))).toEqual([
        { key: plain, incarnation: 1 },
        { key: empty, incarnation: 2 },
        { key: nothing, incarnation: 3 },
        { key: record, incarnation: 4 },
      ])
      expect(loaded?.mailbox).toEqual([{ _tag: 'Internal', message: 'done', key: empty, incarnation: 2 }])
      expect(loaded?.suspension?.on).toEqual(suspension.on)
      // A reply kept for the work under one of them goes with that work alone.
      const receiving = storage(receiver, sql)
      const asking = (key: Machine.KeyRow['key'], incarnation: number) =>
        ({ _tag: 'Operation', entity: { name: 'Asker', id: 'a' }, key, incarnation, name: 'n' }) as const
      const kept = (key: Machine.KeyRow['key'], incarnation: number): Machine.ReplyRow => ({
        request: Machine.requestKey(receiver, asking(key, incarnation)),
        carried: null,
        tag: 'Accepted',
        reason: null,
        asked: { name: 'Asker', id: 'a', key, incarnation },
        until: null,
      })
      yield* receiving.write('r', created({ replies: [kept(plain, 1), kept(empty, 2), kept(record, 4)] }), 0)
      yield* store.write('a', written({ gone: [empty], incarnations: 4, ended: [{ key: empty, incarnation: 2 }] }), 0)
      expect((yield* receiving.reply('r', asking(plain, 1), 0))?.reply ?? null).toEqual({ _tag: 'Accepted' })
      expect((yield* receiving.reply('r', asking(empty, 2), 0))?.reply ?? null).toBeNull()
      expect((yield* receiving.reply('r', asking(record, 4), 0))?.reply ?? null).toEqual({ _tag: 'Accepted' })
      const after = yield* store.load('a')
      expect(Object.values(after?.keys ?? {}).map(({ key }) => key)).toEqual([plain, nothing, record])
    })))

test('an operation given the digest of its idempotency key is loaded as delivered so (decision 0123)', () =>
  database((sql) =>
    Effect.gen(function*() {
      const work = { _tag: 'Operation', operation: { _tag: 'Ask' } }
      const store = storage(asker, sql)
      yield* store.write(
        'a',
        created({ keys: [{ key: { name: 'ask' }, incarnation: 1, work, delivery: 'IdempotentDigest', due: null }] }),
        0,
      )
      expect((yield* store.load('a'))?.keys[Machine.keyText({ name: 'ask' })]?.delivery).toBe('IdempotentDigest')
    })))

test('the work that ended takes the replies to its requests with it, and no others', () =>
  database((sql) =>
    Effect.gen(function*() {
      const work = { _tag: 'Operation', operation: { _tag: 'Ask' } }
      yield* storage(asker, sql).write(
        'a',
        created({ keys: [{ key: { name: 'ask' }, incarnation: 1, work, delivery: 'Idempotent', due: null }], incarnations: 1 }),
        0,
      )
      const store = storage(receiver, sql)
      yield* store.write('r', created({ replies: [reply('first', 1)] }), 0)
      yield* store.write('s', created({ replies: [reply('other', 1)] }), 0)
      // Work of another incarnation asked nothing that is stored.
      yield* storage(asker, sql).write('a', written({ ended: [{ key: { name: 'ask' }, incarnation: 2 }] }), 0)
      expect((yield* store.reply('r', asked('first', 1), 0))?.reply ?? null).toEqual({ _tag: 'Accepted' })
      yield* storage(asker, sql).write(
        'a',
        written({ gone: [{ name: 'ask' }], incarnations: 1, ended: [{ key: { name: 'ask' }, incarnation: 1 }] }),
        0,
      )
      expect((yield* store.reply('r', asked('first', 1), 0))?.reply ?? null).toBeNull()
      expect((yield* store.reply('s', asked('other', 1), 0))?.reply ?? null).toBeNull()
      // A key whose work is gone has no row, and the entity keeps the last incarnation it drew (decision 0132).
      const loaded = yield* storage(asker, sql).load('a')
      expect(loaded?.keys).toEqual({})
      expect(loaded?.incarnations).toBe(1)
    })))

// On Cluster, Cluster's tables sit beside the runtime's. Here they are made with the one column the runtime reads,
// as Cluster makes it on SQLite.
test('on Cluster, an id kept under work goes with it, and a pending one with the next step, to its last digit', () =>
  database((sql) =>
    Effect.gen(function*() {
      yield* sql`CREATE TABLE cluster_messages (request_id BIGINT NOT NULL)`
      yield* sql`CREATE TABLE cluster_replies (request_id BIGINT NOT NULL)`
      const work = { _tag: 'Operation', operation: { _tag: 'Ask' } }
      const asking = storage(asker, sql, undefined, true)
      yield* asking.write(
        'a',
        created({ keys: [{ key: { name: 'ask' }, incarnation: 1, work, delivery: 'Idempotent', due: null }], incarnations: 1 }),
        0,
      )
      // Ids past 2^53, which differ in their last digit alone.
      const [held, late, told] = ['9007199254740993', '9007199254740995', '9007199254740997']
      for (const id of [held, late, told]) {
        yield* sql`INSERT INTO cluster_messages (request_id) VALUES (${id})`
        yield* sql`INSERT INTO cluster_replies (request_id) VALUES (${id})`
      }
      const ids = (table: string) =>
        Effect.map(
          sql<{ id: string }>`SELECT CAST(request_id AS TEXT) AS id FROM ${sql(table)} ORDER BY request_id`,
          (rows) => rows.map(({ id }) => id),
        )
      const ask = { entity: { name: 'Asker', id: 'a' }, key: { name: 'ask' }, incarnation: 1 }
      expect(yield* asking.keepSent(held, ask)).toBe(true)
      expect(yield* asking.keepSent(held, ask)).toBe(true)
      // The work of the second incarnation no longer holds: its request was answered after its work ended.
      expect(yield* asking.keepSent(late, { ...ask, incarnation: 2 })).toBe(false)
      yield* asking.pendSent(told)
      yield* asking.forgetPending
      expect(yield* ids('cluster_messages')).toEqual([held])
      expect(yield* ids('cluster_replies')).toEqual([held])
      yield* asking.write(
        'a',
        written({ gone: [{ name: 'ask' }], incarnations: 1, ended: [{ key: { name: 'ask' }, incarnation: 1 }] }),
        0,
      )
      expect(yield* ids('cluster_messages')).toEqual([])
      expect(yield* ids('cluster_replies')).toEqual([])
      expect(yield* ids('effecttea_sent_requests')).toEqual([])
    }).pipe(Effect.orDie), ['sqlite']))

// A request is found by its text, and a caller's by its sender as a version before stored it (decision 0065).
test('a reply is read by its request alone, and a caller is given its own', () =>
  database((sql) =>
    Effect.gen(function*() {
      const store = storage(receiver, sql)
      const caller = (id: string) => ({ _tag: 'Caller', sender: null, id }) as const
      const accepted = (id: string): Machine.ReplyRow => ({
        request: Machine.requestKey(receiver, caller(id)),
        carried: null,
        tag: 'Accepted',
        reason: null,
        asked: null,
        until: null,
      })
      yield* store.write('r', created({ replies: [accepted('one')] }), 0)
      expect((yield* store.reply('r', caller('one'), 0))?.reply ?? null).toEqual({ _tag: 'Accepted' })
      expect((yield* store.reply('r', caller('two'), 0))?.reply ?? null).toBeNull()
      expect((yield* store.reply('s', caller('one'), 0))?.reply ?? null).toBeNull()
      // An operation's request named as the caller's request id is another request.
      expect((yield* store.reply('r', asked('one', 1), 0))?.reply ?? null).toBeNull()
    })))

describe('how long a caller’s reply is kept (decision 0125)', () => {
  const caller = (id: string) => ({ _tag: 'Caller', sender: null, id }) as const
  const until = (id: string, time: number | null): Machine.ReplyRow => ({
    request: Machine.requestKey(receiver, caller(id)),
    carried: null,
    tag: 'Accepted',
    reason: null,
    asked: null,
    until: time,
  })

  test('a reply is read before its time only, whether its row is deleted yet or not', () =>
    database((sql) =>
      Effect.gen(function*() {
        const store = storage(receiver, sql)
        yield* store.write('r', created({ replies: [until('kept', 500), until('forever', null)] }), 0)
        expect((yield* store.reply('r', caller('kept'), 499))?.reply ?? null).toEqual({ _tag: 'Accepted' })
        expect((yield* store.reply('r', caller('kept'), 500))?.reply ?? null).toBeNull()
        expect((yield* store.reply('r', caller('forever'), Number.MAX_SAFE_INTEGER))?.reply ?? null).toEqual({ _tag: 'Accepted' })
      })))

  test('a reply a version before stored is read before its time only, as one this version stored', () =>
    database((sql) =>
      Effect.gen(function*() {
        type Named = Omit<T, 'sender'> & { sender: string }
        const callers = (migrations: ReadonlyArray<Migration>): Program<Named> => ({
          ...receiver,
          schemas: { ...receiver.schemas, sender: Schema.String },
          update: (message) => () => ({ last: message }),
          migrations,
        })
        const first = callers([])
        const by = (sender: string) => ({ _tag: 'Caller', sender, id: 'r' }) as const
        yield* storage(first, sql).write('r', created({
          replies: [{ request: Machine.requestKey(first, by('a')), carried: null, tag: 'Accepted', reason: null, asked: null, until: 500 }],
        }), 0)
        // Version 2 renames the sender 'a' to 'b', so its retry is found by its request id (decision 0065).
        const after = storage(callers([{ sender: (json) => json === 'a' ? 'b' : json }]), sql)
        expect((yield* after.reply('r', by('b'), 499))?.reply ?? null).toEqual({ _tag: 'Accepted' })
        expect((yield* after.reply('r', by('b'), 500))?.reply ?? null).toBeNull()
      })))

  test('a step that stores a reply deletes the replies of its entity past their time, and no others', () =>
    database((sql) =>
      Effect.gen(function*() {
        const store = storage(receiver, sql)
        yield* store.write('r', created({ replies: [until('gone', 500), until('kept', 900)] }), 0)
        yield* store.write('s', created({ replies: [until('other', 500)] }), 0)
        // A step that stores no reply deletes nothing.
        yield* store.write('r', written({ shown: { projection: 'start', indexes: {} } }), 600)
        const left = () => sql<{ id: string; request: string }>`SELECT id, request FROM effecttea_replies ORDER BY id, request`
        expect((yield* left()).length).toBe(3)
        yield* store.write('r', written({ replies: [until('new', 1_600)] }), 600)
        expect((yield* left()).map(({ id, request }) => [id, JSON.parse(request).id])).toEqual([
          ['r', 'kept'],
          ['r', 'new'],
          ['s', 'other'],
        ])
      }).pipe(Effect.orDie)))

  test('expire deletes the replies of the program past their time, counts them, and leaves the rest', () =>
    database((sql) =>
      Effect.gen(function*() {
        const store = storage(receiver, sql)
        yield* store.write('r', created({ replies: [until('gone', 500), until('kept', 900), until('ever', null)] }), 0)
        yield* store.write('s', created({ replies: [until('gone', 500)] }), 0)
        yield* storage(asker, sql).write('a', created({ replies: [until('gone', 500)] }), 0)
        expect(yield* store.expire(600)).toBe(2)
        expect((yield* store.reply('r', caller('kept'), 600))?.reply ?? null).toEqual({ _tag: 'Accepted' })
        expect((yield* store.reply('r', caller('ever'), 600))?.reply ?? null).toEqual({ _tag: 'Accepted' })
        expect(yield* storage(asker, sql).expire(0)).toBe(0)
        expect(yield* storage(asker, sql).expire(600)).toBe(1)
      })))

  // A batch is a transaction of its own, and the count is the sum of the batches (decision 0245).
  test('expire deletes past a batch, counts every row, and on Cluster takes the ids of every batch', () =>
    database((sql) =>
      Effect.gen(function*() {
        yield* sql`CREATE TABLE cluster_messages (request_id BIGINT NOT NULL)`
        yield* sql`CREATE TABLE cluster_replies (request_id BIGINT NOT NULL)`
        const store = storage(receiver, sql, undefined, true)
        const many = Array.from({ length: 2 * batch + 1 }, (_, i) => until(`gone ${i}`, 500))
        yield* store.write('r', created({ replies: [...many, until('kept', 900)] }), 0)
        for (let i = 0; i < 2 * batch + 1; i++) {
          const id = String(9_007_199_254_740_993 + 2 * i)
          yield* sql`INSERT INTO cluster_messages (request_id) VALUES (${id})`
          yield* sql`INSERT INTO cluster_replies (request_id) VALUES (${id})`
          yield* store.keepGiven(id, 'r', 500)
        }
        yield* store.keepGiven('1', 'r', 900)
        expect(yield* store.expire(600)).toBe(2 * batch + 1)
        expect((yield* store.reply('r', caller('kept'), 600))?.reply ?? null).toEqual({ _tag: 'Accepted' })
        const left = (table: string) =>
          Effect.map(sql<{ count: number }>`SELECT count(*) AS count FROM ${sql(table)}`, (rows) => Number(rows[0]?.count))
        expect(yield* left('effecttea_replies')).toBe(1)
        expect(yield* left('effecttea_given_requests')).toBe(1)
        expect(yield* left('cluster_messages')).toBe(0)
        expect(yield* left('cluster_replies')).toBe(0)
        expect(yield* store.expire(600)).toBe(0)
      }).pipe(Effect.orDie), ['sqlite']))

  test('a message in the mailbox is loaded with the keep it was queued with', () =>
    database((sql) =>
      Effect.gen(function*() {
        const store = storage(receiver, sql)
        const kept: Machine.EnvelopeRow = { _tag: 'Inbound', message: 'kept', request: caller('kept'), keep: 500 }
        yield* store.write('r', created({ queued: [kept, inbound('forever')] }), 0)
        const mailbox = (yield* store.load('r'))?.mailbox ?? []
        expect(mailbox.map((envelope) => envelope._tag === 'Inbound' ? envelope.keep : null))
          .toEqual([500, undefined])
      })))
})

// A process starts what holds an operation or a message, unless an operator has to resume it first (decisions
// 0006, 0029, 0071).
test('a process starts the entities holding an operation or a message, and none of them suspended', () =>
  database((sql) =>
    Effect.gen(function*() {
      const store = storage(receiver, sql)
      const keys = [{
        key: { name: 'ask' },
        incarnation: 1,
        work: { _tag: 'Operation', operation: { _tag: 'Ask' } },
        delivery: 'Idempotent',
        due: null,
      }] as const
      const queued = [inbound('one')]
      const suspension = { on: { _tag: 'Message' }, cause: 'broken' } as const
      yield* store.write('operation', created({ keys }), 0)
      yield* store.write('message', created({ queued }), 0)
      yield* store.write('both', created({ keys, queued }), 0)
      yield* store.write('idle', created(), 0)
      yield* store.write('suspended operation', created({ keys, suspension }), 0)
      yield* store.write('suspended message', created({ queued, suspension }), 0)
      expect(yield* store.interrupted).toEqual(['both', 'message', 'operation'])
    })))

// On Cluster a runner reads the work and the timers of the shards it holds alone, by the partition each entity's row
// stores (decision 0162).
test('the work and the timers of some partitions are read apart from the others', () =>
  database((sql) =>
    Effect.gen(function*() {
      const partitions = 4
      const store = storage(receiver, sql, partitions)
      const operation = [{
        key: { name: 'ask' },
        incarnation: 1,
        work: { _tag: 'Operation', operation: { _tag: 'Ask' } },
        delivery: 'Idempotent',
        due: null,
      }] as const
      const ringing = (due: number) =>
        [{
          key: { name: 'ask' },
          incarnation: 1,
          work: { _tag: 'Timer', at: due, message: 'rang' },
          delivery: null,
          due,
        }] as const
      // Two ids of each of two partitions.
      const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']
      const [one, two] = [...new Set(ids.map((id) => partitionOf(id, partitions)))]
      const of = (partition: number | undefined) => ids.filter((id) => partitionOf(id, partitions) === partition)
      const [busy = '', ready = ''] = of(one)
      const [queued = '', later = ''] = of(two)
      yield* store.write(busy, created({ keys: operation }), 0)
      yield* store.write(ready, created({ keys: ringing(5) }), 0)
      yield* store.write(queued, created({ queued: [inbound('one')] }), 0)
      yield* store.write(later, created({ keys: ringing(50) }), 0)
      expect(yield* store.interruptedIn(one!)).toEqual([busy])
      expect(yield* store.interruptedIn(two!)).toEqual([queued])
      expect(yield* store.due(10, [], [one!])).toEqual({ ready: [ready], next: null, refused: [] })
      expect(yield* store.due(10, [], [two!])).toEqual({ ready: [], next: 50, refused: [] })
      expect(yield* store.due(10, [], [one!, two!])).toEqual({ ready: [ready], next: 50, refused: [] })
      expect(yield* store.due(10, [], [])).toEqual({ ready: [], next: null, refused: [] })
    })))

test('the mailbox keeps the order its messages were queued in, as its head is handled', () =>
  database((sql) =>
    Effect.gen(function*() {
      const store = storage(receiver, sql)
      yield* store.write('r', created({ queued: [inbound('one'), inbound('two')] }), 0)
      yield* store.write('r', written({ handled: 1, queued: [inbound('three')] }), 0)
      yield* store.write('r', written({ queued: [inbound('four')] }), 0)
      yield* store.write('r', written({ handled: 1 }), 0)
      const mailbox = (yield* store.load('r'))?.mailbox ?? []
      expect(mailbox.map((envelope) => envelope.message)).toEqual(['three', 'four'])
    })))

test('the state is written with the request that created the entity, and only when an event changed it', () =>
  database((sql) =>
    Effect.gen(function*() {
      const store = storage(receiver, sql)
      yield* store.write('r', created(), 0)
      yield* store.write('r', written({ suspension: { on: { _tag: 'Message' }, cause: 'broken' } }), 0)
      expect(yield* store.load('r')).toMatchObject({
        state: { last: 'start' },
        suspension: { on: { _tag: 'Message' }, cause: 'broken' },
      })
      yield* store.write('r', written({ entity: { state: { last: 'next' }, creation, flags: null } }), 0)
      expect(yield* store.load('r')).toMatchObject({
        state: { last: 'next' },
        creation,
        suspension: null,
      })
    })))

// A row is read through its table's schema, and nothing is filled in or cast (decision 0062).
test('a row the runtime never writes fails the call that meets it, and is read as nothing else', () =>
  database((sql) =>
    Effect.gen(function*() {
      const store = storage(receiver, sql)
      yield* store.write('r', created({ queued: [inbound('one')] }), 0)
      yield* store.write('r', written({
        published: { kind: 'Inbound', message: 'one', projection: 'one', topics: ['projection'] },
      }), 0)
      const partition = partitionOf('r', 300)
      const caller = { _tag: 'Caller', sender: null, id: 'x' } as const
      /** A consumer that has read the log to a `seq` no cursor holds. */
      const behind = Effect.andThen(
        sql`INSERT INTO effecttea_consumers ${sql.insert({ name: 'Receiver', topic: 'projection', consumer: 'c' })}`,
        sql`INSERT INTO effecttea_cursors ${
          sql.insert({ name: 'Receiver', topic: 'projection', consumer: 'c', partition, seq: -1 })
        }`,
      )
      // Each row is broken by hand in one of the ways a reading used to fill in or cast, and read by what reads it.
      const broken = [
        [sql`UPDATE effecttea_mailbox SET tag = 'Outbound' WHERE name = 'Receiver' AND id = 'r'`, store.load('r')],
        [sql`UPDATE effecttea_mailbox SET request = NULL WHERE name = 'Receiver' AND id = 'r'`, store.load('r')],
        [
          sql`UPDATE effecttea_entities SET suspended_on = '{"_tag":"Message"}' WHERE name = 'Receiver' AND id = 'r'`,
          store.load('r'),
        ],
        [
          sql`INSERT INTO effecttea_replies ${
            sql.insert({
              name: 'Receiver',
              id: 'r',
              request: Machine.requestKey(receiver, caller),
              carried: null,
              tag: 'Maybe',
              version: 1,
              reason: null,
            })
          }`,
          store.reply('r', caller, 0),
        ],
        // The columns that go together: an inbound message has no key, an internal one no request, and only a
        // rejection a reason.
        [
          sql`INSERT INTO effecttea_entity_keys ${
            sql.insert({
              name: 'Receiver',
              id: 'r',
              key: 'ask',
              parameter: '',
              incarnation: 1,
              version: 1,
              work: '{"_tag":"Operation","operation":{"_tag":"Ask"}}',
              delivery: 'Twice',
            })
          }`,
          store.load('r'),
        ],
        [sql`UPDATE effecttea_mailbox SET key = 'ask' WHERE name = 'Receiver' AND id = 'r'`, store.load('r')],
        [
          sql`UPDATE effecttea_mailbox SET tag = 'Outbound', request = NULL, key = 'ask', incarnation = 1
              WHERE name = 'Receiver' AND id = 'r'`,
          store.load('r'),
        ],
        [
          sql`UPDATE effecttea_mailbox SET tag = 'Internal', key = 'ask', incarnation = 1 WHERE name = 'Receiver' AND id = 'r'`,
          store.load('r'),
        ],
        [
          sql`INSERT INTO effecttea_replies ${
            sql.insert({
              name: 'Receiver',
              id: 'r',
              request: Machine.requestKey(receiver, caller),
              carried: null,
              tag: 'Accepted',
              version: 1,
              reason: '"why"',
            })
          }`,
          store.reply('r', caller, 0),
        ],
        // A version from 1, and a count from 0, wherever they are read.
        [sql`UPDATE effecttea_entities SET version = 0 WHERE name = 'Receiver' AND id = 'r'`, store.load('r')],
        [sql`UPDATE effecttea_entities SET version = 0 WHERE name = 'Receiver' AND id = 'r'`, store.reindex],
        [sql`UPDATE effecttea_projections SET version = 0 WHERE name = 'Receiver' AND id = 'r'`, store.query({ limit: all })],
        [
          sql`INSERT INTO effecttea_entity_keys ${
            sql.insert({
              name: 'Receiver',
              id: 'r',
              key: 'ask',
              parameter: '',
              incarnation: -1,
              version: 1,
              work: '{"_tag":"Operation","operation":{"_tag":"Ask"}}',
              delivery: 'Idempotent',
            })
          }`,
          store.load('r'),
        ],
        [sql`UPDATE effecttea_entities SET incarnations = -1 WHERE name = 'Receiver' AND id = 'r'`, store.load('r')],
        [
          sql`UPDATE effecttea_mailbox SET seq = -5 WHERE name = 'Receiver' AND id = 'r'`,
          store.write('r', written({ queued: [inbound('two')] }), 0),
        ],
        [behind, store.fetch('projection', 'c', all)],
        [behind, store.consumers],
        [sql`UPDATE effecttea_heads SET seq = -1 WHERE name = 'Receiver'`, store.published('projection', [], all)],
        // A timer's time is a whole number of milliseconds, read by the waker. A server of PostgreSQL rounds a double
        // given a column of integers, so the time is one no column of integers takes.
        [
          sql`INSERT INTO effecttea_entity_keys ${
            sql.insert({
              name: 'Receiver',
              id: 'r',
              key: 'ask',
              parameter: '',
              incarnation: 1,
              version: 1,
              work: '{"_tag":"Timer","at":1,"message":"rang"}',
              delivery: null,
              due: 'soon',
            })
          }`,
          // The waker's reading gives back the entity whose time it refuses, with the reason, and goes on
          // (decision 0259): the refusal is the call's failure here.
          Effect.flatMap(store.due(0, []), ({ refused }) =>
            refused.length === 1 && refused[0]?.id === 'r'
              ? Effect.die(new Error(refused[0].reason))
              : Effect.succeed(refused)),
        ],
        // A step's publication always handles a message.
        [
          Effect.andThen(
            sql`INSERT INTO effecttea_publications ${
              sql.insert({
                name: 'Receiver',
                partition,
                seq: 2,
                id: 'r',
                tag: 'Inbound',
                version: 1,
                written_at: 0,
                message: null,
                projection: '"one"',
              })
            }`,
            sql`INSERT INTO effecttea_outbox ${sql.insert({ name: 'Receiver', topic: 'projection', partition, seq: 2 })}`,
          ),
          store.published('projection', [], all),
        ],
      ] as const
      for (const [index, [breaking, reading]] of broken.entries()) {
        // Broken and read in a transaction that fails with what the reading gave, so that nothing of it stays.
        const exit = yield* Effect.flip(sql.withTransaction(
          Effect.andThen(breaking, Effect.flatMap(Effect.exit<unknown, never, never>(reading), Effect.fail)),
        ))
        // PostgreSQL refuses by the types of its columns some rows SQLite holds, such as a time that is no number.
        if (!Exit.isExit(exit) && dialectOf(sql) === 'pg') continue
        expect([index, Exit.isExit(exit) && exit._tag]).toEqual([index, 'Failure'])
        if (Exit.isExit(exit) && exit._tag === 'Failure') {
          expect(String(Cause.squash(exit.cause))).toContain('no row the runtime writes')
        }
      }
      expect((yield* store.load('r'))?.mailbox.map((envelope) => envelope.message)).toEqual(['one'])
      // A creation's publication handles no message.
      yield* sql`INSERT INTO effecttea_publications ${
        sql.insert({
          name: 'Receiver',
          partition,
          seq: 2,
          id: 'r',
          tag: 'Creation',
          version: 1,
          written_at: 0,
          message: '"one"',
          projection: '"one"',
        })
      }`
      yield* sql`INSERT INTO effecttea_outbox ${sql.insert({ name: 'Receiver', topic: 'projection', partition, seq: 2 })}`
      expect((yield* Effect.exit(store.published('projection', [], all)))._tag).toBe('Failure')
    }).pipe(Effect.orDie)))

// A row is keyed by its request as the version that wrote it encoded it, and by that version (decision 0069).
test('a caller whose request a migration gives the text of another caller’s row takes nothing of it', () =>
  database((sql) =>
    Effect.gen(function*() {
      type Named = Omit<T, 'sender'> & { sender: string }
      const callers = (migrations: ReadonlyArray<Migration>): Program<Named> => ({
        ...receiver,
        schemas: { ...receiver.schemas, sender: Schema.String },
        update: (message) => () => ({ last: message }),
        migrations,
      })
      const first = callers([])
      // Version 2 renames the sender 'a' to 'b', and gives 'a' to the one that was 'z'.
      const second = callers([{ sender: (json) => json === 'a' ? 'b' : json === 'z' ? 'a' : json }])
      const caller = (sender: string) => ({ _tag: 'Caller', sender, id: 'r' }) as const
      const accepted = (program: Program<Named>, sender: string): Machine.ReplyRow => ({
        request: Machine.requestKey(program, caller(sender)),
        carried: null,
        tag: 'Accepted',
        reason: null,
        asked: null,
        until: null,
      })
      yield* storage(first, sql).write('r', created({ replies: [accepted(first, 'a')] }), 0)
      const after = storage(second, sql)
      // The caller that is 'a' in version 2 has the text of the row of 'a' in version 1, and is not answered by it.
      expect((yield* after.reply('r', caller('a'), 0))?.reply ?? null).toBeNull()
      yield* after.write('r', written({ replies: [accepted(second, 'a')] }), 0)
      expect((yield* after.reply('r', caller('a'), 0))?.reply ?? null).toEqual({ _tag: 'Accepted' })
      // The caller version 1 stored as 'a' is 'b' now, and its retry still finds its own reply.
      expect((yield* after.reply('r', caller('b'), 0))?.reply ?? null).toEqual({ _tag: 'Accepted' })
    })))

// A message costs a reading by the table's key, and a caller's that finds nothing one more, by its request id: each
// by an index, as the storage writes them (decision 0065).
test('a reply is read by the key of its table, and a caller’s again by an index of its request id', () =>
  database((sql) =>
    Effect.gen(function*() {
      const plan = (query: string) =>
        Effect.map(sql.unsafe<{ detail: string }>(`EXPLAIN QUERY PLAN ${query}`), (rows) =>
          rows.map(({ detail }) => detail).join(' '))
      expect(
        yield* plan(`SELECT request, tag, version, reason FROM effecttea_replies
                     WHERE name = 'Receiver' AND id = 'r' AND request = '{}'`),
      ).toContain('USING INDEX sqlite_autoindex_effecttea_replies_1 (name=? AND id=? AND request=?)')
      expect(
        yield* plan(`SELECT request, tag, version, reason FROM effecttea_replies
                     WHERE name = 'Receiver' AND id = 'r' AND request_id = 'x' AND version <> 2`),
      ).toContain('USING INDEX effecttea_replies_by_request_id (name=? AND id=? AND request_id=?)')
    }).pipe(Effect.orDie), ['sqlite']))

// The tables of an application may sit in the runtime's database, so every object the runtime makes is named with
// `effecttea_`, SQLite's own excepted (decision 0218).
test('every table, index, trigger and function the runtime makes is named with effecttea_', () =>
  database((sql) =>
    Effect.gen(function*() {
      yield* storage(ranked, sql).indexed
      yield* storage(receiver, sql).write('r', created(), 0)
      const names = dialectOf(sql) === 'sqlite'
        ? yield* sql<{ name: string }>`
          SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_autoindex_effecttea_%' AND name <> 'sqlite_sequence'
        `
        : yield* sql<{ name: string }>`
          SELECT relname AS name FROM pg_class WHERE relnamespace = current_schema()::regnamespace
          UNION ALL SELECT proname FROM pg_proc WHERE pronamespace = current_schema()::regnamespace
          UNION ALL SELECT tgname FROM pg_trigger WHERE NOT tgisinternal
        `
      expect(names.length).toBeGreaterThan(16)
      expect(names.map(({ name }) => name).filter((name) => !name.startsWith('effecttea_'))).toEqual([])
    }).pipe(Effect.orDie)))

/**
 * Runs `body` in one transaction, so that a setting made with `SET LOCAL` holds for each of its statements: a server
 * runs each statement outside a transaction on any connection of its pool.
 */
const inOneTransaction = <A, E, R>(body: Effect.Effect<A, E, R>) =>
  Effect.flatMap(SqlClient.SqlClient, (sql) => sql.withTransaction(body))

// No statement of the storage names a schema but `current_schema()`, so a client whose search_path names one puts
// every object there (decision 0217).
test('on PostgreSQL every object the runtime makes is in the schema its client’s search_path names', () =>
  Effect.runPromise(
    inOneTransaction(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      yield* sql`CREATE SCHEMA runtime`
      yield* sql`SET LOCAL search_path TO runtime`
      yield* createTables
      yield* storage(ranked, sql).indexed
      yield* storage(receiver, sql).write('r', created(), 0)
      const placed = yield* sql<{ schema: string; name: string }>`
        SELECT nspname AS schema, relname AS name FROM pg_class JOIN pg_namespace ON pg_namespace.oid = relnamespace
        WHERE starts_with(relname, 'effecttea_')
        UNION ALL SELECT nspname, proname FROM pg_proc JOIN pg_namespace ON pg_namespace.oid = pronamespace
        WHERE starts_with(proname, 'effecttea_')
        UNION ALL SELECT nspname, tgname FROM pg_trigger JOIN pg_class ON pg_class.oid = tgrelid
        JOIN pg_namespace ON pg_namespace.oid = relnamespace WHERE NOT tgisinternal
      `
      expect(placed.length).toBeGreaterThan(16)
      expect(placed.filter(({ schema }) => schema !== 'runtime')).toEqual([])
      // The trigger's function finds its tables through the same search_path.
      const row = { name: 'Receiver', partition: 1, seq: 2 }
      yield* sql`INSERT INTO effecttea_publications ${
        sql.insert({
          ...row,
          id: 'r',
          tag: 'Creation',
          version: 1,
          written_at: 0,
          message: '"one"',
          projection: '"one"',
        })
      }`
      yield* sql`INSERT INTO effecttea_outbox ${sql.insert({ ...row, topic: 'projection' })}`
      yield* sql`DELETE FROM effecttea_outbox`
      expect(yield* sql`SELECT seq FROM effecttea_publications`).toEqual([])
    })).pipe(Effect.provide(client('pg')), Effect.orDie),
  ))

/** The objects of PostgreSQL in `schema`: its relations and its functions. */
const objectsIn = (sql: SqlClient.SqlClient, schema: string) =>
  sql<{ name: string }>`
    SELECT relname AS name FROM pg_class JOIN pg_namespace ON pg_namespace.oid = relnamespace WHERE nspname = ${schema}
    UNION ALL SELECT proname FROM pg_proc JOIN pg_namespace ON pg_namespace.oid = pronamespace WHERE nspname = ${schema}
  `

/** The message `effect` dies with, or null where it does not die. */
const diesWith = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.map(Effect.exit(effect), (exit) => {
    const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
    return cause instanceof Error ? cause.message : null
  })

// Unnamed, `effecttea_migrations` was found in `public`, and the schema the search_path names first was given no
// table (decision 0217). Named, a launch made a second set of tables, empty, in that schema. The launch now dies
// before `Migrator` makes its table, and makes nothing in either schema (decision 0263).
test('on PostgreSQL a launch dies where a schema further on the search_path holds the tables, and makes nothing', () =>
  Effect.runPromise(
    inOneTransaction(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      yield* createTables
      const held = (yield* objectsIn(sql, 'public')).length
      yield* sql`CREATE SCHEMA runtime`
      yield* sql`SET LOCAL search_path TO runtime, public`
      expect(yield* diesWith(createTables)).toBe(
        "the tables are in the schema 'public', and the search_path names 'runtime' before it, where a launch would " +
          "make tables of its own: set the role's search_path to the schema that holds the tables, or move the " +
          "tables into 'runtime'",
      )
      expect(yield* objectsIn(sql, 'runtime')).toEqual([])
      expect((yield* objectsIn(sql, 'public')).length).toBe(held)
      // With the search_path set to the schema that holds the tables, the launch runs on them.
      yield* sql`SET LOCAL search_path TO public`
      yield* createTables
    })).pipe(Effect.provide(client('pg')), Effect.orDie),
  ))

// Under the default search_path, a schema of the role's name made after the tables moves `current_schema()` in front
// of `public`. With the history named in `current_schema()`, the launch made new tables there, and the runtime read
// them, empty, with no error: bug 41 of the roadmap (decision 0263).
test('on PostgreSQL a schema of the role’s name made after the tables makes the launch die, with the entities kept', () =>
  Effect.runPromise(
    inOneTransaction(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      yield* sql`SET LOCAL search_path TO "$user", public`
      yield* createTables
      yield* storage(receiver, sql).write('r', created(), 0)
      expect(yield* sql`SELECT current_schema() AS schema`).toEqual([{ schema: 'public' }])
      // An operator, or the application, makes a schema for the role, as `CREATE SCHEMA AUTHORIZATION` names it.
      yield* sql`CREATE SCHEMA AUTHORIZATION CURRENT_USER`
      const role = (yield* sql<{ role: string }>`SELECT current_user AS role`)[0]?.role ?? ''
      expect(yield* diesWith(createTables)).toContain(
        `the tables are in the schema 'public', and the search_path names '${role}' before it`,
      )
      expect(yield* objectsIn(sql, role)).toEqual([])
      yield* sql`SET LOCAL search_path TO public`
      expect((yield* storage(receiver, sql).load('r')) === null).toBe(false)
    })).pipe(Effect.provide(client('pg')), Effect.orDie),
  ))

// `tablesMade` reads the tables a launch would read, so it dies where the launch dies, before it reads the history
// (decisions 0247, 0263).
test('on PostgreSQL tablesMade dies where a schema further on the search_path holds the tables', () =>
  Effect.runPromise(
    inOneTransaction(Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      yield* createTables
      yield* tablesMade
      yield* sql`CREATE SCHEMA runtime`
      yield* sql`SET LOCAL search_path TO runtime, public`
      expect(yield* diesWith(tablesMade)).toContain("the tables are in the schema 'public'")
    })).pipe(Effect.provide(client('pg')), Effect.orDie),
  ))

// Without the prefix, a launch took an application's `versions` for its own and gave it a column, and a rename moved
// the rows of its `consumers` (decision 0198).
test('a launch and a rename leave alone the tables of an application named as the runtime once named its own', () =>
  database((sql) =>
    Effect.gen(function*() {
      yield* sql`CREATE TABLE versions (name TEXT PRIMARY KEY, version INTEGER NOT NULL)`
      yield* sql`CREATE TABLE consumers (name TEXT NOT NULL)`
      yield* sql`CREATE TABLE log (level TEXT NOT NULL, message TEXT NOT NULL)`
      yield* sql`INSERT INTO versions VALUES ('Receiver', 7)`
      yield* sql`INSERT INTO consumers VALUES ('Receiver')`
      yield* sql`INSERT INTO log VALUES ('info', 'started')`
      const columns = (table: string) =>
        dialectOf(sql) === 'sqlite'
          ? sql<{ name: string }>`SELECT name FROM pragma_table_info(${table}) ORDER BY cid`
          : sql<{ name: string }>`
            SELECT column_name AS name FROM information_schema.columns
            WHERE table_schema = current_schema() AND table_name = ${table} ORDER BY ordinal_position
          `
      yield* Effect.provideService(createTables, SqlClient.SqlClient, sql)
      yield* storage(receiver, sql).write('r', created(), 0)
      yield* Effect.provideService(renamed([['Receiver', 'Taker']], true), SqlClient.SqlClient, sql)
      expect(yield* columns('versions')).toEqual([{ name: 'name' }, { name: 'version' }])
      expect(yield* columns('consumers')).toEqual([{ name: 'name' }])
      expect(yield* columns('log')).toEqual([{ name: 'level' }, { name: 'message' }])
      expect(yield* sql`SELECT name, version FROM versions`).toEqual([{ name: 'Receiver', version: 7 }])
      expect(yield* sql`SELECT name FROM consumers`).toEqual([{ name: 'Receiver' }])
      expect(yield* sql`SELECT level, message FROM log`).toEqual([{ level: 'info', message: 'started' }])
    }).pipe(Effect.orDie)))

// With `IF NOT EXISTS`, a launch took a table of the application under one of the runtime's names for its own. The
// migration runs in one transaction, so the objects it made before the clash go with it. `Migrator` makes its own
// table before the transaction, and records nothing in it (decision 0218).
test('a launch on a database that holds a table named as one of the runtime’s dies, and leaves no object of its own', () =>
  onEach(['sqlite', 'pg'], (dialect) =>
    Effect.runPromise(
      Effect.gen(function*() {
        const sql = yield* SqlClient.SqlClient
        yield* sql`CREATE TABLE effecttea_consumers (name TEXT NOT NULL)`
        yield* sql`INSERT INTO effecttea_consumers VALUES ('Receiver')`
        const launched = yield* Effect.exit(createTables)
        expect(Exit.isFailure(launched) ? String(launched.cause) : null).toContain('effecttea_consumers')
        const names = dialect === 'sqlite'
          ? yield* sql<{ name: string }>`SELECT name FROM sqlite_master WHERE name <> 'sqlite_sequence' ORDER BY name`
          : yield* sql<{ name: string }>`
            SELECT relname AS name FROM pg_class WHERE relnamespace = current_schema()::regnamespace
            UNION ALL SELECT proname FROM pg_proc WHERE pronamespace = current_schema()::regnamespace
            UNION ALL SELECT tgname FROM pg_trigger WHERE NOT tgisinternal
            ORDER BY name
          `
        expect(names.map(({ name }) => name).filter((name) => !name.endsWith('_pkey') && !name.endsWith('_seq')))
          .toEqual(['effecttea_consumers', 'effecttea_migrations'])
        expect(yield* sql`SELECT migration_id FROM effecttea_migrations`).toEqual([])
        expect(yield* sql`SELECT name FROM effecttea_consumers`).toEqual([{ name: 'Receiver' }])
      }).pipe(Effect.provide(client(dialect)), Effect.orDie),
    )))

// A table and an index share one namespace on both dialects, so a table of the application under the name of any
// table or index the first migration makes must make the launch die, and not only under `effecttea_consumers`
// (decision 0218).
test('a launch dies on a table of the application under the name of any table or index the runtime makes', () =>
  onEach(['sqlite', 'pg'], async (dialect) => {
    const relations = (sql: SqlClient.SqlClient) =>
      dialect === 'sqlite'
        ? sql<{ name: string }>`
          SELECT name FROM sqlite_master WHERE type IN ('table', 'index') AND name LIKE 'effecttea\\_%' ESCAPE '\\'
          ORDER BY name
        `
        : sql<{ name: string }>`
          SELECT relname AS name FROM pg_class WHERE relnamespace = current_schema()::regnamespace
            AND relkind IN ('r', 'i') AND relname LIKE 'effecttea\\_%' AND relname NOT LIKE '%\\_pkey'
          ORDER BY name
        `
    const made = await Effect.runPromise(
      Effect.gen(function*() {
        const sql = yield* SqlClient.SqlClient
        yield* createTables
        // `effecttea_migrations` is made by `Migrator` before the migration, and is no object of the migration.
        return (yield* relations(sql)).map(({ name }) => name).filter((name) => name !== 'effecttea_migrations')
      }).pipe(Effect.provide(client(dialect)), Effect.orDie),
    )
    expect(made.length).toBeGreaterThan(10)
    // `bun test` tries one name in four, from the first, within its budget, and a release every name (decision 0250).
    for (const name of made.filter((_, at) => Bun.env['SCHEDULES'] === 'all' || at % 4 === 0)) {
      const died = await Effect.runPromise(
        Effect.gen(function*() {
          const sql = yield* SqlClient.SqlClient
          yield* sql.unsafe(`CREATE TABLE "${name}" (x TEXT)`)
          const launched = yield* Effect.exit(createTables)
          return Exit.isFailure(launched)
        }).pipe(Effect.provide(client(dialect)), Effect.orDie),
      )
      expect({ name, died }).toEqual({ name, died: true })
    }
  }), 120_000)

// PostgreSQL compares text by the collation of its column, and the database's own may order by language. Every text
// column the storage makes is `C`, which compares bytes as SQLite's `BINARY` does. PGlite's database is `C` itself,
// so the order of the read model's ids is the same without the collation, and the test reads it off the columns
// (decision 0157).
test('on PostgreSQL every text column the storage makes compares bytes', () =>
  database((sql) =>
    Effect.gen(function*() {
      yield* storage(ranked, sql).indexed
      // `effecttea_migrations` is made by `Migrator`, and nothing of the runtime compares its text (decision 0216).
      const columns = yield* sql<{ table_name: string; column_name: string; collation_name: string | null }>`
        SELECT table_name, column_name, collation_name FROM information_schema.columns
        WHERE table_schema = current_schema() AND data_type = 'text' AND table_name <> 'effecttea_migrations'
      `
      expect(columns.length).toBeGreaterThan(0)
      expect(columns.filter((column) => column.collation_name !== 'C')).toEqual([])
    }).pipe(Effect.orDie), ['pg']))

// PostgreSQL keeps the first 63 bytes of a name. Two indexes whose long names share their first bytes are two
// indexes, each named by the hash of its whole name (decision 0157).
test('on PostgreSQL two long names of indexes that share their first bytes name two indexes', () =>
  database((sql) =>
    Effect.gen(function*() {
      const long = 'a'.repeat(60)
      const program = {
        ...ranked,
        indexes: { [`${long}1`]: ranked.indexes.rank, [`${long}2`]: ranked.indexes.rank },
      } as unknown as Program<Ranked>
      yield* storage(program, sql).indexed
      const indexes = yield* sql<{ indexname: string }>`
        SELECT indexname FROM pg_indexes WHERE schemaname = current_schema() AND indexname LIKE ${`effecttea_projections Ranked %`}
      `
      expect(new Set(indexes.map(({ indexname }) => indexname)).size).toBe(2)
    }).pipe(Effect.orDie), ['pg']))

// PostgreSQL uses an index of an expression only where the statement writes the expression as the index does. The
// test records the statements the storage runs, and reads the plan of each with scans of whole tables turned off: an
// index that serves a page holds its order, so that no plan sorts (decision 0157).
test('on PostgreSQL a page, a count and a caller’s reply by its request id are read by their indexes', () =>
  database((sql) =>
    Effect.gen(function*() {
      const store = storage(ranked, sql)
      yield* store.indexed
      for (const [id, rank] of [['a', 1], ['b', 'x'], ['c', null]] as const) {
        yield* store.write(id, created({ shown: { projection: id, indexes: { rank } } }), 0)
      }
      const plans = <A>(reading: Effect.Effect<A>) =>
        Effect.gen(function*() {
          const ran: Array<readonly [string, ReadonlyArray<unknown>]> = []
          const record: Statement.Transformer = (statement) =>
            Effect.sync(() => {
              ran.push(statement.compile())
              return statement
            })
          yield* Effect.provideService(reading, Statement.CurrentTransformer, record)
          const read: Array<string> = []
          yield* sql.withTransaction(Effect.gen(function*() {
            yield* sql`SET LOCAL enable_seqscan = off`
            for (const [text, params] of ran) {
              if (!text.trimStart().startsWith('SELECT')) continue
              const plan = yield* sql.unsafe<{ 'QUERY PLAN': string }>(`EXPLAIN ${text}`, params)
              read.push(plan.map((line) => line['QUERY PLAN']).join('\n'))
            }
          }))
          return read
        })
      const page = /Index (Only )?Scan (Backward )?using "effecttea_projections Ranked rank by id"/
      const pages = [
        ...yield* plans(store.query({ limit: all, order: { index: 'rank' }, after: { id: 'a', indexes: { rank: 1 } } })),
        ...yield* plans(
          store.query({ limit: all, order: { index: 'rank', descending: true }, after: { id: 'b', indexes: { rank: 'x' } } }),
        ),
        ...yield* plans(store.count({ where: [{ index: 'rank', is: '>', value: 0 }] })),
      ]
      expect(pages.length).toBeGreaterThan(3)
      for (const plan of pages) {
        expect(plan).toMatch(page)
        expect(plan).not.toContain('Sort')
      }
      const replies = yield* plans(storage(receiver, sql).reply('r', { _tag: 'Caller', sender: null, id: 'x' }, 0))
      expect(replies.at(-1)).toContain('effecttea_replies_by_request_id')
    }).pipe(Effect.orDie), ['pg']))

/**
 * Version 2 of the receiver, which marks what it reads of version 1: each kind of value is read through a migration
 * of its own, and a row version 2 wrote is read with no mark.
 */
const marked: Program<T> = {
  ...receiver,
  migrations: [{
    state: (json) => ({ ...json as Readonly<Record<string, Json>>, last: 'migrated' }),
    inbound: (json) => `${String(json)} (inbound)`,
    internal: (json) => `${String(json)} (internal)`,
    projection: (json) => `${String(json)} (projection)`,
  }],
}

/** The rows of a creation with a timer under way, two messages queued, and a row of the log. */
const busy = created({
  keys: [{ key: { name: 'ask' }, incarnation: 1, work: { _tag: 'Timer', at: 0, message: 'rang' }, delivery: null, due: 0 }],
  queued: [inbound('hello'), { _tag: 'Internal', message: 'done', key: { name: 'ask' }, incarnation: 1 }],
  published: { kind: 'Creation', message: null, projection: 'start', topics: ['projection'] },
})

test('a version reads through its migrations the work, the mailbox and the log another version wrote', () =>
  database((sql) =>
    Effect.gen(function*() {
      const first = storage(receiver, sql)
      yield* first.write('r', busy, 0)
      yield* first.write('r', written({
        published: { kind: 'Inbound', message: 'hello', projection: 'hello', topics: ['projection'] },
      }), 0)
      const after = storage(marked, sql)
      const stored = yield* after.load('r')
      const work = stored?.keys[Machine.keyText({ name: 'ask' })]?.work
      expect(work !== undefined && isTimer(work) ? work.message : null).toBe('rang (internal)')
      expect(stored?.mailbox.map(({ message }) => message)).toEqual(['hello (inbound)', 'done (internal)'])
      const read = yield* after.published('projection', [], all)
      expect(read.map(({ message, value }) => ({ message, value }))).toEqual([
        { message: null, value: 'start (projection)' },
        { message: 'hello (inbound)', value: 'hello (projection)' },
      ])
      // A read gives the row through the projection's migrations, as a query does (decision 0121).
      expect(yield* after.projected('r')).toBe('start (projection)')
    })))

/**
 * The receiver with a projection of two fields, each selected by a topic of its log: the last message in capitals,
 * and its length (decision 0138).
 */
type Topical = Omit<T, 'projection' | 'topics'> & Readonly<{
  projection: Readonly<{ upper: string; size: number }>
  topics: Readonly<{ upper: string; size: number }>
}>

const topical: Program<Topical> = {
  ...receiver,
  schemas: { ...receiver.schemas, projection: Schema.Struct({ upper: Schema.String, size: Schema.Number }) },
  project: ({ last }) => ({ upper: last.toUpperCase(), size: last.length }),
  topics: { upper: ({ upper }) => upper, size: ({ size }) => size },
}

/** A step that handled `message`, left the projection given, and is written in the topics named. */
const publishing = (
  message: string | null,
  projection: Topical['projection'],
  topics: ReadonlyArray<keyof Topical['topics']>,
) =>
  written({
    ...(message === null ? created() : {}),
    published: { kind: message === null ? 'Creation' : 'Inbound', message, projection, topics },
  })

describe('topics of the log (decision 0138)', () => {
  test("each topic is read alone, through the projection's migrations, and a step's rows share its seq", () =>
    database((sql) =>
      Effect.gen(function*() {
        const store = storage(topical, sql)
        yield* store.write('r', publishing(null, { upper: 'START', size: 5 }, ['upper', 'size']), 0)
        yield* store.write('r', publishing('hi', { upper: 'HI', size: 2 }, ['upper', 'size']), 0)
        yield* store.write('r', publishing('ho', { upper: 'HO', size: 2 }, ['upper']), 0)
        const rows = (topic: 'upper' | 'size') =>
          Effect.map(store.published(topic, [], all), (read) => read.map(({ seq, topic, value }) => [seq, topic, value]))
        expect(yield* rows('upper')).toEqual([[1, 'upper', 'START'], [2, 'upper', 'HI'], [3, 'upper', 'HO']])
        expect(yield* rows('size')).toEqual([[1, 'size', 5], [2, 'size', 2]])
        // Every row names a publication that stores the projection, read through the projection's migrations
        // whatever the row's topic, and gives what the topic of the program deployed selects of it (decisions 0140,
        // 0154).
        const second: Program<Topical> = {
          ...topical,
          migrations: [{
            projection: (json) => {
              const { size, ...rest } = json as Readonly<{ upper: string; size: number }>
              return { ...rest, size: size * 10 }
            },
          }],
        }
        const after = storage(second, sql)
        expect((yield* after.published('size', [], all)).map(({ value }) => value)).toEqual([50, 20])
        // A selector the deploy changed selects of the migrated row too: `upper` now gives the projection whole.
        type Widened = Omit<Topical, 'topics'> & Readonly<{ topics: Readonly<{ upper: Topical['projection']; size: number }> }>
        const widened: Program<Widened> = { ...second, topics: { upper: (shown) => shown, size: ({ size }) => size } }
        expect((yield* storage(widened, sql).published('upper', [], all)).map(({ value }) => value)).toEqual([
          { upper: 'START', size: 50 },
          { upper: 'HI', size: 20 },
          { upper: 'HO', size: 20 },
        ])
      })))

  // A step's rows name one publication, which a prune keeps while a topic still holds a row of it (decision 0154).
  test("a step's publication is stored once, and dropped with the last topic that names it", () =>
    database((sql) =>
      Effect.gen(function*() {
        const store = storage(topical, sql)
        yield* store.declare([{ topic: 'upper', consumer: 'c' }, { topic: 'size', consumer: 'c' }])
        yield* store.write('r', publishing(null, { upper: 'START', size: 5 }, ['upper', 'size']), 0)
        yield* store.write('r', publishing('hi', { upper: 'HI', size: 2 }, ['upper', 'size']), 0)
        const stored = Effect.map(
          sql<{ seq: number; rows: number }>`
            SELECT effecttea_publications.seq AS seq, count(effecttea_outbox.position) AS rows FROM effecttea_publications
            LEFT JOIN effecttea_outbox ON effecttea_outbox.name = effecttea_publications.name AND effecttea_outbox.partition = effecttea_publications.partition
              AND effecttea_outbox.seq = effecttea_publications.seq
            GROUP BY effecttea_publications.seq ORDER BY effecttea_publications.seq
          `,
          // A driver may give an integer as a bigint (decision 0222).
          (held) => held.map(({ seq, rows }) => [Number(seq), Number(rows)]),
        )
        expect(yield* stored).toEqual([[1, 2], [2, 2]])
        // `upper` is read past both steps, and `size` past the first: the second step's publication stays for `size`.
        yield* store.ack('upper', 'c', yield* store.fetch('upper', 'c', all))
        yield* store.ack('size', 'c', (yield* store.fetch('size', 'c', all)).slice(0, 1))
        expect(yield* store.prune).toBe(3)
        expect(yield* stored).toEqual([[2, 1]])
        expect((yield* store.fetch('size', 'c', all)).map(({ seq, value }) => [seq, value])).toEqual([[2, 2]])
        yield* store.ack('size', 'c', yield* store.fetch('size', 'c', all))
        expect(yield* store.prune).toBe(1)
        expect(yield* stored).toEqual([])
      }).pipe(Effect.orDie)))

  test('a consumer is a name within its topic, and a prune drops in each topic what its consumers read', () =>
    database((sql) =>
      Effect.gen(function*() {
        const store = storage(topical, sql)
        // The deploy stores the consumers it declares (decision 0152).
        yield* store.declare([{ topic: 'upper', consumer: 'c' }, { topic: 'size', consumer: 'c' }])
        yield* store.write('r', publishing(null, { upper: 'START', size: 5 }, ['upper', 'size']), 0)
        yield* store.write('r', publishing('ho', { upper: 'HO', size: 5 }, ['upper']), 0)
        const partition = partitionOf('r', 300)
        // One name in two topics is two consumers, each with its own cursors.
        const upper = yield* store.fetch('upper', 'c', all)
        expect(upper).toHaveLength(2)
        expect(yield* store.fetch('size', 'c', all)).toHaveLength(1)
        yield* store.ack('upper', 'c', upper)
        expect(yield* store.fetch('upper', 'c', all)).toEqual([])
        expect(yield* store.fetch('size', 'c', all)).toHaveLength(1)
        expect(yield* store.consumers).toEqual([
          {
            topic: 'size',
            consumer: 'c',
            behind: 1,
            since: DateTime.makeUnsafe(0),
            cursors: [{ partition, seq: 0 }],
          },
          { topic: 'upper', consumer: 'c', behind: 0, since: null, cursors: [] },
        ])
        // The consumer of `size` holds its topic, and not the other.
        expect(yield* store.prune).toBe(2)
        expect(yield* store.published('upper', [], all)).toEqual([])
        expect(yield* store.published('size', [], all)).toHaveLength(1)
        // A topic no consumer holds is pruned whole, since every consumer is stored at deploy (decision 0152).
        yield* store.forget('size', 'c')
        expect(yield* store.consumers).toEqual([{ topic: 'upper', consumer: 'c', behind: 0, since: null, cursors: [] }])
        expect(yield* store.prune).toBe(1)
        expect(yield* store.published('size', [], all)).toEqual([])
        // A declare of a consumer stored already leaves its cursors where they are.
        yield* store.declare([{ topic: 'upper', consumer: 'c' }])
        expect(yield* store.consumers).toEqual([{ topic: 'upper', consumer: 'c', behind: 0, since: null, cursors: [] }])
      })))

  // A batch is a transaction of its own, and the count is the sum of the batches (decision 0245).
  test('a prune drops past a batch, counts every row, and keeps what a cursor holds', () =>
    database((sql) =>
      Effect.gen(function*() {
        const store = storage(topical, sql)
        yield* store.declare([{ topic: 'upper', consumer: 'c' }])
        yield* store.write('r', publishing(null, { upper: 'START', size: 5 }, ['upper', 'size']), 0)
        for (let i = 0; i < 2 * batch; i++) {
          yield* store.write('r', publishing(`m${i}`, { upper: `M${i}`, size: 2 }, ['upper', 'size']), 0)
        }
        const read = yield* store.fetch('upper', 'c', 2 * batch)
        yield* store.ack('upper', 'c', read)
        // `size` has no consumer, and goes whole; `upper` goes through the cursor, and its last row stays.
        expect(yield* store.prune).toBe(2 * batch + 1 + 2 * batch)
        expect((yield* store.fetch('upper', 'c', all)).map(({ value }) => value)).toEqual([`M${2 * batch - 1}`])
        expect(yield* store.published('size', [], all)).toEqual([])
        expect(yield* store.prune).toBe(0)
      })))

  test("a consumer's time is the step of its next row in each partition, the oldest of them, whatever the clock", () =>
    database((sql) =>
      Effect.gen(function*() {
        const store = storage(topical, sql)
        yield* store.declare([{ topic: 'upper', consumer: 'c' }])
        const since = Effect.map(store.consumers, (stored) => stored.map(({ since }) => since))
        // The second step of `r` commits after the first with an earlier time, as two clocks or a clock set back give
        // it: the consumer reads the first next, by its `seq` (decision 0224).
        yield* store.write('r', publishing(null, { upper: 'START', size: 5 }, ['upper']), 200)
        yield* store.write('r', publishing('hi', { upper: 'HI', size: 2 }, ['upper']), 100)
        expect(yield* since).toEqual([DateTime.makeUnsafe(200)])
        yield* store.ack('upper', 'c', (yield* store.fetch('upper', 'c', all)).slice(0, 1))
        expect(yield* since).toEqual([DateTime.makeUnsafe(100)])
        // Another partition behind with an older step gives its time, and a row read in it gives the other's back.
        yield* store.write('b', publishing(null, { upper: 'B', size: 1 }, ['upper']), 50)
        expect(partitionOf('b', 300)).not.toBe(partitionOf('r', 300))
        expect(yield* since).toEqual([DateTime.makeUnsafe(50)])
        yield* store.ack('upper', 'c', (yield* store.fetch('upper', 'c', all)).filter(({ id }) => id === 'b'))
        expect(yield* since).toEqual([DateTime.makeUnsafe(100)])
        // A consumer that has read every row has no time.
        yield* store.ack('upper', 'c', yield* store.fetch('upper', 'c', all))
        expect(yield* since).toEqual([null])
      })))
})

// A state is compared by its text and the version that wrote it: one text is another state at another version
// (decision 0070).
test('reindex skips an entity that a step wrote since, though its state has the same text at another version', () =>
  database((sql) =>
    Effect.gen(function*() {
      const first = storage(receiver, sql)
      yield* first.write('a', created({ entity: { state: { last: 'x' }, creation, flags: null } }), 0)
      yield* first.write('b', created({ entity: { state: { last: 'x' }, creation, flags: null } }), 0)
      // As 'a''s row is written, version 2 steps 'b' to the state it writes as the same text, which it reads as
      // its own, with no migration: the step lands between the reading of 'b' and the writing of its row.
      const step = `
        UPDATE effecttea_entities SET version = 2 WHERE name = 'Receiver' AND id = 'b';
        UPDATE effecttea_projections SET projection = '"x"', version = 2 WHERE name = 'Receiver' AND id = 'b';
      `
      if (dialectOf(sql) === 'pg') {
        yield* sql.unsafe(`
          CREATE FUNCTION step() RETURNS trigger LANGUAGE plpgsql AS $$
          BEGIN
            IF NEW.id = 'a' THEN ${step} END IF;
            RETURN NULL;
          END $$
        `)
        yield* sql`CREATE TRIGGER step AFTER UPDATE ON effecttea_projections FOR EACH ROW EXECUTE FUNCTION step()`
      } else {
        yield* sql.unsafe(`CREATE TEMP TRIGGER step AFTER UPDATE ON effecttea_projections WHEN NEW.id = 'a' BEGIN ${step} END`)
      }
      const after = storage(marked, sql)
      expect(yield* after.reindex).toEqual({ written: 1, failed: [] })
      expect(yield* after.query({ limit: all })).toEqual([{ id: 'a', projection: 'migrated', indexes: {} }, { id: 'b', projection: 'x', indexes: {} }])
    }).pipe(Effect.orDie)))

// What the program computes of a row leaves that entity's row, and what the runtime throws fails the call
// (decisions 0061, 0122).
test('reindex passes over a state a migration or the schema dies on, and fails on a text that is no JSON', () =>
  database((sql) =>
    Effect.gen(function*() {
      const first = storage(receiver, sql)
      for (const id of ['a', 'b', 'c']) {
        yield* first.write(id, created({ entity: { state: { last: id }, creation, flags: null } }), 0)
      }
      // Version 2 dies on 'b' in its migration, and migrates 'c' to a state its schema refuses.
      const dying: Program<T> = {
        ...receiver,
        migrations: [{
          state: (json) => {
            const { last } = json as Readonly<{ last: string }>
            if (last === 'b') throw new Error('the migration dies')
            return last === 'c' ? { last: 3 } : json
          },
        }],
      }
      const after = storage(dying, sql)
      const reindexed = yield* after.reindex
      expect(reindexed.written).toBe(1)
      expect(reindexed.failed.map(({ id }) => id)).toEqual(['b', 'c'])
      expect(reindexed.failed[0]?.cause).toBe('Error: the migration dies')
      // The rows passed over are the ones version 1 wrote.
      expect(yield* after.query({ limit: all })).toEqual([
        { id: 'a', projection: 'a', indexes: {} },
        { id: 'b', projection: 'start', indexes: {} },
        { id: 'c', projection: 'start', indexes: {} },
      ])
      yield* sql`UPDATE effecttea_entities SET state = 'no json' WHERE name = 'Receiver' AND id = 'a'`
      const exit = yield* Effect.exit(after.reindex)
      expect(Exit.isFailure(exit) && Cause.squash(exit.cause) instanceof SyntaxError).toBe(true)
    }).pipe(Effect.orDie)))

test('a query by an index the program does not declare dies, naming it', () =>
  database((sql) =>
    Effect.gen(function*() {
      // A name is written into the query as it is, so only the program's own are: the types say so, and a cast
      // that passes them still reaches nothing.
      for (
        const query of [{ limit: all, where: [{ index: 'nope', is: '=', value: 1 }] }, { limit: all, order: { index: 'nope' } }]
      ) {
        const exit = yield* Effect.exit(storage(receiver, sql).query(query as never))
        const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
        expect(cause instanceof Error && cause.message).toBe("'nope' is no index of the program 'Receiver'")
      }
    })))

/** A receiver whose projection is its rank, as JSON: an index of numbers that tie, of nulls and of a string. */
type Ranked = Omit<T, 'index'> & { index: 'rank' }
const ranked: Program<Ranked> = {
  ...(named('Ranked') as unknown as Program<Ranked>),
  indexes: { rank: (projection) => JSON.parse(projection) as Scalar },
}

test('a query pages past the last row it gave, through ties and nulls, in either order', () =>
  database((sql) =>
    Effect.gen(function*() {
      const store = storage(ranked, sql)
      const ranks: Readonly<Record<string, Scalar>> = { a: 2, b: null, c: 1, d: 2, e: null, f: 1, g: 2, h: 'x' }
      for (const [id, rank] of Object.entries(ranks)) {
        const projection = JSON.stringify(rank)
        yield* store.write(id, created({ shown: { projection, indexes: { rank } } }), 0)
      }
      /** Every page of `query`, `limit` rows at a time, each read past the last row of the page before. */
      const paged = (query: Omit<Query<Ranked>, 'limit' | 'after'>, limit: number) =>
        Effect.gen(function*() {
          const ids: Array<string> = []
          let after: Found<Ranked> | undefined
          while (true) {
            const page = yield* store.query({ ...query, limit, after })
            ids.push(...page.map(({ id }) => id))
            after = page[page.length - 1]
            // A query that reads no row past its cursor would give the same page for ever.
            if (after === undefined || ids.length > Object.keys(ranks).length) return ids
          }
        })
      // SQLite sorts null first, numbers before text, and the id breaks the ties: a descending order is the
      // ascending one reversed, ids included (decision 0145). A criterion compares across types in the same
      // order, so 'x' is `>= 1` (decision 0143).
      const orders = [
        [{}, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']],
        [{ order: { index: 'rank' } }, ['b', 'e', 'c', 'f', 'a', 'd', 'g', 'h']],
        [{ order: { index: 'rank', descending: true } }, ['h', 'g', 'd', 'a', 'f', 'c', 'e', 'b']],
        [{ order: { index: 'rank' }, where: [{ index: 'rank', is: '>=', value: 1 }] }, ['c', 'f', 'a', 'd', 'g', 'h']],
      ] as const
      for (const [query, ids] of orders) {
        expect(yield* store.query({ ...query, limit: all })).toHaveLength(ids.length)
        for (const limit of [1, 2, 3]) expect(yield* paged(query, limit)).toEqual([...ids])
      }
      // A row carries the indexes the query compared, as stored: the cursor is the row itself.
      expect((yield* store.query({ limit: 1, order: { index: 'rank' } }))[0]).toEqual({
        id: 'b',
        projection: 'null',
        indexes: { rank: null },
      })
    })))

// The index holds the id after the value, so that each part of a page is a range of it (decision 0145).
test('an index of the program holds the value and the id', () =>
  database((sql) =>
    Effect.gen(function*() {
      const column = `json_extract(indexes, '$.rank')`
      yield* storage(ranked, sql).indexed
      const made = yield* sql<{ name: string; sql: string }>`
        SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name LIKE 'effecttea_projections %'
      `
      expect(made).toEqual([{
        name: 'effecttea_projections Ranked rank by id',
        sql: `CREATE INDEX "effecttea_projections Ranked rank by id" ON effecttea_projections (name, ${column}, id)`,
      }])
    }).pipe(Effect.orDie), ['sqlite']))

// Under every schedule within one deviation, a step moves a row from the rows that tie with the cursor to the rows
// past its value while a page reads them, and the page gives it once (decision 0145).
test('a page gives a row once though a step moves it while the page is read', () => {
  const race = Effect.gen(function*() {
    yield* createTables
    const sql = yield* SqlClient.SqlClient
    const store = storage(ranked, sql)
    for (const id of ['a', 'b']) yield* store.write(id, created({ shown: { projection: '1', indexes: { rank: 1 } } }), 0)
    const [page] = yield* Effect.all([
      store.query({ limit: all, order: { index: 'rank' }, after: { id: 'a', indexes: { rank: 1 } } }),
      sql`UPDATE effecttea_projections SET indexes = '{"rank":2}' WHERE id = 'b'`,
    ], { concurrency: 'unbounded' })
    return page.map(({ id }) => id)
  }).pipe(Effect.provide(SqliteClient.layer({ filename: ':memory:' })), Effect.orDie)
  const runs = everySchedule(race, { bound: 1 }, (exit) => {
    expect(Exit.isSuccess(exit) && exit.value).toEqual(['b'])
  })
  expect(runs).toBeGreaterThan(1)
})

test('a cursor that holds no id, or no scalar of the index ordered by, is its caller’s defect', () =>
  database((sql) =>
    Effect.gen(function*() {
      const store = storage(ranked, sql)
      const order = { index: 'rank' } as const
      const refused = [
        store.query({ limit: all, after: null as never }),
        store.query({ limit: all, after: { id: 1, indexes: { rank: 1 } } as never }),
        store.query({ limit: all, order, after: { id: 'a', indexes: {} } as never }),
        store.query({ limit: all, order, after: { id: 'a', indexes: { rank: Number.NaN } } }),
        store.query({ limit: all, order, after: { id: 'a', indexes: { rank: [] } } as never }),
      ]
      for (const call of refused) {
        const exit = yield* Effect.exit(call)
        const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
        expect(cause instanceof InvariantDefect && cause.reason).toMatch(/^the (row|id|index 'rank') after is .+, which is no/)
      }
    })))

// SQLite finds no row under `NaN`, where PostgreSQL holds it a number past every other, and PostgreSQL takes no
// U+0000 in a parameter of text: each dialect would answer otherwise, so each is refused alike (decision 0207).
test('a criterion or a cursor that is no scalar a query compares is its caller’s defect, on both dialects', () =>
  database((sql) =>
    Effect.gen(function*() {
      const store = storage(ranked, sql)
      yield* store.write('a', created({ shown: { projection: '1', indexes: { rank: 1 } } }), 0)
      const unheld: ReadonlyArray<unknown> = [Number.NaN, Number.POSITIVE_INFINITY, 'a\u0000', '\ud800', undefined, []]
      for (const value of unheld) {
        const where = [{ index: 'rank', is: '<', value: value as never }] as const
        const shown = typeof value === 'string' || typeof value === 'object' ? JSON.stringify(value) : String(value)
        for (
          const call of [
            store.query({ limit: all, where }),
            store.count({ where }),
            store.sum({ index: 'rank', where }),
            store.countBy({ index: 'rank', where, limit: all }),
          ] as ReadonlyArray<Effect.Effect<unknown>>
        ) {
          const exit = yield* Effect.exit(call)
          const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
          expect(cause instanceof InvariantDefect && cause.reason)
            .toBe(`the value compared with the index 'rank' is ${shown}, which is no scalar a query compares`)
        }
      }
      const order = { index: 'rank' } as const
      const cursors = [
        [{ id: 'a\u0000', indexes: { rank: 1 } }, 'the id after is "a\\u0000", which is no text a database holds'],
        [{ id: 'a', indexes: { rank: 'x\u0000' } }, `the index 'rank' after is "x\\u0000", which is no scalar`],
      ] as const
      for (const [after, reason] of cursors) {
        const exit = yield* Effect.exit(store.query({ limit: all, order, after }))
        const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
        expect(cause instanceof InvariantDefect && cause.reason).toBe(reason)
      }
      // A criterion every database holds still finds the row.
      expect(yield* store.count({ where: [{ index: 'rank', is: '<', value: 2 }] })).toBe(1)
    })))

// `JSON.stringify` writes an integer beyond 2^53 with the fewest digits that read back as it, which SQLite reads as
// another integer: without the exact digits, the page gives the row for ever, and a criterion misses it (decision 0146).
test('a query pages past, and finds by its value, a row whose index is an integer beyond 2^53', () =>
  database((sql) =>
    Effect.gen(function*() {
      const store = storage(ranked, sql)
      const nanos = 1762300123456789012
      const ranks: Readonly<Record<string, Scalar>> = { a: nanos, b: 2 ** 60, c: 2 ** 60, d: 5 }
      for (const [id, rank] of Object.entries(ranks)) {
        yield* store.write(id, created({ shown: { projection: JSON.stringify(rank), indexes: { rank } } }), 0)
      }
      const stored = yield* sql<{ id: string; indexes: string }>`SELECT id, indexes FROM effecttea_projections ORDER BY id`
      expect(stored.map(({ indexes }) => indexes)).toEqual([
        '{"rank":1762300123456788992}',
        '{"rank":1152921504606846976}',
        '{"rank":1152921504606846976}',
        '{"rank":5}',
      ])
      const ids: Array<string> = []
      let after: Found<Ranked> | undefined
      while (ids.length <= 4) {
        const page = yield* store.query({ limit: 1, order: { index: 'rank' }, after })
        after = page[0]
        if (after === undefined) break
        ids.push(after.id)
      }
      expect(ids).toEqual(['d', 'b', 'c', 'a'])
      expect(after).toBeUndefined()
      expect((yield* store.query({ limit: all, where: [{ index: 'rank', is: '=', value: 2 ** 60 }] })).map(({ id }) => id))
        .toEqual(['b', 'c'])
      expect((yield* store.query({ limit: 1, order: { index: 'rank' }, after: { id: 'b', indexes: { rank: 2 ** 60 } } }))[0])
        .toEqual({ id: 'c', projection: '1152921504606847000', indexes: { rank: 2 ** 60 } })
    }).pipe(Effect.orDie)))

// The warning of a large step counts the projection once in the outbox, in the step's publication (decision 0154).
test('a step counts the projection it writes once in the outbox, whatever the topics it is written in', () =>
  database((sql) =>
    Effect.gen(function*() {
      const store = storage(receiver, sql)
      yield* store.write('a', created(), 0)
      const step = (topics: ReadonlyArray<string>) =>
        written({ published: { kind: 'Inbound', message: 'm', projection: 'projected', topics } })
      const once = yield* store.write('a', step(['one']), 0)
      const twice = yield* store.write('a', step(['one', 'two']), 0)
      expect(once).toBe(JSON.stringify('projected').length)
      expect(twice).toBe(once)
    }).pipe(Effect.orDie)))

// `reindex` writes the indexes as a step does, so a row it writes again is found by its value (decision 0146).
test('reindex writes an index that is an integer beyond 2^53 with its exact digits', () =>
  database((sql) =>
    Effect.gen(function*() {
      const store = storage(ranked, sql)
      const state = { last: JSON.stringify(2 ** 60) }
      yield* store.write('a', created({ entity: { state, creation, flags: null }, shown: { projection: '0', indexes: { rank: 0 } } }), 0)
      expect(yield* store.reindex).toEqual({ written: 1, failed: [] })
      const stored = yield* sql<{ indexes: string }>`SELECT indexes FROM effecttea_projections`
      expect(stored).toEqual([{ indexes: '{"rank":1152921504606846976}' }])
    }).pipe(Effect.orDie)))

// Each statement of a page takes what the ones before it left of the limit, and a row found carries null for an
// index it lacks, as the query reads it (decisions 0143, 0145).
test('a page gives at most its limit across its statements, and null for an index a row lacks', () =>
  database((sql) =>
    Effect.gen(function*() {
      const store = storage(ranked, sql)
      for (const [id, rank] of [['a', 1], ['b', 1], ['c', 2], ['d', 2]] as const) {
        yield* store.write(id, created({ shown: { projection: String(rank), indexes: { rank } } }), 0)
      }
      yield* store.write('e', created({ shown: { projection: 'null', indexes: {} } }), 0)
      const page = yield* store.query({ limit: 2, order: { index: 'rank' }, after: { id: 'a', indexes: { rank: 1 } } })
      expect(page.map(({ id }) => id)).toEqual(['b', 'c'])
      expect((yield* store.query({ limit: 1, order: { index: 'rank' } }))[0]).toEqual({
        id: 'e',
        projection: 'null',
        indexes: { rank: null },
      })
    }).pipe(Effect.orDie)))

describe('a count and a sum over the entities that match (decision 0148)', () => {
  /** Writes each entity with its rank as its projection, and with no rank at all where it is `undefined`. */
  const ranking = (store: ReturnType<typeof storage<Ranked>>, ranks: Readonly<Record<string, Scalar | undefined>>) =>
    Effect.forEach(Object.entries(ranks), ([id, rank]) =>
      store.write(
        id,
        created({ shown: { projection: JSON.stringify(rank ?? null), indexes: rank === undefined ? {} : { rank } } }),
        0,
      ))

  test('a count finds the rows a query finds, and a sum adds their numbers and leaves out the rest', () =>
    database((sql) =>
      Effect.gen(function*() {
        const store = storage(ranked, sql)
        expect(yield* store.count({})).toBe(0)
        expect(yield* store.sum({ index: 'rank' })).toBe(0)
        // `e` lacks the index, as a row an older version wrote before the index was added.
        yield* ranking(store, { a: 2, b: null, c: 1.5, d: 2 ** 60, e: undefined, f: -3 })
        const criteria = [
          [],
          [{ index: 'rank', is: '>=', value: 1 }],
          [{ index: 'rank', is: '=', value: null }],
          [{ index: 'rank', is: '<>', value: null }, { index: 'rank', is: '<', value: 2 }],
          [{ index: 'rank', is: '>', value: 2 ** 61 }],
        ] as const
        for (const where of criteria) {
          const found = yield* store.query({ limit: all, where })
          expect(yield* store.count({ where })).toBe(found.length)
          const numbers = found.flatMap(({ indexes }) => typeof indexes.rank === 'number' ? [indexes.rank] : [])
          expect(yield* store.sum({ index: 'rank', where })).toBe(numbers.reduce((total, rank) => total + rank, 0))
        }
        expect(yield* store.count({})).toBe(6)
        // An integer beyond SQLite's would make `SUM` fail on an overflow: `TOTAL` adds it as a double.
        expect(yield* store.sum({ index: 'rank' })).toBe(2 + 1.5 + 2 ** 60 - 3)
        yield* ranking(store, { g: 2 ** 63, h: 2 ** 63 })
        expect(yield* store.sum({ index: 'rank', where: [{ index: 'rank', is: '>', value: 2 ** 61 }] })).toBe(2 ** 64)
      })))

  // `json_extract` gives `true` as `1`, and SQLite reads most strings as `0`: without `json_type`, the sum is a
  // number that looks right.
  test('a sum that meets a string or a boolean is its caller’s defect, naming the least id of such a row', () =>
    database((sql) =>
      Effect.gen(function*() {
        const store = storage(ranked, sql)
        yield* ranking(store, { a: 1, b: true, c: 'x', d: 2 })
        const reasonOf = (exit: Exit.Exit<unknown>) => {
          const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
          return cause instanceof InvariantDefect ? cause.reason : null
        }
        expect(reasonOf(yield* Effect.exit(store.sum({ index: 'rank' }))))
          .toBe("the index 'rank' of 'b' holds no number, and is no sum's")
        expect(reasonOf(yield* Effect.exit(store.sum({ index: 'rank', where: [{ index: 'rank', is: '>', value: 1 }] }))))
          .toBe("the index 'rank' of 'c' holds no number, and is no sum's")
        // A criterion that leaves them out leaves the sum whole, and a count reads them as a query does. A criterion
        // compares `true` as `1`, as `json_extract` gives it, and every string after every number.
        const numbers = [{ index: 'rank', is: '>', value: 1 }, { index: 'rank', is: '<', value: 'a' }] as const
        expect(yield* store.sum({ index: 'rank', where: numbers })).toBe(2)
        expect(yield* store.count({ where: [{ index: 'rank', is: '>=', value: 1 }] })).toBe(4)
      })))

  // Without the total of magnitudes, SQLite gave `Infinity` and PostgreSQL failed the statement.
  test('a sum whose magnitudes pass the largest double is its caller’s defect', () =>
    database((sql) =>
      Effect.gen(function*() {
        const store = storage(ranked, sql)
        yield* ranking(store, { a: Number.MAX_VALUE, b: Number.MAX_VALUE, c: -Number.MAX_VALUE, d: 1, e: 0.1, f: -1 })
        const exit = yield* Effect.exit(store.sum({ index: 'rank' }))
        const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
        expect(cause instanceof InvariantDefect && cause.reason).toBe("the total of the index 'rank' may pass the largest double")
        // Each partial total of these is a double, so the sum is given.
        const small = [{ index: 'rank', is: '>', value: -2 }, { index: 'rank', is: '<', value: 2 }] as const
        expect(yield* store.sum({ index: 'rank', where: small })).toBe(0.1)
      })))

  // A sum is refused once its magnitudes, in units of 2^980 cut to integers, and one unit for each number, reach
  // 2^44, alike on both dialects (decision 0277).
  test('a sum is answered one unit under the bound of its magnitudes, and refused at it', () =>
    database((sql) =>
      Effect.gen(function*() {
        const unit = 2 ** 980
        type Sets = Omit<T, 'index'> & { index: 'rank' | 'set' }
        const sets: Program<Sets> = {
          ...(named('Sets') as unknown as Program<Sets>),
          indexes: { rank: (projection) => JSON.parse(projection) as Scalar, set: () => null },
        }
        const store = storage(sets, sql)
        let sums = 0
        // Each set of rows is summed apart, by a rank of its own that holds its number as a string.
        const summed = (ranks: Readonly<Record<string, number>>) =>
          Effect.gen(function*() {
            const set = `s${sums++}`
            yield* Effect.forEach(Object.entries(ranks), ([id, rank]) =>
              store.write(
                `${set}${id}`,
                created({ shown: { projection: JSON.stringify(rank), indexes: { rank, set } } }),
                0,
              ))
            const exit = yield* Effect.exit(store.sum({ index: 'rank', where: [{ index: 'set', is: '=', value: set }] }))
            if (Exit.isSuccess(exit)) return exit.value
            const cause = Cause.squash(exit.cause)
            return cause instanceof InvariantDefect ? cause.reason : cause
          })
        const refused = "the total of the index 'rank' may pass the largest double"
        expect(yield* summed({ a: (2 ** 44 - 2) * unit })).toBe((2 ** 44 - 2) * unit)
        expect(yield* summed({ a: (2 ** 44 - 1) * unit })).toBe(refused)
        expect(yield* summed({ a: Number.MAX_VALUE })).toBe(refused)
        // Each magnitude is cut to its units: these hold 2^44 - 2 units, and count 2^44 - 3 of them and two numbers.
        expect(yield* summed({ a: (2 ** 43 - 0.5) * unit, b: (2 ** 43 - 1.5) * unit })).toBe((2 ** 44 - 2) * unit)
        expect(yield* summed({ a: (2 ** 43 - 1) * unit, b: (2 ** 43 - 1) * unit })).toBe(refused)
        // A sign changes the total, and not the magnitudes.
        expect(yield* summed({ a: (2 ** 43 - 1) * unit, b: -(2 ** 43 - 1) * unit })).toBe(refused)
        expect(yield* summed({ a: (2 ** 43 - 1) * unit, b: -(2 ** 43 - 2) * unit })).toBe(unit)
        // A magnitude under the least normal double counts no unit, and adds as it did.
        const least = Number.MIN_VALUE
        expect(yield* summed({ a: least, b: least, c: 3 * least })).toBe(5 * least)
      })))

  test('a count or a sum by an index the program does not declare dies, naming it', () =>
    database((sql) =>
      Effect.gen(function*() {
        const store = storage(ranked, sql)
        const calls = [
          store.count({ where: [{ index: 'nope', is: '=', value: 1 }] } as never),
          store.sum({ index: 'nope' } as never),
          store.sum({ index: 'rank', where: [{ index: 'nope', is: '=', value: 1 }] } as never),
        ]
        for (const call of calls) {
          const exit = yield* Effect.exit(call)
          const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
          expect(cause instanceof Error && cause.message).toBe("'nope' is no index of the program 'Ranked'")
        }
      })))
})

describe('a count per value of an index (decision 0150)', () => {
  /** Writes each entity with its rank, and with no rank at all where it is `undefined`. */
  const ranking = (store: ReturnType<typeof storage<Ranked>>, ranks: Readonly<Record<string, Scalar | undefined>>) =>
    Effect.forEach(Object.entries(ranks), ([id, rank]) =>
      store.write(
        id,
        created({ shown: { projection: JSON.stringify(rank ?? null), indexes: rank === undefined ? {} : { rank } } }),
        0,
      ))

  test('each value comes once, with how many rows hold it, in the order a query orders the index by', () =>
    database((sql) =>
      Effect.gen(function*() {
        const store = storage(ranked, sql)
        expect(yield* store.countBy({ index: 'rank', limit: all })).toEqual([])
        // `e` lacks the index, as a row an older version wrote before the index was added: it is counted as null.
        yield* ranking(store, { a: 2, b: null, c: 'x', d: 2, e: undefined, f: 1, g: true, h: 'x', i: 0, j: false })
        const tallies = yield* store.countBy({ index: 'rank', limit: all })
        // `json_extract` gives `true` as `1` and `false` as `0`, which a query orders among the numbers: the kind
        // keeps them apart, and a boolean comes after the number it is read as.
        expect(tallies).toEqual([
          { value: null, count: 2 },
          { value: 0, count: 1 },
          { value: false, count: 1 },
          { value: 1, count: 1 },
          { value: true, count: 1 },
          { value: 2, count: 2 },
          { value: 'x', count: 2 },
        ])
        // A query ordered by the index gives the values in the same order. It orders a boolean and its number by
        // their ids, which here put the number first.
        const found = yield* store.query({ limit: all, order: { index: 'rank' } })
        expect(found.map(({ indexes }) => indexes.rank)).toEqual([null, null, 0, false, 1, true, 2, 2, 'x', 'x'])
        // A criterion keeps the rows a count keeps, and the limit takes the first values.
        const where = [{ index: 'rank', is: '>=', value: 1 }] as const
        expect(yield* store.countBy({ index: 'rank', where, limit: 2 })).toEqual([
          { value: 1, count: 1 },
          { value: true, count: 1 },
        ])
        const counted = yield* store.countBy({ index: 'rank', where, limit: all })
        expect(counted.reduce((total, { count }) => total + count, 0)).toBe(yield* store.count({ where }))
        expect(yield* store.countBy({ index: 'rank', limit: 0 })).toEqual([])
      })))

  test('a count per value of an index the program does not declare dies, naming it', () =>
    database((sql) =>
      Effect.gen(function*() {
        const store = storage(ranked, sql)
        const calls = [
          store.countBy({ index: 'nope', limit: all } as never),
          store.countBy({ index: 'rank', where: [{ index: 'nope', is: '=', value: 1 }], limit: all } as never),
        ]
        for (const call of calls) {
          const exit = yield* Effect.exit(call)
          const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
          expect(cause instanceof Error && cause.message).toBe("'nope' is no index of the program 'Ranked'")
        }
      })))
})

test('a row is written at the version that writes it, and read back as it was written', () =>
  database((sql) =>
    Effect.gen(function*() {
      // Version 2 writes every row of the entity: one stamped with another version would be read through a
      // migration it never needed, and come back marked.
      const after = storage(marked, sql)
      yield* after.write('r', busy, 0)
      const stored = yield* after.load('r')
      expect(stored?.state).toEqual({ last: 'start' })
      const work = stored?.keys[Machine.keyText({ name: 'ask' })]?.work
      expect(work !== undefined && isTimer(work) ? work.message : null).toBe('rang')
      expect(stored?.mailbox.map(({ message }) => message)).toEqual(['hello', 'done'])
      expect((yield* after.published('projection', [], all)).map(({ value }) => value)).toEqual(['start'])
      expect(yield* after.query({ limit: all })).toEqual([{ id: 'r', projection: 'start', indexes: {} }])
    })))

// The time an entity suspended is kept while it stays suspended, and read with what it died on (decision 0114).
test('a suspended entity is listed with what it died on, its cause and since when, kept while it stays suspended', () =>
  database((sql) =>
    Effect.gen(function*() {
      const store = storage(receiver, sql)
      const listed = Effect.map(store.suspended, (entities) =>
        entities.map(({ since, ...rest }) => ({ ...rest, since: DateTime.toEpochMillis(since) })))
      const onMessage = { on: { _tag: 'Message' }, cause: 'broken' } as const
      const onOperation = { on: { _tag: 'Operation', key: { name: 'ask' }, incarnation: 1 }, cause: 'died' } as const
      yield* store.write('fine', created(), 1)
      yield* store.write('inbound', created({ queued: [inbound('one')], suspension: onMessage }), 5)
      yield* store.write('operation', created({ suspension: onOperation }), 3)
      // The longest suspended first, each with the tag of the message it died on.
      expect(yield* listed).toEqual([
        { id: 'operation', on: onOperation.on, cause: 'died', since: 3, waiting: [] },
        { id: 'inbound', on: { _tag: 'Message', kind: 'Inbound' }, cause: 'broken', since: 5, waiting: [] },
      ])
      // A step while the entity stays suspended, a completion recorded or a state written, keeps the time.
      const completion: Machine.EnvelopeRow = { _tag: 'Internal', message: 'done', key: { name: 'ask' }, incarnation: 1 }
      yield* store.write('inbound', written({ queued: [completion], suspension: onMessage }), 9)
      yield* store.write(
        'operation',
        written({ entity: { state: { last: 'again' }, creation, flags: null }, suspension: onOperation }),
        10,
      )
      expect((yield* listed).map(({ id, since }) => [id, since])).toEqual([['operation', 3], ['inbound', 5]])
      // The step that takes the entity out of its suspension clears it, and a later suspension is timed anew.
      yield* store.write('inbound', written({ handled: 1 }), 12)
      expect((yield* listed).map(({ id }) => id)).toEqual(['operation'])
      yield* store.write('inbound', written({ suspension: onMessage }), 20)
      expect(yield* listed).toEqual([
        { id: 'operation', on: onOperation.on, cause: 'died', since: 3, waiting: [] },
        { id: 'inbound', on: { _tag: 'Message', kind: 'Internal' }, cause: 'broken', since: 20, waiting: [] },
      ])
    })))

// A wait is stored by the step that answered `Suspended`, listed while the run that sent holds, and deleted by the
// step that takes the entity out of its suspension (decision 0265).
test('a suspended entity lists the stored waits whose run holds, and its resumption deletes them', () =>
  database((sql) =>
    Effect.gen(function*() {
      const store = storage(receiver, sql)
      const work = { _tag: 'Operation', operation: { _tag: 'Ask' } }
      const waiting = Effect.map(store.suspended, (entities) => entities.map(({ id, waiting }) => [id, waiting]))
      const run = (incarnation: number) =>
        ({ key: { name: 'ask' }, incarnation, work, delivery: 'Idempotent', due: null }) as const
      const wait = (id: string, incarnation: number, name: string): Machine.Wait => ({
        asked: { name: 'Asker', id, key: { name: 'ask' }, incarnation },
        name,
      })
      const onMessage = { on: { _tag: 'Message' }, cause: 'broken' } as const
      yield* storage(asker, sql).write('a', created({ keys: [run(1)], incarnations: 1 }), 0)
      yield* storage(asker, sql).write('b', created({ keys: [run(1)], incarnations: 1 }), 0)
      yield* store.write('r', created({ queued: [inbound('one')], suspension: onMessage }), 1)
      // A wait answered twice is stored once.
      yield* store.write('r', written({ waits: [wait('b', 1, 'want'), wait('a', 1, 'want')], suspension: onMessage }), 2)
      yield* store.write('r', written({ waits: [wait('a', 1, 'want')], suspension: onMessage }), 3)
      const listedOf = (id: string) => ({ entity: { name: 'Asker', id }, key: { name: 'ask' }, incarnation: 1, name: 'want' })
      expect(yield* waiting).toEqual([['r', [listedOf('a'), listedOf('b')]]])
      expect((yield* store.inspect('r'))?.suspension?.waiting).toEqual([listedOf('a'), listedOf('b')])
      // A run restarted under another incarnation no longer waits, nor does one whose work ended.
      yield* storage(asker, sql).write('a', written({ keys: [run(2)], incarnations: 2 }), 4)
      yield* storage(asker, sql).write('b', written({ gone: [{ name: 'ask' }] }), 4)
      expect(yield* waiting).toEqual([['r', []]])
      yield* storage(asker, sql).write('b', written({ keys: [run(1)] }), 5)
      expect(yield* waiting).toEqual([['r', [listedOf('b')]]])
      // The step that takes the entity out of its suspension deletes every wait, and a later suspension lists none.
      yield* store.write('r', written({ handled: 1, woken: true }), 6)
      yield* store.write('r', written({ queued: [inbound('two')], suspension: onMessage }), 7)
      expect(yield* waiting).toEqual([['r', []]])
      const [left] = yield* sql<{ held: number }>`SELECT COUNT(*) AS held FROM effecttea_waiting`
      expect(Number(left?.held)).toBe(0)
    }).pipe(Effect.orDie)))

// The partition is the library's own formula, which no release of Effect changes: these values are never updated
// to pass (decision 0273).
test('the partition of an id is the library’s own formula, pinned for a few ids', () => {
  expect(['toy-1', 'a', 'b', 'r', 'o-1'].map((id) => partitionOf(id, 300))).toEqual([164, 5, 8, 24, 71])
  expect(['toy-1', 'a', 'b'].map((id) => partitionOf(id, 1))).toEqual([1, 1, 1])
})

// At the pinned version the formula is Cluster's on `Hash.string`, so that the entities stored before decision 0273
// keep their partitions. A move of Effect at which this fails changes Cluster's hash or `Hash.string`, and waits
// for a note that decides a migration.
test('the partition of an id is Cluster’s formula on Hash.string at the pinned version, for ids of every script', () =>
  fc.assert(fc.property(fc.string({ unit: 'binary' }), fc.integer({ min: 1, max: 4096 }), (id, partitions) => {
    expect(partitionOf(id, partitions)).toBe(Math.abs(Hash.string(id) % partitions) + 1)
  })))

/** A row of the log as a step writes it, at the `position` given: the order the store gave the rows in. */
const logged = (sql: SqlClient.SqlClient, id: string, seq: number, position: number) =>
  Effect.andThen(
    Effect.andThen(
      sql`INSERT INTO effecttea_publications ${
        sql.insert({
          name: 'Receiver',
          partition: partitionOf(id, 300),
          seq,
          id,
          tag: 'Creation',
          version: 1,
          written_at: 0,
          message: null,
          projection: '"start"',
        })
      }`,
      // A position of PostgreSQL is drawn by the database, and a row given one by hand says so.
      sql`INSERT INTO effecttea_outbox (position, name, topic, partition, seq) ${
        sql.literal(dialectOf(sql) === 'pg' ? 'OVERRIDING SYSTEM VALUE' : '')
      } VALUES (${position}, 'Receiver', 'projection', ${partitionOf(id, 300)}, ${seq})`,
    ),
    sql`
      INSERT INTO effecttea_heads ${sql.insert({ name: 'Receiver', partition: partitionOf(id, 300), seq })}
      ON CONFLICT (name, partition)
      DO UPDATE SET seq = CASE WHEN effecttea_heads.seq > excluded.seq THEN effecttea_heads.seq ELSE excluded.seq END
    `,
  )

// On a store where two steps commit at once, a step of one partition may take its row's place in the order before
// a step of another, and commit after it (decision 0137).
test('a row that commits after one a consumer has read is read then, from its partition’s cursor', () =>
  database((sql) =>
    Effect.gen(function*() {
      const store = storage(receiver, sql)
      const seen = (read: ReadonlyArray<{ id: string; seq: number }>) => read.map(({ id, seq }) => `${id}${seq}`)
      yield* store.declare([{ topic: 'projection', consumer: 'c' }])
      yield* logged(sql, 'a', 1, 10)
      const first = yield* store.fetch('projection', 'c', all)
      expect(seen(first)).toEqual(['a1'])
      yield* store.ack('projection', 'c', first)
      // The row of `b` was given its place before the one of `a`, and is committed only now.
      yield* logged(sql, 'b', 1, 5)
      expect(seen(yield* store.fetch('projection', 'c', all))).toEqual(['b1'])
      expect(yield* store.prune).toBe(1)
      expect(seen(yield* store.published('projection', [], all))).toEqual(['b1'])
    }).pipe(Effect.orDie)))

test('a reading passes over the rows its cursors have read, page after page, and stops at its limit', () =>
  database((sql) =>
    Effect.gen(function*() {
      const store = storage(receiver, sql)
      const seen = (read: ReadonlyArray<{ id: string; seq: number }>) => read.map(({ id, seq }) => `${id}${seq}`)
      // The row of `b` is the oldest, and every row of `a` after it fills more than a page.
      yield* logged(sql, 'b', 1, 1)
      for (let seq = 1; seq <= 300; seq++) yield* logged(sql, 'a', seq, seq + 1)
      const a = partitionOf('a', 300)
      expect(seen(yield* store.published('projection', [{ partition: a, seq: 300 }], all))).toEqual(['b1'])
      expect(seen(yield* store.published('projection', [{ partition: a, seq: 300 }], 1))).toEqual(['b1'])
      const half = yield* store.published('projection', [{ partition: a, seq: 150 }], all)
      expect(seen(half)).toEqual(['b1', ...Array.from({ length: 150 }, (_, at) => `a${at + 151}`)])
      expect(seen(yield* store.published('projection', [], 260))).toEqual([
        'b1',
        ...Array.from({ length: 259 }, (_, at) => `a${at + 1}`),
      ])
      // A partition named twice is read from the higher cursor.
      expect(seen(yield* store.published('projection', [{ partition: a, seq: 300 }, { partition: a, seq: 1 }], all)))
        .toEqual(['b1'])
    }).pipe(Effect.orDie)))

describe('renaming a program (decision 0156)', () => {
  const buyer = named('Buyer')
  const work = { _tag: 'Operation', operation: { _tag: 'Ask' } }
  /** A request of the asker's work, from the entity `a` of the program `name`, under a key whose parameter is `parameter`. */
  const askedBy = (name: string, parameter?: Json) =>
    ({
      _tag: 'Operation',
      entity: { name, id: 'a' },
      key: parameter === undefined ? { name: 'ask' } : { name: 'ask', parameter },
      incarnation: 1,
      name: 'request',
    }) as const
  const stored = (sql: SqlClient.SqlClient) =>
    Effect.flatMap(
      sql`SELECT name, id, keyed_as, creation FROM effecttea_entities ORDER BY name, id`,
      Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({
        name: Schema.String,
        id: Schema.String,
        keyed_as: Schema.NullOr(Schema.String),
        creation: Schema.String,
      }))),
    )
  /** The renames run against the database of the test, as the launch runs them. */
  const rename = (sql: SqlClient.SqlClient, renames: ReadonlyArray<readonly [string, string]>, marked = false) =>
    Effect.provideService(renamed(renames, marked), SqlClient.SqlClient, sql)
  const reasonOf = (exit: Exit.Exit<unknown>) => {
    const cause = Exit.isFailure(exit) ? Cause.squash(exit.cause) : null
    return cause instanceof InvariantDefect ? cause.reason : null
  }

  test("a rename moves every row of the old name, the requests its entities sent, and keeps each entity's keys", () =>
    database((sql) =>
      Effect.gen(function*() {
        const asked = askedBy('Asker')
        const key = { key: { name: 'ask' }, incarnation: 1, work, delivery: 'Idempotent', due: null } as const
        yield* storage(asker, sql).write('a', created({ keys: [key], incarnations: 1 }), 0)
        // The receiver was created by the asker, holds a message it sent, and stores a reply to it.
        const answered: Machine.ReplyRow = {
          request: Machine.requestKey(receiver, asked),
          carried: null,
          tag: 'Accepted',
          reason: null,
          asked: { name: 'Asker', id: 'a', key: { name: 'ask' }, incarnation: 1 },
          until: null,
        }
        yield* storage(receiver, sql).write('r', created({
          entity: { state: { last: 'start' }, creation: asked, flags: null },
          queued: [{ _tag: 'Inbound', message: 'later', request: asked, keep: null }],
          replies: [answered],
        }), 0)
        yield* rename(sql, [['Asker', 'Buyer']])
        expect(yield* storage(asker, sql).load('a')).toBeNull()
        const loaded = yield* storage(buyer, sql).load('a')
        expect(loaded?.name).toBe('Buyer')
        expect(loaded?.keyedAs).toBe('Asker')
        expect(Object.values(loaded?.keys ?? {}).map(({ incarnation }) => incarnation)).toEqual([1])
        expect(loaded?.state).toEqual({ last: 'start' })
        // The sender's retry, under its new name, finds the reply stored for it.
        const store = storage(receiver, sql)
        expect((yield* store.reply('r', askedBy('Buyer'), 0))?.reply ?? null).toEqual({ _tag: 'Accepted' })
        expect((yield* store.reply('r', asked, 0))?.reply ?? null).toBeNull()
        const r = yield* store.load('r')
        expect(r?.creation).toEqual(askedBy('Buyer'))
        expect(r?.mailbox).toEqual([{ _tag: 'Inbound', message: 'later', request: askedBy('Buyer') }])
        // A rename whose old name holds nothing moves nothing, and a second rename keeps the first name.
        yield* rename(sql, [['Asker', 'Buyer']])
        yield* rename(sql, [['Buyer', 'Client']])
        expect((yield* stored(sql)).map(({ name, keyed_as }) => [name, keyed_as])).toEqual([
          ['Client', 'Asker'],
          ['Receiver', null],
        ])
      }).pipe(Effect.orDie)))

  // A rename moves the answers no entity stores as it moves the replies: the receiver's name, the sender's, and the
  // request's text, so that the sender's run after a crash finds its answer under the new names (decision 0253).
  test('a rename moves the answers kept for the requests of the old name, and of the receiver’s', () =>
    database((sql) =>
      Effect.gen(function*() {
        const key = { key: { name: 'ask' }, incarnation: 1, work, delivery: 'Idempotent', due: null } as const
        yield* storage(asker, sql).write('a', created({ keys: [key], incarnations: 1 }), 0)
        const store = storage(receiver, sql)
        yield* store.keepAnswer('r', 'Message', askedBy('Asker'), { _tag: 'NotFound' })
        yield* rename(sql, [['Asker', 'Buyer']])
        expect(yield* store.answer('r', 'Message', askedBy('Asker'))).toBeNull()
        expect(yield* store.answer('r', 'Message', askedBy('Buyer'))).toEqual({ _tag: 'NotFound' })
        yield* rename(sql, [['Receiver', 'Seller']])
        expect(yield* store.answer('r', 'Message', askedBy('Buyer'))).toBeNull()
        expect(yield* storage(named('Seller'), sql).answer('r', 'Message', askedBy('Buyer'))).toEqual({ _tag: 'NotFound' })
        // The sender's work still holds under its new name, so the answer is kept until that work ends.
        const [row] = yield* sql<{ sender_name: string }>`SELECT sender_name FROM effecttea_answers`
        expect(row?.sender_name).toBe('Buyer')
      }).pipe(Effect.orDie)))

  test('on Cluster, a rename moves the senders a receiver tells of its resumption, and the request ids they sent', () =>
    database((sql) =>
      Effect.gen(function*() {
        const seller = named('Seller')
        const key = { key: { name: 'ask' }, incarnation: 1, work, delivery: 'Idempotent', due: null } as const
        yield* storage(asker, sql, undefined, true).write('a', created({ keys: [key], incarnations: 1 }), 0)
        yield* storage(receiver, sql, undefined, true).write('r', created(), 0)
        const waits = [{ asked: { name: 'Asker', id: 'a', key: { name: 'ask' }, incarnation: 1 }, name: 'want' }]
        yield* storage(receiver, sql, undefined, true).write('r', written({ waits }), 1)
        const ask = { entity: { name: 'Asker', id: 'a' }, key: { name: 'ask' }, incarnation: 1 }
        yield* storage(receiver, sql, undefined, true).keepSent('7', ask)
        yield* rename(sql, [['Asker', 'Buyer'], ['Receiver', 'Seller']])
        expect(yield* storage(receiver, sql, undefined, true).waiters('r')).toEqual([])
        expect(yield* storage(seller, sql, undefined, true).waiters('r')).toEqual([{ name: 'Buyer', id: 'a' }])
        const sent = yield* Effect.flatMap(
          sql`SELECT sender_name FROM effecttea_sent_requests`,
          Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({ sender_name: Schema.String }))),
        )
        expect(sent).toEqual([{ sender_name: 'Buyer' }])
      }).pipe(Effect.orDie)))

  test("a rewritten request's text is the one the runtime writes for the new name, whatever its key holds", () =>
    database((sql) =>
      Effect.gen(function*() {
        const parameters: ReadonlyArray<Json> = [
          1e21,
          5e-324,
          -1.5e-7,
          2 ** 53 + 2,
          'é "quoted" \ \u0001   😀 \ud800 </x>',
          { b: [{ z: 1, a: [true, null, 0.1] }], a: '' },
        ]
        const answered = (parameter: Json): Machine.ReplyRow => ({
          request: Machine.requestKey(receiver, askedBy('Asker', parameter)),
          carried: null,
          tag: 'Accepted',
          reason: null,
          asked: null,
          until: null,
        })
        yield* storage(asker, sql).write('a', created(), 0)
        yield* storage(receiver, sql).write('r', created({ replies: parameters.map(answered) }), 0)
        yield* rename(sql, [['Asker', 'Buyer \u0007 "é"']])
        const found = yield* Effect.flatMap(
          sql`SELECT request FROM effecttea_replies WHERE name = 'Receiver' ORDER BY request`,
          Schema.decodeUnknownEffect(Schema.Array(Schema.Struct({ request: Schema.String }))),
        )
        expect([...found.map(({ request }) => request)].sort()).toEqual(
          parameters.map((parameter) => Machine.requestKey(receiver, askedBy('Buyer \u0007 "é"', parameter))).sort(),
        )
      }).pipe(Effect.orDie)))

  test('a rename onto a name that holds an entity dies, and moves nothing', () =>
    database((sql) =>
      Effect.gen(function*() {
        yield* storage(asker, sql).write('a', created(), 0)
        yield* storage(buyer, sql).write('b', created(), 0)
        const before = yield* stored(sql)
        expect(reasonOf(yield* Effect.exit(rename(sql, [['Receiver', 'Nobody'], ['Asker', 'Buyer']])))).toBe(
          "the launch renames 'Asker' to 'Buyer', which holds an entity, a head of the log or a consumer already",
        )
        expect(yield* stored(sql)).toEqual(before)
      }).pipe(Effect.orDie)))

  test('two names renamed to one move where one of them holds entities, and die where both do (decision 0176)', () =>
    database((sql) =>
      Effect.gen(function*() {
        yield* storage(asker, sql).write('a', created(), 0)
        // `Receiver` holds nothing: a program renamed twice declares both of its former names.
        yield* rename(sql, [['Asker', 'Client'], ['Receiver', 'Client']])
        expect((yield* stored(sql)).map(({ name, id }) => [name, id])).toEqual([['Client', 'a']])
        yield* storage(asker, sql).write('a', created(), 0)
        yield* storage(receiver, sql).write('r', created(), 0)
        const before = yield* stored(sql)
        expect(reasonOf(yield* Effect.exit(rename(sql, [['Asker', 'Shopper'], ['Receiver', 'Shopper']])))).toBe(
          "the launch renames 'Receiver' to 'Shopper', which holds an entity, a head of the log or a consumer already",
        )
        expect(yield* stored(sql)).toEqual(before)
      }).pipe(Effect.orDie)))

  test('on Cluster, a rename marks the old name though it holds nothing, and its newest version moves (decision 0176)', () =>
    database((sql) =>
      Effect.gen(function*() {
        const provided = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
          Effect.provideService(effect, SqlClient.SqlClient, sql)
        yield* provided(recordVersions('old:1', [{ name: 'Asker', version: 2 }]))
        yield* provided(recordVersions('new:1', [{ name: 'Buyer', version: 2 }]))
        expect(yield* provided(outranked('old:1'))).toBe(false)
        yield* rename(sql, [['Asker', 'Buyer'], ['Seller', 'Vendor']], true)
        expect(yield* provided(standingOf('Asker'))).toEqual({ version: 2, renamedTo: 'Buyer' })
        expect(yield* provided(standingOf('Buyer'))).toEqual({ version: 2, renamedTo: null })
        // A name no launch on Cluster recorded is marked at version 0, and its new name is not recorded.
        expect(yield* provided(standingOf('Seller'))).toEqual({ version: 0, renamedTo: 'Vendor' })
        expect(yield* provided(standingOf('Vendor'))).toBeUndefined()
        // A runner of the old name is outranked, and one of the old code that launches again is refused.
        expect(yield* provided(outranked('old:1'))).toBe(true)
        expect(yield* provided(outranked('new:1'))).toBe(false)
        expect(reasonOf(yield* Effect.exit(provided(recordVersions('old:1', [{ name: 'Asker', version: 2 }])))))
          .toBe('the program Asker is launched, and a launch has renamed it to Buyer')
        // A rename runs again at every launch that declares it, and changes nothing.
        yield* rename(sql, [['Asker', 'Buyer']], true)
        expect(yield* provided(standingOf('Asker'))).toEqual({ version: 2, renamedTo: 'Buyer' })
        // A new name not recorded is given the old name's version.
        yield* provided(recordVersions('old:2', [{ name: 'Tiny', version: 3 }]))
        yield* rename(sql, [['Tiny', 'Small']], true)
        expect(yield* provided(standingOf('Small'))).toEqual({ version: 3, renamedTo: null })
        // Two names renamed to one not recorded give it the newer version, in either order.
        yield* provided(recordVersions('old:3', [{ name: 'Former', version: 1 }, { name: 'Latter', version: 4 }]))
        yield* rename(sql, [['Former', 'Joined'], ['Latter', 'Joined']], true)
        expect(yield* provided(standingOf('Joined'))).toEqual({ version: 4, renamedTo: null })
      }).pipe(Effect.orDie)))

  test('on Cluster, a rename from a version newer than the new name runs dies, and moves nothing (decision 0176)', () =>
    database((sql) =>
      Effect.gen(function*() {
        const provided = <A, E>(effect: Effect.Effect<A, E, SqlClient.SqlClient>) =>
          Effect.provideService(effect, SqlClient.SqlClient, sql)
        yield* storage(asker, sql).write('a', created(), 0)
        yield* provided(recordVersions('old:1', [{ name: 'Asker', version: 3 }]))
        yield* provided(recordVersions('new:1', [{ name: 'Buyer', version: 2 }]))
        expect(reasonOf(yield* Effect.exit(rename(sql, [['Asker', 'Buyer']], true)))).toBe(
          "the launch renames 'Asker' to 'Buyer', and a launch has run 'Asker' at version 3, newer than 2",
        )
        expect((yield* stored(sql)).map(({ name }) => name)).toEqual(['Asker'])
        expect(yield* provided(standingOf('Asker'))).toEqual({ version: 3, renamedTo: null })
      }).pipe(Effect.orDie)))

  // SQLite's `json_set` would write the text without its spaces. PostgreSQL's process finds that `JSON.stringify`
  // does not give the text back (decision 0157).
  test('a request whose text the runtime does not write makes the rename die, and moves nothing', () =>
    database((sql) =>
      Effect.gen(function*() {
        yield* storage(asker, sql).write('a', created(), 0)
        yield* storage(receiver, sql).write('r', created(), 0)
        const spaced = JSON.stringify(askedBy('Asker'), null, 1)
        yield* sql`UPDATE effecttea_entities SET creation = ${spaced} WHERE name = 'Receiver'`
        expect(reasonOf(yield* Effect.exit(rename(sql, [['Asker', 'Buyer']])))).toBe(
          dialectOf(sql) === 'pg'
            ? "the launch renames 'Asker' to 'Buyer', and a request of 'effecttea_entities' is no text the runtime writes"
            : "the launch renames 'Asker' to 'Buyer', and SQLite writes a request's text otherwise than the runtime",
        )
        expect((yield* stored(sql)).map(({ name, creation }) => [name, creation])).toEqual([
          ['Asker', JSON.stringify(creation)],
          ['Receiver', spaced],
        ])
      }).pipe(Effect.orDie)))

  test('a rename moves the log of the old name, and a consumer goes on from its cursor under the new one', () =>
    database((sql) =>
      Effect.gen(function*() {
        const store = storage(topical, sql)
        yield* store.declare([{ topic: 'upper', consumer: 'c' }])
        yield* store.write('r', publishing(null, { upper: 'START', size: 5 }, ['upper', 'size']), 0)
        yield* store.write('r', publishing('hi', { upper: 'HI', size: 2 }, ['upper', 'size']), 0)
        yield* store.ack('upper', 'c', (yield* store.fetch('upper', 'c', all)).slice(0, 1))
        yield* rename(sql, [['Receiver', 'Buyer']])
        const moved = storage({ ...topical, name: 'Buyer' }, sql)
        const rows = (read: ReadonlyArray<{ seq: number; value: unknown }>) => read.map(({ seq, value }) => [seq, value])
        // The consumer, its cursor, and the rows of both topics are under the new name.
        expect(rows(yield* moved.fetch('upper', 'c', all))).toEqual([[2, 'HI']])
        expect(yield* moved.consumers).toEqual([
          {
            topic: 'upper',
            consumer: 'c',
            behind: 1,
            since: DateTime.makeUnsafe(0),
            cursors: [{ partition: partitionOf('r', 300), seq: 1 }],
          },
        ])
        expect(rows(yield* moved.published('size', [], all))).toEqual([[1, 5], [2, 2]])
        // The head of the partition moved with its rows: the next step takes the `seq` after the last.
        yield* moved.write('r', publishing('ho', { upper: 'HO', size: 2 }, ['upper']), 0)
        expect(rows(yield* moved.published('upper', [], all))).toEqual([[1, 'START'], [2, 'HI'], [3, 'HO']])
        expect(yield* store.consumers).toEqual([])
        expect(yield* store.published('upper', [], all)).toEqual([])
      }).pipe(Effect.orDie)))
})

/**
 * The readings of the read model over rows that fast-check generates. Each property holds whatever the rows hold,
 * so none of them repeats the order of the kinds that the tests above write out (decisions 0143, 0145, 0148, 0150).
 */
describe('readings over generated rows', () => {
  /** Text a database holds: no U+0000 and no lone surrogate, which a row never holds (decisions 0157, 0206). */
  const text = fc.string({ unit: fc.constantFrom('a', 'b', 'B', 'é', 'ß', '😀', '0', ' '), maxLength: 3 })
  const id = fc.string({ unit: fc.constantFrom('a', 'b', 'B', 'é', '😀', '0'), minLength: 1, maxLength: 3 })
  const number = fc.oneof(fc.integer({ min: -2, max: 2 }), fc.double({ noNaN: true, noDefaultInfinity: true }))
  const rank: fc.Arbitrary<Scalar | undefined> = fc.oneof(
    fc.constant(null),
    fc.constant(undefined),
    fc.boolean(),
    number,
    text,
  )
  const rows = fc.uniqueArray(fc.tuple(id, rank), { selector: ([id]) => id, maxLength: 12 })
  const comparison = fc.constantFrom<Comparison>('=', '<>', '<', '<=', '>', '>=')
  const criterion = fc.record({ is: comparison, value: rank })
    .map(({ is, value }) => ({ index: 'rank' as const, is, value: value ?? null }))
  const where = fc.array(criterion, { maxLength: 2 })

  type Store = ReturnType<typeof storage<Ranked>>

  const write = (store: Store, entries: ReadonlyArray<readonly [string, Scalar | undefined]>) =>
    Effect.forEach(entries, ([id, rank]) =>
      store.write(
        id,
        created({ shown: { projection: JSON.stringify(rank ?? null), indexes: rank === undefined ? {} : { rank } } }),
        0,
      ))

  /** What a query compares of a row: its rank, a boolean read as its number, as a query orders it (decision 0150). */
  const key = (value: Scalar) => JSON.stringify(typeof value === 'boolean' ? Number(value) : value)

  const property = <A>(arbitrary: fc.Arbitrary<A>, body: (store: Store, value: A) => Effect.Effect<void>) =>
    fc.assert(
      fc.asyncProperty(arbitrary, (value) => database((sql) => body(storage(ranked, sql), value))),
      { numRuns: Bun.env['SCHEDULES'] === 'all' ? 200 : 8 },
    )

  test('the pages of a query, read one after the other, give the query read at once, in either order', () =>
    property(
      fc.tuple(rows, where, fc.option(fc.boolean(), { nil: undefined }), fc.integer({ min: 1, max: 4 })),
      (store, [entries, where, descending, limit]) =>
        Effect.gen(function*() {
          yield* write(store, entries)
          const order = descending === undefined ? {} : { order: { index: 'rank' as const, descending } }
          const whole = yield* store.query({ where, ...order, limit: all })
          const pages: Array<Found<Ranked>> = []
          let after: Found<Ranked> | undefined
          do {
            const page = yield* store.query({ where, ...order, limit, after })
            expect(page.length).toBeLessThanOrEqual(limit)
            pages.push(...page)
            after = page.at(-1)
          } while (after !== undefined && pages.length <= entries.length)
          expect(pages).toEqual([...whole])
          if (descending !== undefined) {
            const other = yield* store.query({ where, order: { index: 'rank', descending: !descending }, limit: all })
            expect(other).toEqual([...whole].reverse())
          }
        }),
    ), 120_000)

  test('a criterion that orders finds a prefix or a suffix of the rows that hold a value, in the order of a query', () =>
    property(fc.tuple(rows, criterion), (store, [entries, { is, value }]) =>
      Effect.gen(function*() {
        yield* write(store, entries)
        const ids = (where: ReadonlyArray<Criterion<Ranked>>) =>
          Effect.map(store.query({ where, order: { index: 'rank' }, limit: all }), (rows) => rows.map(({ id }) => id))
        const every = yield* ids([])
        const held = yield* ids([{ index: 'rank', is: '<>', value: null }])
        const found = yield* ids([{ index: 'rank', is, value }])
        // Against null, `=` and `<>` ask whether a row holds a value, and an order finds nothing.
        if (value === null) {
          expect(found).toEqual(is === '=' ? every.filter((id) => !held.includes(id)) : is === '<>' ? held : [])
          return
        }
        if (is === '<' || is === '<=') expect(found).toEqual(held.slice(0, found.length))
        if (is === '>' || is === '>=') expect(found).toEqual(held.slice(held.length - found.length))
        const both = (left: Comparison, right: Comparison) =>
          Effect.map(
            Effect.all([ids([{ index: 'rank', is: left, value }]), ids([{ index: 'rank', is: right, value }])]),
            ([left, right]) => [...left, ...right].sort(),
          )
        // The comparisons split the rows that hold a value as an order splits them.
        const sorted = [...held].sort()
        expect(yield* both('<', '>=')).toEqual(sorted)
        expect(yield* both('<=', '>')).toEqual(sorted)
        expect(yield* both('=', '<>')).toEqual(sorted)
      })), 120_000)

  test('a count, a count per value and a sum read the rows a query finds', () =>
    property(fc.tuple(rows, where), (store, [entries, where]) =>
      Effect.gen(function*() {
        yield* write(store, entries)
        const found = yield* store.query({ where, order: { index: 'rank' }, limit: all })
        expect(yield* store.count({ where })).toBe(found.length)
        const tallies = yield* store.countBy({ index: 'rank', where, limit: all })
        // `true` and `1` are two values of a count, and a query orders them as one (decision 0150).
        const counted = new Map<string, number>()
        for (const { indexes } of found) {
          const value = JSON.stringify(indexes.rank)
          counted.set(value, (counted.get(value) ?? 0) + 1)
        }
        expect(new Map(tallies.map(({ value, count }) => [JSON.stringify(value), count]))).toEqual(counted)
        const keys = (values: ReadonlyArray<Scalar>) => values.map(key).filter((key, at, all) => all.indexOf(key) === at)
        expect(keys(tallies.map(({ value }) => value))).toEqual(keys(found.map(({ indexes }) => indexes.rank)))
        const numbers = found.flatMap(({ indexes }) => typeof indexes.rank === 'number' ? [indexes.rank] : [])
        if (numbers.length === found.filter(({ indexes }) => indexes.rank !== null).length) {
          const total = yield* store.sum({ index: 'rank', where })
          const magnitudes = numbers.reduce((total, n) => total + Math.abs(n), 0)
          const exact = numbers.reduce((total, n) => total + n, 0)
          expect(Math.abs(total - exact)).toBeLessThanOrEqual(8 * Number.EPSILON * magnitudes)
        }
      })), 120_000)

  test('numbers are ordered as numbers and text by its bytes of UTF-8, the id breaking ties', () =>
    property(
      fc.oneof(
        fc.uniqueArray(fc.tuple(id, number), { selector: ([id]) => id, maxLength: 10 }),
        fc.uniqueArray(fc.tuple(id, text), { selector: ([id]) => id, maxLength: 10 }),
      ),
      (store, entries) =>
        Effect.gen(function*() {
          yield* write(store, entries)
          const bytes = (left: string, right: string) => Buffer.compare(Buffer.from(left), Buffer.from(right))
          const compare = (left: Scalar, right: Scalar) =>
            typeof left === 'number' && typeof right === 'number' ? left - right : bytes(String(left), String(right))
          const expected = [...entries]
            .sort(([a, left], [b, right]) => compare(left, right) || bytes(a, b))
            .map(([id]) => id)
          const found = yield* store.query({ order: { index: 'rank' }, limit: all })
          expect(found.map(({ id }) => id)).toEqual(expected)
        }),
    ), 120_000)
})
