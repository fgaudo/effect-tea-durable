# 0266. A timer that catches up fires with a due time that grows, and a timer is due at a whole millisecond

**Status:** accepted, 2026-11-11, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the fix of bug 42. It changes
[decision 0187](0187-a-rehearsal-moves-time-by-a-duration.md): a rehearsal fails a key that fires again at one time
only when its due time is no later than the due time it last fired with. Changed by
[decision 0281](0281-a-rehearsals-time-is-a-whole-millisecond.md), which writes the premise this note missed: a
rehearsal handles every message at a whole millisecond.

## Context

A repeating timer armed from its own last due time catches up after a downtime. A renewal due at the end of each
period paid, created three periods late, is due three times in the past. The runtime fires it once for each period,
at once, and checks no timer
([decision 0130](archive/0130-a-runner-retries-and-the-state-counts-the-attempts.md)).

Decision 0187 fails a rehearsal on a key whose timer fires twice at one time, within one `advance`. Time stands
still while timers due in the past fire, so every firing of a catch-up is at one time, and the rehearsal refused a
program the runtime runs. That is bug 42.

The maintainer asked for the rule that is right in general, not for one case, and chose it on 2026-11-11 after the
opinion of a Fable 5.2 agent.

## Decision

- **At one time, a key fires again only with a due time later than the one it last fired with.** The rehearsal
  keeps, for each key of each entity, the due time it last fired with. A firing whose due time is no later than
  that one fails the test. The due times kept are forgotten once time moves.
- **A catch-up passes.** Its due time grows at each firing, and stays no later than the end of the `advance`.
- **A loop fails.** A key armed again at the time reached fires again with the same due time. Two keys that arm
  each other at the time reached fail the same way. Two keys that arm each other at two times already passed, turn
  after turn, fail at the third firing, though neither due time is the time reached.
- **A key armed at an earlier due time once time has moved fires.** Its last due time was kept for another time.
- **A timer is due at a whole millisecond.** A step whose work holds a timer due between two milliseconds is a
  defect of the program, which the machine reports as it reports any work that is none. The storage holds a timer's
  time as an integer of milliseconds. A sum of durations can leave a time between two, as `Duration.micros` does.
- **So every `advance` ends over a finite set of keys.** A key fires at one time only with due times that grow in
  whole milliseconds, and no later than the end of the duration, so it fires a finite number of times.
- **The rule refuses some programs that end.** One key whose second deadline, counted from another start, is earlier
  than its first, with both passed, fails the test. A counted retry with no pause fails too, as decision 0187 meant.
  No rule both stops every loop of a finite set of keys and passes every program that ends. A rule that compared the
  whole state of the world passes every program that ends, and misses every loop that counts.
- **A chain of keys with parameters is left out, as decision 0187 left it.** A timer that arms the next parameter
  at the time reached never fires one key twice, and `advance` never ends. It is an
  [open question](../open-questions.md#programs).

## What it rests on

- That a catch-up passes, that a key armed again at the time reached fails, that two keys that arm each other at the
  time reached or at two times passed fail, that a key armed at an earlier due time after time moved fires, and that
  a second deadline earlier than the first fails: **tested** by the tests of `time that passes` and of `a repeating
  timer that catches up`, in [`src/rehearse.test.ts`](../../src/rehearse.test.ts).
- That the runtime fires a repeating timer created after its periods once for each period: **tested** by `a renewal
  created after the periods it bills fires once for each`, in
  [`src/runtime/loop.test.ts`](../../src/runtime/loop.test.ts), on SQLite.
- That a timer due between two milliseconds is a defect, and that `DateTime.addDuration` with `Duration.micros` gives
  such a time: **tested** by `a timer due at no whole millisecond is a defect`, in
  [`src/machine.test.ts`](../../src/machine.test.ts).
- That the storage holds a timer's time as an integer: **documented** by `Schema.DateTimeUtcFromMillis`, built on
  `Schema.Int`, in `node_modules/effect/src/Schema.ts` at 4.1.2, which `workOf` of
  [`src/storage/rows.ts`](../../src/storage/rows.ts) decodes a timer's time with.
- That refusing the programs that end above is the cost to pay for a rule that ends every `advance`: **chosen** by
  the maintainer, on 2026-11-11.

## Alternatives

- **Clear what fired whenever the due time changes, instead of the time reached.** Two keys that arm each other at
  two alternating times passed would clear it at every firing, and loop for ever.
- **Keep the due times for the whole `advance`.** A key armed at an earlier due time after time moved would fail,
  though time passed between its firings.
- **A rehearsal of a downtime as an act of its own.** A program that arms a timer in the past would still fail.
- **A bound on the firings at one time.** Decision 0187 refused it: any number would be a rule with no reason.
- **A measure across the whole world, such as a firing that arms a timer due later than itself.** A firing may arm
  another key at an earlier due time, as an end of trial arms a cleanup from the creation, and that would fail.
- **A structure of Effect.** `TestClock` fires every sleep due at once, with no check, as the runtime does.
  `Schedule` keeps no time per key. `TxPriorityQueue` is transactional, and `dueBy` already scans the timers.
  `MutableHashMap` would only compare by value a key that is the JSON of three strings. A `Map` holds the due times.

## Consequences

- `advance` of [`src/rehearse.ts`](../../src/rehearse.ts) keeps a due time for each key fired, and its failure names
  the due time and the last one.
- `checkWork` of [`src/machine.ts`](../../src/machine.ts) refuses a timer due between two milliseconds.
- The design's sections on timers and on Rehearsing say both rules.
