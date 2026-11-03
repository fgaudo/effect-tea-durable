# 0105. Commits, prose and the roadmap are written for a reader

**Status:** accepted, 2026-11-01. Adds three rules to [`AGENTS.md`](../../AGENTS.md), and keeps the rules on notes
that [decision 0089](0089-a-note-says-what-changed-it-and-is-taken-with-its-step.md),
[0093](0093-a-note-says-what-each-premise-rests-on.md), [0094](0094-the-notes-are-reviewed-every-fifteen-by-a-reader-that-did-not-write-them.md)
and [0097](0097-a-dependency-is-checked-by-a-spike-the-repository-keeps.md) set. What its rule of prose does to the
comments written before it is decided by
[decision 0117](0117-a-comment-is-written-as-prose-is-and-cites-the-latest-note-on-its-point.md).

## Context

The repository is hard to read for someone who did not write it. Three things make it so.

- **A commit's subject does not say where it changes the code.** "Let a fiber whose run ends interrupt its children
  without a yield" names neither the module nor the change in terms a reader knows.
- **Prose is written as chains of clauses.** A sentence often holds three ideas, and its conclusion comes last.
- **The roadmap retells what is done.** Its section `Next` grew one paragraph per finished step. Each of them only
  repeats the notes it links, and the next step is lost among them.

## Decision

- **A commit's subject starts with the module or area it changes**, then a concrete action:
  `runtime: interrupt children when a run ends, without yielding`. The area is a module of `src/` without its
  extension, or `docs`, `examples`, `spikes` or `scripts`. A commit across several names the one it is about.
- **Prose states its conclusion first**, one sentence per idea, without chains of subordinate clauses. This holds
  for `.md` files, comments and commit bodies.
- **The roadmap holds only the steps ahead.** What a done step decided is in its notes and in the design, and is
  not retold in the roadmap.
- **The rules on notes stay as they are.** Their purpose is that an agent rebuilds what was decided, and why, before
  it changes anything, so that it does not make again a mistake already found.

## What it rests on

- Agents write as [`AGENTS.md`](../../AGENTS.md) says: **seen** in this repository's history, whose notes and commits
  follow its rules.
- A prefix lets a reader or an agent filter the history by module, as `git log --grep '^runtime:'` does:
  **reasoned**.
- What the roadmap retold is in the notes: **seen**. Each paragraph taken out links the notes that decided it.
- The notes are how an agent learns what was decided before: **decided with the author**.

## Alternatives

- **Lightening the rules on notes**, with fewer notes and fewer reviews. A person would read less, but an agent
  would find less of why a decision was taken, and could undo it. The author keeps them for now.
- **Leaving the roadmap's history in a section of its own.** It would still repeat the notes, and would need
  keeping in step with them.

## Consequences

- [`docs/roadmap.md`](../roadmap.md) loses its history, and its steps are listed in order.
- Commits before this note keep their subjects. Notes taken before it keep their text, as
  [decision 0089](0089-a-note-says-what-changed-it-and-is-taken-with-its-step.md) requires.
