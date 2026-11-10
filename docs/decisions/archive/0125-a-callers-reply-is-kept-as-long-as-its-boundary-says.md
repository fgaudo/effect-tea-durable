# 0125. A caller's reply is kept as long as its boundary says

**Status:** accepted, 2026-11-04. Decides the open question on callers' stored replies, which
[decision 0021](0021-a-reply-is-kept-while-the-work-that-asked-holds.md) left open: until now a caller's reply
was kept for ever. What decision 0021 decides of a reply to another entity is left as it is. On Effect Cluster a
caller's `keep` is in the door's payload, and Cluster's rows of the request go with its reply once its time is past,
by [decision 0165](0165-on-cluster-a-caller-sends-through-the-doors-client-and-is-never-answered-full.md).
Changed by [decision 0245](../0245-a-reply-is-kept-as-long-as-send-says-and-the-runtime-sweeps.md): `keep` is required,
and the runtime sweeps at an interval.

## Context

A caller's reply is stored so that a retry under the same request id gets it, and the message is applied once.
Until now it was kept for ever, since how long a caller retries depends on its protocol. An HTTP API with
idempotency keys keeps them for a day, and a queue redelivers within its visibility timeout. A table that only grows
costs the disk. It also keeps every migration of a program, since a reply a version before wrote is read through
them.

By [decision 0124](0124-the-boundary-authenticates-and-update-authorizes.md) the boundary speaks the caller's
protocol, and writes the sender from what it authenticated. The time a caller retries for belongs to the same
protocol. The same decision leaves the program only domain: it sees no sender, and decides nothing of the
protocol. A duplicate in the domain's sense, such as an order paid twice, is something `update` already sees in the
state.

## Decision

- **The boundary gives the time to keep a caller's reply, with each `send`.** `send` takes `keep`, as
  `{ millis }`, beside the request id and the sender. Without `keep` the reply is kept for ever, as before. A `keep`
  whose `millis` is no non-negative integer is the caller's defect, and reaches no entity, as a cursor or a limit
  that is no count is ([decision 0053](0053-what-a-handle-is-given-is-checked.md)).
- **The time counts from the step that answers.** The reply is kept for `keep.millis` from the time of the step
  that stores it. A message that waits in the mailbox, behind other messages or a suspension, keeps its `keep` with
  it, and loses none of its time there. The mailbox's row stores `keep`, and the reply's row the time it ends at,
  `until`.
- **A retry after that time is a new request, and is applied again.** No reply is read past its time, whether its
  row is deleted yet or not. So when the rows go never changes what a caller is answered. The message is applied
  once within `keep`, and `update` decides from the state what a later copy of it does.
- **A creation is not changed.** A retry of a creation is answered `Created` from the entity's row, which is kept
  as long as the entity is ([decision 0017](0017-creation-in-the-machine.md)). `create`
  takes no `keep`.
- **Another entity's reply takes no time.** An operation's request is kept while the work that asked holds
  (decision 0021), and the machine gives it no `until`, whatever `keep` the event carries.
- **A step and an operator delete the rows.** A step that stores a reply deletes its own entity's replies past
  their time, in its transaction. `Handle.expire` deletes those of every entity of the program, and gives how many
  went. It is what frees the rows of an entity that takes no step, and an operator runs it as they run `prune`.

## What it rests on

- That the machine counts a caller's time from the step that answers, and gives another entity's reply none:
  **tested**, by `how long a reply is kept (decision 0125)` in [`src/machine.test.ts`](../../../src/machine.test.ts).
- That a reply is read before its time only, by either reading of a caller's reply, and that a step and `expire`
  delete what is past it, of the entity and of the program alone: **tested**, by `how long a caller’s reply is kept
  (decision 0125)` in [`src/storage.test.ts`](../../../src/storage.test.ts).
- That a retry within `keep` is answered from storage, one after it is applied again, and a `keep` that is no count
  is the caller's defect: **tested**, by `a retry within the keep its boundary gives is answered from storage, and
  one after it is applied again` and `a keep of no whole number of millis is the caller’s defect, and reaches no
  entity`, in [`src/runtime.test.ts`](../../../src/runtime.test.ts).
- That a boundary knows how long its protocol retries for: **only reasoned**. A boundary that gives a `keep`
  shorter than its callers' retries has a message applied twice, which `update` sees only where the state records
  it.
- That the runtime's clock and the boundary's agree well enough for a window counted on the runtime's: **only
  reasoned**. The window is counted on the runtime's clock alone, so a skew between the two shortens or lengthens
  it by that skew.

## Alternatives

- **A retry after the time is answered `Expired`.** No message would be applied twice. But the runtime would need
  the time of the caller's first attempt, from the caller or the boundary, and a clock it does not own. Or it would
  keep a mark of each request id for ever, which is the cost this note removes. It is also a reply that is no
  domain, which [decision 0124](0124-the-boundary-authenticates-and-update-authorizes.md) declined for a creation.
- **One time for the whole runtime**, an option of `launch`. Simpler, but a deployment with two boundaries, such as
  an HTTP API and a queue, would keep every reply for the longer of their windows.
- **A time declared by the program.** The program is domain, and the window is the protocol's.
- **A fiber that sweeps the rows past their time.** It would free them with no operator, but it is a new fiber of
  the runtime, with the tests of concurrency it needs, for rows that no caller reads anyway.

## Consequences

- `send` takes `keep`, and `Handle` gains `expire`. The tables gain two columns, `mailbox.keep` and
  `replies.until`, and an index of the replies by program and time.
- A caller's reply no longer has to be kept for ever. A program whose callers all give a `keep` no longer needs the
  migrations of a version once every row of it is past its time and rewritten. The open question on migrations
  that never leave can be read again with that.
- On Effect Cluster, Cluster stores rows of its own for a caller's request
  ([decision 0085](0085-on-cluster-a-request-is-keyed-and-answered-as-on-one-process.md)). Deleting them with a
  reply past its time is part of the roadmap's step on Cluster, as
  [decision 0090](0090-on-cluster-a-reply-is-deleted-as-on-one-process.md) does for an entity's reply.
