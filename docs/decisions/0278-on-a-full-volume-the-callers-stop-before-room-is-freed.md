# 0278. On a full volume the callers stop before an operator frees room

**Status:** accepted, 2026-11-12, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the fix of bug 50. It changes
[decision 0223](0223-a-disk-that-is-really-full.md): the operator stops the callers before freeing room on the
volume, and frees room for the steps the runtime takes of its own too. The maintainer chose it on 2026-11-12, after an
opinion of a Fable 5.2 agent.

## Context

Decision 0223 says what an operator does on a disk that is really full, under a file of SQLite in WAL mode. The
operator frees room on the volume, deploys without the consumer that stalled, forgets it and prunes. Its spike ran
no step beside that procedure.

The second test of [`spikes/full-volume.test.ts`](../../spikes/full-volume.test.ts) runs three callers that retry
their steps while the room is freed, on the CI's volume of 32 MB. In the job `postgres` of the pushes of `2ed276b` and
`78b4063`, the callers took the 1 MB freed within a second, with 95 and 50 steps of about 16 KB each. The forget
then committed, and the prune failed with `database or disk is full`. That is bug 50 of the roadmap.

A prune deletes 256 rows a batch ([decision 0245](0245-a-reply-is-kept-as-long-as-send-says-and-the-runtime-sweeps.md)),
which is about 4 MB of pages there, and a step needs about 16 KB. The Fable 5.2 agent's opinion judged that a smaller
batch would not hold the case. A one-row batch fits only in what the WAL has left, which a step that failed may have
used. No spike has tried it.

## Decision

- **On a disk that is really full, the operator stops the callers first.** The procedure is: stop the callers, free
  room on the volume, deploy without the consumer that stalled, forget it, prune, and let the callers in again. The
  callers of a file of SQLite are the launcher's own: only the launcher's boundary calls `send` and `create`, so
  closing that boundary is the operator's, and the runtime adds no call for it.
- **The room freed holds the steps the runtime takes of its own as well.** Stopping the callers does not stop the
  runtime: at its launch, it fires the timers due, runs the operations stored, and retries the steps a crash took
  out ([decision 0252](0252-the-waker-activates-an-entity-a-crash-took-out-after-the-retry.md)). Those steps are as
  many as the work stored, not as many as callers retry, so the operator frees room for them beside the prune.
- **The runtime keeps no room of its own still,** as decision 0223 says.

## What it rests on

- That callers retrying take the room freed before the forget and the prune, and the prune then fails: **seen**, by
  `the room freed on a full volume, beside the steps callers retry` in `spikes/full-volume.test.ts`, in the CI's job
  `postgres`.
- That with the callers stopped, 1 MB freed holds the forget and a prune of about 1200 rows of 16 KB: **seen**, by the
  same test, whose callers stop before a second megabyte is freed, and by the first test of the spike.
- That the steps the runtime takes of its own after its launch take part of the room freed, and the forget and the
  prune commit beside them: **seen**, by `the room freed on a full volume, beside the timers the runtime fires` in the
  same spike. Thirty timers due fired on the full volume, then committed within a second of 1 MB freed, which took
  about 400 KB, and the prune of about 1200 rows committed.
- That only the launcher's boundary calls `send` and `create` on a file of SQLite, so the operator can stop every
  caller: **chosen**, by the maintainer. A launcher whose callers the operator cannot stop is left out, and so is a
  file of SQLite under Cluster, whose runners send to each other.
- That the room a prune needs grows with what it deletes, and the room the runtime's own steps need with the work
  stored: **open**. The spike tried one size of each. A spike that frees less room with more work due, on the CI's
  volume, would check it. The Fable 5.2 agent's opinion gives a bound to try, the WAL's size plus one batch.
- That a database of PostgreSQL that fills its disk is the server's operator's: **chosen**, by decision 0223, which
  this note does not change.

The premises of decision 0223 read again: that a step on a full volume dies and the readings and acks still answer,
and that a forget commits there and a prune of many rows does not, still hold, seen by the first test of the spike on
every push. Its premise that a prune commits once some room is freed holds only with the callers stopped, which this
note adds. Its premise that the room a prune needs grows with what it deletes stays open, as above.

## Alternatives

- **A prune that halves its batch on a full volume, down to one row.** It changes little code, but the opinion judged
  that it fails in the state the CI saw, and no spike has seen it hold. It may harden the prune once a checkpoint has
  run, and is left for a spike.
- **The operator frees more room.** The callers take whatever is freed: 50 to 95 steps a second here.
- **The runtime refuses steps after a disk is full, until a prune commits.** It is a rule of the machine, with tests
  and state across runners, for an operator's rare day.
- **The whole prune in one transaction that shuts the steps out.** The WAL grows with the whole prune, and it undoes
  the short transactions of decision 0245.
- **A checkpoint that truncates the WAL before the prune.** It gives the callers the WAL's room to take as well.

## Consequences

- The design says, under Declared consumers, that the operator stops the callers before freeing room, and frees room
  for the work stored as well.
- The CI runs the three tests of `spikes/full-volume.test.ts` on every push, so that a release of Effect or of Bun
  that changes what a full volume does fails the spike.
