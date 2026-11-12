---
name: premise-review
description: Look for a decision note that takes away a premise of a note it changes or builds on — a session or a subagent that reads pairs of notes, or every writer and reader of one shared state, with the code that keeps them, and reproduces what it finds with a failing test. Use when the maintainer asks whether a note ignores the premises of another, when a step of the roadmap names this review, or after a note that changes several others is taken.
---

# A review of the premises a later note takes away

A rule of an earlier note is safe under conditions, written in its `What it rests on` or not written at all. A later
note that changes, extends or reuses the rule may take one away, and nothing fails until two callers, two runners or
a sweep meet. Decision 0245 kept a creation's Cluster id as a `keep` of 0 does, where decision 0171 was safe only
because `keep` outlasts another client's poll of replies, and a second client of the creation waited for ever
([decision 0248](../../../docs/decisions/0248-on-cluster-a-callers-rows-are-kept-for-every-clients-poll.md)). This
review looks for the same in the notes already taken. [`AGENTS.md`](../../../AGENTS.md) asks it of each new note
that changes another. It reads by pairs of notes, in the briefs of an area and of a last session, and by one shared
state, in the brief of a reading of one shared state, which finds what the pairs miss.

## Before it starts

1. Choose what the review reads. The step of [`docs/roadmap.md`](../../../docs/roadmap.md) that names the review
   lists the areas left, with their notes, and the notes not reached. Without such a step, the maintainer names the
   notes or the area.
2. The reviewer did not write the notes it reads, as for any review of `AGENTS.md`. Start it as a session in a
   worktree of its own, so that its failing tests stay off `main`, or as a subagent where the maintainer asks for
   one. Commit what the review must see first: a worktree is cut from the last commit, and holds nothing after it.
   Several reviewers may run at once, one area or one last session each, four to six at a time so that the tests
   of each run on a machine not too loaded. The desktop app starts a session only in a turn the maintainer's own
   message began, so the next ones wait for the maintainer's word once a reviewer's report has come in.
3. Give it one area at a time, of thirty notes at most. A review asked for more stops before its end, and its
   report then says what it did not reach. A section of the index longer than that is divided, in the roadmap's
   step, before its session starts.
4. Fill the brief's three places: the area, with its notes; the later notes not reached that the roadmap gives to
   this area; and the bugs [`docs/bugs.md`](../../../docs/bugs.md) already lists, so that the reviewer does not report them again.

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

ALREADY FOUND, not to report again: <the bugs of docs/bugs.md, one line each>. A bug of the same form
under another sequence is a new finding, and so is a fix of a bug of the list that does not hold.

HOW:
1. List the notes to read, before you read any. They are the notes of the area; every note the index lists as
   changing one of them; every note that cites one of them, found by `grep -rlwE '0NNN' docs/decisions` for
   each note of the area; and every note that a comment of src/ cites in the same declaration as one of them, found
   by `bun scripts/premise-pairs.ts --list --note=<the notes of the area>`. Two notes the code couples bind each other
   even where neither names the other. Write the list as the table of your report, one row a note, before step 2.
2. For each pair of an earlier note and a later note that changes it, applies its rule "as" something else does, or
   cites it as its reason, read both notes whole, the earlier note's `What it rests on`, and the code that keeps
   the rule in src/. Write down every condition the earlier rule needs to be safe, the unwritten ones too: a time
   longer than an interval, a count below a bound, an order of two commits, one actor at a time. Then ask whether
   the later note still gives each condition, in every case it opens.
3. A suspect is a finding only once you have tried to confirm it: a test that fails, written beside the module it
   tests with the helpers of src/runtime.test_shared.ts or of src/cluster.test.ts (its `onFile`, `start` and
   `withholding` make two runners on one file deterministic). A reading of the code alone, or of a dependency's
   source, gives a lead and no finding: report it as a lead, with the test that would reproduce it. Run only the
   tests you need.
4. A suspect is ruled out by a test only under the seeds the test ran. `bun test` runs one seed in twenty of an
   explored test, and some rules of concurrency fail only past the first hundred seeds. So a test of concurrency that
   rules a suspect out runs under `SCHEDULES=all`, and the report names the test, the seeds and `SCHEDULES`.
5. While you read the code that keeps a rule, note each place where it does otherwise than the note it cites says.

