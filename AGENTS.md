# effect-tea-persistent — guide for coding agents

This repository is a design and its pure core, not a library yet: read [`README.md`](README.md), then
[`docs/design.md`](docs/design.md), with [`docs/glossary.md`](docs/glossary.md) at hand. What to do next is the first step of [`docs/roadmap.md`](docs/roadmap.md).

## Prose and commits

- All code, comments, identifiers, commit messages and `.md` files are in **English**.
- A commit made with an AI agent ends with an `Assisted-by: <model>` trailer, never `Co-Authored-By`.
- A commit message stays short: a subject line of at most 72 characters in the imperative, and a body only
  where the diff cannot say it, four lines at most. Why a change was taken belongs in `docs/`, not in the message.
- A commit's subject starts with the module or area it changes, then a concrete action:
  `runtime: interrupt children when a run ends, without yielding`. The area is a module's path under `src/` without
  its extension, as `runtime/loop` for a module in a folder, or `docs`, `examples`, `spikes` or `scripts`. A commit
  across several modules of a group names the group, as `runtime`, and a commit across several areas names the one
  it is about.
- Prose states its conclusion first, one sentence per idea, without chains of subordinate clauses. This holds for
  `.md` files, comments and commit bodies.
- Every document and comment is written for a person who reads it for the first time, with no note at hand, and
  is understood on one reading. The sentence says the rule in full, in the glossary's words, and a citation says
  where its why is, never what the rule is. A reader finds a rule by the headings, and understands a paragraph
  without following its links. A sentence a reader must read twice is the sentence's defect: a pronoun, `one` or
  `its` names something in the same sentence; a sentence held together by a colon and a dash is two sentences; a
  noun left out for the reader to supply is written.
- A page of the guide is checked by a reader who has not seen the code, who builds a program for a requirement no
  example holds from the README and `docs/` alone. The reader is a subagent only once the maintainer agrees, and
  [`.claude/skills/guide-reader/SKILL.md`](.claude/skills/guide-reader/SKILL.md) is the procedure, with its brief.
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
- A step under way is continued by a session that knows nothing of the session before it. So before a session
  proposes to move to the next part of a step, the repository says how to continue: the step in the roadmap names
  the parts done and the part next, and the step's `proposed` notes say what the parts done decided. What only the
  conversation holds is written there first: a premise found, a test still red, a choice the maintainer made in
  chat, work left uncommitted. A session that cannot name the file where the next part begins has not finished
  the part it is on.
- A note moves to `docs/decisions/archive/` once the document that says what holds of it does: `docs/design.md`
  for the design, `README.md` for the project. A note of a step the roadmap still holds stays. A note a later note
  changes may move without it: its status line links the note that changes it, wherever that one is. The index
  lists an archived note under its path in `archive/`, and each release moves what has come to be covered since. `bun run links` checks every
  link of the `.md` files.
- A note lists, in a section `What it rests on`, each premise its decision falls without, and says of each whether it
  is tested (naming the test), documented, seen in a spike, read in a dependency's source, or chosen. A
  rule that holds only by a margin, such as a time longer than an interval, lists the margin as a premise, with the
  value it depends on. A note that changes another reads the premises of the note changed, and says of each whether
  it still holds. A note that adds a wait, a refusal or a delay to code that other notes decide finds those notes by
  the citations of that code, as `waker`, `settled` or `quiet`, and reads their premises as if it changed them, even
  where it does not say it changes them. Decision 0274 refused the waker's activation until `retry` and took away a
  premise of decision 0068 that no note wrote, which only `bun run test:release` found. A review of the notes already taken, for a premise a later note took away, follows
  [`.claude/skills/premise-review/SKILL.md`](.claude/skills/premise-review/SKILL.md).
- A premise about what code does when it runs is never only reasoned, whether the code is the library's, a
  dependency's or a database's. Before its note is taken, the premise is tested, documented in the version pinned,
  or seen in a spike. A test written and not run, as a test of `bun run test:postgres` on a machine with no server,
  is not run yet: it runs in the job of the CI that runs it, on the push of `main` that takes the note. A job that
  fails there is the next commit's work, before any other. A premise that
  no test can reach yet does not hold a decision up. The decision is taken with a guard that makes the premise
  unneeded, or it waits, and the premise goes in `docs/open-questions.md` as the question that holds it. A reasoned
  premise of a note taken costs a bug found late, and a reasoned finding costs its analysis twice, so the check is
  paid once, before.
