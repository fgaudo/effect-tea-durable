# 0203. The guide's code is found in the examples, and a test finds it

**Status:** accepted, 2026-11-09, with the step A site with the guide and the API reference of the
[roadmap](../roadmap.md).

## Context

The guide shows code in blocks of TypeScript, and the site will show the guide to readers who never open the
repository. A block copied from an example rots: a change of the API breaks the example, which `bun test` runs, and
leaves the guide's copy as it was. [Decision 0196](0196-the-quick-start-is-an-example-the-readme-shows-whole.md)
keeps the README's quick start equal to its example, file by file. The guide shows parts of files, cut where a part
does not matter to the section, so a comparison of whole files does not apply to it.

When the step began, 31 parts of the guide's blocks were in no file of `examples/`. Some had drifted from the
example, some were cut on a line that the example does not hold, and some were code that no example held at all.

## Decision

- **Each block of TypeScript of the guide is code of an example.** The guide is `docs/guide/*.md` and the README.
  A block is cut into parts at its elisions. Each part is found, line after line, in one file of `examples/`. A
  line's indentation and the blank lines are ignored, since a part is shown at the indentation of the section, not
  of the file.
- **An elision is a line that holds `…`, or a comment that says where the next lines are.** That comment is
  `// in <a place>`, as `// in update:`, or the name of a file, as `// bike.ts`. A line that holds `…` cuts the block
  there, and the line itself is not compared, so `EndRequested: () => …,` shows the shape of a case without its body.
- **Code the guide shows and no example holds is added to an example.** A call the guide shows alone, as a
  `fetch` of the outbox or a `launch` with `renames`, goes into a test of an example, so that `bun test` runs it.
- **A block in another language is not compared.** A block `sh` or `bash` is a command, and a block `mermaid` a
  diagram.
- **The test is `the guide's code is found in the examples, part by part`** in [`src/form.test.ts`](../../src/form.test.ts),
  beside the test of the quick start. It names each part not found, with its file and line in the guide.

## What it rests on

- That the examples run at the version pinned: **tested** by the tests of `examples/`, which `bun test` runs.
- That a part found in a file of `examples/` is run by a test: **reasoned**. A file of an example is imported by its
  tests, and a test file is run by `bun test`. A line of a module that no test reaches, as a branch no scenario takes,
  is found and not run, as it would be in the example itself.
- That the test finds a part that drifted: **tested** by the test named above, seen to fail when a line of
  `examples/rental/ride.ts` that the guide shows changed and the guide did not.

## Alternatives

- **Each block names its file**, in a comment or after the fence, and the part is found in that file alone. A part
  would then be found where the guide says it is. But a reader needs no file name in a section that says which
  program it writes, and the name would be one more line to keep. A part found in another file is still code that
  runs.
- **The guide's blocks are generated from markers in the examples**, as a region between two comments. The guide
  would then be written in two places: its prose in the page, and its code in comments of the example. A writer of
  the guide reads the page, so the code stays in the page, and the test compares.
- **Each block is compiled by the compiler**, as a file of its own. A part cut from a file does not compile alone,
  and the imports it needs would be added to every block, or hidden from the reader.
- **Whitespace compared too.** A part shown inside a section is often taken from inside a function, and shown at
  the left margin. Comparing the indentation would force the guide to show the file's indentation, or the example
  to be written at the guide's.

## Consequences

- A change of the API that reaches the guide's code fails the example's tests first, and then this test until the
  guide shows the change.
- The test runs on the pages of the guide as on the README, so a section the README adds with code is checked too.
- Two tests were added for code the guide showed alone. `a bike renamed by the launch keeps its state under its new
  name`, in `examples/rental/runtime.test.ts`, runs the `launch` with `renames` of the page on schemas. `readers that
  divide the partitions read each row once, and a reader that waits reads the next`, in
  `examples/order/runtime.test.ts`, runs the readers of the page on the outbox.
- Where the guide had left out a comment of the example, it now shows it, and a line the guide wrote of its own
  moved into the example, as the retry's comment in `examples/rental/scenarios.test.ts`.
