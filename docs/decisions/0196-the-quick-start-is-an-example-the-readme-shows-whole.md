# 0196. The quick start is an example that the README shows whole, and a test keeps the two equal

**Status:** accepted, 2026-11-08, with the step A quick start of the [roadmap](../roadmap.md).

## Context

The README's first program was [`examples/order/order.ts`](../../examples/order/order.ts), 312 lines. A reader who
wants to know what a program looks like had to read an order with four operations, two topics and three indexes. The
roadmap asked for a program that fits on a screen, its rehearsal and its `launch`, in some forty lines.

Code copied into a README rots: a change of the API breaks the examples, which `bun test` runs, and leaves the
README's copy as it was.

## Decision

- **The quick start is a seat held for a quarter of an hour.** A held seat is confirmed by a caller, or released
  by a timer when its time runs out. It shows a state, an inbound message, a reply `reject`, a timer derived from the
  state, and a projection. It shows no operation, since an operation needs a service and its runner, and the order
  shows one. The program is [`examples/quick-start/hold.ts`](../../examples/quick-start/hold.ts), 28 lines with its
  imports and comments.
- **Its rehearsal and its launch are the two tests of
  [`examples/quick-start/hold.test.ts`](../../examples/quick-start/hold.test.ts).** The rehearsal fires the timer and
  finds the seat released. The launch runs on SQLite in memory, confirms the seat, and gets the same reply for a retry
  under the same request id. A test is the launch a reader can run with `bun test`, and needs no server.
- **The README shows both files whole, in its section Quick start.** The test
  `the README's quick start is the code of examples/quick-start, each file whole` in
  [`src/form.test.ts`](../../src/form.test.ts) fails when a block of that section differs from its file. So a change
  of the API fails the example's tests first, and then this test until the README shows the change.

## What it rests on

- That the program, its rehearsal and its launch run at the version pinned: **tested** by the two tests of
  `examples/quick-start/hold.test.ts`.
- That an internal message arrives only while its key is in the work, so `update` releases the seat on `Expired`
  without reading the state: **documented** in [`docs/design.md`](../design.md), under Messages: the runtime delivers an
  internal message only while its key is in `work(state)`.
- That the README's blocks are compared with their files: **tested** by the test of `src/form.test.ts` named above,
  seen to fail when a line of `hold.ts` changed and the README did not.

## Alternatives

- **One file with the program, the rehearsal and the launch**, as effect-tea's quick start is one file. It saves the
  imports of a second file. But a module that declares a program imports from `@fgaudo/effect-tea-persistent/program`,
  the entry a browser can load ([decision 0193](0193-the-public-surface-is-four-entries.md)), and a module that also
  launches imports the main entry. The two files show where each import belongs.
- **An order cut down to a charge and a deadline.** It would show an operation and its idempotency key, the bug the
  README's Why names first. It needs a service, its layer and a runner, some twenty lines more, and the quick start
  would no longer fit on a screen.
- **A `main.ts` that launches on a file, run with `bun`.** A reader runs a script once, and the test runs at every
  `bun test`. A script that no test runs rots as the README's copy would.
- **A check in `scripts/check-links.ts`** in place of a test. `bun run links` checks links. The form of the examples
  is checked in `src/form.test.ts`, and the quick start's form is checked beside it.
- **`sender` left out of a request where the program has no sender.** The launch writes `sender: null` in each
  request, as [decision 0180](0180-a-program-leaves-out-what-it-does-not-have.md) left `flags` required. It changes
  the signature of every caller, and the [open question](../open-questions.md#programs) says what would decide it.
- **Effect's `FileSystem` to read the README in the test.** It needs a layer of the platform for a test that reads
  two files once. The other tests of `src/form.test.ts` read the sources with `node:fs`, and this one reads them as
  they do.

## Consequences

- The README has a section Quick start before Why, and lists `examples/quick-start` among the examples.
- A change of the API that reaches the quick start changes its files and the README in the same commit.
