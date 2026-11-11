/**
 * The feed's boundary: what the application runs to read a stream of meter readings into the meters. The source is
 * a log of offsets, as a partition of Kafka is, which gives again every reading after the last one acknowledged. A
 * reading is acknowledged only once the meter stored its answer, `Accepted` or `Rejected`: any other answer stored
 * nothing of the reading, and an acknowledgement would lose it (decision 0272).
 */
import * as Data from 'effect/Data'
import * as Effect from 'effect/Effect'
import type * as Schedule from 'effect/Schedule'
import type { Handle, TypesOf } from '@fgaudo/effect-tea-persistent'
import type { meter } from './meter.ts'

/** A reading of the source: its offset in the log, the meter it is of, and the meter's index. */
export type Reading = Readonly<{ offset: number; meter: string; index: number }>

/** The source of the readings, which gives each one again until it is acknowledged. */
export interface Source {
  /** The readings after the last one acknowledged, in the order of their offsets. */
  readonly unacknowledged: Effect.Effect<ReadonlyArray<Reading>>
  readonly acknowledge: (reading: Reading) => Effect.Effect<void>
}

/** A reading whose meter stored nothing of it yet: it is suspended, or holds as many messages as its bound. */
export class Unanswered extends Data.TaggedError('Unanswered')<{ reading: Reading; answer: 'Suspended' | 'Full' }> {}

/**
 * A reading answered `Reused`: its request id was given before to another message. The source gave another reading
 * under an offset, or a deploy changed how a reading is written. Only an operator tells them apart.
 */
export class ReusedOffset extends Data.TaggedError('ReusedOffset')<{ reading: Reading }> {}

export type Options = Readonly<{
  /** How a reading whose meter stored nothing of it is sent again. */
  retry: Schedule.Schedule<unknown, Unanswered | ReusedOffset>
  /** How long a reply is kept. The meter rejects a reading sent again after it, so the keep only spares a step. */
  keep: Readonly<{ millis: number }>
}>

const feed = { _tag: 'Feed' } as const

/**
 * Sends a reading to its meter until the meter stores its answer. It ends once the reading may be acknowledged, and
 * fails without acknowledging otherwise.
 */
export const deliver = (meters: Handle<TypesOf<typeof meter>>, options: Options) => (reading: Reading) => {
  const message = { _tag: 'Read', offset: reading.offset, index: reading.index } as const
  // The request id is derived from the offset, so a reading the source gives again is the same request.
  const sent = { requestId: `reading-${reading.offset}`, sender: feed, keep: options.keep }
  const attempt = Effect.gen(function*() {
    let answer = yield* meters.send(reading.meter, message, sent)
    // A meter exists from its first reading: the feed knows every meter the source names.
    if (answer._tag === 'NotFound') {
      yield* meters.create(reading.meter, { requestId: `meter-${reading.meter}`, sender: feed })
      answer = yield* meters.send(reading.meter, message, sent)
    }
    switch (answer._tag) {
      // A stale reading was applied already, and is acknowledged as one applied.
      case 'Accepted':
      case 'Rejected':
        return
      case 'Suspended':
      case 'Full':
        return yield* new Unanswered({ reading, answer: answer._tag })
      case 'Reused':
        return yield* new ReusedOffset({ reading })
      case 'NotFound':
        return yield* Effect.die(`the meter ${reading.meter} was created and is not found`)
    }
  })
  return Effect.retry(attempt, { schedule: options.retry, while: (error) => error._tag === 'Unanswered' })
}

/**
 * Feeds the meters with the readings the source gives, one at a time and in order, so that a meter is given its
 * readings in the order of their offsets. A reading whose meter stays suspended stops the feed there, and the
 * readings after it wait for it, those of other meters too.
 */
export const run = (meters: Handle<TypesOf<typeof meter>>, source: Source, options: Options) =>
  Effect.flatMap(source.unacknowledged, (readings) =>
    Effect.forEach(
      readings,
      (reading) => Effect.andThen(deliver(meters, options)(reading), source.acknowledge(reading)),
      { discard: true },
    ))
