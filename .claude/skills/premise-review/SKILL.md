---
name: premise-review
description: Look for a decision note that takes away a premise of a note it changes or builds on — a session or a subagent that reads pairs of notes with the code that keeps them, and reproduces what it finds with a failing test. Use when the maintainer asks whether a note ignores the premises of another, when a step of the roadmap names this review, or after a note that changes several others is taken.
---

# A review of the premises a later note takes away

A rule of an earlier note is safe under conditions, written in its `What it rests on` or not written at all. A later
note that changes, extends or reuses the rule may take one away, and nothing fails until two callers, two runners or
a sweep meet. Decision 0245 kept a creation's Cluster id as a `keep` of 0 does, where decision 0171 was safe only
because `keep` outlasts another client's poll of replies, and a second client of the creation waited for ever
([decision 0248](../../../docs/decisions/0248-on-cluster-a-callers-rows-are-kept-for-every-clients-poll.md)). This
review looks for the same in the notes already taken. [`AGENTS.md`](../../../AGENTS.md) asks it of each new note
that changes another.

## Before it starts

1. Choose what the review reads. The step of [`docs/roadmap.md`](../../../docs/roadmap.md) that names the review
   lists the sections of [the index](../../../docs/decisions/README.md) and the notes not read yet. Without such a
   step, the maintainer names the notes or the area.
2. The reviewer did not write the notes it reads, as for any review of `AGENTS.md`. Start it as a session in a
   worktree of its own, so that its failing tests stay off `main`, or as a subagent where the maintainer asks for
   one. Commit what the review must see first: a worktree is cut from the last commit, and holds nothing after it.
3. Give it one area at a time. A review asked for the whole index stops before its end, and its report then says
   what it did not reach.

## The reviewer's brief

Start the reviewer with this brief, with the area filled in:

```text
Read AGENTS.md first: it says how notes, premises (`What it rests on`), tests and spikes work, and its rules bind
you. The notes are in docs/decisions/ and docs/decisions/archive/, indexed in docs/decisions/README.md, which lists
for each note the notes that changed it.

THE KIND OF BUG: a later note changes, extends or reuses an earlier note's rule, and takes away a condition the
earlier rule needs, written or unwritten. It often does so by taking a value to its end (0, the moment itself,
'forever', none, unbounded), by adding a second actor (another runner, another caller, a sweep, an operator, a
deploy of a newer version), or by moving when something is deleted or read. Decision 0248 is one found and fixed:
read it as the example, and do not report it again.

WHAT TO READ: <the sections of the index, or the notes, of this review>.

HOW:
1. List every pair of an earlier note and a later note that changes it, and every later note that applies an
   earlier rule "as" something else does, or cites it as its reason.
2. For each pair, read both notes whole, the earlier note's `What it rests on`, and the code that keeps the rule in
   src/. Write down every condition the earlier rule needs to be safe, the unwritten ones too: a time longer than
   an interval, a count below a bound, an order of two commits, one actor at a time. Then ask whether the later
   note still gives each condition, in every case it opens.
3. A suspect is a finding only once you have tried to confirm it: a test that fails, written beside the module it
   tests with the helpers of src/runtime.test_shared.ts or of src/cluster.test.ts (its `onFile`, `start` and
   `withholding` make two runners on one file deterministic), or a precise reading of the code and of the
   dependency's source in node_modules/effect/src that shows the sequence. Run only the tests you need.

RULES: fix nothing, write no decision note, and change no file of docs/ or src/ other than tests that reproduce a
finding. Name each such test `FAILING: …`, commit them on your branch, and push nothing.

YOUR REPORT, the deliverable: the pairs you read, and how: both notes whole, or the code and the later note only.
Each finding, with the two notes, the premise that fell, the sequence that breaks, the files and lines, and whether
it is reproduced, naming the test, or only reasoned. The suspects you ruled out and why, in a line each. The notes
and the sections you did not reach.
```

## What to do with the report

- Run the reviewer's failing tests yourself before you tell the maintainer of a finding. A report is the
  reviewer's, and no proof.
- Run each test again on the last commit of `main` where the reviewer's branch was cut before it.
- Every finding is a bug of the step of [`docs/roadmap.md`](../../../docs/roadmap.md) that follows the review,
  marked reproduced or reasoned. A bug reproduced names the branch, the commit and the tests, and where the fix
  begins. Its fix is a note that changes the earlier one, with the test, taken as `AGENTS.md` says.
- A finding only reasoned, one whose fix is a choice of the design, and a suspect the reviewer noticed and did not
  check are also questions of [`docs/open-questions.md`](../../../docs/open-questions.md), with what would decide
  them. Nothing of a report stays only in the report.
- Write what the review read and what it did not reach in the roadmap's step of the review, so that the next
  review starts where this one stopped. The step leaves the roadmap once every section of the index is read.
- Do not merge the reviewer's branch: its tests fail. A test moves to `main` with the fix that makes it pass.
