# 0265. The operations that wait for a resumption are stored by the step that answers them

**Status:** accepted, 2026-11-11, with the step The bugs the premise review found, fixed by family, of the
[roadmap](../roadmap.md), as the fix of bugs 72 and 63. It changes
[decision 0114](archive/0114-an-operator-sees-the-suspended-entities-and-what-a-resume-did.md): `suspended` reads who
waits from what is stored, not from the senders registered in the process. It changes
[decision 0167](archive/0167-on-cluster-an-operation-sends-through-the-doors-client-and-is-woken-by-resumed.md): the
table `waiting` holds one row for each run and name, on every storage, and the machine says what is written in it.

## Context

`suspended` and `inspect` list, for a suspended entity, the operations of other entities whose `send` waits for its
resumption. Decision 0114 read every other field of the list from storage, so that an entity this process does not
hold is listed too. It read who waits from `p.resumptions`, the senders registered in the memory of the process. It
held that the registrations are whole once a restarted process is settled, since every operation under way sends
again.

That premise fell twice. A suspended entity's operations run on through its suspension
([decision 0113](archive/0113-a-suspended-entitys-operations-run-to-their-end.md)), a `Restart` keeps none of them,
and a process starts no suspended entity
([decision 0071](archive/0071-a-process-starts-the-entities-with-a-message.md)). So the operation of a suspended
sender was listed until the process stopped, and not after a restart, though nothing stored had changed. That is bug
72. On Cluster, an operator may act from any runner
([decision 0166](archive/0166-on-cluster-an-operator-resumes-and-discards-through-the-doors-client.md)), and the
runner called listed only the senders registered in its own memory. That is bug 63.

An operator reads the list to decide between `resume` and `discard`, by what depends on the entity. What depends on
it does not change with the process that answers, nor with the time that process started. The maintainer chose on
2026-11-11, after the opinion of a Fable 5.2 agent, to store the waits on every storage.

## Decision

- **A step that answers an operation `Suspended` stores its wait, in the step's own transaction.** The machine
  writes the wait in the step's `Written`: the sender's run, its entity, key and incarnation, and the name the
  operation sent under. An operation's message to a suspended entity is answered so, and so is an operation's message
  queued in the mailbox when the entity suspends. A caller's request stores no wait. A wait answered twice is stored
  once.
- **The step that takes the entity out of its suspension deletes its waits**, an operator's `resume` or `discard` that
  activates the entity again. The machine says so in the step's `Written`, and the write deletes the rows in the
  same transaction. On Cluster the door reads the waiting entities before the step, and tells each one `Resumed`
  from that transaction, as decision 0167 says.
- **`suspended` and `inspect` read the waits from storage**, with the entity's rows, from one snapshot. A wait is
  listed while the run that sent it holds: the sender's entity still stores the key at that incarnation. A wait whose
  run ended, or was restarted under another incarnation, is left out, and its row goes with the suspension. The waits
  are listed by the sender's entity, then by its key and incarnation, then by the name.
- **The memory of the process keeps the senders to wake, and nothing else.** `p.resumptions` holds a set of
  `Deferred` for each receiver, as a register for the wake-up decision 0063 decides, and `suspended` reads none of it.

So the list holds the operation of a suspended sender after a restart, and an operator on any runner of Cluster sees
the operations of every runner.

## What it rests on

- That a step answering an operation `Suspended` writes its wait, that a caller's request writes none, that an
  operation queued when the entity suspends writes one, and that the resumption says the waits go: **tested** by the
  tests of `the operations a suspended entity answers`, in [`src/machine.test.ts`](../../src/machine.test.ts).
- That the storage lists the waits whose run holds, stores a wait answered twice once, leaves out a run restarted or
  ended, and deletes every wait when the suspension ends: **tested** by `a suspended entity lists the stored waits
  whose run holds, and its resumption deletes them`, in [`src/storage.test.ts`](../../src/storage.test.ts), on SQLite
  and on PGlite.
