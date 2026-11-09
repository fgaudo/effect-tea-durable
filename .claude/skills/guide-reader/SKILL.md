---
name: guide-reader
description: Check the guide, or pages of it, by a reader who has never seen the code — a subagent that builds a program for a requirement no example holds, from the README and docs/ alone, and reports every gap. Use when the maintainer asks for a reader's check of the documentation, or when a step of the roadmap names one.
---

# A reader's check of the guide

A reader who has not seen the code builds a program from the documents alone, and what the reader gets wrong is
what the documents lack. The reader is a subagent of the session, started only once the maintainer has agreed to
it, as [`AGENTS.md`](../../../AGENTS.md) says.

## Before it starts

1. Ask the maintainer whether the reader is a subagent, unless the maintainer has just asked for one. Write the
   answer and its date in the step of [`docs/roadmap.md`](../../../docs/roadmap.md) the check belongs to, if any.
2. Choose a requirement that no example of `examples/` holds, and that needs every page the check is for. A
   requirement used by an earlier check is not used again: the rental of bikes, the gym membership and the loan of
   books are taken.
3. Make sure `scratch/` does not exist, since the reader writes there.

## The reader's brief

Start a `general-purpose` subagent with this brief, with the requirement and the pages filled in:

```text
You are a reader checking a library's documentation by building a program from it alone. The repository is
<the repository's path>.

RULES, strict:
- You may read README.md, CONTRIBUTING.md and anything under docs/. Start with docs/guide/README.md, then
  <the pages checked>. docs/design.md and docs/glossary.md are allowed as reference.
- You may not open, grep or list anything under src/ or examples/, nor any file of this library's code. You may
  read node_modules/effect, Effect's own sources and JSDoc, and the compiler's messages, as a user would.
- Write only inside a new directory scratch/<name>/. Modify no other file, commit nothing, and run no git command
  that changes anything.
- Import the library only as a user does: @fgaudo/effect-tea-persistent, its /program, /testing and /cluster.
  Run `bun test scratch/<name>`. Typecheck with `bunx tsc --noEmit -p scratch/<name>`, with a tsconfig.json there
  that extends ../../tsconfig.json.

THE REQUIREMENT: <the requirement, as numbered points a business would write>

WHAT TO WRITE: the program, rehearsals of its main scenarios, and a test on the runtime for each page checked
<say which: consumers of the log, a migration with its cases, a suspension resumed by a fix, a runner of Cluster>.
Make it compile and pass. Where the documentation does not say enough, guess as a user would, then let the
compiler and the tests tell you.

YOUR REPORT, the deliverable: every gap, each with the page and section you were reading, what you needed to know,
what the documentation said or failed to say, what you guessed, and what the compiler or a test told you.
Separate (a) what was wrong in the docs, (b) what was missing, (c) what was unclear and you resolved. Say whether
the program compiles and how many tests pass, list the files you wrote, and list any behaviour of the library that
surprised you, as possible bugs. Say too if you read anything the rules forbid.
```

## What to do with the report

- Check each possible bug against `src/` and the notes before acting on it. A defect of the code is fixed as any
  other, with its test. A choice of the API that the reader found awkward is a question for the maintainer, and
  goes in [`docs/open-questions.md`](../../../docs/open-questions.md), with what would decide it.
- Put each gap of (a) and (b) into the page where the reader looked for it. Check each sentence added against
  `src/` or with the compiler before it is committed, since a reader's guess may have passed by luck.
- Run `bun run typecheck`, `bun test` and `bun run links`. `bun test` runs the reader's tests in `scratch/` too.
- Commit the documents alone, never `scratch/`. Ask the maintainer before deleting `scratch/`.
- Name the requirement in step 2's list of requirements taken, in the same commit.
