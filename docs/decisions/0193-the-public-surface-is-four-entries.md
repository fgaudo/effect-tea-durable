# 0193. The public surface is four entries: the main one, a program's module, a test's and a launcher's on Cluster

**Status:** accepted, 2026-11-08. Changes [decision 0055](archive/0055-the-public-surface-is-what-its-users-use.md),
whose surface is one entry, and [decision 0192](0192-the-digest-of-a-key-is-computed-by-the-machine.md), whose
`digestOf` is exported by `src/index.ts`.

## Context

[`src/index.ts`](../../src/index.ts) was the one entry of the library. It exported a program's API, the runtime,
the rehearsal, the checks of a test and the launcher on Effect Cluster together. A process on one machine that
imported it reached `effect/cluster` through `src/cluster.ts`, and a server reached the checks of a test. A
browser that imported a program's module, for its schemas, reached `node:crypto` through the runtime and the
machine, although [decision 0192](0192-the-digest-of-a-key-is-computed-by-the-machine.md) keeps `src/program.ts`
free of it.

A reading of the surface against the public signatures found four more defects.

- `Recorded` stood in the type of `sharding`'s layer and in what `launchOnCluster` requires, and was not exported.
  A launcher could not name the type of its own layer.
- `Returned`, the type of what `durable` gives under a key, stood in `Program`, and was not exported.
- `isTimer` was exported, and only the library's tests and the runtime called it.
- [`examples/booking/runtime.test.ts`](../../examples/booking/runtime.test.ts) imported `Probe`, `freezing` and
  `frozen` from the library's modules. An example is what a user copies, and those three are no part of the surface
  ([decisions 0052](archive/0052-what-crosses-the-library-is-never-mutated.md),
  [0073](archive/0073-what-the-runtime-did-is-told-to-a-probe.md)).

## Decision

- **The surface is four entries.** The package's `exports` names each of them.
  - `.` is [`src/index.ts`](../../src/index.ts): what a program, its boundary and an operator use on one process.
    It gives all that `./program` gives, and the runtime and the storage's types besides.
  - `./program` is [`src/index.program.ts`](../../src/index.program.ts): what `src/program.ts` gives a program's
    module, and nothing that runs a program. A module that declares a program imports from it, so that a browser
    imports that module for its schemas. An import of types alone is erased, and needs no entry.
  - `./testing` is [`src/index.testing.ts`](../../src/index.testing.ts): `rehearse`, `accepted` and `rejected`, the
    types of a rehearsal, `projectionViolations`, `migrationViolations` with their types, and `digestOf`. A test
    checks with `digestOf` the key a service received, so `digestOf` moves here.
  - `./cluster` is [`src/index.cluster.ts`](../../src/index.cluster.ts): `sharding`, and `launch`, the runtime of a
    runner. `launchOnCluster` is that `launch`, under the name of `src/cluster.ts`.
- **An entry is a file beside `src/index.ts`, named by its subpath.** `src/testing.ts` and `src/cluster.ts` are
  modules of the library, and hold more than their entries give, so an entry is a file of its own.
- **`Recorded` is exported as a type alone, by `./cluster`.** A launcher names it in the type of its layer. It has
  no value to build a `Recorded` with, so a `Sharding` built without `sharding` still does not launch
  ([decision 0174](archive/0174-on-cluster-a-runner-deploys-only-the-programs-its-sharding-names.md)).
- **`Returned` is exported by `.`, and `isTimer` is not.** `versionOf` stays, since an operator reads which version
  a program writes, as decision 0055 says.
- **The tests of the booking that need a probe, the rows of a table or values frozen through are the library's.**
  They are in [`src/runtime.test.ts`](../../src/runtime.test.ts), on the booking and the inventory of `src/fixtures/`, copied from the example. The example's
  `runtime.test.ts` keeps the tests a user writes, on the surface alone.
- **`src/index.ts` gives `./program` by `export *`.** A symbol of a program is listed once, in
  `src/index.program.ts`, so the two entries cannot give different symbols of it.

## What it rests on

- That no entry gives `Probe`, `Point` or `Said`: **tested** by `a probe and its points are no part of what a user
  imports` in [`src/runtime.test.ts`](../../src/runtime.test.ts), over the four entries.
- That `./cluster` gives no value of `Recorded`, and the type is named: **tested** by `a launcher names \`Recorded\`
  as a type, and builds none` in [`src/runtime.test.ts`](../../src/runtime.test.ts). A launcher that named
  `Recorded` as a value would fail to compile, since `export { type Recorded }` exports the type alone:
  **documented** by TypeScript's handbook of `verbatimModuleSyntax`, which the repository's `tsconfig.json` sets.
- That `src/index.ts` reaches, through `src/`, no module of Effect's Cluster and none of the modules set apart for
  the other entries: **tested** by `src/index.ts reaches neither Cluster nor the modules of a test, through src` in
  [`src/form.test.ts`](../../src/form.test.ts). Before the change the test found `cluster.ts`, `rehearse.ts` and
  `testing.ts`.
- That `src/index.program.ts` reaches no module of Node or of Bun, through `src/` and Effect: **tested** by
  `src/index.program.ts reaches no module of Node or of Bun, through src and Effect` in
  [`src/form.test.ts`](../../src/form.test.ts). The test fails on an entry that gives `launch` of `src/runtime.ts`.
- That a bundler reads the subpaths of `exports` for an import of `<package>/testing`: **documented** by Node's
  documentation of package entry points, which Bun and the bundlers follow. The release decides whether the
  entries name the sources or built files.

## Alternatives

Each structure of Effect was weighed.

- **Effect's own layout, a directory per subpath.** Effect 4.1.2 names `./testing` and `./cluster` in its
  `exports`, each a `dist/<name>/index.js` built from `src/<name>/index.ts`. Here `src/testing.ts` and
  `src/cluster.ts` are modules already, so `src/testing/index.ts` would stand beside `src/testing.ts`, and a reader
  would take one for the other.
- **One entry, with a namespace for a test's helpers.** A server would still import the checks of a test, and a
  process on one machine would still reach Cluster.
- **Exporting `Recorded` as a value.** A launcher could provide it without `sharding`, and launch a runtime whose
  versions no `Sharding` recorded.
- **No entry for the browser until a user imports a program in one.** A launcher with the schemas in a module of
  their own needs none. A module that declares a program beside its schemas, as the examples do, would reach
  `node:crypto` through `.`, and the entry costs a file.
- **Leaving the booking's tests in the example, with the three imports.** A user would copy imports the release
  does not give.
