# 0214. A rejection's reason is given as a caller reads it, from its JSON

**Status:** accepted, 2026-11-09. Holds of a rejection's reason what
[decision 0210](0210-a-sparse-array-is-no-json-and-negative-zero-is-read-as-zero.md) decides of `-0`, as
[decision 0211](0211-a-rehearsal-gives-the-projection-as-a-caller-reads-it.md) holds it of a rehearsal's projection.

## Context

A caller's first send is answered by the step, and a retry under the same request id by the reply its storage holds
([decision 0065](archive/0065-the-machine-holds-no-replies.md)). The storage decodes a stored reason from its JSON,
where `-0` is written `0`. The step gave the reason `update` returned, and only checked that it encoded. So a
rejection whose reason held `-0` was given `-0` by the first reply and `0` by a retry. A rehearsal keeps its replies
in memory, and gave `-0` to both. On Cluster the door's client sends the answer as text, and gave `0` to both.

## Decision

- **The machine gives a rejection's reason encoded by the rejection's schema, written as JSON, read back and
  decoded.** It does so for `update`'s rejection and for `init`'s. A first reply and a retry then give the same
  reason, `-0` as `0`, on one process, on Cluster and in a rehearsal.
- **A reason its schema refuses stays a defect**, as before, and so is one its schema does not decode back.

## What it rests on

- That the machine gives `0` where `update` or `init` rejects with `-0`: **tested**, by
  `a reason is given as a caller reads it from its JSON, -0 as 0 (decision 0214)` in
  [`src/machine.test.ts`](../../src/machine.test.ts), which fails without the change.
- That a first reply and a retry of the runtime both give `0`: **tested**, by
  `a reason holding -0 is given 0 by the first reply and by a retry alike (decision 0214)` in
  [`src/runtime.test.ts`](../../src/runtime.test.ts), on SQLite and on PostgreSQL, which fails without the change.
- That a rehearsal gives the reason of the machine's reply: **read** in [`src/rehearse.ts`](../../src/rehearse.ts),
  whose `send` returns the reply of the step's output and stores it as it is.
- That `JSON.stringify` writes `-0` as `0`: **documented**, by ECMAScript's `SerializeJSONProperty`, as decision 0210
  says.

## Alternatives

- **A reply is given as the step computed it, and a retry as its storage holds it.** It leaves a caller two replies
  for one request, which only `Object.is` tells apart.
- **The storage keeps `-0`.** JSON has no `-0`, and decision 0210 reads it back as `0` everywhere else.

## Consequences

- The design says, under what a step stores, that a reason is given as a caller reads it.
- The reason is encoded and decoded once more per rejection, which a step already encoded to check it.
