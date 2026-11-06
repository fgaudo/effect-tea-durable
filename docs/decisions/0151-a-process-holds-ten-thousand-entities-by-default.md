# 0151. A process holds ten thousand entities by default

**Status:** accepted, 2026-11-06, with the step A default capacity of the roadmap. Decides the
[open question](../open-questions.md#running) of entities loaded without a capacity. Changes
[decision 0076](archive/0076-a-process-over-its-capacity-unloads-the-least-recently-used.md), whose capacity has no
default.

## Context

A process launched without `capacity.entities` unloads an entity only once nothing has come for it for
`passivate.millis`, 30 seconds by default ([decision 0029](archive/0029-an-idle-entity-is-unloaded.md)). Nothing
else bounds the number of entities it holds. A burst of callers to distinct entities loads every one of them, and
holds them all for half a minute.

The spike [`spikes/loaded-entities.test.ts`](../../spikes/loaded-entities.test.ts) measured what a loaded entity
holds, on Windows with Bun 1.4.2, over SQLite in memory, for 2 000, 10 000 and 50 000 entities.

| State | Heap per loaded entity | A creation |
| --- | --- | --- |
| 12 bytes of JSON | 7.5 to 8.7 KB | 0.17 to 0.21 ms |
| 871 bytes of JSON | 9.4 to 9.7 KB | 0.17 to 0.19 ms |
| 871 bytes, a capacity of 100 | next to nothing | 0.32 to 0.35 ms |

About 8 KB of each entity is the runtime's own: its loop's fiber, its queue of events, its locks and its record
of callers. The rest is the decoded state. One caller that creates entities one after the other loads about
170 000 of them within one passivation, about 1.5 GB of heap for states of a few bytes. A capacity costs a load at
the next use of an entity it unloaded, and nothing while the entities it holds are used.

Effect Cluster bounds a runner at `maxResidentEntities`, 10 000 by default, and refuses a new entity past it: its
messages wait in storage until a slot frees up. On Cluster that bound is left unbounded, and the runtime's capacity
is the only one ([decision 0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md)).

## Decision

- **`capacity.entities` is 10 000 by default.** A process over it unloads the least recently used of its spare
  entities, as decision 0076 decides, whatever launched it. At the spike's figures, 10 000 entities of small states
  hold about 100 MB, and each state adds its decoded size.
- **`capacity: { entities: 'unbounded' }` says no bound**, and time alone unloads, as a process without a capacity
  did before. Any value other than a positive integer or `'unbounded'` is the launcher's defect, as before.
- **The default is Cluster's own number.** A program moved from one process to Cluster holds as many entities on
  each runner as it held in the process, and the runtime keeps the bound on Cluster, where `maxResidentEntities`
  is left unbounded.
- **Nothing is logged for the capacity.** A process at its capacity unloads as it was told to, which is no
  defect. A process over it holds busy entities, and each of those holds at most `callers.messages` callers
  ([decision 0147](0147-an-entity-holds-a-bounded-number-of-callers-messages.md)).

## What it rests on

- That a loaded entity holds about 8 KB beside its state, and that a capacity frees what the entities it unloads
  held: **seen**, in `spikes/loaded-entities.test.ts`, which checks that an entity holds more than its state's text
  and that a capacity of 100 holds a quarter of that at most.
- That Cluster's `maxResidentEntities` is 10 000 by default, and refuses a new entity past it: **documented**, in the
  JSDoc of `ShardingConfig.maxResidentEntities` in `effect/src/cluster/ShardingConfig.ts` at 4.1.2.
- That 10 000 is a number an operator wants by default: **only reasoned**, from the spike's 100 MB and from
  Cluster's default. A deployment whose entities hold large states lowers it, and the warning of a large step
  names those entities ([decision 0135](0135-a-large-state-is-split-by-the-program-and-the-runtime-warns-of-it.md)).

## Alternatives

- **No default**, as decision 0076 left it. A process launched with the defaults then holds what a burst loads,
  and only the time bounds it.
- **A bound in characters held**, the length of the states loaded. The runtime keeps the length a step writes, and
  not what the decoded state holds in memory, which only the heap knows. A count is what Cluster bounds too.
- **A warning past a number of entities**, with no unloading. It names no entity, and the memory still grows.
- **Effect's `Cache` or `ScopedCache`** for the order of use. Both evict the oldest entries by insertion order,
  whatever the entry is doing, and the capacity must never unload a busy entity or one whose timer is due
  ([decision 0078](archive/0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md)).
  `ScopedCache` also closes each evicted entry from the fiber that enters, and waits for the closing, which is the
  entering entity waiting for the others' locks that decision 0076 rejected.
- **Effect's `RcMap`** with a capacity. It counts idle entries toward the capacity and fails a new key past it with
  `ExceededCapacityError`. That is the refusal to load that decision 0076 rejected, since the caller is a request the
  process has accepted already.

## Consequences

- `Options.capacity` in [`src/runtime.ts`](../../src/runtime.ts) takes `'unbounded'`, and says its default.
  The order of use stays a `Map` written by hand, whose comment says what `Cache`, `ScopedCache` and `RcMap` do not
  do.
- [`src/runtime.test.ts`](../../src/runtime.test.ts) checks that a process launched with no capacity unloads its
  least recently used entity once 10 001 are loaded, and that a process of capacity `'unbounded'` unloads by time
  alone.
- `docs/design.md` says, under Passivation, that a process holds 10 000 entities by default, and the glossary's
  capacity says its default. The open question of entities loaded without a capacity leaves
  `docs/open-questions.md`.
