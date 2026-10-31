/**
 * The rules of decisions 0061 to 0075 that the code keeps, each taken out, as the review of that lot ran them
 * (`docs/decisions/README.md`, reviews). Run with `bun scripts/mutate.ts scripts/mutations/0061-0075.ts`.
 */
import type { Mutation } from '../mutate.ts'

const M = 'src/machine.ts'
const S = 'src/storage.ts'
const R = 'src/runtime.ts'

export const mutations: ReadonlyArray<Mutation> = [
  // 0061
  { id: '61-byProgram', file: M, edits: [['    throw new Defect(cause)\n', '    throw cause\n']] },
  { id: '61-defectOf', file: M, edits: [['  throw thrown\n}', '  return thrown\n}']] },
  { id: '61-broken', file: M, edits: [['throw new Defect(new InvariantDefect({ reason }))', 'throw new InvariantDefect({ reason })']] },
  { id: '61-noRecord', file: M, edits: [["  if (typeof work !== 'object' || work === null) return broken('durable gave no record of work')\n", '']] },
  { id: '61-noWork', file: M, edits: [["    if (typeof tag !== 'string') broken(`the state holds what is no work under '${key}'`)\n", '']] },
  { id: '61-rejectInternal', file: M, edits: [["      if (head._tag === 'Internal') return broken(`update rejected the message of the work under '${head.key}'`)\n", '']] },
  { id: '61-name', file: M, edits: [['  if (program.name !== stored.name) {', '  if (false) {']] },
  { id: '61-encodeBy', file: M, edits: [['  byProgram(() => encode(codec, value, what))', '  encode(codec, value, what)']] },
  { id: '61-project', file: M, edits: [['byProgram(() => program.project(state))', 'program.project(state)']] },
  { id: '61-index', file: M, edits: [['byProgram(() => indexesOf(program, projection))', 'indexesOf(program, projection)']] },
  { id: '61-durable', file: M, edits: [['byProgram(() => program.durable(state))', 'program.durable(state)']] },
  { id: '61-update', file: M, edits: [['byProgram(() => program.update(head.message, { at, from })(stored.state))', 'program.update(head.message, { at, from })(stored.state)']] },
  { id: '61-init', file: M, edits: [['byProgram(() => program.init(flags, at))', 'program.init(flags, at)']] },
  { id: '61-unknown', file: M, edits: [["byProgram(() => runner.unknown(work as T['operation']))", "runner.unknown(work as T['operation'])"]] },
  { id: '61-timerAt', file: M, edits: [['at: byProgram(() => DateTime.toEpochMillis(work.at)),', 'at: DateTime.toEpochMillis(work.at),']] },
  { id: '61-noRunner', file: R, edits: [['        if (runner === undefined) {\n', '        if (runner === undefined && false) {\n']] },

  // 0062
  { id: '62-suspensionPair', file: S, edits: [['      suspended_on: Schema.String,\n      suspended_cause: Schema.String,', '      suspended_on: Schema.String,\n      suspended_cause: Schema.NullOr(Schema.String),']] },
  { id: '62-keyDelivery', file: S, edits: [['      work: Schema.Null,\n      delivery: Schema.Null,', '      work: Schema.Null,\n      delivery: Schema.NullOr(Delivery),']] },
  { id: '62-deliveryLiteral', file: S, edits: [["const Delivery = Schema.Literals(['Idempotent', 'AtLeastOnce', 'AtMostOnce'])", 'const Delivery = Schema.String']] },
  { id: '62-inboundKey', file: S, edits: [['      request: Schema.String,\n      key: Schema.Null,\n      incarnation: Schema.Null,', '      request: Schema.String,\n      key: Schema.NullOr(Schema.String),\n      incarnation: Schema.NullOr(Count),']] },
  { id: '62-inboundRequest', file: S, edits: [["      tag: Schema.Literal('Inbound'),\n      version: Version,\n      message: Schema.String,\n      request: Schema.String,", "      tag: Schema.Literal('Inbound'),\n      version: Version,\n      message: Schema.String,\n      request: Schema.NullOr(Schema.String),"]] },
  { id: '62-internalRequest', file: S, edits: [['      request: Schema.Null,\n      key: Schema.String,', '      request: Schema.NullOr(Schema.String),\n      key: Schema.String,']] },
  { id: '62-envelopeTag', file: S, edits: [["      tag: Schema.Literal('Internal'),", '      tag: Schema.String,']] },
  { id: '62-acceptedReason', file: S, edits: [["tag: Schema.Literal('Accepted'), version: Version, reason: Schema.Null }", "tag: Schema.Literal('Accepted'), version: Version, reason: Schema.NullOr(Schema.String) }"]] },
  { id: '62-replyTag', file: S, edits: [["      tag: Schema.Literal('Rejected'),", '      tag: Schema.String,']] },
  { id: '62-creationMessage', file: S, edits: [["      tag: Schema.Literal('Creation'),\n      version: Version,\n      message: Schema.Null,", "      tag: Schema.Literal('Creation'),\n      version: Version,\n      message: Schema.NullOr(Schema.String),"]] },
  { id: '62-stepMessage', file: S, edits: [["      tag: Schema.Literals(['Inbound', 'Internal']),\n      version: Version,\n      message: Schema.String,", "      tag: Schema.Literals(['Inbound', 'Internal']),\n      version: Version,\n      message: Schema.NullOr(Schema.String),"]] },
  { id: '62-version', file: S, edits: [['const Version = Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(1)))', 'const Version = Schema.Int']] },
  { id: '62-count', file: S, edits: [['const Count = Schema.Int.pipe(Schema.check(Schema.isGreaterThanOrEqualTo(0)))', 'const Count = Schema.Int']] },
  { id: '62-rowsAll', file: S, edits: [['        decode(held),\n', '        Effect.succeed(held as never),\n']] },
  { id: '62-due', file: S, edits: [['due: decoder(Schema.Struct({ id: Schema.String, at: Schema.Int })),', 'due: decoder(Schema.Struct({ id: Schema.String, at: Schema.Number })),']] },
  { id: '62-last', file: S, edits: [['last: decoder(Schema.Struct({ seq: Schema.NullOr(Count) })),', 'last: decoder(Schema.Struct({ seq: Schema.NullOr(Schema.Number) })),']] },
  { id: '62-projectionRow', file: S, edits: [['projection: decoder(Schema.Struct({ id: Schema.String, projection: Schema.String, version: Version })),', 'projection: decoder(Schema.Struct({ id: Schema.String, projection: Schema.String, version: Schema.Number })),']] },
  { id: '62-stateRow', file: S, edits: [['state: decoder(Schema.Struct({ id: Schema.String, state: Schema.String, version: Version })),', 'state: decoder(Schema.Struct({ id: Schema.String, state: Schema.String, version: Schema.Number })),']] },
  { id: '62-consumerRow', file: S, edits: [['consumer: decoder(Schema.Struct({ consumer: Schema.String, seq: Count, behind: Count })),', 'consumer: decoder(Schema.Struct({ consumer: Schema.String, seq: Schema.Number, behind: Count })),']] },
  { id: '62-seqRow', file: S, edits: [['seq: decoder(Schema.Struct({ seq: Count })),', 'seq: decoder(Schema.Struct({ seq: Schema.Number })),']] },
  { id: '62-throughRow', file: S, edits: [['through: decoder(Schema.Struct({ through: Schema.NullOr(Count) })),', 'through: decoder(Schema.Struct({ through: Schema.NullOr(Schema.Number) })),']] },

  // 0063
  { id: '63-signalAfterLook', file: R, edits: [['          : Effect.flatMap(Deferred.await(next), () => settled))', '          : Effect.suspend(() => Effect.flatMap(Deferred.await(ended), () => settled)))']] },
  { id: '63-pendingFromTake', file: R, edits: [
    ['        loaded.pending += 1\n', ''],
    ['                loaded.pending -= 1\n', ''],
  ] },
  { id: '63-pendingToApply', file: R, edits: [
    ['            return Effect.flatMap(\n              apply(deployed, loaded, event).pipe(Effect.ensuring(Effect.sync(() => {\n                loaded.pending -= 1\n                end()\n              }))),', '            loaded.pending -= 1\n            return Effect.flatMap(\n              apply(deployed, loaded, event),'],
  ] },
  { id: '63-stepEnds', file: R, edits: [['        loaded.applying = false\n        end()\n', '        loaded.applying = false\n']] },
  { id: '63-forkEnds', file: R, edits: [['              held.delete(id)\n              end()\n', '              held.delete(id)\n']] },
  { id: '63-wakerEnds', file: R, edits: [['          waker.busy = false\n          end()\n', '          waker.busy = false\n']] },
  { id: '63-leaveEnds', file: R, edits: [['        Queue.offerUnsafe(deployed.waker.poke, undefined)\n        end()\n', '        Queue.offerUnsafe(deployed.waker.poke, undefined)\n']] },
  { id: '63-deployWakes', file: R, edits: [['          if (awaited !== undefined) Deferred.doneUnsafe(awaited, Effect.void)\n', '']] },
  { id: '63-resumptionWakes', file: R, edits: [['          wake(entity)\n', '']] },
  { id: '63-suspendedPolled', file: R, edits: [['? Effect.as(resumed, null)', '? Effect.as(Effect.sleep(`${retry} millis`), null)']] },
  { id: '63-crashAtOnce', file: R, edits: [['                    ? Effect.as(Effect.sleep(`${retry} millis`), null)\n', '                    ? Effect.succeed(null)\n']] },
  { id: '63-registerAfter', file: R, edits: [[
    '            const attempt = Effect.flatMap(awaitResumption({ name: program.name, id }), ({ resumed, forget }) =>\n              Effect.flatMap(\n                unlessCrashed(send(deployed, id, message, request), null),\n                (reply): Effect.Effect<Reply<T[\'rejection\']> | null> =>',
    '            const attempt = Effect.flatMap(unlessCrashed(send(deployed, id, message, request), null), (sent) => Effect.flatMap(awaitResumption({ name: program.name, id }), ({ resumed, forget }) =>\n              Effect.flatMap(\n                Effect.succeed(sent),\n                (reply): Effect.Effect<Reply<T[\'rejection\']> | null> =>',
  ], ['              ).pipe(Effect.ensuring(forget)))\n', '              ).pipe(Effect.ensuring(forget))))\n']] },

  // 0064
  { id: '64-suspendedActivates', file: M, edits: [['  if (machine.stored.suspension !== null) return { machine: { ...machine, running: {} }, outputs: [] }\n', '']] },

  // 0065
  { id: '65-noReply', file: R, edits: [['reply: yield* deployed.storage.reply(entity.id, offered.request)', 'reply: null']] },
  { id: '65-noFallback', file: S, edits: [["      if (exact !== null || asked._tag !== 'Caller') return exact\n", '      return exact\n']] },
  { id: '65-replyAtOffer', file: R, edits: [
    ['reply: yield* deployed.storage.reply(entity.id, offered.request)', 'reply: (offered as any).reply'],
    ["            : ask(messages, loaded, entity, requested, { _tag: 'Receive', request, message }))", "            : Effect.flatMap(deployed.storage.reply(id, request), (reply) => ask(messages, loaded, entity, requested, { _tag: 'Receive', request, message, reply } as never)))"],
  ] },

  // 0067
  { id: '67-oneLock', file: R, edits: [['      const address = addressOf(entity)\n      return Effect.acquireUseRelease(', "      const address = 'one'\n      return Effect.acquireUseRelease("]] },
  { id: '67-loadUnheld', file: R, edits: [['      const loading = held(Effect.gen(function*() {', '      const loading = ((x: any) => x)(Effect.gen(function*() {']] },
  { id: '67-lockDroppedEarly', file: R, edits: [['            if (lock.users === 0) locks.delete(address)', '            locks.delete(address)']] },
  { id: '67-createUnheld', file: R, edits: [['        const asked = yield* detached(deployed, holding(entity)(Effect.gen(function*() {', '        const asked = yield* detached(deployed, ((x: any) => x)(Effect.gen(function*() {']] },

  // 0068
  { id: '68-heldAfterEnd', file: R, edits: [['        if (!done) held.set(id, fiber)', '        held.set(id, fiber)']] },
  { id: '68-leaveSplit', file: R, edits: [[
    '      Effect.sync(() => {\n        const { id } = loaded.machine.stored\n        if (deployed.loaded.get(id) === loaded) deployed.loaded.delete(id)\n        forgetUse(loaded)\n        deployed.waker.busy = true\n        Queue.offerUnsafe(deployed.waker.poke, undefined)\n        end()\n      })',
    '      Effect.andThen(Effect.sync(() => {\n        deployed.waker.busy = true\n        Queue.offerUnsafe(deployed.waker.poke, undefined)\n      }), Effect.andThen(Effect.yieldNow, Effect.sync(() => {\n        const { id } = loaded.machine.stored\n        if (deployed.loaded.get(id) === loaded) deployed.loaded.delete(id)\n        forgetUse(loaded)\n        end()\n      })))',
  ]] },

  // 0069
  { id: '69-key', file: S, edits: [['      PRIMARY KEY (name, id, request, version)', '      PRIMARY KEY (name, id, request)']] },

  // 0070
  { id: '70-noCheck', file: S, edits: [['FROM entities WHERE name = ${name} AND id = ${held.id} AND state = ${held.state}\n            AND version = ${held.version}', 'FROM entities WHERE name = ${name} AND id = ${held.id}']] },
  { id: '70-noVersion', file: S, edits: [['AND state = ${held.state}\n            AND version = ${held.version}', 'AND state = ${held.state}']] },
  { id: '70-countAll', file: S, edits: [['        written += rewritten.length', '        written += 1']] },

  // 0071
  { id: '71-noMailbox', file: S, edits: [['      UNION\n      SELECT id FROM mailbox WHERE name = ${name} AND id NOT IN ${onHold}\n', '\n']] },
  { id: '71-mailboxSuspended', file: S, edits: [['      SELECT id FROM mailbox WHERE name = ${name} AND id NOT IN ${onHold}\n', '      SELECT id FROM mailbox WHERE name = ${name}\n']] },
  { id: '71-operationsSuspended', file: S, edits: [['      WHERE name = ${name} AND work IS NOT NULL AND due IS NULL AND id NOT IN ${onHold}\n', '      WHERE name = ${name} AND work IS NOT NULL AND due IS NULL\n']] },

  // 0072
  { id: '72-publishEveryChange', file: M, edits: [['  if (row !== null && (before === null || shownOf(program, before.state).text !== row.text)) {', '  if (row !== null) {']] },
  { id: '72-logUnmigrated', file: S, edits: [["        projection: projection.read(row.projection, up('projection', row.version)),\n      }))\n    }).pipe(Effect.orDie)\n\n  /** Stores", "        projection: projection.read(row.projection),\n      }))\n    }).pipe(Effect.orDie)\n\n  /** Stores"]] },

  // 0073
  { id: '73-defaultDies', file: R, edits: [['  defaultValue: () => () => Effect.void,', "  defaultValue: () => () => Effect.die('the default probe'),"]] },
  { id: '73-exported', file: 'src/index.ts', edits: [['export {\n  type Address,', "export { Probe } from './runtime.ts'\nexport {\n  type Address,"]] },

  // 0074
  { id: '74-alwaysQueued', file: M, edits: [['  return stored.mailbox.length === 0 ? handle(program, queued, event.at) : { machine: queued, outputs: [] }', '  return { machine: queued, outputs: [] }']] },
  { id: '74-timeAtOffer', file: R, edits: [
    ['at: yield* DateTime.now }', 'at: (offered as any).at }'],
    ["            : ask(messages, loaded, entity, requested, { _tag: 'Receive', request, message }))", "            : Effect.flatMap(DateTime.now, (at) => ask(messages, loaded, entity, requested, { _tag: 'Receive', request, message, at } as never)))"],
  ] },

  // 0075
  { id: '75-twice', file: R, edits: [['          if (names.has(program.name)) {', '          if (false) {']] },
  { id: '75-keptOnFailure', file: R, edits: [['            if (!deployments.has(program.name)) names.delete(program.name)\n', '']] },
  { id: '75-claimApart', file: R, edits: [[
    "        yield* Effect.sync(() => {\n          if (names.has(program.name)) {\n            throw new InvariantDefect({ reason: `the program '${program.name}' is deployed already` })\n          }\n          names.add(program.name)\n        })",
    "        yield* Effect.sync(() => {\n          if (names.has(program.name)) {\n            throw new InvariantDefect({ reason: `the program '${program.name}' is deployed already` })\n          }\n        })\n        yield* Effect.yieldNow\n        yield* Effect.sync(() => names.add(program.name))",
  ]] },

  // 0066
  { id: '66-armLate', file: R, edits: [['            yield* Effect.sleep(`${millis} millis`)\n', '            yield* Effect.yieldNow\n            yield* Effect.yieldNow\n            yield* Effect.sleep(`${millis} millis`)\n']] },
]
