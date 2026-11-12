# 0282. A caller's message offered before its request is answered is answered by that answer, and not applied

**Status:** accepted, 2026-11-12, as the fix of bug 94 of [`docs/bugs.md`](../bugs.md). It changes
[decision 0125](archive/0125-a-callers-reply-is-kept-as-long-as-its-boundary-says.md), which rested on a premise it
did not write: a retry reads the reply no later than its caller sent it. It changes
[decision 0065](archive/0065-the-machine-holds-no-replies.md): a retry offered before the answer is no longer stepped
with the reply stored. The maintainer chose it on 2026-11-12, after an opinion of a Fable 5.2 agent.

## Context

A caller's reply is kept for its `keep`, counted from the step that answers (decision 0125,
[decision 0245](0245-a-reply-is-kept-as-long-as-send-says-and-the-runtime-sweeps.md)). The step that stores a reply
also deletes its entity's replies past their time, so a reply under a `keep` of 0 is deleted by the step that writes
it. On one process, every caller is registered in the process under its request's key before its `Receive` is
offered to the entity's loop. A step's reply answers every caller registered under the key
([decision 0042](archive/0042-an-event-the-runtime-cannot-finish-crashes-its-entity.md)).

Two callers of one request may send at once. The step of the first `Receive` answers both callers. The second
`Receive` is still in the loop's queue. Its step reads the reply from the storage, at its own time, and under a short
`keep` finds none. So the message is applied twice, though both callers were answered `Accepted`. That is bug 94,
which the second reading of the premise review found. The machine's own join holds only a retry whose message is
still in the mailbox. On Cluster, [decision 0248](0248-on-cluster-a-callers-rows-are-kept-for-every-clients-poll.md)
joins a second client to the first's rows.

## Decision

- **A caller's `Receive` whose key a step replied to after its offer is not applied.** Its caller was registered
  before the offer, so the reply already reached it. The loop takes the `Receive` off its queue and skips its step.
- **The loop records each caller's `Receive` under its key as its caller is registered**, in `offers` of the loaded
  entity. Nothing between the two yields, so no reply falls between them. A step's `Replied` marks every `Receive`
  recorded under its key, in `answered`, and takes the key out. The loop takes a `Receive` out of `offers` as it takes
  it from the queue.
- **A skipped `Receive` gives its permit back and is counted as done**, as a `Receive` applied is
  ([decisions 0063](archive/0063-the-runtime-waits-for-what-it-waits-for.md),
  [0147](archive/0147-an-entity-holds-a-bounded-number-of-callers-messages.md)).
- **It holds of a caller who gave up.** A first caller interrupted after its offer leaves its `Receive` queued and no
  caller registered. A retry sent then is registered, and recorded, so the step of the first `Receive` answers it and
  marks its `Receive`. A join of the retry to a caller still registered would miss it, since none is.
- **It holds of every reply a step gives**, `Suspended` and a rejection included, since each caller marked was given
  that reply.
- **Only a caller's request is recorded.** A request of an operation is answered from a reply kept while its work
  holds ([decision 0021](archive/0021-a-reply-is-kept-while-the-work-that-asked-holds.md)), with no time.
- **A different message under the same request id has another key**, since a caller's key holds what it carries
  ([decision 0269](0269-a-callers-request-is-its-sender-its-id-and-what-it-carries.md)), so it is not skipped.
- **The rule needs no time**, and holds under any `keep`. It adds no yield, wait, lock or fork.

## What it rests on

- That two callers of one request sent at once under a `keep` of 0 have the message applied once, both answered
  `Accepted`: **tested**, by `two callers of one request at once under a keep of 0 have its message applied once`, in
  [`src/runtime.test.ts`](../../src/runtime.test.ts). It fails against the code before this note.
- That a retry sent after its first caller gave up, with the first `Receive` queued behind another message, is
  answered and applied once: **tested**, by `a retry after a caller gave up behind another message is answered by the
  first offer, and applied once`. It fails against the code before this note.
- That a skipped `Receive` gives its permit back: **tested**, by the first test, whose bound of two messages holds a
  message at its commit and takes another. It fails when the skip keeps the permit.
- That a skipped `Receive` is counted as done: **tested**, by both tests, whose `runtime.settled` waits for every
  event offered to be done.
- That a retry offered before the answer is not stepped: **tested**, by `a message that waits behind another is given
  its time as its step begins, and a retry before the answer is answered by it`, which reads the events stepped.
- That every reply to a caller's request on one process goes through a step's `Replied`: **tested** for a reply of a
  step by the tests above. A reply given by an operator's resume, to a retry in flight, is **open**: a test that
  resumes an entity whose head message has a `keep` of 0, while its caller sends again, would check it, as the
  [open question](../open-questions.md#running) A retry in flight when an operator resumes the entity says.
- That a pinned seed of the explored tests keeps its interleaving: **tested**, by `bun run test:pins`, run on the
  change.

## Alternatives

- **Join a second caller to a caller still registered, and offer nothing.** It fails a retry sent after the first
  caller gave up, since no caller is registered then while the first `Receive` is still queued. The Fable 5.2 agent
  reproduced the double application on that case. A caller joined so would also pass the bound of decision 0147.
- **Keep a reply, for the runtime's reading, for a least time beside its `keep`**, as decision 0248 keeps Cluster's
  rows. It holds by a margin, which a long mailbox outlasts.
- **Refuse a `keep` below a least one.** A retry that waits behind a slow step outlasts any least `keep`, and the
  tests of decision 0245 rely on a `keep` of 0.
- **A module of Effect.** `Cache` shares lookups made at once, but the answer here comes from the entity's step and
  its commit, not from a lookup. The process's map of callers is already the join of the callers.

## Consequences

- `offers` and `answered` of `Loaded`, in [`src/runtime/process.ts`](../../src/runtime/process.ts), hold the
  callers' `Receive` offered. `ask` of [`src/runtime/callers.ts`](../../src/runtime/callers.ts) records each, and
  `perform` and `steps` of [`src/runtime/loop.ts`](../../src/runtime/loop.ts) mark and skip them.
- A retry sent after the answer, within its `keep` but stepped past it, is not held by this rule. It is the
  [open question](../open-questions.md#running) A retry that waits in the runtime past its reply's `keep`.
- Cluster keeps decision 0248.
