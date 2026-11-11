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
   lists the areas left, with their notes, and the notes not reached. Without such a step, the maintainer names the
   notes or the area.
2. The reviewer did not write the notes it reads, as for any review of `AGENTS.md`. Start it as a session in a
   worktree of its own, so that its failing tests stay off `main`, or as a subagent where the maintainer asks for
   one. Commit what the review must see first: a worktree is cut from the last commit, and holds nothing after it.
3. Give it one area at a time, of thirty notes at most. A review asked for more stops before its end, and its
   report then says what it did not reach. A section of the index longer than that is divided, in the roadmap's
   step, before its session starts.
4. Fill the brief's three places: the area, with its notes; the later notes not reached that the roadmap gives to
   this area; and the bugs the roadmap's step of bugs already lists, so that the reviewer does not report them again.

## The reviewer's brief

Start the reviewer with this brief, with its three places filled in:

```text
Read AGENTS.md first: it says how notes, premises (`What it rests on`), tests and spikes work, and its rules bind
you. The notes are in docs/decisions/ and docs/decisions/archive/, indexed in docs/decisions/README.md, which lists
for each note the notes that changed it.

THE KIND OF BUG: a later note changes, extends or reuses an earlier note's rule, and takes away a condition the
earlier rule needs, written or unwritten. It often does so by taking a value to its end (0, the moment itself,
'forever', none, unbounded), by adding a second actor (another runner, another caller, a sweep, an operator, a
deploy of a newer version), or by moving when something is deleted or read. Decision 0248 is one found and fixed:
read it as the example, and do not report it again.

WHAT TO READ: <the area, with its notes>. Also these later notes, against the notes of the areas already read that
they cite: <the notes not reached that the roadmap gives to this area, or none>.

ALREADY FOUND, not to report again: <the bugs of the roadmap's step of bugs, one line each>.

HOW:
1. List the notes to read, before you read any. They are the notes of the area; every note the index lists as
   changing one of them; and every note that cites one of them, found by `grep -rlwE '0NNN' docs/decisions` for
   each note of the area. Write the list as the table of your report, one row a note, before step 2.
2. For each pair of an earlier note and a later note that changes it, applies its rule "as" something else does, or
   cites it as its reason, read both notes whole, the earlier note's `What it rests on`, and the code that keeps
   the rule in src/. Write down every condition the earlier rule needs to be safe, the unwritten ones too: a time
   longer than an interval, a count below a bound, an order of two commits, one actor at a time. Then ask whether
   the later note still gives each condition, in every case it opens.
3. A suspect is a finding only once you have tried to confirm it: a test that fails, written beside the module it
   tests with the helpers of src/runtime.test_shared.ts or of src/cluster.test.ts (its `onFile`, `start` and
   `withholding` make two runners on one file deterministic), or a precise reading of the code and of the
   dependency's source in node_modules/effect/src that shows the sequence. Run only the tests you need.

RULES: fix nothing, write no decision note, and change no file of docs/ or src/ other than tests that reproduce a
finding and your report. Name each such test `FAILING: …`. Write your report as a section at the end of
docs/decisions/reviews.md, headed `## <date>: premise review of <the area>`. Commit the tests and the report on your
branch, and push nothing.

YOUR REPORT, the deliverable, in this order:
- The table of step 1: each note, its role (of the area, a note that changes one, a note that cites one), and how
  you read it: whole with the code, in part (say which part: the code only, a passage, the decision), or not at
  all. No note of the list is left out of the table.
- Each finding, with the two notes, the premise that fell, the sequence that breaks, the files and lines, and
  whether it is reproduced, naming the test and the commit, or only reasoned, and where a fix could begin.
- The suspects you ruled out, each with its reason in a line.
- Every suspect you noticed and did not check, with the sequence you suspect.
- The notes of the table you did not read whole, and why.
Your last message says the branch, the commit and the findings in a few lines, and that the report is in
docs/decisions/reviews.md of the branch.
```

## What to do with the report

- Read the report from the branch, `git show <branch>:docs/decisions/reviews.md`, not from the last message alone,
  which says less.
- Run the reviewer's failing tests yourself before you tell the maintainer of a finding. A report is the
  reviewer's, and no proof.
- Run each test again on the last commit of `main` where the reviewer's branch was cut before it.
- Every finding is a bug of the step of bugs of [`docs/roadmap.md`](../../../docs/roadmap.md), fixed by family,
  marked reproduced or reasoned. A bug reproduced names the branch, the commit and the tests, and where the fix
  begins. Its fix is a note that changes the earlier one, with the test, taken as `AGENTS.md` says.
- A suspect the reviewer noticed and did not check is a bug of the same step, marked not checked.
- A finding only reasoned, one whose fix is a choice of the design, and a suspect not checked are also questions of
  [`docs/open-questions.md`](../../../docs/open-questions.md), with what would decide them.
- Copy the report's section to [`docs/decisions/reviews.md`](../../../docs/decisions/reviews.md) of `main`, whole,
  so that what the review ruled out stays when the branch goes.
- Write what the review read and what it did not reach in the roadmap's step of the review, so that the next
  review starts where this one stopped. Write `Done, ` before the area's name in the step's list of areas, and keep
  its notes there. Take out of the list of notes not reached each one the review read whole. A note of the table read only in part is listed for the step's last
  session, to read whole. A note not read goes to the area of the list that holds it, or to the last session where
  that area is already read.
- Check the report whole against what the step, the bugs and the open questions now say, item by item. Then run
  `bun scripts/premise-coverage.ts`, which fails where a note of the index is in no area, in two, or is a note not
  reached whose area is read. Commit only once it passes.
- The step leaves the roadmap once its last session is done.
- Do not merge the reviewer's branch: its tests fail. A test moves to `main` with the fix that makes it pass.
