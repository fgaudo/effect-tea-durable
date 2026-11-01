# 0029. An idle entity is unloaded, and what is stored wakes it

**Status:** accepted, 2026-10-30. Its permit is replaced by a lock of the entity's own in
[decision 0067](0067-each-entity-is-held-by-its-own-lock.md), its hooks in the runtime's options by a probe in
[decision 0073](0073-what-the-runtime-did-is-told-to-a-probe.md), and what a process starts with is added to by
[decision 0071](0071-a-process-starts-the-entities-with-a-message.md). How an entity leaves the process and tells
the waker is corrected by [decision 0068](0068-what-another-fiber-reads-changes-in-one-step.md), how many
entities a process holds is bounded too by
[decision 0076](0076-a-process-over-its-capacity-unloads-the-least-recently-used.md), and a waker that cannot load
an entity goes on, by [decision 0077](0077-the-waker-tries-an-entity-it-cannot-load-again.md). The timeout of an
entity's wait wraps its take alone, which is what Effect promises an event offered as it fires, by
[decision 0111](0111-an-entity-s-wait-times-out-its-take-alone.md).

## Context

The design says that an entity with no message, no operation under way and only timers armed is unloaded, and
that the earliest of those timers wakes it: to the machine a passivation is a crash the runtime chose
([`docs/design.md`](../design.md)). The first runtime did not do it: it activated every entity whose state held
work when the process started, and held it for as long as the process lived
([decision 0028](0028-rules-the-runtime-settled.md)). Writing it, the first step of the
[roadmap](../roadmap.md), had to say when an entity is unloaded, what wakes it, and what keeps a caller from
losing its message to a passivation.

## Decision

- **A passivation writes nothing, and the machine gains no rule.** Unloading an entity drops what the process
  holds for it — its machine, its queue of events, the sleeps of its timers — and leaves the database as it was.
  Activating it again is the `Restart` of a crash, so the timers of the stored work are armed in the same
  incarnations. The runtime's tests compare the database with the pure machine replayed on the events the runtime
  committed ([decision 0013](0013-the-runtime-is-a-pure-machine.md)); a passivation commits none, and the
  comparison is what says it lost nothing. It writes nothing, so it reaches no point of the crash table either:
  a crash during a passivation is a crash with the entity's work stored, which the table already covers.
- **An entity is unloaded once nothing has come for it for a while.** The entity's loop already waits for an
  event when the stored mailbox holds no message, and that wait is where the entity is unloaded: the wait times
  out, never the take, so an event taken is always applied. Nothing to do means no event waiting or being
  applied, nothing under way but timers, and either an empty mailbox or a suspension.
- **A suspended entity is unloaded with the message it died on, and no timer of its fires.** Nothing of a
  suspended entity runs until an operator resumes it
  ([decision 0006](0006-a-defect-suspends-the-entity.md)), so it is the one most worth unloading, and the one a
  stored timer must not wake: it would be activated, arm nothing, and be unloaded again at once. An operator's
  act, or a caller, loads it instead.
- **An entity is never unloaded under a caller.** Finding the entity and offering its event is one step, under
  the permit a load already takes, and a passivation takes the same permit: a caller that has found an entity
  has offered its event before the entity can be unloaded.
- **A process starts with the entities whose state holds an operation.** This replaces the rule of
  [decision 0028](0028-rules-the-runtime-settled.md) that a process activates every entity whose state holds
  work: holding them all was the counterpart of not passivating. An operation a crash interrupted must run
  again, and nothing but an activation runs it. A timer needs no activation of its own: its time is stored
  (`entity_keys.due`), and a fiber of the process reads the earliest time a timer of an unloaded entity is due,
  sleeps until then, and activates the entities whose time has come — arming a timer already due fires it. It
  reads again whenever an entity is unloaded, since its timers may be due before the one the fiber sleeps for,
  and it is told before the entity leaves the process: a timer is either armed here or counted among the stored
  ones, never neither. So a timer that fires in the instant before its interruption may deliver nothing, and
  costs nothing: the stored time stands, and the entity is activated for it.
- **An unloaded entity holds no operation.** What the state holds is what the next activation starts, and an
  operation it holds with nothing running for it comes back as its `unknown`
  ([decision 0011](0011-an-operation-declares-what-a-crash-does.md)): an at-most-once operation would lose what
  it was going to do, to a crash nobody suffered. It follows from the other rules — an operation under way keeps
  its entity loaded, and one stored with none under way means the entity is suspended or has its completion in
  the mailbox, and neither is idle — but having nothing to do is read off the stored keys rather than off what
  the process happens to be running, so a passivation cannot do it even if that reasoning is one day wrong. And
  since nothing unloaded holds an operation, the stored timers wake everything that has to run.
- **How long is an option of the runtime.** `passivate.millis`, thirty seconds by default. A large one is a
  process that holds what it loads, as before this decision. A passivation is no event, so it is not seen
  through `observe`: a hook of its own (`unloaded`) is called with every entity unloaded, which is what the
  tests count.

## Alternatives

- **Holding every entity**, which is what [decision 0028](0028-rules-the-runtime-settled.md) did. One process
  holds every entity that has ever had work, and a million subscriptions with a monthly timer are a million
  machines in memory for nothing.
- **A sweeper over the loaded entities**, on a clock of its own, instead of each entity's own wait. It would have
  to interrupt a loop that may be between taking an event and applying it, and lose it.
- **Unloading by a count of loaded entities**, an LRU, rather than by time alone. It is the answer to how many
  entities a process may hold, which is an [open question](../open-questions.md).
- **A fiber per unloaded entity**, sleeping until its timer. It is simpler than reading the earliest due, and it
  is a fiber for every entity the database holds: what passivation is meant to avoid.
- **Letting a suspended entity's timers fire.** Its firing is dropped, the entity is unloaded again, and the
  reading of the earliest due gives the same time: a process that spins until an operator arrives.

## Consequences

- [`src/runtime.ts`](../../src/runtime.ts) unloads an entity in its loop and wakes the unloaded ones from the
  stored times; [`src/storage.ts`](../../src/storage.ts) answers `interrupted` (the entities holding an
  operation) and `due` (the entities an unloaded timer is due for, and the next time one is).
  [`src/machine.ts`](../../src/machine.ts) is untouched.
- `settled` waits for the timers of unloaded entities whose time has come, so that a test which sleeps past a
  timer sees it handled rather than pending. It is stricter there than for what the process holds, where a timer
  armed in the process has never counted: that one is a sleep about to deliver, where an unloaded entity's is a
  reading nobody has made yet.
- A reading of the earliest due gives at most a few hundred entities, and one that fills it is followed by
  another: a time that has come for many entities at once activates them in batches, not all at once.
- The reading of the earliest due leaves out the entities the process holds by listing them, which is the small
  set while passivation does its work.
- An entity with no work at all is unloaded and nothing wakes it, which is right: a caller loads it.
- How many entities one process may hold is still a matter of time only, and
  [Effect Cluster](../roadmap.md) is where sharding them over processes belongs.
