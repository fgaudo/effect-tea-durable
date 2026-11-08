# 0186. A rehearsal names the work by its key, and `underWay` gives it or null

**Status:** accepted, 2026-11-08, with the step The API before the release of the [roadmap](../roadmap.md). Adds to
[decision 0131](archive/0131-a-rehearsal-runs-the-entities-an-operation-sends-to.md) a `run` that takes a key.

## Context

A scenario answers an operation as `answer(yield* pending('charge'), message)`. The example scenarios wrote it
sixty-one times, with `fire` and a member's `run`. The pending is read only to be passed on. A test keeps a pending
where it asserts it: its idempotency key, its work, or a firing dropped after its incarnation moved on.

A test that asserts that a key holds no work has no reading for it. `pending` fails the test where there is none,
so the test would wrap it in `Effect.exit` and read the exit.

## Decision

- **`answer`, `fire` and a member's `run` take a key, with its parameter for a key that takes one.** So a scenario
  writes `answer('charge', message)` and `answer('Line.reserve', 'mug', message)`. Each act takes the work under way
  under the key in its current incarnation, as `pending` gives it, and fails the test when there is none, as
  `pending` does. `run('hold', { crash: true })` crashes as `run(pending, { crash: true })` does.
- **Each act still takes a pending.** A pending held across a step keeps its incarnation, so a test that answers or
  fires it after the incarnation moved on sees it dropped. A key always names the current incarnation, so it cannot
  rehearse that.
- **The program's schema of the key tells the parameter from what follows it.** A key with a parameter is followed
  by the parameter, and then by the message or the options. A key without one is followed by the message or the
  options alone. The types say the same, so a parameter left out or given to a key without one does not compile.
- **`underWay(key)` gives the work under way under the key, as `pending` gives it, or null when there is none.** A
  test asserts that a key holds no work as `expect(yield* rehearsal.underWay('charge')).toBeNull()`.

## What it rests on

- That an act by a key does what the act by the pending does, the key's parameter included: **tested** by `answers
  the work under a key and its parameter, and gives null under a key that holds none`, `fires a timer by its key,
  and refuses to answer it` and `runs an operation of a world by its key, with a crash and without`, in
  [`src/rehearse.test.ts`](../../src/rehearse.test.ts). The examples' scenarios run every act by a key, and
  [`src/composition.test.ts`](../../src/composition.test.ts) fires a child's key whose parameter is a tuple.
- That a parameter left out, or given to a key without one, does not compile: **tested** by the `@ts-expect-error`
  lines of the same tests, which `bun run typecheck` checks.
- That `program.keys` holds null for a key without a parameter, and its schema otherwise: **documented** by the
  comment of `Keys` in [`src/program.ts`](../../src/program.ts), which `Machine.keyOf` reads the same way.

## Alternatives

Each structure of Effect that could give the reading of no work was weighed.

- **`Option` from `underWay`.** The library gives null for what is not there, as `read` and `inspect` do
  ([decision 0185](0185-inspect-gives-what-is-stored-of-one-entity.md)), and a test asserts null with no import.
- **`Effect.exit` around `pending`.** It works, since `Effect.exit` holds a defect too. A test then reads an `Exit`,
  and cannot tell no work from a key the program does not declare, which also fails.
- **`Effect.option` around `pending`.** It turns a failure into `None`, and `pending` dies rather than fails, so the
  defect passes through it.
- **A key alone, without the pending form.** A test of a late answer or a dropped firing needs the incarnation the
  pending holds.
- **The parameter told by the count of the arguments.** `run('hold', options)` and `run('charge', 'a')` both have two,
  so the count cannot tell them apart, and the schema can.

## Consequences

- `Acts` gains `underWay`, and the overloads of `answer`, `fire` and `run` that take a key.
- The examples and the library's tests answer, fire and run by the key wherever they do not keep the pending.
