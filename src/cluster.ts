/**
 * The runtime on Effect Cluster: the `Sharding` a runner of the runtime runs, built once the runner's versions are
 * recorded, with a `RunnerHealth` that keeps the shards off a runner of an older version, the door, Cluster's entity
 * of a program, and the guard, which lets a step commit only at the newest version and under the shard's lease
 * (decisions 0159, 0175). The runtime steps what reaches a door (decisions 0160, 0161), and learns the shards its
 * runner holds from a singleton of each (decision 0162).
 */
import {
  ClusterSchema,
  Entity,
  EntityAddress,
  EntityId,
  EntityType,
  MessageStorage,
  type Reply,
  type RunnerAddress,
  RunnerHealth,
  type Runners,
  type RunnerStorage,
  Sharding,
  ShardingConfig,
  ShardId,
  Snowflake,
} from 'effect/cluster'
import * as Cause from 'effect/Cause'
import * as Context from 'effect/Context'
import * as Duration from 'effect/Duration'
import * as Effect from 'effect/Effect'
import * as Layer from 'effect/Layer'
import * as Option from 'effect/Option'
import * as PrimaryKey from 'effect/PrimaryKey'
import type * as Scope from 'effect/Scope'
import * as Schema from 'effect/Schema'
import { Rpc } from 'effect/rpc'
import { SqlClient } from 'effect/sql'
import * as Machine from './machine.ts'
import { type Address, InvariantDefect, type Json, type Program, type Types, versionOf } from './program.ts'
import { type Delivered, launchWith, type OnCluster, type Operating, type Options, type Runtime } from './runtime.ts'
import { createTables, forgetGiven, leased, outranked, recordVersions, standingOf } from './storage.ts'

/**
 * The text a runner's address is recorded under: `host:port`, the address's primary key, which Cluster's
 * `SqlRunnerStorage` writes as a lease's `address` too (decision 0175).
 */
export const addressText = (address: RunnerAddress.RunnerAddress): string => PrimaryKey.value(address)

/**
 * A `RunnerHealth` that answers a runner alive only where `launched` does, and where the runner runs the newest
 * version of every program it runs (decision 0159). A runner without the runtime is answered by `launched` alone.
 * A failure to read the versions answers as `launched` does: the check by the commit keeps the rows of a newer
 * version from an older runner without it.
 */
export const byVersion = (
  launched: RunnerHealth.RunnerHealth['Service'],
  sql: SqlClient.SqlClient,
): RunnerHealth.RunnerHealth['Service'] =>
  RunnerHealth.RunnerHealth.of({
    isAlive: (address) =>
      Effect.flatMap(launched.isAlive(address), (alive) =>
        alive
          ? outranked(addressText(address)).pipe(
            Effect.provideService(SqlClient.SqlClient, sql),
            Effect.map((older) => older !== true),
            Effect.catch(() => Effect.succeed(true)),
          )
          : Effect.succeed(false)),
  })

/**
 * The version of each program a runner's `sharding` recorded, by name, or `null` on a process with no
 * `runnerAddress`, which holds no shard. `launch` takes it, so that a runner deploys only the programs its
 * `sharding` named, each at the version named (decision 0174). It has no default, so that a `Sharding` built
 * without `sharding` does not launch.
 */
export class Recorded extends Context.Service<Recorded, {
  readonly versions: ReadonlyMap<string, number> | null
}>()('@fgaudo/effect-tea-persistent/Recorded') {}

/**
 * Cluster's `Sharding` for a runner that runs `programs`. It records the version of each program under the
 * runner's address first, and dies if one is older than the newest a launch recorded, so that a runner of an older
 * version never registers (decision 0159). It gives `Sharding` the `RunnerHealth` of `byVersion` over the one the
 * launcher provides, and gives `Recorded` the versions it recorded. A process with no `runnerAddress`, a client of
 * the cluster alone, records nothing.
 */