- A case the decision leaves out, such as a second name that a symbolic link gives a directory, is no premise. The
  note says that the decision leaves the case out, and the case goes in `docs/open-questions.md`.
- A premise that is a judgment, such as a default an operator wants or what a design that was rejected costs, is
  `chosen`, not reasoned. The note says who chose it, the maintainer or the note itself. No test can make a judgment
  fall, so a review of the premises does not read it.
- A review reports a finding only once it is reproduced by a test that fails, or ruled out by a test that passes or
  by the documentation of the version pinned. A reading of the code alone gives a lead, not a finding, and the
  session that holds the lead turns it into a test or drops it. A lead no test can reach yet goes in
  `docs/open-questions.md`, with what would decide it, and not in `docs/bugs.md` as a bug.
- A test of `src/form.test.ts` refuses the words `reasoned` and `not run` in the section `What it rests on` of every
  note numbered 0258 or above. The notes taken before keep their premises as written, and a review reads those
  first.
- Each premise of the section `What it rests on` writes its state in bold, as one word of a closed set: `tested`,
  `documented`, `seen`, `read`, `read in the source`, `chosen`, `failed` or `open`. A premise not checked yet is
  `open`, and says what would check it. It is never written `to be **tested**`, which a reader who scans the bold
  words reads as tested. A test of `src/form.test.ts` checks it for every note numbered 0259 or above, and the notes
  taken before keep their premises as written.
- A premise about a dependency is looked up first in the documentation of the version pinned, for Effect its JSDoc
  in `node_modules/effect/src`: found, it is documented; not found, the note says so. A rule that loses data in
  silence if a behaviour not promised changes does not rest on it alone, where a guard of the library's is cheap;
  otherwise the premise goes in `docs/open-questions.md`.
- A spike is a test in `spikes/`, run by `bun run test:spikes` at the pinned version, and by a job of the CI of its
  own on every push. `bun test` runs no spike, as `bunfig.toml` says
  ([decision 0250](docs/decisions/0250-bun-test-holds-its-budget-by-samples-and-runs-of-their-own.md)). A premise about what a dependency does
  when it runs is tested, documented or seen in one before its note is taken. A premise that no spike can run yet
  holds no decision up, as the rule above on premises of what code does says.
- A dependency is never changed by hand: not in `node_modules`, not in bun's cache, not with a patch of the package
  manager, not for a spike. A fix the library needs is waited for in a release of the library. Until then the code
  works around it, as [decision 0116](docs/decisions/archive/0116-an-entitys-wait-ends-with-an-item-of-its-queue.md) does,
  and the premise goes in `docs/open-questions.md`. A test run against a changed dependency proves nothing: a seed
  draws its schedule from the code it runs, and the suite is red or green for a reason the repository does not hold.
- A promise of a stable API of Effect, in the JSDoc of the version pinned, is trusted within the major: a premise
  that rests on it needs no spike, no test and no comparison between releases. effect.website, Effect's blog and its
  maintainers' answers are tied to no release, and make no premise documented. A move of Effect's version pins
  `effect` and every `@effect/` package together, the drivers of PostgreSQL `@effect/sql-pg` and `@effect/sql-pglite`
  among them, as a test of `src/form.test.ts` checks. It runs `bun scripts/compare-docs.ts <old> <new>` and puts what it
  found of Cluster in `docs/cluster.md` and the rest in the commit's body, runs the spikes, writes the fixture of the
  new release with `scripts/write-cluster-fixture.ts` and commits it, and reads Effect's release policy again, naming
  the commit read in the script's comment. Until the first release, a move may drop the fixtures older than the
  release it leaves; from then on every fixture stays. A move to a new major reads every premise again. A move at
  which a test of `src/storage.test.ts` finds the partition of an id apart from Cluster's formula on `Hash.string` is
  not taken, and the pinned values of the partition are never updated to pass. The move waits for a note that decides
  a migration of the partitions
  ([decision 0273](docs/decisions/0273-the-partition-of-an-entity-is-the-librarys-own-hash.md)).
