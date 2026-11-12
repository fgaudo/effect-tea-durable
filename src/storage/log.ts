/**
 * The log as the storage keeps it: the publications of the steps, the rows of each topic in the outbox, the head of
 * each partition, and the consumers with their cursors (decisions 0137, 0138, 0152, 0154, 0241).
 */
import * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import type { Topic, Types, Value } from '../program.ts'
import type { Storage } from '../storage.ts'
import type { Held } from './held.ts'
import { batch, Rows } from './rows.ts'
import { transaction } from './tables.ts'

/**
 * Where a reader has read to in one partition of the log: the `seq` of the last row it read there, `0` for none
 * (decision 0137).
 */
export type Cursor = Readonly<{ partition: number; seq: number }>

/**
 * What a step published in one topic of the log: the message it handled, and the value the topic selects of what
 * callers read of the entity after it (decisions 0038, 0138, 0140).
 */
export type Published<T extends Types, Name extends Topic<T> = Topic<T>> = Readonly<{
  /** The partition of the log the entity belongs to, which never changes (decision 0137). */
  partition: number
  /**
   * Rises with each step that publishes in the partition, and is never reused: with the partition, what a
   * consumer acks, and deduplicates by (decision 0137). The rows of one step share it, one per topic
   * (decision 0138).
   */
  seq: number
  id: string
  /** The topic the row is in: `projection` for a program that declares no topics (decision 0138). */
  topic: Name
  /** Where the message came from, or `Creation` for the row an entity's creation writes, which has none. */
  kind: 'Inbound' | 'Internal' | 'Creation'
  message: T['inbound'] | T['internal'] | null
  /**
   * What the topic selects of the projection the step left, as the program deployed selects it of the stored
   * projection read at the program's version: the projection whole for the topic `projection` (decision 0140).
   */
  value: Value<T, Name>
}>

/**
 * A consumer of the outbox, as an operator sees it: its topic, whether the deploy declares it, what is waiting,
 * and where (decisions 0039, 0137, 0152).
 */
export type Consumer = Readonly<{
  /** The topic it reads: a consumer is a name within its topic (decision 0138). */
  topic: string
  consumer: string
  /**
   * Whether the deploy declares it. One that is not is kept, and holds its topic, until `forget` drops it
   * (decision 0152).
   */
  declared: boolean
  /** How many rows are past its cursors, in every partition: what it costs the log to keep it. */
  behind: number
  /**
   * The time of the step that wrote the oldest of the rows it reads next, one in each partition it is behind in, or
   * null where it has read every row. The age of what it has not read is the caller's clock less this time. The
   * time is the clock of the process that wrote the step, so under clocks that disagree an age may come out a little
   * below zero (decision 0224).
   */
  since: DateTime.Utc | null
  /**
   * The cursors of the partitions it has rows to read in, by partition: `seq` is `0` in a partition it has acked
   * nothing of.
   */
  cursors: ReadonlyArray<Cursor>
}>

/** The part of the storage of one program that reads its log and keeps its consumers. */
export const logOf = <T extends Types>(held: Held<T>): Pick<
  Storage<T>,
  'published' | 'declare' | 'fetch' | 'ack' | 'prune' | 'consumers' | 'forget'
