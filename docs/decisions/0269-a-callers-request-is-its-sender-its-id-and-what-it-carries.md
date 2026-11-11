# 0269. A caller's request is its sender, its request id and what it carries

**Status:** proposed, 2026-11-11, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the fix of bug 4. Once taken, it changes
[decision 0048](archive/0048-a-callers-request-belongs-to-its-sender.md): a second request under a caller's sender and
request id is a retry only where it carries the same message or flags. It changes
[decision 0124](archive/0124-the-boundary-authenticates-and-update-authorizes.md): a caller that reuses a request id
of its identity for another message is told so. It changes
[decision 0180](0180-a-program-leaves-out-what-it-does-not-have.md): a program whose sender is `null` keeps one space
of request ids for every caller, as its design now says. It changes
[decision 0200](0200-a-rehearsal-sends-under-a-request-id-the-test-names.md) and
[decision 0245](0245-a-reply-is-kept-as-long-as-send-says-and-the-runtime-sweeps.md): a rehearsal and the runtime
answer such a request `Reused`. It adds a kind, `flags`, to a program's `Migration`.

## Context

A caller's request is stored and deduplicated under its sender and its request id
([decision 0048](archive/0048-a-callers-request-belongs-to-its-sender.md)). A second request under the same sender
and request id is a retry: it is given the stored reply, and its message is not applied. The runtime never compares
what the second request carries. `Machine.requestKey` is the sender and the id. The table `effecttea_replies` holds
no message, the mailbox compares envelopes by the key alone, and Cluster deduplicates a door's requests by a primary
key made of the version and the key.

So a request that reuses an id for another message is answered with the first message's reply, and its own message is
never applied. Nothing fails. Decision 0048 named this loss between two callers, and took it away only where their
senders differ. It stays wherever the sender does not tell two requests apart:

- **A program whose sender is `null`.** [Decision 0180](0180-a-program-leaves-out-what-it-does-not-have.md) makes a
  sender left out a `Schema.Null`, so every caller of such a program shares one space of request ids. This is bug 4
  of the roadmap, reproduced by a `test.failing` of `src/rehearse.test.ts`.
- **One identity on two devices, or a client with a bug.** By
  [decision 0124](archive/0124-the-boundary-authenticates-and-update-authorizes.md) a caller keeps its ids unique
  within its identity. A caller that breaks that rule loses a message in silence.
- **A sender the schema writes alike for two callers**, as a `Schema.Literal('anyone')`.

Systems that deduplicate by a key the client chooses scope the key to the authenticated caller, and check that a
retry carries the same request. Stripe refuses a reused idempotency key whose parameters differ, the IETF draft of
the header `Idempotency-Key` answers such a request 422, and AWS answers `IdempotentParameterMismatch`. Decision 0048
is the scope. The check is what this decision adds.

## Decision

- **A caller's request is its sender, its request id and what it carries.** What a message carries is the message, as
  the program's `inbound` schema encodes it. What a creation carries is its flags, as the program's `flags` schema
  encodes it. A second request under a caller's sender and request id is a retry only if it carries the same text.
- **What a request carries is compared as it encodes, not as a value.** A value whose encoding keeps the order it was
  built in, as a set, is the same request only when it is built in the same order. A retry decoded from the same
  request off the wire is, and a caller that sends an equal set in another order sends another request, as Stripe
  compares the parameters a request was sent with.
- **A request that carries another text is answered `Reused`.** Nothing of it is applied, stored or queued, and the
  first request's reply is kept as it was. The caller's `send` and `create` of a `Handle`, and a rehearsal's `send`
  and `create`, give `Reused`. The boundary answers it as a refusal of the caller's request, such as 422 over HTTP.
  `Reused` is no defect, since a caller outside the library causes it, and a defect is the code's
  ([decision 0124](archive/0124-the-boundary-authenticates-and-update-authorizes.md)).
- **The check holds wherever a retry finds its request.** A retry finds the reply stored for the request, the message
  still queued in the mailbox, the message offered to the entity and not yet handled, and on Cluster the request
  Cluster stored. Each compares what the retry carries. A caller that waits for a reply waits for the reply of its own
  request and message, so that a request answered `Reused` is never given the first request's reply.
