# 0106. Notes the design covers are archived at each release

**Status:** accepted, 2026-11-01. Changes what [decision 0089](0089-a-note-says-what-changed-it-and-is-taken-with-its-step.md)
says the index lists.

## Context

The notes only grow. A note is never deleted, and a decision that changes is a new note. There are 106 of them now.
An agent that wants to know why the runtime holds an entity by a lock reads 0067, then each note that changed it,
then each note that changed those. The index groups them by what they decide, but it lists them all, those that
hold and those that hold no more.

## Decision

- **Each release archives the notes the design covers**, starting with the library's first release. They move to
  `docs/decisions/archive/`, with their numbers and their text unchanged.
- **A note is archived only when [`design.md`](../design.md) says what holds of it.** A reader finds there what it
  decided, and goes to the archive only to learn why.
- **A chain moves whole.** A note is archived only with every note that changes it, so that the archive keeps each
  correction beside what it corrects.
- **The archive has an index of its own**, `docs/decisions/archive/README.md`, in the form of
  [`README.md`](README.md): by what the notes decide, with the notes that changed each one. The main index lists
  only the notes not archived.
- **Links to an archived note are updated** by the commit that moves it, as [`AGENTS.md`](../../AGENTS.md) allows for
  a rename.

## What it rests on

- An agent reads `design.md` and the main index before the archive: **reasoned**. [`AGENTS.md`](../../AGENTS.md)
  points it to `design.md` first.
- At a release, the design has settled enough for `design.md` to say what holds: **reasoned**.
- Nothing is lost by moving a note: **reasoned**. Its text and its number stay, and git keeps its history.

## Alternatives

- **Keeping every note in one index forever.** Nothing moves, but the cost of reading grows with each note.
- **Merging the notes of an area into one.** It reads best, but a summary drops the reasoning a note tried and
  then corrected, which is what keeps an agent from trying it again. It also mixes premises of different evidence,
  and blurs which test holds which rule of `src/machine.ts`.
- **Archiving whenever a note is replaced.** The archive would change at every step, and a chain would be split
  while its step is still under way.

## Consequences

- The roadmap's release step archives the notes, as this note says.
- Until the first release, nothing moves.
