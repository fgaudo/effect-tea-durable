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
    runtime's database, written on the client the runtime was launched with, as a consumer's store already may. The
    guide says that every name with `tea_` is the runtime's, and that an application names no table of its own with
    it ([decision 0198](decisions/0198-every-object-the-runtime-makes-is-named-with-tea.md)).

  The guide is written in another register than the design: the example first, the rule after it, and a word of
  the glossary introduced by an example before it is used. Cluster, children, the outbox, schemas that change and
  the operator's calls are pages of the guide by topic, read when needed, and not a second guide for an advanced
  reader. The guide is checked as the bike rental was: a reader who has not seen the code builds a program from the
  documents alone, and what they get wrong is what the guide lacks. The reader is given a requirement no example
  holds, such as a gym membership with counted entries or a loan of books with a due date, may read the README and
  `docs/` but not `src/` nor `examples/`, and writes the program with its rehearsals. Whether the reader is a
  subagent of the session that writes the guide is the maintainer's to say, asked before it starts. The guide
  follows the words and the register of [`README.md`](../README.md), whose sections The problem and How a program is
  made introduce state, `work`, operation, incarnation, projection, topic and outbox by an order. The README links
  [`docs/design.md`](design.md) wherever it would link the guide, and the step replaces each of those links.

  The parts done, and the part next:
  - Done: the guide's running example, [`examples/rental`](../examples/rental), a bike and a ride whose rehearsals
    and runtime tests show each of the five rules, and a ride whose end drops its email, which fails as a defect.
  - Done: the guide's first page, [`guide/README.md`](guide/README.md), from the requirement of the rental to the
    program, with the five rules among nine. The README and `CONTRIBUTING.md` link it, and the README's table lists
    the rental.
  - Done: the check by a reader, a subagent, on 2026-11-08. It wrote a gym membership that compiles and passes its
    rehearsals. Its gaps went into the first page: the keys of the schemas, the form of `update` with its return
    type, `Origin`, an idempotent runner's key, the results of a rehearsal's acts, `runtime.settled`, and that a
    rehearsal's `send` draws a new request id, so that a retry is tested on the runtime.
  - Done: the page on children, [`guide/children.md`](guide/children.md), on [`examples/cart`](../examples/cart).
  - Done: the page on the outbox, [`guide/outbox.md`](guide/outbox.md), on [`examples/order`](../examples/order).
  - Next: the pages by topic left, in `docs/guide/`, each replacing the link to its section of the design at the end
    of the first page: schemas that change, then Effect Cluster and the operator's calls.
  - Then: a second reader, a subagent given a loan of books with a due date, to check the pages by topic.

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
