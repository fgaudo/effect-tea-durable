# 0121. A read answers from the row of the read model

**Status:** accepted, 2026-11-04. Decides the open question on reading with a program that dies on the state.

## Context

`read` called the program's `project` on the stored state, outside the machine. It took the state of the machine
where the process held the entity, and loaded all that is stored of it otherwise: its state, its keys and its
mailbox, to read its state alone.

A new program whose `project` dies on a stored state then gave the reader a defect. The same program activating
the entity suspends it instead, as
[decision 0020](archive/0020-a-new-program-is-checked-against-the-stored-work.md) decides, and a step whose next
state `project` dies on suspends it too. So a defect of the program reached a caller who sent nothing, and only
when that caller read.

A row of the read model already holds what callers read of each entity. It is written in the transaction of every
event that changes the state, creation included, with the projection the program deployed computed
([decision 0032](archive/0032-a-projection-is-a-row.md)). `query` reads it, through the migrations of the
projection.

## Decision

- **`read` gives the projection of the entity's row in the read model**, read through the migrations and the
  schema of the projection as `query` reads it, or null where there is no row. It calls no `project`, and loads
  nothing else of the entity, whether the process holds it or not.
- A migration or a schema of the projection that dies on the row gives the reader the defect, as it gives the
  caller of `query`. Such a defect is the program's, and it reaches the reader while the entity is not suspended,
  since an activation reads no row of the read model. It lasts until a step or `reindex` writes the row again.
- A new `project` reaches what `read` gives as it reaches what `query` gives: at the entity's next event that
  changes its state, or at `reindex`.

## What it rests on

- That every event which changes an entity's state writes its row in the same transaction, creation included:
  **tested**, `the database ends where the machine ends`, in [`src/runtime.test.ts`](../../src/runtime.test.ts),
  which checks after random events and crashes that the row is the projection of the stored state. It checks it
  since this note.
- That a caller is answered only once its step has committed, so that a read after the answer finds the row the
  step wrote: **read in the code**, `apply` and `create` in [`src/runtime.ts`](../../src/runtime.ts), which commit
  before they answer. The tests that read after a `send` pass either way, so none of them holds it.
- That a read with a new program whose `project` dies is answered from the row, without a defect: **tested**, `a
  read answers from the row, with a new program whose project dies on the state`, which fails without this note.

## Alternatives

- **Activating the entity.** A read would take the entity's lock, load all of it and may start its work: a read
  would write. And the reader of a suspended entity would still have no answer.
- **Projecting the state, and the row where `project` dies.** A reader would get the new projection or the old one
  depending on what the program does with a state, and the program's defect would pass unseen.
- **Answering that the entity is suspended.** The entity is not suspended: only an event suspends it, and a read
  is none.
- **Keeping the defect.** It is what made the question.
- **Projecting the state where the row's migrations die.** It would call `project` again, on the state this note
  keeps it from, and give a reader two sources as the second alternative does.

## Consequences

- After a deploy that changes `project`, `read` gives what the rows hold, as `query` does, until a step or
  `reindex` writes them again. Before this note, `read` of an entity the process held gave the new projection, and
  `query` the old one.
- `reindex` is now the one place that calls `project` outside the machine. It dies on the first state the new
  `project` dies on, which is left in [the open questions](../open-questions.md#storage-and-reading).
- [`src/storage.ts`](../../src/storage.ts) reads one row, `projected`; [`src/runtime.ts`](../../src/runtime.ts)'s
  `read` gives it.
