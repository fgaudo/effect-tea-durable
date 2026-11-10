/**
 * The read model as the storage keeps it: the rows of `effecttea_projections`, the expression indexes over them, and
 * the queries, counts and sums that read them, alike on both dialects (decisions 0032, 0148, 0157, 0241).
 */
import * as Effect from 'effect/Effect'
import * as Hash from 'effect/Hash'
import type { Statement } from 'effect/sql'
import * as Machine from '../machine.ts'
import { InvariantDefect, isText, type Json, type Scalar, type Types } from '../program.ts'
import type { Storage } from '../storage.ts'
import type { Held } from './held.ts'
import { batch, Rows } from './rows.ts'

/**
 * Whether a caller's value is one a query compares alike on both dialects: null, a boolean, a finite number, or a
 * string that is text a database holds (decisions 0143, 0207).
 */
const isCompared = (value: unknown): value is Scalar =>
  value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))
  || (typeof value === 'string' && isText(value))

/** A caller's value as a reason shows it: a string as JSON writes it, so that U+0000 is read. */
const shownValue = (value: unknown): string =>
  typeof value === 'string' || (typeof value === 'object' && value !== null) ? JSON.stringify(value) : String(value)

/** How a query compares an index with a value. */
export type Comparison = '=' | '<>' | '<' | '<=' | '>' | '>='

const comparisons: ReadonlyArray<Comparison> = ['=', '<>', '<', '<=', '>', '>=']

/**
 * One thing that holds of the entities a query finds: the value of an index, compared with a value. Against
 * `null`, `=` and `<>` ask whether the index holds one; an order against `null` finds nothing, as in SQL. A value
 * that is a number but not finite, or a string that is no text a database holds, is the caller's defect, since the
 * dialects would answer it otherwise (decision 0207).
 */
export type Criterion<T extends Types> = Readonly<{ index: T['index']; is: Comparison; value: Scalar }>

/** What a query across the entities of one program asks (decision 0032). */
export type Query<T extends Types> = Readonly<{
  /** Every criterion holds of the entities found; a query with none finds them all. */
  where?: ReadonlyArray<Criterion<T>>
  /**
   * The index they are ordered by, then the id, ascending unless `descending`, which reverses both: entities whose
   * index is null come first ascending and last descending (decision 0145).
   */
  order?: Readonly<{ index: T['index']; descending?: boolean }>
  /** How many at most, in that order: a query is a page (decision 0141). */
  limit: number
  /**
   * The last row a page gave: the rows given are past it in the order, by the value of the index ordered by and,
   * among the rows that tie, by the id. None, `undefined` included, is the first page, so that the last row of a
   * page is passed as it is, `undefined` where the page was empty (decision 0143).
   */
  after?: After<T> | undefined
}>

/** What a count across the entities of one program asks: the criteria a query takes (decision 0148). */
export type Counted<T extends Types> = Readonly<{ where?: ReadonlyArray<Criterion<T>> }>

/** What a sum across the entities of one program asks: the index added, and the criteria a query takes (decision 0148). */
export type Summed<T extends Types> = Readonly<{ index: T['index']; where?: ReadonlyArray<Criterion<T>> }>

/**
 * What a count per value of an index asks: the index grouped by, the criteria a query takes, and how many values at
 * most (decision 0150).
 */
export type CountedBy<T extends Types> = Readonly<{
  index: T['index']
  where?: ReadonlyArray<Criterion<T>>
  limit: number
}>

/** A value of an index, and how many of the entities counted hold it (decision 0150). */
export type Tally = Readonly<{ value: Scalar; count: number }>

/** A row a query gave, as a later page reads past it (decision 0143). */
export type After<T extends Types> = Readonly<{ id: string; indexes: Readonly<Record<T['index'], Scalar>> }>

/**
 * An entity a query found, as a caller reads it, with the value of each index as its row stores it: the values the
 * query compared, which a row written by an older version holds until `reindex` (decision 0143).
 */
export type Found<T extends Types> = Readonly<{
  id: string
  projection: T['projection']
  indexes: Readonly<Record<T['index'], Scalar>>
}>

/**
 * What a `reindex` did: how many rows it wrote, and the entities whose row it could not compute, each with the
 * cause, rendered as a suspension's is. The row of such an entity is left as it was (decision 0122).
 */
export type Reindexed = Readonly<{
  written: number
  failed: ReadonlyArray<Readonly<{ id: string; cause: string }>>
}>

