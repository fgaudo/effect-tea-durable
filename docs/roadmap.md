# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## Next

- **A guide from requirements to a program.** An agent that built a backend from the documentation alone, a rental
  of bikes, learned five rules of modelling only from the examples' code. The design states each rule it rests on,
  but no document says what the rule asks of a program. A guide for whoever writes a program says each one, with
  its example:
  - A reply carries no data, so a value one entity needs of another travels with the request. The receiver refuses
    a value that changed since, as a rate read by the boundary and sent with the request.
  - The id of an entity a caller creates is derived from the caller's request id. An id drawn anew at each try
    creates a second entity on a retry.
  - An operation under way leaves the state only by its completion, so a state that follows it carries it as a
    field, with its key. An email sent at most once that is under way when a ride ends is carried into the end.
  - A projection reads no clock. An action that becomes allowed at a time is a field of the state, which a timer
    changes at that time.
  - A row with no life of its own, such as a customer, is a table of the application. The table may live in the
    runtime's database, written on the client the runtime was launched with, as a consumer's store already may.

  The guide is written in another register than the design: the example first, the rule after it, and a word of
  the glossary introduced by an example before it is used. Cluster, children, the outbox, schemas that change and
  the operator's calls are pages of the guide by topic, read when needed, and not a second guide for an advanced
  reader. The guide is checked as the bike rental was: a reader who has not seen the code builds a program from the
  documents alone, and what they get wrong is what the guide lacks.

- **What the runtime tells a tracer**: the spans and metrics of the machine's events, which the
  [open question](open-questions.md#running) lists what would decide. A span opened in the loop may add a point
  where fibers yield, after which the pinned seeds of the explored tests are found again. The runtime's
  housekeeping, a step of later, finds them again too if it adds a fiber.

## Later

- **The runtime's housekeeping**, once a release of Effect holds the retention of completed requests of Cluster.
  `expire`, `prune` and `forget` are an operator's calls, and a reply sent without `keep` is kept for ever, so the
  replies of a deployment grow without bound by default
  ([decision 0125](decisions/archive/0125-a-callers-reply-is-kept-as-long-as-its-boundary-says.md)). The step
  decides whether the runtime runs `expire` and `prune` at an interval, as an option, or whether `send` has a default
  `keep`, and says it in the design. On Cluster the runtime deletes Cluster's rows by its own statements, since
  Cluster forgets no processed request ([decision 0090](decisions/archive/0090-on-cluster-a-reply-is-deleted-as-on-one-process.md),
  [0169](decisions/archive/0169-on-cluster-an-operations-request-ids-are-kept-under-its-work-and-deleted-with-it.md),
  [0171](decisions/archive/0171-on-cluster-a-callers-rows-go-once-its-client-has-the-answer-and-its-time-is-past.md)).
  The pull request for [Effect-TS/effect#10239](https://github.com/Effect-TS/effect/issues/10239) adds that
  retention, merged and in no release at 4.1.2. The step waits for the release that holds it, since what Cluster
  then forgets by itself decides which rows the runtime still deletes, and so what a sweep of the runtime has to do.
  The move of Effect's version to that release weighs the retention against those statements first.

- **A CI on Linux.** The repository has no workflow. One runs `bun run typecheck`, `bun test` and `bun run links`
  on every push, and `bun run test:release` before a release. It is also where the test of a runner stopped with
  `SIGTERM` runs, which Windows cannot run ([open question](open-questions.md#running)). The tooling is a rule of
  work, so [`AGENTS.md`](../AGENTS.md) states it, and no note is taken. Until then `bun run test:release` runs by
  hand.

- **PostgreSQL on a server with a pool.** The storage's tests and the runtime's tests of the log run against a
  server in a container, in the CI of the step above, so that what is only reasoned of many connections is tested:
  the order of a partition's commits, the advisory lock, a deadlock or a failure of serialization in a step
  ([open question](open-questions.md#running)). A library for most backends needs it before its release.

- **A README for whoever arrives from outside.** The README is a map of the repository: its first paragraph uses
  incarnation, projection, topic and outbox before any definition, its first diagram is the whole semantics, and
  the second is the modules with the storage's tables. The step writes it for a reader who knows TypeScript and
  nothing of the design: the problem before the solution, an order that waits for its payment while the process
  restarts, the "Why" as it is, what the library is not for, a comparison in one line each with Temporal, Restate,
  Akka Persistence and a cron over a table, and the quick start's code. It says that the state is the only truth and
  nothing is replayed, as durable execution replays elsewhere, and in what state the library is:
  experimental, one process on SQLite or PostgreSQL, Cluster on one machine. The documents, the modules and the
  tables move to `CONTRIBUTING.md`, with the diagram of the modules, and the rule of [`AGENTS.md`](../AGENTS.md) on
  the diagrams moves with it. The README of effect-tea is the model of its sections, since the two libraries are
  read by the same readers. It comes after the guide, which it links, as it links the quick start.

- **A site with the guide and the API reference.** [`design.md`](design.md) is a specification, not a reference:
  no document lists what each export takes and gives. The site is built as effect-tea's, with typedoc, and holds
  the guide, the reference and the examples, each with a paragraph on what it shows. The two sites link each other,
  since a program is written the same way in both. A test runs the code of the guide, so that a change of the API
  fails a test before it fails a reader.

- **The release**, once there is code to publish. It is released as experimental while it depends
  on Effect's unstable modules ([decision 0099](decisions/archive/0099-a-library-on-unstable-modules-is-released-as-experimental.md)).
  The release archives the notes the design has come to cover since the last archiving, as
  [`AGENTS.md`](../AGENTS.md) says. It passes `bun run test:release`, which runs every seed of the explored tests.
  The release decides whether `exports` names the sources or JavaScript with declarations, as effect-tea ships, and
  writes the metadata of `package.json`: a `description` in the words of the README, `repository`, `homepage` to the
  site, `sideEffects`, and `keywords` with the words people search this problem by, `saga` and `durable-execution`
  among them, since the README says where the library differs.

- **The runtime on Cluster across machines, on PostgreSQL**, once Cluster has a fence
  ([Effect-TS/effect#10058](https://github.com/Effect-TS/effect/issues/10058)), or the runtime one of its own. Until
  then a step commits only where the commit checks the shard, which on Cluster is SQLite
  ([decision 0084](decisions/archive/0084-a-step-commits-only-where-the-commit-checks-the-shard.md)). A fence of the runtime's
  own waits for tests on a server of PostgreSQL with a pool, which the step on PostgreSQL runs.

- **A model of the runtime's protocol on Cluster**, in TLA+ or a model checker like it, if the tests on Cluster
  keep finding interleavings between runners. The model checks every state the protocol reaches within its bounds:
  the shards a runner holds and lets go, a step's commit that checks the shard, and two versions at once
  (decisions 0084, 0159 and 0162). A model proves the protocol and not the code, so the tests stay.