- **A reply's row holds what its request carried, as the version that wrote it encoded it.** It is the text, not a
  hash, so that a later version reads it through the migrations. A reply written by the version that reads it is
  compared by its text. A reply another version wrote is read through that version's migrations of `inbound` or
  `flags`, encoded by the program's schema, and compared then, as a reply's sender is read through the migrations of
  `sender` today ([decision 0069](archive/0069-a-reply-is-keyed-by-the-version-that-wrote-it.md)).
- **A program's `Migration` takes a kind `flags`**, which reads the flags a version stored with the request that
  created an entity. A kind left out is unchanged, as for every kind.
- **A reply past its time is no reply.** A request after a reply's `keep` is a new request, applied again, whatever it
  carries ([decision 0245](0245-a-reply-is-kept-as-long-as-send-says-and-the-runtime-sweeps.md)).
- **A program whose sender is `null` keeps one space of request ids for every caller.** Its boundary gives request
  ids unique across its callers, as a UUID each or an id derived from what the boundary knows of the caller. Two of
  its callers that send the same message under the same id are one request, since nothing tells them apart. Two that
  send different messages under the same id are told so by `Reused`.
- **An operation's request is still found by its run and the name it gave, and what it carries is not compared.**
  The runtime makes an operation's request from the operation's entity, key, incarnation and name, so two intents
  never share it. The one way two sends could share it, a name sent under twice to one entity in one run, is already
  the operation's defect ([decision 0047](archive/0047-a-request-of-an-operation-has-a-name.md)). A second message
  under an operation's request is therefore the same intent built again, by a run after a crash or after a deploy.
  Decision 0047 rejected this check for that reason: a message built from the clock differs after a restart, and its
  retry would be taken for a defect.
- **No answer to an operation fits a mismatch.** `Reused` would be an answer that only a crash gives, which every
  operation would handle. A defect would suspend the sender, and a resume would run the operation again into the same
  mismatch. A deploy that changes an operation's code under an incarnation it keeps
  ([decision 0022](archive/0022-a-new-program-keeps-what-work-started-with.md)) would suspend every entity whose work
  is under way.
- **An operation's reply answers the first message the receiver was given under that request.** A run after a crash
  that builds another message is given the first one's reply, `Accepted`, `Rejected` or `Created`, and the receiver
  holds the first message or the first flags alone
  ([decision 0253](0253-an-answer-no-entity-stores-is-kept-for-the-operation-that-was-given-it.md)). An operation
  whose completion reports what it sent builds the message from its stored operation value and the replies it was
  given, never from what it reads again, so that the completion says what the receiver holds. The design says so where
  it says what an operation sends. The rule concerns an idempotent operation and an at-least-once one only. An
  at-most-once operation never runs again ([decision 0011](archive/0011-an-operation-declares-what-a-crash-does.md)),
  and a droppable one acts on nothing ([decision 0128](archive/0128-an-operation-that-acts-on-nothing-may-be-dropped.md)).
- **An operation's request holds no message on Cluster or in a reply's row.** Cluster's primary key of a door's
  requests holds the message's text for a caller's request alone, and a reply to an operation's request keeps no text
  of what it carried.

## What it rests on

- That a message or flags of one value encode to one text, whatever order its fields were given in and whatever input
  a transformation was built from, and that a retry decoded from the same request encodes to the same text:
  **tested** by `what a request carries encodes to one text (decision 0269)`, in
  [`src/machine.test.ts`](../../src/machine.test.ts), with the `encode` and `ordered` of `src/program.ts` that a
  request's key is written by. The test also sees the case the rule decides otherwise: a set encodes in the order it
  was built, so an equal set built in another order is another text, and is answered `Reused`.
- That Cluster answers a request under a primary key it saved from the saved reply, and saves no envelope of it for
  the door, whatever message the request carries: **tested** by `a second message under a caller's saved request is
  answered by Cluster with the saved reply, and saved for no door`, in
  [`src/cluster.test.ts`](../../src/cluster.test.ts). The same test, run against a `primaryKey` that holds the
  message, failed on a second envelope saved, so a key that holds the message delivers the second request to the door.
  An operation's request keeps its key, so Cluster answers a run after a crash from the saved reply, as the test sees.
