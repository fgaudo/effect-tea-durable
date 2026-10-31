# 0094. The notes are reviewed every fifteen, by a reader that did not write them

**Status:** accepted, 2026-10-31. Adds a rule to [`AGENTS.md`](../../AGENTS.md) on when the notes are reviewed.

## Context

An error in a note is found when a later step builds on it, or when someone reads it again on purpose. The second has
found what the first did not: the third audit found the bugs [decision 0050](0050-a-creation-is-answered-apart-from-a-message.md)
and [decision 0051](0051-a-deploy-that-fails-leaves-nothing-running.md) fix; a review of decisions 0027 to 0039 found
[0070](0070-reindex-writes-a-row-only-over-its-state.md) to [0073](0073-what-the-runtime-did-is-told-to-a-probe.md);
a review of 0075 and 0076 found [0078](0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md)
and a bug older than them, [0079](0079-what-a-caller-sets-going-is-finished-without-it.md).

Each was made when someone thought of it. Nothing says when the next is due, which notes the last one read, or where
what it found is told; and a note left out of every review is read again only if a step builds on it.

Whoever wrote a note reads it with what they meant. A reader who has only the repository reads what it says.

## Decision

- **Once fifteen notes are taken since the last review, a review is made** before the next step of the roadmap
  starts. A step under way finishes first.
- **It reads the notes taken since the last review**, each one's section `What it rests on`
  ([decision 0093](0093-a-note-says-what-each-premise-rests-on.md)) from **reasoned** up, and, where a premise is
  another note's, that note's premises too. A premise **seen** or **read in the source** is checked against the
  version the project pins; a **reasoned** one against the code. A note taken before 0093 has no such section, and
  the review sorts its premises itself.
- **It is made by a reader that did not write the notes**: a session that starts from the repository, with no part
  of the conversations that wrote them.
- **What it finds is a note, a test, a fix or an open question**, under the rules of
  [decision 0089](0089-a-note-says-what-changed-it-and-is-taken-with-its-step.md). A premise found to hold that a
  test can check gets the test. A `proposed` note is rewritten in place.
- **Each review is listed** at the end of [`README.md`](README.md) in `docs/decisions/`: the notes it read, its date,
  and what it found, with links. A review that finds nothing is listed too.
- **The first review is made with this note**, and reads the notes taken since the review that found 0078: 0080 to
  0091. 0092, `proposed`, is read too, and what is found of it goes into its step.

## What it rests on

- A review finds what the steps did not: **seen**, in the reviews above.
- A reader without the writer's context finds more of what a note says wrong: **reasoned**.
- Fifteen notes are a few days of work, and a review of them fits a session: **seen**, in the review of 0027 to 0039,
  thirteen notes.

## Alternatives

- **A review when someone thinks of it**, as before. Notes no step builds on are never read again.
- **A review with every step.** A step of Cluster's findings takes one or two notes; a review of each would read
  little, and its context would still be the step's.
- **A review by the session that wrote the notes.** It knows where to look, and looks where it already looked.

## Consequences

- [`AGENTS.md`](../../AGENTS.md) says it.
- [`README.md`](README.md) in `docs/decisions/` has a section `Reviews`.
- The first review counts as read this note, 0093 and the notes it adds; the next is due once fifteen more are taken.
