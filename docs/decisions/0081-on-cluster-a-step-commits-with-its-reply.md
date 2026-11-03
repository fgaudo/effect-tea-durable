# 0081. On Cluster, a step commits with its reply

**Status:** accepted, 2026-10-31. Decides the first of the [roadmap](../roadmap.md)'s findings from
[Effect Cluster](../cluster.md#one-transaction-or-two); changes [decision 0007](archive/0007-one-process-first.md)'s
consequence for Cluster, and says that [decision 0074](archive/0074-a-message-that-finds-the-mailbox-empty-is-handled-as-it-arrives.md)
does not hold there. Its reasons against letting a defect reach Cluster are corrected by
decision 0082 (deleted; git keeps it): the endless retry and the stall are what one release of Cluster does, not its
contract, and the runtime does not count on what Cluster does with a defect. What it says of a stored answer and of
the runtime's mailbox there is changed by
[decision 0085](0085-on-cluster-a-request-is-keyed-and-answered-as-on-one-process.md). An
interrupted caller had Cluster store an answer no step gave, which
[decision 0091](0091-on-cluster-an-interrupted-caller-leaves-its-request-alone.md) corrects. What a step sets going
is started from the machine, not from the step, since `afterCommit` runs once the connection is released, by
[decision 0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md).

## Context

Decision 0007 chose one process because Cluster's message storage committed apart from what the runtime writes: a
crash between the two commits applied a message twice or lost a state, and on Cluster the state would record the
last message it handled. The [study](../cluster.md#one-transaction-or-two) found that an RPC annotated
`ClusterSchema.WithTransaction` runs its handler in the storage's transaction, and saves a success reply in it.

A spike checked this against `effect` 4.1.0, with `SingleRunner` on `@effect/sql-sqlite-bun`, a persisted RPC under
`WithTransaction`, and a handler that inserts a row into a table of its own on the same `SqlClient`:

- a handler that succeeds commits its row and its reply; the same request sent again is answered from the stored
  reply, and the handler does not run;
- a handler whose writes pass but whose `COMMIT` fails (a deferred foreign key) leaves neither its row nor a reply,
  and the request is handled again;
- a handler that fails leaves no row, and its failure is saved as the reply, after the rollback;
- a handler that dies leaves no row, and the entity restarts and is given the message again, without end; the
  entity's later messages wait behind it. If the caller of that message is interrupted (a timeout), messages to the
  runner's other entities wait too, for 25 s and more; a request that is only slow does not do this.

## Decision

- **On Cluster, the runtime's tables sit beside Cluster's, on one `SqlClient`, and an entity's messages are
  RPCs annotated `Persisted` and `WithTransaction`.** The step's writes — the state, the stored work, the read
  model, the outbox — and Cluster's reply commit together, or none does. Cluster's mailbox is the entity's: the
  runtime keeps none of its own there.
- **Everything a step answers is a success of the RPC**: an accepted message, a rejection, `Suspended`. Its success
  schema encodes them all, and its failure schema is empty. A defect of the program is caught by the runtime, which
  stores the suspension in the step's transaction and answers it, as it does on one process
  ([decision 0006](archive/0006-a-defect-suspends-the-entity.md)).
- **What a step sets going starts once the transaction commits**, through `SqlClient.afterCommit`: an operation, a
  timer, a wake-up. A commit that fails discards them, and the request is handled again from the state before it.
- **The state records no message it handled.** A message delivered again is answered by Cluster from the reply it
  stored with the step.

## Alternatives

- **The state recording the last message it handled**, as decision 0007 foresaw, with Cluster's reply saved in a
  transaction of its own. A crash between the two needs the runtime to recognise the message and answer it again,
  which Cluster's reply, saved in the step's transaction, already does.
- **A rejection as a failure of the RPC.** Cluster saves a failure after it rolls the handler's transaction back, so
  what the step wrote with it — the state, the read model, the outbox — would be lost.
- **Letting a defect reach Cluster**, which restarts the entity and delivers the message again. It retries without
  end, holds the entity's other messages behind it, and, with its caller interrupted, the runner's other entities
  too; the runtime's suspension stores the defect and frees the runner.

## Consequences

- On Cluster, a message is stored by Cluster, then handled: two transactions, and a message that finds the mailbox
  empty is no longer handled as it arrives. Decision 0074 still holds of the runtime on one process.
- The runtime's mailbox, and what a process does to start the entities whose mailbox holds a message
  ([decision 0071](archive/0071-a-process-starts-the-entities-with-a-message.md)), are the one-process runtime's; on Cluster,
  Cluster reads its own mailbox per shard.
- A step may run more than once for one message, when its commit fails or its runner loses the shard before the
  commit. The machine is pure and nothing of a step is seen before its commit, so it runs again from the same state.
- The runtime replaces an entity's state in its memory only once the step has committed, so a step whose commit
  fails leaves the entity at the state it was stepped from.
- Where the lock check stands against this commit is the next finding, the fence, and on PostgreSQL and MySQL still
  open ([Cluster](../cluster.md#who-holds-an-entity)).
- Nothing of this is code yet: the runtime on Cluster is a later step of the [roadmap](../roadmap.md).
