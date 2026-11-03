# 0076. A process over its capacity unloads the least recently used

**Status:** accepted, 2026-10-31. Decides [how many entities a process holds](../../open-questions.md#running), the
alternative [decision 0029](0029-an-idle-entity-is-unloaded.md) left, beside the passivation it decided, which
holds as it was. What a process over its capacity may unload is corrected by
[decision 0078](0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md). `settled` waits for
an entity unloading too, by [decision 0109](0109-settled-waits-for-an-entity-unloading.md).

## Context

An entity is unloaded once nothing has come for it for `passivate.millis`
([decision 0029](0029-an-idle-entity-is-unloaded.md)), and nothing else bounds how many a process holds: a burst
of callers to many entities, or a time that comes for many timers at once, loads them all, and they stay for the
whole wait. Effect Cluster gives each node its shards, and a node needs to say how many entities it holds as much
as a single process does.

The open question asked too what a program whose entity must stay loaded says, for [live
streams](../../open-questions.md#programs). There is no such program: nothing but an operation under way keeps an
entity loaded, and that is what this decision keeps too.

## Decision

- **A runtime may be launched with a capacity**, `capacity.entities`, a positive integer, counted over every
  program the process deploys. None is the default, and time alone unloads, as before. Any other value is the
  launcher's defect.
- **When an entity enters the process beyond its capacity, the least recently used of the entities with nothing
  to do are told to leave**, as many as the process holds too many, the one entering aside, since it is loaded for
  a caller. An entity is used when it enters and whenever an event is offered to it. Having nothing to do is what
  passivation reads ([decision 0029](0029-an-idle-entity-is-unloaded.md)): no event, no operation under way, an
  empty mailbox or a suspension.
- **Told to leave is the passivation's wait running out early.** The telling is put in the entity's queue of
  events, which its loop takes in order with them: the loop unloads it under its own lock, as after the wait, or
  keeps it if an event came first, and it may be told again at the next entry. Nothing is written, and to the
  machine it is the `Restart` of decision 0029.
- **The capacity is a bound on the idle, not on the busy.** An entity with an operation under way is never
  unloaded for it: the process holds more than its capacity while what it holds has work, and comes back under it
  as entities enter, or with passivation.
- **`settled` waits for an entity told to leave** until it has left, or stayed.

## Alternatives

- **The entering entity unloading the others itself.** It holds its own lock while it enters, and would wait for
  theirs: two entities entering at once, each over the other, would hold for ever
  ([decision 0067](0067-each-entity-is-held-by-its-own-lock.md)). Telling them costs no wait.
- **A signal of its own raced with the take of the next event.** A take that loses a race may have taken its event
  already, and lose it; one queue loses nothing.
- **Refusing to load past the capacity**, answering the caller something like `Suspended`. The caller is a request
  the process has accepted already ([decision 0074](0074-a-message-that-finds-the-mailbox-empty-is-handled-as-it-arrives.md)),
  and a busy entity cannot be dropped to make room for it.
- **A bound per program.** What a process has is memory, which every program's entities share.

## Consequences

- [`src/runtime.ts`](../../../src/runtime.ts) keeps the entities it holds in the order they were last used, and its
  loop takes either an event or the telling to leave from one queue.
- [`src/runtime.test.ts`](../../../src/runtime.test.ts) fills a process of capacity two, uses the first entity again,
  and sees the second leave when a third enters, under every budget of steps; it fails if an offered event does
  not count as a use. An entity whose operations are under way stays.
- No test reaches a `settled` that would return before an entity told to leave has left: the entity entering has
  its own `Restart` to apply, and its own work, which outlast the unload under every budget the tests run. The
  check holds by the same reasoning as an event counted from its offer to its step
  ([decision 0063](0063-the-runtime-waits-for-what-it-waits-for.md)): the entity is told and counted in one step,
  and stops being counted in the step after its loop has unloaded it or kept it.
