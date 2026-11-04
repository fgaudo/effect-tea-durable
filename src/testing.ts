import type * as DateTime from 'effect/DateTime'
import * as Effect from 'effect/Effect'
import type * as Exit from 'effect/Exit'
import type * as Fiber from 'effect/Fiber'
import type * as Scheduler from 'effect/Scheduler'
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
 * checks a view. The `candidates` are the messages the projection's reader could send, from the senders it
 * speaks for: a customer, for the customer's own order. Each is sent as a caller at `at`. One the projection
 * allows must be accepted, and one it does not allow must be rejected. Candidates of a kind `allows` leaves out
 * are skipped. A retry is answered from the stored reply, so nothing here checks that a message acts once.
 * Returns every violation, so that a test can assert there are none, for generated states.
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

/**
 * A task ready to run, as a strategy sees it: the fiber that a preemption or a resumption made yield, by its id less
 * the run's first. It is `undefined` for any other task, which Effect schedules with no fiber this scheduler can
 * name: a fork, the wake of a `Queue` or a `Semaphore`, a fiber's own `yieldNow`.
 */
export type Ready = Readonly<{ fiber: number | undefined }>

/**
 * What decides a run under `controlled`. It is asked which ready task runs next, only when more than one is ready.
 * It is asked whether the fiber running yields at a step, only when another task is ready, since a yield with none
 * changes nothing. The fiber is named by its id less the run's first, since Effect counts ids for the process.
 */
export type Strategy = Readonly<{
  pick: (ready: ReadonlyArray<Ready>) => number
  preempt: (fiber: number, ready: ReadonlyArray<Ready>) => boolean
}>

/**
 * How a run under `controlled` takes a fiber that a `Deferred`, a `Fiber.join` or a callback resumes:
 * - `queued`, the default: it yields first, and waits for its pick as a fork does. Effect resumes it inline, on the
 *   stack of the fiber that completes it, so this reaches orders Effect's scheduler does not give at 4.1.2, as one
 *   whose resumptions were not inline would (decision 0104);
 * - `inline`: it runs on where Effect resumes it, as under Effect's scheduler, so that a run reaches only the orders
 *   it gives, but for the preemptions and picks a strategy decides.
 */
export type Resumptions = 'queued' | 'inline'

/** What a run under `controlled` decided, in order: its picks, and its answers of preemption. */
export type Schedule = Readonly<{ picks: ReadonlyArray<number>; preemptions: ReadonlyArray<boolean> }>

/**
 * A run under `controlled`. `exit` is `undefined` for a run that did not end: nothing was left to run, it took
 * `maxSteps`, as one that starves does, or it spun.
 */
export type Run<A, E> = Readonly<{
  exit: Exit.Exit<A, E> | undefined
  schedule: Schedule
  /** How many tasks it ran. */
  steps: number
  /**
   * Whether a task asked `maxOps` times to yield, as a fiber that never waits does. The run stops there, since that
   * fiber would run on in that task forever, and no count of tasks would stop it.
   */
  spun: boolean
  /**
   * How many tasks were ready still as it ended. They are not run: a fiber the root did not wait for, as a daemon,
   * stops where it was, so a check reads what the root waited for alone.
   */
  left: number
}>

/**
 * A scheduler that holds every task Effect gives it and runs the one `strategy` picks, stepped by hand
 * (decision 0104). It keeps the rules its spike found, in `spikes/effect-scheduler-controlled.test.ts`:
 * - a fiber that starts to run again yields once first, so that one resumed inline, by a `Deferred`, a `Fiber.join`
 *   or a callback, waits for its pick as one forked does;
 * - but not at its first run, which is a task already, its fork, or runs inline where Effect starts it;
 * - nor where it yielded before and is the first fiber its own task runs: an interruption runs such a fiber inline,
 *   on the stack of the fiber that interrupts, and it waits for its pick there;
 * - nor where it is the fiber let run last in the task under way, which Effect runs again as its run ends, to
 *   interrupt its children. So a fiber resumed inline while it is still that one runs on unpicked, which takes a
 *   fiber started inline, by `startImmediately` or a `runFork`, as the runtime does not.
 * Under `inline` resumptions none of these yields is made, and a fiber is asked only of preemption.
 */
