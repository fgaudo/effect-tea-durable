/**
 * The entry of a user's tests: a rehearsal of a program without storage or clock, the checks of its projection and
 * of its migrations, and the digest of a key, for a test that checks the key a service received (decision 0193).
 * The scheduler of the library's own tests stays in `testing.ts`, and is no part of it.
 */
export { digestOf } from './machine.ts'
export {
  accepted,
  type Member,
  type Outside,
  type Pending,
  type Rehearsal,
  rehearse,
  rejected,
  type World,
} from './rehearse.ts'
export {
  type Allows,
  type Candidate,
  type MigrationCase,
  migrationViolations,
  type MigrationViolation,
  projectionViolations,
  type ProjectionViolation,
} from './testing.ts'
