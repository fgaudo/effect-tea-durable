# 0119. A planned stop drains the at-most-once operations

**Status:** proposed, 2026-11-04. Decides the drain that
[decision 0011](archive/0011-an-operation-declares-what-a-crash-does.md) says the runtime should run before a planned
stop.

## Context

An at-most-once operation under way when its process stops delivers `unknown` at the next activation
([decision 0011](archive/0011-an-operation-declares-what-a-crash-does.md)). A process ends when the scope it was
launched in closes, and that closing interrupts everything, as a crash does. A new version is a new process
([decision 0075](archive/0075-a-name-is-deployed-once-in-a-process.md)). So every deploy delivers `unknown` for each
at-most-once operation under way, though the operation might have ended a moment later.

## Decision

- **The drain is an option of `launch`, `drain: { millis }`, and acts when the scope the runtime was launched in
  closes.** There is no `stop` of its own: the runtime's life is already its scope, and a caller that wants it
  stopped earlier closes a scope of its own. `millis` is a non-negative integer, and anything else is the caller's
  defect, as a capacity is ([decision 0076](archive/0076-a-process-over-its-capacity-unloads-the-least-recently-used.md)).
- **There is no drain by default, and no default for `millis`.** A process launched without the option ends as it
  did, and its closing is a crash.
- **During the drain, the runtime takes no caller's message, creation, resume or discard.** A caller that arrives
  waits, and is interrupted when the drain ends. A retry after the restart is answered as any retry is: from the
  stored reply, or by the message applied then, since the message was never taken. There is no answer of its own,
  such as `Stopping`, which every caller's type would carry.
- **The timers and the waker stop at once**, and so do the idempotent and the at-least-once operations under way.
  They run again at the next activation, from what is stored. A step during the drain starts no such operation and
  arms no timer: each is stored, and starts at the next activation.
- **The drain waits for the at-most-once operations under way, and for the steps of their completions**, committed
  as usual, up to `millis`. An at-most-once operation such a step starts is started and waited for too, since one
  stored and never started would deliver `unknown` without having run. For the same reason, the drain waits for
  what runs detached from a caller, such as a creation committed whose work has not started yet
  ([decision 0079](archive/0079-what-a-caller-sets-going-is-finished-without-it.md)).
- **A completion is committed once its step is, whether the step handles it or records it in the mailbox.** The
  drain does not wait for the messages of a mailbox, which the next activation handles.
- **A message an at-most-once operation sends to another entity during the drain is delivered.** The receiver is in
  the same process, and the drain waits for its step, within `millis`. Only a caller's request is held back. A
  receiver in another process, once the runtime is on Cluster, is left to the Cluster step.
- **Whatever is under way after `millis` stops as in a crash**: the scope closes, an at-most-once operation still
  running delivers `unknown` at the next activation, and the waiting callers are interrupted.
- **The drain is a finalizer of the launch's scope, added after a scope of the runtime's own.** Everything the
  runtime runs is forked in that inner scope. A scope runs its finalizers in the reverse order of their adding, so
  the drain runs first, while everything still runs, and the inner scope closes after it.
- **The drain waits on the signal `settled` waits on**, taken before it looks, so that an end between its look and
  its wait is not missed ([decision 0063](archive/0063-the-runtime-waits-for-what-it-waits-for.md)).

## What it rests on

- That a scope runs its finalizers in the reverse order of their adding: **documented**, in the JSDoc of
  `Scope.addFinalizer` in `Scope.ts`, whose example runs the third finalizer first.
- That `Effect.timeoutOption` interrupts the effect it times out and gives `none`: **documented**, in its JSDoc in
  `Effect.ts`. Tested by `an at-most-once operation that outlasts the drain delivers unknown, as after a crash`, in
  [`src/runtime.test.ts`](../../src/runtime.test.ts).
- That the timeout ends a wait made in a finalizer: **tested**, by the same test. The wait is made `interruptible`
  around the timeout, and the test passes without it. The JSDoc of `Scope.close` does not say whether a finalizer
  runs uninterruptibly, nor that of `raceFirst` whether a race in an uninterruptible region interrupts its loser.
  The guard is kept, since without it a drain that outlasts `millis` would hold its process for ever if a release
  made the finalizer uninterruptible and the race wait for its loser.
- That an at-most-once operation under way ends and is not delivered `unknown`, while the idempotent and the
  at-least-once ones are interrupted and run again: **tested**, `an at-most-once operation under way ends, and the
  others run again at the next activation`. Without the stop of the operations that run again, they end in the
  drain, and do not run again.
- That the drain waits for a completion until its step is committed: **tested**, by the same test, which delivers
  `unknown` when the drain does not count the events offered. And by `the drain waits for the completion of an
  at-most-once operation, under prioritized schedules`, which fails within the first hundred seeds when the drain
  looks before it takes its signal.
- That a step during the drain starts no operation that runs again: **tested**, `a completion in the drain starts no
  operation that runs again, and arms no timer`.
- That a step during the drain arms no timer: **reasoned**. In that test, the step that would arm the timer ends the
  drain before the timer's sleep starts, so the test passes without the rule. A test would need a drain held open by
  a second at-most-once operation after such a step.
- That the timers stop at once: **tested**, by `an at-most-once operation that outlasts the drain delivers unknown`,
  whose drain outlasts the time of the toy's timer.
- That the waker stops: **tested**, `the waker activates no entity in the drain`.
- That the drain waits for a creation committed whose work has not started: **tested**, `a creation committed before
  the drain starts its at-most-once operation, and the drain waits for it`.
- That a caller's message, creation and discard wait, and are interrupted when the drain ends: **tested**, `a caller
  that arrives during the drain waits, is interrupted, and a retry is answered after the restart`. A resume goes
  through the same guard as a discard, and has no test of its own.
- That a message sent by an at-most-once operation to another entity is delivered during the drain: **reasoned**.
  An operation sends through the runtime's own `send`, which the guard of a caller's request does not hold back. A
  test would need a program whose at-most-once operation sends to another entity.

## Alternatives

- **A `stop` of the runtime's own.** It would be a second way to end a runtime beside its scope, and the two would
  have to agree on what each does to the other.
- **A drain by default, with a default `millis`.** A process launched without thinking of it would wait at its end
  for a time it never chose, and no default fits every operation.
- **An answer `Stopping` to a caller during the drain.** Every caller's type would carry it, for a case its retry
  already covers.
- **Waiting for the mailboxes too.** A message in a mailbox is committed, and is handled at the next activation, so
  waiting for it saves nothing, and lengthens every drain.

## Consequences

- [`src/runtime.ts`](../../src/runtime.ts): the option `drain`, an inner scope for everything the runtime runs, the
  waker's fiber held by its deployment, the operations that run again held apart on each loaded entity, a guard on a
  caller's requests, and the drain as a finalizer.
- [`src/runtime.test.ts`](../../src/runtime.test.ts): the tests of `a planned stop`.
- `docs/design.md` says what a planned stop does, once this note is taken.
