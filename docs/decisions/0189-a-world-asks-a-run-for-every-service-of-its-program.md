# 0189. A world asks a run for every service of its program, and a test mocks the ones it does not run

**Status:** proposed, 2026-11-08, for the step The API before the release of the [roadmap](../roadmap.md).

## Context

`run` of a member of a world asks for every service of the program's runners but `Entities`, the type `Outside<T>`
of [`src/rehearse.ts`](../../src/rehearse.ts). A test that runs only the runners that send to other entities, and
answers the rest, still provides the services of the rest. A test written by an agent for a rental of bikes
provided them as stubs that die, one written by hand for each member of each service.

## Decision

- **A run asks for every service of its program's runners but `Entities`.** A program's types hold the services of
  its runners as one union, `T['services']`, and a key may hold any of the program's operations. So no type of a
  run tells which runner the run reaches, and a run that asked for fewer services would let a runner run without
  the ones it needs.
- **A test provides a service it does not run with `Layer.mock(Service, {})`.** Each member of the mock that the
  test does not write dies when it is used. So a runner the test meant to answer, and ran instead, fails the test
  with the name of the service and of its member.
- **The world gives no mock of its own.** A world knows a program's services only as a type, and a mock is built
  from the service's key, which only the test holds.

## What it rests on

- That a run asks for the services of its program, and that a scenario given a mock of them runs: **tested** by
  `asks a run for every service of its program, and takes a mock of the ones it does not run` in
  [`src/rehearse.test.ts`](../../src/rehearse.test.ts), whose `@ts-expect-error` fails to compile where a run asks
  for fewer.
- That a member of a mock that a runner calls fails the test, with the service and the member named: **tested** by
  `fails a run that calls a member a mock does not give` in the same file.
- That `Layer.mock` gives a service whose members left out die when used, as an `Effect` or a function returning
  one: **documented** in its JSDoc in `node_modules/effect/src/Layer.ts` at 4.1.2, `@stability stable`. A member
  that is no `Effect` and no function returning one, such as a configuration, is written by the test, as the
  type of `Layer.mock` asks.

## Alternatives

Each structure of Effect that gives a service to a test was weighed, and so was a run typed by its runner.

- **The services of each runner in the program's types, by the operation's tag.** `Types` would carry one more
  field, and every composition would lift its children's into it. A run takes a key or a pending, and both name
  the work under way as the union of the program's operations. So a run would still ask for every service, unless
  the test named the tag of the operation it runs as well as the key.
- **`Layer.succeed(Service, Service.of({ … }))` with members that die.** It is what the rental's test wrote: one
  stub for each member, and a message for each written by hand. `Layer.mock` gives the same with none written.
- **A run that dies at its start when a service its runner needs is missing.** The types of Effect keep a runner
  from running without its services, and a run typed with fewer would give that up to a check when the test runs.
- **`Context.Reference`, a service with a default.** A service of the application is declared by the application,
  and a default would run in production as well as in the test.

## Consequences

- The design says, under Rehearsing a world, that a run asks for every service of its program, and how a test
  provides the ones it does not run.
- [`src/rehearse.ts`](../../src/rehearse.ts) keeps `Outside<T>`, whose comment cites this note.