- Once fifteen notes are taken since the last review, a review reads them before the next step starts, from
  `reasoned` up, in a session that did not write them. What it finds is a note, a test, a fix or an open question,
  and the review is a section of [`docs/decisions/reviews.md`](docs/decisions/reviews.md): its date and the notes
  read, then one bullet per kind of finding.
  [`scripts/mutate.ts`](scripts/mutate.ts) takes out, one at a time, the rules a review writes as mutations, and runs
  the tests and the compiler against each. It runs in two passes: first the schedules `bun test` runs, then every
  seed, under `SCHEDULES=all`, for each mutation the first pass leaves alive. A kill of the first pass is a test of
  `bun test` that fails, so it holds under every seed. So a test reads `SCHEDULES` only for how many cases it runs, none
  included. A kill of the second pass is a rule that only `bun run test:release` holds. A rule no
  mutation takes out is not checked by it: a review writes one for each rule its notes decide that the code keeps,
  and keeps them outside the repository. A survivor is a rule no test holds, or a mutation that changes nothing,
  which only reading tells apart; an `uncertain` one failed only under load, and is read as a survivor.

## Code and tests

- The examples import the library as a user does, by the package's name and its entries:
  `@fgaudo/effect-tea-persistent`, `@fgaudo/effect-tea-persistent/program`, `@fgaudo/effect-tea-persistent/testing`
  and `@fgaudo/effect-tea-persistent/cluster`. The `exports` of `package.json` resolve each to its file of `src/`, so
  the examples run on the sources with no build. A module that declares a program imports from
  `@fgaudo/effect-tea-persistent/program`, so that it shows the import a browser can load. A test of the form of
  `src/` fails on an example that imports a file of `src/`. When the design changes, the code,
  its tests and the examples change with it, and `bun run typecheck`, `bun test` and `bun run links` pass.
- The library's tests run on programs of [`src/fixtures/`](src/fixtures), copied from the examples once, and import
  no example, so that a change of an example breaks no test of the library. A test of the form of `src/` checks it.
- A file that only tests import is named `<module>.test_<role>.ts`, beside the module whose tests it serves, as
  `src/runtime.test_shared.ts`. `bun test` runs no such file, the checks of the library's rules read none, and no
  module of the library imports one, as a test of the form of `src/` checks
  ([decision 0241](docs/decisions/0241-a-group-of-modules-lies-in-a-folder-entered-by-the-module-of-its-name.md)).
- Before code adds a helper, a data structure or a coordination of fibers, it looks in `node_modules/effect/src`
  for a module of the pinned version that does the same, among the modules marked `@stability unstable` too. A
  primitive of Effect is used where it does the same, since its contract is in its JSDoc and needs no test of its
  own. Code written by hand where such a module exists says, in a comment, what the module does not do. A module
  marked `@stability unstable` that `src/` does not import yet is used only once the maintainer agrees, since
  every unstable module the library depends on can change under it within the major.
- [`src/machine.ts`](src/machine.ts) is the runtime's semantics. A rule it adds or changes is a decision, and
  [`src/machine.test.ts`](src/machine.test.ts) has a test that fails without it.
