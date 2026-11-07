# 0127. A live stream feeds its entities from the boundary

**Status:** accepted, 2026-11-04. Decides the open question on live streams.

## Context

A timer and an operation survive passivation, since what is stored rebuilds them. A stream from a socket or a feed
does not: a process that unloads its entity, or crashes, closes the stream, and loses what the stream had sent and
the entity had not stored. A third kind of work, a stream under a key, would keep its entity loaded while the key is
present. An entity that is never idle holds a place under the capacity
([decision 0076](0076-a-process-over-its-capacity-unloads-the-least-recently-used.md)), and a crash still
loses the items in flight.

effect-tea's Guide answers the same need for a program in a browser in three parts. The connection is a service,
which a layer provided around `run` opens and closes. A subscription under a key that stays the same listens to what
the service receives. A command tells the service what changed. So the Guide already keeps the connection out of the
program, and only the listening is inside. Here a subscription is replaced by durable work, since work outlives the
process ([design](../../design.md#where-it-departs-from-effect-tea)), and a listening that dies with the process has no
durable form.

## Decision

- **A program has no kind of work for a stream.** Its work stays operations and timers, each of which survives a
  crash and a passivation.
- **A stream is read at the boundary, which sends each item as an inbound message.** The connection is the
  deployment's, as the Guide's service is the run's. The boundary calls `send` for each item, under the sender it
  speaks for, and acknowledges the item to its source only once `send` is answered.
- **An item's request id comes from the item.** The boundary derives it from what the source says of the item, an
  offset or an id. A boundary that sends an item again after a crash then gets the stored reply, as any caller's
  retry does ([decision 0048](0048-a-callers-request-belongs-to-its-sender.md)), within the keep the boundary
  gives ([decision 0125](0125-a-callers-reply-is-kept-as-long-as-its-boundary-says.md)).
- **An item may arrive in any state, so `update` rejects one the state does not want.** An item is a message from
  outside, and the Guide's test for a rejection holds of it: a stream that is slow to stop is enough to bring it
  there. An entity that wants the stream only in some states says so in its projection, and the boundary that reads
  the projection may stop sending. The rejection keeps the rule whatever the boundary does.

## What it rests on

- That an entity with nothing to do is unloaded, and that a stream inside it would count as something to do:
  **tested**, `unloads an idle entity, and its stored timer wakes it` and `a process over its capacity unloads its
  least recently used idle entity, under prioritized schedules`, in [`src/runtime.test.ts`](../../../src/runtime.test.ts).
- That an item sent again under its request id is answered from the stored reply, within the keep the boundary
  gives: **tested**, `answers a retry from the stored reply, and NotFound for no entity` and `a retry within the keep
  its boundary gives is answered from storage, and one after it is applied again`, in
  [`src/runtime.test.ts`](../../../src/runtime.test.ts).
- That a source gives each item an offset or an id that stays the same when the item is read again: **only
  reasoned**. A source without one gives the boundary nothing to derive a request id from, and an item read again is
  applied twice.
- That a boundary acknowledges an item only once `send` is answered: **only reasoned**. The library cannot check it.
  A boundary that acknowledges first loses the item a crash interrupts.

## Alternatives

- **A stream as work under a key, which keeps its entity loaded while the key is present.** The entity would hold a
  place under the capacity for as long as the stream runs, and a crash would lose the items not yet stored.
- **A stream as an operation that never completes.** An operation leaves the state only through its completion
  ([decision 0005](0005-an-operation-leaves-only-by-completing.md)), so the state could never stop it, and a
  passivation would interrupt it.

## Consequences

- Nothing in `src/` changes: `send` and request ids are what a boundary uses.
- An example of a stream, if one is written, is a boundary that reads it and calls `send`, beside the program it
  feeds.