const controlled = (strategy: Strategy, resumptions: Resumptions) => {
  const ready: Array<Readonly<{ task: () => void; fiber: number | undefined }>> = []
  const picks: Array<number> = []
  const preemptions: Array<boolean> = []
  const started = new WeakSet<Fiber.Fiber<unknown, unknown>>()
  const letThrough = new WeakSet<Fiber.Fiber<unknown, unknown>>()
  // Whether a task has started and no fiber has started to run in it yet.
  let entering = false
  // The fiber let run last in the task under way, forgotten as each task starts.
  let running: Fiber.Fiber<unknown, unknown> | undefined
  // The fiber this scheduler has just made yield: the task Effect schedules next is its yield's.
  let yielding: number | undefined
  let first: number | undefined
  // How many times the task under way has asked to yield, counted from each task's start.
  let ops = 0
  let spun = false
  // What a strategy or a flush threw. Thrown inside a fiber, Effect takes it for a defect of that fiber, which the
  // effect under test can catch, and asks again: so the run stops, and `scheduled` throws it.
  let failure: Readonly<{ error: unknown }> | undefined
  const stopped = () => spun || failure !== undefined
  const id =(fiber: Fiber.Fiber<unknown, unknown>) => fiber.id - first!
  const tasks = () => ready.map(({ fiber }) => ({ fiber }))
  const yields = (fiber: Fiber.Fiber<unknown, unknown>) => {
    if (fiber.currentOpCount === 1) {
      const firstRun = !started.has(fiber)
      const resumed = entering && letThrough.delete(fiber)
      const ended = fiber === running
      entering = false
      // Under `inline`, no fiber yields at its first step, as under Effect's scheduler with a budget above 1.
      if (resumptions === 'inline' || firstRun || resumed || ended) {
        started.add(fiber)
        return false
      }
    } else {
      // Effect counts a fiber's steps from 0 at every run, and yields once the count reaches its budget. A budget of 2
      // yields the step a fiber was resumed for, at every run, and the fiber never gets on: so the least that runs is
      // 3, and no preemption comes before a run's third step (decision 0115).
      if (fiber.currentOpCount < leastBudget) return false
      if (ready.length === 0) return false
      const preempts = strategy.preempt(id(fiber), tasks())
      preemptions.push(preempts)
      if (!preempts) return false
    }
    letThrough.add(fiber)
    yielding = id(fiber)
    return true
  }
  const scheduler: Scheduler.Scheduler = {
    executionMode: 'async',
    shouldYield(fiber) {
      // The root asks first: Effect runs it inline as it forks it (`runForkWith` in `internal/effect.ts`).
      first ??= fiber.id
      // A run stopped makes each fiber that asks yield, which ends the task under way, and runs no other.
      if (stopped()) return true
      if (++ops > maxOps) {
        spun = true
        return true
      }
      let answer: boolean
      try {
        answer = yields(fiber)
      } catch (error) {
        failure = { error }
        return true
      }
      if (!answer) running = fiber
      return answer
    },
    makeDispatcher: () => ({
      scheduleTask: (task) => {
        ready.push({ task, fiber: yielding })
        yielding = undefined
      },
      // Effect flushes only a dispatcher of its own `runSync`, and `scheduled` alone steps this one. A flush inside a
      // task would run other tasks within it, and the rules above, which read the task under way, would not hold.
      flush: () => {
        const error = new Error(
          'a dispatcher of the controlled scheduler is stepped by its run alone, and never flushed',
        )
        failure ??= { error }
        throw error
      },
    }),
  }
  const step = () => {
    if (stopped() || ready.length === 0) return false
    let index = 0
    if (ready.length > 1) {
      index = strategy.pick(tasks())
      if (!Number.isInteger(index) || index < 0 || index >= ready.length) {
        throw new Error(`a strategy picked task ${index} of ${ready.length}`)
      }
      picks.push(index)
    }
    const { task } = ready.splice(index, 1)[0]!
    entering = true
    running = undefined
    ops = 0
    task()
    return true
  }
  return {
    scheduler,
    step,
    schedule: (): Schedule => ({ picks, preemptions }),
    left: () => ready.length,
    spun: () => spun,
    failure: () => failure,
  }
}

/** The least budget of steps under which Effect's scheduler runs a fiber on: the step a preemption first comes at. */
const leastBudget = 3

/** How many tasks a run may take before it is taken for one that never ends. */
const maxSteps = 1_000_000

/** How many times a task may ask to yield before it is taken for a fiber that never waits. */
const maxOps = 1_000_000

/**
 * Runs `effect` under a scheduler `strategy` decides, stepped by hand and synchronously, until it ends, nothing is
 * ready, it has taken `maxSteps` tasks, or a task spins. So a run needs nothing of the platform's, no timer and no
 * microtask: what does is left waiting, and the run does not end. Throws what the strategy throws, or a flush, even
 * where the effect catches it.
 */
