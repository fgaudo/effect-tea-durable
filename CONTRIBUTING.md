# Contributing

This repository holds a design, its pure core, and a runtime on SQLite or PostgreSQL. The rules of work, for a person
and for a coding agent alike, are in [`AGENTS.md`](AGENTS.md). This file says where each thing is, and how the
repository is checked.

## Checking a change

```sh
bun install
bun run typecheck
bun test
bun run links
```

`bun test` runs one seed in twenty of the tests that explore where fibers yield. `bun run test:release` runs every
seed, and a step of the roadmap that changes the runtime passes it. `bun run test:explore` runs the explored tests
from random seeds until one fails. [`AGENTS.md`](AGENTS.md) says when each one is run.

The site, with the guide, the examples and the API reference, is built into `site/dist/` by a package of its own:

```sh
cd site
bun install
bun run build
```

## The documents

- [`docs/guide/README.md`](docs/guide/README.md): the guide for whoever writes a program, on the rental of bikes.
- [`docs/concepts.md`](docs/concepts.md): the pieces of a program, what each call answers, and the life of an
  entity, on one page, with a link to the rule of each in the design.
- [`docs/design.md`](docs/design.md): what the library is for, its model of execution, and what it guarantees at
  each point where the process may die. Its last section, How the runtime keeps it, is for whoever changes the
  runtime.
- [`docs/glossary.md`](docs/glossary.md): the words of the design, each defined once.
- [`docs/decisions/`](docs/decisions): one note per decision, with the alternatives it rejected, listed by what
  they decide in [its index](docs/decisions/README.md). The reviews of the notes are in
  [`docs/decisions/reviews.md`](docs/decisions/reviews.md).
- [`docs/open-questions.md`](docs/open-questions.md): what is not decided yet, and what would decide it.
- [`docs/roadmap.md`](docs/roadmap.md): the steps from this design to a library, in order.
- [`docs/cluster.md`](docs/cluster.md): a study of Effect Cluster as the runtime meets it, with what each move of
  Effect's version changed in it.
- [`spikes/`](spikes): tests of what a dependency does when it runs, at the version pinned.
- [`scripts/`](scripts): the link checker, the exploration of seeds, the mutations a review runs, and the tools of a
  move of Effect's version.
- [`site/`](site): the build of the site. The README is its home page, the guide, the concepts, the design and the
  glossary are its pages, each example is a page of its README and its files, and the reference is made of the doc comments of
  the four entries of `src/`.

## The modules of `src/`

[`src/program.ts`](src/program.ts) is the one place a program is declared, with its types and the migrations of
its schemas. [`src/machine.ts`](src/machine.ts) is the runtime's semantics as a pure state machine, which `rehearse`
runs and property tests check. The runtime interprets the machine over Effect's `SqlClient`, in
[`src/runtime.ts`](src/runtime.ts) and the modules it is divided into, and stores in [`src/storage.ts`](src/storage.ts).
It unloads an entity that has nothing to do, and wakes it from its stored timers.
[`src/runtime.test.ts`](src/runtime.test.ts) tests it by dying at each point of the design's crash table, and
comparing where it ends with the machine. Each module is built on the one above it:

```mermaid
flowchart TB
  program["program.ts: program(schemas)(…), with init, update, work,<br/>operations, project, indexes and migrations;<br/>part, child and each, which compose children"]
  machine["machine.ts: the pure machine, from an event<br/>to the next machine and the rows it writes"]
  rehearse["rehearse.ts: a scenario without storage or clock,<br/>of one entity or of a world"]
  testing["testing.ts: the checks of a program's migrations and projections,<br/>and the scheduler that moves where the fibers of a test yield"]
  subgraph runtime["the runtime"]
    launch["runtime.ts: launch and deploy, a deployment's handle,<br/>settled and the planned stop"]
    callers["callers.ts: create, send, resume and discard,<br/>and the Entities an operation sends with"]
    loop["loop.ts: an entity's loop, under its own lock:<br/>its steps, fibers, timers, passivation and crash"]
    doors["doors.ts: on Cluster, the step of a door, settled by the count of steps,<br/>and a singleton per shard that activates and crashes its entities"]
    waker["waker.ts: the waker of the stored timers"]
    readings["readings.ts: the readings of the log that wait for a commit"]
    process["process.ts: what the runtime of one process holds,<br/>which its modules share"]
  end
  cluster["cluster.ts: on Effect Cluster, the Sharding of a runner,<br/>built once its versions are recorded, its RunnerHealth,<br/>the door of each program, which steps at the newest version,<br/>the client every request is sent through,<br/>and launch, the runtime of a runner"]
  storage["storage.ts: the tables, each named with effecttea_: entities, entity_keys,<br/>mailbox, replies, projections, publications, outbox, log, heads,<br/>consumers, cursors and migrations; on Cluster, versions, runner_versions,<br/>waiting, sent_requests and given_requests"]
  db[(SQLite or PostgreSQL)]
  entries["the package's four entries: index.ts, the main one;<br/>index.program.ts, what declares a program; index.testing.ts,<br/>rehearse and the checks; index.cluster.ts, the runtime on Cluster"]

  program --> machine
  machine --> rehearse
  program --> testing
  machine --> runtime
  program --> cluster
  runtime --> storage
  cluster --> runtime
  cluster --> storage
  storage --> db
  rehearse --> entries
  testing --> entries
  cluster --> entries
  runtime --> entries
```

## The examples

Each example in [`examples/`](examples) imports the library by the package's name, as a user does, and runs on the
sources with no build. Its `README.md` says in a paragraph what it shows, and lists its files. The library's own tests run on copies of the examples' programs in
[`src/fixtures/`](src/fixtures), so that a change of an example breaks no test of the library.
