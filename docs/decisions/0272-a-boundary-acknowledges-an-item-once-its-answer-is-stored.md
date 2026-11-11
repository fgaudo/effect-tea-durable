# 0272. A boundary acknowledges an item once its answer is stored

**Status:** accepted, 2026-11-12, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the fix of bug 60. It changes
[decision 0127](archive/0127-a-live-stream-feeds-its-entities-from-the-boundary.md): a boundary that reads a stream
acknowledges an item to its source once `Accepted` or `Rejected` answers it, and not on any answer of `send`. The
maintainer chose it on 2026-11-12, after an opinion of a Fable 5.2 agent.

## Context

Decision 0127 has the boundary read a stream, call `send` for each item, and acknowledge the item to its source once
`send` is answered. Four answers of `send` store nothing of the item:

- `Suspended`, for a message that arrives while the entity is suspended, which is not queued
  ([decision 0023](archive/0023-suspended-means-no-reply-yet.md)).
- `Full`, for a message past the bound of the entity's callers' messages
  ([decision 0147](archive/0147-an-entity-holds-a-bounded-number-of-callers-messages.md)).
- `NotFound`, for an entity that does not exist.
- `Reused`, for a request id that a request with another message holds
  ([decision 0269](0269-a-callers-request-is-its-sender-its-id-and-what-it-carries.md)).

The source never gives an acknowledged item again. So an item acknowledged on one of these answers is lost, and
nothing reports it. This is bug 60 of the roadmap. The contract of `send` already says that a caller sends again
under the same request id after `Suspended` and after `Full`. Only the boundary's rule of decision 0127 says otherwise.

Two cases decision 0127 did not take up lead to the same loss. A reply is kept for the `keep` the boundary gives
([decision 0125](archive/0125-a-callers-reply-is-kept-as-long-as-its-boundary-says.md)), and a request sent again
after it is applied again. A source gives an item again whenever a crash comes between the answer and the
acknowledgement, which may be later than any `keep`. And a discard of a caller's message stores no reply
([decision 0260](0260-a-discard-of-a-message-an-operation-sent-stores-a-rejection.md)), so an item the entity died
on, sent again after the discard, is a new request, and the entity dies on it again.

## Decision

- **A boundary acknowledges an item once its answer is stored, or once the boundary drops it on purpose.** An answer
  is stored when `send` answers `Accepted` or `Rejected`. A reply of type `Reply` may be `NotFound`, which stores
  nothing, so the rule names the two answers. A boundary that drops an item, as one whose entity it will not
  create, acknowledges it on its own decision, and logs it.
- **After `Suspended` or `Full`, the boundary sends the same item again, under the same request id, after a wait.**
  It does not acknowledge the item meanwhile. The boundary need not tell a message queued in a suspended entity from
  one not queued: decision 0023 makes the same request right in both cases. A boundary that sends an entity one item
  at a time, to keep the source's order, never brings `Full` on itself. On Cluster `Full` never comes, and the
  caller waits instead.
- **After `NotFound`, the boundary decides.** Whether the entity will exist is the boundary's knowledge. It creates
  the entity and sends the item again, or it drops the item as above.
- **After `Reused`, the boundary stops without acknowledging.** The source gave another item under the same offset,
  or a deploy changed how an item is written, and the item may then have been applied already. The library cannot
  tell them apart, so an operator decides.
- **A source that gives an item again after the `keep` is held by the state or by a `keep` of `'forever'`.** For a
  source with an order, the entity keeps the offset of the last item applied, and `update` rejects an item at or
  before it. A boundary then acknowledges that rejection, and the `keep` only spares a step. Otherwise the boundary
  gives `'forever'`, since no bounded `keep` is longer than every time from an answer to its acknowledgement.
- **A discard alone does not get a stream past an item.** The boundary sends the item again after the discard, as a
  new request, and the entity dies on it again. An operator makes the boundary skip the item, or deploys a fix whose
  `update` applies or rejects it, and resumes the entity.
- **An entity that stays suspended holds the items after its own.** A boundary that keeps the source's order waits at
  the item, and on a source divided otherwise than by entity, the other entities' items wait too. A boundary may put
  the item aside, in a queue of its own, and go on. The entity then gets the items after it out of order, and the
  boundary chooses that knowingly.
