# 0100. A rejection's reason is kept as long as a reply of its version is stored

**Status:** accepted, 2026-10-31. Corrects a consequence of
[decision 0036](0036-a-migration-is-a-function-on-the-json.md): a reply is not kept for ever, only a caller's is; its
decision stands.

## Context

Decision 0036 says that "a rejection's reason is kept as long as its reply, which is for ever, so its migrations are
kept as long". The review of 0031 to 0045 found that it was not so when it was written: a reply to another entity's
work is kept while the work that asked is stored, and is deleted with it
([decision 0021](0021-a-reply-is-kept-while-the-work-that-asked-holds.md), and on Cluster
[decision 0090](../0090-on-cluster-a-reply-is-deleted-as-on-one-process.md)). Only a caller's reply is kept for ever,
which is an [open question](../../open-questions.md#running).

## Decision

- **A rejection's reason is kept as long as the reply that carries it**: a caller's for ever, while
  [callers' stored replies](../../open-questions.md#running) are; an entity's until the work that asked ends.
- **The migrations of `rejection` are kept as long as a reply of a version they read is stored.** While a caller's
  reply is kept for ever, that is for ever, as it is for every migration
  ([migrations that never leave](../../open-questions.md#storage-and-reading)). What 0036 concludes is unchanged.

## What it rests on

- A reply to an entity's work goes with that work: **tested**, by `the work that ended takes the replies to its
  requests with it, and no others` and `a reply asked by work that no longer holds goes as it is stored, and one whose
  work holds is kept`, in [`src/storage.test.ts`](../../../src/storage.test.ts).
- A caller's reply is kept for ever: **documented**, in [`open-questions.md`](../../open-questions.md#running); nothing
  of the runtime deletes one.

## Alternatives

- **Leaving 0036 as it is.** Its conclusion holds, but a reader who decides how long a caller's reply is kept would
  take an entity's to be kept for ever too, and its reasons with it.

## Consequences

- How long a caller's reply is kept stays open, and with it how long the migrations of `rejection` are needed.