export const sharding = (
  programs: ReadonlyArray<Pick<Program<Types>, 'name' | 'migrations'>>,
): Layer.Layer<
  Sharding.Sharding | Recorded,
  never,
  | ShardingConfig.ShardingConfig
  | Runners.Runners
  | MessageStorage.MessageStorage
  | RunnerStorage.RunnerStorage
  | RunnerHealth.RunnerHealth
  | SqlClient.SqlClient
> =>
  Layer.unwrap(Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    const config = yield* ShardingConfig.ShardingConfig
    const launched = yield* RunnerHealth.RunnerHealth
    yield* createTables
    const address = Option.getOrUndefined(config.runnerAddress)
    const versioned = programs.map((program) => ({ name: program.name, version: versionOf(program) }))
    if (address !== undefined) yield* recordVersions(addressText(address), versioned)
    const versions = address === undefined ? null : new Map(versioned.map(({ name, version }) => [name, version]))
    return Layer.merge(
      Sharding.layer.pipe(Layer.provide(Layer.succeed(RunnerHealth.RunnerHealth, byVersion(launched, sql)))),
      Layer.succeed(Recorded, { versions }),
    )
  }))

/**
 * What a request to an entity on Cluster carries: the version that wrote it, the request and the message, each as
 * the JSON text the runtime encodes (decision 0085), and a caller's `keep`, which is no part of its key
 * (decision 0165). Cluster's schema decodes text alone, so a payload of any version reaches the runtime, which reads
 * the request and the message through the program's migrations.
 */
const payload = {
  version: Schema.Int,
  request: Schema.String,
  message: Schema.String,
  keep: Schema.optionalKey(Schema.Int),
}

/**
 * Cluster keys a request by the version that keyed it and its request's text, under the receiver's address and the
 * RPC's tag, so that two versions never share a key (decision 0085). A caller's request is keyed with the text of
 * what it carried too, since Cluster answers a key it saved before the door runs: a request that carries another
 * message or other flags reaches the door, which answers it `Reused` (decision 0269). An operation's request keeps
 * its key, since what it carries is not compared. A JSON text holds no line feed, so the parts never run into each
 * other.
 */
const primaryKey = ({ version, request, message }: Readonly<{ version: number; request: string; message: string }>) =>
  (JSON.parse(request) as Readonly<{ _tag: string }>)._tag === 'Caller'
    ? `${version}/${request}\n${Machine.carriedText(JSON.parse(message) as Json)}`
    : `${version}/${request}`

/**
 * The entity of the program `name` on Cluster, the door to the runtime's entity: one RPC for a creation and one for
 * a message (decision 0085), one for each event of an operator's (decision 0166), and `Resumed`, which tells the
 * entity that an entity its operations sent to is out of its suspension (decision 0167). Each is persisted, and its
 * handler runs in Cluster's transaction, so a step commits with its reply (decision 0081). Its answer is the
 * runtime's encoding of whatever the step answers, as text, and it fails with nothing. A caller that stops waiting
 * leaves its request to be handled (decision 0091). An operator's event has no primary key: each one sent is a
 * request of its own, which a saved reply of an earlier one never answers (decision 0166).
 */
export const doorOf = <const Name extends string>(name: Name) =>
  Entity.make(name, [
    Rpc.make('Create', { payload, success: Schema.String, primaryKey }),
    Rpc.make('Message', { payload, success: Schema.String, primaryKey }),
    Rpc.make('Resume', { success: Schema.String }),
    Rpc.make('Discard', { success: Schema.String }),
    Rpc.make('Resumed', { payload: { name: Schema.String, id: Schema.String } }),
  ])
    .annotateRpcs(ClusterSchema.Persisted, true)
    .annotateRpcs(ClusterSchema.WithTransaction, true)
    .annotateRpcs(ClusterSchema.Uninterruptible, 'client')

/**
 * Dies where a launch recorded a newer version of `program` than this runner runs, or renamed the program, inside
 * the step's transaction, so that the step commits only at the newest version and under the program's newest name.
 * The guard of `onCluster` runs it first in every step (decisions 0159, 0175, 0176).
 */
