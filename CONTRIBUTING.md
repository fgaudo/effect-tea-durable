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

`bun test` runs one seed in twenty of the tests that explore where fibers yield, and fewer cases of the property
tests. It skips the tests of one case that take over two seconds, and runs no spike. `bun run test:slow` runs, under
every seed, the files whose tests wait on a clock that is real, Cluster's and the server example's.
`bun run test:spikes` runs the spikes. `bun run test:parallel` runs the
same tests in eight processes at once, in less than half the time, for a quicker run while a change is under way. A
commit passes `bun test`. `bun run test:release` runs every
seed, and a step of the roadmap that changes the runtime passes it. `bun run test:explore` runs the explored tests
from random seeds until one fails. [`AGENTS.md`](AGENTS.md) says when each one is run.

`bun test` runs PostgreSQL on PGlite, which runs one statement at a time on one session. `bun run test:postgres`
runs the storage's tests and the runtime's on a server of PostgreSQL instead, with the tests of
[`src/postgres.test.ts`](src/postgres.test.ts) that only a server with many connections runs. Its role makes and
drops a database for each test, and is a superuser. The CI runs it on Linux, and so can a container:

```sh
docker run --rm -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:17
POSTGRES_URL=postgres://postgres:postgres@localhost:5432/postgres bun run test:postgres
```

The spike [`spikes/full-volume.test.ts`](spikes/full-volume.test.ts) fills a volume of fixed size, which
`FULL_VOLUME` names, and is skipped without it or with it empty. The CI mounts one of 32 MB on Linux.

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
- [`docs/bugs.md`](docs/bugs.md): the bugs the premise review found, numbered, with the rule of each family.
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
[`src/runtime.ts`](src/runtime.ts) and the modules it is divided into, in [`src/runtime/`](src/runtime), and stores in
[`src/storage.ts`](src/storage.ts). It unloads an entity that has nothing to do, and wakes it from its stored timers.
[`src/check.ts`](src/check.ts) steps the activation of every stored entity with the machine, before a deploy,
and writes nothing.
[`src/runtime/loop.test.ts`](src/runtime/loop.test.ts) tests it by dying at each point of the design's crash table,
and comparing where it ends with the machine. The tests of a module of `src/runtime/` lie beside it, and
[`src/runtime.test.ts`](src/runtime.test.ts) tests `src/runtime.ts` and what several modules keep together. What
they share is in [`src/runtime.test_shared.ts`](src/runtime.test_shared.ts). A file that only tests import is
named `<module>.test_<role>.ts`, beside the module whose tests it serves, and no module of the library imports one. A folder of `src/` beside a module of its name is a group, which a module
outside the group imports through that module alone. Each module is built on the one above it:

```mermaid
flowchart TB
  program["program.ts: program(schemas)(…), with init, update, work,<br/>operations, project, indexes and migrations;<br/>part, child and each, which compose children"]
  machine["machine.ts: the pure machine, from an event<br/>to the next machine and the rows it writes"]
  rehearse["rehearse.ts: a scenario without storage or clock,<br/>of one entity or of a world"]
  testing["testing.ts: the checks of a program's migrations and projections,<br/>and the scheduler that moves where the fibers of a test yield"]
  subgraph runtime["the runtime"]
    launch["runtime.ts: launch and deploy, a deployment's handle,<br/>settled and the planned stop"]
    callers["runtime/callers.ts: create, send, resume and discard,<br/>and the Entities an operation sends with"]
    loop["runtime/loop.ts: an entity's loop, under its own lock:<br/>its steps, fibers, timers, passivation and crash"]
    doors["runtime/doors.ts: on Cluster, the step of a door, settled by the count of steps,<br/>and a singleton per shard that activates and crashes its entities"]
    waker["runtime/waker.ts: the waker of the stored timers"]
    readings["runtime/readings.ts: the readings of the log that wait for a commit"]
    process["runtime/process.ts: what the runtime of one process holds,<br/>which its modules share"]
  end
  check["check.ts: the check of a program against the stored entities,<br/>before its deploy, stepped by the machine, which writes nothing"]
  cluster["cluster.ts: on Effect Cluster, the Sharding of a runner,<br/>built once its versions are recorded, its RunnerHealth,<br/>the door of each program, which steps at the newest version,<br/>the client every request is sent through,<br/>and launch, the runtime of a runner"]
  subgraph storage["the storage"]
    store["storage.ts: the storage of one program, made of its parts"]
    tables["storage/tables.ts: the dialects, the transaction, the hold of a database,<br/>the partitions, the migrations that make every table, each named<br/>with effecttea_, with migrations and log, and the rename of a program"]
    entities["storage/entities.ts: entities, entity_keys, mailbox, replies,<br/>answers and waiting, and the write of a step"]
    projections["storage/projections.ts: projections, their indexes,<br/>and the queries, counts and sums"]
    log["storage/log.ts: publications, outbox, heads, consumers and cursors"]
    versions["storage/cluster.ts: on Cluster, versions, runner_versions,<br/>sent_requests and given_requests, and the senders<br/>a resumption tells, read from waiting"]
    held["storage/held.ts: what the storage of one program holds,<br/>which its modules share"]
    rows["storage/rows.ts: the rows as the runtime writes them,<br/>and the codecs of their JSON"]
  end
  db[(SQLite or PostgreSQL)]
  entries["the package's four entries: index.ts, the main one;<br/>index.program.ts, what declares a program; index.testing.ts,<br/>rehearse and the checks; index.cluster.ts, the runtime on Cluster"]

  program --> machine
  machine --> rehearse
  program --> testing
  machine --> runtime
  machine --> check
  check --> runtime
  check --> storage
  program --> cluster
  runtime --> storage
  cluster --> runtime
  cluster --> storage
  storage --> db
  rehearse --> entries
  testing --> entries
  cluster --> entries
  runtime --> entries
  check --> entries
```

## The examples

Each example in [`examples/`](examples) imports the library by the package's name, as a user does, and runs on the
sources with no build. Its `README.md` says in a paragraph what it shows, and lists its files. The library's own tests run on copies of the examples' programs in
[`src/fixtures/`](src/fixtures), so that a change of an example breaks no test of the library.
