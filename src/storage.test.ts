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
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/sql'
import * as Machine from './machine.ts'
import { InvariantDefect, isTimer, type Json, type Migration, noWork, operation, type Program, type Scalar } from './program.ts'
import { createTables, type Found, partitionOf, type Query, storage } from './storage.ts'
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
  durable: () => noWork,
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
  shown: null,
  published: null,
  ...rows,
})

/** The first rows of an entity, as a creation writes them. */
const created = (rows: Partial<Machine.Written> = {}): Machine.Written =>
  written({
    created: true,
    entity: { state: { last: 'start' }, creation },
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

const database = <A>(body: (sql: SqlClient.SqlClient) => Effect.Effect<A>) =>
  Effect.runPromise(
    Effect.flatMap(createTables, () => Effect.flatMap(SqlClient.SqlClient, body)).pipe(
      Effect.provide(SqliteClient.layer({ filename: ':memory:' })),
      Effect.orDie,
    ),
  )

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
      expect(yield* store.reply('r', asked('held', 1), 0)).toEqual({ _tag: 'Accepted' })
      expect(yield* store.reply('r', asked('ended', 2), 0)).toBeNull()
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
        tag: 'Accepted',
        reason: null,
        asked: { name: 'Asker', id: 'a', key, incarnation },
        until: null,
      })
      yield* receiving.write('r', created({ replies: [kept(plain, 1), kept(empty, 2), kept(record, 4)] }), 0)
      yield* store.write('a', written({ gone: [empty], incarnations: 4, ended: [{ key: empty, incarnation: 2 }] }), 0)
      expect(yield* receiving.reply('r', asking(plain, 1), 0)).toEqual({ _tag: 'Accepted' })
      expect(yield* receiving.reply('r', asking(empty, 2), 0)).toBeNull()
      expect(yield* receiving.reply('r', asking(record, 4), 0)).toEqual({ _tag: 'Accepted' })
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
      expect(yield* store.reply('r', asked('first', 1), 0)).toEqual({ _tag: 'Accepted' })
      yield* storage(asker, sql).write(
        'a',
        written({ gone: [{ name: 'ask' }], incarnations: 1, ended: [{ key: { name: 'ask' }, incarnation: 1 }] }),
        0,
      )
      expect(yield* store.reply('r', asked('first', 1), 0)).toBeNull()
      expect(yield* store.reply('s', asked('other', 1), 0)).toBeNull()
      // A key whose work is gone has no row, and the entity keeps the last incarnation it drew (decision 0132).
      const loaded = yield* storage(asker, sql).load('a')
      expect(loaded?.keys).toEqual({})
      expect(loaded?.incarnations).toBe(1)
    })))

// A request is found by its text, and a caller's by its sender as a version before stored it (decision 0065).
test('a reply is read by its request alone, and a caller is given its own', () =>
  database((sql) =>
    Effect.gen(function*() {
      const store = storage(receiver, sql)
      const caller = (id: string) => ({ _tag: 'Caller', sender: null, id }) as const
      const accepted = (id: string): Machine.ReplyRow => ({
        request: Machine.requestKey(receiver, caller(id)),
        tag: 'Accepted',
        reason: null,
        asked: null,
        until: null,
      })
      yield* store.write('r', created({ replies: [accepted('one')] }), 0)
      expect(yield* store.reply('r', caller('one'), 0)).toEqual({ _tag: 'Accepted' })
      expect(yield* store.reply('r', caller('two'), 0)).toBeNull()
      expect(yield* store.reply('s', caller('one'), 0)).toBeNull()
      // An operation's request named as the caller's request id is another request.
      expect(yield* store.reply('r', asked('one', 1), 0)).toBeNull()
    })))