- **The library does not give the boundary a helper.** The wait between two sends is a few lines of `Effect.retry`.
  Every other choice stays the boundary's: `NotFound`, `Reused`, the `keep`, the order, an item put aside and the
  acknowledgement itself. [`examples/stream`](../../examples/stream) is such a boundary.

## What it rests on

- That an item sent again after `Suspended`, once the entity is resumed, is applied once, whether it was queued or
  not: **tested** by `gives the replies it stored, and answers anything else Suspended` and `answers Suspended every
  caller waiting, and gives each its reply on a retry once resumed`, in
  [`src/machine.test.ts`](../../src/machine.test.ts), and on the runtime by `a reading its meter dies on is not
  acknowledged, and the fix applies it once`, in [`examples/stream/feed.test.ts`](../../examples/stream/feed.test.ts).
- That an item sent again after `Full` is applied once, when the entity has room: **tested** by `a send past the bound
  of its entity’s callers is answered Full, stores nothing, and is warned of once (decision 0147)`, in
  [`src/runtime.test.ts`](../../src/runtime.test.ts).
- That a request sent again after its `keep` is applied again, which makes the rule of the `keep` needed: **tested**
  by `a retry within the keep its boundary gives is answered from storage, and one after it is applied again`, in
  [`src/runtime.test.ts`](../../src/runtime.test.ts). That a state which keeps the last offset holds the source's
  items given again after the `keep`: **tested** by `readings the source gives again are counted once, after the keep
  too`, in [`examples/stream/feed.test.ts`](../../examples/stream/feed.test.ts).
- That a caller's message sent again after a discard is a new request, which the entity dies on again: **tested** by
  `an inbound message the entity died on is discarded, with no reply stored`, in
  [`src/machine.test.ts`](../../src/machine.test.ts), and on the runtime by `a discard alone does not get the feed
  past a reading its meter dies on`, in [`examples/stream/feed.test.ts`](../../examples/stream/feed.test.ts).
- That another message under a request id answered before is answered `Reused`, and applies nothing: **tested** by the
  tests of [decision 0269](0269-a-callers-request-is-its-sender-its-id-and-what-it-carries.md), and for a stream by `a
  reading under an offset given before to another reading stops the feed, unacknowledged`, in
  [`examples/stream/feed.test.ts`](../../examples/stream/feed.test.ts).
- That a source gives an item again until it is acknowledged: **chosen** by the note, as the source the rule is for.
  A source that gives each item once, as a socket that keeps nothing, loses an item at a crash whatever the boundary
  does. The decision leaves it out, and the [open question](../open-questions.md#programs) A source that gives each
  item once holds it.
- That the boundary's order and its queue of items put aside are the boundary's to choose: **chosen** by the
  maintainer, on 2026-11-12.
- That the rule is a contract on the boundary, which the library does not check: **chosen** by the note. The library
  sees a `send`, never the acknowledgement that follows, as it never sees how decision 0127's request id is derived.

## Alternatives

- **Queueing in the entity a message that arrives while it is suspended.** The source's own durable buffer would move
  into the entity's mailbox, which would grow for as long as the suspension lasts, and `Full` and `NotFound` would
  still store nothing. Decision 0023 refused it, and the source is already the queue.
- **A helper of the library, as `deliver(handle, item)`, that sends again after `Suspended` and `Full`.** It would
  hold only the wait, and leave every choice above to the boundary. A helper that returns once an answer is stored
  hides a suspension behind a wait with no end. It adds to the public surface before the release, for no rule the
  library can then check.
- **Acknowledging after `NotFound`, as a message to no entity.** A boundary that will create the entity would lose
  the item. Only the boundary knows which it is.

## Consequences

- Nothing in `src/` changes. The paragraph on streams of [`docs/design.md`](../design.md) says the rule.
- [`examples/stream`](../../examples/stream) feeds meters from a log of offsets. Its tests hold each answer of the
  rule on the runtime: a reading given again after the `keep`, a meter suspended and fixed, a discard that does not
  get the feed past a reading, and an offset given to another reading.
