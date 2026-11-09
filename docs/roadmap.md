# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## Next

- **A site with the guide and the API reference**, under way. The site is built as effect-tea's, with TypeDoc, and
  holds the guide, the reference and the examples, each with a paragraph on what it shows. The two sites link each
  other, since a program is written the same way in both. A test runs the code of the guide, so that a change of
  the API fails a test before it fails a reader.
  - Done: the test that finds the guide's code in the examples, with the guide and the examples made to pass it
    ([decision 0203](decisions/0203-the-guides-code-is-found-in-the-examples.md)). The build in
    [`site/`](../site/build.ts), which fails on a warning of TypeDoc, a doc comment on every export of the four
    entries, and a `README.md` for each example. [`AGENTS.md`](../AGENTS.md) states the site's rules of work.
  - Next: the site is published, which the maintainer decides. A workflow of GitHub Pages deploys `site/dist/`, as
    effect-tea's `docs.yml` does, once the checks of `ci.yml` pass. The repository is now
    `fgaudo/effect-tea-persistent`, while `site/build.ts` and `site/typedoc.json` still link `effect-tea-durable`. Then effect-tea's site links
    this one, in its `navigationLinks` and its README, and this README's Status no longer says the site is missing.
    The step is taken by the commit that publishes it, which accepts decision 0203.

## Later

- **What the runtime tells a tracer**: the spans and metrics of the machine's events, which the
  [open question](open-questions.md#running) lists what would decide. A span opened in the loop may add a point
  where fibers yield, after which the pinned seeds of the explored tests are found again. The runtime's
  housekeeping, the step after this one, finds them again too if it adds a fiber.

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
  The move of Effect's version to that release weighs the retention against those statements first. The step
  weighs too the rows of a creation on Cluster, one pair for each entity, which `create` keeps for ever since it
  takes no `keep`. Since a default `keep` changes the signature of `send`, the step also decides whether a request
  may leave out a sender that is `null`, and `create` flags that are `null`
  ([open question](open-questions.md#programs)).

- **PostgreSQL on a server with a pool.** The storage's tests and the runtime's tests of the log run against a
  server in a container, in the CI on Linux, so that what is only reasoned of many connections is tested:
  the order of a partition's commits, the advisory lock, a deadlock or a failure of serialization in a step
  ([open question](open-questions.md#running)). A library for most backends needs it before its release.

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