RULES: fix nothing, write no decision note, and change no file of docs/ or src/ other than tests that reproduce a
finding and your report. Name each such test `FAILING: …`. Write your report as a section at the end of
docs/decisions/reviews.md, headed `## <date>: premise review of <the area>`. Commit the tests and the report on your
branch, and push nothing.

YOUR REPORT, the deliverable, in this order:
- The table of step 1: each note, its role (of the area, a note that changes one, a note that cites one), and how
  you read it: whole with the code, in part (say which part: the code only, a passage, the decision), or not at
  all. No note of the list is left out of the table.
- Each finding, with the two notes, the premise that fell, the sequence that breaks, the files and lines, and
  the test that reproduces it and the commit, and where a fix could begin. Each lead, with the same, and the test
  that would reproduce it.
- The suspects you ruled out, each with its reason in a line: the test, its seeds and `SCHEDULES`, or the
  documentation of the version pinned.
- Every suspect you noticed and did not check, with the sequence you suspect.
- Each place where the code does otherwise than the note it cites, with the file and line.
- The notes of the table you did not read whole, and why.
Your last message says the branch, the commit and the findings in a few lines, and that the report is in
docs/decisions/reviews.md of the branch.
```

## A last session's brief

A reviewer of an area reads the notes of other areas in part, where they meet a note of its own. Each such note is
listed in the roadmap's step, by the area it is read against, and a last session reads the pairs whole. Start a last
session with this brief, with its four places filled in from the step's list of last sessions:

```text
You are a reviewer of the premise review of this repository, in one of its last sessions: you read pairs of notes
that earlier reviewers read only in part. Follow this brief exactly.

Read AGENTS.md first: it says how notes, premises (`What it rests on`), tests and spikes work, and its rules bind
you. The notes are in docs/decisions/ and docs/decisions/archive/, indexed in docs/decisions/README.md, which lists
for each note the notes that changed it. The step "A review of every note that changes another" of docs/roadmap.md
says where the review stands.

THE KIND OF BUG: a later note changes, extends or reuses an earlier note's rule, and takes away a condition the
earlier rule needs, written or unwritten. It often does so by taking a value to its end (0, the moment itself,
'forever', none, unbounded), by adding a second actor (another runner, another caller, a sweep, an operator, a
deploy of a newer version), or by moving when something is deleted or read. Decision 0248 is one found and fixed:
read it as the example, and do not report it again.

WHAT TO READ: the notes <the session's notes>, each against the notes it meets of <the area, with its notes>. The
review of that area, the section <its heading> of docs/decisions/reviews.md, read these notes in part or not at
all, as its table says. Read that report first, with what it ruled out, and the reviews of the areas that hold your
notes. A suspect that report ruled out by reading alone, or by a test of concurrency that names no seeds and
`SCHEDULES`, is not ruled out for you: check it again where your pairs meet it.

ALREADY FOUND, not to report again: every bug of docs/bugs.md, and the open questions of docs/open-questions.md. Read that file before you
start. A bug of the same form under another sequence is a new finding, and so is a fix of a bug of the file that does
not hold.

HOW:
1. List the pairs before you read any: for each note of your list, the notes it meets of the area, found by the
   report's table, the index, `grep -wE '0NNN'` of each note in both directions, and
   `bun scripts/premise-pairs.ts --list --note=<your notes>`. A pair is a note that changes another, applies its rule
   "as" another does, cites it as its reason, or is cited beside it by a comment of one declaration of src/. Write
   them as the table of your report, one row a pair, before step 2.
2. For each pair, read both notes whole, the earlier note's `What it rests on`, and the code that keeps the rule in
   src/. Write down every condition the earlier rule needs to be safe, the unwritten ones too: a time longer than an
   interval, a count below a bound, an order of two commits, one actor at a time. Then ask whether the later note
   still gives each condition, in every case it opens.
3. A suspect is a finding only once you have tried to confirm it: a test that fails, written beside the module it
   tests with the helpers of src/runtime.test_shared.ts or of src/cluster.test.ts (its `onFile`, `start` and
   `withholding` make two runners on one file deterministic). A reading of the code alone, or of a dependency's
   source, gives a lead and no finding: report it as a lead, with the test that would reproduce it. Run only the
   tests you need. Where no PostgreSQL server runs, a test of src/postgres.test.ts is written and said not run, and
   it stays a lead until the CI's job of PostgreSQL runs it.