export const atNewest = (program: Pick<Program<Types>, 'name' | 'migrations'>) =>
  Effect.flatMap(standingOf(program.name), (held) => {
    const version = versionOf(program)
    return held?.renamedTo != null
      ? Effect.die(new InvariantDefect({
        reason: `the program ${program.name} runs here, and a launch has renamed it to ${held.renamedTo}`,
      }))
      : held !== undefined && held.version > version
      ? Effect.die(new InvariantDefect({
        reason: `the program ${program.name} runs at version ${version} here, and a launch has run it at version ${held.version}`,
      }))
      : Effect.void
  })

/**
 * The handlers of a program's door: each request is stepped by `step` in Cluster's transaction, whose first
 * statement is the runtime's guard (decisions 0159, 0175).
 */
const handlersOf = <R>(
  step: (delivered: Delivered | Operating, requestId: string) => Effect.Effect<string, never, R>,
  resumed: (receiver: Address, requestId: string) => Effect.Effect<void>,
) => {
  const handle = (_tag: Delivered['_tag']) =>
  (
    { address, payload, requestId }: Readonly<{
      address: Readonly<{ entityId: string }>
      payload: Readonly<{ version: number; request: string; message: string; keep?: number }>
      requestId: Snowflake.Snowflake
    }>,
  ) =>
    step({
      _tag,
      id: address.entityId,
      version: payload.version,
      request: payload.request,
      message: payload.message,
      ...(payload.keep === undefined ? {} : { keep: payload.keep }),
    }, String(requestId))
  const operate = (_tag: Operating['_tag']) =>
  (
    { address, requestId }: Readonly<{ address: Readonly<{ entityId: string }>; requestId: Snowflake.Snowflake }>,
  ) => step({ _tag, id: address.entityId }, String(requestId))
  return {
    Create: handle('Create'),
    Message: handle('Message'),
    Resume: operate('Resume'),
    Discard: operate('Discard'),
    Resumed: ({ payload, requestId }: Readonly<{ payload: Address; requestId: Snowflake.Snowflake }>) =>
      resumed({ name: payload.name, id: payload.id }, String(requestId)),
  }
}

/**
 * The text of what a step answers a message: a reply, `NotFound` where no entity is stored, or `Suspended`. Every
 * one is a success of the RPC, so that Cluster saves it in the step's transaction (decisions 0081, 0160).
 */
export const answerCodec = <T extends Types>(program: Program<T>) =>
  Schema.fromJsonString(Schema.Union([
    Schema.TaggedStruct('Accepted', {}),
    Schema.TaggedStruct('Rejected', { reason: Schema.NullOr(program.schemas.rejection) }),
    Schema.TaggedStruct('NotFound', {}),
    Schema.TaggedStruct('Suspended', {}),
    Schema.TaggedStruct('Reused', {}),
  ]))

/**
 * The text of a step's answer to a message that is no reply: Cluster saves it, and a caller's client resets it. A
 * `Reused` is none either: the reply it was compared with may be past its time at a retry (decision 0269).
 */
const noReply = Schema.fromJsonString(Schema.Union([
  Schema.TaggedStruct('NotFound', {}),
  Schema.TaggedStruct('Suspended', {}),
  Schema.TaggedStruct('Reused', {}),
]))

/**
 * The Cluster id of the request a door answers an operator's event, which the operator's client keeps so that a step
 * or `expire` deletes Cluster's rows of it: the event has no primary key to find the id by (decision 0290). The key is
 * optional, so that a client decodes the answer of a door of a release before it, and a client of that release
 * decodes this answer, whose key it strips.
 */
const answered = { request: Schema.optionalKey(Schema.String) }

