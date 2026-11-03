# 0054. A program is checked where it enters

**Status:** accepted, 2026-10-31. `resume` with a fixed program, one of the places a program entered, is gone with
[decision 0064](0064-the-program-is-not-the-machines-state.md): a fix is a deploy, which the check holds for.

## Context

Nothing checked a program at run time. A program with an empty name, two keys of the same name, or an index whose
name is not a word was taken by `rehearse`, and by `deploy` until the storage wrote the index into SQL, where the
name met a check of the storage's own. An operation with no runner, which a cast lets through, was started by
the machine, and the runtime met it as a `TypeError` that suspended the entity; a rehearsal of it noticed nothing,
since the test answers the operation itself.

`Program` is a plain object, as in effect-tea: a new version is a spread of the one before. A brand that said
"checked" would be copied by the spread with the rest, and say nothing of the new version. And a program is never
mutated ([decision 0052](0052-what-crosses-the-library-is-never-mutated.md)), so what holds of it where it enters
holds while it runs.

## Decision

- **A pure check refuses a program that cannot run as written**: one whose name is empty, which declares a key
  twice, or one of whose indexes is not a word — a letter, then letters, digits and underscores. It throws an
  `InvariantDefect` that names the program and what is wrong.
- **It is called where a program enters**, before anything is stored or run: `deploy`, `resume` with a fixed
  program, `rehearse`, and a rehearsal's `deploy`. It remembers nothing: it costs a pass over a few names, and a
  program it passed is never changed.
- **An index's name is a rule of the program**, not of the storage: a rehearsal refuses what a deploy refuses, and
  the storage relies on the check, as it relies on the machine for what it writes.
- **The machine admits no operation its program has no runner for**, as it admits no undeclared key
  ([decision 0037](0037-the-machine-checks-the-declared-keys.md)): it is checked where an operation is held —
  `init`, a step, an activation by a new program — not on the schema, which need not list its tags. A state that
  holds one is a defect, and suspends the entity before anything starts. A timer needs no runner.

## Alternatives

- **A branded program, checked once by `program(…)`.** A spread copies the brand, and a version built by hand,
  as the tests build them, would never carry it.
- **Checking the runners in the check of the program.** An operation's schema need not be a tagged union whose
  tags can be listed, and a tag a state never holds needs no runner: the machine sees the ones that matter.
- **Leaving the index's name to the storage.** A rehearsal would pass a program that no deploy takes.

## Consequences

- An entity of a program with a missing runner is suspended on the step or the activation that holds the
  operation, with a reason an operator reads, where it used to be suspended by a `TypeError` of the runtime.
- [`src/machine.test.ts`](../../../src/machine.test.ts) checks the missing runner at a creation, a step and an
  activation; [`src/rehearse.test.ts`](../../../src/rehearse.test.ts) and
  [`src/runtime.test.ts`](../../../src/runtime.test.ts) check that a program refused runs nothing and stores nothing.