/** An identifier a database reads as written: a program's name is the author's, and is quoted, not escaped away. */
const quoted = (identifier: string) => `"${identifier.replaceAll('"', '""')}"`

/**
 * The name of an index on PostgreSQL, which keeps the first 63 bytes of a name. A longer name keeps its first 50
 * bytes, and ends with the hash of the whole, so that two long names that share their first bytes name two indexes
 * (decision 0157).
 */
const indexName = (whole: string) => {
  const bytes = new TextEncoder().encode(whole)
  if (bytes.length <= 63) return whole
  const hash = (Hash.string(whole) >>> 0).toString(16).padStart(8, '0')
  // A character cut in the middle of its bytes is decoded as U+FFFD, which is dropped.
  return `${new TextDecoder().decode(bytes.slice(0, 50)).replace(/\uFFFD$/u, '')} ${hash}`
}

/**
 * The JSON of a row's indexes, as `json_extract` reads them equal to the value a query binds. An integer beyond
 * 2^53 is written with the exact digits of its double, since `JSON.stringify` writes the fewest digits that read
 * back as it, which SQLite reads as the exact integer they spell, another number (decision 0146).
 */
const indexesText = (indexes: Machine.Shown['indexes']) =>
  `{${
    Object.entries(indexes).map(([index, value]) =>
      `${JSON.stringify(index)}:${
        typeof value === 'number' && Number.isInteger(value) && !Number.isSafeInteger(value)
          ? BigInt(value).toString()
          : JSON.stringify(value)
      }`
    ).join(',')
  }}`

/** The row of the read model the machine computed of a state, written over the entity's (decision 0032). */
export const rowOf = <T extends Types>(held: Held<T>) => {
  const { name, version, upsert } = held
  /** The row a query reads, as the machine computed it from a state (decision 0032). */
  const row = (id: string, shown: Machine.Shown, projection: string = JSON.stringify(shown.projection)) =>
    upsert('effecttea_projections', ['name', 'id'], { name, id, projection, indexes: indexesText(shown.indexes), version })
  return row
}

/** The part of the storage of one program that reads and writes its read model. */
export const projectionsOf = <T extends Types>(held: Held<T>): Pick<
  Storage<T>,
  'indexed' | 'query' | 'count' | 'sum' | 'countBy' | 'projected' | 'reindex'
