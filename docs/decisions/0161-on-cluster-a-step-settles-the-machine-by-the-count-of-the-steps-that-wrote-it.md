# 0161. On Cluster, a step settles the machine by the count of the steps that wrote it

**Status:** proposed, 2026-11-06, for the step Effect Cluster of the roadmap. Says how the pending machine of
[decision 0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md) is kept, and changes two
of its rules: what a door's step sets going is performed by the step that finds it committed, and an entity's lock
on Cluster is taken only inside a transaction.

## Context

On Cluster, a door's step runs in Cluster's transaction, which Cluster commits after the handler returns, and may
roll back without telling the handler. Decision 0092 has the entity's row count the steps that wrote it. A door's
step leaves its machine beside the one the entity holds, as pending, and the next step of the entity reads the
count first. The count says which of the two machines is the stored one. Decision 0092 then starts what a step sets
going from the machine, in the `afterCommit` callback, since a later step may have ended that work already.

Two things are not said there. A machine computed by a door's step is the result of several events: a `Restart` for
an entity the door loads, the message's arrival, and each `Handle` up to its answer. And the runtime takes an
entity's lock where it loads the entity, which reads the database. A door's handler holds the runner's one
connection from before its code runs. A door that waits for the lock while another fiber holds the lock and waits
for the connection never ends.

The SQLite client shares one connection through a semaphore. Its JSDoc says that another fiber cannot begin a
transaction while one holds it, and that a statement waits for the semaphore too.

## Decision

### The count

- **The entity's row holds `steps`, the count of the steps that wrote it**, raised by every write, on one process as
  on Cluster. A creation writes 1. A database made before is given the column, at 0.
- **Every step of an entity on Cluster settles its machine first, inside its transaction**: a door's step, an event
  of the entity's own, and the `Settle` its door's commit sends. It reads the count, and:
  - a count that is the uncommitted machine's means the door's step committed. That machine is the entity's, and
    what its events set going is performed now: consumers are told of the rows, and the operations and timers start;
  - a count that is the held machine's means the door's step rolled back. Its machine is dropped, and nothing it set
    going starts;
  - any other count is a row this runner did not write. The entity crashes, and the door's step loads it again from
    what is stored.
- **What a door's step sets going is performed by the step that settles it**, before that step computes from the
  machine. So no later step ends work that has not started yet. That is the order decision 0092 kept by starting
  from the machine, and the count proves the commit.
- **The door's commit offers `Settle` to the entity's loop**, through `SqlClient.afterCommit`. A callback that is
  lost, where the outcome of `COMMIT` is unknown, leaves the next step to settle the machine. An entity whose
  machine is not settled yet does not leave the process: when its wait runs out, or it is told to leave a process
  over its capacity, its loop settles first, and decides from the settled machine whether the entity leaves.
- **A step of the entity's own sets the machine and the count inside its transaction.** The connection runs a door's
  step after it, and the door reads both inside its own transaction, so the door never reads them between the
  step's commit and the assignments. A commit that fails crashes the entity, and nothing reads them then.
- **A door's step that writes nothing leaves no uncommitted machine.** Nothing it did can roll back, so its machine
  is the entity's at once, and what it sets going is performed at once.
- **An operation or a timer a step sets going is forked without the step's transaction in its context.** A fiber
  forked keeps the services of the fiber that forks it, and a step that settles forks inside its transaction. With
  the transaction kept, the statements of an operation would run on the step's connection, outside the client's
  semaphore, and an `afterCommit` of the operation's would die once the step has ended.

### The door's step

- **A door's step is every event its request needs, stepped one after the other, and written in Cluster's
  transaction**: the `Restart` of an entity it loads, then a creation, or a message's arrival and each `Handle` up to
  the message's answer ([decision 0160](0160-on-cluster-a-door-answers-as-text-and-a-creation-the-program-dies-on-waits-for-a-fix.md)).
  The uncommitted machine is the last one, with the count the writes give, and the events with what each set going.
- **An entity a door's step creates or loads enters the process at the step's end**, with its loop. Its held machine
  is the stored one, with the stored count, or nothing at count 0 for a creation.

### The lock on Cluster