- The runtime is [`src/runtime.ts`](src/runtime.ts) and the modules it is divided into, in
  [`src/runtime/`](src/runtime): `process.ts`, `loop.ts`, `callers.ts`, `doors.ts`, `waker.ts` and `readings.ts`. A
  module outside the runtime imports `src/runtime.ts` alone, as a test of the form of `src/` checks
  ([decision 0241](docs/decisions/0241-a-group-of-modules-lies-in-a-folder-entered-by-the-module-of-its-name.md)). A change to the runtime that adds or moves a
  wait, a lock, a fork, or state another fiber reads has a test that fails or hangs without it, run against the
  code before the change. The test lies beside the module it tests, in `src/runtime/`, or in
  [`src/runtime.test.ts`](src/runtime.test.ts) where it tests `src/runtime.ts` or what several modules keep together,
  and what the tests share is in [`src/runtime.test_shared.ts`](src/runtime.test_shared.ts). The scheduler of the tests, in [`src/testing.ts`](src/testing.ts), is how a
  test moves the points where fibers yield. Where the interleaving cannot be reached, the decision says why, and why
  the change holds. A test under `explored` runs one seed in twenty, from seed 0, so that the suite runs in seconds;
  `bun run test:release` runs them all, and a release passes it. A step of the roadmap that changes the runtime
  or `src/testing.ts` passes `bun run test:release` before it is taken, since some rules of concurrency fail only
  past the first hundred seeds. A commit that changes the runtime or `src/testing.ts` first runs, under
  `SCHEDULES=all`, the files of the tests of the modules it changes, and `bun run test:slow` where it changes what
  Cluster runs, since `bun test` runs a sample and skips the tests under `slow`. A schedule under `bound` 1 is exhaustive within its bound under the release, which
  runs every deviation; any other run runs one in twenty, from the first, and the deviations listed under `pinned`,
  as `{ decision, choice }`. `bun test` and the release start from seed 0, so that each of their runs
  replays the same schedules. `bun run test:explore` looks for the bugs those schedules miss: it runs every seed of
  the explored tests from a random first seed, again and again, until a run fails or it is stopped. A failure names
  its seed, and `SEED=<seed> bun test` runs the test's pinned seeds, then that seed and the seeds after it. Once the
  bug a seed found is fixed, the seed is listed under `pinned` in its test, so that every run of the tests runs it.
  An explored test whose comment names an interleaving pins a seed that finds it, and
  [`src/runtime.test_pins.ts`](src/runtime.test_pins.ts) holds, for each such test, the mutation that takes its
  rule out. `bun run test:pins` runs each test under its pinned seeds alone, under `SCHEDULES=pinned`, and fails
  unless the test passes on the code and fails on the mutation, and a test of `src/form.test.ts` checks that every
  test with a seed pinned has its pin
  ([decision 0254](docs/decisions/0254-a-check-of-the-project-runs-against-the-case-it-refuses.md)). A seed draws its
  schedule from the yields of the code it runs, so a change that adds or moves a yield in the runtime or in
  `src/testing.ts` may lose a pinned seed's interleaving, and `bun run test:pins` says which. For each, the change
  makes the pin's mutation, runs `bun run test:explore -t <test>` until a seed fails, and pins that seed, with the
  comment saying the form of the code it fails against. An interleaving that no seed of 2,000 finds is held by a
  deviation under `bound` 1, by a greater depth, or goes in `docs/open-questions.md` as a rule no test holds.
- A change that deletes rows of Cluster's, or moves the time they are deleted at, has a test with a second client,
  on another runner, that waits for the request whose rows go. The runtime deletes those rows by statements of its
  own, and a client of another runner reads its reply from them at an interval.
- A test of the library is of one of four kinds, and a test of none of them is not added. A test of the machine's
  semantics lies in `src/machine.test.ts`, one for each rule a note decides. A test of invariants runs histories
  that fast-check generates, of messages, crashes, deploys and timers, on the rehearsal and on the runtime under the
  scheduler, and checks the promises of the design on each. A test of a rule of concurrency runs the runtime under
  the scheduler of `src/testing.ts`, with its pinned seeds. A test of a contract runs one set of requests alike on
  each storage and on Cluster. A bug found is held by a case of one of the four: a rule of the machine, an
  invariant, a rule of concurrency or a contract. It gets a scenario of its own only where none of the four can
  hold it. Until the test of invariants exists, a step of [`docs/roadmap.md`](docs/roadmap.md), a bug that an
  invariant would hold gets a test of the kind nearest to it. Spikes and the checks of form, as the links, the
  guide's code and the form of `src/`, are no tests of the library's correctness, and are kept apart from the four.
- `bun test` runs within two minutes on one machine, and no test of it runs over two seconds. A test that would
  run longer reads `SCHEDULES` for how many cases it runs, as the explored tests do, so that `bun test` runs a
  sample and `bun run test:release` runs them all. A test of one case that would run longer, on a clock that is real
  or on a case too large to divide, is declared with `slow` of `src/runtime.test_shared.ts`: `bun test` skips it, and
  `bun run test:release` runs it. `bun run test:slow` runs, under `SCHEDULES=all`, the files whose tests wait on a
  clock that is real, in a job of the CI on every push. `bun test --reporter=junit --reporter-outfile=<file>` gives
  each test's time
  ([decision 0250](docs/decisions/0250-bun-test-holds-its-budget-by-samples-and-runs-of-their-own.md)).
