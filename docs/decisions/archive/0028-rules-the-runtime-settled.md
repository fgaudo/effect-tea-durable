# 0028. Rules the runtime settled

**Status:** accepted, 2026-10-30. Its bullet that has a sender to a suspended receiver send again every few milliseconds
is replaced by [decision 0063](0063-the-runtime-waits-for-what-it-waits-for.md), and its hooks in the runtime's options
by a probe, in [decision 0073](0073-what-the-runtime-did-is-told-to-a-probe.md). Its bullet that a process activates
every entity whose state holds work is replaced by [decision 0029](0029-an-idle-entity-is-unloaded.md). Its bullet that an
entity is one loop gains a yield after a step that leaves it more to do, in
[decision 0134](../0134-an-entitys-loop-yields-between-two-steps.md).

## Context

The machine says what an entity's events do ([decision 0013](0013-the-runtime-is-a-pure-machine.md)); it says
nothing about where its `Stored` is written, in which order a process does things, or what starts when a process
starts. Writing the runtime on SQLite ([decision 0007](0007-one-process-first.md), the first step of the
[roadmap](../../roadmap.md)) had to answer that, and each answer is a rule its tests rely on.

## Decision

- **An event is a step, a transaction, then everything else.** The runtime computes the machine's next `Stored`,
  writes it in one transaction, and only then answers the callers and starts or stops work. A crash before the
  commit leaves nothing of the event; one after it leaves an event whose work the next activation starts. The
  database is what is true; the machine the process holds is what it is doing.
- **An entity is one loop.** Events — a message arriving, a completion, a firing, a defect, an operator's act —
  wait in a queue of their own, and the loop takes one at a time. While the stored mailbox holds a message, the
  loop handles it instead of taking an event, one transaction per message, so handling never starves.
- **A process activates every entity whose state holds work when it starts.** Nothing else would run an
  operation or a timer a crash interrupted until a caller happened to arrive. One process holds them all;
  passivation, which the design describes, is the counterpart and is not written yet.
- **A suspension's cause is stored rendered.** A defect is any value a program threw, and no schema describes it.
  An operator reads it; nothing acts on it, and the machine only carries it. Where the defect happened — on a
  message, an operation or an activation — is stored as data.
- **The keys and the mailbox are written whole.** Both are few rows, and one event may change any of them: a
  whole write is plainly the machine's `Stored`, where a difference would be a second implementation of it.
- **A program's schemas encode to JSON.** The runtime writes JSON text, so a schema whose encoded side is not
  JSON (`Schema.DateTimeUtc`, which declares a `DateTime.Utc`) cannot be stored: the examples hold their times as
  `Schema.DateTimeUtcFromMillis`. Whether `schemas` should say so in its types is an
  [open question](../../open-questions.md).
- **`send` from an operation retries a suspended receiver.** `send` waits instead of giving up
  ([decision 0010](0010-a-rejection-may-carry-a-reason.md)): the runtime sends again every few milliseconds, and
  the receiver answers from the reply it stores once an operator resumes it.
- **A defect at creation is the creator's defect.** `init`, `durable` or `project` dying on the first state
  stores nothing ([decision 0014](0014-rules-the-machine-settled.md)), and there is no entity to suspend: the
  creator's call dies with the same cause. What a caller outside the process is told is part of the open question
  of who may create an entity.
- **The crash table's points are in the runtime's options.** `at(point, entity, event)` is called before the
  commit, after it, and after the callers are answered. A test dies there; the default returns at once. The
  runtime's tests need it, and tracing uses the same hook (`observe`), which is called with every committed
  event, in order.

## Alternatives

- **Reading the stored state at every event**, instead of holding the machine in the process. Each event would
  read what it just wrote, and nothing would be gained: one process is the only writer, and a crash drops what it
  holds anyway.
- **Writing a difference** instead of the whole state, keys and mailbox. It is the answer to large states, which
  is an [open question](../../open-questions.md); for a first runtime it would be a second place where the
  machine's rules live.
- **Activating entities lazily**, when a caller arrives. A timer would never fire, and an operation interrupted
  by a crash would never run again, for an entity nobody asks about.
- **Storing the cause of a defect as a value.** A defect is not data: a schema for it would describe only what
  programs happen to throw today.

## Consequences

- [`src/runtime.ts`](../../../src/runtime.ts) interprets the machine's outputs, and
  [`src/storage.ts`](../../../src/storage.ts) writes its `Stored` in one SQLite database.
  [`src/runtime.test.ts`](../../../src/runtime.test.ts) drives it with a crash at each point of the table, and
  compares what the database holds with where the machine ends on the events that committed.
- The runtime holds every entity of every program deployed in it: how many a process can hold, and when one is
  unloaded, is passivation's question, and the next step of the [roadmap](../../roadmap.md).
- Effect is pinned where the unstable `effect/sql` modules are ([decision 0019](0019-unstable-effect-modules.md)),
  and the tests run on `@effect/sql-sqlite-bun`.
