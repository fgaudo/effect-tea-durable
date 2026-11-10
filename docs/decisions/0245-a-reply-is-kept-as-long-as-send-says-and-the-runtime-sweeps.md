# 0245. A reply is kept as long as `send` says, and the runtime sweeps what no reader needs

**Status:** proposed, 2026-11-10, for the step The runtime's housekeeping of the [roadmap](../roadmap.md). Changes
[decision 0125](archive/0125-a-callers-reply-is-kept-as-long-as-its-boundary-says.md): `keep` is required, and the
alternative of a fiber that sweeps is taken. Changes
[decision 0171](archive/0171-on-cluster-a-callers-rows-go-once-its-client-has-the-answer-and-its-time-is-past.md) for a
creation's rows on Cluster, and [decision 0223](0223-a-disk-that-is-really-full.md) for a prune in batches. Decides the
open question A request without a sender.

## Context

A caller's reply sent without `keep` is kept for ever, so the replies of a deployment grow without bound by default
(decision 0125). `expire` and `prune` are an operator's calls, and a deployment whose operator runs neither keeps
every reply and every row of the log. A step deletes its own entity's replies past their time, so the rows left are
those of entities that take no step.

Effect 4.1.3 adds a retention of completed requests to Cluster, `MessageStorage.deleteProcessed` and
`MessageRetention.make` ([`cluster.md`](../cluster.md#the-decisions-it-bears-on)). It deletes every request of an
entity type whose final reply is older than a time, whatever the work that asked. The runtime keeps an operation's
request ids while its work holds ([decision 0169](archive/0169-on-cluster-an-operations-request-ids-are-kept-under-its-work-and-deleted-with-it.md)),
and a caller's rows until its client has the answer (decision 0171). The door's entity type holds both kinds of
rows.

A program that has no sender has the sender `null`, and every `create` and `send` of it still passes `sender: null`
([decision 0196](0196-the-quick-start-is-an-example-the-readme-shows-whole.md)).

## Decision

- **`send` requires `keep`, as `{ millis }` or `'forever'`.** Only the boundary knows how long its protocol retries
  for, so a default would be a guess. A default of a day would apply a retry after a day a second time, in silence.
  `'forever'` keeps the reply as a `send` without `keep` did. A `keep` that is neither is the caller's defect, and
  reaches no entity (decision 0053). On Cluster, `'forever'` keeps Cluster's rows of the request for ever too.
- **A request leaves out a sender that is `null`.** Where the program's sender is `null`, the request of `create`
  and of `send` takes no `sender`, and the rehearsal's `send` takes none. A program with a sender still passes it.
- **`create` takes its flags in the request, and leaves out flags that are `null`.** `create(id, flags, request)`
  becomes `create(id, { flags, requestId, sender })`. A flags argument between the id and the request could not be
  left out without a second signature, so the flags move into the request, where they are left out as the sender
  is. A program with flags still passes them. The rehearsal's own flags, given to `rehearse`, are not changed.
- **The runtime sweeps at an interval.** `launch` takes `sweep`, `{ millis, prune?: false }` or `'none'`, every
  300 000 ms by default. Each sweep runs `expire`, then `prune` unless `prune` is `false`, for every program
  deployed. A sweep that fails logs a warning with its cause, and the next one runs at the next interval. The
  deployment goes on.
- **On Cluster, one runner sweeps a program.** The sweep of a program is a singleton of Cluster, so runners do not
  contend for the same rows. Where two runners give different `sweep` options, the singleton's holder sweeps by its
  own.
- **A topic no consumer is stored for keeps no rows under a sweep.** A prune drops such a topic whole
  ([decision 0152](archive/0152-the-consumers-of-a-topic-are-declared-at-deploy.md)). A deployment that wants the
  history of a topic declares its consumer before the topic's first step, or launches with `prune: false`.
- **`prune` and `expire` delete in batches.** Each deletes at most a batch of rows in one transaction, and repeats
  until a batch deletes fewer. The count it gives is the sum of its batches. A batch keeps what decision 0039 and
  decision 0171 need: the cursors are read in the batch's transaction, and Cluster's rows under an id go with the id.
  A short transaction holds SQLite's one writer for less time, so a sweep does not stall the steps.
- **On Cluster, a creation's rows go once its client has the answer.** The client keeps the Cluster id of a
  creation in `given_requests`, with the time it keeps it, as a `keep` of 0 does, and `expire` deletes the rows under
  it. A retry of the creation then reaches the door again, and the machine answers `Created` from the entity's row
  ([decision 0017](archive/0017-creation-in-the-machine.md)).
- **The runtime calls neither `deleteProcessed` nor `MessageRetention`.** Neither can spare an operation's request
  ids kept under its work, nor a caller's rows its client has not read.
- **`forget` stays an operator's call.** A consumer that stalls still holds the log under any sweep, and
  `consumers` shows it (decision 0224).

## What it rests on

- That only the boundary knows how long its callers retry for: **only reasoned**, as decision 0125 says.
- That a sweep frees what the steps leave and changes no answer, since no reply is read past its time and no row a
  stored consumer has not read is pruned: **tested**, by the tests of `expire` and `prune` in
  [`src/storage.test.ts`](../../src/storage.test.ts). A test of the sweep is still to write.
- That a prune in batches needs less free room on a full volume than one prune: **not seen**. It depends on a
  checkpoint of the WAL between batches, which a reader can hold back. `spikes/full-volume.test.ts` is to check it
  before the design says it.
- That a singleton of Cluster has one active owner, the runner that holds its shard: **documented**, in the JSDoc of
  the module `cluster/Singleton.ts`, which wraps `Sharding.registerSingleton`. Two runners that sweep at once while
  the shard moves lose nothing, since both delete the same rows past their time, so the sweep does not rest on it
  for its data, only for its cost.
- That a retry of a creation whose Cluster rows are gone is answered `Created`: **only reasoned**, from decision
  0017. A test on Cluster is still to write.

## Alternatives

- **`create`'s flags left positional, and written `null`.** Fable 5.2, asked by the maintainer, advised it while
  the signature stays as it was; the maintainer chose to move the flags into the request instead.
- **A default `keep` of a day.** It ends the growth without a change to every call, but a late retry is applied
  twice without the boundary having chosen it.
- **A sweep left off by default.** A deployment whose operator does not know of it grows as before.
- **Every runner sweeps.** Simpler, but the runners contend for the same rows, and `expire` is one statement over a
  whole program.
- **Cluster's `MessageRetention`.** It deletes rows the runtime still needs, and is a module of Effect the library
  does not use yet.

## Consequences

- Every `send` of the examples, the guide and the tests gives `keep`, and every `create` gives its flags in the
  request. The quick start and the examples of a program without a sender or flags leave them out.
- `launch` gains `sweep`. The shared launcher of the runtime's tests passes `'none'`, except in the tests of the
  sweep, so that the sweep's fiber moves no schedule of the explored tests.
- SQLite gives no room back to the volume once rows are deleted: a sweep bounds the growth of the file and shrinks
  nothing. A vacuum is the launcher's.
- A row already stored with no time stays for ever. No deployment holds one before the release.
