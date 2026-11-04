# 0128. An operation that acts on nothing may be dropped or changed while it runs

**Status:** accepted, 2026-11-04. Decides the open question on work that may be abandoned. Makes an exception to
[decision 0005](archive/0005-an-operation-leaves-only-by-completing.md), and adds a fifth delivery to
[decision 0011](archive/0011-an-operation-declares-what-a-crash-does.md).

## Context

An operation leaves the state only through its completion (decision 0005). The rule keeps an act on the world from
being cut halfway: a payment interrupted after the bank took it is a payment no state knows of. A state that no
longer wants an operation's answer still waits for it, in a state of its own that only the completion leaves.

effect-tea's Guide has the same rule for commands, which cannot be cancelled so that a save is never cut in half. It
also has a kind of work that stops: "Work that should stop is a subscription". A download or a search while the user
types is kept under a key while the state wants it, and interrupted when the key goes away. Here subscriptions are
replaced by operations and timers ([design](../design.md#where-it-departs-from-effect-tea)). A timer may be dropped
in any state, since it has done nothing yet. Work that runs and acts on nothing, a computation or a read, had no
kind of its own, so a state that wanted to stop it waited for it.

## Decision

- **A runner declared with `operation.droppable` acts on nothing.** It computes, or reads what a crash may read
  again. It is the fifth delivery, beside idempotent, idempotent with a digest, at least once and at most once.
- **A step may drop a droppable operation, or change it, while it runs.** The machine makes no defect of it, and
  says `Disarmed`, as for a timer. A changed one is new work, in the next incarnation, and starts again, as a
  subscription whose value changes starts anew in the Guide.
- **The runtime interrupts it, and the entity does not wait for its finalizers.** The finalizers are the runner's,
  and the entity's next event does not wait behind them. A completion that lands before the interruption is
  dropped, since its incarnation no longer holds. A planned stop of the process still waits for them, as it waits
  for every fiber of the deployment ([decision 0063](archive/0063-the-runtime-waits-for-what-it-waits-for.md)).
- **A new program may drop it, change it, or deliver it otherwise.** The check of
  [decision 0020](archive/0020-a-new-program-is-checked-against-the-stored-work.md) is for work that may have acted.
  One delivered otherwise keeps its incarnation, and its idempotency key with it, since the work is the same and
  the incarnation stopped has acted on nothing. The other way is a defect: an operation delivered otherwise and
  declared droppable by the new program may have acted.
- **A crash runs it again**, as an operation at least once is run again. Run twice, it has acted on nothing twice.
- **It sends to no entity, and creates none.** A request acts on its receiver, and an interruption between the send
  and the reply would leave the receiver acted on and the sender with no answer. A droppable operation that calls
  `send` or `create` dies, and suspends its entity.

## What it rests on

- That a step may drop or change a droppable operation, and that a completion of the dropped incarnation is dropped:
  **tested**, `a step may drop a droppable operation, which is disarmed, and its late completion is dropped` and `a
  step may change a droppable operation, which starts again as new work`, in
  [`src/machine.test.ts`](../../src/machine.test.ts).
- That a new program may drop, change or deliver it otherwise, and that one delivered otherwise keeps its
  incarnation, while one declared droppable by a new program is a defect: **tested**, `a droppable operation under way may be changed or dropped by a new program`, in [`src/machine.test.ts`](../../src/machine.test.ts).
- That the runtime interrupts it without waiting for its finalizers: **tested**, `a droppable operation the state
  drops is interrupted, and the entity does not wait for its finalizer`, in
  [`src/runtime.test.ts`](../../src/runtime.test.ts). Without the interruption the test hangs, and with an
  interruption that waits it hangs too.
- That a droppable operation that sends dies: **tested**, `a droppable operation that sends to an entity dies, and
  suspends its entity`, in [`src/runtime.test.ts`](../../src/runtime.test.ts).
- That `Fiber.interrupt` completes only once the interrupted fiber has completed, its finalizers included, so that
  the runtime forks it to not wait: **documented**, in the JSDoc of `Fiber.interrupt` in
  `node_modules/effect/src/Fiber.ts`.
- That a runner declared droppable acts on nothing in the world: **only reasoned**. The library cannot check a call
  to a service outside. A runner that acts and is declared droppable may be cut halfway, as an operation at least
  once may act twice.

## Alternatives

- **No kind of its own.** A state that stops wanting a read waits for it in a state only its completion leaves, which
  is what the Guide's subscriptions spare a program.
- **A kind of work apart from operations.** It would have its own type, its own schema and its own runners, for a
  difference a delivery already says: what an interruption and a crash do to the work.
- **An interruption that waits for the finalizers.** An entity would wait behind the runner's cleanup, under its lock,
  for work whose answer it no longer wants.

## Consequences

- `operation.droppable(run)` is a constructor of runners, and `Droppable` a delivery the storage stores.
- A droppable operation keeps its entity loaded while it runs, as any operation does, and a planned stop does not
  start it, since it runs again at the next activation
  ([decision 0119](0119-a-planned-stop-drains-the-at-most-once-operations.md)).
- A suspension lets it run to its end, as it lets every operation
  ([decision 0113](0113-a-suspended-entitys-operations-run-to-their-end.md)). Its completion waits in the mailbox,
  and is handled once the entity is resumed, or dropped if the state no longer holds its incarnation.
- Nothing but the runtime keeps a droppable operation from calling `send`: whether the type of its runner should,
  by leaving `Entities` out of its services, is an [open question](../open-questions.md#programs).
