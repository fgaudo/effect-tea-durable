# 0259. A reading of the waker that fails is read again after the retry

**Status:** accepted, 2026-11-11, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the fix of bug 75. It changes
[decision 0077](archive/0077-the-waker-tries-an-entity-it-cannot-load-again.md): the waker goes on past its own
reading of the timers, as it goes on past an activation that fails. It changes
[decision 0062](archive/0062-a-row-is-read-through-a-schema.md) for the waker's reading of the next time: a row it
refuses fails its entity alone.

## Context

Decision 0077 had the waker go on past an activation that fails. The waker's own reading, `due` of
`src/storage/entities.ts`, is a reading of rows too, and nothing caught it. A stored time no integer is, as an
operator's fix by hand may leave, failed the decoding of the whole page through `Rows.due`, and `due` died by its
`Effect.orDie`. The defect left `waking` of `src/runtime/waker.ts`, and the waker's fiber ended with no log. Every
timer of the program stopped for the life of the process, and `waker.busy` stayed true, so `settled` never returned.
A reading that dies for another reason, as a connection lost, ended the fiber the same way. The maintainer chose on
2026-11-11 to fix both cases, with one guard each.

## Decision

- **The reading of the next time decodes its rows one at a time.** A row whose time `Rows.due` refuses gives its
  entity back in `refused` of `Due`, with the reason, and the reading goes on to the next row. The rows after the
  next time found are not decoded, so an entity is refused once its time would be the next.
- **The waker leaves a refused entity out of its readings until `retry`**, by the mark of decision 0077 that hides it.
  The first refusal of each entity in the process logs a warning, with the program's name, the entity's id and the
  reason.
- **A reading of the waker that fails with any cause but an interruption is read again after `retry`.** The round
  takes it as a reading that found nothing due, with a next time of now plus `retry`, so the waker rests and
  `settled` returns while it waits. The first failure of a run of failures logs a warning with its cause, and a
  reading that succeeds ends the run. An interruption still stops the waker, as the process's stop.
- **A warning is logged once, not at every retry.** Under the default `retry` of 10 milliseconds, a database out of
  reach or one row refused would otherwise log a hundred warnings a second.

## Alternatives

- **Only the guard in `waking`.** One guard in one place, for every failure. One row refused would still stop every
  timer of the program until an operator fixes it, though with a warning.
- **Only the reading row by row.** A reading that fails for another reason would still end the waker in silence.
- **A warning at every retry**, as the sweep logs each sweep that fails. The sweep runs every five minutes by
  default, and the waker every `retry`.

## What it rests on

- That a row whose time is refused stops the timers of its entity alone, and is logged once: **tested** by
  `a row the waker’s reading refuses stops the timers of its entity alone`, in `src/runtime/waker.test.ts`. It
  fails against the reading of `due` before the change, and against a waker that logs every refusal. It runs on
  SQLite alone, since PostgreSQL refuses by the type of its column a time no integer is.
- That the reading of `due` row by row reads the same rows as before: **tested** by the tests of `due` in
  `src/storage.test.ts` and `src/runtime/loop.test.ts`, on SQLite and PGlite. Its statement is unchanged. The job of
  PostgreSQL of the CI runs them on the server, on the branch of the change.
- That a reading that dies is logged once, read again at every retry, and leaves `settled` returning: **tested** by
  `a reading of the waker that fails is logged, and read again after the retry`, in the same file. Its reading
  dies because the table of the timers is renamed away, and the guard takes every cause but an interruption alike.
  It runs on SQLite and PGlite. It hangs against `waking` before the change, and fails against a waker that logs
  every failure.
- That `Effect.catchCause` is given a defect as well as a failure: **documented** in its JSDoc, in
  `node_modules/effect/src/Effect.ts` at the version pinned, whose example recovers from a defect.
- That a reading read again every `retry` does not spin: **documented** in decision
  [0251](0251-a-retry-and-a-passivation-are-a-millisecond-at-least.md), which makes `retry` a millisecond at least,
  and tested by its test of the least retry in `src/runtime/waker.test.ts`.
- That the explored tests keep their pinned interleavings, though the guard and the reading row by row add steps
  to the waker's round: **tested** by `bun run test:pins`. The steps moved four schedules, and the tests now pin the
  deviation at decision 195 for decision 0068's step, seed 199 for decision 0079, the deviation at decision 375 for
  decision 0147 and the one at decision 644 for decision 0163, each found by the pin's mutation over every seed from 0.
- That a warning once per run of failures is what an operator wants: **chosen** by this note, against the cost of a
  warning every `retry`.

The decision leaves out the waker's readings on Cluster, by shard. They call the same `due`, given the shards held,
and no test runs them against a row refused or a reading that fails. The case stays in the
[open question](../open-questions.md#running) A row the waker's reading refuses, on Cluster.
