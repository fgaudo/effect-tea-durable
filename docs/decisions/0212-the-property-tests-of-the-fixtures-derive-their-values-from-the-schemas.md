# 0212. The property tests of the fixtures derive their values from the programs' schemas

**Status:** accepted, 2026-11-09. Decides the open question of values generated from a program's schemas. The
maintainer agreed, on 2026-11-09, that the tests of `src/` use `effect/Arbitrary`, a module marked
`@stability unstable`. [Decision 0254](0254-a-check-of-the-project-runs-against-the-case-it-refuses.md) makes the property read its fixtures from `src/fixtures/`, and `test:postgres` run it on the CI's server.

## Context

The property tests of `src/` wrote their generators by hand with fast-check, for the one program each test declares.
A generator written by hand knows its program's branches and weights them. It cannot give a property over a program
it does not know, and it holds only the values its author thought of. `Arbitrary.schema` of `effect/Arbitrary`
derives a generator from a schema. The spike
[`spikes/effect-arbitrary-generates.test.ts`](../../spikes/effect-arbitrary-generates.test.ts) sees that at 4.1.2 its
strings hold U+0000, lone surrogates and characters past the first plane, and its numbers `NaN`, the infinities and
`-0`. Decisions 0204 to 0210 were found by such values.

## Decision

- **A property over every program of [`src/fixtures/`](../../src/fixtures) derives its values from the program's
  schemas.** [`src/fixtures.property.test.ts`](../../src/fixtures.property.test.ts) derives the flags, the senders
  and the inbound messages of each fixture with `Arbitrary.schema`, and checks that the runtime, on SQLite and on
  PostgreSQL, gives the replies and the projection its rehearsal gives.
- **The property runs on Effect's engine, `Arbitrary.checkEffect`, from seed 0.** Its generators are of that
  engine, and fast-check takes none of them. A run of `bun test` checks 30 scenarios of each fixture, and a run
  with `SCHEDULES=all` 300.
- **A fixture may name, for a sender, a value its flags hold.** Two strings derived from `Schema.String` are almost
  never equal, so a step that compares the sender with the customer its flags name would reject every message. The
  booking and the order give the customer of their flags as the sender half the time. The test counts the sends
  the runtime accepted, and fails when a fixture accepted none, so that a generator that reaches no branch past a
  rejection is seen.
- **No operation of the property ends, and the clock stands still.** Each runner is replaced by one that never
  returns. A runner that ends would answer while callers send, at a time the runtime's fibers choose. So the
  property checks what callers' messages do, and the tests of `src/runtime.test.ts` and `src/rehearse.test.ts` keep
  checking operations and timers.
- **The property tests that declare their own program keep fast-check.** Their generators are weighted for the
  branches of that program.

## What it rests on

- That `Arbitrary.schema` derives values that hold the cases a database holds otherwise: **seen** in the spike named
  above, at 4.1.2.
- That `Arbitrary.checkEffect` is deterministic from a seed and shrinks a failure: **documented**, in its JSDoc in
  `node_modules/effect/src/Arbitrary.ts`. The module is `@stability unstable`, so this holds of 4.1.2 only, and a
  move of Effect's version runs the property again.
- That the values reach the branches past a rejection: **tested**, by the count of accepted sends in each fixture's
  property. At seed 0 and 30 scenarios, the inventory accepted 16 sends, the booking 12 and the order 11.
- That a rehearsal answers as the runtime does for the callers' messages of a fixture: **tested** by the property.
  It found on its first run that a rehearsal's projection kept `-0`
  ([decision 0211](0211-a-rehearsal-gives-the-projection-as-a-caller-reads-it.md)).

## Alternatives

- **fast-check fed with values sampled by `Arbitrary.sampleEffect`.** One engine would run every property. Its
  shrinking would then pick among the samples, and never shrink a value of the schema.
- **A generator of fast-check derived from a schema by hand.** It is the module `effect/Arbitrary` written again,
  without the checks of the schema that the module reads.
- **Every property test on Effect's engine.** The tests that declare their own program would lose the weights of
  their generators, for values their schemas give no more often than any other.

## Consequences

- The open question of values generated from a program's schemas leaves `docs/open-questions.md`.
- A fixture added to `src/fixtures/` is added to the cases of the property.
