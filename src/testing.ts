import type * as DateTime from 'effect/DateTime'
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
