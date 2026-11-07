# 0166. On Cluster, an operator resumes and discards through the door's client, each event a request of its own

**Status:** accepted, 2026-11-07, with the step Effect Cluster of the roadmap. Says how
[decision 0085](0085-on-cluster-a-request-is-keyed-and-answered-as-on-one-process.md) is code for an operator's
`Resume` and `Discard`, which it decides are steps of the entity on the runner that holds its shard. The step that
resumes or discards tells the senders that wait for the entity's resumption by `Resumed`, by
[decision 0167](0167-on-cluster-an-operation-sends-through-the-doors-client-and-is-woken-by-resumed.md).

## Context

On one process, an operator's `Resume` or `Discard` is offered to the entity's loop while its lock is held, and
the operator waits for what the event did ([decision 0114](0114-an-operator-sees-the-suspended-entities-and-what-a-resume-did.md)).
Until this note, both died on Cluster. Offered in the process, they would take the entity's lock and read the
database outside a transaction, which a door's step waits on
([decision 0161](0161-on-cluster-a-step-settles-the-machine-by-the-count-of-the-steps-that-wrote-it.md)). They
would also reach only an entity of a shard the operator's runner holds.

A caller's request already goes through Cluster's client of the door
([decision 0165](0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md)). An
operator's event differs from a caller's request in two ways. It carries no request of a sender, so it has no key
for Cluster to deduplicate by. And a second event is a new act of the operator's: a `Discard` sent once the entity
has suspended again drops the message it died on this time.

Cluster's JSDoc of `ClusterSchema.WithTransaction` at 4.1.2 says how a handler's answer reaches its client. A
persisted request saves a success reply in the handler's transaction, and delivers it after the commit. A
non-persisted request saves no reply, and its success is delivered when the handler exits, before the commit.

## Decision

- **An operator's `Resume` and `Discard` on Cluster go through Cluster's client of the door**, from whatever runner
  the operator is on. The door has an RPC for each, with no payload but the entity's address. Each is persisted,
  runs under `WithTransaction`, and is uninterruptible at the client, as the door's other RPCs are
  ([decision 0091](0091-on-cluster-an-interrupted-caller-leaves-its-request-alone.md)).
- **The door's step steps the event as the loop does on one process**, in Cluster's transaction. It settles or loads
  the entity as for a message, with the entity's `Restart` stepped first where it loads it. It answers `NotFound`
  where no entity is stored, and otherwise what the event did, read off the machine before and after it, as
  decision 0114 decides. The answer is text, as every door's answer is
  ([decision 0160](0160-on-cluster-a-door-answers-as-text-and-a-creation-the-program-dies-on-waits-for-a-fix.md)).
  What the event sets going starts once a later step finds the commit, as for any door's step (decision 0161).
- **An operator's event has no primary key.** Cluster saves each one sent as a request of its own, and no saved
  reply of an earlier event answers a later one. Cluster keeps the rows of every event: the operator's client reads the reply
  from storage, which the deletions of an operation's rows would take first
  ([decision 0090](0090-on-cluster-a-reply-is-deleted-as-on-one-process.md), [decision 0169](0169-on-cluster-an-operations-request-ids-are-kept-under-its-work-and-deleted-with-it.md)).
- **Every answer of an operator's event is a reply.** `NotFound` and `NotSuspended` are what the event found, and a
  new event is a new request, so the client resets nothing, unlike a caller's `Suspended`
  ([decision 0165](0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md)).
- **A sender that waits for the entity's resumption is not told it yet.** On Cluster only an operation's request
  waits for a resumption, by `Resumed`
  ([decision 0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md)), and an operation's
  request still dies there. The step that resumes or discards tells the senders that wait once that request is code.

## What it rests on

- A persisted request's success reply is saved in the handler's transaction and delivered after the commit, and a
  non-persisted request's success is delivered when the handler exits: **documented**, in the JSDoc of
  `ClusterSchema.WithTransaction` at 4.1.2, `@stability unstable`.
- A persisted request with no primary key is saved with none, and is deduplicated with no other: **read in the
  source**, `Envelope.primaryKey` and `saveRequest` of `cluster/MessageStorage.ts` at 4.1.2. It is **tested** by
  `an operator’s resume and discard go through the door, each a request of its own` in
  [`src/cluster.test.ts`](../../src/cluster.test.ts): a `Discard` answered `NotSuspended` is followed by one answered
  `Discarded`.
- The door's step of an operator's event answers as the loop does on one process: **tested** by the same test, for
  `NotFound`, `NotSuspended`, `Resumed` and `Discarded`. `NotDiscarded` and `StillSuspended` are read off the
  machine by the same function on both paths, and are tested on one process for decision 0114.
- That an operator's event is rare enough for Cluster's rows of it to be kept: **only reasoned**.

## Alternatives

Effect's modules weighed, in `node_modules/effect/src` at 4.1.2:
- **A non-persisted RPC under `WithTransaction`.** It saves no row. Its answer is delivered when the handler exits,
  before the commit, so an operator could be told `Resumed` or `Discarded` of a step that then rolls back.
- **A persisted RPC with a primary key**, the entity's id or a constant. Cluster would answer every later event from
  the reply it saved for the first: a `Discard` answered `NotSuspended` once would be answered so for ever, within
  the version.
- **One RPC with the event in its payload.** Two RPCs carry no payload, and the RPC's tag names the event in
  Cluster's rows.
- **`Entity.client` of the door.** It gives the same client as `Sharding.makeClient`, which `onCluster` calls already,
  as decision 0165 says.
- **`Sharding.reset` of an earlier event's reply, as for a caller's `Suspended`.** No answer of an operator's event
  waits on anything, so there is nothing to handle again.

Other ways:
- **The event offered to the entity's loop on the runner that holds its shard**, as on one process. The loop's step
  would hold the entity's lock outside Cluster's transaction (decision 0161), and an operator on another runner
  would need a request through Cluster anyway.

## Consequences

- An operator can resume or discard an entity from any runner, and the step runs where the entity's shard is.
- Every event an operator sends leaves a request and a reply in Cluster's tables.
- A `Discard` whose answer is lost to the operator, by a timeout or an interruption, is still applied once. The
  operator reads `Handle.suspended` before sending another, as on one process.
