# 0010. A rejection may carry a reason, an acceptance never carries data

**Status:** accepted, 2026-10-30.

## Context

A reply said only `Accepted` or `Rejected`, and a caller read everything else in the projection. An entity
reads another's projection through no API, so the booking could not tell its customer whether the event was sold
out or its sales were closed: both were `Unavailable`.

The receiver's projection after the step does hold the answer (`open`, `available`), but a sender would have
to work out the reason from it, writing again the conditions of the receiver's `update`.

## Decision

- A program declares a `rejection` schema. `update` returns `reject`, with no reason, or `rejectWith(reason)`.
  The reply is `Rejected`, with the reason or null, and it is stored with the message, so that a retry gets the
  same reason.
- An acceptance carries nothing. What a caller needs to know once a message is accepted is in the state, and so
  in the projection.
- The runtime answers `NotFound` for an entity that does not exist. It is not stored: a retry once the entity
  exists is applied.
- A caller outside gets `Suspended` from a suspended entity, not stored either, and retries. `send` waits
  instead: an operation can do nothing with the answer but try again, and its entity waits with it.

## Alternatives

- **No reason, everything in the projection.** The projection says what may be done now, not why a request did
  not pass, and an entity cannot read another's.
- **The projection after the step, with every reply.** It needs no declaration, and is consistent, since it is
  read in the step's transaction. But the sender guesses the reason from it, and the stored replies grow with
  the projection.
- **A reason on every rejection.** Most rejections are for requests a caller should not make (a second click, a
  sender who may not); a reason for each would be noise.
- **Data with an acceptance.** `update` would compute an output beside the state, and the state would no longer
  be everything that matters.
- **`send` answering `Suspended`.** Every operation that sends would write the same retry.

## Consequences

- The booking's `Cancelled` says `SoldOut`, `SalesClosed` or `NoSuchEvent`.
- Reasons are stored data, with stored replies: their schema migrates as a state's does.
- A bare rejection where the protocol expects a reason is a defect in the sender, as any reply the protocol
  rules out ([decision 0009](0009-entities-talk-through-operations.md)).
- What a caller of a suspended entity gets, left open by [decision 0006](0006-a-defect-suspends-the-entity.md),
  is decided here. How an operator sees, resumes and discards stays open.
