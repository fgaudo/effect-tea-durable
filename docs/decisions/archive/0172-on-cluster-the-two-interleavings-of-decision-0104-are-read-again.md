# 0172. On Cluster, the two interleavings of decision 0104 are read again

**Status:** accepted, 2026-11-07, with the step Effect Cluster of the roadmap. Says how
[decision 0063](0063-the-runtime-waits-for-what-it-waits-for.md) and
[decision 0067](0067-each-entity-is-held-by-its-own-lock.md) hold on Cluster, as the roadmap asks before the
step is done.

## Context

[Decision 0104](0104-the-runtimes-tests-choose-where-fibers-yield.md) reached two interleavings on one
process under the scheduler of the tests:
- a sender that registers for its receiver's resumption only after it is answered `Suspended` misses a resumption
  between the answer and the registration, and waits for ever (decision 0063);
- an entity's lock dropped while others wait for it lets a new taker hold a lock of its own beside them, and two
  callers build two machines for one entity (decision 0067).

On Cluster a resumption reaches the sender as a message, `Resumed`, from the runner that holds the receiver
([decision 0167](0167-on-cluster-an-operation-sends-through-the-doors-client-and-is-woken-by-resumed.md)). An
entity's lock is taken only inside a transaction where a step or an activation loads the entity
([decision 0161](0161-on-cluster-a-step-settles-the-machine-by-the-count-of-the-steps-that-wrote-it.md)). The
scheduler of the tests does not run Cluster's runners, whose storage is read on a timer.

## Decision

- **An operation on Cluster registers for the receiver's resumption before it sends, as on one process.** The code
  is the same `awaitResumption`, and nothing changes in it. On Cluster the window between the answer and a late
  registration is wide: a client on another runner reads its answer `Suspended` from Cluster's storage on a timer,
  every `entityReplyPollInterval`, and `Resumed` is delivered on another timer, every `entityMessagePollInterval`.
  A test on two runners holds the rule. It withholds the answer the client gives the operation until `Resumed` has
  been handled.
- **An entity's lock is dropped by its last user only, as on one process.** The code is the same `holding`, and
  the test of decision 0067 on one process holds it. On Cluster on SQLite, the interleaving that test reaches is
  not reached: what loads an entity on Cluster, a door's step or an activation, takes the lock inside a transaction,
  and a runner's client runs one transaction at a time. So two loaders of one entity never wait for its lock at
  once on a runner. The takers outside a transaction, which start what a step sets going, unload the entity or crash
  it, load nothing.

## What it rests on

- A sender woken by a `Resumed` handled before its client gives it the answer `Suspended` sends again and is
  answered: **tested** by ``an operation is woken by a `Resumed` delivered before its client gives it the answer
  Suspended`` in [`src/cluster.test.ts`](../../../src/cluster.test.ts). It hangs against `send` with the registration
  moved after the answer. The test withholds the second answer `Suspended`, since the client resets the first and
  sends again before it gives an answer ([decision
  0165](0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md)), and a resumption
  before the second sending is answered `Accepted` whatever the registration.
- That the test's withholding is what Cluster does when its storage loop reads before the reply is saved:
  **read in the source**, the storage loop of `cluster/Runners.ts` at 4.1.2, which leaves a request waiting while
  `repliesFor` gives no reply for it, and reads again at the next poll.
- A runner's client of SQLite runs one transaction at a time: **read in the source**, `SqliteClient.make` of
  `@effect/sql-sqlite-bun` at 4.1.2, whose transactions take a semaphore of one permit. A loader of an entity takes
  the lock inside the transaction: **tested** for the steps and the activations by the tests decision 0161 names.
- That no taker outside a transaction loads an entity, so that two machines are never built on Cluster on SQLite:
  **only reasoned**, from the four takers in `src/runtime.ts`. The rule of decision 0067 is kept all the same, and
  its test on one process holds the code.
- On PostgreSQL with a pool, two loaders could wait for one lock at once. The runtime runs on Cluster only where the
  commit checks the shard, on SQLite ([decision 0084](0084-a-step-commits-only-where-the-commit-checks-the-shard.md)),
  so this is **only reasoned**, and is read again with PostgreSQL.

## Alternatives

Effect's modules weighed, in `node_modules/effect/src` at 4.1.2:
- **`Latch`, for the senders waiting for a receiver.** A latch opened by `Resumed` stays open, and has to be closed
  again for the next suspension, which is the window a `Deferred` for each sending does not have.
- **`PubSub` of resumptions.** A subscription made before the sending is what `awaitResumption` does with a
  `Deferred`, and a `PubSub` keeps no key: each sender would read every resumption of the process.
- **`DurableDeferred` of `effect/workflow`.** It survives a runner, but it is completed inside a workflow, and the
  runtime runs none ([decision 0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md)). A
  sender whose runner stops sends again at its entity's next activation already.
- **`PartitionedSemaphore`, for the entities' locks.** It shares one pool of permits among keys, and an entity's
  lock is a permit of its own.
- **`RcMap` of semaphores.** Weighed by decision 0067, and left: it forks a fiber for each lock it makes.

Other ways:
- **A test of the lock on Cluster.** Two loaders of one entity do not meet on a runner on SQLite, so a test there
  would pass with the lock dropped by any user, and hold nothing.

## Consequences

- The operations on Cluster are woken whatever the order of `Resumed` and of their answer.
- The test of decision 0067 stays the one that holds the lock's rule, on Cluster as on one process.
- A move of the runtime on Cluster to PostgreSQL reads the second interleaving again.
