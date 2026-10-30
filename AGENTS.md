# effect-tea-durable — guide for coding agents

This repository is a design, not a library yet: read [`README.md`](README.md), then
[`docs/design.md`](docs/design.md).

- All code, comments, identifiers, commit messages and `.md` files are in **English**.
- A commit made with an AI agent ends with an `Assisted-by: <model>` trailer, never `Co-Authored-By`.
- A decision gets a note in `docs/decisions/`, numbered in order and never rewritten once taken: a decision
  that changes is a new note that says which one it replaces. A question not decided yet goes in
  `docs/open-questions.md`, and leaves it when a note decides it.
- `examples/api.ts` holds declarations only. When the design changes, the API and the examples change with it,
  and `bun run typecheck` passes.
- The design follows effect-tea's Guide (`README.md` of `github.com/fgaudo/effect-tea`) wherever the Guide
  applies; `docs/design.md` says where a server departs from it, and why.
