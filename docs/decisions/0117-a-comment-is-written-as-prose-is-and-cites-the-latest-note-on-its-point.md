# 0117. A comment is written as prose is, and cites the latest note on its point

**Status:** accepted, 2026-11-03. Adds to
[decision 0105](0105-commits-prose-and-the-roadmap-are-written-for-a-reader.md) what its rule of prose does to the
comments written before it, and adds a rule to [`AGENTS.md`](../../AGENTS.md).

## Context

[Decision 0105](0105-commits-prose-and-the-roadmap-are-written-for-a-reader.md) says prose states its conclusion
first, one sentence per idea, and that this holds for comments. Nearly every comment of `src/` was written before
it, on 30 and 31 October. They are in the old style: one sentence in forty holds forty words or more, and its
conclusion comes last. The note says that the notes taken before it keep their text, and says nothing of comments.

A comment keeps a rule, and cites the note that decides it, as `decision 0029`. Nothing says what happens to the
citation when a later note changes that point: [`AGENTS.md`](../../AGENTS.md) has a note's status line grow, and
has no comment read again. Two comments cite a note for a point a later one replaced, and one names an open
question by words the question no longer has. Three sentences on the outbox's cursor are the same, word for
word, in `runtime.ts` and in `storage.ts`.

## Decision

- **A comment follows the rule of prose.** A note is a record, and keeps its text; a comment is read with the
  code, and is read now. The comments of `src/` written before decision 0105 are rewritten where a sentence holds
  more than one idea, one commit per module, and say what they said.
- **A comment cites the latest note on its point.** A commit that adds a note which changes another reads the
  comments that cite the one changed, and moves the citation where the point moved. `decision NNNN` is how a
  comment cites, so a search finds them all. A comment names an open question by its heading in
  [`open-questions.md`](../open-questions.md).
- **A rule is said once.** The comment of the surface that promises it says the contract, in `runtime.ts`; the
  comment of what keeps it, in `storage.ts`, says only what it adds.

## What it rests on

- The comments of `src/` were written before decision 0105, in the style it left: **seen**, in `git blame` by
  date, and by counting the sentences of forty words or more.
- A citation by number survives the archiving of its note: **documented**, by
  [decision 0106](0106-notes-the-design-covers-are-archived-at-each-release.md), which moves a note with its
  number unchanged.
- A rewrite that keeps what a comment says is checked by reading alone: **reasoned**. No test reads a comment,
  so each commit of the rewrite is one module, and its diff is read against the note each comment cites.

## Alternatives

- **Leaving the old comments as the old notes are left.** A note is history, which a reader goes to for why. A
  comment is what the reader of the code has in front of them, and the rule of prose was taken for that reader.
- **A script that lists the comments citing a note changed since they were written.** A search for the number
  does the same, and the commit that changes a note is the one that knows which point moved.

## Consequences

- [`AGENTS.md`](../../AGENTS.md) gains the rule on citations.
- The comments of `src/machine.ts`, `runtime.ts`, `storage.ts`, `program.ts`, `testing.ts` and `rehearse.ts` are
  rewritten in the commits that follow this note, one per module. The tests, the spikes and the examples keep
  theirs: their comments are a line each, and read as the rule asks.
- The stale citations found are fixed in the same commits, and `storage.ts` says of the outbox's cursor only
  what it adds to the contract `runtime.ts` states.
