# Roadmap

The steps from this design to a library, in order. Each one may change the ones after it. When a step is done,
it leaves this file, and what it decided goes into the design, a decision or an example.

## Next

1. **The cost of a page** ([open question](open-questions.md#storage-and-reading)). A page late in a query's order
   reads every row of its program before its cursor
   ([decision 0144](decisions/0144-a-page-reads-the-rows-before-its-cursor.md)). A page is then read as a few
   statements, each searched as a range of the index: the rows that tie with the cursor past its id, then the rows
   past its value, then the rows that hold no value where they come last. Each takes what the statements before it
   left of the limit, and the page is read in one transaction, so that a step between two statements moves no row
   into the page twice. The index the storage creates holds the id after the value, so that the rows that tie are
   searched past the id. A descending order then reverses the ids too, since an index read backwards gives them
   descending. The step is taken by a note of its own.
2. **Two versions at once** ([open question](open-questions.md#running)). It waits for Effect Cluster: Cluster's
   runners carry no version, and a shard may go back to an older one.

## Later

- **Effect Cluster.** The runtime runs on it as [`docs/cluster.md`](cluster.md) and decisions 0081 to 0092 decide,
  with sharding and rolling deploys. It runs across machines once Cluster has a fence, or the runtime one of its own
  ([decision 0084](decisions/0084-a-step-commits-only-where-the-commit-checks-the-shard.md)). Before it is done, the
  two interleavings [decision 0104](decisions/archive/0104-the-runtimes-tests-choose-where-fibers-yield.md) reached are read
  again, since the runtime on Cluster may change them:
  - a sender that registers for its receiver's resumption only after it is answered `Suspended`
    ([decision 0063](decisions/archive/0063-the-runtime-waits-for-what-it-waits-for.md)), which a resumption told by a
    message changes ([decision 0092](decisions/0092-on-cluster-the-runtime-keeps-its-entities-and-learns-its-shards.md));
  - an entity's lock dropped while others wait for it ([decision 0067](decisions/archive/0067-each-entity-is-held-by-its-own-lock.md)).

  Whether a partition of the log is Cluster's shard is decided with this step: the head of a partition keeps the
  order without it, and a test with two writers checks that the steps of a partition commit in the order of their
  `seq` ([decision 0137](decisions/0137-the-log-is-ordered-within-a-partition.md)).

  A consumer's wait ends at the commit of a row in its topic, which the runner that commits tells, and only at its
  time where another runner commits ([decision 0142](decisions/0142-a-consumer-waits-for-a-row-of-its-topic.md)).
  Whether runners tell each other of their commits is decided with this step.

  A caller's reply past its time ([decision 0125](decisions/0125-a-callers-reply-is-kept-as-long-as-its-boundary-says.md))
  is deleted on Cluster with Cluster's rows of its request, as an entity's reply is
  ([decision 0090](decisions/0090-on-cluster-a-reply-is-deleted-as-on-one-process.md)).
- **The library's name and release**, once there is code to publish. It is released as experimental while it depends
  on Effect's unstable modules ([decision 0099](decisions/archive/0099-a-library-on-unstable-modules-is-released-as-experimental.md)).
  The release archives the notes the design has come to cover since the last archiving, as
  [`AGENTS.md`](../AGENTS.md) says. It passes `bun run test:release`, which runs every seed of the explored tests.