4. A suspect is ruled out by a test only under the seeds the test ran. `bun test` runs one seed in twenty of an
   explored test, and some rules of concurrency fail only past the first hundred seeds. So a test of concurrency that
   rules a suspect out runs under `SCHEDULES=all`, and the report names the test, the seeds and `SCHEDULES`.
5. While you read the code that keeps a rule, note each place where it does otherwise than the note it cites says.

RULES: fix nothing, write no decision note, and change no file of docs/ or src/ other than tests that reproduce a
finding and your report. Name each such test `FAILING: …`. Write your report as a section at the end of
docs/decisions/reviews.md, headed `## <date>: premise review of the pairs against <the area>`. Commit the tests and
the report on your branch, and push nothing. Other reviewers may run at the same time in other worktrees: do not
touch main or their branches.

YOUR REPORT, the deliverable, in this order:
- The table of step 1: each pair, what binds it (changes, applies as, cites as its reason), and how you read it:
  both whole with the code, or in part (say which part). Every note of your list is read whole, with its code: one
  not read so is a gap your last message names.
- Each finding, with the two notes, the premise that fell, the sequence that breaks, the files and lines, and
  the test that reproduces it and the commit, and where a fix could begin. Each lead, with the same, and the test
  that would reproduce it.
- The suspects you ruled out, each with its reason in a line: the test, its seeds and `SCHEDULES`, or the
  documentation of the version pinned.
- Every suspect you noticed and did not check, with the sequence you suspect. Check each before you list it, where a
  test or a reading can: a suspect left unchecked says why.
- Each place where the code does otherwise than the note it cites, with the file and line.
- The notes you did not read whole, and why.
Your last message says the branch, the commit and the findings in a few lines, and that the report is in
docs/decisions/reviews.md of the branch.
```

## A reading of one shared state

A review by pairs misses two notes that the code couples and that neither note names, and a condition that three
notes give or take together. A reading of one shared state finds both, since it starts from the code and not from
the citations. A shared state is a table of the storage or of Cluster, or a field of the runtime that several fibers
read, as `locks` of the process or `waker` of a deployment. `bun scripts/premise-pairs.ts --tables` lists, for each
table, the declarations that write it and those that read it, with the notes each cites. A session reads one state,
or a few that one statement writes together, with thirty notes at most, as an area. The roadmap's step lists the
states and the order. Start it with this brief, with its three places filled in:

```text
You are a reviewer of this repository's notes, reading one shared state of the code. Follow this brief exactly.

Read AGENTS.md first: it says how notes, premises (`What it rests on`), tests and spikes work, and its rules bind
you. The notes are in docs/decisions/ and docs/decisions/archive/, indexed in docs/decisions/README.md, which lists
for each note the notes that changed it.

THE KIND OF BUG: a writer, a reader or a deleter of one state needs a condition from the others, written in its note
or not, and another of them does not give it. The two may be decided by notes that never name each other, and the
condition may hold only while three of them act together. It often fails where a value is taken to its end (0, the
moment itself, 'forever', none, unbounded), where a second actor comes (another runner, another caller, a sweep, an
operator, a deploy of a newer version), or where a row is deleted or read at another time. Decision 0248 is one found
and fixed, a row of Cluster's deleted before another client read it: read it as the example, and do not report it
again.

WHAT TO READ: the state <the state>, with these places of src/: <the writers and readers, with their notes, from
`bun scripts/premise-pairs.ts --tables`, or the fields of the runtime and the modules that touch them>.

ALREADY FOUND, not to report again: every bug of docs/bugs.md, and the open questions of docs/open-questions.md. Read that file before you
start. A bug of the same form under another sequence is a new finding, and so is a fix of a bug of the file that does
not hold.

HOW:
1. List every place of src/ that writes the state, deletes from it or reads it, before you read any note: by the
   list above, and by `grep` of the state's name in src/, since a place that cites no note is listed too. For each
   place, the notes its comments cite. Write them as the table of your report, one row a place, before step 2.
