# 0108. A premise about a dependency is looked up in its documentation first

**Status:** accepted, 2026-11-01. Adds to [decision 0093](0093-a-note-says-what-each-premise-rests-on.md) and
[decision 0097](0097-a-dependency-is-checked-by-a-spike-the-repository-keeps.md) where a premise about a dependency
is looked for first, and what a design does with one its documentation does not promise. Adds a rule to
[`AGENTS.md`](../../AGENTS.md).

## Context

[Decision 0093](0093-a-note-says-what-each-premise-rests-on.md) names five kinds of premise, and
[decision 0097](0097-a-dependency-is-checked-by-a-spike-the-repository-keeps.md) asks that one about a dependency is
tested, documented or seen before its note is taken. Neither says where to look first. The notes looked in the
source and ran spikes, and no one asked whether Effect promised what they saw: when
[decision 0107](0107-what-effect-documents-of-the-premises.md) asked, nine groups of the behaviours read were
promised, six were not, and one was promised the other way.

What a spike sees is what one release does. What the documentation promises is what the next keeps, or breaks on
purpose, with a note in its changelog. A spike tells when a behaviour changes; only the documentation tells whether
it may.

## Decision

- **A premise about a dependency is looked up in its documentation first**: the documentation of the version the
  project pins, for Effect the JSDoc in `node_modules/effect/src`. Found there, it is **documented**, naming the file.
  Not found, the note says that the documentation does not promise it, and the premise is seen in a spike, as
  decision 0097 asks, or tested.
- **A rule that loses data in silence if an unpromised behaviour changes does not rest on it alone**, where a guard of
  the library's own is cheap. A spike tells only once the release is taken; the guard holds meanwhile. Where none is
  cheap, the premise goes in `docs/open-questions.md`, as the take a timeout interrupts does.

## What it rests on

- That the notes rested on behaviours Effect does not promise, and on one it promises the other way: **documented**,
  by [decision 0107](0107-what-effect-documents-of-the-premises.md).
- That a dependency's documentation is what its releases keep: **reasoned**. Effect marks what it keeps with
  `@stability`, and its unstable modules promise nothing
  ([decision 0099](0099-a-library-on-unstable-modules-is-released-as-experimental.md)).

## Alternatives

- **The source as the first place to look**, as the notes did. It says what the code does now, not what it may do
  next, and reads the same for a guarantee and an accident.
- **Only documented behaviour**, refusing a design that rests on anything else. Cluster and Workflow document almost
  nothing, and the library is built on them.

## Consequences

- A later note says of each premise about a dependency whether its documentation promises it.
- A review reads a premise **seen** or **read in the source** again in the documentation of the version pinned then.
