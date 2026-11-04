# effect-tea-durable — guide for coding agents

This repository is a design and its pure core, not a library yet: read [`README.md`](README.md), then
[`docs/design.md`](docs/design.md), with [`docs/glossary.md`](docs/glossary.md) at hand. What to do next is the first step of [`docs/roadmap.md`](docs/roadmap.md).

## Prose and commits

- All code, comments, identifiers, commit messages and `.md` files are in **English**.
- A commit made with an AI agent ends with an `Assisted-by: <model>` trailer, never `Co-Authored-By`.
- A commit message stays short: a subject line of at most 72 characters in the imperative, and a body only
  where the diff cannot say it, four lines at most. Why a change was taken belongs in `docs/`, not in the message.
- A commit's subject starts with the module or area it changes, then a concrete action:
  `runtime: interrupt children when a run ends, without yielding`. The area is a module of `src/` without its
  extension, or `docs`, `examples`, `spikes` or `scripts`. A commit across several names the one it is about.
- Prose states its conclusion first, one sentence per idea, without chains of subordinate clauses. This holds for
  `.md` files, comments and commit bodies.
- Every document and comment is written for a person who reads it for the first time, with no note at hand, and
  is understood on one reading. The sentence says the rule in full, in the glossary's words, and a citation says
  where its why is, never what the rule is. A reader finds a rule by the headings, and understands a paragraph
  without following its links. A sentence a reader must read twice is the sentence's defect: a pronoun, `one` or
  `its` names something in the same sentence; a sentence held together by a colon and a dash is two sentences; a
  noun left out for the reader to supply is written.
- A comment stands where the code alone does not say why: a wait, a lock, a fork, an order of statements that
  matters, a guard against a case a reader would not think of, a check that something else relies on. It says what
  the code keeps and why, in a sentence, and cites the note for the rest. A line a reader understands from its
  names gets none.
- A comment that keeps a rule cites the note that decides it, the latest on that point, as `decision 0029`. A
  commit that adds a note which changes another reads the comments that cite the one changed, and moves the
  citation where the point moved. A rule is said once: the comment of the surface that promises it says the
  contract, and the comment of what keeps it says only what it adds.

## Notes

- A decision gets a note in `docs/decisions/` when a premise it rests on can fall, or when an API, a test or a
  semantics of the code keeps it: the design, the runtime and what the testing module promises are decided by notes.
  A note is numbered in order and never rewritten once taken: a decision that changes is a new note that says which
  one it replaces. A threshold, a procedure or a choice of tooling whose reason fits in a sentence is a rule of
  work: this file states it, a change of it is a commit to this file, and git keeps what it was. A number is never
  given again, so a number with no note was a rule of work's, a record of a move of Effect's version, a note
  deleted once no document needed it, or never used. A citation of a deleted note says what it decided, and reads
  `decision 0082 (deleted; git keeps it)`; `bun run links` checks every citation, in prose as in a comment. A note
  made for a step of the roadmap is `proposed`, and is rewritten in place while the step is under way; it is
  taken, `accepted`, by the commit that takes the step out of the roadmap. Any other note is taken by the commit
  that adds it, with the code it decides, if any. Once a note is taken, only a link a later rename breaks is fixed
  in it, and its status line grows: a consequence found later, a correction or a rule it missed is a new note that
  says which one it changes, and adds to that one's status line what changed and a link to itself. A note that
  only says how another holds elsewhere links it from its own status line alone. Each note is listed in
  [`docs/decisions/README.md`](docs/decisions/README.md) by what it decides, with the notes that changed it,
  updated by the commit that adds or changes a note. A question not decided yet goes in
  `docs/open-questions.md`, as the question in a few sentences and, as bullets, what would decide it; an
  analysis longer than that is a spike. It leaves the file when a note decides it. A step of the roadmap leaves it when done.
  The roadmap holds only the steps ahead: what a done step decided is in its notes, and is not retold there.
- A note moves to `docs/decisions/archive/` once the document that says what holds of it does: `docs/design.md`
  for the design, `README.md` for the project. A note of a step the roadmap still holds stays. A note a later note
  changes may move without it: its status line links the note that changes it, wherever that one is. The index
  lists an archived note under its path in `archive/`, and each release moves what has come to be covered since. `bun run links` checks every
  link of the `.md` files.
- A note lists, in a section `What it rests on`, each premise its decision falls without, and says of each whether it
  is tested (naming the test), documented, seen in a spike, read in a dependency's source, or only reasoned.
- A premise about a dependency is looked up first in the documentation of the version pinned, for Effect its JSDoc
  in `node_modules/effect/src`: found, it is documented; not found, the note says so. A rule that loses data in
  silence if a behaviour not promised changes does not rest on it alone, where a guard of the library's is cheap;
  otherwise the premise goes in `docs/open-questions.md`.