2. For each place, read its code and the notes it cites whole, with their `What it rests on`. Write down what the
   place needs of the others to be safe, the unwritten too: a row still there when it reads, a time longer than an
   interval, a count below a bound, an order of two commits, one actor at a time.
3. For each need, ask whether every other place gives it, alone and together, in every case its notes open. A place
   that cites no note is held to what the notes of the others need.
4. A suspect is a finding only once you have tried to confirm it: a test that fails, written beside the module it
   tests with the helpers of src/runtime.test_shared.ts or of src/cluster.test.ts (its `onFile`, `start` and
   `withholding` make two runners on one file deterministic). A reading of the code alone, or of a dependency's
   source, gives a lead and no finding: report it as a lead, with the test that would reproduce it. Where no
   PostgreSQL server runs, a test of src/postgres.test.ts is written and said not run, and it stays a lead until the
   CI's job of PostgreSQL runs it.
5. A suspect is ruled out by a test only under the seeds the test ran. So a test of concurrency that rules a suspect
   out runs under `SCHEDULES=all`, and the report names the test, the seeds and `SCHEDULES`.

RULES: fix nothing, write no decision note, and change no file of docs/ or src/ other than tests that reproduce a
finding and your report. Name each such test `FAILING: …`. Write your report as a section at the end of
docs/decisions/reviews.md, headed `## <date>: premise review of the state <the state>`. Commit the tests and the
report on your branch, and push nothing. Other reviewers may run at the same time in other worktrees: do not touch
main or their branches.

YOUR REPORT, the deliverable, in this order:
- The table of step 1: each place, what it does to the state (writes, deletes, reads), its notes, and how you read
  them: whole with the code, or in part (say which part).
- Each need of step 2 that another place does not give, as a finding with its test and commit, or as a lead with the
  test that would reproduce it: the places, their notes, the sequence that breaks, and where a fix could begin.
- The suspects you ruled out, each with its reason in a line: the test, its seeds and `SCHEDULES`, or the
  documentation of the version pinned.
- Every suspect you noticed and did not check, with the sequence you suspect, and why it is left.
- Each place where the code does otherwise than the note it cites, and each place that cites no note though a rule
  keeps it, with the file and line.
- The notes you did not read whole, and why.
Your last message says the branch, the commit and the findings in a few lines, and that the report is in
docs/decisions/reviews.md of the branch.
```

## What to do with the report

- Read the report from the branch, `git show <branch>:docs/decisions/reviews.md`, not from the last message alone,
  which says less.
- Read the report's table before its findings. A note of the brief's list read in part, or a later note the brief
  gave and the report does not say it read against the areas it cites, is a gap: send the reviewer back to read it,
  on the same branch, before you record the report. On 2026-11-11 three of eighteen reviewers were sent back, and
  two of them found a bug more.
- Run the reviewer's failing tests yourself before you tell the maintainer of a finding. A report is the
  reviewer's, and no proof. A test that fails by an error of its own setup, and not at its assertion, proves
  nothing: read the line it stops at. A finding measured without a test, as a mutation that `bun test` does not
  kill, is measured again on `main` the same way.
- A suspect the report rules out by a test of concurrency names the test's seeds and `SCHEDULES`. One that names
  none, or that ran under the sample of `bun test`, is a lead: run the test under `SCHEDULES=all` before you record
  it as ruled out.
- Two reviewers may find one bug. It is one bug of `docs/bugs.md`, with both tests.
- Run each test again on the last commit of `main` where the reviewer's branch was cut before it.
- Every finding is a bug of [`docs/bugs.md`](../../../docs/bugs.md), reproduced, added at the end of its
  list and to a family where it has the family's form. A bug names the branch, the commit and the tests, and where the fix begins. Its fix is a note that
  changes the earlier one, with the test, taken as `AGENTS.md` says.
- A lead, and a suspect the reviewer noticed and did not check, are no bugs yet. Write the test that would reproduce
  each, here or in a session of its own, and run it, in the CI's job of PostgreSQL where it needs a server: a test
  that fails makes it a bug of `docs/bugs.md`, and one that passes rules it out. A lead no test can reach yet, and a
  finding whose fix is a choice of the design, are questions of
  [`docs/open-questions.md`](../../../docs/open-questions.md), with what would decide them, and not bugs of
  `docs/bugs.md` (`AGENTS.md`, under Notes).
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
