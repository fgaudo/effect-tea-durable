# effect-tea-durable — guide for coding agents

This repository is a design and its pure core, not a library yet: read [`README.md`](README.md), then
[`docs/design.md`](docs/design.md). What to do next is the first step of [`docs/roadmap.md`](docs/roadmap.md).

- All code, comments, identifiers, commit messages and `.md` files are in **English**.
- A commit made with an AI agent ends with an `Assisted-by: <model>` trailer, never `Co-Authored-By`.
- A decision gets a note in `docs/decisions/`, numbered in order and never rewritten once taken: a decision
  that changes is a new note that says which one it replaces. A question not decided yet goes in
  `docs/open-questions.md`, and leaves it when a note decides it. A step of the roadmap leaves it when done.
- The examples import the library from `src/`. When the design changes, the code, its tests and the examples
  change with it, and `bun run typecheck` and `bun test` pass.
- [`src/machine.ts`](src/machine.ts) is the runtime's semantics. A rule it adds or changes is a decision, and
  [`src/machine.test.ts`](src/machine.test.ts) has a test that fails without it.
- The design follows effect-tea's Guide (`README.md` of `github.com/fgaudo/effect-tea`) wherever the Guide
  applies; `docs/design.md` says where a server departs from it, and why.
