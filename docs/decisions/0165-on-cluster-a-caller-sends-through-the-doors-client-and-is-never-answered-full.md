# 0165. On Cluster, a caller sends through the door's client, and is never answered `Full`

**Status:** proposed, 2026-11-07, for the step Effect Cluster of the roadmap. Says how
[decision 0085](0085-on-cluster-a-request-is-keyed-and-answered-as-on-one-process.md) is code for a caller's request.
Changes how [decision 0147](0147-an-entity-holds-a-bounded-number-of-callers-messages.md) holds on Cluster: a caller
is never answered `Full` there. Changes how [decision 0125](0125-a-callers-reply-is-kept-as-long-as-its-boundary-says.md)
holds on Cluster: Cluster's rows of a caller's request go once its client has the answer and its time is past, by
[decision 0171](0171-on-cluster-a-callers-rows-go-once-its-client-has-the-answer-and-its-time-is-past.md).

## Context

On Cluster, a program's entity is a door with two persisted RPCs, for a creation and for a message
([decision 0085](0085-on-cluster-a-request-is-keyed-and-answered-as-on-one-process.md)). The door's handler steps the
request in Cluster's transaction ([decision 0161](0161-on-cluster-a-step-settles-the-machine-by-the-count-of-the-steps-that-wrote-it.md)).
Until this note, a handle's `create` and `send` died on Cluster. A request sent in the process would take the
entity's lock and read the database outside a transaction, which a door's step waits on (decision 0161).

Four things in Cluster's source at 4.1.2 bear on a caller's request:
- a door's handler is given Cluster's `requestId` with the request;
- a request answered `Suspended` or `NotFound` is reset as `ClusterWorkflowEngine` resets an activity: its id read by
  `MessageStorage.requestIdForPrimaryKey`, its latest reply by `repliesForUnfiltered`, then `Sharding.reset` with that
  reply as `expectedReplyId`;
- a caller's `keep` ([decision 0125](0125-a-callers-reply-is-kept-as-long-as-its-boundary-says.md)) was not in the
  door's payload, which held the version, the request and the message;
- Cluster answers a retry within a version from the reply it saved, before any step runs.

Cluster's client saves a persisted request in Cluster's table before it tells the runner that holds the shard
(`sendOutgoing` in `cluster/Sharding.ts`). A runner whose mailbox for the entity is full leaves the request in that
table, and reads it again once the mailbox has room (`resumeEntityFromStorage`). A door's step takes none of the
permits that bound an entity's callers' messages on one process
([decision 0147](0147-an-entity-holds-a-bounded-number-of-callers-messages.md)).

## Decision

- **A caller's `create` and `send` on Cluster go through Cluster's client of the door**, from whatever runner the
  caller is on. The handle checks and encodes what it is given as on one process, and a value that does not encode
  is the caller's defect, and reaches no door. The payload is the version of the program the caller's runner
  deploys, the request's `requestKey`, and the message or the flags as JSON. What the step answers is decoded from
  the door's text ([decision 0160](0160-on-cluster-a-door-answers-as-text-and-a-creation-the-program-dies-on-waits-for-a-fix.md)).
  A failure of Cluster's client or of its storage is a defect, as a failure of the runtime's own storage is.
- **A caller's `keep` is in the payload, outside the primary key.** The door's step gives it to the message's
  arrival, as on one process. A retry with another `keep` is the same request, as it is to the machine.
- **A message answered `Suspended` or `NotFound` is reset once and sent again, and the second answer is given**, as
  decision 0085 decides. The client reads the request's id by its primary key and the latest reply by that id, and
  calls `Sharding.reset` with that reply as the one expected, only while that reply is still `Suspended` or
  `NotFound`. A concurrent retry under the same request id may have reset the reply and stored a step's reply
  since, and a reset of that reply would apply the message again once its `keep` is past. The result of the reset is not read
  ([decision 0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md)). A creation is not
  reset: both its answers are replies.
- **On Cluster a caller is never answered `Full`.** A caller's message is saved in Cluster's table before any
  runner reads it, and waits there while the entity's mailbox is full. The caller waits with it, for as long as it
  chooses: a caller that stops waiting leaves its request to be handled
  ([decision 0091](0091-on-cluster-an-interrupted-caller-leaves-its-request-alone.md)). What bounds the messages
  in memory there is Cluster's `mailboxCapacity`.
