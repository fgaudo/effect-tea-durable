# 0097. A dependency is checked by a spike the repository keeps, and the older notes are reviewed

**Status:** accepted, 2026-10-31. Adds to [decision 0093](0093-a-note-says-what-each-premise-rests-on.md) what a
premise about a dependency needs before a note is taken, and to
[decision 0094](0094-the-notes-are-reviewed-every-fifteen-by-a-reader-that-did-not-write-them.md) a review of the
notes no review has read. Adds rules to [`AGENTS.md`](../../AGENTS.md). That a premise is looked up in its
dependency's documentation before a spike, and what a rule does with one not promised, is added by
[decision 0108](0108-a-premise-about-a-dependency-is-looked-up-in-its-documentation-first.md).

## Context

[Decision 0093](0093-a-note-says-what-each-premise-rests-on.md) has a note say what each premise rests on, but takes
a note whatever its premises rest on: a decision may change on a premise about Effect, Cluster or SQLite that only
the note argues, or that was read in their code, and be taken as it stands. Several were: a change was accepted
without a spike, and no one asked for one.

What a spike saw is no stronger. The spikes of [decision 0081](0081-on-cluster-a-step-commits-with-its-reply.md) to
[decision 0096](0096-cluster-stores-an-answer-no-step-gave-for-a-type-not-registered.md) were run and not kept: the
repository has none of them. A premise **seen** in one cannot be seen again when the project moves to another
release, nor by a review; a reader has only the note's word for it, as for a premise **reasoned**.

Notes taken before 0093 keep their text, and
[decision 0094](0094-the-notes-are-reviewed-every-fifteen-by-a-reader-that-did-not-write-them.md) reviews only the
notes taken since the last review. Of 0001 to 0079, only the ones the earlier reviews read, and the ones a later step
built on, were read again; the others will not be, though the code and the design still rest on them.

## Decision

- **A spike is kept.** It is a test in `spikes/`, named by the dependency and what it checks, run by `bun test`
  against the version the project pins, and it asserts what it saw. A premise **seen** names the file. A spike that
  sees a bug asserts the bug, and says so; a release that fixes it fails it, and the note it bears on is read again.
- **A premise about what a dependency does is checked before its note is taken.** Where a decision falls without
  what Effect, Cluster, SQLite or Bun does when it runs, that premise is **tested**, **documented**, or **seen** in a
  spike in `spikes/`. **Read in the source** or **reasoned** is not enough for it. A `proposed` note whose premise is
  not checked stays `proposed`, and its step is not done.
- **What no spike can run stays reasoned, and says what would check it.** A release not out yet, an issue not fixed:
  the note says so, names what would check the premise, and the question goes in
  [`open-questions.md`](../open-questions.md) until a spike or a test does.
- **A premise seen in a spike the repository does not keep is read as reasoned.** The next review or step that
  builds on it writes the spike in `spikes/`, or the note that finds it does not hold.
- **The notes no review has read are reviewed, before the next step of the roadmap.** A review of the backlog reads
  0001 to 0079 in order, in lots of about fifteen, each in a session that did not write them, under the rules of
  0094; a note whose every rule a later note replaced is skipped, and the review says so. It sorts each note's
  premises itself, reads first the ones about a dependency, and checks them by a spike in `spikes/` or a test. Each
  lot is listed in the reviews of [`README.md`](README.md), and the backlog is done when 0079 is read. The reviews
  due every fifteen notes go on beside it.

## What it rests on

- Decisions were taken on premises about a dependency that nothing checked: **seen**, in this project's history, as
  the context says; in [decision 0082](0082-what-0081-saw-of-a-defect-is-not-cluster-s-contract.md), which found that
  0081 counted as Cluster's what was an option's default and a bug.
- The spikes are not in the repository: **seen**, in its files at this commit.
- A spike that runs with the tests catches what a release changes: **reasoned**; `bun test` runs every `*.test.ts`
  under the repository, which is **documented** in Bun's test runner.
- A dependency's behaviour is where a test of this repository cannot reach: **reasoned**; the machine's and the
  runtime's tests run the project's own code, and a dependency only as the project calls it.

## Alternatives

- **Asking for a spike when one seems needed.** It is what was done, and what let the premises through.
- **A spike outside the repository, linked from the note.** A reader can see it, but nothing runs it when the
  version changes.
- **Rewriting the older notes with a section `What it rests on`.** A taken note is not rewritten; what the review
  finds goes into notes of its own.
- **Reviewing only the notes a later step builds on.** A note no step builds on may still hold up the code, and is
  where an error stays longest.

## Consequences

- [`AGENTS.md`](../../AGENTS.md) says it, and `tsconfig.json` includes `spikes/`.
- The [roadmap](../roadmap.md) starts with the review of the backlog.
- The next step that runs the runtime on Cluster writes first the spikes its notes' premises were **seen** in.