- **On Cluster, an entity's lock is taken only inside a transaction, or by code that touches no database while it
  holds it.** A door's step takes it inside Cluster's transaction. An unload holds it without touching the database.
  So nothing holds the lock while it waits for the connection a transaction holds.
- **A caller's request, an operator's, and an operation's on Cluster die until the client is code**, since each would
  load the entity under its lock outside a transaction. They reach an entity through its door's client
  ([decision 0085](0085-on-cluster-a-request-is-keyed-and-answered-as-on-one-process.md)), which is a later part of the
  step.

## What it rests on

- That the SQLite client runs one transaction at a time, and that a statement waits for it: **documented** by the
  JSDoc of `SqlClient.makeSqliteAcquirers` at 4.1.2.
- That `afterCommit` runs its callbacks only after a commit, and loses them where the outcome of `COMMIT` is unknown:
  **documented** by the JSDoc of `SqlClient.afterCommit`.
- That a `COMMIT` that fails rolls the door's step back, and Cluster delivers the request again: **seen** by the spike
  of [decision 0081](0081-on-cluster-a-step-commits-with-its-reply.md), and **tested** by
  `a door step whose commit fails is dropped, starts nothing, and is stepped again` in
  [`src/cluster.test.ts`](../../src/cluster.test.ts). The test breaks a deferred foreign key once, the message is
  stepped twice, and its operation runs once. The test fails where settling promotes the uncommitted machine
  whatever the count.
- That what a door's step sets going starts once it commits, and its completion is stepped by the loop from the
  committed machine: **tested** by `what a door step sets going starts once it commits, and its completion is stepped
  by the loop`, which fails where the door performs before the commit.
- That no fiber holds an entity's lock while it waits for the connection: **only reasoned**, from the paths that take
  the lock on Cluster. No test reaches the deadlock, since the paths that would take it outside a transaction die.
- That a fiber forked keeps the services of the fiber that forks it, and that the client finds a transaction among
  them: **read in the source** of `internal/effect.ts` and `sql/SqlClient.ts` at 4.1.2, and **tested** by `an
  operation a door step sets going runs outside the step transaction` in [`src/cluster.test.ts`](../../src/cluster.test.ts),
  whose operation registers an `afterCommit`. The test fails where the fork keeps the transaction.
- That a door's step never reads the machine and the count between a step's commit and the step's assignments, and
  that an entity told to leave settles first: **only reasoned**, each held by the order of the code. No test reaches
  either interleaving. The first needs the loop's fiber to yield between the commit and the assignments, which
  Effect does only past its budget of operations, more than any step of the tests takes. The second needs the entity
  to be spare while a door's step of its is not settled: the `Settle` a commit offers is counted as pending until it
  is applied, which keeps the entity from being told to leave, so only a callback lost or a rollback leaves the
  entity spare with an uncommitted machine, and a test sees no difference between a settle that drops it and an
  unload that drops it. The scheduler of the tests drives no fiber of Cluster, whose timers it leaves waiting.

## Alternatives

- **What a door's step sets going started from the machine in `afterCommit`**, as decision 0092 says. The machine
  holds which keys have work, and not which of them a step started, ended or armed again. Telling them apart again
  is what the transitions already say. Performing them when the count proves the commit keeps their order.
- **No uncommitted machine: the entity loaded again at each request**, as the first door did. Nothing would be held
  in memory, and no timer would be armed, and an operation started by a door would have no entity to complete in.
- **The entity's lock taken before Cluster's transaction.** The handler runs inside the transaction Cluster opens,
  and no code of the runtime runs before it.
- **The count in a table of its own.** Every write already updates the entity's row, so the count costs no
  statement there.

## Consequences

- [`src/storage.ts`](../../src/storage.ts) holds `entities.steps`, raises it in every write, and reads it with
  `stepsOf`. [`src/runtime.ts`](../../src/runtime.ts) gives `launchWith`, which runs on Cluster where it is given an
  `OnCluster`: there it holds no database, registers each deploy's door, settles each step, and steps a door's
  request in Cluster's transaction. [`src/cluster.ts`](../../src/cluster.ts) gives `onCluster` and `launch`.
- On Cluster the waker and the activation at deploy do not run yet, so a timer of an entity not loaded is not woken.
  A singleton per shard gives both, and is the next part of the step.