export const scheduled = <A, E>(
  effect: Effect.Effect<A, E>,
  strategy: Strategy,
  resumptions: Resumptions = 'queued',
): Run<A, E> => {
  const run = controlled(strategy, resumptions)
  const fiber = Effect.runFork(effect, { scheduler: run.scheduler })
  let steps = 0
  while (fiber.pollUnsafe() === undefined && steps < maxSteps && run.step()) steps++
  const failure = run.failure()
  if (failure !== undefined) throw failure.error
  return { exit: fiber.pollUnsafe(), schedule: run.schedule(), steps, spun: run.spun(), left: run.left() }
}

/**
 * The oldest task first and no preemption: a fiber runs on until it waits, as under Effect's own scheduler with an
 * unbounded budget. The one difference is the yield before each resumption, which queues a fiber Effect would
 * resume inline.
 */
export const inOrder: Strategy = { pick: () => 0, preempt: () => false }

/**
 * The run `schedule` recorded, again: the same steps, given the same decisions. Throws if the run asks more or fewer
 * decisions than were recorded, since it did not take the same steps then.
 */
export const replayed = <A, E>(
  effect: Effect.Effect<A, E>,
  schedule: Schedule,
  resumptions: Resumptions = 'queued',
): Run<A, E> => {
  let pick = 0
  let preemption = 0
  const run = scheduled(effect, {
    pick: () => schedule.picks[pick++] ?? 0,
    preempt: () => schedule.preemptions[preemption++] ?? false,
  }, resumptions)
  if (pick !== schedule.picks.length || preemption !== schedule.preemptions.length) {
    throw new Error(`the run asked ${pick} picks and ${preemption} preemptions, and its schedule has ${
      schedule.picks.length
    } and ${schedule.preemptions.length}`)
  }
  return run
}

/**
 * The decisions where a run deviates from `inOrder`, by their place in the order the run asks them, each with what
 * it decides there: the task picked, or 1 for a preemption.
 */
type Deviations = ReadonlyMap<number, number>

/** `inOrder`, but at the decisions `deviations` names. `asked` gets, for each decision, how many ways it can go. */
const deviating = (deviations: Deviations, asked: Array<number>): Strategy => ({
  pick: (ready) => {
    asked.push(ready.length)
    return deviations.get(asked.length - 1) ?? 0
  },
  preempt: () => {
    asked.push(2)
    return deviations.has(asked.length - 1)
  },
})

/**
 * The run in order, but at the decisions `deviations` names, as `everySchedule` names them when a run fails: so that
 * a test replays that run alone.
 */
export const deviated = <A, E>(
  effect: Effect.Effect<A, E>,
  deviations: ReadonlyArray<readonly [decision: number, choice: number]>,
  resumptions: Resumptions = 'queued',
): Run<A, E> => scheduled(effect, deviating(new Map(deviations), []), resumptions)