describe('how long a caller’s reply is kept (decision 0125)', () => {
  const caller = (id: string) => ({ _tag: 'Caller', sender: null, id }) as const
  const until = (id: string, time: number | null): Machine.ReplyRow => ({
    request: Machine.requestKey(receiver, caller(id)),
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
        expect(yield* store.reply('r', caller('kept'), 499)).toEqual({ _tag: 'Accepted' })
        expect(yield* store.reply('r', caller('kept'), 500)).toBeNull()
        expect(yield* store.reply('r', caller('forever'), Number.MAX_SAFE_INTEGER)).toEqual({ _tag: 'Accepted' })
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
          replies: [{ request: Machine.requestKey(first, by('a')), tag: 'Accepted', reason: null, asked: null, until: 500 }],
        }), 0)
        // Version 2 renames the sender 'a' to 'b', so its retry is found by its request id (decision 0065).
        const after = storage(callers([{ sender: (json) => json === 'a' ? 'b' : json }]), sql)
        expect(yield* after.reply('r', by('b'), 499)).toEqual({ _tag: 'Accepted' })
        expect(yield* after.reply('r', by('b'), 500)).toBeNull()
      })))

  test('a step that stores a reply deletes the replies of its entity past their time, and no others', () =>
    database((sql) =>
      Effect.gen(function*() {
        const store = storage(receiver, sql)
        yield* store.write('r', created({ replies: [until('gone', 500), until('kept', 900)] }), 0)
        yield* store.write('s', created({ replies: [until('other', 500)] }), 0)
        // A step that stores no reply deletes nothing.
        yield* store.write('r', written({ shown: { projection: 'start', indexes: {} } }), 600)
        const left = () => sql<{ id: string; request: string }>`SELECT id, request FROM replies ORDER BY id, request`
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
        expect(yield* store.reply('r', caller('kept'), 600)).toEqual({ _tag: 'Accepted' })
        expect(yield* store.reply('r', caller('ever'), 600)).toEqual({ _tag: 'Accepted' })
        expect(yield* storage(asker, sql).expire(0)).toBe(0)
        expect(yield* storage(asker, sql).expire(600)).toBe(1)
      })))

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
      yield* store.write('r', written({ entity: { state: { last: 'next' }, creation } }), 0)
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
        sql`INSERT INTO consumers ${sql.insert({ name: 'Receiver', topic: 'projection', consumer: 'c' })}`,
        sql`INSERT INTO cursors ${
          sql.insert({ name: 'Receiver', topic: 'projection', consumer: 'c', partition, seq: -1 })
        }`,
      )
      // Each row is broken by hand in one of the ways a reading used to fill in or cast, and read by what reads it.
      const broken = [
        [sql`UPDATE mailbox SET tag = 'Outbound' WHERE name = 'Receiver' AND id = 'r'`, store.load('r')],
        [sql`UPDATE mailbox SET request = NULL WHERE name = 'Receiver' AND id = 'r'`, store.load('r')],
        [
          sql`UPDATE entities SET suspended_on = '{"_tag":"Message"}' WHERE name = 'Receiver' AND id = 'r'`,
          store.load('r'),
        ],
        [
          sql`INSERT INTO replies ${
            sql.insert({
              name: 'Receiver',
              id: 'r',
              request: Machine.requestKey(receiver, caller),
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
          sql`INSERT INTO entity_keys ${
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
        [sql`UPDATE mailbox SET key = 'ask' WHERE name = 'Receiver' AND id = 'r'`, store.load('r')],
        [
          sql`UPDATE mailbox SET tag = 'Outbound', request = NULL, key = 'ask', incarnation = 1
              WHERE name = 'Receiver' AND id = 'r'`,
          store.load('r'),
        ],
        [
          sql`UPDATE mailbox SET tag = 'Internal', key = 'ask', incarnation = 1 WHERE name = 'Receiver' AND id = 'r'`,
          store.load('r'),
        ],
        [
          sql`INSERT INTO replies ${
            sql.insert({
              name: 'Receiver',
              id: 'r',
              request: Machine.requestKey(receiver, caller),
              tag: 'Accepted',
              version: 1,
              reason: '"why"',
            })
          }`,
          store.reply('r', caller, 0),
        ],
        // A version from 1, and a count from 0, wherever they are read.
        [sql`UPDATE entities SET version = 0 WHERE name = 'Receiver' AND id = 'r'`, store.load('r')],
        [sql`UPDATE entities SET version = 0 WHERE name = 'Receiver' AND id = 'r'`, store.reindex],
        [sql`UPDATE projections SET version = 0 WHERE name = 'Receiver' AND id = 'r'`, store.query({ limit: all })],
        [
          sql`INSERT INTO entity_keys ${
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
        [sql`UPDATE entities SET incarnations = -1 WHERE name = 'Receiver' AND id = 'r'`, store.load('r')],
        [
          sql`UPDATE mailbox SET seq = -5 WHERE name = 'Receiver' AND id = 'r'`,
          store.write('r', written({ queued: [inbound('two')] }), 0),
        ],
        [behind, store.feed('projection', 'c', all)],
        [behind, store.consumers],
        [sql`UPDATE heads SET seq = -1 WHERE name = 'Receiver'`, store.published('projection', [], all)],
        // A timer's time is a whole number of milliseconds, read by the waker.
        [
          sql`INSERT INTO entity_keys ${
            sql.insert({
              name: 'Receiver',
              id: 'r',
              key: 'ask',
              parameter: '',
              incarnation: 1,
              version: 1,
              work: '{"_tag":"Timer","at":1,"message":"rang"}',
              delivery: null,
              due: 1.5,
            })
          }`,
          store.due(0, []),
        ],
        // A step's row of the outbox always handles a message.
        [
          sql`INSERT INTO outbox ${
            sql.insert({
              name: 'Receiver',
              topic: 'projection',
              partition,
              seq: 2,
              id: 'r',
              tag: 'Inbound',
              version: 1,
              message: null,
              projection: '"one"',
            })
          }`,
          store.published('projection', [], all),
        ],
      ] as const
      for (const [breaking, reading] of broken) {
        // Broken and read in a transaction that fails with what the reading gave, so that nothing of it stays.
        const exit = yield* Effect.flip(sql.withTransaction(
          Effect.andThen(breaking, Effect.flatMap(Effect.exit<unknown, never, never>(reading), Effect.fail)),
        ))
        expect(Exit.isExit(exit) && exit._tag).toBe('Failure')
        if (Exit.isExit(exit) && exit._tag === 'Failure') {
          expect(String(Cause.squash(exit.cause))).toContain('no row the runtime writes')
        }
      }
      expect((yield* store.load('r'))?.mailbox.map((envelope) => envelope.message)).toEqual(['one'])
      // A creation's row of the outbox handles no message.
      yield* sql`INSERT INTO outbox ${
        sql.insert({
          name: 'Receiver',
          topic: 'projection',
          partition,
          seq: 2,
          id: 'r',
          tag: 'Creation',
          version: 1,
          message: '"one"',
          projection: '"one"',
        })
      }`
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
        tag: 'Accepted',
        reason: null,
        asked: null,
        until: null,
      })
      yield* storage(first, sql).write('r', created({ replies: [accepted(first, 'a')] }), 0)
      const after = storage(second, sql)
      // The caller that is 'a' in version 2 has the text of the row of 'a' in version 1, and is not answered by it.
      expect(yield* after.reply('r', caller('a'), 0)).toBeNull()
      yield* after.write('r', written({ replies: [accepted(second, 'a')] }), 0)
      expect(yield* after.reply('r', caller('a'), 0)).toEqual({ _tag: 'Accepted' })
      // The caller version 1 stored as 'a' is 'b' now, and its retry still finds its own reply.
      expect(yield* after.reply('r', caller('b'), 0)).toEqual({ _tag: 'Accepted' })
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
        yield* plan(`SELECT request, tag, version, reason FROM replies
                     WHERE name = 'Receiver' AND id = 'r' AND request = '{}'`),
      ).toContain('USING INDEX sqlite_autoindex_replies_1 (name=? AND id=? AND request=?)')
      expect(
        yield* plan(`SELECT request, tag, version, reason FROM replies
                     WHERE name = 'Receiver' AND id = 'r' AND json_extract(request, '$.id') = 'x'
                       AND version <> 2 AND json_extract(request, '$._tag') = 'Caller'`),
      ).toContain('USING INDEX replies_request_id (name=? AND id=? AND <expr>=?)')
    }).pipe(Effect.orDie)))

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
        // Every row stores the projection, read through the projection's migrations whatever its topic, and gives
        // what the topic of the program deployed selects of it (decision 0140).
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

  test('a consumer is a name within its topic, and a prune drops in each topic what its consumers read', () =>
    database((sql) =>
      Effect.gen(function*() {
        const store = storage(topical, sql)
        yield* store.write('r', publishing(null, { upper: 'START', size: 5 }, ['upper', 'size']), 0)
        yield* store.write('r', publishing('ho', { upper: 'HO', size: 5 }, ['upper']), 0)
        const partition = partitionOf('r', 300)
        // One name in two topics is two consumers, each with its own cursors.
        const upper = yield* store.feed('upper', 'c', all)
        expect(upper).toHaveLength(2)
        expect(yield* store.feed('size', 'c', all)).toHaveLength(1)
        yield* store.ack('upper', 'c', upper)
        expect(yield* store.feed('upper', 'c', all)).toEqual([])
        expect(yield* store.feed('size', 'c', all)).toHaveLength(1)
        expect(yield* store.consumers).toEqual([
          { topic: 'size', consumer: 'c', behind: 1, cursors: [{ partition, seq: 0 }] },
          { topic: 'upper', consumer: 'c', behind: 0, cursors: [] },
        ])
        // The consumer of `size` holds its topic, and not the other.
        expect(yield* store.prune).toBe(2)
        expect(yield* store.published('upper', [], all)).toEqual([])
        expect(yield* store.published('size', [], all)).toHaveLength(1)
        // A topic no consumer reads keeps every row, as a log no consumer reads did.
        yield* store.forget('size', 'c')
        expect(yield* store.prune).toBe(0)
        expect(yield* store.published('size', [], all)).toHaveLength(1)
        expect(yield* store.consumers).toEqual([{ topic: 'upper', consumer: 'c', behind: 0, cursors: [] }])
      })))
})

// A state is compared by its text and the version that wrote it: one text is another state at another version
// (decision 0070).
test('reindex skips an entity that a step wrote since, though its state has the same text at another version', () =>
  database((sql) =>
    Effect.gen(function*() {
      const first = storage(receiver, sql)
      yield* first.write('a', created({ entity: { state: { last: 'x' }, creation } }), 0)
      yield* first.write('b', created({ entity: { state: { last: 'x' }, creation } }), 0)
      // As 'a''s row is written, version 2 steps 'b' to the state it writes as the same text, which it reads as
      // its own, with no migration: the step lands between the reading of 'b' and the writing of its row.
      yield* sql.unsafe(`
        CREATE TEMP TRIGGER step AFTER INSERT ON projections WHEN NEW.id = 'a' BEGIN
          UPDATE entities SET version = 2 WHERE name = 'Receiver' AND id = 'b';
          UPDATE projections SET projection = '"x"', version = 2 WHERE name = 'Receiver' AND id = 'b';
        END
      `)
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
        yield* first.write(id, created({ entity: { state: { last: id }, creation } }), 0)
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
      yield* sql`UPDATE entities SET state = 'no json' WHERE name = 'Receiver' AND id = 'a'`
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
test('an index of the program holds the value and the id, and the index a database had without the id goes', () =>
  database((sql) =>
    Effect.gen(function*() {
      const column = `json_extract(indexes, '$.rank')`
      yield* sql.unsafe(`CREATE INDEX "projections Ranked rank" ON projections (name, ${column})`)
      yield* storage(ranked, sql).indexed
      const made = yield* sql<{ name: string; sql: string }>`
        SELECT name, sql FROM sqlite_master WHERE type = 'index' AND name LIKE 'projections %'
      `
      expect(made).toEqual([{
        name: 'projections Ranked rank by id',
        sql: `CREATE INDEX "projections Ranked rank by id" ON projections (name, ${column}, id)`,
      }])
    }).pipe(Effect.orDie)))

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
      sql`UPDATE projections SET indexes = '{"rank":2}' WHERE id = 'b'`,
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
      const stored = yield* sql<{ id: string; indexes: string }>`SELECT id, indexes FROM projections ORDER BY id`
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
        { id: 'operation', on: onOperation.on, cause: 'died', since: 3 },
        { id: 'inbound', on: { _tag: 'Message', kind: 'Inbound' }, cause: 'broken', since: 5 },
      ])
      // A step while the entity stays suspended, a completion recorded or a state written, keeps the time.
      const completion: Machine.EnvelopeRow = { _tag: 'Internal', message: 'done', key: { name: 'ask' }, incarnation: 1 }
      yield* store.write('inbound', written({ queued: [completion], suspension: onMessage }), 9)
      yield* store.write(
        'operation',
        written({ entity: { state: { last: 'again' }, creation }, suspension: onOperation }),
        10,
      )
      expect((yield* listed).map(({ id, since }) => [id, since])).toEqual([['operation', 3], ['inbound', 5]])
      // The step that takes the entity out of its suspension clears it, and a later suspension is timed anew.
      yield* store.write('inbound', written({ handled: 1 }), 12)
      expect((yield* listed).map(({ id }) => id)).toEqual(['operation'])
      yield* store.write('inbound', written({ suspension: onMessage }), 20)
      expect(yield* listed).toEqual([
        { id: 'operation', on: onOperation.on, cause: 'died', since: 3 },
        { id: 'inbound', on: { _tag: 'Message', kind: 'Internal' }, cause: 'broken', since: 20 },
      ])
    })))

// A move of Effect's version that changes `Hash.string` changes these, and is seen: the partition is stored, so
// the entities created before keep theirs (decision 0137).
test('the partition of an id is Cluster’s formula on Hash.string, pinned for a few ids', () => {
  expect(['toy-1', 'a', 'b', 'r', 'o-1'].map((id) => partitionOf(id, 300))).toEqual([164, 5, 8, 24, 71])
  expect(['toy-1', 'a', 'b'].map((id) => partitionOf(id, 1))).toEqual([1, 1, 1])
})

/** A row of the log as a step writes it, at the `position` given: the order the store gave the rows in. */
const logged = (sql: SqlClient.SqlClient, id: string, seq: number, position: number) =>
  Effect.andThen(
    sql`INSERT INTO outbox ${
      sql.insert({
        position,
        name: 'Receiver',
        topic: 'projection',
        partition: partitionOf(id, 300),
        seq,
        id,
        tag: 'Creation',
        version: 1,
        message: null,
        projection: '"start"',
      })
    }`,
    sql`
      INSERT INTO heads ${sql.insert({ name: 'Receiver', partition: partitionOf(id, 300), seq })}
      ON CONFLICT (name, partition) DO UPDATE SET seq = max(seq, excluded.seq)
    `,
  )

// On a store where two steps commit at once, a step of one partition may take its row's place in the order before
// a step of another, and commit after it (decision 0137).
test('a row that commits after one a consumer has read is read then, from its partition’s cursor', () =>
  database((sql) =>
    Effect.gen(function*() {
      const store = storage(receiver, sql)
      const seen = (read: ReadonlyArray<{ id: string; seq: number }>) => read.map(({ id, seq }) => `${id}${seq}`)
      yield* logged(sql, 'a', 1, 10)
      const first = yield* store.feed('projection', 'c', all)
      expect(seen(first)).toEqual(['a1'])
      yield* store.ack('projection', 'c', first)
      // The row of `b` was given its place before the one of `a`, and is committed only now.
      yield* logged(sql, 'b', 1, 5)
      expect(seen(yield* store.feed('projection', 'c', all))).toEqual(['b1'])
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