- That a run of an operation after a crash which sends another message under the same name is given the first
  message's reply, and that the receiver holds the first message alone: **tested** by `a run after a crash that sends
  another message under an operation's request`, in [`src/machine.test.ts`](../../src/machine.test.ts), with the
  first message handled and with it still in the mailbox, by `an at-least-once operation run again after a crash that
  sends another message under a name is given the first reply`, in
  [`src/runtime.test.ts`](../../src/runtime.test.ts), and in a rehearsal's world by `answers a run after a crash that
  builds another message or other flags with the first one's reply`, in
  [`src/rehearse.test.ts`](../../src/rehearse.test.ts). The test of the world also checks that a run which creates
  with other flags is answered `Created`, and that the entity keeps the first flags.
- That a boundary which decodes the same request off the wire under the new version gets the message the migration
  writes: **chosen** by the note. The library cannot check a boundary, and a boundary that decodes otherwise breaks a
  retry across a deploy whatever this decision says.
- That the room a reply's row takes for its message is worth the check: **chosen** by the maintainer, on 2026-11-11.
  A caller's row is kept for its `keep` alone, so the room is bounded by what callers send within their keeps.

## Alternatives

- **The contract alone.** The design would say that a program whose sender is `null` keeps one space of request ids,
  and the boundary gives ids unique across callers. It is true, and this decision says it too. Alone, it keeps the
  silent loss that decision 0048 named a bug, for every caller that breaks the rule by mistake.
- **A sender required wherever a program takes inbound messages.** `declare` would refuse a sender of `Schema.Null`
  with an `inbound` that is not `Schema.Never`. A sender written alike for every caller, and two devices of one
  identity, would keep the loss. Programs with one boundary and no identity, as `examples/quick-start`, would have to
  invent a sender.
- **A hash of the message instead of its text.** It takes less room, but no migration reads it, so a retry after a
  deploy that changes the message's form would be answered `Reused`, or the hash would be trusted across versions
  and the check would hold within a version only.
- **`Reused` as the caller's defect.** A defect is the code's, and a caller outside the library makes this one, as a
  request with a sender its schema refuses is a defect only because the boundary wrote the sender.
- **The check on an operation's requests too.** An operation's request never holds two intents, so the check would
  find only a run after a crash or a deploy that built its message otherwise. The operation would be answered
  `Reused`, which every operation would handle, or would die, and a resume would run it into the same mismatch.
  Across versions the check would also need the receiver's migration of `inbound` and the sender's new code to agree,
  which the library cannot check.

## Consequences

- [`src/machine.ts`](../../src/machine.ts) compares what a request carries where it finds a queued or a stored request,
  and gives `Reused`. A creation compares its flags.
- [`src/storage/tables.ts`](../../src/storage/tables.ts) gives `effecttea_replies` a column for what the request
  carried, and the row of the request that created an entity holds its flags. No release holds the tables, so the
  first migration changes. [`src/storage/entities.ts`](../../src/storage/entities.ts) compares it, on every backend.
- [`src/runtime/doors.ts`](../../src/runtime/doors.ts) and [`src/runtime/callers.ts`](../../src/runtime/callers.ts)
  wait for the reply of a request and its message.
- [`src/cluster.ts`](../../src/cluster.ts) puts the message's text in the primary key of a caller's request to a
  door, and keeps the primary key of an operation's request as it is.
- [`src/rehearse.ts`](../../src/rehearse.ts) keeps what a named request carried, and gives `Reused`.
- `Answer` and the caller's `Creation` of a `Handle` hold `Reused`. An operation's `send` and `create` never give it.
- `docs/design.md`, under Inbound messages and the rehearsal's `send`, and `docs/glossary.md`, under Request, say the
  rule. `docs/design.md`, under Entities that talk, says that an operation's reply answers the first message under
  its request, and that an operation builds what it reports from its stored value and its replies.
  `examples/server` answers `Reused` with 422.
- Whether a rehearsal's crash should fail a test when the run after it sends another message under a name is an
  [open question](../open-questions.md#programs). The decision leaves it out.
- A test of `src/runtime.test.ts` on each storage stores a reply at version 1, deploys a version 2 whose migration of
  `inbound` changes the message's form, and retries: the retry is given the stored reply, and a retry with another
  message is answered `Reused`. The same test of `src/rehearse.ts` decides bug 5, since a rehearsal keys its replies by
  the request's text.
- The `test.failing` `a program with no sender` of `src/rehearse.test.ts` becomes two tests: a second message under a
  used id is answered `Reused` and the total stays 1, and the same message under a used id is a retry.
  `src/machine.test.ts` has a rule for a queued and a stored request, and a contract test runs the requests alike on
  each storage and on Cluster. A test sends after a reply's `keep`, and the request is applied.
