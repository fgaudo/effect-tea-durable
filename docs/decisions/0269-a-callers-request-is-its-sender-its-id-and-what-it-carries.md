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
- **An operation's request is still found by its run and the name it gave, and is not compared.** A run of an
  operation after a crash builds its messages again, and may build one otherwise, from a service it reads again. The
  first message the receiver applied stands, and the run is given its reply
  ([decision 0253](0253-an-answer-no-entity-stores-is-kept-for-the-operation-that-was-given-it.md)). An operation that
  sends twice under one name in one run already dies
  ([decision 0047](archive/0047-a-request-of-an-operation-has-a-name.md)).

## What it rests on

- That a message or flags of one value encode to one text, across sends and processes, so that a real retry is never
  answered `Reused`: to be **tested** before any other code, by a test of `src/machine.test.ts` that encodes a message
  with an optional key left out and given as `undefined`, a message whose schema transforms, and flags of the same
  forms, and compares the texts. `Machine.requestKey` writes the fields of each object in order, and the test checks
  that the encoding of a message does the same.
- That Cluster delivers to the door a second request under one sender and request id, when its message differs, once
  the message's text is part of the primary key: to be **tested** by a test of `src/cluster.test.ts`, with a second
  client on another runner, before the code of Cluster changes. A reading of `src/cluster.ts` gives that Cluster
  deduplicates by `primaryKey` before the door runs, so the key must hold the message.
- That a retry after a deploy that migrates `inbound`, or `flags`, compares equal to the reply the older version
  stored: to be **tested** by a test of `src/runtime.test.ts` on each storage, which stores a reply at version 1,
  deploys a version 2 whose migration changes the message's form, and retries. The same test of `src/rehearse.ts`
  decides bug 5, since a rehearsal keys its replies by the request's text.
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
- **The check on an operation's requests too.** A run after a crash that builds its message otherwise would be
  answered `Reused`, and every operation would handle an answer that only a crash gives.

## Consequences

- [`src/machine.ts`](../../src/machine.ts) compares what a request carries where it finds a queued or a stored request,
  and gives `Reused`. A creation compares its flags.
- [`src/storage/tables.ts`](../../src/storage/tables.ts) gives `effecttea_replies` a column for what the request
  carried, and the row of the request that created an entity holds its flags. No release holds the tables, so the
  first migration changes. [`src/storage/entities.ts`](../../src/storage/entities.ts) compares it, on every backend.
- [`src/runtime/doors.ts`](../../src/runtime/doors.ts) and [`src/runtime/callers.ts`](../../src/runtime/callers.ts)
  wait for the reply of a request and its message.
- [`src/cluster.ts`](../../src/cluster.ts) puts the message's text in the primary key of a door's requests.
- [`src/rehearse.ts`](../../src/rehearse.ts) keeps what a named request carried, and gives `Reused`.
- `Answer` and the caller's `Creation` of a `Handle` hold `Reused`. An operation's `send` and `create` never give it.
- `docs/design.md`, under Inbound messages and the rehearsal's `send`, and `docs/glossary.md`, under Request, say the
  rule. `examples/server` answers `Reused` with 422.
- The `test.failing` `a program with no sender` of `src/rehearse.test.ts` becomes two tests: a second message under a
  used id is answered `Reused` and the total stays 1, and the same message under a used id is a retry.
  `src/machine.test.ts` has a rule for a queued and a stored request, and a contract test runs the requests alike on
  each storage and on Cluster. A test sends after a reply's `keep`, and the request is applied.
