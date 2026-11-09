# 0205. A defect's cause is written as text every database holds

**Status:** accepted, 2026-11-09, with the step A defect's cause is stored whatever it holds of the
[roadmap](../roadmap.md). Changes [decision 0028](archive/0028-rules-the-runtime-settled.md), whose suspension
stores the cause rendered as text.

## Context

On PostgreSQL a defect whose cause held U+0000 crashed its entity where the design suspends it. `render` of
[`src/machine.ts`](../../src/machine.ts) gave the cause as text, and `write` of
[`src/storage.ts`](../../src/storage.ts) put that text in the column `suspended_cause` as it was. A cause holds the
program's data wherever `defect` or an error of a schema cites it. PostgreSQL holds U+0000 in no text, so the write
of the suspension failed. The caller was given the storage's error, and the entity was never suspended. An
operation of another entity that sent to it sent again after every `retry`, with no end. On SQLite a lone surrogate
in the cause is given back as U+FFFD for each of its bytes
([decision 0157](archive/0157-the-storage-speaks-sqlite-and-postgresql.md)).

## Decision

- **`render` gives text every database holds.** It writes each U+0000 and each lone surrogate of the cause as the
  escape JSON gives it, `\u` and four hexadecimal digits in lower case: `\u0000`, `\ud800`. A pair of surrogates is
  one character, and is kept as it is.
- **The rule is the machine's, not the storage's.** The machine gives what is written
  ([decision 0057](archive/0057-the-machine-gives-what-is-written.md)), and a storage writes it as it is. Every
  place that shows a cause renders it: a suspension, `StillSuspended` of `resume` and `discard`, and the failures of
  `reindex`. So an operator reads the same cause from what is stored and from what a call answered.

## What it rests on

- That PostgreSQL holds U+0000 in no text: **tested** by the storage's tests of
  [decision 0157](archive/0157-the-storage-speaks-sqlite-and-postgresql.md).
- That every cause a suspension stores passes through `render`: **read in the code** of
  [`src/machine.ts`](../../src/machine.ts), in `writes`. The test
  `the cause a suspension writes is text a database holds, with each character none holds escaped` in
  [`src/machine.test.ts`](../../src/machine.test.ts), and
  `a defect whose cause holds U+0000 suspends the entity, and lists it` in
  [`src/runtime.test.ts`](../../src/runtime.test.ts), on both dialects, **test** it, and each fails against the code
  before the change.
- That a regular expression with the flag `u` reads a pair of surrogates as one code point, so that `\p{Cs}` finds a
  lone surrogate only: **documented** by ECMAScript, and tested by the test of the machine, whose cause holds a pair.

## Alternatives

- **U+FFFD stands for each character no database holds.** It is what PostgreSQL writes for a lone surrogate. It
  loses which character it was, and an operator who reads the cause to find the data the program died on is told
  less.
- **The storage escapes the cause where it writes it.** The cause read back would differ from the cause a call
  answered, and a storage of another kind would have to know the rule again.
- **The column holds the cause as JSON.** JSON escapes the same characters, and quotes the whole text. Every reader
  of `suspended_cause` would parse it, for the same escapes.

## Consequences

- A cause that holds the six characters `\u0000` as they are reads the same as one that held U+0000. The cause is
  for an operator to read, and no code compares it.
