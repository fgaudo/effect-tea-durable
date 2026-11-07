# 0126. A program keeps every migration, and a test records what each did

**Status:** accepted, 2026-11-04. Decides the open question on migrations that never leave. It adds to
[decision 0036](0036-a-migration-is-a-function-on-the-json.md) a check of its rule that a migration once
deployed is never changed.

## Context

A program's version is how many migrations it carries, plus one
([decision 0036](0036-a-migration-is-a-function-on-the-json.md)). A migration can never be dropped, since
dropping the first renumbers every version after it. A row is migrated only when it is written again. So a program
carries every migration it ever had.

[Decision 0125](0125-a-callers-reply-is-kept-as-long-as-its-boundary-says.md) lets a caller's reply be kept for a time
only, and left the question to be read again. Dropping the migrations before a version would still need three
things:

- every row of the program written again at a later version. Today only `reindex` rewrites rows, and only those of
  the read model. The state of an entity that takes no step, a message waiting in the mailbox of a suspended entity,
  and a caller's reply sent with no `keep` are rows no step rewrites;
- a version that starts past 1, which the program then declares. A program that forgets to raise it reads its own
  rows as newer, and fails loudly ([decision 0043](0043-a-row-no-version-reads-fails-what-reads-it.md)). A
  declared version is the bump that decision 0036 took out, so that none is forgotten;
- a check, before the deploy that drops them, that no row of an older version is left.

A migration costs little to keep: a pure function on JSON for each kind it changes. What 0036 left unchecked is its
rule that a migration once deployed is never changed. A function cannot be compared with the one deployed before
it, so nothing sees a migration rewritten. A rewritten migration reads the rows of its version as other values, in
silence.

## Decision

- **A program keeps every migration it ever had.** The library offers no way to drop one, and no version that starts
  past 1.
- **A test records cases of each migration.** A case of a migration, `MigrationCase`, is a JSON value a version wrote
  of one kind (`written`), and the JSON value the next version reads of it (`read`). A case is recorded when its
  migration is written, and is never changed after, as the migration is not.
- **`migrationViolations(program, cases)` checks a program against its cases.** It is in the testing module, and
  returns every violation, as `projectionViolations` does:
  - `Changed`: the migration now reads `written` as other than `read`, compared by `Equal.equals`;
  - `Failed`: the migration, the migrations after it, or the program's schema of the kind die on `written`, so a row
    of that version cannot be read at the program's version;
  - `Unrecorded`: a migration changes a kind, and no case records what it does;
  - `Unknown`: a case from a version the program has no migration from.

## What it rests on

- That the check finds a changed migration, a row the program's version cannot read, a migration with no case and a
  case of no migration: **tested**, by `migrationViolations (decision 0126)` in
  [`src/testing.test.ts`](../../../src/testing.test.ts).
- That `Equal.equals` compares two JSON values by their content, arrays by their items and objects by their keys,
  whatever the order of the keys: **documented**, in the JSDoc of `Equal.equals` in `node_modules/effect/src/Equal.ts`.
- That a migration is a pure function, so a case it read once it reads the same again: **only reasoned**. Decision
  0036 asks it of a migration, and nothing checks it. A migration that reads the clock or a random number passes its
  cases on one run and fails them on another.
- That a migration whose cases all hold reads every row of its version as it did when deployed: **only reasoned**.
  The cases are examples, and a change that keeps them all may read other rows otherwise. A test that records more
  cases, or generated ones, narrows that.
- That carrying every migration costs too little to be worth a procedure to drop them: **only reasoned**. No program
  with hundreds of versions has been seen.

## Alternatives

- **Dropping the migrations before a version**, with a declared start version and every row rewritten first. It
  brings back the bump decision 0036 took out, and needs a rewrite of every row, which no step and no handle does
  today. The cost it removes is a pure function per kind.
- **A digest of each migration's source**, stored with the rows it wrote. A function's text changes with a rename or
  a reformat that changes nothing it reads, and stays the same where a helper it calls changes.
- **Cases taken by the runtime from the rows it migrates in production.** The rows hold callers' data, which the
  tests of a repository must not keep. And a migration changed before its first deploy would have no case yet.
- **No check**, leaving the rule to review. It loses data in silence where a test is cheap.

## Consequences

- The testing module gains `MigrationCase`, `MigrationViolation` and `migrationViolations`.
- A program that adds a migration adds, in the same commit, a case for each kind the migration changes.
- The question on migrations that never leave leaves the open questions. A program whose migrations have grown too
  many to read reopens it, in a new note that says what was measured.
