# effect-tea-durable — guide for coding agents

This repository is a design and its pure core, not a library yet: read [`README.md`](README.md), then
[`docs/design.md`](docs/design.md), with [`docs/glossary.md`](docs/glossary.md) at hand. What to do next is the first step of [`docs/roadmap.md`](docs/roadmap.md).

- All code, comments, identifiers, commit messages and `.md` files are in **English**.
- A commit made with an AI agent ends with an `Assisted-by: <model>` trailer, never `Co-Authored-By`.
- A commit message stays short: a subject line of at most 72 characters in the imperative, and a body only
  where the diff cannot say it, four lines at most. Why a change was taken belongs in `docs/`, not in the message.
- A commit's subject starts with the module or area it changes, then a concrete action:
  `runtime: interrupt children when a run ends, without yielding`. The area is a module of `src/` without its
  extension, or `docs`, `examples`, `spikes` or `scripts`. A commit across several names the one it is about.
- Prose states its conclusion first, one sentence per idea, without chains of subordinate clauses. This holds for
  `.md` files, comments and commit bodies.
- A comment that keeps a rule cites the note that decides it, the latest on that point, as `decision 0029`. A
  commit that adds a note which changes another reads the comments that cite the one changed, and moves the
  citation where the point moved. A rule is said once: the comment of the surface that promises it says the
  contract, and the comment of what keeps it says only what it adds.
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
  `docs/open-questions.md`, and leaves it when a note decides it. A step of the roadmap leaves it when done.
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
  and the review is listed in [`docs/decisions/reviews.md`](docs/decisions/reviews.md).
  [`scripts/mutate.ts`](scripts/mutate.ts) takes out, one at a time, the rules a review writes as mutations, and runs
  the tests and the compiler against each. A review runs it with `SCHEDULES=all`, so that every seed runs. A rule no
  mutation takes out is not checked by it: a review writes one for each rule its notes decide that the code keeps,
  and keeps them outside the repository. A survivor is a rule no test holds, or a mutation that changes nothing,
  which only reading tells apart; an `uncertain` one failed only under load, and is read as a survivor.
- The examples import the library from `src/`. When the design changes, the code, its tests and the examples
  change with it, and `bun run typecheck`, `bun test` and `bun run links` pass.
- [`src/machine.ts`](src/machine.ts) is the runtime's semantics. A rule it adds or changes is a decision, and
  [`src/machine.test.ts`](src/machine.test.ts) has a test that fails without it.
- A change to [`src/runtime.ts`](src/runtime.ts) that adds or moves a wait, a lock, a fork, or state another
  fiber reads has a test in [`src/runtime.test.ts`](src/runtime.test.ts) that fails or hangs without it, run
  against the code before the change. The scheduler of the tests, in [`src/testing.ts`](src/testing.ts), is how a
  test moves the points where fibers yield. Where the interleaving cannot be reached, the decision says why, and why
  the change holds. A test under `explored` runs one seed in twenty, from seed 0, so that the suite runs in seconds;
  `bun run test:release` runs them all, and a release passes it. A schedule under `bound` 1 runs whole in every run,
  since it is exhaustive within its bound.
- The two diagrams in [`README.md`](README.md) show an entity's loop and the modules of `src/`. A change that
  adds, removes or renames a piece of a program, a message, a flow, a module or a table they show changes them
  in the same commit.
- The design follows effect-tea's Guide (`README.md` of `github.com/fgaudo/effect-tea`) wherever the Guide
  applies; `docs/design.md` says where a server departs from it, and why.
