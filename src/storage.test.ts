/**
 * The storage writes what the machine says an event writes, and decides nothing but what only it sees: another
 * entity's keys (decision 0057). Here it is given rows by hand, and what it holds afterwards is read back.
 */
import { SqliteClient } from '@effect/sql-sqlite-bun'
import { expect, test } from 'bun:test'
import * as Cause from 'effect/Cause'
import * as Effect from 'effect/Effect'
import * as Schema from 'effect/Schema'
import { SqlClient } from 'effect/sql'
import * as Machine from './machine.ts'
import { noWork, operation, type Program } from './program.ts'
import { createTables, storage } from './storage.ts'

type T = {
  state: Readonly<{ last: string }>
  flags: null
  inbound: string
  internal: string
  operation: Readonly<{ _tag: 'Ask' }>
  key: 'ask'
  rejection: never
  sender: null
  projection: string
  index: never
  services: never
}

const named = (name: string): Program<T> => ({
  name,
  keys: ['ask'],
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

/** The request named `name` of the asker's work in `incarnation`, as the machine keys its reply (decision 0059). */
const sent = (name: string, incarnation: number) =>
  Machine.requestKey(receiver, {
    _tag: 'Operation',
    entity: { name: 'Asker', id: 'a' },
    key: 'ask',
    incarnation,
    name,
  })

const reply = (name: string, incarnation: number): Machine.ReplyRow => ({
  request: sent(name, incarnation),
  tag: 'Accepted',
  reason: null,
  asked: { name: 'Asker', id: 'a', key: 'ask', incarnation },
})

const inbound = (message: string): Machine.EnvelopeRow => ({
  _tag: 'Inbound',
  message,
  request: { _tag: 'Caller', sender: null, id: message },
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
        created({ keys: [{ key: 'ask', incarnation: 1, work, delivery: 'Idempotent', due: null }] }),
      )
      const forgotten = yield* storage(receiver, sql).write(
        'r',
        created({ replies: [reply('held', 1), reply('ended', 2)] }),
      )
      expect(forgotten).toEqual([{ name: 'Receiver', id: 'r', request: sent('ended', 2) }])
      expect(Object.keys((yield* storage(receiver, sql).load('r'))?.replies ?? {})).toEqual([sent('held', 1)])
    })))

test('the work that ended takes the replies to its requests with it, and no others', () =>
  database((sql) =>
    Effect.gen(function*() {
      const work = { _tag: 'Operation', operation: { _tag: 'Ask' } }
      yield* storage(asker, sql).write(
        'a',
        created({ keys: [{ key: 'ask', incarnation: 1, work, delivery: 'Idempotent', due: null }] }),
      )
      yield* storage(receiver, sql).write('r', created({ replies: [reply('first', 1)] }))
      yield* storage(receiver, sql).write('s', created({ replies: [reply('other', 1)] }))
      const forgotten = yield* storage(asker, sql).write(
        'a',
        written({
          keys: [{ key: 'ask', incarnation: 1, work: null, delivery: null, due: null }],
          ended: [{ key: 'ask', incarnation: 1 }],
        }),
      )
      expect(forgotten).toEqual([
        { name: 'Receiver', id: 'r', request: sent('first', 1) },
        { name: 'Receiver', id: 's', request: sent('other', 1) },
      ])
      // Work of another incarnation asked nothing that is stored.
      expect(yield* storage(asker, sql).write('a', written({ ended: [{ key: 'ask', incarnation: 2 }] }))).toEqual([])
    })))

test('the mailbox keeps the order its messages were queued in, as its head is handled', () =>
  database((sql) =>
    Effect.gen(function*() {
      const store = storage(receiver, sql)
      yield* store.write('r', created({ queued: [inbound('one'), inbound('two')] }))
      yield* store.write('r', written({ handled: 1, queued: [inbound('three')] }))
      yield* store.write('r', written({ queued: [inbound('four')] }))
      yield* store.write('r', written({ handled: 1 }))
      const mailbox = (yield* store.load('r'))?.mailbox ?? []
      expect(mailbox.map((envelope) => envelope.message)).toEqual(['three', 'four'])
    })))

test('the state is written with the request that created the entity, and only when an event changed it', () =>
  database((sql) =>
    Effect.gen(function*() {
      const store = storage(receiver, sql)
      yield* store.write('r', created())
      yield* store.write('r', written({ suspension: { on: { _tag: 'Message' }, cause: 'broken' } }))
      expect(yield* store.load('r')).toMatchObject({
        state: { last: 'start' },
        suspension: { on: { _tag: 'Message' }, cause: 'broken' },
      })
      yield* store.write('r', written({ entity: { state: { last: 'next' }, creation } }))
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
      yield* store.write('r', created({ queued: [inbound('one')] }))
      // Each row is broken by hand in one of the ways a reading used to fill in or cast.
      const broken = [
        sql`UPDATE mailbox SET tag = 'Outbound' WHERE name = 'Receiver' AND id = 'r'`,
        sql`UPDATE mailbox SET request = NULL WHERE name = 'Receiver' AND id = 'r'`,
        sql`UPDATE entities SET suspended_on = '{"_tag":"Message"}' WHERE name = 'Receiver' AND id = 'r'`,
        sql`INSERT INTO replies ${
          sql.insert({ name: 'Receiver', id: 'r', request: '"x"', tag: 'Maybe', version: 1, reason: null })
        }`,
        sql`INSERT INTO entity_keys ${
          sql.insert({
            name: 'Receiver',
            id: 'r',
            key: 'ask',
            incarnation: 1,
            version: 1,
            work: null,
            delivery: 'Twice',
          })
        }`,
      ]
      for (const breaking of broken) {
        yield* sql`SAVEPOINT broken`
        yield* breaking
        const exit = yield* Effect.exit(store.load('r'))
        expect(exit._tag).toBe('Failure')
        if (exit._tag === 'Failure') expect(String(Cause.squash(exit.cause))).toContain('no row the runtime writes')
        yield* sql`ROLLBACK TO broken`
        yield* sql`RELEASE broken`
      }
      expect((yield* store.load('r'))?.mailbox.map((envelope) => envelope.message)).toEqual(['one'])
      // A creation's row of the outbox handles no message.
      yield* sql`INSERT INTO outbox ${
        sql.insert({ name: 'Receiver', id: 'r', tag: 'Creation', version: 1, message: '"one"', projection: '"one"' })
      }`
      expect((yield* Effect.exit(store.published(0)))._tag).toBe('Failure')
    }).pipe(Effect.orDie)))