- That the operation of a suspended sender is listed after a restart: **tested** by `after a restart, a suspended
  entity lists the operation of a suspended sender that waits for it`, in
  [`src/runtime.test.ts`](../../src/runtime.test.ts). It fails against the code before the change.
- That an operator on any runner of Cluster sees the operation of another runner that waits: **tested** by `an
  operator on any runner sees the operation of another runner that waits for a resumption`, in
  [`src/cluster.test.ts`](../../src/cluster.test.ts), under `bun run test:slow`. It fails against the code before the
  change.
- That a resumption on Cluster still tells the waiting entities, and leaves no row: **tested** by the tests of
  `src/cluster.test.ts` that count the rows of `effecttea_waiting` after a discard, unchanged by this note.
- That the wait is written by the step that answers `Suspended`, so that no resumption commits between the answer
  and the wait, and none leaves a row behind: **tested** by the tests of `the operations a suspended entity
  answers`, which find the wait in that step's `Written`. The runtime writes a step's `Written` in one transaction,
  on one process and on Cluster, as [decision 0028](archive/0028-rules-the-runtime-settled.md) says.
- That an operator should see who waits whatever process answers, at the cost of a write per wait: **chosen**, by
  the maintainer.

Of the premises of decision 0114, the one that the registered senders are the ones waiting no longer holds a rule:
the registrations wake senders, and the list is read from storage. The premise that the time of a suspension is kept
while the entity stays suspended is not touched. Of the premises of decision 0167, the one that `DELETE … RETURNING`
gives the rows it deletes is no longer needed, since the door reads the rows before the step deletes them. The
premise that a `Resumed` lost to a sender whose shard moved costs nothing still holds, since this note changes
nothing of what a sender does once woken.

The decision leaves out an operation that, run again, sends to another entity under the same incarnation. Its row
stays listed under the first receiver until that receiver's suspension ends. That case is an
[open question](../open-questions.md#running).

## Alternatives

- **A note that narrows 0114 to the operations that run.** It is true on one process: the list is what moves if
  the entity is resumed now. On Cluster the rows of `waiting` outlive a sender's restart, so the two backends would
  answer differently, or every runner would be asked in turn. An operator would also lose, at each restart, that an
  entity waits for another.
- **A restarted process starts the operations of suspended entities too.** It would run the program deployed against
  a state that only `resume` may activate, a resume nobody decided. It cannot reach an entity suspended on its
  activation, and it runs again the operation an entity died in.
- **A cleanup of the rows of runs that ended, in the step that ends them.** The reading leaves those rows out, and
  the suspension's end deletes them, so a second deletion would be a second rule for the same rows.

## Consequences

- [`src/machine.ts`](../../src/machine.ts): `Written` has `waits` and `woken`, computed by `step` from the outputs
  and from the suspension before and after.
- [`src/storage/tables.ts`](../../src/storage/tables.ts): `effecttea_waiting` has the sender's key, parameter,
  incarnation and the request's name, in its key. No release holds the table, so the first migration changes.
- [`src/storage/entities.ts`](../../src/storage/entities.ts): the write stores and deletes the waits, and
  `suspended` and `inspect` read them.
- [`src/storage/cluster.ts`](../../src/storage/cluster.ts): `wait` is gone, and `waiters` reads the waiting entities,
  each once, without deleting them.
- [`src/runtime/doors.ts`](../../src/runtime/doors.ts): the door reads the waiting entities before an operator's step.
- [`src/runtime.ts`](../../src/runtime.ts) and [`src/runtime/callers.ts`](../../src/runtime/callers.ts): `suspended`
  and `inspect` give what the storage reads, and `waitingFor` is gone.
- Bugs 72 and 63 of the roadmap are fixed, and the open question Who an operator sees waiting leaves
  `docs/open-questions.md`.
