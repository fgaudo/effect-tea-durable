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
  `keep`, and says it in the design. It weighs a prune in batches too, which might free room on a disk that is really
  full, where one prune of many rows needs room an operator frees first
  ([decision 0223](decisions/0223-a-disk-that-is-really-full.md)). On Cluster the runtime deletes Cluster's rows by its own statements, since
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

- **A check of a program against the stored entities, before it is deployed.** A new program that dies on a stored
  state suspends each such entity at its activation, and an operator learns it from `suspended` once the deploy has
  happened ([decision 0064](decisions/archive/0064-the-program-is-not-the-machines-state.md)). The step gives an
  operator a call that reads every stored entity of a name through the new program's migrations, as `inspect` reads
  one, and runs its schema, `work`, `project` and the indexes on each state, activating nothing and writing nothing.
  It gives the entities the new program would suspend, with the cause of each. The step decides whether the call
  pages its entities as `reindex` does, and whether it checks the stored work against the new `work` too, since an
  operation under way keeps what it started with
  ([decision 0022](decisions/archive/0022-a-new-program-keeps-what-work-started-with.md)).

- **The release**, once there is code to publish. It is released as experimental while it depends
  on Effect's unstable modules ([decision 0099](decisions/archive/0099-a-library-on-unstable-modules-is-released-as-experimental.md)).
  The release archives the notes the design has come to cover since the last archiving, as
  [`AGENTS.md`](../AGENTS.md) says. It passes `bun run test:release`, which runs every seed of the explored tests.
  The release decides whether `exports` names the sources or JavaScript with declarations, as effect-tea ships, and
  writes the metadata of `package.json`: a `description` in the words of the README, `repository`, `homepage` to the
  site, `sideEffects`, and `keywords` with the words people search this problem by, `saga` and `durable-execution`
  among them, since the README says where the library differs. What it publishes leaves out the files of the tests,
  `*.test.ts` and `*.test_*.ts` ([decision 0241](decisions/0241-a-group-of-modules-lies-in-a-folder-entered-by-the-module-of-its-name.md)).

- **The runtime on Cluster across machines, on PostgreSQL**, once Cluster has a fence
  ([Effect-TS/effect#10058](https://github.com/Effect-TS/effect/issues/10058)), or the runtime one of its own. Until
  then a step commits only where the commit checks the shard, which on Cluster is SQLite
  ([decision 0084](decisions/archive/0084-a-step-commits-only-where-the-commit-checks-the-shard.md)). A fence of the runtime's
  own is tested on the server of PostgreSQL with a pool that the CI runs
  ([decision 0222](decisions/0222-postgresql-with-many-connections.md)). The step also decides whether the runtime
  checks its advisory lock, which a server that ends its session gives back
  ([open question](open-questions.md#running)).

- **A model of the runtime's protocol on Cluster**, in TLA+ or a model checker like it, if the tests on Cluster
  keep finding interleavings between runners. The model checks every state the protocol reaches within its bounds:
  the shards a runner holds and lets go, a step's commit that checks the shard, and two versions at once
  (decisions 0084, 0159 and 0162). A model proves the protocol and not the code, so the tests stay.