/** The text of what an operator's event did, with the Cluster id of its request (decisions 0166, 0290). */
export const operatedCodec = Schema.fromJsonString(Schema.Union([
  Schema.TaggedStruct('Resumed', answered),
  Schema.TaggedStruct('Discarded', answered),
  Schema.TaggedStruct('NotDiscarded', answered),
  Schema.TaggedStruct('StillSuspended', { cause: Schema.String, ...answered }),
  Schema.TaggedStruct('NotSuspended', answered),
  Schema.TaggedStruct('NotFound', answered),
]))

/**
 * The text of what a step answers a creation: `Created`, `AlreadyExists`, or `Rejected` where the program's `init`
 * rejects the flags (decision 0182).
 */
export const creationCodec = <T extends Types>(program: Program<T>) =>
  Schema.fromJsonString(Schema.Union([
    Schema.TaggedStruct('Created', {}),
    Schema.TaggedStruct('AlreadyExists', {}),
    Schema.TaggedStruct('Rejected', { reason: Schema.NullOr(program.schemas.rejection) }),
    Schema.TaggedStruct('Reused', {}),
  ]))

/**
 * The text of a step's answer to a creation that is not stored: Cluster saves it, and a creator's client resets it, as
 * a message's `NotFound`. A `Rejected` is not stored (decision 0182), nor is a `Reused` (decision 0269).
 */
const creationRejected = Schema.fromJsonString(Schema.Union([
  Schema.TaggedStruct('Rejected', { reason: Schema.Unknown }),
  Schema.TaggedStruct('Reused', {}),
]))

/**
 * The shard group of every door: a door annotates none, so Cluster puts each in its default group, and the runtime's
 * singletons are registered there (decision 0162).
 */
const group = 'default'

/**
 * What the runtime is given to run on this runner's `Sharding`: a deploy registers its program's door, whose answers
 * are encoded as text (decision 0160). The door's `maxIdleTime` is the runtime's passivation, so that a door does not
 * outlive the runtime's entity by more than Cluster's reaper takes (decision 0092). The door is registered without
 * `disableFatalDefects`, which would save a defect as the request's reply, and lose its message (decision 0159).
 */
export const onCluster: Effect.Effect<
  OnCluster,
  never,
  Sharding.Sharding | Recorded | ShardingConfig.ShardingConfig | MessageStorage.MessageStorage | SqlClient.SqlClient