- **Cluster's rows of a caller's request go once its client has the answer and its time is past**, as
  [decision 0171](0171-on-cluster-a-callers-rows-go-once-its-client-has-the-answer-and-its-time-is-past.md) decides.
  A reply without `keep` is kept for ever, and so are its rows in Cluster's tables.
- **An operation's request and an operator's still die on Cluster.** They go through the door's client too, as
  decisions 0085, 0090 and 0092 decide, in a later part of the step.

## What it rests on

- Cluster's client saves a persisted request in Cluster's table before a runner reads it: **read in the source**,
  `sendOutgoing` of `cluster/Sharding.ts` at 4.1.2. The tests of `src/cluster.test.ts` in which a caller sends
  through the door run that path.
- A request reset with its latest reply as the one expected, and sent again, is handled again: **tested**, by
  `a message answered NotFound is handled when it is sent again, once its entity is created` in
  [`src/cluster.test.ts`](../../src/cluster.test.ts), which fails without the reset.
- A latest reply that is no longer `Suspended` or `NotFound` is a step's reply, stored after the reset of a
  concurrent retry: **only reasoned**. A test in which eight retries reset the same `NotFound` together, with a
  `keep` of 0, passes without the check too, so no test reaches the interleaving yet.
- A request left in Cluster's table by a full mailbox is read again once the mailbox has room: **read in the
  source**, `resumeEntityFromStorage` of `cluster/Sharding.ts` at 4.1.2. No test fills Cluster's mailbox, whose
  default is 4096 messages.
- `Schema.optionalKey` leaves a field out of the type and of the encoding where it is absent: **documented**, in its
  JSDoc at 4.1.2, `@stability stable`. A message sent without `keep` is **tested**, by
  `a caller’s keep reaches the door, and its reply is kept until the time it gives`.
- `Sharding.makeClient` gives a client Cluster keeps for the entity, and does not build one per call: **read in the
  source**, the `ResourceMap` `clients` of `cluster/Sharding.ts`.
- That a caller who waits for a busy entity is served better than one answered `Full`: **only reasoned**. A caller
  that wants a bound sets a timeout on its wait.

## Alternatives

Effect's modules weighed, in `node_modules/effect/src` at 4.1.2:
- **`Entity.client` of the door**, which the tests use. It gives the same client from `Sharding.makeClient`, and
  needs `Sharding` in each call's context; `onCluster` holds `Sharding` already, so it calls `makeClient` itself.
- **A cache of clients of the runtime's.** Cluster keeps one per entity in a `ResourceMap`, so the runtime adds none.
- **`ClusterWorkflowEngine`'s own reset.** Its `requestIdFor` and `replyForRequestId` are internal to the engine and
  read only `WithExit` replies. The runtime does the same three calls, and resets the latest reply only where it is
  `Suspended` or `NotFound`, as the engine resets only a `Suspended` one.
- **`Effect.retry` with a `Schedule` around the reset**, as the engine does. A reset that fails is a defect of the
  caller's `send`, and leaves the stored answer, so the caller's next retry resets it again. A schedule adds a wait to
  every failure and changes nothing a caller sees.

Other ways:
- **`keep` in the primary key.** A retry with another `keep` would be a new request to Cluster and the same one to
  the machine, which only the runtime's reply would keep one.
- **`keep` in the request's text.** The request's text is its key in the runtime's replies, and `keep` is no part of
  who sent it (decision 0125).
- **The door's step answering `Full`, from the permits of the runner that holds the entity.** The message is in
  Cluster's table before that runner reads it, and Cluster would save `Full` as the request's reply, which no retry
  within the version gets past without a reset.
- **A request sent in the process when the caller's runner holds the shard.** It would take the entity's lock outside
  a transaction (decision 0161), and give two paths, one of which no test on two runners runs.
- **No reset, and `Suspended` and `NotFound` given as Cluster stored them.** A retry once the entity is created or
  resumed would be given the stored answer for ever, within the version.

## Consequences

- A caller's message answered `Suspended` or `NotFound` costs two steps, as decision 0085 says.
- A caller on Cluster that wants a bound on its wait sets a timeout on `send`. Its message is still handled when its
  turn comes, and a retry under the same request id is given its answer.
- Until Cluster's rows of an expired reply are deleted, by a step of the entity or `Handle.expire`, a retry past
  `keep` within a version is answered from Cluster's saved reply, where on one process it is applied again.
- The door's payload has a field more. A row Cluster saved without it decodes, with no `keep`.
