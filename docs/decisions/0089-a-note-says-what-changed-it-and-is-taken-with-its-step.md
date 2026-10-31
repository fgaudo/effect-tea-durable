# 0089. A note says what changed it, and is taken with its step

**Status:** accepted, 2026-10-31. Changes the rules of [`AGENTS.md`](../../AGENTS.md) on when a note is taken and
what of it may change after.

## Context

Eighty-seven notes are taken, and about one in four changes, replaces or corrects an earlier one. That is what a
log of decisions is for: a decision that changes is a new note, and the history says why. Three things make the log
harder to read than it needs to be:

- **A note does not say what changed it.** Decision 0081 does not say that 0082 corrects its reasons, nor that 0087
  and 0088 change what it says of a stored answer and of the mailbox. A reader who opens it alone takes away a
  reasoning that no longer holds. The first notes said it ([decision 0012](0012-creation-is-a-request-of-its-own.md),
  [0015](0015-a-request-belongs-to-its-sender.md), [0016](0016-work-is-what-it-was-started-with.md)); since a note
  is taken by the commit that adds it, nothing may add it.
- **Nothing lists the notes by what they decide, or says which still hold.** The directory is in the order they
  were taken; [`design.md`](../design.md) says what holds now, and links 72 of the notes, not all of them.
- **A note is taken before its step has settled it.** A finding of Effect Cluster is decided in a few commits, each
  learning from the one before: 0082 corrects 0081 the day it was taken, 0086 corrects 0085, 0088 corrects 0087.
  Each correction is a note of its own, though nothing outside the step had relied on what it corrects.

## Decision

- **A note says what changed it.** A note that replaces, changes or corrects another adds, in the same commit, a
  sentence to the other's status line: what of it changed, and the link to the note that changed it. The status
  line is the only part of a taken note that changes; its text stays as it was taken. A note that only says how
  another holds somewhere else, or decides beside it, links it from its own status line and adds nothing to it.
- **[`README.md`](README.md) in `docs/decisions/` lists the notes** by what they decide, with the notes that
  changed each one. A commit that adds a note adds it there, and updates the entries of the notes it changes.
- **A note made for a step of the roadmap is `proposed` until the step is done.** While its step is in the
  roadmap, it is rewritten in place where the step learns something it got wrong, with the code it decides; it is
  taken, and its status becomes `accepted`, by the commit that takes the step out of the roadmap. A note made
  outside a step is taken by the commit that adds it, as before. What changes an `accepted` note is a new note,
  whichever step makes it.
- **Notes taken before this one stay as they were.** The notes of Cluster's findings, 0081 to 0088, are accepted,
  and are not made `proposed` again; this note adds to the notes changed so far the sentence of the first rule.

## Alternatives

- **Leaving the rules as they were.** The history stays whole, and the reader has to find, for each note, the
  later ones that change it: a search of the directory for its number.
- **Rewriting a note when it changes.** The text would say what holds now, and the reason a decision was taken and
  then left would live only in git. `design.md` is already where what holds now is said.
- **One note per step instead of one per decision.** Fewer notes, but a note of `src/machine.ts`'s rules would no
  longer be the one decision a test fails without.
- **An index made by a script from the status lines.** It cannot group the notes by what they decide, which their
  text does not say.

## Consequences

- [`AGENTS.md`](../../AGENTS.md) says the three rules.
- The notes changed by 0018 to 0088 say so in their status line, and [`README.md`](README.md) lists them all.
- A correction found while a step is under way is no longer a note of its own: git holds what the note was.