- A spike is a test in `spikes/`, run by `bun test` at the pinned version. A premise about what a dependency does
  when it runs is tested, documented or seen in one before its note is taken; what no spike can run yet says what
  would check it, and goes in `docs/open-questions.md`.
- A promise of a stable API of Effect, in the JSDoc of the version pinned, is trusted within the major: a premise
  that rests on it needs no spike, no test and no comparison between releases. effect.website, Effect's blog and its
  maintainers' answers are tied to no release, and make no premise documented. A move of Effect's version pins
  `effect` and `@effect/sql-sqlite-bun` together, runs `bun scripts/compare-docs.ts <old> <new>` and puts what it
  found of Cluster in `docs/cluster.md` and the rest in the commit's body, runs the spikes, writes the fixture of the
  new release with `scripts/write-cluster-fixture.ts` and commits it, and reads Effect's release policy again, naming
  the commit read in the script's comment. Until the first release, a move may drop the fixtures older than the
  release it leaves; from then on every fixture stays. A move to a new major reads every premise again.
- Once fifteen notes are taken since the last review, a review reads them before the next step starts, from
  `reasoned` up, in a session that did not write them. What it finds is a note, a test, a fix or an open question,
  and the review is a section of [`docs/decisions/reviews.md`](docs/decisions/reviews.md): its date and the notes
  read, then one bullet per kind of finding.
  [`scripts/mutate.ts`](scripts/mutate.ts) takes out, one at a time, the rules a review writes as mutations, and runs
  the tests and the compiler against each. A review runs it with `SCHEDULES=all`, so that every seed runs. A rule no
  mutation takes out is not checked by it: a review writes one for each rule its notes decide that the code keeps,
  and keeps them outside the repository. A survivor is a rule no test holds, or a mutation that changes nothing,
  which only reading tells apart; an `uncertain` one failed only under load, and is read as a survivor.

## Code and tests

- The examples import the library from `src/`. When the design changes, the code, its tests and the examples
  change with it, and `bun run typecheck`, `bun test` and `bun run links` pass.
- Before code adds a helper, a data structure or a coordination of fibers, it looks in `node_modules/effect/src`
  for a module of the pinned version that does the same, among the modules marked `@stability unstable` too. A
  primitive of Effect is used where it does the same, since its contract is in its JSDoc and needs no test of its
  own. Code written by hand where such a module exists says, in a comment, what the module does not do. A module
  marked `@stability unstable` that `src/` does not import yet is used only once the maintainer agrees, since
  every unstable module the library depends on can change under it within the major.
- [`src/machine.ts`](src/machine.ts) is the runtime's semantics. A rule it adds or changes is a decision, and
  [`src/machine.test.ts`](src/machine.test.ts) has a test that fails without it.
- A change to [`src/runtime.ts`](src/runtime.ts) that adds or moves a wait, a lock, a fork, or state another
  fiber reads has a test in [`src/runtime.test.ts`](src/runtime.test.ts) that fails or hangs without it, run
  against the code before the change. The scheduler of the tests, in [`src/testing.ts`](src/testing.ts), is how a
  test moves the points where fibers yield. Where the interleaving cannot be reached, the decision says why, and why
  the change holds. A test under `explored` runs one seed in twenty, from seed 0, so that the suite runs in seconds;
  `bun run test:release` runs them all, and a release passes it. A step of the roadmap that changes `src/runtime.ts`
  or `src/testing.ts` passes `bun run test:release` before it is taken, since some rules of concurrency fail only
  past the first hundred seeds. A schedule under `bound` 1 runs whole in every run,
  since it is exhaustive within its bound. `bun test` and the release start from seed 0, so that each of their runs
  replays the same schedules. `bun run test:explore` looks for the bugs those schedules miss: it runs every seed of
  the explored tests from a random first seed, again and again, until a run fails or it is stopped. A failure names
  its seed, and `SEED=<seed> bun test` runs that seed first. Once the bug a seed found is fixed, the seed is listed
  under `pinned` in its test, so that every run of the tests runs it.
- A word the design gives a meaning of its own is defined once, in [`docs/glossary.md`](docs/glossary.md); a change
  that adds, renames or drops one changes it in the same commit. A section of `docs/design.md` longer than a screen
  has subsections, so that a reader finds a rule by its heading.
- The two diagrams in [`README.md`](README.md) show an entity's loop and the modules of `src/`. A change that
  adds, removes or renames a piece of a program, a message, a flow, a module or a table they show changes them
  in the same commit.
- The design follows effect-tea's Guide (`README.md` of `github.com/fgaudo/effect-tea`) wherever the Guide
  applies; `docs/design.md` says where a server departs from it, and why.
