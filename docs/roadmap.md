# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## Next

- **The runtime's housekeeping**, under way. What it decides is in
  [decision 0245](decisions/0245-a-reply-is-kept-as-long-as-send-says-and-the-runtime-sweeps.md), `proposed`, which the
  maintainer chose on 2026-11-10. Its parts, in order:
  1. `send` requires `keep`, `{ millis }` or `'forever'`, `create` takes its flags in the request, and a request
     leaves out a sender and flags that are `null`, in
     `src/runtime.ts`, `src/rehearse.ts`, the examples, the fixtures, the guide and the tests.
  2. `prune` and `expire` delete in batches, in `src/storage/log.ts` and `src/storage/entities.ts`. Each batch is a
     transaction of its own, so the count each gives is a sum, and the doc comments of `Handle.prune` and
     `Handle.expire` say so. The part checks that the replies and `given_requests` have an index by program and time,
     which a sweep's `expire` reads by.
  3. On Cluster, a creation's client keeps its id in `given_requests`, in `src/runtime/callers.ts`, so that `expire`
     deletes its rows, with a test on Cluster that a retry after is answered `Created`.
  4. The sweep, an option of `launch` and a singleton of Cluster per program, with its tests; the shared launcher of
     the tests passes `sweep: 'none'`. It adds a fiber, so the pinned seeds of the explored tests are found again.
  5. `spikes/full-volume.test.ts` checks a prune in batches on a full volume, in the CI's job; `design.md` and
     `glossary.md` say what holds; `bun run test:release` passes; the note is taken.

  Parts 1 and 2 are done: `bun test`, `bun run typecheck`, `bun run links` and the site's build pass. Part 2 added
  the index `effecttea_given_requests_expire`, by program and time. Part 3 is next, from where the client of a
  creation reads its answer in `src/runtime/callers.ts`.

## Later

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
