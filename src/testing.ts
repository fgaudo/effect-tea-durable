import type * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import { isRejected, type Program, type Types } from './program.ts'

type TagOf<Message> = Message extends Readonly<{ _tag: infer Tag extends string }> ? Tag : never

/**
 * For each kind of inbound message the projection speaks of, by its tag, whether the projection allows it. A
 * projection is plain data (a `canCancel`), so the test says which of its fields stands for which message. Kinds
 * it does not speak of (a report from the warehouse) are left out.
 */
export type Allows<T extends Types> = {
  readonly [Tag in TagOf<T['inbound']>]?: (
    projection: T['projection'],
    message: Extract<T['inbound'], Readonly<{ _tag: Tag }>>,
  ) => boolean
}

/** An inbound message a caller could send, with who sends it. */
export type Candidate<T extends Types> = Readonly<{ message: T['inbound']; sender: T['sender'] }>

/**
 * How a projection breaks its agreement with `update` in a state:
 * - `Rejected`: it allows a message that `update` rejects, so a caller who acts on what it reads is refused;
 * - `Missing`: `update` accepts a message that it does not allow, so no caller learns that it may.
 */
export type ProjectionViolation<T extends Types> = Readonly<{ _tag: 'Rejected' | 'Missing' } & Candidate<T>>

/**
 * Checks `program.project(state)` against `update` in `state`, both ways, as effect-tea's `dispatchViolations`
 * checks a view. Each of the `candidates`, the messages its reader could send, from the senders it speaks for (a
 * customer, for the customer's own order), is sent as a caller at `at`: one the projection allows must be
 * accepted, and one it does not allow must be rejected. Candidates of a kind `allows` leaves out are skipped. A
 * retry is answered from the stored reply, so nothing here checks that a message acts once. Returns every
 * violation, so that a test can assert there are none, for generated states.
 */
export const projectionViolations = <T extends Types>(program: Program<T>, allows: NoInfer<Allows<T>>) =>
(
  state: T['state'],
  candidates: Iterable<Candidate<T>>,
  at: DateTime.Utc,
): ReadonlyArray<ProjectionViolation<T>> => {
  const projection = program.project(state)
  const violations: Array<ProjectionViolation<T>> = []
  for (const { message, sender } of candidates) {
    // `Allows` has a predicate for some tags of `T['inbound']`, which TypeScript cannot index by a tag it holds.
    const allowed = (allows as Readonly<
      Record<string, ((projection: T['projection'], message: T['inbound']) => boolean) | undefined>
    >)[(message as Readonly<{ _tag: string }>)._tag]
    if (allowed === undefined) continue
    const shown = allowed(projection, message)
    const accepted = !isRejected(program.update(message, { at, from: { _tag: 'Caller', sender } })(state))
    if (shown && !accepted) violations.push({ _tag: 'Rejected', message, sender })
    if (!shown && accepted) violations.push({ _tag: 'Missing', message, sender })
  }
  return violations
}

/**
 * A value frozen through: its plain objects and arrays. Anything else — a `DateTime`, a schema — is left as it is,
 * since Effect may keep on it what it computes of it. The library's tests run on such values, so that a mutation of
 * the library's throws (decision 0052); not part of the public surface.
 */
export const frozen = <A>(value: A): A => {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  const prototype: unknown = Object.getPrototypeOf(value)
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return value
  Object.freeze(value)
  for (const field of Object.values(value)) frozen(field)
  return value
}

const freezings = new WeakMap<object, object>()

/**
 * `program`, whose every value crosses the library frozen: what `init`, `update`, `durable` and `project` give,
 * and what its runners deliver. The same program gives the same one, which a runtime may compare by identity.
 */
export const freezing = <T extends Types>(program: Program<T>): Program<T> => {
  const held = freezings.get(program)
  if (held !== undefined) return held as Program<T>
  type Any = Readonly<{
    delivery: string
    run: (...args: ReadonlyArray<unknown>) => Effect.Effect<unknown, never, unknown>
    unknown?: (operation: unknown) => unknown
  }>
  const operations = Object.fromEntries(
    Object.entries(program.operations as Readonly<Record<string, Any>>).map(([tag, runner]) => [tag, {
      ...runner,
      run: (...args: ReadonlyArray<unknown>) => Effect.map(runner.run(...args), frozen),
      ...(runner.unknown === undefined ? {} : { unknown: (operation: unknown) => frozen(runner.unknown?.(operation)) }),
    }]),
  ) as unknown as Program<T>['operations']
  const wrapped: Program<T> = {
    ...program,
    init: (flags, at) => frozen(program.init(flags, at)),
    update: (message, meta) => (state) => frozen(program.update(message, meta)(state)),
    durable: (state) => frozen(program.durable(state)),
    project: (state) => frozen(program.project(state)),
    operations,
  }
  freezings.set(program, wrapped)
  return wrapped
}
