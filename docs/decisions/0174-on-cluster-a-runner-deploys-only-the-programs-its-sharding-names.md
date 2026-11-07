# 0174. On Cluster, a runner deploys only the programs its sharding names

**Status:** proposed, 2026-11-07, for the step Effect Cluster of the roadmap. Decides what
[decision 0159](0159-on-cluster-an-older-version-serves-no-shard-once-a-newer-one-launches.md) left to the deploy on
Cluster: whether a deploy of a program that the runner's `sharding` does not name dies.

## Context

A runner of the runtime on Cluster names its programs where its `Sharding` is built, by `sharding(programs)` of
[`src/cluster.ts`](../../src/cluster.ts). `sharding` records the version of each program under the runner's address,
before Cluster registers the runner (decision 0159). The programs are deployed later, one at a time, by the runtime's
`deploy`. Nothing tied the two lists together.

Both checks of decision 0159 read what `sharding` recorded. The health of a runner reads the versions recorded under
its address, so a program the runner deploys without naming it is not weighed. The check by the commit reads the
newest version recorded of the program, so a program no runner names has none, and every step of it commits. A
runner of an older version that deploys a program without naming it would then step the rows a newer version wrote,
and fail them ([decision 0043](archive/0043-a-row-no-version-reads-fails-what-reads-it.md)). A runner that names a
program at one version and deploys it at another is recorded at a version it does not run.

## Decision

- **On a runner of Cluster, a deploy of a program dies unless the runner's `sharding` named that program at the
  version the deploy runs.** The defect names the program, the version deployed, and the version named, or says that
  the runner does not name the program. It dies before the deploy stores anything, as a deploy of a renamed program
  does ([decision 0156](0156-a-program-is-renamed-by-its-launch-and-keeps-its-keys.md)).
- **`sharding` gives the versions it recorded as a service of its own, `Recorded`, beside `Sharding`.** `launch`
  requires it, and it has no default. So a runner whose `Sharding` was built without `sharding` does not compile
  against `launch`, and cannot deploy a program that no record covers.
- **A process with no `runnerAddress` deploys any program.** It is a client of the cluster alone, and `sharding`
  records nothing for it. Its doors register no entity, so it steps nothing, and its requests reach the runners
  that hold the shards.

## What it rests on

- That a program deployed without its record escapes both checks of decision 0159: **only reasoned**, from
  `outranked` of [`src/storage.ts`](../../src/storage.ts), which reads the versions recorded under the runner's
  address alone, and from `atNewest` of [`src/cluster.ts`](../../src/cluster.ts), which lets a step commit where no
  newest version is recorded. The rule does not need it to hold: a deploy that dies loses nothing.
- That a deploy outside the record dies: **tested** by `a deploy of a program the runner's sharding does not name, or
  names at another version, dies` in [`src/cluster.test.ts`](../../src/cluster.test.ts), which fails without the
  check in `deploy`.
- That a service of `Context.Service` must be provided by the surrounding context, so that `launch` does not
  compile without `Recorded`: **documented** by the JSDoc of `Context.Service` at 4.1.2, `@stability stable`.
- That a process with no `runnerAddress` registers no entity: **read in the source** of `Sharding.ts` at 4.1.2,
  whose `registerEntity` returns at once without a runner's address. The JSDoc does not say so.

## Alternatives

- **The structures of Effect.** Each module of the pinned version that could carry the programs a runner names to
  its deploys was weighed.
  - `Context.Service` is used, merged beside `Sharding` by `Layer.merge`. It needs no statement at a deploy, and its
    type keeps `launch` from a `Sharding` built otherwise.
  - `Context.Reference` would give the service a default. A default lets a `Sharding` built without `sharding`
    launch, and every program it deploys escape the checks.
  - `ShardingConfig` has no field for the programs of a runner, and is Cluster's.
  - `Sharding.getRegistrationEvents` tells the entity types a runner registers, as it registers them, and no
    version.
- **The versions read from `runner_versions` at each deploy.** It costs a statement per deploy, and a `Sharding`
  built without `sharding` would still compile against `launch`, and die only at its first deploy.
- **A deploy that records its program.** `Sharding` registers the runner as it is built, before any deploy, so a
  record made at the deploy comes after the runner already holds shards (decision 0159).
- **A warning, and the deploy goes on.** The program then escapes both checks, which loses rows in silence where an
  older runner steps them.

## Consequences

- [`src/cluster.ts`](../../src/cluster.ts) gives `Recorded`, which `sharding` provides and `onCluster` reads.
  `OnCluster` of [`src/runtime.ts`](../../src/runtime.ts) carries the versions, and `deploy` checks them.
- A launcher on Cluster names every program its runner deploys, at the version deployed, in one list given to
  `sharding`.
