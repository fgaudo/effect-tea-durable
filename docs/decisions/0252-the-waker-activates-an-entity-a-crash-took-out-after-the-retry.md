# 0252. The waker activates an entity a crash took out, after the retry

**Status:** accepted, 2026-11-11, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the rule of its family E. It changes
[decision 0077](archive/0077-the-waker-tries-an-entity-it-cannot-load-again.md), whose retry now follows every
crash. It changes [decision 0029](archive/0029-an-idle-entity-is-unloaded.md), whose unload now waits for a door's
step to commit. It changes
[decision 0161](archive/0161-on-cluster-a-step-settles-the-machine-by-the-count-of-the-steps-that-wrote-it.md), whose
settling no longer keeps a machine that a rolled-back load left without its `Restart`.

## Context

A crash takes an entity out of its process with its work stored
([decision 0042](archive/0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md)). Only a caller, a stored
timer or the next start loaded it again on one process
([decisions 0029](archive/0029-an-idle-entity-is-unloaded.md),
[0071](archive/0071-a-process-starts-the-entities-with-a-message.md)). On Cluster only a shard's round did, and a
lease its runner renews never moves the shard. So an operation under way, or a message in the mailbox, waited in
silence. Four bugs of the premise review are of this form:

- Bug 18: a write that fails crashes an entity with an operation and no timer, and nothing in the process loads it
  again until a caller comes.
- Bug 14: on Cluster, a step refused under an expired lease that the runner then renews crashes its entity, and the
  shard's round never runs again
  ([decision 0175](archive/0175-on-cluster-every-step-checks-the-newest-version-and-the-shards-lease.md)).
- Bug 69: on Cluster, a door's step that loads an entity and whose `COMMIT` fails leaves the entity loaded at its
  stored machine. The rollback dropped the step's `Restart`, the next step settled the machine as rolled back, and
  the stored operation never started.
- Bug 61: on Cluster, a passivation that waited for the entity's lock unloads the entity between a door's step and
  its commit. The held machine is idle, and the work the step stored never runs. It is no crash.

## Decision

- **Every crash marks its entity in the waker**, at the crash's time and `retry` after it. When the mark's time
  comes, the waker activates the entity, whatever its timers. An activation that fails marks it again, so the
  entity is tried every `retry` until it loads. The activation reads what is stored, so an entity with nothing to do
  is loaded and later unloaded by its passivation.
- **The crash's mark does not hide the entity from the readings.** A timer due before the mark still activates it
  then, so `settled` does not return between a crash and the activation its due timer brings. A mark left by an
  activation that failed hides the entity, as decision 0077 says.
- **An entity has one mark.** The waker's activation that crashes its entity marks it twice, once by the crash and
  once by the waker. The two marks merge into one, so the entity is tried once at each time. A mark's two flags are
  kept by `mark` of `src/runtime/process.ts`, and the round of `src/runtime/waker.ts` reads them.
- **Every mark is a crash's, except one.** A shard let go crashes its entities for another runner to load, and
  marks none (`losing` of `src/runtime/doors.ts`).
- **The mark is set whatever the machine held shows.** On Cluster the machine held may be a step ahead of what is
  stored, after a `COMMIT` that failed.
- **A door's step that loaded the entity and did not commit leaves it unsettled.** `settle` of
  `src/runtime/doors.ts` gives false for it, so the next step crashes the entity, and a door's step loads it again in
  the same step. Its `Restart` then starts what is stored. This holds bug 69.
- **An entity whose door's step is not known to be committed is not unloaded.** `nothingToDo` of
  `src/runtime/loop.ts` refuses it, and so does `spare`, which an eviction reads. The loop settles the machine at its
  next wait, and decides then. This holds bug 61, which is no crash, by a fix of its own.

## What it rests on

- That the waker's round reads every mark whose time has come: **read in the code** of `waking`, in
  `src/runtime/waker.ts`. The test `an entity a failed write crashes runs its operation again with no caller
  coming`, in `src/runtime/loop.test.ts`, **tests** it on one process, and fails against the code before the change.
- That a renewed lease lets the activation the mark brings commit: **tested** by `an entity a step crashed under an
  expired lease that the runner renews runs its work again`, in `src/cluster.test.ts`, which fails before the change.
  An activation refused while the lease is expired marks the entity again, keeping the crash's flag. Without the
  flag kept, the test fails.
- That the next step of a door crashes and reloads an entity whose load rolled back: **tested** by `a door step that
  loads an entity and whose commit fails leaves the entity to run its stored operation`, in `src/cluster.test.ts`. It
  fails without the change to `settle`. It runs under a `retry` of an hour, so that the waker does not load the
  entity before the door does.
- That the unload a passivation waits for reads `uncommitted` once it holds the lock: **tested** by `an entity whose
  passivation waits on a door step that starts an operation runs the operation`, in `src/cluster.test.ts`, which fails
  without the change to `nothingToDo`.
- That a crash whose cause comes back at every activation, such as a row no version reads
  ([decision 0043](archive/0043-a-row-no-version-reads-fails-what-reads-it.md)), is tried every `retry` for as long as
  the process runs: **only reasoned**. Decision 0077 accepted it for an entity with a timer, and a `retry` of a
  millisecond at least keeps it from spinning
  ([decision 0251](0251-a-retry-and-a-passivation-are-a-millisecond-at-least.md)).
- That `settled` returns while the waker sleeps toward a mark: **read in the code** of `quiet` in
  `src/runtime.ts`, which counts a mark whose time has not come as no work, as decision 0077 counts a retry.
- That a mark on Cluster of an entity whose shard moved since is harmless: **only reasoned**. Its activation is
  refused as `Unheld` and does nothing, and the shard's new runner loads the entity. It is bug 33, which stays open.
- That an at-most-once operation's fiber has stopped before the activation records its `unknown`: **only
  reasoned**, and not promised. The crash forks the stop and does not wait for it
  ([decision 0056](archive/0056-nothing-waits-for-an-operation-under-the-permit.md)), and the activation now comes
  `retry` after the crash, where it waited for a caller before. It is bug 31 of the roadmap, which this rule makes
  more likely to be reached.
- The premises of decision 0077 still hold. An activation that fails still crashes its entity alone, and `settled`
  still counts a mark whose time has come as work.

## Alternatives

- **The waker reads the stored entities with work, as well as the timers.** It covers a restart too, but every
  round reads more rows. An entity that crashes after every activation that loads it would still need a mark, or the
  waker would spin on it.
- **The mark set only where the machine held shows work.** On Cluster the machine held may be ahead of what is
  stored, and show no work while the operation is stored.
- **A door's step enters an entity it loads only once its commit is known.** It rests on `afterCommit`, which the
  loop's wait already does not trust (decision 0161).
