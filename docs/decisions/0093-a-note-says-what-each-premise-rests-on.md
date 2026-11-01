# 0093. A note says what each premise rests on

**Status:** accepted, 2026-10-31. Adds a rule to [`AGENTS.md`](../../AGENTS.md) on what a note says of its premises.
That a premise about a dependency is checked before the note is taken, and a spike kept in `spikes/`, is added by
[decision 0097](0097-a-dependency-is-checked-by-a-spike-the-repository-keeps.md). That such a premise is looked up in
its documentation first is added by [decision 0108](0108-a-premise-about-a-dependency-is-looked-up-in-its-documentation-first.md).

## Context

A decision rests on premises, and they are not equally strong. Where a premise is a rule of
[`src/machine.ts`](../../src/machine.ts) or a wait of [`src/runtime.ts`](../../src/runtime.ts), a test fails without
it, and a change that breaks it is caught. The others are prose: what a dependency's documentation promises, what a
spike saw of it, what its source does today, what the note argues — that an interleaving cannot be reached, that a
case cannot arise. Nothing checks them, a taken note is never rewritten, and a reader takes them at the weight of the
tested ones.

[Decision 0081](0081-on-cluster-a-step-commits-with-its-reply.md) is the case. It counted among Cluster's properties
an endless retry, which is an option's default, and a stall its spike only saw, likely a bug. Its decision stood; its
reasons did not, and only a reader who went back to them found it
([decision 0082](0082-what-0081-saw-of-a-defect-is-not-cluster-s-contract.md)). 0082 sorts what 0081 rests on into
what is written, what is set by an option and what is only seen; that sorting told the next reader what to check, and
[decision 0083](0083-effect-moves-to-4-1-1.md) checked the stall on 4.1.1.

## Decision

- **A note lists what it rests on.** A section `What it rests on`, after the decision, lists each premise the decision
  needs, and says of each where it comes from:
  - **tested**: a test in `src/` fails without it; the note names the test;
  - **documented**: written in the documentation or the types of what it is about; the note says where;
  - **seen**: observed in a spike or a run, at a version the note names; the note names the spike;
  - **read in the source**: read in a dependency's code, and promised by nothing; any release may change it;
  - **reasoned**: argued in the note, and checked by nothing else.
- **A premise is one the decision falls without.** What only explains it, or what an alternative rests on, is not
  listed.
- **Notes taken before this one keep their text.** A review
  ([decision 0094](0094-the-notes-are-reviewed-every-fifteen-by-a-reader-that-did-not-write-them.md)) that doubts
  one of their premises says so in a note of its own. A `proposed` note gets the section before its step is taken.

## What it rests on

- A premise nothing checks is where an error stays longest: **seen**, in 0081 and 0082; in the review that found
  [decision 0078](0078-a-timer-due-is-no-spare-entity-and-a-registered-deploy-keeps-its-name.md) and
  [decision 0079](0079-what-a-caller-sets-going-is-finished-without-it.md), the errors were in what the notes argued,
  not in what their tests checked.
- A reader checks first what a note marks as weakest: **reasoned**.

## Alternatives

- **Leaving the notes as they are.** Each reader sorts the premises again, or takes them all at one weight.
- **A test for every premise.** Some cannot have one: what Cluster does in a release not out yet, an interleaving no
  setting of `Scheduler.MaxOpsBeforeYield` reaches.
- **Marking the premises inline, where the text says them.** Nothing to add to the note's shape, but a reader has to
  read it whole to find what it rests on, and a note that marks nothing looks like one that rests on nothing.

## Consequences

- [`AGENTS.md`](../../AGENTS.md) says it.
- What a review reads first in a note is its section `What it rests on`, from **reasoned** up.
- [Decision 0092](0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md), `proposed`, gets the
  section before its step is taken.