> => {
  const { program, sql, name, version, dialect, rows, up, snapshot } = held
  const { state, projection } = held.codecs

  /**
   * The path of an index in the JSON of a row's indexes. A program's indexes are words, which its check made sure of
   * where it entered (decision 0054).
   */
  const pathOf = (index: string) => {
    if (!Object.hasOwn(program.indexes, index)) {
      throw new Error(`'${index}' is no index of the program '${name}'`)
    }
    return `'$.${index}'`
  }

  /** The jsonb value of an index on PostgreSQL, SQL's NULL where the row lacks the index. */
  const valueOf = (index: string) => `((indexes::jsonb) -> '${index}')`

  /**
   * The expressions that read an index out of the row and order it, each written once. The index created and the
   * query must share them, since a database uses an index of an expression only where the query writes the
   * expression the same way. On SQLite the expression is what `json_extract` gives. On PostgreSQL three expressions
   * order a value as `json_extract` does: its kind, null first, then numbers and booleans, then strings; its
   * number, a boolean being 1 or 0; and its string, compared by its bytes as SQLite compares text (decision 0157).
   */
  const expressionsOf = (index: string): ReadonlyArray<string> => {
    const path = pathOf(index)
    if (dialect === 'sqlite') return [`json_extract(indexes, ${path})`]
    const value = valueOf(index)
    return [
      `(CASE jsonb_typeof(${value}) WHEN 'number' THEN 1 WHEN 'boolean' THEN 1 WHEN 'string' THEN 2 ELSE 0 END)`,
      `(CASE jsonb_typeof(${value}) WHEN 'number' THEN CAST(${value} AS NUMERIC)`
      + ` WHEN 'boolean' THEN CASE WHEN CAST(${value} AS BOOLEAN) THEN 1 ELSE 0 END ELSE 0 END)`,
      `((CASE WHEN jsonb_typeof(${value}) = 'string' THEN ${value} #>> '{}' ELSE '' END) COLLATE "C")`,
    ]
  }

  /** The index as one value, or as the row of its expressions on PostgreSQL, which compares as one. */
  const columnOf = (index: string) => {
    const expressions = expressionsOf(index)
    return sql.literal(expressions.length === 1 ? expressions[0]! : `(${expressions.join(', ')})`)
  }

  /** The kind of an index on PostgreSQL, 0 where it holds no value. */
  const kindOf = (index: string) => sql.literal(expressionsOf(index)[0]!)

  const indexed = Effect.gen(function*() {
    for (const index of Object.keys(program.indexes)) {
      // The id follows the value, so that the rows that tie are in the order of their id and a page reads them past
      // its cursor as a range (decision 0145). PostgreSQL takes an expression of an index in parentheses, and cuts a name past
      // 63 bytes, so the storage cuts a longer name itself, and ends it with a hash of the whole (decision 0157). Every
      // deploy makes the indexes its program declares, so an index is made only where it is missing (decision 0218).
      if (dialect === 'pg') {
        const on = `effecttea_projections (name, ${expressionsOf(index).join(', ')}, id)`
        const named = quoted(indexName(`effecttea_projections ${name} ${index} by id`))
        yield* sql.unsafe(`CREATE INDEX IF NOT EXISTS ${named} ON ${on}`)
        continue
      }
      const on = `effecttea_projections (name, ${expressionsOf(index)[0]}, id)`
      yield* sql.unsafe(`CREATE INDEX IF NOT EXISTS ${quoted(`effecttea_projections ${name} ${index} by id`)} ON ${on}`)
    }
  }).pipe(Effect.orDie)

  /**
   * A value as a query compares an index with it. On SQLite a boolean is stored as JSON's, which `json_extract`
   * gives as 1 or 0. On PostgreSQL the value is the row of its kind, its number and its string, as the expressions of
   * an index read a row of it. A number is bound by the digits a row of it holds: the exact digits of an integer
   * beyond 2^53 (decisions 0146, 0157).
   */
  const bound = (value: Exclude<Scalar, null>): Statement.Fragment => {
    if (dialect === 'sqlite') return sql`${typeof value === 'boolean' ? (value ? 1 : 0) : value}`
    const none = sql.literal(`CAST('' AS TEXT) COLLATE "C"`)
    if (typeof value === 'string') return sql`(2, CAST(0 AS NUMERIC), CAST(${value} AS TEXT) COLLATE "C")`
    if (typeof value === 'boolean') return sql`(1, CAST(${value ? 1 : 0} AS NUMERIC), ${none})`
    const digits = Number.isInteger(value) && !Number.isSafeInteger(value) ? BigInt(value).toString() : String(value)
    return sql`(1, CAST(${digits} AS NUMERIC), ${none})`
  }

  /**
   * An index compared with a value. As in SQL, an index that holds no value holds of no comparison, which the
   * kind says on PostgreSQL, where the row of a null compares as any other.
   */
  const compared = (index: string, is: Comparison, value: Exclude<Scalar, null>) =>
    dialect === 'pg'
      ? sql`${kindOf(index)} <> 0 AND ${columnOf(index)} ${sql.literal(is)} ${bound(value)}`
      : sql`${columnOf(index)} ${sql.literal(is)} ${bound(value)}`

  /** Whether an index holds no value, as the expressions of each dialect give it. */
  const isNull = (index: string) => dialect === 'pg' ? sql`${kindOf(index)} = 0` : sql`${columnOf(index)} IS NULL`
  const isNotNull = (index: string) =>
    dialect === 'pg' ? sql`${kindOf(index)} <> 0` : sql`${columnOf(index)} IS NOT NULL`

  /** The order of an index, each of its expressions in `direction`. */
  const orderOf = (index: string, direction: 'ASC' | 'DESC') =>
    sql.literal(expressionsOf(index).map((expression) => `${expression} ${direction}`).join(', '))

  /** The clauses every row holds, and no row holds, written alike in both dialects. */
  const always = sql`1 = 1`
  const never = sql`1 = 0`

  /**
   * Checks `after`, and gives its value for the index ordered by, or null without an order. A row that holds no id,
   * or no scalar of that index, is the caller's defect (decision 0143).
   */
  const cursorOf = (after: After<T>, index: string | undefined) => {
    if (typeof after !== 'object' || after === null) {
      throw new InvariantDefect({ reason: `the row after is ${String(after)}, which is no row` })
    }
    if (typeof after.id !== 'string') {
      throw new InvariantDefect({ reason: `the id after is ${String(after.id)}, which is no string` })
    }
    // No row holds an id that is no text a database holds, and PostgreSQL takes no U+0000 in a parameter of text
    // (decision 0207).
    if (!isText(after.id)) {
      throw new InvariantDefect({
        reason: `the id after is ${JSON.stringify(after.id)}, which is no text a database holds`,
      })
    }
    if (index === undefined) return null
    const value: unknown = (after.indexes as Readonly<Record<string, unknown>> | undefined)?.[index]
    if (!isCompared(value)) {
      throw new InvariantDefect({ reason: `the index '${index}' after is ${shownValue(value)}, which is no scalar` })
    }
    return value
  }

  /**
   * The parts of the order past `after`, each a clause and the order SQLite reads it in as a range of the index, in
   * the order of the query: the rows that tie with `after` past its id, then the rows past its value, then, in a
   * descending order, the rows that hold no value, which come last there (decision 0145).
   */
  const parts = (after: After<T> | undefined, order: Query<T>['order']) => {
    const descending = order?.descending === true
    const direction = sql.literal(descending ? 'DESC' : 'ASC')
    if (order === undefined) {
      const by = sql`id ASC`
      if (after === undefined) return [{ clause: always, by }]
      cursorOf(after, undefined)
      return [{ clause: sql`id > ${after.id}`, by }]
    }
    const ordered = sql`${orderOf(order.index, descending ? 'DESC' : 'ASC')}, id ${direction}`
    if (after === undefined) return [{ clause: always, by: ordered }]
    const value = cursorOf(after, order.index)
    const id = sql`id ${sql.literal(descending ? '<' : '>')} ${after.id}`
    // The rows that tie hold one value, so the order of the index is their order by id. PostgreSQL does not know
    // that the expressions of a value are the same for each of them, and sorts rows ordered by the id alone
    // (decision 0157).
    const byId = dialect === 'pg' ? ordered : sql`id ${direction}`
    if (value === null) {
      const tied = { clause: sql`${isNull(order.index)} AND ${id}`, by: byId }
      // On SQLite every value an index stores but null is greater than -Infinity, which no stored value is, since
      // the indexes are written by `JSON.stringify`: so the rows past the nulls are a range, where `IS NOT NULL` is
      // not. On PostgreSQL the kind of every value but null is past 0 (decision 0157).
      const past = dialect === 'pg'
        ? sql`${kindOf(order.index)} > 0`
        : sql`${columnOf(order.index)} > ${-Infinity}`
      return descending ? [tied] : [tied, { clause: past, by: ordered }]
    }
    const tied = { clause: sql`${compared(order.index, '=', value)} AND ${id}`, by: byId }
    const later = { clause: compared(order.index, descending ? '<' : '>', value), by: ordered }
    return descending ? [tied, later, { clause: isNull(order.index), by: byId }] : [tied, later]
  }

  /** The clauses of the rows of the program that match `where`, as a query, a count and a sum read them. */
  const criteria = (where: ReadonlyArray<Criterion<T>>) => {
    const clauses = [sql`name = ${name}`]
    for (const { index, is, value } of where) {
      if (!comparisons.includes(is)) throw new Error(`'${is}' is no comparison`)
      // SQLite finds no row under `NaN`, where PostgreSQL holds it a number past every other, and PostgreSQL takes
      // no U+0000 in a parameter of text: so the dialects would answer the same question otherwise (decision 0207).
      if (!isCompared(value)) {
        throw new InvariantDefect({
          reason: `the value compared with the index '${index}' is ${shownValue(value)}, which is no scalar a query compares`,
        })
      }
      clauses.push(
        // Nothing but `=` and `<>` says anything of an index that holds no value, as in SQL, where a
        // comparison with null is null: `never` is the clause no row holds.
        value === null
          ? is === '=' ? isNull(index) : is === '<>' ? isNotNull(index) : never
          : compared(index, is, value),
      )
    }
    return clauses
  }

  const query = ({ after, limit, order, where = [] }: Query<T>) =>
    Effect.gen(function*() {
      const clauses = criteria(where)
      const read = parts(after, order)
      const page = (clause: Statement.Fragment, by: Statement.Fragment, left: number) =>
        rows('effecttea_projections', Rows.projection)(sql`
          SELECT id, projection, indexes, version FROM effecttea_projections
          WHERE ${sql.and([...clauses, clause])} ORDER BY ${by} LIMIT ${left}
        `)
      // The parts are read from one snapshot, so that a step between two of them moves no row into the page twice
      // (decision 0145).
      const found = yield* snapshot(Effect.gen(function*() {
        const found: Array<Effect.Success<ReturnType<typeof page>>[number]> = []
        for (const { clause, by } of read) {
          if (found.length >= limit) break
          found.push(...yield* page(clause, by, limit - found.length))
        }
        return found
      }))
      // A row the version before wrote is read through its migrations; `reindex` is what writes it again.
      return found.map((held): Found<T> => ({
        id: held.id,
        projection: projection.read(held.projection, up('projection', held.version)),
        indexes: storedIndexes(held.indexes),
      }))
    }).pipe(Effect.orDie)

  const count = ({ where = [] }: Counted<T>) =>
    Effect.gen(function*() {
      const [counted] = yield* rows('effecttea_projections', Rows.count)(
        sql`SELECT COUNT(*) AS count FROM effecttea_projections WHERE ${sql.and(criteria(where))}`,
      )
      return counted?.count ?? 0
    }).pipe(Effect.orDie)

  /** The kind of an index's value on SQLite, NULL where the row lacks the index. */
  const kind = (index: string) => sql.literal(`json_type(indexes, ${pathOf(index)})`)
  /** The jsonb value of an index on PostgreSQL, and its type, NULL where the row lacks the index. */
  const value = (index: string) => {
    pathOf(index)
    return sql.literal(valueOf(index))
  }
  const typed = (index: string) => sql.literal(`jsonb_typeof(${valueOf(index)})`)
  /** Whether an index holds a boolean on PostgreSQL: false where the row lacks the index, as for JSON's null. */
  const boolean = (index: string) => sql`coalesce(${typed(index)} = 'boolean', FALSE)`

  const sum = ({ index, where = [] }: Summed<T>) =>
    Effect.gen(function*() {
      // On SQLite `json_type` tells `true` from `1`, which `json_extract` gives alike, and is NULL where the row
      // lacks the index. `TOTAL` gives a double and never fails on an overflow of SQLite's integers, where `SUM` does
      // (decision 0148). On PostgreSQL the numbers are added exactly as `NUMERIC`, and read as text, since a total
      // of doubles there fails the statement on an overflow and depends on the order of the rows (decision 0209).
      const [summed] = yield* rows('effecttea_projections', Rows.total)(
        dialect === 'pg'
          ? sql`
            SELECT CAST(COALESCE(SUM(CASE WHEN ${typed(index)} = 'number' THEN CAST(${value(index)} AS NUMERIC) END),
                     0) AS TEXT) AS total,
                   CAST(COALESCE(SUM(CASE WHEN ${typed(index)} = 'number' THEN ABS(CAST(${value(index)} AS NUMERIC)) END),
                     0) AS TEXT) AS magnitude,
                   MIN(CASE WHEN ${typed(index)} NOT IN ('number', 'null') THEN id END) AS refused
            FROM effecttea_projections WHERE ${sql.and(criteria(where))}
          `
          : sql`
            SELECT TOTAL(CASE WHEN ${kind(index)} IN ('integer', 'real') THEN ${columnOf(index)} END) AS total,
                   TOTAL(CASE WHEN ${kind(index)} IN ('integer', 'real') THEN ABS(${columnOf(index)}) END) AS magnitude,
                   MIN(CASE WHEN ${kind(index)} NOT IN ('integer', 'real', 'null') THEN id END) AS refused
            FROM effecttea_projections WHERE ${sql.and(criteria(where))}
          `,
      )
      if (summed === undefined) return 0
      if (summed.refused !== null) {
        return yield* Effect.die(
          new InvariantDefect({ reason: `the index '${index}' of '${summed.refused}' holds no number, and is no sum's` }),
        )
      }
      // A total of the magnitudes that is a double bounds every partial total, in whatever order SQLite adds the
      // rows, so both dialects refuse the same sums (decision 0209).
      if (!Number.isFinite(Number(summed.magnitude))) {
        return yield* Effect.die(
          new InvariantDefect({ reason: `the total of the index '${index}' is past the largest double` }),
        )
      }
      return Number(summed.total)
    }).pipe(Effect.orDie)

  /** On SQLite, the kind of an index's value, `null` where the row lacks it, and the value as its JSON text. */
  const grouped = (index: string) => sql.literal(`coalesce(json_type(indexes, ${pathOf(index)}), 'null')`)
  const text = (index: string) => sql.literal(`coalesce(indexes -> ${pathOf(index)}, 'null')`)

  const countBy = ({ index, where = [], limit }: CountedBy<T>) =>
    Effect.gen(function*() {
      // `json_extract` gives `true` as `1`, so the kind of the value groups too, and JSON's null and a path the row
      // lacks are one kind, as a query reads them. The value is read as its JSON text, which tells `true` from `1`
      // where the column does not. A boolean comes after the number SQLite reads it as (decision 0150). On
      // PostgreSQL the expressions of the index order the values as on SQLite, and jsonb's type tells a boolean from
      // its number (decision 0157).
      const column = columnOf(index)
      const tallies = yield* rows('effecttea_projections', Rows.tally)(
        dialect === 'pg'
          ? sql`
            SELECT min(CAST(coalesce(${value(index)}, 'null'::jsonb) AS TEXT)) AS value, count(*) AS count
            FROM effecttea_projections WHERE ${sql.and(criteria(where))}
            GROUP BY ${column}, ${boolean(index)}
            ORDER BY ${orderOf(index, 'ASC')}, ${boolean(index)} LIMIT ${limit}
          `
          : sql`
            SELECT min(${text(index)}) AS value, count(*) AS count FROM effecttea_projections WHERE ${sql.and(criteria(where))}
            GROUP BY ${column}, ${grouped(index)}
            ORDER BY ${column}, ${grouped(index)} IN ('true', 'false') LIMIT ${limit}
          `,
      )
      return tallies.map(({ value, count }): Tally => ({ value: JSON.parse(value) as Scalar, count }))
    }).pipe(Effect.orDie)

  /**
   * The value of each index of the program in a stored row, as a query reads it: an index the row lacks, one a
   * later version added, is null, as `json_extract` gives it.
   */
  const storedIndexes = (text: string): Found<T>['indexes'] => {
    const stored = JSON.parse(text) as Readonly<Record<string, Scalar>>
    return Object.fromEntries(
      Object.keys(program.indexes).map((index) => [index, Object.hasOwn(stored, index) ? stored[index] : null]),
    ) as Found<T>['indexes']
  }

  const projected = (id: string) =>
    Effect.gen(function*() {
      const found = yield* rows('effecttea_projections', Rows.projection)(
        sql`SELECT id, projection, indexes, version FROM effecttea_projections WHERE name = ${name} AND id = ${id}`,
      )
      const held = found[0]
      return held === undefined ? null : projection.read(held.projection, up('projection', held.version))
    }).pipe(Effect.orDie)

  const reindex = Effect.gen(function*() {
    let cursor = ''
    let written = 0
    const failed: Array<Readonly<{ id: string; cause: string }>> = []
    while (true) {
      const page = yield* rows('effecttea_entities', Rows.state)(sql`
        SELECT id, state, version FROM effecttea_entities
        WHERE name = ${name} AND id > ${cursor} ORDER BY id LIMIT ${batch}
      `)
      if (page.length === 0) return { written, failed } satisfies Reindexed
      for (const held of page) {
        cursor = held.id
        // What the program computes of the row is caught for each entity, and leaves that entity's row: a state no
        // version reads, a migration or the state's schema that dies on it, or the program's defect in `shownOf`.
        // The others are written (decision 0122). What the runtime throws still fails the whole call (decision
        // 0061): a statement, a text that is no JSON, which only a corrupted row holds, and anything `shownOf`
        // throws that is not the program's.
        const text = JSON.parse(held.state) as Json
        let read: T['state']
        try {
          read = state.decode(up('state', held.version)(text))
        } catch (thrown) {
          failed.push({ id: held.id, cause: Machine.render(thrown) })
          continue
        }
        let shown: Machine.Shown
        try {
          shown = Machine.shownOf(program, read)
        } catch (thrown) {
          failed.push({ id: held.id, cause: Machine.programCause(thrown) })
          continue
        }
        // The row is written only if the state it was computed from is still the one stored, in one statement
        // (decision 0070). A step that committed since wrote its own row, which this would replace with a
        // projection the entity has moved past.
        const rewritten = yield* rows('effecttea_projections', Rows.id)(sql`
          INSERT INTO effecttea_projections (name, id, projection, indexes, version)
          SELECT name, id, CAST(${JSON.stringify(shown.projection)} AS TEXT), CAST(${
          indexesText(shown.indexes)
        } AS TEXT), CAST(${version} AS INTEGER)
          FROM effecttea_entities WHERE name = ${name} AND id = ${held.id} AND state = ${held.state}
            AND version = ${held.version}
          ON CONFLICT (name, id)
          DO UPDATE SET projection = excluded.projection, indexes = excluded.indexes, version = excluded.version
          RETURNING id
        `)
        written += rewritten.length
      }
    }
  }).pipe(Effect.orDie)

  return { indexed, query, count, sum, countBy, projected, reindex }
}
