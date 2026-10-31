# 0053. What a handle is given is checked

**Status:** accepted, 2026-10-31.

## Context

A handle takes numbers its caller chooses: the cursor of `ack`, the cursor of `published`, and the limit of
`query`, `published` and `feed`. None of them was checked. `ack` stored a cursor at `2.5`, and a consumer's first
ack stored one at `-5`, which every later ack moves past, and which `consumers` showed as where it had read to. A
negative limit read everything, since SQLite reads a negative `LIMIT` as none, and a fractional one failed in
SQLite, as a defect of the runtime's own.

A message or flags that their schema does not encode are already their caller's defect, and reach no entity
([decision 0040](0040-what-is-stored-encodes-to-json-as-it-is.md),
[decision 0049](0049-flags-are-checked-by-their-schema.md)).

## Decision

- **A cursor and a limit a handle is given are non-negative integers**, and safe ones: `ack`'s `through`,
  `published`'s `after`, and the `limit` of `query`, `published` and `feed`. A limit left out is still no limit.
- **Anything else is the caller's defect**: the call dies with an `InvariantDefect` that names the value, before
  anything is read or stored, as a message that does not encode does.

## Alternatives

- **Rounding, or reading a negative limit as none.** A caller that computes a limit wrongly would read
  everything, or a cursor it never acked, and never be told.
- **A typed error in the handle's signature.** Every caller of `feed` and `ack` would handle an error that a
  correct one never meets; it is a bug of the caller's, which a defect is for, as for a message that does not
  encode.

## Consequences

- A stored cursor is always a `seq`, or `0`, and `consumers` shows nothing a consumer never acked.
- [`src/runtime.test.ts`](../../src/runtime.test.ts) checks each value refused, and that nothing is stored for it.
