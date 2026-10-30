# 0001. A library of its own, separate from effect-tea

**Status:** accepted, 2026-10-30.

## Context

effect-tea and this library share the shape of a program and the rules of its Guide. A shared core package
would hold what both run.

## Decision

The two are separate libraries. They share the Guide's ideas, and no code.

## Alternatives

- **A core shared by both.** The server's constraints would leak into it: a schema for every message and
  every state, an idempotency key for every piece of work, incarnations, request ids. A program on a phone
  would pay for all of them, and gain nothing.
- **A server mode of effect-tea.** effect-tea's API would bend to a use it was not designed for.

## Consequences

The pieces that end up identical (perhaps the type of a step, `reject`, a few testing helpers) are copied. A
shared package is extracted only if, once both exist, the copies turn out to be the same code, not similar
code.