/** Checks a run's end, a run that did not end failing, and says on failure what replays it. */
const checked = <A, E>(run: Run<A, E>, check: (exit: Exit.Exit<A, E>) => void, replay: string): void => {
  try {
    if (run.spun) throw new Error(`a task of the run asked ${maxOps} times to yield, and never waited`)
    if (run.exit === undefined) throw new Error(`the run did not end after ${run.steps} tasks`)
    check(run.exit)
  } catch (error) {
    throw new Error(`under ${replay}: ${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
}

/**
 * Runs `effect` under every schedule that deviates from `inOrder` at most `bound` times, and has `check` read each
 * end. This is delay bounding: preemption bounding, as in CHESS, with the picks counted as well, since a pick is a
 * choice at every step here and would leave the schedules unbounded otherwise (decision 0104). A deviation is a pick
 * of any task but the oldest, or a preemption. Within its bound it is exhaustive, and a failure names the deviations
 * that replay it. It throws past `runs` runs, so that a bound too large for a scenario says so instead of running
 * for hours. Returns how many runs it took.
 */
export const everySchedule = <A, E>(
  effect: Effect.Effect<A, E>,
  { bound, runs = 100_000, resumptions = 'queued' }: Readonly<
    { bound: number; runs?: number; resumptions?: Resumptions }
  >,
  check: (exit: Exit.Exit<A, E>) => void,
): number => {
  let ran = 0
  const visit = (deviations: Deviations, after: number) => {
    if (++ran > runs) throw new Error(`more than ${runs} schedules within ${bound} deviations`)
    const asked: Array<number> = []
    checked(
      scheduled(effect, deviating(deviations, asked), resumptions),
      check,
      `deviated(${JSON.stringify([...deviations])}, '${resumptions}')`,
    )
    if (deviations.size === bound) return
    // The decisions before the last deviation went the same way in this run as in the one that found it.
    for (let decision = after + 1; decision < asked.length; decision++) {
      for (let choice = 1; choice < asked[decision]!; choice++) {
        visit(new Map([...deviations, [decision, choice]]), decision)
      }
    }
  }
  visit(new Map(), -1)
  return ran
}

/** A generator of numbers in [0, 1) from a seed (mulberry32), so that a seed gives the same choices again. */
const random = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/**
 * Probabilistic concurrency testing (Burckhardt et al., 2010) over `steps` decisions of preemption, from `seed`.
 * Each fiber is given a random priority above 2 as it is first seen; the ready task of the highest runs, and a fiber
 * yields as soon as a higher one is ready. At `depth - 1` of the steps, drawn at random, the fiber running is lowered
 * beneath 1, to a priority each change has of its own, and yields. A task no fiber names, a fork or a wake among
 * them, has priority 1, the oldest first: so a fiber lowered lets a fork run.
 *
 * Strict priorities starve a fiber lowered beneath one that spins waiting for it, on `yieldNow`. So after ten times
 * `steps` decisions the strategy runs `inOrder`, which is fair, as Coyote's PCT turns fair after its unfair steps:
 * a run that ends under a fair scheduler ends here too.
 */
export const prioritized = (seed: number, depth: number, steps: number): Strategy => {
  const next = random(seed)
  const priorities = new Map<number, number>()
  // Distinct steps, or two changes at one step would be one, and the depth one less.
  const changes: Array<number> = []
  while (changes.length < Math.min(depth - 1, steps)) {
    const change = Math.floor(next() * steps)
    if (!changes.includes(change)) changes.push(change)
  }
  let step = 0
  let decisions = 0
  const unfair = () => ++decisions <= 10 * steps
  const priority = (fiber: number | undefined) => {
    if (fiber === undefined) return 1
    let held = priorities.get(fiber)
    if (held === undefined) priorities.set(fiber, held = 2 + next())
    return held
  }
  const highest = (ready: ReadonlyArray<Ready>) =>
    ready.reduce((best, task, index) => priority(task.fiber) > priority(ready[best]!.fiber) ? index : best, 0)
  return {
    pick: (ready) => unfair() ? highest(ready) : 0,
    preempt: (fiber, ready) => {
      if (!unfair()) return false
      const change = changes.indexOf(step++)
      if (change !== -1) {
        priorities.set(fiber, (depth - 1 - change) / depth)
        return true
      }
      return priority(ready[highest(ready)]!.fiber) > priority(fiber)
    },
  }
}

/**
 * The seeds a run of prioritized schedules runs: `pinned` first, each once, then `count` seeds from `first` on. A
 * seed pinned is one a run once failed on, kept as a check against its bug's return whatever range the run explores.
 */
export const seeds = (
  { first = 0, count, pinned = [] }: Readonly<{ first?: number; count: number; pinned?: ReadonlyArray<number> }>,
): ReadonlyArray<number> => {
  const range = Array.from({ length: count }, (_, index) => first + index)
  return [...new Set([...pinned, ...range])]
}

/**
 * Runs `effect` under `runs` schedules of `prioritized` at `depth`, from seed `first` (0 unless given), after the
 * seeds `pinned`, and has `check` read each end. A bug of depth `d`, `d` orderings that must all fall one way, is
 * found by each run with a probability of at least 1 / (n k^(d - 1)), for n fibers and k steps. The steps are those
 * a run `inOrder` is asked of preemption. A failure names the seed that replays it.
 */
export const prioritizedSchedules = <A, E>(
  effect: Effect.Effect<A, E>,
  { runs, depth, first = 0, pinned = [], resumptions = 'queued' }: Readonly<
    { runs: number; depth: number; first?: number; pinned?: ReadonlyArray<number>; resumptions?: Resumptions }
  >,
  check: (exit: Exit.Exit<A, E>) => void,
): void => {
  const steps = Math.max(1, scheduled(effect, inOrder, resumptions).schedule.preemptions.length)
  for (const seed of seeds({ first, count: runs, pinned })) {
    checked(
      scheduled(effect, prioritized(seed, depth, steps), resumptions),
      check,
      `prioritized(${seed}, ${depth}, ${steps}) under '${resumptions}'`,
    )
  }
}
