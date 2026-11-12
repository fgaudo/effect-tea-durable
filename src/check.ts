/**
 * The check of a program against the stored entities, before it is deployed: each entity is read as an activation
 * reads it, through the new program's migrations, and the activation is stepped by the machine, in memory. Nothing
 * is launched, held or written, so the check runs while another version holds the database (decision 0247).
 */
import * as Effect from 'effect/Effect'
import { SqlClient } from 'effect/sql'
import * as Machine from './machine.ts'
import { checkProgram, InvariantDefect, type Program, type Types } from './program.ts'
import { renamesOf } from './runtime.ts'
import { defaultPartitions, storage, tablesMade } from './storage.ts'

/** An entity the program checked would not run: where it fails, and the cause, as a suspension renders it. */
export type CheckFailure = Readonly<{
  id: string
  /**
   * `Load` where a migration or a schema of the program dies on a stored row, so that every activation of the
   * entity dies. `Activation` where the program dies on the stored state, or changes, drops or delivers otherwise an
   * operation under way, so that the activation suspends the entity.
   */
  on: 'Load' | 'Activation'
  cause: string
}>

/** What the check found of one kind of entity. */
export type CheckedEntities = Readonly<{
  /** How many entities were checked. */
  checked: number
  /** How many of them the program would not run. */
  failing: number
  /** The first `limit` of the failing ones, in the order they were read: by name, then by id. */
  failed: ReadonlyArray<CheckFailure>
}>

/** What `check` gives: the entities that are not suspended, and the suspended ones, apart. */
export type Checked = Readonly<{
  /** The entities that are not suspended, as an activation by the program finds them, after a deploy. */
  active: CheckedEntities
  /**
   * The suspended entities, as a resume by the program finds them: the activation alone, since the check handles
   * no message, and so not the message a suspended entity died on.
   */
  suspended: CheckedEntities
}>

/**
 * Reads every stored entity of `program`, as an activation of the deploy would, and gives those the program would
 * not run, with the cause of each: an entity whose rows a migration or a schema dies on, and an entity whose
 * activation would suspend it. That covers `work`, `project`, the indexes and the topics on the stored state, the
 * operations under way against the new `work`, and the `unknown` of an at-most-once operation. A suspended entity
 * is checked as a resume would activate it.
 *
 * Nothing is activated, held or written, so it runs on the database another version holds. On SQLite the client is
 * opened `readonly`, since a writable client begins each transaction with `BEGIN IMMEDIATE`, which waits for the
 * other version's steps even where it only reads (decision 0267). Each entity is read from
 * a snapshot of its own, as `inspect` reads it, and at the caller's level within a transaction the caller left
 * open. The entities are read by pages of their ids. So the check is a reading of
 * a moment: an entity created while it runs is read or not by its id, and an operation under way that ends before
 * the deploy fails nothing then.
 *
 * `limit`, a non-negative integer, is how many failures each kind gives at most. `renames` are the launch's: the
 * entities of each name renamed to the program's are read as the program's too, as the launch would rename them. A
 * program that cannot run as written, a limit or renames the launch would refuse, and tables a migration of another
 * release made are the caller's defect, as is what the runtime throws, a corrupted row included (decisions 0122,
 * 0247). The program's functions run on live data, and must be pure, as they must anyway.
 */
export const check = <T extends Types>(
  program: Program<T>,
  options: Readonly<{ limit: number; renames?: Readonly<Record<string, string>> }>,
): Effect.Effect<Checked, never, SqlClient.SqlClient> =>
  Effect.gen(function*() {
    // What a deploy and a launch refuse is refused before any row is read (decisions 0054, 0156).
    yield* Effect.sync(() => checkProgram(program))
    const { limit } = options
    if (!(Number.isSafeInteger(limit) && limit >= 0)) {
      const reason = `the check is given a limit of ${limit}, which is no non-negative integer`
      return yield* Effect.die(new InvariantDefect({ reason }))
    }
    const renames = yield* Effect.sync(() => renamesOf(options.renames))
    const renamedTo = renames.find(([from]) => from === program.name)?.[1]
    if (renamedTo !== undefined) {
      const reason = `the program '${program.name}' is checked, and the launch renames it to '${renamedTo}'`
      return yield* Effect.die(new InvariantDefect({ reason }))
    }
    yield* tablesMade
    const sql = yield* SqlClient.SqlClient
    const names = [program.name, ...renames.filter(([, to]) => to === program.name).map(([from]) => from)]
    const active = { checked: 0, failing: 0, failed: [] as Array<CheckFailure> }
    const suspended = { checked: 0, failing: 0, failed: [] as Array<CheckFailure> }
    for (const name of names) {
      const store = storage(program, sql, defaultPartitions, false, name)
      let after = ''
      while (true) {
        const page = yield* store.entities(after)
        if (page.length === 0) break
        for (const listed of page) {
          after = listed.id
          const examined = yield* store.examine(listed.id)
          // An entity gone since its page was read is no entity of the program any more.
          if (examined === null) continue
          let failure: CheckFailure | null
          let kind: typeof active
          if (examined._tag === 'Unread') {
            failure = { id: listed.id, on: 'Load', cause: examined.cause }
            kind = listed.suspended ? suspended : active
          } else {
            // The launch's rename gives the rows the program's name, and keys the entity's work by the old one
            // (decision 0156).
            const { stored } = examined
            const renamed = name === program.name
              ? stored
              : { ...stored, name: program.name, keyedAs: stored.keyedAs ?? name }
            const cause = activated(program, renamed)
            failure = cause === null ? null : { id: listed.id, on: 'Activation', cause }
            kind = stored.suspension === null ? active : suspended
          }
          kind.checked++
          if (failure === null) continue
          kind.failing++
          if (kind.failed.length < limit) kind.failed.push(failure)
        }
      }
    }
    return { active, suspended } satisfies Checked
  })

/**
 * The cause the activation of `stored` by `program` suspends it with, or null where it activates: the `Restart` of a
 * deploy, or the `Resume` of an operator for a suspended entity, stepped as the runtime steps them, the rows the step
 * would write included. What the runtime throws is thrown again (decision 0061).
 */
const activated = <T extends Types>(program: Program<T>, stored: Machine.Stored<T>): string | null => {
  const event: Machine.Event<T> = stored.suspension === null ? { _tag: 'Restart' } : { _tag: 'Resume' }
  let moved: Machine.Transition<T>
  try {
    moved = Machine.step(program, { stored, running: {} }, event)
  } catch (thrown) {
    return Machine.programCause(thrown)
  }
  const { suspension } = moved.machine.stored
  return suspension === null ? null : Machine.render(suspension.cause)
}
