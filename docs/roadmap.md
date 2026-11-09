# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## Next

None: the next step is the first of Later, unless the maintainer picks another.

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
  The move of Effect's version to that release weighs the retention against those statements first. The step
  weighs too the rows of a creation on Cluster, one pair for each entity, which `create` keeps for ever since it
  takes no `keep`. Since a default `keep` changes the signature of `send`, the step also decides whether a request
  may leave out a sender that is `null`, and `create` flags that are `null`
  ([open question](open-questions.md#programs)). A sweep that adds a fiber or a yield to the runtime finds the
  pinned seeds of the explored tests again, as [`AGENTS.md`](../AGENTS.md) says.

- **PostgreSQL on a server with a pool.** The storage's tests and the runtime's tests of the log run against a
  server in a container, in the CI on Linux, so that what is only reasoned of many connections is tested:
  the order of a partition's commits under two writers, the advisory lock, a deadlock or a failure of serialization
  in a step, a role whose `search_path` is set by `ALTER ROLE`, and two launches at once that run the migrations of
  `createTables` ([open question](open-questions.md#running)). A library for most backends needs it before its
  release. The same job on Linux fills a database of SQLite in WAL mode on a volume of fixed size, and runs the
  forget and the prune on it, so that what an operator does on a disk that is really full is decided before the
  release too ([open question](open-questions.md#storage-and-reading)).

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