> = Effect.gen(
  function*() {
    const sharding = yield* Sharding.Sharding
    const { versions } = yield* Recorded
    const config = yield* ShardingConfig.ShardingConfig
    const messages = yield* MessageStorage.MessageStorage
    const sql = yield* SqlClient.SqlClient
    /** The address of the entity `id` of the door of the program `name`, as Cluster routes it. */
    const addressOf = (name: string, id: string) => {
      const entityId = EntityId.make(id)
      return EntityAddress.make({
        entityType: EntityType.make(name),
        entityId,
        shardId: sharding.getShardId(entityId, group),
      })
    }
    /**
     * Resets the latest answer Cluster saved for the request `sent` of the RPC `tag` to the program `name`, so that
     * the request is delivered again, as `ClusterWorkflowEngine` resets an activity: the request's id read by its
     * primary key, the latest reply by that id, and `Sharding.reset` with that reply as the one expected (decision
     * 0085). The latest reply is reset only while `resettable` holds of it, as the engine resets only a `Suspended`
     * one: a concurrent retry may have reset it and stored a step's reply since, and a reset of that reply would apply
     * the message again once its `keep` is past (decision 0165). A reset that finds a newer reply leaves it, and the
     * send after it is given that reply. The result of the reset is not read (decision 0092). `kept`, an operation's,
     * keeps the request's id before the reset, and the reset is called only where it gives that the asker's work still
     * holds. The function gives false where the work has ended, and true otherwise (decisions 0092, 0170).
     */
    const reset = (
      name: string,
      tag: Delivered['_tag'],
      sent: Omit<Delivered, '_tag'>,
      resettable: (latest: Reply.Encoded) => boolean,
      kept?: (requestId: string) => Effect.Effect<boolean>,
    ) =>
      Effect.gen(function*() {
        const requestId = yield* messages.requestIdForPrimaryKey({
          address: addressOf(name, sent.id),
          tag,
          id: primaryKey(sent),
        })
        if (Option.isNone(requestId)) return true
        const latest = (yield* messages.repliesForUnfiltered([requestId.value])).at(-1)
        if (latest === undefined || !resettable(latest)) return true
        if (kept !== undefined && !(yield* kept(String(requestId.value)))) return false
        // The id a caller's client kept goes before the reset, and not after: past its time, a step or `expire`
        // would delete the request between the reset and Cluster's delivery, or the step that answers it would
        // delete its own request. The retry's answer keeps the id again (decision 0249).
        yield* Effect.provideService(forgetGiven(String(requestId.value)), SqlClient.SqlClient, sql)
        yield* sharding.reset(requestId.value, { expectedReplyId: Snowflake.Snowflake(latest.id) })
        return true
      })
    /** A step's answer that is no reply, `Suspended` or `NotFound`, as Cluster saved it (decision 0165). */
    const noReplySaved = (latest: Reply.Encoded) =>
      latest._tag === 'WithExit' && latest.exit._tag === 'Success' &&
      Option.isSome(Schema.decodeUnknownOption(noReply)(latest.exit.value))
    /** A creation's answer that is not stored, `Rejected`, as Cluster saved it (decision 0182). */
    const rejectedSaved = (latest: Reply.Encoded) =>
      latest._tag === 'WithExit' && latest.exit._tag === 'Success' &&
      Option.isSome(Schema.decodeUnknownOption(creationRejected)(latest.exit.value))
    /**
     * A failure Cluster saved of its own: a door's handler fails with nothing, and a defect of it is not saved. The
     * one the runtime meets is an entity type no runner registered in time (decisions 0092, 0168).
     */
    const failureSaved = (latest: Reply.Encoded) => latest._tag === 'WithExit' && latest.exit._tag === 'Failure'
    /**
     * The least time, in millis from the answer, that Cluster's rows of a caller's request are kept: two polls of
     * replies and a second. Another client of the same request, on another runner, reads the reply from Cluster's
     * table only at its poll, and a deletion before that read leaves it waiting for ever. The second poll covers a
     * read that failed, and the second the read itself and the clocks of the runners (decision 0248).
     */
    const least = 2 * Duration.toMillis(config.entityReplyPollInterval) + 1_000
    /**
     * Gives the answer of `call`, the request `sent` of the RPC `tag` to the program `name`, and calls `given` first
     * with the request's Cluster id and `least`, where it is given. Kept once the answer is given, and not before: a
     * client on another runner reads its reply from Cluster's table, and a deletion past the reply's time would
     * otherwise take a reply it has not read (decisions 0171, 0248). The id is read and kept without interruption, so
     * that a caller that stops waiting after its answer came keeps it all the same.
     */
    const keptGiven = <A>(
      name: string,
      tag: Delivered['_tag'],
      sent: Omit<Delivered, '_tag'>,
      call: Effect.Effect<A, unknown>,
      given: ((requestId: string, least: number) => Effect.Effect<void>) | undefined,
    ): Effect.Effect<A> =>
      (given === undefined ? call : Effect.uninterruptibleMask((restore) =>
        Effect.tap(restore(call), () =>
          Effect.flatMap(
            messages.requestIdForPrimaryKey({ address: addressOf(name, sent.id), tag, id: primaryKey(sent) }),
            Option.match({ onNone: () => Effect.void, onSome: (requestId) => given(String(requestId), least) }),
          ))
      )).pipe(Effect.orDie)
    /**
     * Where `call` fails, and Cluster saved a failure of its own as the request's latest reply, resets that reply
     * before the failure is given, so that a retry under the same request id is delivered again. A failure that saved
     * nothing died at the sender, and a retry sends the request again (decision 0168). A keep or a reset that fails
     * gives the request's own failure, and the next retry keeps and resets again. The keep and the reset are not
     * interrupted halfway, so that a reset never runs without the keep before it. Where `kept` finds the asker's work
     * ended, nothing waits for the answer, and the call waits until the operation is interrupted: a retry would send
     * the request anew once a step has deleted its rows, and apply it to the receiver again (decisions 0092, 0170).
     */
    const resettingSavedFailure = <A, E>(
      name: string,
      tag: Delivered['_tag'],
      sent: Omit<Delivered, '_tag'>,
      call: Effect.Effect<A, E>,
      kept?: (requestId: string) => Effect.Effect<boolean>,
    ): Effect.Effect<A, E> =>
      Effect.catchCause(call, (cause) =>
        Cause.hasInterruptsOnly(cause)
          ? Effect.failCause(cause)
          : Effect.flatMap(
            Effect.uninterruptible(
              Effect.catchCause(reset(name, tag, sent, failureSaved, kept), () => Effect.succeed(true)),
            ),
            (holds) => holds ? Effect.failCause(cause) : Effect.never,
          ))
    const runner = Option.map(config.runnerAddress, addressText)
    return {
      guard: (program, id) =>
        Effect.andThen(
          atNewest(program),
          Effect.suspend(() => {
            const shard = sharding.getShardId(EntityId.make(id), group).toString()
            if (Option.isNone(runner)) {
              const reason = `a process with no runner address steps the shard ${shard}`
              return Effect.die(new InvariantDefect({ reason }))
            }
            return Effect.flatMap(leased(shard, runner.value, config.shardLockExpiration), (held) =>
              held ? Effect.void : Effect.die(new InvariantDefect({
                reason: `the lease of the shard ${shard} does not name the runner ${runner.value}, or has expired`,
              })))
          }),
        ).pipe(Effect.provideService(SqlClient.SqlClient, sql)),
      shards: config.shardsPerGroup,
      shardOf: (id) => sharding.getShardId(EntityId.make(id), group).id,
      holds: (shard) => sharding.hasShardId(ShardId.make(group, shard)),
      singleton: (name, run) => sharding.registerSingleton(name, run, { shardGroup: group }),
      // SQLite moves `data_version` on a connection once another connection commits to the file, and not at the
      // connection's own commits. The runner's client has one connection (decision 0163). A row without a version
      // fails, so that the watcher keeps the version it had: as `NaN` it would differ from itself at every reading.
      versions,
      others: {
        version: Effect.flatMap(sql<{ data_version: number | bigint }>`PRAGMA data_version`, ([row]) => {
          const version = Number(row?.data_version)
          return Number.isFinite(version)
            ? Effect.succeed(version)
            : Effect.fail(new Error('PRAGMA data_version gave no version'))
        }),
        millis: Duration.toMillis(config.entityReplyPollInterval),
      },
      register: (program, step, idle, resumed, formerly) => {
        const answer = Schema.encodeSync(answerCodec(program))
        const created = Schema.encodeSync(creationCodec(program))
        const operated = Schema.encodeSync(operatedCodec)
        const handlers = handlersOf((delivered, requestId) =>
          Effect.map(step(delivered, requestId), (stepped) =>
            stepped._tag === 'Create'
              ? created(stepped.answer)
              : stepped._tag === 'Operated'
              ? operated({ ...stepped.answer, request: requestId })
              : answer(stepped.answer)).pipe(
              Effect.provideService(SqlClient.SqlClient, sql),
            ), resumed)
        // A door under a name the launch renames to the program's delivers what Cluster saved under that name. An
        // entity's shard is drawn from its id alone, so both doors' entities are on the shards this runner holds
        // (decision 0176).
        return Effect.forEach(
          [program.name, ...formerly],
          (name) =>
            sharding.registerEntity(doorOf(name), Effect.succeed(handlers), { maxIdleTime: Duration.millis(idle) }),
          { discard: true },
        )
      },
      // A failure of Cluster's client or storage is no answer of the program's, and is a defect, as a failure of the
      // runtime's own storage is.
      create: (program, sent, kept, given) => {
        const once = resettingSavedFailure(
          program.name,
          'Create',
          sent,
          Effect.flatMap(sharding.makeClient(doorOf(program.name)), (clientOf) =>
            Effect.flatMap(
              clientOf(sent.id).Create({ version: sent.version, request: sent.request, message: sent.message }),
              Schema.decodeEffect(creationCodec(program)),
            )),
          kept,
        )
        // A rejection is not stored, and Cluster's client gives a saved answer as it gives a new one. So a `Rejected`
        // Cluster saved under the request is reset before the creation is sent, and a retry under the same request id
        // runs `init` again, as on one process. Before the send, and not after the answer: a process that dies
        // between the answer and a reset would leave a saved `Rejected` for the retry (decision 0182).
        return keptGiven(
          program.name,
          'Create',
          sent,
          Effect.andThen(reset(program.name, 'Create', sent, rejectedSaved), once),
          given,
        )
      },
      send: (program, sent, kept, given) => {
        const answered = Schema.decodeEffect(answerCodec(program))
        const once = resettingSavedFailure(
          program.name,
          'Message',
          sent,
          Effect.flatMap(sharding.makeClient(doorOf(program.name)), (clientOf) =>
            Effect.flatMap(
              clientOf(sent.id).Message({
                version: sent.version,
                request: sent.request,
                message: sent.message,
                ...(sent.keep === undefined ? {} : { keep: sent.keep }),
              }),
              answered,
            )),
          kept,
        )
        // Cluster's client gives a stored answer as it gives a new one, so either answer that is no reply is reset
        // and the message sent once more: the second answer is a step's, made as the entity is then (decision 0085).
        const final = Effect.flatMap(once, (first) =>
          first._tag === 'Suspended' || first._tag === 'NotFound' || first._tag === 'Reused'
            ? Effect.andThen(reset(program.name, 'Message', sent, noReplySaved), once)
            : Effect.succeed(first))
        return keptGiven(program.name, 'Message', sent, final, given)
      },
      // Sent with `discard` from the transaction of the step that resumes: Cluster saves the request in it, and
      // delivers it after the commit, so that the step never waits for the door it tells (decision 0167).
      resume: (sender, receiver) =>
        Effect.flatMap(
          sharding.makeClient(doorOf(sender.name)),
          (clientOf) => clientOf(sender.id).Resumed({ name: receiver.name, id: receiver.id }, { discard: true }),
        ).pipe(Effect.orDie),
      // The id is kept once the answer is given, and without interruption, as `keptGiven` keeps a caller's
      // (decisions 0248, 0290).
      operate: (program, { _tag, id }, given) =>
        Effect.uninterruptibleMask((restore) =>
          Effect.flatMap(
            restore(Effect.flatMap(
              sharding.makeClient(doorOf(program.name)),
              (clientOf) => Effect.flatMap(clientOf(id)[_tag](), Schema.decodeEffect(operatedCodec)),
            )),
            ({ request, ...operated }) =>
              request === undefined ? Effect.succeed(operated) : Effect.as(given(request, least), operated),
          )
        ).pipe(Effect.orDie),
    }
  },
)

/**
 * The runtime of a runner of Effect Cluster: `launch`'s, whose deploys serve their programs through doors on the
 * runner's `Sharding`, which `sharding` builds, and which learn their shards from a singleton of each
 * (decision 0162). Every request to an entity goes through Cluster's client of the door: a caller's, an operator's
 * and an operation's (decisions 0165, 0166, 0167).
 */
export const launch = (
  options: Options = {},
): Effect.Effect<
  Runtime,
  never,
  | Sharding.Sharding
  | Recorded
  | ShardingConfig.ShardingConfig
  | MessageStorage.MessageStorage
  | SqlClient.SqlClient
  | Scope.Scope
> =>
  Effect.flatMap(onCluster, (cluster) => launchWith(options, cluster))