- A decision that takes a value to its end, such as a time of 0 or of the moment itself, has a test at that value,
  with every caller the rule is about.
- The workflow [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs the checks on Linux on every push and
  pull request: `bun audit`, `bun run typecheck`, `bun run links`, and the audit and the build of the site. It runs
  `bun test` in four jobs at once, each with `--shard`, and a test of the workflow's form checks that the jobs run
  every shard ([decision 0242](docs/decisions/0242-the-ci-deals-the-files-of-the-tests-among-four-jobs.md)).
  `bun test` on one machine stays one run. `bun run test:parallel` runs the suite under eight workers, for a quicker
  run while a change is under way, and a commit passes `bun test`. A job runs `bun run test:spikes`, another
  `bun run test:slow`, and another `bun run test:pins`, and a test of the workflow's form checks them, reading every
  key of the workflow. Another job runs `bun run test:postgres` against a container of
  PostgreSQL, and `spikes/full-volume.test.ts` on a volume of fixed size it mounts. A change of the storage, of a transaction of the
  runtime or of a statement passes that job too, on the push of `main`, since PGlite runs one session and hides what
  a pool does. Run by hand from the repository's Actions, the workflow also runs `bun run test:release`, in four jobs
  as `bun test`, and a release passes it there. The site's audit ignores one advisory of minimatch, since TypeDoc's range excludes the version
  with the fix. The workflow's comment says when the ignore goes.
- Bun is pinned by `packageManager` in `package.json`, and the workflow installs that version, so that a run of the
  workflow gives what a run on the maintainer's machine gives. A move of Bun's version runs the spikes on the new
  version. A spike checks what a decision rests on, never a detail of the version it ran at, so that a move of Bun
  or of Effect fails it only where a premise fell.
- A word the design gives a meaning of its own is defined once, in [`docs/glossary.md`](docs/glossary.md); a change
  that adds, renames or drops one changes it in the same commit. A section of `docs/design.md` longer than a screen
  has subsections, so that a reader finds a rule by its heading.
- Four diagrams show the design. The diagram of [`README.md`](README.md) is an entity's loop, for a reader who
  knows nothing of the design. The diagram under A program in [`docs/design.md`](docs/design.md) is the same loop
  whole, with children, the bound of callers' messages and every reply. The diagram of
  [`docs/concepts.md`](docs/concepts.md) is the life of an entity: loaded, unloaded and suspended. The diagram of
  [`CONTRIBUTING.md`](CONTRIBUTING.md) is the modules of `src/`, with the storage's tables. A change that adds,
  removes or renames a piece of a program, a message, a flow, a module or a table a diagram shows changes that
  diagram in the same commit.
- The design follows effect-tea's Guide (`README.md` of `github.com/fgaudo/effect-tea`) wherever the Guide
  applies; `docs/design.md` says where a server departs from it, and why.
- The site is built by [`site/build.ts`](site/build.ts) with TypeDoc, pinned with its TypeScript in
  `site/package.json`, as effect-tea's site is. A warning of TypeDoc fails the build. So every export of the four
  entries has a doc comment, which says what it takes and gives, and every link of a page resolves. A name that
  TypeDoc infers and that no declaration holds is excused in `site/typedoc.json`, and an export never is. A change
  of `src/`, of the guide or of an example builds the site before it is committed. The workflow
  [`.github/workflows/docs.yml`](.github/workflows/docs.yml) deploys the site to GitHub Pages from `main`, once
  `ci.yml` passes on it.
- Each example has a `README.md`: its title, a paragraph on what it shows, and a line for each of its files. The
  site's page of an example is that README, followed by its files.
- A block of TypeScript of the guide or of the README is code of an example, cut at elisions, and the test
  `the guide's code is found in the examples, part by part` in `src/form.test.ts` checks it
  ([decision 0203](docs/decisions/0203-the-guides-code-is-found-in-the-examples.md)).
