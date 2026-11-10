# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## Next

- **Modules and test files a reviewer reads whole.** `src/storage.ts` holds 2 669 lines, and `src/runtime.test.ts`
  6 495, with `src/machine.test.ts`, `src/storage.test.ts` and `src/program.ts` each past 1 800. A change of one rule
  is reviewed in a file that holds every other. The step divides `storage.ts` by what it stores, as the runtime is
  divided into `loop.ts`, `callers.ts` and the rest, and divides the tests of the runtime by the module each tests.
  It moves no rule and changes no behaviour, so `bun run test:release` passes before and after. It changes the
  diagram of the modules in [`CONTRIBUTING.md`](../CONTRIBUTING.md) and the list of the runtime's modules in
  [`AGENTS.md`](../AGENTS.md) in the same commit. A test that moves to another file keeps its name, so that its
  pinned seeds still name it.

  The parts are three, in order. The first decided the folders, in
  [decision 0241](decisions/0241-a-group-of-modules-lies-in-a-folder-entered-by-the-module-of-its-name.md): the
  runtime's modules other than `runtime.ts` move into `src/runtime/`, the modules divided out of `storage.ts` lie in
  `src/storage/`, and the two entries stay where they are. The second moved the runtime's modules, divided
  `storage.ts` into seven modules of `src/storage/`, added the test of the boundary of a group, and made the checks
  of the form read every folder of `src/`. The note says where each part of the storage lies. The third, next,
  divides `src/runtime.test.ts` by the module each test tests, into test files beside the modules of
  `src/runtime/`, and makes `bun run test:explore` and `bun run test:postgres` run the files the tests move to. It
  begins in [`src/runtime.test.ts`](../src/runtime.test.ts), with the helpers its tests share, and in
  [`scripts/explore.ts`](../scripts/explore.ts), which names that file alone. `bun run test:release` passed on
  `main` before the step, and passes again once the third part is done.

## Later

- **A faster run of the checks.** `bun test` takes about four minutes on the maintainer's machine, running one seed
  in twenty of the explored tests, and the CI runs the suite in one job. The step divides the files of the tests
  among jobs that run at once, and keeps `bun test` on one machine as it is. It also weighs what dominates the time,
  the explored tests or the tests on SQLite files, before it divides anything. A division keeps every test in some
  job, and a test of the workflow's form checks it.

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
  among them, since the README says where the library differs.

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