> => {
  const { sql, name, dialect, topics, rows, up } = held
  const { inbound, internal, projection } = held.codecs

  /** The cursors of a list, one per partition: a partition named twice is read from the higher. */
  const cursorsOf = (after: ReadonlyArray<Cursor>) => {
    const cursors = new Map<number, number>()
    for (const { partition, seq } of after) cursors.set(partition, Math.max(seq, cursors.get(partition) ?? 0))
    return cursors
  }

  /** The head of each partition the program has published in, by partition. */
  const heads = Effect.map(
    rows('effecttea_heads', Rows.cursor)(sql`SELECT partition, seq FROM effecttea_heads WHERE name = ${name}`),
    (held) => new Map(held.map(({ partition, seq }) => [partition, seq])),
  )

  // The rows are read in the order of `position`, from the first row past a cursor in any partition, and the rows a
  // cursor has passed are left out as they are read. That first row has the lowest `seq` past the cursor in its
  // partition, since `position` rises with `seq` within a partition (decision 0137). So a reader at pace passes over
  // only the rows of the steps that committed out of their order, and each page is a range of an index.
  // A topic's rows have gaps in their `seq`, where a step published only other topics, so a partition whose head is
  // past a cursor may hold no row of the topic past it (decision 0138).
  // A reading of some partitions starts from their first rows, and the statement leaves out the rows of the others.
  // The index of the topic holds no partition, so a reader of a few partitions passes over many rows (decision 0153).
  const published = <Name extends Topic<T>>(
    topic: Name,
    after: ReadonlyArray<Cursor>,
    limit: number,
    partitions?: ReadonlyArray<number>,
  ) =>
    Effect.gen(function*() {
      const select = topics.get(topic)
      if (select === undefined) throw new Error(`'${topic}' is no topic of the program '${name}'`)
      const cursors = cursorsOf(after)
      const read = partitions === undefined ? undefined : new Set(partitions)
      const behind: Array<readonly [number, number]> = []
      // The head each partition behind had when the heads were read. On a pool each statement of the reading reads a
      // snapshot of its own, so a row past that head, or of a partition not behind then, may have committed after a
      // row of its partition the reading passed: such a row is left to a later reading. A row up to the head
      // committed before the heads were read, since a step holds its head until it commits (decision 0287).
      const upTo = new Map<number, number>()
      for (const [partition, head] of yield* heads) {
        if (read !== undefined && !read.has(partition)) continue
        const cursor = cursors.get(partition) ?? 0
        if (head > cursor) {
          behind.push([partition, cursor])
          upTo.set(partition, head)
        }
      }
      if (behind.length === 0 || limit === 0) return []
      // The partitions behind are given as one JSON array, which each dialect reads as rows (decision 0157).
      const each = dialect === 'pg'
        ? sql`(
          SELECT CAST(value ->> 0 AS INTEGER) AS partition, CAST(value ->> 1 AS BIGINT) AS seq
          FROM jsonb_array_elements(CAST(${JSON.stringify(behind)} AS JSONB))
        )`
        : sql`(
          SELECT json_extract(value, '$[0]') AS partition, json_extract(value, '$[1]') AS seq
          FROM json_each(${JSON.stringify(behind)})
        )`
      const first = yield* rows('effecttea_outbox', Rows.position)(sql`
        SELECT min((
          SELECT position FROM effecttea_outbox
          WHERE name = ${name} AND topic = ${topic} AND partition = behind.partition AND seq > behind.seq
          ORDER BY seq LIMIT 1
        )) AS position
        FROM ${each} AS behind
      `)
      let from = first[0]?.position ?? null
      const given: Array<Published<T, Name>> = []
      const within = read === undefined
        ? sql``
        : dialect === 'pg'
        ? sql`AND effecttea_outbox.partition IN (
          SELECT CAST(value AS INTEGER) FROM jsonb_array_elements_text(CAST(${JSON.stringify([...read])} AS JSONB))
        )`
        : sql`AND effecttea_outbox.partition IN (SELECT value FROM json_each(${JSON.stringify([...read])}))`
      while (from !== null && given.length < limit) {
        // Each row finds its step's publication by the key of `effecttea_publications` (decision 0154).
        const page = yield* rows('effecttea_outbox', Rows.published)(sql`
          SELECT effecttea_outbox.position AS position, effecttea_outbox.partition AS partition, effecttea_outbox.seq AS seq, effecttea_publications.id AS id,
            effecttea_publications.tag AS tag, effecttea_publications.version AS version, effecttea_publications.message AS message,
            effecttea_publications.projection AS projection
          FROM effecttea_outbox
          JOIN effecttea_publications ON effecttea_publications.name = effecttea_outbox.name AND effecttea_publications.partition = effecttea_outbox.partition
            AND effecttea_publications.seq = effecttea_outbox.seq
          WHERE effecttea_outbox.name = ${name} AND effecttea_outbox.topic = ${topic} AND effecttea_outbox.position >= ${from} ${within}
          ORDER BY effecttea_outbox.position LIMIT ${batch}
        `)
        for (const row of page) {
          if (row.seq <= (cursors.get(row.partition) ?? 0) || row.seq > (upTo.get(row.partition) ?? 0)) continue
          // The selector of the program deployed, on the row at the program's version: one that dies gives the
          // defect to the reader, as the schema does (decisions 0121, 0140).
          const shown = projection.read(row.projection, up('projection', row.version))
          given.push({
            partition: row.partition,
            seq: row.seq,
            id: row.id,
            topic,
            kind: row.tag,
            message: row.tag === 'Creation'
              ? null
              : row.tag === 'Inbound'
              ? inbound.read(row.message, up('inbound', row.version))
              : internal.read(row.message, up('internal', row.version)),
            value: (select === null ? shown : select(shown)) as Value<T, Name>,
          })
          if (given.length === limit) break
        }
        const last = page[page.length - 1]
        from = page.length < batch || last === undefined ? null : last.position + 1
      }
      return given
    }).pipe(Effect.orDie)

  const declare = (consumers: ReadonlyArray<Readonly<{ topic: string; consumer: string }>>) =>
    transaction(sql, Effect.forEach(consumers, ({ topic, consumer }) =>
      sql`
        INSERT INTO effecttea_consumers ${sql.insert({ name, topic, consumer })} ON CONFLICT (name, topic, consumer) DO NOTHING
      `, { discard: true })).pipe(Effect.orDie)

  const fetch = <Name extends Topic<T>>(
    topic: Name,
    consumer: string,
    limit: number,
    partitions?: ReadonlyArray<number>,
  ) =>
    Effect.gen(function*() {
      const cursors = yield* rows('effecttea_cursors', Rows.cursor)(sql`
        SELECT partition, seq FROM effecttea_cursors WHERE name = ${name} AND topic = ${topic} AND consumer = ${consumer}
      `)
      return yield* published(topic, cursors, limit, partitions)
    }).pipe(Effect.orDie)

  // A cursor goes no further than the head of its partition: one past it would have the rows written after it
  // dropped by a prune before its consumer read them. A head is never deleted, so it holds the last `seq` given
  // though a prune dropped its row, and a partition with no head yet has nothing to ack (decision 0137).
  const ack = (topic: Topic<T>, consumer: string, through: ReadonlyArray<Cursor>) =>
    transaction(sql, Effect.gen(function*() {
      const held = yield* heads
      for (const [partition, seq] of cursorsOf(through)) {
        const capped = Math.min(seq, held.get(partition) ?? 0)
        if (capped === 0) continue
        yield* sql`
          INSERT INTO effecttea_cursors ${sql.insert({ name, topic, consumer, partition, seq: capped })}
          ON CONFLICT (name, topic, consumer, partition)
          DO UPDATE SET seq = CASE WHEN effecttea_cursors.seq > excluded.seq THEN effecttea_cursors.seq ELSE excluded.seq END
        `
      }
    })).pipe(Effect.orDie)

  // Each partition of a topic is dropped through the lowest cursor of the topic's consumers in it, and only where
  // every consumer of the topic has a cursor there, since one with none holds the partition from `0` (decision 0137).
  // A topic no consumer is stored for is dropped whole: every consumer is declared and stored at deploy, so no
  // reader that keeps cursors needs its rows (decision 0152). The rows go in batches, each a transaction of its own,
  // so that a sweep holds SQLite's one writer for a batch at a time (decision 0245). Each batch reads the consumers and
  // cursors and drops its rows in one statement, since the two are one decision (decision 0039). A cursor only rises
  // and a consumer is stored only by a deploy, so a batch drops nothing that the cursors read by the batch before
  // still hold (decision 0152). The trigger of the outbox drops each publication with the last row that names it, in
  // the statement that drops the row. The transaction is a guard: it commits the rows and the publications together
  // even if a trigger ran outside the statement that fired it (decision 0154).
  const pruneBatch = transaction(sql, Effect.gen(function*() {
    const gone = yield* rows('effecttea_outbox', Rows.seq)(sql`
      WITH floors AS (
        SELECT topic, partition, min(seq) AS through FROM effecttea_cursors WHERE name = ${name}
        GROUP BY topic, partition
        HAVING count(*) = (
          SELECT count(*) FROM effecttea_consumers WHERE effecttea_consumers.name = ${name} AND effecttea_consumers.topic = effecttea_cursors.topic
        )
      )
      DELETE FROM effecttea_outbox
      WHERE position IN (
        SELECT position FROM effecttea_outbox
        WHERE name = ${name} AND (
          NOT EXISTS (SELECT 1 FROM effecttea_consumers WHERE effecttea_consumers.name = ${name} AND effecttea_consumers.topic = effecttea_outbox.topic)
          OR seq <= (
            SELECT through FROM floors WHERE floors.topic = effecttea_outbox.topic AND floors.partition = effecttea_outbox.partition
          )
        )
        ORDER BY position LIMIT ${batch}
      )
      RETURNING seq
    `)
    return gone.length
  }))

  const prune = Effect.gen(function*() {
    let count = 0
    while (true) {
      const gone = yield* pruneBatch
      count += gone
      if (gone < batch) return count
    }
  }).pipe(Effect.orDie)

  const consumers = Effect.gen(function*() {
    const stored = yield* rows('effecttea_consumers', Rows.topical)(
      sql`SELECT topic, consumer FROM effecttea_consumers WHERE name = ${name} ORDER BY topic, consumer`,
    )
    // A partition's next row is its lowest `seq` past the cursor, which is the order its steps committed in. Its time
    // is read by the publication's key, once for each partition, whatever the rows behind (decision 0224).
    const behind = yield* rows('effecttea_cursors', Rows.behind)(sql`
      WITH behind AS (
        SELECT effecttea_consumers.topic AS topic, effecttea_consumers.consumer AS consumer, effecttea_outbox.partition AS partition,
          coalesce(effecttea_cursors.seq, 0) AS seq, count(*) AS behind, min(effecttea_outbox.seq) AS next
        FROM effecttea_consumers
        JOIN effecttea_outbox ON effecttea_outbox.name = effecttea_consumers.name AND effecttea_outbox.topic = effecttea_consumers.topic
        LEFT JOIN effecttea_cursors ON effecttea_cursors.name = effecttea_consumers.name AND effecttea_cursors.topic = effecttea_consumers.topic
          AND effecttea_cursors.consumer = effecttea_consumers.consumer AND effecttea_cursors.partition = effecttea_outbox.partition
        WHERE effecttea_consumers.name = ${name} AND effecttea_outbox.seq > coalesce(effecttea_cursors.seq, 0)
        GROUP BY effecttea_consumers.topic, effecttea_consumers.consumer, effecttea_outbox.partition, effecttea_cursors.seq
      )
      SELECT behind.topic AS topic, behind.consumer AS consumer, behind.partition AS partition, behind.seq AS seq,
        behind.behind AS behind, effecttea_publications.written_at AS since
      FROM behind
      JOIN effecttea_publications ON effecttea_publications.name = ${name} AND effecttea_publications.partition = behind.partition
        AND effecttea_publications.seq = behind.next
      ORDER BY behind.topic, behind.consumer, behind.partition
    `)
    return stored.map(({ topic, consumer }): Omit<Consumer, 'declared'> => {
      const own = behind.filter((row) => row.topic === topic && row.consumer === consumer)
      return {
        topic,
        consumer,
        behind: own.reduce((sum, row) => sum + row.behind, 0),
        since: own.length === 0 ? null : DateTime.makeUnsafe(Math.min(...own.map((row) => row.since))),
        cursors: own.map(({ partition, seq }) => ({ partition, seq })),
      }
    })
  }).pipe(Effect.orDie)

  const forget = (topic: Topic<T>, consumer: string) =>
    transaction(sql, Effect.andThen(
      sql`DELETE FROM effecttea_cursors WHERE name = ${name} AND topic = ${topic} AND consumer = ${consumer}`,
      sql`DELETE FROM effecttea_consumers WHERE name = ${name} AND topic = ${topic} AND consumer = ${consumer}`,
    )).pipe(Effect.asVoid, Effect.orDie)

  return { published, declare, fetch, ack, prune, consumers, forget }
}
