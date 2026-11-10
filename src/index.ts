/**
 * The library's main entry: what a program, its boundary and an operator use on one process. A program's module
 * alone is in `index.program.ts`, a test's helpers in `index.testing.ts`, and a launcher's on Effect Cluster in
 * `index.cluster.ts`, so that a process imports neither Cluster nor the checks of a test unless it uses them
 * (decision 0193).
 *
 * @module @fgaudo/effect-tea-persistent
 */
export * from './index.program.ts'
export { check, type Checked, type CheckedEntities, type CheckFailure } from './check.ts'
export {
  type Answer,
  type ConsumerOf,
  type Consumers,
  type Handle,
  type Inspected,
  type Keep,
  launch,
  type Operated,
  type Options,
  type Runtime,
  type Suspended,
  type Waiting,
} from './runtime.ts'
export {
  type After,
  type Comparison,
  type Consumer,
  type Counted,
  type CountedBy,
  createTables,
  type Criterion,
  type Cursor,
  type Found,
  type Published,
  type Query,
  type Reindexed,
  type Summed,
  type Suspension,
  type Tally,
} from './storage.ts'
