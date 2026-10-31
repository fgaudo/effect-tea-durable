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
import { type Migration, noWork, operation, type Program } from './program.ts'
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
const asked = (name: string, incarnation: number) =>
  ({ _tag: 'Operation', entity: { name: 'Asker', id: 'a' }, key: 'ask', incarnation, name }) as const

const sent = (name: string, incarnation: number) => Machine.requestKey(receiver, asked(name, incarnation))

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
      const store = storage(receiver, sql)
      yield* store.write('r', created({ replies: [reply('held', 1), reply('ended', 2)] }))
      expect(yield* store.reply('r', asked('held', 1))).toEqual({ _tag: 'Accepted' })
      expect(yield* store.reply('r', asked('ended', 2))).toBeNull()
    })))

test('the work that ended takes the replies to its requests with it, and no others', () =>
  database((sql) =>
    Effect.gen(function*() {
      const work = { _tag: 'Operation', operation: { _tag: 'Ask' } }
      yield* storage(asker, sql).write(
        'a',
        created({ keys: [{ key: 'ask', incarnation: 1, work, delivery: 'Idempotent', due: null }] }),
      )
      const store = storage(receiver, sql)
      yield* store.write('r', created({ replies: [reply('first', 1)] }))
      yield* store.write('s', created({ replies: [reply('other', 1)] }))
      // Work of another incarnation asked nothing that is stored.
      yield* storage(asker, sql).write('a', written({ ended: [{ key: 'ask', incarnation: 2 }] }))
      expect(yield* store.reply('r', asked('first', 1))).toEqual({ _tag: 'Accepted' })
      yield* storage(asker, sql).write(
        'a',
        written({
          keys: [{ key: 'ask', incarnation: 1, work: null, delivery: null, due: null }],
          ended: [{ key: 'ask', incarnation: 1 }],
        }),
      )
      expect(yield* store.reply('r', asked('first', 1))).toBeNull()
      expect(yield* store.reply('s', asked('other', 1))).toBeNull()
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
      })
      yield* store.write('r', created({ replies: [accepted('one')] }))
      expect(yield* store.reply('r', caller('one'))).toEqual({ _tag: 'Accepted' })
      expect(yield* store.reply('r', caller('two'))).toBeNull()
      expect(yield* store.reply('s', caller('one'))).toBeNull()
      // An operation's request named as the caller's request id is another request.
      expect(yield* store.reply('r', asked('one', 1))).toBeNull()
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
      const caller = { _tag: 'Caller', sender: null, id: 'x' } as const
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
          store.reply('r', caller),
        ],
        [
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
          store.load('r'),
        ],
      ] as const
      for (const [breaking, reading] of broken) {
        yield* sql`SAVEPOINT broken`
        yield* breaking
        const exit = yield* Effect.exit<unknown, never, never>(reading)
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
      })
      yield* storage(first, sql).write('r', created({ replies: [accepted(first, 'a')] }))
      const after = storage(second, sql)
      // The caller that is 'a' in version 2 has the text of the row of 'a' in version 1, and is not answered by it.
      expect(yield* after.reply('r', caller('a'))).toBeNull()
      yield* after.write('r', written({ replies: [accepted(second, 'a')] }))
      expect(yield* after.reply('r', caller('a'))).toEqual({ _tag: 'Accepted' })
      // The caller version 1 stored as 'a' is 'b' now, and its retry still finds its own reply.
      expect(yield* after.reply('r', caller('b'))).toEqual({ _tag: 'Accepted' })
    })))
